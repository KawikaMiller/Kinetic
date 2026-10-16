import { TreeSvg } from '../../components/TreeSvg';
import type { Tone } from '../../core/tone';
import { EMPTY_STRING, type PNode } from './runs';
import { isNonterminal } from './grammar';

const TREE_WIDTH = 420;
const TREE_HEIGHT = 230;
const MIN_TREE_FOOTPRINT = 340;

/** Width the drawing needs so its labels stay readable, for a `WideRegion`. */
export const TREE_MIN_WIDTH = MIN_TREE_FOOTPRINT;

/**
 * A parse tree (or, bottom-up, a forest of the trees built so far). Nodes numbered `hiddenFrom` or more do not exist yet.
 * Terminals are plain circles; nonterminals carry their name. `marks` colours the node a step just touched.
 */
export function ParseTree({
  nodes, roots, hiddenFrom, marks, tone, ariaLabel,
}: {
  nodes: readonly PNode[];
  roots: readonly number[];
  hiddenFrom: number;
  marks: ReadonlyMap<number, Tone>;
  /** The colour a nonterminal's tree wears when unmarked: the two methods are two categories. */
  tone: Tone;
  ariaLabel: string;
}) {
  return (
    <TreeSvg
      shape={{ roots, children: (id) => nodes[id].children }}
      layout="tidy"
      width={TREE_WIDTH}
      height={TREE_HEIGHT}
      natural
      radius={16}
      label={(id) => nodes[id].symbol}
      hidden={(id) => id >= hiddenFrom}
      nodeMark={(id) => {
        const mark = marks.get(id);
        if (mark) return { tone: mark, fill: 'solid' };
        const n = nodes[id];
        return isNonterminal(n.symbol) || n.symbol === EMPTY_STRING ? { tone, fill: 'tint' } : null;
      }}
      ariaLabel={ariaLabel}
    />
  );
}
