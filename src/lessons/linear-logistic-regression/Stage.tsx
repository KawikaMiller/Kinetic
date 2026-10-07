import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Heat, Plot2D, Points, Polygon, Segments, VLine, type HeatValue } from '../../components/Plot2D';
import { usePlot } from '../../components/plotContext';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { Point } from '../../core/plot';
import { mulberry32 } from '../../core/random';
import { useInterval } from '../../core/useInterval';
import { usePlayer } from '../../core/usePlayer';
import { gdCaption, lineText, linearCaption, num, thresholdCaption, trainFrames } from './frames';
import {
  L2, LINEAR_DATA, LINEAR_DOMAIN, LOGISTIC_DOMAIN, MAX_POINTS, OUTLIER, accuracyAt, biggestResidual, descendLine, linearFit, logit,
  logisticData, probability, trainLogistic, weightNorm, type ClassSet, type Dims, type LineDescent, type Pt,
} from './model';
import './styles.css';

type Scene = 'linear' | 'logistic';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'logistic', label: 'Logistic' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'linear' });
  return scene === 'linear' ? <LinearScene picker={picker} /> : <LogisticScene picker={picker} />;
}

/** With axis titles, 356 × 350 makes the inner box square: residual squares are drawn square. */
const PLOT_W = 356;
const PLOT_H = 350;
/** A click within this many px of a point removes it in remove mode. */
const HIT_PX = 14;

/** A transparent sheet over the plot box that reports clicks (and optionally moves) in data space. */
function PointerSheet({ onDown, onMove, cursor }: { onDown?: (p: Point) => void; onMove?: (p: Point) => void; cursor: string }) {
  const { box, toData } = usePlot();
  return (
    <rect
      className="llr-sheet"
      style={{ cursor }}
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      onPointerDown={(e) => {
        const p = toData(e.clientX, e.clientY);
        if (p) onDown?.(p);
      }}
      onPointerMove={(e) => {
        const p = toData(e.clientX, e.clientY);
        if (p) onMove?.(p);
      }}
    />
  );
}

// ── Linear ───────────────────────────────────────────────────────────

type ClickMode = 'add' | 'remove';
const MODES: { value: ClickMode; label: string }[] = [
  { value: 'add', label: 'Add a point' },
  { value: 'remove', label: 'Remove a point' },
];
const GD_FRAME_MS = 140;
/** "Add a point" from the keyboard drops new points at seeded spots. */
const ADD_SEED = 5;

function LinearScene({ picker }: { picker: ReactNode }) {
  const [points, setPoints] = useState<Pt[]>([...LINEAR_DATA]);
  const [active, setActive] = useState<number | null>(null);
  const [mode, setMode] = useState<ClickMode>('add');
  const [compare, setCompare] = useState(false);
  const [gd, setGd] = useState<{ run: LineDescent; index: number } | null>(null);
  const [added, setAdded] = useState(0);
  const setCaption = useSetCaption();
  const fit = linearFit(points);
  const outlierAt = compare ? biggestResidual(points) : null;
  const without = outlierAt === null ? null : linearFit(points.filter((_, i) => i !== outlierAt));

  useIntroCaption(linearCaption(LINEAR_DATA, false));

  const update = (next: Pt[], nextCompare = compare, quiet = false) => {
    setPoints(next);
    setCompare(nextCompare);
    setGd(null);
    setCaption(linearCaption(next, nextCompare), { quiet });
  };
  const add = (p: Point) => {
    if (points.length >= MAX_POINTS) {
      setCaption(<>That's the most this plot takes ({MAX_POINTS} points). Remove one first.</>);
      return;
    }
    setActive(points.length);
    update([...points, { x: p[0], y: p[1] }]);
  };
  const removeAt = (i: number) => {
    setActive(null);
    update(points.filter((_, k) => k !== i));
  };
  const removeNear = (p: Point, pxPerUnit: number) => {
    let best = -1;
    let bestD = HIT_PX / pxPerUnit;
    points.forEach((q, i) => {
      const d = Math.hypot(q.x - p[0], q.y - p[1]);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) removeAt(best);
  };
  const addSeeded = () => {
    const rnd = mulberry32(ADD_SEED + added);
    setAdded(added + 1);
    add([1 + rnd() * 8, 1 + rnd() * 8]);
  };
  const runGd = () => {
    const run = descendLine(points);
    if (!run) return;
    setGd({ run, index: 0 });
    setCaption(gdCaption(run, 0, points));
  };

  useInterval(() => {
    if (!gd || gd.index >= gd.run.snapshots.length - 1) return;
    const index = gd.index + 1;
    setGd({ run: gd.run, index });
    setCaption(gdCaption(gd.run, index, points), { quiet: index < gd.run.snapshots.length - 1 });
  }, GD_FRAME_MS, !!gd && gd.index < gd.run.snapshots.length - 1);

  const snap = gd?.run.snapshots[gd.index];
  return (
    <StageFrame
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label="Points" value={points.length} />
          <Stat label="Least-squares line" value={fit.ok ? lineText(fit.b, fit.m) : 'none'} color={fit.ok ? 'var(--hi)' : 'var(--bad)'} />
          <Stat label="MSE" value={fit.ok ? num(fit.mse) : '–'} color="var(--orange)" sub="mean area of the squares" />
          {snap && <Stat label="Gradient descent" value={lineText(snap.b, snap.m)} sub={`step ${snap.step.toLocaleString('en-US')}`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'data point', shape: 'dot' },
            ...(fit.ok
              ? [
                  { color: 'var(--hi)', label: 'least-squares line; the point you moved', shape: 'line' as const },
                  { color: 'var(--orange)', label: 'residuals and their squares' },
                ]
              : [{ color: 'var(--hi)', label: 'the point you moved', shape: 'dot' as const }]),
            ...(without?.ok ? [{ color: 'var(--muted)', label: 'fit without the biggest residual (dashed)', shape: 'line' as const }] : []),
            ...(snap ? [{ color: 'var(--hi)', label: 'gradient descent so far (dashed)', shape: 'line' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Clicking the plot will" options={MODES} value={mode} onChange={setMode} />
          <Toggle label="Compare" value={compare} onChange={(c) => update(points, c)} off="Off" on="Without biggest residual" />
        </>,
        <>
          <Button onClick={runGd} disabled={!fit.ok}>Fit by gradient descent</Button>
          <Button onClick={addSeeded} disabled={points.length >= MAX_POINTS}>Add a point</Button>
          <Button onClick={() => removeAt(points.length - 1)} disabled={points.length === 0}>Remove the last point</Button>
        </>,
        <ControlGroup key="presets" label="Presets">
          <ChipButton tone="info" onClick={() => { setActive(null); update([...LINEAR_DATA], false); }}>Seeded data</ChipButton>
          <ChipButton tone="info" onClick={() => { setActive(LINEAR_DATA.length); update([...LINEAR_DATA, OUTLIER], true); }}>Outlier</ChipButton>
          <ChipButton tone="info" onClick={() => { setActive(null); update([{ x: 5, y: 2 }, { x: 5, y: 7 }], false); }}>One x only</ChipButton>
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad llr-row">
        <Plot2D
          x={{ domain: LINEAR_DOMAIN, label: 'x' }}
          y={{ domain: LINEAR_DOMAIN, label: 'y' }}
          width={PLOT_W}
          height={PLOT_H}
          className="llr-plot"
          ariaLabel={`${points.length} points; ${fit.ok ? `least-squares line ${lineText(fit.b, fit.m)}` : 'no line'}`}
        >
          {mode === 'add' && <PointerSheet onDown={add} cursor="crosshair" />}
          {fit.ok && <ResidualSquares points={points} b={fit.b} m={fit.m} />}
          {fit.ok && <Segments segments={points.map((p, i) => ({ from: [p.x, p.y], to: [p.x, p.y - fit.residuals[i]], tone: 'orange' }))} />}
          {fit.ok && <Curve fn={(x) => fit.b + fit.m * x} tone="hi" />}
          {without?.ok && <Curve fn={(x) => without.b + without.m * x} tone="muted" dashed />}
          {snap && <Curve fn={(x) => snap.b + snap.m * x} tone="hi" dashed />}
          <Points
            data={points.map((p, i) => ({ x: p.x, y: p.y, tone: i === active ? 'hi' : 'info' }))}
            onDrag={
              mode === 'add'
                ? (i, p) => {
                    setActive(i);
                    update(points.map((q, k) => (k === i ? { x: p[0], y: p[1] } : q)), compare, true);
                  }
                : undefined
            }
            pointLabel={(i) => `data point ${i + 1}`}
          />
          {mode === 'remove' && <RemoveSheet onRemove={removeNear} />}
        </Plot2D>
        <div className="llr-side">
          {!fit.ok && <p className="llr-refusal" role="alert">{fit.reason}</p>}
          <Hint block>
            Click empty space to add a point, drag one to move it (or focus it and use the arrow keys). Switch the click to "Remove a point" to delete
            one. Seeded synthetic data.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}

/** Each residual's square, drawn beside its segment: their mean area is the MSE. */
function ResidualSquares({ points, b, m }: { points: readonly Pt[]; b: number; m: number }) {
  return (
    <>
      {points.map((p, i) => {
        const yHat = b + m * p.x;
        const side = Math.abs(p.y - yHat);
        const dir = p.x + side <= LINEAR_DOMAIN[1] ? 1 : -1;
        const x2 = p.x + dir * side;
        return <Polygon key={i} points={[[p.x, yHat], [x2, yHat], [x2, p.y], [p.x, p.y]]} tone="orange" />;
      })}
    </>
  );
}

function RemoveSheet({ onRemove }: { onRemove: (p: Point, pxPerUnit: number) => void }) {
  const { xs } = usePlot();
  return <PointerSheet onDown={(p) => onRemove(p, Math.abs(xs.map(1) - xs.map(0)))} cursor="pointer" />;
}

// ── Logistic ─────────────────────────────────────────────────────────

const DIMS: { value: Dims; label: string }[] = [
  { value: 1, label: 'One feature' },
  { value: 2, label: 'Two features' },
];
const SETS: { value: ClassSet; label: string }[] = [
  { value: 'overlapping', label: 'Overlapping' },
  { value: 'separable', label: 'Perfectly separable' },
];
const T_MIN = 0.05;
const T_MAX = 0.95;
const T_STEP = 0.05;
const HEAT_RES = 64;
/** How strongly the map tints toward a class at p = 0 or 1. */
const MAP_TINT = 0.55;

function LogisticScene({ picker }: { picker: ReactNode }) {
  const [dims, setDims] = useState<Dims>(1);
  const [set, setSet] = useState<ClassSet>('overlapping');
  const [l2, setL2] = useState(false);
  const [threshold, setThreshold] = useState(0.5);
  const [probe, setProbe] = useState<Point>([5, 5]);
  const setCaption = useSetCaption();
  const pts = useMemo(() => logisticData(dims, set), [dims, set]);
  const run = useMemo(() => trainLogistic(pts, dims, l2 ? L2 : 0), [pts, dims, l2]);
  const frames = useMemo(() => trainFrames(run, pts, dims, l2), [run, pts, dims, l2]);
  const player = usePlayer(frames, { interval: 380, autoplayOnChange: true });
  const params = run.snapshots[player.frame.snap].params;
  const probeX = dims === 1 ? [probe[0]] : [probe[0], probe[1]];
  const p = probability(params, probeX);
  const right = accuracyAt(params, pts, dims, threshold);

  const slide = (t: number) => {
    setThreshold(t);
    setCaption(thresholdCaption(params, pts, dims, t), { quiet: true });
  };

  const heat = useMemo(
    () => (x: number, y: number): HeatValue => {
      const q = probability(params, [x, y]);
      return q >= 0.5 ? { tone: 'violet', intensity: (q - 0.5) * 2 * MAP_TINT } : { tone: 'info', intensity: (0.5 - q) * 2 * MAP_TINT };
    },
    [params],
  );

  return (
    <StageFrame
      player={player}
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label="Log loss" value={num(run.snapshots[player.frame.snap].loss, 4)} />
          <Stat label={<span className="keep-case">‖w‖</span>} value={num(weightNorm(params), 2)} sub={l2 ? `L2 on, λ = ${L2}` : 'no penalty'} />
          <Stat label="p(class 1) at the probe" value={num(p, 3)} color="var(--hi)" sub={`so class ${p >= threshold ? 1 : 0} at threshold ${num(threshold, 2)}`} />
          <Stat label="Right class" value={`${right} / ${pts.length}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'class 0', shape: 'dot' },
            { color: 'var(--violet)', label: 'class 1', shape: 'dot' },
            { color: 'var(--hi)', label: dims === 1 ? 'fitted p(class 1), the cut, and the probe' : 'boundary p = threshold, and the probe', shape: 'line' },
            ...(dims === 1 ? [{ color: 'var(--muted)', label: 'threshold (dashed)', shape: 'line' as const }] : [{ color: 'var(--violet)', label: 'map tinted toward the likelier class' }]),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Features" options={DIMS} value={dims} onChange={(d) => { setDims(d); setProbe([5, 5]); }} />
          <Segmented label="Data" options={SETS} value={set} onChange={setSet} />
        </>,
        <>
          <Toggle label="L2 penalty" value={l2} onChange={setL2} off="Off" on={`On (λ = ${L2})`} />
          <Slider label="Threshold" value={threshold} min={T_MIN} max={T_MAX} step={T_STEP} format={(v) => num(v, 2)} onChange={slide} />
        </>,
      ]}
    >
      <div className="stage-pad llr-row">
        {dims === 1 ? (
          <OneFeaturePlot pts={pts} params={params} threshold={threshold} probe={probe} onProbe={setProbe} />
        ) : (
          <Plot2D x={{ domain: LOGISTIC_DOMAIN, label: 'feature x₁' }} y={{ domain: LOGISTIC_DOMAIN, label: 'feature x₂' }} width={PLOT_W} height={PLOT_H} className="llr-plot" ariaLabel={`Two classes; p(class 1) at the probe ${num(p, 3)}`}>
            <Heat fn={heat} resolution={HEAT_RES} />
            <PointerSheet onMove={setProbe} cursor="crosshair" />
            <Boundary params={params} threshold={threshold} />
            <Points data={pts.map((q) => ({ x: q.x, y: q.y, tone: q.label ? 'violet' : 'info' }))} r={4} />
            <Points data={[{ x: probe[0], y: probe[1], tone: 'hi', hollow: true }]} r={6} onDrag={(_, q) => setProbe(q)} pointLabel={() => 'probability probe'} />
          </Plot2D>
        )}
        <div className="llr-side">
          <Hint block>
            Move the pointer over the plot, or drag the hollow probe (arrow keys work too), to read p(class 1) anywhere. The model outputs a
            probability; the threshold turns it into a class.
          </Hint>
          <Hint block>
            Seeded synthetic data. Trained by {run.snapshots.at(-1)!.step.toLocaleString('en-US')} real gradient steps on log loss, on features
            standardised to mean 0 and spread 1 (as real pipelines do), then converted back to these axes.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}

function OneFeaturePlot({ pts, params, threshold, probe, onProbe }: {
  pts: readonly { x: number; y: number; label: 0 | 1 }[];
  params: readonly number[];
  threshold: number;
  probe: Point;
  onProbe: (p: Point) => void;
}) {
  const cut = params[1] !== 0 ? (logit(threshold) - params[0]) / params[1] : null;
  const p = probability(params, [probe[0]]);
  return (
    <Plot2D x={{ domain: LOGISTIC_DOMAIN, label: 'feature x' }} y={{ domain: [-0.1, 1.1], label: 'p(class 1)', tickValues: [0, 0.25, 0.5, 0.75, 1] }} width={PLOT_W} height={PLOT_H} className="llr-plot" ariaLabel={`One feature; p(class 1) at x = ${num(probe[0], 2)} is ${num(p, 3)}`}>
      <PointerSheet onMove={(q) => onProbe([q[0], probability(params, [q[0]])])} cursor="crosshair" />
      <HLine at={threshold} tone="muted" label={`threshold ${num(threshold, 2)}`} />
      {cut !== null && cut >= LOGISTIC_DOMAIN[0] && cut <= LOGISTIC_DOMAIN[1] && <VLine at={cut} tone="hi" label={`cut x = ${num(cut, 2)}`} />}
      <Curve fn={(x) => probability(params, [x])} tone="hi" />
      <Points data={pts.map((q) => ({ x: q.x, y: q.label, tone: q.label ? 'violet' : 'info' }))} r={4} />
      <Points data={[{ x: probe[0], y: p, tone: 'hi', hollow: true }]} r={6} onDrag={(_, q) => onProbe([q[0], probability(params, [q[0]])])} pointLabel={() => 'probability probe'} />
    </Plot2D>
  );
}

/** The line b + w₁x₁ + w₂x₂ = logit(threshold), clipped to the plot. */
function Boundary({ params, threshold }: { params: readonly number[]; threshold: number }) {
  const [b, w1, w2] = params;
  const c = logit(threshold) - b;
  const [lo, hi] = LOGISTIC_DOMAIN;
  let seg: { from: Point; to: Point } | null = null;
  if (Math.abs(w2) > 1e-12) seg = { from: [lo, (c - w1 * lo) / w2], to: [hi, (c - w1 * hi) / w2] };
  else if (Math.abs(w1) > 1e-12) seg = { from: [c / w1, lo], to: [c / w1, hi] };
  if (!seg) return null;
  return <Segments segments={[{ ...seg, tone: 'hi' }]} />;
}
