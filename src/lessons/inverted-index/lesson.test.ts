import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { ALL_STEPS } from './analyzer';
import { buildCaption, compressCaption, queryCaption, rankCaption } from './captions';
import { DEFAULT_DOCS, REPEATER, docName } from './corpus';
import { PHRASE, REVERSED_PHRASE, THREE_WORDS, buildFacts, compressFacts, phraseFacts, queryFacts, rankFacts } from './facts';
import { mergeFrames } from './frames';
import lesson from './index';
import { buildIndex, docIds, termsOf } from './postings';
import { evaluate, parseQuery, whyEmpty } from './query';
import { DEFAULT_B, DEFAULT_K1, rankDocs, shownRows } from './rank';
import { BIG_SEED, DEFAULT_EXPONENT, POSTINGS_SHOWN, seededIds, sizesOf } from './vbyte';

const plain = (node: Parameters<typeof text>[0]) => text(node, { strict: true });
const index = buildIndex(DEFAULT_DOCS, ALL_STEPS);
const answer = (q: string, op: 'and' | 'or' = 'and', order: 'shortest-first' | 'as-typed' = 'shortest-first') => evaluate(index, parseQuery(q, ALL_STEPS), op, order);

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: cat is in the documents a scan finds, and switching the stemmer off adds the plurals as terms', () => {
    const f = buildFacts();
    const scan = DEFAULT_DOCS.flatMap((d, i) => (d.toLowerCase().match(/[a-z0-9]+/g)!.some((w) => w === 'cat' || w === 'cats') ? [docName(i)] : []));
    expect(f.docs).toEqual(scan);
    expect(f.termsWithoutStemmer).toBeGreaterThan(f.terms);
    const noStem = buildIndex(DEFAULT_DOCS, { ...ALL_STEPS, stem: false });
    expect(termsOf(noStem)).toContain('cats');
    expect(termsOf(index)).not.toContain('cats');
    expect(lesson.tryThis[0]).toContain(`from ${f.terms} to ${f.termsWithoutStemmer} terms`);
    expect(plain(buildCaption(index))).toContain(`${termsOf(index).length} terms`);
  });

  it('try-this 2: "cat dog" finds the documents holding both, and with three words the order of merging changes the comparisons', () => {
    const f = queryFacts();
    const both = DEFAULT_DOCS.flatMap((d, i) => (/\bcats?\b/i.test(d) && /\bdogs?\b/i.test(d) ? [i + 1] : []));
    expect(answer('cat dog').docs).toEqual(both);
    expect(f.twoDocs).toBe(both.length);
    expect(f.threeShortest).toBeLessThan(f.threeTyped);
    expect(answer(THREE_WORDS).docs).toEqual(answer(THREE_WORDS, 'and', 'as-typed').docs);
    expect(lesson.tryThis[1]).toContain(`takes ${f.threeShortest} comparisons, and "As typed" takes ${f.threeTyped}`);
    const e = answer(THREE_WORDS);
    const c = plain(queryCaption({ e, op: 'and', order: 'shortest-first', other: f.threeTyped, notes: [], empty: null }));
    expect(c).toContain(`${e.comparisons} comparisons`);
    expect(c).toContain(`The other order would take ${f.threeTyped}`);
  });

  it('try-this 3: the phrase matches where the words are adjacent, and its reverse matches nothing', () => {
    const f = phraseFacts();
    expect(f.phrase).toEqual(['d1', 'd10']);
    expect(f.reversed).toBe(0);
    expect(PHRASE).toBe('"cat sat"');
    expect(REVERSED_PHRASE).toBe('"sat cat"');
    const adjacent = DEFAULT_DOCS.flatMap((d, i) => (/\bcats? sat\b/i.test(d) ? [docName(i)] : []));
    expect(f.phrase).toEqual(adjacent);
    expect(lesson.tryThis[2]).toContain('d1 and d10 match');
  });

  it('try-this 4: the repeater ranks first by TF-IDF and lower by BM25, and last when k1 is 0', () => {
    const f = rankFacts();
    expect(f.tfidf).toBe(1);
    expect(f.bm25).toBeGreaterThan(1);
    expect(f.bm25k0).toBe(f.matches);
    expect(f.bm25k0).toBeGreaterThanOrEqual(f.bm25);
    const withRepeater = buildIndex([...DEFAULT_DOCS, REPEATER], ALL_STEPS);
    const docs = evaluate(withRepeater, parseQuery('cat dog', ALL_STEPS), 'or', 'as-typed').docs;
    const ranked = rankDocs(withRepeater, docs, ['cat', 'dog'], 'bm25', { k1: DEFAULT_K1, b: DEFAULT_B });
    expect(ranked.findIndex((s) => s.doc === DEFAULT_DOCS.length + 1) + 1).toBe(f.bm25);
    expect(lesson.tryThis[3]).toContain(`number ${f.bm25} of ${f.matches} by BM25`);
    expect(plain(rankCaption({ ranker: 'bm25', top: ranked[0], matches: docs.length, k1: DEFAULT_K1, b: DEFAULT_B }))).toContain(`d${ranked[0].doc} ranks first`);
  });

  it('try-this 5: a million-document collection takes 96 bytes fixed and fewer as ids and as gaps', () => {
    const f = compressFacts();
    const ids = seededIds(POSTINGS_SHOWN, 10 ** DEFAULT_EXPONENT, BIG_SEED);
    expect(f).toMatchObject({ ...sizesOf(ids), collection: 1_000_000, count: 24, fixed: 96 });
    expect(f.gaps).toBeLessThan(f.ids);
    expect(f.ids).toBeLessThan(f.fixed);
    expect(lesson.tryThis[4]).toContain(`${f.fixed} bytes at 4 bytes each, ${f.ids} as variable-byte ids and ${f.gaps} as variable-byte gaps`);
    expect(plain(compressCaption({ count: f.count, sizes: sizesOf(ids), source: 'x' }))).toContain(`${f.gaps} bytes as variable-byte gaps`);
  });
});

describe('the compression wording follows the sizes', () => {
  it('on the default corpus ids and gaps tie, so the caption claims no gap saving; on the big collection it states one measured against the ids', () => {
    const busiest = [...index.postings.keys()].sort((x, y) => index.postings.get(y)!.length - index.postings.get(x)!.length || x.localeCompare(y))[0];
    const small = sizesOf(docIds(index, busiest));
    expect(small.gaps).toBe(small.ids);
    const tie = plain(compressCaption({ count: docIds(index, busiest).length, sizes: small, source: 'x' }));
    expect(tie).toContain('tie with the ids');
    expect(tie).not.toContain('gaps save');
    const big = sizesOf(seededIds(POSTINGS_SHOWN, 10 ** DEFAULT_EXPONENT, BIG_SEED));
    const saving = Math.round((1 - big.gaps / big.ids) * 100);
    expect(plain(compressCaption({ count: POSTINGS_SHOWN, sizes: big, source: 'x' }))).toContain(`gaps save ${saving}% against the variable-byte ids`);
    expect(plain(compressCaption({ count: 0, sizes: sizesOf([]), source: 'x' }))).toContain('nothing to encode');
  });
});

describe('the results list always shows where a followed document landed', () => {
  it('the repeater at k1 = 0 is outside the first 8 rows, so it is pinned with its true place; at the default it is inside and not repeated', () => {
    const withRepeater = buildIndex([...DEFAULT_DOCS, REPEATER], ALL_STEPS);
    const docs = evaluate(withRepeater, parseQuery('cat dog', ALL_STEPS), 'or', 'as-typed').docs;
    const repeaterDoc = DEFAULT_DOCS.length + 1;
    const flat = rankDocs(withRepeater, docs, ['cat', 'dog'], 'bm25', { k1: 0, b: DEFAULT_B });
    const shownFlat = shownRows(flat, repeaterDoc);
    expect(shownFlat.rows).toHaveLength(8);
    expect(shownFlat.pinnedRow).toMatchObject({ place: docs.length });
    expect(shownFlat.pinnedRow!.scored.doc).toBe(repeaterDoc);
    const normal = shownRows(rankDocs(withRepeater, docs, ['cat', 'dog'], 'bm25', { k1: DEFAULT_K1, b: DEFAULT_B }), repeaterDoc);
    expect(normal.pinnedRow).toBeNull();
    expect(normal.rows.some((r) => r.scored.doc === repeaterDoc)).toBe(true);
    expect(shownRows(flat, null).pinnedRow).toBeNull();
  });
});

describe('captions and frames are computed from the model', () => {
  it('the query caption states comparisons and documents for every operator, order and a range of queries', () => {
    for (const q of ['cat dog', 'cat dog garden', 'barn -cat', '"cat sat"', 'zebra', 'cat zebra', '']) {
      for (const op of ['and', 'or'] as const) {
        for (const order of ['shortest-first', 'as-typed'] as const) {
          const parsed = parseQuery(q, ALL_STEPS);
          const e = evaluate(index, parsed, op, order);
          const empty = e.docs.length === 0 ? whyEmpty(index, parsed) : null;
          const c = plain(queryCaption({ e, op, order, other: 0, notes: parsed.notes, empty }));
          if (!empty) {
            expect(c, `${q} ${op} ${order}`).toContain(`${e.comparisons} ${e.comparisons === 1 ? 'comparison' : 'comparisons'}`);
            expect(c.includes('by intersection')).toBe(op === 'and');
          }
        }
      }
    }
  });

  it('the merge frames walk the comparisons: one frame per step plus an opening and a closing frame, the last holding the result', () => {
    const e = answer('cat dog');
    const m = e.merges[0];
    const frames = mergeFrames(m.left, m.right, m.kind, m.steps);
    expect(frames).toHaveLength(m.steps.length + 2);
    expect(frames.at(-1)!.out).toEqual(m.steps.at(-1)!.out);
    expect(plain(frames.at(-1)!.say)).toContain(`after ${e.comparisons} comparisons`);
    for (let n = 1; n <= m.steps.length; n++) {
      const f = frames[n];
      expect(f.out).toEqual(n === 1 ? [] : m.steps[n - 2].out);
      if (f.i !== null) expect(plain(f.say)).toContain(`${m.left[f.i]}`);
    }
    // Every id ends up kept or skipped exactly once, by the last frame.
    const last = frames.at(-1)!;
    expect([...last.keptLeft, ...last.skippedLeft].sort((a, b) => a - b)).toEqual(m.left.slice(0, [...last.keptLeft, ...last.skippedLeft].length).map((_, i) => i));
  });

  it('whatever the corpus, an empty query reads as "no results" with a reason, and unknown words are named', () => {
    expect(whyEmpty(index, parseQuery('', ALL_STEPS))).toBe('Type a word to look up.');
    expect(whyEmpty(index, parseQuery('zebra yak', ALL_STEPS))).toBe('"zebra" and "yak" are in no document.');
    expect(docIds(index, 'cat').length).toBeGreaterThan(0);
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
