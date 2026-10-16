import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { checkpointCaption } from './captions';
import { checkpointOpening } from './openings';
import {
  COST_STOPS, GIVE_UP_FACTOR, INTERVALS, JOB_STEPS, MTBF_STOPS, RUNS, bestInterval, idealSeconds, noProgress, sweepIntervals, youngDaly,
} from './checkpoint';

export function CheckpointScene({ picker }: { picker: ReactNode }) {
  const open = checkpointOpening();
  const [mtbf, setMtbf] = useState<number>(open.mtbf);
  const [cost, setCost] = useState<number>(open.cost);
  const [interval, setEvery] = useState<number>(open.interval);
  const model = { mtbf, cost };
  const results = useMemo(() => sweepIntervals({ mtbf, cost }), [mtbf, cost]);
  const best = bestInterval(results);
  const estimate = youngDaly(model);
  const here = results.find((r) => r.interval === interval)!;
  const stuck = noProgress(model, interval);

  return (
    <StageFrame
      height={500}
      intro={checkpointCaption({ mtbf, cost, interval, expected: here.expected, best: best.interval, bestSeconds: best.expected, youngDaly: estimate, noProgress: stuck, ideal: idealSeconds })}
      introKey={[mtbf, cost, interval]}
      stats={
        <Stats>
          <Stat label={`Every ${interval} steps`} value={`${Math.round(here.expected).toLocaleString('en-US')} s`} color={stuck ? 'var(--bad)' : undefined} sub={`${RUNS} seeded runs; no failures would take ${idealSeconds.toLocaleString('en-US')} s`} />
          <Stat label="Simulated best" value={`${best.interval} steps`} color="var(--ok)" sub={`${Math.round(best.expected).toLocaleString('en-US')} s`} />
          <Stat label="√(2 C M)" value={`${Math.round(estimate)} steps`} color="var(--violet)" sub="Young/Daly estimate (from memory, verify)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'expected total time', shape: 'line' },
            { color: 'var(--ok)', label: 'simulated minimum', shape: 'dot' },
            { color: 'var(--violet)', label: 'the classical estimate', shape: 'line' },
            { color: 'var(--hi)', label: 'your interval', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Interval K (steps)" options={INTERVALS.map((k) => ({ value: k, label: k.toLocaleString('en-US') }))} value={interval} onChange={setEvery} />
        </>,
        <>
          <Slider label="Mean time between failures M" value={MTBF_STOPS.indexOf(mtbf)} min={0} max={MTBF_STOPS.length - 1} format={(i) => `${MTBF_STOPS[i].toLocaleString('en-US')} s`} onChange={(i) => setMtbf(MTBF_STOPS[i])} />
          <Slider label="Checkpoint cost C" value={COST_STOPS.indexOf(cost)} min={0} max={COST_STOPS.length - 1} format={(i) => `${COST_STOPS[i]} s`} onChange={(i) => setCost(COST_STOPS[i])} />
        </>,
      ]}
    >
      <div className="tv-stage stage-pad">
        <Plot2D
          x={{ domain: [INTERVALS[0], INTERVALS[INTERVALS.length - 1]], log: true, label: 'checkpoint interval K (steps)', ticks: 4 }}
          y={{ domain: [idealSeconds, idealSeconds * GIVE_UP_FACTOR], log: true, label: 'expected total seconds', ticks: 3 }}
          width={380}
          height={240}
          ariaLabel={`Expected total time against checkpoint interval: lowest near ${best.interval} steps`}
        >
          <Curve points={results.map((r) => [r.interval, Math.max(idealSeconds, r.expected)] as [number, number])} tone="info" />
          <VLine at={estimate} tone="violet" dashed label="√(2 C M)" />
          <Points data={[{ x: best.interval, y: best.expected, tone: 'ok' }]} r={6} />
          <Points data={[{ x: interval, y: Math.max(idealSeconds, here.expected), tone: 'hi', hollow: true }]} r={8} />
        </Plot2D>
        {stuck && <span className="hl bad wrap">Mean time between failures is shorter than one cycle: a cycle usually fails before it finishes.</span>}
        {here.unfinished > 0 && <span className="tv-note">{here.unfinished} of {RUNS} runs gave up after {GIVE_UP_FACTOR} times the ideal time; the curve is cut there.</span>}
        <p className="tv-note">
          A job of {JOB_STEPS.toLocaleString('en-US')} one-second steps. Too frequent and checkpoints eat the time; too rare and each failure throws away a long stretch: the curve is U-shaped, and its bottom sits near √(2·{cost}·{sig(mtbf)}) ={' '}
          {Math.round(estimate)} steps, which is an estimate, not the truth.
        </p>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={7}>{RUNS} seeded runs for each interval, failures exponential with mean M, a failure loses the steps since the last checkpoint</Provenance>
          <Provenance kind="illustrative">the one-second step, the 10,000 steps, M and C are made up</Provenance>
          <Provenance kind="from-memory">the √(2 C M) rule is usually credited to Young and to Daly: verify against their papers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
