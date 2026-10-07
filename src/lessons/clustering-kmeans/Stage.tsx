import { useMemo, useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Heat, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { clamp } from '../../core/math';
import type { Point } from '../../core/plot';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames } from './frames';
import { CLUSTER_TONES, MAX_K, num } from './view';
import { Centroids, ClickCatcher } from './layers';
import {
  ELBOW_MAX_K, PRESET_IDS, RESTARTS, agreement, bestOfRestarts, elbowCurve, elbowK, finalStep, initCentroids, lloyd, nearest, preset, sqDist, standardise,
  type InitMethod, type P, type Preset, type PresetId,
} from './model';
import './styles.css';

const PLOT_W = 356;
const PLOT_H = 320;
const SMALL_H = 190;
const PAD = 0.12;
const VORONOI_TINT = 0.16;
/** A click this close to a point (as a share of the plot's width) removes it instead of adding one. */
const REMOVE_RADIUS = 0.035;
const MAX_POINTS = 240;
const PLAY_MS = 1000;

type CurveView = 'elbow' | 'silhouette';
const PRESET_LABELS = Object.fromEntries(PRESET_IDS.map((id) => [id, preset(id).label])) as Record<PresetId, string>;

interface Data {
  /** The preset as loaded: its own points array is how "edited" is detected. */
  base: Preset;
  points: P[];
  /** Generating group per point; -1 for points the learner added. */
  groups: number[];
}

const loadData = (id: PresetId): Data => {
  const p = preset(id);
  return { base: p, points: p.points, groups: p.groups };
};

/** A plot box around the preset's own points and start, so editing never makes the axes jump. */
function extent(points: readonly P[]): { x: [number, number]; y: [number, number] } {
  const span = (vs: number[]): [number, number] => {
    const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
    const pad = (hi - lo || 1) * PAD;
    return [Number((lo - pad).toPrecision(3)), Number((hi + pad).toPrecision(3))];
  };
  return { x: span(points.map((p) => p[0])), y: span(points.map((p) => p[1])) };
}

export function Stage() {
  const [data, setData] = useState<Data>(() => loadData('three'));
  const [k, setK] = useState(3);
  const [method, setMethod] = useState<InitMethod>('plusplus');
  const [seed, setSeed] = useState(1);
  const [scaled, setScaled] = useState(false);
  const [view, setView] = useState<CurveView>('elbow');
  const [cursor, setCursor] = useState<Point>([0, 0]);
  const p = data.base;
  const edited = data.points !== p.points;
  const fixedOk = !!p.fixedStart && k === p.k && !scaled && !edited;
  const init: InitMethod = method === 'fixed' && !fixedOk ? 'plusplus' : method;
  const space = useMemo(() => (scaled ? standardise(data.points) : data.points), [data.points, scaled]);
  const box = useMemo(() => extent(scaled ? standardise(p.points) : [...p.points, ...(p.fixedStart ?? [])]), [p, scaled]);
  const enough = space.length >= k;
  // The cursor stays inside whatever box the current preset uses.
  const cur: Point = [clamp(cursor[0], box.x[0], box.x[1]), clamp(cursor[1], box.y[0], box.y[1])];

  const steps = useMemo(
    () => (enough ? lloyd(space, init === 'fixed' ? p.fixedStart! : initCentroids(space, k, init, seed)) : []),
    [enough, space, init, p, k, seed],
  );
  const best = useMemo(() => (enough ? bestOfRestarts(space, k, seed) : null), [enough, space, k, seed]);
  const curve = useMemo(() => (space.length ? elbowCurve(space, seed) : []), [space, seed]);
  const bend = elbowK(curve);
  const frames = useMemo(() => {
    if (!steps.length || !best) return [];
    const last = finalStep(steps);
    const known = data.groups.every((g) => g >= 0);
    return buildFrames(steps, { k, method: init, bestInertia: best.inertia, agreement: known && last.assign ? agreement(last.assign, data.groups, k) : null });
  }, [steps, best, data.groups, k, init]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplayOnChange: false });
  const step = steps[player.frame?.step ?? 0];

  const voronoi = useMemo(() => {
    if (!step || step.phase === 'init') return null;
    const cs = step.centroids;
    return (x: number, y: number) => ({ tone: CLUSTER_TONES[nearest([x, y], cs)], intensity: VORONOI_TINT });
  }, [step]);

  const load = (id: PresetId) => {
    const next = loadData(id);
    setData(next);
    setK(next.base.k);
    setScaled(false);
    setMethod(next.base.fixedStart ? 'fixed' : 'plusplus');
  };
  const edit = (points: P[], groups: number[]) => setData({ ...data, points, groups });
  const removeNear = (at: Point) => {
    if (!data.points.length) return;
    let i = 0;
    data.points.forEach((q, j) => { if (sqDist(q, at) < sqDist(data.points[i], at)) i = j; });
    edit(data.points.filter((_, j) => j !== i), data.groups.filter((_, j) => j !== i));
  };
  const add = (at: Point) => {
    if (data.points.length < MAX_POINTS) edit([...data.points, [at[0], at[1]]], [...data.groups, -1]);
  };
  const click = (at: Point) => {
    setCursor(at);
    if (scaled) return;
    const r = (box.x[1] - box.x[0]) * REMOVE_RADIUS;
    const hit = data.points.some((q) => sqDist(q, at) <= r * r);
    if (hit) removeNear(at);
    else add(at);
  };

  const halfSteps = steps.filter((s) => s.inertia !== null);
  const upTo = halfSteps.filter((s) => steps.indexOf(s) <= (player.frame?.step ?? 0));
  const inertiaPts = halfSteps.map((s, i) => [i + 1, s.inertia!] as const);
  const curveY = view === 'elbow' ? curve.map((c) => [c.k, c.inertia] as const) : curve.filter((c) => c.silhouette !== null).map((c) => [c.k, c.silhouette!] as const);
  const bestSil = curve.filter((c) => c.silhouette !== null).reduce<null | { k: number; s: number }>((b, c) => (!b || c.silhouette! > b.s ? { k: c.k, s: c.silhouette! } : b), null);
  const marked = view === 'elbow' ? bend : bestSil?.k ?? null;
  const unit = scaled ? ' (z-score)' : '';

  return (
    <StageFrame
      player={frames.length ? player : undefined}
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label="k" value={k} />
          <Stat label="Phase" value={step ? step.phase : '–'} color="var(--hi)" sub={step ? `iteration ${step.iteration}` : undefined} />
          <Stat label="Inertia" value={step?.inertia != null ? num(step.inertia) : '–'} sub={best ? `best of ${RESTARTS}: ${num(best.inertia)}` : undefined} />
          <Stat label="Points" value={data.points.length} sub={scaled ? 'standardised' : 'raw units'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'not assigned yet', shape: 'dot' },
            { color: 'var(--info)', label: 'clusters: one colour each (faint cells: nearest-centroid regions)', shape: 'dot' },
            { color: 'var(--hi)', label: 'ring: centroid moving; elbow/best k; current step', shape: 'line' },
            { color: 'var(--muted)', label: 'cursor (hollow)', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          <Slider label="k" value={k} min={1} max={MAX_K} onChange={setK} />
          <Segmented
            label="Start"
            value={init}
            onChange={setMethod}
            options={[
              { value: 'random', label: 'Random' },
              { value: 'plusplus', label: 'k-means++' },
              ...(fixedOk ? [{ value: 'fixed' as const, label: 'Preset start' }] : []),
            ]}
          />
          <Button onClick={() => setSeed(seed + RESTARTS)} disabled={init === 'fixed'}>New random start</Button>
          <Toggle label="Features" value={scaled} onChange={setScaled} off="Raw" on="Standardised" />
        </>,
        <ControlGroup key="presets" label="Presets">
          {PRESET_IDS.map((id) => (
            <ChipButton key={id} tone="info" on={p.id === id && !edited} onClick={() => load(id)}>{PRESET_LABELS[id]}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Button onClick={() => add(cur)} disabled={scaled || data.points.length >= MAX_POINTS}>Add point at cursor</Button>
          <Button onClick={() => removeNear(cur)} disabled={scaled || !data.points.length}>Remove nearest point</Button>
          <Hint>
            {scaled
              ? 'Editing is off while the features are standardised (a new point would shift every z-score).'
              : 'Click the plot to add a point, or click a point to remove it. Keyboard: move the hollow cursor with the arrow keys, then use the buttons.'}
          </Hint>
        </>,
      ]}
    >
      <div className="stage-pad km-row">
        <Plot2D
          x={{ domain: box.x, label: `x${unit}` }}
          y={{ domain: box.y, label: `y${scaled ? '' : p.yUnits ? ` (${p.yUnits})` : ''}${unit}` }}
          width={PLOT_W}
          height={PLOT_H}
          className="km-plot"
          ariaLabel={`${space.length} points, k = ${k}, ${step ? `${step.phase} step` : 'not run'}`}
        >
          {voronoi && <Heat fn={voronoi} resolution={72} />}
          <ClickCatcher onClick={click} />
          <Points data={space.map((q, i) => ({ x: q[0], y: q[1], tone: step?.assign ? CLUSTER_TONES[step.assign[i]] : 'dim' }))} r={3.6} />
          {step && <Centroids centroids={step.centroids} moving={step.phase === 'update'} />}
          <Points data={[{ x: cur[0], y: cur[1], tone: 'muted', hollow: true }]} r={5} onDrag={(_, q) => setCursor(q)} pointLabel={() => 'Edit cursor'} />
        </Plot2D>
        <div className="km-side">
          {!enough && <p className="km-refusal" role="alert">Need at least {k} points for k = {k}: there are {space.length}.</p>}
          <Box className="km-box">
            <SectionTitle hint="after every half-step">Inertia</SectionTitle>
            <Plot2D x={{ domain: [1, Math.max(2, inertiaPts.length)], label: 'half-step' }} y={{ domain: [0, Math.max(1e-9, ...inertiaPts.map((q) => q[1]))], label: 'inertia' }} width={PLOT_W} height={SMALL_H} ariaLabel="Inertia after each assign and update step">
              <Curve points={inertiaPts} tone="muted" />
              <Points data={upTo.map((s) => ({ x: halfSteps.indexOf(s) + 1, y: s.inertia!, tone: s === step ? 'hi' : 'muted' }))} r={3.2} />
            </Plot2D>
          </Box>
          <Box className="km-box">
            <SectionTitle hint={`best of ${RESTARTS} restarts per k`}>{view === 'elbow' ? 'Elbow' : 'Silhouette'}</SectionTitle>
            <Segmented ariaLabel="Curve" value={view} onChange={setView} options={[{ value: 'elbow', label: 'Inertia by k' }, { value: 'silhouette', label: 'Silhouette by k' }]} />
            <Plot2D
              x={{ domain: [1, ELBOW_MAX_K], label: 'k', tickValues: [1, 2, 3, 4, 5, 6, 7, 8] }}
              y={view === 'elbow' ? { domain: [0, Math.max(1e-9, ...curve.map((c) => c.inertia))], label: 'inertia' } : { domain: [-0.2, 1], label: 'silhouette' }}
              width={PLOT_W}
              height={SMALL_H}
              ariaLabel={view === 'elbow' ? `Inertia by k; the bend is at k = ${bend ?? 'none'}` : `Mean silhouette by k; highest at k = ${bestSil?.k ?? 'none'}`}
            >
              <VLine at={k} tone="dim" label={`your k = ${k}`} />
              {marked !== null && <VLine at={marked} tone="hi" />}
              <Curve points={curveY} tone="muted" />
              <Points data={curveY.map(([x, y]) => ({ x, y, tone: x === marked ? 'hi' : 'muted' }))} r={3.4} />
            </Plot2D>
            <Hint block>
              {view === 'elbow'
                ? bend === null ? 'No clear bend in this curve.' : `The bend is at k = ${bend}. It's a heuristic, not an answer: inertia always falls as k grows, so the "right" k is a judgement.`
                : bestSil ? `Highest mean silhouette at k = ${bestSil.k} (${num(bestSil.s)}): points sit closer to their own cluster than to the next. Also a heuristic.` : 'Silhouette needs k ≥ 2.'}
            </Hint>
          </Box>
        </div>
        <Hint block className="km-honest">
          Seeded synthetic points. k-means' result depends on the starting centroids; that's real, not a bug in the demo.
        </Hint>
      </div>
    </StageFrame>
  );
}
