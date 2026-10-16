import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BANDWIDTHS, BRANCH_PRESETS, BYTES_PER_ELEMENT, DEFAULT_PRED, DEFAULT_TRIPS, DEP_LENGTH, HIDE, PATH_A_COST, PATH_B_COST, REGISTER_BITS, STALL_CURVES, TRIP_PRESETS, WARMUP_TICKS,
  WARP_SIZE, WINDOW_TICKS, windowTicks, branchReport, createHideSim, cycleReport, depInput, depVerdict, emit, hideSegments, lanesOf, nextWider, parseTrips, runScalar, runVector,
  seededTrips, steadyUtilisation, tripReport, warpsToHide, windowUtilisation, type HideParams, type TailMode,
} from './model';

/** The instruction count of the loop, worked out from the closed form: full vector ops, then the tail. */
const closedFormInstrs = (n: number, lanes: number, tail: TailMode) =>
  Math.floor(n / lanes) + (tail === 'scalar' ? n % lanes : n % lanes > 0 ? 1 : 0);

/** A reference loop generator, written differently from `emit`: walk the elements and open a new instruction when the current one is full. */
function referenceInstrCount(n: number, lanes: number, tail: TailMode): number {
  let count = 0;
  let filled = 0;
  for (let e = 0; e < n; e++) {
    const remaining = n - e;
    if (filled === 0) {
      // a new instruction starts at element e: a full vector op if a whole register of elements is left, else part of the tail
      if (remaining >= lanes) {
        count += 1;
        filled = lanes;
      } else if (tail === 'masked') {
        count += 1;
        filled = remaining;
      } else {
        count += 1;
        filled = 1;
      }
    }
    filled -= 1;
  }
  return count;
}

describe('lanes and tails', () => {
  it('lanes are register bits over 32, shown as the division', () => {
    expect(REGISTER_BITS.map(lanesOf)).toEqual([1, 4, 8, 16]);
  });

  it('instruction counts match a reference loop generator and the closed form for N = 1..64, four widths, both tail modes (512 cases)', () => {
    let cases = 0;
    for (let n = 1; n <= 64; n++) {
      for (const bits of REGISTER_BITS) {
        for (const tail of ['scalar', 'masked'] as const) {
          const lanes = lanesOf(bits);
          const got = emit(n, lanes, tail);
          expect(got.length, `n=${n} lanes=${lanes} ${tail}`).toBe(referenceInstrCount(n, lanes, tail));
          expect(got.length).toBe(closedFormInstrs(n, lanes, tail));
          // every element is handled exactly once, in order
          const touched = got.flatMap((i) => Array.from({ length: i.active }, (_, k) => i.from + k));
          expect(touched).toEqual(Array.from({ length: n }, (_, k) => k));
          cases++;
        }
      }
    }
    expect(cases).toBe(512);
  });

  it('N = 20 at 8 lanes is 2 vector ops plus a 4-element tail: 6 instructions with a scalar tail, 3 with a masked one', () => {
    const scalar = cycleReport(20, 256, 'scalar', 64);
    expect([scalar.vectorOps, scalar.tailElements, scalar.compute]).toEqual([2, 4, 6]);
    const masked = cycleReport(20, 256, 'masked', 64);
    expect([masked.vectorOps, masked.tailElements, masked.compute]).toEqual([2, 4, 3]);
  });

  it('memory cycles are the bytes moved over the bandwidth, hand-worked: 240 bytes at 64 B/cycle is 4, at 16 is 15', () => {
    expect(BYTES_PER_ELEMENT).toBe(12);
    expect(cycleReport(20, 256, 'scalar', 64).memory).toBe(Math.ceil(240 / 64));
    expect(cycleReport(20, 256, 'scalar', 16).memory).toBe(15);
    expect(cycleReport(20, 256, 'scalar', 4).memory).toBe(60);
  });

  it('cycles are the larger of compute and memory, and the bound names the larger one', () => {
    const rich = cycleReport(20, 256, 'scalar', 64);
    expect(rich).toMatchObject({ compute: 6, memory: 4, cycles: 6, bound: 'compute' });
    const poor = cycleReport(20, 256, 'scalar', 16);
    expect(poor).toMatchObject({ compute: 6, memory: 15, cycles: 15, bound: 'memory' });
    expect(cycleReport(8, 256, 'scalar', 32)).toMatchObject({ compute: 1, memory: 3, bound: 'memory' });
    // an exact tie is balanced: 4 elements, 128-bit, one op, 48 bytes at 48... use 12-byte elements and a 1-lane ladder instead
    expect(cycleReport(3, 32, 'scalar', 12).bound).toBe('balanced');
  });

  it('once memory binds, a wider register costs the same cycles, which is what "wider lanes stopped helping" asserts', () => {
    for (const n of [20, 33, 64]) {
      for (const tail of ['scalar', 'masked'] as const) {
        for (const bw of BANDWIDTHS) {
          for (const bits of REGISTER_BITS) {
            const here = cycleReport(n, bits, tail, bw);
            const wider = nextWider(bits);
            if (here.bound !== 'memory' || wider === null) continue;
            const next = cycleReport(n, wider, tail, bw);
            if (next.compute <= next.memory) expect(next.cycles).toBe(here.cycles);
          }
        }
      }
    }
  });

  it('a wider register is not always faster: N = 7 with a scalar tail takes 4 instructions at 4 lanes and 7 at 8 lanes', () => {
    expect(cycleReport(7, 128, 'scalar', 64).compute).toBe(4);
    expect(cycleReport(7, 256, 'scalar', 64).compute).toBe(7);
    expect(cycleReport(7, 256, 'scalar', 64).cycles).toBeGreaterThan(cycleReport(7, 128, 'scalar', 64).cycles);
  });

  it('N = 17 at 16 lanes has a 1-element tail that costs as many instructions as the vector op itself', () => {
    const r = cycleReport(17, 512, 'scalar', 64);
    expect([r.vectorOps, r.tailElements, r.compute]).toEqual([1, 1, 2]);
  });
});

describe('loop-carried dependence', () => {
  it('the scalar loop is a[i] = a[i - d] + 1 in order, hand-worked for d = 2 on [0, 10, 20, 30, 40]', () => {
    expect(runScalar([0, 10, 20, 30, 40], 2)).toEqual([0, 10, 1, 11, 2]);
  });

  it('a vector run reads a whole chunk before it writes: d = 1 at 4 lanes on [0, 10, 20, 30, 40] reads stale a[1..3]', () => {
    const run = runVector([0, 10, 20, 30, 40], 1, 4);
    expect(run.chunks).toHaveLength(1);
    expect(run.states[1]).toEqual([0, 1, 11, 21, 31]);
    expect(run.chunks[0].staleReads).toEqual([1, 2, 3]);
  });

  it('the vector run equals the scalar run exactly when W <= d, and differs otherwise: all 40 combinations on seeded arrays', () => {
    let checked = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const rnd = mulberry32(seed);
      const a = Array.from({ length: DEP_LENGTH }, () => 10 * Math.floor(rnd() * 1000));
      for (let d = 1; d <= 8; d++) {
        for (const w of [1, 2, 4, 8, 16]) {
          const verdict = depVerdict(a, d, w);
          expect(verdict.vectorisable, `seed ${seed} d=${d} W=${w}`).toBe(w <= d);
          if (seed === 1) checked++;
        }
      }
    }
    expect(checked).toBe(40);
  });

  it('the first wrong index is the first element whose source was overwritten in the same chunk, found by brute force', () => {
    const a = depInput();
    for (let d = 1; d <= 8; d++) {
      for (const w of [1, 2, 4, 8, 16]) {
        const verdict = depVerdict(a, d, w);
        // brute force: walk chunks, and find the first written index whose source index lies inside the chunk being written
        let first: number | null = null;
        for (let start = d; start < a.length && first === null; start += w) {
          for (let j = start; j < Math.min(start + w, a.length); j++) {
            if (j - d >= start) {
              first = j;
              break;
            }
          }
        }
        expect(verdict.firstWrong, `d=${d} W=${w}`).toBe(first);
      }
    }
  });

  it('the default array holds distinct values, so a stale read cannot match by luck', () => {
    const a = depInput();
    expect(new Set(a).size).toBe(a.length);
  });

  it('the staleReads of a chunk are exactly the elements it reads and also writes', () => {
    const run = runVector(depInput(), 2, 8);
    for (const c of run.chunks) {
      const reads = new Set(Array.from({ length: c.size }, (_, k) => c.start + k - 2));
      const writes = new Set(Array.from({ length: c.size }, (_, k) => c.start + k));
      expect(c.staleReads).toEqual([...reads].filter((x) => writes.has(x)));
    }
  });
});

/** Each lane's own instruction trace for the branch, generated independently of the warp model. */
const laneTrace = (takesA: boolean): string[] =>
  takesA ? Array.from({ length: PATH_A_COST }, (_, k) => `A${k}`) : Array.from({ length: PATH_B_COST }, (_, k) => `B${k}`);

describe('warp divergence', () => {
  it('the warp cost is the size of the merged lockstep trace of the lanes: hand-worked 16 true is 10, all true is 6, none true is 4', () => {
    expect(branchReport(BRANCH_PRESETS[3].pred).issued).toBe(10);
    expect(branchReport(BRANCH_PRESETS[0].pred).issued).toBe(6);
    expect(branchReport(Array.from({ length: WARP_SIZE }, () => false)).issued).toBe(4);
  });

  it('matches the union of independent lane traces for 300 seeded predicates', () => {
    const rnd = mulberry32(11);
    for (let t = 0; t < 300; t++) {
      const p = rnd();
      const pred = Array.from({ length: WARP_SIZE }, () => rnd() < p);
      const merged = new Set(pred.flatMap(laneTrace));
      const r = branchReport(pred);
      expect(r.issued).toBe(merged.size);
      const useful = pred.reduce((s, lane) => s + laneTrace(lane).length, 0);
      expect(r.utilisation).toBeCloseTo(useful / (WARP_SIZE * merged.size), 12);
    }
  });

  it('utilisation is 1 when the warp agrees (all or none) and falls when it splits', () => {
    expect(branchReport(BRANCH_PRESETS[0].pred).utilisation).toBe(1);
    expect(branchReport(Array.from({ length: WARP_SIZE }, () => false)).utilisation).toBe(1);
    expect(branchReport(DEFAULT_PRED).utilisation).toBeCloseTo((16 * 6 + 16 * 4) / (32 * 10), 12);
    expect(branchReport(BRANCH_PRESETS[2].pred).utilisation).toBeLessThan(0.7);
  });

  it('all 32 predicate rows of five bits and a sample of full rows are valid (the cost is always positive)', () => {
    for (let mask = 0; mask < 1 << 12; mask++) {
      const pred = Array.from({ length: WARP_SIZE }, (_, i) => ((mask >> (i % 12)) & 1) === 1);
      expect(branchReport(pred).issued).toBeGreaterThan(0);
    }
  });

  it('loop utilisation is sum(n) / (32 max n) on seeded trip counts, and exactly 1 when all counts are equal', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const trips = seededTrips(seed);
      const sum = trips.reduce((a, b) => a + b, 0);
      expect(tripReport(trips).utilisation).toBeCloseTo(sum / (32 * Math.max(...trips)), 12);
    }
    expect(tripReport(TRIP_PRESETS[0].trips).utilisation).toBe(1);
    expect(tripReport(Array.from({ length: 32 }, () => 5)).utilisation).toBe(1);
    expect(tripReport(DEFAULT_TRIPS).utilisation).toBeLessThan(1);
  });

  it('a warp whose lanes do no work has no utilisation to report', () => {
    expect(tripReport(Array.from({ length: 32 }, () => 0))).toMatchObject({ issued: 0, utilisation: null });
  });

  it('the trip-count field refuses wrong counts, negatives, over 64, decimals and empty text with the stated message', () => {
    const ok = Array.from({ length: 32 }, (_, i) => i).join(', ');
    expect(parseTrips(ok)).toMatchObject({ ok: true });
    expect(parseTrips('')).toMatchObject({ ok: false });
    expect(parseTrips('1 2 3')).toMatchObject({ ok: false, error: expect.stringContaining('exactly 32') });
    expect(parseTrips(ok.replace('5,', '-5,'))).toMatchObject({ ok: false, error: "A trip count can't be negative." });
    expect(parseTrips(ok.replace('5,', '65,'))).toMatchObject({ ok: false, error: 'A trip count goes up to 64.' });
    expect(parseTrips(ok.replace('5,', '2.5,'))).toMatchObject({ ok: false, error: expect.stringContaining('whole number') });
    expect(parseTrips(ok.replace('5,', '1e3,'))).toMatchObject({ ok: false });
  });
});

describe('latency hiding', () => {
  const grid: HideParams[] = [];
  for (const warps of [1, 3, 6, 12]) for (const compute of [1, 2, 4, 8]) for (const stall of [10, 30, 60, 100]) grid.push({ warps, compute, stall });

  it('steady utilisation equals min(1, W c / (c + L)) to rounding over every control combination: the window is a whole number of periods', () => {
    let checked = 0;
    for (let warps = 1; warps <= 16; warps++) {
      for (const compute of [1, 3, 6, 8]) {
        for (const stall of [10, 40, 90, 100]) {
          const p = { warps, compute, stall };
          const w = windowTicks(p);
          expect(w % (compute + stall)).toBe(0);
          expect(w).toBeGreaterThanOrEqual(WINDOW_TICKS);
          expect(Math.abs(steadyUtilisation(p) - Math.min(1, (warps * compute) / (compute + stall))), `W${warps} c${compute} L${stall}`).toBeLessThan(1e-9);
          checked++;
        }
      }
    }
    expect(checked).toBe(256);
  });

  it('steady utilisation is within 2% of min(1, W c / (c + L)) over a 4 x 4 x 4 grid', () => {
    expect(grid).toHaveLength(64);
    for (const p of grid) {
      const sim = createHideSim(p);
      const measured = windowUtilisation(sim, WARMUP_TICKS, WARMUP_TICKS + windowTicks(p));
      const expected = Math.min(1, (p.warps * p.compute) / (p.compute + p.stall));
      expect(Math.abs(measured - expected), `W=${p.warps} c=${p.compute} L=${p.stall}: ${measured} vs ${expected}`).toBeLessThan(0.02);
      expect(steadyUtilisation(p)).toBe(measured);
    }
  });

  it('the same seed gives the same history, and at(k) equals running k steps', () => {
    const p = { warps: 5, compute: 3, stall: 20 };
    const a = createHideSim(p, 3);
    const b = createHideSim(p, 3);
    a.run(120);
    expect(b.at(120)).toEqual(a.state);
    expect(createHideSim(p, 3).at(77)).toEqual(a.history[77]);
    expect(a.history.length).toBe(121);
  });

  it('at most one warp issues each tick, and a stalled warp never issues', () => {
    const p = { warps: 6, compute: 2, stall: 15 };
    const sim = createHideSim(p);
    sim.run(300);
    for (let t = 1; t <= 300; t++) {
      const s = sim.history[t];
      expect(s.status.filter((x) => x === 'run').length).toBe(s.issued >= 0 ? 1 : 0);
      s.status.forEach((x, w) => {
        if (sim.history[t - 1].warps[w].stalled) expect(x).toBe('stall');
      });
    }
  });

  it('every warp spends exactly c run ticks per c + L ticks once it is running alone', () => {
    const sim = createHideSim({ warps: 1, compute: 3, stall: 10 });
    sim.run(26);
    const runs = sim.history.slice(1, 27).map((s) => s.status[0]);
    expect(runs.slice(0, 13)).toEqual(['run', 'run', 'run', ...Array.from({ length: 10 }, () => 'stall')]);
    expect(runs.slice(13, 26)).toEqual(runs.slice(0, 13));
  });

  it('warps needed to hide the stall is (c + L) over c, rounded up, and that many warps keep the slot busy', () => {
    for (const compute of [1, 2, 4, 8]) {
      for (const stall of [10, 40, 100]) {
        const need = warpsToHide(compute, stall);
        expect(need).toBe(Math.ceil((compute + stall) / compute));
        if (need <= HIDE.warps.max) {
          expect(steadyUtilisation({ warps: need, compute, stall })).toBeGreaterThan(0.99);
          if (need > 1) expect(steadyUtilisation({ warps: need - 1, compute, stall })).toBeLessThan(0.99);
        }
      }
    }
    expect(STALL_CURVES).toEqual([10, 40, 100]);
  });

  it('the Gantt segments cover every tick of every warp exactly once', () => {
    const sim = createHideSim({ warps: 4, compute: 4, stall: 40 });
    const segs = hideSegments(sim, 60);
    for (let w = 0; w < 4; w++) {
      const mine = segs.filter((s) => s.warp === w).sort((a, b) => a.start - b.start);
      expect(mine[0].start).toBe(0);
      expect(mine.at(-1)!.end).toBe(60);
      mine.slice(1).forEach((s, i) => expect(s.start).toBe(mine[i].end));
    }
  });
});
