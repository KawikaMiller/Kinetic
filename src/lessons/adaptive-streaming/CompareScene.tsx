import { WideRegion } from '../../components/WideRegion';
import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { ALGOS, DEFAULT_WEIGHTS, LADDER, TRACES, WEIGHT_MAX, score, simulate, traceOf, type AlgoId, type Run, type Weights } from './abr';
import { algoLabel, compareCaption } from './captions';
import { stepsOf, timeDomain, useChartWidth } from './chartMath';
import { initialCompare } from './init';
import { TraceControls } from './TraceControls';

/** Narrowest width where this table still reads; below it the table scrolls sideways inside its box. */
const TABLE_MIN_WIDTH = 480;

/** One tone per player, plain categories (not verdicts). */
const ALGO_TONE: Record<AlgoId, Tone> = { naive: 'pink', rate: 'amber', buffer: 'sky' };
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--pink)', label: 'naive' },
      { color: 'var(--amber)', label: 'rate-based' },
      { color: 'var(--sky)', label: 'buffer-based' },
      { color: 'var(--dim)', label: 'the network throughput' },
      { color: 'var(--bad)', label: 'stalled time' },
    ]}
  />
);
const WEIGHT_FIELDS: { key: keyof Weights; label: string; unit: string }[] = [
  { key: 'bitrate', label: 'Reward per Mbit/s of bitrate', unit: 'points' },
  { key: 'stall', label: 'Penalty per second stalled', unit: 'points' },
  { key: 'switches', label: 'Penalty per switch', unit: 'points' },
  { key: 'startup', label: 'Penalty per second of startup', unit: 'points' },
];

/** The bitrate each segment of a run was fetched at, as a staircase over wall time. */
const rungSteps = (run: Run): [number, number][] => run.segs.flatMap((s) => [[s.start, s.bitrate], [s.end, s.bitrate]] as [number, number][]);

export function CompareScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialCompare);
  const trace = useMemo(() => traceOf(st.trace, st.seed), [st.trace, st.seed]);
  const runs = useMemo(() => ALGOS.map((a) => ({ algo: a.id, run: simulate(trace, st.S, a.id) })), [trace, st.S]);
  const width = useChartWidth();
  const domain = timeDomain(runs[0].run, runs[1].run, runs[2].run);
  const scored = runs.map((r) => ({ ...r, score: score(r.run, st.weights) }));
  const best = scored.every((s) => s.run.wall === null) ? null : scored.reduce((m, x) => (x.score > m.score ? x : m)).algo;
  const traceNote = TRACES.find((t) => t.id === st.trace)?.note;

  return (
    <StageFrame
      height={700}
      legend={LEGEND}
      intro={compareCaption(runs, st.weights)}
      introKey={`${st.trace}|${st.seed}|${st.S}|${Object.values(st.weights).join(',')}`}
      controls={[
        <>
          {picker}
        </>,
        <TraceControls key="trace" trace={st.trace} seed={st.seed} S={st.S} onTrace={(trace2) => setSt((s) => ({ ...s, trace: trace2 }))} onSeed={(seed) => setSt((s) => ({ ...s, seed }))} onSegment={(S) => setSt((s) => ({ ...s, S }))} />,
        <>
          {WEIGHT_FIELDS.map((f) => (
            <Slider key={f.key} label={f.label} value={st.weights[f.key]} min={0} max={WEIGHT_MAX} step={0.5} onChange={(v) => setSt((s) => ({ ...s, weights: { ...s.weights, [f.key]: v } }))} />
          ))}
        </>,
      ]}
    >
      <div className="abr-stage stage-pad">
        <Box>
          <SectionTitle hint={traceNote}>Three players, one network</SectionTitle>
          <Plot2D x={{ domain: [0, domain], label: 'time (s)' }} y={{ domain: [0, 6], label: 'Mbit/s' }} width={width} height={220} ariaLabel="The bitrate each of the three players chose over time, against the network throughput">
            {LADDER.map((b) => <HLine key={b} at={b} tone="dim" />)}
            <Curve points={stepsOf(trace, domain)} tone="dim" />
            {runs.map((r) => <Curve key={r.algo} points={rungSteps(r.run)} tone={ALGO_TONE[r.algo]} />)}
          </Plot2D>
        </Box>
        <Box>
          <SectionTitle hint="the score uses the weights below: they are yours">How each player did</SectionTitle>
          <WideRegion minWidth={TABLE_MIN_WIDTH} label="Quality of experience of the three players: scroll sideways to see all of it" hint="swipe to see the whole table">
            <table className="data-table abr-table">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Startup</th>
                  <th scope="col">Rebuffering</th>
                  <th scope="col">Average bitrate</th>
                  <th scope="col">Switches</th>
                  <th scope="col">Your score</th>
                </tr>
              </thead>
              <tbody>
                {scored.map(({ algo, run, score: sc }) => (
                  <tr key={algo} className={algo === best ? 'is-best' : ''}>
                    <td>{algoLabel(algo)}</td>
                    {run.wall === null ? (
                      <td colSpan={5}>stalled, no data arriving</td>
                    ) : (
                      <>
                        <td>{run.startup.toFixed(1)} s</td>
                        <td className={run.stallCount > 0 ? 'is-stall' : ''}>{run.stallTime.toFixed(1)} s in {run.stallCount} {run.stallCount === 1 ? 'stall' : 'stalls'}</td>
                        <td>{run.avgBitrate.toFixed(2)} Mbit/s</td>
                        <td>{run.switches}</td>
                        <td>{sc.toFixed(2)}{algo === best ? ' (highest)' : ''}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </WideRegion>
          <p className="abr-note">The default weights ({Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => `${k} ${v}`).join(', ')}) are one person's taste. A viewer who hates waiting and one who hates blur would pick different weights, and then a different player.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">three players run on the same trace; the buffer-based rule follows the idea of Huang and others (2014), simplified: verify against the paper</Provenance>
          <Provenance kind="illustrative">the ladder and traces are made up, and the score is yours, not a standard</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
