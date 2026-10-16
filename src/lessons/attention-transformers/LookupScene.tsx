import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { decimal, pctText, sig } from '../../core/format';
import { lookupCaption } from './captions';
import {
  EPOCHS_PER_FRAME, ITEMS, ITEM_NAMES, LEARNED_WEIGHT, MAX_EPOCHS, VALUES, blendedQuery, createLookupRun, lookup, lookupSweep, type LookupRun, type LookupSweep,
} from './lookup';
import { lookupOpening } from './openings';
import { useSimulation } from '../../core/useSimulation';

type CurveKind = 'weight' | 'loss';
const CURVES: { value: CurveKind; label: string }[] = [{ value: 'weight', label: 'Weight on the right key' }, { value: 'loss', label: 'Loss' }];
const MIX = { min: 0, max: 1, step: 0.25 } as const;

interface Snap {
  epoch: number;
  weights: number[];
  output: number[];
  diagonal: number[][];
  loss: number[];
}

export function LookupScene({ picker }: { picker: ReactNode }) {
  const open = lookupOpening();
  const [seed, setSeed] = useState(open.seed);
  const [item, setItem] = useState(open.item);
  const [mix, setMix] = useState(open.mix);
  const [curve, setCurve] = useState<CurveKind>('weight');
  const [sweep, setSweep] = useState<LookupSweep | null>(null);
  const next = (item + 1) % ITEMS;
  const query = useMemo(() => blendedQuery(item, next, mix), [item, next, mix]);
  const queryRef = useRef(query);

  const sim = useSimulation<{ run: LookupRun }, Snap>({
    create: () => ({ run: createLookupRun(lookupOpening().seed) }),
    step: ({ run }) => run.advance(EPOCHS_PER_FRAME),
    snapshot: ({ run }) => {
      const { weights, output } = lookup(run.head, queryRef.current);
      return { epoch: run.epoch, weights, output, diagonal: run.diagonalHistory.slice(), loss: run.lossHistory.slice() };
    },
    snapshotEvery: 0.1,
    initiallyPaused: true,
  });
  const { paused, setPaused, snap } = sim;
  const ended = snap !== null && snap.epoch >= MAX_EPOCHS;
  useEffect(() => {
    if (ended && !paused) setPaused(true);
  }, [ended, paused, setPaused]);
  useEffect(() => {
    queryRef.current = query;
    sim.refresh();
    // refresh reads the query through the ref; it only needs to run when the query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const restart = (nextSeed: number) => {
    setSeed(nextSeed);
    sim.world().run = createLookupRun(nextSeed);
    setPaused(true);
    sim.refresh();
    setSweep(null);
  };

  const series = useMemo(() => {
    if (!snap) return [];
    const values = curve === 'weight' ? snap.diagonal.map((d) => d[item]) : snap.loss;
    return values.map((v, i) => [i, v] as [number, number]);
  }, [snap, curve, item]);

  if (!snap) return null;
  const ownWeight = snap.diagonal[snap.epoch][item];
  const biggest = snap.weights.indexOf(Math.max(...snap.weights));
  const target = VALUES[item];
  const lossTop = Math.max(1, ...snap.loss);

  return (
    <StageFrame
      height={540}
      intro={lookupCaption({
        epoch: snap.epoch, item, weight: ownWeight, start: snap.diagonal[0][item], loss: snap.loss[snap.epoch], allLearned: snap.diagonal[snap.epoch].every((w) => w >= LEARNED_WEIGHT), blended: mix > 0,
      })}
      introKey={[snap.epoch, item, seed]}
      stats={
        <Stats>
          <Stat label="Epoch" value={snap.epoch} sub={`trains W_q and W_k only; the values are fixed`} />
          <Stat label={`Weight on key ${ITEM_NAMES[item]}${mix > 0 ? ', pure query' : ''}`} value={pctText(ownWeight, 0)} color={ownWeight >= LEARNED_WEIGHT ? 'var(--ok)' : undefined} sub={`before training ${pctText(snap.diagonal[0][item], 0)}`} />
          <Stat label="Loss" value={sig(snap.loss[snap.epoch])} sub={`starts at ${sig(snap.loss[0])}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the largest weight, when it is on the query\'s own key', shape: 'square' },
            { color: 'var(--info)', label: 'other weights, and the curve', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Query equals key" options={ITEM_NAMES.map((n, i) => ({ value: i, label: n }))} value={item} onChange={setItem} />
          <Slider label={`Blend toward ${ITEM_NAMES[next]}`} value={mix} {...MIX} format={(v) => pctText(v, 0)} onChange={setMix} />
        </>,
        <>
          <Button variant="primary" onClick={sim.togglePause}>{paused ? '▶ Train' : '❚❚ Pause'}</Button>
          <Button onClick={() => { sim.world().run.advance(10); sim.refresh(); }}>Step 10</Button>
          <Button onClick={() => restart(seed)}>Reset</Button>
          <SeedField seed={seed} onSeed={restart} />
          <Button onClick={() => setSweep(lookupSweep(seed))}>Train 20 seeds</Button>
        </>,
      ]}
    >
      <div className="at-stage stage-pad">
        <div className="at-row">
          <div className="at-bars" role="group" aria-label="Attention weight on each item for this query">
            <span className="section-title">Attention on each item</span>
            {snap.weights.map((w, i) => (
              <Bar
                key={i}
                value={w}
                max={1}
                tone={i === biggest && biggest === item && mix === 0 ? 'ok' : 'info'}
                animate={false}
                height={10}
                label={`key ${ITEM_NAMES[i]}`}
                trailing={w.toFixed(2)}
              />
            ))}
            <span className="at-readout">
              Returned value <b>({snap.output.map((v) => decimal(v, 2)).join(', ')})</b>
              {mix === 0 ? <> against item {ITEM_NAMES[item]}&apos;s value ({target.map((v) => decimal(v, 2)).join(', ')})</> : <> (a blend of {ITEM_NAMES[item]} and {ITEM_NAMES[next]}, so no single value to match)</>}.
            </span>
          </div>
          <figure className="at-figure">
            <figcaption><Segmented ariaLabel="Curve" options={CURVES} value={curve} onChange={setCurve} /></figcaption>
            <Plot2D
              x={{ domain: [0, Math.max(100, snap.epoch)], label: 'epoch', ticks: 4 }}
              y={{ domain: curve === 'weight' ? [0, 1] : [0, lossTop], label: curve === 'weight' ? 'weight' : 'loss', ticks: 4 }}
              width={320}
              height={200}
              ariaLabel={`${curve === 'weight' ? `Weight on key ${ITEM_NAMES[item]}` : 'Loss'} against epoch`}
            >
              <Curve points={series} tone="info" />
            </Plot2D>
          </figure>
        </div>
        {sweep && (
          <p className="at-note" role="status">
            <b>{sweep.learnedCount} of {sweep.seeds}</b> seeds learned the lookup within {sweep.epochs} epochs (every query puts at least {pctText(LEARNED_WEIGHT, 0)} on its own key).
          </p>
        )}
        <ProvenanceRow>
          <Provenance kind="toy" seed={seed}>four items with orthogonal keys and seeded random values; W_q and W_k trained here with core/nn, W_v unused</Provenance>
          <Provenance kind="simulated">this toy does not understand language: it learned to match a key, nothing more</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
