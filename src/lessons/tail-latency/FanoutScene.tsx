import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { MetricMeter } from '../../components/MetricMeter';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { logHistogram } from '../../core/stats';
import { sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { fanoutCaption, msText, touchText } from './frames';
import {
  BACKEND_DEFAULT, CAUSES, FAMILIES, FAMILY_NAME, FANOUT_DEFAULT, FANOUT_STEPS, HISTOGRAM_BINS, P99_TARGET_MS, SLOW_FACTOR_RANGE, SLOW_PROB_RANGE,
  fanoutReport, fanoutRun, medianSlowWidth, requestCalls, touchesSlow, type Backend, type Family,
} from './model';

const HIST_MIN = 5;
/** The slowest request p99 the sliders can reach (about 9,200 ms at a ×50 factor, 10% slow, N = 1000) fits under this. */
const HIST_MAX = 10_000;
const METER_MAX = 1000;
const LANES_SHOWN = 12;
const ONE_REQUEST_SEED_OFFSET = 1000;

const FAMILY_OPTIONS = FAMILIES.map((f) => ({ value: f, label: FAMILY_NAME[f] }));

/** Histogram counts as a line through the bin centres (log-spaced bins), so two series can share one plot. */
function histogramLine(values: ArrayLike<number>, count: number): [number, number][] {
  const h = logHistogram(Array.from({ length: count }, (_, i) => values[i]), { bins: HISTOGRAM_BINS, min: HIST_MIN, max: HIST_MAX });
  return h.counts.map((c, i) => [Math.sqrt(h.edges[i] * h.edges[i + 1]), c] as [number, number]);
}

/** The row of widths under the plot: the headline ladder plus the width where half of requests touch a slow call. */
function rowWidths(slowProb: number, n: number): number[] {
  const half = medianSlowWidth(slowProb);
  return [...new Set([1, 10, ...(Number.isFinite(half) ? [half] : []), 100, 1000, n])].sort((a, b) => a - b);
}

function OneRequest({ backend, n, seed }: { backend: Backend; n: number; seed: number }) {
  const calls = useMemo(() => requestCalls(backend, n, seed + ONE_REQUEST_SEED_OFFSET), [backend, n, seed]);
  const shown = calls.slice(0, LANES_SHOWN);
  const lanes: GanttLane[] = shown.map((_, i) => ({ id: `c${i}`, label: i === 0 ? 'slowest' : `#${i + 1} slowest` }));
  const bars: GanttBar[] = shown.flatMap((call, i) => {
    if (i === 0 && shown.length > 1) {
      return [
        { id: 'c0a', lane: 'c0', start: 0, end: shown[1], tone: 'info' as const },
        { id: 'c0b', lane: 'c0', start: shown[1], end: call, tone: 'bad' as const, label: `waiting on the slowest: ${msText(call - shown[1])}` },
      ];
    }
    return [{ id: `c${i}`, lane: `c${i}`, start: 0, end: call, tone: 'info' as const }];
  });
  const end = Math.ceil((calls[0] * 1.02) / 10) * 10;
  return (
    <Box className="tl-onerequest">
      <SectionTitle hint={`one seeded request: the slowest ${Math.min(n, LANES_SHOWN)} of its ${n} calls${n > LANES_SHOWN ? `; the other ${n - LANES_SHOWN} replied sooner` : ''}`}>
        What one request waits for
      </SectionTitle>
      <WideRegion minWidth={480} label="One request's calls: scroll sideways to see all of it">
        <GanttLanes lanes={lanes} bars={bars} domain={[0, end]} unit=" ms" axis labelWidth={96} labelMinPx={Number.POSITIVE_INFINITY} ariaLabel="The slowest calls of one request" />
      </WideRegion>
    </Box>
  );
}

export function FanoutScene({ picker }: { picker: ReactNode }) {
  const [backend, setBackend] = useState<Backend>(BACKEND_DEFAULT);
  const [width, setWidth] = useState(FANOUT_STEPS.indexOf(FANOUT_DEFAULT));
  const [seed, setSeed] = useState(1);
  const n = FANOUT_STEPS[width];

  const run = useMemo(() => fanoutRun(backend, n, seed), [backend, n, seed]);
  const report = fanoutReport(backend, n, run);
  const single = useMemo(() => histogramLine(run.single, run.count), [run]);
  const slowest = useMemo(() => histogramLine(run.slowest, run.count), [run]);
  const peak = Math.max(1, ...single.map((p) => p[1]), ...slowest.map((p) => p[1]));

  useIntroCaption(fanoutCaption(backend, report), [backend, n]);

  const setFamily = (family: Family) => setBackend((b) => ({ ...b, family }));

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat
            label="Touch a slow backend"
            value={touchText(report.touchSlow)}
            color="var(--orange)"
            sub={[`1 − (1 − ${sig(backend.slowProb)})^${n}`, 'exact']}
          />
          <Stat
            label="p99 of one call"
            value={msText(report.singleP99)}
            color="var(--info)"
            sub={[`exact; the run reads ${msText(report.singleP99Sim)}`]}
          />
          <Stat
            label={`p99 of the slowest of ${n}`}
            value={msText(report.slowestP99)}
            color="var(--violet)"
            sub={[`exact; the run reads ${msText(report.slowestP99Sim)}`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'one call', shape: 'line' },
            { color: 'var(--violet)', label: 'slowest of N', shape: 'line' },
            { color: 'var(--orange)', label: 'p99', shape: 'line' },
            { color: 'var(--bad)', label: 'waiting on the slowest' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Call latency" value={backend.family} onChange={setFamily} options={FAMILY_OPTIONS} />
          {CAUSES.map((c) => (
            <ChipButton
              key={c.id}
              tone="orange"
              on={backend.slowProb === c.slowProb && backend.slowFactor === c.slowFactor}
              onClick={() => setBackend((b) => ({ ...b, slowProb: c.slowProb, slowFactor: c.slowFactor }))}
            >
              {c.label}
            </ChipButton>
          ))}
        </>,
        <>
          <Slider label="Backends N" value={width} min={0} max={FANOUT_STEPS.length - 1} format={(i) => String(FANOUT_STEPS[i])} onChange={setWidth} />
          <Slider
            label="Slow probability"
            value={backend.slowProb}
            {...SLOW_PROB_RANGE}
            format={(v) => `${sig(v * 100)}%`}
            onChange={(slowProb) => setBackend((b) => ({ ...b, slowProb }))}
          />
          <Slider
            label="Slow factor"
            value={backend.slowFactor}
            {...SLOW_FACTOR_RANGE}
            format={(v) => `×${v}`}
            onChange={(slowFactor) => setBackend((b) => ({ ...b, slowFactor }))}
          />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="tl-stage stage-pad">
        <Plot2D
          x={{ domain: [HIST_MIN, HIST_MAX], log: true, label: 'latency (ms), log scale', ticks: 4 }}
          y={{ domain: [0, peak * 1.05], label: 'requests per bin', ticks: 3 }}
          ariaLabel={`Histogram of one call and of the slowest of ${n} calls: p99 ${msText(report.singleP99)} against ${msText(report.slowestP99)}`}
        >
          <Curve points={single} tone="info" />
          <Curve points={slowest} tone="violet" />
          <VLine at={report.singleP99} tone="orange" label="p99s" dashed />
          <VLine at={report.slowestP99} tone="orange" dashed />
        </Plot2D>
        <MetricMeter
          label={`Request p99 against a ${P99_TARGET_MS} ms target`}
          value={report.slowestP99}
          max={METER_MAX}
          format={msText}
          bands={[
            { upTo: P99_TARGET_MS, tone: 'ok', label: 'within target', tick: { label: `target ${P99_TARGET_MS} ms`, tone: 'dim' } },
            { upTo: METER_MAX, tone: 'bad', label: 'over target' },
          ]}
          className="tl-meter"
        />
        {report.slowestP99 > METER_MAX && <Hint tone="muted" className="tl-note">The meter stops at {msText(METER_MAX)}; the request p99 here is {msText(report.slowestP99)}.</Hint>}
        <Box className="tl-row">
          <SectionTitle hint={`each call slow ${sig(backend.slowProb * 100)}% of the time`}>Share of requests that touch a slow backend</SectionTitle>
          <table className="data-table tl-table">
            <thead>
              <tr>
                <th>backends N</th>
                {rowWidths(backend.slowProb, n).map((w) => <th key={w} className={w === n ? 'tl-now' : ''}>{w.toLocaleString('en-US')}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">touch a slow one</th>
                {rowWidths(backend.slowProb, n).map((w) => <td key={w} className={w === n ? 'tl-now' : ''}>{touchText(touchesSlow(backend.slowProb, w))}</td>)}
              </tr>
            </tbody>
          </table>
        </Box>
        <OneRequest backend={backend} n={n} seed={seed} />
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>100,000 seeded requests; the p99s are also computed exactly</Provenance>
          <Provenance kind="illustrative">20 ms median calls, the slow share and the factor are made up</Provenance>
          <Provenance kind="from-memory">the fan-out amplification idea is from The Tail at Scale (Dean and Barroso, 2013): verify before quoting</Provenance>
        </ProvenanceRow>
        <Hint tone="muted" className="tl-note">
          Backends are independent here: a slow call does not make its neighbour slow. A real shared rack, cache or dependency makes slow calls cluster, which changes these numbers.
          The slow share is a model of a cause, not a measurement of one.
        </Hint>
      </div>
    </StageFrame>
  );
}
