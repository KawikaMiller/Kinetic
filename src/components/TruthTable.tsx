import type { KeyboardEvent, ReactNode } from 'react';
import type { Tone } from '../core/tone';
import { truthRows, type TruthRow } from '../core/truth';

export type { TruthRow } from '../core/truth';

export interface TruthColumn {
  label: ReactNode;
  fn: (row: TruthRow) => boolean;
}

/**
 * A live truth table: one row per assignment of `vars`, one output column per
 * formula or gate. Input columns are separated from outputs by a rule.
 *
 * - `currentRow` highlights the row matching the circuit's inputs right now
 *   (see `truthRowIndex`); `mismatchRows` marks rows where two formulas disagree.
 * - `format` prints values as T/F or 1/0. True values take `trueTone`, false ones are dim.
 * - With `onRowClick` each row is a button that sets the inputs to that row.
 */
export function TruthTable({
  vars, columns, currentRow, mismatchRows = [], onRowClick, format = 'tf', trueFirst = false,
  trueTone = 'ok', currentTone = 'hi', caption, className = '',
}: {
  vars: readonly string[];
  columns: readonly TruthColumn[];
  currentRow?: number;
  mismatchRows?: readonly number[];
  onRowClick?: (row: TruthRow, index: number) => void;
  format?: 'tf' | '10';
  trueFirst?: boolean;
  trueTone?: Tone;
  currentTone?: Tone;
  caption?: ReactNode;
  className?: string;
}) {
  const rows = truthRows(vars, { trueFirst });
  const mismatched = new Set(mismatchRows);
  const show = (v: boolean) => (
    <span className={`tt-v ${v ? 'is-true' : 'is-false'}`}>{format === 'tf' ? (v ? 'T' : 'F') : v ? '1' : '0'}</span>
  );

  const rowProps = (row: TruthRow, i: number) =>
    onRowClick
      ? {
          tabIndex: 0,
          role: 'button',
          'aria-label': `Set inputs to ${vars.map((v) => `${v}=${row[v] ? 1 : 0}`).join(', ')}`,
          onClick: () => onRowClick(row, i),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRowClick(row, i);
            }
          },
        }
      : {};

  return (
    <table
      className={`data-table truth-table ${onRowClick ? 'is-clickable' : ''} ${className}`}
      style={{ ['--tt-true' as string]: `var(--${trueTone})`, ['--tt-current' as string]: `var(--${currentTone})` }}
    >
      {caption && <caption>{caption}</caption>}
      <thead>
        <tr>
          {vars.map((v) => (
            <th key={v}>{v}</th>
          ))}
          {columns.map((c, i) => (
            <th key={i} className={i === 0 ? 'tt-first-out' : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={`${i === currentRow ? 'is-current' : ''} ${mismatched.has(i) ? 'is-mismatch' : ''}`} {...rowProps(row, i)}>
            {vars.map((v) => (
              <td key={v}>{show(row[v])}</td>
            ))}
            {columns.map((c, j) => (
              <td key={j} className={j === 0 ? 'tt-first-out' : undefined}>
                {show(c.fn(row))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
