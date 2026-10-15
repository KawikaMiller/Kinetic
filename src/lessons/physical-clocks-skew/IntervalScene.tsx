import { useMemo, useState, type ReactNode } from 'react';
import { Area, Curve, Plot2D, VLine } from '../../components/Plot2D';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { toSequence } from '../../core/distSim';
import { pctText } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { intervalCaption } from './captions';
import { EPSILON_MS, decidableShare, gapDensity, sampleGaps } from './intervals';
import { BROKEN_SEED, runLww, type LwwMsg } from './lww';

const GAP_AXIS_MS = 60;
const DEFAULT_EPSILON = 10;
const DEFAULT_ERROR = 8;
const ERROR_MAX = 60;
const PLOT_W = { wide: 560, narrow: 356 } as const;
const PEAK_HEADROOM = 1.1;

const label = (p: LwwMsg): string => (p.type === 'write' ? `write x=${p.value}` : p.type === 'ack' ? 'ack' : `copy x=${p.value}, stamp ${p.stamp}`);

export function IntervalScene({ picker }: { picker: ReactNode }) {
  const [epsilon, setEpsilon] = useState(DEFAULT_EPSILON);
  const [error, setError] = useState(DEFAULT_ERROR);
  const [commitWait, setCommitWait] = useState(true);
  const [seed, setSeed] = useState(BROKEN_SEED);
  const narrow = useMediaQuery(PHONE_QUERY);
  const gaps = useMemo(() => sampleGaps(), []);
  const share = decidableShare(gaps, epsilon);
  const run = useMemo(
    () => runLww({ seed, mode: commitWait ? 'commit-wait' : 'raw', epsilonMs: epsilon, offsets: [error, 0] }),
    [seed, commitWait, epsilon, error],
  );
  const winner = run.finals.A.value === run.finals.B.value ? run.finals.A.value : null;
  const waitMs = run.commitWaitMs ?? 0;
  const sequence = useMemo(
    () => toSequence(run.trace, { actors: [{ id: 'c', label: 'client' }, { id: 'A', label: 'A' }, { id: 'B', label: 'B' }], label, events: false, times: true }),
    [run],
  );

  useIntroCaption(intervalCaption({ epsilonMs: epsilon, share, waitMs, winner, errorMs: error, commitWait }), [epsilon, share, waitMs, winner, error, commitWait]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Pairs with a decidable order" value={pctText(share, 1)} sub={`gap > 2ε = ${2 * epsilon} ms`} color={share > 0.5 ? 'var(--ok)' : 'var(--violet)'} />
          <Stat label="Commit wait" value={`${waitMs} ms`} sub={commitWait ? 'every write pays 2ε before it is acknowledged' : 'off: nothing paid, nothing guaranteed'} />
          <Stat label="Write 2" value={winner === 2 ? 'wins' : winner === 1 ? 'loses' : '–'} color={winner === 2 ? 'var(--ok)' : 'var(--bad)'} sub={`A's clock ${error} ms off, ε = ${epsilon} ms`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'order decidable (intervals apart)' },
            { color: 'var(--violet)', label: 'ambiguous (intervals overlap)' },
            { color: 'var(--info)', label: 'a message' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Uncertainty ε" value={epsilon} min={EPSILON_MS.min} max={EPSILON_MS.max} format={(v) => `${v} ms`} onChange={setEpsilon} />
          <Toggle label="Commit wait" value={commitWait} onChange={setCommitWait} off="Off" on="On" />
        </>,
        <>
          <Slider label="A's clock is off by" value={error} min={0} max={ERROR_MAX} format={(v) => `${v} ms`} onChange={setError} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="pc-stage stage-pad">
        <Plot2D
          width={narrow ? PLOT_W.narrow : PLOT_W.wide}
          x={{ domain: [0, GAP_AXIS_MS], label: 'gap between two events (ms)', ticks: 6 }}
          y={{ domain: [0, gapDensity(0) * PEAK_HEADROOM], label: 'how common a gap is', ticks: 3, format: () => '' }}
          ariaLabel="How common each gap between two events is, shaded where their order is decidable"
        >
          {epsilon > 0 && <Area fn={gapDensity} from={0} to={Math.min(2 * epsilon, GAP_AXIS_MS)} tone="violet" />}
          <Area fn={gapDensity} from={Math.min(2 * epsilon, GAP_AXIS_MS)} to={GAP_AXIS_MS} tone="ok" />
          <Curve fn={gapDensity} tone="dim" />
          <VLine at={2 * epsilon} label={`2ε = ${2 * epsilon} ms`} />
        </Plot2D>
        <Box>
          <SectionTitle hint="the same two writes as the last-write-wins bug">Write 1 through A, then write 2 through B</SectionTitle>
          <SequenceDiagram actors={[{ id: 'c', label: 'client' }, { id: 'A', label: 'A' }, { id: 'B', label: 'B' }]} messages={sequence.messages} ariaLabel="The two writes with the commit wait" />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>two replicas and a client on distSim; the gap sample is {gaps.length.toLocaleString('en-US')} seeded exponential gaps</Provenance>
          <Provenance kind="illustrative">the 15 ms mean gap and the clock errors are made up</Provenance>
          <Provenance kind="from-memory">TrueTime is Google's interval time API, described in the Spanner paper; this is the idea, not their system, so check the paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
