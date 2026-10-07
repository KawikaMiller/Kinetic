import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import { HEAP, heapFieldPort, heapHeight, type PortSide } from './geometry';

export interface HeapField {
  name: ReactNode;
  /** A primitive to print, or omit and set `isRef` to draw a dot for an outgoing arrow. */
  value?: ReactNode;
  isRef?: boolean;
  /** Which edge the reference dot sits on (default right); start the arrow at `heapFieldPort(…, port)`. */
  port?: PortSide;
}

/** Where the corner tag ('collectable', 'captured') goes. `above` sits over the box, clear of long titles. */
export type TagPlacement = 'corner' | 'above';
const TAG_ABOVE_GAP = 5;

const portCircle = (p: Pt) => ({ cx: p.x, cy: p.y });

export type HeapVariant = 'live' | 'collectable' | 'freed';

const VARIANT_TAG: Record<HeapVariant, string | null> = { live: null, collectable: 'collectable', freed: 'freed' };

/**
 * A block in the heap: an object, array, closure environment or class. SVG,
 * positioned by its top-left corner `at`; height grows with its fields
 * (`heapHeight`), so a lesson lays things out with `heapRect`.
 *
 * - `variant`: `live`; `collectable` (unreachable, dim and dashed, awaiting GC);
 *   `freed` (manual memory, dashed in --bad: any arrow into it is a use-after-free).
 * - `highlight` rings it ("this box is being searched", "just mutated").
 * - The corner tag shares the title row, so the title and tag must fit in `w`; if they
 *   don't, use `tagPlacement="above"` rather than widening the box.
 * - It fades in when it's allocated, unless the viewer prefers reduced motion.
 * - `fields=[]` keeps one empty row (an empty object); `collapseEmpty` makes it a title-only box.
 */
export function HeapObject({
  at, w, title, fields, tone = 'info', variant = 'live', highlight = false, tag, tagPlacement = 'corner', collapseEmpty = false, className = '',
}: {
  at: Pt;
  w: number;
  title: ReactNode;
  fields: readonly HeapField[];
  tone?: Tone;
  variant?: HeapVariant;
  highlight?: boolean;
  /** Overrides the variant's corner tag ('collectable', 'freed'). */
  tag?: ReactNode;
  tagPlacement?: TagPlacement;
  /** With no fields, draw just the title row (a file object, a lock) instead of one empty row; size it with `heapHeight(0, true)`. */
  collapseEmpty?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const h = heapHeight(fields.length, collapseEmpty);
  const cornerTag = tag ?? VARIANT_TAG[variant];
  const cls = `heap-obj tone-${variant === 'freed' ? 'bad' : tone} is-${variant} ${highlight ? 'is-highlight' : ''} ${className}`;

  return (
    <motion.g className={cls} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <rect className="heap-obj-box" x={at.x} y={at.y} width={w} height={h} rx={9} />
      <text className="heap-obj-title" x={at.x + 10} y={at.y + 16}>
        {title}
      </text>
      {cornerTag != null && (
        <text className="heap-obj-tag" x={at.x + w - 8} y={tagPlacement === 'above' ? at.y - TAG_ABOVE_GAP : at.y + 16} textAnchor="end">
          {cornerTag}
        </text>
      )}
      {fields.map((f, i) => {
        const y = at.y + HEAP.titleH + i * HEAP.fieldH;
        return (
          <g key={i}>
            <line className="heap-obj-rule" x1={at.x} x2={at.x + w} y1={y} y2={y} />
            <text className="heap-obj-field" x={at.x + 10} y={y + 15}>
              {f.name}
            </text>
            {f.isRef ? (
              <circle className="heap-obj-port" {...portCircle(heapFieldPort(at, w, i, f.port))} r={3.5} />
            ) : (
              <text className="heap-obj-value" x={at.x + w - 10} y={y + 15} textAnchor="end">
                {f.value}
              </text>
            )}
          </g>
        );
      })}
    </motion.g>
  );
}
