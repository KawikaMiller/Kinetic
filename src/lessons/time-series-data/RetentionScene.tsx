import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, plural } from '../../core/format';
import { retentionCaption } from './captions';
import { initialRetentionScene } from './init';
import { POINTS_PER_DAY } from './series';
import { BUCKET_BYTES, DAY_LIMITS, HOUR_BUCKETS_PER_DAY, MINUTE_BUCKETS_PER_DAY, NOW_DAY, RAW_BYTES, SPIKE_AGE_DAYS, TIERS, TIER_LABELS, WINDOWS, spikeAfter, storage, tierCovering, type Tier } from './retention';

const CALENDAR = '2025-01-01T00:00:00Z';
const TIER_TONE: Record<Tier, 'amber' | 'pink' | 'sky'> = { raw: 'amber', minute: 'pink', hour: 'sky' };
const GANTT_MIN_WIDTH = 620;

export function RetentionScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialRetentionScene);
  const { policy, window: windowId } = state;

  const stored = storage(policy);
  const win = WINDOWS.find((w) => w.id === windowId)!;
  const answers = tierCovering(policy, win.days);
  const spike = spikeAfter(policy, SPIKE_AGE_DAYS);

  const bars: GanttBar[] = useMemo(
    () => TIERS.map((t) => ({ id: t, lane: t, start: (NOW_DAY - policy.days[t]) * 24, end: NOW_DAY * 24, tone: TIER_TONE[t], label: `${policy.days[t]} d` })),
    [policy],
  );

  useIntroCaption(retentionCaption(policy, win.label, answers, stored.total, spike), [policy, windowId]);

  const setDays = (t: Tier, v: number) => setState((s) => ({ ...s, policy: { ...s.policy, days: { ...s.policy.days, [t]: v } } }));

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Stored per series" value={bytes(stored.total)} sub={TIERS.map((t) => `${TIER_LABELS[t]}: ${bytes(stored[t])}`)} />
          <Stat label={`${win.label} comes from`} value={answers === null ? 'nothing' : TIER_LABELS[answers]} color={answers === null ? 'var(--bad)' : undefined} sub={answers === null ? 'older than every tier' : 'the finest tier that reaches back that far'} />
          <Stat label="Last month's spike" value={spike.tier === null ? 'gone' : spike.visible ? 'visible' : 'erased'} color={spike.visible ? 'var(--ok)' : 'var(--bad)'} sub={spike.shown === null ? 'no tier holds it' : `shown as ${spike.shown.toFixed(2)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'raw tier', shape: 'square' },
            { color: 'var(--pink)', label: '1-minute tier', shape: 'square' },
            { color: 'var(--sky)', label: '1-hour tier', shape: 'square' },
            { color: 'var(--ok)', label: 'a spike that survives', shape: 'square' },
            { color: 'var(--bad)', label: 'a spike erased or gone', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {TIERS.map((t) => (
            <Slider key={t} label={`Keep ${t}`} value={policy.days[t]} min={DAY_LIMITS[t][0]} max={DAY_LIMITS[t][1]} format={(v) => plural(v, 'day')} onChange={(v) => setDays(t, v)} />
          ))}
        </>,
        <>
          <Toggle label="Rollups keep" value={policy.keeps === 'full'} onChange={(f) => setState((s) => ({ ...s, policy: { ...s.policy, keeps: f ? 'full' : 'average' } }))} off="Average only" on="Sum, count, min, max" />
          <Segmented label="Query window" value={windowId} onChange={(w) => setState((s) => ({ ...s, window: w }))} options={WINDOWS.map((w) => ({ value: w.id, label: w.label }))} />
        </>,
      ]}
    >
      <div className="ts-stage stage-pad">
        <Box>
          <SectionTitle hint="each tier is kept for the last N days up to now (UTC)">What is kept</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Retention tiers on a calendar: scroll sideways to see all of it">
            <GanttLanes
              lanes={TIERS.map((t) => ({ id: t, label: TIER_LABELS[t] }))}
              bars={bars}
              domain={[0, NOW_DAY * 24]}
              axis={{ calendar: { start: CALENDAR, unit: 'week' } }}
              markers={[{ at: (NOW_DAY - SPIKE_AGE_DAYS) * 24, label: 'spike', tone: spike.visible ? 'ok' : 'bad' }]}
              size="md"
              labelWidth={128}
              ariaLabel="The span of time each retention tier covers, with a spike a month old marked"
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="a layout this lesson states, not any database's">How storage is counted</SectionTitle>
          <p className="ts-note">
            Raw: {POINTS_PER_DAY.toLocaleString('en-US')} points a day at {RAW_BYTES} B. Minute rollups: {MINUTE_BUCKETS_PER_DAY.toLocaleString('en-US')} buckets a day, hour rollups: {HOUR_BUCKETS_PER_DAY} a day, at {BUCKET_BYTES[policy.keeps]} B each ({policy.keeps === 'average' ? 'a timestamp and an average' : 'a timestamp with sum, count, min and max'}).
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">retention policies and byte sizes are this lesson&rsquo;s own; real systems choose their own tiers and layouts</Provenance>
          <Provenance kind="simulated">the spike is a one-minute rise rolled up by the same code as the previous scene, then judged visible when it keeps at least half its height</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
