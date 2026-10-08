import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { SPRING } from '../core/motion';
import { toneVar, type Tone } from '../core/tone';
import { mergeSharedPointers, POINTER_JOIN, resolveCellTone, type ArrayCellTone, type ArrayPointer } from './arrayPointers';

export type { ArrayCellFill, ArrayCellTone, ArrayPointer } from './arrayPointers';

/** Must match `.array-cells { gap }` in kit.css. */
const CELL_GAP = 3;

/**
 * A cell's role right now. `idle` cells inside a range are tinted as "still possible";
 * `active` lifts in --hi (being checked), `done` lifts in --ok (found), `dim` is ruled out.
 * `info` and `violet` lift like `active` in those colours, for a second and third pointer
 * (cycle-detection's slow and fast), so a cell can match its pointer's tone.
 */
export type ArrayCellState = 'idle' | 'active' | 'info' | 'violet' | 'done' | 'dim' | 'bad';

export interface ArrayRange {
  /** Inclusive. */
  from: number;
  /** Inclusive. */
  to: number;
  tone?: Tone;
  /** Labels over the range's left and right ends, e.g. ['lo', 'hi']. */
  labels?: readonly [ReactNode, ReactNode];
}

/**
 * One row of array cells with animated range brackets and pointer markers under
 * them: binary search's lo/hi window and mid, two pointers' L and R, a sliding
 * window plus its best-so-far, a git-bisect commit range.
 *
 * - `cellState(i)` styles each cell; idle cells inside the first range get the in-range tint.
 *   `cellClass(i)` adds a lesson's own class to a cell (prefix it with the lesson's prefix).
 * - `pointers`: pass `[]` (not undefined) when a lesson's pointers come and go, so the
 *   pointer lane keeps its height and the layout doesn't jump.
 * - `cellTone(i)` colours a cell flat in any Tone (`tint`, `solid` or an inset `outline` ring)
 *   without the lift of the active/info/violet states; a lift state still wins over it.
 * - `mergePointers` joins pointers that land on the same cell into one marker ("i·k"), so
 *   their labels never overprint; pass a string for another separator.
 * - `onCellClick` makes the cells buttons; otherwise they're plain boxes.
 * - Cell width comes from the container (`--n` equal columns); set `fontSize` for crowded rows.
 */
export function ArrayStrip({
  values, cellState, cellClass, cellTone, pointers: rawPointers, mergePointers = false, ranges = [], showIndex = false, onCellClick, cellTitle, renderValue,
  fontSize, cellMax, className = '',
}: {
  values: readonly (number | string)[];
  cellState?: (i: number) => ArrayCellState;
  /** Extra class names for cell i, for a lesson-specific style on top of its state. */
  cellClass?: (i: number) => string;
  /** A flat colour for cell i (a bare Tone is a tint), or null for none. */
  cellTone?: (i: number) => Tone | ArrayCellTone | null | undefined;
  pointers?: readonly ArrayPointer[];
  /** Merge pointers sharing a cell into one marker; true joins labels with "·", a string with that. */
  mergePointers?: boolean | string;
  ranges?: readonly ArrayRange[];
  showIndex?: boolean;
  onCellClick?: (i: number) => void;
  cellTitle?: (i: number) => string;
  renderValue?: (v: number | string, i: number) => ReactNode;
  fontSize?: number;
  /** Widest a cell may get, in px, for short arrays; the whole strip narrows so markers stay aligned. */
  cellMax?: number;
  className?: string;
}) {
  const n = values.length;
  const pointers = rawPointers && mergePointers
    ? mergeSharedPointers(rawPointers, typeof mergePointers === 'string' ? mergePointers : POINTER_JOIN)
    : rawPointers;
  const pct = (i: number) => `${(i / n) * 100}%`;
  const primary = ranges[0];
  const inPrimary = (i: number) => !!primary && i >= primary.from && i <= primary.to;

  const classesOf = (i: number) => {
    const state = cellState?.(i) ?? 'idle';
    const inRange = state === 'idle' && inPrimary(i) ? 'is-in-range' : '';
    const flat = resolveCellTone(cellTone?.(i));
    const toned = flat ? ` fill-${flat.fill} tone-${flat.tone}` : '';
    return `array-cell is-${state} ${inRange} ${onCellClick ? 'is-clickable' : ''} ${cellClass?.(i) ?? ''}${toned}`;
  };

  const style = {
    '--n': n,
    // Idle cells inside the first range are tinted with that range's own colour.
    ...(primary ? { '--range-c': toneVar(primary.tone ?? 'hi') } : {}),
    ...(fontSize ? { '--as-fs': `${fontSize}px` } : {}),
    ...(cellMax ? { maxWidth: n * cellMax + (n - 1) * CELL_GAP } : {}),
  } as CSSProperties;

  return (
    <div className={`array-strip ${pointers ? 'has-pointers' : ''} ${className}`} style={style}>
      {ranges.map((r, k) => (
        <motion.div
          key={k}
          className={`array-range tone-${r.tone ?? 'hi'}`}
          initial={false}
          animate={{ left: pct(r.from), width: `${((r.to - r.from + 1) / n) * 100}%` }}
          transition={SPRING.snappy}
        >
          {r.labels && (
            <>
              <span className="array-range-lo">{r.labels[0]}</span>
              <span className="array-range-hi">{r.labels[1]}</span>
            </>
          )}
        </motion.div>
      ))}
      {showIndex && (
        <div className="array-index" aria-hidden="true">
          {values.map((_, i) => (
            <span key={i}>{i}</span>
          ))}
        </div>
      )}
      <div className="array-cells">
        {values.map((v, i) => {
          const value = renderValue ? renderValue(v, i) : v;
          const content = resolveCellTone(cellTone?.(i))?.fill === 'outline' ? <span className="array-cell-ring">{value}</span> : value;
          return onCellClick ? (
            <button key={i} type="button" className={classesOf(i)} onClick={() => onCellClick(i)} title={cellTitle?.(i)}>
              {content}
            </button>
          ) : (
            <div key={i} className={classesOf(i)} title={cellTitle?.(i)}>
              {content}
            </div>
          );
        })}
      </div>
      {pointers?.map((p, k) => (
        <motion.div
          key={p.id ?? (typeof p.label === 'string' ? p.label : k)}
          className={`array-pointer tone-${p.tone ?? 'hi'}`}
          initial={false}
          animate={{ left: `${((p.i + 0.5) / n) * 100}%` }}
          transition={SPRING.snappy}
        >
          ▲<span>{p.label}</span>
        </motion.div>
      ))}
    </div>
  );
}
