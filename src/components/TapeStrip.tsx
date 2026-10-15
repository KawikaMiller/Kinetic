import { useState, type KeyboardEvent } from 'react';
import { TM_BLANK } from '../core/tm';
import { ArrayStrip, type ArrayCellState } from './ArrayStrip';
import { panAfterKey, tapeWindow, TAPE_CELLS } from './tapeWindow';

/**
 * A Turing-machine tape: a window of `cells` cells centred on the head, over a tape that is
 * blank without end in both directions (`symbol(i)` is asked for any index, negative included;
 * blank cells are dimmed). The window follows the head, so a run scrolls the tape under it.
 * The strip is one tab stop: Left and Right pan the view to look along the tape, Home or Escape
 * recentre on the head, and any head move recentres too.
 *
 * - `state` labels the head marker (the machine's state); the marker leaves with the head when panned away.
 * - `changed` lists tape indices the last step wrote, lifted in --ok.
 * - Needs `TM_BLANK` ('_') for an empty cell, as `core/tm` writes it.
 */
export function TapeStrip({
  symbol, head, state, cells = TAPE_CELLS, changed = [], fontSize, ariaLabel = 'Tape',
}: {
  symbol: (index: number) => string;
  head: number;
  state?: string;
  cells?: number;
  changed?: readonly number[];
  fontSize?: number;
  ariaLabel?: string;
}) {
  const [view, setView] = useState({ head, pan: 0 });
  const pan = view.head === head ? view.pan : 0;
  const { first, headAt } = tapeWindow(head, cells, pan);
  const indices = Array.from({ length: cells }, (_, j) => first + j);
  const values = indices.map(symbol);

  const onKeyDown = (e: KeyboardEvent) => {
    const next = panAfterKey(e.key, pan);
    if (next === null) return;
    e.preventDefault();
    setView({ head, pan: next });
  };

  const cellState = (j: number): ArrayCellState => (j === headAt ? 'active' : values[j] === TM_BLANK ? 'dim' : 'idle');
  return (
    <div
      className="tape-strip"
      role="group"
      tabIndex={0}
      aria-roledescription="tape"
      aria-label={`${ariaLabel}: head on cell ${head}, reading ${symbol(head)}. Left and Right arrows look along the tape, Home returns to the head.`}
      onKeyDown={onKeyDown}
    >
      <ArrayStrip
        values={values}
        cellState={cellState}
        cellTone={(j) => (changed.includes(indices[j]) ? 'ok' : null)}
        cellTitle={(j) => `cell ${indices[j]}`}
        pointers={headAt === null ? [] : [{ i: headAt, label: state ?? 'head', tone: 'hi' }]}
        fontSize={fontSize}
      />
      {headAt === null && <p className="tape-strip-away">The head is off screen: Home brings it back.</p>}
    </div>
  );
}
