import { useState } from 'react';
import { Hint, Segmented, Slider, TextField } from '../../components/ui';
import { parseRow, type Matrix } from './model';
import { prob } from './text';

const SLIDER_STEP = 0.01;

/** One row as text the learner can retype: "0.8, 0.15, 0.05". */
const rowText = (row: readonly number[]) => row.map(prob).join(', ');

/**
 * The three control rows of the matrix editor: a row picker, a slider per entry (moving one rescales the
 * rest of the row so it still sums to 1) and a field to retype the whole row.
 */
export function rowControls({
  states, P, row, onRow, onEntry, onRowText, draft, setDraft, error,
}: {
  states: readonly string[];
  P: Matrix;
  row: number;
  onRow: (row: number) => void;
  onEntry: (row: number, col: number, value: number) => void;
  onRowText: () => void;
  draft: string | null;
  setDraft: (text: string | null) => void;
  error: string | null;
}) {
  return [
    <Segmented key="row" label="Edit row" value={row} onChange={onRow} options={states.map((s, i) => ({ value: i, label: s }))} />,
    <>
      {states.map((s, j) => (
        <Slider key={s} label={`${states[row]} → ${s}`} value={P[row][j]} min={0} max={1} step={SLIDER_STEP} format={prob} onChange={(v) => onEntry(row, j, v)} />
      ))}
    </>,
    <>
      <TextField label={`Retype the ${states[row]} row`} value={draft ?? rowText(P[row])} onChange={setDraft} onEnter={onRowText} onBlur={onRowText} width={170} spellCheck={false} ariaLabel={`Row ${states[row]}, ${states.length} numbers`} />
      {error ? <Hint tone="muted" block>{error}</Hint> : <Hint>Moving one entry rescales the rest of its row; a typed row is clamped to 0-1 and scaled to sum 1.</Hint>}
    </>,
  ];
}

/** The state of the row editor: which row, the retyped text and its refusal, and what applying it does. */
export function useRowEditor(P: Matrix, onRow: (row: number, values: number[]) => void) {
  const [row, setRow] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    if (draft === null) return;
    const parsed = parseRow(draft, P.length);
    if (parsed.ok) {
      onRow(row, parsed.value);
      setError(null);
    } else {
      setError(parsed.error);
    }
    setDraft(null);
  };
  return {
    row,
    draft,
    error,
    pick: (r: number) => {
      setRow(r);
      setDraft(null);
      setError(null);
    },
    type: setDraft,
    apply,
  };
}
