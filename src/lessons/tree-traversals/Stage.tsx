import { useMemo, useRef, useState } from 'react';
import { CallStackPanel } from '../../components/CallStackPanel';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Button, ControlGroup, Hint, Legend, Segmented } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { ORDER_NAMES, traversalFrames } from './frames';
import { addChild, isLeaf, removeLeaf, type BTree, type Order } from './model';
import { MAX_NODES, NEW_LABELS, PRESETS, type PresetId } from './presets';
import './styles.css';

const STEP_MS = 800;
const TREE_W = 560;
const TREE_H = 330;
/** In "Remove a leaf" mode, nodes that aren't leaves fade to this. */
const LOCKED_OPACITY = 0.35;
/** Tree labels stay 8px+ on phones down to this stage width. */
const MIN_STAGE_WIDTH = 560;

const ORDERS: Order[] = ['pre', 'in', 'post', 'level'];
const USES: Record<Order, string> = {
  pre: 'copy or save a tree',
  in: 'sorted output from a BST',
  post: 'free a tree · folder sizes',
  level: 'draw a UI tree row by row',
};

type EditMode = 'off' | 'add' | 'remove';

export function Stage() {
  const [preset, setPreset] = useState<PresetId | 'custom'>('letters');
  const [tree, setTree] = useState<BTree>(PRESETS[0].tree);
  const [order, setOrder] = useState<Order>('pre');
  const [edit, setEdit] = useState<EditMode>('off');
  const treeRef = useRef<HTMLDivElement>(null);
  const frames = useMemo(() => traversalFrames(tree, order, preset), [tree, order, preset]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  const label = (id: number) => tree.nodes[id].label;
  const emitted = new Set(f.emitted);
  const waiting = new Set(order === 'level' ? f.queue : f.stack);
  const shape: TreeShape<number> = { root: tree.root, children: (id) => [tree.nodes[id].left, tree.nodes[id].right] };
  const count = Object.keys(tree.nodes).length;

  const load = (id: PresetId) => {
    setPreset(id);
    setTree(PRESETS.find((p) => p.id === id)!.tree);
  };
  const clickNode = (id: number) => {
    const used = new Set(Object.values(tree.nodes).map((n) => n.label));
    const freeLabel = [...NEW_LABELS].find((c) => !used.has(c));
    const next =
      edit === 'add'
        ? count < MAX_NODES && freeLabel
          ? addChild(tree, id, freeLabel)?.tree
          : null
        : removeLeaf(tree, id);
    if (!next) return;
    player.queueNext({ play: false }); // an edit rewinds quietly instead of autoplaying
    setPreset('custom');
    setTree(next);
    if (edit === 'remove') {
      // The removed node's button is gone; keep keyboard users in the tree by focusing its parent.
      const parent = Object.keys(tree.nodes).find((k) => tree.nodes[+k].left === id || tree.nodes[+k].right === id);
      requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-node="${parent}"]`)?.focus());
    }
  };

  return (
    <StageFrame
      minWidth={MIN_STAGE_WIDTH}
      player={player}
      height={430}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'current node', shape: 'dot' },
            { color: 'var(--violet)', label: order === 'level' ? 'in the queue' : 'on the call stack', shape: 'dot' },
            { color: 'var(--ok)', label: 'written out', shape: 'dot' },
            { color: 'var(--dim)', label: 'not visited yet', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Order" value={order} onChange={setOrder} options={ORDERS.map((o) => ({ value: o, label: ORDER_NAMES[o] }))} />
          <ControlGroup label="Tree">
            {PRESETS.map((p) => (
              <Button key={p.id} onClick={() => load(p.id)} className={preset === p.id ? 'tt-on' : ''}>
                {p.label}
              </Button>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented
            label="Click a node to"
            value={edit}
            onChange={setEdit}
            options={[
              { value: 'off', label: 'Do nothing' },
              { value: 'add', label: 'Add a child' },
              { value: 'remove', label: 'Remove a leaf' },
            ]}
          />
          <Hint>{edit === 'add' ? `fills the first empty side, up to ${MAX_NODES} nodes` : edit === 'remove' ? 'only leaves, never the root' : 'pick an edit mode to reshape the tree'}</Hint>
        </>,
      ]}
    >
      <div className="tt stage-pad">
        <div className="tt-main" ref={treeRef}>
          <TreeSvg
            shape={shape}
            layout="inorder"
            width={TREE_W}
            height={TREE_H}
            label={label}
            className="tt-tree"
            ariaLabel="Binary tree"
            onNodeClick={edit === 'off' ? undefined : clickNode}
            nodeAriaLabel={(id) =>
              edit === 'add' ? `Add a child under ${label(id)}` : isLeaf(tree, id) ? `Remove leaf ${label(id)}` : `${label(id)}, not a leaf`
            }
            nodeMark={(id) => {
              if (id === f.current && !f.rpn) return { tone: 'hi', fill: 'solid' };
              if (emitted.has(id)) return { tone: 'ok', fill: 'solid' };
              if (waiting.has(id)) return { tone: 'violet', fill: 'tint', tint: 28 };
              return { tone: 'dim', fill: 'tint' };
            }}
            edgeMark={(p, c) => (order !== 'level' && waiting.has(p) && waiting.has(c) ? { tone: 'violet' } : null)}
            nodeOpacity={(id) => (edit === 'remove' && !isLeaf(tree, id) ? LOCKED_OPACITY : 1)}
            nodeClass={(id) => {
              // pre-order writes a node while its call is still running: green fill, violet ring
              const ringed = emitted.has(id) && waiting.has(id) && id !== f.current ? 'tt-still-waiting' : '';
              return `${ringed} ${edit === 'remove' && !isLeaf(tree, id) ? 'tt-locked' : ''}`;
            }}
          />
          <Tray label="Output" labelWeight="regular" empty="nothing written yet" className="tt-tape" ariaLabel="Output">
            {f.emitted.length > 0 &&
              f.emitted.map((id, i) => (
                <span key={`${id}-${i}`} className="chip tone-ok">
                  {label(id)}
                </span>
              ))}
          </Tray>
          <div className="tt-uses">
            {ORDERS.map((o) => (
              <span key={o} className={`chip ${o === order ? 'tone-hi' : ''}`}>
                {ORDER_NAMES[o]}: {USES[o]}
              </span>
            ))}
          </div>
        </div>
        <div className="tt-side">
          {order === 'level' ? (
            <Tray label="Queue (front → back)" labelWeight="regular" empty="empty" ariaLabel="Queue">
              {f.queue.length > 0 &&
                f.queue.map((id) => (
                  <span key={id} className="chip tone-violet">
                    {label(id)}
                  </span>
                ))}
            </Tray>
          ) : (
            <CallStackPanel
              frames={[...f.stack].reverse().map((id, i) => ({ id, name: `visit(${label(id)})`, state: i === 0 ? 'running' : 'waiting', tone: 'violet' }))}
              meta={`${f.stack.length} deep`}
              minHeight={200}
              empty={<p className="empty-note">no calls running</p>}
            />
          )}
          {f.rpn && (
            <Tray label={`RPN stack after ${f.rpn.token}`} labelWeight="regular" ariaLabel="RPN stack">
              {f.rpn.stack.map((v, i) => (
                <span key={i} className="chip tone-violet">
                  {v}
                </span>
              ))}
            </Tray>
          )}
        </div>
      </div>
    </StageFrame>
  );
}
