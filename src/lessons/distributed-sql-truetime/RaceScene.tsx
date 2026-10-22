import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { WideRegion } from '../../components/WideRegion';
import { decimal } from '../../core/format';
import { commitWaitSub, plotTop, raceCaption } from './captions';
import { sampledText } from '../../core/checkPhrases';
import { BROKEN_SEED, DEFAULT_OPTIONS, cachedSweep, raceInput, sweepModel, type Options } from './seeded';
import { DELTA_MS, EPSILON_MS, ERROR_MS, GAP_MS, SEEDS_TOTAL, SEED_RANGE, breakProbability, hotKeyBound, latencyBillMs, race } from './truetime';
import { RACE_LANE_W } from './layout';
import { RaceLane } from './RaceLane';

const ERRORS = [{ value: 'seed' as const, label: 'From the seed' }, { value: 'set' as const, label: 'Set them' }];
const PLOT_W = { wide: 520, narrow: 356 } as const;
const CURVE_STEP = 2;

export function RaceScene({ picker }: { picker: ReactNode }) {
  const [epsilon, setEpsilon] = useState<number>(EPSILON_MS.default);
  const [delta, setDelta] = useState<number>(DELTA_MS.default);
  const [gapMax, setGapMax] = useState<number>(GAP_MS.default);
  const [commitWait, setCommitWait] = useState(false);
  const [errors, setErrors] = useState<'seed' | 'set'>('seed');
  const [e1, setE1] = useState(5);
  const [e2, setE2] = useState(-5);
  const [seed, setSeed] = useState(BROKEN_SEED);
  const narrow = useMediaQuery(PHONE_QUERY);

  const options = useMemo<Options>(
    () => ({ ...DEFAULT_OPTIONS, epsilon, delta, gapMax, commitWait, ...(errors === 'set' ? { fixedErrors: { e1, e2 } } : {}) }),
    [epsilon, delta, gapMax, commitWait, errors, e1, e2],
  );
  const input = useMemo(() => raceInput(seed, options), [seed, options]);
  const run = useMemo(() => race(input), [input]);
  const sweep = useMemo(() => cachedSweep(options), [options]);
  const closed = errors === 'seed' ? breakProbability({ delta, epsilon, gapMax, commitWait }) : null;
  const curve = useMemo(() => Array.from({ length: EPSILON_MS.max / CURVE_STEP + 1 }, (_, k) => k * CURVE_STEP), []);
  const measured = useMemo(
    () => curve.map((eps) => ({ x: eps, y: (100 * sweepModel({ ...options, epsilon: eps })) / SEEDS_TOTAL, tone: 'info' as const })),
    [curve, options],
  );
  const bill = latencyBillMs(epsilon);
  const hot = hotKeyBound(epsilon);

  return (
    <StageFrame
      height={540}
      intro={raceCaption({ race: run, epsilon, delta, commitWait, e1: input.e1, e2: input.e2, fraction: sweep.failing.length / SEEDS_TOTAL, failing: sweep.failing.length, seeds: SEEDS_TOTAL, closed })}
      introKey={`${JSON.stringify(options)}|${seed}`}
      stats={
        <Stats>
          <Stat label="T2 timestamp above T1's" value={run.ordered ? 'yes' : 'no'} color={run.ordered ? 'var(--ok)' : 'var(--bad)'} sub={`${decimal(run.s2, 1)} against ${decimal(run.s1, 1)}`} />
          <Stat label="T2's read sees T1's write" value={run.sees ? 'yes' : 'no'} color={run.sees ? 'var(--ok)' : 'var(--bad)'} sub="a snapshot read at T2's timestamp" />
          <Stat label="Commit wait" value={`${decimal(run.waitMs, 0)} ms`} sub={commitWaitSub({ commitWait, bill, hot })} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'shard 1 (T1)' },
            { color: 'var(--sky)', label: 'shard 2 (T2)' },
            { color: 'var(--hi)', label: 'a commit timestamp' },
            { color: 'var(--violet)', label: 'the commit-wait bar' },
            { color: 'var(--info)', label: 'the uncertainty interval' },
            { color: 'var(--bad)', label: 'a violation' },
            { color: 'var(--ok)', label: 'an ordered pair' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Commit wait" value={commitWait} onChange={setCommitWait} />
          <Slider label="Assumed bound ε" value={epsilon} min={EPSILON_MS.min} max={EPSILON_MS.max} format={(v) => `${v} ms`} onChange={setEpsilon} />
          {errors === 'seed'
            ? <Slider label="Actual clock error δ" value={delta} min={DELTA_MS.min} max={DELTA_MS.max} format={(v) => `${v} ms`} onChange={setDelta} />
            : <Hint tone="muted">Actual clock error δ is not used while the errors are set.</Hint>}
          <Slider label="Gap up to G" value={gapMax} min={GAP_MS.min} max={GAP_MS.max} format={(v) => `${v} ms`} onChange={setGapMax} />
        </>,
        <>
          <Segmented label="Clock errors" options={ERRORS} value={errors} onChange={setErrors} />
          {errors === 'set' && (
            <>
              <Slider label="Shard 1 clock error" value={e1} min={ERROR_MS.min} max={ERROR_MS.max} format={(v) => `${v} ms`} onChange={setE1} />
              <Slider label="Shard 2 clock error" value={e2} min={ERROR_MS.min} max={ERROR_MS.max} format={(v) => `${v} ms`} onChange={setE2} />
            </>
          )}
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="tt-stage stage-pad">
        <Box>
          <SectionTitle hint="true time on the axis; each leader's clock is off by its own error">T1 on shard 1, then T2 on shard 2</SectionTitle>
          <WideRegion minWidth={RACE_LANE_W} noun="timeline">
            <RaceLane race={run} epsilon={epsilon} e1={input.e1} e2={input.e2} />
          </WideRegion>
          <Hint block>
            {errors === 'seed' ? `Seed ${seed} drew the errors ${decimal(input.e1, 2)} ms and ${decimal(input.e2, 2)} ms and a gap of ${decimal(input.gap, 2)} ms.` : `The errors are set to ${e1} and ${e2} ms; the seed draws the gap, ${decimal(input.gap, 2)} ms.`}{' '}
            T2 is ordered after T1 exactly when the wait plus the gap plus e2 minus e1 is above zero: {decimal(run.waitMs, 1)} + {decimal(input.gap, 2)} + {decimal(input.e2, 2)} - {decimal(input.e1, 2)} = {decimal(run.waitMs + input.gap + input.e2 - input.e1, 2)}. Without the wait, a sum of zero is a tie (s2 equal to s1) and a tie is a violation; with it, the acknowledgement lands one clock tick after 2ε, so a sum of zero is ordered.
          </Hint>
        </Box>
        <Box>
          <SectionTitle hint="the share of races that break external consistency, against ε">How often the order breaks</SectionTitle>
          <Plot2D width={narrow ? PLOT_W.narrow : PLOT_W.wide} height={220} x={{ domain: [0, EPSILON_MS.max], label: 'assumed bound ε (ms)', ticks: 5 }} y={{ domain: [0, plotTop([...measured.map((p) => p.y), ...(closed === null ? [] : curve.map((eps) => 100 * breakProbability({ delta, epsilon: eps, gapMax, commitWait })))])], label: 'races that break (%)', ticks: 5 }} ariaLabel="The share of races that break the order against the assumed bound">
            {closed !== null && <Curve fn={(eps) => 100 * breakProbability({ delta, epsilon: eps, gapMax, commitWait })} tone="dim" dashed />}
            <Points data={measured} r={3.5} />
            <VLine at={epsilon} label={`ε = ${epsilon}`} tone="violet" />
            <HLine at={0} tone="dim" />
          </Plot2D>
          <Hint block>The dots are measured on {SEEDS_TOTAL} seeds each; the dashed curve is the exact closed form for this two-transaction race, drawn only when the errors come from the seed.</Hint>
        </Box>
        <Hint block>
          {sweep.failing.length === 0 ? sampledText(SEEDS_TOTAL, SEEDS_TOTAL, SEED_RANGE.from, SEED_RANGE.to - 1) : `External consistency broke on ${sweep.failing.length} of ${SEEDS_TOTAL} seeds (${SEED_RANGE.from} to ${SEED_RANGE.to - 1}); lowest failing seed ${sweep.lowestFailing}: ${sweep.message}; sampled, not exhaustive`}
          {closed === null ? '' : `. Closed form, exact for this model's two-transaction race: ${decimal(closed * 100, 2)}%`}. Commit wait orders the pair while every clock is within ε of true time, and no longer once a clock is off by more.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>two shard leaders and a client on distSim, no network delay</Provenance>
          <Provenance kind="illustrative">ε, δ and G are made up: not Google&apos;s values</Provenance>
          <Provenance kind="toy">each leader&apos;s clock error is a constant</Provenance>
          <Provenance kind="from-memory">Spanner uses TrueTime, an interval clock, with commit wait; check the Spanner paper</Provenance>
          <ClaimLabel kind="practice">serial writes to one key are limited by the commit wait in this model</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
