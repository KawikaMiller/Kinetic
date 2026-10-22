import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../../core/format';
import { heavyCaption } from './captions';
import { heavyRun, memory, quality, MAX_DEPTH, MAX_WIDTH, MIN_DEPTH, TOP_K, exactCounts, itemName, zipfStream } from '../../core/countMin';
import { DEFAULT_DEPTH, DEFAULT_SEED, DEFAULT_SKEW, DEFAULT_WIDTH, MAX_SKEW, MIN_SCENE_WIDTH, MIN_SKEW } from './stream';

const HEAVY_N = 20_000;
const HEAVY_STEP = 250;
const EVENTS_SHOWN = 8;

export function HeavyScene({ picker }: { picker: ReactNode }) {
  const [w, setW] = useState(DEFAULT_WIDTH);
  const [d, setD] = useState(DEFAULT_DEPTH);
  const [skew, setSkew] = useState(DEFAULT_SKEW);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [seen, setSeen] = useState(HEAVY_N);

  const stream = useMemo(() => zipfStream(HEAVY_N, skew, seed), [skew, seed]);
  const state = useMemo(() => heavyRun(stream, w, d, seed, seen), [stream, w, d, seed, seen]);
  const q = useMemo(() => quality(stream, state), [stream, state]);
  const counts = useMemo(() => exactCounts(stream.slice(0, state.seen)), [stream, state.seen]);
  const mem = memory(stream, state);
  const heap = [...state.heap].sort((a, b) => b.est - a.est);
  const recent = state.events.filter((e) => e.kind === 'evict').slice(-EVENTS_SHOWN).reverse();

  useIntroCaption(heavyCaption({ state, q, n: HEAVY_N }), [state, q]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Precision" value={pctText(q.precision, 0)} color={q.precision === 1 ? 'var(--ok)' : 'var(--bad)'} sub={`${q.hits} of ${state.heap.length} candidates are true top ${TOP_K}`} />
          <Stat label="Recall" value={pctText(q.recall, 0)} color={q.recall === 1 ? 'var(--ok)' : 'var(--bad)'} sub={`${q.hits} of the true top ${TOP_K} are candidates`} />
          <Stat label="Counters" value={mem.sketch.toLocaleString('en-US')} sub={`the exact Map needs ${mem.exact.toLocaleString('en-US')}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a candidate kept in the heap', shape: 'square' },
            { color: 'var(--ok)', label: 'an item of the true top five (the Map)', shape: 'square' },
            { color: 'var(--dim)', label: 'a candidate that was evicted', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Width w" value={w} min={MIN_SCENE_WIDTH} max={MAX_WIDTH} onChange={setW} />
          <Slider label="Depth d" value={d} min={MIN_DEPTH} max={MAX_DEPTH} onChange={setD} />
          <Slider label="Zipf skew" value={skew} min={MIN_SKEW} max={MAX_SKEW} step={0.1} format={(v) => v.toFixed(1)} onChange={setSkew} />
        </>,
        <>
          <Slider label="Items seen" value={state.seen} min={0} max={HEAVY_N} step={HEAVY_STEP} format={(v) => v.toLocaleString('en-US')} onChange={setSeen} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        <div className="cm-pair">
          <Box>
            <SectionTitle hint={`the ${TOP_K} candidates, by estimate`}>The heap</SectionTitle>
            {heap.length === 0 ? <p className="empty-note">Empty: nothing seen yet.</p> : (
              <table className="data-table cm-table">
                <thead><tr><th scope="col">Item</th><th scope="col">Estimate</th><th scope="col">True</th></tr></thead>
                <tbody>
                  {heap.map((c) => (
                    <tr key={c.item}>
                      <td><span className={q.top.includes(c.item) ? 'cm-top' : 'cm-cand'}>{itemName(c.item)}</span></td>
                      <td>{c.est}</td>
                      <td>{counts[c.item]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Box>
          <Box>
            <SectionTitle hint="exact, from a Map">The true top {TOP_K}</SectionTitle>
            <table className="data-table cm-table">
              <thead><tr><th scope="col">Item</th><th scope="col">Count</th><th scope="col">Candidate?</th></tr></thead>
              <tbody>
                {q.top.map((r) => (
                  <tr key={r}>
                    <td><span className="cm-top">{itemName(r)}</span></td>
                    <td>{counts[r]}</td>
                    <td>{state.heap.some((c) => c.item === r) ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </div>
        <Box>
          <SectionTitle hint="why a candidate heap at all">Evictions</SectionTitle>
          {recent.length === 0 ? <p className="empty-note">No candidate has been pushed out yet.</p> : (
            <ul className="cm-events">
              {recent.map((e) => (
                <li key={`${e.at}:${e.item}`} className="cm-evicted">after {e.at.toLocaleString('en-US')} items, {itemName(e.item)} (estimate {e.est}) gave way to {itemName(e.by!)}</li>
              ))}
            </ul>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a seeded Zipf stream of {HEAVY_N.toLocaleString('en-US')} items over 2,000</Provenance>
          <Provenance kind="toy">candidates are kept in a small array scanned for its minimum, which is what a size-{TOP_K} min-heap gives; the sketch cannot list its own keys</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
