import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { mergeCaption } from './captions';
import { END, pairKey, pairText, rankedPairs, totalSymbols, type Pair } from './bpe';
import { MAX_PATH, TOP_PAIRS, greedyTotal, nextGreedy, stateAfter, stepReports } from './classic';
import { mergeOpening } from './openings';

export function MergeScene({ picker }: { picker: ReactNode }) {
  const [path, setPath] = useState<Pair[]>(mergeOpening().path);
  const state = useMemo(() => stateAfter(path), [path]);
  const reports = useMemo(() => stepReports(path), [path]);
  const pairs = useMemo(() => rankedPairs(state), [state]);
  const best = nextGreedy(state);
  const total = totalSymbols(state);
  const reference = useMemo(() => greedyTotal(path.length), [path.length]);
  const last = reports.at(-1) ?? null;
  const lastSymbol = path.length > 0 ? path[path.length - 1].left + path[path.length - 1].right : null;
  const full = path.length >= MAX_PATH || pairs.length === 0;

  const merge = (pair: Pair) => setPath((p) => [...p, pair]);
  const isBase = (s: string) => s === END || Array.from(s).length === 1;

  return (
    <StageFrame
      height={520}
      intro={mergeCaption({ path, last, total, greedyTotal: reference, next: best ? { pair: best, count: best.count } : null })}
      introKey={[path]}
      stats={
        <Stats>
          <Stat label="Corpus symbols" value={total} color={total > reference ? 'var(--bad)' : undefined} sub={`greedy after ${path.length} merges: ${reference}`} />
          <Stat label="Merges so far" value={path.length} sub={`vocabulary: ${state.merges.length} merged symbols on top of the characters`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the symbol just made', shape: 'square' },
            { color: 'var(--ok)', label: 'a merged symbol', shape: 'square' },
            { color: 'var(--dim)', label: 'not merged yet: a single character', shape: 'square' },
            { color: 'var(--bad)', label: 'not the most frequent pair (merge list), or more symbols than greedy (total)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" softDisabled={full || !best} onClick={() => best && merge(best)}>
            Merge the most frequent{best ? `: ${pairText(best)}` : ''}
          </Button>
          <Button softDisabled={path.length === 0} onClick={() => setPath((p) => p.slice(0, -1))}>Undo</Button>
          <Button softDisabled={path.length === 0} onClick={() => setPath([])}>Reset</Button>
        </>,
      ]}
    >
      <div className="tk-stage stage-pad">
        <ul className="tk-words" aria-label="The corpus, as symbols">
          {state.words.map((w, i) => (
            <li key={i} className="tk-word">
              <b className="tk-count">{w.count} ×</b>
              {w.symbols.map((s, k) => (
                <span key={k} className={`chip tk-sym tone-${s === lastSymbol ? 'hi' : isBase(s) ? 'dim' : 'ok'}`}>{s}</span>
              ))}
            </li>
          ))}
        </ul>
        <div className="tk-row">
          <section className="tk-panel" aria-label="Pair counts">
            <h3 className="section-title">Most frequent pairs</h3>
            <table className="data-table">
              <thead><tr><th>pair</th><th>count</th><th>merge it</th></tr></thead>
              <tbody>
                {pairs.slice(0, TOP_PAIRS).map((p, i) => (
                  <tr key={pairKey(p)}>
                    <td>{pairText(p)}</td>
                    <td>{p.count}</td>
                    <td>
                      <Button softDisabled={full} onClick={() => merge(p)}>{i === 0 ? 'merge (the most frequent)' : 'merge by hand'}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="hint">Ties go to the lexicographically smaller pair: the original description does not fix a rule.</span>
          </section>
          <section className="tk-panel" aria-label="Merges so far">
            <h3 className="section-title">Merge list</h3>
            {reports.length === 0 ? (
              <span className="hint">Nothing merged yet.</span>
            ) : (
              <ol className="tk-merges">
                {reports.map((r, i) => (
                  <li key={i} className={r.isGreedy ? '' : 'is-hand'}>
                    {pairText(r.picked)} <span className="tk-merge-count">({r.pickedCount} times{r.isGreedy ? '' : `, greedy would take ${pairText(r.greedy)}`})</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">four words with counts, the classic worked corpus; the merge counts are computed here</Provenance>
          <Provenance kind="from-memory">byte-pair encoding for text is credited to Gage (1994) and for words and subwords to Sennrich et al. (2016): verify</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
