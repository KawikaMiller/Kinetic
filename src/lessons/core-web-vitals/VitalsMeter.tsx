import { MetricMeter } from '../../components/MetricMeter';
import { BAND_LABEL, BAND_TONE, METER_MAX, THRESHOLDS, formatMetric, type MetricId } from './model';

const NAME: Record<MetricId, string> = { lcp: 'Largest Contentful Paint', inp: 'Interaction to Next Paint', cls: 'Cumulative Layout Shift' };

/** One Core Web Vital on its three bands: the shared meter, given this lesson's names, thresholds and ticks at the good and poor edges. */
export function VitalsMeter({ metric, value }: { metric: MetricId; value: number | null }) {
  const t = THRESHOLDS[metric];
  return (
    <MetricMeter
      label={NAME[metric]}
      value={value}
      max={METER_MAX[metric]}
      format={(v) => formatMetric(metric, v)}
      bands={[
        { upTo: t.good, tone: BAND_TONE.good, label: BAND_LABEL.good, tick: { label: `good ≤ ${formatMetric(metric, t.good)}`, tone: 'ok' } },
        { upTo: t.poor, tone: BAND_TONE.needs, label: BAND_LABEL.needs, tick: { label: `poor > ${formatMetric(metric, t.poor)}`, tone: 'bad' } },
        { upTo: METER_MAX[metric], tone: BAND_TONE.poor, label: BAND_LABEL.poor },
      ]}
    />
  );
}
