import type { ReactNode } from 'react';
import { pct } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  FEATURE_NAME, PERFECT_EPS, VARIANCE_SEEDS, accuracy, candidates, growTree, predictTree,
  type BoostRound, type Boosting, type Criterion, type Dataset, type SeedSpread, type StopReason, type Tree, type TreeNode, type TreeOptions,
} from './model';

/** Two decimals with a real minus sign. */
export const num = (v: number, dp = 2) => (Math.abs(v) < 0.5 * 10 ** -dp ? (0).toFixed(dp) : v.toFixed(dp).replace('-', '−'));

export const CLASS_NAME = ['blue', 'violet'] as const;
export const CRITERION_NAME: Record<Criterion, string> = { gini: 'Gini', entropy: 'entropy' };

export const question = (n: TreeNode) => `${FEATURE_NAME[n.split!.feature]} ≤ ${num(n.split!.threshold)}`;

const STOP_TEXT: Record<StopReason, string> = {
  pure: 'it is pure',
  depth: 'it hit the depth limit',
  'min-samples': 'it has fewer points than the min-samples limit',
  'no-threshold': 'its points sit on top of each other, so no threshold separates them',
};
export const stopText = (r: StopReason) => STOP_TEXT[r];

/** Validation accuracy of the fully grown tree at each depth limit 1..maxDepth (same other settings). */
export function depthCurve(data: Dataset, opts: TreeOptions, maxDepth: number) {
  return Array.from({ length: maxDepth }, (_, i) => {
    const t = growTree(data.train, { ...opts, maxDepth: i + 1 });
    return { depth: i + 1, train: accuracy((p) => predictTree(t, p), data.train), val: accuracy((p) => predictTree(t, p), data.val) };
  });
}

/** What the tree on screen says, after `steps` of its splits. */
export function treeCaption(tree: Tree, steps: number, data: Dataset, opts: TreeOptions, maxDepthOnSlider: number): ReactNode {
  const root = tree.nodes[0];
  const crit = CRITERION_NAME[opts.criterion];
  if (steps === 0) {
    if (tree.splits === 0) return <>One node with all {root.counts[0] + root.counts[1]} training points, and it can't split: {stopText(root.stop!)}.</>;
    return <>One node holding all {root.counts[0] + root.counts[1]} training points ({root.counts[0]} blue, {root.counts[1]} violet, {crit} {num(root.impurity)}).
      It predicts {CLASS_NAME[root.prediction]} for everything. Press Split to ask the first question.</>;
  }
  const train = accuracy((p) => predictTree(tree, p, steps), data.train);
  const val = accuracy((p) => predictTree(tree, p, steps), data.val);
  const scores = `Training accuracy ${pct(train)}, validation ${pct(val)}.`;
  if (steps < tree.splits) {
    const n = tree.nodes.find((x) => x.order === steps - 1)!;
    const tried = candidates(n.samples, 0, opts.criterion).length + candidates(n.samples, 1, opts.criterion).length;
    return <>Split {steps}: <span className="hl">{question(n)}</span> on a node of {n.samples.length} points ({crit} {num(n.impurity)} → weighted {num(n.split!.weighted)}),
      the lowest of the {tried} thresholds tried. {scores}</>;
  }
  const curve = depthCurve(data, opts, maxDepthOnSlider);
  const best = curve.reduce((b, c) => (c.val > b.val ? c : b));
  const depthNow = Math.max(...tree.nodes.map((n) => n.depth));
  const verdict = val >= best.val
    ? <> No depth limit from 1 to {maxDepthOnSlider} does better on validation.</>
    : best.depth > opts.maxDepth
      ? <> A deeper limit of {best.depth} scores <span className="hl ok">{pct(best.val)}</span> on validation: this tree is too shallow and underfits.</>
      : <> A shallower limit of {best.depth} scores <span className="hl ok">{pct(best.val)}</span> on validation: deeper isn't automatically better.</>;
  const sliver = tree.nodes.some((n) => n.split === null && n.counts[0] + n.counts[1] === 1)
    ? <> Some leaves hold a single training point: slivers carved around one point, often noise.</>
    : null;
  return <>Grown: {tree.splits} splits, depth {depthNow}. {scores}{verdict}{sliver}</>;
}

export function forestCaption(n: number, forestVal: number, one: SeedSpread, forest: SeedSpread): ReactNode {
  const fewer = forest.disagreement < one.disagreement;
  const same = forest.disagreement === one.disagreement;
  const head = <>{n === 1 ? 'One bagged tree' : `${n} bagged trees`}, each grown on its own bootstrap sample with a random feature per split; the vote map is their majority. Validation accuracy {pct(forestVal)}.</>;
  if (n === 1) return <>{head} With one tree the forest is just that tree: retrained on {VARIANCE_SEEDS} seeds, it changes its mind on {pct(one.disagreement)} of the plane.</>;
  return <>{head} Retrained on {VARIANCE_SEEDS} seeds, one bagged tree changes its answer on {pct(one.disagreement)} of the plane; the forest on {pct(forest.disagreement)}
    {same ? ', no steadier here.' : fewer ? <>, <span className="hl ok">steadier</span>: averaging many jumpy trees cancels much of their jumpiness.</> : ', jumpier here.'}</>;
}

export interface BoostFrame extends Frame {
  round: number;
}

export function boostFrames(b: Boosting): BoostFrame[] {
  return b.rounds.map((_, t) => ({ round: t + 1, say: boostCaption(b, t) }));
}

const trendWord = (now: number, before: number) => (now > before ? 'up' : now < before ? 'down' : 'unchanged');

function boostCaption(b: Boosting, t: number): ReactNode {
  const r: BoostRound = b.rounds[t];
  const stump = <>{FEATURE_NAME[r.stump.feature]} ≤ {num(r.stump.threshold)} → {CLASS_NAME[r.stump.below]}</>;
  const errs = <>Training error {pct(r.trainError)}{t > 0 && <> ({trendWord(r.trainError, b.rounds[t - 1].trainError)})</>}, under its bound: exponential loss
    = ∏ Zₜ = {num(r.expLoss, 3)}, which never rises.</>;
  const end = t === b.rounds.length - 1 && b.stopped
    ? b.stopped === 'perfect'
      ? <> This stump got every training point right, so boosting stops here.</>
      : <> No stump beats a coin flip on these weights, so boosting stops here.</>
    : null;
  const wobble = t > 0 && r.trainError > b.rounds[t - 1].trainError
    ? <> Training error went <span className="hl bad">up</span> this round. That's allowed: AdaBoost only promises the exponential loss never rises.</>
    : null;
  return <>Round {t + 1}: stump <span className="hl">{stump}</span>, weighted error ε = {num(r.error, 3)}, so α = ½ ln((1 − ε)/ε) = {num(r.alpha, 3)}.
    {r.error > PERFECT_EPS && <> The points it got wrong now carry half of all the weight, so they grow.</>} {errs}{wobble}{end}</>;
}
