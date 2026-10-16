import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { MetricMeter } from '../../components/MetricMeter';
import { PSI_ALERT, PSI_WATCH } from './monitors';
import { ACCURACY_ALARM, type Alarms, type Day, type Stream } from './stream';
import { DAYS } from './world';

const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 170;
const MAX_METER_PSI = 0.5;
const MAX_METER_KS = 0.5;

export interface Marks {
  shiftDay: number | null;
  alarms: Alarms | null;
}

const xAxis = { domain: [1, DAYS] as [number, number], label: 'day' };
const series = (days: readonly Day[], pick: (d: Day) => number) => days.map((d) => [d.day, pick(d)] as [number, number]);

function Rules({ marks, accuracyAlarm }: { marks: Marks; accuracyAlarm: boolean }) {
  return (
    <>
      {marks.shiftDay !== null && <VLine at={marks.shiftDay} tone="hi" />}
      {marks.alarms?.input != null && !accuracyAlarm && <VLine at={marks.alarms.input} tone="bad" dashed />}
      {marks.alarms?.accuracy != null && accuracyAlarm && <VLine at={marks.alarms.accuracy} tone="orange" dashed />}
    </>
  );
}

/** Accuracy, PSI and KS per day, stacked. The accuracy alarm line is drawn on the accuracy plot, the input alert on the other two. */
export function DriftPlots({ stream, marks, showAccuracyAlarm = true }: { stream: Stream; marks: Marks; showAccuracyAlarm?: boolean }) {
  return (
    <Box>
      <SectionTitle hint={`${DAYS} daily batches of 200, through one trained model`}>Accuracy and two input monitors</SectionTitle>
      <div className="med-plots">
        <Plot2D x={xAxis} y={{ domain: [0.4, 1], label: 'accuracy', format: (v) => `${Math.round(v * 100)}%` }} width={PLOT_WIDTH} height={PLOT_HEIGHT} ariaLabel="Accuracy per day">
          <HLine at={ACCURACY_ALARM} tone="dim" label="alarm line" />
          <Curve points={series(stream.days, (d) => d.accuracy)} tone="info" />
          <Points data={stream.days.map((d) => ({ x: d.day, y: d.accuracy, tone: d.accuracy < ACCURACY_ALARM ? ('bad' as const) : ('ok' as const), r: 2.5 }))} />
          <Rules marks={marks} accuracyAlarm={showAccuracyAlarm} />
        </Plot2D>
        <Plot2D x={xAxis} y={{ domain: [0, MAX_METER_PSI], label: 'PSI' }} width={PLOT_WIDTH} height={PLOT_HEIGHT} ariaLabel="Population stability index per day">
          <HLine at={PSI_WATCH} tone="dim" label="0.1" />
          <HLine at={PSI_ALERT} tone="bad" label="0.25" />
          <Curve points={series(stream.days, (d) => Math.min(d.psi, MAX_METER_PSI))} tone="violet" />
          <Rules marks={marks} accuracyAlarm={false} />
        </Plot2D>
        <Plot2D x={xAxis} y={{ domain: [0, MAX_METER_KS], label: 'KS' }} width={PLOT_WIDTH} height={PLOT_HEIGHT} ariaLabel="KS statistic per day">
          <HLine at={stream.ksCritical} tone="bad" label="5% critical value" />
          <Curve points={series(stream.days, (d) => Math.min(d.ks, MAX_METER_KS))} tone="violet" />
          <Rules marks={marks} accuracyAlarm={false} />
        </Plot2D>
      </div>
    </Box>
  );
}

/** The three readings of one day, each against its own bands. */
export function DayMeters({ stream, day }: { stream: Stream; day: number }) {
  const d = stream.days[day - 1];
  return (
    <Box>
      <SectionTitle hint={`day ${day}`}>That day's readings</SectionTitle>
      <MetricMeter
        label="Accuracy"
        value={d.accuracy}
        max={1}
        format={(v) => `${(v * 100).toFixed(1)}%`}
        bands={[
          { upTo: ACCURACY_ALARM, tone: 'bad', label: 'alarm', tick: { label: `${Math.round(ACCURACY_ALARM * 100)}%`, tone: 'bad' } },
          { upTo: 1, tone: 'ok', label: 'healthy' },
        ]}
      />
      <MetricMeter
        label="PSI"
        value={Math.min(d.psi, MAX_METER_PSI)}
        max={MAX_METER_PSI}
        format={() => d.psi.toFixed(3)}
        bands={[
          { upTo: PSI_WATCH, tone: 'ok', label: 'stable', tick: { label: '0.1', tone: 'orange' } },
          { upTo: PSI_ALERT, tone: 'orange', label: 'moderate', tick: { label: '0.25', tone: 'bad' } },
          { upTo: MAX_METER_PSI, tone: 'bad', label: 'alert' },
        ]}
      />
      <MetricMeter
        label="KS"
        value={Math.min(d.ks, MAX_METER_KS)}
        max={MAX_METER_KS}
        format={() => d.ks.toFixed(3)}
        bands={[
          { upTo: stream.ksCritical, tone: 'ok', label: 'within noise', tick: { label: 'critical', tone: 'bad' } },
          { upTo: MAX_METER_KS, tone: 'bad', label: 'alert' },
        ]}
      />
    </Box>
  );
}
