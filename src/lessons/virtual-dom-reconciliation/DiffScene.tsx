import { motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark, type TreeShape } from '../../components/TreeSvg';
import { Legend, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import type { TreeKey } from '../../core/treeLayout';
import { usePlayer } from '../../core/usePlayer';
import { describePatch, diffFrames, nodeStatuses, nodeSummary, PATCH_TONE, vAt, type NodeStatus } from './frames';
import { applyPatches, countsOf, patchTarget, type DomNode, type Patch, type Scenario, type Step, type VNode } from './model';

const TREE_W = 440;
const TREE_H = 150;
const TREE_MIN = 360;
const NODE_W = 64;
const NODE_H = 44;
const TEXT_CHARS = 8;

const STATUS_TONE = { ...PATCH_TONE, same: 'dim' } as const satisfies Record<NodeStatus, string>;
const clip = (s: string) => (s.length > TEXT_CHARS ? `${s.slice(0, TEXT_CHARS - 1)}…` : s);

function NodeBox({ type, text, cls, id, keyText }: { type: string; text: string; cls: string; id?: number; keyText?: string }) {
  return (
    <>
      <rect className="vd-node-box" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={8} />
      <text className="vd-node-type" y={-8} textAnchor="middle">{type}</text>
      <text className="vd-node-text" y={6} textAnchor="middle">{clip(text)}</text>
      <text className="vd-node-sub" y={17} textAnchor="middle">{cls ? `.${clip(cls)}` : ''}</text>
      {id !== undefined && <text className="vd-node-id" x={NODE_W / 2} y={-NODE_H / 2 - 5} textAnchor="end">#{id}</text>}
      {keyText !== undefined && <text className="vd-node-key" y={NODE_H / 2 + 13} textAnchor="middle">key {keyText}</text>}
    </>
  );
}

const describeVTree = (v: VNode): string => `${v.type}${v.text ? ` “${v.text}”` : ''}${v.children.length ? ` with ${v.children.map(describeVTree).join(', ')}` : ''}`;

function treeMark(current: boolean, status: NodeStatus | undefined): TreeNodeMark | null {
  if (current) return { tone: 'hi', fill: 'solid' };
  return status ? { tone: STATUS_TONE[status], fill: 'tint' } : null;
}

/** A virtual tree, old or new, with its nodes coloured by what the diff has done to them so far. */
function VirtualTree<K extends TreeKey>({ title, hint, shape, render, mark, ariaLabel }: {
  title: string;
  hint: string;
  shape: TreeShape<K>;
  render: (id: K) => ReactNode;
  mark: (id: K) => TreeNodeMark | null;
  ariaLabel: string;
}) {
  return (
    <div className="vd-pane">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      <WideRegion minWidth={TREE_MIN} label={`${title}: scroll sideways to see all of it`}>
        <TreeSvg
          shape={shape}
          layout="tidy"
          width={TREE_W}
          height={TREE_H}
          pad={NODE_W / 2 + 6}
          top={34}
          levelGap={70}
          className="vd-tree"
          nodeClass={() => 'vd-node'}
          renderNode={render}
          nodeMark={mark}
          ariaLabel={ariaLabel}
        />
      </WideRegion>
    </div>
  );
}

function DomView({ node, touched }: { node: DomNode; touched: ReadonlyMap<number, Patch['op']> }) {
  const op = touched.get(node.id);
  return (
    <motion.div layout="position" className="vd-dom-node" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={`vd-dom-line ${op ? `is-touched tone-${PATCH_TONE[op]}` : ''}`}>
        <code>&lt;{node.type}{node.cls ? ` class="${node.cls}"` : ''}&gt;</code> <i>#{node.id}</i>
        {node.text && <span> {node.text}</span>}
      </div>
      {node.children.length > 0 && (
        <div className="vd-dom-kids">
          {node.children.map((c) => (
            <DomView key={c.id} node={c} touched={touched} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

const findById = (n: DomNode, id: number): DomNode | undefined => (n.id === id ? n : n.children.map((c) => findById(c, id)).find(Boolean));

export function DiffScene({ scenario, intro, controls, extra, keyed, height }: {
  scenario: Scenario;
  intro: ReactNode;
  controls: ReactNode[];
  extra?: ReactNode;
  keyed: boolean;
  height: number;
}) {
  const frames = useMemo(() => diffFrames(scenario, intro), [scenario, intro]);
  const player = usePlayer(frames, { interval: 1500 });
  const { shown } = player.frame;
  const { steps } = scenario.result;
  const done = steps.slice(0, shown);
  const patches = done.flatMap((s) => s.patches);
  const cursor: Step | null = shown > 0 && !player.frame.done ? steps[shown - 1] : null;
  const dom = useMemo(() => applyPatches(scenario.old, scenario.result.steps.slice(0, shown).flatMap((st) => st.patches)), [scenario, shown]);
  const counts = countsOf({ steps: done, patches });
  const status = useMemo(() => nodeStatuses(scenario, shown), [scenario, shown]);
  const touched = new Map<number, Patch['op']>((cursor?.patches ?? []).map((p) => [patchTarget(p), p.op]));
  const allNodes = useMemo(() => new Map(steps.flatMap((s) => s.patches).flatMap((p) => (p.op === 'insert' || p.op === 'replace' ? [[p.node.id, p.node] as const] : []))), [steps]);
  const builtName = (id: number) => (allNodes.get(id) ? nodeSummary(allNodes.get(id)!) : `#${id}`);
  const nowCount = cursor?.patches.length ?? 0;

  const oldShape: TreeShape<number> = { root: scenario.old.id, children: (id) => findById(scenario.old, id)!.children.map((c) => c.id) };
  const nextShape: TreeShape<string> = { root: '0', children: (path) => vAt(scenario.next, path).children.map((_, i) => `${path}.${i}`) };

  return (
    <StageFrame
      player={player}
      height={height}
      controls={controls}
      stats={
        <Stats>
          <Stat label="DOM calls" value={counts.ops} color={counts.ops ? 'var(--info)' : 'var(--muted)'} sub="one per patch" />
          <Stat label="Nodes built" value={counts.built} color={counts.built ? 'var(--ok)' : 'var(--muted)'} />
          <Stat label="Pairs compared" value={counts.compared} sub={`of ${countsOf(scenario.result).compared}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'compared now' },
            { color: 'var(--info)', label: 'update' },
            { color: 'var(--ok)', label: 'insert' },
            { color: 'var(--orange)', label: 'replace' },
            { color: 'var(--violet)', label: 'move' },
            { color: 'var(--bad)', label: 'remove' },
            { color: 'var(--dim)', label: 'unchanged' },
          ]}
        />
      }
    >
      <div className="vd stage-pad">
        <div className="vd-trees">
          <VirtualTree
            title="Old virtual tree"
            hint="what is on screen"
            shape={oldShape}
            render={(id: number) => {
              const n = findById(scenario.old, id)!;
              return <NodeBox type={n.type} text={n.text} cls={n.cls} id={n.id} keyText={keyed ? n.key : undefined} />;
            }}
            mark={(id: number) => treeMark(cursor?.oldId === id, status.old.get(id))}
            ariaLabel={`Old virtual tree: ${describeVTree(stripOld(scenario.old))}`}
          />
          <VirtualTree
            title="New virtual tree"
            hint="what the render returned"
            shape={nextShape}
            render={(path: string) => {
              const v = vAt(scenario.next, path);
              return <NodeBox type={v.type} text={v.text} cls={v.cls} keyText={keyed ? v.key : undefined} />;
            }}
            mark={(path: string) => treeMark(cursor?.newPath === path, status.next.get(path))}
            ariaLabel={`New virtual tree: ${describeVTree(scenario.next)}`}
          />
        </div>
        <div className="vd-lower">
          <Box className="vd-dom" role="region" aria-label="Real DOM model">
            <SectionTitle hint="a model, patched in order">Real DOM</SectionTitle>
            <DomView node={dom} touched={touched} />
          </Box>
          <Box className="vd-log" role="region" aria-label="Patch log">
            <SectionTitle hint={`${patches.length} of ${scenario.result.patches.length}`}>Patches</SectionTitle>
            {patches.length === 0 && (
              <p className="empty-note">{player.frame.done ? 'no patches: nothing needed to change' : shown ? 'nothing patched so far' : 'nothing patched yet'}</p>
            )}
            {patches.map((p, i) => (
              <div key={i} className={`log-row tone-${PATCH_TONE[p.op]} ${i >= patches.length - nowCount ? 'is-now' : ''}`}>
                {describePatch(p, builtName)}
              </div>
            ))}
          </Box>
        </div>
        {extra}
        <p className="vd-honest">The diff is a teaching reconciler that follows the rules React documents; the DOM is a model. The list in "Real React" is the real thing.</p>
      </div>
    </StageFrame>
  );
}

/** The old tree as a plain virtual tree, for its screen-reader name. */
const stripOld = (d: DomNode): VNode => ({ type: d.type, text: d.text, cls: d.cls, children: d.children.map(stripOld) });
