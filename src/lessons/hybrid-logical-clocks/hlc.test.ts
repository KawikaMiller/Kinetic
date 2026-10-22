import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forSeeds } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import { SEED_MAX } from '../../core/seed';
import { boundCaption, burstCaption, execCaption } from './captions';
import {
  BURST, CHAIN, DELAY_MS, MAX_EVENTS, MAX_MESSAGES, TIME_MS, ZERO, addLocal, addMessage, burstRows, compareHlc, eventsOf, happenedBefore, hlcReceive, hlcSend, hlcText,
  inversions, lamportReceive, lamportSend, sortedBy, stampExecution, type Execution, type Hlc,
} from './hlc';
import lesson from './index';
import {
  BROKEN_SEED, BROKEN_SEED_BACKWARDS, DEFAULT_OPTIONS, EPSILON_MS, FAR_AHEAD_MS, RULES, SEED_RANGE, SEEDS_TOTAL, drawnOffsets, epsilonMax, hlcScenario, plan, runHlcSeed,
  seedFor, sweepSeeds,
} from './seeded';

const h = (l: number, c: number): Hlc => ({ l, c });

// ---- independent references -------------------------------------------------------------------------------

/** The set-theoretic definition: the smallest pair strictly above h (and above m, on a receive) whose wall part is not behind the physical clock. */
function smallest(above: Hlc[], pt: number): Hlc {
  let best: Hlc | null = null;
  for (let l = 0; l <= 12; l++) {
    for (let c = 0; c <= 12; c++) {
      const p = h(l, c);
      if (!above.every((x) => compareHlc(p, x) > 0) || p.l < pt) continue;
      if (best === null || compareHlc(p, best) < 0) best = p;
    }
  }
  return best!;
}

/** Reference happens-before by depth-first search over process order and message edges, no closure matrix. */
function referenceInversions(e: Execution, pick: (s: ReturnType<typeof stampExecution>[number]) => Hlc | number): number {
  const stamps = stampExecution(e);
  const events = eventsOf(e);
  const next = (id: number): number[] => {
    const ev = events[id];
    const out: number[] = [];
    const later = events.find((x) => x.node === ev.node && x.id > id);
    if (later) out.push(later.id);
    if (ev.kind === 'send') out.push(events.find((x) => x.kind === 'receive' && x.msg === ev.msg)!.id);
    return out;
  };
  const reach = (from: number): Set<number> => {
    const seen = new Set<number>();
    const stack = [...next(from)];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...next(id));
    }
    return seen;
  };
  const gt = (a: Hlc | number, b: Hlc | number) => (typeof a === 'number' ? a > (b as number) : compareHlc(a, b as Hlc) > 0);
  let count = 0;
  for (const s of stamps) for (const id of reach(s.event.id)) if (gt(pick(s), pick(stamps[id]))) count++;
  return count;
}

/** A seeded random execution: offsets within 50, up to 8 messages and a few local events. */
function randomExecution(seed: number): Execution {
  const rnd = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const offsets = [int(-50, 50), int(-50, 50), int(-50, 50)] as unknown as Execution['offsets'];
  const messages = Array.from({ length: int(1, 6) }, () => {
    const from = int(0, 2);
    return { from, to: (from + int(1, 2)) % 3, sendAt: int(50, 200), delay: int(1, 10) };
  });
  const locals = Array.from({ length: int(0, 4) }, () => ({ node: int(0, 2), at: int(50, 200) }));
  return { offsets, messages, locals };
}

describe('the update rules', () => {
  it('hand vector 1: the chain A 0, B -20, C +15 gives eight stamps, worked from the rules', () => {
    const s = stampExecution(CHAIN);
    const view = s.map((x) => `${'ABC'[x.event.node]}@${x.event.t} pt${x.pt} ${hlcText(x.hlc)}`);
    expect(view).toEqual([
      'A@100 pt100 (100, 0)', // l = max(0, 100) = 100, changed: c = 0
      'B@105 pt85 (100, 1)', // l = max(0, 100, 85) = 100 = l_m only: c = c_m + 1
      'B@108 pt88 (100, 2)', // l = max(100, 88) = 100 = l: c + 1
      'B@125 pt105 (105, 0)', // l = 105, changed: c = 0
      'B@130 pt110 (110, 0)',
      'C@133 pt148 (148, 0)', // l = max(0, 110, 148) = 148 = pt alone
      'C@140 pt155 (155, 0)',
      'A@144 pt144 (155, 1)', // l = max(100, 155, 144) = 155 = l_m only: c = 0 + 1
    ]);
    expect(s.map((x) => x.lamport)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // At the last receive l - pt = 155 - 144 = 11, inside epsilon_max = 15 - (-20) = 35.
    expect(s[7].hlc.l - s[7].pt).toBe(11);
    expect(epsilonMax(CHAIN.offsets)).toBe(35);
  });

  it('hand vector 3: the four receive branches', () => {
    expect(hlcReceive(h(100, 3), h(100, 5), 90).h).toEqual(h(100, 6)); // all three equal 100: max(3, 5) + 1
    expect(hlcReceive(h(100, 3), h(95, 9), 90).h).toEqual(h(100, 4)); // l' = l only
    expect(hlcReceive(h(90, 3), h(100, 5), 80).h).toEqual(h(100, 6)); // l' = l_m only
    expect(hlcReceive(h(90, 3), h(95, 5), 100).h).toEqual(h(100, 0)); // l' = pt alone
  });

  it('hand vector 4: a clock frozen at 100 gives (100, 0), (100, 1), (100, 2), then 101 gives (101, 0)', () => {
    let s = hlcSend(ZERO, 100);
    expect(s.h).toEqual(h(100, 0));
    s = hlcSend(s.h, 100);
    expect(s.h).toEqual(h(100, 1));
    s = hlcSend(s.h, 100);
    expect(s.h).toEqual(h(100, 2));
    expect(hlcSend(s.h, 101).h).toEqual(h(101, 0));
  });

  it('the rules equal the set-theoretic definition on a grid: l 0..4, c 0..3, a message likewise, pt 0..5 (2,400 receives and 120 sends)', () => {
    let cases = 0;
    for (let l = 0; l <= 4; l++) {
      for (let c = 0; c <= 3; c++) {
        for (let pt = 0; pt <= 5; pt++) {
          expect(hlcSend(h(l, c), pt).h, `send ${l},${c} pt ${pt}`).toEqual(smallest([h(l, c)], pt));
          cases++;
          for (let lm = 0; lm <= 4; lm++) {
            for (let cm = 0; cm <= 3; cm++) {
              expect(hlcReceive(h(l, c), h(lm, cm), pt).h, `receive ${l},${c} m ${lm},${cm} pt ${pt}`).toEqual(smallest([h(l, c), h(lm, cm)], pt));
              cases++;
            }
          }
        }
      }
    }
    expect(cases).toBe(2520);
  });

  it('the Lamport rules: send is L + 1, receive is max(L, L_m) + 1', () => {
    expect([lamportSend(0), lamportSend(7), lamportReceive(1, 7), lamportReceive(9, 2)]).toEqual([1, 8, 8, 10]);
  });

  it('compareHlc is lexicographic: wall first, then counter', () => {
    expect(compareHlc(h(1, 9), h(2, 0))).toBeLessThan(0);
    expect(compareHlc(h(2, 1), h(2, 0))).toBeGreaterThan(0);
    expect(compareHlc(h(2, 1), h(2, 1))).toBe(0);
  });
});

describe('causality over 300 seeded random executions, against happens-before computed without any clock', () => {
  const executions = Array.from({ length: 300 }, (_, k) => randomExecution(k + 1));

  it('hybrid and Lamport stamps put every cause below its effect on all pairs of every execution; physical stamps do not', () => {
    let physicalInversions = 0;
    let pairs = 0;
    for (const e of executions) {
      const stamps = stampExecution(e);
      const hb = happenedBefore(e);
      expect(inversions(stamps, hb, 'hlc')).toEqual([]);
      expect(inversions(stamps, hb, 'lamport')).toEqual([]);
      physicalInversions += inversions(stamps, hb, 'physical').length;
      for (const row of hb) pairs += row.filter(Boolean).length;
    }
    expect(pairs).toBeGreaterThan(1000);
    expect(physicalInversions).toBeGreaterThan(200); // the check can fail: skewed physical stamps break causality
  });

  it('the happens-before matrix and the inversion counts equal a depth-first reference on every execution', () => {
    for (const e of executions) {
      const stamps = stampExecution(e);
      const hb = happenedBefore(e);
      expect(inversions(stamps, hb, 'physical').length).toBe(referenceInversions(e, (s) => s.pt));
      expect(inversions(stamps, hb, 'lamport').length).toBe(referenceInversions(e, (s) => s.lamport));
      expect(inversions(stamps, hb, 'hlc').length).toBe(referenceInversions(e, (s) => s.hlc));
    }
  });

  it('per node the hybrid stamps strictly increase, l is never below the physical clock, and a receive exceeds its send', () => {
    for (const e of executions) {
      const stamps = stampExecution(e);
      const last = new Map<number, Hlc>();
      const sent = new Map<number, Hlc>();
      for (const s of stamps) {
        const before = last.get(s.event.node);
        if (before) expect(compareHlc(s.hlc, before)).toBeGreaterThan(0);
        expect(s.hlc.l).toBeGreaterThanOrEqual(s.pt);
        if (s.event.kind === 'send') sent.set(s.event.msg!, s.hlc);
        if (s.event.kind === 'receive') expect(compareHlc(s.hlc, sent.get(s.event.msg!)!)).toBeGreaterThan(0);
        last.set(s.event.node, s.hlc);
      }
    }
  });

  it('sorting by each stamp: the chain sorts without inversions only under Lamport and hybrid', () => {
    const stamps = stampExecution(CHAIN);
    expect(sortedBy('hlc', stamps)).toHaveLength(8);
    expect(sortedBy('lamport', stamps)).toEqual(['A1', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'A2']);
    expect(sortedBy('physical', stamps)).not.toEqual(sortedBy('lamport', stamps));
  });
});

describe('scene 1: edits and refusals', () => {
  it('a message to the same node, with a delay below 1 or above 10, with too many messages or events, is refused with a reason', () => {
    expect(addMessage(CHAIN, { from: 1, to: 1, sendAt: 100, delay: 5 })).toEqual({ ok: false, reason: 'A message goes between two different nodes.' });
    expect(addMessage(CHAIN, { from: 0, to: 1, sendAt: 100, delay: DELAY_MS.min - 1 })).toEqual({ ok: false, reason: 'A message cannot arrive before it is sent: the delay is at least 1 ms.' });
    expect(addMessage(CHAIN, { from: 0, to: 1, sendAt: 100, delay: DELAY_MS.max + 1 }).ok).toBe(false);
    expect(addMessage(CHAIN, { from: 0, to: 1, sendAt: TIME_MS.max + 1, delay: 3 }).ok).toBe(false);
    expect(addMessage(CHAIN, { from: 0, to: 1, sendAt: TIME_MS.min - 1, delay: 3 }).ok).toBe(false);
    expect(addMessage(CHAIN, { from: 0, to: 1, sendAt: TIME_MS.min, delay: DELAY_MS.min }).ok).toBe(true);
    let e: Execution = { ...CHAIN, messages: [], locals: [] };
    for (let k = 0; k < MAX_MESSAGES; k++) {
      const r = addMessage(e, { from: 0, to: 1, sendAt: 60 + k, delay: 2 });
      if (r.ok) e = r.exec;
    }
    expect(e.messages.length).toBeLessThanOrEqual(MAX_MESSAGES);
    expect(addMessage(e, { from: 0, to: 1, sendAt: 200, delay: 2 }).ok).toBe(false);
    let f: Execution = { ...CHAIN, messages: [], locals: [] };
    for (let k = 0; k < MAX_EVENTS; k++) {
      const r = addLocal(f, { node: 0, at: 60 + k });
      expect(r.ok).toBe(true);
      if (r.ok) f = r.exec;
    }
    expect(addLocal(f, { node: 0, at: 200 })).toEqual({ ok: false, reason: 'At most 14 events: remove one first.' });
  });

  it('try-this 1: B\'s receive reads 85 against A\'s send at 100, its hybrid stamp is (100, 1) and only the physical stamps invert', () => {
    const stamps = stampExecution(CHAIN);
    const hb = happenedBefore(CHAIN);
    expect(stamps[1].pt).toBe(85);
    expect(hlcText(stamps[1].hlc)).toBe('(100, 1)');
    const physical = inversions(stamps, hb, 'physical').length;
    expect(physical).toBeGreaterThanOrEqual(1);
    expect(inversions(stamps, hb, 'lamport')).toHaveLength(0);
    expect(inversions(stamps, hb, 'hlc')).toHaveLength(0);
    expect(lesson.tryThis[0]).toContain('is 85, below A\'s send at 100');
    expect(lesson.tryThis[0]).toContain(`Physical stamps carry ${physical} causal inversions`);
    const first = inversions(stamps, hb, 'physical')[0];
    expect(expectCaption(execCaption({ stamps, inv: { physical: inversions(stamps, hb, 'physical'), lamport: [], hlc: [] }, refusal: null }))).toContain(`B1 before its cause A1`);
    expect(first).toEqual({ cause: 0, effect: 1 });
  });

  it('try-this 2: moving B from -20 to 0 lowers the physical inversions, C\'s offset keeps some, and -50 raises them again; hybrid stays 0', () => {
    const at = (b: number): Execution => ({ ...CHAIN, offsets: [0, b, 15] });
    const count = (e: Execution) => inversions(stampExecution(e), happenedBefore(e), 'physical').length;
    const [minus20, zero, minus50] = [count(at(-20)), count(at(0)), count(at(-50))];
    expect(zero).toBeLessThan(minus20);
    expect(zero).toBeGreaterThan(0);
    expect(minus50).toBeGreaterThan(zero);
    expect(inversions(stampExecution(at(-50)), happenedBefore(at(-50)), 'hlc')).toHaveLength(0);
    expect(lesson.tryThis[1]).toContain(`from ${minus20} to ${zero}`);
    expect(lesson.tryThis[1]).toContain(`climb to ${minus50}`);
  });
});

describe('scene 2: the burst', () => {
  it('try-this 3: at 50 ms and 5 events the physical stamps tie on 1 value and the hybrid stamps run (100, 0) to (100, 4)', () => {
    const rows = burstRows(50, BURST.default);
    expect(new Set(rows.map((r) => r.pt)).size).toBe(1);
    expect(rows.map((r) => hlcText(r.hlc))).toEqual(['(100, 0)', '(100, 1)', '(100, 2)', '(100, 3)', '(100, 4)']);
    expect(lesson.tryThis[2]).toContain('(100, 0) to (100, 4)');
    expect(expectCaption(burstCaption({ resolution: 50, burst: 5, distinctPhysical: 1, distinctHybrid: 5, largest: 4 }))).toContain('tie');
  });

  it('the counter returns to 0 when the clock moves, and stays below the burst size at the extremes (1 and 20 events, 1 and 50 ms)', () => {
    const rows = burstRows(10, 20);
    expect(rows.map((r) => r.hlc.c)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const resolution of [1, 10, 50]) {
      for (const burst of [BURST.min, BURST.max]) {
        const r = burstRows(resolution, burst);
        expect(r).toHaveLength(burst);
        expect(Math.max(...r.map((x) => x.hlc.c))).toBeLessThan(burst);
        expect(new Set(r.map((x) => hlcText(x.hlc))).size).toBe(burst);
      }
    }
    expect(burstRows(1, 20).every((r) => r.hlc.c === 0)).toBe(true);
  });
});

describe('scene 3: the seeded leg, four stamping rules', () => {
  it('the full HLC passes all four rules on 200 of 200 seeds, at epsilon 0, 20 and 50, with a clock stepping back, and with one clock 5 s and 10 s ahead', () => {
    for (const epsilon of [EPSILON_MS.min, EPSILON_MS.default, EPSILON_MS.max]) expect(sweepSeeds({ ...DEFAULT_OPTIONS, epsilon }).failing, `epsilon ${epsilon}`).toEqual([]);
    expect(sweepSeeds({ ...DEFAULT_OPTIONS, clockSteps: true }).failing).toEqual([]);
    for (const farAheadMs of [5000, FAR_AHEAD_MS.max]) expect(sweepSeeds({ ...DEFAULT_OPTIONS, farAheadMs }).failing, `far ${farAheadMs}`).toEqual([]);
  });

  it('plain physical timestamps break "receive stamped after its send" on 132 of 200 seeds (66%, inside the 50 to 80% band); lowest seed 1, rule 0', () => {
    const s = sweepSeeds({ ...DEFAULT_OPTIONS, mode: 'physical' });
    expect(s.failing).toHaveLength(132);
    expect(s.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.5);
    expect(s.failing.length / SEEDS_TOTAL).toBeLessThan(0.8);
    const verdict = forSeeds(SEED_RANGE, hlcScenario({ ...DEFAULT_OPTIONS, mode: 'physical' }), RULES);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.seed).toBe(BROKEN_SEED);
      expect(verdict.rule).toBe(0);
      expect(verdict.message).toBe('receive stamped before its send');
    }
    expect(BROKEN_SEED).toBeGreaterThan(0);
    expect(forSeeds(SEED_RANGE, hlcScenario(DEFAULT_OPTIONS), RULES)).toEqual({ ok: true, seeds: 200 });
    // The same seed passes with the full HLC: the fixed mode on the pinned seed.
    expect(runHlcSeed(DEFAULT_OPTIONS, BROKEN_SEED).violation).toBeNull();
  });

  it('an HLC that ignores the wall reading of the message fails the same rule on 132 of 200 seeds', () => {
    const s = sweepSeeds({ ...DEFAULT_OPTIONS, mode: 'ignoreMessage' });
    expect(s.failing).toHaveLength(132);
    expect(s.rule).toBe(0);
    expect(s.lowestFailing).toBe(BROKEN_SEED);
  });

  it('an HLC that follows a clock stepping back fails "strictly increasing" on 58 of 200 seeds (29%, inside the 10 to 40% band); lowest seed 5, rule 1', () => {
    const s = sweepSeeds({ ...DEFAULT_OPTIONS, mode: 'backwards' });
    expect(s.failing).toHaveLength(58);
    expect(s.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.1);
    expect(s.failing.length / SEEDS_TOTAL).toBeLessThan(0.4);
    const verdict = forSeeds(SEED_RANGE, hlcScenario({ ...DEFAULT_OPTIONS, mode: 'backwards' }), RULES);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.seed).toBe(BROKEN_SEED_BACKWARDS);
      expect(verdict.rule).toBe(1);
      expect(verdict.message).toMatch(/stamp did not increase$/);
    }
    expect(seedFor('backwards')).toBe(5);
    expect(runHlcSeed({ ...DEFAULT_OPTIONS, clockSteps: true }, BROKEN_SEED_BACKWARDS).violation).toBeNull();
  });

  it('while every clock is within epsilon, l - pt stays inside the largest gap between the clocks drawn for the run, computed per seed', () => {
    for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
      const run = runHlcSeed({ ...DEFAULT_OPTIONS, epsilon: 50 }, seed);
      expect(run.maxLead).toBeLessThanOrEqual(run.bound + 1e-9);
      expect(run.bound).toBeLessThanOrEqual(100 + 1e-9); // at most 2 epsilon
      expect(run.bound).toBeCloseTo(epsilonMax(drawnOffsets(seed, 50)), 12);
    }
  });

  it('with one clock 5 s ahead the lead leaves the bound while causality still holds', () => {
    const run = runHlcSeed({ ...DEFAULT_OPTIONS, farAheadMs: 5000 }, 1);
    expect(run.maxLead).toBeGreaterThan(run.bound);
    expect(run.maxLead).toBeGreaterThan(4000);
    expect(run.violation).toBeNull();
    expect(expectCaption(boundCaption({ options: { ...DEFAULT_OPTIONS, farAheadMs: 5000 }, run, sweepFailing: 0, outside: true }))).toContain('past the bound');
  });

  it('the plan sends three messages 30 ms apart between different nodes, and seeds 0 and the largest seed run to the end', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = plan(seed);
      expect(p).toHaveLength(3);
      for (const m of p) expect(m.from).not.toBe(m.to);
      expect(p[1].at - p[0].at).toBeGreaterThanOrEqual(26);
    }
    for (const seed of [0, SEED_MAX]) expect(runHlcSeed(DEFAULT_OPTIONS, seed).logs.length).toBeGreaterThan(5);
  });

  it('try-this 4: the largest l - pt is inside the line, and far ahead it leaves it', () => {
    const near = runHlcSeed(DEFAULT_OPTIONS, 1);
    expect(lesson.tryThis[3]).toContain(`${near.maxLead.toFixed(1)} ms against the line at ${near.bound.toFixed(1)} ms`);
    expect(near.maxLead).toBeLessThanOrEqual(near.bound);
  });

  it('try-this 5: plain physical timestamps fail on the pinned seed and on 132 of 200 seeds', () => {
    expect(runHlcSeed({ ...DEFAULT_OPTIONS, mode: 'physical' }, BROKEN_SEED).violation).toMatchObject({ rule: 0 });
    expect(lesson.tryThis[4]).toContain('132 of 200 seeds');
    expect(lesson.tryThis[4]).toContain('seed 1 is the pinned failing seed');
  });
});
