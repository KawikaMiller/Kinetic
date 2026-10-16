import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Curve, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { pctText } from '../../core/format';
import { useSimulation } from '../../core/useSimulation';
import { CLASS_NAME } from './barsData';
import { ImageGrid, MapGrid } from './MapGrid';
import { galleryCaption, learnCaption, parameterSentence } from './captions';
import { paintCell, presetImage } from './convolve';
import {
  EPOCHS_PER_FRAME, GALLERY_EPOCHS, GALLERY_SEEDS, IMAGE_SIZE, KERNEL_COUNTS, LEARNED_AT, NOISE, TRAIN_COUNT, applyLearned, createLearnRun, learnedShare, trainGallery,
  type GalleryEntry, type LearnConfig,
} from './learn';
import { learnOpening } from './openings';

const MAX_EPOCHS = 600;
type CurveKind = 'loss' | 'accuracy';
const CURVES: { value: CurveKind; label: string }[] = [{ value: 'loss', label: 'Loss' }, { value: 'accuracy', label: 'Accuracy' }];

interface Snap {
  epoch: number;
  loss: number;
  trainAccuracy: number;
  heldOut: number;
  kernels: number[][][];
  lossHistory: number[];
  accuracyHistory: number[];
  maps: number[][][];
  p: number;
}

export function LearnScene({ picker }: { picker: ReactNode }) {
  const open = learnOpening();
  const [config, setConfig] = useState<LearnConfig>(open.config);
  const [image, setImage] = useState(open.image);
  const [curve, setCurve] = useState<CurveKind>('loss');
  const [gallery, setGallery] = useState<GalleryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const imageRef = useRef(image);

  const sim = useSimulation<{ run: ReturnType<typeof createLearnRun> }, Snap>({
    create: () => ({ run: createLearnRun(learnOpening().config) }),
    step: ({ run }) => {
      if (run.epoch < MAX_EPOCHS) run.advance(EPOCHS_PER_FRAME);
    },
    snapshot: ({ run }) => {
      const applied = applyLearned(run.net, imageRef.current);
      return {
        epoch: run.epoch,
        loss: run.lossHistory[run.lossHistory.length - 1],
        trainAccuracy: run.trainAccuracy[run.trainAccuracy.length - 1],
        heldOut: run.heldOut(),
        kernels: run.kernels(),
        lossHistory: run.lossHistory.slice(),
        accuracyHistory: run.trainAccuracy.slice(),
        maps: applied.maps,
        p: applied.p,
      };
    },
    snapshotEvery: 0.1,
    initiallyPaused: true,
  });
  const snap = sim.snap;
  const { paused, setPaused } = sim;
  const ended = snap !== null && snap.epoch >= MAX_EPOCHS;
  useEffect(() => {
    if (ended && !paused) setPaused(true);
  }, [ended, paused, setPaused]);
  useEffect(() => {
    imageRef.current = image;
    sim.refresh();
    // refresh reads the image through the ref; it only needs to run when the image changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const restart = (next: LearnConfig) => {
    setConfig(next);
    sim.world().run = createLearnRun(next);
    setPaused(true);
    sim.refresh();
    setGallery(null);
  };

  const history = useMemo(() => (snap ? (curve === 'loss' ? snap.lossHistory : snap.accuracyHistory).map((v, i) => [i, v] as [number, number]) : []), [snap, curve]);
  const trainGalleryNow = () => {
    setBusy(true);
    setTimeout(() => {
      setGallery(trainGallery(config.kernels, config.seed));
      setBusy(false);
    }, 0);
  };

  if (!snap) return null;
  const learned = gallery ? learnedShare(gallery) : 0;
  const lossTop = Math.max(1, ...snap.lossHistory);
  const applyView = snap.p > 0.5 ? CLASS_NAME[1] : CLASS_NAME[0];

  return (
    <StageFrame
      height={560}
      intro={gallery ? galleryCaption(gallery, learned) : learnCaption({ epoch: snap.epoch, loss: snap.loss, trainAccuracy: snap.trainAccuracy, heldOut: snap.heldOut, kernels: config.kernels })}
      introKey={[snap.epoch, gallery, config]}
      stats={
        <Stats>
          <Stat label="Epoch" value={snap.epoch} sub={`${TRAIN_COUNT} noisy training images`} />
          <Stat label="Held-out accuracy" value={pctText(snap.heldOut, 0)} color={snap.heldOut >= LEARNED_AT ? 'var(--ok)' : undefined} sub={`200 unseen images, noise ${NOISE}`} />
          <Stat label="Loss" value={snap.loss.toFixed(3)} sub={`starts at ${snap.lossHistory[0].toFixed(3)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'learned kernel entries (green positive, red negative: a sign)', shape: 'square' },
            { color: 'var(--info)', label: 'training curve', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Kernels" options={KERNEL_COUNTS.map((k) => ({ value: k, label: String(k) }))} value={config.kernels} onChange={(kernels) => restart({ ...config, kernels })} />
          <SeedField seed={config.seed} onSeed={(seed) => restart({ ...config, seed })} />
        </>,
        <>
          <Button variant="primary" onClick={sim.togglePause}>{paused ? '▶ Train' : '❚❚ Pause'}</Button>
          <Button onClick={() => { sim.world().run.advance(10); sim.refresh(); }}>Step 10</Button>
          <Button onClick={() => restart(config)}>Reset</Button>
          <Button onClick={trainGalleryNow} softDisabled={busy}>{busy ? 'Training 8 seeds…' : `Train ${GALLERY_SEEDS} seeds`}</Button>
          <ControlGroup label="Your image" inline>
            <ChipButton tone="muted" onClick={() => setImage(presetImage('vbar'))}>vertical bar</ChipButton>
            <ChipButton tone="muted" onClick={() => setImage(presetImage('hbar'))}>horizontal bar</ChipButton>
            <ChipButton tone="muted" onClick={() => setImage(presetImage('diagonal'))}>diagonal</ChipButton>
          </ControlGroup>
        </>,
      ]}
    >
      <div className="cn-stage stage-pad">
        <div className="cn-row">
          <figure className="cn-figure">
            <figcaption>Learned {config.kernels === 1 ? 'kernel' : 'kernels'} (3 x 3)</figcaption>
            <div className="cn-kernels">
              {snap.kernels.map((k, i) => (
                <MapGrid key={i} map={k} size="md" digits={2} ariaLabel={`Learned kernel ${i + 1}`} />
              ))}
            </div>
          </figure>
          <figure className="cn-figure">
            <figcaption>
              <Segmented ariaLabel="Curve" options={CURVES} value={curve} onChange={setCurve} />
            </figcaption>
            <Plot2D
              x={{ domain: [0, Math.max(50, snap.epoch)], label: 'epoch', ticks: 4 }}
              y={{ domain: curve === 'loss' ? [0, lossTop] : [0, 1], label: curve, ticks: 4, format: curve === 'accuracy' ? (v) => pctText(v, 0) : undefined }}
              width={300}
              height={190}
              ariaLabel={`Training ${curve} against epoch`}
            >
              <Curve points={history} tone="info" />
            </Plot2D>
          </figure>
          <figure className="cn-figure">
            <figcaption>Your image: click to paint</figcaption>
            <ImageGrid image={image} size="sm" ariaLabel="Your image: click a cell to paint it" onPaint={(y, x) => setImage((im) => paintCell(im, y, x))} />
            <Hint tone="muted">
              The net says <b>{pctText(snap.p > 0.5 ? snap.p : 1 - snap.p, 0)}</b> {applyView}. A toy: it only ever saw single bars.
            </Hint>
          </figure>
        </div>
        <p className="cn-readout">{parameterSentence(config.kernels, IMAGE_SIZE)}</p>
        {gallery && (
          <div className="cn-gallery" aria-label="Kernels learned from different seeds">
            {gallery.map((g) => (
              <figure key={g.seed} className="cn-figure">
                <figcaption>
                  seed {g.seed}: <b className={g.heldOut >= LEARNED_AT ? 'cn-good' : 'cn-poor'}>{pctText(g.heldOut, 0)}</b>
                </figcaption>
                {g.kernels.map((k, i) => (
                  <MapGrid key={i} map={k} size="sm" digits={1} ariaLabel={`Seed ${g.seed} kernel ${i + 1}`} />
                ))}
              </figure>
            ))}
          </div>
        )}
        <ProvenanceRow>
          <Provenance kind="toy" seed={config.seed}>{config.kernels} kernel{config.kernels === 1 ? '' : 's'}, 8 x 8 images, trained here with core/nn; held-out images use another data seed</Provenance>
          <Provenance kind="simulated">the gallery trains {GALLERY_SEEDS} seeds for {GALLERY_EPOCHS} epochs each, then reports held-out accuracy</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
