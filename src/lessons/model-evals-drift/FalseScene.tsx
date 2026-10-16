import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { falseCaption } from './captions';
import { CLEAN_STREAMS, THRESHOLDS, cleanReadings, falseAlarmRate, ksFivePercent, peekCleanReadings, streamSpread, type CleanReadings, type Metric } from './falseAlarm';
import { FALSE_DEFAULT } from './settings';

const METRICS = [{ value: 'ks' as Metric, label: 'KS statistic' }, { value: 'psi' as Metric, label: 'PSI' }];
const grid = (m: Metric) => {
  const t = THRESHOLDS[m];
  return Array.from({ length: Math.round((t.max - t.min) / t.step) + 1 }, (_, i) => Math.round((t.min + i * t.step) * 1000) / 1000);
};

/** The 200 clean streams take about half a second to simulate, so the scene paints first and measures on the next tick. */
export function FalseScene({ picker }: { picker: ReactNode }) {
  const [clean, setClean] = useState<CleanReadings | null>(peekCleanReadings);
  useEffect(() => {
    if (clean) return;
    const id = setTimeout(() => setClean(cleanReadings()), 0);
    return () => clearTimeout(id);
  }, [clean]);
  if (!clean) {
    return (
      <StageFrame height={430} intro={`Measuring ${CLEAN_STREAMS} seeded clean streams of 40 days each: this takes a moment.`} introKey="measuring" controls={[picker]}>
        <div className="med-stage stage-pad"><Box><SectionTitle hint="computing">Measured false-alarm rate against threshold</SectionTitle></Box></div>
      </StageFrame>
    );
  }
  return <FalseBody picker={picker} clean={clean} />;
}

function FalseBody({ picker, clean }: { picker: ReactNode; clean: CleanReadings }) {
  const [metric, setMetric] = useState<Metric>(FALSE_DEFAULT.metric);
  const [threshold, setThreshold] = useState<number>(FALSE_DEFAULT.threshold);
  const curve = useMemo(() => grid(metric).map((t) => [t, falseAlarmRate(clean, metric, t) * 100] as [number, number]), [clean, metric]);
  const rate = falseAlarmRate(clean, metric, threshold);
  const t = THRESHOLDS[metric];
  const spread = streamSpread(clean, metric, threshold);
  const caption = falseCaption(metric, threshold, rate, spread);
  const change = (m: Metric) => {
    setMetric(m);
    setThreshold(THRESHOLDS[m].start);
  };

  return (
    <StageFrame
      height={430}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="False alarms on clean days" value={`${(rate * 100).toFixed(1)}%`} color={rate > 0.05 ? 'var(--bad)' : 'var(--ok)'} sub={`${CLEAN_STREAMS} seeded streams, 40 days each, no drift`} />
          <Stat label="Alerting days per 40" value={(40 * rate).toFixed(1)} sub="in a stream where nothing changed" />
          <Stat label="A 5% KS test would use" value={ksFivePercent(clean.baselineSize).toFixed(3)} color="var(--info)" sub="two-sample critical value for these sizes" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'measured false-alarm rate', shape: 'line' },
            { color: 'var(--hi)', label: 'your threshold', shape: 'line' },
            { color: 'var(--info)', label: 'the 5% KS critical value', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Monitor" value={metric} onChange={change} options={METRICS} />
          <Slider label="Alert threshold" value={threshold} min={t.min} max={t.max} step={t.step} onChange={setThreshold} format={(v) => v.toFixed(2)} />
        </>,
      ]}
    >
      <div className="med-stage stage-pad">
        <Box>
          <SectionTitle hint="a low threshold pages you on days when nothing changed">Measured false-alarm rate against threshold</SectionTitle>
          <div className="med-plot">
            <Plot2D x={{ domain: [t.min, t.max], label: `${metric === 'ks' ? 'KS' : 'PSI'} threshold` }} y={{ domain: [0, 100], label: 'clean days that alert (%)' }} width={356} ariaLabel="Measured false-alarm rate against alert threshold">
              <Curve points={curve} tone="violet" />
              {metric === 'ks' && <VLine at={ksFivePercent(clean.baselineSize)} tone="info" label="5% test" />}
              <VLine at={Math.min(Math.max(threshold, t.min), t.max)} tone="hi" />
            </Plot2D>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">{CLEAN_STREAMS} seeded clean streams; the rate is measured, not a formula</Provenance>
          <Provenance kind="toy">toy blobs, one watched feature</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
