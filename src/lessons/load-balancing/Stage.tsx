import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { toOptions } from '../../components/options';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, PauseButton, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { duration, NA, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { sparkPoints } from '../../core/spark';
import { useSimulation } from '../../core/useSimulation';
import { drawScene, serverAt } from './draw';
import {
  advance, createWorld, HISTORY, PRESETS, serverName, setFleet, snapshot, spike, SPIKE, takeInsight, toggleServer,
  type HealthChange, type PresetId, type World,
} from './sim';
import { STRATEGIES, strategy, type StrategyId } from './strategies';
import './styles.css';

const SAY: Record<StrategyId, ReactNode> = {
  rr: <><span className="hl">Round robin</span>: next server in line, busy or not. Keep an eye on the slow one.</>,
  random: <><span className="hl violet">Random</span>: roll a die. Fair on average, but unlucky bursts pile up.</>,
  least: <><span className="hl ok">Least connections</span>: send it to whoever has the fewest in flight. Adapts to slow servers.</>,
  p2c: <><span className="hl info">Power of two choices</span>: pick 2 at random, use the less busy one. Almost as good as least-conn, way cheaper at scale.</>,
  wrr: <><span className="hl">Weighted round robin</span>: faster servers get more turns. Great, as long as the weights stay true.</>,
};

const FLEET_SAY: Record<PresetId, ReactNode> = {
  slow: <>api-5 is now <span className="hl bad">4× slower</span> than the rest. Which strategies notice?</>,
  mixed: <>A <b>mixed fleet</b>: old and new hardware. Blind strategies overload the weak boxes.</>,
  equal: <>All servers equal. Every strategy looks fine here, which is exactly why this case is misleading.</>,
};

const CANVAS_HEIGHT = 400;
const STAGE_HEIGHT = 520;
const SNAPSHOT_EVERY = 0.4;
const P99_BAD = 2; // seconds

export function Stage() {
  const setCaption = useSetCaption();
  const [strategyId, setStrategyId] = useState<StrategyId>('rr');
  const [rate, setRate] = useState(11);
  const [preset, setPreset] = useState<PresetId>('slow');

  useIntroCaption(<>Requests stream in from the left. {SAY.rr}</>);

  const narrateHealth = (changes: HealthChange[]) => {
    for (const { server, healthy } of changes) {
      setCaption(
        healthy ? (
          <><span className="hl ok">{serverName(server)}</span> passed its health check → back in rotation.</>
        ) : (
          <>Health check failed → <span className="hl bad">{serverName(server)}</span> pulled from rotation. No more requests sent to a corpse.</>
        ),
      );
    }
  };

  const narrateInsight = (w: World) => {
    const insight = takeInsight(w);
    if (insight?.kind === 'lying') {
      setCaption(<>Least connections <b>loves</b> the dead server: zero connections looks idle! That's why health checks matter.</>);
    } else if (insight?.kind === 'choking') {
      setCaption(
        <>
          <span className="hl bad">{serverName(insight.server)}</span>'s queue is nearly full, and {strategy(w.strategy).label.toLowerCase()} keeps
          feeding it anyway. Those requests wait ages or get dropped.
        </>,
      );
    }
  };

  const { world, snap, paused, togglePause } = useSimulation({
    create: () => createWorld(strategyId, rate),
    step: (w, dt) => narrateHealth(advance(w, dt)),
    snapshot,
    snapshotEvery: SNAPSHOT_EVERY,
    onSnapshot: narrateInsight,
  });
  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, width, height) => drawScene(ctx, width, height, world()));
  useLoop(redraw, !paused);

  useEffect(() => {
    const w = world();
    w.strategy = strategyId;
    w.rate = rate;
  }, [world, strategyId, rate]);

  const pickStrategy = (id: StrategyId) => {
    setStrategyId(id);
    setCaption(SAY[id]);
  };

  const pickPreset = (id: PresetId) => {
    setPreset(id);
    setFleet(world(), id);
    setCaption(FLEET_SAY[id]);
  };

  const onCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const i = hitServer(e);
    if (i < 0) return;
    const alive = toggleServer(world(), i);
    setCaption(
      alive ? (
        <><span className="hl ok">{serverName(i)}</span> is back up. The LB waits for a passing health check before trusting it.</>
      ) : (
        <><span className="hl bad">{serverName(i)}</span> died. The LB hasn't noticed yet, so requests routed there fail until the health check catches it.</>
      ),
    );
    redraw();
  };

  const trafficSpike = () => {
    spike(world());
    setCaption(<><span className="hl bad">Traffic spike!</span> {SPIKE.factor}× the load for {SPIKE.seconds} seconds. Queues fill up and weak strategies crack.</>);
  };

  const st = snap?.stats;

  return (
    <StageFrame minWidth={640}
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat label="Throughput" value={st ? perSec(st.throughput, 1) : NA} color="var(--info)" />
          <Stat label="p50 latency" value={st ? duration(st.p50) : NA} />
          <Stat label="p99 latency" value={st ? duration(st.p99) : NA} color={st && st.p99 > P99_BAD ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Failed" value={st?.failed ?? 0} color="var(--bad)" sub="sent to dead box" />
          <Stat label="Dropped" value={st?.dropped ?? 0} color="var(--bad)" sub="queue full" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request', shape: 'dot' },
            { color: 'var(--hi)', label: 'queued' },
            { color: 'var(--ok)', label: 'response', shape: 'dot' },
            { color: 'var(--bad)', label: 'failed / dropped', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Strategy" options={toOptions(STRATEGIES)} value={strategyId} onChange={pickStrategy} />
          <Segmented
            label="Fleet"
            options={(Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))}
            value={preset}
            onChange={pickPreset}
          />
          <Slider label="Request rate" value={rate} min={2} max={24} onChange={setRate} format={(v) => perSec(v)} />
          <Button variant="danger" onClick={trafficSpike}>⚡ Traffic spike</Button>
          <PauseButton paused={paused} onToggle={togglePause} />
        </Controls>
      }
    >
      <div className="lb">
        <div ref={wrapRef} className="canvas-wrap" style={{ '--h': `${CANVAS_HEIGHT}px` } as CSSProperties}>
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            onMouseMove={(e) => (e.currentTarget.style.cursor = hitServer(e) >= 0 ? 'pointer' : 'default')}
          />
          <span className="lb-hint">click a server to kill / revive it</span>
        </div>
        <LatencyChart history={snap?.history} selected={strategyId} onPick={pickStrategy} />
      </div>
    </StageFrame>
  );
}

function hitServer(e: MouseEvent<HTMLCanvasElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  return serverAt(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
}

const CHART = { w: 600, h: 90, headroom: 1.1 };

function LatencyChart({
  history, selected, onPick,
}: {
  history?: Record<StrategyId, number[]>;
  selected: StrategyId;
  onPick: (id: StrategyId) => void;
}) {
  const all = history ? Object.values(history).flat() : [];
  const max = Math.max(1, ...all) * CHART.headroom;
  const points = (values: number[]) =>
    sparkPoints(values, CHART.w, CHART.h, { cap: HISTORY, max }).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="lb-chart">
      <div className="lb-chart-head">
        <span>
          p99 latency, last 30 s <em>· every strategy runs on the same traffic in parallel</em>
        </span>
        <div className="lb-chart-keys">
          {STRATEGIES.map((s) => {
            const values = history?.[s.id];
            return (
              <button key={s.id} type="button" className={s.id === selected ? 'on' : ''} style={{ color: s.color }} onClick={() => onPick(s.id)}>
                <i style={{ background: s.color }} />
                {s.label}
                <b>{values?.length ? `${values[values.length - 1].toFixed(1)}s` : ''}</b>
              </button>
            );
          })}
        </div>
      </div>
      <div className="lb-chart-plot">
        <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} preserveAspectRatio="none" className="lb-chart-svg">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={CHART.w} y1={CHART.h * f} y2={CHART.h * f} className="lb-grid" />
          ))}
          {STRATEGIES.map((s) =>
            history?.[s.id]?.length ? (
              <polyline
                key={s.id}
                points={points(history[s.id])}
                fill="none"
                stroke={s.color}
                strokeWidth={s.id === selected ? 2.5 : 1.2}
                strokeOpacity={s.id === selected ? 1 : 0.45}
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
        </svg>
        <span className="lb-chart-max">{max.toFixed(1)}s</span>
      </div>
    </div>
  );
}
