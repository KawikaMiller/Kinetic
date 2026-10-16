import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  FLOAT_PRESET, INPUT_LIMIT, OPS, blelloch, blellochCost, brentRange, bucketOffsets, compact, floatGroupings, foldCost, foldSequential, hillisCost, hillisSteele, isEven, lift, log2ceil,
  mapSteps, nextPow2, parseInputs, reduceVerdict, scan, sequentialScan, showValue, treeCost, treeReduce, type Op, type OpId, type ScanKind, type ScanMode, type Value,
} from './patterns';

const randomValues = (rnd: () => number, length: number, op: OpId): Value[] => lift(Array.from({ length }, () => (op === 'concat' ? Math.floor(rnd() * 100) : Math.floor(rnd() * 200) - 100)), op);

/** An operator that counts how often it is called: an instrumented count independent of the algorithms' own tallies. */
function counting(op: Op): { op: Op; calls: () => number } {
  let n = 0;
  return { op: { ...op, apply: (a, b) => (n++, op.apply(a, b)) }, calls: () => n };
}

describe('scan equals the sequential prefix', () => {
  it('for 2,000 seeded arrays of length 1 to 16, +, max and concatenation, both algorithms, inclusive and exclusive', () => {
    const rnd = mulberry32(2024);
    const kinds: ScanKind[] = ['hillis-steele', 'blelloch'];
    const modes: ScanMode[] = ['inclusive', 'exclusive'];
    const ops: OpId[] = ['plus', 'max', 'concat'];
    let checked = 0;
    for (let i = 0; i < 2000; i++) {
      const length = 1 + (i % 16);
      const opId = ops[i % 3];
      const vals = randomValues(rnd, length, opId);
      for (const kind of kinds) {
        for (const mode of modes) {
          const got = scan(kind, vals, OPS[opId], mode).result;
          expect(got, `${kind} ${mode} ${opId} [${vals.join(',')}]`).toEqual(sequentialScan(vals, OPS[opId], mode));
          checked++;
        }
      }
    }
    expect(checked).toBe(8000);
  });

  it('a hand-worked case: the inclusive and exclusive prefix sums of 3 1 4 1 5', () => {
    const vals = [3, 1, 4, 1, 5];
    expect(sequentialScan(vals, OPS.plus, 'inclusive')).toEqual([3, 4, 8, 9, 14]);
    expect(sequentialScan(vals, OPS.plus, 'exclusive')).toEqual([0, 3, 4, 8, 9]);
    expect(blelloch(vals, OPS.plus, 'exclusive').result).toEqual([0, 3, 4, 8, 9]);
    expect(hillisSteele(vals, OPS.plus, 'inclusive').result).toEqual([3, 4, 8, 9, 14]);
  });

  it('a non-associative operator scans wrongly, and the comparison shows it: the loop is the true left fold', () => {
    // hand-worked left fold with no identity seed: 3, 3 - 1, (3 - 1) - 4
    const small = [3, 1, 4];
    expect(sequentialScan(small, OPS.subtract, 'inclusive')).toEqual([3, 2, -2]);
    expect(sequentialScan(small, OPS.subtract, 'exclusive')).toEqual([0, 3, 2]);
    expect(hillisSteele(small, OPS.subtract, 'inclusive').result).toEqual([3, 2, 6]);
    const vals = [8, 4, 2, 1, 7];
    const loop = sequentialScan(vals, OPS.subtract, 'inclusive');
    expect(loop).toEqual([8, 4, 2, 1, -6]);
    const hs = hillisSteele(vals, OPS.subtract, 'inclusive').result;
    expect(hs).not.toEqual(loop);
    expect(hs[0]).toBe(loop[0]);
  });

  it('the padding cells are the identity and sit after the inputs', () => {
    const t = blelloch([1, 2, 3, 4, 5], OPS.plus, 'exclusive');
    expect(t.width).toBe(8);
    expect(t.padding).toBe(3);
    expect(t.rows[0].cells.slice(5)).toEqual([0, 0, 0]);
    expect(blelloch([1, 2, 3, 4, 5], OPS.max, 'exclusive').rows[0].cells.slice(5)).toEqual([-Infinity, -Infinity, -Infinity]);
    expect(blelloch([1, 2, 3], OPS.concat, 'exclusive').rows[0].cells.slice(3)).toEqual(['']);
  });
});

describe('operation and step counts equal an instrumented count', () => {
  it('Hillis-Steele additions are the sum over strides of (n - stride), for n = 1 to 16', () => {
    for (let n = 1; n <= 16; n++) {
      const c = counting(OPS.plus);
      const t = hillisSteele(Array.from({ length: n }, (_, i) => i), c.op, 'inclusive');
      let expected = 0;
      for (let d = 1; d < n; d *= 2) expected += n - d;
      expect(c.calls(), `n=${n}`).toBe(expected);
      expect(t.ops).toBe(expected);
      expect(hillisCost(n).work).toBe(expected);
      expect(t.steps).toBe(log2ceil(n));
    }
  });

  it('Blelloch is n - 1 up-sweep plus n - 1 down-sweep additions for n a power of two', () => {
    for (const n of [1, 2, 4, 8, 16]) {
      const c = counting(OPS.plus);
      const t = blelloch(Array.from({ length: n }, (_, i) => i), c.op, 'exclusive');
      expect(c.calls(), `n=${n}`).toBe(2 * (n - 1));
      expect(t.ops).toBe(2 * (n - 1));
      expect(t.steps).toBe(2 * Math.log2(n));
    }
  });

  it('with padding the counts use the padded size, and the steps are 2 log2 of it, for n = 1 to 16', () => {
    for (let n = 1; n <= 16; n++) {
      const m = nextPow2(n);
      const c = counting(OPS.plus);
      const t = blelloch(Array.from({ length: n }, (_, i) => i), c.op, 'exclusive');
      expect(c.calls(), `n=${n}`).toBe(2 * (m - 1));
      expect(t.steps).toBe(2 * Math.log2(m));
      expect(blellochCost(n)).toEqual({ work: 2 * (m - 1), span: 2 * Math.log2(m) });
    }
  });

  it('the tree uses n - 1 operations in ceil(log2 n) levels, the fold n - 1 in n - 1, for n = 1 to 16', () => {
    for (let n = 1; n <= 16; n++) {
      const c = counting(OPS.plus);
      const t = treeReduce(Array.from({ length: n }, (_, i) => i), c.op);
      expect(c.calls()).toBe(n - 1);
      expect(t.steps).toBe(log2ceil(n));
      expect(treeCost(n)).toEqual({ work: n - 1, span: Math.ceil(Math.log2(n)) || 0 });
      const f = counting(OPS.plus);
      foldSequential(Array.from({ length: n }, (_, i) => i), f.op);
      expect(f.calls()).toBe(n - 1);
      expect(foldCost(n)).toEqual({ work: n - 1, span: n - 1 });
    }
  });

  it('the work-inefficient scan does more additions than the loop for n = 8 (17 against 7) and the efficient one 14', () => {
    expect(hillisCost(8).work).toBe(7 + 6 + 4);
    expect(foldCost(8).work).toBe(7);
    expect(blellochCost(8).work).toBe(14);
  });

  it('map takes ceil(n / p) steps', () => {
    for (let n = 1; n <= 16; n++) for (let p = 1; p <= 16; p++) expect(mapSteps(n, p)).toBe(Math.ceil(n / p));
    expect(mapSteps(16, 16)).toBe(1);
  });

  it('the p-processor estimate lies from max(ceil(work / p), span) to work / p + span, never below the span', () => {
    expect(brentRange({ work: 14, span: 6 }, 4)).toEqual({ low: 6, high: 14 / 4 + 6 });
    expect(brentRange(treeCost(8), 4)).toEqual({ low: 3, high: 4.75 });
    expect(brentRange(treeCost(16), 16).low).toBe(4);
    expect(brentRange({ work: 7, span: 7 }, 1)).toEqual({ low: 7, high: 14 });
  });
});

describe('tree reduce against the fold', () => {
  it('+ and max agree on seeded arrays of every length up to 12, in either arrival order', () => {
    const rnd = mulberry32(7);
    for (let length = 1; length <= 12; length++) {
      for (let k = 0; k < 60; k++) {
        for (const opId of ['plus', 'max'] as OpId[]) {
          const vals = randomValues(rnd, length, opId);
          for (const arrival of [false, true]) {
            const v = reduceVerdict(vals, OPS[opId], arrival);
            expect(v.agree, `${opId} n=${length}`).toBe(true);
            expect(v.reason).toBeNull();
          }
        }
      }
    }
  });

  it('subtract disagrees on the named array [8, 4, 2, 1]: the fold is 1 and the tree is 3, a regrouping', () => {
    const v = reduceVerdict([8, 4, 2, 1], OPS.subtract, false);
    expect(v.fold.result).toBe(8 - 4 - 2 - 1);
    expect(v.tree.result).toBe(8 - 4 - (2 - 1));
    expect([v.fold.result, v.tree.result]).toEqual([1, 3]);
    expect(v.agree).toBe(false);
    expect(v.reason).toBe('regrouping');
  });

  it('subtract on three elements agrees (the odd one is carried), which is why the lesson uses four', () => {
    expect(reduceVerdict([8, 4, 2], OPS.subtract, false).agree).toBe(true);
  });

  it('concatenation in order equals the fold, and differs under all five non-identity permutations of three elements', () => {
    const base = ['1', '2', '3'];
    const fold = foldSequential(base, OPS.concat).result;
    expect(fold).toBe('123');
    expect(treeReduce(base, OPS.concat).result).toBe(fold);
    const perms: string[][] = [];
    const permute = (rest: string[], acc: string[]) => (rest.length === 0 ? perms.push(acc) : rest.forEach((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x])));
    permute(base, []);
    expect(perms).toHaveLength(6);
    for (const perm of perms) {
      const same = perm.join('') === '123';
      expect(foldSequential(perm, OPS.concat).result === fold, perm.join('')).toBe(same);
      expect(treeReduce(perm, OPS.concat).result).toBe(perm.join(''));
    }
  });

  it('combining in arrival order changes a concatenation and the reason is reordering, not regrouping', () => {
    for (const n of [2, 3, 5, 8]) {
      const vals = Array.from({ length: n }, (_, i) => String(i + 1));
      const v = reduceVerdict(vals, OPS.concat, true);
      expect(v.agree, `n=${n}`).toBe(false);
      expect(v.reason).toBe('reordering');
      expect(reduceVerdict(vals, OPS.concat, false).agree).toBe(true);
    }
    expect(reduceVerdict(['7'], OPS.concat, true).agree).toBe(true);
  });

  it('even + on floats regroups to different bits, computed in real JavaScript', () => {
    const v = reduceVerdict(FLOAT_PRESET.slice(), OPS.plus, false);
    expect(v.agree).toBe(false);
    expect(v.fold.result).toBe(3.5999999999999996);
    expect(v.tree.result).toBe(3.6);
    const g = floatGroupings();
    expect(g.leftToRight).toBe(0.6000000000000001);
    expect(g.rightToLeft).toBe(0.6);
  });
});

describe('what a scan is for', () => {
  it('compaction keeps the evens in order: flags, an exclusive scan of them as the slots, and the compacted array', () => {
    const c = compact([5, 2, 8, 3, 6, 7, 4, 1], isEven);
    expect(c.flags).toEqual([0, 1, 1, 0, 1, 0, 1, 0]);
    expect(c.slots).toEqual([0, 0, 1, 2, 2, 3, 3, 4]);
    expect(c.out).toEqual([2, 8, 6, 4]);
    expect(c.out).toEqual([5, 2, 8, 3, 6, 7, 4, 1].filter(isEven));
  });

  it('compaction equals a filter on 500 seeded arrays', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const vals = Array.from({ length: 1 + (i % 16) }, () => Math.floor(rnd() * 50));
      expect(compact(vals, isEven).out).toEqual(vals.filter(isEven));
    }
  });

  it('bucket offsets are the exclusive prefix sums of the counts', () => {
    expect(bucketOffsets([3, 0, 2, 4, 1])).toEqual([0, 3, 3, 5, 9]);
  });
});

describe('typed input', () => {
  it('accepts up to 16 integers within 9,999 and refuses everything else with a message', () => {
    expect(parseInputs('3, 1 4', 'plus')).toEqual({ ok: true, values: [3, 1, 4] });
    for (const bad of ['', '  ', '1.5, 2', '1e3', 'a b', '1,,2x']) expect(parseInputs(bad, 'plus').ok, bad).toBe(false);
    expect(parseInputs(Array.from({ length: 17 }, (_, i) => i).join(','), 'plus')).toMatchObject({ ok: false, error: expect.stringContaining('At most 16') });
    expect(parseInputs(Array.from({ length: 16 }, (_, i) => i).join(','), 'plus').ok).toBe(true);
    expect(parseInputs('10000', 'plus').ok).toBe(false);
    expect(parseInputs('-10000', 'plus').ok).toBe(false);
    expect(parseInputs('9999, -9999', 'plus').ok).toBe(true);
    expect(INPUT_LIMIT).toEqual({ count: 16, magnitude: 9999 });
  });

  it('concatenation refuses negatives and the other operators accept them', () => {
    expect(parseInputs('3, -1', 'concat')).toMatchObject({ ok: false, error: expect.stringContaining('negatives are refused') });
    expect(parseInputs('3, -1', 'subtract').ok).toBe(true);
    expect(parseInputs('3, 1', 'concat').ok).toBe(true);
  });

  it('values show as typed: a minus sign, the empty string and long digit strings abbreviated', () => {
    expect(showValue(-5)).toBe('−5');
    expect(showValue(-Infinity)).toBe('−∞');
    expect(showValue('')).toBe('∅');
    expect(showValue('12')).toBe('12');
    expect(showValue('123456789')).toBe('12…89');
    expect(showValue(0.1 + 0.2)).toBe('0.30000000000000004');
  });
});
