import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfusionMatrix } from '../../components/ConfusionMatrix';
import { Box, SectionTitle } from '../../components/Panel';
import { Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { Button, Hint, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { DataControls, DataPlot, PLOT_H, SceneLegend, type Editor } from './DataPlot';
import { CLASS_NAME, CRITERION_NAME, num, question, stopText, treeCaption } from './frames';
import { CLASS_TONE, regionOf } from './view';
import {
  FEATURE_NAME, accuracy, candidates, confusion, depthAt, growTree, isSplitAt, leavesAt, predictTree, splitLines, visibleNodes,
  type Candidate, type Criterion, type Dataset, type TreeNode,
} from './model';

const MAX_DEPTH = 8;
const MAX_MIN_SAMPLES = 20;
const REGION_TINT = 0.32;

const NODE_W = 88;
const NODE_H = 52;
const COL_W = 96;
const LEVEL_GAP = 76;
const TREE_PAD = 56;
const TREE_TOP = 34;
const MIN_TREE_W = 320;
const NODE_TEXT_PX = 11;

export function TreeScene({ picker, data, editor }: { picker: ReactNode; data: Dataset; editor: Editor }) {
  const [maxDepth, setMaxDepth] = useState(MAX_DEPTH);
  const [minSamples, setMinSamples] = useState(2);
  const [criterion, setCriterion] = useState<Criterion>('gini');
  const [steps, setSteps] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [presetSeen, setPresetSeen] = useState(editor.preset);
  const setCaption = useSetCaption();
  const opts = useMemo(() => ({ maxDepth, minSamples, criterion }), [maxDepth, minSamples, criterion]);
  const tree = useMemo(() => growTree(data.train, opts), [data.train, opts]);

  // A new preset starts again from the root.
  if (presetSeen !== editor.preset) {
    setPresetSeen(editor.preset);
    setSteps(0);
    setSelected(null);
  }
  const shown = Math.min(steps, tree.splits);
  const visible = visibleNodes(tree, shown);
  const latest = visible.find((n) => n.order === shown - 1) ?? null;
  const focus = visible.find((n) => n.id === selected) ?? latest ?? tree.nodes[0];

  useEffect(() => {
    setCaption(treeCaption(tree, shown, data, opts, MAX_DEPTH));
  }, [tree, shown, data, opts, setCaption]);

  const predict = (p: { x: number; y: number }) => predictTree(tree, p, shown);
  const region = useMemo(() => (x: number, y: number) => regionOf(predictTree(tree, { x, y }, shown), REGION_TINT), [tree, shown]);
  const lines = splitLines(tree, shown);
  const leaves = leavesAt(tree, shown).length;
  const depth = depthAt(tree, shown);
  const treeW = Math.max(MIN_TREE_W, leaves * COL_W + 2 * TREE_PAD);
  const treeH = TREE_TOP + depth * LEVEL_GAP + NODE_H + 8;
  const conf = confusion(predict, data.val);
  const regrow = () => setSteps(Number.MAX_SAFE_INTEGER);

  const nodeTone = (n: TreeNode) => (n === latest ? 'hi' : CLASS_TONE[n.prediction]);

  return (
    <StageFrame
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label="Splits" value={`${shown} of ${tree.splits}`} color="var(--hi)" />
          <Stat label="Depth" value={depth} sub={`limit ${maxDepth}`} />
          <Stat label="Training accuracy" value={pct(accuracy(predict, data.train))} sub={`${data.train.length} points`} />
          <Stat label="Validation accuracy" value={pct(accuracy(predict, data.val))} sub={`${data.val.length} hollow points`} />
        </Stats>
      }
      legend={<SceneLegend extra={[{ color: 'var(--hi)', label: 'the latest split and its node', shape: 'line' }, { color: 'var(--muted)', label: 'earlier splits', shape: 'line' }]} />}
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => setSteps(shown + 1)} disabled={shown >= tree.splits}>Split</Button>
          <Button onClick={regrow} disabled={shown >= tree.splits}>Grow all</Button>
          <Button onClick={() => setSteps(0)} disabled={shown === 0}>Back to the root</Button>
          <Toggle label="Impurity" value={criterion === 'entropy'} onChange={(e) => setCriterion(e ? 'entropy' : 'gini')} off="Gini" on="Entropy" />
        </>,
        <>
          <Slider label="Max depth" value={maxDepth} min={1} max={MAX_DEPTH} onChange={(d) => { setMaxDepth(d); regrow(); }} />
          <Slider label="Min samples to split" value={minSamples} min={2} max={MAX_MIN_SAMPLES} onChange={(m) => { setMinSamples(m); regrow(); }} />
        </>,
        <DataControls key="data" editor={editor} />,
      ]}
    >
      <div className="stage-pad dte-row">
        <DataPlot
          data={data}
          region={region}
          predict={predict}
          editor={editor}
          ariaLabel={`Training and validation points with the regions of a tree after ${shown} splits`}
        >
          <Segments segments={lines.filter((l) => l.node !== latest).map((l) => ({ from: l.from, to: l.to, tone: 'muted' }))} />
          {latest && <Segments segments={lines.filter((l) => l.node === latest).map((l) => ({ from: l.from, to: l.to, tone: 'hi' }))} />}
        </DataPlot>
        <div className="dte-side">
          <CandidateTable node={focus} shown={shown} criterion={criterion} />
        </div>
        <div className="dte-treebox">
          <WideRegion minWidth={minWidthForText(treeW, NODE_TEXT_PX, MIN_TREE_W)} label="Decision tree: scroll sideways to see all of it">
            {/* Natural size at most: a small tree must not blow up to the full width. */}
            <div className="dte-tree-wrap" style={{ maxWidth: treeW }}>
            <TreeSvg<number>
              shape={{ root: 0, children: (id) => (isSplitAt(tree.nodes[id], shown) ? [tree.nodes[id].left, tree.nodes[id].right] : []) }}
              layout="tidy"
              width={treeW}
              height={treeH}
              top={TREE_TOP}
              pad={TREE_PAD}
              levelGap={LEVEL_GAP}
              className="dte-tree"
              nodeClass={(id) => `dte-node tone-${nodeTone(tree.nodes[id])} ${id === focus.id ? 'is-focus' : ''}`}
              edgeMark={(_, child) => (tree.nodes[child].id === latest?.left || tree.nodes[child].id === latest?.right ? { tone: 'hi' } : null)}
              renderNode={(id) => <NodeBox node={tree.nodes[id]} shown={shown} criterion={criterion} />}
              onNodeClick={(id) => setSelected(id)}
              nodeAriaLabel={(id) => nodeName(tree.nodes[id], shown, criterion)}
              ariaLabel="The decision tree; click a node to list its candidate splits"
            />
            </div>
          </WideRegion>
        </div>
        <div className="dte-foot">
          <Box className="dte-confusion">
            <SectionTitle hint="positive = violet">Validation set</SectionTitle>
            <ConfusionMatrix {...conf} labels={{ positive: 'violet', negative: 'blue' }} />
          </Box>
          <Hint block>Seeded synthetic data; trees, forest and boosting are computed live in your browser. A tied leaf predicts blue.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}

function nodeName(n: TreeNode, shown: number, c: Criterion) {
  const head = isSplitAt(n, shown) ? `Asks ${question(n)}` : `Leaf predicting ${CLASS_NAME[n.prediction]}`;
  return `${head}: ${n.counts[0]} blue, ${n.counts[1]} violet, ${CRITERION_NAME[c]} ${num(n.impurity)}. Show its candidate splits.`;
}

function NodeBox({ node, shown, criterion }: { node: TreeNode; shown: number; criterion: Criterion }) {
  const split = isSplitAt(node, shown);
  return (
    <>
      <rect className="dte-node-box" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={8} />
      <text className="dte-node-q" y={-9}>{split ? question(node) : `→ ${CLASS_NAME[node.prediction]}`}</text>
      <text className="dte-node-n" y={6}>{node.counts[0]} · {node.counts[1]}</text>
      <text className="dte-node-i" y={19}>{criterion === 'gini' ? 'gini' : 'H'} {num(node.impurity)}</text>
    </>
  );
}

function CandidateTable({ node, shown, criterion }: { node: TreeNode; shown: number; criterion: Criterion }) {
  const rows: Candidate[] = [...candidates(node.samples, 0, criterion), ...candidates(node.samples, 1, criterion)]
    .sort((a, b) => a.weighted - b.weighted);
  const split = isSplitAt(node, shown);
  const willSplit = !split && node.order !== null;
  const status = split ? 'chosen' : willSplit ? 'next' : null;
  return (
    <Box className="dte-candidates">
      <SectionTitle hint={`${rows.length} thresholds, best first`}>
        Candidate splits for the {split ? <>node asking {question(node)}</> : node.id === 0 ? 'root' : 'selected leaf'}
      </SectionTitle>
      {!split && node.stop && <p className="dte-stop">Stays a leaf: {stopText(node.stop)}.</p>}
      {!split && !node.stop && <p className="dte-stop">Not split yet: when its turn comes, it asks the top row's question.</p>}
      {rows.length > 0 && (
        <div className="dte-scroll" tabIndex={0} role="region" aria-label="Candidate splits, best first">
          <table className="data-table">
            <thead>
              <tr><th scope="col">question</th><th scope="col">left</th><th scope="col">right</th><th scope="col">weighted {criterion === 'gini' ? 'Gini' : 'entropy'}</th></tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={`${c.feature}:${c.threshold}`} className={i === 0 && (split || willSplit) ? 'dte-best' : ''}>
                  <td>{FEATURE_NAME[c.feature]} ≤ {num(c.threshold)}{i === 0 && status && <span className="dte-tag"> {status}</span>}</td>
                  <td>{c.left[0]} · {c.left[1]}</td>
                  <td>{c.right[0]} · {c.right[1]}</td>
                  <td>{num(c.weighted, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  );
}
