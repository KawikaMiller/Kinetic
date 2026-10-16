import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { mapFrames, reduceFrames, reduceVerdictSentence, scanFrames } from './frames';
import lesson from './index';
import { SCENE_OPENINGS, mapOpening, reduceOpening, scanOpening } from './openings';
import {
  FLOAT_PRESET, OPS, OP_IDS, blelloch, compact, hillisSteele, isEven, lift, log2ceil, mapSteps, reduceVerdict, scan, sequentialScan, type OpId, type ScanKind, type ScanMode,
} from './patterns';

const text = expectCaption;
const verdict = (values: readonly number[], op: OpId, arrival = false) => reduceVerdict(lift(values, op), OPS[op], arrival);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: 8 values on 4 processors take 2 steps (one processor needs 8), and on 8 processors 1 step', () => {
    expect(mapOpening()).toEqual({ values: [1, 2, 3, 4, 5, 6, 7, 8], p: 4 });
    expect(mapSteps(8, 4)).toBe(Math.ceil(8 / 4));
    expect(mapSteps(8, 4)).toBe(2);
    expect(mapSteps(8, 8)).toBe(1);
    expect(mapFrames([1, 2, 3, 4, 5, 6, 7, 8], 4)).toHaveLength(2 + 2);
    expect(lesson.tryThis[0]).toContain('takes 2 steps against 8 for one processor');
    expect(lesson.tryThis[0]).toContain('Processors to 8: 1 step');
  });

  it('try-this 2: the sum of 3 1 4 1 5 9 2 6 is 31 by tree (3 levels, 7 operations) and fold (7 steps); subtract gives -25 by fold and -1 by tree', () => {
    const open = reduceOpening();
    expect(open).toMatchObject({ values: [3, 1, 4, 1, 5, 9, 2, 6], op: 'plus', arrival: false });
    const v = verdict(open.values, 'plus');
    expect([v.fold.result, v.tree.result, v.tree.steps, v.tree.ops, v.fold.steps]).toEqual([31, 31, 3, 7, 7]);
    // hand-worked: the fold is 3-1-4-1-5-9-2-6 = -25, and the tree pairs to 2, 3, -4, -4, then -1 and 0, then -1
    const s = verdict(open.values, 'subtract');
    expect(s.fold.result).toBe(-25);
    expect(s.tree.result).toBe(-1);
    expect(s.agree).toBe(false);
    expect(s.reason).toBe('regrouping');
    expect(lesson.tryThis[1]).toContain('3 levels and 7 operations against 7 steps');
    expect(lesson.tryThis[1]).toContain(`the fold gives ${s.fold.result} and the tree ${s.tree.result}`);
  });

  it('try-this 3: concatenating 1 to 4 in arrival order gives 4321 by tree against 1234 by fold, a reordering', () => {
    const v = verdict([1, 2, 3, 4], 'concat', true);
    expect([v.fold.result, v.tree.result]).toEqual(['1234', '4321']);
    expect(v.reason).toBe('reordering');
    expect(lesson.tryThis[2]).toContain('the fold gives 1234 and the tree 4321');
  });

  it('try-this 4: the floats 0.1 to 0.8 sum to 3.5999999999999996 by fold and 3.6 by tree, in real JavaScript', () => {
    let fold = 0;
    FLOAT_PRESET.forEach((x, i) => (fold = i === 0 ? x : fold + x));
    const v = verdict(FLOAT_PRESET, 'plus');
    expect(v.fold.result).toBe(fold);
    expect(String(v.fold.result)).toBe('3.5999999999999996');
    expect(String(v.tree.result)).toBe('3.6');
    expect(lesson.tryThis[3]).toContain('the fold sums to 3.5999999999999996 and the tree to 3.6');
  });

  it('try-this 5: Hillis-Steele on 8 values is 17 additions in 3 steps against 7 for the loop, and Blelloch 14 in 6', () => {
    const open = scanOpening();
    expect(open).toMatchObject({ op: 'plus', kind: 'hillis-steele', mode: 'inclusive', useCase: 'none' });
    const vals = open.values;
    const h = hillisSteele(vals, OPS.plus, 'inclusive');
    // by hand: strides 1, 2, 4 add 7, 6 and 4 values
    expect([h.ops, h.steps]).toEqual([7 + 6 + 4, 3]);
    const b = blelloch(vals, OPS.plus, 'inclusive');
    expect([b.ops, b.steps]).toEqual([14, 6]);
    expect(lesson.tryThis[4]).toContain('3 steps and 17 additions against 7 for the loop');
    expect(lesson.tryThis[4]).toContain('14 additions in 6 steps');
  });
});

describe('captions across the operator, order, algorithm and length cross product', () => {
  it('every reduce frame is a clean caption and the verdict sentence names exactly the reason the model found, for every operator and length', () => {
    const rnd = mulberry32(5);
    for (const op of OP_IDS) {
      for (let n = 1; n <= 16; n++) {
        for (const arrival of [false, true]) {
          const vals = Array.from({ length: n }, () => Math.floor(rnd() * 40) + (op === 'concat' ? 0 : -10));
          const lifted = lift(vals, op);
          const v = reduceVerdict(lifted, OPS[op], arrival);
          const frames = reduceFrames(lifted, v, op, arrival);
          frames.forEach((f) => f.say && text(f.say));
          expect(frames).toHaveLength(v.tree.levels.length + 1);
          const said = text(reduceVerdictSentence(v, op));
          expect(said.includes('Regrouping changes the answer'), `${op} n=${n} ${arrival}`).toBe(v.reason === 'regrouping');
          expect(said.includes('Reordering changes the answer')).toBe(v.reason === 'reordering');
          expect(said.includes('agrees with the fold')).toBe(v.agree);
        }
      }
    }
  });

  it('every scan frame is clean, and the closing caption says "Matches" exactly when the scan equals the loop', () => {
    const rnd = mulberry32(8);
    const kinds: ScanKind[] = ['hillis-steele', 'blelloch'];
    const modes: ScanMode[] = ['inclusive', 'exclusive'];
    for (const op of OP_IDS) {
      for (let n = 1; n <= 16; n++) {
        for (const kind of kinds) {
          for (const mode of modes) {
            const vals = lift(Array.from({ length: n }, () => Math.floor(rnd() * 30) + (op === 'concat' ? 0 : -5)), op);
            const trace = scan(kind, vals, OPS[op], mode);
            const frames = scanFrames(vals, trace, op, mode);
            frames.forEach((f) => f.say && text(f.say));
            expect(frames).toHaveLength(trace.rows.length + 1);
            const loop = sequentialScan(vals, OPS[op], mode);
            const equal = trace.result.every((v, i) => v === loop[i]);
            expect(text(frames.at(-1)!.say).includes('Matches the loop'), `${op} ${kind} ${mode} n=${n}`).toBe(equal);
            expect(text(frames[0].say)).toContain(`${n} value`);
          }
        }
      }
    }
  });

  it('associative operators always match the loop and subtract fails on at least one array per algorithm', () => {
    const vals = [8, 4, 2, 1, 7, 3];
    for (const kind of ['hillis-steele', 'blelloch'] as ScanKind[]) {
      for (const op of ['plus', 'max', 'concat'] as OpId[]) {
        const lifted = lift(vals, op);
        expect(scan(kind, lifted, OPS[op], 'inclusive').result).toEqual(sequentialScan(lifted, OPS[op], 'inclusive'));
      }
      expect(scan(kind, vals, OPS.subtract, 'inclusive').result).not.toEqual(sequentialScan(vals, OPS.subtract, 'inclusive'));
    }
  });

  it('compaction keeps the evens in order and every kept element has its own slot', () => {
    const c = compact([5, 2, 8, 3, 6, 7, 4, 1], isEven);
    expect(new Set(c.slots.filter((_, i) => c.flags[i] === 1)).size).toBe(c.out.length);
    expect(c.out).toEqual([2, 8, 6, 4]);
    expect(log2ceil(8)).toBe(3);
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('parallel-patterns');
    expect(elements.map((e) => e.component)).toEqual(['ReduceScene', 'ScanScene', 'MapScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });

  it('each scene opens on its documented state, as a pure function, and visiting every scene twice changes nothing', () => {
    const walk = () => Object.values(SCENE_OPENINGS).map((open) => open());
    expect(walk()).toEqual(walk());
    expect(Object.keys(SCENE_OPENINGS)).toEqual(['map', 'reduce', 'scan']);
    expect(mapOpening()).not.toBe(mapOpening());
    expect(reduceOpening().values).not.toBe(reduceOpening().values);
    // the three scenes open on different controls: a scan is never left in the reduce scene's operator state or the other way round
    expect(reduceOpening()).not.toHaveProperty('kind');
    expect(scanOpening().kind).toBe('hillis-steele');
  });
});
