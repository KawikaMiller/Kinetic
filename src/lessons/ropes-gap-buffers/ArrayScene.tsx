import { useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { plural } from '../../core/format';
import { MAX_TEXT, OPEN, checkInsert, clampCursor } from './editing';
import { arrayCreate, arrayDelete, arrayInsert, codePoints, type ArrayText } from './structures';

const CELL_PX = 22;

interface Last {
  kind: 'insert' | 'delete';
  at: number;
  k: number;
  moves: number;
  /** Cells that moved, as [from, to) in the text after the edit. */
  shifted: [number, number];
}

const start = (): { buf: ArrayText; cursor: number } => ({ buf: arrayCreate(codePoints(OPEN.array.text)), cursor: OPEN.array.cursor });

/** Scene 1: the plain array, where an insert shifts every character after it. */
export function ArrayScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(start);
  const [typed, setTyped] = useState<string>(OPEN.array.insert);
  const [last, setLast] = useState<Last | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { buf, cursor } = state;
  const n = buf.chars.length;

  const insert = () => {
    const r = checkInsert(n, typed);
    if (!r.ok) return setNote(r.error);
    const next = { ...buf, chars: [...buf.chars] };
    arrayInsert(next, cursor, r.items);
    setState({ buf: next, cursor: cursor + r.items.length });
    setLast({ kind: 'insert', at: cursor, k: r.items.length, moves: next.moves - buf.moves, shifted: [cursor + r.items.length, next.chars.length] });
    setNote(null);
  };
  const backspace = () => {
    if (cursor === 0) return setNote('Nothing before the cursor to delete: the cursor is at the start.');
    const next = { ...buf, chars: [...buf.chars] };
    arrayDelete(next, cursor - 1, cursor);
    setState({ buf: next, cursor: cursor - 1 });
    setLast({ kind: 'delete', at: cursor - 1, k: 1, moves: next.moves - buf.moves, shifted: [cursor - 1, next.chars.length] });
    setNote(null);
  };
  const go = (to: number) => setState({ buf, cursor: clampCursor(to, n) });
  const reset = (at: number) => {
    setState({ buf: arrayCreate(codePoints(OPEN.array.text)), cursor: at });
    setLast(null);
    setNote(null);
  };

  const intro = last ? (
    <>
      {last.kind === 'insert' ? `Inserted ${plural(last.k, 'character')} at ${last.at}` : `Deleted the character at ${last.at}`}: the {plural(last.shifted[1] - last.shifted[0], 'character')} after it all moved, {last.moves} {last.moves === 1 ? 'move' : 'moves'} in this edit, {buf.moves} in all. The array holds {n} characters; the cursor is at {cursor}.
    </>
  ) : (
    <>
      The text is {n} characters long and the cursor is at {cursor}. An insert here would shift the {plural(n - cursor, 'character')} after the cursor: that is the cost, n - i = {n - cursor} moves. Positions count code points, so an emoji is one cell.
    </>
  );

  return (
    <StageFrame
      height={360}
      intro={intro}
      introKey={[last, n, cursor]}
      stats={
        <Stats>
          <Stat label="Last edit: moves" value={last ? last.moves : '–'} color="var(--bad)" sub={last ? `n - i = ${last.moves}: characters shifted` : 'press Insert at cursor'} />
          <Stat label="Moves so far" value={buf.moves} color="var(--bad)" sub="characters shifted in all" />
          <Stat label="Characters written" value={buf.writes} color="var(--hi)" />
          <Stat label="Length" value={n} sub={`of at most ${MAX_TEXT}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'cursor (insert before this cell)', shape: 'dot' },
            { color: 'var(--bad)', label: 'moved by the last edit', shape: 'square' },
            { color: 'var(--hi)', label: 'written by the last insert', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Insert" value={typed} onChange={setTyped} onEnter={insert} width={160} spellCheck={false} />
          <Button variant="primary" onClick={insert}>Insert at cursor</Button>
          <Button onClick={backspace}>Delete before cursor</Button>
          <Button onClick={() => go(cursor - 1)}>Left</Button>
          <Button onClick={() => go(cursor + 1)}>Right</Button>
          <Button onClick={() => go(0)}>Home</Button>
          <Button onClick={() => go(n)}>End</Button>
        </>,
        <>
          <ChipButton tone="info" onClick={() => reset(codePoints(OPEN.array.text).length)}>Type at the end</ChipButton>
          <ChipButton tone="info" onClick={() => reset(0)}>Type at the start</ChipButton>
          <Button onClick={() => reset(OPEN.array.cursor)}>Reset</Button>
          <Hint>
            <span role="status">{note ?? `Click a cell to put the cursor before it, or use the buttons. Positions count Unicode code points, not graphemes. Up to ${MAX_TEXT} characters.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="rg-stage stage-pad">
        <WideRegion minWidth={Math.max(320, (n + 1) * CELL_PX)} label="Text as array cells: scroll sideways to see all of it" gutter={{ top: 8, bottom: 30, x: 4 }} reveal={{ from: cursor / Math.max(1, n), to: (cursor + 1) / Math.max(1, n) }}>
          <ArrayStrip
            values={[...buf.chars.map((c) => (c === ' ' ? '␣' : c)), '']}
            cellClass={(i) => (i === n ? 'rg-end' : '')}
            showIndex
            fontSize={12}
            cellMax={CELL_PX + 8}
            cellState={(i) => (last && i >= last.shifted[0] && i < last.shifted[1] ? 'bad' : last?.kind === 'insert' && i >= last.at && i < last.at + last.k ? 'active' : 'idle')}
            pointers={[{ i: cursor, label: 'cursor', tone: 'info' }]}
            onCellClick={(i) => go(i)}
            cellTitle={(i) => `Put the cursor before position ${i}`}
          />
        </WideRegion>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every move is counted from the array you see</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
