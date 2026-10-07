import type { ReactNode } from 'react';
import { TreeSvg } from '../../components/TreeSvg';
import { EPS } from './model';
import { LEVEL_GAP, treeSize, type TNode } from './tree';

/** Width per character of the 13px mono node labels. */
const CHAR_W = 8.4;

/**
 * A parse tree: non-terminals are violet boxes, terminals blue leaves, ε a faint mark.
 * `hot` is the node being expanded (yellow); `badge` writes a value under a node.
 */
export function ParseTree({
  nodes, root, hot, badge, tone, ariaLabel, className = '',
}: {
  nodes: Record<string, TNode>;
  root: string;
  hot?: string | null;
  badge?: (id: string) => ReactNode;
  /** Outline the whole tree in a tone (the precedence tree ok, the other orange). */
  tone?: 'ok' | 'orange';
  ariaLabel: string;
  className?: string;
}) {
  const { width, height } = treeSize(nodes, root);
  const label = (n: TNode) => (n.sym === EPS ? EPS : n.text ?? n.sym);
  return (
    // Never drawn bigger than its natural size: a three-node tree shouldn't fill the stage.
    <TreeSvg
      natural
      shape={{ root, children: (id) => nodes[id]?.children ?? [] }}
      layout="tidy"
      width={width}
      height={height}
      levelGap={LEVEL_GAP}
      top={26}
      pad={30}
      className={`gp-tree ${tone ? `tone-${tone} is-toned` : ''} ${className}`}
      ariaLabel={ariaLabel}
      nodeClass={(id) => `${nodes[id].nt ? 'gp-nt' : nodes[id].sym === EPS ? 'gp-eps' : 'gp-t'} ${id === hot ? 'is-hot' : ''}`}
      renderNode={(id) => {
        const n = nodes[id];
        const text = label(n);
        const w = Math.max(30, Array.from(text).length * CHAR_W + 16);
        const b = badge?.(id);
        const bw = b == null ? 0 : Math.max(34, String(b).length * 7.5 + 12);
        return (
          <>
            <rect x={-w / 2} y={-14} width={w} height={28} rx={n.nt ? 6 : 14} />
            <text y={5} textAnchor="middle">
              {text}
            </text>
            {b != null && (
              <g className="gp-badge">
                <rect x={-bw / 2} y={17} width={bw} height={18} rx={9} />
                <text y={30} textAnchor="middle">
                  {b}
                </text>
              </g>
            )}
          </>
        );
      }}
    />
  );
}
