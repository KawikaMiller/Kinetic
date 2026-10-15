import { useState, type ReactNode } from 'react';
import { MetricMeter } from '../../components/MetricMeter';
import { Band, Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText, sig } from '../distributions/fmt';
import { forecastCaption, growthNote, rps } from './frames';
import {
  FORECAST_MONTHS, GROWTH_RANGE, HEADROOM_RANGE, INSTANCES_RANGE, KNEE_PER_INSTANCE, LEAD_WEEKS_RANGE, PLAN_DEFAULT, REDUNDANCY, REDUNDANCY_NAME, SPIKE_FACTOR_RANGE,
  SPIKE_MONTH_RANGE, firstCrossing, forecastPeak, orderByMonth, parsePeak, planCapacity, trendPeak, type Plan, type Redundancy,
} from './model';

const REDUNDANCY_OPTIONS = REDUNDANCY.map((r) => ({ value: r, label: REDUNDANCY_NAME[r] }));
const PLOT_HEADROOM = 1.25;

export function ForecastScene({ picker }: { picker: ReactNode }) {
  const [plan, setPlan] = useState<Plan>(PLAN_DEFAULT);
  const [peakText, setPeakText] = useState(String(PLAN_DEFAULT.peak));
  const [peakError, setPeakError] = useState<string | null>(null);
  const set = (patch: Partial<Plan>) => setPlan((p) => ({ ...p, ...patch }));

  const cap = planCapacity(plan);
  const crossing = firstCrossing(plan);
  const order = orderByMonth(crossing, plan.leadWeeks);
  const top = Math.max(cap / (1 - plan.headroom), ...Array.from({ length: FORECAST_MONTHS + 1 }, (_, m) => forecastPeak(plan, m))) * PLOT_HEADROOM;

  useIntroCaption(forecastCaption(plan), [plan]);

  const typePeak = (text: string) => {
    setPeakText(text);
    const parsed = parsePeak(text);
    if (parsed.ok) {
      setPeakError(null);
      set({ peak: parsed.value });
    } else {
      setPeakError(parsed.error);
    }
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Capacity of the plan" value={rps(cap)} sub={[`${plan.instances} instances × ${sig(KNEE_PER_INSTANCE)}/s knee`, `after ${REDUNDANCY_NAME[plan.redundancy]} and ${pctText(plan.headroom, 0)} headroom`]} />
          <Stat
            label="Crosses capacity"
            value={crossing.month === null ? 'never' : crossing.month === 0 ? 'now' : `month ${crossing.month}`}
            color={crossing.month === null ? 'var(--ok)' : 'var(--bad)'}
            sub={[crossing.cause === 'spike' ? 'the spike, before the trend' : crossing.cause === 'trend' ? 'the trend' : crossing.cause === 'now' ? 'already over' : 'growth does not outrun capacity']}
          />
          <Stat
            label="Order by"
            value={order === null ? '–' : order < 0 ? 'already late' : `month ${sig(order, 2)}`}
            color="var(--hi)"
            sub={[`${plan.leadWeeks} weeks of lead time`, order !== null && order < 0 ? `${sig(-order)} months ago` : 'crossing month less the lead time']}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'forecast peak', shape: 'line' },
            { color: 'var(--ok)', label: 'capacity', shape: 'line' },
            { color: 'color-mix(in srgb, var(--info) 40%, transparent)', label: 'headroom kept free' },
            { color: 'var(--bad)', label: 'forecast over capacity', shape: 'line' },
            { color: 'var(--hi)', label: 'order-by date', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Peak requests/s" value={peakText} onChange={typePeak} onBlur={() => { setPeakText(String(plan.peak)); setPeakError(null); }} width={110} spellCheck={false} />
          {peakError && <span className="cp-error" role="status">{peakError} Keeping {plan.peak.toLocaleString('en-US')}.</span>}
          <Toggle label="Growth" value={plan.growthKind === 'linear'} onChange={(on) => set({ growthKind: on ? 'linear' : 'compound' })} off="Compound" on="Linear" />
          <Slider label="Growth a month" value={plan.growth} {...GROWTH_RANGE} format={(v) => pctText(v, 0)} onChange={(growth) => set({ growth })} />
        </>,
        <>
          <Slider label="Spike in month" value={plan.spikeMonth} {...SPIKE_MONTH_RANGE} onChange={(spikeMonth) => set({ spikeMonth })} />
          <Slider label="Spike factor" value={plan.spikeFactor} {...SPIKE_FACTOR_RANGE} format={(v) => `×${sig(v, 2)}`} onChange={(spikeFactor) => set({ spikeFactor })} />
          <Slider label="Instances" value={plan.instances} {...INSTANCES_RANGE} onChange={(instances) => set({ instances })} />
        </>,
        <>
          <Slider label="Headroom" value={plan.headroom} {...HEADROOM_RANGE} format={(v) => pctText(v, 0)} onChange={(headroom) => set({ headroom })} />
          <Segmented label="Redundancy" value={plan.redundancy} onChange={(redundancy: Redundancy) => set({ redundancy })} options={REDUNDANCY_OPTIONS} />
          <Slider label="Lead time" value={plan.leadWeeks} {...LEAD_WEEKS_RANGE} format={(v) => `${v} weeks`} onChange={(leadWeeks) => set({ leadWeeks })} />
        </>,
      ]}
    >
      <div className="cp-stage stage-pad">
        <Plot2D
          x={{ domain: [0, FORECAST_MONTHS], label: 'months from now', ticks: 6 }}
          y={{ domain: [0, top], label: 'peak requests/s', format: (v) => sig(v, 3), ticks: 4 }}
          ariaLabel={`Forecast peak against capacity ${rps(cap)}: ${crossing.month === null ? 'it never crosses' : `it crosses in month ${crossing.month}`}`}
        >
          <Band lo={cap} hi={cap / (1 - plan.headroom)} tone="info" />
          <HLine at={cap} tone="ok" dashed={false} label="capacity" />
          <Curve fn={(m) => trendPeak(plan, m)} tone="violet" />
          <Curve fn={(m) => (trendPeak(plan, m) >= cap ? trendPeak(plan, m) : NaN)} tone="bad" />
          {plan.spikeFactor > 1 && <Points data={[{ x: plan.spikeMonth, y: forecastPeak(plan, plan.spikeMonth), tone: forecastPeak(plan, plan.spikeMonth) >= cap ? 'bad' : 'violet' }]} r={4.5} />}
          {crossing.month !== null && crossing.month <= FORECAST_MONTHS && <VLine at={crossing.month} tone="bad" dashed />}
          {order !== null && order >= 0 && order <= FORECAST_MONTHS && <VLine at={order} tone="hi" label="order by" dashed />}
        </Plot2D>
        <MetricMeter
          label="Headroom today"
          value={(cap - plan.peak) / cap}
          max={1}
          format={(v) => pctText(v, 0)}
          bands={[
            { upTo: 0, tone: 'bad', label: 'already over capacity' },
            { upTo: 0.2, tone: 'orange', label: 'thin' },
            { upTo: 1, tone: 'ok', label: 'room to grow' },
          ]}
          className="cp-meter"
        />
        <Hint tone="muted" className="cp-note">{growthNote(plan.growth)}</Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative">the peak, growth, spike, headroom and lead time are your own numbers; each instance&apos;s knee comes from scene 1&apos;s default service</Provenance>
          <Provenance kind="from-memory">N + 1 and zone-loss are common redundancy rules; check what your platform promises</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
