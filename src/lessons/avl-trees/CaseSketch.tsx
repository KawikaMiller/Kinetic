import type { Case } from '../../core/avl';
import { CASE_FIX, CASE_NAME } from './text';

type Name = 'z' | 'y' | 'x';
interface Spot {
  col: number;
  row: number;
}
interface Sketch {
  nodes: Record<Name, Spot>;
  /** Parent-child links between named nodes. */
  links: [Name, Name][];
  /** Subtrees T1..T4: the node they hang from and where they sit. */
  subs: { label: string; parent: Name; at: Spot }[];
}

/** The textbook picture of each case, nodes named z (out of balance), y (its heavy child) and x. */
const BEFORE: Record<Case, Sketch> = {
  LL: {
    nodes: { z: { col: 3, row: 0 }, y: { col: 1.5, row: 1 }, x: { col: 0.5, row: 2 } },
    links: [['z', 'y'], ['y', 'x']],
    subs: [
      { label: 'T1', parent: 'x', at: { col: 0, row: 3 } },
      { label: 'T2', parent: 'x', at: { col: 1, row: 3 } },
      { label: 'T3', parent: 'y', at: { col: 2.5, row: 2 } },
      { label: 'T4', parent: 'z', at: { col: 4, row: 1 } },
    ],
  },
  RR: {
    nodes: { z: { col: 1, row: 0 }, y: { col: 2.5, row: 1 }, x: { col: 3.5, row: 2 } },
    links: [['z', 'y'], ['y', 'x']],
    subs: [
      { label: 'T1', parent: 'z', at: { col: 0, row: 1 } },
      { label: 'T2', parent: 'y', at: { col: 1.5, row: 2 } },
      { label: 'T3', parent: 'x', at: { col: 3, row: 3 } },
      { label: 'T4', parent: 'x', at: { col: 4, row: 3 } },
    ],
  },
  LR: {
    nodes: { z: { col: 3, row: 0 }, y: { col: 1, row: 1 }, x: { col: 2, row: 2 } },
    links: [['z', 'y'], ['y', 'x']],
    subs: [
      { label: 'T1', parent: 'y', at: { col: 0, row: 2 } },
      { label: 'T2', parent: 'x', at: { col: 1.5, row: 3 } },
      { label: 'T3', parent: 'x', at: { col: 2.5, row: 3 } },
      { label: 'T4', parent: 'z', at: { col: 4, row: 1 } },
    ],
  },
  RL: {
    nodes: { z: { col: 1, row: 0 }, y: { col: 3, row: 1 }, x: { col: 2, row: 2 } },
    links: [['z', 'y'], ['y', 'x']],
    subs: [
      { label: 'T1', parent: 'z', at: { col: 0, row: 1 } },
      { label: 'T2', parent: 'x', at: { col: 1.5, row: 3 } },
      { label: 'T3', parent: 'x', at: { col: 2.5, row: 3 } },
      { label: 'T4', parent: 'y', at: { col: 4, row: 2 } },
    ],
  },
};

/** After the repair every case has the same shape: the middle key on top, T1..T4 in order underneath. */
const TOP_AFTER: Record<Case, { top: Name; left: Name; right: Name }> = {
  LL: { top: 'y', left: 'x', right: 'z' },
  RR: { top: 'y', left: 'z', right: 'x' },
  LR: { top: 'x', left: 'y', right: 'z' },
  RL: { top: 'x', left: 'z', right: 'y' },
};

const COL = 30;
const ROW = 34;
const PAD = 20;
const DIAGRAM_W = 4 * COL + 2 * PAD;
const GAP = 40;
const WIDTH = 2 * DIAGRAM_W + GAP;
const HEIGHT = 3 * ROW + 54;
const R = 10;
const TRI_W = 11;
const TRI_H = 22;

const px = (s: Spot, dx: number) => ({ x: dx + PAD + s.col * COL, y: 16 + s.row * ROW });

function Tri({ label, at, parent }: { label: string; at: { x: number; y: number }; parent: { x: number; y: number } }) {
  const top = { x: at.x, y: at.y + 8 };
  return (
    <g className="avl-sketch-sub">
      <line x1={parent.x} y1={parent.y} x2={top.x} y2={top.y} />
      <polygon points={`${top.x},${top.y} ${top.x - TRI_W},${top.y + TRI_H} ${top.x + TRI_W},${top.y + TRI_H}`} />
      <text x={top.x} y={top.y + TRI_H - 4}>
        {label}
      </text>
    </g>
  );
}

/** The z, y, x and T1..T4 picture of one case, before and after its repair. */
export function CaseSketch({ kind }: { kind: Case }) {
  const before = BEFORE[kind];
  const after = TOP_AFTER[kind];
  const orderedSubs = [...before.subs].sort((a, b) => Number(a.label.slice(1)) - Number(b.label.slice(1)));
  const afterX = DIAGRAM_W + GAP;
  const nodeAt = (n: Name) => px(before.nodes[n], 0);
  const topP = px({ col: 2, row: 0 }, afterX);
  const leftP = px({ col: 0.75, row: 1 }, afterX);
  const rightP = px({ col: 3.25, row: 1 }, afterX);
  const leaves = [px({ col: 0, row: 2 }, afterX), px({ col: 1.5, row: 2 }, afterX), px({ col: 2.5, row: 2 }, afterX), px({ col: 4, row: 2 }, afterX)];
  const node = (name: Name, p: { x: number; y: number }, bad = false) => (
    <g key={`${name}-${p.x}`} className={`avl-sketch-node ${bad ? 'is-bad' : ''}`}>
      <circle cx={p.x} cy={p.y} r={R} />
      <text x={p.x} y={p.y + 3.5}>
        {name}
      </text>
    </g>
  );
  return (
    <figure className="avl-sketch">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`The ${CASE_NAME[kind]} case before and after: ${CASE_FIX[kind]}`}>
        {before.links.map(([a, b]) => (
          <line key={a + b} className="avl-sketch-edge" x1={nodeAt(a).x} y1={nodeAt(a).y} x2={nodeAt(b).x} y2={nodeAt(b).y} />
        ))}
        {orderedSubs.map((s) => (
          <Tri key={s.label} label={s.label} at={px(s.at, 0)} parent={nodeAt(s.parent)} />
        ))}
        {(Object.keys(before.nodes) as Name[]).map((n) => node(n, nodeAt(n), n === 'z'))}
        <text className="avl-sketch-arrow" x={DIAGRAM_W + GAP / 2} y={16 + ROW}>
          {'→'}
        </text>
        <line className="avl-sketch-edge" x1={topP.x} y1={topP.y} x2={leftP.x} y2={leftP.y} />
        <line className="avl-sketch-edge" x1={topP.x} y1={topP.y} x2={rightP.x} y2={rightP.y} />
        <Tri label="T1" at={leaves[0]} parent={leftP} />
        <Tri label="T2" at={leaves[1]} parent={leftP} />
        <Tri label="T3" at={leaves[2]} parent={rightP} />
        <Tri label="T4" at={leaves[3]} parent={rightP} />
        {node(after.top, topP)}
        {node(after.left, leftP)}
        {node(after.right, rightP)}
      </svg>
      <figcaption>
        {CASE_NAME[kind]}: z is out of balance, y is its heavy child, x is y's child on the {kind === 'LR' || kind === 'RL' ? 'other side' : 'same side'}. T1 to T4 keep their left-to-right order.
      </figcaption>
    </figure>
  );
}
