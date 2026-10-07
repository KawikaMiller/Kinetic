import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { actionFrames } from './frames';
import { buildTrie, countNodes, PRESETS, radixShape, scanCost, trieShape } from './model';

const text = (f: { say?: unknown }) => captionText(f.say as never);
const KEYWORDS = [...PRESETS[0].words];

describe('search frames', () => {
  it('end with the filter(startsWith).sort() completions, or a dead end, for every prefix of every preset word', () => {
    for (const p of PRESETS) {
      const words = [...p.words];
      const prefixes = new Set([...words.flatMap((w) => Array.from({ length: w.length + 1 }, (_, i) => w.slice(0, i))), 'x', 'caz']);
      for (const pre of prefixes) {
        const { frames, after } = actionFrames(words, { kind: 'search', prefix: pre });
        const last = frames[frames.length - 1];
        const expected = words.filter((w) => w.startsWith(pre)).sort();
        expect(last.completions, `${p.id} "${pre}"`).toEqual(expected);
        expect(after).toEqual(words);
        if (expected.length === 0) expect(text(last)).toContain(`no word starts with “${pre}”`);
        else expect(text(last)).toContain(`${scanCost(words, pre).calls} startsWith calls, ${scanCost(words, pre).chars} character check`);
      }
    }
  });
});

describe('insert frames', () => {
  it('reveal exactly the new nodes and report the new node count, on 200 seeded inserts', () => {
    const rnd = mulberry32(71);
    for (let t = 0; t < 200; t++) {
      const words = [...new Set(Array.from({ length: randInt(1, 8, rnd) }, () => Array.from({ length: randInt(1, 5, rnd) }, () => 'abc'[randInt(0, 2, rnd)]).join('')))];
      const w = Array.from({ length: randInt(1, 5, rnd) }, () => 'abc'[randInt(0, 2, rnd)]).join('');
      const { frames, after } = actionFrames(words, { kind: 'insert', word: w });
      const last = frames[frames.length - 1];
      expect(new Set(after)).toEqual(new Set([...words, w]));
      if (words.includes(w)) {
        expect(text(last)).toContain('nothing changes');
        continue;
      }
      const fresh = countNodes(buildTrie(after)) - countNodes(buildTrie(words));
      expect(last.created).toHaveLength(fresh);
      expect(last.hidden).toEqual([]);
      expect(text(last)).toContain(`${fresh} new node`);
      // While playing, a node is hidden exactly until the frame that creates it.
      for (const f of frames) for (const id of f.hidden) expect(f.created).not.toContain(id);
    }
  });
});

describe('delete frames', () => {
  it('end on the trie of the remaining words and name what stops the pruning', () => {
    for (const p of PRESETS) {
      for (const w of p.words) {
        const { frames, after } = actionFrames([...p.words], { kind: 'delete', word: w });
        const last = frames[frames.length - 1];
        expect(after).toEqual(p.words.filter((x) => x !== w));
        expect(last.words).toEqual(after);
        const removed = countNodes(buildTrie([...p.words])) - countNodes(buildTrie(after));
        expect(text(last)).toContain(`Removed ${removed} node`);
        expect(frames.filter((f) => text(f).includes('Prune it'))).toHaveLength(removed);
      }
    }
  });

  it('refuses a prefix or a missing word with its reason', () => {
    expect(text(actionFrames(KEYWORDS, { kind: 'delete', word: 'dou' }).frames[0])).toContain('only a prefix');
    expect(text(actionFrames(KEYWORDS, { kind: 'delete', word: 'cat' }).frames[0])).toContain('only a prefix');
    expect(text(actionFrames(KEYWORDS, { kind: 'delete', word: 'zip' }).frames[0])).toContain('breaks off');
  });
});

describe('the build caption', () => {
  it('states the node count', () => {
    const f = actionFrames(KEYWORDS, { kind: 'build', note: null }).frames[0];
    expect(text(f)).toContain(`has ${countNodes(buildTrie(KEYWORDS))} nodes`);
  });
});

describe('try-this numbers', () => {
  it('hold', () => {
    const ca = actionFrames(KEYWORDS, { kind: 'search', prefix: 'ca' }).frames.at(-1)!;
    expect(ca.completions).toEqual(['case', 'catch']);
    expect(actionFrames(KEYWORDS, { kind: 'insert', word: 'cast' }).frames.at(-1)!.created).toEqual(['cast']);
    const del = actionFrames(KEYWORDS, { kind: 'delete', word: 'do' });
    expect(del.frames.filter((f) => text(f).includes('Prune it'))).toHaveLength(0);
    const states = buildTrie([...PRESETS[1].words]);
    expect(radixShape(states).size).toBeLessThan(trieShape(states).size);
    expect(radixShape(states).get('massachusetts')?.label).toBe('ssachusetts');
    const x = actionFrames(KEYWORDS, { kind: 'search', prefix: 'x' }).frames.at(-1)!;
    expect(text(x)).toContain('after 1 check');
    expect(text(x)).toContain('makes 12 startsWith calls');
  });

  it('the memory note: 26 slots per node outnumber the letters in every preset', () => {
    for (const p of PRESETS) expect(countNodes(buildTrie([...p.words])) * 26).toBeGreaterThan(p.words.join('').length);
  });
});
