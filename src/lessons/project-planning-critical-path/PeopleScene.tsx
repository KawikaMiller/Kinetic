import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { barLabelPx } from '../../core/gantt';
import { peopleCaption } from './captions';
import { CALENDAR_START, PRESET, cpm, endHours, startHours } from './cpm';
import { OPENING } from './opening';
import { MAX_ENGINEERS, listSchedule, lowerBounds, optimalMakespan } from './schedule';

const GANTT_MIN_WIDTH = 480;
const CRITICAL = new Set(cpm(PRESET).critical);
/** Engineers take the plain categorical tones, never a verdict colour. */
const ENGINEER_TONES = ['amber', 'pink', 'sky', 'orange', 'violet', 'muted'] as const;

/** Scene 3: the preset on 1 to 6 engineers, a list schedule against two lower bounds and a brute-force optimum. */
export function PeopleScene({ picker }: { picker: ReactNode }) {
  const [engineers, setEngineers] = useState(OPENING.people.engineers);
  const placed = useMemo(() => listSchedule(PRESET, engineers), [engineers]);
  const bounds = useMemo(() => lowerBounds(PRESET, engineers), [engineers]);
  const optimum = useMemo(() => optimalMakespan(PRESET, engineers), [engineers]);
  const lanes = Array.from({ length: engineers }, (_, i) => ({ id: `e${i}`, label: `Engineer ${i + 1}` }));
  const bars: GanttBar[] = placed.slots.map((s) => ({
    id: s.id, lane: `e${s.engineer}`, start: startHours(s.start), end: endHours(s.end),
    tone: ENGINEER_TONES[s.engineer], label: PRESET.tasks.find((t) => t.id === s.id)!.label, ring: CRITICAL.has(s.id) ? 'hi' : undefined,
  }));
  const end = endHours(Math.max(placed.makespan, bounds.criticalPath));

  return (
    <StageFrame
      height={520}
      intro={peopleCaption(engineers, placed, bounds, optimum)}
      introKey={engineers}
      stats={
        <Stats>
          <Stat label="List schedule" value={`${placed.makespan} days`} color="var(--ok)" sub="longest remaining chain first" />
          <Stat label="Lower bounds" value={`${bounds.criticalPath} and ${bounds.workShare}`} sub={['critical path', `work shared evenly (${PRESET.tasks.reduce((s, t) => s + t.days, 0)} days of work / ${engineers})`]} />
          <Stat label="Best possible (brute force)" value={optimum === null ? '–' : `${optimum} days`} sub="over every task order" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'outline: a task on the critical path', shape: 'square' },
            { color: 'var(--amber)', label: 'one tone per engineer (Engineer 1 amber, 2 pink, 3 sky, 4 orange, 5 violet, 6 grey)' },
          ]}
        />
      }
      controls={[<>{picker}<Slider label="Engineers" value={engineers} min={1} max={MAX_ENGINEERS} onChange={setEngineers} /></>]}
    >
      <div className="pp-stage stage-pad">
        <WideRegion minWidth={GANTT_MIN_WIDTH} label="Schedule by engineer: scroll sideways to see all of it">
          <GanttLanes
            lanes={lanes}
            bars={bars}
            domain={[0, end]}
            axis={{ calendar: { start: CALENDAR_START, unit: 'day' } }}
            size="md"
            labelWidth={86}
            labelMinPx={barLabelPx('Integrate')}
            ariaLabel={`Schedule on ${engineers} engineers finishing on day ${placed.makespan}`}
          />
        </WideRegion>
        <ProvenanceRow>
          <ClaimLabel kind="standard">list scheduling and its (2 - 1/n) guarantee against the optimum are Graham&apos;s result (1960s, from memory); the lesson checks the bound on seeded graphs</ClaimLabel>
          <Provenance kind="invented">the preset tasks and durations; one engineer per task and no pre-emption are simplifications</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
