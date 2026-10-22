import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText, sig } from '../../core/format';
import { sizeCaption } from './captions';
import { ErrorPlot } from './ErrorPlot';
import { MAX_DEPTH, MAX_WIDTH, MIN_DEPTH, deltaOf, depthFor, epsilonOf, widthFor, UNIVERSE, zipfStream } from '../../core/countMin';
import { DEFAULT_DEPTH, DEFAULT_SEED, DEFAULT_SKEW, DEFAULT_STREAM, DEFAULT_WIDTH, MIN_SCENE_WIDTH, MAX_SKEW, MAX_STREAM, MIN_SKEW, MIN_STREAM, STREAM_STEP, errorRun, overLimit } from './stream';

const PRESETS = [
  { label: 'ε = 0.01, δ = 0.01', epsilon: 0.01, delta: 0.01 },
  { label: 'ε = 0.05, δ = 0.05', epsilon: 0.05, delta: 0.05 },
] as const;
const WORKED = { epsilon: 0.01, delta: 0.01 } as const;

export function SizeScene({ picker }: { picker: ReactNode }) {
  const [w, setW] = useState(DEFAULT_WIDTH);
  const [d, setD] = useState(DEFAULT_DEPTH);
  const [n, setN] = useState(DEFAULT_STREAM);
  const [skew, setSkew] = useState(DEFAULT_SKEW);
  const [seed, setSeed] = useState(DEFAULT_SEED);

  const stream = useMemo(() => zipfStream(n, skew, seed), [n, skew, seed]);
  const run = useMemo(() => errorRun(stream, w, d, seed), [stream, w, d, seed]);
  const eps = epsilonOf(w);
  const delta = deltaOf(d);
  const limit = eps * n;
  const share = overLimit(run, limit) / UNIVERSE;
  const relative = (rank: number) => (run.counts[rank] > 0 ? run.errors[rank] / run.counts[rank] : null);
  const first = relative(0);
  const far = relative(999);
  const worked = { w: widthFor(WORKED.epsilon), d: depthFor(WORKED.delta) };

  useIntroCaption(sizeCaption({ run, w, d }), [run]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="ε·N" value={sig(limit, 3)} color="var(--violet)" sub={[`ε = e / w = ${sig(eps, 3)}`, `N = ${n.toLocaleString('en-US')}`]} />
          <Stat label="Over the line" value={pctText(share, 1)} color={share <= delta ? 'var(--ok)' : 'var(--bad)'} sub={[`δ = e^−d = ${pctText(delta, 1)}`, `of ${UNIVERSE.toLocaleString('en-US')} items, this run`]} />
          <Stat label="Rank 1 error" value={sig(run.errors[0], 3)} sub={first === null ? 'never seen' : `${pctText(first, 2)} of its count`} />
          <Stat label="Rank 1,000 error" value={sig(run.errors[999], 3)} sub={far === null ? 'never seen in this stream' : `${sig(far, 3)} times its count`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'an item within ε·N', shape: 'dot' },
            { color: 'var(--bad)', label: 'an item over the line', shape: 'dot' },
            { color: 'var(--violet)', label: 'the ε·N rule', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Width w" value={w} min={MIN_SCENE_WIDTH} max={MAX_WIDTH} onChange={setW} />
          <Slider label="Depth d" value={d} min={MIN_DEPTH} max={MAX_DEPTH} onChange={setD} />
          {PRESETS.map((p) => (
            <ChipButton key={p.label} tone="violet" onClick={() => { setW(widthFor(p.epsilon)); setD(depthFor(p.delta)); }}>{p.label}</ChipButton>
          ))}
        </>,
        <>
          <Slider label="Stream length N" value={n} min={MIN_STREAM} max={MAX_STREAM} step={STREAM_STEP} onChange={setN} />
          <Slider label="Zipf skew" value={skew} min={MIN_SKEW} max={MAX_SKEW} step={0.1} format={(v) => v.toFixed(1)} onChange={setSkew} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        <Box>
          <SectionTitle hint="every one of the 2,000 items; most are rare">Error by popularity rank</SectionTitle>
          <div className="cm-plot"><ErrorPlot run={run} limit={limit} /></div>
        </Box>
        <Box>
          <SectionTitle hint="Cormode and Muthukrishnan, 2005">The guarantee</SectionTitle>
          <p className="cm-theorem">
            With <b>w = ⌈e / ε⌉</b> and <b>d = ⌈ln(1 / δ)⌉</b>, an item's estimate is at most ε·N too high with probability at least 1 − δ. Your w and d give ε = {sig(eps, 3)} and δ = {sig(delta, 3)}.
          </p>
          <p className="cm-theorem">
            Worked example: ε = {WORKED.epsilon} and δ = {WORKED.delta} give w = {worked.w}, d = {worked.d}, so {(worked.w * worked.d).toLocaleString('en-US')} counters.
          </p>
          <Hint tone="muted" block>The bound is about the error added to <i>any</i> count, relative to the total N, so it means little for an item rarer than ε·N. Heavy items have a small relative error and rare ones a huge one.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a seeded Zipf stream over 2,000 items; the hashes and counts are real</Provenance>
          <Provenance kind="from-memory">the theorem is credited to Cormode and Muthukrishnan (2005); check the paper for its exact statement</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
