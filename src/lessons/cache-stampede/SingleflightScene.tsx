import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import type { LogRow } from '../../components/logRows';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { integer } from '../../core/format';
import { logText, msText, singleflightCaption } from './captions';
import { initialSingleflight, type SingleflightState } from './init';
import { BROKEN_SEED, LOAD_RANGE, NO_MITIGATION, SCAN_TICKS, WRITE_GAP_MS, gapView, runStampede, violatingSeeds, type GapView } from './model';

const SEEDS_CHECKED = 200;
const ZOOM_MARGIN_MS = 40;
const GAP_GANTT_MIN_WIDTH = 480;
const LANES = [
  { id: 'r1', label: 'recompute 1' },
  { id: 'marker', label: 'marker' },
  { id: 'r2', label: 'recompute 2' },
];

function gapBars(g: GapView, releaseEarly: boolean): GanttBar[] {
  const bars: GanttBar[] = [
    { id: 'q1', lane: 'r1', start: g.startMs, end: g.doneMs, tone: 'bad', label: 'query' },
    { id: 'q1w', lane: 'r1', start: g.doneMs, end: g.writeMs, tone: 'hi', label: 'writing' },
    { id: 'm', lane: 'marker', start: g.startMs, end: releaseEarly ? g.doneMs : g.writeMs, tone: 'info', label: 'held' },
  ];
  if (g.secondMs !== null) bars.push({ id: 'q2', lane: 'r2', start: g.secondMs, end: g.writeMs + ZOOM_MARGIN_MS, tone: 'bad', label: 'a second one' });
  return bars;
}

export function SingleflightScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<SingleflightState>(initialSingleflight);
  const config = useMemo(
    () => ({ lambda: s.lambda, recomputeMs: 500, mitigations: { ...NO_MITIGATION, coalesce: true, releaseEarly: s.releaseEarly } }),
    [s.lambda, s.releaseEarly],
  );
  const run = useMemo(() => runStampede({ ...config, seed: s.seed }), [config, s.seed]);
  const breaking = useMemo(() => violatingSeeds(config, SEEDS_CHECKED, SCAN_TICKS), [config]);
  const gap = gapView(run);
  const rows = useMemo<LogRow[]>(() => run.log.map((e) => ({ id: e.id, at: msText(e.atMs), tone: e.kind === 'second' ? 'bad' : e.kind === 'released' ? 'orange' : undefined, text: logText(e) })), [run.log]);
  const set = (patch: Partial<SingleflightState>) => setS((x) => ({ ...x, ...patch }));

  useIntroCaption(singleflightCaption(run, s.seed, s.releaseEarly), [s.seed, s.lambda, s.releaseEarly]);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Recomputes for this expiry" value={integer(run.summary.queries)} color={run.summary.queries > 1 ? 'var(--bad)' : 'var(--ok)'} sub={[`${integer(run.summary.requests)} requests`]} />
          <Stat label="Most in flight at once" value={run.summary.peakInFlight} color={run.summary.peakInFlight > 1 ? 'var(--bad)' : 'var(--ok)'} sub={['the invariant says at most 1']} />
          <Stat
            label={`Seeds that break it, of ${SEEDS_CHECKED}`}
            value={breaking.length}
            color={breaking.length > 0 ? 'var(--bad)' : 'var(--ok)'}
            sub={[breaking.length ? `lowest: seed ${breaking[0]}` : 'every seed holds the invariant']}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a recompute, or the broken invariant' },
            { color: 'var(--hi)', label: 'the value being written to the cache' },
            { color: 'var(--info)', label: 'the in-flight marker is held' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ChipButton tone="info" onClick={() => set({ seed: BROKEN_SEED, releaseEarly: true })}>show the pinned failing seed</ChipButton>
          <Button onClick={() => setS(initialSingleflight())}>Reset</Button>
        </>,
        <>
          <Toggle label="In-flight marker" value={s.releaseEarly} onChange={(releaseEarly) => set({ releaseEarly })} off="released after the cache is written" on="released before it is written (the bug)" />
          <Slider label="Requests per second (λ)" value={s.lambda} {...LOAD_RANGE} format={(v) => `${v.toLocaleString('en-US')}/s`} onChange={(lambda) => set({ lambda })} />
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="cs-stage stage-pad">
        <Box>
          <SectionTitle hint={`the first recompute, zoomed to the ${WRITE_GAP_MS} ms write gap`}>One recompute per key</SectionTitle>
          {gap ? (
            <WideRegion minWidth={GAP_GANTT_MIN_WIDTH} label="Write gap timeline: scroll sideways to see all of it">
              <GanttLanes
                lanes={LANES}
                bars={gapBars(gap, s.releaseEarly)}
                domain={[gap.doneMs - ZOOM_MARGIN_MS, gap.writeMs + ZOOM_MARGIN_MS]}
                unit=" ms"
                axis
                size="md"
                labelWidth={104}
                ariaLabel="The first recompute, its marker and any second recompute, around the write gap"
              />
            </WideRegion>
          ) : (
            <p className="cs-note">The first recompute has not finished in this run.</p>
          )}
        </Box>
        <Box>
          <SectionTitle hint="from this seed's run, in time order">What the cache did</SectionTitle>
          <LogStream rows={rows} label="Recompute events" maxHeight={180} live="off" empty="No recompute started." />
        </Box>
        <Hint tone="muted" block>
          Request coalescing is on. With the marker released first, a request that arrives while the value is still being written finds neither a marker nor a value and starts a second recompute: the singleflight rule is broken by an ordering mistake.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>the same cache and database as the other scenes; the run stops at the first broken step and keeps it</Provenance>
          <Provenance kind="illustrative">the {WRITE_GAP_MS} ms write gap and the load are made up; the race itself is the real one</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
