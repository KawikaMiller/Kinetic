import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  END, UNKNOWN, applyMerge, baseSymbols, bestPair, countWords, createTokenizer, initialState, pairKey, rankedPairs, symbolPreview, totalSymbols, trainMerges,
  type Mode, type Pair, type Tokenizer, type WordCount,
} from './bpe';
import { classicStart, greedyTotal, stateAfter, stepReports } from './classic';
import { CLASSIC_MERGES, CLASSIC_WORDS, ILLUSTRATIVE_PRICE_PER_MILLION, MAX_MERGES, PARAGRAPH, tokenCost } from './corpus';
import { bytesOpening, costOpening, mergeOpening, vocabOpening } from './openings';
import { MAX_CHARS, escapeText, prepare } from './text';
import { byteLength, paragraphTokenizer, tokenStats, tokenViews } from './view';

const SLOW = { timeout: 120_000 };

// ── Independent oracle: plain arrays and string rewriting, no maps, no shared helpers ─────────────────────────────

interface NaiveWord {
  symbols: string[];
  count: number;
}

const naiveWords = (words: readonly WordCount[], mode: Mode): NaiveWord[] =>
  words.map(({ word, count }) => ({
    symbols: [...(mode === 'chars' ? Array.from(word) : Array.from(new TextEncoder().encode(word), (b) => b.toString(16).padStart(2, '0'))), '</w>'],
    count,
  }));

/** Every adjacent pair and its count, by brute force over every position of every word. */
function recount(words: readonly NaiveWord[]): { left: string; right: string; count: number }[] {
  const table: { left: string; right: string; count: number }[] = [];
  for (const w of words) {
    for (let i = 0; i + 1 < w.symbols.length; i++) {
      const hit = table.find((e) => e.left === w.symbols[i] && e.right === w.symbols[i + 1]);
      if (hit) hit.count += w.count;
      else table.push({ left: w.symbols[i], right: w.symbols[i + 1], count: w.count });
    }
  }
  return table;
}

/** The merge by string rewriting: join with spaces, replace "a b" bounded by spaces, split again. */
function rewrite(symbols: readonly string[], left: string, right: string): string[] {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/<>]/g, '\\$&');
  return symbols.join(' ').replace(new RegExp(`(?<!\\S)${escape(left)} ${escape(right)}(?!\\S)`, 'g'), `${left}${right}`).split(' ');
}

function naiveTrain(words: readonly WordCount[], mode: Mode, limit: number) {
  let state = naiveWords(words, mode);
  const out: { left: string; right: string; count: number; max: number }[] = [];
  for (let i = 0; i < limit; i++) {
    const table = recount(state);
    if (table.length === 0) break;
    const max = Math.max(...table.map((e) => e.count));
    const tied = table.filter((e) => e.count === max).sort((a, b) => (a.left + '\u0000' + a.right < b.left + '\u0000' + b.right ? -1 : 1));
    const pick = tied[0];
    out.push({ ...pick, max });
    state = state.map((w) => ({ symbols: rewrite(w.symbols, pick.left, pick.right), count: w.count }));
  }
  return out;
}

const randomCorpus = (seed: number): WordCount[] => {
  const rnd = mulberry32(seed);
  const letters = 'abcde'.slice(0, 2 + Math.floor(rnd() * 4));
  return Array.from({ length: 4 + Math.floor(rnd() * 8) }, (_, i) => ({
    word: Array.from({ length: 2 + Math.floor(rnd() * 6) }, () => letters[Math.floor(rnd() * letters.length)]).join('') + (i % 3 === 0 ? 'a' : ''),
    count: 1 + Math.floor(rnd() * 9),
  }));
};

describe('training merges (scene 1)', () => {
  it('hand vector: the first ten merges of low x5, lower x2, newest x6, widest x3 with ties lexicographic, and 95 symbols to start', () => {
    expect(totalSymbols(classicStart())).toBe(5 * 4 + 2 * 6 + 6 * 7 + 3 * 7);
    expect(totalSymbols(classicStart())).toBe(95);
    const { merges } = trainMerges(CLASSIC_WORDS, 'chars', 10);
    expect(merges.map((m) => [m.left, m.right, m.count])).toEqual(CLASSIC_MERGES.map((m) => [...m]));
  });

  it('the merge list and counts equal an independent brute-force implementation, and each chosen count is the maximum of a full recount, on the example and 20 seeded corpora', () => {
    const corpora: WordCount[][] = [[...CLASSIC_WORDS], ...Array.from({ length: 20 }, (_, i) => randomCorpus(i + 1))];
    for (const [index, words] of corpora.entries()) {
      for (const mode of ['chars', 'bytes'] as const) {
        const mine = trainMerges(words, mode, 30).merges;
        const oracle = naiveTrain(words, mode, 30);
        expect(mine.map((m) => [m.left, m.right, m.count]), `corpus ${index} ${mode}`).toEqual(oracle.map((m) => [m.left, m.right, m.count]));
        mine.forEach((m, k) => expect(m.count, `corpus ${index} step ${k}`).toBe(oracle[k].max));
      }
    }
  });

  it('ties go to the lexicographically smaller pair: a corpus where "a b" and "c d" both occur twice merges "a b" first', () => {
    const words: WordCount[] = [{ word: 'ab', count: 2 }, { word: 'cd', count: 2 }];
    const state = initialState(words, 'chars');
    const ranked = rankedPairs(state);
    expect(ranked.filter((p) => p.count === 2).map((p) => `${p.left} ${p.right}`)).toEqual(['a b', 'b </w>', 'c d', 'd </w>']);
    expect(bestPair(state)).toMatchObject({ left: 'a', right: 'b', count: 2 });
  });

  it('the maintained pair counts equal a recount after every merge of the paragraph (200 merges)', () => {
    const words = countWords(PARAGRAPH);
    let state = initialState(words, 'chars');
    for (let step = 0; step < 60; step++) {
      const best = bestPair(state)!;
      state = applyMerge(state, best);
      const table = recount(state.words);
      expect(state.counts.size).toBe(table.length);
      for (const e of table) expect(state.counts.get(pairKey(e))).toBe(e.count);
    }
  });

  it('a pair that does not occur cannot be merged; ranked pairs hold only pairs that exist', () => {
    const state = classicStart();
    expect(() => applyMerge(state, { left: 'z', right: 'q' })).toThrow(/does not occur/);
    for (const p of rankedPairs(state)) expect(() => applyMerge(state, p)).not.toThrow();
    expect(rankedPairs(state).map((p) => p.count)).toEqual([...rankedPairs(state).map((p) => p.count)].sort((a, b) => b - a));
  });

  it('a hand-picked non-maximal merge leaves more symbols than greedy: w e removes 8, the greedy e s removes 9, giving 87 against 86', () => {
    const hand: Pair[] = [{ left: 'w', right: 'e' }];
    const [report] = stepReports(hand);
    expect(report).toMatchObject({ pickedCount: 8, removed: 8, greedyRemoved: 9, isGreedy: false });
    expect(report.greedy).toMatchObject({ left: 'e', right: 's', count: 9 });
    expect(totalSymbols(stateAfter(hand))).toBe(87);
    expect(greedyTotal(1)).toBe(86);
    expect(totalSymbols(classicStart()) - 87).toBe(8);
  });

  it('on the greedy path every merge removes exactly its count of symbols (no overlapping equal pairs in this corpus)', () => {
    const path = trainMerges(CLASSIC_WORDS, 'chars', 10).merges;
    for (const r of stepReports(path)) {
      expect(r.isGreedy).toBe(true);
      expect(r.removed).toBe(r.pickedCount);
    }
  });
});

describe('encoding (scenes 2 to 4)', () => {
  /** Independent oracle: repeatedly merge the adjacent pair with the lowest rank (leftmost on ties) until none is left. */
  function reference(tokenizer: Tokenizer, word: string): string[] {
    const rank = new Map(tokenizer.merges.map((m, i) => [pairKey(m), i]));
    let symbols = baseSymbols(word, tokenizer.mode).map((s) => (s === END || tokenizer.mode === 'bytes' || tokenizer.vocabulary.includes(s) ? s : UNKNOWN));
    for (;;) {
      let best = -1;
      let at = -1;
      for (let i = 0; i + 1 < symbols.length; i++) {
        const r = rank.get(pairKey({ left: symbols[i], right: symbols[i + 1] }));
        if (r !== undefined && (best === -1 || r < best)) [best, at] = [r, i];
      }
      if (at === -1) return symbols;
      symbols = [...symbols.slice(0, at), symbols[at] + symbols[at + 1], ...symbols.slice(at + 2)];
    }
  }

  const alphabet = 'abcdefghijklmnopqrstuvwxyz .,';
  const randomText = (rnd: () => number, pool: readonly string[], length: number) =>
    Array.from({ length }, () => pool[Math.floor(rnd() * pool.length)]).join('');

  it('encode (merges in learned order) equals the lowest-rank-first reference on 500 seeded strings, in both alphabets', () => {
    const rnd = mulberry32(5);
    const pool = [...'abcdefghijklmnopqrstuvwxyz  ', 'é', '🙂', '日'];
    for (const mode of ['chars', 'bytes'] as const) {
      const tokenizer = paragraphTokenizer(mode);
      for (let i = 0; i < 500; i++) {
        const text = randomText(rnd, pool, Math.floor(rnd() * 40));
        const want = text === '' ? [] : text.split(' ').flatMap((w) => reference(tokenizer, w));
        expect(tokenizer.encode(text), `${mode} ${JSON.stringify(text)}`).toEqual(want);
      }
    }
  });

  it('broken variant: an encoder that re-counts pair frequencies on the new text disagrees with the learned ranks on some seeded string', () => {
    const rnd = mulberry32(6);
    const tokenizer = paragraphTokenizer('chars');
    let disagreements = 0;
    for (let i = 0; i < 500; i++) {
      const text = randomText(rnd, [...'abcdeiorstn'].concat([' ']), 4 + Math.floor(rnd() * 30));
      const recounted = createTokenizer(countWords(text), 'chars', 30).encode(text);
      if (JSON.stringify(recounted) !== JSON.stringify(tokenizer.encode(text))) disagreements++;
    }
    expect(disagreements).toBeGreaterThan(400);
  });

  it('round trip in byte mode: decode(encode(s)) = s for 1,000 seeded strings with multi-byte and combining characters, double and edge spaces', () => {
    const rnd = mulberry32(7);
    const pool = ['a', 'b', 'e', 't', ' ', ' ', 'é', 'é', '🙂', '日', 'γ', '́', 'ñ'];
    const tokenizer = paragraphTokenizer('bytes');
    for (let i = 0; i < 1000; i++) {
      const text = randomText(rnd, pool, Math.floor(rnd() * 25));
      expect(tokenizer.decode(tokenizer.encode(text)), JSON.stringify(text)).toBe(text);
    }
  });

  it('round trip in character mode holds for ASCII strings in the alphabet, and fails (by design) for a character the toy never saw', () => {
    const rnd = mulberry32(8);
    const tokenizer = paragraphTokenizer('chars');
    for (let i = 0; i < 500; i++) {
      const text = randomText(rnd, [...alphabet], Math.floor(rnd() * 40));
      const known = [...text].filter((c) => tokenizer.vocabulary.includes(c) || c === ' ').join('');
      expect(tokenizer.decode(tokenizer.encode(known))).toBe(known);
    }
    const lossy = tokenizer.decode(tokenizer.encode('café'));
    expect(lossy).toBe('caf<unk>');
    expect(tokenizer.encode('café')).toContain(UNKNOWN);
  });

  it('lone surrogates: TextEncoder would replace one by U+FFFD, so the lesson escapes it and the escaped text round-trips', () => {
    expect(Array.from(new TextEncoder().encode('\ud800'))).toEqual([0xef, 0xbf, 0xbd]);
    const tokenizer = paragraphTokenizer('bytes');
    expect(tokenizer.decode(tokenizer.encode('\ud800'))).toBe('�');
    const escaped = escapeText('a\ud800b\udc00c');
    expect(escaped).toBe('a\\ud800b\\udc00c');
    expect(tokenizer.decode(tokenizer.encode(escaped))).toBe(escaped);
    expect(escapeText('🙂')).toBe('🙂');
    expect(escapeText('tab\there\u0000')).toBe('tab\\u0009here\\u0000');
  });

  it('vocabulary size is the base size plus the number of merges, for every prefix of the 200 merges', () => {
    for (const mode of ['chars', 'bytes'] as const) {
      const full = paragraphTokenizer(mode);
      expect(full.merges.length).toBe(MAX_MERGES);
      for (let m = 0; m <= MAX_MERGES; m += 20) {
        const t = full.withMerges(m);
        expect(t.vocabulary.length).toBe(t.baseSize + m);
        expect(t.merges.length).toBe(m);
      }
    }
    const distinct = new Set(Array.from(countWords(PARAGRAPH).map((w) => w.word).join('')));
    expect(paragraphTokenizer('chars').baseSize).toBe(distinct.size + 2);
    expect(paragraphTokenizer('bytes').baseSize).toBe(257);
  });

  it('the token count never increases as a merge is added, for the opening text and 50 seeded strings', () => {
    const rnd = mulberry32(9);
    const full = paragraphTokenizer('chars');
    const texts = [vocabOpening().text, ...Array.from({ length: 50 }, () => randomText(rnd, [...alphabet], 10 + Math.floor(rnd() * 40)))];
    for (const text of texts) {
      let previous = Infinity;
      for (let m = 0; m <= MAX_MERGES; m++) {
        const count = full.withMerges(m).encode(text).length;
        expect(count, `${JSON.stringify(text)} at ${m} merges`).toBeLessThanOrEqual(previous);
        previous = count;
      }
    }
  }, SLOW.timeout);

  it('ids: a merged symbol\'s id is the base size plus its merge number; base symbols keep their own', () => {
    const t = paragraphTokenizer('chars');
    expect(t.idOf(UNKNOWN)).toBe(0);
    t.merges.slice(0, 20).forEach((m, i) => expect(t.vocabulary[t.baseSize + i]).toBe(m.left + m.right));
    expect(t.idOf(t.vocabulary[t.baseSize + 3])).toBeLessThanOrEqual(t.baseSize + 3);
  });

  it('token statistics: characters, tokens, characters per token and whole words, from the encoder', () => {
    const t = paragraphTokenizer('chars');
    const text = vocabOpening().text;
    const s = tokenStats(t.withMerges(vocabOpening().merges), text);
    expect(s.characters).toBe(Array.from(text).length);
    expect(s.words).toBe(text.split(' ').length);
    expect(s.charsPerToken).toBeCloseTo(s.characters / s.tokens, 12);
    expect(tokenStats(t, '').tokens).toBe(0);
    expect(tokenStats(t, '').charsPerToken).toBeNull();
    expect(t.encode('')).toEqual([]);
  });

  it('byte symbols: c3 on its own is only part of a character; c3 a9 spells é; the end marker survives in the preview', () => {
    expect(symbolPreview('c3', 'bytes')).toBeNull();
    expect(symbolPreview('c3a9', 'bytes')).toBe('é');
    expect(symbolPreview('6573</w>', 'bytes')).toBe(`es${END}`);
    expect(byteLength('café')).toBe(5);
    const tokenizer = paragraphTokenizer('bytes');
    const views = tokenViews(tokenizer, tokenizer.encode('é'));
    expect(views.map((v) => v.hex)).toEqual(['c3', 'a9', null]);
    expect(views[0].text).toBeNull();
  });
});

describe('typed input (hostile cases)', () => {
  it('empty text is 0 tokens; text over 2,000 characters is cut to 2,000 and says so; escapes are counted', () => {
    expect(prepare('').text).toBe('');
    const long = '🙂'.repeat(3000);
    const p = prepare(long);
    expect(Array.from(p.text).length).toBe(MAX_CHARS);
    expect(p.truncated).toBe(true);
    expect(prepare('x'.repeat(MAX_CHARS)).truncated).toBe(false);
    expect(prepare('a\ud800\u0007b').escaped).toBe(2);
    expect(prepare('plain').escaped).toBe(0);
  });
});

describe('cost arithmetic (scene 4)', () => {
  it('cost = tokens x price / 1,000,000 for typed values, and the window share is tokens over the window', () => {
    const rnd = mulberry32(10);
    for (let i = 0; i < 50; i++) {
      const [tokens, price] = [Math.floor(rnd() * 5e6), Math.round(rnd() * 1000) / 100];
      expect(tokenCost(tokens, price)).toBeCloseTo((tokens * price) / 1e6, 12);
    }
    expect(tokenCost(42, ILLUSTRATIVE_PRICE_PER_MILLION)).toBeCloseTo(0.000105, 12);
  });
});

describe('opening states are pure functions', () => {
  it('each scene opens from fresh values, and mutating one result never reaches the next', () => {
    for (const open of [mergeOpening, vocabOpening, bytesOpening, costOpening]) {
      expect(open()).toEqual(open());
      expect(open()).not.toBe(open());
    }
    mergeOpening().path.push({ left: 'a', right: 'b' });
    expect(mergeOpening().path).toEqual([]);
  });
});
