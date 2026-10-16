import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { pctText, sig } from '../../core/format';
import { useSimulation } from '../../core/useSimulation';
import { DataPlot } from './DataPlot';
import { trainCaption } from './captions';
import {
  CLASS_NAME, CLASS_TONE, DATASETS, DATA_SEED, DIVERGED_LOSS, EPOCHS_PER_FRAME, HIDDEN_RANGE, L2_OPTIONS, MAX_RECORDED_EPOCHS, MOMENTUM_RANGE, RATE_STOPS, STEP_EPOCHS,
  SWEEP_EPOCHS, SWEEP_SEEDS, VANISH_BELOW, trainOpening, createSweep, createTrainRun, curvePoints, trainSnapshot, datasetPoints,
  type DatasetId, type TrainConfig, type TrainRun, type TrainSnapshot,
} from './model';
import type { Activation } from '../../core/nn';

const DATASET_OPTIONS = DATASETS.map((d) => ({ value: d.id, label: d.label }));
const ACTIVATIONS: { value: Activation; label: string }[] = [
  { value: 'tanh', label: 'tanh' },
  { value: 'relu', label: 'ReLU' },
  { value: 'sigmoid', label: 'sigmoid' },
];
const LAYER_OPTIONS = [{ value: 1, label: '1 hidden layer' }, { value: 2, label: '2 hidden layers' }];
const L2_LABELS = L2_OPTIONS.map((v) => ({ value: v, label: v === 0 ? 'off' : String(v) }));
type CurveKind = 'loss' | 'accuracy';
const CURVE_OPTIONS: { value: CurveKind; label: string }[] = [{ value: 'loss', label: 'Loss' }, { value: 'accuracy', label: 'Accuracy' }];
/** Epochs a sweep advances per timer tick: a slice small enough that the page stays responsive. */
const SWEEP_SLICE = 120;
const SNAPSHOT_SECONDS = 0.1;
const PLANE_WIDTH = 330;
const CURVE_WIDTH = 330;
const CURVE_HEIGHT = 200;
const MIN_X_SPAN = 100;


interface SweepView {
  finished: number;
  solved: number;
  diverged: number;
  done: boolean;
  /** What the sweep trained: its settings, shown with the count so a later change cannot mislabel it. */
  label: string;
}

const describe = (c: TrainConfig) =>
  `${DATASETS.find((d) => d.id === c.dataset)!.label}, ${c.hidden.join('+')} ${c.activation} units, rate ${sig(c.learningRate)}, momentum ${sig(c.momentum)}`;

export function TrainScene({ picker }: { picker: ReactNode }) {
  const [config, setConfig] = useState<TrainConfig>(trainOpening().config);
  const [units, setUnits] = useState(trainOpening().units);
  const [layers, setLayers] = useState(trainOpening().layers);
  const [curve, setCurve] = useState<CurveKind>('loss');
  const [sweep, setSweep] = useState<SweepView | null>(null);
  const sweepRun = useRef<{ cancelled: boolean } | null>(null);

  const sim = useSimulation<{ run: TrainRun }, TrainSnapshot>({
    create: () => ({ run: createTrainRun(trainOpening().config) }),
    step: (world) => world.run.advance(EPOCHS_PER_FRAME),
    snapshot: (world) => trainSnapshot(world.run),
    snapshotEvery: SNAPSHOT_SECONDS,
    initiallyPaused: true,
  });
  const snap = sim.snap;
  const ended = snap !== null && (snap.divergedAt !== null || snap.epoch >= MAX_RECORDED_EPOCHS);
  const { paused, setPaused } = sim;
  useEffect(() => {
    if (ended && !paused) setPaused(true);
  }, [ended, paused, setPaused]);

  useEffect(
    () => () => {
      if (sweepRun.current) sweepRun.current.cancelled = true;
    },
    [],
  );

  const stopSweep = () => {
    if (sweepRun.current) sweepRun.current.cancelled = true;
    sweepRun.current = null;
    setSweep(null);
  };

  /** Any change of settings starts a fresh run, paused, and drops a sweep that was for the old settings. */
  const restart = (next: TrainConfig) => {
    setConfig(next);
    sim.world().run = createTrainRun(next);
    sim.setPaused(true);
    sim.refresh();
    stopSweep();
  };
  const change = (patch: Partial<TrainConfig>) => restart({ ...config, ...patch });
  const setHidden = (nextUnits: number, nextLayers: number) => {
    setUnits(nextUnits);
    setLayers(nextLayers);
    change({ hidden: Array.from({ length: nextLayers }, () => nextUnits) });
  };

  const advance = (epochs: number) => {
    sim.world().run.advance(epochs);
    sim.refresh();
  };

  const runSweep = () => {
    stopSweep();
    const handle = { cancelled: false };
    sweepRun.current = handle;
    const work = createSweep(config);
    const label = describe(config);
    const tick = () => {
      if (handle.cancelled) return;
      work.advance(SWEEP_SLICE);
      setSweep({ finished: work.finished, solved: work.solved, diverged: work.diverged, done: work.done, label });
      if (!work.done) setTimeout(tick, 0);
    };
    tick();
  };

  const points = datasetPoints(config.dataset);
  const history = curve === 'loss' ? snap?.lossHistory : snap?.accuracyHistory;
  const xMax = Math.max(MIN_X_SPAN, snap?.epoch ?? 0);
  const lossTop = Math.max(1, ...(snap?.lossHistory ?? [1]));
  const curveData = useMemo(() => (history ? curvePoints(history) : []), [history]);
  const caption = snap
    ? trainCaption({ epoch: snap.epoch, loss: snap.loss, accuracy: snap.accuracy, startLoss: snap.startLoss, divergedAt: snap.divergedAt, dead: snap.dead, hiddenUnits: snap.hiddenUnits, activation: config.activation })
    : null;

  if (!snap) return null;
  const reachedEnd = snap.epoch >= MAX_RECORDED_EPOCHS;
  const fell = snap.epoch > 0 && snap.loss < snap.startLoss;
  const lossColor = snap.epoch === 0 ? undefined : fell ? 'var(--ok)' : 'var(--bad)';
  const widest = Math.max(...snap.norms, Number.EPSILON);
  const vanishing = snap.inputToOutput < VANISH_BELOW;

  return (
    <StageFrame
      height={560}
      intro={caption}
      introKey={[snap.epoch, snap.divergedAt, snap.dead, config]}
      stats={
        <Stats>
          <Stat label="Epoch" value={snap.epoch.toLocaleString('en-US')} sub={snap.divergedAt !== null ? `diverged at epoch ${snap.divergedAt}` : `full batch of ${points.length}`} />
          <Stat label="Loss" value={snap.divergedAt !== null ? 'diverged' : sig(snap.loss)} color={snap.divergedAt !== null ? 'var(--bad)' : lossColor} sub={`starts at ${sig(snap.startLoss)}`} />
          <Stat label="Accuracy" value={pctText(snap.accuracy, 0)} sub={`${points.length - snap.wrong.filter(Boolean).length} of ${points.length} points`} />
          {config.activation === 'relu' && <Stat label="Dead ReLUs" value={`${snap.dead} of ${snap.hiddenUnits}`} color={snap.dead > 0 ? 'var(--dim)' : undefined} sub="negative on every point" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: `var(--${CLASS_TONE[0]})`, label: CLASS_NAME[0], shape: 'dot' },
            { color: `var(--${CLASS_TONE[1]})`, label: CLASS_NAME[1], shape: 'dot' },
            { color: 'var(--bad)', label: 'ring: misclassified', shape: 'dot' },
            { color: 'var(--info)', label: 'training curve', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Data" options={DATASET_OPTIONS} value={config.dataset} onChange={(dataset: DatasetId) => change({ dataset })} />
          <Segmented label="Activation" options={ACTIVATIONS} value={config.activation} onChange={(activation) => change({ activation })} />
        </>,
        <>
          <Slider label="Units per layer" value={units} {...HIDDEN_RANGE} onChange={(v) => setHidden(v, layers)} />
          <Segmented ariaLabel="Hidden layers" options={LAYER_OPTIONS} value={layers} onChange={(v) => setHidden(units, v)} />
          <Slider
            label="Learning rate"
            value={RATE_STOPS.indexOf(config.learningRate)}
            min={0}
            max={RATE_STOPS.length - 1}
            format={(i) => sig(RATE_STOPS[i])}
            onChange={(i) => change({ learningRate: RATE_STOPS[i] })}
          />
          <Slider label="Momentum" value={config.momentum} {...MOMENTUM_RANGE} format={(v) => sig(v)} onChange={(momentum) => change({ momentum })} />
          <Segmented label="L2" options={L2_LABELS} value={config.l2} onChange={(l2) => change({ l2 })} />
          <SeedField seed={config.seed} onSeed={(seed) => change({ seed })} />
        </>,
        <>
          <Button variant="primary" onClick={sim.togglePause}>{paused ? '▶ Play' : '❚❚ Pause'}</Button>
          <Button onClick={() => advance(1)}>Step 1</Button>
          <Button onClick={() => advance(STEP_EPOCHS)}>Step {STEP_EPOCHS}</Button>
          <Button onClick={() => restart(config)}>Reset</Button>
          <Button variant="primary" onClick={runSweep}>Run {SWEEP_SEEDS} seeds</Button>
        </>,
      ]}
    >
      <div className="nn-stage stage-pad">
        <div className="nn-train">
          <div className="nn-train-plane">
            <DataPlot
              points={points}
              heat={{ grid: snap.grid }}
              wrong={(p) => snap.wrong[points.indexOf(p)]}
              width={PLANE_WIDTH}
              ariaLabel={`Decision regions after ${snap.epoch} epochs: ${pctText(snap.accuracy, 0)} of ${points.length} points right`}
            />
          </div>
          <div className="nn-train-side">
            <Segmented ariaLabel="Curve" options={CURVE_OPTIONS} value={curve} onChange={setCurve} />
            <Plot2D
              x={{ domain: [0, xMax], label: 'epoch', ticks: 4 }}
              y={{ domain: curve === 'loss' ? [0, lossTop] : [0, 1], label: curve, ticks: 4, format: curve === 'accuracy' ? (v) => pctText(v, 0) : undefined }}
              width={CURVE_WIDTH}
              height={CURVE_HEIGHT}
              ariaLabel={`${curve} against epoch, ${snap.epoch} epochs run`}
            >
              <Curve points={curveData} tone="info" />
            </Plot2D>
            <div className="nn-norms" role="group" aria-label="Gradient norm per layer">
              <span className="section-title">Gradient norm per layer</span>
              {snap.norms.map((n, i) => (
                <Bar
                  key={i}
                  value={n}
                  max={widest}
                  tone="violet"
                  height={8}
                  animate={false}
                  label={i === snap.norms.length - 1 ? 'output layer' : `hidden layer ${i + 1}${i === 0 ? ' (input side)' : ''}`}
                  trailing={n.toExponential(1)}
                />
              ))}
              <span className="nn-readout">
                Input-side gradient is {sig(snap.inputToOutput)}× the output layer&apos;s{vanishing ? ': vanishing' : ''}.
              </span>
            </div>
          </div>
        </div>
        <div className="nn-sweep" role="status" aria-live="polite">
          {sweep ? (
            sweep.done ? (
              <span>
                <b>{sweep.solved} of {SWEEP_SEEDS}</b> seeds reached 100% accuracy within {SWEEP_EPOCHS} epochs{sweep.diverged > 0 ? `, ${sweep.diverged} diverged` : ''} ({sweep.label}). The others were
                stuck or too slow, not wrong forever.
              </span>
            ) : (
              <span>Running seed {sweep.finished + 1} of {SWEEP_SEEDS}: {sweep.solved} reached 100% so far.</span>
            )
          ) : (
            <span className="hint">Run {SWEEP_SEEDS} seeds trains this exact setup from {SWEEP_SEEDS} different starting weights, {SWEEP_EPOCHS} epochs each, and counts how many get every point right.</span>
          )}
        </div>
        <ProvenanceRow>
          <Provenance kind="toy" seed={config.seed}>
            toy network: {snap.hiddenUnits} hidden units, {snap.parameters} parameters, trained here in your browser on {points.length} points (data seed {DATA_SEED}); production networks have vastly more
          </Provenance>
          <Provenance kind="simulated">the boundary is computed on a 40 x 40 grid; a loss above {DIVERGED_LOSS} stops the run as diverged</Provenance>
        </ProvenanceRow>
        {reachedEnd && <span className="hint">Recording stops at {MAX_RECORDED_EPOCHS.toLocaleString('en-US')} epochs.</span>}
      </div>
    </StageFrame>
  );
}
