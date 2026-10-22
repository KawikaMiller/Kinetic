import { useState, type ReactNode } from 'react';
import { HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { matrixCaption } from './captions';
import { KEEP_SHARE, PLANE, QUADRANT_LABEL, WORK, hoursSummary, quadrantOf, startPlacement, type Placement } from './model';
import { OPENING } from './opening';

const PLOT = 520;
const allAt = (unique: number): Record<string, Placement> => Object.fromEntries(WORK.map((w) => [w.id, { importance: w.importance, unique }]));
const PRESET_CHIPS = [
  { id: 'start', label: 'As placed', placement: startPlacement },
  { id: 'mine', label: 'Everything is mine', placement: () => allAt(PLANE.max - 1) },
  { id: 'handoff', label: 'Hand it all off', placement: () => allAt(1) },
];

/** Scene 3: importance against your unique contribution, and the hours that placement moves. */
export function MatrixScene({ picker }: { picker: ReactNode }) {
  const [placed, setPlaced] = useState(OPENING.matrix.placed);
  const [chip, setChip] = useState<string | null>(OPENING.matrix.chip);
  const h = hoursSummary(placed);
  const movedCount = WORK.filter((w) => placed[w.id].unique < PLANE.split).length;
  const clamp = (v: number) => Math.min(PLANE.max, Math.max(PLANE.min, v));

  return (
    <StageFrame
      height={560}
      intro={matrixCaption(h, movedCount, WORK.length)}
      introKey={[h.moved, movedCount]}
      stats={
        <Stats>
          <Stat label="Moved to others" value={`${h.moved} h a week`} color="var(--sky)" sub={`load added to others: ${h.added} h`} />
          <Stat label="Hours returned to you" value={`${h.returned} h a week`} color="var(--ok)" sub={`you keep ${Math.round(KEEP_SHARE * 100)}% of moved hours for review`} />
          <Stat label="Your own work kept" value={`${h.kept} h a week`} color="var(--amber)" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--amber)', label: 'work you keep' }, { color: 'var(--sky)', label: 'work that moves to others' }, { color: 'var(--dim)', label: 'the 5-and-5 quadrant lines', shape: 'line' }]} />}
      controls={[
        <>
          {picker}
          {PRESET_CHIPS.map((c) => (
            <ChipButton key={c.id} tone="info" size="md" on={chip === c.id} onClick={() => { setPlaced(c.placement()); setChip(c.id); }}>{c.label}</ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="md-stage stage-pad">
        <Hint tone="muted" block>Drag a point, or focus one and use the arrow keys (Page Up and Page Down pick the previous or next point).</Hint>
        <WideRegion minWidth={PLOT} label="Importance against your unique contribution: scroll sideways to see all of it">
          <Plot2D
            x={{ domain: [PLANE.min, PLANE.max], ticks: 5, label: 'your unique contribution (0 to 10)' }}
            y={{ domain: [PLANE.min, PLANE.max], ticks: 5, label: 'importance (0 to 10)' }}
            width={PLOT}
            height={300}
            ariaLabel="Work items placed by importance and by how unique your contribution is"
          >
            <VLine at={PLANE.split} tone="dim" />
            <HLine at={PLANE.split} tone="dim" />
            <Points
              data={WORK.map((w) => ({ x: placed[w.id].unique, y: placed[w.id].importance, tone: placed[w.id].unique < PLANE.split ? 'sky' : 'amber' }))}
              r={6}
              roving
              labels={(i) => WORK[i].label}
              pointLabel={(i) => `${WORK[i].label}: ${quadrantOf(placed[WORK[i].id].importance, placed[WORK[i].id].unique)}`}
              onDrag={(i, [x, y]) => {
                setChip(null);
                setPlaced((p) => ({ ...p, [WORK[i].id]: { unique: clamp(x), importance: clamp(y) } }));
              }}
            />
          </Plot2D>
        </WideRegion>
        <ul className="md-quadrants">
          {WORK.map((w) => (
            <li key={w.id}><b>{w.label}</b> ({w.hoursPerWeek} h): {QUADRANT_LABEL[quadrantOf(placed[w.id].importance, placed[w.id].unique)]}</li>
          ))}
        </ul>
        <ProvenanceRow>
          <ClaimLabel kind="practice">an importance against unique-contribution grid is a common way to choose what to delegate, not a rule</ClaimLabel>
          <Provenance kind="invented">the work items, their hours and the {Math.round(KEEP_SHARE * 100)}% review share are made up</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
