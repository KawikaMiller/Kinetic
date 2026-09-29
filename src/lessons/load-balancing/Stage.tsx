import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useCanvas, useLoop } from '../../core/hooks';
import { QUEUE_CAP, Sim, TRAVEL_BACK, TRAVEL_IN, TRAVEL_OUT, type Spec, type StrategyId } from './sim';
import './styles.css';

const C = {
  hi: '#ffd166', ok: '#3ddc97', bad: '#ff5d6c', info: '#4cc9f0', amber: '#f7b538',
  dim: '#3a4152', cell: '#1a1f2d', cellLine: '#2d3447', line: '#323a4f', text: '#e8eaf0', muted: '#8a93a8',
};

const STRATEGIES: { id: StrategyId; label: string; color: string; say: ReactNode }[] = [
  { id: 'rr', label: 'Round robin', color: '#ff8c5a',
    say: <><span className="hl">Round robin</span>: next server in line, busy or not. Keep an eye on the slow one.</> },
  { id: 'random', label: 'Random', color: '#a78bfa',
    say: <><span className="hl violet">Random</span>: roll a die. Fair on average, but unlucky bursts pile up.</> },
  { id: 'least', label: 'Least conn', color: '#3ddc97',
    say: <><span className="hl ok">Least connections</span>: send it to whoever has the fewest in flight. Adapts to slow servers.</> },
  { id: 'p2c', label: 'Power of 2', color: '#4cc9f0',
    say: <><span className="hl info">Power of two choices</span>: pick 2 at random, use the less busy one. Almost as good as least-conn, way cheaper at scale.</> },
  { id: 'wrr', label: 'Weighted RR', color: '#ffd166',
    say: <><span className="hl">Weighted round robin</span>: faster servers get more turns. Great, as long as the weights stay true.</> },
];
const strat = (id: StrategyId) => STRATEGIES.find((s) => s.id === id)!;

const PRESETS = {
  equal: { label: 'All equal', speeds: [1, 1, 1, 1, 1] },
  slow: { label: 'One slow server', speeds: [1, 1, 1, 1, 0.25] },
  mixed: { label: 'Mixed fleet', speeds: [1.6, 1.2, 1, 0.6, 0.35] },
};
type PresetId = keyof typeof PRESETS;

const N = 5;
const HISTORY = 60; // samples at 0.5 s = 30 s
const name = (i: number) => `api-${i + 1}`;

interface Snapshot {
  stats: ReturnType<Sim['stats']>;
  history: Record<StrategyId, number[]>;
}

function layout(w: number, h: number) {
  const boxW = 126;
  const boxH = 50;
  const sx = w - boxW / 2 - 24;
  const top = 44;
  const bottom = h - 44;
  return {
    boxW, boxH,
    clients: [0.25, 0.5, 0.75].map((f) => ({ x: 52, y: h * f })),
    lb: { x: Math.max(200, w * 0.34), y: h / 2 },
    servers: Array.from({ length: N }, (_, i) => ({ x: sx, y: top + ((bottom - top) * i) / (N - 1) })),
  };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** All mutable sim state; the canvas reads it every frame without re-rendering React. */
interface World {
  now: number;
  acc: number;
  nextId: number;
  spikeUntil: number;
  lastStats: number;
  lastSample: number;
  lastInsight: number;
  prevHealthy: boolean[];
  pending: { spec: Spec; t0: number }[];
  sims: Record<StrategyId, Sim>;
  history: Record<StrategyId, number[]>;
  strategy: StrategyId;
  rate: number;
}

const createWorld = (): World => ({
  now: 0,
  acc: 0,
  nextId: 1,
  spikeUntil: -1,
  lastStats: 0,
  lastSample: 0,
  lastInsight: -10,
  prevHealthy: Array(N).fill(true),
  pending: [],
  sims: Object.fromEntries(STRATEGIES.map((s) => [s.id, new Sim(s.id, PRESETS.slow.speeds)])) as Record<StrategyId, Sim>,
  history: Object.fromEntries(STRATEGIES.map((s) => [s.id, []])) as unknown as Record<StrategyId, number[]>,
  strategy: 'rr',
  rate: 11,
});

export function Stage() {
  const setCaption = useSetCaption();
  const [strategy, setStrategy] = useState<StrategyId>('rr');
  const [rate, setRate] = useState(11);
  const [preset, setPreset] = useState<PresetId>('slow');
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  // All mutable sim state lives in one ref: the canvas reads it every frame.
  const wRef = useRef<World | null>(null);
  // lazily created, only ever touched from effects, the loop and handlers
  const world = () => (wRef.current ??= createWorld());
  useEffect(() => {
    const s = world();
    s.strategy = strategy;
    s.rate = rate;
  }, [strategy, rate]);

  const allSims = () => Object.values(world().sims);

  useEffect(() => {
    setCaption(<>Requests stream in from the left. {STRATEGIES[0].say}</>);
  }, [setCaption]);

  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, width, height) => drawScene(ctx, width, height, world()));

  useLoop((dt) => {
    const s = world();
    s.now += dt;
    const now = s.now;
    const spiking = now < s.spikeUntil;

    // new requests leave the clients
    s.acc += s.rate * (spiking ? 3 : 1) * dt * (0.4 + Math.random() * 1.2);
    while (s.acc >= 1) {
      s.acc -= 1;
      const spec: Spec = { id: s.nextId++, client: Math.floor(Math.random() * 3), work: 0.1 + 0.15 * -Math.log(1 - Math.random()) };
      s.pending.push({ spec, t0: now });
    }
    // ...and reach the LB, where every strategy's sim routes the same request
    while (s.pending.length && now - s.pending[0].t0 >= TRAVEL_IN) {
      const { spec } = s.pending.shift()!;
      for (const sim of allSims()) sim.arrive(spec, now);
    }
    for (const sim of allSims()) sim.step(now, dt);

    // narrate health-check transitions (identical across sims)
    const ref = s.sims.rr;
    ref.servers.forEach((srv, i) => {
      if (srv.healthy === s.prevHealthy[i]) return;
      s.prevHealthy[i] = srv.healthy;
      setCaption(
        srv.healthy ? (
          <><span className="hl ok">{name(i)}</span> passed its health check → back in rotation.</>
        ) : (
          <>Health check failed → <span className="hl bad">{name(i)}</span> pulled from rotation. No more requests sent to a corpse.</>
        ),
      );
    });

    if (now - s.lastSample >= 0.5) {
      s.lastSample = now;
      for (const sim of allSims()) {
        const h = s.history[sim.strategy];
        h.push(sim.stats(now).p99);
        if (h.length > HISTORY) h.shift();
      }
    }

    if (now - s.lastStats >= 0.4) {
      s.lastStats = now;
      const sim = s.sims[s.strategy];
      setSnap({ stats: sim.stats(now), history: { ...s.history } });

      if (now - s.lastInsight > 9) {
        const choking = sim.servers.findIndex((srv) => srv.alive && srv.queue.length >= QUEUE_CAP - 2);
        const lying = sim.servers.findIndex((srv) => !srv.alive && srv.healthy);
        if (lying >= 0 && s.strategy === 'least') {
          s.lastInsight = now;
          setCaption(<>Least connections <b>loves</b> the dead server: zero connections looks idle! That's why health checks matter.</>);
        } else if (choking >= 0 && s.strategy !== 'least' && s.strategy !== 'p2c') {
          s.lastInsight = now;
          setCaption(
            <>
              <span className="hl bad">{name(choking)}</span>'s queue is nearly full, and {strat(s.strategy).label.toLowerCase()} keeps
              feeding it anyway. Those requests wait ages or get dropped.
            </>,
          );
        }
      }
    }

    redraw();
  }, !paused);

  const pickStrategy = (id: StrategyId) => {
    setStrategy(id);
    setCaption(strat(id).say);
  };

  const pickPreset = (id: PresetId) => {
    setPreset(id);
    for (const sim of allSims()) sim.setSpeeds(PRESETS[id].speeds);
    setCaption(
      id === 'slow' ? <>api-5 is now <span className="hl bad">4× slower</span> than the rest. Which strategies notice?</>
        : id === 'mixed' ? <>A <b>mixed fleet</b>: old and new hardware. Blind strategies overload the weak boxes.</>
          : <>All servers equal. Every strategy looks fine here, which is exactly why this case is misleading.</>,
    );
  };

  const toggleServer = (i: number) => {
    const s = world();
    const alive = s.sims.rr.servers[i].alive;
    for (const sim of allSims()) {
      if (alive) sim.kill(i, s.now);
      else sim.revive(i, s.now);
    }
    setCaption(
      alive ? (
        <><span className="hl bad">{name(i)}</span> died. The LB hasn't noticed yet, so requests routed there fail until the health check catches it.</>
      ) : (
        <><span className="hl ok">{name(i)}</span> is back up. The LB waits for a passing health check before trusting it.</>
      ),
    );
    redraw();
  };

  const onCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const hit = hitServer(e);
    if (hit >= 0) toggleServer(hit);
  };
  const hitServer = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const L = layout(rect.width, rect.height);
    return L.servers.findIndex((p) => Math.abs(x - p.x) <= L.boxW / 2 && Math.abs(y - p.y) <= L.boxH / 2);
  };

  const st = snap?.stats;
  const fmt = (s: number) => (s >= 1 ? `${s.toFixed(1)}s` : `${Math.round(s * 1000)}ms`);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Throughput" value={st ? `${st.throughput.toFixed(1)}/s` : '–'} color="var(--info)" />
          <Stat label="p50 latency" value={st ? fmt(st.p50) : '–'} />
          <Stat label="p99 latency" value={st ? fmt(st.p99) : '–'} color={st && st.p99 > 2 ? 'var(--bad)' : 'var(--ok)'} />
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
          <Segmented label="Strategy" options={STRATEGIES.map((s) => ({ value: s.id, label: s.label }))} value={strategy} onChange={pickStrategy} />
          <Segmented
            label="Fleet"
            options={(Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))}
            value={preset}
            onChange={pickPreset}
          />
          <Slider label="Request rate" value={rate} min={2} max={24} onChange={setRate} format={(v) => `${v}/s`} />
          <Button
            variant="danger"
            onClick={() => {
              world().spikeUntil = world().now + 4;
              setCaption(<><span className="hl bad">Traffic spike!</span> 3× the load for 4 seconds. Queues fill up and weak strategies crack.</>);
            }}
          >
            ⚡ Traffic spike
          </Button>
          <Button onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>
        </Controls>
      }
    >
      <div className="lb">
        <div ref={wrapRef} className="lb-canvas">
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            onMouseMove={(e) => (e.currentTarget.style.cursor = hitServer(e) >= 0 ? 'pointer' : 'default')}
          />
          <span className="lb-hint">click a server to kill / revive it</span>
        </div>
        <LatencyChart history={snap?.history} selected={strategy} onPick={pickStrategy} />
      </div>
    </StageFrame>
  );
}

function LatencyChart({
  history, selected, onPick,
}: {
  history?: Record<StrategyId, number[]>;
  selected: StrategyId;
  onPick: (id: StrategyId) => void;
}) {
  const W = 600;
  const H = 90;
  const all = history ? Object.values(history).flat() : [];
  const max = Math.max(1, ...all) * 1.1;
  const pts = (arr: number[]) =>
    arr.map((v, i) => `${((i + HISTORY - arr.length) / (HISTORY - 1)) * W},${H - (v / max) * H}`).join(' ');

  return (
    <div className="lb-chart">
      <div className="lb-chart-head">
        <span>
          p99 latency, last 30 s <em>· every strategy runs on the same traffic in parallel</em>
        </span>
        <div className="lb-chart-keys">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === selected ? 'on' : ''}
              style={{ color: s.color }}
              onClick={() => onPick(s.id)}
            >
              <i style={{ background: s.color }} />
              {s.label}
              <b>{history?.[s.id]?.length ? `${history[s.id][history[s.id].length - 1].toFixed(1)}s` : ''}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="lb-chart-plot">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="lb-chart-svg">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="lb-grid" />
        ))}
        {STRATEGIES.map((s) =>
          history?.[s.id]?.length ? (
            <polyline
              key={s.id}
              points={pts(history[s.id])}
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

function drawScene(ctx: CanvasRenderingContext2D, width: number, height: number, s: World) {
  const sim = s.sims[s.strategy];
  const L = layout(width, height);
  const now = s.now;
  const queueX = (i: number, k: number) => L.servers[i].x - L.boxW / 2 - 12 - k * 12;

  // links
  ctx.lineWidth = 1.5;
  for (const c of L.clients) {
    ctx.strokeStyle = C.line;
    ctx.setLineDash([3, 5]);
    line(ctx, c.x + 20, c.y, L.lb.x - 32, L.lb.y);
  }
  sim.servers.forEach((srv, i) => {
    const p = L.servers[i];
    const lied = srv.healthy && !srv.alive;
    ctx.strokeStyle = lied ? C.bad : srv.healthy ? C.line : C.dim;
    ctx.setLineDash(srv.healthy ? [] : [4, 6]);
    ctx.lineWidth = srv.healthy ? 1.5 : 1;
    line(ctx, L.lb.x + 32, L.lb.y, queueX(i, QUEUE_CAP - 1) - 8, p.y);
  });
  ctx.setLineDash([]);

  // clients
  for (const c of L.clients) {
    roundRect(ctx, c.x - 20, c.y - 14, 40, 26, 5, C.cell, C.cellLine);
    ctx.fillStyle = C.info;
    ctx.fillRect(c.x - 14, c.y - 8, 28, 14);
    ctx.fillStyle = C.cellLine;
    ctx.fillRect(c.x - 24, c.y + 12, 48, 3);
  }
  label(ctx, 'clients', L.clients[0].x, L.clients[0].y - 26, C.muted, 11);

  // load balancer
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    ctx.lineTo(L.lb.x + Math.cos(a) * 32, L.lb.y + Math.sin(a) * 32);
  }
  ctx.closePath();
  ctx.fillStyle = C.cell;
  ctx.fill();
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 2;
  ctx.stroke();
  label(ctx, 'LB', L.lb.x, L.lb.y + 5, C.text, 14, 700);
  label(ctx, strat(s.strategy).label, L.lb.x, L.lb.y + 50, strat(s.strategy).color, 11, 600);

  // servers
  sim.servers.forEach((srv, i) => {
    const p = L.servers[i];
    const x0 = p.x - L.boxW / 2;
    const y0 = p.y - L.boxH / 2;
    roundRect(ctx, x0, y0, L.boxW, L.boxH, 9, srv.alive ? C.cell : '#1a1216', srv.alive ? C.cellLine : C.bad);

    // utilisation ring
    const rc = { x: x0 + 24, y: p.y };
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.dim;
    ctx.beginPath();
    ctx.arc(rc.x, rc.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    if (srv.alive) {
      ctx.strokeStyle = srv.util > 0.9 ? C.bad : srv.util > 0.6 ? C.hi : C.ok;
      ctx.beginPath();
      ctx.arc(rc.x, rc.y, 13, -Math.PI / 2, -Math.PI / 2 + srv.util * Math.PI * 2);
      ctx.stroke();
    }
    label(ctx, srv.alive ? `${Math.round(srv.util * 100)}` : '✕', rc.x, rc.y + 4, srv.alive ? C.text : C.bad, 10, 600);

    ctx.textAlign = 'left';
    label(ctx, name(i), x0 + 46, p.y - 4, srv.alive ? C.text : C.bad, 13, 700, 'left');
    label(ctx, srv.alive ? `${srv.speed}× speed` : srv.healthy ? 'DOWN · unseen' : 'DOWN', x0 + 46, p.y + 12, srv.alive ? C.muted : C.bad, 10.5, 500, 'left');

    // in-progress request + progress bar
    if (srv.current) {
      const r = srv.current;
      const t = Math.min(1, (now - r.tPhase) / Math.max(0.001, r.tEnd - r.tPhase));
      ctx.fillStyle = C.dim;
      ctx.fillRect(x0 + 8, y0 + L.boxH - 6, L.boxW - 16, 3);
      ctx.fillStyle = C.hi;
      ctx.fillRect(x0 + 8, y0 + L.boxH - 6, (L.boxW - 16) * t, 3);
    }

    // queue
    srv.queue.forEach((_, k) => {
      const full = srv.queue.length >= QUEUE_CAP - 2;
      ctx.fillStyle = full ? C.bad : C.hi;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(queueX(i, k) - 4.5, p.y - 4.5, 9, 9);
      ctx.globalAlpha = 1;
    });
    if (srv.alive) {
      ctx.strokeStyle = C.cellLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(queueX(i, QUEUE_CAP - 1) - 7, p.y - 7, QUEUE_CAP * 12 + 2, 14);
    }
  });

  // requests heading to the LB (shared by every strategy)
  for (const p of s.pending) {
    const t = ease(Math.min(1, (now - p.t0) / TRAVEL_IN));
    const c = L.clients[p.spec.client];
    dot(ctx, lerp(c.x + 20, L.lb.x - 30, t), lerp(c.y, L.lb.y, t), 3.5, C.info);
  }

  // requests owned by the visible strategy's sim
  for (const r of sim.reqs) {
    const age = now - r.tPhase;
    if (r.phase === 'toServer') {
      const p = L.servers[r.server];
      const t = ease(Math.min(1, age / TRAVEL_OUT));
      const tx = queueX(r.server, sim.servers[r.server].queue.length);
      dot(ctx, lerp(L.lb.x + 30, tx, t), lerp(L.lb.y, p.y, t), 3.5, C.info);
    } else if (r.phase === 'back') {
      const p = L.servers[r.server];
      const c = L.clients[r.client];
      const t = ease(Math.min(1, age / TRAVEL_BACK));
      ctx.globalAlpha = 1 - t * 0.6;
      dot(ctx, lerp(p.x - L.boxW / 2, c.x + 20, t), lerp(p.y, c.y, t) - Math.sin(t * Math.PI) * 30, 3.5, C.ok);
      ctx.globalAlpha = 1;
    } else if (r.phase === 'failed' || r.phase === 'dropped') {
      const at = r.server < 0 ? { x: L.lb.x, y: L.lb.y } : r.phase === 'dropped'
        ? { x: queueX(r.server, QUEUE_CAP), y: L.servers[r.server].y + age * 40 }
        : { x: L.servers[r.server].x - L.boxW / 2, y: L.servers[r.server].y };
      const t = Math.min(1, age / 0.8);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = C.bad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(at.x, at.y, 4 + t * 14, 0, Math.PI * 2);
      ctx.stroke();
      dot(ctx, at.x, at.y, 3.5, C.bad);
      ctx.globalAlpha = 1;
    }
  }
}


// ── canvas helpers ───────────────────────────────────────────────────
function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function label(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 12, weight = 500,
  align: CanvasTextAlign = 'center',
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}
