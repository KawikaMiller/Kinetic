import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { GanttLanes } from '../../components/GanttLanes';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { barLabelPx } from '../../core/gantt';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { sec, shutdownFrames } from './frames';
import { shutdown, SIGTERM_AT, type Mode } from './model';
import { graceLeft, HANDLER, handlerState, requestBars, shutdownMarkers } from './view';

const STEP_MS = 1700;
const MODES: { value: Mode; label: string }[] = [
  { value: 'none', label: 'No handler' },
  { value: 'graceful', label: 'Graceful' },
  { value: 'slow', label: 'Too slow' },
  { value: 'pid1', label: 'PID 1 shell' },
];
const DOCKERFILE = ['FROM node:22-slim', 'COPY . /app', 'WORKDIR /app', '# shell form: /bin/sh -c "…" is PID 1, node is its child', 'CMD npm run migrate && node server.js'];
const SCENE_W = 540;
/** The node sub-labels are 10px: keep them at 8px or more. */
const SCENE_MIN_W = minWidthForText(SCENE_W, 10);
const POS = { lb: { x: 80, y: 56 }, app: { x: 270, y: 56 }, orch: { x: 460, y: 56 } };

export function ShutdownScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>('graceful');
  const [grace, setGrace] = useState(30);
  const run = useMemo(() => shutdown(mode, grace), [mode, grace]);
  const frames = useMemo(() => shutdownFrames(run), [run]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { now, phase } = player.frame;
  const domainEnd = Math.max(SIGTERM_AT + grace, ...run.requests.map((r) => r.start + r.dur)) + 2;
  const left = graceLeft(run, now);
  const exited = now >= run.exitAt;
  const removed = now >= run.lbRemoved;
  const signal = phase === 'sigterm' ? 'SIGTERM' : phase === 'exit' && run.killed ? 'SIGKILL' : null;

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Clock" value={sec(now)} sub="illustrative" />
          <Stat label="Grace left" value={left === null ? '–' : sec(left)} color={left === null ? undefined : left === 0 ? 'var(--bad)' : 'var(--hi)'} />
          <Stat label="Process" value={exited ? `exited ${run.exitCode}` : 'running'} color={exited ? (run.exitCode === 0 ? 'var(--ok)' : 'var(--bad)') : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request in flight' },
            { color: 'var(--ok)', label: 'finished after SIGTERM' },
            { color: 'var(--muted)', label: 'finished before the deploy' },
            { color: 'var(--bad)', label: 'cut, errored, SIGKILL' },
            { color: 'var(--hi)', label: 'SIGTERM, grace deadline' },
            { color: 'var(--violet)', label: 'LB removes the instance' },
            { color: 'var(--dim)', label: 'sent to another replica' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Handler" value={mode} onChange={setMode} options={MODES} />
          <Slider label="Grace period" value={grace} min={1} max={60} onChange={setGrace} format={(v) => `${v} s`} />
        </>,
      ]}
    >
      <div className="sg stage-pad">
        <WideRegion minWidth={SCENE_MIN_W} label="Scene: scroll sideways to see all of it">
          <svg viewBox={`0 0 ${SCENE_W} 112`} className="sg-scene" role="img" aria-label={`Load balancer, server, orchestrator at ${sec(now)}`}>
            <line x1={POS.lb.x + 58} y1={POS.lb.y} x2={POS.app.x - 62} y2={POS.app.y} className={`sg-link ${removed ? 'is-removed' : ''}`} />
            <SceneNode at={POS.lb} w={116} h={50} title="load balancer" sub={removed ? 'instance removed' : 'sending here'} tone={removed ? 'violet' : undefined} on={removed} />
            <SceneNode
              at={POS.app}
              w={124}
              h={50}
              title={mode === 'pid1' ? 'PID 1: sh -c' : 'server process'}
              sub={exited ? `exited ${run.exitCode}` : now >= SIGTERM_AT && run.handled ? 'draining' : 'serving'}
              variant={exited ? (run.exitCode === 0 ? 'dim' : 'bad') : 'default'}
            />
            <SceneNode at={POS.orch} w={116} h={50} title="orchestrator" sub="deploying" />
            {signal && (
              <Packet key={`${signal}-${player.index}`} path={[{ x: POS.orch.x - 58, y: POS.orch.y }, { x: POS.app.x + 62, y: POS.app.y }]} label={signal} color={signal === 'SIGTERM' ? 'var(--hi)' : 'var(--bad)'} duration={1.1} />
            )}
          </svg>
        </WideRegion>
        <WideRegion minWidth={480} label="Request timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={run.requests.map((r) => ({ id: r.id, label: `${r.id} ${r.label}` }))}
            bars={requestBars(run, now)}
            domain={[0, domainEnd]}
            now={now}
            markers={shutdownMarkers(run, now)}
            axis
            unit=" s"
            size="md"
            labelWidth={110}
            labelMinPx={barLabelPx('upload')}
            ariaLabel={`Requests at ${sec(now)}`}
          />
        </WideRegion>
        <div className="sg-code">
          {mode === 'pid1' ? (
            <CodePanel title="Dockerfile" lines={DOCKERFILE} stateOf={(i) => (i === 4 ? 'bad' : 'idle')} />
          ) : mode === 'none' ? (
            <p className="empty-note">No SIGTERM handler: the default action terminates the process immediately.</p>
          ) : (
            <CodePanel title="server.js (Node)" lines={HANDLER} stateOf={handlerState(phase, run, now)} />
          )}
          <Hint block>
            A simulated process and orchestrator; requests are long and timings illustrative so the drain is visible. Signal behaviour follows Linux <code>signal(7)</code>. In
            Kubernetes the grace period also covers a preStop hook, which runs before SIGTERM is sent.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}
