import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import {
  buildTrie, completions, countNodes, find, insert, parseList, parseWord, PRESETS, radixShape, remove, ROOT_ID, scanCost, subtree, trieShape,
  trieSteps,
} from './model';

const reference = (words: readonly string[], p: string) => words.filter((w) => w.startsWith(p)).sort();
/** Every distinct non-empty prefix of every word, from a Set: the independent node count. */
const distinctPrefixes = (words: readonly string[]) => new Set(words.flatMap((w) => Array.from({ length: w.length }, (_, i) => w.slice(0, i + 1)))).size;

function seededWords(rnd: Rnd): string[] {
  const n = randInt(1, 12, rnd);
  const alphabet = 'abcd'.slice(0, randInt(2, 4, rnd));
  return [...new Set(Array.from({ length: n }, () => Array.from({ length: randInt(1, 6, rnd) }, () => alphabet[randInt(0, alphabet.length - 1, rnd)]).join('')))];
}

const serialise = (words: readonly string[]) => JSON.stringify([...trieShape(buildTrie(words)).values()]);

describe('the trie', () => {
  it('completes every prefix of every preset word exactly like filter(startsWith).sort()', () => {
    for (const p of PRESETS) {
      const root = buildTrie(p.words);
      const prefixes = new Set(['', ...p.words.flatMap((w) => Array.from({ length: w.length + 1 }, (_, i) => w.slice(0, i))), 'zz', 'cax']);
      for (const pre of prefixes) expect(completions(root, pre), `${p.id} "${pre}"`).toEqual(reference(p.words, pre));
    }
  });

  it('…and on 300 seeded word lists, for every prefix up to length 3 over the alphabet', () => {
    const rnd = mulberry32(61);
    for (let t = 0; t < 300; t++) {
      const words = seededWords(rnd);
      const root = buildTrie(words);
      const prefixes = ['', 'a', 'b', 'ab', 'ba', 'aa', 'abc', 'dd', ...words];
      for (const pre of prefixes) expect(completions(root, pre)).toEqual(reference(words, pre));
    }
  });

  it('has one node per distinct prefix, plus the root', () => {
    const rnd = mulberry32(62);
    for (const words of [...PRESETS.map((p) => [...p.words]), ...Array.from({ length: 300 }, () => seededWords(rnd))]) {
      expect(countNodes(buildTrie(words))).toBe(distinctPrefixes(words) + 1);
      expect(trieShape(buildTrie(words)).size).toBe(distinctPrefixes(words) + 1);
    }
  });

  it('creates nodes only where the path is new', () => {
    const root = buildTrie(['case', 'cast']);
    expect(insert(root, 'cash')).toBe(1);
    expect(insert(root, 'cas')).toBe(0);
    expect(insert(root, 'dog')).toBe(3);
  });

  it('marks words, not prefixes: "do" is a word, "dou" is not', () => {
    const root = buildTrie(PRESETS[0].words);
    expect(find(root, 'do')?.end).toBe(true);
    expect(find(root, 'dou')?.end).toBe(false);
    expect(find(root, 'dx')).toBeNull();
  });
});

describe('delete', () => {
  it('leaves exactly the trie of the remaining words, on 300 seeded lists', () => {
    const rnd = mulberry32(63);
    for (let t = 0; t < 300; t++) {
      const words = seededWords(rnd);
      const w = words[randInt(0, words.length - 1, rnd)];
      const root = buildTrie(words);
      const pruned = remove(root, w)!;
      const rest = words.filter((x) => x !== w);
      expect(JSON.stringify([...trieShape(root).values()])).toBe(serialise(rest));
      // Pruned nodes are the prefixes no remaining word passes through.
      const still = new Set(rest.flatMap((x) => Array.from({ length: x.length }, (_, i) => x.slice(0, i + 1))));
      const expected = Array.from({ length: w.length }, (_, i) => w.slice(0, i + 1)).filter((p) => !still.has(p)).reverse();
      expect(pruned).toEqual(expected);
    }
  });

  it('then re-inserting gives the identical structure', () => {
    for (const p of PRESETS) {
      for (const w of p.words) {
        const root = buildTrie(p.words);
        remove(root, w);
        insert(root, w);
        expect(JSON.stringify([...trieShape(root).values()])).toBe(serialise([...p.words]));
      }
    }
  });

  it('refuses a word that is only a prefix, or absent', () => {
    const root = buildTrie(['double']);
    expect(remove(root, 'do')).toBeNull();
    expect(remove(root, 'dog')).toBeNull();
    expect(countNodes(root)).toBe(7);
  });
});

describe('the radix tree', () => {
  it('has no single-child node without an end mark (except the root), and the same completions', () => {
    const rnd = mulberry32(64);
    for (const words of [...PRESETS.map((p) => [...p.words]), ...Array.from({ length: 300 }, () => seededWords(rnd))]) {
      const root = buildTrie(words);
      const r = radixShape(root);
      for (const n of r.values()) if (n.id !== ROOT_ID) expect(n.end || n.children.length !== 1, n.id).toBe(true);
      // Its node ids are trie prefixes, and its end marks are exactly the words.
      const t = trieShape(root);
      for (const id of r.keys()) expect(t.has(id)).toBe(true);
      expect([...r.values()].filter((n) => n.end).map((n) => n.id).sort()).toEqual([...words].sort());
      // Reading the radix tree back gives the same completions.
      const read = (id: string): string[] => [...(r.get(id)!.end ? [id] : []), ...r.get(id)!.children.flatMap(read)];
      expect(read(ROOT_ID)).toEqual(completions(root, ''));
      expect(r.size).toBeLessThanOrEqual(t.size);
    }
  });

  it('merges continue\'s chain into one edge', () => {
    const r = radixShape(buildTrie(PRESETS[0].words));
    expect(r.get('continue')?.label).toBe('tinue');
  });
});

describe('costs', () => {
  it('a trie lookup follows at most |prefix| edges; the scan makes one call per word', () => {
    const words = [...PRESETS[0].words];
    const root = buildTrie(words);
    expect(trieSteps(root, 'con')).toBe(3);
    expect(trieSteps(root, 'cx')).toBe(1);
    expect(scanCost(words, 'con').calls).toBe(12);
    // c-a stops at 2 (case, catch), c-h, c-l likewise, c-o-n runs 3 (const, continue), the rest stop at 1.
    expect(scanCost(words, 'con').chars).toBe(2 + 2 + 2 + 2 + 3 + 3 + 6 * 1);
  });

  it('subtree lists a node and everything below it', () => {
    const s = trieShape(buildTrie(['to', 'tea', 'ten']));
    expect(subtree(s, 'te').sort()).toEqual(['te', 'tea', 'ten']);
  });
});

describe('input', () => {
  it('parses lists with commas, spaces and new lines', () => {
    expect(parseList('a, an\nant  any')).toEqual({ ok: true, words: ['a', 'an', 'ant', 'any'], note: null });
  });
  it('drops duplicates with a note', () => {
    const r = parseList('go go to');
    expect(r.ok && r.words).toEqual(['go', 'to']);
    expect(r.ok && r.note).toContain('“go”');
  });
  it.each([
    ['', 'at least one'], ['  \n ', 'at least one'], ['Go', 'lowercase'], ['c3po', 'lowercase'], ['🙂', 'lowercase'], ['<b>', 'lowercase'],
    [Array.from({ length: 17 }, (_, i) => 'w' + 'abcdefghijklmnopq'[i]).join(' '), 'Up to 16'], ['abcdefghijklmn', 'Up to 13'],
  ])('refuses %j', (s, msg) => {
    const r = parseList(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
  it('one word for insert and delete', () => {
    expect(parseWord(' cat ')).toEqual({ ok: true, word: 'cat' });
    expect(parseWord('').ok).toBe(false);
    expect(parseWord('two words').ok).toBe(false);
  });
});
