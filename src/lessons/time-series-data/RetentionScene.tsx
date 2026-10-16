import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { bytes, plural } from '../../core/format';
import { retentionCaption } from './captions';
import { initialRetentionScene } from './init';
import { POINTS_PER_DAY } from './series';
import { AXIS_REACH, AXIS_TICKS, BUCKET_BYTES, DAY_LIMITS, HOUR_BUCKETS_PER_DAY, MINUTE_BUCKETS_PER_DAY, RAW_BYTES, SPIKE_AGE_DAYS, TIERS, TIER_LABELS, WINDOWS, reach, spikeAfter, storage, tierCovering, type Tier } from './retention';

const TIER_TONE: Record<Tier, 'amber' | 'pink' | 'sky'> = { raw: 'amber', minute: 'pink', hour: 'sky' };
const AXIS_TICK_TONE: Tone = 'muted';

export function RetentionScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialRetentionScene);
  const { policy, window: windowId } = state;

  const stored = storage(policy);
  const win = WINDOWS.find((w) => w.id === windowId)!;
  const answers = tierCovering(policy, win.days);
  const spike = spikeAfter(policy, SPIKE_AGE_DAYS);
  const spikeHolder = spike.tier ?? 'hour';

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
            { color: 'var(--dim)', label: 'a month ago on a tier no query uses', shape: 'square' },
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
          <SectionTitle hint="how far back each tier reaches, now at the left; the scale is logarithmic so a 2-day tier stays readable next to a year">What is kept</SectionTitle>
          <div className="ts-tiers">
            <div className="ts-tier-row" aria-hidden="true">
              <span className="ts-tier-name">days back from now</span>
              <Bar value={0} max={AXIS_REACH} markers={AXIS_TICKS.map((t) => ({ at: reach(t.days), label: t.label, tone: AXIS_TICK_TONE }))} animate={false} />
            </div>
            {TIERS.map((t) => (
              <div key={t} className="ts-tier-row">
                <span className="ts-tier-name"><b>{TIER_LABELS[t]}</b> {plural(policy.days[t], 'day')}</span>
                <Bar
                  value={reach(policy.days[t])}
                  max={AXIS_REACH}
                  tone={TIER_TONE[t]}
                  height={14}
                  markers={[{ at: reach(SPIKE_AGE_DAYS), label: t === spikeHolder ? `spike, ${SPIKE_AGE_DAYS} d ago` : undefined, tone: t === spikeHolder ? (spike.visible ? 'ok' : 'bad') : 'dim' }]}
                  ariaLabel={`${TIER_LABELS[t]}, kept for ${plural(policy.days[t], 'day')}`}
                />
              </div>
            ))}
          </div>
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
