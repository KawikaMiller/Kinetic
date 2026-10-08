import { useEffect, useRef, useState } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { SectionTitle } from '../../components/Panel';
import { Sparkline } from '../../components/Sparkline';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, PauseButton, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { decimal, plural } from '../../core/format';
import { useSimulation } from '../../core/useSimulation';
import { poolCaption } from './captions';
import { advance, ACQUIRE_TIMEOUT_MS, createWorld, HISTORY_LENGTH, littlesLaw, shapeKey, summarize, type Config, type Summary } from './model';
import { scenarioConfig, SCENARIOS, type ScenarioId } from './scenarios';
import { poolView, type CellView, type PoolView } from './view';
import './styles.css';

const FIRST: ScenarioId = 'small';
const GRID_MIN_W = 560;
const SPARK_W = 200;
const SPARK_H = 36;
const HONEST = 'Simulated app and database: requests arrive at random from a seed, connect and query costs are illustrative, and the pool is a fixed size opened at start.';

interface Snap {
  summary: Summary;
  view: PoolView;
  waits: number[];
}

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'in use', shape: 'square' },
      { color: 'var(--dim)', label: 'idle', shape: 'square' },
      { color: 'var(--hi)', label: 'opening (handshake)', shape: 'square' },
      { color: 'var(--orange)', label: 'refused by the database', shape: 'square' },
      { color: 'var(--bad)', label: 'leaked', shape: 'square' },
      { color: 'var(--violet)', label: 'waiting request', shape: 'square' },
    ]}
  />
);

function cellSpec(c: CellView | null): GridCellSpec {
  if (!c) return { fill: 'none' };
  switch (c.state) {
    case 'busy': return { tone: 'info', fill: 'solid' };
    case 'opening': return { tone: 'hi', fill: 'solid' };
    case 'failed': return { tone: 'orange', fill: 'outline' };
    case 'leaked': return c.flagged ? { tone: 'bad', fill: 'solid' } : { tone: 'bad', fill: 'outline' };
    default: return { tone: 'dim', fill: 'tint' };
  }
}

const CELL_NAMES: Record<string, string> = { busy: 'in use', opening: 'opening', failed: 'refused by the database', leaked: 'leaked', idle: 'idle' };

export function Stage() {
  const [cfg, setCfg] = useState<Config>(() => scenarioConfig(FIRST));
  const [scenario, setScenario] = useState<ScenarioId | null>(FIRST);
  const cfgRef = useRef(cfg);
  const setCaption = useSetCaption();

  const sim = useSimulation({
    create: () => createWorld(cfgRef.current),
    step: (w, dt) => advance(w, cfgRef.current, dt),
    snapshot: (w): Snap => ({
      summary: summarize(w, cfgRef.current),
      view: poolView(w, cfgRef.current.dbMax, cfgRef.current.usePool),
      waits: [...w.waitHistory],
    }),
    snapshotEvery: 0.25,
  });

  const update = (patch: Partial<Config>, preset: ScenarioId | null = null) => {
    const next = { ...cfgRef.current, ...patch };
    const reshaped = shapeKey(next) !== shapeKey(cfgRef.current);
    cfgRef.current = next;
    setCfg(next);
    setScenario(preset);
    if (reshaped) sim.reset();
  };
  const load = (id: ScenarioId) => {
    cfgRef.current = scenarioConfig(id);
    setCfg(cfgRef.current);
    setScenario(id);
    sim.reset();
  };

  const snap = sim.snap;
  useEffect(() => {
    if (snap) setCaption(poolCaption(cfgRef.current, snap.summary), { quiet: true });
  }, [snap, setCaption]);

  const s = snap?.summary;
  const total = cfg.instances * cfg.poolSize;
  const little = littlesLaw(cfg.rate, cfg.queryMs);
  const connectMs = s ? s.connectMean.tcp + s.connectMean.tls + s.connectMean.auth : 0;

  return (
    <StageFrame
      height={420}
      minWidth={GRID_MIN_W}
      legend={LEGEND}
      stats={
        s && (
          <Stats>
            <Stat label={cfg.usePool ? 'Pool in use' : 'Connections open'} value={cfg.usePool ? `${s.inUse} / ${s.slots}` : s.inUse} color="var(--info)" sub={cfg.usePool ? 'connections handed to requests' : 'connections, one per request'} />
            <Stat label="Waiting" value={s.waiting} color={s.waiting ? 'var(--violet)' : undefined} sub="requests queued for a connection" />
            <Stat label="Timeouts" value={s.timedOut} color={s.timedOut ? 'var(--bad)' : undefined} sub={`waited ${ACQUIRE_TIMEOUT_MS / 1000} s for one`} />
            <Stat label="Refused" value={s.refused} color={s.refused ? 'var(--orange)' : undefined} sub="by the database's maximum" />
            <Stat label="Latency p50 / p95" value={`${decimal(s.p50, 0)} / ${decimal(s.p95, 0)} ms`} sub="arrival to answer" />
          </Stats>
        )
      }
      controls={[
        <>
          <ControlGroup label="Start from" inline>
            {SCENARIOS.map((p) => (
              <ChipButton key={p.id} tone="info" on={scenario === p.id} onClick={() => load(p.id)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
          <PauseButton paused={sim.paused} onToggle={sim.togglePause} />
          <Button onClick={sim.reset}>Restart run</Button>
        </>,
        <>
          <Slider label="Requests a second" value={cfg.rate} min={50} max={1000} step={50} onChange={(rate) => update({ rate })} />
          <Slider label="Query time" value={cfg.queryMs} min={2} max={100} onChange={(queryMs) => update({ queryMs })} format={(v) => `${v} ms`} />
          <Toggle label="A leak in the code" value={cfg.leak} onChange={(leak) => update({ leak })} off="Off" on="On" />
        </>,
        <>
          <Toggle label="Pool" value={cfg.usePool} onChange={(usePool) => update({ usePool })} off="No pool" on="Pool" />
          <Slider label="App instances" value={cfg.instances} min={1} max={20} onChange={(instances) => update({ instances })} />
          <Slider label="Pool size each" value={cfg.poolSize} min={1} max={50} onChange={(poolSize) => update({ poolSize })} />
          <Slider label="Database max" value={cfg.dbMax} min={50} max={1000} step={50} onChange={(dbMax) => update({ dbMax })} />
        </>,
      ]}
    >
      <div className="stage-pad cpl">
        {snap && (
          <>
            <SectionTitle weight="regular" hint={cfg.usePool ? 'one row per app instance, one cell per connection slot' : 'each cell is a connection a request opened'}>
              {cfg.usePool ? 'Connection pools' : 'Connections at the database'}
            </SectionTitle>
            <CellGrid
              className="cpl-grid"
              rows={snap.view.rows.length}
              cols={snap.view.cols}
              size={snap.view.cols * snap.view.rows.length > 120 ? 'xs' : 'sm'}
              rowLabels={cfg.usePool ? snap.view.rows.map((_, i) => `app ${i + 1}`) : undefined}
              cell={(r, c) => cellSpec(snap.view.rows[r][c] ?? null)}
              cellTitle={(r, c) => {
                const cell = snap.view.rows[r][c];
                return cell ? CELL_NAMES[cell.state] : '';
              }}
              ariaLabel={`Connection slots: ${s?.inUse ?? 0} in use, ${s?.idle ?? 0} idle, ${s?.failed ?? 0} refused, ${s?.leaked ?? 0} leaked`}
            />
            {snap.view.queues.some((q) => q > 0) && (
              <div className="cpl-queues">
                {snap.view.queues.map((q, i) => q > 0 && <span key={i} className="cpl-queue">app {i + 1}: {plural(q, 'request')} waiting</span>)}
              </div>
            )}
            <div className="cpl-gauges">
              <Bar value={s!.open} max={cfg.dbMax} tone={s!.open >= cfg.dbMax ? 'orange' : 'info'} marker={cfg.dbMax} markLabel="database maximum" label={`Connections at the database: ${s!.open} of ${cfg.dbMax}`} ariaLabel={`${s!.open} of ${cfg.dbMax} database connections`} />
              <Bar value={s!.cpu} max={1} tone={s!.cpu > 0.8 ? 'bad' : 'ok'} label={`Database load (illustrative): ${Math.round(s!.cpu * 100)}%, queries ${decimal(s!.slowdown, 1)}× slower than alone`} ariaLabel={`Database load ${Math.round(s!.cpu * 100)} percent`} />
              <div className="cpl-spark">
                <span>Longest wait for a connection</span>
                <Sparkline values={snap.waits} width={SPARK_W} height={SPARK_H} color="var(--violet)" cap={HISTORY_LENGTH} align="right" minMax={ACQUIRE_TIMEOUT_MS} />
                <b>{decimal(s!.longestWait, 0)} ms</b>
              </div>
            </div>
            <SectionTitle weight="regular" hint="what each request pays, on average over this run">The cost of a connection</SectionTitle>
            <Bar
              segments={[
                { value: s!.connectMean.tcp, color: 'var(--hi)' },
                { value: s!.connectMean.tls, color: 'var(--amber)' },
                { value: s!.connectMean.auth, color: 'var(--violet)' },
                { value: cfg.queryMs, color: 'var(--info)' },
              ]}
              max={Math.max(1, connectMs + cfg.queryMs)}
              height={14}
              label={cfg.usePool ? `Opening one connection: TCP, TLS, login (${decimal(connectMs, 0)} ms), then a ${cfg.queryMs} ms query` : `Every request: TCP, TLS, login (${decimal(connectMs, 0)} ms), then a ${cfg.queryMs} ms query`}
              ariaLabel="Handshake and query time"
            />
            <p className="cpl-note">
              {cfg.usePool
                ? `With a pool each connection pays that handshake once, when it opens, and every later request goes straight to the ${cfg.queryMs} ms query.`
                : 'With no pool the handshake is paid again for every single request, and the database starts a new process or thread for each connection.'}
            </p>
            <SectionTitle weight="regular" hint="a starting point for the pool, not an answer">Sizing with Little's law</SectionTitle>
            <p className="cpl-note">
              {cfg.rate} requests a second × {cfg.queryMs} ms each = about <b>{decimal(little, 1)}</b> connections busy running queries on average.
              {cfg.usePool
                ? <> This run measures <b>{decimal(s!.meanInUse, 1)}</b> in use. You have <b>{total}</b> slots ({cfg.instances} × {cfg.poolSize}), and the database accepts {cfg.dbMax}: the total is always instances × pool size.
                    When many instances would multiply past the database's limit, an external pooler such as PgBouncer sits in front and shares a few real connections between them.</>
                : <> A pool of about that size, with some headroom, would serve this traffic. Without one, each request needs a connection for its whole {decimal(connectMs + cfg.queryMs, 0)} ms.</>}
            </p>
          </>
        )}
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
