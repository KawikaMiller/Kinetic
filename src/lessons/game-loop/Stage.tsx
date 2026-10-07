import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { Sparkline } from '../../components/Sparkline';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, PauseButton, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useCanvas, useLoop } from '../../core/hooks';
import { plural } from '../../core/format';
import { createCooldown, percentile } from '../../core/sim';
import { drawBox } from './draw';
import { capCaption, catchUpCaption, costCaption, machinesCaption, MODE_LABEL, modeCaption, slowMotionCaption, spiralCaption, tunnelCaption } from './frames';
import { busyWait } from './lag';
import {
  DT, MAX_FRAME, SAFETY_STEPS, SPIKE_EVERY, SPIRAL_FRAMES, START, TUNNEL_SPIKE, advanceFrame, createLoop, createMachine, machineFrame,
  machineGap, spikeReady, spiralling, type Ball, type LoopMode, type Machine,
} from './sim';
import './styles.css';

type View = 'live' | 'machines';
const VIEWS: { value: View; label: string }[] = [
  { value: 'live', label: 'One real loop' },
  { value: 'machines', label: 'Two machines' },
];
const MODES: { value: LoopMode; label: string }[] = (['variable', 'fixed', 'interpolated'] as const).map((m) => ({ value: m, label: MODE_LABEL[m] }));

export function Stage() {
  const [view, picker] = useScenePicker<View>({ label: 'View', options: VIEWS, initial: 'live' });
  const [mode, setMode] = useState<LoopMode>('variable');
  const modePicker = <Segmented label="Loop" options={MODES} value={mode} onChange={setMode} />;
  if (view === 'machines') return <MachinesScene picker={picker} mode={mode} modePicker={modePicker} />;
  return <LiveScene picker={picker} mode={mode} setMode={setMode} modePicker={modePicker} />;
}

const BUDGET_MS = 1000 / 60;
/**
 * Two separate checks, each labelled on screen: the bar is over budget when update + render alone
 * take more than 16.7 ms; a frame "misses a 60 Hz frame" when it takes over 1.25 × that (20.8 ms),
 * a margin that keeps normal refresh jitter from flashing red.
 */
const MISSED_FRAME = 1.25;
const missedFrame = (frameMs: number) => frameMs > BUDGET_MS * MISSED_FRAME;
const HISTORY = 120;
const SNAP_MS = 150;
const FLASH_MS = 900;
/** A fixed-step frame with at least this many updates is worth a "catching up" caption. */
const CATCH_UP_STEPS = 3;
const EVENT_COOLDOWN_S = 2.5;
const SPIKE_MAX_MS = 400;
const COST_MAX_MS = 20;

interface Snap {
  frameMs: number;
  updateMs: number;
  renderMs: number;
  steps: number;
  tunnels: number;
  hz: number;
  frames: number[];
  updates: number[];
  spikes: number;
}
const EMPTY: Snap = { frameMs: 0, updateMs: 0, renderMs: 0, steps: 0, tunnels: 0, hz: 0, frames: [], updates: [], spikes: 0 };

function LiveScene({ picker, mode, setMode, modePicker }: { picker: ReactNode; mode: LoopMode; setMode: (m: LoopMode) => void; modePicker: ReactNode }) {
  const [spikeMs, setSpikeMs] = useState(0);
  const [costMs, setCostMs] = useState(0);
  const [capFrame, setCapFrame] = useState(true);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snap>(EMPTY);
  const setCaption = useSetCaption();
  const loop = useRef(createLoop());
  const shown = useRef<{ render: Ball; ghost: Ball | null; flashUntil: number }>({ render: START, ghost: null, flashUntil: 0 });
  const meter = useRef({ last: null as number | null, frames: [] as number[], updates: [] as number[], lastSpike: 0, lastSnap: 0, spikes: 0, reports: [] as { steps: number; backlog: number }[] });
  const events = useRef(createCooldown(EVENT_COOLDOWN_S, { armed: true }));
  const settings = useRef({ mode, spikeMs, costMs, capFrame });
  useEffect(() => {
    settings.current = { mode, spikeMs, costMs, capFrame };
  });

  useIntroCaption(modeCaption('variable'));
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    setCaption(modeCaption(mode));
  }, [mode, setCaption]);
  // Coming back from a pause must not count the paused time as one enormous frame.
  useEffect(() => {
    meter.current.last = null;
  }, [paused]);

  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => {
    const s = shown.current;
    drawBox(ctx, w, h, { render: s.render, ghost: s.ghost, flash: Math.max(0, (s.flashUntil - performance.now()) / FLASH_MS) });
  });

  useLoop(() => {
    const now = performance.now();
    const m = meter.current;
    if (m.last === null) {
      m.last = now;
      redraw();
      return;
    }
    // useLoop caps its dt at 50 ms, which would hide the spikes this lesson is about: measure the real frame time.
    const frameDt = (now - m.last) / 1000;
    m.last = now;
    const cfg = settings.current;
    const w = loop.current.world;
    const tunnelsBefore = w.tunnels;
    const t0 = performance.now();
    const r = advanceFrame(loop.current, frameDt, cfg.mode, cfg.capFrame, () => busyWait(cfg.costMs));
    const t1 = performance.now();
    m.reports.push({ steps: r.steps, backlog: r.backlog });
    if (m.reports.length > SPIRAL_FRAMES + 1) m.reports.shift();
    shown.current.render = r.render;
    shown.current.ghost = cfg.mode === 'interpolated' ? r.physics : null;
    const sec = now / 1000;
    if (w.tunnels > tunnelsBefore) {
      shown.current.flashUntil = now + FLASH_MS;
      const used = cfg.capFrame ? Math.min(frameDt, MAX_FRAME) : frameDt;
      setCaption(tunnelCaption(used, Math.abs(r.physics.vx) * used));
      events.current.fire(sec);
    } else if (cfg.mode !== 'variable' && events.current.ready(sec)) {
      if (!cfg.capFrame && spiralling(m.reports)) {
        setCaption(spiralCaption());
        events.current.fire(sec);
      } else if (cfg.capFrame && r.dropped > 0 && cfg.costMs > DT * 1000) {
        setCaption(slowMotionCaption());
        events.current.fire(sec);
      } else if (r.steps >= CATCH_UP_STEPS && cfg.costMs <= DT * 1000) {
        setCaption(catchUpCaption(frameDt, r.steps, r.dropped));
        events.current.fire(sec);
      }
    }
    redraw();
    const t2 = performance.now();

    m.frames.push(frameDt * 1000);
    m.updates.push(r.steps);
    if (m.frames.length > HISTORY) m.frames.shift();
    if (m.updates.length > HISTORY) m.updates.shift();

    if (cfg.spikeMs > 0 && now - m.lastSpike > SPIKE_EVERY * 1000 && spikeReady(w.ball)) {
      m.lastSpike = now;
      m.spikes++;
      busyWait(cfg.spikeMs);
    }
    if (now - m.lastSnap > SNAP_MS) {
      m.lastSnap = now;
      setSnap({
        frameMs: frameDt * 1000, updateMs: t1 - t0, renderMs: t2 - t1, steps: r.steps, tunnels: w.tunnels,
        hz: m.frames.length ? 1000 / percentile([...m.frames].sort((a, b) => a - b), 0.5) : 0, frames: [...m.frames], updates: [...m.updates], spikes: m.spikes,
      });
    }
  }, !paused);

  const reset = () => {
    loop.current = createLoop();
    shown.current = { render: START, ghost: null, flashUntil: 0 };
    meter.current.spikes = 0;
    redraw();
  };
  const tunnelPreset = () => {
    setMode('variable');
    setSpikeMs(TUNNEL_SPIKE * 1000);
    setCostMs(0);
    setCapFrame(true);
    reset();
    setCaption(<>Tunnelling preset: variable dt with a {TUNNEL_SPIKE * 1000} ms busy-wait, injected when the ball is about to reach the thin wall. Watch the wall…</>);
  };

  const over = missedFrame(snap.frameMs);
  return (
    <StageFrame
      height={300}
      minWidth={340}
      stats={
        <Stats>
          <Stat label="frame time" value={`${snap.frameMs.toFixed(1)} ms`} color={over ? 'var(--bad)' : undefined} sub={over ? `missed a 60 Hz frame (> ${(BUDGET_MS * MISSED_FRAME).toFixed(1)} ms)` : 'measured, last frame'} />
          <Stat label="rAF rate" value={snap.hz ? `${Math.round(snap.hz)} Hz` : '–'} sub="your display, median" />
          <Stat label="updates this frame" value={snap.steps} color={snap.steps >= SAFETY_STEPS ? 'var(--bad)' : undefined} />
          <Stat label="tunnels" value={snap.tunnels} color={snap.tunnels ? 'var(--bad)' : 'var(--ok)'} sub={`${plural(snap.spikes, 'spike')} injected`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the ball', shape: 'dot' },
            { color: 'var(--violet)', label: 'thin wall', shape: 'line' },
            { color: 'var(--bad)', label: 'tunnelling flash', shape: 'square' },
            ...(mode === 'interpolated' ? [{ color: 'var(--dim)', label: 'newest physics step (outline)', shape: 'dot' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {modePicker}
        </>,
        <>
          <Slider label="Lag spike" value={spikeMs} min={0} max={SPIKE_MAX_MS} step={10} format={(v) => (v ? `${v} ms` : 'off')} onChange={setSpikeMs} />
          <Slider label="Update cost" value={costMs} min={0} max={COST_MAX_MS} format={(v) => (v ? `${v} ms` : 'free')} onChange={(v) => { setCostMs(v); setCaption(costCaption(v), { quiet: true }); }} />
          <Toggle label="Max frame time" value={capFrame} onChange={(c) => { setCapFrame(c); setCaption(capCaption(c)); }} off="none" on={`${MAX_FRAME * 1000} ms`} />
        </>,
        <>
          <ChipButton tone="info" size="md" onClick={tunnelPreset}>Tunnelling preset</ChipButton>
          <Button onClick={reset}>Reset ball</Button>
          <PauseButton paused={paused} onToggle={() => setPaused((p) => !p)} />
        </>,
      ]}
    >
      <div className="stage-pad gl-live">
        <div ref={wrapRef} className="canvas-wrap gl-canvas">
          <canvas ref={canvasRef} aria-label={`Ball in a box with a thin wall; ${snap.tunnels} tunnels so far`} role="img" />
        </div>
        <div className="gl-panels">
          <Box className="gl-budget">
            <SectionTitle hint="the last frame">Frame budget at 60 Hz</SectionTitle>
            <BudgetBar updateMs={snap.updateMs} renderMs={snap.renderMs} frameMs={snap.frameMs} />
          </Box>
          <Box className="gl-sparks">
            <SectionTitle hint={`last ${HISTORY} frames`}>History</SectionTitle>
            <div className="gl-spark-row"><span>frame time</span><Sparkline values={snap.frames} width={150} height={28} cap={HISTORY} color="var(--info)" refLine={BUDGET_MS} minMax={BUDGET_MS * 2} /></div>
            <div className="gl-spark-row"><span>updates per frame</span><Sparkline values={snap.updates} width={150} height={28} cap={HISTORY} color="var(--hi)" minMax={3} /></div>
          </Box>
        </div>
        <Hint block tone="muted" className="gl-honest">
          Lag spikes and update costs are injected on purpose (a busy-wait that blocks the page), at most every {SPIKE_EVERY} s, as the ball heads for the thin wall.
          requestAnimationFrame fires at your display's refresh rate, so the rAF rate depends on your device and slows when the tab is busy or hidden.
          Inside Kinetic: most lesson simulations step with the real frame time capped at 50 ms, variable dt with a cap, which is fine when nothing has to be reproducible.
        </Hint>
      </div>
    </StageFrame>
  );
}

/** The last frame's update and render time against a 16.7 ms track, with the measured frame time. */
function BudgetBar({ updateMs, renderMs, frameMs }: { updateMs: number; renderMs: number; frameMs: number }) {
  const share = (v: number) => `${Math.min(100, (v / BUDGET_MS) * 100)}%`;
  const work = updateMs + renderMs;
  const workOver = work > BUDGET_MS;
  const missed = missedFrame(frameMs);
  return (
    <div className={`gl-bar-wrap ${workOver ? 'is-over' : ''}`}>
      <div className="gl-bar" role="img" aria-label={`Update ${updateMs.toFixed(1)} ms and render ${renderMs.toFixed(1)} ms of a ${BUDGET_MS.toFixed(1)} ms budget; the frame took ${frameMs.toFixed(1)} ms`}>
        <span className="gl-bar-update" style={{ width: share(updateMs) }} />
        <span className="gl-bar-render" style={{ width: share(Math.min(renderMs, Math.max(0, BUDGET_MS - updateMs))) }} />
      </div>
      <p className="gl-bar-text">
        <span className="gl-key is-update">update {updateMs.toFixed(1)} ms</span>
        <span className="gl-key is-render">render {renderMs.toFixed(1)} ms</span>
        <span className={workOver ? 'gl-over-text' : ''}>{workOver ? `over the ${BUDGET_MS.toFixed(1)} ms budget` : `of ${BUDGET_MS.toFixed(1)} ms`}</span>
      </p>
      <p className={`gl-bar-frame ${missed ? 'is-over' : ''}`}>frame took {frameMs.toFixed(1)} ms{missed ? `: missed a 60 Hz frame (over ${(BUDGET_MS * MISSED_FRAME).toFixed(1)} ms)` : ''}</p>
    </div>
  );
}

// ── Two machines ────────────────────────────────────────────────────

const RUN_SECONDS = 6;
const SLOW_HZ = 30;
const FAST_HZ = 144;

interface Pair {
  slow: Machine;
  fast: Machine;
  clock: number;
}
const createPair = (): Pair => ({ slow: createMachine(SLOW_HZ), fast: createMachine(FAST_HZ), clock: 0 });

function MachinesScene({ picker, mode, modePicker }: { picker: ReactNode; mode: LoopMode; modePicker: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [gap, setGap] = useState({ gap: 0, compared: 0, slowSteps: 0, fastSteps: 0 });
  const setCaption = useSetCaption();
  const pair = useRef(createPair());
  const lastSnap = useRef(0);
  const modeRef = useRef(mode);
  useIntroCaption(machinesCaption(mode));
  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    pair.current = createPair();
    setCaption(machinesCaption(mode));
  }, [mode, setCaption]);

  const scene = (m: Machine, label: string) => ({
    render: m.last?.render ?? START,
    ghost: mode === 'interpolated' && m.last ? m.last.physics : null,
    flash: 0,
    trail: m.trail,
    label,
  });
  const { wrapRef: slowWrap, canvasRef: slowRef, redraw: redrawSlow } = useCanvas((ctx, w, h) => drawBox(ctx, w, h, scene(pair.current.slow, `${SLOW_HZ} Hz display (simulated)`)));
  const { wrapRef: fastWrap, canvasRef: fastRef, redraw: redrawFast } = useCanvas((ctx, w, h) => drawBox(ctx, w, h, scene(pair.current.fast, `${FAST_HZ} Hz display (simulated)`)));

  useLoop((dt) => {
    const p = pair.current;
    p.clock += dt;
    if (p.clock > RUN_SECONDS) {
      pair.current = createPair();
      return;
    }
    // Each display shows a frame every 1/hz of simulated time; counting frames avoids drift.
    while ((p.slow.frames + 1) / SLOW_HZ <= p.clock) machineFrame(p.slow, modeRef.current);
    while ((p.fast.frames + 1) / FAST_HZ <= p.clock) machineFrame(p.fast, modeRef.current);
    redrawSlow();
    redrawFast();
    const now = performance.now();
    if (now - lastSnap.current > SNAP_MS) {
      lastSnap.current = now;
      setGap({ ...machineGap(p.slow, p.fast, modeRef.current), slowSteps: p.slow.loop.world.steps, fastSteps: p.fast.loop.world.steps });
    }
  }, !paused);

  const fixed = mode !== 'variable';
  return (
    <StageFrame
      height={300}
      minWidth={340}
      stats={
        <Stats>
          <Stat label="gap between the balls" value={`${gap.gap.toFixed(gap.gap < 10 ? 2 : 0)} units`} color={fixed ? (gap.gap === 0 ? 'var(--ok)' : 'var(--bad)') : undefined} sub={fixed ? `largest over ${gap.compared} matching steps` : `at the latest shared instant (${gap.compared} so far)`} />
          <Stat label={`${SLOW_HZ} Hz updates`} value={gap.slowSteps} />
          <Stat label={`${FAST_HZ} Hz updates`} value={gap.fastSteps} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'ball and its faint trail', shape: 'dot' },
            { color: 'var(--violet)', label: 'thin wall', shape: 'line' },
            ...(mode === 'interpolated' ? [{ color: 'var(--dim)', label: 'newest physics step (outline)', shape: 'dot' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {modePicker}
        </>,
        <>
          <Button onClick={() => { pair.current = createPair(); }}>Restart both</Button>
          <PauseButton paused={paused} onToggle={() => setPaused((p) => !p)} />
        </>,
      ]}
    >
      <div className="stage-pad gl-machines">
        <div ref={slowWrap} className="canvas-wrap gl-machine">
          <canvas ref={slowRef} role="img" aria-label={`${SLOW_HZ} Hz simulated display`} />
        </div>
        <div ref={fastWrap} className="canvas-wrap gl-machine">
          <canvas ref={fastRef} role="img" aria-label={`${FAST_HZ} Hz simulated display`} />
        </div>
        <Hint block tone="muted" className="gl-honest">
          Both displays are simulated by stepping the same code at {SLOW_HZ} and {FAST_HZ} frames per second of simulated time, and restart every {RUN_SECONDS} s.
          Your screen shows only as many of those frames as it refreshes.
        </Hint>
      </div>
    </StageFrame>
  );
}
