import { describe, expect, it } from 'vitest';
import { MODELS, outcomes, regsKeys, type Instr, type Litmus, type Model } from '../../core/memModel';
import { mulberry32 } from '../../core/random';
import { allMoves, applyMove, blockedReason, initialState, reachableOutcomes, type MState, type Quirks } from './manual';
import {
  BASES, FACTS, LOAD_TAGS, STORE_TAGS, buildLitmus, emptyEdit, manipulationNote, outcomeText, outcomeUniverse, scCountText, scInterleavings, setFence, setTag, table, targetKey,
  targetReach, tagsFor, type Base, type BaseId, type Edit,
} from './model';

const ids: BaseId[] = ['sb', 'mp', 'dekker', 'corr'];
const keysOf = (l: Litmus, m: Model) => regsKeys(outcomes(l, m));
const sortedSet = (s: Iterable<string>) => [...s].sort();
const reachable = (b: Base, e: Edit, m: Model) => targetReach(b, e)[m].reachable;

/** Every edit of a base: a fence in each gap, a tag on each access (weak-model tags). */
function everyEdit(base: Base, withTags: boolean): Edit[] {
  let edits = [emptyEdit(base)];
  base.litmus.threads.forEach((prog, t) => prog.forEach((ins, i) => {
    const grown: Edit[] = [];
    for (const e of edits) {
      grown.push(e);
      if (i < prog.length - 1) grown.push(setFence(e, t, i, true));
    }
    edits = grown;
    if (!withTags) return;
    edits = edits.flatMap((e) => tagsFor(ins).map((tag) => setTag(e, t, i, tag)));
  }));
  return edits;
}

describe('SC: all interleavings, written separately from the explorer', () => {
  it('SB by hand: abcd (0,1), acbd (1,1), acdb (1,1), cabd (1,1), cadb (1,1), cdab (1,0); (0,0) in none', () => {
    // a: x=1  b: r0=y  c: y=1  d: r1=x  (a before b, c before d), registers (r0, r1).
    // abcd: r0=0, r1=1.  acbd: y=1 before b, x=1 before d: (1,1).  acdb: (1,1).  cabd: (1,1).  cadb: (1,1).  cdab: r1=0, r0=1: (1,0).
    const c = scInterleavings(BASES.sb.litmus);
    expect(c.interleavings).toBe(6);
    expect(c.steps).toBe(4);
    expect(Object.fromEntries(c.byOutcome)).toEqual({ 'T0.r0=0 T1.r1=0': 0, 'T0.r0=0 T1.r1=1': 1, 'T0.r0=1 T1.r1=0': 1, 'T0.r0=1 T1.r1=1': 4 });
    expect(scCountText(BASES.sb.litmus)).toBe('6 interleavings of 4 steps: (0, 0) in 0, (0, 1) in 1, (1, 0) in 1, (1, 1) in 4');
  });

  it('the explorer\'s SC outcome set equals the interleaving oracle on every edit of every base', () => {
    for (const id of ids) {
      for (const e of everyEdit(BASES[id], false)) {
        const l = buildLitmus(BASES[id], e);
        const oracle = [...scInterleavings(l).byOutcome].filter(([, n]) => n > 0).map(([k]) => k);
        expect(keysOf(l, 'sc')).toEqual(sortedSet(oracle));
      }
    }
  });
});

describe('TSO: a second store-buffer machine, and the store-swap formulation', () => {
  it('the hand-driven machine reaches exactly the explorer\'s outcomes (SC and TSO) on every edit of every base', () => {
    for (const id of ids) {
      for (const e of everyEdit(BASES[id], false)) {
        const l = buildLitmus(BASES[id], e);
        expect(sortedSet(reachableOutcomes(l, 'sc'))).toEqual(keysOf(l, 'sc'));
        expect(sortedSet(reachableOutcomes(l, 'tso'))).toEqual(keysOf(l, 'tso'));
      }
    }
  });

  /**
   * Swap oracle. Valid only in the fragment where no thread loads a location it has a pending store to
   * (all four bases are inside it; store-to-load forwarding cases are outside and not used): TSO outcomes
   * are the SC outcomes over every program in which a store may move past a later load of a DIFFERENT
   * location in its own thread; a fence blocks the move.
   */
  function swapVariants(prog: Instr[]): Instr[][] {
    const seen = new Map<string, Instr[]>([[JSON.stringify(prog), prog]]);
    const queue = [prog];
    while (queue.length) {
      const p = queue.shift()!;
      for (let j = 0; j + 1 < p.length; j++) {
        const [a, b] = [p[j], p[j + 1]];
        if (a.op === 'store' && b.op === 'load' && a.loc !== b.loc) {
          const q = [...p.slice(0, j), b, a, ...p.slice(j + 2)];
          if (!seen.has(JSON.stringify(q))) { seen.set(JSON.stringify(q), q); queue.push(q); }
        }
      }
    }
    return [...seen.values()];
  }
  const products = <T,>(lists: T[][]): T[][] => lists.reduce<T[][]>((acc, xs) => acc.flatMap((a) => xs.map((x) => [...a, x])), [[]]);

  it('TSO outcomes equal the union of SC outcomes over the store-swapped programs, on every edit of every base', () => {
    for (const id of ids) {
      for (const e of everyEdit(BASES[id], false)) {
        const l = buildLitmus(BASES[id], e);
        const union = new Set<string>();
        for (const threads of products(l.threads.map(swapVariants))) {
          for (const [k, n] of scInterleavings({ ...l, threads }).byOutcome) if (n > 0) union.add(k);
        }
        expect(keysOf(l, 'tso')).toEqual(sortedSet(union));
      }
    }
  });

  it('SB: the swaps give four programs and their union is {01, 10, 11, 00}', () => {
    expect(products(BASES.sb.litmus.threads.map(swapVariants))).toHaveLength(4);
    expect(keysOf(BASES.sb.litmus, 'tso').map(outcomeText)).toEqual(['r0 = 0, r1 = 0', 'r0 = 0, r1 = 1', 'r0 = 1, r1 = 0', 'r0 = 1, r1 = 1']);
  });

  it('MP has no store-then-load pair in a thread, so TSO equals SC', () => {
    expect(keysOf(BASES.mp.litmus, 'tso')).toEqual(keysOf(BASES.mp.litmus, 'sc'));
  });
});

describe('containment: SC is inside TSO is inside Weak (300 seeded random programs)', () => {
  it('holds without tags; every counterexample would be a model bug or a wrong claim', () => {
    const rnd = mulberry32(4204);
    const pick = (n: number) => Math.floor(rnd() * n);
    for (let n = 0; n < 300; n++) {
      const threads: Instr[][] = [0, 1].map((t) =>
        Array.from({ length: 1 + pick(3) }, (_, k): Instr => {
          const loc = ['x', 'y'][pick(2)];
          return pick(2) === 0 ? { op: 'store', loc, value: pick(3) } : { op: 'load', reg: `r${t * 3 + k}`, loc };
        }),
      );
      const l: Litmus = { name: `random ${n}`, init: {}, threads };
      const [sc, tso, weak] = MODELS.map((m) => new Set(keysOf(l, m)));
      for (const k of sc) expect(tso.has(k), `${n}: SC outcome ${k} missing from TSO`).toBe(true);
      for (const k of tso) expect(weak.has(k), `${n}: TSO outcome ${k} missing from Weak`).toBe(true);
    }
  });
});

describe('counterfactuals: a wrong machine fails the tests the right one passes', () => {
  const sbReaches00 = (q: Quirks, l: Litmus = BASES.sb.litmus) => reachableOutcomes(l, 'tso', q).has('T0.r0=0 T1.r1=0');
  it('a TSO that drains on every store (SC in disguise) cannot reach SB 0,0', () => {
    expect(sbReaches00({})).toBe(true);
    expect(sbReaches00({ eagerDrain: true })).toBe(false);
  });
  it('a machine that ignores fences keeps 0,0 with a fence in both threads; the real one does not', () => {
    const both = setFence(setFence(emptyEdit(BASES.sb), 0, 0, true), 1, 0, true);
    const l = buildLitmus(BASES.sb, both);
    expect(sbReaches00({ ignoreFences: true }, l)).toBe(true);
    expect(sbReaches00({}, l)).toBe(false);
    expect(reachable(BASES.sb, both, 'tso')).toBe(false);
  });
});

/**
 * Published expectations, typed from memory of the x86-TSO paper (Sewell et al., CACM 2010) and the ARM and
 * POWER litmus catalogues (Maranget, Sarkar, Sewell). The domain reviewer verifies each cell against a source.
 */
describe('expected outcome table (from memory, reviewer verifies each cell)', () => {
  const outcomeSet = (b: Base, e: Edit, m: Model) => table(b, e, m).rows.filter((r) => r.reachable).map((r) => r.label);
  const fenceBoth = (b: Base) => setFence(setFence(emptyEdit(b), 0, 0, true), 1, 0, true);

  it('SB: SC {01, 10, 11}; x86-style adds 00; a full fence in both threads forbids 00 in every model', () => {
    expect(outcomeSet(BASES.sb, emptyEdit(BASES.sb), 'sc')).toEqual(['r0 = 0, r1 = 1', 'r0 = 1, r1 = 0', 'r0 = 1, r1 = 1']);
    expect(outcomeSet(BASES.sb, emptyEdit(BASES.sb), 'tso')).toContain('r0 = 0, r1 = 0');
    for (const m of MODELS) expect(reachable(BASES.sb, fenceBoth(BASES.sb), m)).toBe(false);
  });

  it('SB: one fence is not enough on x86-style or Weak', () => {
    const one = setFence(emptyEdit(BASES.sb), 0, 0, true);
    expect(reachable(BASES.sb, one, 'sc')).toBe(false);
    expect(reachable(BASES.sb, one, 'tso')).toBe(true);
    expect(reachable(BASES.sb, one, 'relaxed')).toBe(true);
  });

  it('MP: flag 1 data 0 is forbidden on SC and x86-style and allowed on Weak with plain accesses', () => {
    const e = emptyEdit(BASES.mp);
    expect([reachable(BASES.mp, e, 'sc'), reachable(BASES.mp, e, 'tso'), reachable(BASES.mp, e, 'relaxed')]).toEqual([false, false, true]);
  });

  it('MP: release alone and acquire alone leave it reachable; both together, or a fence on each side, forbid it', () => {
    const flag = BASES.mp.flag!;
    const rel = setTag(emptyEdit(BASES.mp), ...flag.store, 'rel');
    const acq = setTag(emptyEdit(BASES.mp), ...flag.load, 'acq');
    const both = setTag(rel, ...flag.load, 'acq');
    expect(reachable(BASES.mp, rel, 'relaxed')).toBe(true);
    expect(reachable(BASES.mp, acq, 'relaxed')).toBe(true);
    expect(reachable(BASES.mp, both, 'relaxed')).toBe(false);
    expect(reachable(BASES.mp, setFence(setFence(emptyEdit(BASES.mp), 0, 0, true), 1, 0, true), 'relaxed')).toBe(false);
  });

  it('CoRR: r1 = 2, r2 = 1 is not reachable in any model, with or without tags and fences (every edit)', () => {
    for (const e of everyEdit(BASES.corr, true)) for (const m of MODELS) expect(reachable(BASES.corr, e, m)).toBe(false);
  });

  it('Dekker-style entry: both enter exactly when SB reads 0,0; one fence is not enough, two are', () => {
    expect(targetKey(BASES.dekker)).toBe('T0.r0=0 T1.r1=0');
    const one = setFence(emptyEdit(BASES.dekker), 0, 0, true);
    expect(reachable(BASES.dekker, emptyEdit(BASES.dekker), 'tso')).toBe(true);
    expect(reachable(BASES.dekker, one, 'tso')).toBe(true);
    expect(reachable(BASES.dekker, fenceBoth(BASES.dekker), 'tso')).toBe(false);
  });
});

describe('the table', () => {
  it('lists every possible outcome once: reachable rows carry a witness, unreachable rows none, and the target is marked', () => {
    for (const id of ids) {
      for (const m of MODELS) {
        const t = table(BASES[id], emptyEdit(BASES[id]), m);
        expect(t.rows.map((r) => r.regsKey)).toEqual(outcomeUniverse(BASES[id].litmus));
        expect(t.rows.filter((r) => r.isTarget)).toHaveLength(1);
        for (const r of t.rows) expect(r.example.length > 0).toBe(r.reachable);
        expect(t.truncated).toBe(false);
      }
    }
  });

  it('rows reachable only through the relaxation are marked, and SC has none', () => {
    const sc = table(BASES.sb, emptyEdit(BASES.sb), 'sc');
    const tso = table(BASES.sb, emptyEdit(BASES.sb), 'tso');
    expect(sc.rows.some((r) => r.viaRelaxation)).toBe(false);
    expect(tso.rows.filter((r) => r.viaRelaxation).map((r) => r.label)).toEqual(['r0 = 0, r1 = 0']);
  });

  it('a truncated search never reports a row as unreachable with certainty', () => {
    const t = table(BASES.sb, emptyEdit(BASES.sb), 'tso', 5);
    expect(t.truncated).toBe(true);
    expect(targetReach(BASES.sb, emptyEdit(BASES.sb), 5).tso.truncated).toBe(true);
  });

  it('the SC witness for the target has the 0,0 outcome at its end (TSO): both stores buffered while both loads read 0', () => {
    const row = table(BASES.sb, emptyEdit(BASES.sb), 'tso').rows.find((r) => r.isTarget)!;
    const texts = row.example.map((s) => s.label.text);
    const loads = texts.flatMap((x, i) => (x.includes('reads 0 from memory') ? [i] : []));
    const drains = texts.flatMap((x, i) => (x.startsWith('drain') ? [i] : []));
    expect(loads).toHaveLength(2);
    expect(Math.min(...drains)).toBeGreaterThan(Math.max(...loads));
  });
});

describe('every control at its minimum, its maximum and one beyond', () => {
  it('no fences and every fence: the explorer stays inside its limits', () => {
    for (const id of ids) {
      const none = emptyEdit(BASES[id]);
      const all = BASES[id].litmus.threads.reduce((e, prog, t) => prog.slice(0, -1).reduce((acc, _, i) => setFence(acc, t, i, true), e), none);
      for (const e of [none, all]) for (const m of MODELS) expect(() => table(BASES[id], e, m)).not.toThrow();
    }
  });

  it('the tag cycle visits every allowed tag and comes back; fences have no tag to cycle', () => {
    expect(STORE_TAGS).toEqual([undefined, 'rel', 'sc']);
    expect(LOAD_TAGS).toEqual([undefined, 'acq', 'sc']);
    expect(tagsFor({ op: 'fence' })).toEqual([undefined]);
  });

  it('tags are ignored by SC and x86-style: the outcome set does not depend on them', () => {
    for (const id of ids) {
      const base = everyEdit(BASES[id], true);
      const plain = emptyEdit(BASES[id]);
      for (const e of base) {
        const stripped = { ...e, tags: plain.tags };
        for (const m of ['sc', 'tso'] as const) expect(keysOf(buildLitmus(BASES[id], e), m)).toEqual(keysOf(buildLitmus(BASES[id], stripped), m));
      }
    }
  });
});

describe('manipulation notes', () => {
  it('manipulation 1: removing one fence of two leaves 0,0 reachable and the page says one fence is not enough', () => {
    const both = setFence(setFence(emptyEdit(BASES.sb), 0, 0, true), 1, 0, true);
    const one = setFence(both, 1, 0, false);
    expect(reachable(BASES.sb, both, 'tso')).toBe(false);
    expect(manipulationNote(BASES.sb, both, 'tso', targetReach(BASES.sb, both).tso)).toBeNull();
    expect(reachable(BASES.sb, one, 'tso')).toBe(true);
    expect(manipulationNote(BASES.sb, one, 'tso', targetReach(BASES.sb, one).tso)).toBe(
      'One fence is not enough: the other thread\'s store can still sit in its buffer while the load reads memory.',
    );
  });

  it('manipulation 2: tagging only the flag store release still shows 1,0 in Weak, with the release-alone line', () => {
    const rel = setTag(emptyEdit(BASES.mp), ...BASES.mp.flag!.store, 'rel');
    expect(reachable(BASES.mp, rel, 'relaxed')).toBe(true);
    expect(manipulationNote(BASES.mp, rel, 'relaxed', targetReach(BASES.mp, rel).relaxed)).toBe(
      'Release alone does not order the reader: its load has to be acquire to take over what the writer had done.',
    );
  });

  it('no note when nothing instructive happened (default state)', () => {
    for (const id of ids) for (const m of MODELS) expect(manipulationNote(BASES[id], emptyEdit(BASES[id]), m, targetReach(BASES[id], emptyEdit(BASES[id]))[m])).toBeNull();
  });
});

describe('numbers the lesson text quotes', () => {
  it('SB: 3 outcomes under SC and 4 under x86-style, from 6 interleavings', () => {
    expect([FACTS.sbScOutcomes, FACTS.sbTsoOutcomes, FACTS.sbScInterleavings]).toEqual([3, 4, 6]);
  });
  it('the SC state count (a regression pin keyed on pcs, memory, registers) equals a count by the hand-driven machine', () => {
    const l = BASES.sb.litmus;
    const seen = new Set<string>();
    const visit = (s: MState): void => {
      if (seen.has(JSON.stringify(s))) return;
      seen.add(JSON.stringify(s));
      for (const m of allMoves(l, 'sc')) if (blockedReason(l, s, m) === null) visit(applyMove(l, s, m, 'sc').state);
    };
    visit(initialState(l));
    expect(seen.size).toBe(13);
    expect(FACTS.sbScStates).toBe(13);
  });
});
