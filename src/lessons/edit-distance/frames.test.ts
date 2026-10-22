import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { diffCaption, isFilled, tableFrames } from './frames';
import { applyDiff, CONFIG_V1, CONFIG_V2, diffLines, hamming, traceback, WORD_PRESETS } from './model';
import { editTable, INDEL, LEVENSHTEIN } from '../../core/editDistance';

const text = (f: { say?: unknown }) => captionText(f.say as never);

describe('tableFrames', () => {
  it('every preset × cost setting (and empty words): the closing caption states the table\'s distance and Hamming', () => {
    const pairs = [...WORD_PRESETS, { a: '', b: 'abc' }, { a: 'same', b: 'same' }];
    for (const p of pairs) for (const costs of [LEVENSHTEIN, INDEL]) {
      const t = editTable(p.a, p.b, costs);
      const dist = t.d[t.a.length][t.b.length];
      const fr = tableFrames(p.a, p.b, costs);
      const say = text(fr[fr.length - 1]);
      expect(say, `${p.a}/${p.b}`).toContain(`edit distance ${dist}`);
      const h = hamming(p.a, p.b);
      expect(say.includes("Hamming distance isn't defined")).toBe(h === null);
      if (h !== null) expect(say).toContain(`says ${h}`);
      expect(say.includes('overcounts')).toBe(h !== null && h > dist && costs.sub === 1);
      // The script's make-up adds up to the distance.
      const { ops } = traceback(t);
      const subs = ops.filter((o) => o.t === 'sub').length;
      const ins = ops.filter((o) => o.t === 'ins').length;
      const del = ops.filter((o) => o.t === 'del').length;
      expect(subs * costs.sub + ins + del).toBe(dist);
    }
  });

  it('each cell caption states that cell\'s three candidates and its winner', () => {
    const t = editTable('intention', 'execution');
    const fr = tableFrames('intention', 'execution', LEVENSHTEIN);
    const cellFrames = fr.filter((f) => f.cur !== null);
    expect(cellFrames).toHaveLength(81);
    for (const f of cellFrames) {
      const [i, j] = f.cur!;
      const c = t.cands[i][j]!;
      const say = text(f);
      expect(say).toContain(`D[${i}][${j}]`);
      expect(say).toContain(`= ${c.left};`);
      expect(say).toContain(`= ${c.up};`);
      expect(say).toContain(`Best ${t.d[i][j]}`);
      // Filled-ness: the cell computed now is the last one filled.
      expect(isFilled(f, i, j, 9)).toBe(true);
      if (j < 9) expect(isFilled(f, i, j + 1, 9)).toBe(false);
    }
  });

  it('replay captions walk kitten to sitting', () => {
    const fr = tableFrames('kitten', 'sitting', LEVENSHTEIN);
    const words = fr.map(text).filter((s) => s.startsWith('Replay')).map((s) => /now “(.*)”/.exec(s)![1]);
    expect(words).toEqual(['sitten', 'sittin', 'sitting']);
  });

  it('backs the try-this numbers', () => {
    const t = editTable('kitten', 'sitting', INDEL);
    expect(t.d[6][7]).toBe(5);
    expect(traceback(t).ops.some((o) => o.t === 'sub')).toBe(false);
    expect(editTable('', 'sitting').d[0][7]).toBe(7);
  });
});

describe('diffCaption', () => {
  it('states the counts and the apply check', () => {
    const d = diffLines(CONFIG_V1, CONFIG_V2);
    const removed = d.filter((l) => l.sign === '-').length;
    const added = d.filter((l) => l.sign === '+').length;
    const say = captionText(diffCaption(removed, added, d.length - removed - added, applyDiff(CONFIG_V1, d) === CONFIG_V2));
    expect(say).toContain(`costs ${removed} + ${added} = ${removed + added}`);
    expect(say).toContain('gives version 2 exactly');
  });
});
