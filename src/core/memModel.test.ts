import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import {
  CORR,
  FIXTURES,
  LB,
  MAX_INSTRS_PER_THREAD,
  MAX_INSTRS_TOTAL,
  MAX_LOCATIONS,
  MAX_THREADS,
  MAX_VALUE,
  MP,
  MP_RELACQ,
  SB,
  SB_FENCED,
  formatLitmus,
  outcomes,
  parseLitmus,
  regsKeys,
  type Instr,
  type Litmus,
  type Model,
  type Ord,
} from './memModel';

// ── Independent oracles (second formulations; they share no code with memModel.ts) ──────────────

/** Outcome keys in memModel's format, from final registers (by thread) and memory. */
function keyOf(l: Litmus, regs: Record<string, number>[], mem: Record<string, number>): string {
  const regText = l.threads
    .flatMap((t, ti) => [...new Set(t.flatMap((i) => (i.op === 'load' ? [i.reg] : [])))].sort().map((r) => `T${ti}.${r}=${regs[ti][r] ?? 0}`))
    .join(' ');
  const locs = [...new Set([...Object.keys(l.init), ...l.threads.flatMap((t) => t.flatMap((i) => (i.op === 'fence' ? [] : [i.loc])))])].sort();
  return `${regText} | ${locs.map((x) => `${x}=${mem[x] ?? 0}`).join(' ')}`;
}

/** SC: every interleaving of the threads' instructions, by plain recursion over thread positions. */
function scOracle(l: Litmus): Set<string> {
  const found = new Set<string>();
  const go = (pos: number[], mem: Record<string, number>, regs: Record<string, number>[]) => {
    if (pos.every((p, t) => p === l.threads[t].length)) {
      found.add(keyOf(l, regs, mem));
      return;
    }
    l.threads.forEach((prog, t) => {
      const i = prog[pos[t]];
      if (!i) return;
      const next = pos.map((p, k) => (k === t ? p + 1 : p));
      if (i.op === 'store') go(next, { ...mem, [i.loc]: i.value }, regs);
      else if (i.op === 'load') go(next, mem, regs.map((r, k) => (k === t ? { ...r, [i.reg]: mem[i.loc] ?? 0 } : r)));
      else go(next, mem, regs);
    });
  };
  go(
    l.threads.map(() => 0),
    { ...l.init },
    l.threads.map(() => ({})),
  );
  return found;
}

/**
 * TSO as an event ordering, written separately from the store-buffer machine: each store is two events
 * (issue, commit); enumerate every total order of events that respects program order, commit order and
 * "a fence follows the commits of earlier stores", then REPLAY each order. A load reads the newest of its
 * own issued-but-uncommitted stores to that location, else memory.
 */
function tsoOracle(l: Litmus): Set<string> {
  type Ev = { t: number; j: number; kind: 'P' | 'C' };
  const events: Ev[] = [];
  l.threads.forEach((prog, t) =>
    prog.forEach((i, j) => {
      events.push({ t, j, kind: 'P' });
      if (i.op === 'store') events.push({ t, j, kind: 'C' });
    }),
  );
  const before = (a: Ev, b: Ev): boolean => {
    if (a.t !== b.t) return false;
    const prog = l.threads[a.t];
    if (a.kind === 'P' && b.kind === 'P') return a.j < b.j;
    if (a.kind === 'P' && b.kind === 'C') return a.j <= b.j; // issue precedes its own commit, and every later store's
    if (a.kind === 'C' && b.kind === 'C') return a.j < b.j;
    return prog[b.j].op === 'fence' && a.j < b.j; // a commit precedes a later fence
  };
  const found = new Set<string>();
  const replay = (order: Ev[]) => {
    const mem = { ...l.init };
    const regs: Record<string, number>[] = l.threads.map(() => ({}));
    const pending: { t: number; j: number; loc: string; value: number }[] = [];
    for (const e of order) {
      const i = l.threads[e.t][e.j];
      if (i.op === 'store' && e.kind === 'P') pending.push({ t: e.t, j: e.j, loc: i.loc, value: i.value });
      else if (i.op === 'store') {
        mem[i.loc] = i.value;
        pending.splice(pending.findIndex((p) => p.t === e.t && p.j === e.j), 1);
      } else if (i.op === 'load') {
        const own = pending.filter((p) => p.t === e.t && p.loc === i.loc).pop();
        regs[e.t][i.reg] = own ? own.value : (mem[i.loc] ?? 0);
      }
    }
    found.add(keyOf(l, regs, mem));
  };
  const go = (placed: Ev[], left: Ev[]) => {
    if (left.length === 0) return replay(placed);
    left.forEach((e, k) => {
      if (left.some((o) => o !== e && before(o, e))) return;
      go([...placed, e], left.filter((_, m) => m !== k));
    });
  };
  go([], events);
  return found;
}

/** The spec's swap oracle: the union of SC outcomes over programs with a store moved past a later load of a DIFFERENT location. */
function swapOracle(l: Litmus): Set<string> {
  const seen = new Set<string>();
  const union = new Set<string>();
  const visit = (threads: Instr[][]) => {
    const text = JSON.stringify(threads);
    if (seen.has(text)) return;
    seen.add(text);
    for (const k of scOracle({ ...l, threads })) union.add(k);
    threads.forEach((prog, t) =>
      prog.forEach((a, j) => {
        const b = prog[j + 1];
        if (a.op === 'store' && b?.op === 'load' && a.loc !== b.loc) visit(threads.map((p, k) => (k === t ? [...p.slice(0, j), b, a, ...p.slice(j + 2)] : p)));
      }),
    );
  };
  visit(l.threads);
  return union;
}

/** In the swap oracle's fragment: no thread loads a location after storing to it itself. */
function inSwapFragment(l: Litmus): boolean {
  return l.threads.every((prog) => prog.every((i, j) => i.op !== 'load' || !prog.slice(0, j).some((s) => s.op === 'store' && s.loc === i.loc)));
}

const keys = (l: Litmus, m: Model) => new Set(outcomes(l, m).outcomes.keys());
const subset = (a: Set<string>, b: Set<string>) => [...a].every((k) => b.has(k));
const sorted = (s: Set<string>) => [...s].sort();

// ── Seeded random programs ──────────────────────────────────────────────

function randomProgram(seed: number, tags: boolean): Litmus {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const total = 3 + Math.floor(rnd() * 2);
  const first = 1 + Math.floor(rnd() * (total - 1));
  const sizes = [first, total - first];
  const threads: Instr[][] = sizes.map((n) => {
    let regs = 0;
    return Array.from({ length: n }, (): Instr => {
      const r = rnd();
      const loc = pick(['x', 'y']);
      const ord = (options: readonly Ord[]): { ord?: Ord } => (tags ? { ord: pick(options) } : {});
      if (r < 0.1) return { op: 'fence' };
      if (r < 0.55) return { op: 'store', loc, value: 1 + Math.floor(rnd() * 2), ...ord(['rlx', 'rel', 'sc']) };
      return { op: 'load', reg: `r${regs++}`, loc, ...ord(['rlx', 'acq', 'sc']) };
    });
  });
  return { name: `random-${seed}`, init: {}, threads };
}
const RANDOM_SEEDS = Array.from({ length: 200 }, (_, k) => k + 1);

// ── Tests ───────────────────────────────────────────────────────────────

describe('hand-worked vectors', () => {
  it('SB under SC: 6 interleavings give (0,1), (1,0), (1,1) and never (0,0)', () => {
    // a: x=1, b: r0=y, c: y=1, d: r1=x with a<b and c<d. abcd (0,1); acbd, acdb, cabd, cadb (1,1); cdab (1,0).
    expect(regsKeys(outcomes(SB, 'sc'))).toEqual(['T0.r0=0 T1.r1=1', 'T0.r0=1 T1.r1=0', 'T0.r0=1 T1.r1=1']);
  });

  it('SB: 0,0 appears under TSO and the weak model, not SC', () => {
    // Both stores can still sit in their store buffers when the loads run, so both loads read memory's 0.
    expect(regsKeys(outcomes(SB, 'tso'))).toContain('T0.r0=0 T1.r1=0');
    expect(regsKeys(outcomes(SB, 'relaxed'))).toContain('T0.r0=0 T1.r1=0');
    expect(regsKeys(outcomes(SB, 'sc'))).not.toContain('T0.r0=0 T1.r1=0');
  });

  it('SB with a full fence in both threads forbids 0,0 in every model; one fence is not enough', () => {
    for (const m of ['sc', 'tso', 'relaxed'] as const) expect(regsKeys(outcomes(SB_FENCED, m))).not.toContain('T0.r0=0 T1.r1=0');
    const oneFence = parseLitmus('T0: x = 1 ; fence ; r0 = y\nT1: y = 1 ; r1 = x');
    if (!oneFence.ok) throw new Error(oneFence.error);
    // The unfenced thread's store can still be buffered (TSO) or its load stale (weak).
    expect(regsKeys(outcomes(oneFence.litmus, 'tso'))).toContain('T0.r0=0 T1.r1=0');
    expect(regsKeys(outcomes(oneFence.litmus, 'relaxed'))).toContain('T0.r0=0 T1.r1=0');
  });

  it('MP: the stale read (flag 1, data 0) is allowed under relaxed, forbidden under SC and TSO', () => {
    // TSO keeps stores in order and loads in order, so seeing the flag means the data store already drained.
    const stale = 'T1.r1=1 T1.r2=0';
    expect(regsKeys(outcomes(MP, 'sc')).join()).not.toContain(stale);
    expect(regsKeys(outcomes(MP, 'tso')).join()).not.toContain(stale);
    expect(regsKeys(outcomes(MP, 'relaxed'))).toContain(stale);
  });

  it('MP: release alone, acquire alone and release+acquire (weak model)', () => {
    const stale = 'T1.r1=1 T1.r2=0';
    const run = (text: string) => {
      const p = parseLitmus(text);
      if (!p.ok) throw new Error(p.error);
      return regsKeys(outcomes(p.litmus, 'relaxed'));
    };
    expect(run('T0: x = 1 ; y = 1 @rel\nT1: r1 = y ; r2 = x')).toContain(stale); // release alone does not order the reader
    expect(run('T0: x = 1 ; y = 1\nT1: r1 = y @acq ; r2 = x')).toContain(stale); // acquire alone reads a write with no view attached
    expect(regsKeys(outcomes(MP_RELACQ, 'relaxed'))).not.toContain(stale); // the reader takes over the writer's view
    expect(run('T0: x = 1 ; fence ; y = 1\nT1: r1 = y ; fence ; r2 = x')).not.toContain(stale);
  });

  it('CoRR: reading x backwards (2 then 1) is not reachable in any model', () => {
    for (const m of ['sc', 'tso', 'relaxed'] as const) expect(regsKeys(outcomes(CORR, m))).not.toContain('T1.r1=2 T1.r2=1');
    expect(regsKeys(outcomes(CORR, 'relaxed'))).toContain('T1.r1=1 T1.r2=2');
  });

  it('LB is documented as not modelled: no model reports r0 = r1 = 1', () => {
    for (const m of ['sc', 'tso', 'relaxed'] as const) expect(regsKeys(outcomes(LB, m))).not.toContain('T0.r0=1 T1.r1=1');
  });

  it('Dekker entry: both threads enter (0,0) under TSO, one fence is not enough, two are', () => {
    const dekker = (f0: string, f1: string) => {
      const p = parseLitmus(`T0: flag0 = 1 ${f0} ; r0 = flag1\nT1: flag1 = 1 ${f1} ; r1 = flag0`);
      if (!p.ok) throw new Error(p.error);
      return regsKeys(outcomes(p.litmus, 'tso')).includes('T0.r0=0 T1.r1=0');
    };
    expect(dekker('', '')).toBe(true);
    expect(dekker('; fence', '')).toBe(true);
    expect(dekker('; fence', '; fence')).toBe(false);
  });

  it('the pinned state counts and witnesses make sense (regression pins, outcome sets come first)', () => {
    const r = outcomes(SB, 'tso');
    expect(r.truncated).toBe(false);
    const zero = [...r.outcomes.values()].find((o) => o.regsKey === 'T0.r0=0 T1.r1=0')!;
    // Shortest schedule to 0,0: both stores buffered, both loads from memory, then the two drains: 6 steps.
    expect(zero.example).toHaveLength(6);
    expect(new Set(zero.example.map((s) => s.label.actor))).toEqual(new Set(['T0', 'T1']));
    expect(zero.example[0].label.text).toContain('into the buffer');
    const last = zero.example[zero.example.length - 1].state;
    expect(last.mem).toEqual({ x: 1, y: 1 });
    expect(last.buffers).toEqual([[], []]);
  });
});

describe('SC and TSO equal their second formulations', () => {
  it('on the in-fragment fixtures (SC: all interleavings; TSO: swap oracle AND event-order oracle)', () => {
    // The swap oracle is only valid where no thread loads a location it has stored to (forwarding differs).
    for (const l of FIXTURES.filter(inSwapFragment)) {
      expect(sorted(keys(l, 'sc')), l.name).toEqual(sorted(scOracle(l)));
      const swap = swapOracle(l);
      expect(sorted(keys(l, 'tso')), l.name).toEqual(sorted(swap));
      expect(sorted(tsoOracle(l)), l.name).toEqual(sorted(swap));
    }
  });

  it('on 200 seeded random 2-thread programs of 3-4 instructions', () => {
    let inFragment = 0;
    for (const seed of RANDOM_SEEDS) {
      const l = randomProgram(seed, false);
      expect(sorted(keys(l, 'sc')), `sc seed ${seed}: ${formatLitmus(l)}`).toEqual(sorted(scOracle(l)));
      // The event-order oracle handles forwarding, so it covers every program.
      expect(sorted(keys(l, 'tso')), `tso seed ${seed}: ${formatLitmus(l)}`).toEqual(sorted(tsoOracle(l)));
      if (inSwapFragment(l)) {
        inFragment++;
        expect(sorted(keys(l, 'tso')), `swap seed ${seed}`).toEqual(sorted(swapOracle(l)));
      }
    }
    expect(inFragment).toBeGreaterThan(50);
  });
});

describe('containment: SC ⊆ TSO ⊆ relaxed', () => {
  it('holds on 200 seeded random programs without tags (fences allowed)', () => {
    for (const seed of RANDOM_SEEDS) {
      const l = randomProgram(seed, false);
      const [sc, tso, rlx] = [keys(l, 'sc'), keys(l, 'tso'), keys(l, 'relaxed')];
      expect(subset(sc, tso), `sc in tso, seed ${seed}: ${formatLitmus(l)}`).toBe(true);
      expect(subset(tso, rlx), `tso in relaxed, seed ${seed}: ${formatLitmus(l)}`).toBe(true);
    }
  });

  it('SC ⊆ relaxed also holds with every tag (tags only strengthen the weak model, never beyond SC)', () => {
    for (const seed of RANDOM_SEEDS) {
      const l = randomProgram(seed, true);
      expect(subset(keys(l, 'sc'), keys(l, 'relaxed')), `seed ${seed}: ${formatLitmus(l)}`).toBe(true);
    }
  });

  it('TSO ⊆ relaxed does NOT survive sc tags (they act as fences in relaxed and are ignored by TSO): the claim is for untagged programs', () => {
    const p = parseLitmus('T0: x = 1 @sc ; r0 = y @sc\nT1: y = 1 @sc ; r1 = x @sc');
    if (!p.ok) throw new Error(p.error);
    expect(regsKeys(outcomes(p.litmus, 'tso'))).toContain('T0.r0=0 T1.r1=0');
    expect(regsKeys(outcomes(p.litmus, 'relaxed'))).not.toContain('T0.r0=0 T1.r1=0');
  });
});

describe('seq_cst as a fence before the access (relaxed model)', () => {
  const run = (text: string) => {
    const p = parseLitmus(text);
    if (!p.ok) throw new Error(p.error);
    return regsKeys(outcomes(p.litmus, 'relaxed'));
  };
  it('SB with sc accesses forbids 0,0 (as C++ does)', () => {
    expect(run('T0: x = 1 @sc ; r0 = y @sc\nT1: y = 1 @sc ; r1 = x @sc')).not.toContain('T0.r0=0 T1.r1=0');
  });
  it('sc stores alone (relaxed loads) forbid 0,0 here: the store that runs second fences past the first. C++ allows 0,0 in that case, so the model is stronger there', () => {
    expect(run('T0: x = 1 @sc ; r0 = y\nT1: y = 1 @sc ; r1 = x')).not.toContain('T0.r0=0 T1.r1=0');
  });
  it('sc loads alone (relaxed stores) forbid 0,0 too, the same corner where the model is stronger than C++', () => {
    // fence-before-load after a relaxed store: x=1 then (fence; r0=y). The fence only advances the view, it does not
    // make the earlier store visible to anyone, yet the other thread's fenced load below sees the newest write of x,
    // which exists already. So both fenced loads cannot read 0: forbidden here. C++ allows 0,0 when only the loads
    // are seq_cst (the stores are not in the total order), so this model is stronger in that corner.
    expect(run('T0: x = 1 ; r0 = y @sc\nT1: y = 1 ; r1 = x @sc')).not.toContain('T0.r0=0 T1.r1=0');
  });
});

describe('counterfactuals (a wrong model must fail the same tests)', () => {
  it('a TSO that drains on every store is SC in disguise and loses SB 0,0', () => {
    const sc = regsKeys(outcomes(SB, 'sc'));
    expect(sc).not.toContain('T0.r0=0 T1.r1=0');
    expect(regsKeys(outcomes(SB, 'tso'))).not.toEqual(sc);
  });
  it('ignoring fences would keep 0,0 in SB_FENCED: the real TSO does not', () => {
    const noFence = parseLitmus('T0: x = 1 ; r0 = y\nT1: y = 1 ; r1 = x');
    if (!noFence.ok) throw new Error(noFence.error);
    expect(regsKeys(outcomes(noFence.litmus, 'tso'))).toContain('T0.r0=0 T1.r1=0');
    expect(regsKeys(outcomes(SB_FENCED, 'tso'))).not.toContain('T0.r0=0 T1.r1=0');
  });
});

describe('budget and honesty', () => {
  it('reports truncated when the budget stops the search', () => {
    const r = outcomes(SB, 'tso', 5);
    expect(r.truncated).toBe(true);
    expect(r.states).toBeLessThanOrEqual(5);
  });
  it('a complete run is not truncated', () => {
    for (const l of FIXTURES) for (const m of ['sc', 'tso', 'relaxed'] as const) expect(outcomes(l, m).truncated).toBe(false);
  });
  it('every outcome has a witness whose last state has that outcome', () => {
    for (const o of outcomes(MP, 'relaxed').outcomes.values()) {
      expect(o.example.length).toBeGreaterThan(0);
      expect(o.example[o.example.length - 1].state.regs).toEqual(o.regs);
    }
  });
});

describe('parseLitmus', () => {
  it('round-trips the fixtures through formatLitmus', () => {
    for (const l of FIXTURES) {
      const again = parseLitmus(formatLitmus(l), l.name);
      expect(again).toEqual({ ok: true, litmus: l });
    }
  });
  it('reads init, optional thread labels, tags, comments and fences', () => {
    const p = parseLitmus('# a test\ninit x=1, y=2\nT0: x = 1 @rel ; r0 = y @acq ; fence # trailing\nr1 = x');
    expect(p).toEqual({
      ok: true,
      litmus: {
        name: 'litmus',
        init: { x: 1, y: 2 },
        threads: [[{ op: 'store', loc: 'x', value: 1, ord: 'rel' }, { op: 'load', reg: 'r0', loc: 'y', ord: 'acq' }, { op: 'fence' }], [{ op: 'load', reg: 'r1', loc: 'x' }]],
      },
    });
  });
  const refusal = (text: string) => {
    const p = parseLitmus(text);
    if (p.ok) throw new Error('expected a refusal');
    return p.error;
  };
  it('refuses with line and column', () => {
    expect(refusal('T0: x = 1 ; r0 y')).toBe('Line 1, column 16: expected "=" after r0.');
    expect(refusal('x = 1\nT1: y = 12')).toContain('Line 2, column 9');
    expect(refusal('x = 1 @acq')).toContain('a store cannot be @acq');
    expect(refusal('r0 = x @rel')).toContain('a load cannot be @rel');
    expect(refusal('r0 = 1')).toContain('r0 is a register');
    expect(refusal('x = 1 ;')).toContain('expected an instruction');
    expect(refusal('x = 1 $')).toContain('unexpected "$"');
    expect(refusal('init x=1\ninit y=1\nx = 1')).toContain('only one "init"');
  });
  it('refuses above the size limits', () => {
    expect(refusal(Array.from({ length: MAX_THREADS + 1 }, () => 'x = 1').join('\n'))).toContain(`at most ${MAX_THREADS} threads`);
    expect(refusal(Array.from({ length: MAX_INSTRS_PER_THREAD + 1 }, () => 'x = 1').join(' ; '))).toContain(`${MAX_INSTRS_PER_THREAD} instructions per thread`);
    expect(refusal(['x = 1 ; x = 1 ; x = 1 ; x = 1 ; x = 1', 'x = 1 ; x = 1 ; x = 1 ; x = 1 ; x = 1', 'x = 1'].join('\n'))).toContain(`${MAX_INSTRS_TOTAL} instructions in all`);
    expect(refusal('a = 1 ; b = 1 ; c = 1 ; d = 1')).toContain(`at most ${MAX_LOCATIONS} locations`);
    expect(refusal(`x = ${MAX_VALUE + 1}`)).toContain('too big');
    expect(refusal('x = 1 ; '.repeat(40))).toContain('characters');
  });
  it('outcomes throws a RangeError for a hand-built program over the limits', () => {
    const big: Litmus = { name: 'big', init: {}, threads: Array.from({ length: MAX_THREADS + 1 }, () => [{ op: 'fence' as const }]) };
    expect(() => outcomes(big, 'sc')).toThrow(RangeError);
  });
});
