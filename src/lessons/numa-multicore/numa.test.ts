import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_SOCKETS, LINK_GBPS, LOCAL_NS, NODE_GBPS, PAGES, REMOTE_NS, THREADS, THREAD_GBPS, bandwidth, defaultMachine, firstTouch, initWrites, latency, machineError, place,
  type Machine, type Node, type Pattern, type Write,
} from './numa';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);
const bits = (n: number, len: number): Node[] => Array.from({ length: len }, (_, i) => ((n >> i) & 1) as Node);
const machine = (homes: Node[], sockets: Node[] = [...DEFAULT_SOCKETS]): Machine => ({ sockets, homes });

/** Per-access enumeration with no shortcut formula: every (thread, page) access is one event with its own latency. */
function enumerated(m: Machine, pattern: Pattern): { mean: number; remoteShare: number } {
  const used = (t: number): number[] => (pattern === 'own' ? [2 * t, 2 * t + 1] : pattern === 'all' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0]);
  let sumMean = 0;
  let sumRemote = 0;
  for (let t = 0; t < THREADS; t++) {
    let ns = 0;
    let remote = 0;
    for (const p of used(t)) {
      const isRemote = m.homes[p] !== m.sockets[t];
      ns += isRemote ? REMOTE_NS : LOCAL_NS;
      remote += isRemote ? 1 : 0;
    }
    sumMean += ns / used(t).length;
    sumRemote += remote / used(t).length;
  }
  return { mean: sumMean / THREADS, remoteShare: sumRemote / THREADS };
}

describe('mean latency', () => {
  it('equals the per-access enumeration for all 4,096 placements of 4 threads and 8 pages, in all three patterns', () => {
    let checked = 0;
    for (let s = 0; s < 16; s++) {
      for (let h = 0; h < 256; h++) {
        const m = machine(bits(h, PAGES), bits(s, THREADS));
        for (const pattern of ['own', 'all', 'hot'] as const) {
          const got = latency(m, pattern);
          const want = enumerated(m, pattern);
          near(got.mean, want.mean);
          near(got.remoteShare, want.remoteShare);
          near(got.mean, LOCAL_NS + (REMOTE_NS - LOCAL_NS) * got.remoteShare);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(2 ** 4 * 2 ** 8 * 3);
  });

  it('moving a page to the other socket of a thread that uses it never lowers that thread\'s remote share', () => {
    for (let h = 0; h < 256; h++) {
      const m = machine(bits(h, PAGES));
      const before = latency(m, 'own').perThread;
      for (let t = 0; t < THREADS; t++) {
        for (const p of [2 * t, 2 * t + 1]) {
          const moved = m.homes.map((x, i) => (i === p ? ((1 - m.sockets[t]) as Node) : x));
          expect(latency(machine(moved), 'own').perThread[t].remoteShare).toBeGreaterThanOrEqual(before[t].remoteShare);
        }
      }
    }
  });

  it('extremes: all local is 80 ns and 0%, all remote is 140 ns and 100%; one beyond (a fifth thread, a ninth page) is refused with the limit', () => {
    const local = latency(machine(Array(8).fill(0), [0, 0, 0, 0]), 'own');
    expect([local.mean, local.remoteShare, local.slowdown]).toEqual([80, 0, 1]);
    const remote = latency(machine(Array(8).fill(1), [0, 0, 0, 0]), 'own');
    expect([remote.mean, remote.remoteShare]).toEqual([140, 1]);
    expect(machineError({ sockets: [0, 0, 1, 1, 1], homes: Array(8).fill(0) })).toBe('Use at most 4 threads: that is 5.');
    expect(machineError({ sockets: [0, 0, 1, 1], homes: Array(9).fill(0) })).toBe('Use at most 8 pages: that is 9.');
    expect(() => latency({ sockets: [0, 0, 1, 1, 1], homes: Array(8).fill(0) }, 'own')).toThrow(RangeError);
    expect(machineError(defaultMachine())).toBeNull();
  });
});

describe('hand vectors', () => {
  it('default placement, own pages: 80 ns, 0% remote', () => {
    const l = latency(defaultMachine(), 'own');
    near(l.mean, 80);
    near(l.remoteShare, 0);
  });

  it('serial init under first touch puts all 8 pages on node 0: (80 + 80 + 140 + 140) / 4 = 110 ns, 50% remote, 110 / 80 = 1.375x', () => {
    const homes = place('first-touch', 'serial', DEFAULT_SOCKETS);
    expect(homes).toEqual(Array(8).fill(0));
    const l = latency(machine(homes), 'own');
    near(l.mean, 110);
    near(l.remoteShare, 0.5);
    near(l.slowdown, 1.375);
  });

  it('parallel init: everything is local, 80 ns; interleave: (80 + 140) / 2 = 110; bind to node 0, with either init: 110', () => {
    near(latency(machine(place('first-touch', 'parallel', DEFAULT_SOCKETS)), 'own').mean, 80);
    near(latency(machine(place('interleave', 'parallel', DEFAULT_SOCKETS)), 'own').mean, 110);
    for (const init of ['serial', 'parallel'] as const) near(latency(machine(place('bind0', init, DEFAULT_SOCKETS)), 'own').mean, 110);
  });

  it('only T2\'s pages moved to node 0: (80 + 80 + 140 + 80) / 4 = 95 ns; T3\'s too: 110', () => {
    const base = [...defaultMachine().homes];
    const t2 = base.map((h, p) => (p === 4 || p === 5 ? (0 as Node) : h));
    near(latency(machine(t2), 'own').mean, 95);
    expect(latency(machine(t2), 'own').perThread[2].ns).toBe(140);
    const t3 = t2.map((h, p) => (p === 6 || p === 7 ? (0 as Node) : h));
    near(latency(machine(t3), 'own').mean, 110);
  });

  it('with a quarter of a thread\'s reads remote the mean is 80 + 0.25 x 60 = 95, not the plain average 110', () => {
    expect(LOCAL_NS + 0.25 * (REMOTE_NS - LOCAL_NS)).toBe(95);
  });

  it('everyone reads everything: 110 ns however the 8 pages are placed (2 threads on each socket); one hot page: 110 on the default', () => {
    for (let h = 0; h < 256; h++) near(latency(machine(bits(h, PAGES)), 'all').mean, 110);
    near(latency(defaultMachine(), 'hot').mean, 110);
    // The identity behind it: each page is remote to exactly the two threads on the other socket, so the mean remote share is 1/2.
  });
});

describe('first touch', () => {
  it('a page lives on the socket of the first write to it, for serial and parallel init and a seeded shuffled order of writes by all four threads', () => {
    expect(firstTouch(initWrites('serial', DEFAULT_SOCKETS))).toEqual(Array(8).fill(0));
    expect(firstTouch(initWrites('parallel', DEFAULT_SOCKETS))).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    const rnd = mulberry32(2026);
    for (let run = 0; run < 100; run++) {
      const writes: Write[] = DEFAULT_SOCKETS.flatMap((socket) => Array.from({ length: PAGES }, (_, page) => ({ socket, page })));
      for (let i = writes.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [writes[i], writes[j]] = [writes[j], writes[i]]; }
      const homes = firstTouch(writes);
      homes.forEach((home, page) => expect(home).toBe(writes.find((w) => w.page === page)!.socket));
    }
  });

  it('an unwritten page or a page that does not exist is refused', () => {
    expect(() => firstTouch([{ socket: 0, page: 0 }])).toThrow('Page 1 was never written');
    expect(() => firstTouch([{ socket: 0, page: 8 }])).toThrow('at most 8 pages');
  });
});

describe('streaming bandwidth', () => {
  it('bind to node 0, all four threads: link 0 to socket 1 carries 32 against 20 (scale 0.625), node 0 sees 52 against 40; T0, T1 get 12.31 each, T2, T3 7.69; total 40.0', () => {
    const b = bandwidth(machine(Array(8).fill(0)));
    near(b.perThread[0], THREAD_GBPS * (NODE_GBPS / 52));
    near(b.perThread[1], 16 * (40 / 52));
    near(b.perThread[2], 16 * 0.625 * (40 / 52));
    near(b.perThread[3], 16 * 0.625 * (40 / 52));
    near(b.total, 40);
    near(b.linkLoad[0], 32 / LINK_GBPS);
    near(b.nodeLoad[0], 52 / NODE_GBPS);
    near(b.nodeLoad[1], 0);
  });

  it('interleaved: each thread splits 8 and 8, links carry 16 <= 20 each way, each node sees 32 <= 40: total 64.0; all local: 64.0', () => {
    const il = bandwidth(machine(place('interleave', 'parallel', DEFAULT_SOCKETS)));
    near(il.total, 64);
    near(il.linkLoad[0], 16 / 20);
    near(il.linkLoad[1], 16 / 20);
    near(il.nodeLoad[0], 32 / 40);
    near(bandwidth(defaultMachine()).total, 64);
  });

  it('delivered never exceeds demand, per thread and in total, and the total never exceeds two controllers, for every placement', () => {
    for (let s = 0; s < 16; s++) {
      for (let h = 0; h < 256; h++) {
        const b = bandwidth(machine(bits(h, PAGES), bits(s, THREADS)));
        for (const v of b.perThread) expect(v).toBeLessThanOrEqual(THREAD_GBPS + 1e-9);
        expect(b.total).toBeLessThanOrEqual(b.demand + 1e-9);
        expect(b.total).toBeLessThanOrEqual(2 * NODE_GBPS + 1e-9);
      }
    }
  });

  it('the proportional model applies the link first, then the controller: reversing the order changes the per-thread answer on the bound placement', () => {
    // Controller first: node 0 is asked for 64, scale 40 / 64 = 0.625 for everyone; then the link carries 32 x 0.625 = 20 <= 20, so no further scaling.
    const controllerFirst = [16 * 0.625, 16 * 0.625, 16 * 0.625, 16 * 0.625];
    const linkFirst = bandwidth(machine(Array(8).fill(0))).perThread;
    expect(controllerFirst.reduce((a, b) => a + b, 0)).toBeCloseTo(40, 9);
    expect(Math.abs(linkFirst[0] - controllerFirst[0])).toBeGreaterThan(1);
  });
});

describe('manipulation', () => {
  it('manipulation 1: serial init with workers on both sockets reads 110 ns against the 80 ns of parallel init', () => {
    const serial = latency(machine(place('first-touch', 'serial', DEFAULT_SOCKETS)), 'own').mean;
    const parallel = latency(machine(place('first-touch', 'parallel', DEFAULT_SOCKETS)), 'own').mean;
    expect([serial, parallel]).toEqual([110, 80]);
  });

  it('manipulation 2: "everyone reads everything" gets no policy below 110 ns, under any init', () => {
    for (const policy of ['first-touch', 'interleave', 'bind0'] as const) {
      for (const init of ['serial', 'parallel'] as const) {
        expect(latency(machine(place(policy, init, DEFAULT_SOCKETS)), 'all').mean).toBeGreaterThanOrEqual(110 - 1e-9);
      }
    }
  });
});
