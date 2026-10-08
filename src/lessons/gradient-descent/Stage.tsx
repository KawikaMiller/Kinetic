import { useMemo, useState } from 'react';
import { Arrow, Curve, Heat, Plot2D, PointerLayer, Points, Segments, type HeatValue } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import type { Point } from '../../core/plot';
import { usePlayer } from '../../core/usePlayer';
import { descentFrames, lossText, num, vec } from './frames';
import {
  DEFAULT_START, QUADRATIC, RATE_EXP_MAX, RATE_EXP_MIN, RATE_FACTORS, RATE_LABELS, RATE_PRESETS, RIDGE_START, SURFACES, SURFACE_IDS,
  presetRate, runDescent,
  type RatePreset, type SurfaceId, type W,
} from './model';
import './styles.css';

const SURFACE_OPTIONS = SURFACE_IDS.map((id) => ({ value: id, label: SURFACES[id].label }));
const PER_PRESS = [1, 5, 20].map((n) => ({ value: n, label: `${n}` }));

const MAP_W = 356;
/** The square map (aspect="equal") is 350 tall at MAP_W; the stage leaves room around it. */
const STAGE_H = 390;
const LOSS_H = 240;
const HEAT_RES = 72;
/** Contour bands: the map is quantised so equal-loss rings read as rings. */
const BANDS = 12;
/** The loss plot's log axis bottoms out here (a run that reaches the floor exactly would be log 0). */
const GAP_FLOOR = 1e-8;
const RATE_STEP = 0.01;
const MOMENTUM_MAX = 0.95;
const MOMENTUM_STEP = 0.05;
const FIRST_BATCH_SEED = 1;

/** Contours: dim grey up high, blue down low, in bands. */
function useContours(id: SurfaceId) {
  return useMemo(() => {
    const s = SURFACES[id];
    const [lo, hi] = s.domain;
    let top = 0;
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) top = Math.max(top, s.loss([lo + ((hi - lo) * i) / 40, lo + ((hi - lo) * j) / 40]) - s.floor);
    const scale = Math.log1p(top);
    return (x: number, y: number): HeatValue => {
      const t = Math.log1p(Math.max(0, s.loss([x, y]) - s.floor)) / scale;
      const band = Math.min(BANDS - 1, Math.floor(t * BANDS)) / (BANDS - 1);
      return band < 0.5 ? { tone: 'info', intensity: 0.75 - band * 1.2 } : { tone: 'dim', intensity: 0.3 + band * 0.7 };
    };
  }, [id]);
}

export function Stage() {
  const [surface, setSurface] = useState<SurfaceId>('bowl');
  const [start, setStart] = useState<W>(DEFAULT_START.bowl);
  const [rate, setRate] = useState(presetRate('bowl', 'justRight'));
  const [momentum, setMomentum] = useState(0);
  const [perPress, setPerPress] = useState(1);
  const [miniBatch, setMiniBatch] = useState(false);
  const [batchSeed, setBatchSeed] = useState(FIRST_BATCH_SEED);
  const [loaded, setLoaded] = useState<RatePreset | null>('justRight');
  const s = SURFACES[surface];
  const batches = surface === 'regression' && miniBatch;

  const run = useMemo(
    () => runDescent(surface, { start, rate, momentum, batchSeed: batches ? batchSeed : null }),
    [surface, start, rate, momentum, batches, batchSeed],
  );
  const frames = useMemo(() => descentFrames(run, perPress), [run, perPress]);
  const player = usePlayer(frames, { interval: 450, autoplayOnChange: false });
  const iter = player.frame.iter;
  const atEnd = player.index === frames.length - 1;
  const ball = run.points[iter];
  const step = run.steps[iter];
  const contours = useContours(surface);

  const pickSurface = (id: SurfaceId) => {
    setSurface(id);
    setStart(DEFAULT_START[id]);
    setRate(presetRate(id, 'justRight'));
    setLoaded('justRight');
  };
  const loadPreset = (p: RatePreset) => {
    setRate(presetRate(surface, p));
    setMomentum(0);
    setLoaded(p);
    player.queueNext({ play: true });
  };
  const drop = (p: Point) => setStart([p[0], p[1]]);

  const trail: Point[] = run.points.slice(0, iter + 1).map(([a, b]) => [a, b]);
  const diverged = atEnd && run.outcome.kind === 'diverged';
  const found = atEnd && run.outcome.kind === 'minimum' ? run.outcome.at : null;
  const gaps = run.losses.map((l) => Math.max(GAP_FLOOR, l - s.floor));
  const gapMax = Math.max(1, ...gaps);
  const lossNow = run.losses[iter];

  return (
    <StageFrame
      player={player}
      height={STAGE_H}
      stats={
        <Stats>
          <Stat label="Step" value={`${iter} / ${run.steps.length}`} />
          <Stat label="Loss" value={lossText(lossNow)} color={diverged ? 'var(--bad)' : 'var(--hi)'} sub={`lowest possible ${lossText(s.floor)}`} />
          <Stat
            label={<span className="keep-case">η</span>}
            value={num(rate, 4)}
            sub={momentum > 0 ? `limit 2(1+β)/λ = ${num((2 * (1 + momentum)) / s.lambdaMax, 3)}` : `limit 2/λ = ${num(2 / s.lambdaMax, 3)}`}
          />
          <Stat label={<>momentum <span className="keep-case">β</span></>} value={num(momentum, 2)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'low loss' },
            { color: 'var(--dim)', label: 'high loss' },
            { color: 'var(--hi)', label: 'ball, its trail, and the hollow start', shape: 'dot' },
            { color: 'var(--violet)', label: 'next push −η∇L', shape: 'line' },
            ...(found ? [{ color: 'var(--ok)', label: 'minimum found', shape: 'dot' as const }] : []),
            ...(diverged ? [{ color: 'var(--bad)', label: 'the step that diverged', shape: 'line' as const }] : []),
          ]}
        />
      }
      controls={[
        <Segmented key="surface" label="Surface" options={SURFACE_OPTIONS} value={surface} onChange={pickSurface} />,
        <>
          <Slider
            label="Learning rate η"
            value={Math.log10(rate)}
            min={RATE_EXP_MIN}
            max={RATE_EXP_MAX}
            step={RATE_STEP}
            format={(e) => num(10 ** e, 4)}
            onChange={(e) => {
              setRate(10 ** e);
              setLoaded(null);
            }}
          />
          <Slider label="Momentum β" value={momentum} min={0} max={MOMENTUM_MAX} step={MOMENTUM_STEP} format={(v) => num(v, 2)} onChange={(v) => {
            setMomentum(v);
            setLoaded(null);
          }} />
          <Segmented label="Steps per press" options={PER_PRESS} value={perPress} onChange={setPerPress} />
        </>,
        <ControlGroup key="presets" label={QUADRATIC[surface] ? 'Learning-rate presets (momentum off)' : 'Learning rates, as fractions of 2/λ (momentum off)'}>
          {RATE_PRESETS.map((p) => (
            <ChipButton key={p} tone="info" on={loaded === p} onClick={() => loadPreset(p)}>
              {QUADRATIC[surface] ? RATE_LABELS[p] : `${RATE_FACTORS[p]} × 2/λ`}
            </ChipButton>
          ))}
          {surface === 'saddle' && (
            <ChipButton tone="info" on={start[0] === RIDGE_START[0] && start[1] === RIDGE_START[1]} onClick={() => setStart(RIDGE_START)}>
              Start exactly on the ridge (w₂ = 0)
            </ChipButton>
          )}
        </ControlGroup>,
        ...(surface === 'regression'
          ? [
              <>
                <Toggle label="Gradient from" value={miniBatch} onChange={setMiniBatch} off="All 40 points" on="Mini-batches of 8" />
                {miniBatch && <Button onClick={() => setBatchSeed(batchSeed + 1)}>New batches (seed {batchSeed + 1})</Button>}
              </>,
            ]
          : []),
      ]}
    >
      <div className="stage-pad gd-row">
        <Plot2D
          x={{ domain: s.domain, label: s.axes[0] }}
          y={{ domain: s.domain, label: s.axes[1] }}
          width={MAP_W}
          aspect="equal"
          className="gd-plot"
          ariaLabel={`${s.label} loss map; ball at ${vec(ball, 2)}, loss ${lossText(lossNow)}`}
        >
          <Heat fn={contours} resolution={HEAT_RES} />
          <PointerLayer onDown={drop} />
          <Curve points={trail} tone="hi" width={1.25} />
          {diverged && iter > 0 && <Segments segments={[{ from: run.points[iter - 1], to: ball, tone: 'bad' }]} />}
          {step && <Arrow from={ball} to={[ball[0] - rate * step.grad[0], ball[1] - rate * step.grad[1]]} tone="violet" />}
          {found && <Points data={[{ x: found[0], y: found[1], tone: 'ok' }]} r={7} />}
          <Points data={[{ x: ball[0], y: ball[1], tone: 'hi' }]} r={5.5} />
          <Points data={[{ x: start[0], y: start[1], tone: 'hi', hollow: true }]} r={5} onDrag={(_, p) => drop(p)} pointLabel={() => 'start point'} />
        </Plot2D>
        <div className="gd-side">
          <Plot2D
            x={{ domain: [0, Math.max(10, run.steps.length)], label: 'step' }}
            y={{ domain: [GAP_FLOOR, gapMax], log: true, label: 'loss above the lowest' }}
            width={MAP_W}
            height={LOSS_H}
            className="gd-plot"
            ariaLabel={`Loss above the lowest, by step, up to step ${iter}`}
          >
            <Curve points={gaps.slice(0, iter + 1).map((g, k) => [k, g])} tone="hi" />
            <Points data={[{ x: iter, y: gaps[iter], tone: diverged ? 'bad' : 'hi' }]} r={4} />
          </Plot2D>
          <Hint block>
            Click the map (or drag the hollow start, or focus it and use the arrow keys) to drop the ball somewhere else. Presets are fractions of
            2/λ, where λ is the steepest curvature at this surface's lowest minimum: past 2/λ plain gradient descent can't settle there (with
            momentum β the limit is 2(1 + β)/λ). Their names hold on the quadratic surfaces; on Two minima and Saddle the ball can meet gentler or
            steeper curvature, so there they're shown as plain fractions.
          </Hint>
          <Hint block>Two-parameter toy losses; real models have millions of parameters. Mini-batch noise is real but seeded, so runs repeat.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}

