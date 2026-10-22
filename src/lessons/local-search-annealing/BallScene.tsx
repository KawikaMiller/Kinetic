import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useInterval } from '../../core/useInterval';
import { LandscapePlot } from './LandscapePlot';
import { DEFAULT_SCHEDULE, DEFAULT_SEED, DEFAULT_START, LANDSCAPE, LIMITS, bestCell, runChain, type Mode, type Schedule } from './landscape';
import { acceptanceNote, chainCaption, uphillSoFar } from './text';

const RUN_TICK_MS = 40;
/** A run is shown in about this many animation ticks, however many steps it has. */
const RUN_TICKS = 100;
const MODES = [{ value: 'hill' as Mode, label: 'Hill climbing' }, { value: 'anneal' as Mode, label: 'Annealing' }];

interface Params {
  start: number;
  mode: Mode;
  seed: number;
  schedule: Schedule;
}
const START: Params = { start: DEFAULT_START, mode: 'hill', seed: DEFAULT_SEED, schedule: DEFAULT_SCHEDULE };

/** Scene 1: one ball on the landscape, run by hill climbing or by annealing under a schedule you set. */
export function BallScene({ picker }: { picker: ReactNode }) {
  const [p, setP] = useState<Params>(START);
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(false);
  const { steps } = p.schedule;
  const chain = useMemo(() => runChain(p.seed, p.start, p.mode, p.schedule), [p]);
  const here = chain.cells[cursor];
  const caption = chainCaption(chain, cursor, p.mode, p.schedule);
  const chunk = Math.ceil(steps / RUN_TICKS);

  const change = (patch: Partial<Params> | { schedule: Partial<Schedule> }) => {
    setP((q) => ({ ...q, ...patch, schedule: 'schedule' in patch ? { ...q.schedule, ...patch.schedule } : q.schedule }));
    setCursor(0);
    setRunning(false);
  };
  useInterval(() => {
    const next = Math.min(steps, cursor + chunk);
    setCursor(next);
    if (next >= steps) setRunning(false);
  }, RUN_TICK_MS, running);

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Ball on cell" value={here} sub={`score ${LANDSCAPE[here]}`} />
          <Stat label="Best cell seen" value={bestCell(chain, cursor)} color="var(--ok)" sub={`score ${LANDSCAPE[bestCell(chain, cursor)]}`} />
          <Stat label="Worse moves accepted" value={uphillSoFar(chain, cursor)} sub={p.mode === 'hill' ? 'hill climbing takes none' : 'each one is a climb'} />
          {p.mode === 'anneal' && <Stat label="Temperature" value={cursor === 0 ? p.schedule.t0 : chain.temps[cursor - 1].toFixed(3)} sub={`cooling x${p.schedule.alpha} a step`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the ball', shape: 'dot' },
            { color: 'var(--ok)', label: 'green bar: the global minimum; ring: best cell the ball has seen', shape: 'dot' },
            { color: 'var(--orange)', label: 'orange bar: the local minimum at cell 4', shape: 'square' },
            { color: 'var(--info)', label: 'dashed line: the trail', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Mode" options={MODES} value={p.mode} onChange={(mode) => change({ mode })} />
          <Slider label="Start cell" value={p.start} min={LIMITS.start.min} max={LIMITS.start.max} onChange={(start) => change({ start })} />
        </>,
        <>
          <Slider label="Start temperature T0" value={p.schedule.t0} min={LIMITS.t0.min} max={LIMITS.t0.max} step={LIMITS.t0.step} format={(v) => v.toFixed(2)} onChange={(t0) => change({ schedule: { t0 } })} />
          <Slider label="Cooling factor" value={p.schedule.alpha} min={LIMITS.alpha.min} max={LIMITS.alpha.max} step={LIMITS.alpha.step} format={(v) => v.toFixed(3)} onChange={(alpha) => change({ schedule: { alpha } })} />
          <Slider label="Steps" value={steps} min={LIMITS.steps.min} max={LIMITS.steps.max} step={LIMITS.steps.step} onChange={(s) => change({ schedule: { steps: s } })} />
          <SeedField seed={p.seed} onSeed={(seed) => change({ seed })} />
        </>,
        <>
          <Button
            variant="primary"
            onClick={() => {
              if (running) setRunning(false);
              else {
                if (cursor >= steps) setCursor(0);
                setRunning(true);
              }
            }}
          >
            {running ? 'Pause' : cursor > 0 && cursor < steps ? 'Continue' : 'Run'}
          </Button>
          <Button softDisabled={cursor >= steps} onClick={() => { setRunning(false); setCursor(cursor + 1); }}>Step</Button>
          <Button softDisabled={cursor >= steps} onClick={() => { setRunning(false); setCursor(steps); }}>Finish</Button>
          <Button softDisabled={cursor === 0} onClick={() => { setRunning(false); setCursor(0); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad ls-stage">
        <LandscapePlot cells={chain.cells} upTo={cursor} best={bestCell(chain, cursor)} />
        {p.mode === 'anneal' && <p className="ls-note">{acceptanceNote(p.schedule.t0)}.</p>}
        <ClaimLabel kind="standard">the acceptance rule is the Metropolis rule: a worse move is taken with probability e^(-delta/T)</ClaimLabel>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={p.seed}>a seeded random walk, proposals left or right with equal probability</Provenance>
        <Provenance kind="toy">a 20-cell teaching landscape: real landscapes have millions of states</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
