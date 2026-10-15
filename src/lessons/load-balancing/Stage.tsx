import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { toOptions } from '../../components/options';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Controls, ControlGroup, Legend, PauseButton, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { duration, NA, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { sparkPoints } from '../../core/spark';
import { useSimulation } from '../../core/useSimulation';
import { fleetCaption, healthCaption, insightCaption, introCaption, spikeCaption, strategyCaption, toggleCaption } from './captions';
import { drawScene, serverAt } from './draw';
import {
  advance, createWorld, DEFAULT_RATE, HEALTH_DELAY, HISTORY, PRESETS, RATE_RANGE, SERVER_COUNT, serverName, setFleet, snapshot, spike, takeInsight, toggleServer, TRAFFIC_SEED,
  type HealthChange, type PresetId, type World,
} from './sim';
import { STRATEGIES, type StrategyId } from './strategies';
import './styles.css';

const CANVAS_HEIGHT = 400;
const STAGE_HEIGHT = 520;
const SNAPSHOT_EVERY = 0.4;
const P99_BAD = 2; // seconds

export function Stage() {
  const setCaption = useSetCaption();
  const [strategyId, setStrategyId] = useState<StrategyId>('rr');
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [preset, setPreset] = useState<PresetId>('slow');

  useIntroCaption(introCaption());

  const narrateHealth = (changes: HealthChange[]) => {
    for (const change of changes) setCaption(healthCaption(change));
  };

  const narrateInsight = (w: World) => {
    const insight = takeInsight(w);
    if (insight) setCaption(insightCaption(insight, w.strategy));
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
    setCaption(strategyCaption(id));
  };

  const pickPreset = (id: PresetId) => {
    setPreset(id);
    setFleet(world(), id);
    setCaption(fleetCaption(id));
  };

  const toggle = (i: number) => {
    setCaption(toggleCaption(i, toggleServer(world(), i)));
    redraw();
  };

  const onCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const i = hitServer(e);
    if (i >= 0) toggle(i);
  };

  const trafficSpike = () => {
    spike(world());
    setCaption(spikeCaption());
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
          <Stat label="Failed" value={st?.failed ?? 0} color="var(--bad)" sub="lost to a dead server" />
          <Stat label="Dropped" value={st?.dropped ?? 0} color="var(--bad)" sub="queue full" />
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--info)', label: 'request', shape: 'dot' },
              { color: 'var(--amber)', label: 'queued' },
              { color: 'var(--ok)', label: 'response', shape: 'dot' },
              { color: 'var(--bad)', label: 'failed / dropped', shape: 'dot' },
            ]}
          />
          <ProvenanceRow>
            <Provenance kind="simulated" seed={TRAFFIC_SEED}>
              seeded random requests, one copy of the balancer per strategy on the same traffic
            </Provenance>
            <Provenance kind="illustrative">server speeds, a {HEALTH_DELAY} s health check and queue sizes are made up, not measured</Provenance>
          </ProvenanceRow>
        </>
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
          <Slider label="Request rate" value={rate} min={RATE_RANGE.min} max={RATE_RANGE.max} onChange={setRate} format={(v) => perSec(v)} />
          <ControlGroup label="Servers (or click one in the picture)">
            {Array.from({ length: SERVER_COUNT }, (_, i) => {
              const alive = snap?.alive[i] ?? true;
              return (
                <ChipButton
                  key={i}
                  tone={alive ? 'ok' : 'bad'}
                  on={!alive}
                  ariaLabel={`${alive ? 'Kill' : 'Revive'} ${serverName(i)}`}
                  onClick={() => toggle(i)}
                >
                  {serverName(i)} {alive ? 'up' : 'down'}
                </ChipButton>
              );
            })}
          </ControlGroup>
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
