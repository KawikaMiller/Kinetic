import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  ALL_ON, CONDITION_KEYS, PRESETS, findCycle, lockOrder, ragCycle, ragEdges, run, stuckThreads, verdictOf,
  type Conditions, type DlState, type PresetId, type RunOptions,
} from './model';

const SEEDS = 500;
const IDS = Object.keys(PRESETS) as PresetId[];
const turns: RunOptions['schedule'] = { kind: 'turns' };
const random = (seed: number): RunOptions['schedule'] => ({ kind: 'random', seed });
const without = (k: (typeof CONDITION_KEYS)[number]): Conditions => ({ ...ALL_ON, [k]: false });

/** Independent reference: a directed cycle exists iff some node reaches itself (transitive closure). */
function hasCycleBrute(n: number, edges: [number, number][]): boolean {
  const r = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  for (const [a, b] of edges) r[a][b] = true;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r[i][k] && r[k][j]) r[i][j] = true;
  return r.some((row, i) => row[i]);
}

describe('findCycle', () => {
  it('agrees with a transitive-closure brute force on 3,000 random digraphs, and returns real cycles', () => {
    const rnd = mulberry32(42);
    for (let g = 0; g < 3000; g++) {
      const n = 2 + Math.floor(rnd() * 5);
      const edges: [number, number][] = [];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b && rnd() < 0.25) edges.push([a, b]);
      const names = Array.from({ length: n }, (_, i) => `n${i}`);
      const cycle = findCycle(names, edges.map(([a, b]) => ({ from: names[a], to: names[b] })));
      expect(cycle !== null).toBe(hasCycleBrute(n, edges));
      if (cycle) {
        for (let i = 0; i < cycle.length; i++) {
          const [a, b] = [names.indexOf(cycle[i]), names.indexOf(cycle[(i + 1) % cycle.length])];
          expect(edges.some(([x, y]) => x === a && y === b)).toBe(true);
        }
      }
    }
  });
});

const everyState = (states: DlState[], f: (s: DlState) => void) => states.forEach(f);

describe('all four conditions on', () => {
  it('deadlocks every non-database preset under turn-taking, with every thread in the cycle', () => {
    for (const id of ['two', 'dining', 'transfer'] as const) {
      const states = run(PRESETS[id], { conditions: ALL_ON, schedule: turns, backoff: 'fixed' });
      expect(verdictOf(states)).toBe('deadlock');
      const last = states.at(-1)!;
      const note = last.note;
      expect(note.kind).toBe('deadlock');
      if (note.kind === 'deadlock') for (const t of PRESETS[id].threads) expect(note.cycle).toContain(t.id);
      expect(stuckThreads(last).sort()).toEqual(PRESETS[id].threads.map((t) => t.id).sort());
    }
  });

  it('deadlocks the dining philosophers with each holding the left fork', () => {
    const last = run(PRESETS.dining, { conditions: ALL_ON, schedule: turns, backoff: 'fixed' }).at(-1)!;
    last.threads.forEach((t, i) => {
      expect(t.holds).toEqual([`F${i + 1}`]);
      expect(t.wants).toEqual([`F${((i + 1) % 5) + 1}`]);
    });
  });

  it('is a timing fluke only in the sense that some orders slip through: some random seeds deadlock, some finish', () => {
    for (const id of ['two', 'dining', 'transfer'] as const) {
      const verdicts = Array.from({ length: SEEDS }, (_, s) => verdictOf(run(PRESETS[id], { conditions: ALL_ON, schedule: random(s), backoff: 'fixed' })));
      expect(verdicts).toContain('deadlock');
      expect(verdicts).toContain('finished');
      expect(verdicts.every((v) => v === 'deadlock' || v === 'finished')).toBe(true);
    }
  });

  it('a cycle in the graph means stuck threads, checked by graph reduction on every state of 500 seeds', () => {
    for (const id of IDS)
      for (let seed = 0; seed < SEEDS; seed++)
        everyState(run(PRESETS[id], { conditions: ALL_ON, schedule: random(seed), backoff: 'fixed' }), (s) => {
          expect(ragCycle(PRESETS[id], s) !== null).toBe(stuckThreads(s).length > 0);
        });
  });
});

describe('breaking one condition', () => {
  for (const key of CONDITION_KEYS)
    it(`with ${key} off, no seeded interleaving deadlocks (500 seeds × every preset)`, () => {
      for (const id of IDS)
        for (let seed = 0; seed < SEEDS; seed++) {
          const states = run(PRESETS[id], { conditions: without(key), schedule: random(seed), backoff: 'random' });
          expect(verdictOf(states)).toBe('finished');
          // tryLock lets a wait cycle form for a moment (then breaks it); the other three never let one form.
          if (key !== 'noPreemption') everyState(states, (s) => expect(ragCycle(PRESETS[id], s)).toBeNull());
        }
    });

  it('with each condition off, turn-taking finishes too (tryLock: 500 random back-off seeds)', () => {
    for (const key of CONDITION_KEYS)
      for (const id of IDS)
        for (let seed = 0; seed < (key === 'noPreemption' ? SEEDS : 1); seed++)
          expect(verdictOf(run(PRESETS[id], { conditions: without(key), schedule: turns, backoff: 'random', backoffSeed: seed }))).toBe('finished');
  });

  it('with hold-and-wait off, no thread ever holds one lock while waiting for another', () => {
    for (const id of IDS)
      for (let seed = 0; seed < SEEDS; seed++)
        everyState(run(PRESETS[id], { conditions: without('holdAndWait'), schedule: random(seed), backoff: 'fixed' }), (s) => {
          for (const t of s.threads) expect(t.holds.length > 0 && t.wants.length > 0).toBe(false);
        });
  });

  it('with mutual exclusion off, a resource really is shared by two threads at once in some run', () => {
    const shared = Array.from({ length: SEEDS }, (_, seed) => run(PRESETS.two, { conditions: without('mutualExclusion'), schedule: random(seed), backoff: 'fixed' }))
      .some((states) => states.some((s) => Object.values(s.holders).some((h) => h.length > 1)));
    expect(shared).toBe(true);
  });

  it('with circular wait off, every thread takes its locks in the global order', () => {
    for (const id of IDS)
      for (const t of PRESETS[id].threads) {
        const order = lockOrder(PRESETS[id], t, without('circularWait'));
        const ranks = order.map((r) => PRESETS[id].resources.indexOf(r));
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      }
    expect(lockOrder(PRESETS.dining, PRESETS.dining.threads[4], without('circularWait'))).toEqual(['F1', 'F5']);
  });
});

describe('tryLock and livelock', () => {
  it('turn-taking with a fixed retry delay livelocks: the exact state repeats and nobody finishes', () => {
    for (const id of ['two', 'dining', 'transfer'] as const) {
      const states = run(PRESETS[id], { conditions: without('noPreemption'), schedule: turns, backoff: 'fixed' });
      expect(verdictOf(states)).toBe('livelock');
      const note = states.at(-1)!.note;
      if (note.kind !== 'livelock') throw new Error('expected livelock');
      const [a, b] = [states[note.since], states.at(-2)!];
      expect(a.threads.map((t) => [t.pc, t.holds, t.status])).toEqual(b.threads.map((t) => [t.pc, t.holds, t.status]));
      expect(states.every((s) => s.threads.every((t) => t.status !== 'done'))).toBe(true);
      // Busy, not stuck: every thread acts inside the repeating loop.
      const acted = new Set(states.slice(note.since).map((s) => s.active));
      for (const t of PRESETS[id].threads) expect(acted).toContain(t.id);
    }
  });

  it('a transient wait cycle forms under tryLock and is broken by a release', () => {
    const states = run(PRESETS.two, { conditions: without('noPreemption'), schedule: turns, backoff: 'random' });
    const i = states.findIndex((s) => ragCycle(PRESETS.two, s) !== null);
    expect(i).toBeGreaterThan(0);
    expect(states.slice(i).some((s) => s.note.kind === 'release' && s.note.reason === 'backoff')).toBe(true);
    expect(verdictOf(states)).toBe('finished');
  });
});

describe('database detector', () => {
  it('turn-taking: finds the cycle, aborts the transaction with the latest start (T2), and both commit', () => {
    const states = run(PRESETS.database, { conditions: ALL_ON, schedule: turns, backoff: 'fixed' });
    const aborts = states.filter((s) => s.note.kind === 'abort');
    expect(aborts).toHaveLength(1);
    expect(aborts[0].victim).toBe('T2');
    expect(verdictOf(states)).toBe('finished');
    expect(states.at(-1)!.log.map((l) => l.text)).toContain('ERROR: deadlock detected');
  });

  it('every victim across 500 seeds is the latest-starting transaction in its cycle', () => {
    let aborts = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      const states = run(PRESETS.database, { conditions: ALL_ON, schedule: random(seed), backoff: 'fixed' });
      expect(verdictOf(states)).toBe('finished');
      states.forEach((s, i) => {
        if (s.note.kind !== 'abort') return;
        aborts++;
        const before = states[i - 1];
        const ages = before.threads.filter((t) => s.note.kind === 'abort' && s.note.cycle.includes(t.id)).map((t) => t.startedAt);
        expect(before.threads.find((t) => t.id === s.victim)!.startedAt).toBe(Math.max(...ages));
      });
    }
    expect(aborts).toBeGreaterThan(0);
  });
});

describe('graph edges', () => {
  it('draws request edges thread → resource and assignment edges resource → thread', () => {
    const states = run(PRESETS.two, { conditions: ALL_ON, schedule: turns, backoff: 'fixed' });
    const edges = ragEdges(states.at(-1)!);
    expect(edges).toEqual(expect.arrayContaining([
      { from: 'A', to: 'T1', kind: 'assign' }, { from: 'B', to: 'T2', kind: 'assign' },
      { from: 'T1', to: 'B', kind: 'request' }, { from: 'T2', to: 'A', kind: 'request' },
    ]));
    expect(edges).toHaveLength(4);
  });
});
