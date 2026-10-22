import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forSeeds } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import { SEED_MAX } from '../../core/seed';
import { raceCaption, snapshotCaption, twoShardCaption } from './captions';
import lesson from './index';
import {
  BROKEN_SEED, BROKEN_SEED_EPSILON, DEFAULT_OPTIONS, drawFor, externalConsistency, raceInput, raceScenario, runRaceSeed, sweepModel, sweepRace,
  type Options,
} from './seeded';
import {
  DELTA_MS, EPSILON_MS, ERROR_MS, GAP_MS, PRESET_TWO_SHARD, READ_TS, SEED_RANGE, SEEDS_TOTAL, X_VERSIONS, Y_VERSIONS, breakProbability, breakProbabilityByQuadrature, clampReadTs, commitWaitMs,
  drawRace, hotKeyBound, latencyBillMs, orderedByFormula, race, twoShardCommit, versionAt, versionAtBinary, type Version,
} from './truetime';

const wait = (o: Options): Options => ({ ...o, commitWait: true });

describe('hand-worked vectors from the spec', () => {
  it('vector 1, commit wait works: eps 7, e1 +5, e2 -5: s1 = 112, acknowledged at 114 (a wait of 14), T2 at 114 gets 116 and its read sees x@112', () => {
    const r = race({ epsilon: 7, e1: 5, e2: -5, gap: 0, commitWait: true });
    expect(r).toMatchObject({ t1: 100, s1: 112, waitMs: 14, ackAt: 114, t2: 114, s2: 116, ordered: true, sees: true });
    expect(5 - -5).toBeLessThan(14); // e1 - e2 = 10 is below 2 eps
  });

  it('vector 2, the skipped wait: acknowledged at 100, T2 at 103 gets 105 < 112 and misses the write (w + g + e2 - e1 = -7)', () => {
    const input = { epsilon: 7, e1: 5, e2: -5, gap: 3, commitWait: false };
    expect(race(input)).toMatchObject({ s1: 112, ackAt: 100, t2: 103, s2: 105, ordered: false, sees: false });
    expect(0 + 3 + -5 - 5).toBe(-7);
    expect(orderedByFormula(input)).toBe(false);
  });

  it('vector 3, underestimated eps: eps 1 assumed, errors as above: s1 = 106, acknowledged at 102, T2 at 103 gets 99, a violation', () => {
    expect(race({ epsilon: 1, e1: 5, e2: -5, gap: 1, commitWait: true })).toMatchObject({ s1: 106, ackAt: 102, t2: 103, s2: 99, ordered: false });
  });

  it('a tie in timestamps is a violation, although the read at the tied timestamp still sees the write', () => {
    // wait 0, gap 0, e2 = e1 + 0: s2 = s1.
    const r = race({ epsilon: 3, e1: 4, e2: 4, gap: 0, commitWait: false });
    expect(r.s2).toBe(r.s1);
    expect(r.ordered).toBe(false);
    expect(r.sees).toBe(true);
  });

  it('vector 5, the latency bill and the hot-key bound: 2, 8, 14, 20, 40 ms and 500, 125, 71.4, 50, 25 writes a second', () => {
    expect([1, 4, 7, 10, 20].map(latencyBillMs)).toEqual([2, 8, 14, 20, 40]);
    expect([1, 4, 7, 10, 20].map((e) => Number((hotKeyBound(e) as number).toFixed(1)))).toEqual([500, 125, 71.4, 50, 25]);
    expect(hotKeyBound(0)).toBeNull();
    expect(commitWaitMs(0, true)).toBe(0);
  });
});

describe('the commit-wait rule, derived by search rather than by the 2 eps formula', () => {
  it('the first true time at which TT.now().earliest exceeds the timestamp is 2 eps after the start, for every (eps, e1) on a grid', () => {
    for (const epsilon of [0.5, 1, 3, 7, 20]) {
      for (const e1 of [-25, -7, 0, 4, 25]) {
        const t1 = 100;
        const s = t1 + e1 + epsilon; // TT.now().latest at the start
        let t = t1;
        while (t + e1 - epsilon <= s) t += 0.01; // earliest = clock - eps, clock = true + e1
        expect(t - t1, `eps ${epsilon} e1 ${e1}`).toBeCloseTo(2 * epsilon, 1);
      }
    }
  });

  it('the verdict s2 > s1 equals the closed condition w + g + e2 - e1 > 0 on a grid of 4 x 11 x 11 x 9 = 4,356 races (exact, integers)', () => {
    let cases = 0;
    for (const commitWait of [false, true]) {
      for (const epsilon of [0, 3]) {
        for (let e1 = -25; e1 <= 25; e1 += 5) {
          for (let e2 = -25; e2 <= 25; e2 += 5) {
            for (let gap = 0; gap <= 20; gap += 2.5) {
              const input = { epsilon, e1, e2, gap, commitWait };
              expect(race(input).ordered, JSON.stringify(input)).toBe(orderedByFormula(input));
              cases++;
            }
          }
        }
      }
    }
    expect(cases).toBe(4 * 11 * 11 * 9);
  });

  it('with the wait on, every pair of clocks strictly inside eps of true time is ordered, whatever the gap; a clock outside it can break the order', () => {
    const epsilon = 7;
    for (let e1 = -6.5; e1 <= 6.5; e1 += 0.5) {
      for (let e2 = -6.5; e2 <= 6.5; e2 += 0.5) {
        for (const gap of [0, 0.5, 5, 20]) {
          expect(race({ epsilon, e1, e2, gap, commitWait: true }).ordered).toBe(true);
        }
      }
    }
    expect(race({ epsilon, e1: 25, e2: -25, gap: 0, commitWait: true }).ordered).toBe(false);
  });

  it('the ordered pair always sees the write; a violation misses it unless the timestamps tie', () => {
    for (let e1 = -25; e1 <= 25; e1 += 5) {
      for (let e2 = -25; e2 <= 25; e2 += 5) {
        const r = race({ epsilon: 7, e1, e2, gap: 2, commitWait: false });
        if (r.ordered) expect(r.sees).toBe(true);
        else if (r.s2 < r.s1) expect(r.sees).toBe(false);
      }
    }
  });
});

describe('the exact fraction of broken races', () => {
  const cases = [
    { delta: 7, epsilon: 7, gapMax: 5, commitWait: false, want: 0.3427 },
    { delta: 7, epsilon: 1, gapMax: 5, commitWait: true, want: 0.2355 },
    { delta: 7, epsilon: 3, gapMax: 5, commitWait: true, want: 0.0825 },
    { delta: 7, epsilon: 7, gapMax: 5, commitWait: true, want: 0 },
  ];

  it('the closed form gives 34.27%, 23.55%, 8.25% and 0 for the spec\'s four settings', () => {
    for (const c of cases) expect(breakProbability(c)).toBeCloseTo(c.want, 3);
  });

  it('the closed form equals a midpoint-rule integral of the triangular tail, on a grid of (delta, eps, G, wait)', () => {
    for (const delta of [0, 1, 7, 25]) {
      for (const epsilon of [0, 1, 7, 20]) {
        for (const gapMax of [0, 5, 20]) {
          for (const commitWait of [false, true]) {
            const o = { delta, epsilon, gapMax, commitWait };
            if (delta === 0) continue; // the degenerate point is checked by hand below
            expect(breakProbability(o), JSON.stringify(o)).toBeCloseTo(breakProbabilityByQuadrature(o), 6);
          }
        }
      }
    }
  });

  it('the degenerate settings: perfect clocks break only when there is neither a wait nor a gap (a tie)', () => {
    expect(breakProbability({ delta: 0, epsilon: 0, gapMax: 0, commitWait: false })).toBe(1);
    expect(breakProbability({ delta: 0, epsilon: 0, gapMax: 5, commitWait: false })).toBe(0);
    expect(breakProbability({ delta: 0, epsilon: 5, gapMax: 0, commitWait: true })).toBe(0);
    expect(breakProbability({ delta: 25, epsilon: 20, gapMax: 20, commitWait: true })).toBeGreaterThanOrEqual(0);
  });

  it('10,000 seeded races land within 3 standard errors of the closed form (Monte Carlo)', () => {
    for (const c of cases.slice(0, 3)) {
      const rnd = mulberry32(2026);
      let broken = 0;
      const n = 10_000;
      for (let k = 0; k < n; k++) {
        const d = drawRace(rnd, c.delta, c.gapMax);
        if (!race({ epsilon: c.epsilon, ...d, commitWait: c.commitWait }).ordered) broken++;
      }
      const p = breakProbability(c);
      expect(Math.abs(broken / n - p)).toBeLessThanOrEqual(3 * Math.sqrt((p * (1 - p)) / n));
    }
  });
});

describe('the seeded leg on distSim: the harness and the model agree, external consistency asserted after every event', () => {
  it('the harness timestamps equal the model\'s on all 200 seeds, with and without commit wait', () => {
    for (const o of [DEFAULT_OPTIONS, wait(DEFAULT_OPTIONS), { ...wait(DEFAULT_OPTIONS), epsilon: 1 }]) {
      for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
        const r = runRaceSeed(o, seed);
        expect(r.observed.ts1!).toBeCloseTo(r.model.s1, 2);
        expect(r.observed.ts2!).toBeCloseTo(r.model.s2, 2);
        expect(r.observed.seen).toBe(r.model.s1 <= r.model.s2);
        expect(r.violation === null).toBe(r.model.ordered || r.model.s2 === r.model.s1 ? r.model.ordered : false);
      }
    }
  });

  it('broken (a), commit wait off at eps 7, delta 7, G 5: 71 of 200 seeds (35.5%, inside the 25 to 45% band, closed form 34.3%); lowest failing seed 2', () => {
    const s = sweepRace(DEFAULT_OPTIONS);
    expect(s.failing).toHaveLength(71);
    expect(s.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.25);
    expect(s.failing.length / SEEDS_TOTAL).toBeLessThan(0.45);
    const verdict = forSeeds(SEED_RANGE, raceScenario(DEFAULT_OPTIONS), [externalConsistency]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.seed).toBe(BROKEN_SEED);
      expect(verdict.rule).toBe(0);
      expect(verdict.message).toBe("T2 started after T1's ack but timestamped earlier");
    }
    expect(BROKEN_SEED).toBeGreaterThan(0);
    // The seed-free hand schedule is vector 2 above. The same seed passes with the wait on.
    expect(runRaceSeed(wait(DEFAULT_OPTIONS), BROKEN_SEED).violation).toBeNull();
  });

  it('broken (b), eps underestimated to 1 with the wait on: 47 of 200 seeds (23.5%, inside the 15 to 35% band, closed form 23.6%)', () => {
    const o = { ...wait(DEFAULT_OPTIONS), epsilon: 1 };
    const s = sweepRace(o);
    expect(s.failing).toHaveLength(47);
    expect(s.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.15);
    expect(s.failing.length / SEEDS_TOTAL).toBeLessThan(0.35);
    expect(s.lowestFailing).toBe(BROKEN_SEED_EPSILON);
    expect(sweepModel(o)).toBe(47);
  });

  it('fixed: the wait at eps equal to delta passes all 200 seeds, and a clock past eps (delta 25, eps 7) brings the violation back on 48', () => {
    expect(sweepRace(wait(DEFAULT_OPTIONS)).failing).toEqual([]);
    expect(forSeeds(SEED_RANGE, raceScenario(wait(DEFAULT_OPTIONS)), [externalConsistency])).toEqual({ ok: true, seeds: 200 });
    const far = { ...wait(DEFAULT_OPTIONS), delta: 25 };
    expect(sweepRace(far).failing).toHaveLength(48);
    expect(sweepModel(far)).toBe(48);
  });

  it('the pure sweep and the distSim sweep count the same on four settings', () => {
    for (const o of [DEFAULT_OPTIONS, wait(DEFAULT_OPTIONS), { ...wait(DEFAULT_OPTIONS), epsilon: 1 }, { ...wait(DEFAULT_OPTIONS), epsilon: 3 }]) {
      expect(sweepModel(o)).toBe(sweepRace(o).failing.length);
    }
  });

  it('every control at its extremes: eps 0 and 20, delta 0 and 25, G 0 and 20, fixed errors at plus and minus 25, seeds 0 and the largest seed', () => {
    for (const epsilon of [EPSILON_MS.min, EPSILON_MS.max]) {
      for (const delta of [DELTA_MS.min, DELTA_MS.max]) {
        for (const gapMax of [GAP_MS.min, GAP_MS.max]) {
          for (const commitWait of [false, true]) {
            for (const seed of [0, SEED_MAX]) {
              const o: Options = { epsilon, delta, gapMax, commitWait };
              const r = runRaceSeed(o, seed);
              expect(Number.isFinite(r.model.s2)).toBe(true);
              expect(r.observed.ts1!).toBeCloseTo(r.model.s1, 2);
            }
          }
        }
      }
    }
    for (const e of [ERROR_MS.min, ERROR_MS.max]) {
      const o: Options = { ...DEFAULT_OPTIONS, fixedErrors: { e1: e, e2: -e } };
      expect(drawFor(1, o)).toMatchObject({ e1: e, e2: -e });
      expect(raceInput(1, o).e1).toBe(e);
      expect(runRaceSeed(o, 1).observed.ts1!).toBeCloseTo(100 + e + 7, 2);
    }
    expect(sweepModel({ ...DEFAULT_OPTIONS, delta: 0, gapMax: 0 })).toBe(200); // perfect clocks, no gap, no wait: every race ties
  });
});

describe('scene 1: snapshot reads', () => {
  it('the spec table: a read at 4 returns no version, 5 a, 11 a, 12 b, 19 b, 20 c', () => {
    const at = (t: number) => versionAt(X_VERSIONS, t)?.value ?? null;
    expect([4, 5, 11, 12, 19, 20].map(at)).toEqual([null, 'a', 'a', 'b', 'b', 'c']);
  });

  it('the transaction that wrote x@12 and y@12 is visible on both shards or neither, at every read timestamp from 0 to 30', () => {
    for (let t = READ_TS.min; t <= READ_TS.max; t++) {
      const sawX = (versionAt(X_VERSIONS, t)?.at ?? 0) >= 12;
      const sawY = (versionAt(Y_VERSIONS, t)?.at ?? 0) >= 12;
      expect(sawX, `t ${t}`).toBe(sawY);
    }
    expect(versionAt(X_VERSIONS, 11)?.value).toBe('a');
    expect(versionAt(Y_VERSIONS, 11)).toBeNull();
  });

  it('a linear scan equals binary search over 500 seeded version lists', () => {
    const rnd = mulberry32(5);
    for (let k = 0; k < 500; k++) {
      const stamps = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => Math.floor(rnd() * 40)))].sort((a, b) => a - b);
      const versions: Version[] = stamps.map((at, i) => ({ at, value: `v${i}` }));
      for (let t = -2; t <= 42; t++) expect(versionAtBinary(versions, t)).toEqual(versionAt(versions, t));
    }
  });

  it('a read timestamp outside 0 to 30 clamps', () => {
    expect([clampReadTs(-3), clampReadTs(0), clampReadTs(30), clampReadTs(31)]).toEqual([0, 0, 30, 30]);
  });

  it('the caption names what each shard returns and whether the transaction is visible', () => {
    expect(expectCaption(snapshotCaption({ at: 11, x: X_VERSIONS, y: Y_VERSIONS, txnAt: 12 }))).toContain('invisible on both shards');
    expect(expectCaption(snapshotCaption({ at: 12, x: X_VERSIONS, y: Y_VERSIONS, txnAt: 12 }))).toContain('visible on both shards');
    expect(expectCaption(snapshotCaption({ at: 4, x: X_VERSIONS, y: Y_VERSIONS, txnAt: 12 }))).toContain('x: no version');
  });
});

describe('scene 3: two-phase commit', () => {
  it('the preset: prepare timestamps 107 and 110 give commit timestamp 110 and a wait of 17 ms, checked by stepping the coordinator\'s clock', () => {
    const r = twoShardCommit(PRESET_TWO_SHARD);
    expect(r.prepares).toEqual([107, 110]);
    expect(r.commitTimestamp).toBe(110);
    let c = PRESET_TWO_SHARD.coordinatorClock;
    while (c - PRESET_TWO_SHARD.epsilon <= r.commitTimestamp) c += 0.01;
    expect(c - PRESET_TWO_SHARD.coordinatorClock).toBeCloseTo(r.waitMs, 1);
    expect(r.waitMs).toBe(17);
  });

  it('the commit timestamp is the maximum of the prepares and the coordinator\'s own latest, over a grid of clocks and eps 1 to 10', () => {
    for (let epsilon = 1; epsilon <= 10; epsilon += 3) {
      for (let a = 90; a <= 130; a += 20) {
        for (let b = 90; b <= 130; b += 20) {
          for (let co = 90; co <= 130; co += 20) {
            const r = twoShardCommit({ epsilon, clocks: [a, b], coordinatorClock: co });
            expect(r.commitTimestamp).toBe(Math.max(a, b, co) + epsilon);
            expect(r.waitMs).toBeGreaterThanOrEqual(epsilon);
          }
        }
      }
    }
  });

  it('try-this 5: the preset reads commit timestamp 110 and a wait of 17 ms, and the caption quotes the same', () => {
    expect(lesson.tryThis[4]).toContain('107 and 110 give commit timestamp 110, and a wait of 17 ms');
    expect(expectCaption(twoShardCaption({ result: twoShardCommit(PRESET_TWO_SHARD), epsilon: 7 }))).toContain('commit timestamp is the maximum');
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: seed 2 with the wait off timestamps T2 below T1 and its read misses the write; the sweep reads 71 of 200 beside 34.3%', () => {
    const r = race(raceInput(BROKEN_SEED, DEFAULT_OPTIONS));
    expect(r.ordered).toBe(false);
    expect(r.sees).toBe(false);
    expect(r.t2).toBeGreaterThanOrEqual(r.ackAt);
    expect(lesson.tryThis[0]).toContain('71 of 200 seeds, 35.5%');
    expect(lesson.tryThis[0]).toContain('34.3% in closed form');
    expect(lesson.tryThis[0]).toContain(`seed ${BROKEN_SEED}`);
  });

  it('try-this 2: the wait moves the acknowledgement 14 ms, T2 is ordered on this seed and the sweep falls to 0', () => {
    const r = race(raceInput(BROKEN_SEED, wait(DEFAULT_OPTIONS)));
    expect(r.waitMs).toBe(14);
    expect(r.ordered).toBe(true);
    expect(lesson.tryThis[1]).toContain('14 ms later');
    expect(lesson.tryThis[1]).toContain('falls to 0 of 200');
  });

  it('try-this 3: eps 1 with the wait on breaks on 47 of 200 seeds, 23.5%, against 23.6% in closed form', () => {
    expect(lesson.tryThis[2]).toContain('47 of 200 seeds, 23.5%');
    expect(lesson.tryThis[2]).toContain('23.6% in closed form');
  });

  it('try-this 4: delta 25 with eps 7 breaks on 48 of 200 seeds', () => {
    expect(lesson.tryThis[3]).toContain('48 of 200 seeds');
  });

  it('the race caption states the ordering and the numbers from the model, red when T2 is earlier', () => {
    const r = race(raceInput(BROKEN_SEED, DEFAULT_OPTIONS));
    const input = raceInput(BROKEN_SEED, DEFAULT_OPTIONS);
    const text = expectCaption(raceCaption({ race: r, epsilon: 7, delta: 7, commitWait: false, e1: input.e1, e2: input.e2, fraction: 0.355, failing: 71, seeds: 200, closed: 0.3427 }));
    expect(text).toContain('T2 is timestamped earlier than T1');
    expect(text).toContain('misses the acknowledged write');
    expect(text).toContain('71 of 200 break the order, against 34.3% in closed form');
  });
});
