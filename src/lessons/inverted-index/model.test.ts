import { describe, expect, it } from 'vitest';
import { encodeVarint } from '../../core/protobuf';
import { mulberry32 } from '../../core/random';
import { ALL_STEPS, STOP_WORDS, analyze, toyStem, tokenize, type Steps } from './analyzer';
import { DEFAULT_DOCS, MAX_DOC_CHARS, cleanDoc, docName } from './corpus';
import { buildIndex, df, docIds, termsOf } from './postings';
import { evaluate, mergeTrace, parseQuery, phraseDocs, whyEmpty, type ListOrder, type MergeKind, type Op } from './query';
import { B_RANGE, K1_RANGE, idfBm25, idfClassic, rankDocs, scoreDoc } from './rank';
import { FIXED_BYTES, decodeVByte, encodeList, encodeVByte, fromGaps, seededIds, sizesOf, toGaps } from './vbyte';

describe('syntax the lesson does not support is refused visibly, never searched for', () => {
  it('-"phrase" is ignored with a note instead of becoming NOT cat AND sat', () => {
    const q = parseQuery('dog -"cat sat"', ALL_STEPS);
    expect(q.units).toEqual([['dog']]);
    expect(q.not).toEqual([]);
    expect(q.notes.join(' ')).toContain('Subtracting a phrase');
  });
  it('capital AND, OR and NOT are ignored with a note instead of being searched as words', () => {
    for (const op of ['AND', 'OR', 'NOT']) {
      const q = parseQuery(`cat ${op} dog`, ALL_STEPS);
      expect(q.units, op).toEqual([['cat'], ['dog']]);
      expect(q.notes.join(' '), op).toContain(`${op} is not an operator`);
    }
    expect(parseQuery('cat or dog', ALL_STEPS).notes).toEqual([]);
  });
});

describe('the toy analyzer', () => {
  it('strips -ing, -ed and a plural -s, and leaves short words and -ss alone', () => {
    expect(['cats', 'dogs', 'sleeping', 'jumped', 'glass', 'sing', 'bring', 'red', 'purr', 'was', 'barked', 'birds'].map(toyStem)).toEqual(['cat', 'dog', 'sleep', 'jump', 'glass', 'sing', 'bring', 'red', 'purr', 'was', 'bark', 'bird']);
  });

  it('lowercases, splits on anything that is not a letter or digit, drops the ten stop words, then stems', () => {
    expect(STOP_WORDS).toHaveLength(10);
    expect(tokenize('The Cats, and the DOGS: sleeping on 3 mats!', ALL_STEPS)).toEqual(['cat', 'dog', 'sleep', '3', 'mat']);
    expect(tokenize('Zoë café', ALL_STEPS)).toEqual(['zo', 'caf']);
    expect(tokenize('', ALL_STEPS)).toEqual([]);
    expect(tokenize('!!! ??? --', ALL_STEPS)).toEqual([]);
  });

  it('each step can be switched off on its own, and the analysis says what each one did', () => {
    const none: Steps = { lowercase: false, stopWords: false, stem: false };
    expect(tokenize('The Cats', none)).toEqual(['The', 'Cats']);
    expect(tokenize('The Cats', { ...none, lowercase: true })).toEqual(['the', 'cats']);
    expect(tokenize('The Cats', { ...none, lowercase: true, stopWords: true })).toEqual(['cats']);
    const a = analyze('The cats sat', ALL_STEPS);
    expect(a.afterStop.map((t) => [t.token, t.removed])).toEqual([['the', true], ['cats', false], ['sat', false]]);
    expect(a.stemmed.map((t) => [t.token, t.changed])).toEqual([['cat', true], ['sat', false]]);
    expect(analyze('The cats', { ...ALL_STEPS, stem: false }).stemmed.every((t) => !t.changed)).toBe(true);
  });
});

describe('the index', () => {
  it('records term frequency and positions, sorted by document id, with hand-worked numbers', () => {
    const index = buildIndex(['cat cat dog', 'dog cat'], { lowercase: true, stopWords: false, stem: false });
    expect(index.postings.get('cat')).toEqual([{ doc: 1, tf: 2, positions: [0, 1] }, { doc: 2, tf: 1, positions: [1] }]);
    expect(index.postings.get('dog')).toEqual([{ doc: 1, tf: 1, positions: [2] }, { doc: 2, tf: 1, positions: [0] }]);
    expect(index.avgdl).toBe(2.5);
    expect(index.n).toBe(2);
    expect(termsOf(index)).toEqual(['cat', 'dog']);
  });

  it('every posting list is sorted by document id and holds each document once, and the default corpus matches a scan', () => {
    const index = buildIndex(DEFAULT_DOCS, ALL_STEPS);
    for (const list of index.postings.values()) {
      expect(list.every((p, i) => i === 0 || p.doc > list[i - 1].doc)).toBe(true);
      list.forEach((p) => expect(p.tf).toBe(p.positions.length));
    }
    for (const term of termsOf(index)) expect(docIds(index, term)).toEqual(index.tokens.flatMap((t, i) => (t.includes(term) ? [i + 1] : [])));
    expect(df(index, 'cat')).toBe(docIds(index, 'cat').length);
    expect(df(index, 'never-indexed')).toBe(0);
    expect(DEFAULT_DOCS.every((d) => d.split(/\s+/).length >= 8 && d.split(/\s+/).length <= 14)).toBe(true);
    expect(DEFAULT_DOCS).toHaveLength(12);
  });

  it('an empty corpus has no terms and an average length of 0', () => {
    const index = buildIndex([], ALL_STEPS);
    expect([index.n, index.avgdl, termsOf(index)]).toEqual([0, 0, []]);
  });

  it('a document is cut at 280 characters with a flag, and ids are d1, d2, ...', () => {
    expect(cleanDoc('x'.repeat(MAX_DOC_CHARS + 5))).toEqual({ text: 'x'.repeat(MAX_DOC_CHARS), truncated: true });
    expect(cleanDoc('short')).toEqual({ text: 'short', truncated: false });
    expect([0, 11].map(docName)).toEqual(['d1', 'd12']);
  });
});

const VOCAB = ['cat', 'cats', 'dog', 'dogs', 'bird', 'birds', 'barn', 'mat', 'sat', 'sleeping', 'jumped', 'fox', 'tree', 'garden', 'the', 'and', 'of', 'Cat', 'DOG', 'ran'];
const randomDoc = (rnd: () => number): string => {
  const words = Array.from({ length: 4 + Math.floor(rnd() * 10) }, () => VOCAB[Math.floor(rnd() * VOCAB.length)]);
  return words.map((w, i) => (i < words.length - 1 && rnd() < 0.2 ? `${w},` : w)).join(' ');
};

describe('queries against a brute-force scan, over 500 seeded queries on a 40-document corpus', () => {
  const rnd = mulberry32(31);
  const docs = Array.from({ length: 40 }, () => randomDoc(rnd));
  const index = buildIndex(docs, ALL_STEPS);
  const tokensOf = docs.map((d) => tokenize(d, ALL_STEPS));
  const word = () => VOCAB[Math.floor(rnd() * VOCAB.length)];

  interface Spec {
    plain: string[];
    not: string[];
    phrases: string[][];
    op: Op;
    order: ListOrder;
  }
  const specs: Spec[] = Array.from({ length: 500 }, () => ({
    plain: Array.from({ length: Math.floor(rnd() * 3) + (rnd() < 0.5 ? 1 : 0) }, word),
    not: rnd() < 0.4 ? [word()] : [],
    phrases: rnd() < 0.3 ? [[word(), word()]] : [],
    op: rnd() < 0.5 ? 'and' : 'or',
    order: rnd() < 0.5 ? 'shortest-first' : 'as-typed',
  }));
  const textOf = (s: Spec) => [...s.plain, ...s.not.map((w) => `-${w}`), ...s.phrases.map((p) => `"${p.join(' ')}"`)].join(' ');

  /** What a scan of every document's tokens says: a unit is a token subsequence (adjacent tokens), a NOT removes documents holding the word. */
  const oracle = (s: Spec): number[] => {
    const units = [...s.plain, ...s.phrases.map((p) => p.join(' '))].map((u) => tokenize(u, ALL_STEPS)).filter((u) => u.length > 0);
    const holds = (toks: string[], unit: string[]) => toks.some((_, i) => unit.every((t, k) => toks[i + k] === t));
    if (units.length === 0) return [];
    return tokensOf.flatMap((toks, i) => {
      const hits = units.map((u) => holds(toks, u));
      const ok = s.op === 'and' ? hits.every(Boolean) : hits.some(Boolean);
      const blocked = s.not.map((w) => tokenize(w, ALL_STEPS)).filter((u) => u.length > 0).some((u) => holds(toks, u));
      return ok && !blocked ? [i + 1] : [];
    });
  };

  it('AND, OR, NOT and phrase results equal the scan, whichever order the lists are merged in', () => {
    specs.forEach((s, n) => {
      const q = parseQuery(textOf(s), ALL_STEPS);
      expect(evaluate(index, q, s.op, s.order).docs, `#${n} ${textOf(s)} ${s.op}`).toEqual(oracle(s));
      const other = s.order === 'as-typed' ? 'shortest-first' : 'as-typed';
      expect(evaluate(index, q, s.op, other).docs).toEqual(oracle(s));
    });
  });

  it('the comparison count equals an instrumented reference written without mergeTrace', () => {
    const reference = (a: number[], b: number[], kind: MergeKind): { out: number[]; cmp: number } => {
      const out: number[] = [];
      let cmp = 0;
      const go = (i: number, j: number): void => {
        if (i >= a.length || j >= b.length) {
          if (kind !== 'intersect') out.push(...a.slice(i));
          if (kind === 'union') out.push(...b.slice(j));
          return;
        }
        cmp++;
        if (a[i] === b[j]) {
          if (kind !== 'difference') out.push(a[i]);
          go(i + 1, j + 1);
        } else if (a[i] < b[j]) {
          if (kind !== 'intersect') out.push(a[i]);
          go(i + 1, j);
        } else {
          if (kind === 'union') out.push(b[j]);
          go(i, j + 1);
        }
      };
      go(0, 0);
      return { out, cmp };
    };
    specs.forEach((s, n) => {
      const q = parseQuery(textOf(s), ALL_STEPS);
      const lists = q.units.map((u) => phraseDocs(index, u));
      if (lists.length === 0) return;
      const seq = s.op === 'and' && s.order === 'shortest-first' ? lists.map((l, i) => ({ l, i })).sort((x, y) => x.l.length - y.l.length || x.i - y.i).map((x) => x.l) : lists;
      let acc = seq[0];
      let total = 0;
      for (const l of seq.slice(1)) {
        if (s.op === 'and' && acc.length === 0) break;
        const r = reference(acc, l, s.op === 'and' ? 'intersect' : 'union');
        acc = r.out;
        total += r.cmp;
      }
      for (const w of q.not) {
        if (acc.length === 0) break;
        const r = reference(acc, phraseDocs(index, w), 'difference');
        acc = r.out;
        total += r.cmp;
      }
      expect(evaluate(index, q, s.op, s.order).comparisons, `#${n}`).toBe(total);
    });
  });

  it('shortest-first can need fewer comparisons than the order typed, and the computed counts differ on some queries', () => {
    let fewer = 0;
    specs.filter((s) => s.op === 'and' && s.plain.length >= 3).forEach((s) => {
      const q = parseQuery(textOf(s), ALL_STEPS);
      if (evaluate(index, q, 'and', 'shortest-first').comparisons < evaluate(index, q, 'and', 'as-typed').comparisons) fewer++;
    });
    expect(fewer).toBeGreaterThan(0);
  });

  it('merging two sorted lists matches the set operation, for 300 random pairs and all three kinds', () => {
    const r = mulberry32(5);
    for (let t = 0; t < 300; t++) {
      const pick = () => [...new Set(Array.from({ length: Math.floor(r() * 12) }, () => 1 + Math.floor(r() * 20)))].sort((x, y) => x - y);
      const [a, b] = [pick(), pick()];
      const inB = new Set(b);
      const inA = new Set(a);
      const out = (kind: MergeKind) => mergeTrace(a, b, kind).at(-1)?.out ?? [];
      expect(out('intersect')).toEqual(a.filter((x) => inB.has(x)));
      expect(out('difference')).toEqual(a.filter((x) => !inB.has(x)));
      expect(out('union')).toEqual([...new Set([...a, ...b])].sort((x, y) => x - y));
      expect(inA.size).toBe(a.length);
    }
  });
});

describe('phrases and hostile queries', () => {
  const index = buildIndex(['the cat sat on the mat', 'sat cat', 'a cat and the sat'], ALL_STEPS);
  it('a phrase matches adjacent tokens in order, counted after the analyzer, and not the same words apart or reversed', () => {
    expect(phraseDocs(index, ['cat', 'sat'])).toEqual([1, 3]);
    expect(phraseDocs(index, ['sat', 'cat'])).toEqual([2]);
    expect(evaluate(index, parseQuery('"cat sat"', ALL_STEPS), 'and', 'as-typed').docs).toEqual([1, 3]);
  });

  it('an empty query, only stop words, operator-only input and unknown words give notes and no results, never an exception', () => {
    for (const text of ['', '   ', 'the and of', '-', '""', '"', '-the', '- -', '"the"', '()*?']) {
      const q = parseQuery(text, ALL_STEPS);
      const e = evaluate(index, q, 'and', 'shortest-first');
      expect(e.docs, `"${text}"`).toEqual([]);
      expect(q.notes.length > 0 || whyEmpty(index, q) !== null, `"${text}"`).toBe(true);
    }
    expect(whyEmpty(index, parseQuery('zebra', ALL_STEPS))).toBe('"zebra" is in no document.');
    expect(whyEmpty(index, parseQuery('-cat', ALL_STEPS))).toContain('nothing to subtract from');
    expect(parseQuery('"cat sat', ALL_STEPS).notes[0]).toContain('never closed');
  });

  it('NOT subtracts and AND with an unknown word is empty, while OR ignores it', () => {
    expect(evaluate(index, parseQuery('cat -sat', ALL_STEPS), 'and', 'as-typed').docs).toEqual([]);
    expect(evaluate(index, parseQuery('cat -mat', ALL_STEPS), 'and', 'as-typed').docs).toEqual([2, 3]);
    expect(evaluate(index, parseQuery('cat zebra', ALL_STEPS), 'and', 'as-typed').docs).toEqual([]);
    expect(evaluate(index, parseQuery('cat zebra', ALL_STEPS), 'or', 'as-typed').docs).toEqual([1, 2, 3]);
  });
});

describe('BM25', () => {
  const docs = ['the cat sat on the mat', 'the dog sat', 'cat and dog and cat'];
  const index = buildIndex(docs, { lowercase: true, stopWords: false, stem: false });
  const p = { k1: 1.2, b: 0.75 };

  /** The formula written out for this corpus, with the numbers worked by hand in the comments of the spec. */
  const byHand = (f: number, length: number, idf: number, k1 = 1.2, b = 0.75) => (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * length) / (14 / 3)));

  it('hand vector: avgdl = 14/3, IDF(cat) = IDF(dog) = ln(1.6) = 0.4700 and the scores are 0.4208, 0.5504 and 1.0902', () => {
    expect(index.avgdl).toBeCloseTo(14 / 3, 12);
    expect(idfBm25(3, 2)).toBeCloseTo(Math.log(1.6), 12);
    expect(idfBm25(3, 2)).toBeCloseTo(0.47, 4);
    const idf = Math.log(1 + (3 - 2 + 0.5) / (2 + 0.5));
    const expected = [byHand(1, 6, idf), byHand(1, 3, idf), byHand(2, 5, idf) + byHand(1, 5, idf)];
    expect(expected.map((x) => Number(x.toFixed(4)))).toEqual([0.4208, 0.5504, 1.0902]);
    const ranked = rankDocs(index, [1, 2, 3], ['cat', 'dog'], 'bm25', p);
    for (const s of ranked) expect(s.score).toBeCloseTo(expected[s.doc - 1], 12);
    expect(ranked.map((s) => s.doc)).toEqual([3, 2, 1]);
  });

  it('with k1 = 0 and b = 0 each matching term contributes exactly its IDF', () => {
    const s = scoreDoc(index, 3, ['cat', 'dog'], 'bm25', { k1: 0, b: 0 });
    expect(s.parts.map((x) => x.part)).toEqual([idfBm25(3, 2), idfBm25(3, 2)]);
    expect(s.score).toBeCloseTo(2 * Math.log(1.6), 12);
  });

  it('b = 0 ignores document length and b = 1 normalises by it fully', () => {
    const short = scoreDoc(index, 2, ['dog'], 'bm25', { k1: 1.2, b: 0 }).score;
    const long = scoreDoc(index, 3, ['dog'], 'bm25', { k1: 1.2, b: 0 }).score;
    expect(short).toBeCloseTo(long, 12);
    const s1 = scoreDoc(index, 2, ['dog'], 'bm25', { k1: 1.2, b: 1 }).score;
    const l1 = scoreDoc(index, 3, ['dog'], 'bm25', { k1: 1.2, b: 1 }).score;
    expect(s1).toBeGreaterThan(l1);
    expect(s1).toBeCloseTo(byHand(1, 3, idfBm25(3, 2), 1.2, 1), 12);
  });

  it('repeating a term saturates: ten occurrences score under k1 + 1 times its IDF, and a smaller k1 saturates sooner', () => {
    const repeat = buildIndex(['cat sat', 'dog ran', `${'cat '.repeat(10)}fox`], { lowercase: true, stopWords: false, stem: false });
    const ratio = (k1: number) => {
      const ten = scoreDoc(repeat, 3, ['cat'], 'bm25', { k1, b: 0 }).score;
      const one = scoreDoc(repeat, 1, ['cat'], 'bm25', { k1, b: 0 }).score;
      expect(ten).toBeLessThan((k1 + 1) * idfBm25(3, 2));
      return ten / one;
    };
    let last = 0;
    for (const k1 of [0.1, 0.5, 1.2, 2, 3]) {
      const r = ratio(k1);
      expect(r).toBeGreaterThan(last);
      expect(r).toBeLessThan(10);
      last = r;
    }
  });

  it('TF-IDF is tf times ln(N / n) and gives 0 to a term every document holds, and the sliders\' ranges are what the scene offers', () => {
    expect(idfClassic(3, 3)).toBe(0);
    expect(idfClassic(8, 2)).toBeCloseTo(Math.log(4), 12);
    expect(idfClassic(5, 0)).toBe(0);
    const s = scoreDoc(index, 3, ['cat'], 'tfidf', p);
    expect(s.score).toBeCloseTo(2 * Math.log(3 / 2), 12);
    expect([K1_RANGE.min, K1_RANGE.max, B_RANGE.min, B_RANGE.max]).toEqual([0, 3, 0, 1]);
  });

  it('k1 and b change the BM25 score and mean nothing to TF-IDF, which the scene hides them for', () => {
    const a = scoreDoc(index, 3, ['cat', 'dog'], 'tfidf', { k1: 0, b: 0 }).score;
    const b = scoreDoc(index, 3, ['cat', 'dog'], 'tfidf', { k1: 3, b: 1 }).score;
    expect(a).toBe(b);
    expect(scoreDoc(index, 3, ['cat'], 'bm25', { k1: 0.1, b: 0 }).score).not.toBe(scoreDoc(index, 3, ['cat'], 'bm25', { k1: 3, b: 1 }).score);
  });
});

describe('gaps and variable-byte codes', () => {
  it('known vectors, and agreement with the protobuf varint of core/protobuf', () => {
    expect(encodeVByte(0)).toEqual([0]);
    expect(encodeVByte(300)).toEqual([0xac, 0x02]);
    expect(encodeVByte(150)).toEqual([0x96, 0x01]);
    for (const n of [0, 1, 127, 128, 255, 16_383, 16_384, 2_097_151, 2_097_152, 1_000_000_007]) expect(encodeVByte(n), `${n}`).toEqual(Array.from(encodeVarint(BigInt(n))));
  });

  it('numbers up to 127 take one byte, to 16,383 two, to 2,097,151 three: the 1/2/3-byte boundaries', () => {
    expect([127, 128, 16_383, 16_384, 2_097_151, 2_097_152].map((n) => encodeVByte(n).length)).toEqual([1, 2, 2, 3, 3, 4]);
  });

  it('gap and variable-byte encoding round-trips for 1,000 seeded sorted lists, ids above 127 and 16,383 included', () => {
    for (let seed = 0; seed < 1_000; seed++) {
      const universe = [60, 300, 20_000, 3_000_000][seed % 4];
      const ids = seededIds(1 + (seed % 40), universe, seed);
      expect(fromGaps(toGaps(ids))).toEqual(ids);
      expect(decodeVByte(encodeList(toGaps(ids)))).toEqual(toGaps(ids));
      expect(fromGaps(decodeVByte(encodeList(toGaps(ids))))).toEqual(ids);
      expect(decodeVByte(encodeList(ids))).toEqual(ids);
    }
  });

  it('gaps never take more bytes than the ids themselves, and the sizes add up against fixed-width ids', () => {
    for (let seed = 0; seed < 200; seed++) {
      const ids = seededIds(30, [300, 20_000, 3_000_000][seed % 3], seed);
      const s = sizesOf(ids);
      expect(s.gaps).toBeLessThanOrEqual(s.ids);
      expect(s.fixed).toBe(ids.length * FIXED_BYTES);
      expect(s.ids).toBe(ids.reduce((n, id) => n + encodeVByte(id).length, 0));
    }
    expect(sizesOf([5, 9, 200])).toEqual({ fixed: 12, ids: 4, gaps: 4 });
  });

  it('refuses what it cannot code and notices a truncated stream', () => {
    expect(() => encodeVByte(-1)).toThrow(RangeError);
    expect(() => encodeVByte(1.5)).toThrow(RangeError);
    expect(() => decodeVByte([0x80])).toThrow(RangeError);
    expect(decodeVByte([])).toEqual([]);
  });

  it('seeded ids are ascending, distinct and in range, and the same for one seed', () => {
    const ids = seededIds(24, 1_000, 3);
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    expect(ids.every((x, i) => x >= 1 && x <= 1_000 && (i === 0 || x > ids[i - 1]))).toBe(true);
    expect(seededIds(24, 1_000, 3)).toEqual(ids);
    expect(seededIds(50, 10, 1)).toHaveLength(10);
  });
});
