import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { tonesOf } from './tones';
import { getAt, termSize, type Path, type Term } from './term';

/** Larger terms are shown as text only: a tree this wide stops being readable. */
export const MAX_TREE_NODES = 60;
const LEAF_WIDTH = 46;
const SIDE_PAD = 80;
const LEVEL_GAP = 52;
const TOP = 30;
const NODE_RADIUS = 19;
const NODE_FONT = 12;

const idOf = (path: Path) => `r${path}`;
const pathOf = (id: string): Path => id.slice(1);

const leaves = (t: Term): number => (t.k === 'v' ? 1 : t.k === 'l' ? leaves(t.body) : leaves(t.fn) + leaves(t.arg));
const depthOf = (t: Term): number => (t.k === 'v' ? 0 : t.k === 'l' ? 1 + depthOf(t.body) : 1 + Math.max(depthOf(t.fn), depthOf(t.arg)));

/** The term as a tree: λ nodes, @ for application, variables as leaves. Application nodes that are redexes can be pressed. */
export function TermTree({ term, next, redexes, onPick }: { term: Term; next: Path | null; redexes: readonly Path[]; onPick: (path: Path) => void }) {
  const size = termSize(term);
  if (size > MAX_TREE_NODES) {
    return <p className="ld-note">This term has {size} nodes; the tree is shown up to {MAX_TREE_NODES}. Use the text and the redex list.</p>;
  }
  const tones = tonesOf(term);
  const shape: TreeShape<string> = {
    root: idOf(''),
    children: (id) => {
      const node = getAt(term, pathOf(id));
      if (node.k === 'l') return [idOf(`${pathOf(id)}b`)];
      if (node.k === 'a') return [idOf(`${pathOf(id)}f`), idOf(`${pathOf(id)}a`)];
      return [];
    },
  };
  const width = Math.max(300, leaves(term) * LEAF_WIDTH + SIDE_PAD);
  const height = TOP + depthOf(term) * LEVEL_GAP + NODE_RADIUS + 16;
  const label = (id: string) => {
    const node = getAt(term, pathOf(id));
    return node.k === 'l' ? `λ${node.param}` : node.k === 'a' ? '@' : node.name;
  };
  return (
    <WideRegion minWidth={minWidthForText(width, NODE_FONT)} label="Term tree: scroll sideways to see all of it">
      <TreeSvg
        shape={shape}
        layout="tidy"
        width={width}
        height={height}
        levelGap={LEVEL_GAP}
        top={TOP}
        radius={NODE_RADIUS}
        label={label}
        ariaLabel="The term as a tree"
        nodeMark={(id) => {
          const path = pathOf(id);
          if (path === next) return { tone: 'hi', fill: 'solid' };
          if (redexes.includes(path)) return { tone: 'info', fill: 'tint', tint: 30 };
          const tone = tones.get(path);
          return tone ? { tone, fill: 'tint' } : null;
        }}
        onNodeClick={(id) => onPick(pathOf(id))}
        nodeAriaLabel={(id) => `${redexes.includes(pathOf(id)) ? 'Redex: reduce ' : ''}${label(id)}`}
      />
    </WideRegion>
  );
}
