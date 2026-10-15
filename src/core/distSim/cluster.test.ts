import { describe, expect, it } from 'vitest';
import { createCluster, type DistNode, type NodeCtx } from './cluster';
import type { TraceRow } from './trace';

type Ping = { type: 'ping'; n: number } | { type: 'pong'; n: number };

/** A pinger sends `count` pings to `target`, one per 10 local ms; everyone answers a ping with a pong. */
function pinger(target: string, count: number): DistNode<Ping, { got: number[] }> {
  const got: number[] = [];
  let sent = 0;
  const tick = (ctx: NodeCtx<Ping>) => {
    ctx.send(target, { type: 'ping', n: sent++ });
    if (sent < count) ctx.setTimer('tick', 10);
  };
  return {
    init: (ctx) => tick(ctx),
    onTimer: (ctx) => tick(ctx),
    onMessage: (ctx, msg) => {
      if (msg.payload.type === 'ping') ctx.send(msg.from, { type: 'pong', n: msg.payload.n });
      else got.push(msg.payload.n);
    },
    snapshot: () => ({ got: [...got] }),
  };
}

const responder = (): DistNode<Ping, { got: number[] }> => ({
  init: () => {},
  onTimer: () => {},
  onMessage: (ctx, msg) => {
    if (msg.payload.type === 'ping') ctx.send(msg.from, { type: 'pong', n: msg.payload.n });
  },
});

const pair = (seed: number, extra: Partial<Parameters<typeof createCluster<Ping, { got: number[] }>>[0]> = {}) =>
  createCluster<Ping, { got: number[] }>({ seed, nodes: { a: pinger('b', 20), b: responder() }, ...extra });

const rows = (c: { trace: readonly TraceRow<Ping>[] }, kind: TraceRow['kind']) => c.trace.filter((r) => r.kind === kind);

describe('determinism', () => {
  it('same seed and faults give the same trace, row for row', () => {
    const make = (seed: number) => {
      const c = pair(seed, { loss: 0.2, duplicate: 0.2 });
      c.randomFaults({ horizonMs: 200, partitions: 1, crashes: 1, pauses: 1 });
      c.run();
      return c.trace;
    };
    expect(make(3)).toEqual(make(3));
    expect(make(4)).not.toEqual(make(3));
  });

  it('trace rows carry a unique, stable id equal to their position, and time never goes backwards', () => {
    const c = pair(1, { duplicate: 0.3 });
    c.run();
    c.trace.forEach((r, i) => expect(r.id).toBe(i));
    for (let i = 1; i < c.trace.length; i++) expect(c.trace[i].t).toBeGreaterThanOrEqual(c.trace[i - 1].t);
  });

  it('changing loss does not change the latency of the messages that survive', () => {
    const lat = (seed: number, loss: number) => {
      const c = pair(seed, { loss });
      c.run();
      const sentAt = new Map(rows(c, 'send').map((r) => [r.msgId, r.t]));
      return new Map(rows(c, 'deliver').map((r) => [r.msgId, r.t - sentAt.get(r.msgId)!]));
    };
    // Message 0 is the first thing sent: on a seed where loss spares it, its journey is the same with or without loss.
    const seedsWhereSpared = [9, 10, 11, 12, 13].filter((seed) => lat(seed, 0.3).has(0));
    expect(seedsWhereSpared.length).toBeGreaterThan(0);
    for (const seed of seedsWhereSpared) expect(lat(seed, 0.3).get(0)).toBe(lat(seed, 0).get(0));
    expect(lat(9, 0.3).size).toBeLessThan(lat(9, 0).size);
  });
});

describe('network faults', () => {
  it('delivers everything with no faults, and latency stays inside the range', () => {
    const c = pair(2, { latency: { min: 3, max: 7 } });
    c.run();
    expect(rows(c, 'send').length).toBe(rows(c, 'deliver').length);
    const sentAt = new Map(rows(c, 'send').map((r) => [r.msgId, r.t]));
    for (const d of rows(c, 'deliver')) {
      const ms = d.t - sentAt.get(d.msgId)!;
      expect(ms).toBeGreaterThanOrEqual(3);
      expect(ms).toBeLessThanOrEqual(7);
    }
  });

  it('a partition drops exactly the crossing messages that were in flight during it', () => {
    const c = createCluster<Ping, { got: number[] }>({
      seed: 5,
      latency: { min: 4, max: 4 },
      nodes: { a: pinger('b', 30), b: responder(), c: pinger('a', 0) },
    });
    c.partition('a', 'b', 50, 120);
    c.run();
    const send = new Map(rows(c, 'send').map((r) => [r.msgId, r]));
    const dropped = new Set(rows(c, 'drop').map((r) => r.msgId));
    for (const s of send.values()) {
      const crossing = (s.from === 'a' && s.to === 'b') || (s.from === 'b' && s.to === 'a');
      const arrives = s.t + 4;
      const inFlightDuringCut = s.t < 120 && arrives >= 50;
      expect(dropped.has(s.msgId), `${s.from}->${s.to} sent ${s.t}`).toBe(crossing && inFlightDuringCut);
    }
    expect(dropped.size).toBeGreaterThan(0);
    expect(rows(c, 'drop').every((r) => r.reason === 'partition')).toBe(true);
    expect(rows(c, 'partition')[0]).toMatchObject({ t: 50, from: 'a', to: 'b' });
    expect(rows(c, 'heal')[0].t).toBe(120);
  });

  it('a partition leaves traffic inside a group alone', () => {
    const c = createCluster<Ping, { got: number[] }>({
      seed: 6,
      latency: { min: 2, max: 2 },
      nodes: { a: pinger('b', 10), b: responder(), c: responder() },
    });
    c.partition(['a', 'b'], 'c', 0, 1000);
    c.run();
    expect(rows(c, 'drop')).toHaveLength(0);
    expect(rows(c, 'deliver')).toHaveLength(rows(c, 'send').length);
  });

  it('loss drops about the configured share, and each drop says why', () => {
    const c = createCluster<Ping, { got: number[] }>({ seed: 8, loss: 0.3, nodes: { a: pinger('b', 400), b: responder() } });
    c.run();
    const share = rows(c, 'drop').length / rows(c, 'send').length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
    expect(rows(c, 'drop').every((r) => r.reason === 'loss')).toBe(true);
  });

  it('duplication delivers some messages twice, flagged as duplicates, sharing the msgId', () => {
    const c = pair(11, { duplicate: 0.5 });
    c.run();
    const dups = rows(c, 'deliver').filter((r) => r.dup);
    expect(dups.length).toBeGreaterThan(0);
    for (const d of dups) expect(rows(c, 'deliver').filter((r) => r.msgId === d.msgId)).toHaveLength(2);
  });

  it('dropNext drops one matching message only', () => {
    const c = pair(12);
    c.dropNext((m) => m.payload.type === 'ping' && m.payload.n >= 3);
    c.run();
    const drops = rows(c, 'drop');
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ reason: 'dropNext', payload: { type: 'ping', n: 3 } });
  });

  it('latency may depend on the link, so paths can be asymmetric', () => {
    const c = createCluster<Ping, { got: number[] }>({
      seed: 13,
      latency: (_rnd, from, to) => (from === 'a' && to === 'b' ? 40 : 2),
      nodes: { a: pinger('b', 5), b: responder() },
    });
    c.run();
    const sentAt = new Map(rows(c, 'send').map((r) => [r.msgId, r]));
    for (const d of rows(c, 'deliver')) {
      const s = sentAt.get(d.msgId)!;
      expect(d.t - s.t).toBe(s.from === 'a' ? 40 : 2);
    }
  });

  it('a latency function can use the network stream and stays deterministic', () => {
    const run = () => {
      const c = pair(14, { latency: (rnd) => 5 + rnd() * 5 });
      c.run();
      return c.trace;
    };
    expect(run()).toEqual(run());
  });
});

describe('clocks', () => {
  it('skewed clocks differ from true time; perfect ones match', () => {
    const seen: Record<string, number> = {};
    const timed = (name: string): DistNode<Ping, { got: number[] }> => ({
      init: (ctx) => ctx.setTimer('t', 1000),
      onTimer: (ctx) => {
        seen[name] = ctx.now();
      },
      onMessage: () => {},
    });
    const c = createCluster<Ping, { got: number[] }>({
      seed: 1,
      nodes: { a: timed('a'), b: timed('b'), c: timed('c') },
      clocks: [{ offsetMs: 250 }, { driftPpm: 1000 }],
    });
    c.run();
    expect(seen.c).toBe(1000);
    expect(seen.a).toBe(1000 + 250);
    expect(seen.b).toBeCloseTo(1000, 6);
    // b's clock runs 0.1% fast, so a timer of 1000 local ms fires at true time 1000/1.001, when its clock reads 1000.
    expect(c.trace.find((r) => r.kind === 'timer' && r.node === 'b')!.t).toBeCloseTo(1000 / 1.001, 6);
    expect(c.localTime('a', 100)).toBe(350);
    expect(c.localTime('b', 1000)).toBeCloseTo(1001, 9);
    expect(c.localTime('c', 77)).toBe(77);
  });
});

describe('crash and restart', () => {
  it('a crashed node handles nothing, loses its timers, and init runs again on restart', () => {
    let inits = 0;
    let ticks = 0;
    const c = createCluster<Ping, { got: number[] }>({
      seed: 2,
      latency: { min: 1, max: 1 },
      nodes: {
        a: pinger('b', 40),
        b: {
          init: (ctx) => {
            inits++;
            ctx.setTimer('t', 20);
          },
          onTimer: (ctx) => {
            ticks++;
            ctx.setTimer('t', 20);
          },
          onMessage: () => {},
        },
      },
    });
    c.crash('b', 100);
    c.restart('b', 300);
    c.run({ until: 250 });
    const ticksBefore = ticks;
    expect(ticksBefore).toBe(4);
    expect(rows(c, 'drop').every((r) => r.reason === 'down' && r.to === 'b')).toBe(true);
    expect(rows(c, 'drop').length).toBeGreaterThan(0);
    c.run({ until: 400 });
    expect(inits).toBe(2);
    expect(ticks).toBeGreaterThan(ticksBefore);
    expect(rows(c, 'crash')[0].t).toBe(100);
    expect(rows(c, 'restart')[0].t).toBe(300);
  });
});

describe('pause', () => {
  it('a paused node neither handles messages nor timers, then resumes with them in order', () => {
    const handled: [number, string][] = [];
    const c = createCluster<Ping, { got: number[] }>({
      seed: 3,
      latency: { min: 5, max: 5 },
      nodes: {
        a: pinger('b', 10),
        b: {
          init: (ctx) => ctx.setTimer('t', 55),
          onTimer: (ctx, id) => handled.push([ctx.trueNow, `timer ${id}`]),
          onMessage: (ctx, msg) => {
            handled.push([ctx.trueNow, msg.payload.type === 'ping' ? `ping ${msg.payload.n}` : 'pong']);
            ctx.send(msg.from, { type: 'pong', n: 0 });
          },
        },
      },
    });
    c.pause('b', 20, 100);
    c.run();
    expect(handled.filter(([t]) => t >= 20 && t < 100)).toEqual([]);
    const resumed = handled.filter(([t]) => t === 100).map(([, what]) => what);
    // pings are sent at 0, 10, 20, ... and arrive 5 later: ping 1 (at 15) is handled before the pause,
    // pings 2 to 9 (arriving 25 to 95) and the 55 ms timer are held and run in arrival order at 100.
    expect(handled.some(([t, what]) => t === 15 && what === 'ping 1')).toBe(true);
    expect(resumed[0]).toBe('ping 2');
    expect(resumed).toContain('timer t');
    // no replies from b between the pause start and end
    const bSends = rows(c, 'send').filter((r) => r.from === 'b').map((r) => r.t);
    expect(bSends.filter((t) => t >= 20 && t < 100)).toEqual([]);
    expect(rows(c, 'pause')[0]).toMatchObject({ node: 'b', t: 20 });
    expect(rows(c, 'resume')[0]).toMatchObject({ node: 'b', t: 100 });
  });

  it('the held timer fires late, and the node clock kept running across the pause', () => {
    const seen: number[] = [];
    const c = createCluster<Ping, { got: number[] }>({
      seed: 4,
      nodes: {
        a: {
          init: (ctx) => ctx.setTimer('t', 30),
          onTimer: (ctx) => seen.push(ctx.now()),
          onMessage: () => {},
        },
      },
    });
    c.pause('a', 10, 200);
    c.run();
    expect(seen).toEqual([200]);
  });

  it('snapshot says who is paused or down', () => {
    const c = createCluster<Ping, { got: number[] }>({ seed: 5, nodes: { a: responder(), b: responder() } });
    c.pause('a', 10, 50);
    c.crash('b', 20);
    c.inject(30, 'a', { type: 'ping', n: 0 });
    c.run({ until: 30 });
    const snap = c.snapshot();
    expect(snap.nodes.a.paused).toBe(true);
    expect(snap.nodes.b.up).toBe(false);
    expect(snap.inFlight).toBe(1);
  });
});

describe('inject and snapshot', () => {
  it('delivers an outside request at its time, bypassing network faults', () => {
    const forwarder: DistNode<Ping, { got: number[] }> = { ...responder(), onMessage: (ctx, msg) => ctx.send('b', msg.payload) };
    const c = createCluster<Ping, { got: number[] }>({ seed: 1, loss: 1, nodes: { a: forwarder, b: responder() } });
    c.inject(15, 'a', { type: 'ping', n: 7 }, 'client');
    c.run();
    expect(rows(c, 'deliver')[0]).toMatchObject({ t: 15, from: 'client', to: 'a' });
    // Total loss eats what a forwards to b, but not the outside request that reached a.
    expect(rows(c, 'drop')[0]).toMatchObject({ reason: 'loss', from: 'a', to: 'b' });
    expect(rows(c, 'deliver')).toHaveLength(1);
  });

  it('exposes node state through snapshot()', () => {
    const c = pair(2);
    c.run();
    expect(c.snapshot().nodes.a.state!.got).toHaveLength(20);
    expect(c.snapshot().nodes.b.state).toBeUndefined();
  });

  it('refuses a message to an unknown node', () => {
    const c = createCluster<Ping, { got: number[] }>({ seed: 1, nodes: { a: pinger('nobody', 1) } });
    expect(() => c.run()).toThrow(/unknown node/);
  });
});
