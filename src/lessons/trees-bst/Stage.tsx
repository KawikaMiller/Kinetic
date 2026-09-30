import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeEdgeMark, type TreeGeometry, type TreeNodeMark, type TreeShape } from '../../components/TreeSvg';
import { Button, Controls, Hint, Legend, Stat, Stats, TextField } from '../../components/ui';
import { clamp } from '../../core/math';
import { freshInt, shuffle } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import {
  build, deleteFrames, height, idleFrames, inorderFrames, insertFrames, searchFrames, size,
  type BstFrame, type Tree,
} from './bst';
import './styles.css';

const START = [50, 30, 70, 20, 40, 60, 80, 35, 65];
const SORTED = [5, 12, 20, 28, 35, 43, 51, 60, 72, 88];
const MIN_KEY = 1;
const MAX_KEY = 99;

/** A key that isn't in the tree yet, to suggest for the next insert. */
function pickNew(t: Tree) {
  const have = new Set(Object.values(t.nodes).map((n) => n.key));
  return freshInt(MIN_KEY, MAX_KEY, have) ?? MIN_KEY;
}

/** The key a typed value stands for: a whole number clamped to the allowed range. */
const toKey = (text: string) => clamp(Math.round(Number(text)) || MIN_KEY, MIN_KEY, MAX_KEY);

interface Run {
  tree: Tree;
  frames: BstFrame[];
}

export function Stage() {
  const [run, setRun] = useState<Run>(() => {
    const tree = build(START);
    return { tree, frames: idleFrames(tree, <>A binary search tree: every key on a node's <b>left</b> is smaller, every key on its <b>right</b> is bigger. Pick an operation.</>) };
  });
  // The field keeps exactly what's typed; it's only clamped when used or on blur, so
  // typing "45" over a cleared field isn't turned into "1", then "145", then 99.
  const [keyText, setKeyText] = useState(() => String(pickNew(build(START))));
  const value = toKey(keyText);
  const setValue = (key: number) => setKeyText(String(key));
  const player = usePlayer(run.frames, { interval: 900 });
  const f = player.frame;
  const t = run.tree;

  const apply = (res: { frames: BstFrame[]; tree: Tree }, next = value) => {
    setRun(res);
    setValue(next);
  };
  const insert = () => {
    const res = insertFrames(t, value);
    apply(res, pickNew(res.tree));
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
      minWidth={640}
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
          <TextField
            label="Key"
            type="number"
            min={MIN_KEY}
            max={MAX_KEY}
            width={84}
            value={keyText}
            onChange={setKeyText}
            onBlur={() => setValue(value)}
            onEnter={insert}
          />
          <Button variant="primary" onClick={insert}>
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
          <Hint>Tip: click a node to use its key.</Hint>
        </Controls>
      }
    >
      <TreeView frame={f} onPick={setValue} />
    </StageFrame>
  );
}

// Tree scene geometry (SVG units)
const W = 900;
const H = 380;
const SIDE_PAD = 40;
const TOP = 34;
const MAX_LEVEL_GAP = 70;
/** Room kept under the deepest level for the null ghost and labels. */
const BOTTOM_ROOM = 70;
/** Where the dashed "null" ghost child sits relative to its parent. */
const GHOST_DX = 34;
const GHOST_MAX_DY = 60;

const EMPHASIS_SCALE = 1.15;
const SUCCESSOR_TINT = 18;

function TreeView({ frame, onPick }: { frame: BstFrame; onPick: (k: number) => void }) {
  const { nodes, root } = frame.tree;
  const onPath = new Set(frame.path);
  const onSucc = new Set(frame.succ);
  const shape: TreeShape<number> = { root, children: (id) => [nodes[id].left, nodes[id].right] };

  const nodeMark = (id: number): TreeNodeMark | null => {
    if (id === frame.bad) return { tone: 'bad', fill: 'solid' };
    if (id === frame.ok) return { tone: 'ok', fill: 'solid' };
    if (id === frame.hi) return { tone: 'hi', fill: 'solid' };
    if (onSucc.has(id)) return { tone: 'info', fill: 'tint', tint: SUCCESSOR_TINT };
    if (onPath.has(id)) return { tone: 'violet', fill: 'tint' };
    return null;
  };
  const edgeMark = (parent: number, child: number): TreeEdgeMark | null => {
    if (onSucc.has(child)) return { tone: 'info', dashed: true };
    if (onPath.has(parent) && onPath.has(child)) return { tone: 'violet' };
    return null;
  };

  const ghostAt = frame.ghost;
  const ghost = ({ at, levelGap }: TreeGeometry<number>) => {
    const p = ghostAt && at(ghostAt.parent);
    if (!ghostAt || !p) return null;
    const x = p.x + (ghostAt.side === 'left' ? -GHOST_DX : GHOST_DX);
    const y = p.y + Math.min(levelGap, GHOST_MAX_DY);
    return (
      <g className="bst-ghost">
        <line x1={p.x} y1={p.y} x2={x} y2={y} />
        <circle cx={x} cy={y} r={15} />
        <text x={x} y={y + 4} textAnchor="middle">
          null
        </text>
      </g>
    );
  };

  return (
    <div className="bst">
      <TreeSvg
        shape={shape}
        layout="inorder"
        width={W}
        height={H}
        pad={SIDE_PAD}
        top={TOP}
        maxLevelGap={MAX_LEVEL_GAP}
        bottomRoom={BOTTOM_ROOM}
        className="bst-svg"
        label={(id) => nodes[id].key}
        nodeMark={nodeMark}
        edgeMark={edgeMark}
        nodeScale={(id) => (id === frame.hi || id === frame.ok ? EMPHASIS_SCALE : 1)}
        onNodeClick={(id) => onPick(nodes[id].key)}
        overlay={ghost}
      />
      <Tray className="bst-out" label="in-order output" labelWeight="regular" ariaLabel="In-order output">
        <AnimatePresence>
          {frame.output.map((k, i) => (
            <motion.span key={`${i}-${k}`} className="bst-chip" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {k}
            </motion.span>
          ))}
        </AnimatePresence>
        {frame.output.length === 0 && <span className="bst-out-empty">run an in-order walk to fill this</span>}
      </Tray>
    </div>
  );
}
