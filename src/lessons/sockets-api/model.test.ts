import { describe, expect, it } from 'vitest';
import {
  BACKLOG, HOSTS, IANA_EPHEMERAL, Kernel, LINUX_EPHEMERAL, PILEUP_CONNECTIONS, PILEUP_RATE, QUEUE_CLIENTS, REQUEST_BYTES, RECV_CHUNKS, SERVER_PORT,
  SYN_RTO_S, TCP_STATES, TIME_WAIT_S, TOY_RANGE, TRANSITIONS, acceptQueueScene, bindCheck, lifecycle, pileup, rangeSize, sustainableRate, transition,
  type Step, type TcpEvent, type TcpState,
} from './model';

/**
 * RFC 9293 Figure 5, transcribed in the RFC's own words for the modelled events (not
 * simultaneous open/close, not closing before connected). Mapped to the model's event names
 * by a separate table, so a typo in either side shows up.
 */
const RFC_FIGURE_5 = [
  'CLOSED --passive OPEN / create TCB--> LISTEN',
  'CLOSED --active OPEN / create TCB, snd SYN--> SYN-SENT',
  'LISTEN --rcv SYN / snd SYN,ACK--> SYN-RECEIVED',
  'SYN-SENT --rcv SYN,ACK / snd ACK--> ESTABLISHED',
  'SYN-RECEIVED --rcv ACK of SYN / x--> ESTABLISHED',
  'ESTABLISHED --CLOSE / snd FIN--> FIN-WAIT-1',
  'ESTABLISHED --rcv FIN / snd ACK--> CLOSE-WAIT',
  'FIN-WAIT-1 --rcv ACK of FIN / x--> FIN-WAIT-2',
  'FIN-WAIT-2 --rcv FIN / snd ACK--> TIME-WAIT',
  'CLOSE-WAIT --CLOSE / snd FIN--> LAST-ACK',
  'LAST-ACK --rcv ACK of FIN / x--> CLOSED',
  'TIME-WAIT --Timeout=2MSL / delete TCB--> CLOSED',
];
const RFC_EVENT: Record<string, TcpEvent> = {
  'passive OPEN': 'passive-open', 'active OPEN': 'active-open', 'rcv SYN': 'rcv-syn', 'rcv SYN,ACK': 'rcv-syn-ack',
  'rcv ACK of SYN': 'rcv-ack', 'rcv ACK of FIN': 'rcv-ack', CLOSE: 'close', 'rcv FIN': 'rcv-fin', 'Timeout=2MSL': 'timeout',
};
const rfcState = (s: string) => ({ 'SYN-RECEIVED': 'SYN_RCVD' } as Record<string, string>)[s] ?? s.replace(/-/g, '_');

function parseRfc(line: string) {
  const m = /^(\S+) --(.+?) \/ (.+?)--> (\S+)$/.exec(line)!;
  const send = /snd ([A-Z,]+)/.exec(m[3])?.[1] ?? null;
  return { from: rfcState(m[1]), event: RFC_EVENT[m[2]], to: rfcState(m[4]), send };
}

describe('the TCP state machine matches RFC 9293', () => {
  it('every modelled transition is in Figure 5, with the same segment sent, and nothing extra', () => {
    const ref = RFC_FIGURE_5.map(parseRfc);
    expect(TRANSITIONS).toHaveLength(ref.length);
    for (const r of ref) {
      expect(TCP_STATES).toContain(r.from);
      expect(TCP_STATES).toContain(r.to);
      const t = transition(r.from as TcpState, r.event);
      expect(t, `${r.from} on ${r.event}`).not.toBeNull();
      expect(t!.to).toBe(r.to);
      expect(t!.send).toBe(r.send);
    }
  });

  it('events the figure has no arrow for are refused', () => {
    expect(transition('LISTEN', 'rcv-ack')).toBeNull();
    expect(transition('CLOSED', 'close')).toBeNull();
    expect(transition('TIME_WAIT', 'rcv-syn')).toBeNull();
  });

  /** Drive two endpoints by delivering each sent segment to the other side, and record each side's state path. */
  function closeRun(firstCloser: 'client' | 'server') {
    const k = new Kernel();
    const lfd = k.socket('server');
    k.bind('server', lfd, SERVER_PORT);
    k.listen('server', lfd, BACKLOG);
    const cfd = k.socket('alice');
    k.connect('alice', cfd, { ip: HOSTS.server.ip, port: SERVER_PORT });
    const client = k.byFd('alice', cfd);
    const syn = k.deliver(client, 'SYN');
    const child = syn.sock!;
    const path = { client: ['CLOSED', client.state], server: ['LISTEN', child.state] } as Record<'client' | 'server', string[]>;
    const note = () => {
      if (path.client.at(-1) !== client.state) path.client.push(client.state);
      if (path.server.at(-1) !== child.state) path.server.push(child.state);
    };
    k.deliver(child, 'SYN,ACK'); note();
    k.deliver(client, 'ACK'); note();
    k.accept('server', lfd);
    const [closer, other] = firstCloser === 'client' ? [client, child] : [child, client];
    const closed = k.close(closer.host, closer.fd!); note();
    const reply = k.deliver(closer, closed.segment.flags).reply!; note();
    k.deliver(other, reply.flags); note();
    const second = k.close(other.host, other.fd!); note();
    const lastAck = k.deliver(other, second.segment.flags).reply!; note();
    k.deliver(closer, lastAck.flags); note();
    k.expire(closer); note();
    return path;
  }

  it('an active close ends in TIME_WAIT on the side that closed first, a passive close in LAST_ACK', () => {
    expect(closeRun('client')).toEqual({
      client: ['CLOSED', 'SYN_SENT', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT', 'CLOSED'],
      server: ['LISTEN', 'SYN_RCVD', 'ESTABLISHED', 'CLOSE_WAIT', 'LAST_ACK', 'CLOSED'],
    });
    // The same kernel with the roles swapped: now the server waits out TIME_WAIT.
    expect(closeRun('server')).toEqual({
      client: ['CLOSED', 'SYN_SENT', 'ESTABLISHED', 'CLOSE_WAIT', 'LAST_ACK', 'CLOSED'],
      server: ['LISTEN', 'SYN_RCVD', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT', 'CLOSED'],
    });
  });
});

describe('the lifecycle scene', () => {
  const steps = lifecycle();
  const kinds = steps.map((s) => s.kind);

  it('runs the calls in the order a real client and server make them', () => {
    const order = ['socket-server', 'bind', 'listen', 'accept-block', 'socket-client', 'connect', 'accept', 'send', 'recv', 'client-close', 'recv-eof', 'server-close', 'time-wait-over'];
    const at = order.map((k) => kinds.indexOf(k as Step['kind']));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('every segment sent is the one the next step delivers', () => {
    for (let i = 0; i < steps.length - 1; i++) {
      const seg = steps[i].segment;
      if (!seg) continue;
      const next = steps[i + 1].changes.find((c) => c.host === seg.to);
      const expected = { SYN: 'rcv-syn', 'SYN,ACK': 'rcv-syn-ack', ACK: 'rcv-ack', FIN: 'rcv-fin' }[seg.flags];
      expect(next?.event, `step ${i} sent ${seg.flags}`).toBe(expected);
    }
  });

  it('accept() returns a new FD for a new socket, and the listener stays in LISTEN', () => {
    const accept = steps.find((s) => s.kind === 'accept')!;
    const listener = accept.socks.find((s) => s.listener)!;
    const conn = accept.socks.find((s) => s.id === accept.conn)!;
    expect(listener.fd).toBe(3);
    expect(listener.state).toBe('LISTEN');
    expect(conn.fd).toBe(Number(accept.ret));
    expect(conn.fd).not.toBe(listener.fd);
    expect(conn.state).toBe('ESTABLISHED');
    expect(conn.local).toEqual({ ip: HOSTS.server.ip, port: SERVER_PORT });
    // Every later step keeps the listener listening.
    for (const s of steps.slice(steps.indexOf(accept))) expect(s.socks.find((x) => x.listener)!.state).toBe('LISTEN');
  });

  it('both processes number their first socket 3: FD tables are per process', () => {
    const client = steps.find((s) => s.kind === 'socket-client')!;
    expect(client.ret).toBe('3');
    expect(steps[0].ret).toBe('3');
  });

  it('the client port is ephemeral, from the IANA range', () => {
    const conn = steps.find((s) => s.kind === 'connect')!;
    const port = conn.socks.find((s) => s.id === conn.conn)!.local!.port;
    expect(port).toBeGreaterThanOrEqual(IANA_EPHEMERAL.lo);
    expect(port).toBeLessThanOrEqual(IANA_EPHEMERAL.hi);
  });

  it('the reads add up to what was sent, in fewer bytes per call than the request', () => {
    const reads = steps.filter((s) => s.kind === 'recv').map((s) => s.bytes!);
    expect(reads).toEqual([...RECV_CHUNKS]);
    expect(reads.reduce((a, b) => a + b, 0)).toBe(REQUEST_BYTES);
    expect(reads.every((n) => n < REQUEST_BYTES)).toBe(true);
  });

  it('close() frees the FD at once, while the connection finishes closing in the kernel', () => {
    const close = steps.find((s) => s.kind === 'client-close')!;
    const sock = close.socks.find((s) => s.id === close.conn)!;
    expect(sock.fd).toBeNull();
    expect(sock.state).toBe('FIN_WAIT_1');
  });

  it('TIME_WAIT lasts the modelled 60 s, on the side that closed first', () => {
    const last = steps.at(-1)!;
    const before = steps.at(-2)!;
    expect(before.socks.find((s) => s.id === last.conn)!.state).toBe('TIME_WAIT');
    expect(last.t - before.t).toBe(TIME_WAIT_S);
    expect(last.changes).toEqual([expect.objectContaining({ from: 'TIME_WAIT', to: 'CLOSED', host: 'alice' })]);
  });
});

describe('the accept queue', () => {
  for (const slow of [false, true]) {
    const steps = acceptQueueScene(slow);
    it(`never holds more than the backlog (${slow ? 'slow' : 'accepting'} server)`, () => {
      for (const s of steps) expect(s.socks.find((x) => x.listener)!.queue.length).toBeLessThanOrEqual(BACKLOG);
    });

    it(`every accepted connection gets a fresh FD that isn't the listener's (${slow ? 'slow' : 'accepting'})`, () => {
      const fds = steps.filter((s) => s.kind === 'queue-accept').map((s) => Number(s.ret));
      expect(new Set(fds).size).toBe(fds.length);
      expect(fds).not.toContain(3);
      for (const s of steps) {
        const serverFds = s.socks.filter((x) => x.host === 'server' && x.fd !== null).map((x) => x.fd);
        expect(new Set(serverFds).size).toBe(serverFds.length);
      }
    });

    it(`every connection's 4-tuple is unique, all on the one server port (${slow ? 'slow' : 'accepting'})`, () => {
      for (const s of steps) {
        const conns = s.socks.filter((x) => x.host === 'server' && !x.listener && x.state !== 'CLOSED');
        const tuples = conns.map((x) => `${x.local!.ip}:${x.local!.port}|${x.remote!.ip}:${x.remote!.port}`);
        expect(new Set(tuples).size).toBe(tuples.length);
        for (const c of conns) expect(c.local!.port).toBe(SERVER_PORT);
      }
    });
  }

  it('an accepting server takes every client; a slow one drops SYNs once the queue is full', () => {
    const fast = acceptQueueScene(false);
    expect(fast.filter((s) => s.kind === 'queue-drop')).toHaveLength(0);
    expect(fast.filter((s) => s.kind === 'queue-accept')).toHaveLength(QUEUE_CLIENTS.length);
    const slow = acceptQueueScene(true);
    const drops = slow.filter((s) => s.kind === 'queue-drop');
    expect(drops).toHaveLength(QUEUE_CLIENTS.length - BACKLOG);
    for (const d of drops) {
      expect(d.socks.find((x) => x.listener)!.queue).toHaveLength(BACKLOG);
      // The client's connect() is still waiting: its socket stays in SYN_SENT.
      expect(d.socks.find((x) => x.id === d.conn)!.state).toBe('SYN_SENT');
    }
  });

  it('in the queue, a connection is ESTABLISHED on both sides before accept() is called', () => {
    const slow = acceptQueueScene(true);
    const queued = slow.filter((s) => s.kind === 'queue-handshake');
    for (const q of queued) {
      const child = q.socks.find((x) => x.id === q.conn)!;
      expect(child.state).toBe('ESTABLISHED');
      expect(child.fd).toBeNull();
    }
  });

  it('the dropped client retries exactly one initial RTO after its first SYN (the caption says so)', () => {
    const slow = acceptQueueScene(true);
    const drop = slow.find((s) => s.kind === 'queue-drop')!;
    const retry = slow.at(-1)!;
    expect(retry.t - drop.t).toBeCloseTo(SYN_RTO_S, 9);
    expect(retry.socks.find((x) => x.id === retry.conn)!.remote!.port).toBe(drop.socks.find((x) => x.id === drop.conn)!.local!.port);
  });

  it('after one accept() makes room, the retried SYN gets in', () => {
    const slow = acceptQueueScene(true);
    const retry = slow.at(-1)!;
    expect(retry.kind).toBe('queue-retry');
    expect(retry.socks.find((x) => x.listener)!.queue).toHaveLength(BACKLOG);
  });
});

describe('bind()', () => {
  // The Linux rules, worked by hand for every case the scene can show.
  const cases: [port: number, privileged: boolean, reuse: boolean, onPort: TcpState[], expected: string][] = [];
  for (const port of [80, 8080]) {
    for (const privileged of [false, true]) {
      for (const reuse of [false, true]) {
        for (const [label, onPort] of [['free', []], ['listening', ['LISTEN']], ['time-wait', ['TIME_WAIT', 'TIME_WAIT']]] as const) {
          let expected = 'ok';
          if (port === 80 && !privileged) expected = 'EACCES';
          else if (label === 'listening') expected = 'EADDRINUSE';
          else if (label === 'time-wait' && !reuse) expected = 'EADDRINUSE';
          cases.push([port, privileged, reuse, [...onPort], expected]);
        }
      }
    }
  }

  it.each(cases)('port %i, privileged %s, SO_REUSEADDR %s, already on it %j → %s', (port, privileged, reuseAddr, onPort, expected) => {
    const r = bindCheck(port, { privileged, reuseAddr, onPort });
    expect(r.ok ? 'ok' : r.errno).toBe(expected);
  });

  it('the kernel refuses a second bind to a listening port', () => {
    const k = new Kernel();
    const a = k.socket('server');
    k.bind('server', a, SERVER_PORT);
    k.listen('server', a, BACKLOG);
    const b = k.socket('server');
    expect(k.bind('server', b, SERVER_PORT, { reuseAddr: true })).toEqual({ ok: false, errno: 'EADDRINUSE' });
  });
});

describe('the TIME_WAIT pile-up', () => {
  /** Independent count: successful connects whose TIME_WAIT is still running at time t. */
  function reference(n: number, rate: number, size: number) {
    const starts: number[] = [];
    const out: { ok: number; failed: number }[] = [];
    let failed = 0;
    for (let i = 1; i <= n; i++) {
      const t = i / rate;
      const inUse = starts.filter((s) => t < s + TIME_WAIT_S).length;
      if (inUse < size) starts.push(t);
      else failed++;
      out.push({ ok: starts.length, failed });
    }
    return out;
  }

  it('failures start exactly when TIME_WAIT holds every port, and match an independent count', () => {
    const size = rangeSize(TOY_RANGE);
    const frames = pileup({ reuse: false, every: 1 });
    const ref = reference(PILEUP_CONNECTIONS, PILEUP_RATE, size);
    for (const f of frames.filter((x) => x.attempted > 0 && x.t <= PILEUP_CONNECTIONS / PILEUP_RATE)) {
      expect(f.ok).toBe(ref[f.attempted - 1].ok);
      expect(f.failed).toBe(ref[f.attempted - 1].failed);
      // Free ports are exactly the range minus what TIME_WAIT holds.
      expect(f.ports.filter((p) => p === 'free').length).toBe(size - f.timeWait);
    }
    const end = frames.find((f) => f.attempted === PILEUP_CONNECTIONS && f.t === PILEUP_CONNECTIONS / PILEUP_RATE)!;
    expect(end.ok).toBe(size);
    expect(end.failed).toBe(PILEUP_CONNECTIONS - size);
    expect(frames.find((f) => f.firstFailure)!.attempted).toBe(size + 1);
  });

  it('a mixed run with expiries still matches the reference', () => {
    const size = 50;
    const frames = pileup({ reuse: false, every: 1, connections: 400, rate: 2, range: { lo: 50000, hi: 50000 + size - 1 } });
    const ref = reference(400, 2, size);
    for (const f of frames.filter((x) => x.attempted > 0 && x.t <= 200)) expect(f).toMatchObject(ref[f.attempted - 1]);
    expect(ref.at(-1)!.failed).toBeGreaterThan(0);
  });

  it('keep-alive uses one port and never fails', () => {
    const frames = pileup({ reuse: true });
    for (const f of frames) {
      expect(f.failed).toBe(0);
      expect(f.ports.filter((p) => p !== 'free').length).toBeLessThanOrEqual(1);
    }
    expect(frames.at(-2)!.timeWait).toBe(1);
  });

  it('every TIME_WAIT is over in the final frame', () => {
    for (const reuse of [false, true]) expect(pileup({ reuse }).at(-1)!.timeWait).toBe(0);
  });

  it('the sustainable connection rate is range ÷ TIME_WAIT', () => {
    expect(sustainableRate(LINUX_EPHEMERAL)).toBeCloseTo(28232 / 60, 9);
    expect(Math.floor(sustainableRate(LINUX_EPHEMERAL))).toBe(470);
    expect(Math.floor(sustainableRate(IANA_EPHEMERAL))).toBe(273);
  });
});
