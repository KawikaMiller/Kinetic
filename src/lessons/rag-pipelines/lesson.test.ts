import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { lintLesson } from '../../core/lessonContent';
import { unscopedAbsolutes } from '../../core/lessonContentT3';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { IDF_NOTE, answerCaption, chunkCaption, measureCaption, retrieveCaption } from './captions';
import { EVAL_QUESTIONS } from './corpus';
import { BIG_CHUNK_SIZE, BIG_K, OVERLAP_FIX_PCT, WIDE_SIZE, answerFacts, chunkFacts, measureFacts, retrieveFacts } from './facts';
import lesson from './index';
import { runPipeline } from './pipeline';
import { evalRecall } from './retrieval';
import { ANSWER_DEFAULT, ANSWER_OVERLAP_PCT, ANSWER_SCORER, CHUNK_DEFAULT, MEASURE_DEFAULT, RETRIEVE_DEFAULT } from './settings';
import { SWEEP_SIZES, chunkView, fullPhrase, recallCurve, type RecallCurve } from './views';
import { indexFor } from './retrieval';

const text = (q: string) => EVAL_QUESTIONS.find((e) => e.id === q)!.text;

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('rag-pipelines')).toHaveLength(4);
    expect(sharedSceneComponents('rag-pipelines')).toEqual([]);
    expect(sceneElements('rag-pipelines').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(CHUNK_DEFAULT).toEqual({ doc: 'r3', size: 40, overlapPct: 0 });
    expect(RETRIEVE_DEFAULT).toEqual({ question: 'q1', size: 60, scorer: 'tfidf', k: 2 });
    expect(ANSWER_DEFAULT).toEqual({ question: 'q1', size: 60, k: 2, grounded: false });
    expect(MEASURE_DEFAULT).toEqual({ size: 60, k: 2, overlapPct: 0 });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: the gold sentence is split at 40 words and no overlap, inside at 30%, and its score falls at 200 words', () => {
    const f = chunkFacts();
    expect(f.question).toBe('Q6');
    expect(f.open.touching).toBe(2);
    expect(f.open.inside).toBe(false);
    expect(f.open.cosine).toBeNull();
    expect(f.fixed.inside).toBe(true);
    expect(f.wide.cosine!).toBeLessThan(f.fixed.cosine!);
    expect(lesson.tryThis[0]).toContain(`Set Overlap to ${OVERLAP_FIX_PCT}%`);
    expect(lesson.tryThis[0]).toContain(`${WIDE_SIZE}`);
    expect(expectCaption(chunkCaption(f.open, 40, 0))).toContain('split across 2 chunks');
    expect(expectCaption(chunkCaption(f.fixed, 40, OVERLAP_FIX_PCT))).toContain('inside one chunk');
  });

  it('try-this 2: question Q1 misses at 60 words and top-2, and at 100 words and top-3 the gold chunk is ranked 3 and cut from the prompt', () => {
    const f = retrieveFacts();
    expect(f.open.goldHits).toEqual([]);
    expect(f.goldRank).toBe(3);
    expect(f.goldFits).toBe(false);
    expect(f.bigger.goldHits).toHaveLength(1);
    expect(expectCaption(retrieveCaption(f.open, 2, 'tfidf', false))).toContain('None of them holds the gold sentence');
    expect(expectCaption(retrieveCaption(f.bigger, BIG_K, 'tfidf', false))).toContain('cut from the prompt');
    expect(BIG_CHUNK_SIZE).toBe(100);
  });

  it('try-this 3: question Q1 gets a confident wrong answer with grounding off and an abstention with it on', () => {
    const f = answerFacts();
    expect(f.off.verdict).toBe('wrong');
    expect(f.on.verdict).toBe('abstained');
    expect(f.off.goldHits).toEqual([]);
    expect(expectCaption(answerCaption(f.off, false))).toContain('a confident wrong answer');
    expect(expectCaption(answerCaption(f.on, true))).toContain('different failure');
    expect(lesson.tryThis[2]).toContain(`${Math.round(f.overlap * 100)}% of the question's words`);
  });

  it('try-this 4: recall at 60 words and top-2 matches a direct run, and the first size with 100% moves with k', () => {
    const f = measureFacts();
    expect(f.tfidfAtDefault).toBe(Math.round(evalRecall(60, 0, 'tfidf', 2).recall * 100));
    const full = (k: number) => SWEEP_SIZES.filter((size) => evalRecall(size, 0, 'tfidf', k).recall === 1);
    expect(f.curveAtDefaultK.fullSizes).toEqual(full(2));
    expect(f.curveAtBigK.fullSizes).toEqual(full(BIG_K));
    expect(f.curveAtBigK.fullSizes).toContain(BIG_CHUNK_SIZE);
    expect(f.tfidfAtBig).toBe(100);
    expect(lesson.tryThis[3]).toContain(`${f.tfidfAtDefault}%`);
    expect(lesson.tryThis[3]).toContain('at no swept size');
    const caption = expectCaption(measureCaption(f.curveAtDefaultK, recallCurve('bm25', 2, 0), 60, 2, 0, { tfidf: f.tfidfAtDefault, bm25: f.bm25AtDefault }));
    expect(caption).toContain('at no swept size (TF-IDF)');
  });
});

describe('captions follow the controls', () => {
  it('the retrieval caption says "None of them" exactly when no gold chunk was retrieved, over every question, k and size', () => {
    for (const q of EVAL_QUESTIONS) {
      for (const k of [1, 3, 8]) {
        for (const size of [20, 60, 140]) {
          for (const scorer of ['tfidf', 'bm25'] as const) {
            const run = runPipeline(q.text, { size, overlapPct: 0, scorer, k, grounded: false });
            const c = expectCaption(retrieveCaption(run, k, scorer, false));
            expect(c.includes('None of them holds'), `${q.id} ${size} k${k} ${scorer}`).toBe(run.goldHits.length === 0);
            expect(c).toContain(`${run.prompt.used} of the 300-word budget`);
          }
        }
      }
    }
  });

  it('a typed question is never marked right or wrong', () => {
    const run = runPipeline('Can I return a lamp?', { size: 60, overlapPct: 0, scorer: 'tfidf', k: 3, grounded: false });
    expect(run.verdict).toBeNull();
    expect(expectCaption(retrieveCaption(run, 3, 'tfidf', true))).toContain('no gold sentence');
    expect(expectCaption(answerCaption(run, false))).not.toContain('Retrieval');
  });

  it('the chunk caption counts the chunks it draws, for every page at the slider extremes', () => {
    for (const doc of ['r1', 'w6', 'a4']) {
      for (const [size, pct] of [[20, 0], [20, 50], [200, 0], [200, 50]] as const) {
        const v = chunkView(doc, size, pct);
        expect(expectCaption(chunkCaption(v, size, pct))).toContain(`${v.chunks.length} chunk`);
      }
    }
  });
});

describe('nothing hidden feeds a number', () => {
  it('the answer scene is a function of its visible controls, with retrieval pinned to TF-IDF and no overlap', () => {
    expect([ANSWER_SCORER, ANSWER_OVERLAP_PCT]).toEqual(['tfidf', 0]);
    const q = text('q4');
    const base = { size: 60, k: 2, grounded: false } as const;
    const a = runPipeline(q, { ...base, scorer: ANSWER_SCORER, overlapPct: ANSWER_OVERLAP_PCT });
    const b = runPipeline(q, { ...base, scorer: ANSWER_SCORER, overlapPct: ANSWER_OVERLAP_PCT });
    expect(a.verdict).toBe(b.verdict);
    expect(a.retrieval.top).toEqual(b.retrieval.top);
  });
});

describe('lesson content', () => {
  it('has four try-this entries and five questions with the correct option strictly longest at most once', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz).toHaveLength(5);
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
  });

  it('passes the content lint: counts, quiz balance, no unscoped absolutes in key ideas and answers', () => {
    expect(lintLesson(lesson, new Set(TOPICS.map((t) => t.id)))).toEqual([]);
    expect(unscopedAbsolutes(lesson.keyIdeas.join(' '))).toEqual([]);
    for (const q of lesson.quiz) expect(unscopedAbsolutes(q.why), q.why).toEqual([]);
  });

  it('quiz 5 states a recall the model computes', () => {
    expect(measureFacts().tfidfAtBig).toBe(100);
    expect(BIG_K).toBe(3);
  });
});

describe('where a recall curve reaches 100%', () => {
  const curve = (fullSizes: number[]): RecallCurve => ({ scorer: 'tfidf', percent: [], fullSizes });
  it('names a lone spike, a run and two runs by the sizes themselves, not "from N"', () => {
    expect(fullPhrase(curve([]))).toBe('at no swept size');
    expect(fullPhrase(curve([100]))).toBe('only at 100 words');
    expect(fullPhrase(curve([70, 80, 90]))).toBe('at 70 to 90 words');
    expect(fullPhrase(curve([70, 80, 90, 170, 180, 190, 200]))).toBe('at 70 to 90 and 170 to 200 words');
    expect(fullPhrase(curve([60, 80, 90]))).toBe('at 60 and 80 to 90 words');
  });

  it('never says "from N words" for a curve that falls back below 100% afterwards (M-RAG1)', () => {
    for (const scorer of ['tfidf', 'bm25'] as const) {
      for (const k of [2, 3, 8]) {
        const c = recallCurve(scorer, k, 0);
        const lastFull = Math.max(-1, ...c.fullSizes);
        const fellBack = c.percent.some((p, i) => SWEEP_SIZES[i] > lastFull && p < 100) && c.fullSizes.length > 0;
        const caption = measureCaption(c, c, 60, k, 0, { tfidf: 0, bm25: 0 });
        expect(caption).not.toMatch(/from \d+ words/);
        if (fellBack && c.fullSizes.length === 1) expect(caption).toContain(`only at ${c.fullSizes[0]} words`);
      }
    }
  });
});

describe('the idf forms stated on screen are the ones the scorers use', () => {
  it('TF-IDF idf = ln(N / df) + 1 and the BM25 weight is the Lucene-style ln(1 + (N - df + 0.5) / (df + 0.5))', () => {
    expect(IDF_NOTE.tfidf).toBe('idf = ln(N / df) + 1');
    expect(IDF_NOTE.bm25).toBe('idf = ln(1 + (N - df + 0.5) / (df + 0.5))');
    const index = indexFor(80, 0);
    const n = index.chunks.length;
    const id = index.df.findIndex((d) => d > 1);
    expect(index.idf[id]).toBeCloseTo(Math.log(n / index.df[id]) + 1, 12);
  });
});
