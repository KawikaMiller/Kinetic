import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bars, Plot2D, Segments } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, PauseButton, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useInterval } from '../../core/useInterval';
import { ChainGraph } from './ChainGraph';
import { MatrixTable } from './MatrixTable';
import { WALK_MAX, WALK_SEED, WEATHER_STATES, stationarySolve, visitFractions, walk } from './model';
import { rowControls, useRowEditor } from './rowEditor';
import { CONVERGED_TOLERANCE, gapToPi, isConverged, stateConverged, walkCaption, type WalkReadout } from './text';
import type { Chain } from './useChain';

const TICK_MS = 120;
const SPEEDS = [
  { value: 1, label: '1 step a tick' },
  { value: 10, label: '10' },
  { value: 100, label: '100' },
];
const BAR_INSET = 0.15;
const PLOT_Y = { domain: [0, 1] as const, label: 'share of time', ticks: 5 };
const START_OPTIONS = WEATHER_STATES.map((s, i) => ({ value: i, label: s }));

interface Run {
  key: string;
  t: number;
  playing: boolean;
}

export function WeatherScene({ picker, chain }: { picker: ReactNode; chain: Chain }) {
  const { P } = chain;
  const [start, setStart] = useState(0);
  const [seed, setSeed] = useState(WALK_SEED);
  const [speed, setSpeed] = useState(1);
  const key = `${JSON.stringify(P)}|${start}|${seed}`;
  const [run, setRun] = useState<Run>({ key, t: 0, playing: false });
  // A change of matrix, start or seed is a different walk: it starts again from step 0.
  const t = run.key === key ? run.t : 0;
  const playing = run.key === key && run.playing && t < WALK_MAX;
  const path = useMemo(() => walk(P, start, seed, WALK_MAX), [P, start, seed]);
  const pi = useMemo(() => stationarySolve(P), [P]);
  const fractions = visitFractions(path, t, P.length);
  const at = path[t];
  const rows = useRowEditor(P, chain.setRow);

  const go = (nextT: number, nextPlaying = false) => setRun({ key, t: Math.min(WALK_MAX, nextT), playing: nextPlaying });
  useInterval(() => go(t + speed, true), TICK_MS, playing);

  const readout: WalkReadout = { states: WEATHER_STATES, t, at, fractions, pi, seed };
  const caption = walkCaption(readout);
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);
  const converged = isConverged(readout);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Steps" value={t.toLocaleString('en-US')} sub={`of ${WALK_MAX.toLocaleString('en-US')} · seed ${seed}`} />
          <Stat label="Token on" value={WEATHER_STATES[at]} color="var(--hi)" sub={t > 0 ? `came from ${WEATHER_STATES[path[t - 1]]}` : 'the start state'} />
          <Stat label="Largest gap to π" value={pi && t > 0 ? gapToPi(fractions, pi).toFixed(4) : '–'} color={converged ? 'var(--ok)' : undefined} sub={pi ? (converged ? 'converged' : 'shrinks as the walk lengthens') : 'no unique π for this matrix'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the state the token is on', shape: 'dot' },
            { color: 'var(--info)', label: 'share of time in a state' },
            { color: 'var(--ok)', label: `a share within ${CONVERGED_TOLERANCE} of π` },
            { color: 'var(--violet)', label: 'stationary π', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Start" value={start} onChange={setStart} options={START_OPTIONS} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <PauseButton paused={!playing} onToggle={() => go(t >= WALK_MAX ? 0 : t, !playing)} />
          <Button onClick={() => go(t + 1)}>Step</Button>
          <Button onClick={() => go(WALK_MAX)}>Run {WALK_MAX.toLocaleString('en-US')} steps</Button>
          <Button onClick={() => go(0)}>Restart</Button>
          <Segmented label="Speed" value={speed} onChange={setSpeed} options={SPEEDS} />
        </>,
        ...rowControls({ states: WEATHER_STATES, P, row: rows.row, onRow: rows.pick, onEntry: chain.setEntry, onRowText: rows.apply, draft: rows.draft, setDraft: rows.type, error: rows.error }),
        <>
          <Button onClick={chain.reset}>Reset weather chain</Button>
          <Hint>The seeded walk is repeatable: the same matrix, start and seed give the same path. The probabilities are the ones of <Link to="/lesson/probability-basics">probability fundamentals</Link>, conditioned on the current state. A web surfer clicking random links is the same kind of chain: see <Link to="/lesson/eigen-pagerank">eigenvectors and PageRank</Link>.</Hint>
        </>,
      ]}
    >
      <div className="mc-stage stage-pad">
        <div className="mc-visual">
          <ChainGraph states={WEATHER_STATES} P={P} current={at} taken={t > 0 ? [path[t - 1], at] : null} ariaLabel={`Weather chain: the token is on ${WEATHER_STATES[at]}`} />
        </div>
        <div className="mc-visual">
          <Plot2D
            x={{ domain: [0, WEATHER_STATES.length] as const, tickValues: WEATHER_STATES.map((_, i) => i + 0.5), format: (v) => WEATHER_STATES[Math.floor(v)] ?? '' }}
            y={PLOT_Y}
            ariaLabel={`Share of time in each state after ${t} steps${pi ? ' against the stationary distribution' : ''}`}
          >
            <Bars bars={fractions.map((f, i) => ({ x0: i + BAR_INSET, x1: i + 1 - BAR_INSET, y: f, tone: pi && stateConverged(t, f, pi[i]) ? 'ok' : 'info' }))} />
            {pi && <Segments segments={pi.map((p, i) => ({ from: [i + BAR_INSET / 2, p] as [number, number], to: [i + 1 - BAR_INSET / 2, p] as [number, number], tone: 'violet' as const }))} />}
          </Plot2D>
        </div>
        <div className="mc-visual mc-matrix-wrap">
          <MatrixTable states={WEATHER_STATES} P={P} row={rows.row} />
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>a seeded random walk on the matrix you edit; the stationary lines come from solving the equations, not from the walk</Provenance>
        <Provenance kind="illustrative">the weather numbers are invented</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
