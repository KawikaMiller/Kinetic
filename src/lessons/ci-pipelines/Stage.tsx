import { useMemo, useState } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { minSec, pipelineFrames, type JobView, type PipelineFrame } from './frames';
import type { Branch, Job, PipelineOptions, Run, Shards } from './pipeline';
import { pipelineYaml } from './yaml';
import './styles.css';

const STEP_MS = 650;
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
          <CodePanel title="pipeline.yml (condensed)" lines={yaml.lines} active={running} gutter="none" className="ci-yaml" />
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

/** As tall as the busiest column (unit shards + integration). */
function sceneHeight(jobs: readonly Job[]) {
  const tallest = Math.max(...jobs.map((j) => jobs.filter((k) => k.stage === j.stage).length));
  return PAD_Y * 2 + ROW_GAP * (tallest - 1);
}

/** Columns by stage; the jobs in a column are centred vertically in list order. */
function place(job: Job, jobs: readonly Job[], height: number) {
  const column = jobs.filter((j) => j.stage === job.stage);
  const index = column.indexOf(job);
  return { x: PAD_X + job.stage * COL_GAP, y: height / 2 + (index - (column.length - 1) / 2) * ROW_GAP };
}

function Dag({ run, frame }: { run: Run; frame: PipelineFrame }) {
  const arrow = useArrowMarker('var(--line-2)', { size: 6, refX: 9 });
  const critical = useArrowMarker('var(--violet)', { size: 6, refX: 9 });
  const jobs = run.jobs.map((s) => s.job);
  const height = sceneHeight(jobs);
  const at = new Map(jobs.map((j) => [j.id, place(j, jobs, height)]));
  const onPath = new Set(run.failed ? [] : run.criticalPath);
  const pathEdge = (from: string, to: string) => {
    const i = run.criticalPath.indexOf(to);
    return !run.failed && i > 0 && run.criticalPath[i - 1] === from;
  };

  return (
    <svg viewBox={`0 0 ${SCENE_W} ${height}`} className="ci-dag" role="img" aria-label="Pipeline jobs and their dependencies">
      {arrow.def}
      {critical.def}
      {jobs.flatMap((j) =>
        j.deps.map((d) => {
          const a = at.get(d)!;
          const b = at.get(j.id)!;
          const x1 = a.x + NODE_W / 2;
          const x2 = b.x - NODE_W / 2 - 4;
          const mid = (x1 + x2) / 2;
          const hot = pathEdge(d, j.id);
          const dead = frame.jobs[j.id].status === 'blocked' || frame.jobs[j.id].status === 'cancelled';
          return (
            <path
              key={`${d}-${j.id}`}
              d={`M ${x1} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${x2} ${b.y}`}
              className={`ci-edge ${hot ? 'is-critical' : ''} ${dead ? 'is-dead' : ''}`}
              markerEnd={hot ? critical.url : arrow.url}
            />
          );
        }),
      )}
      {run.jobs.map((s) => {
        const view = frame.jobs[s.job.id];
        const look = TONE[view.status];
        const cacheHit = s.job.cacheHit && view.status !== 'pending';
        const p = at.get(s.job.id)!;
        return (
          <SceneNode
            key={s.job.id}
            at={p}
            w={NODE_W}
            h={NODE_H}
            title={s.job.label}
            sub={view.status === 'pending' ? `${s.job.duration}s` : view.status === 'running' ? `${Math.round(view.progress * 100)}%` : view.status}
            tone={cacheHit && view.status !== 'failed' ? 'info' : look.tone}
            on={look.on || !!cacheHit}
            variant={look.variant}
          >
            {onPath.has(s.job.id) && (
              <rect className="ci-halo" x={p.x - NODE_W / 2 - HALO} y={p.y - NODE_H / 2 - HALO} width={NODE_W + HALO * 2} height={NODE_H + HALO * 2} rx={13} />
            )}
            {view.status === 'running' && (
              <rect className="ci-progress" x={p.x - NODE_W / 2 + 6} y={p.y + NODE_H / 2 - 7} width={(NODE_W - 12) * view.progress} height={3} rx={1.5} />
            )}
          </SceneNode>
        );
      })}
    </svg>
  );
}

function Gantt({ run, frame }: { run: Run; frame: PipelineFrame }) {
  const span = Math.max(run.wallClock, 1);
  const onPath = new Set(run.failed ? [] : run.criticalPath);
  return (
    <Box variant="sunken" className="ci-gantt">
      <SectionTitle hint="each bar = one job, from start to finish">Wall clock</SectionTitle>
      <div className="ci-rows">
        {run.jobs.map((s) => {
          const view = frame.jobs[s.job.id];
          const left = ((s.start ?? 0) / span) * 100;
          const full = s.start === null ? 0 : (((s.end ?? s.start) - s.start) / span) * 100;
          const shown = view.status === 'running' ? full * view.progress : view.status === 'pending' ? 0 : full;
          return (
            <div key={s.job.id} className="ci-row">
              <span className="ci-row-label">{s.job.label}</span>
              <div className="ci-track">
                {s.start !== null && <span className="ci-plan" style={{ left: `${left}%`, width: `${full}%` }} />}
                <span
                  className={`ci-bar is-${view.status} ${onPath.has(s.job.id) ? 'is-critical' : ''}`}
                  style={{ left: `${left}%`, width: `${shown}%` }}
                />
              </div>
            </div>
          );
        })}
        <div className="ci-now" style={{ left: `calc(var(--ci-label-w) + (100% - var(--ci-label-w)) * ${frame.t / span})` }} />
      </div>
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
