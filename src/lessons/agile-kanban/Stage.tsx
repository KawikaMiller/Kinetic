import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, PauseButton, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA, plural } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { createCooldown } from '../../core/sim';
import { useSimulation } from '../../core/useSimulation';
import { COLUMN_COLOR, drawScene } from './draw';
import {
  advance, BLOCK_DAYS, blockCard, createWorld, inFlight, restartStats, setProcess, SPRINT_COMMIT, SPRINT_DAYS, stats, UNLIMITED, WINDOW_DAYS,
  WORKERS, type Process, type Stats as SimStats, type World,
} from './sim';

const STAGE_HEIGHT = 520;
const MIN_WIDTH = 620;
/** Simulated days per real second. */
const DAYS_PER_SECOND = 2;
/** Largest step the sim takes at once, in days, so fast frames stay accurate. */
const MAX_STEP_DAYS = 0.05;
/** The slider's top value, shown as "no limit". */
const NO_LIMIT = 11;
const INSIGHT_COOLDOWN_DAYS = 12;
/** Little's law "holds" in the readout when the two sides agree this closely. */
const LITTLE_TOLERANCE = 0.1;
const FLOOD_WIP = 15;
const STARVED_BACKLOG = 20;

const toLimit = (v: number) => (v >= NO_LIMIT ? UNLIMITED : v);
const PROCESSES: { value: Process; label: string }[] = [
  { value: 'kanban', label: 'Kanban (WIP limit)' },
  { value: 'scrum', label: 'Scrum (sprints)' },
];

export function Stage() {
  const setCaption = useSetCaption();
  const [process, setProcessState] = useState<Process>('kanban');
  const [limit, setLimit] = useState(3);
  const [rate, setRate] = useState(1.2);
  const insight = useRef(createCooldown(INSIGHT_COOLDOWN_DAYS));

  useIntroCaption(
    <>A simulated team of {WORKERS} developers and one reviewer. Cards arrive in the backlog; In progress may hold at most{' '}
      <span className="hl violet">3 cards</span>. Watch the cumulative flow chart grow below.</>,
  );

  const narrate = (w: World, s: SimStats) => {
    if (!insight.current.ready(w.t) || s.span < WINDOW_DAYS / 2) return;
    let say: ReactNode = null;
    const steady = s.throughput > 0 && Math.abs(s.littleCycle - s.cycle) / s.cycle < LITTLE_TOLERANCE;
    if (!Number.isFinite(w.wipLimit) && w.process === 'kanban' && inFlight(w) > FLOOD_WIP) {
      say = <><span className="hl bad">Everything started, little finishing</span>: {inFlight(w)} cards in flight, so each developer juggles several and loses focus. Throughput is {s.throughput.toFixed(2)}/day. Stop starting, start finishing.</>;
    } else if (w.process === 'kanban' && w.wipLimit < WORKERS && s.backlog > STARVED_BACKLOG) {
      say = <>WIP limit {w.wipLimit} is below the team size: {plural(WORKERS - w.wipLimit, 'developer')} of {WORKERS} sit idle while the backlog grows to <b>{s.backlog}</b>. Too low a limit starves the team.</>;
    } else if (steady && w.process === 'kanban') {
      say = <><span className="hl ok">Little's law holds</span>: average WIP {s.wip.toFixed(1)} ÷ throughput {s.throughput.toFixed(2)}/day = {s.littleCycle.toFixed(1)} days, and the measured cycle time is {s.cycle.toFixed(1)} days.</>;
    }
    if (say) {
      insight.current.fire(w.t);
      setCaption(say);
    }
  };

  const { world, snap, paused, togglePause, reset } = useSimulation({
    create: () => createWorld({ seed: 7, wipLimit: toLimit(limit), arrivalRate: rate, process }),
    step: (w, dt) => {
      let left = dt * DAYS_PER_SECOND;
      while (left > 1e-9) {
        const d = Math.min(MAX_STEP_DAYS, left);
        advance(w, d);
        left -= d;
      }
    },
    snapshot: (w) => stats(w),
    snapshotEvery: 0.25,
    onSnapshot: narrate,
  });
  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => drawScene(ctx, w, h, world()));
  useLoop(redraw, !paused);

  // The slider changes the limit live; the trailing stats restart from today (cards already in
  // flight still finish under them, so they take a few days to settle).
  const changeLimit = (v: number) => {
    setLimit(v);
    const w = world();
    w.wipLimit = toLimit(v);
    restartStats(w);
    setCaption(
      <>WIP limit now {v >= NO_LIMIT ? 'off' : v}. The stats start over from today, but cards already on the board still have to
        finish, so give them a few days to settle on the new limit.</>,
      { quiet: true },
    );
  };
  useEffect(() => {
    world().arrivalRate = rate;
  }, [world, rate]);

  const pickProcess = (p: Process) => {
    setProcessState(p);
    setProcess(world(), p);
    setCaption(p === 'scrum'
      ? <><b>Scrum</b>: every {SPRINT_DAYS} days the team plans a sprint, committing up to {SPRINT_COMMIT} cards (violet outlines); developers take one each. New requests wait for the next planning, so lead time grows. Dashed lines on the chart are sprint reviews.</>
      : <><b>Kanban</b>: no sprints. A card is pulled the moment In progress drops below its <span className="hl violet">WIP limit</span>.</>);
  };

  const block = () => {
    const c = blockCard(world());
    setCaption(c
      ? <>Card <span className="hl bad">#{c.id}</span> is now waiting on another team for {BLOCK_DAYS} days. It keeps its WIP slot, so work queues up behind it.</>
      : <>No card is being worked right now, so there's nothing to block.</>);
  };

  const restart = () => {
    reset();
    setCaption(<>Fresh board: same team, a new {limit >= NO_LIMIT ? 'unlimited' : `limit-${limit}`} run.</>);
  };

  const settled = snap !== null && snap.span >= WINDOW_DAYS / 2 && snap.throughput > 0 && snap.cycle > 0;
  const steady = settled && Math.abs(snap.littleCycle - snap.cycle) / snap.cycle < LITTLE_TOLERANCE;

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat label="WIP (avg)" value={snap ? snap.wip.toFixed(1) : NA} color="var(--violet)" sub={`cards in flight, last ${WINDOW_DAYS} days`} />
          <Stat label="Throughput" value={snap && snap.span > 0 ? `${snap.throughput.toFixed(2)}/day` : NA} color="var(--ok)" sub={`arrivals ${rate.toFixed(1)}/day`} />
          <Stat label="Cycle time" value={snap && snap.cycle > 0 ? `${snap.cycle.toFixed(1)} d` : NA} color="var(--hi)" sub={snap && snap.lead > 0 ? `lead time ${snap.lead.toFixed(1)} d from request` : "start to done, measured"} />
          <Stat label="WIP ÷ throughput" value={snap && snap.throughput > 0 ? `${snap.littleCycle.toFixed(1)} d` : NA}
            color={steady ? 'var(--ok)' : 'var(--hi)'} sub={!settled ? "Little's law: measuring…" : steady ? "Little's law: matches" : 'still settling (not steady)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'being worked on' },
            { color: 'var(--bad)', label: 'blocked' },
            { color: 'var(--ok)', label: 'done' },
            { color: 'var(--violet)', label: process === 'scrum' ? 'committed to the sprint' : 'WIP limit slots' },
            { color: COLUMN_COLOR.backlog, label: 'backlog band', shape: 'line' },
            { color: COLUMN_COLOR.dev, label: 'in progress band', shape: 'line' },
            { color: COLUMN_COLOR.review, label: 'review band', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Process" value={process} onChange={pickProcess} options={PROCESSES} />
          {process === 'kanban' ? (
            <Slider label="WIP limit (In progress)" value={limit} min={1} max={NO_LIMIT} onChange={changeLimit}
              format={(v) => (v >= NO_LIMIT ? 'no limit' : String(v))} />
          ) : (
            <Hint>Scrum caps work by sprint scope ({SPRINT_COMMIT} cards per sprint), not a WIP limit.</Hint>
          )}
          <Slider label="Arrivals" value={rate} min={0.6} max={2} step={0.1} onChange={setRate} format={(v) => `${v.toFixed(1)}/day`} />
        </>,
        <>
          <Button variant="danger" onClick={block}>Block a card</Button>
          <Button onClick={restart}>Restart</Button>
          <PauseButton paused={paused} onToggle={togglePause} />
          <Hint>Simulated team; rates and the context-switching cost are illustrative. 1 s ≈ {DAYS_PER_SECOND} days.</Hint>
        </>,
      ]}
    >
      <div ref={wrapRef} className="canvas-wrap" style={{ '--h': `${STAGE_HEIGHT}px` } as CSSProperties}>
        <canvas ref={canvasRef} />
      </div>
    </StageFrame>
  );
}
