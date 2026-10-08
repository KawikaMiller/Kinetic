import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decimal, pct } from '../../core/format';
import { barsFromHistogram } from '../../core/plot';
import { latencySamples, logHistogram, LOG_BINS, SAMPLE_COUNT, timeoutAt, timeoutStats } from './model';

const START_POSITION = 35;
/** Wide on a desktop; a phone gets the kit's default size, whose 10px ticks stay readable at 390. */
const PLOT_SIZE = { desktop: { width: 640, height: 260 }, phone: { width: 356, height: 240 } };
/** A healthy request cut off this often or more is worth a red number. */
const CUT_ALARM = 0.01;
const sec = (x: number) => (x < 1 ? `${Math.round(x * 1000)} ms` : `${decimal(x, 2)} s`);

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'requests at that latency' },
      { color: 'var(--violet)', label: 'p99' },
      { color: 'var(--hi)', label: 'your timeout' },
    ]}
  />
);

export function PickScene({ picker }: { picker: ReactNode }) {
  const [position, setPosition] = useState(START_POSITION);
  const phone = useMediaQuery(PHONE_QUERY);
  const samples = useMemo(() => latencySamples(), []);
  const histogram = useMemo(() => logHistogram(samples), [samples]);
  const top = Math.max(...histogram.counts);
  const timeout = timeoutAt(position);
  const stats = timeoutStats(samples, timeout);
  const stuckCount = samples.filter((s) => s.stuck).length;

  useIntroCaption(
    <>With the timeout at <span className="hl">{sec(timeout)}</span>, <b>{pct(stats.healthyCut, 1)}</b> of healthy requests are cut off (p99 is {sec(stats.p99)}), and a stuck request
      ties up its caller for {sec(stats.stuckHold)} on average.</>,
    [timeout],
  );

  return (
    <StageFrame
      height={400}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="p50" value={sec(stats.p50)} sub="typical request" />
          <Stat label="p99" value={sec(stats.p99)} color="var(--violet)" sub="1 in 100 is slower" />
          <Stat label="Healthy cut off" value={pct(stats.healthyCut, 1)} color={stats.healthyCut >= CUT_ALARM ? 'var(--bad)' : 'var(--ok)'} sub="timed out while still working" />
          <Stat label="Stuck request held" value={sec(stats.stuckHold)} sub={`${stuckCount} stuck of ${SAMPLE_COUNT}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Timeout" value={position} min={0} max={100} onChange={setPosition} format={(p) => sec(timeoutAt(p))} />
        </>,
      ]}
    >
      <div className="stage-pad td">
        <Plot2D
          {...(phone ? PLOT_SIZE.phone : PLOT_SIZE.desktop)}
          x={{ domain: [LOG_BINS.min, LOG_BINS.max], log: true, label: 'how long one call takes (seconds, log scale)' }}
          y={{ domain: [0, top], label: 'calls' }}
          ariaLabel={`Latency of ${SAMPLE_COUNT} calls: median ${sec(stats.p50)}, p99 ${sec(stats.p99)}, timeout ${sec(timeout)}`}
        >
          <Bars bars={barsFromHistogram(histogram)} tone="info" />
          <VLine at={stats.p99} tone="violet" />
          <VLine at={timeout} label={`timeout ${sec(timeout)}`} tone="hi" dashed={false} />
        </Plot2D>
        <p className="td-note">
          The small island out at 3 to 6 s is the stuck requests: a lost reply or a dead connection. No sensible timeout waits for them, but every second of timeout is a second they
          hold a thread. <b>Rule of thumb:</b> set it a little above the p99 of healthy latency, never longer than the caller can afford to wait, and if that leaves too many
          healthy requests cut off, fix the slow path instead of raising the number.
        </p>
        <Hint block>Simulated latencies (log-normal bulk plus a thin stuck tail), seeded and illustrative; real services have their own shape.</Hint>
      </div>
    </StageFrame>
  );
}
