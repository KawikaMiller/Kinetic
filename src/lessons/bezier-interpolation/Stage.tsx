import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { ColorField } from '../../components/ColorField';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points, Segments, VLine } from '../../components/Plot2D';
import { usePlot } from '../../components/plotContext';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';
import { lerp } from '../../core/math';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { curveFrames, deg, easingCaption, f2, lerpCaption, pt, raceCaption, T_STEPS, type RaceResult } from './frames';
import {
  CURVE_PRESETS, PRESETS, X_RANGE, Y_RANGE, asWritten, bernstein, clampEasing, cssValue, deCasteljau, ease, easingCtrl, evenT, lerpAngleNaive,
  lerpAngleShortest, lerpHex, sampleBezier, shortestDelta, solveT, xAt, xGaps, type Cubic, type Easing,
  type CurvePreset, type P, type PresetId,
} from './model';
import './styles.css';

type Scene = 'curve' | 'easing' | 'lerp';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'curve', label: 'Bézier curve' },
  { value: 'easing', label: 'Easing' },
  { value: 'lerp', label: 'Lerp' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'curve' });
  if (scene === 'easing') return <EasingScene picker={picker} />;
  if (scene === 'lerp') return <LerpScene picker={picker} />;
  return <CurveScene picker={picker} />;
}

const HONESTY = 'Nothing simulated: the curve maths runs here, in your browser.';

/** P0…P3 written next to their points, in data space. */
function PointLabels({ pts, names }: { pts: readonly P[]; names: readonly string[] }) {
  const { xs, ys } = usePlot();
  return (
    <g className="bz-labels" aria-hidden="true">
      {pts.map((p, i) => (
        <text key={i} x={xs.map(p[0]) + 9} y={ys.map(p[1]) - 9}>{names[i]}</text>
      ))}
    </g>
  );
}

// ── Bézier curve ────────────────────────────────────────────────────

const NAMES = ['P0', 'P1', 'P2', 'P3'];
const EXTENT = 10;
/** 356 × 350 makes the plotting box square with Plot2D's margins. */
const PLOT_W = 356;
const PLOT_H = 350;
const SWEEP_MS = 90;
const WEIGHT_TONES: Tone[] = ['amber', 'pink', 'sky', 'orange'];
const CURVES = CURVE_PRESETS;

function CurveScene({ picker }: { picker: ReactNode }) {
  const [ctrl, setCtrl] = useState<Cubic>(CURVES[0].ctrl);
  const [loaded, setLoaded] = useState<CurvePreset | null>('arch');
  const [weights, setWeights] = useState(false);
  const [frames, setFrames] = useState(() => curveFrames(CURVES[0].ctrl));
  const player = usePlayer(frames, { interval: SWEEP_MS, autoplayOnChange: false });
  const t = player.frame.t;
  const levels = deCasteljau(ctrl, t);
  const w = bernstein(t);

  const change = (next: Cubic, id: CurvePreset | null) => {
    setCtrl(next);
    setLoaded(id);
    setFrames(curveFrames(next));
    player.queueNext({ play: false, from: player.index });
  };
  const drag = (i: number, p: P) => change(ctrl.map((q, j) => (j === i ? p : q)) as unknown as Cubic, null);

  const segs = (pts: readonly P[], tone: Tone) => pts.slice(1).map((p, i) => ({ from: pts[i], to: p, tone }));
  return (
    <StageFrame
      player={player}
      height={PLOT_H + 30}
      stats={
        <Stats>
          <Stat label="t" value={f2(t)} color="var(--hi)" sub="the curve parameter" />
          <Stat label="point on the curve" value={pt(levels[3][0])} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'control points P0-P3 and their polygon' },
            { color: 'var(--info)', label: 'the curve', shape: 'line' },
            { color: 'var(--dim)', label: 'first lerps (3 points)' },
            { color: 'var(--violet)', label: 'second lerps (2 points)', shape: 'dot' },
            { color: 'var(--hi)', label: 'the point at t', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets">
            {CURVES.map((c) => (
              <ChipButton key={c.id} tone="violet" on={loaded === c.id} onClick={() => change(c.ctrl, c.id)}>{c.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Slider label="t" value={t} min={0} max={1} step={1 / T_STEPS} format={f2} onChange={(v) => player.seek(Math.round(v * T_STEPS))} />
          <Toggle label="Bernstein weights" value={weights} onChange={setWeights} off="Hide" on="Show" />
        </>,
      ]}
    >
      <div className="stage-pad bz-row">
        <Plot2D x={{ domain: [0, EXTENT] }} y={{ domain: [0, EXTENT] }} width={PLOT_W} height={PLOT_H} className="bz-plot" ariaLabel={`Cubic Bézier curve with control points ${ctrl.map((p) => pt(p)).join(', ')}; at t = ${f2(t)} the point is ${pt(levels[3][0])}`}>
          <Segments segments={segs(ctrl, 'violet')} dashed />
          <Curve points={sampleBezier(ctrl)} tone="info" width={3} />
          <Segments segments={segs(levels[1], 'dim')} />
          <Points data={levels[1].map(([x, y]) => ({ x, y }))} tone="dim" r={3.5} />
          <Segments segments={segs(levels[2], 'violet')} />
          <Points data={levels[2].map(([x, y]) => ({ x, y }))} tone="violet" r={3.5} />
          <Points data={levels[3].map(([x, y]) => ({ x, y }))} tone="hi" r={6} />
          <Points data={ctrl.map(([x, y]) => ({ x, y }))} tone="violet" onDrag={drag} pointLabel={(i) => NAMES[i]} />
          <PointLabels pts={ctrl} names={NAMES} />
        </Plot2D>
        {weights && (
          <Box className="bz-weights">
            <SectionTitle hint="rounded to 3 places">Bernstein weights at t = {f2(t)}</SectionTitle>
            <Plot2D x={{ domain: [0, 1], label: 't' }} y={{ domain: [0, 1] }} width={300} height={190} ariaLabel={`The four Bernstein weight curves, with t = ${f2(t)} marked`}>
              {[0, 1, 2, 3].map((i) => (
                <Curve key={i} fn={(x) => bernstein(x)[i]} tone={WEIGHT_TONES[i]} />
              ))}
              <VLine at={t} tone="dim" />
              <Points data={w.map((y, i) => ({ x: t, y, tone: WEIGHT_TONES[i] }))} r={4} />
            </Plot2D>
            <p className="bz-sum">
              point = {w.map((wi, i) => (
                <span key={i} className={`tone-${WEIGHT_TONES[i]}`}>{i > 0 ? ' + ' : ''}{wi.toFixed(3)}·{NAMES[i]}</span>
              ))}
            </p>
            <Hint block tone="muted">The point is a weighted average of the four control points. The weights are never negative and always add up to 1, so the curve stays inside the control points' convex hull.</Hint>
          </Box>
        )}
      </div>
      <Hint block tone="muted" className="bz-honest">{HONESTY} Drag the violet points, or focus one and use the arrow keys.</Hint>
    </StageFrame>
  );
}

// ── Easing ──────────────────────────────────────────────────────────

const EASE_W = 356;
const EASE_H = 420;
const DURATION_MS = 1500;
const BALL = 22;
const EVEN_STEPS = 10;
/** Gaps within this of each other print as equal at 2 decimals, so the label calls them even. */
const EVEN_TOLERANCE = 0.005;

function EasingScene({ picker }: { picker: ReactNode }) {
  const [e, setE] = useState<Easing>(PRESETS[0].e);
  const [loaded, setLoaded] = useState<PresetId | null>('ease');
  const [race, setRace] = useState<RaceResult | null>(null);
  const [running, setRunning] = useState(false);
  const setCaption = useSetCaption();
  const written = asWritten(e);
  const ctrl = easingCtrl(written);
  const half = solveT(written, 0.5);
  const gaps = xGaps(written, EVEN_STEPS);

  useIntroCaption(easingCaption(PRESETS[0].e));

  const set = (next: Easing, id: PresetId | null, quiet: boolean) => {
    setE(next);
    setLoaded(id);
    setRace(null);
    setCaption(easingCaption(asWritten(next)), { quiet });
  };
  const drag = (i: number, [x, y]: P) => {
    const next = i === 0 ? { ...e, x1: x, y1: y } : { ...e, x2: x, y2: y };
    set(clampEasing(next), null, true);
  };

  const curve = Array.from({ length: 121 }, (_, i) => [xAt(written, i / 120), ease(written, xAt(written, i / 120))] as P);
  const even = evenT(written, EVEN_STEPS);
  return (
    <StageFrame
      height={EASE_H + 30}
      stats={
        <Stats>
          <Stat label="at half the time" value={`t = ${f2(half.t)}`} sub={half.method === 'newton' ? "Newton's method" : 'bisection fallback'} />
          <Stat label="progress then" value={`${Math.round(ease(written, 0.5) * 100)}%`} color="var(--info)" />
          <Stat label="time between even t steps" value={`${f2(gaps.min)}–${f2(gaps.max)}`} sub={gaps.max - gaps.min < EVEN_TOLERANCE ? 'even here: x ≈ t' : 'uneven: x ≠ t'} />
          <Stat label="largest ball gap" value={race && race.started && race.frames ? `${race.maxGap.toFixed(2)} px` : NA} color={race && race.frames && race.maxGap < 1 ? 'var(--ok)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'P1, P2 (drag) and their handles' },
            { color: 'var(--info)', label: 'the easing curve; the solver\'s ball' },
            { color: 'var(--ok)', label: 'the CSS transition\'s ball', shape: 'dot' },
            { color: 'var(--muted)', label: 'even steps of t', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>{picker}</>,
        <ControlGroup key="presets" label="Presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={loaded === p.id} onClick={() => set(p.e, p.id, false)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad bz-row">
        <Plot2D x={{ domain: X_RANGE, label: 'time (x)' }} y={{ domain: Y_RANGE, label: 'progress (y)' }} width={EASE_W} height={EASE_H} className="bz-plot" ariaLabel={`Easing curve ${cssValue(written)}`}>
          <HLine at={0} tone="dim" />
          <HLine at={1} tone="dim" />
          <Segments segments={[{ from: ctrl[0], to: ctrl[1] }, { from: ctrl[3], to: ctrl[2] }]} tone="violet" dashed />
          <Curve points={curve} tone="info" width={3} />
          <Points data={even.map((s) => ({ x: s.x, y: s.y, tone: 'muted' as Tone, hollow: true }))} r={3.5} />
          <Points data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} tone="violet" r={3.5} />
          <Points data={[{ x: written.x1, y: written.y1 }, { x: written.x2, y: written.y2 }]} tone="violet" onDrag={drag} pointLabel={(i) => (i ? 'P2' : 'P1')} />
          <PointLabels pts={[ctrl[1], ctrl[2]]} names={['P1', 'P2']} />
        </Plot2D>
        <div className="bz-side">
          <CodePanel title="The CSS" gutter="none" lines={['.ball {', `  transition: transform ${DURATION_MS / 1000}s`, `    ${cssValue(written)};`, '}']} />
          <Race e={written} result={race} running={running} onRunning={setRunning} onResult={(r) => { setRace(r); setCaption(raceCaption(written, r)); }} />
          <Box className="bz-xt">
            <SectionTitle hint="t in even steps">x is not t</SectionTitle>
            <Plot2D x={{ domain: [0, 1], label: 't (curve parameter)' }} y={{ domain: [0, 1], label: 'x (time)' }} width={300} height={200} ariaLabel="Time x against the curve parameter t">
              <Curve fn={(t) => t} tone="dim" dashed />
              <Curve fn={(t) => xAt(written, t)} tone="info" />
              <Points data={even.map((s) => ({ x: s.t, y: s.x, tone: 'muted' as Tone }))} r={3.5} />
            </Plot2D>
            <Hint block tone="muted">The dashed line is x = t. Equal steps of t land at unequal times, even for cubic-bezier(0, 0, 1, 1), whose output is a straight line. So easing first solves x(t) = time for t, then reads y(t).</Hint>
          </Box>
        </div>
      </div>
      <Hint block tone="muted" className="bz-honest">Nothing simulated: the curve maths runs here, and the green ball is your browser's own CSS easing. CSS only accepts x1 and x2 between 0 and 1, so the drag stops there.</Hint>
    </StageFrame>
  );
}

/**
 * Two balls on real DOM tracks. The green one has a real CSS transition with this cubic-bezier();
 * on every frame the blue one is placed by the lesson's solver at the transition's own
 * currentTime, and the gap between the two is measured.
 */
function Race({ e, result, running, onRunning, onResult }: {
  e: Easing;
  result: RaceResult | null;
  running: boolean;
  onRunning: (r: boolean) => void;
  onResult: (r: RaceResult) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const cssBall = useRef<HTMLDivElement>(null);
  const solverBall = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const key = cssValue(e);

  const place = (el: HTMLDivElement | null, x: number) => {
    if (el) el.style.transform = `translateX(${x}px)`;
  };
  const resetBalls = () => {
    cancelAnimationFrame(raf.current);
    cssBall.current?.style.setProperty('transition', 'none', 'important');
    place(cssBall.current, 0);
    place(solverBall.current, 0);
  };
  // A new curve puts both balls back at the start.
  useEffect(() => {
    resetBalls();
    onRunning(false);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the curve; resetBalls and onRunning only touch refs and a state setter
  }, [key]);

  const run = () => {
    const css = cssBall.current;
    const solver = solverBall.current;
    const width = track.current?.clientWidth;
    if (!css || !solver || !width) return;
    const dist = width - BALL;
    resetBalls();
    void css.getBoundingClientRect(); // commit the start position, or there is nothing to transition from
    // Inline !important on purpose: the app's reduced-motion CSS turns transitions off with
    // !important, but this transition is what the lesson compares against, so it has to run.
    css.style.setProperty('transition', `transform ${DURATION_MS}ms ${key}`, 'important');
    place(css, dist);
    const anim = css.getAnimations()[0];
    if (!anim) {
      onResult({ started: false, frames: 0, maxGap: 0 });
      return;
    }
    onRunning(true);
    let frames = 0;
    let maxGap = 0;
    const tick = () => {
      const now = anim.currentTime;
      if (anim.playState === 'finished' || now === null) {
        place(solver, dist);
        onRunning(false);
        onResult({ started: true, frames, maxGap });
        return;
      }
      const solverX = ease(e, Number(now) / DURATION_MS) * dist;
      place(solver, solverX);
      const cssX = new DOMMatrixReadOnly(getComputedStyle(css).transform).m41;
      maxGap = Math.max(maxGap, Math.abs(cssX - solverX));
      frames++;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <Box className="bz-race">
      <SectionTitle hint={`${DURATION_MS / 1000} s`}>Two balls, one curve</SectionTitle>
      <div ref={track} className="bz-track" aria-hidden="true">
        <div ref={cssBall} className="bz-ball is-css" />
      </div>
      <div className="bz-track" aria-hidden="true">
        <div ref={solverBall} className="bz-ball is-solver" />
      </div>
      <div className="bz-race-foot">
        <Button variant="primary" onClick={run} disabled={running}>{running ? 'Running…' : result ? 'Run again' : 'Run both'}</Button>
        <span className="bz-race-note">top: CSS transition · bottom: the solver</span>
      </div>
    </Box>
  );
}

// ── Lerp ────────────────────────────────────────────────────────────

const DIAL = 150;
const DIAL_R = 58;
const FROM_COLOR = '#ff3366'; // allow-color: a default for the learner's colour picker, the drawing's own material
const TO_COLOR = '#33ccff'; // allow-color: a default for the learner's colour picker, the drawing's own material
const SWATCHES = 10;
const NUM_FROM = 0;
const NUM_TO = 100;

function LerpScene({ picker }: { picker: ReactNode }) {
  const [t, setT] = useState(0.5);
  const [from, setFrom] = useState(350);
  const [to, setTo] = useState(10);
  const [c0, setC0] = useState(FROM_COLOR);
  const [c1, setC1] = useState(TO_COLOR);
  const setCaption = useSetCaption();

  useIntroCaption(lerpCaption(350, 10, 0.5));
  const update = (nt: number, nf: number, nto: number) => {
    setT(nt);
    setFrom(nf);
    setTo(nto);
    setCaption(lerpCaption(nf, nto, nt), { quiet: true });
  };

  const naive = lerpAngleNaive(from, to, t);
  const short = lerpAngleShortest(from, to, t);
  const value = lerp(NUM_FROM, NUM_TO, t);
  return (
    <StageFrame
      height={260}
      stats={
        <Stats>
          <Stat label="naive angle" value={deg(naive)} color="var(--bad)" sub={`turns ${Math.abs(to - from)}°`} />
          <Stat label="shortest arc" value={deg(short)} color="var(--ok)" sub={`turns ${Math.abs(shortestDelta(from, to))}°`} />
          <Stat label="number" value={f2(value)} sub={`${NUM_FROM} → ${NUM_TO}`} />
          <Stat label="colour" value={lerpHex(c0, c1, t)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'naive angle lerp (the long way)', shape: 'line' },
            { color: 'var(--ok)', label: 'shortest-arc lerp', shape: 'line' },
            { color: 'var(--muted)', label: 'start and end angles', shape: 'dot' },
            { color: 'var(--info)', label: 'the number', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="t" value={t} min={0} max={1} step={0.01} format={f2} onChange={(v) => update(v, from, to)} />
        </>,
        <>
          <Slider label="from angle" value={from} min={0} max={359} format={(v) => `${v}°`} onChange={(v) => update(t, v, to)} />
          <Slider label="to angle" value={to} min={0} max={359} format={(v) => `${v}°`} onChange={(v) => update(t, from, v)} />
        </>,
        <>
          <ColorField label="Colour from" value={c0} onChange={setC0} />
          <ColorField label="to" value={c1} onChange={setC1} />
        </>,
      ]}
    >
      <div className="stage-pad bz-lerp">
        <Box className="bz-lerp-panel">
          <SectionTitle hint="0° points right, angles grow anticlockwise">An angle</SectionTitle>
          <AngleDial from={from} to={to} naive={naive} short={short} />
        </Box>
        <Box className="bz-lerp-panel">
          <SectionTitle hint="each channel mixed separately in sRGB">A colour</SectionTitle>
          <div className="bz-swatches" role="img" aria-label={`Colours from ${c0} to ${c1}, with ${lerpHex(c0, c1, t)} at t = ${f2(t)}`}>
            {Array.from({ length: SWATCHES + 1 }, (_, i) => (
              <span key={i} style={{ background: lerpHex(c0, c1, i / SWATCHES) }} />
            ))}
          </div>
          <div className="bz-swatch-now" style={{ background: lerpHex(c0, c1, t) }} aria-hidden="true" />
          <Hint block tone="muted">Mixing the sRGB numbers is a lerp too, but it isn't perceptually even: the color-spaces lesson shows why some mixes look muddy.</Hint>
        </Box>
        <Box className="bz-lerp-panel">
          <SectionTitle hint={`${NUM_FROM} → ${NUM_TO}`}>A number</SectionTitle>
          <p className="bz-number">lerp(a, b, t) = a + (b − a)·t = <b>{f2(value)}</b></p>
          <Bar value={value} max={NUM_TO} tone="info" height={10} />
        </Box>
      </div>
      <Hint block tone="muted" className="bz-honest">{HONESTY}</Hint>
    </StageFrame>
  );
}

/** A dial with both lerps drawn as arcs from the start angle to where each has got to. */
function AngleDial({ from, to, naive, short }: { from: number; to: number; naive: number; short: number }) {
  const c = DIAL / 2;
  const at = (a: number, r = DIAL_R): P => [c + r * Math.cos((a * Math.PI) / 180), c - r * Math.sin((a * Math.PI) / 180)];
  /** Arc from a to b (b − a may be beyond ±180), as a polyline so long arcs draw right too. */
  const arc = (a: number, b: number, r: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(b - a) / 4));
    return Array.from({ length: n + 1 }, (_, i) => at(lerp(a, b, i / n), r).join(',')).join(' ');
  };
  const pointer = (a: number, cls: string) => {
    const [x, y] = at(a, DIAL_R + 6);
    return <line className={cls} x1={c} y1={c} x2={x} y2={y} />;
  };
  const mark = (a: number) => {
    const [x, y] = at(a, DIAL_R + 12);
    return <circle className="bz-dial-mark" cx={x} cy={y} r={4} />;
  };
  return (
    <svg className="bz-dial" viewBox={`0 0 ${DIAL} ${DIAL}`} role="img" aria-label={`Naive lerp at ${deg(naive)}, shortest arc at ${deg(short)}`}>
      <circle className="bz-dial-ring" cx={c} cy={c} r={DIAL_R} />
      <polyline className="bz-dial-arc is-naive" points={arc(from, naive, DIAL_R - 8)} />
      <polyline className="bz-dial-arc is-short" points={arc(from, from + shortestDelta(from, short), DIAL_R + 2)} />
      {mark(from)}
      {mark(to)}
      {pointer(naive, 'bz-dial-hand is-naive')}
      {pointer(short, 'bz-dial-hand is-short')}
      <circle className="bz-dial-hub" cx={c} cy={c} r={3} />
    </svg>
  );
}
