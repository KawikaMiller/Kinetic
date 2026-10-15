import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MetricMeter } from '../../components/MetricMeter';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { ruleCaption } from './captions';
import { FOR_MAX, METRIC_LABEL, THRESHOLD_RANGE, judge, pageMinutes, type Metric } from './rules';
import { PAGE_BANDS, PAGE_METER_MAX } from './bands';
import { WeekPlot } from './WeekPlot';
import { INCIDENTS, WEEK, WEEK_SEED } from './week';

const DEFAULT_THRESHOLDS: Record<Metric, number> = { cpu: 80, errors: 1 };
const DEFAULT_FOR = 0;

export function RuleScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [metric, setMetric] = useState<Metric>('cpu');
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [forMinutes, setForMinutes] = useState(DEFAULT_FOR);
  const threshold = thresholds[metric];
  const range = THRESHOLD_RANGE[metric];
  const fires = useMemo(() => pageMinutes(metric === 'errors' ? WEEK.errors : WEEK.cpu, threshold, forMinutes), [metric, threshold, forMinutes]);
  const verdict = useMemo(() => judge(fires), [fires]);

  useEffect(() => {
    setCaption(ruleCaption(metric, threshold, forMinutes, fires), { quiet: true });
  }, [setCaption, metric, threshold, forMinutes, fires]);

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="During a real incident" value={verdict.useful} color={verdict.useful > 0 ? 'var(--ok)' : undefined} sub="useful pages" />
          <Stat label="With no incident" value={verdict.falsePages} color={verdict.falsePages > 0 ? 'var(--orange)' : undefined} sub="false pages" />
          <Stat label="Incidents never paged" value={`${verdict.missed.length} of ${INCIDENTS.length}`} color={verdict.missed.length > 0 ? 'var(--bad)' : undefined} sub="missed" />
          <Stat
            label="Time to the first page"
            value={`${INCIDENTS.length - verdict.missed.length} of ${INCIDENTS.length} paged`}
            sub={INCIDENTS.map((inc, k) => `${inc.name}: ${verdict.timeToPage[k] === null ? 'never paged' : `${verdict.timeToPage[k]} min`}`)}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'CPU', shape: 'line' },
            { color: 'var(--hi)', label: 'error ratio', shape: 'line' },
            { color: 'var(--bad)', label: 'a real incident (drawn at least an hour wide)', shape: 'square' },
            { color: 'var(--violet)', label: 'threshold', shape: 'line' },
            { color: 'var(--ok)', label: 'a useful page', shape: 'dot' },
            { color: 'var(--orange)', label: 'a false page', shape: 'dot' },
            { color: 'var(--bad)', label: 'a ringed dot: an incident never paged', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Metric" value={metric} onChange={setMetric} options={(['cpu', 'errors'] as const).map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />
        </>,
        <>
          <Slider label={`Threshold: above`} value={threshold} min={range.min} max={range.max} step={range.step} onChange={(v) => setThresholds({ ...thresholds, [metric]: v })} format={(v) => `${v}%`} />
          <Slider label="For at least" value={forMinutes} min={0} max={FOR_MAX} onChange={setForMinutes} format={(v) => (v <= 1 ? 'one minute' : `${v} minutes`)} />
        </>,
      ]}
    >
      <div className="ad stage-pad">
        <MetricMeter
          label="Pages in the week"
          value={verdict.pages}
          max={PAGE_METER_MAX}
          bands={PAGE_BANDS}
          header={<span className="ad-meter-note">A page is each firing episode of the rule. The bands are illustrative, not recommendations.</span>}
        />
        <WeekPlot metric={metric} threshold={threshold} fires={fires} />
        <ProvenanceRow>
          <Provenance kind="simulated" seed={WEEK_SEED}>a synthetic week: seeded noise, authored incidents</Provenance>
          <Provenance kind="illustrative">thresholds and bands are illustrative, not recommendations</Provenance>
          <ClaimLabel kind="practice">paging on user pain rather than on a resource number is common practice</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
