import { describe, expect, it } from 'vitest';
import { createCluster, type ClusterConfig, type DistNode, type Message } from './cluster';
import type { TraceRow } from './trace';

/** K4-1 (distSim v2): every option is additive and default-off; the Tier 3 tests in cluster.test.ts pin the unset behaviour. */

type Note = { type: 'note'; n: number };
type State = { got: number[] };

/** Sends `count` numbered notes to `target`, one every `everyMs` of local time; records what it receives. */
function talker(target: string | null, count: number, everyMs: number): DistNode<Note, State> {
  const got: number[] = [];
  let sent = 0;
  const tick = (ctx: Parameters<DistNode<Note, State>['init']>[0]) => {
    if (target === null || sent >= count) return;
    ctx.send(target, { type: 'note', n: sent++ });
    ctx.setTimer('tick', everyMs);
  };
  return { init: tick, onTimer: tick, onMessage: (_c, m) => void got.push(m.payload.n), snapshot: () => ({ got: [...got] }) };
}

const pair = (seed: number, extra: Partial<ClusterConfig<Note, State>> = {}, count = 20, everyMs = 2) =>
  createCluster<Note, State>({ seed, nodes: { a: talker('b', count, everyMs), b: talker(null, 0, 0) }, latency: { min: 1, max: 30 }, ...extra });

const delivered = (rows: readonly TraceRow<Note>[], to: string) => rows.filter((r) => r.kind === 'deliver' && r.to === to).map((r) => r.payload!.n);
const drops = (rows: readonly TraceRow<Note>[]) => rows.filter((r) => r.kind === 'drop');

describe('fifo', () => {
  const orderViolated = (seed: number, fifo: boolean) => {
    const c = pair(seed, { fifo });
    c.run();
    const order = delivered(c.trace, 'b');
    return { order, inOrder: order.every((n, i) => i === 0 || n > order[i - 1]), count: order.length };
  };

  it('with fifo, arrival order equals send order on every one of 500 seeds (random latency)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const r = orderViolated(seed, true);
      expect(r.count).toBe(20);
      expect(r.inOrder).toBe(true);
    }
  });

  it('without fifo, the same latencies reorder at least one of the 500 seeds', () => {
    const swapped = Array.from({ length: 500 }, (_, seed) => orderViolated(seed, false)).filter((r) => !r.inOrder);
    expect(swapped.length).toBeGreaterThan(0);
  });

  it('is per link: another sender is not held behind this one', () => {
    const c = createCluster<Note, State>({
      seed: 3,
      nodes: { a: talker('c', 10, 1), b: talker('c', 10, 1), c: talker(null, 0, 0) },
      latency: (_rnd, from) => (from === 'a' ? 100 : 1),
      fifo: true,
    });
    c.run();
    const rows = c.trace.filter((r) => r.kind === 'deliver');
    expect(rows[0].from).toBe('b');
    expect(rows.filter((r) => r.from === 'b')).toHaveLength(10);
  });

  it('a lost message does not hold up the ones behind it', () => {
    const c = pair(1, { fifo: true, loss: (m) => (m.payload.n === 0 ? 1 : 0), latency: { min: 50, max: 50 } }, 3, 1);
    c.run();
    expect(delivered(c.trace, 'b')).toEqual([1, 2]);
    expect(c.trace.find((r) => r.kind === 'deliver')?.t).toBe(51);
  });
});

describe('loss as a function', () => {
  const sendTimes = (c: ReturnType<typeof pair>) => new Map(c.trace.filter((r) => r.kind === 'deliver').map((r) => [r.payload!.n, r.t]));

  it('drops exactly the messages the rule picks, and the rest arrive', () => {
    const c = pair(5, { loss: (m) => (m.payload.n % 3 === 0 ? 1 : 0) });
    c.run();
    expect(drops(c.trace).map((r) => r.payload!.n)).toEqual([0, 3, 6, 9, 12, 15, 18]);
    expect(drops(c.trace).every((r) => r.reason === 'loss')).toBe(true);
    expect(delivered(c.trace, 'b').sort((x, y) => x - y)).toEqual([1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19]);
  });

  it('receives the send time, so a loss window can be written as a rule', () => {
    const c = pair(5, { loss: (_m, now) => (now >= 10 && now < 20 ? 1 : 0) });
    c.run();
    // sends happen at t = 0, 2, 4, ...: the five sends at 10, 12, 14, 16, 18 are lost
    expect(drops(c.trace).map((r) => r.payload!.n)).toEqual([5, 6, 7, 8, 9]);
  });

  it('is drawn once per send, so a loss rule never shifts another message latency', () => {
    const base = pair(11);
    base.run();
    const lossy = pair(11, { loss: (m) => (m.payload.n % 2 === 0 ? 1 : 0) });
    lossy.run();
    const [a, b] = [sendTimes(base), sendTimes(lossy)];
    expect(b.size).toBe(10);
    for (const [n, t] of b) expect(a.get(n)).toBe(t);
  });

  it('a constant number behaves exactly as before', () => {
    const [x, y] = [pair(9, { loss: 0.3 }), pair(9, { loss: () => 0.3 })];
    x.run();
    y.run();
    expect(y.trace).toEqual(x.trace);
  });
});

describe('dropWhere', () => {
  it('drops every matching message sent inside the window, and only those', () => {
    const c = pair(2);
    c.dropWhere((m) => m.payload.n % 2 === 1, 10, 20);
    c.run();
    // sends at 0, 2, ...: n sent at 2n. Window [10, 20) holds n = 5..9; the odd ones are dropped
    expect(drops(c.trace).map((r) => [r.payload!.n, r.reason])).toEqual([[5, 'dropWhere'], [7, 'dropWhere'], [9, 'dropWhere']]);
    expect(delivered(c.trace, 'b')).toHaveLength(17);
  });

  it('unlike dropNext it keeps firing', () => {
    const c = pair(2);
    c.dropNext((m) => m.payload.n >= 0);
    c.run();
    expect(drops(c.trace)).toHaveLength(1);
    const w = pair(2);
    w.dropWhere(() => true, 0, 1000);
    w.run();
    expect(drops(w.trace)).toHaveLength(20);
  });
});

describe('one-way partition', () => {
  const both = (oneWay: boolean) => {
    const c = createCluster<Note, State>({
      seed: 4,
      nodes: { a: talker('b', 10, 5), b: talker('a', 10, 5) },
      latency: { min: 1, max: 3 },
    });
    c.partition('a', 'b', 0, 1000, { oneWay });
    c.run();
    return c.trace.filter((r) => r.kind === 'drop' && r.reason === 'partition');
  };

  it('drops only the crossing direction (a to b), and b keeps reaching a', () => {
    const rows = both(true);
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.from === 'a' && r.to === 'b')).toBe(true);
  });

  it('the two-way cut still drops both directions', () => {
    const rows = both(false);
    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((r) => r.from))).toEqual(new Set(['a', 'b']));
  });

  it('is marked one-way in the partition and heal rows', () => {
    const c = pair(1);
    c.partition('a', 'b', 5, 10, { oneWay: true });
    c.run();
    expect(c.trace.filter((r) => r.kind === 'partition' || r.kind === 'heal').map((r) => r.detail)).toEqual(['one-way', 'one-way']);
  });
});

describe('inject', () => {
  const idle = (extra: Partial<ClusterConfig<Note, State>> = {}) =>
    createCluster<Note, State>({ seed: 8, nodes: { a: talker(null, 0, 0), b: talker(null, 0, 0) }, latency: { min: 2, max: 2 }, ...extra });
  const note: Note = { type: 'note', n: 7 };
  const seen = (c: ReturnType<typeof idle>, to: string) => c.trace.filter((r) => r.kind === 'deliver' && r.to === to);

  it('a network inject (from a node) is dropped by a partition; an unconstrained inject is not', () => {
    const c = idle();
    c.partition('a', 'b', 0, 100);
    c.inject(10, 'b', note, { from: 'a' });
    c.inject(10, 'b', note, 'client');
    c.inject(10, 'b', note);
    c.run();
    expect(drops(c.trace as TraceRow<Note>[]).filter((r) => r.reason === 'partition')).toHaveLength(1);
    expect(seen(c, 'b').map((r) => r.from)).toEqual(['client', 'client']);
  });

  it('a network inject takes network latency and is a send by that node', () => {
    const c = idle();
    c.inject(10, 'b', note, { from: 'a' });
    c.run();
    expect(c.trace.map((r) => [r.kind, r.t, r.from])).toEqual([['send', 10, 'a'], ['deliver', 12, 'a']]);
  });

  it('a network inject obeys loss rules and dropWhere', () => {
    const c = idle({ loss: (m) => (m.payload.n === 7 ? 1 : 0) });
    c.inject(10, 'b', note, { from: 'a' });
    c.inject(10, 'b', { type: 'note', n: 8 }, { from: 'a' });
    c.run();
    expect(delivered(c.trace as TraceRow<Note>[], 'b')).toEqual([8]);
  });

  it('a network inject needs a node as its sender', () => {
    expect(() => idle().inject(1, 'b', note, { from: 'nobody' })).toThrow(RangeError);
  });

  it('a legacy inject to a crashed node is dropped; a durable one is delivered at restart', () => {
    const run = (durable: boolean) => {
      const c = idle();
      c.crash('b', 5);
      c.restart('b', 50);
      c.inject(10, 'b', note, durable ? { durable: true } : 'client');
      c.run();
      return c;
    };
    const dropped = run(false);
    expect(drops(dropped.trace as TraceRow<Note>[]).map((r) => r.reason)).toEqual(['down']);
    expect(seen(dropped, 'b')).toHaveLength(0);
    const kept = run(true);
    expect(drops(kept.trace as TraceRow<Note>[])).toHaveLength(0);
    const rows = kept.trace.filter((r) => r.kind === 'deliver' || r.kind === 'restart');
    expect(rows.map((r) => [r.kind, r.t])).toEqual([['restart', 50], ['deliver', 50]]);
    expect(kept.snapshot().inFlight).toBe(0);
  });

  it('a durable input to an up node is an ordinary delivery', () => {
    const c = idle();
    c.inject(10, 'b', note, { durable: true });
    c.run();
    expect(seen(c, 'b').map((r) => r.t)).toEqual([10]);
  });
});

describe('Message type is exported for loss rules', () => {
  it('a rule can read the payload, endpoints and id', () => {
    const rule = (m: Message<Note>) => (m.from === 'a' && m.to === 'b' && m.id >= 0 ? 0 : 1);
    const c = pair(1, { loss: rule }, 2);
    c.run();
    expect(delivered(c.trace, 'b')).toEqual([0, 1]);
  });
});
