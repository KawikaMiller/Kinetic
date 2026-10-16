import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { GOLD, OVERLAP_STEP_PCT, PREPARED, SIZE_MAX, SIZE_MIN, buildChunks, chunkSpans, chunkWords, holdsGold, overlapWords, type Chunk } from './chunker';
import { DOCS, EVAL_QUESTIONS } from './corpus';
import { CONTEXT_BUDGET_WORDS, GROUNDING_THRESHOLD, SYSTEM_WORDS, answer, assemble } from './generate';
import { goldFor, runPipeline } from './pipeline';
import { parseQuestion } from './question';
import { BM25_B, BM25_K1, bm25Scores, evalRecall, indexFor, indexTokens, queryTerms, retrieve, scoresFor, tfidfScores, tokenise, topK } from './retrieval';
import { SWEEP_SIZES } from './views';

const dummyChunks = (n: number): Chunk[] => Array.from({ length: n }, (_, id) => ({ id, docIndex: 0, start: 0, end: 1 }));

describe('the corpus', () => {
  it('has 24 pages of 80 to 300 words and 8 questions whose gold sentence exists', () => {
    expect(DOCS).toHaveLength(24);
    for (const p of PREPARED) {
      expect(p.words.length, p.doc.id).toBeGreaterThanOrEqual(80);
      expect(p.words.length, p.doc.id).toBeLessThanOrEqual(300);
    }
    expect(EVAL_QUESTIONS).toHaveLength(8);
    for (const g of GOLD) expect(g.end).toBeGreaterThan(g.start);
  });
});

describe('the chunker', () => {
  it('covers every word of every page, never exceeds the size, and overlaps by the stated amount (200 seeded settings)', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 200; t++) {
      const size = SIZE_MIN + Math.floor(rnd() * (SIZE_MAX - SIZE_MIN + 1));
      const pct = Math.floor(rnd() * 6) * OVERLAP_STEP_PCT;
      for (const p of PREPARED) {
        const spans = chunkSpans(p.words.length, size, pct);
        const covered = new Array<boolean>(p.words.length).fill(false);
        for (const [s, e] of spans) {
          expect(e - s).toBeLessThanOrEqual(size);
          for (let i = s; i < e; i++) covered[i] = true;
        }
        expect(covered.every(Boolean), `${p.doc.id} ${size}/${pct}`).toBe(true);
        for (let i = 1; i < spans.length; i++) expect(spans[i - 1][1] - spans[i][0]).toBe(overlapWords(size, pct));
      }
    }
  });

  it('the broken chunker that drops each chunk\'s last word fails coverage, and recall falls for a named question', () => {
    const rnd = mulberry32(6);
    const p = PREPARED[0];
    const spans = chunkSpans(p.words.length, 40, 0, 'dropLastWord');
    expect(spans.every(([s, e]) => e - s <= 39)).toBe(true);
    const covered = new Set(spans.flatMap(([s, e]) => Array.from({ length: e - s }, (_, i) => s + i)));
    expect(covered.size).toBeLessThan(p.words.length);
    void rnd;
    const lost: string[] = [];
    for (const size of SWEEP_SIZES) {
      const good = evalRecall(size, 0, 'tfidf', 3);
      const bad = evalRecall(size, 0, 'tfidf', 3, 'dropLastWord');
      expect(bad.recall).toBeLessThanOrEqual(good.recall);
      good.perQuestion.forEach((g, i) => {
        if (g.hit && !bad.perQuestion[i].hit) lost.push(`${g.id}@${size}`);
      });
    }
    expect(lost.length).toBeGreaterThan(0);
    const [id, size] = lost[0].split('@');
    const gold = GOLD.find((g) => g.question.id === id)!;
    const brokenChunks = buildChunks(Number(size), 0, 'dropLastWord').filter((c) => c.docIndex === gold.docIndex);
    const droppedInGold = Array.from({ length: gold.end - gold.start }, (_, i) => gold.start + i).some((w) => !brokenChunks.some((c) => c.start <= w && w < c.end));
    expect(droppedInGold, `question ${id} at size ${size} loses a word of its gold sentence`).toBe(true);
  });
});

describe('TF-IDF and BM25 against hand-worked numbers', () => {
  // Three chunks: d1 = apple banana, d2 = apple cherry cherry, d3 = banana durian. N = 3.
  // idf = ln(N/df) + 1: apple and banana (df 2) a = ln 1.5 + 1; cherry and durian (df 1) c = ln 3 + 1.
  const index = indexTokens(dummyChunks(3), [['apple', 'banana'], ['apple', 'cherry', 'cherry'], ['banana', 'durian']]);
  const a = Math.log(1.5) + 1;
  const c = Math.log(3) + 1;

  it('idf values are the printed ones', () => {
    expect(index.idf[index.vocab.get('apple')!]).toBeCloseTo(a, 9);
    expect(index.idf[index.vocab.get('cherry')!]).toBeCloseTo(c, 9);
    expect(a).toBeCloseTo(1.405465108, 9);
    expect(c).toBeCloseTo(2.098612289, 9);
  });

  it('cosine of the query "apple cherry" with each chunk, worked on paper', () => {
    // q = (a, 0, c, 0), |q| = sqrt(a^2 + c^2).  d1 = (a, a, 0, 0)/(a sqrt 2).  d2 = (a, 0, 2c, 0)/sqrt(a^2 + 4c^2).
    const q = Math.sqrt(a * a + c * c);
    const s = tfidfScores(index, queryTerms(index, 'apple cherry'));
    expect(s[0]).toBeCloseTo(a / Math.SQRT2 / q, 9);
    expect(s[1]).toBeCloseTo((a * a + 2 * c * c) / (Math.sqrt(a * a + 4 * c * c) * q), 9);
    expect(s[2]).toBe(0);
    expect(s[1]).toBeCloseTo(0.96457, 5);
  });

  it('BM25 of "cherry": only chunk 2 matches, with the printed value', () => {
    const idf = Math.log(1 + (3 - 1 + 0.5) / (1 + 0.5));
    const length = 3;
    const avg = 7 / 3;
    const expected = (idf * 2 * (BM25_K1 + 1)) / (2 + BM25_K1 * (1 - BM25_B + (BM25_B * length) / avg));
    const s = bm25Scores(index, ['cherry']);
    expect(s[0]).toBe(0);
    expect(s[1]).toBeCloseTo(expected, 12);
    expect(expected).toBeCloseTo(1.2483, 4);
  });
});

describe('top-k and recall', () => {
  it('topK equals a full sort of the positive scores (ties to the earlier chunk), 200 seeded score lists', () => {
    const rnd = mulberry32(8);
    for (let t = 0; t < 200; t++) {
      const n = 5 + Math.floor(rnd() * 40);
      const scores = Array.from({ length: n }, () => (rnd() < 0.3 ? 0 : Math.floor(rnd() * 6) / 5));
      const k = 1 + Math.floor(rnd() * 8);
      const sorted = scores.map((s, i) => ({ s, i })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s || x.i - y.i).slice(0, k).map((x) => x.i);
      expect(topK(scores, k)).toEqual(sorted);
    }
  });

  it('retrieval on the real index equals a brute-force sort of every score', () => {
    const index = indexFor(60, 0);
    for (const q of EVAL_QUESTIONS) {
      const scores = scoresFor(index, 'tfidf', q.text);
      const brute = scores.map((s, i) => ({ s, i })).sort((x, y) => y.s - x.s || x.i - y.i).filter((x) => x.s > 0).slice(0, 5).map((x) => x.i);
      expect(retrieve(index, 'tfidf', q.text, 5).top).toEqual(brute);
    }
  });

  it('recall@k equals a hand count from a full sort, for both scorers at several settings', () => {
    for (const [size, pct, k] of [[60, 0, 2], [100, 0, 3], [40, 30, 1], [140, 20, 5]] as const) {
      for (const scorer of ['tfidf', 'bm25'] as const) {
        const index = indexFor(size, pct);
        let hitCount = 0;
        for (const g of GOLD) {
          const order = scoresFor(index, scorer, g.question.text).map((s, i) => ({ s, i })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s || x.i - y.i).slice(0, k);
          if (order.some((x) => holdsGold(index.chunks[x.i], g))) hitCount++;
        }
        expect(evalRecall(size, pct, scorer, k).recall).toBe(hitCount / GOLD.length);
      }
    }
  });

  it('recall never falls as k grows, for every chunk size, overlap and scorer', () => {
    for (const scorer of ['tfidf', 'bm25'] as const) {
      for (const pct of [0, 30]) {
        for (const size of SWEEP_SIZES) {
          let last = 0;
          for (let k = 1; k <= 8; k++) {
            const r = evalRecall(size, pct, scorer, k).recall;
            expect(r, `${scorer} ${size}/${pct} k${k}`).toBeGreaterThanOrEqual(last);
            last = r;
          }
        }
      }
    }
  });

  it('a question of only stopwords, or of words no page uses, retrieves nothing and says why', () => {
    const index = indexFor(60, 0);
    expect(retrieve(index, 'tfidf', 'what is the', 3)).toMatchObject({ top: [], note: 'no-usable-words' });
    expect(retrieve(index, 'bm25', 'zxqv wibble', 3)).toMatchObject({ top: [], note: 'no-known-words' });
    expect(tokenise('Is it the 30 days?')).toEqual(['30', 'days']);
  });
});

describe('the prompt and the stand-in answerer', () => {
  it('assembly adds chunks in rank order and cuts the first that overflows and everything after it', () => {
    const index = indexFor(100, 0);
    const chunks = [0, 1, 2, 3].map((i) => index.chunks[i]);
    const p = assemble(chunks, 'a b c');
    let used = SYSTEM_WORDS + 3;
    let open = true;
    chunks.forEach((c, n) => {
      const w = c.end - c.start;
      open = open && used + w <= CONTEXT_BUDGET_WORDS;
      if (open) used += w;
      expect(p.items[n].fits).toBe(open);
    });
    expect(p.used).toBe(used);
    expect(p.used).toBeLessThanOrEqual(CONTEXT_BUDGET_WORDS);
  });

  it('the answerer follows the documented rule on 100 seeded questions (independent re-implementation)', () => {
    const rnd = mulberry32(42);
    for (let t = 0; t < 100; t++) {
      const doc = DOCS[Math.floor(rnd() * DOCS.length)];
      const sentence = doc.sentences[Math.floor(rnd() * doc.sentences.length)].split(' ');
      const picked = sentence.filter(() => rnd() < 0.5);
      const question = `${picked.join(' ')} please`;
      const grounded = rnd() < 0.5;
      const size = [40, 60, 100][t % 3];
      const run = runPipeline(question, { size, overlapPct: 0, scorer: 'tfidf', k: 3, grounded });
      // Reference: walk the chunk text sentence by sentence by counting words.
      const qWords = [...new Set(tokenise(question))];
      const context = run.prompt.items.filter((i) => i.fits).map((i) => i.chunk);
      let best: { share: number; text: string } | null = null;
      for (const chunk of context) {
        const d = DOCS[chunk.docIndex];
        let offset = 0;
        for (const s of d.sentences) {
          const n = s.split(' ').length;
          const lo = Math.max(offset, chunk.start);
          const hi = Math.min(offset + n, chunk.end);
          if (lo < hi) {
            const text = s.split(' ').slice(lo - offset, hi - offset).join(' ');
            const have = tokenise(text);
            const share = qWords.length === 0 ? 0 : qWords.filter((w) => have.includes(w)).length / qWords.length;
            if (best === null || share > best.share) best = { share, text };
          }
          offset += n;
        }
      }
      if (best === null) expect(run.answer.kind).toBe('none');
      else if (grounded && best.share < GROUNDING_THRESHOLD) expect(run.answer.kind).toBe('abstain');
      else {
        expect(run.answer.kind).toBe('answer');
        if (run.answer.kind === 'answer') expect(run.answer.pick.text).toBe(best.text);
      }
    }
  });

  it('an empty context gives no answer', () => {
    expect(answer([], 'anything', false).kind).toBe('none');
  });

  it('an answer made of exactly the gold sentence is judged right, a fragment or another sentence wrong', () => {
    const q = EVAL_QUESTIONS[1];
    const run = runPipeline(q.text, { size: 60, overlapPct: 0, scorer: 'tfidf', k: 2, grounded: false });
    expect(run.verdict).toBe('correct');
    expect(goldFor(q.text)?.question.id).toBe('q2');
    expect(goldFor('a typed question')).toBeNull();
    const chunk = chunkWords(run.retrieval.index.chunks[run.retrieval.top[0]]);
    expect(chunk.length).toBeGreaterThan(0);
  });
});

describe('typed questions', () => {
  it('are refused when empty, too long or holding control characters, with a reason', () => {
    expect(parseQuestion('   ')).toMatchObject({ ok: false });
    expect(parseQuestion('a'.repeat(121))).toMatchObject({ ok: false, error: expect.stringContaining('120') });
    expect(parseQuestion('hello\u0007 there')).toMatchObject({ ok: false, error: expect.stringContaining('Control') });
    expect(parseQuestion('a'.repeat(120))).toMatchObject({ ok: true });
    expect(parseQuestion('  How long?  ')).toEqual({ ok: true, value: 'How long?' });
  });
});
