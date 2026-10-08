import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  BACKLOG, ERRNO_TEXT, HOSTS, IANA_EPHEMERAL, LINUX_EPHEMERAL, PILEUP_RATE, PRIVILEGED_BELOW, SERVER_PORT, SYN_RTO_S, TIME_WAIT_S, rangeSize,
  sustainableRate, tupleText, type BindResult, type Change, type PileupFrame, type Sock, type Step,
} from './model';

export interface SocketFrame extends Frame {
  /** Index into the scene's steps; -1 before the first. */
  step: number;
}

const n = (x: number) => x.toLocaleString('en-US');
const server = `${HOSTS.server.ip}:${SERVER_PORT}`;
const sockOf = (s: Step) => s.socks.find((x) => x.id === s.conn)!;
const listenerOf = (s: Step) => s.socks.find((x) => x.listener)!;
const moved = (c: Change) => (
  <>
    {c.from} → <span className="hl">{c.to}</span>
  </>
);
const queueText = (s: Step) => `${listenerOf(s).queue.length} of ${BACKLOG}`;

/** What one lifecycle or accept-queue step means, from its own data. */
export function stepCaption(s: Step): ReactNode {
  switch (s.kind) {
    case 'socket-server':
      return <><code>socket()</code> returns <b>fd {s.ret}</b>: a TCP socket in CLOSED, with no address yet. 0, 1 and 2 are stdin, stdout and
        stderr, so the lowest free number is {s.ret}.</>;
    case 'bind':
      return <><code>bind()</code> names the socket {epOf(sockOf(s))}. It's still CLOSED: binding sets the address, it doesn't start TCP.</>;
    case 'listen':
      return <><code>listen(fd, {listenerOf(s).backlog})</code>: {moved(s.changes[0])}. The kernel now answers SYNs for port {SERVER_PORT} by itself
        and keeps up to {listenerOf(s).backlog} finished connections waiting for the program.</>;
    case 'accept-block':
      return <><code>accept()</code> <b>blocks</b>: no connection is waiting, so the server sleeps on this line. (A non-blocking socket would
        return EAGAIN instead.)</>;
    case 'socket-client':
      return <>The client's <code>socket()</code> returns <b>fd {s.ret}</b> too. Every process has its own FD table, so the two 3s are unrelated.</>;
    case 'connect': {
      const c = sockOf(s);
      return <><code>connect()</code>: the client never called bind, so the kernel picks an <span className="hl violet">ephemeral port</span>,{' '}
        <b>{c.local!.port}</b>, and sends SYN: {moved(s.changes[0])}. The connection is the 4-tuple {tupleText(c)}. connect() blocks until the
        handshake is done.</>;
    }
    case 'syn-arrives':
      return <>The SYN reaches the listener, and the kernel makes a <b>new socket</b> for this connection: {moved(s.changes[0])}, replying SYN,ACK.
        The listener itself stays in LISTEN, and the program hasn't been told anything yet.</>;
    case 'syn-ack-arrives':
      return <>SYN,ACK arrives: {moved(s.changes[0])} on the client. It sends the final ACK, and <code>connect()</code> returns 0.</>;
    case 'ack-arrives':
      return <>The ACK finishes the handshake on the server: {moved(s.changes[0])}. The new socket waits in the{' '}
        <span className="hl">accept queue</span> ({queueText(s)}). The kernel did all of this; the server's code is still inside accept().</>;
    case 'accept':
      return <><code>accept()</code> wakes up and returns <b>fd {s.ret}</b>: a <span className="hl info">new socket</span> for this one connection
        ({tupleText(sockOf(s))}). fd {listenerOf(s).fd} is still the <span className="hl violet">listener</span>, still LISTEN, ready for the next
        client. No new port was needed.</>;
    case 'send':
      return <><code>send()</code> took all {n(s.bytes!)} bytes in one call. It's allowed to take fewer (always possible on a non-blocking socket,
        or when a signal interrupts it), so <code>send_all</code> loops on the return value. Returning means the bytes are in the client's send
        buffer, not that the server has read them.</>;
    case 'recv':
      return recvCaption(s);
    case 'client-close':
      return <>The client calls <code>close()</code>: fd {closedFd(s)} is freed at once, but the connection lives on in the kernel, which sends
        FIN: {moved(s.changes[0])}.</>;
    case 'fin-arrives':
      return <>The server's kernel gets the FIN and ACKs it: {moved(s.changes[0])}. The client won't send any more; the server still can.</>;
    case 'fin-ack-arrives':
      return <>The ACK reaches the client: {moved(s.changes[0])}, waiting for the server's own FIN.</>;
    case 'recv-eof':
      return <><code>recv()</code> returns <b>0</b>: end of stream, the peer has closed, so the loop ends. A server that never calls close() here
        leaves the socket in CLOSE_WAIT for good: a classic leak.</>;
    case 'server-close':
      return <><code>close(conn)</code> frees fd {closedFd(s)} and sends the server's FIN: {moved(s.changes[0])}.</>;
    case 'last-fin-arrives':
      return <>The client ACKs the server's FIN: {moved(s.changes[0])}. The side that closed first waits here, for two reasons: if that final
        ACK is lost, the server resends its FIN and the client can ACK it again; and a late duplicate segment can't be mistaken for part of a
        new connection on the same 4-tuple.</>;
    case 'last-ack-arrives':
      return <>That ACK arrives: {moved(s.changes[0])}, and the server's connection socket is gone. The listener on fd {listenerOf(s).fd} is
        untouched, still LISTEN.</>;
    case 'time-wait-over':
      return <>{TIME_WAIT_S} s later (Linux's TIME_WAIT; RFC 9293 says 2 × MSL): {moved(s.changes[0])}. The client's socket is gone and port{' '}
        {sockOf(s).local!.port} is free again.</>;
    case 'queue-handshake': {
      const c = sockOf(s);
      return <>{clientLabel(c)} connects from {epOf({ local: c.remote })}. The kernel completes the handshake by itself, both sides reach
        ESTABLISHED, and the connection waits in the <span className="hl">accept queue</span>: {queueText(s)}. The client's connect() has already
        returned.</>;
    }
    case 'queue-accept':
      return <><code>accept()</code> returns <b>fd {s.ret}</b> for {tupleText(sockOf(s))}; the queue is down to {queueText(s)}.</>;
    case 'queue-drop': {
      const c = sockOf(s);
      return <>{clientLabel({ remote: c.local })} sends SYN from {epOf(c)}, but the accept queue is full ({queueText(s)}), so the kernel{' '}
        <span className="hl bad">drops it</span> without a word (Linux's default). connect() keeps waiting and retries after {SYN_RTO_S} s, then 2 s,
        4 s…; if no retry gets in, it fails with ETIMEDOUT, after about two minutes on Linux's defaults.</>;
    }
    case 'queue-retry': {
      const c = sockOf(s);
      return <>One accept() made room, so {clientLabel(c)}'s retried SYN, sent {SYN_RTO_S} s after its first one, gets in: the queue is {queueText(s)} again.
        Every connection shares port {SERVER_PORT}; the 4-tuples differ only in the client's address and port.</>;
    }
  }
}

function recvCaption(s: Step): ReactNode {
  return <><code>recv()</code> returns <b>{n(s.bytes!)}</b>: whatever has arrived so far, up to the 8,192 asked for. TCP is a byte stream with no
    message boundaries, so one send can take several reads (the split here is illustrative).</>;
}

/** The second read's caption names the total, summed from the steps. */
export function recvTotalCaption(reads: readonly number[]): ReactNode {
  return <>The next <code>recv()</code> returns <b>{n(reads.at(-1)!)}</b>: {reads.map(n).join(' + ')} = {n(reads.reduce((a, b) => a + b, 0))} bytes,
    the whole request. Code that assumes one recv = one message breaks on exactly this.</>;
}

const epOf = (s: Pick<Sock, 'local'>) => `${s.local!.ip}:${s.local!.port}`;
const clientLabel = (s: Pick<Sock, 'remote'>) => (s.remote!.ip === HOSTS.alice.ip ? HOSTS.alice.label : HOSTS.bob.label).replace(/^c/, 'C');
const closedFd = (s: Step) => s.freedFd!;

/** One frame per step after an intro; the second read's caption sums the reads so far. */
export function sceneFrames(steps: readonly Step[], intro: ReactNode): SocketFrame[] {
  const recvs: number[] = [];
  return [
    { step: -1, say: intro },
    ...steps.map((s, i) => {
      let say = stepCaption(s);
      if (s.kind === 'recv') {
        recvs.push(s.bytes!);
        if (recvs.length > 1) say = recvTotalCaption(recvs);
      }
      return { step: i, say, hold: s.kind === 'accept' || s.kind === 'queue-drop' ? 2 : 1 };
    }),
  ];
}

export const lifecycleIntro = <>A server and a client, each a process with its own code and FD table. Step through the calls: every socket
  shows up as an FD, and its TCP state lights on the diagram.</>;

export function queueIntro(slow: boolean): ReactNode {
  return slow
    ? <>Six clients connect to a server with backlog {BACKLOG}, but the server is <b>slow</b>: it isn't calling accept(). Press play to watch
      the accept queue.</>
    : <>Six clients connect to a server with backlog {BACKLOG}. It calls accept() as fast as connections arrive. Press play.</>;
}

// ── TIME_WAIT pile-up ───────────────────────────────────────────────────

export function pileupCaption(f: PileupFrame, i: number, frames: readonly PileupFrame[], reuse: boolean, range: { lo: number; hi: number }): ReactNode {
  const size = rangeSize(range);
  const total = frames.at(-1)!.attempted;
  const free = f.ports.filter((p) => p === 'free').length;
  if (i === 0)
    return <>The client is about to open {total} short connections to {server}, {PILEUP_RATE} a second, closing each one first.
      {reuse ? ' With keep-alive they all share one connection.' : ''} Its port range is shrunk to {size} ports so running out happens on screen.</>;
  if (i === frames.length - 1)
    return <>{reuse ? 'The one connection closed at the end' : `All ${total} tried`}: {n(f.ok)} succeeded{f.failed ? <>, <span className="hl bad">{n(f.failed)} refused</span> for lack of a port</> : ''}.{' '}
      {TIME_WAIT_S} s after the last close, every TIME_WAIT is over and all {size} ports are free again.</>;
  if (f.firstFailure)
    return <>Connection {f.attempted}: all {size} ports are in <span className="hl orange">TIME_WAIT</span>, so connect() fails with{' '}
      <span className="hl bad">EADDRNOTAVAIL</span> ("{ERRNO_TEXT.EADDRNOTAVAIL}"). Nothing is broken; the ports are waiting out their {TIME_WAIT_S} s.</>;
  if (reuse)
    return <>{f.attempted} requests over one kept-alive connection: {plural(f.ports.filter((p) => p === 'open').length, 'port')} in use,{' '}
      {f.timeWait} in TIME_WAIT, and every request got through.</>;
  return <>{f.attempted} connections so far: {f.timeWait} ports sit in <span className="hl orange">TIME_WAIT</span> because the client closed
    first, {free} free{f.failed ? <>, and {n(f.failed)} connects <span className="hl bad">refused</span></> : ''}.</>;
}

/** The real-range arithmetic, from the model. */
export function realRanges(): ReactNode {
  const iana = Math.floor(sustainableRate(IANA_EPHEMERAL));
  const linux = Math.floor(sustainableRate(LINUX_EPHEMERAL));
  return <>Real ranges hold {n(rangeSize(IANA_EPHEMERAL))} ports (IANA's {IANA_EPHEMERAL.lo}-{IANA_EPHEMERAL.hi}) or {n(rangeSize(LINUX_EPHEMERAL))}{' '}
    (Linux's {LINUX_EPHEMERAL.lo}-{LINUX_EPHEMERAL.hi}). With a {TIME_WAIT_S} s TIME_WAIT that's about {iana} or {linux} new connections per
    second from one client to one server:port. A port in TIME_WAIT can still reach a different server.</>;
}

// ── bind() ──────────────────────────────────────────────────────────────

export type Occupant = 'nothing' | 'listener' | 'time-wait';

export function bindCaption(port: number, occupant: Occupant, privileged: boolean, reuseAddr: boolean, r: BindResult): ReactNode {
  if (r.ok) {
    if (occupant === 'time-wait')
      return <>Bound. The old run's connections are still in TIME_WAIT on :{port}, but the server sets <code>SO_REUSEADDR</code>, which lets a
        restart bind past them. It doesn't let two servers listen on one port.</>;
    if (port < PRIVILEGED_BELOW) return <>Bound: running as root (on Linux, any process with CAP_NET_BIND_SERVICE) may use ports below {PRIVILEGED_BELOW}.</>;
    return <>Bound. Nothing else uses :{port}, so the address is free{reuseAddr ? ' (SO_REUSEADDR changes nothing here)' : ''}.</>;
  }
  if (r.errno === 'EACCES')
    return <><span className="hl bad">EACCES</span>: ports below {PRIVILEGED_BELOW} are privileged on Linux. Run with CAP_NET_BIND_SERVICE, put a proxy
      on :{port} in front of an unprivileged port, or lower <code>net.ipv4.ip_unprivileged_port_start</code>.{privileged ? '' : ' Or set "Runs as" to Root.'}</>;
  if (occupant === 'listener')
    return <><span className="hl bad">EADDRINUSE</span>: another socket is already LISTENing on :{port}.{reuseAddr ? ' SO_REUSEADDR doesn\'t help: on Linux it doesn\'t let two listeners share a TCP port (that takes SO_REUSEPORT).' : ''} Stop the other server or pick another port.</>;
  return <><span className="hl bad">EADDRINUSE</span>: the old run's connections are still in TIME_WAIT on :{port}, and without{' '}
    <code>SO_REUSEADDR</code> Linux won't let a new socket bind there until they expire ({TIME_WAIT_S} s). Servers set SO_REUSEADDR before bind()
    for exactly this restart.</>;
}
