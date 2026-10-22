import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decimal } from '../../core/format';
import { rankCaption } from './captions';
import { DEFAULT_QUERY, REPEATER, docName } from './corpus';
import { buildIndex, df, type Index } from './postings';
import { evaluate, parseQuery } from './query';
import { B_RANGE, DEFAULT_B, DEFAULT_K1, K1_RANGE, idfBm25, rankDocs, shownRows, type Ranker, type Scored } from './rank';
import type { Corpus } from './useCorpus';

const RANKER_OPTIONS = [{ value: 'bm25' as const, label: 'BM25' }, { value: 'tfidf' as const, label: 'TF-IDF' }];

export function RankScene({ picker, corpus }: { picker: ReactNode; corpus: Corpus }) {
  const [text, setText] = useState(DEFAULT_QUERY);
  const [ranker, setRanker] = useState<Ranker>('bm25');
  const [k1, setK1] = useState(DEFAULT_K1);
  const [b, setB] = useState(DEFAULT_B);
  const [repeater, setRepeater] = useState(false);

  const docs = useMemo(() => (repeater ? [...corpus.docs, REPEATER] : corpus.docs), [corpus.docs, repeater]);
  const index = useMemo(() => buildIndex(docs, corpus.steps), [docs, corpus.steps]);
  const q = useMemo(() => parseQuery(text, corpus.steps), [text, corpus.steps]);
  const terms = useMemo(() => [...new Set(q.units.flat())], [q]);
  const matches = useMemo(() => evaluate(index, q, 'or', 'as-typed').docs, [index, q]);
  const ranked = useMemo(() => rankDocs(index, matches, terms, ranker, { k1, b }), [index, matches, terms, ranker, k1, b]);
  const top = ranked[0] ?? null;
  const shown = shownRows(ranked, repeater ? docs.length : null);
  const best = Math.max(top?.score ?? 0, 1e-9);

  useIntroCaption(rankCaption({ ranker, top, matches: matches.length, k1, b }), [ranked, ranker, k1, b]);

  const rankedItem = (s: Scored, place = '') => (
    <li key={s.doc}>
      <b>{docName(s.doc - 1)}</b>
      <Bar value={s.score} max={best} tone="info" height={8} animate={false} ariaLabel={`${docName(s.doc - 1)} scores ${decimal(s.score, 4)}`} />
      <span className="ii-score">{decimal(s.score, 4)}</span>
      <span className="ii-doctext">{place}{docs[s.doc - 1].slice(0, 70)}{docs[s.doc - 1].length > 70 ? '…' : ''}</span>
    </li>
  );

  const lines = top && ranker === 'bm25' ? bm25Lines(top, index, k1, b) : tfidfLines(top);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Matches" value={matches.length} sub="documents holding any of the words" />
          <Stat label="Top score" value={top ? decimal(top.score, 4) : '–'} color="var(--info)" sub={top ? `${docName(top.doc - 1)}, ${top.length} tokens; mean length ${decimal(index.avgdl, 2)}` : 'nothing matched'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a document\'s score (the bar is relative to the best)', shape: 'square' },
            { color: 'var(--hi)', label: 'the line of the formula being worked for the top result', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Query" value={text} onChange={setText} width={190} spellCheck={false} placeholder="cat dog" />
          <Segmented label="Ranker" value={ranker} onChange={setRanker} options={RANKER_OPTIONS} />
          <ChipButton tone="orange" on={repeater} onClick={() => setRepeater(!repeater)}>Add a document that repeats cat 10 times</ChipButton>
        </>,
        ranker === 'bm25' ? (
          <>
            <Slider label="k1" value={k1} {...K1_RANGE} format={(v) => decimal(v, 1)} onChange={setK1} />
            <Slider label="b" value={b} {...B_RANGE} format={(v) => decimal(v, 2)} onChange={setB} />
          </>
        ) : (
          <span key="no-k1-b" className="hint">TF-IDF has no k1 or b: it is tf times ln(N / n).</span>
        ),
      ]}
    >
      <div className="ii-stage stage-pad">
        <Box>
          <SectionTitle hint="documents holding any of the query's words, best first; subtracted words are removed">Ranked results</SectionTitle>
          {ranked.length === 0 ? (
            <p className="empty-note">No document matches.</p>
          ) : (
            <ol className="ii-ranked">
              {shown.rows.map(({ scored }) => rankedItem(scored))}
              {shown.pinnedRow && (
                <>
                  <li className="ii-ranked-gap" aria-hidden="true">…</li>
                  {rankedItem(shown.pinnedRow.scored, `number ${shown.pinnedRow.place} of ${ranked.length}: `)}
                </>
              )}
            </ol>
          )}
        </Box>
        {top && (
          <Box>
            <SectionTitle hint={`the formula with ${docName(top.doc - 1)}'s numbers put in`}>How the top result scored</SectionTitle>
            <CodePanel title={ranker === 'bm25' ? 'BM25' : 'TF-IDF'} lines={lines} gutter="none" />
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="real">the scores are computed live from the index of the corpus</Provenance>
          <Provenance kind="from-memory">k1 = 1.2 and b = 0.75 are common defaults (check your engine's documentation); the IDF used is the form Lucene uses, one of several in the literature (check the Lucene and Robertson-Zaragoza descriptions of BM25)</Provenance>
          <Provenance kind="toy">toy corpus and toy stemmer; real engines use proper analyzers and quantised length norms</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

const num = (x: number, dp = 4) => decimal(x, dp);

function bm25Lines(top: Scored, index: Index, k1: number, b: number): string[] {
  const lines = [
    'score(D, Q) = sum over q of IDF(q) * f * (k1 + 1) / (f + k1 * (1 - b + b * |D| / avgdl))',
    'IDF(q) = ln(1 + (N - n + 0.5) / (n + 0.5))',
    `N = ${index.n}, avgdl = ${num(index.avgdl, 3)}, |D| = ${top.length}, k1 = ${num(k1, 1)}, b = ${num(b, 2)}`,
  ];
  for (const p of top.parts) {
    const n = df(index, p.term);
    lines.push(`${p.term}: n = ${n}, IDF = ${num(idfBm25(index.n, n))}, f = ${p.f}, part = ${num(p.part)}`);
  }
  lines.push(`score = ${num(top.score)}`);
  return lines;
}

function tfidfLines(top: Scored | null): string[] {
  if (!top) return [];
  return [
    'score(D, Q) = sum over q of tf(q, D) * ln(N / n)',
    ...top.parts.map((p) => `${p.term}: tf = ${p.f}, ln(N / n) = ${num(p.idf)}, part = ${num(p.part)}`),
    `score = ${num(top.score)}`,
  ];
}
