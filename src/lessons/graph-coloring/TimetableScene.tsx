import { useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { chromatic, greedyColour, identityOrder, presetById } from './model';
import { timetable, timetableCaption } from './text';

const GRAPH = presetById('timetable').graph;
const N = GRAPH.names.length;
const CELL = 32;
const FONT = 11;

export function TimetableScene({ picker }: { picker: ReactNode }) {
  const [slotOf, setSlotOf] = useState<number[]>(Array<number>(N).fill(0));
  const t = timetable(GRAPH, slotOf);
  const caption = timetableCaption(t);
  const clash = (course: number) => GRAPH.edges.some(([a, b]) => (a === course || b === course) && slotOf[a] > 0 && slotOf[a] === slotOf[b]);

  const place = (slot: number, course: number) => setSlotOf(slotOf.map((s, c) => (c === course ? (s === slot + 1 ? 0 : slot + 1) : s)));

  return (
    <StageFrame
      intro={caption}
      introKey={[caption]}
      height={470}
      stats={
        <Stats>
          <Stat label="Slots in use" value={t.slots} color="var(--info)" sub={t.complete ? 'every course placed' : 'some courses still unplaced'} />
          <Stat label="Clashes" value={t.conflicts} color={t.conflicts ? 'var(--bad)' : 'var(--ok)'} sub="pairs of linked courses in one slot" />
          <Stat label="Greedy, as listed" value={t.greedy} color="var(--orange)" sub="slots" />
          <Stat label="Exact minimum" value={t.optimum} color="var(--ok)" sub="slots" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'course placed in a slot', shape: 'square' },
            { color: 'var(--bad)', label: 'clash: a shared student in one slot', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setSlotOf(greedyColour(GRAPH, identityOrder(N)).colours)}>Fill with greedy</Button>
          <Button onClick={() => setSlotOf(chromatic(GRAPH).colours)}>Fill with the exact minimum</Button>
          <Button onClick={() => setSlotOf(Array<number>(N).fill(0))} disabled={slotOf.every((s) => s === 0)}>
            Clear
          </Button>
        </>,
      ]}
    >
      <div className="gc-stage stage-pad">
        <Tray label="Slots (rows) by courses (columns): press a cell to put that course in that slot" labelWeight="regular" stack ariaLabel="Timetable">
          <CellGrid
            rows={N}
            cols={N}
            size={{ cell: CELL, font: FONT }}
            rowLabels={Array.from({ length: N }, (_, s) => `Slot ${s + 1}`)}
            colLabels={GRAPH.names}
            cell={(slot, course) => {
              if (slotOf[course] !== slot + 1) return { fill: 'none' };
              return clash(course) ? { text: '•', tone: 'bad', fill: 'solid' } : { text: '•', tone: 'info', fill: 'solid' };
            }}
            onCellClick={place}
            cellAriaLabel={(slot, course) => `${GRAPH.names[course]} in slot ${slot + 1}${slotOf[course] === slot + 1 ? ', placed' : ''}${slotOf[course] === slot + 1 && clash(course) ? ', clashes' : ''}. Press to ${slotOf[course] === slot + 1 ? 'remove it' : 'place it here'}`}
            ariaLabel="Exam timetable"
          />
        </Tray>
        <Tray label="Courses that share a student (cannot sit in one slot)" labelWeight="regular" ariaLabel="Linked courses">
          {GRAPH.edges.map(([a, b]) => (
            <span key={`${a}-${b}`} className={`chip gc-peel ${slotOf[a] > 0 && slotOf[a] === slotOf[b] ? 'tone-bad' : ''}`}>
              {GRAPH.names[a]}–{GRAPH.names[b]}
            </span>
          ))}
        </Tray>
        <Hint tone="muted" block>
          This is graph colouring: each course is a node, two courses that share a student are joined, and a slot is a colour. The exact minimum is computed by search, feasible only because the graph is tiny.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="illustrative">invented example: the courses and who takes them are made up</Provenance>
        <Provenance kind="real">greedy and the exact minimum are computed live</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
