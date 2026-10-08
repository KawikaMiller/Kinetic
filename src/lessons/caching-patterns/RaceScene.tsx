import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { DiagramPane } from './DiagramPane';
import { raceFrames } from './frames';
import type { Invalidation, Lane } from './model';
import { BACKSTOP_TTL, DEFAULT_LAG, DEFAULT_TTL_ONLY, race, stalenessWindow, type RaceId } from './races';

const RACES: { value: RaceId; label: string }[] = [
  { value: 'update-set', label: 'Update then set' },
  { value: 'read-fill', label: 'Read fills late' },
  { value: 'replica-lag', label: 'Replica lag' },
  { value: 'ttl-only', label: 'TTL only' },
];
const LANES: Record<RaceId, readonly Lane[]> = {
  'update-set': ['A', 'B', 'cache', 'db'],
  'read-fill': ['A', 'B', 'cache', 'db'],
  'replica-lag': ['A', 'B', 'cache', 'db', 'replica'],
  'ttl-only': ['A', 'B', 'cache', 'db'],
};
const READER_LABELS: Partial<Record<RaceId, Partial<Record<Lane, string>>>> = {
  'read-fill': { A: 'Reader A', B: 'Writer B' },
  'replica-lag': { A: 'Reader A', B: 'Writer B' },
  'ttl-only': { A: 'Reader A', B: 'Writer B' },
};
const STEP_MS = 1500;
const GANTT_MIN_W = 480;
const HONEST = 'Simulated cache and database; the interleavings are scripted worst cases, and every time is illustrative. The tests for this lesson enumerate every interleaving of two operations.';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'cache hit' },
      { color: 'var(--hi)', label: 'miss / fill' },
      { color: 'var(--info)', label: 'database read or write' },
      { color: 'var(--violet)', label: 'invalidation (delete)' },
      { color: 'var(--sky)', label: 'write into the cache' },
      { color: 'var(--orange)', label: 'stale value' },
    ]}
  />
);

export function RaceScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<RaceId>('update-set');
  const [invalidate, setInvalidate] = useState<Invalidation>('set');
  const [backstop, setBackstop] = useState(false);
  const [lag, setLag] = useState(DEFAULT_LAG);
  const [ttlOnly, setTtlOnly] = useState(DEFAULT_TTL_ONLY);

  const ttl = id === 'ttl-only' ? ttlOnly : backstop ? BACKSTOP_TTL : null;
  const result = useMemo(() => race(id, { invalidate, ttl, lag }), [id, invalidate, ttl, lag]);
  const frames = useMemo(() => raceFrames(result, invalidate, lag), [result, invalidate, lag]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  /** A changed setting shows the finished race straight away; Restart replays it. */
  const change = (apply: () => void) => {
    player.queueNext({ play: false, from: Number.MAX_SAFE_INTEGER });
    apply();
  };

  return (
    <StageFrame
      player={player}
      height={460}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Race" value={id} onChange={(v) => change(() => setId(v))} options={RACES} />
        </>,
        <>
          {(id === 'update-set' || id === 'read-fill') && (
            <Toggle label="Writers" value={invalidate === 'set'} onChange={(v) => change(() => setInvalidate(v ? 'set' : 'delete'))} off="Delete the key" on="Overwrite the key" />
          )}
          {id !== 'ttl-only' && <Toggle label="TTL backstop" value={backstop} onChange={(v) => change(() => setBackstop(v))} off="None" on={`${BACKSTOP_TTL} s`} />}
          {id === 'replica-lag' && <Slider label="Replica lag" value={lag} min={0} max={8} onChange={(v) => change(() => setLag(v))} format={(v) => `${v} s`} />}
          {id === 'ttl-only' && <Slider label="TTL" value={ttlOnly} min={5} max={60} step={5} onChange={(v) => change(() => setTtlOnly(v))} format={(v) => `${v} s`} />}
        </>,
      ]}
    >
      <div className="stage-pad cp">
        <DiagramPane
          lanes={LANES[id]}
          labels={READER_LABELS[id]}
          beats={result.beats}
          index={player.frame.index}
          start={result.start}
          ariaLabel={`${RACES.find((r) => r.value === id)!.label} race`}
        />
        {id === 'ttl-only' && <StalenessWindow ttl={ttlOnly} />}
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

/** The TTL-only race as two lanes on a time axis: what the database holds, and what a reader of the cache is told. */
function StalenessWindow({ ttl }: { ttl: number }) {
  const w = useMemo(() => stalenessWindow(ttl), [ttl]);
  const bars: GanttBar[] = w.bars.map((b, i) => ({
    id: `s${i}`, lane: b.lane, start: b.start, end: b.end, tone: b.stale ? 'orange' : 'info', label: b.value,
  }));
  return (
    <div className="cp-window">
      <SectionTitle weight="regular" hint={`the write lands ${w.write} s in, the entry expires at ${w.expiry} s: stale for ${w.window} s`}>Staleness window</SectionTitle>
      <WideRegion minWidth={GANTT_MIN_W} label="Staleness window: scroll sideways to see all of it">
        <GanttLanes
          lanes={[{ id: 'db', label: 'database' }, { id: 'cache', label: 'cache serves' }]}
          bars={bars}
          domain={w.domain}
          markers={[{ at: w.write, label: 'write', tone: 'info' }, { at: w.expiry, label: 'TTL', tone: 'violet' }]}
          unit=" s"
          axis
          size="md"
          labelWidth={92}
          ariaLabel={`The cache serves the old price for ${w.window} seconds after the write`}
        />
      </WideRegion>
    </div>
  );
}
