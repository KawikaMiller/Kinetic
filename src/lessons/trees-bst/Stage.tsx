import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Stat, Stats } from '../../components/ui';
import { randInt, shuffle } from '../../core/hooks';
import { usePlayer } from '../../core/usePlayer';
import {
  build, deleteFrames, height, idleFrames, inorderFrames, insertFrames, layout, searchFrames, size,
  type BstFrame, type Tree,
} from './bst';
import './styles.css';

const START = [50, 30, 70, 20, 40, 60, 80, 35, 65];
const SORTED = [5, 12, 20, 28, 35, 43, 51, 60, 72, 88];

function pickNew(t: Tree) {
  const have = new Set(Object.values(t.nodes).map((n) => n.key));
  let v = randInt(1, 99);
  while (have.has(v)) v = randInt(1, 99);
  return v;
}

interface Run {
  tree: Tree;
  frames: BstFrame[];
}

export function Stage() {
  const [run, setRun] = useState<Run>(() => {
    const tree = build(START);
    return { tree, frames: idleFrames(tree, <>A binary search tree: every key on a node's <b>left</b> is smaller, every key on its <b>right</b> is bigger. Pick an operation.</>) };
  });
  const [value, setValue] = useState(() => pickNew(build(START)));
  const player = usePlayer(run.frames, { interval: 900 });
  const f = player.frame;
  const t = run.tree;

  const apply = (res: { frames: BstFrame[]; tree: Tree }, next?: number) => {
    setRun(res);
    if (next != null) setValue(next);
  };

  const preset = (keys: number[], say: ReactNode) => {
    const tree = build(keys);
    setRun({ tree, frames: idleFrames(tree, say) });
    player.queueNext({ play: false });
    setValue(pickNew(tree));
  };

  const n = size(f.tree);
  const h = height(f.tree);
  const ideal = n ? Math.ceil(Math.log2(n + 1)) : 0;

  return (
    <StageFrame
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Nodes" value={n} />
          <Stat label="Height" value={h} color={h > ideal + 1 ? 'var(--bad)' : 'var(--ok)'} sub={`best possible ${ideal}`} />
          <Stat label="Comparisons" value={f.comparisons} color="var(--hi)" sub="last operation" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'comparing', shape: 'dot' },
            { color: 'var(--violet)', label: 'path taken', shape: 'dot' },
            { color: 'var(--info)', label: 'successor', shape: 'dot' },
            { color: 'var(--ok)', label: 'found / placed', shape: 'dot' },
            { color: 'var(--bad)', label: 'deleting / missing', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <label className="bst-field">
            <span>Key</span>
            <input
              type="number"
              min={1}
              max={99}
              value={value}
              onChange={(e) => setValue(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            />
          </label>
          <Button variant="primary" onClick={() => { const res = insertFrames(t, value); apply(res, pickNew(res.tree)); }}>
            Insert
          </Button>
          <Button onClick={() => apply(searchFrames(t, value))}>Search</Button>
          <Button onClick={() => apply(deleteFrames(t, value))}>Delete</Button>
          <Button onClick={() => apply(inorderFrames(t))}>In-order walk</Button>
          <Button onClick={() => preset(shuffle(SORTED), <>Random insertion order: the tree comes out fairly bushy and short.</>)}>Random order</Button>
          <Button
            onClick={() =>
              preset(
                SORTED,
                <>
                  Same keys, inserted <b>already sorted</b>: every key goes right, so the "tree" is a linked list. Search the biggest key and count the comparisons.
                  Self-balancing trees (AVL, red-black) rotate nodes to stop this.
                </>,
              )
            }
          >
            Sorted order
          </Button>
          <span className="bst-hint">Tip: click a node to use its key.</span>
        </Controls>
      }
    >
      <TreeView frame={f} onPick={setValue} />
    </StageFrame>
  );
}

const W = 900;
const H = 380;

function TreeView({ frame, onPick }: { frame: BstFrame; onPick: (k: number) => void }) {
  const { pos, count, depth } = layout(frame.tree);
  const level = Math.min(70, (H - 70) / Math.max(1, depth));
  const px = (x: number) => (count <= 1 ? W / 2 : 40 + (x * (W - 80)) / (count - 1));
  const py = (d: number) => 34 + d * level;
  const nodes = Object.values(frame.tree.nodes);
  const spring = { type: 'spring', stiffness: 170, damping: 22 } as const;
  const onPath = new Set(frame.path);
  const onSucc = new Set(frame.succ);

  let ghost: { x: number; y: number; px: number; py: number } | null = null;
  if (frame.ghost && pos[frame.ghost.parent]) {
    const p = pos[frame.ghost.parent];
    ghost = { px: px(p.x), py: py(p.d), x: px(p.x) + (frame.ghost.side === 'left' ? -34 : 34), y: py(p.d) + Math.min(level, 60) };
  }

  return (
    <div className="bst">
      <svg viewBox={`0 0 ${W} ${H}`} className="bst-svg" preserveAspectRatio="xMidYMid meet">
        <AnimatePresence>
          {nodes.map((n) =>
            [n.left, n.right].map((c) => {
              if (c == null || !pos[c]) return null;
              const a = pos[n.id];
              const b = pos[c];
              const hot = onPath.has(n.id) && onPath.has(c);
              return (
                <motion.line
                  key={`${n.id}-${c}`}
                  className={`bst-edge ${hot ? 'hot' : ''} ${onSucc.has(c) ? 'succ' : ''}`}
                  initial={{ opacity: 0, x1: px(a.x), y1: py(a.d), x2: px(b.x), y2: py(b.d) }}
                  animate={{ opacity: 1, x1: px(a.x), y1: py(a.d), x2: px(b.x), y2: py(b.d) }}
                  exit={{ opacity: 0 }}
                  transition={spring}
                />
              );
            }),
          )}
        </AnimatePresence>
        {ghost && (
          <g className="bst-ghost">
            <line x1={ghost.px} y1={ghost.py} x2={ghost.x} y2={ghost.y} />
            <circle cx={ghost.x} cy={ghost.y} r={15} />
            <text x={ghost.x} y={ghost.y + 4} textAnchor="middle">
              null
            </text>
          </g>
        )}
        <AnimatePresence>
          {nodes.map((n) => {
            const p = pos[n.id];
            if (!p) return null;
            const cls =
              n.id === frame.bad ? 'bad' : n.id === frame.ok ? 'ok' : n.id === frame.hi ? 'hi' : onSucc.has(n.id) ? 'succ' : onPath.has(n.id) ? 'path' : '';
            return (
              <motion.g
                key={n.id}
                className={`bst-node ${cls}`}
                initial={{ opacity: 0, scale: 0.2, x: px(p.x), y: py(p.d) }}
                animate={{ opacity: 1, scale: n.id === frame.hi || n.id === frame.ok ? 1.15 : 1, x: px(p.x), y: py(p.d) }}
                exit={{ opacity: 0, scale: 0.2 }}
                transition={spring}
                onClick={() => onPick(n.key)}
              >
                <circle r={19} />
                <text y={5} textAnchor="middle">
                  {n.key}
                </text>
              </motion.g>
            );
          })}
        </AnimatePresence>
      </svg>
      <div className="bst-out" aria-label="In-order output">
        <span className="bst-out-label">in-order output</span>
        <AnimatePresence>
          {frame.output.map((k, i) => (
            <motion.span key={`${i}-${k}`} className="bst-chip" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {k}
            </motion.span>
          ))}
        </AnimatePresence>
        {frame.output.length === 0 && <span className="bst-out-empty">run an in-order walk to fill this</span>}
      </div>
    </div>
  );
}
