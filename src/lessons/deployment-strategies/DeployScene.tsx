import { useMemo, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { SceneNode } from '../../components/scene';
import { Sparkline } from '../../components/Sparkline';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { times } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { deployFrames } from './frames';
import {
  HORIZON, REPLICAS, REQ_PER_TICK, costRatio, detectAfter, expectedHit, hitSoFar, rollbackAfter, sampleRequests, served, simulate, type Config, type Run, type TickState,
} from './model';
import {
  GRID_COLS, GRID_ROWS, REQ_COLS, REQ_ROWS, SERVER_CELL_PX, STRATEGY_LABEL, describeRequest, failedCount, hitSeries, requestCell, share, slotCell, slotsAt,
} from './view';

const STEP_MS = 650;
const SERVER_SIZE = { cell: SERVER_CELL_PX, font: 14 };
const LB_W = 360;
const LB_POS = { lb: { x: 64, y: 50 }, v1: { x: 292, y: 24 }, v2: { x: 292, y: 76 } };
const LB_MIN_W = 320;
/** A link's stroke grows with the share of requests it carries. */
const LINK_BASE = 1.5;
const LINK_SCALE = 4.5;
const SPARK = { width: 96, height: 22 };

function LoadBalancer({ tick }: { tick: TickState }) {
  const up = served(tick);
  const w2 = up ? tick.weight : 0;
  const link = (y: number, s: number, tone: 'info' | 'violet', on: boolean) => (
    <line
      x1={LB_POS.lb.x + 48}
      y1={LB_POS.lb.y}
      x2={LB_POS.v1.x - 52}
      y2={y}
      className={`ds-link tone-${on ? tone : 'dim'}`}
      strokeWidth={LINK_BASE + LINK_SCALE * s}
      strokeDasharray={on ? undefined : '5 5'}
    />
  );
  return (
    <WideRegion minWidth={LB_MIN_W} label="Load balancer: scroll sideways to see all of it">
      <svg viewBox={`0 0 ${LB_W} 100`} className="ds-lb" role="img" aria-label={`Load balancer sending ${share(1 - w2)} to v1 and ${share(w2)} to v2`}>
        {link(LB_POS.v1.y, up ? 1 - w2 : 0, 'info', up && tick.v1 > 0)}
        {link(LB_POS.v2.y, w2, 'violet', up && tick.v2 > 0)}
        <SceneNode at={LB_POS.lb} w={96} h={44} title="load balancer" sub={up ? `${REQ_PER_TICK} req/min` : 'nothing to send to'} variant={up ? 'default' : 'bad'} />
        <SceneNode at={LB_POS.v1} w={104} h={40} title="v1" sub={`${tick.v1} servers · ${share(up ? 1 - w2 : 0)}`} tone="info" variant={tick.v1 > 0 ? 'default' : 'dim'} />
        <SceneNode at={LB_POS.v2} w={104} h={40} title="v2" sub={`${tick.v2} servers · ${share(w2)}`} tone="violet" variant={tick.v2 > 0 ? 'default' : 'dim'} />
      </svg>
    </WideRegion>
  );
}

function Fleet({ run, tick }: { run: Run; tick: TickState }) {
  const { primary, extra } = slotsAt(run, tick);
  const blueGreen = run.cfg.strategy === 'bluegreen';
  const rollingBack = tick.phase === 'rollback' || (run.trigger && !run.trigger.blocked && tick.t === run.trigger.tick + 1);
  const grid = (kinds: typeof primary, rows: number, label: string) => (
    <figure className="ds-grid">
      <figcaption>{label}</figcaption>
      <CellGrid
        rows={rows}
        cols={GRID_COLS}
        size={SERVER_SIZE}
        cell={(r, c) => slotCell(kinds[r * GRID_COLS + c] ?? 'none')}
        cellTitle={(r, c) => `Server ${r * GRID_COLS + c + 1}: ${kinds[r * GRID_COLS + c] ?? 'none'}`}
        ariaLabel={`${label}: ${kinds.filter((k) => k === 'v1').length} on v1, ${kinds.filter((k) => k === 'v2').length} on v2`}
      />
    </figure>
  );
  return (
    <div className={`ds-fleet ${rollingBack ? 'is-rollback' : ''}`}>
      {grid(primary, GRID_ROWS, blueGreen ? 'blue fleet' : `servers (${REPLICAS} needed)`)}
      {extra.length > 0 && grid(extra, extra.length / GRID_COLS, blueGreen ? 'green fleet' : 'extra servers (surge)')}
    </div>
  );
}

export function DeployScene({ cfg, controls }: { cfg: Config; controls: ReactNode[] }) {
  const run = useMemo(() => simulate(cfg), [cfg]);
  const frames = useMemo(() => deployFrames(run), [run]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const t = player.frame.t;
  const tick = run.ticks[t];
  const reqs = useMemo(() => sampleRequests(cfg, tick), [cfg, tick]);
  const detected = run.trigger !== null && t >= run.trigger.tick;
  const detect = detected ? detectAfter(run) : null;
  const back = rollbackAfter(run);
  const rolledBack = run.rolledBackAt !== null && t >= run.rolledBackAt;
  const expectedSoFar = run.ticks.slice(0, t + 1).reduce((n, k) => n + expectedHit(cfg, k), 0);
  const hits = hitSoFar(run, t);

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Minute" value={t} sub="illustrative" />
          <Stat label="Traffic on v2" value={served(tick) ? share(tick.weight) : 'no server'} color={served(tick) && tick.weight > 0 ? 'var(--violet)' : undefined} />
          <Stat label="Users hit so far" value={hits} color={hits > 0 ? 'var(--bad)' : undefined} sub={`expected ${Math.round(expectedSoFar)}`}>
            <Sparkline values={hitSeries(run, t)} width={SPARK.width} height={SPARK.height} cap={HORIZON} align="left" color="var(--bad)" />
          </Stat>
          <Stat label="Detected after" value={detect === null ? (detected ? 'at once' : '–') : `${detect} min`} color={detected ? 'var(--hi)' : undefined} />
          <Stat
            label="Rolled back after"
            value={run.trigger?.blocked && detected ? 'blocked' : rolledBack && back !== null ? `${back} min` : '–'}
            color={run.trigger?.blocked && detected ? 'var(--bad)' : rolledBack ? 'var(--orange)' : undefined}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'v1' },
            { color: 'var(--violet)', label: 'v2' },
            { color: 'var(--hi)', label: 'starting' },
            { color: 'var(--dim)', label: 'idle or off' },
            { color: 'var(--ok)', label: 'request served' },
            { color: 'var(--bad)', label: 'request failed' },
            { color: 'var(--orange)', label: 'rollback' },
          ]}
        />
      }
      controls={controls}
    >
      <div className="ds stage-pad">
        <LoadBalancer tick={tick} />
        <Fleet run={run} tick={tick} />
        <figure className="ds-reqs">
          <figcaption>
            This minute&apos;s {REQ_PER_TICK} requests: {failedCount(reqs)} failed
          </figcaption>
          <CellGrid
            rows={REQ_ROWS}
            cols={REQ_COLS}
            size="xs"
            cell={(r, c) => requestCell(reqs[r * REQ_COLS + c])}
            cellTitle={(r, c) => describeRequest(r * REQ_COLS + c, reqs[r * REQ_COLS + c])}
            ariaLabel={`${REQ_PER_TICK} requests, ${failedCount(reqs)} failed`}
          />
        </figure>
        <Stat label={`${STRATEGY_LABEL[cfg.strategy]}: most servers running at once`} value={`${run.peakPods}`} sub={`${times(costRatio(run))} the ${REPLICAS} the fleet needs`}>
          <Bar value={run.peakPods} max={2 * REPLICAS} marker={REPLICAS} markLabel={`${REPLICAS} servers`} tone={run.peakPods > REPLICAS ? 'hi' : 'info'} />
        </Stat>
        <p className="hint">Simulated fleet and traffic: error rates, boot and bake times are illustrative, and a minute is one step. Capacity limits are not modelled.</p>
      </div>
    </StageFrame>
  );
}
