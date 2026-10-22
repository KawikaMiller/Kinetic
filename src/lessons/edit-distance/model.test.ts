import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { applyDiff, CONFIG_V1, CONFIG_V2, diffLines, hamming, linesOf, opCost, parseConfig, parseWord, replay, traceback, WORD_PRESETS } from './model';
import { editTable, INDEL, LEVENSHTEIN, type Costs } from '../../core/editDistance';

const seeded = (rnd: Rnd, max: number) => Array.from({ length: randInt(0, max, rnd) }, () => 'abc'[randInt(0, 2, rnd)]).join('');
const distance = (a: string, b: string, c: Costs = LEVENSHTEIN) => editTable(a, b, c).d[[...a].length][[...b].length];

/** Longest common subsequence length, by its own DP. */
function lcs<T>(a: readonly T[], b: readonly T[]): number {
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) L[i][j] = a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  }
  return L[a.length][b.length];
}

describe('edit distance', () => {
  it('with substitution costing 2, equals m + n − 2·LCS, and its script uses no substitutions', () => {
    const rnd = mulberry32(52);
    for (let t = 0; t < 200; t++) {
      const a = seeded(rnd, 10);
      const b = seeded(rnd, 10);
      expect(distance(a, b, INDEL)).toBe(a.length + b.length - 2 * lcs([...a], [...b]));
      expect(traceback(editTable(a, b, INDEL)).ops.some((o) => o.t === 'sub')).toBe(false);
    }
  });


  it('each cell is the minimum of its three candidates', () => {
    const t = editTable('intention', 'execution');
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        const c = t.cands[i][j]!;
        expect(t.d[i][j]).toBe(Math.min(c.left, c.up, c.diag));
        expect(c[c.win]).toBe(t.d[i][j]);
      }
    }
  });
});

describe('traceback and replay', () => {
  const check = (a: string, b: string, costs: Costs) => {
    const t = editTable(a, b, costs);
    const { path, ops } = traceback(t);
    expect(path[0]).toEqual([[...a].length, [...b].length]);
    expect(path[path.length - 1]).toEqual([0, 0]);
    expect(ops.reduce((s, o) => s + opCost(o, costs), 0)).toBe(t.d[[...a].length][[...b].length]);
    const steps = replay(a, ops);
    expect(steps.length ? steps[steps.length - 1].word : a).toBe(b);
  };

  it('the script costs exactly the distance and replays word A into word B: every preset', () => {
    for (const p of WORD_PRESETS) for (const c of [LEVENSHTEIN, INDEL]) check(p.a, p.b, c);
  });

  it('and on 300 seeded pairs', () => {
    const rnd = mulberry32(53);
    for (let t = 0; t < 300; t++) check(seeded(rnd, 9), seeded(rnd, 9), t % 2 ? INDEL : LEVENSHTEIN);
  });

  it('kitten → sitten → sittin → sitting', () => {
    const { ops } = traceback(editTable('kitten', 'sitting'));
    const edits = replay('kitten', ops).filter((s) => s.op.t !== 'match').map((s) => s.word);
    expect(edits).toEqual(['sitten', 'sittin', 'sitting']);
  });
});

describe('Hamming distance', () => {
  it('counts differing positions, only for equal lengths', () => {
    expect(hamming('flaw', 'lawn')).toBe(4);
    expect(hamming('kitten', 'sitting')).toBeNull();
    expect(hamming('', '')).toBe(0);
  });

  it('is never below the edit distance', () => {
    const rnd = mulberry32(54);
    for (let t = 0; t < 200; t++) {
      const n = randInt(0, 8, rnd);
      const a = Array.from({ length: n }, () => 'ab'[randInt(0, 1, rnd)]).join('');
      const b = Array.from({ length: n }, () => 'ab'[randInt(0, 1, rnd)]).join('');
      expect(hamming(a, b)!).toBeGreaterThanOrEqual(distance(a, b));
    }
  });
});

describe('line diff', () => {
  it('applied to version 1 yields version 2, with (m − LCS) + (n − LCS) changed lines', () => {
    const d = diffLines(CONFIG_V1, CONFIG_V2);
    expect(applyDiff(CONFIG_V1, d)).toBe(CONFIG_V2);
    const k = lcs(linesOf(CONFIG_V1), linesOf(CONFIG_V2));
    expect(d.filter((l) => l.sign !== ' ').length).toBe(linesOf(CONFIG_V1).length + linesOf(CONFIG_V2).length - 2 * k);
  });

  it('round-trips 300 seeded pairs of line lists, and is minimal', () => {
    const rnd = mulberry32(55);
    for (let t = 0; t < 300; t++) {
      const mk = () => Array.from({ length: randInt(0, 8, rnd) }, () => ['a', 'b', 'c', 'd'][randInt(0, 3, rnd)]).join('\n');
      const v1 = mk();
      const v2 = mk();
      const d = diffLines(v1, v2);
      expect(applyDiff(v1, d)).toBe(v2);
      expect(d.filter((l) => l.sign !== ' ').length).toBe(linesOf(v1).length + linesOf(v2).length - 2 * lcs(linesOf(v1), linesOf(v2)));
    }
  });

  it('prints a changed line as "-" then "+"', () => {
    expect(diffLines('a\nx\nc', 'a\ny\nc').map((l) => l.sign + l.text)).toEqual([' a', '-x', '+y', ' c']);
  });
});

describe('input', () => {
  it('accepts words, empty included', () => {
    expect(parseWord('')).toEqual({ ok: true, value: '' });
    expect(parseWord("don't")).toEqual({ ok: true, value: "don't" });
  });

  it.each([
    ['two words', 'No spaces'], ['   ', 'No spaces'], ['a<b', '“<”'], ['🙂', '“🙂”'], ['1,2', '“,”'], ['abcdefghijklm', 'Up to 12'],
  ])('refuses %j', (s, msg) => {
    const r = parseWord(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it('limits config versions', () => {
    expect(parseConfig(Array.from({ length: 13 }, () => 'x').join('\n'), 'Version 1').ok).toBe(false);
    expect(parseConfig('x'.repeat(49), 'Version 1').ok).toBe(false);
    expect(parseConfig(CONFIG_V1, 'Version 1').ok).toBe(true);
  });
});
