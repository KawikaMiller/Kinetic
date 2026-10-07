/**
 * A simulated kernel for the sockets lesson: TCP sockets with their RFC 9293 states, each
 * process's FD table, a listening socket's accept queue, ephemeral ports, TIME_WAIT and the
 * Linux bind() rules. Nothing here touches a real network. Scenes are built by calling the
 * same "syscalls" a program would make, so every state change comes from the transition
 * table and every FD from the lowest-free rule (as in file-descriptors).
 *
 * Addresses come from the documentation ranges (RFC 5737). Backlog, TIME_WAIT length and the
 * shrunken port range are illustrative; real systems' values vary.
 */
import { freshInt, mulberry32, type Rnd } from '../../core/random';

// ── TCP states (RFC 9293 §3.3.2, Figure 5) ──────────────────────────────

export const TCP_STATES = [
  'CLOSED', 'LISTEN', 'SYN_SENT', 'SYN_RCVD', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT', 'CLOSE_WAIT', 'LAST_ACK',
] as const;
export type TcpState = (typeof TCP_STATES)[number];

/** The events this lesson models: active/passive open and active/passive close. */
export type TcpEvent = 'passive-open' | 'active-open' | 'rcv-syn' | 'rcv-syn-ack' | 'rcv-ack' | 'close' | 'rcv-fin' | 'timeout';
/** Segment flags as RFC 9293's figure names them (a real FIN also carries ACK). */
export type Flags = 'SYN' | 'SYN,ACK' | 'ACK' | 'FIN';

export interface Transition {
  from: TcpState;
  event: TcpEvent;
  to: TcpState;
  /** The segment this transition sends, if any. */
  send: Flags | null;
}

/**
 * The modelled subset of RFC 9293 Figure 5. Left out on purpose (and said so on screen):
 * simultaneous open (SYN_SENT → SYN_RCVD), simultaneous close (CLOSING), and closing a
 * socket before it is connected.
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: 'CLOSED', event: 'passive-open', to: 'LISTEN', send: null },
  { from: 'CLOSED', event: 'active-open', to: 'SYN_SENT', send: 'SYN' },
  { from: 'LISTEN', event: 'rcv-syn', to: 'SYN_RCVD', send: 'SYN,ACK' },
  { from: 'SYN_SENT', event: 'rcv-syn-ack', to: 'ESTABLISHED', send: 'ACK' },
  { from: 'SYN_RCVD', event: 'rcv-ack', to: 'ESTABLISHED', send: null },
  { from: 'ESTABLISHED', event: 'close', to: 'FIN_WAIT_1', send: 'FIN' },
  { from: 'ESTABLISHED', event: 'rcv-fin', to: 'CLOSE_WAIT', send: 'ACK' },
  { from: 'FIN_WAIT_1', event: 'rcv-ack', to: 'FIN_WAIT_2', send: null },
  { from: 'FIN_WAIT_2', event: 'rcv-fin', to: 'TIME_WAIT', send: 'ACK' },
  { from: 'CLOSE_WAIT', event: 'close', to: 'LAST_ACK', send: 'FIN' },
  { from: 'LAST_ACK', event: 'rcv-ack', to: 'CLOSED', send: null },
  { from: 'TIME_WAIT', event: 'timeout', to: 'CLOSED', send: null },
];

/** The transition for `event` in `state`, or null when the model has none. */
export const transition = (state: TcpState, event: TcpEvent): Transition | null =>
  TRANSITIONS.find((t) => t.from === state && t.event === event) ?? null;

/** What receiving a segment means to the state machine. */
export const RECEIVE_EVENT: Record<Flags, TcpEvent> = { SYN: 'rcv-syn', 'SYN,ACK': 'rcv-syn-ack', ACK: 'rcv-ack', FIN: 'rcv-fin' };

// ── Addresses and illustrative constants ────────────────────────────────

export type HostId = 'server' | 'alice' | 'bob';
export const HOSTS: Record<HostId, { ip: string; label: string }> = {
  server: { ip: '203.0.113.10', label: 'server' },
  alice: { ip: '198.51.100.7', label: 'client A' },
  bob: { ip: '198.51.100.23', label: 'client B' },
};
export const SERVER_PORT = 8080;
export const BACKLOG = 4;
/** IANA's dynamic range (RFC 6335), which Windows and macOS use by default. */
export const IANA_EPHEMERAL = { lo: 49152, hi: 65535 } as const;
/** Linux's default net.ipv4.ip_local_port_range. */
export const LINUX_EPHEMERAL = { lo: 32768, hi: 60999 } as const;
/** How long a socket sits in TIME_WAIT here: Linux's fixed 60 s. RFC 9293 says 2 × MSL, with MSL = 2 minutes. */
export const TIME_WAIT_S = 60;
/** Ports below this need privilege to bind (Linux: CAP_NET_BIND_SERVICE, unless ip_unprivileged_port_start is lowered). */
export const PRIVILEGED_BELOW = 1024;
/** 0, 1 and 2 are stdin, stdout and stderr, so a process's first socket is fd 3. */
export const FIRST_FREE_FD = 3;
/** Seed for the ephemeral port picks, so scenes (and screenshots) are reproducible. */
export const PORT_SEED = 9293;

export const rangeSize = (r: { lo: number; hi: number }) => r.hi - r.lo + 1;

export interface Endpoint {
  ip: string;
  port: number;
}
export const epText = (e: Endpoint) => `${e.ip}:${e.port}`;

export interface Sock {
  id: number;
  host: HostId;
  /** The FD that names it in its process, or null: not accepted yet, or closed while the kernel finishes the connection. */
  fd: number | null;
  state: TcpState;
  local: Endpoint | null;
  remote: Endpoint | null;
  listener: boolean;
  /** For a listener: completed connections waiting for accept(), oldest first. */
  queue: number[];
  backlog: number;
}

/** A 4-tuple, written the way `ss` prints a connection. */
export const tupleText = (s: Pick<Sock, 'local' | 'remote'>) => `${s.local ? epText(s.local) : '*'} ↔ ${s.remote ? epText(s.remote) : '*'}`;

export interface Change {
  sock: number;
  host: HostId;
  from: TcpState;
  to: TcpState;
  event: TcpEvent;
}

export interface Segment {
  from: HostId;
  to: HostId;
  flags: Flags;
  /** Dropped by the receiving kernel (a full accept queue). */
  dropped?: boolean;
}

// ── bind() ──────────────────────────────────────────────────────────────

export type BindErrno = 'EACCES' | 'EADDRINUSE';
export type BindResult = { ok: true } | { ok: false; errno: BindErrno };

/**
 * Linux's rules for binding a TCP port, as modelled: a port below 1024 needs privilege; a
 * port another socket is LISTENing on is always taken; leftover connections on the port
 * (TIME_WAIT, or still open from an old process) block it unless the server sets
 * SO_REUSEADDR (it then did so on its earlier run too, which Linux also requires).
 */
export function bindCheck(port: number, opts: { privileged: boolean; reuseAddr: boolean; onPort: readonly TcpState[] }): BindResult {
  if (port < PRIVILEGED_BELOW && !opts.privileged) return { ok: false, errno: 'EACCES' };
  if (opts.onPort.includes('LISTEN')) return { ok: false, errno: 'EADDRINUSE' };
  if (opts.onPort.length > 0 && !opts.reuseAddr) return { ok: false, errno: 'EADDRINUSE' };
  return { ok: true };
}

export const ERRNO_TEXT: Record<BindErrno | 'EADDRNOTAVAIL', string> = {
  EACCES: 'Permission denied',
  EADDRINUSE: 'Address already in use',
  EADDRNOTAVAIL: 'Cannot assign requested address',
};

// ── The simulated kernel ────────────────────────────────────────────────

/**
 * Every host's sockets in one place. Methods are the syscalls (socket, bind, listen, accept,
 * connect, close) and the kernel's side (deliver a segment, expire TIME_WAIT); each returns
 * what changed so a scene can narrate it.
 */
export class Kernel {
  socks: Sock[] = [];
  private nextId = 1;
  private rnd: Rnd;
  readonly ephemeral: { lo: number; hi: number };

  constructor(opts: { seed?: number; ephemeral?: { lo: number; hi: number } } = {}) {
    this.rnd = mulberry32(opts.seed ?? PORT_SEED);
    this.ephemeral = opts.ephemeral ?? IANA_EPHEMERAL;
  }

  sock(id: number): Sock {
    const s = this.socks.find((x) => x.id === id);
    if (!s) throw new Error(`no socket ${id}`);
    return s;
  }

  byFd(host: HostId, fd: number): Sock {
    const s = this.socks.find((x) => x.host === host && x.fd === fd);
    if (!s) throw new Error(`${host} has no fd ${fd}`);
    return s;
  }

  /** The lowest FD number the host isn't using. */
  lowestFd(host: HostId): number {
    let fd = FIRST_FREE_FD;
    while (this.socks.some((s) => s.host === host && s.fd === fd)) fd++;
    return fd;
  }

  /** Sockets still known to the kernel (CLOSED ones without an FD are gone). */
  live(host?: HostId): Sock[] {
    return this.socks.filter((s) => (host ? s.host === host : true) && (s.state !== 'CLOSED' || s.fd !== null));
  }

  private apply(s: Sock, event: TcpEvent): { change: Change; send: Flags | null } {
    const t = transition(s.state, event);
    if (!t) throw new Error(`no transition from ${s.state} on ${event}`);
    const change: Change = { sock: s.id, host: s.host, from: s.state, to: t.to, event };
    s.state = t.to;
    return { change, send: t.send };
  }

  socket(host: HostId): number {
    const fd = this.lowestFd(host);
    this.socks.push({ id: this.nextId++, host, fd, state: 'CLOSED', local: null, remote: null, listener: false, queue: [], backlog: 0 });
    return fd;
  }

  bind(host: HostId, fd: number, port: number, opts: { privileged?: boolean; reuseAddr?: boolean } = {}): BindResult {
    const ip = HOSTS[host].ip;
    const onPort = this.live(host).filter((s) => s.fd !== fd && s.local?.port === port).map((s) => s.state);
    const result = bindCheck(port, { privileged: opts.privileged ?? false, reuseAddr: opts.reuseAddr ?? false, onPort });
    if (result.ok) this.byFd(host, fd).local = { ip, port };
    return result;
  }

  listen(host: HostId, fd: number, backlog: number): Change {
    const s = this.byFd(host, fd);
    s.listener = true;
    s.backlog = backlog;
    return this.apply(s, 'passive-open').change;
  }

  /** Ports this host can't hand out to reach `remote` (any socket of its own already using them). */
  private portsInUse(host: HostId): Set<number> {
    return new Set(this.live(host).flatMap((s) => (s.local ? [s.local.port] : [])));
  }

  /**
   * connect(): the kernel picks a free ephemeral port, binds the socket to it and sends SYN.
   * Null when every port in the range is taken (connect fails with EADDRNOTAVAIL).
   */
  connect(host: HostId, fd: number, remote: Endpoint): { change: Change; port: number; segment: Segment } | null {
    const port = freshInt(this.ephemeral.lo, this.ephemeral.hi, this.portsInUse(host), this.rnd);
    if (port === null) return null;
    const s = this.byFd(host, fd);
    s.local = { ip: HOSTS[host].ip, port };
    s.remote = remote;
    const { change, send } = this.apply(s, 'active-open');
    return { change, port, segment: { from: host, to: hostOf(remote.ip), flags: send! } };
  }

  /** The listening socket on host:port, if any. */
  listenerOn(host: HostId, port: number): Sock | undefined {
    return this.socks.find((s) => s.host === host && s.listener && s.local?.port === port && s.state === 'LISTEN');
  }

  /** The connection socket on `host` for this 4-tuple. */
  connection(host: HostId, local: Endpoint, remote: Endpoint): Sock | undefined {
    return this.socks.find(
      (s) => s.host === host && !s.listener && s.state !== 'CLOSED' && s.local?.port === local.port && s.remote?.ip === remote.ip && s.remote.port === remote.port,
    );
  }

  /**
   * A segment arrives at `to` from the socket `fromSock`. A SYN for a listener makes a new
   * connection socket (SYN_RCVD) unless the accept queue is full, in which case the SYN is
   * dropped, as Linux does by default. Returns the change and the reply segment, if any.
   */
  deliver(fromSock: Sock, flags: Flags): { change: Change | null; reply: Segment | null; dropped: boolean; sock: Sock | null } {
    const remote = fromSock.local!;
    const local = fromSock.remote!;
    const to = hostOf(local.ip);
    const existing = this.connection(to, local, remote);
    if (!existing && flags === 'SYN') {
      const listener = this.listenerOn(to, local.port);
      if (!listener) throw new Error('nothing listening (the lesson never sends there)');
      if (listener.queue.length >= listener.backlog) return { change: null, reply: null, dropped: true, sock: null };
      const child: Sock = { id: this.nextId++, host: to, fd: null, state: 'LISTEN', local: { ...local }, remote: { ...remote }, listener: false, queue: [], backlog: 0 };
      this.socks.push(child);
      const { change, send } = this.apply(child, RECEIVE_EVENT[flags]);
      return { change, reply: send && { from: to, to: fromSock.host, flags: send }, dropped: false, sock: child };
    }
    if (!existing) throw new Error(`no connection for ${flags}`);
    const { change, send } = this.apply(existing, RECEIVE_EVENT[flags]);
    if (change.from === 'SYN_RCVD' && change.to === 'ESTABLISHED') this.listenerOn(to, local.port)!.queue.push(existing.id);
    return { change, reply: send && { from: to, to: fromSock.host, flags: send }, dropped: false, sock: existing };
  }

  /** accept(): the oldest completed connection gets the lowest free FD. Null if the queue is empty (a blocking accept waits). */
  accept(host: HostId, fd: number): { fd: number; sock: Sock } | null {
    const listener = this.byFd(host, fd);
    const id = listener.queue.shift();
    if (id === undefined) return null;
    const s = this.sock(id);
    s.fd = this.lowestFd(host);
    return { fd: s.fd, sock: s };
  }

  /** close(): the FD is freed at once; the connection itself carries on closing in the kernel. */
  close(host: HostId, fd: number): { change: Change; segment: Segment } {
    const s = this.byFd(host, fd);
    s.fd = null;
    const { change, send } = this.apply(s, 'close');
    return { change, segment: { from: host, to: hostOf(s.remote!.ip), flags: send! } };
  }

  /** TIME_WAIT is over: the socket is gone and its port is free. */
  expire(sock: Sock): Change {
    return this.apply(sock, 'timeout').change;
  }
}

export const hostOf = (ip: string): HostId => (Object.keys(HOSTS) as HostId[]).find((h) => HOSTS[h].ip === ip)!;

// ── Scenes ──────────────────────────────────────────────────────────────

export type CodeSide = 'client' | 'server';

/** One step of a scene: a call one process makes, or something its kernel does on its own. */
export interface Step {
  kind: StepKind;
  /** Whose code line is "now", and which line (by index in that side's listing). */
  line: Partial<Record<CodeSide, number>>;
  /** Lines blocked waiting at this step (accept, connect, recv). */
  blocked: Partial<Record<CodeSide, number>>;
  /** The return value shown beside the call. */
  ret?: string;
  changes: Change[];
  segment?: Segment;
  /** Byte counts for send/recv steps. */
  bytes?: number;
  /** A connection referred to by this step (its 4-tuple). */
  conn?: number;
  /** The FD a close() released. */
  freedFd?: number;
  /** Every socket after the step (CLOSED ones without an FD are gone from the kernel). */
  socks: Sock[];
  /** Scripted seconds since the scene began. */
  t: number;
}

export type StepKind =
  | 'socket-server' | 'bind' | 'listen' | 'accept-block' | 'socket-client' | 'connect' | 'syn-arrives' | 'syn-ack-arrives'
  | 'ack-arrives' | 'accept' | 'send' | 'recv' | 'client-close' | 'fin-arrives' | 'fin-ack-arrives' | 'recv-eof' | 'server-close'
  | 'last-fin-arrives' | 'last-ack-arrives' | 'time-wait-over'
  | 'queue-handshake' | 'queue-drop' | 'queue-retry' | 'queue-accept';

const snapshot = (k: Kernel): Sock[] => k.socks.map((s) => ({ ...s, local: s.local && { ...s.local }, remote: s.remote && { ...s.remote }, queue: [...s.queue] }));

/** Line numbers (0-based) in the two listings the Stage shows. */
export const SERVER_LINES = {
  socket: 0, bind: 1, listen: 2, accept: 3, recv: 4, close: 6,
} as const;
export const CLIENT_LINES = { socket: 0, connect: 1, send: 2, close: 3 } as const;

export const SERVER_CODE = [
  'fd = socket(AF_INET, SOCK_STREAM, 0)',
  `bind(fd, ${HOSTS.server.ip}:${SERVER_PORT})`,
  `listen(fd, ${BACKLOG})`,
  'conn = accept(fd)',
  'while ((n = recv(conn, buf, 8192)) > 0)',
  '    handle(buf, n)',
  'close(conn)',
];
export const CLIENT_CODE = [
  'fd = socket(AF_INET, SOCK_STREAM, 0)',
  `connect(fd, ${HOSTS.server.ip}:${SERVER_PORT})`,
  `send_all(fd, request, ${6000})`,
  'close(fd)',
];

/** The request the client sends, and how the server's two reads split it (illustrative: whatever had arrived). */
export const REQUEST_BYTES = 6000;
export const RECV_CHUNKS = [2920, 3080] as const;

/** The whole life of one connection, call by call. */
export function lifecycle(): Step[] {
  const k = new Kernel();
  const steps: Step[] = [];
  const server = { ip: HOSTS.server.ip, port: SERVER_PORT };
  let t = 0;
  const push = (s: Omit<Step, 'socks' | 't' | 'blocked'> & { blocked?: Step['blocked'] }) => steps.push({ blocked: {}, ...s, socks: snapshot(k), t });

  const lfd = k.socket('server');
  const listener = k.byFd('server', lfd).id;
  push({ kind: 'socket-server', line: { server: SERVER_LINES.socket }, ret: `${lfd}`, changes: [], conn: listener });
  const bound = k.bind('server', lfd, SERVER_PORT);
  push({ kind: 'bind', line: { server: SERVER_LINES.bind }, ret: bound.ok ? '0' : `-1 ${bound.errno}`, changes: [], conn: listener });
  push({ kind: 'listen', line: { server: SERVER_LINES.listen }, ret: '0', changes: [k.listen('server', lfd, BACKLOG)], conn: listener });
  push({ kind: 'accept-block', line: { server: SERVER_LINES.accept }, blocked: { server: SERVER_LINES.accept }, changes: [], conn: listener });

  const cfd = k.socket('alice');
  push({ kind: 'socket-client', line: { client: CLIENT_LINES.socket }, blocked: { server: SERVER_LINES.accept }, ret: `${cfd}`, changes: [], conn: k.byFd('alice', cfd).id });
  const c = k.connect('alice', cfd, server)!;
  const client = k.byFd('alice', cfd);
  push({ kind: 'connect', line: { client: CLIENT_LINES.connect }, blocked: { server: SERVER_LINES.accept, client: CLIENT_LINES.connect }, changes: [c.change], segment: c.segment, conn: client.id });

  t += 0.01;
  const syn = k.deliver(client, 'SYN');
  push({ kind: 'syn-arrives', line: {}, blocked: { server: SERVER_LINES.accept, client: CLIENT_LINES.connect }, changes: [syn.change!], segment: syn.reply!, conn: syn.sock!.id });
  const child = syn.sock!;
  const synAck = k.deliver(child, 'SYN,ACK');
  push({ kind: 'syn-ack-arrives', line: { client: CLIENT_LINES.connect }, blocked: { server: SERVER_LINES.accept }, ret: '0', changes: [synAck.change!], segment: synAck.reply!, conn: client.id });
  const ack = k.deliver(client, 'ACK');
  push({ kind: 'ack-arrives', line: {}, blocked: { server: SERVER_LINES.accept }, changes: [ack.change!], conn: child.id });

  const acc = k.accept('server', lfd)!;
  push({ kind: 'accept', line: { server: SERVER_LINES.accept }, ret: `${acc.fd}`, changes: [], conn: acc.sock.id });

  push({ kind: 'send', line: { client: CLIENT_LINES.send }, ret: `${REQUEST_BYTES}`, changes: [], bytes: REQUEST_BYTES, conn: client.id });
  for (const n of RECV_CHUNKS) push({ kind: 'recv', line: { server: SERVER_LINES.recv }, ret: `${n}`, changes: [], bytes: n, conn: child.id });

  t += 0.01;
  const cc = k.close('alice', cfd);
  push({ kind: 'client-close', line: { client: CLIENT_LINES.close }, ret: '0', changes: [cc.change], segment: cc.segment, conn: client.id, freedFd: cfd });
  const fin = k.deliver(client, 'FIN');
  push({ kind: 'fin-arrives', line: {}, changes: [fin.change!], segment: fin.reply!, conn: child.id });
  const finAck = k.deliver(child, 'ACK');
  push({ kind: 'fin-ack-arrives', line: {}, changes: [finAck.change!], conn: client.id });
  push({ kind: 'recv-eof', line: { server: SERVER_LINES.recv }, ret: '0', changes: [], conn: child.id });
  const sc = k.close('server', acc.fd);
  push({ kind: 'server-close', line: { server: SERVER_LINES.close }, ret: '0', changes: [sc.change], segment: sc.segment, conn: child.id, freedFd: acc.fd });
  const lastFin = k.deliver(child, 'FIN');
  push({ kind: 'last-fin-arrives', line: {}, changes: [lastFin.change!], segment: lastFin.reply!, conn: client.id });
  const lastAck = k.deliver(client, 'ACK');
  push({ kind: 'last-ack-arrives', line: {}, changes: [lastAck.change!], conn: child.id });

  t += TIME_WAIT_S;
  push({ kind: 'time-wait-over', line: {}, changes: [k.expire(client)], conn: client.id });
  return steps;
}

/** The clients of the accept-queue scene, in order: which host each connection comes from. */
export const QUEUE_CLIENTS: readonly HostId[] = ['alice', 'bob', 'alice', 'bob', 'alice', 'bob'];
/** Linux's first SYN retransmission waits 1 s (the initial RTO), and the wait doubles each time. */
export const SYN_RTO_S = 1;

/**
 * Six clients connect to a server with backlog 4. When `slow`, the server isn't calling
 * accept(), so completed connections pile up in the queue and, once it's full, new SYNs are
 * dropped; at the end the server accepts one and a retried SYN gets in. Otherwise each
 * connection is accepted as soon as it's ready.
 */
export function acceptQueueScene(slow: boolean): Step[] {
  const k = new Kernel();
  const steps: Step[] = [];
  const server = { ip: HOSTS.server.ip, port: SERVER_PORT };
  let t = 0;
  const push = (s: Omit<Step, 'socks' | 't' | 'blocked'> & { blocked?: Step['blocked'] }) => steps.push({ blocked: {}, ...s, socks: snapshot(k), t });
  const lfd = k.socket('server');
  k.bind('server', lfd, SERVER_PORT);
  const listen = k.listen('server', lfd, BACKLOG);
  push({ kind: 'listen', line: { server: SERVER_LINES.listen }, ret: '0', changes: [listen] });

  const handshake = (from: Sock): { changes: Change[]; child: Sock } | null => {
    const syn = k.deliver(from, 'SYN');
    if (syn.dropped) return null;
    const synAck = k.deliver(syn.sock!, 'SYN,ACK');
    const ack = k.deliver(from, 'ACK');
    return { changes: [syn.change!, synAck.change!, ack.change!], child: syn.sock! };
  };

  const waiting: Sock[] = [];
  for (const host of QUEUE_CLIENTS) {
    t += 0.2;
    const fd = k.socket(host);
    const c = k.connect(host, fd, server)!;
    const sock = k.byFd(host, fd);
    const hs = handshake(sock);
    if (!hs) {
      waiting.push(sock);
      push({ kind: 'queue-drop', line: {}, changes: [c.change], segment: { ...c.segment, dropped: true }, conn: sock.id });
      continue;
    }
    push({ kind: 'queue-handshake', line: {}, changes: [c.change, ...hs.changes], conn: hs.child.id });
    if (!slow) {
      const acc = k.accept('server', lfd)!;
      push({ kind: 'queue-accept', line: { server: SERVER_LINES.accept }, ret: `${acc.fd}`, changes: [], conn: acc.sock.id });
    }
  }
  if (slow && waiting.length) {
    const acc = k.accept('server', lfd)!;
    push({ kind: 'queue-accept', line: { server: SERVER_LINES.accept }, ret: `${acc.fd}`, changes: [], conn: acc.sock.id });
    const first = waiting[0];
    t += SYN_RTO_S;
    const hs = handshake(first)!;
    push({ kind: 'queue-retry', line: {}, changes: hs.changes, conn: hs.child.id });
  }
  return steps;
}

// ── TIME_WAIT pile-up ───────────────────────────────────────────────────

/** A deliberately tiny port range, so running out happens on screen (real ranges hold 16,384 or 28,232). */
export const TOY_RANGE = { lo: 49152, hi: 49279 } as const;
export const PILEUP_CONNECTIONS = 200;
/** New short connections per second in the pile-up (illustrative). */
export const PILEUP_RATE = 10;

export type PortState = 'free' | 'open' | 'time-wait';

export interface PileupFrame {
  t: number;
  /** Connections attempted so far. */
  attempted: number;
  ok: number;
  /** connect() calls refused with EADDRNOTAVAIL: no free port. */
  failed: number;
  timeWait: number;
  /** Each port's state, indexed from the range's low end. */
  ports: PortState[];
  /** True at the checkpoint where the first connect() failed. */
  firstFailure: boolean;
}

/**
 * The client opens and immediately closes `connections` short connections to one server,
 * `rate` per second, each leaving its port in TIME_WAIT for TIME_WAIT_S (the client closed
 * first). With `reuse`, one kept-alive connection carries every request instead. Returns a
 * frame at every `every`-th connection, at the first failure, and after the last TIME_WAIT ends.
 */
export function pileup(opts: { connections?: number; rate?: number; range?: { lo: number; hi: number }; reuse: boolean; every?: number; seed?: number }): PileupFrame[] {
  const { connections = PILEUP_CONNECTIONS, rate = PILEUP_RATE, range = TOY_RANGE, reuse, every = 25, seed = PORT_SEED } = opts;
  const size = rangeSize(range);
  const rnd = mulberry32(seed);
  const until = new Map<number, number>(); // port → when its TIME_WAIT ends
  let ok = 0;
  let failed = 0;
  let sawFailure = false;
  const frames: PileupFrame[] = [];
  let kept: number | null = null;

  const portsAt = (t: number, open: number | null): PortState[] =>
    Array.from({ length: size }, (_, i) => {
      const p = range.lo + i;
      if (p === open) return 'open';
      return (until.get(p) ?? -1) > t ? 'time-wait' : 'free';
    });
  const snap = (t: number, attempted: number, firstFailure = false) => {
    const ports = portsAt(t, kept);
    frames.push({ t, attempted, ok, failed, timeWait: ports.filter((p) => p === 'time-wait').length, ports, firstFailure });
  };

  snap(0, 0);
  for (let i = 1; i <= connections; i++) {
    const t = i / rate;
    if (reuse) {
      if (kept === null) kept = freshInt(range.lo, range.hi, [], rnd);
      ok++;
    } else {
      const taken = [...until].filter(([, end]) => end > t).map(([p]) => p);
      const port = freshInt(range.lo, range.hi, taken, rnd);
      if (port === null) failed++;
      else {
        ok++;
        until.set(port, t + TIME_WAIT_S);
      }
    }
    const first = failed === 1 && !sawFailure;
    if (first) sawFailure = true;
    if (first || i % every === 0 || i === connections) snap(t, i, first);
  }
  const end = connections / rate;
  if (reuse && kept !== null) {
    // The one connection closes at the end, and its port then waits out TIME_WAIT too.
    until.set(kept, end + TIME_WAIT_S);
    kept = null;
    snap(end, connections);
  }
  const lastEnd = Math.max(end, ...until.values());
  snap(lastEnd, connections);
  return frames;
}

/** How many new connections per second one client can sustain to one server:port before ports run out. */
export const sustainableRate = (range: { lo: number; hi: number }, timeWait = TIME_WAIT_S) => rangeSize(range) / timeWait;
