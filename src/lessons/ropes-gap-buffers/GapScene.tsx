import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { plural } from '../../core/format';
import { MAX_TEXT, OPEN, checkInsert } from './editing';
import { SCRIPTS, SCRIPT_TEXT_LENGTH, scriptCost } from './scripts';
import { codePoints, gapBackspace, gapCreate, gapInsert, gapLength, gapMoveTo, type GapBuffer } from './structures';

const CELL_PX = 22;
const copy = (g: GapBuffer): GapBuffer => ({ ...g, buf: [...g.buf] });
const start = (): GapBuffer => gapCreate(codePoints(OPEN.gap.text), OPEN.gap.capacity);

interface Last {
  what: string;
  moves: number;
  grew: boolean;
}

/** Scene 2: the gap buffer. The gap follows the cursor, so typing is cheap and a far jump carries the gap across the text. */
export function GapScene({ picker }: { picker: ReactNode }) {
  const [gap, setGap] = useState(start);
  const [typed, setTyped] = useState<string>(OPEN.gap.insert);
  const [last, setLast] = useState<Last | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const scripts = useMemo(() => SCRIPTS.map((s) => ({ ...s, cost: scriptCost(s.id) })), []);
  const n = gapLength(gap);
  const cap = gap.buf.length;
  const gapSize = gap.end - gap.start;

  const insert = () => {
    const r = checkInsert(n, typed);
    if (!r.ok) return setNote(r.error);
    const next = copy(gap);
    gapInsert(next, next.start, r.items);
    setGap(next);
    setLast({ what: `Typed ${plural(r.items.length, 'character')}`, moves: next.moves - gap.moves, grew: next.grows > gap.grows });
    setNote(null);
  };
  const backspace = () => {
    if (gap.start === 0) return setNote('Nothing before the cursor to delete: the cursor is at the start.');
    const next = copy(gap);
    gapBackspace(next);
    setGap(next);
    setLast({ what: 'Deleted the character before the cursor (the gap widened backwards)', moves: 0, grew: false });
    setNote(null);
  };
  const moveTo = (to: number) => {
    const target = Math.min(n, Math.max(0, to));
    const next = copy(gap);
    gapMoveTo(next, target);
    setGap(next);
    setLast({ what: `Moved the cursor from ${gap.start} to ${target}`, moves: next.moves - gap.moves, grew: false });
    setNote(null);
  };
  const reset = () => {
    setGap(start());
    setLast(null);
    setNote(null);
  };

  const intro = last ? (
    <>
      {last.what}: {last.moves} {last.moves === 1 ? 'character' : 'characters'} crossed the gap{last.grew ? `, and the buffer doubled to ${cap} cells, copying the text over` : ''}. In all: {gap.moves} moves, {gap.writes} writes, {gap.copies} copied when growing.
    </>
  ) : (
    <>
      The text sits in two pieces with a gap at the cursor: {gap.start} characters before it, {n - gap.start} after, a gap of {gapSize} empty cells in a buffer of {cap}. Typing writes into the gap (1 write each); moving the cursor by d carries d characters across it.
    </>
  );

  return (
    <StageFrame
      height={380}
      intro={intro}
      introKey={[last, gap]}
      stats={
        <Stats>
          <Stat label="Last action: moves" value={last ? last.moves : '–'} color="var(--bad)" sub="characters carried across the gap" />
          <Stat label="Moves so far" value={gap.moves} color="var(--bad)" />
          <Stat label="Writes" value={gap.writes} color="var(--hi)" />
          <Stat label="Capacity" value={cap} sub={`gap ${gapSize}, text ${n}; doublings ${gap.grows}, copied ${gap.copies}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'cursor (the start of the gap)', shape: 'dot' },
            { color: 'var(--dim)', label: 'the gap: empty cells', shape: 'square' },
            { color: 'var(--hi)', label: 'characters written', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Type" value={typed} onChange={setTyped} onEnter={insert} width={160} spellCheck={false} />
          <Button variant="primary" onClick={insert}>Type at cursor</Button>
          <Button onClick={backspace}>Delete before cursor</Button>
          <Button onClick={() => moveTo(gap.start - 1)}>Left</Button>
          <Button onClick={() => moveTo(gap.start + 1)}>Right</Button>
          <Button onClick={() => moveTo(0)}>Jump to start</Button>
          <Button onClick={() => moveTo(n)}>Jump to end</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="rg-stage stage-pad">
        <WideRegion minWidth={Math.max(320, cap * CELL_PX)} label="The gap buffer: scroll sideways to see all of it" gutter={{ top: 8, bottom: 30, x: 4 }} reveal={{ from: gap.start / cap, to: (gap.start + 1) / cap }}>
          <ArrayStrip
            values={gap.buf.map((c) => (c === null ? '' : c === ' ' ? '␣' : c))}
            fontSize={12}
            cellMax={CELL_PX + 8}
            showIndex
            cellClass={(i) => (i >= gap.start && i < gap.end ? 'rg-gap' : '')}
            cellState={(i) => (i >= gap.start && i < gap.end ? 'dim' : 'idle')}
            pointers={[{ i: gap.start, label: 'cursor', tone: 'info' }]}
          />
        </WideRegion>
        <table className="rg-table">
          <caption>Two scripts on a {SCRIPT_TEXT_LENGTH.toLocaleString('en-US')}-character file (model only, seeded, the same edits on both): touches are characters moved, written or copied.</caption>
          <thead><tr><th scope="col">Script</th><th scope="col">Gap buffer</th><th scope="col">Plain array</th><th scope="col">Longest jump</th></tr></thead>
          <tbody>
            {scripts.map((s) => (
              <tr key={s.id}>
                <th scope="row" data-label="Script">{s.label}<span className="rg-sub">{s.what}</span></th>
                <td data-label="Gap buffer" className={s.cost.gap < s.cost.array ? 'rg-win' : 'rg-lose'}>{s.cost.gap.toLocaleString('en-US')}</td>
                <td data-label="Plain array" className={s.cost.array < s.cost.gap ? 'rg-win' : 'rg-lose'}>{s.cost.array.toLocaleString('en-US')}</td>
                <td data-label="Longest jump">{s.cost.longestJump.toLocaleString('en-US')} characters</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Hint>
          <span role="status">{note ?? `Type, move the cursor, then jump to the other end and type one letter: the gap crosses the whole text once, then typing is cheap again. Up to ${MAX_TEXT} characters; the buffer doubles when the gap would run out.`}</span>
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every move, write and copy is counted from the buffer you see</Provenance>
        <Provenance kind="toy">the two scripts are seeded generators, not recorded editing</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
