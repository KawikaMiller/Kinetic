import { useMemo, useState, type ReactNode } from 'react';
import { HLine, Plot2D, Points } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle, ClaimLabel } from '../../components/ui';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { decimal } from '../../core/format';
import { boundCaption } from './captions';
import { cachedSweep, EPSILON_MS, FAR_AHEAD_MS, MODES, RUN_UNTIL_MS, RULES_TEXT, runHlcSeed, SEED_RANGE, SEEDS_TOTAL, seedFor, type Mode } from './seeded';
import { sampledText } from './checkText';

const PLOT_W = { wide: 520, narrow: 356 } as const;
const PLOT_H = 220;
const FAR_STEP_MS = 500;

export function BoundScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>('hlc');
  const [epsilon, setEpsilon] = useState<number>(EPSILON_MS.default);
  const [farAheadMs, setFarAhead] = useState<number>(FAR_AHEAD_MS.min);
  const [clockSteps, setClockSteps] = useState(false);
  const [seed, setSeed] = useState(seedFor('hlc'));
  const narrow = useMediaQuery(PHONE_QUERY);
  const options = useMemo(() => ({ mode, epsilon, farAheadMs, clockSteps }), [mode, epsilon, farAheadMs, clockSteps]);
  const run = useMemo(() => runHlcSeed(options, seed), [options, seed]);
  const sweep = useMemo(() => cachedSweep(options), [options]);
  const lead = useMemo(() => run.logs.map((e) => ({ x: e.t, y: e.stamp.l - e.pt, tone: 'hi' as const })), [run]);
  const lamport = useMemo(() => run.logs.map((e) => ({ x: e.t, y: e.lamport, tone: 'info' as const })), [run]);
  const leadMax = Math.max(run.bound * 1.3, run.maxLead * 1.1, 10);
  const lamportMax = Math.max(...run.logs.map((e) => e.lamport), 4);
  const outside = run.maxLead > run.bound + 1e-9;

  const chooseMode = (next: Mode) => {
    setMode(next);
    setSeed(seedFor(next));
  };

  return (
    <StageFrame
      height={520}
      minWidth={PLOT_W.narrow + 40}
      intro={boundCaption({ options, run, sweepFailing: sweep.failing.length, outside })}
      introKey={`${mode}|${epsilon}|${farAheadMs}|${clockSteps}|${seed}`}
      stats={
        <Stats>
          <Stat label="Bound ε_max" value={`${decimal(run.bound, 1)} ms`} sub={`largest gap between two of this run's clocks (at most 2ε = ${2 * epsilon} ms)`} />
          <Stat label="Largest l - pt" value={`${decimal(run.maxLead, 1)} ms`} color={outside ? 'var(--bad)' : 'var(--ok)'} sub={outside ? 'past the bound: the clock assumption is broken' : 'inside the bound'} />
          <Stat label="Rules in this run" value={run.violation ? 'broken' : 'hold'} color={run.violation ? 'var(--bad)' : 'var(--ok)'} sub={run.violation ? `${RULES_TEXT[run.violation.rule]}: ${run.violation.message}` : 'receive after send, increasing, l at least the clock'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'l - pt of an event' }, { color: 'var(--info)', label: 'a Lamport stamp' }, { color: 'var(--dim)', label: 'the ε_max line' }, { color: 'var(--bad)', label: 'a broken rule' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Stamping rule" options={MODES} value={mode} onChange={chooseMode} />
        </>,
        <>
          <Slider label="Skew bound ε" value={epsilon} min={EPSILON_MS.min} max={EPSILON_MS.max} format={(v) => `${v} ms`} onChange={setEpsilon} />
          <Slider label="One clock far ahead" value={farAheadMs} min={FAR_AHEAD_MS.min} max={FAR_AHEAD_MS.max} step={FAR_STEP_MS} format={(v) => `+${decimal(v / 1000, 1)} s`} onChange={setFarAhead} />
          <Toggle label="A clock may step back" value={clockSteps} onChange={setClockSteps} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="hl-stage stage-pad">
        <Box>
          <SectionTitle hint="how far the wall part runs ahead of the node's own clock, per event">l - pt, against the bound</SectionTitle>
          <Plot2D width={narrow ? PLOT_W.narrow : PLOT_W.wide} height={PLOT_H} x={{ domain: [0, RUN_UNTIL_MS + 20], label: 'true time (ms)', ticks: 5 }} y={{ domain: [0, leadMax], label: 'l - pt (ms)', ticks: 4 }} ariaLabel="l minus the physical clock for each event, with the bound">
            <HLine at={run.bound} label={`ε_max = ${decimal(run.bound, 1)} ms`} tone="dim" />
            <Points data={lead} r={3.5} />
          </Plot2D>
        </Box>
        <Box>
          <SectionTitle hint="a counter of events, not milliseconds: no relation to wall time">Lamport stamp, against true time</SectionTitle>
          <Plot2D width={narrow ? PLOT_W.narrow : PLOT_W.wide} height={PLOT_H} x={{ domain: [0, RUN_UNTIL_MS + 20], label: 'true time (ms)', ticks: 5 }} y={{ domain: [0, lamportMax + 1], label: 'Lamport stamp', ticks: 4 }} ariaLabel="The Lamport stamp of each event against true time">
            <Points data={lamport} r={3.5} />
          </Plot2D>
        </Box>
        <Hint block>
          {sweep.failing.length === 0
            ? `${sampledText(SEEDS_TOTAL, SEEDS_TOTAL, SEED_RANGE.from, SEED_RANGE.to - 1)}: the checks below held on each of them.`
            : `This rule fails on ${sweep.failing.length} of ${SEEDS_TOTAL} seeds (${SEED_RANGE.from} to ${SEED_RANGE.to - 1}); lowest failing seed ${sweep.lowestFailing}, rule ${sweep.rule}: ${sweep.message}; sampled, not exhaustive.`}
          {farAheadMs > 0 ? ' With a far-ahead clock the ordering checks stay green while closeness to real time is lost: the guarantee is only as good as the clock assumption.' : ''}
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>three nodes on distSim, offsets within ±ε, 1 to 10 ms latency, three messages 30 ms apart</Provenance>
          <Provenance kind="illustrative">offsets, delays and the 30 ms step are made up</Provenance>
          <ClaimLabel kind="standard">while every clock is within the bound, l - pt stays within the largest gap between clocks</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
