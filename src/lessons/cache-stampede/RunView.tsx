import { useMemo } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { Stat } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { integer, sig } from '../../core/format';
import { barsAt } from '../../core/gantt';
import { msText } from './captions';
import { CLIENT_TIMEOUT_MS, DB_CAPACITY, EXPIRE_MS, MAX_BARS, SIM_MS, dbKeepsUp, littleEstimate, type QueryBar, type StampedeRun } from './model';

const GANTT_MIN_WIDTH = 480;

/** The five numbers every run is judged by, each computed from the run on screen. */
export function RunStats({ run }: { run: StampedeRun }) {
  const { lambda, recomputeMs, mitigations: m } = run.config;
  const guarded = m.coalesce || m.stale || m.lock || m.beta > 0;
  const s = run.summary;
  return (
    <>
      <Stat label="Queries sent to the database" value={integer(s.queries)} color={s.queries > 1 ? 'var(--bad)' : 'var(--ok)'} sub={[`${integer(s.requests)} requests in ${SIM_MS / 1000} s`]} />
      <Stat
        label="Piled up before the first finished"
        value={integer(s.herd)}
        sub={guarded ? [`${integer(s.waited)} requests waited for a recompute`, 'a protection is on, so λ × R does not predict this'] : [`λ × R = ${sig(littleEstimate(lambda, recomputeMs))}`, dbKeepsUp(lambda, recomputeMs) ? 'the database keeps up' : `past ${DB_CAPACITY} at once it slows down`]}
      />
      <Stat label="99th-percentile latency" value={msText(s.p99Ms)} color={s.p99Ms >= CLIENT_TIMEOUT_MS ? 'var(--orange)' : undefined} sub={[`clients give up after ${msText(CLIENT_TIMEOUT_MS)}`]} />
      <Stat label="Timeouts" value={integer(s.outcomes.timeout)} color={s.outcomes.timeout > 0 ? 'var(--orange)' : undefined} sub={[`${integer(s.retries)} retries sent`]} />
      <Stat label="First value cached at" value={s.firstWriteMs === null ? 'never' : msText(s.firstWriteMs)} color={s.firstWriteMs === null ? 'var(--bad)' : undefined} sub={[`expiry at ${msText(EXPIRE_MS)}`]} />
    </>
  );
}

const KIND_TONE = { miss: 'bad', winner: 'bad', early: 'violet' } as const;

function ganttBars(bars: readonly QueryBar[]): GanttBar[] {
  return bars.map((b) => ({ id: b.id, lane: b.id, start: b.startMs, end: Math.max(b.endMs, b.startMs + 1), tone: KIND_TONE[b.kind], label: b.finished ? undefined : 'still running' }));
}

/** The first recomputes as bars, and the database's queries per second and the clients' latency over the run. */
export function RunCharts({ run, now }: { run: StampedeRun; now: number }) {
  const bars = useMemo(() => ganttBars(run.bars), [run.bars]);
  const lanes = useMemo(() => run.bars.map((b) => ({ id: b.id, label: `recompute ${b.index + 1}` })), [run.bars]);
  const capacityQps = (DB_CAPACITY * 1000) / run.config.recomputeMs;
  const qpsMax = Math.max(capacityQps, ...run.qps.map((p) => p[1])) * 1.1;
  const latencyMax = CLIENT_TIMEOUT_MS * 1.1;
  return (
    <div className="cs-charts">
      <Box>
        <SectionTitle hint={run.summary.queries > MAX_BARS ? `the first ${MAX_BARS} of ${integer(run.summary.queries)}` : undefined}>Recomputes in the database</SectionTitle>
        {run.bars.length === 0 ? (
          <p className="cs-note">No query reached the database yet.</p>
        ) : (
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Recompute timeline: scroll sideways to see all of it">
            <GanttLanes lanes={lanes} bars={barsAt(bars, now)} domain={[0, SIM_MS]} now={now} unit=" ms" axis size="sm" labelWidth={92} ariaLabel="The first recomputes the database ran, over the run" />
          </WideRegion>
        )}
      </Box>
      <div className="cs-plots">
        <Box>
          <SectionTitle hint="per 100 ms bucket">Database queries per second</SectionTitle>
          <Plot2D x={{ domain: [0, SIM_MS / 1000], label: 'seconds' }} y={{ domain: [0, qpsMax], label: 'queries / s' }} ariaLabel="Queries started per second over the run, against the database's full-speed capacity">
            <HLine at={capacityQps} label="full-speed capacity" tone="dim" />
            <Curve points={run.qps} tone="bad" />
            <VLine at={now / 1000} label="now" tone="hi" />
          </Plot2D>
        </Box>
        <Box>
          <SectionTitle hint="requests by arrival, per 250 ms">99th-percentile latency</SectionTitle>
          <Plot2D x={{ domain: [0, SIM_MS / 1000], label: 'seconds' }} y={{ domain: [0, latencyMax], label: 'ms' }} ariaLabel="99th-percentile latency over the run, against the client timeout">
            <HLine at={CLIENT_TIMEOUT_MS} label="client timeout" tone="orange" />
            <Curve points={run.p99Series} tone="info" />
            <VLine at={now / 1000} label="now" tone="hi" />
          </Plot2D>
        </Box>
      </div>
    </div>
  );
}
