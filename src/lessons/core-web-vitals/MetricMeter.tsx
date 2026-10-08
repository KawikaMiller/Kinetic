import { Bar } from '../../components/Bar';
import { BAND_LABEL, BAND_TONE, METER_MAX, THRESHOLDS, bandOf, formatMetric, type MetricId } from './model';

const NAME: Record<MetricId, string> = { lcp: 'Largest Contentful Paint', inp: 'Interaction to Next Paint', cls: 'Cumulative Layout Shift' };
const METER_HEIGHT = 12;

/** One metric on its three bands: the fill takes the band's colour, with ticks at the good and poor edges. */
export function MetricMeter({ metric, value }: { metric: MetricId; value: number | null }) {
  const t = THRESHOLDS[metric];
  const band = value === null ? null : bandOf(metric, value);
  const summary = value === null ? 'not measured yet' : `${formatMetric(metric, value)} · ${BAND_LABEL[band!]}`;
  return (
    <div className="cwv-meter">
      <div className="cwv-meter-head">
        <span className="cwv-meter-name">{NAME[metric]}</span>
        <span className={`cwv-meter-value ${band ? `tone-${BAND_TONE[band]}` : ''}`}>{summary}</span>
      </div>
      <Bar
        value={value ?? 0}
        max={METER_MAX[metric]}
        tone={band ? BAND_TONE[band] : 'muted'}
        height={METER_HEIGHT}
        markers={[
          { at: t.good, label: `good ≤ ${formatMetric(metric, t.good)}`, tone: 'ok' },
          { at: t.poor, label: `poor > ${formatMetric(metric, t.poor)}`, tone: 'bad' },
        ]}
        ariaLabel={`${NAME[metric]}: ${summary}`}
      />
    </div>
  );
}
