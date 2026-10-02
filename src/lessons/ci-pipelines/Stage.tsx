import { useMemo, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { GraphView } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { minSec, pipelineFrames, type JobView, type PipelineFrame } from './frames';
import type { Branch, PipelineOptions, Run, Shards } from './pipeline';
import { pipelineYaml } from './yaml';
import './styles.css';

const STEP_MS = 650;
/** Widest pipeline.yml line at 11.5px mono, plus the panel's padding: below this the listing scrolls instead of wrapping. */
const YAML_MIN_WIDTH = 540;
const NODE_W = 112;
const NODE_H = 46;
const COL_GAP = 150;
const ROW_GAP = 64;
const PAD_X = 70;
const PAD_Y = 44;
/** Gap between a critical-path job and its violet outline. */
const HALO = 5;
const SCENE_W = PAD_X * 2 + COL_GAP * 5;
/** Narrowest the DAG stays readable: its width inside the old 760px stage on a phone (760 − 2 × 16px padding). */
const DAG_MIN_WIDTH = 728;

const SHARD_OPTIONS: { value: Shards; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 4, label: '4' },
];
const BRANCHES: { value: Branch; label: string }[] = [
  { value: 'main', label: 'main' },
  { value: 'feature', label: 'feature branch' },
];

const TONE: Record<JobView['status'], { tone?: Tone; on: boolean; variant: 'default' | 'bad' | 'dim' }> = {
  pending: { on: false, variant: 'default' },
  running: { tone: 'hi', on: true, variant: 'default' },
  passed: { tone: 'ok', on: true, variant: 'default' },
  failed: { on: false, variant: 'bad' },
  blocked: { on: false, variant: 'dim' },
  cancelled: { on: false, variant: 'dim' },
};

export function Stage() {
  const [o, setO] = useState<PipelineOptions>({ cache: false, shards: 2, failFast: false, branch: 'main', brokenTest: false });
  const { run, frames } = useMemo(() => pipelineFrames(o), [o]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const yaml = useMemo(() => pipelineYaml(o), [o]);
  const set = (patch: Partial<PipelineOptions>) => setO((prev) => ({ ...prev, ...patch }));
  const running = run.jobs.filter((s) => f.jobs[s.job.id].status === 'running').map((s) => yaml.jobLine(s.job.id));
  const failedJob = run.jobs.find((s) => s.status === 'failed');
  const showLog = failedJob && f.jobs[failedJob.job.id].status === 'failed';

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Clock" value={minSec(f.t)} color="var(--hi)" sub="since the push" />
          <Stat label="Wall clock" value={minSec(run.wallClock)} color="var(--violet)" sub={run.failed ? 'until it stopped' : 'critical path'} />
          <Stat label="Sum of all jobs" value={minSec(run.jobSeconds)} color="var(--muted)" sub="work, not waiting" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running' },
            { color: 'var(--ok)', label: 'passed' },
            { color: 'var(--bad)', label: 'failed' },
            { color: 'var(--dim)', label: 'blocked / cancelled / skipped' },
            { color: 'var(--info)', label: 'cache hit' },
            { color: 'var(--violet)', label: 'critical path', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          <Toggle label="Dependency cache" value={o.cache} onChange={(cache) => set({ cache })} off="Cold" on="Cached" />
          <Segmented label="Unit test shards" value={o.shards} onChange={(shards) => set({ shards })} options={SHARD_OPTIONS} />
          <Segmented label="Pushed to" value={o.branch} onChange={(branch) => set({ branch })} options={BRANCHES} />
        </>,
        <>
          <Toggle label="Fail fast" value={o.failFast} onChange={(failFast) => set({ failFast })} off="Let others finish" on="Cancel the run" />
          <Button variant={o.brokenTest ? 'primary' : 'danger'} onClick={() => set({ brokenTest: !o.brokenTest })}>
            {o.brokenTest ? 'Fix the test' : 'Break a test'}
          </Button>
          <Hint>Illustrative durations; unlimited runners. The YAML is condensed, and fail-fast settings differ per CI system.</Hint>
        </>,
      ]}
    >
      <div className="ci stage-pad">
        <WideRegion minWidth={DAG_MIN_WIDTH} label="Pipeline diagram: scroll sideways to see all of it">
          <Dag run={run} frame={f} />
        </WideRegion>
        <Gantt run={run} frame={f} />
        <div className="ci-bottom">
          <WideRegion minWidth={YAML_MIN_WIDTH} label="pipeline.yml: scroll sideways to read whole lines" hint="swipe to read whole lines">
            <CodePanel title="pipeline.yml (condensed)" lines={yaml.lines} active={running} gutter="none" className="ci-yaml" />
          </WideRegion>
          <div className="ci-side">
            <Artifacts frame={f} run={run} />
            {showLog && (
              <ConsolePanel
                title={`${failedJob.job.label} log`}
                lines={['PASS  src/price.test.ts', 'FAIL  src/cart.test.ts', '  ● cart total › applies the discount once']}
                error="expect(total).toBe(42): received 41 (src/cart.test.ts:18)"
              />
            )}
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

/** Columns come from GraphView's layered layout (each job one past its deepest dependency). */
const SPACING = { direction: 'right', layerGap: COL_GAP, nodeGap: ROW_GAP, padMain: PAD_X, padCross: PAD_Y } as const;

function Dag({ run, frame }: { run: Run; frame: PipelineFrame }) {
  const jobs = run.jobs.map((s) => s.job);
  const scheduled = new Map(run.jobs.map((s) => [s.job.id, s]));
  const onPath = new Set(run.failed ? [] : run.criticalPath);
  const pathEdge = (from: string, to: string) => {
    const i = run.criticalPath.indexOf(to);
    return !run.failed && i > 0 && run.criticalPath[i - 1] === from;
  };
  const dead = (id: string) => frame.jobs[id].status === 'blocked' || frame.jobs[id].status === 'cancelled';

  return (
    <GraphView
      nodes={jobs.map((j) => ({ id: j.id, label: j.label, shape: 'box' }))}
      edges={jobs.flatMap((j) => j.deps.map((d) => ({ from: d, to: j.id })))}
      directed
      layout="layered"
      spacing={SPACING}
      width={SCENE_W}
      box={{ w: NODE_W, h: NODE_H }}
      edgeStyle="curve"
      arrowSize={6}
      arrowGap={4}
      edgeMark={(e) => (pathEdge(e.from, e.to) ? { tone: 'violet', width: 2.4 } : null)}
      edgeClass={(e) => (dead(e.to) ? 'is-dead' : '')}
      renderNode={(n, p) => {
        const s = scheduled.get(n.id)!;
        const view = frame.jobs[n.id];
        const look = TONE[view.status];
        const cacheHit = s.job.cacheHit && view.status !== 'pending';
        return (
          <SceneNode
            at={p}
            w={NODE_W}
            h={NODE_H}
            title={s.job.label}
            sub={view.status === 'pending' ? `${s.job.duration}s` : view.status === 'running' ? `${Math.round(view.progress * 100)}%` : view.status}
            tone={cacheHit && view.status !== 'failed' ? 'info' : look.tone}
            on={look.on || !!cacheHit}
            variant={look.variant}
          >
            {onPath.has(n.id) && (
              <rect className="ci-halo" x={p.x - NODE_W / 2 - HALO} y={p.y - NODE_H / 2 - HALO} width={NODE_W + HALO * 2} height={NODE_H + HALO * 2} rx={13} />
            )}
            {view.status === 'running' && (
              <rect className="ci-progress" x={p.x - NODE_W / 2 + 6} y={p.y + NODE_H / 2 - 7} width={(NODE_W - 12) * view.progress} height={3} rx={1.5} />
            )}
          </SceneNode>
        );
      }}
      className="ci-dag"
      ariaLabel="Pipeline jobs and their dependencies"
    />
  );
}

/** Bar colour per job status; pending and blocked jobs draw no bar, only the dashed plan. */
const BAR_TONE: Partial<Record<JobView['status'], Tone>> = { running: 'hi', passed: 'ok', failed: 'bad', cancelled: 'dim' };

function Gantt({ run, frame }: { run: Run; frame: PipelineFrame }) {
  const span = Math.max(run.wallClock, 1);
  const onPath = new Set(run.failed ? [] : run.criticalPath);
  const scheduled = run.jobs.filter((s) => s.start !== null);
  const bars: GanttBar[] = scheduled.map((s) => {
    const view = frame.jobs[s.job.id];
    return {
      id: s.job.id,
      lane: s.job.id,
      start: s.start!,
      end: s.end ?? s.start!,
      tone: BAR_TONE[view.status],
      progress: view.status === 'running' ? view.progress : view.status === 'pending' ? 0 : 1,
      ring: onPath.has(s.job.id) ? 'violet' : undefined,
    };
  });
  return (
    <Box variant="sunken" className="ci-gantt">
      <SectionTitle hint="each bar = one job, from start to finish">Wall clock</SectionTitle>
      <GanttLanes
        lanes={run.jobs.map((s) => ({ id: s.job.id, label: s.job.label }))}
        bars={bars}
        domain={[0, span]}
        now={frame.t}
        ariaLabel="Wall clock: each job from start to finish"
      />
    </Box>
  );
}

function Artifacts({ frame, run }: { frame: PipelineFrame; run: Run }) {
  const done = (id: string) => frame.jobs[id]?.status === 'passed';
  const items = [
    { id: 'install', name: 'node_modules/', note: run.jobs[0].job.cacheHit ? 'restored from cache' : 'installed fresh' },
    { id: 'build', name: 'dist/', note: 'built once, reused by tests and package' },
    {
      id: 'package',
      name: 'app.tgz',
      note: run.jobs.some((s) => s.job.id === 'deploy') ? 'the exact file deploy ships' : 'built and tested; only main deploys it',
    },
  ];
  return (
    <Box className="ci-artifacts">
      <SectionTitle>Artifacts</SectionTitle>
      <ul>
        {items.map((a) => (
          <li key={a.id} className={done(a.id) ? 'is-ready' : ''}>
            <code>{a.name}</code>
            <span>{done(a.id) ? a.note : 'not yet'}</span>
          </li>
        ))}
      </ul>
    </Box>
  );
}
