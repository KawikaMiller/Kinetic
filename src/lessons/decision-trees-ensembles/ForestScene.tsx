import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfusionMatrix } from '../../components/ConfusionMatrix';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { DataControls, DataPlot, PLOT_H, SceneLegend, type Editor } from './DataPlot';
import { forestCaption } from './frames';
import { CLASS_TONE, regionOf } from './view';
import {
  DOMAIN, MAX_TREES, VARIANCE_SEEDS, accuracy, confusion, growForest, leavesAt, predictForest, seedSpread, votesFor,
  type Dataset, type Tree,
} from './model';

const START_TREES = 9;
const FIRST_SEED = 1;
/** The vote map's tint: a unanimous vote is this strong, a 50/50 split fades out. */
const VOTE_TINT = 0.42;
const THUMB_W = 120;
const THUMB_H = 80;

/** Odd tree counts only (1, 3, … 25), so a two-class vote can never tie. */
const toTrees = (i: number) => 2 * i + 1;

export function ForestScene({ picker, data, editor }: { picker: ReactNode; data: Dataset; editor: Editor }) {
  const [slot, setSlot] = useState((START_TREES - 1) / 2);
  const [seed, setSeed] = useState(FIRST_SEED);
  const setCaption = useSetCaption();
  const n = toTrees(slot);
  const trees = useMemo(() => growForest(data.train, n, seed), [data.train, n, seed]);
  const one = useMemo(() => seedSpread(data.train, data.val, 1, seed), [data.train, data.val, seed]);
  const many = useMemo(() => seedSpread(data.train, data.val, n, seed), [data.train, data.val, n, seed]);
  const predict = (p: { x: number; y: number }) => predictForest(trees, p);
  const valAcc = accuracy(predict, data.val);
  const region = useMemo(
    () => (x: number, y: number) => {
      const share = votesFor(trees, { x, y }) / trees.length;
      return regionOf(share > 0.5 ? 1 : 0, VOTE_TINT * Math.abs(share - 0.5) * 2);
    },
    [trees],
  );

  useEffect(() => {
    setCaption(forestCaption(n, valAcc, one, many));
  }, [n, valAcc, one, many, setCaption]);

  return (
    <StageFrame
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label="Trees" value={n} sub={`seeds ${seed}–${seed + VARIANCE_SEEDS - 1}`} />
          <Stat label="Forest validation" value={pct(valAcc)} />
          <Stat label="One bagged tree: plane changed by reseeding" value={pct(one.disagreement)} sub={spreadText(one.accuracies)} />
          <Stat label={`${n} trees: plane changed by reseeding`} value={pct(many.disagreement)} color={many.disagreement < one.disagreement ? 'var(--ok)' : undefined} sub={spreadText(many.accuracies)} />
        </Stats>
      }
      legend={<SceneLegend extra={[{ color: 'var(--dim)', label: 'thumbnail frames: each member tree', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Trees" value={slot} min={0} max={(MAX_TREES - 1) / 2} format={(i) => String(toTrees(i))} onChange={setSlot} />
          <Button onClick={() => setSeed(seed + VARIANCE_SEEDS)}>New seeds</Button>
        </>,
        <DataControls key="data" editor={editor} />,
      ]}
    >
      <div className="stage-pad dte-row">
        <DataPlot data={data} region={region} predict={predict} editor={editor} ariaLabel={`Vote map of ${n} trees: stronger tint means a more unanimous vote`} />
        <div className="dte-side">
          <Box className="dte-forest">
            <SectionTitle hint="each on its own bootstrap sample">Member trees</SectionTitle>
            <div className="dte-thumbs">
              {trees.map((t, i) => <Thumb key={i} tree={t} index={i} />)}
            </div>
          </Box>
          <Hint block>
            Each tree is grown until its leaves are pure, on {data.train.length} points drawn with replacement from the training set, looking at one random feature per split.
            &quot;Plane changed by reseeding&quot; is the share of the plot whose answer flips between consecutive seeds, averaged over {VARIANCE_SEEDS} seeds; the range under it
            is validation accuracy across those seeds.
          </Hint>
        </div>
        <div className="dte-foot">
          <Box className="dte-confusion">
            <SectionTitle hint="positive = violet">Validation set, whole forest</SectionTitle>
            <ConfusionMatrix {...confusion(predict, data.val)} labels={{ positive: 'violet', negative: 'blue' }} />
          </Box>
          <Hint block>Seeded synthetic data; trees, forest and boosting are computed live in your browser.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}

const spreadText = (accs: readonly number[]) => `validation ${pct(Math.min(...accs))}–${pct(Math.max(...accs))}`;

/** One member tree's regions, drawn exactly: its leaves are rectangles. */
function Thumb({ tree, index }: { tree: Tree; index: number }) {
  const sx = (x: number) => ((x - DOMAIN.x[0]) / (DOMAIN.x[1] - DOMAIN.x[0])) * THUMB_W;
  const sy = (y: number) => THUMB_H - ((y - DOMAIN.y[0]) / (DOMAIN.y[1] - DOMAIN.y[0])) * THUMB_H;
  return (
    <svg className="dte-thumb" viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} role="img" aria-label={`Tree ${index + 1}: ${leavesAt(tree, Infinity).length} leaves`}>
      {leavesAt(tree, Infinity).map((l) => (
        <rect key={l.id} className={`dte-thumb-leaf tone-${CLASS_TONE[l.prediction]}`} x={sx(l.bounds.x0)} y={sy(l.bounds.y1)} width={sx(l.bounds.x1) - sx(l.bounds.x0)} height={sy(l.bounds.y0) - sy(l.bounds.y1)} />
      ))}
      <rect className="dte-thumb-frame" x={0.5} y={0.5} width={THUMB_W - 1} height={THUMB_H - 1} />
    </svg>
  );
}
