import { motion } from 'motion/react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { SPRING } from '../../core/motion';
import { HEAD, type Pos, type Snapshot } from './model';
import { CELL_H, CELL_W, ROW, layout } from './skipLayout';

const TOKEN_R = 7;
const ARROW_GAP = 4;

/** A pointer: the tower `from` (or the head), at `level`, to the key it links to (null = nil). */
export interface Edge {
  from: Pos;
  to: number | null;
  level: number;
}

export interface SkipDrawingProps {
  snap: Snapshot;
  token?: { pos: Pos; level: number } | null;
  /** Pointers the search followed. */
  followed?: readonly Edge[];
  /** Places the search dropped a level, as (node, level it dropped from). */
  drops?: readonly { at: Pos; level: number }[];
  /** The key being looked for. */
  target?: number | null;
  /** The target tower, when found. */
  found?: number | null;
  /** For an absent target: the last node below it. */
  stop?: Pos | null;
  /** update[l]: the node an insert links in after at level l. */
  update?: readonly Pos[];
  /** A tower the learner just made. */
  fresh?: number | null;
  /** Pointers written by the latest step. */
  changed?: readonly Edge[];
  ariaLabel: string;
}

/** Towers as columns of boxes, one row per level, forward pointers as arrows, plus a search token. */
export function SkipDrawing({ snap, token, followed = [], drops = [], target, found, stop, update = [], fresh, changed = [], ariaLabel }: SkipDrawingProps) {
  const { n, width, height, x, y, colOf } = layout(snap);
  const base = useArrowMarker('var(--line-2)', { size: 6, refX: 9 });
  const info = useArrowMarker('var(--info)', { size: 6, refX: 9 });
  const hi = useArrowMarker('var(--hi)', { size: 6, refX: 9 });
  const same = (a: Edge, from: Pos, level: number) => a.from === from && a.level === level;
  const columns: { pos: Pos; height: number; next: (number | null)[] }[] = [
    { pos: HEAD, height: snap.levels, next: snap.head.slice(0, snap.levels) },
    ...snap.towers.map((t) => ({ pos: t.key as Pos, height: t.height, next: t.next })),
  ];
  const nilX = x(n + 1);
  const hasStop = stop !== null && stop !== undefined;
  const targetX =
    target === null || target === undefined
      ? null
      : found === target
        ? x(colOf(target))
        : hasStop
          ? (x(colOf(stop)) + x(colOf(stop) + 1)) / 2
          : null;

  return (
    <svg className="sl-svg" viewBox={`0 0 ${width} ${height}`} width={width} role="img" aria-label={ariaLabel}>
      {base.def}
      {info.def}
      {hi.def}
      <g aria-hidden="true">
        <rect className="sl-nil" x={nilX - CELL_W / 2} y={y(snap.levels - 1) - CELL_H / 2} width={CELL_W} height={(snap.levels - 1) * ROW + CELL_H} rx={6} />
        <text className="sl-label" x={nilX} y={y(0) + CELL_H / 2 + 14}>
          nil
        </text>
        <text className="sl-label" x={x(0)} y={y(0) + CELL_H / 2 + 14}>
          head
        </text>
        {columns.flatMap((c) =>
          c.next.map((to, level) => {
            const mark = changed.some((e) => same(e, c.pos, level)) ? 'hi' : followed.some((e) => same(e, c.pos, level)) ? 'info' : 'base';
            const x1 = x(colOf(c.pos)) + CELL_W / 2;
            const x2 = x(colOf(to)) - CELL_W / 2 - ARROW_GAP;
            const marker = mark === 'hi' ? hi : mark === 'info' ? info : base;
            return <line key={`${c.pos}-${level}`} className={`sl-ptr is-${mark}`} x1={x1} y1={y(level)} x2={x2} y2={y(level)} markerEnd={marker.url} />;
          }),
        )}
        {columns.flatMap((c) =>
          Array.from({ length: c.height }, (_, level) => {
            const isFound = c.pos === found && found !== null;
            const isStop = hasStop && c.pos === stop;
            const isFresh = c.pos === fresh && fresh !== null;
            const isUpdate = update[level] === c.pos;
            const cls = ['sl-cell', c.pos === HEAD && 'is-head', isFound && 'is-found', isStop && 'is-stop', isFresh && 'is-fresh', isUpdate && 'is-update'].filter(Boolean).join(' ');
            return (
              <g key={`${c.pos}-${level}`}>
                <rect className={cls} x={x(colOf(c.pos)) - CELL_W / 2} y={y(level) - CELL_H / 2} width={CELL_W} height={CELL_H} rx={5} />
                {level === 0 && c.pos !== HEAD && (
                  <text className="sl-key" x={x(colOf(c.pos))} y={y(0) + 4}>
                    {c.pos}
                  </text>
                )}
              </g>
            );
          }),
        )}
        {drops.map((d) => (
          <line key={`${d.at}-${d.level}`} className="sl-drop" x1={x(colOf(d.at))} y1={y(d.level) + CELL_H / 2} x2={x(colOf(d.at))} y2={y(d.level - 1) - CELL_H / 2} />
        ))}
        {targetX !== null && (
          <text className="sl-target" x={targetX} y={y(0) + CELL_H / 2 + 32}>
            {found === target ? `▲ ${target}` : `▲ ${target}: not here`}
          </text>
        )}
      </g>
      {token && (
        <motion.circle
          className="sl-token"
          r={TOKEN_R}
          initial={{ cx: x(colOf(token.pos)), cy: y(token.level) }}
          animate={{ cx: x(colOf(token.pos)), cy: y(token.level) }}
          transition={SPRING.snappy}
        />
      )}
    </svg>
  );
}
