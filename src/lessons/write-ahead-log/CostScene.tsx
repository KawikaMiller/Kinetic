import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { checkpointCaption, groupCaption, plural } from './captions';
import {
  CHECKPOINT_INTERVALS, DEFAULT_INTERVAL_INDEX, FSYNC_HDD_MS, FSYNC_SSD_MS, MAX_COMMITTERS, MAX_FSYNC_MS, MIN_FSYNC_MS, WORKLOAD_TXS, checkpointRun, commitCost, groupCommit,
} from './cost';
import { COST_OPEN } from './view';

const SPEEDS = [
  { value: FSYNC_SSD_MS, label: `An SSD: ${FSYNC_SSD_MS} ms` },
  { value: FSYNC_HDD_MS, label: `A spinning disk: ${FSYNC_HDD_MS} ms` },
];
const PLOT_COMMITTERS = Array.from({ length: MAX_COMMITTERS }, (_, i) => i + 1);

export function CostScene({ picker }: { picker: ReactNode }) {
  const [latency, setLatency] = useState<number>(COST_OPEN.latencyMs);
  const [committers, setCommitters] = useState<number>(COST_OPEN.committers);
  const [intervalIndex, setIntervalIndex] = useState<number>(DEFAULT_INTERVAL_INDEX);

  const plain = useMemo(() => groupCommit(latency, committers, false), [latency, committers]);
  const grouped = useMemo(() => groupCommit(latency, committers, true), [latency, committers]);
  const plainCurve = useMemo(() => PLOT_COMMITTERS.map((c) => ({ x: c, y: groupCommit(latency, c, false).throughput })), [latency]);
  const groupedCurve = useMemo(() => PLOT_COMMITTERS.map((c) => ({ x: c, y: groupCommit(latency, c, true).throughput })), [latency]);
  const yMax = useMemo(() => Math.max(...groupedCurve.map((p) => p.y)), [groupedCurve]);
  const run = useMemo(() => checkpointRun(CHECKPOINT_INTERVALS[intervalIndex]), [intervalIndex]);
  const noForce = useMemo(() => commitCost({ force: false }), []);
  const force = useMemo(() => commitCost({ force: true }), []);
  const caption = `${groupCaption(latency, committers, plain, grouped)} ${checkpointCaption(run)}`;

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Commits a second, one fsync each" value={Math.round(plain.throughput).toLocaleString('en-US')} color="var(--bad)" sub={`${plural(plain.fsyncs, 'fsync')} in the run`} />
          <Stat label="Commits a second, grouped" value={Math.round(grouped.throughput).toLocaleString('en-US')} color="var(--ok)" sub={`${plural(grouped.fsyncs, 'fsync')} in the run`} />
          <Stat label="Recovery scans, worst case" value={`${run.worstScanned} of ${run.records}`} sub={`${run.averageScanned} on average over ${run.crashPoints} crash points`} />
          <Stat label="Checkpoint page writes" value={run.pageWrites} sub={plural(run.checkpoints, 'checkpoint')} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'each commit waits for its own fsync', shape: 'line' },
            { color: 'var(--ok)', label: 'committers share one fsync', shape: 'line' },
            { color: 'var(--violet)', label: 'the number of committers now', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {SPEEDS.map((s) => (
            <ChipButton key={s.value} tone="info" size="md" on={latency === s.value} onClick={() => setLatency(s.value)}>{s.label}</ChipButton>
          ))}
          <Slider label="Latency" value={latency} min={MIN_FSYNC_MS} max={MAX_FSYNC_MS} step={0.1} onChange={(v) => setLatency(Math.round(v * 10) / 10)} format={(v) => `${v} ms`} />
        </>,
        <>
          <Slider label="Committers" value={committers} min={1} max={MAX_COMMITTERS} onChange={setCommitters} />
          <Slider label="Checkpoint" value={intervalIndex} min={0} max={CHECKPOINT_INTERVALS.length - 1} onChange={setIntervalIndex} format={(v) => (CHECKPOINT_INTERVALS[v] === 0 ? 'never' : `every ${CHECKPOINT_INTERVALS[v]} records`)} />
        </>,
      ]}
    >
      <div className="wal-stage stage-pad">
        <Box>
          <SectionTitle hint="commits a second against committers waiting at once">Group commit</SectionTitle>
          <Plot2D x={{ domain: [1, MAX_COMMITTERS], label: 'committers' }} y={{ domain: [0, Math.ceil(yMax * 1.05)], label: 'commits a second' }} ariaLabel="Commits per second with and without group commit">
            <Curve points={plainCurve.map((p) => [p.x, p.y])} tone="bad" />
            <Curve points={groupedCurve.map((p) => [p.x, p.y])} tone="ok" />
            <VLine at={committers} label={`${committers}`} tone="violet" />
          </Plot2D>
          <Hint tone="muted" block>One fsync at a time: without grouping a commit needs its own, so the ceiling is about 1 / latency. With {committers} waiting, one fsync can serve them all.</Hint>
        </Box>
        <Box>
          <SectionTitle hint={`the same ${WORKLOAD_TXS} transactions, two pages each`}>What a commit costs: force or no-force</SectionTitle>
          <table className="wal-table table-cards">
            <thead><tr><th scope="col">Policy</th><th scope="col">Page writes</th><th scope="col">Log fsyncs</th><th scope="col">Log records</th></tr></thead>
            <tbody>
              <tr><td data-label="Policy">No-force (the default)</td><td data-label="Page writes">{noForce.pageWrites}</td><td data-label="Log fsyncs">{noForce.fsyncs}</td><td data-label="Log records">{noForce.records}</td></tr>
              <tr><td data-label="Policy">Force</td><td data-label="Page writes">{force.pageWrites}</td><td data-label="Log fsyncs">{force.fsyncs}</td><td data-label="Log records">{force.records}</td></tr>
            </tbody>
          </table>
          <Hint tone="muted" block>Counted by running the toy: no-force pays one fsync of a sequential log per commit, force also writes the transaction&apos;s pages to scattered places.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={COST_OPEN.seed}>a closed loop of committers with seeded think times, run for a few seconds of simulated time</Provenance>
          <Provenance kind="illustrative">the {FSYNC_SSD_MS} ms and {FSYNC_HDD_MS} ms fsync latencies are round figures for an SSD and a spinning disk: verify against your own device</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
