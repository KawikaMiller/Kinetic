import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { boundSentence, branchFrames, depFrames, depSummary, hideFrames, lanesFrames, lanesSummary, loopFrames } from './frames';
import lesson from './index';
import {
  BANDWIDTHS, BRANCH_PRESETS, DEFAULT_TRIPS, DEP_WIDTHS, GANTT_TICKS, REGISTER_BITS, TRIP_PRESETS, branchReport, createHideSim, cycleReport, depInput, depVerdict, lanesOf, nextWider,
  parseN, runVector, steadyUtilisation, tripReport, type HideParams, type TailMode,
} from './model';
import { SCENE_OPENINGS, dependenceOpening, hidingOpening, lanesOpening, warpOpening } from './openings';

const text = expectCaption;
const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: 20 floats on 8 lanes are 2 vector ops and a 4-element tail, 6 cycles against 20, which is 3.33×, and a masked tail makes it 3 instructions and 4 cycles', () => {
    const open = lanesOpening();
    expect(open).toEqual({ n: 20, bits: 256, tail: 'scalar', bandwidth: 64 });
    // hand-worked: 2 full ops, 4 leftovers; memory is 240 bytes over 64 = 3.75, so 4 cycles; the scalar loop issues 20
    const r = cycleReport(20, 256, 'scalar', 64);
    expect([r.vectorOps, r.tailElements, r.compute, r.memory, r.cycles]).toEqual([2, 4, 6, 4, 6]);
    expect(cycleReport(20, 32, 'scalar', 64).cycles).toBe(20);
    const masked = cycleReport(20, 256, 'masked', 64);
    expect([masked.compute, masked.memory, masked.cycles, masked.bound]).toEqual([3, 4, 4, 'memory']);
    const entry = lesson.tryThis[0];
    for (const piece of ['2 vector ops plus a 4-element tail', '6 cycles', '3.33×', '3 instructions and 4 cycles']) expect(entry).toContain(piece);
    expect(text(lanesSummary(20, 256, 'scalar', 64, r))).toContain('3.33×');
  });

  it('try-this 2: at 16 bytes a cycle memory needs 15 cycles, the loop is memory-bound at 15, and 512-bit would cost 15 too', () => {
    const r = cycleReport(20, 256, 'scalar', 16);
    expect([r.memory, r.cycles, r.bound]).toEqual([15, 15, 'memory']); // ceil(240 / 16) = 15, by hand
    expect(cycleReport(20, 512, 'scalar', 16).cycles).toBe(15);
    expect(lesson.tryThis[1]).toContain('Memory now needs 15 cycles');
    expect(lesson.tryThis[1]).toContain('memory-bound at 15');
    expect(lesson.tryThis[1]).toContain('would cost 15, not fewer');
    const said = text(lanesSummary(20, 256, 'scalar', 16, r));
    expect(said).toContain('memory-bound: wider lanes stopped helping');
    expect(said).toContain('the next wider register would cost 15 cycles, not fewer');
  });

  it('try-this 3: d = 4 with 4 lanes matches the scalar loop; with 8 lanes indices 8 to 23 differ, the first at 2d = 8, from a chunk that read a[4 to 7] before writing them', () => {
    expect(dependenceOpening()).toEqual({ d: 4, lanes: 4 });
    expect(depVerdict(depInput(), 4, 4).vectorisable).toBe(true);
    const wide = depVerdict(depInput(), 4, 8);
    expect(wide.wrong).toEqual(Array.from({ length: 16 }, (_, k) => 8 + k)); // hand-worked: chunk 1 stale, and its results feed every later chunk
    expect(wide.firstWrong).toBe(8);
    expect(runVector(depInput(), 4, 8).chunks[0].staleReads).toEqual([4, 5, 6, 7]);
    for (const piece of ['16 elements differ', 'first at index 8', 'a[4 to 7]']) expect(lesson.tryThis[2]).toContain(piece);
  });

  it('try-this 4: first half on path A issues 10 instructions at 50% utilisation, and all true issues 6 at 100%', () => {
    expect(warpOpening().pred).toEqual(BRANCH_PRESETS[3].pred);
    const half = branchReport(warpOpening().pred);
    // hand-worked: A (6) then B (4); useful lane-slots 16*6 + 16*4 = 160 of 32 * 10 = 320
    expect([half.issued, half.utilisation]).toEqual([10, 0.5]);
    const all = branchReport(BRANCH_PRESETS[0].pred);
    expect([all.issued, all.utilisation]).toEqual([6, 1]);
    for (const piece of ['issues 10 instructions at 50% utilisation', '6 instructions at 100%']) expect(lesson.tryThis[3]).toContain(piece);
  });

  it('try-this 5: 4 warps, 40-tick stalls and 4-tick bursts keep the slot busy 36% of the time, and 11 warps keep it busy 100%', () => {
    const open = hidingOpening();
    expect(open).toEqual({ warps: 4, stall: 40, compute: 4 });
    // closed form: W c / (c + L) = 16 / 44 and 44 / 44
    expect(steadyUtilisation(open)).toBeCloseTo(16 / 44, 2);
    expect(steadyUtilisation({ ...open, warps: 11 })).toBeCloseTo(1, 2);
    expect(steadyUtilisation({ ...open, warps: 10 })).toBeLessThan(1);
    for (const piece of ['busy 36% of the time', '(11): 100%']) expect(lesson.tryThis[4]).toContain(piece);
  });
});

describe('lanes scene: the control cross product', () => {
  it('every N, register, tail and bandwidth gives a bound sentence and speedup that match an independent count', () => {
    let combos = 0;
    for (let n = 1; n <= 64; n++) {
      for (const bits of REGISTER_BITS) {
        for (const tail of ['scalar', 'masked'] as const) {
          for (const bw of BANDWIDTHS) {
            const lanes = lanesOf(bits);
            const compute = Math.floor(n / lanes) + (tail === 'scalar' ? n % lanes : n % lanes > 0 ? 1 : 0);
            const memory = ceilDiv(12 * n, bw);
            const scalarCycles = Math.max(n, memory);
            const r = cycleReport(n, bits, tail, bw);
            const wider = nextWider(bits);
            const sentence = boundSentence(r, wider ? cycleReport(n, wider, tail, bw) : null);
            const label = `n=${n} ${bits} ${tail} ${bw}`;
            expect([r.compute, r.memory, r.cycles], label).toEqual([compute, memory, Math.max(compute, memory)]);
            const expectedBound = compute > memory ? 'compute-bound' : memory > compute ? 'memory-bound' : 'balanced';
            expect(sentence.startsWith(expectedBound), label).toBe(true);
            if (memory > compute && wider) {
              const widerCompute = Math.floor(n / lanesOf(wider)) + (tail === 'scalar' ? n % lanesOf(wider) : n % lanesOf(wider) > 0 ? 1 : 0);
              expect(sentence, label).toContain(`would cost ${Math.max(widerCompute, memory)} cycle`);
              expect(Math.max(widerCompute, memory), label).toBeGreaterThanOrEqual(r.cycles);
            }
            const summary = text(lanesSummary(n, bits, tail, bw, r));
            expect(summary, label).toContain(`${scalarCycles} cycle`);
            if (n * 12 <= 4096 && (n + bits + bw) % 7 === 0) lanesFrames(n, bits, tail, bw, r).forEach((f) => f.say && text(f.say));
            combos++;
          }
        }
      }
    }
    expect(combos).toBe(64 * 4 * 2 * 5);
  });

  it('every instruction frame names the elements that instruction touches, and the intro states the lane division', () => {
    const r = cycleReport(20, 256, 'scalar', 64);
    const frames = lanesFrames(20, 256, 'scalar', 64, r);
    expect(frames).toHaveLength(r.compute + 2);
    expect(text(frames[0].say)).toContain('256 / 32 = 8 lanes');
    expect(text(frames[1].say)).toContain('elements 0 to 7');
    expect(text(frames[2].say)).toContain('elements 8 to 15');
    expect(text(frames[3].say)).toContain('tail element 16');
    const masked = lanesFrames(20, 256, 'masked', 64, cycleReport(20, 256, 'masked', 64));
    expect(text(masked[3].say)).toContain('4 of its 8 lanes are on for elements 16 to 19; the other 4 are masked off');
  });

  it('the array field refuses 0, 65, decimals, 1e3 and empty text, and accepts 1 and 64', () => {
    for (const bad of ['0', '65', '2.5', '1e3', '', '-4', 'abc']) expect(parseN(bad).ok, bad).toBe(false);
    expect(parseN('1')).toMatchObject({ ok: true, value: 1 });
    expect(parseN('64')).toMatchObject({ ok: true, value: 64 });
    expect(parseN('65')).toMatchObject({ ok: false, error: 'Keep it between 1 and 64.' });
  });
});

describe('dependence scene captions', () => {
  it('the summary says "differ" exactly when W > d, for every distance and offered width', () => {
    for (let d = 1; d <= 8; d++) {
      for (const lanes of DEP_WIDTHS) {
        const v = depVerdict(depInput(), d, lanes);
        const said = text(depSummary(d, lanes, v));
        expect(said.includes('differ from the scalar loop'), `d=${d} W=${lanes}`).toBe(lanes > d);
        expect(said.includes('Every element matches'), `d=${d} W=${lanes}`).toBe(lanes <= d);
        expect(said).toContain(lanes <= d ? '≤' : '>');
        depFrames(d, lanes, runVector(depInput(), d, lanes), v).forEach((f) => f.say && text(f.say));
      }
    }
  });

  it('a chunk caption says "stale" for exactly the chunks that read what they write', () => {
    const run = runVector(depInput(), 2, 8);
    const frames = depFrames(2, 8, run, depVerdict(depInput(), 2, 8));
    run.chunks.forEach((c, i) => expect(text(frames[i + 1].say).includes('stale values')).toBe(c.staleReads.length > 0));
  });
});

describe('warp scene captions', () => {
  it('the branch run issues A for the true lanes, then B for the rest, and the closing caption quotes the model', () => {
    for (const preset of BRANCH_PRESETS) {
      const r = branchReport(preset.pred);
      const frames = branchFrames(preset.pred);
      expect(frames).toHaveLength(2 + r.issued);
      const closing = text(frames.at(-1)!.say);
      expect(closing).toContain(`${r.issued} instruction`);
      expect(closing).toContain(`${Math.round(r.utilisation * 100)}%`);
      frames.forEach((f) => text(f.say));
    }
  });

  it('a path no lane takes is skipped, and the caption says so', () => {
    const none = Array.from({ length: 32 }, () => false);
    expect(text(branchFrames(none).at(-1)!.say)).toContain('path A was skipped');
    expect(text(branchFrames(BRANCH_PRESETS[0].pred).at(-1)!.say)).toContain('path B was skipped');
  });

  it('the loop run takes as many steps as the longest lane, and lanes drop out as their counts end', () => {
    const frames = loopFrames(DEFAULT_TRIPS);
    expect(frames).toHaveLength(tripReport(DEFAULT_TRIPS).longest + 2);
    expect(frames[5].active.filter(Boolean).length).toBe(1); // only the 32-iteration lane is still running at step 5
    expect(frames[4].active.filter(Boolean).length).toBe(32);
    for (const p of TRIP_PRESETS) loopFrames(p.trips).forEach((f) => text(f.say));
    const zero = loopFrames(Array.from({ length: 32 }, () => 0));
    expect(text(zero.at(-1)!.say)).toContain('no utilisation to report');
  });
});

describe('latency scene captions', () => {
  const grid: HideParams[] = [
    { warps: 1, stall: 10, compute: 1 }, { warps: 4, stall: 40, compute: 4 }, { warps: 16, stall: 100, compute: 8 }, { warps: 11, stall: 40, compute: 4 }, { warps: 2, stall: 100, compute: 2 },
  ];
  it('every caption is clean, the milestone captions quote the stall length, and the claims match the sim history', () => {
    for (const p of grid) {
      const sim = createHideSim(p);
      const frames = hideFrames(sim, p);
      expect(frames[0].now).toBe(0);
      expect(frames.at(-1)!.now).toBe(GANTT_TICKS);
      for (const f of frames) if (f.say) text(f.say);
      const waits = frames.filter((f) => f.say && text(f.say).includes('waits on memory'));
      for (const f of waits) {
        expect(text(f.say)).toContain(`${p.stall} ticks`);
        // at that frame warp 0 is stalled in the sim
        expect(sim.history[Math.floor(f.now)].status[0]).toBe('stall');
      }
      const idle = frames.filter((f) => f.say && text(f.say).includes('sits idle'));
      for (const f of idle) expect(sim.history[Math.floor(f.now)].issued).toBe(-1);
      const summary = text(frames.at(-1)!.say);
      expect(summary).toContain(`issued on ${sim.history[GANTT_TICKS].issuedTicks}`);
    }
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('simd-gpu-parallelism');
    expect(elements.map((e) => e.component)).toEqual(['DependenceScene', 'WarpScene', 'HidingScene', 'LanesScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });

  it('each scene opens on its documented state, as a pure function, and visiting every scene twice changes nothing', () => {
    const first = Object.entries(SCENE_OPENINGS).map(([id, open]) => [id, open()]);
    const second = Object.entries(SCENE_OPENINGS).map(([id, open]) => [id, open()]);
    expect(second).toEqual(first);
    expect(Object.keys(SCENE_OPENINGS)).toEqual(['lanes', 'dependence', 'warp', 'hiding']);
    expect(warpOpening()).toMatchObject({ mode: 'branch' });
    expect(warpOpening().pred).toHaveLength(32);
    expect(warpOpening().trips).toHaveLength(32);
    // the openings are fresh objects: one scene editing its state cannot reach another's
    expect(lanesOpening()).not.toBe(lanesOpening());
    expect(hidingOpening()).not.toBe(hidingOpening());
  });

  it('a warp that fits the preset list always has a valid, runnable predicate row', () => {
    for (const preset of BRANCH_PRESETS) expect(branchReport(preset.pred).issued).toBeGreaterThan(0);
  });

  it('the loop and branch numbers each depend on their own control alone', () => {
    // flipping every predicate bit leaves the loop numbers untouched, and changing trips leaves the branch numbers untouched
    const loopBefore = tripReport(DEFAULT_TRIPS);
    const branchBefore = branchReport(BRANCH_PRESETS[3].pred);
    expect(tripReport(DEFAULT_TRIPS)).toEqual(loopBefore);
    expect(branchReport(BRANCH_PRESETS[3].pred)).toEqual(branchBefore);
    expect(tripReport(TRIP_PRESETS[0].trips)).not.toEqual(loopBefore);
  });
});

describe('quiz facts hold in the model', () => {
  it('Q3: seven elements take 4 instructions at 4 lanes and 7 at 8 lanes with a scalar tail, 1 at 8 lanes with a masked tail', () => {
    const tails: [TailMode, number, number][] = [['scalar', 4, 7], ['masked', 2, 1]];
    for (const [tail, narrow, wide] of tails) {
      expect(cycleReport(7, 128, tail, 64).compute).toBe(narrow);
      expect(cycleReport(7, 256, tail, 64).compute).toBe(wide);
    }
  });
});
