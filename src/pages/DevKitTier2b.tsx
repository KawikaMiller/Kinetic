import { useMemo, useState } from 'react';
import { ConfusionMatrix, type ConfusionCell } from '../components/ConfusionMatrix';
import { GanttLanes, type GanttBar } from '../components/GanttLanes';
import { SectionTitle } from '../components/Panel';
import { ChipButton, Slider, Toggle } from '../components/ui';
import { twoClassScores } from '../core/fixtures/datasets';
import { confusionAt } from '../core/stats';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 2 P0-b kit, rendered after DevKitTier2 (#/dev/kit). */
export function DevKitTier2b() {
  return (
    <>
      <SectionTitle>Tier 2 kit · P0-b</SectionTitle>
      <Section title="GanttLanes · round-robin CPU: work, wait (hatched), blocked on I/O (dashed), markers, axis; click a bar">
        <GanttDemo />
      </Section>
      <Section title="ConfusionMatrix · seeded twoClassScores, a threshold slider, share toggle and a highlighted cell">
        <ConfusionDemo />
      </Section>
    </>
  );
}

const SCORES = twoClassScores({ seed: 7, positives: 60, negatives: 240, separation: 2 });
const CELLS: ConfusionCell[] = ['tp', 'fp', 'fn', 'tn'];

function ConfusionDemo() {
  const [threshold, setThreshold] = useState(0.5);
  const [share, setShare] = useState(false);
  const [highlight, setHighlight] = useState<ConfusionCell | undefined>('fn');
  const counts = useMemo(() => confusionAt(SCORES, threshold), [threshold]);
  return (
    <div className="devkit-row">
      <ConfusionMatrix {...counts} labels={{ positive: 'spam', negative: 'not spam' }} share={share} highlight={highlight} />
      <div className="devkit-controls">
        <Slider label="Threshold" value={threshold} min={0} max={1} step={0.01} onChange={setThreshold} format={(v) => v.toFixed(2)} />
        <Toggle label="Cells show" value={share} onChange={setShare} off="Counts" on="Counts + share" />
        <div className="control-group-items">
          {CELLS.map((c) => (
            <ChipButton key={c} on={highlight === c} onClick={() => setHighlight(highlight === c ? undefined : c)}>
              {c.toUpperCase()}
            </ChipButton>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Round robin, quantum 4 ms: P2 blocks on disk I/O, P3 arrives at 2 ms. */
const RR_BARS: GanttBar[] = [
  { id: 'p1a', lane: 'p1', start: 0, end: 4, tone: 'info', label: 'P1' },
  { id: 'p2w', lane: 'p2', start: 0, end: 4, tone: 'violet', kind: 'wait' },
  { id: 'p2a', lane: 'p2', start: 4, end: 7, tone: 'violet', label: 'P2' },
  { id: 'p2io', lane: 'p2', start: 7, end: 15, tone: 'violet', kind: 'blocked', label: 'disk' },
  { id: 'p3w', lane: 'p3', start: 2, end: 7, tone: 'orange', kind: 'wait' },
  { id: 'p3a', lane: 'p3', start: 7, end: 11, tone: 'orange', label: 'P3' },
  { id: 'p1w', lane: 'p1', start: 4, end: 11, tone: 'info', kind: 'wait' },
  { id: 'p1b', lane: 'p1', start: 11, end: 15, tone: 'info', label: 'P1' },
  { id: 'p2b', lane: 'p2', start: 15, end: 18, tone: 'violet', label: 'P2' },
];
const RR_LANES = [
  { id: 'p1', label: 'P1' },
  { id: 'p2', label: 'P2' },
  { id: 'p3', label: 'P3' },
];

function GanttDemo() {
  const [now, setNow] = useState(9);
  const [picked, setPicked] = useState<string | null>('p2io');
  const bars = RR_BARS.map((b) => ({ ...b, ring: b.id === picked ? ('hi' as const) : undefined }));
  return (
    <div className="devkit-row">
      <div className="devkit-gantt">
        <GanttLanes
          lanes={RR_LANES}
          bars={bars}
          domain={[0, 20]}
          now={now}
          unit=" ms"
          axis
          size="md"
          markers={[{ at: 2, label: 'P3 arrives', tone: 'orange' }, { at: 18, label: 'all done', tone: 'ok' }]}
          onBarClick={setPicked}
          ariaLabel="Round-robin schedule of three processes"
        />
      </div>
      <div className="devkit-controls">
        <Slider label="Clock" value={now} min={0} max={20} step={0.5} onChange={setNow} format={(v) => `${v} ms`} />
        <span className="hint is-muted">Picked: {picked ?? 'nothing'}</span>
      </div>
    </div>
  );
}
