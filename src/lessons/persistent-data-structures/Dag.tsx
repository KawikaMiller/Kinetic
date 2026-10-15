import { motion } from 'motion/react';
import { WideRegion } from '../../components/WideRegion';
import { SPRING } from '../../core/motion';
import { minWidthForText } from '../../core/scale';
import type { TreeNodeMark } from '../../components/TreeSvg';
import { dagLayout } from './dagLayout';
import { reachable, sharedBy, type Store } from './model';

const RADIUS = 11;
const TAG_DY = RADIUS + 6;
const COUNT_DY = RADIUS + 12;
const TINT_SELECTED = 30;
/** Smallest text drawn: the leaf values, version tags and share counts. */
export const DAG_TEXT_PX = 10;

export interface DagMarks {
  /** Nodes the latest update allocated. */
  fresh?: ReadonlySet<number>;
  /** The selected version's root and the path its edit copied. */
  selected?: ReadonlySet<number>;
  /** Versions that still count (scene 4); nodes none of them reach are dimmed and dashed. */
  live?: readonly number[];
  /** Leaves whose value no longer matches what their version recorded. */
  corrupt?: ReadonlySet<number>;
  /** The viewed version: every edge of its own tree is drawn in the secondary colour. */
  view?: number;
}

/**
 * The DAG of every version: nodes are circles with a leaf's value inside, a version's root carries its tag,
 * and a node shared by two or more live versions carries how many. A local drawing, because the point is
 * where nodes sit: each copy beside the original under the cells it covers.
 */
export function Dag({ store, marks, ariaLabel }: { store: Store; marks: DagMarks; ariaLabel: string }) {
  const live = marks.live ?? store.versions.map((v) => v.id);
  const shared = sharedBy(store, live);
  const alive = reachable(store, live);
  const viewReach = marks.view === undefined ? null : reachable(store, [marks.view]);
  const layout = dagLayout(store);
  const tags = new Map<number, string[]>();
  for (const v of store.versions) tags.set(v.root, [...(tags.get(v.root) ?? []), `v${v.id}`]);

  const markOf = (id: number): TreeNodeMark | null => {
    if (marks.corrupt?.has(id)) return { tone: 'bad', fill: 'solid' };
    if (!alive.has(id)) return { tone: 'dim', fill: 'tint' };
    if (marks.fresh?.has(id)) return { tone: 'hi', fill: 'solid' };
    if (marks.selected?.has(id)) return { tone: 'info', fill: 'tint', tint: TINT_SELECTED };
    if ((shared.get(id) ?? 0) >= 2) return { tone: 'violet', fill: 'tint' };
    return null;
  };

  return (
    <WideRegion minWidth={minWidthForText(layout.width, DAG_TEXT_PX)} label="Version DAG: scroll sideways to see all of it">
      <svg className="pds-dag" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} role="img" aria-label={ariaLabel}>
        <g aria-hidden="true">
          {store.nodes.flatMap((n) =>
            (n.kids ?? []).map((k) => {
              const a = layout.at.get(n.id)!;
              const b = layout.at.get(k)!;
              const inView = viewReach?.has(n.id) && viewReach.has(k);
              return <line key={`${n.id}-${k}`} className={`pds-edge ${inView ? 'is-view' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
            }),
          )}
          {store.nodes.map((n) => {
            const p = layout.at.get(n.id)!;
            const mark = markOf(n.id);
            const count = shared.get(n.id) ?? 0;
            const vs = tags.get(n.id);
            const cls = ['tree-node', mark && `is-${mark.fill} tone-${mark.tone}`, !alive.has(n.id) && 'pds-garbage'].filter(Boolean).join(' ');
            return (
              <motion.g key={n.id} className={cls} initial={{ opacity: 0, x: p.x, y: p.y }} animate={{ opacity: 1, x: p.x, y: p.y }} transition={SPRING.soft}>
                <circle r={RADIUS} />
                {n.value !== null && (
                  <text className="pds-value" y={3.5}>
                    {n.value}
                  </text>
                )}
                {vs && p.level === 0 && (
                  <text className="pds-tag" y={-TAG_DY}>
                    {vs.join(' ')}
                  </text>
                )}
                {count >= 2 && alive.has(n.id) && (
                  <text className="pds-count" y={COUNT_DY}>
                    {`×${count}`}
                  </text>
                )}
              </motion.g>
            );
          })}
        </g>
      </svg>
    </WideRegion>
  );
}
