import { useState } from 'react';
import { CodePanel } from '../components/CodePanel';
import { GanttLanes, type GanttBar } from '../components/GanttLanes';
import { GraphView } from '../components/GraphView';
import { LogStream } from '../components/LogStream';
import type { LogRow } from '../components/logRows';
import { SectionTitle } from '../components/Panel';
import { MetricMeter } from '../components/MetricMeter';
import { Button, Slider, SortTh } from '../components/ui';
import { useSortedRows } from '../components/useSortedRows';
import { timeFrames } from '../core/frames';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 3 kickoff kit round, extractions (#/dev/kit). */
export function DevKitTier3b() {
  return (
    <>
      <SectionTitle>Tier 3 kit · kickoff round, extractions</SectionTitle>
      <Section title="GraphView · underlay (a region in the graph's own coordinates) and labelHalo (K3-5)">
        <UnderlayDemo />
      </Section>
      <Section title="SortTh + useSortedRows · press a heading to sort, again to reverse (K3-4)">
        <SortDemo />
      </Section>
      <Section title="LogStream · a live region that follows the newest row, dims what a filter rules out and scrolls to what it highlights (K3-9)">
        <LogDemo />
      </Section>
      <Section title="GanttLanes · instants: a bar with start = end is a diamond with its label beside it (K3-11)">
        <GanttInstantsDemo />
      </Section>
      <Section title="GanttLanes · a calendar axis (UTC, hours since a Monday) and hideEmptyLanes (K3-12)">
        <GanttCalendarDemo />
      </Section>
      <Section title="MetricMeter · a value against its bands, with a header, a null (not measured) and edge ticks (K3-13)">
        <MeterDemo />
      </Section>
      <Section title="timeFrames · the frames of a clock-driven lesson: intro, plain steps, captioned milestones, summary (K3-14)">
        <TimeFramesDemo />
      </Section>
      <Section title="CodePanel · a long line scrolls inside the panel instead of widening a flex row (K3-6)">
        <LongLineDemo />
      </Section>
    </>
  );
}

const LONG_CODE = [
  'const url = "https://example.com/a/very/long/path/that/never/breaks/because/it/has/no/spaces/at/all/so/the/panel/must/scroll";',
  'fetch(url);',
];

function LongLineDemo() {
  return (
    <div className="devkit-row" style={{ flexWrap: 'nowrap' }}>
      <CodePanel title="flex child, 1 of 2" lines={LONG_CODE} active={0} />
      <CodePanel title="flex child, 2 of 2" lines={['ok();']} />
    </div>
  );
}

const INSTANT_LANES = [
  { id: 'deploys', label: 'deploys' },
  { id: 'pages', label: 'pages' },
];
const INSTANT_BARS: GanttBar[] = [
  { id: 'bar', lane: 'deploys', start: 10, end: 40, tone: 'info' },
  { id: 'd0', lane: 'deploys', start: 0, end: 0, tone: 'ok', label: 'at the very start' },
  { id: 'd1', lane: 'deploys', start: 52, end: 52, tone: 'hi', label: 'canary' },
  { id: 'd2', lane: 'deploys', start: 55, end: 55, tone: 'bad', label: 'rollback' },
  { id: 'p1', lane: 'pages', start: 30, end: 30, tone: 'violet', label: 'page' },
  { id: 'p2', lane: 'pages', start: 100, end: 100, tone: 'bad', label: 'at the very end' },
];

function GanttInstantsDemo() {
  return (
    <div className="devkit-row">
      <div className="devkit-gantt">
        <GanttLanes lanes={INSTANT_LANES} bars={INSTANT_BARS} domain={[0, 100]} axis unit=" min" size="md" ariaLabel="Deploys and pages on a 100 minute axis" />
      </div>
    </div>
  );
}

const CALENDAR_LANES = [
  { id: 'backup', label: 'backups' },
  { id: 'cron', label: 'cron jobs' },
  { id: 'oncall', label: 'on-call' },
  { id: 'later', label: 'next month' },
];
/** Hours since Monday 2026-03-02 00:00 UTC. */
const CALENDAR_BARS: GanttBar[] = [
  { id: 'b1', lane: 'backup', start: 2, end: 3, tone: 'ok', label: 'full' },
  { id: 'b2', lane: 'backup', start: 26, end: 27, tone: 'info' },
  { id: 'b3', lane: 'backup', start: 50, end: 51, tone: 'info' },
  { id: 'c1', lane: 'cron', start: 9, end: 9, tone: 'hi', label: 'report' },
  { id: 'c2', lane: 'cron', start: 33, end: 33, tone: 'hi', label: 'report' },
  { id: 'o1', lane: 'oncall', start: 0, end: 48, tone: 'violet', label: 'Ana' },
  { id: 'o2', lane: 'oncall', start: 48, end: 72, tone: 'sky', label: 'Bo' },
  { id: 'l1', lane: 'later', start: 900, end: 910, tone: 'info' },
];

function GanttCalendarDemo() {
  const [hide, setHide] = useState(true);
  return (
    <>
      <div className="devkit-row">
        <Button onClick={() => setHide((h) => !h)}>{hide ? 'Show empty lanes' : 'Hide empty lanes'}</Button>
      </div>
      <div className="devkit-row">
        <div className="devkit-gantt">
          <GanttLanes
            lanes={CALENDAR_LANES}
            bars={CALENDAR_BARS}
            domain={[0, 72]}
            axis={{ calendar: { start: '2026-03-02T00:00:00Z', unit: 'hour' } }}
            hideEmptyLanes={hide}
            size="md"
            ariaLabel="Three days of backups, cron jobs and on-call shifts, in UTC"
          />
        </div>
      </div>
    </>
  );
}

const DEMO_FRAMES = timeFrames({
  end: 100,
  steps: 5,
  milestones: [{ t: 30, say: 'milestone at 30' }, { t: 120, say: 'late milestone, clamped to the end' }],
  intro: 'intro',
  summary: 'summary',
  hold: 2.5,
});

function TimeFramesDemo() {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>now</th>
          <th>caption</th>
          <th>hold</th>
        </tr>
      </thead>
      <tbody>
        {DEMO_FRAMES.map((f, i) => (
          <tr key={i}>
            <td>{i}</td>
            <td>{f.now}</td>
            <td>{f.say ?? '(keeps the previous caption)'}</td>
            <td>{f.hold ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const METER_MAX = 800;
const DEMO_BANDS = [
  { upTo: 200, tone: 'ok', label: 'good', tick: { label: 'good ≤ 200 ms', tone: 'ok' } },
  { upTo: 500, tone: 'orange', label: 'needs improvement', tick: { label: 'poor > 500 ms', tone: 'bad' } },
  { upTo: METER_MAX, tone: 'bad', label: 'poor' },
] as const;

function MeterDemo() {
  const [v, setV] = useState(320);
  return (
    <>
      <Slider label="Response time" value={v} min={0} max={METER_MAX} step={10} onChange={setV} format={(x) => `${x} ms`} />
      <MetricMeter label="Interaction latency" value={v} unit=" ms" max={METER_MAX} bands={DEMO_BANDS} header={<b>A made-up metric</b>} />
      <MetricMeter label="Not measured" value={null} max={METER_MAX} bands={DEMO_BANDS} />
    </>
  );
}

const REGION_NODES = [
  { id: 'web', label: 'web', at: { x: 90, y: 90 }, shape: 'box' as const },
  { id: 'api', label: 'api', at: { x: 250, y: 90 }, shape: 'box' as const },
  { id: 'db', label: 'db', at: { x: 410, y: 150 }, shape: 'box' as const },
];

function UnderlayDemo() {
  return (
    <GraphView
      nodes={REGION_NODES}
      edges={[
        { from: 'web', to: 'api', label: 'HTTPS' },
        { from: 'api', to: 'db', label: 'SQL' },
        { from: 'web', to: 'db', label: 'skips the api', labelAt: 0.5 },
      ]}
      directed
      width={500}
      height={200}
      box={{ w: 80, h: 38 }}
      labelHalo
      underlay={
        <>
          <rect x={190} y={30} width={280} height={150} rx={12} className="devkit-region" />
          <text x={202} y={50} className="devkit-region-label">
            private network
          </text>
        </>
      }
      ariaLabel="Three services; the api and the db sit in a shaded private-network region drawn as an underlay"
    />
  );
}

interface Plan {
  name: string;
  cost: number;
}
const PLANS: Plan[] = [
  { name: 'index scan', cost: 12 },
  { name: 'seq scan', cost: 140 },
  { name: 'bitmap scan', cost: 12 },
  { name: 'index only', cost: 9 },
];
const PLAN_COLUMNS = { name: (p: Plan) => p.name, cost: (p: Plan) => p.cost };

function SortDemo() {
  const { sorted, headerProps } = useSortedRows(PLANS, PLAN_COLUMNS);
  return (
    <table className="data-table">
      <thead>
        <tr>
          <SortTh {...headerProps('name')}>Plan</SortTh>
          <SortTh {...headerProps('cost')}>Cost</SortTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr key={p.name}>
            <td>{p.name}</td>
            <td>{p.cost}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SOURCES = ['api', 'db', 'queue'] as const;
const SOURCE_TONES = ['info', 'violet', 'amber'] as const;
const LOG_MAX_ROWS = 8;
const LOG_HEIGHT_PX = 150;

function LogDemo() {
  const [rows, setRows] = useState<LogRow[]>([
    { id: 1, at: '12:00:01', level: 'INFO', source: 'api', sourceTone: 'info', text: 'GET /cart 200' },
    { id: 2, at: '12:00:02', level: 'WARN', source: 'db', sourceTone: 'violet', text: 'slow query: 1.2 s' },
  ]);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const add = () =>
    setRows((r) => {
      const n = r.length + 1;
      const error = n % 4 === 0;
      const source = n % SOURCES.length;
      const text = error ? 'upstream timed out' : `handled request ${n}`;
      return [...r, { id: n, at: `12:00:${String(n + 1).padStart(2, '0')}`, level: error ? 'ERROR' : 'INFO', source: SOURCES[source], sourceTone: SOURCE_TONES[source], text }];
    });
  return (
    <>
      <div className="devkit-row">
        <Button onClick={add}>Log a line</Button>
        <Button onClick={() => setOnlyErrors((o) => !o)}>{onlyErrors ? 'Show everything' : 'Highlight errors'}</Button>
      </div>
      <LogStream rows={rows} max={LOG_MAX_ROWS} maxHeight={LOG_HEIGHT_PX} follow highlight={onlyErrors ? (r) => r.level === 'ERROR' : undefined} label="Demo log" />
    </>
  );
}
