import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import type { Tone } from '../../core/tone';

export type CellValue = string | number | null;

/** Rows past this are summarised, so a big product doesn't push the page to the floor. */
export const MAX_SHOWN_ROWS = 20;

export interface ShownRow {
  /** Stable key: rows that merge away exit, the rest stay put. */
  key: string;
  cells: readonly CellValue[];
  tone?: Tone | null;
  /** Filtered out or cancelled: dim and struck through. */
  struck?: boolean;
  /** About to collapse into an earlier identical row. */
  flash?: boolean;
  /** Padded by an outer join (its other side is all NULL). */
  padded?: boolean;
  /** Extra trailing cell (a truth value chip). */
  extra?: ReactNode;
}

const ROW_MOTION = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 14 },
  transition: { duration: 0.32 },
};

/** A relation as a `.data-table`: named columns, rows that fade in and out as operators run. */
export function RelTable({ title, hint, cols, rows, headTone, extraHead, ariaLabel }: {
  title: ReactNode;
  hint?: ReactNode;
  cols: readonly string[];
  rows: readonly ShownRow[];
  headTone?: (col: string) => Tone | null;
  extraHead?: string;
  ariaLabel: string;
}) {
  const shown = rows.slice(0, MAX_SHOWN_ROWS);
  const more = rows.length - shown.length;
  return (
    <div className="ra-rel">
      <SectionTitle weight="regular" hint={hint}>{title}</SectionTitle>
      <table className="data-table ra-table" aria-label={ariaLabel}>
        <thead>
          <tr>
            {cols.map((c) => {
              const t = headTone?.(c);
              return <th key={c} className={`keep-case ${t ? `tone-${t} ra-head-lit` : ''}`}>{c}</th>;
            })}
            {extraHead && <th>{extraHead}</th>}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {shown.map((r) => (
              <motion.tr
                key={r.key}
                {...ROW_MOTION}
                className={['ra-row', r.tone && `tone-${r.tone}`, r.struck && 'is-struck', r.flash && 'is-flash', r.padded && 'is-padded'].filter(Boolean).join(' ')}
              >
                {r.cells.map((v, i) => (
                  <td key={i} className={v === null ? 'ra-null' : undefined}>{v === null ? 'NULL' : v}</td>
                ))}
                {r.extra !== undefined && <td>{r.extra}</td>}
              </motion.tr>
            ))}
          </AnimatePresence>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length + (extraHead ? 1 : 0)} className="ra-empty">no rows</td></tr>
          )}
        </tbody>
      </table>
      {more > 0 && <p className="ra-more">… and {more} more {more === 1 ? 'row' : 'rows'} ({rows.length} in all)</p>}
    </div>
  );
}
