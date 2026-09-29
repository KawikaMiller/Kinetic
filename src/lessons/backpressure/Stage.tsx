import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useCanvas, useLoop } from '../../core/hooks';
import { CAP, MEM_LIMIT, MU, Pipeline, SHED_AT, type Item, type Policy } from './sim';
import './styles.css';

const C = {
  hi: '#ffd166', ok: '#3ddc97', bad: '#ff5d6c', info: '#4cc9f0', violet: '#a78bfa',
  dim: '#3a4152', cell: '#1a1f2d', cellLine: '#2d3447', line: '#323a4f', text: '#e8eaf0', muted: '#8a93a8', faint: '#5b6378',
};

const POLICIES: { id: Policy; label: string; say: ReactNode }[] = [
  { id: 'unbounded', label: 'Unbounded queue',
    say: <><span className="hl bad">Unbounded queue</span>: accept everything, queue it in memory, get to it eventually. Push arrivals past {MU}/s and see what "eventually" means.</> },
  { id: 'bounded', label: 'Bounded + backpressure',
    say: <><span className="hl info">Bounded queue + backpressure</span>: at most {CAP} items. When it's full the producer has to wait, so the slow stage sets the pace.</> },
  { id: 'shed', label: 'Load shedding',
    say: <><span className="hl violet">Load shedding</span>: past {SHED_AT} queued, reject low-priority work instantly with a 503; only when completely full is high-priority work refused too.</> },
];

const HISTORY = 60;

interface World {
  p: Pipeline;
  acc: number;
  rate: number;
  spikeUntil: number;
  lastSnap: number;
  lastSample: number;
  lastInsight: number;
  history: number[]; // p99 samples
}

type Snap = ReturnType<Pipeline['stats']>;

function layout(w: number) {
  const qx0 = 150;
  const qx1 = Math.max(qx0 + 260, w * 0.58);
  return { px: 66, qx0, qx1, wx: qx1 + 70, sx: qx1 + 170, mx: w - 40, y: 112, binY: 215, bottomTop: 282, slot: (qx1 - qx0) / CAP };
}

export function Stage() {
  const setCaption = useSetCaption();
  const [policy, setPolicy] = useState<Policy>('unbounded');
  const [rate, setRate] = useState(8);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);

  const wRef = useRef<World | null>(null);
  const world = () =>
    (wRef.current ??= { p: new Pipeline(), acc: 0, rate: 8, spikeUntil: -1, lastSnap: 0, lastSample: 0, lastInsight: 0, history: [] });

  useEffect(() => {
    world().rate = rate;
  }, [rate]);

  useEffect(() => {
    setCaption(
      <>Work arrives at <b>8/s</b>; the worker can do <b>{MU}/s</b>. 80% busy and the queue stays short. {POLICIES[0].say}</>,
    );
  }, [setCaption]);

  const { wrapRef, canvasRef, size, redraw } = useCanvas((ctx, w, h) => draw(ctx, w, h, world()));

  useLoop((dt) => {
    const s = world();
    const p = s.p;
    const L = layout(size.width || 900);
    const from = { x: L.px + 34, y: L.y };
    const spiking = p.now < s.spikeUntil;
    s.acc += s.rate * (spiking ? 3 : 1) * dt * (0.4 + Math.random() * 1.2);
    while (s.acc >= 1) {
      s.acc -= 1;
      p.arrive(from);
    }
    p.step(dt, from);

    // ease every item toward where its state says it should be
    const k = Math.min(1, dt * 10);
    for (const it of p.items) {
      const t = target(it, p, L);
      it.x += (t.x - it.x) * k;
      it.y += (t.y - it.y) * k;
    }

    for (const e of p.events.splice(0)) {
      if (e === 'oom') setCaption(<><span className="hl bad">💥 Out of memory.</span> The queue passed {MEM_LIMIT} items and the process was killed. Everything waiting in it is gone, and so is every request that arrives while it restarts.</>);
      if (e === 'restart') setCaption(<>Restarted with an empty queue… and if arrivals still beat {MU}/s, it fills right back up. An unbounded queue doesn't fix overload, it just delays the crash.</>);
      if (e === 'blocked') setCaption(<>Queue full → <span className="hl info">backpressure</span>. The producer is told to wait. Latency inside the service stays bounded, and memory can't blow up.</>);
      if (e === 'shedStart') setCaption(<>Overloaded → <span className="hl violet">shedding</span> low-priority work with an instant 503. Yellow high-priority work still gets in.</>);
    }

    if (p.now - s.lastSample >= 0.5) {
      s.lastSample = p.now;
      s.history.push(p.stats().p99);
      if (s.history.length > HISTORY) s.history.shift();
    }
    if (p.now - s.lastSnap > 0.3) {
      s.lastSnap = p.now;
      const st = p.stats();
      setSnap(st);
      const rho = (s.rate * (spiking ? 3 : 1)) / MU;
      if (p.now - s.lastInsight > 10 && p.policy === 'unbounded' && rho > 1 && st.queue > 60 && !st.down) {
        s.lastInsight = p.now;
        setCaption(<>Arrivals beat the worker, so the queue grows <b>forever</b>. Each new item waits behind {st.queue} others: <span className="hl bad">{(st.queue / MU).toFixed(0)} s</span> and climbing.</>);
      } else if (p.now - s.lastInsight > 10 && rho >= 0.85 && rho < 1) {
        s.lastInsight = p.now;
        setCaption(<>{Math.round(rho * 100)}% utilisation: still keeping up <i>on average</i>, but random bursts pile up and latency spikes. That's the knee of the curve.</>);
      }
    }
    redraw();
  }, !paused);

  const pick = (id: Policy) => {
    setPolicy(id);
    world().p.setPolicy(id);
    setCaption(POLICIES.find((x) => x.id === id)!.say);
  };

  const reset = () => {
    const s = world();
    s.p = new Pipeline();
    s.p.setPolicy(policy);
    s.history = [];
    s.acc = 0;
    setCaption(<>Fresh start, same policy: <b>{POLICIES.find((x) => x.id === policy)!.label}</b>.</>);
  };

  const fmt = (v: number) => (v >= 1 ? `${v.toFixed(1)}s` : `${Math.round(v * 1000)}ms`);
  const rho = rate / MU;

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Utilisation" value={`${Math.round(rho * 100)}%`} color={rho >= 1 ? 'var(--bad)' : rho >= 0.8 ? 'var(--hi)' : 'var(--ok)'} sub={`${rate}/s in · ${MU}/s capacity`} />
          <Stat label="In queue" value={snap?.queue ?? 0} color={snap && snap.queue > CAP ? 'var(--bad)' : 'var(--info)'} sub={policy === 'bounded' && snap?.pending ? `${snap.pending} waiting upstream` : ' '} />
          <Stat label="p99 latency" value={snap ? fmt(snap.p99) : '–'} color={snap && snap.p99 > 3 ? 'var(--bad)' : 'var(--ok)'} sub={snap ? `p50 ${fmt(snap.p50)}` : ''} />
          <Stat label="Crashes" value={snap?.crashes ?? 0} color="var(--bad)" sub={`${snap?.lost ?? 0} requests lost`} />
          <Stat label="Shed (503)" value={snap ? snap.rejectedLow + snap.rejectedHigh : 0} color="var(--violet)" sub={snap ? `${snap.rejectedHigh} high-priority` : ''} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'work item' },
            { color: 'var(--hi)', label: 'high priority' },
            { color: 'var(--ok)', label: 'done' },
            { color: 'var(--bad)', label: 'dropped / lost' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Overload policy" options={POLICIES.map((x) => ({ value: x.id, label: x.label }))} value={policy} onChange={pick} />
          <Slider label="Arrival rate" value={rate} min={2} max={20} onChange={setRate} format={(v) => `${v}/s`} />
          <Button
            variant="danger"
            onClick={() => {
              world().spikeUntil = world().p.now + 5;
              setCaption(<><span className="hl bad">Spike!</span> 3× the arrivals for 5 seconds: {rate * 3}/s against a worker that does {MU}/s.</>);
            }}
          >
            ⚡ Spike ×3
          </Button>
          <Button onClick={reset}>↺ Reset</Button>
          <Button onClick={() => setPaused((v) => !v)}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>
        </Controls>
      }
    >
      <div ref={wrapRef} className="bp-canvas">
        <canvas ref={canvasRef} />
      </div>
    </StageFrame>
  );
}

/* ─── Drawing ─────────────────────────────────────────────────────── */

type Layout = ReturnType<typeof layout>;

function target(it: Item, p: Pipeline, L: Layout) {
  switch (it.state) {
    case 'queued': {
      const i = p.queue.indexOf(it);
      const visible = Math.floor((L.qx1 - L.qx0) / L.slot);
      return i >= 0 && i < visible ? { x: L.qx1 - L.slot * (i + 0.5), y: L.y } : { x: L.qx0 + 4, y: L.y };
    }
    case 'serving':
      return { x: L.wx - 32, y: L.y };
    case 'done':
      return { x: L.sx + 20, y: L.y };
    case 'rejected':
      return { x: it.x + 8, y: L.binY };
  }
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, s: World) {
  const p = s.p;
  const L = layout(w);
  const now = p.now;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // producer
  const blocked = p.policy === 'bounded' && p.pendingUpstream > 0;
  roundBox(ctx, L.px, L.y, 92, 58, blocked ? C.hi : C.info);
  text(ctx, 'producer', L.px, L.y - 10, C.text, '700 12px Inter, system-ui, sans-serif');
  text(ctx, blocked ? '⏸ waiting' : `${s.rate * (now < s.spikeUntil ? 3 : 1)}/s`, L.px, L.y + 10, blocked ? C.hi : C.muted);
  if (blocked) text(ctx, `${p.pendingUpstream} waiting upstream`, L.px, L.y + 46, C.hi);

  // queue pipe
  ctx.fillStyle = 'rgba(10,12,17,0.85)';
  ctx.strokeStyle = C.cellLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(L.qx0 - 6, L.y - 16, L.qx1 - L.qx0 + 12, 32, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  text(ctx, p.policy === 'unbounded' ? 'queue (no limit)' : `queue · max ${CAP}`, L.qx0 - 4, L.y - 28, C.muted);
  ctx.textAlign = 'center';
  if (p.policy !== 'unbounded') {
    // the hard wall at the capacity limit
    ctx.strokeStyle = C.bad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(L.qx0 - 6, L.y - 20);
    ctx.lineTo(L.qx0 - 6, L.y + 20);
    ctx.stroke();
  }
  if (p.policy === 'shed') {
    const x = L.qx1 - L.slot * SHED_AT;
    ctx.strokeStyle = C.violet;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, L.y - 22);
    ctx.lineTo(x, L.y + 22);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, 'shed low priority past here', x, L.y + 32, C.violet, '600 10px "JetBrains Mono", monospace');
  }
  const visible = Math.floor((L.qx1 - L.qx0) / L.slot);
  if (p.queue.length > visible) {
    ctx.textAlign = 'left';
    text(ctx, `+${p.queue.length - visible} more in memory`, L.qx0 - 4, L.y + 30, C.bad);
    ctx.textAlign = 'center';
  }

  // worker
  roundBox(ctx, L.wx, L.y, 96, 58, p.down ? C.bad : p.serving ? C.ok : C.cellLine);
  roundBox(ctx, L.sx, L.y, 64, 40, C.ok);

  // reject bin
  ctx.fillStyle = 'rgba(255,93,108,0.06)';
  ctx.strokeStyle = 'rgba(255,93,108,0.45)';
  ctx.beginPath();
  ctx.roundRect(L.qx0 - 6, L.binY - 14, 190, 28, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  text(ctx, 'dropped · 503 · lost', L.qx0 + 4, L.binY, C.bad);
  ctx.textAlign = 'center';

  // memory gauge
  const memTop = 40;
  const memBottom = 200;
  const fill = clamp01(p.inSystem / MEM_LIMIT);
  ctx.fillStyle = C.cell;
  ctx.strokeStyle = C.cellLine;
  ctx.beginPath();
  ctx.roundRect(L.mx - 12, memTop, 24, memBottom - memTop, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = fill > 0.8 ? C.bad : fill > 0.4 ? C.hi : C.ok;
  ctx.beginPath();
  ctx.roundRect(L.mx - 10, memBottom - 2 - (memBottom - memTop - 4) * fill, 20, (memBottom - memTop - 4) * fill, 4);
  ctx.fill();
  ctx.strokeStyle = C.bad;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(L.mx - 18, memTop);
  ctx.lineTo(L.mx + 18, memTop);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, 'OOM', L.mx, memTop - 10, C.bad);
  text(ctx, 'memory', L.mx, memBottom + 14, C.muted);

  // items
  for (const it of p.items) {
    let alpha = 1;
    if (it.state === 'done' || it.state === 'rejected') alpha = Math.max(0, 1 - (now - it.stateAt) / 0.8);
    if (it.state === 'queued' && p.queue.indexOf(it) >= visible) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = it.state === 'done' ? C.ok : it.state === 'rejected' ? C.bad : p.policy === 'shed' && it.high ? C.hi : C.info;
    ctx.beginPath();
    ctx.roundRect(it.x - 6, it.y - 6, 12, 12, 2.5);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // labels go on top of the items passing through
  if (p.down) {
    text(ctx, '💥 OOM-killed', L.wx, L.y - 8, C.bad, '700 12px Inter, system-ui, sans-serif');
    text(ctx, `restart ${(p.crashedUntil - now).toFixed(1)}s`, L.wx, L.y + 12, C.bad);
  } else {
    text(ctx, 'worker', L.wx + 12, L.y - 10, C.text, '700 12px Inter, system-ui, sans-serif');
    text(ctx, `${MU}/s max`, L.wx + 12, L.y + 10, C.muted);
  }
  text(ctx, 'done', L.sx, L.y - 30, C.ok, '700 12px Inter, system-ui, sans-serif');

  drawCurve(ctx, 20, L.bottomTop, Math.max(280, w * 0.46), h - 12, (s.rate * (now < s.spikeUntil ? 3 : 1)) / MU);
  drawLittle(ctx, Math.max(320, w * 0.52), L.bottomTop, w - 20, h - 12, s);
}

function drawCurve(ctx: CanvasRenderingContext2D, x0: number, top: number, x1: number, bottom: number, rho: number) {
  ctx.textAlign = 'left';
  text(ctx, 'avg latency vs utilisation (M/M/1 queue, W = 1 / (μ − λ))', x0, top, C.muted, '600 11px Inter, system-ui, sans-serif');
  ctx.textAlign = 'center';
  const pl = x0 + 34;
  const pt = top + 18;
  const pb = bottom - 18;
  const maxW = 2;
  const xOf = (r: number) => pl + (x1 - pl) * r;
  const yOf = (v: number) => pb - (Math.min(v, maxW) / maxW) * (pb - pt);
  // danger zone past 80%
  ctx.fillStyle = 'rgba(255,93,108,0.07)';
  ctx.fillRect(xOf(0.8), pt, xOf(1) - xOf(0.8), pb - pt);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pl, pt);
  ctx.lineTo(pl, pb);
  ctx.lineTo(x1, pb);
  ctx.stroke();
  for (const r of [0, 0.5, 0.8, 1]) text(ctx, `${r * 100}%`, xOf(r), pb + 10, r === 0.8 ? C.bad : C.faint, '600 9px "JetBrains Mono", monospace');
  ctx.textAlign = 'right';
  for (const v of [0, 1, 2]) text(ctx, `${v}s`, pl - 6, yOf(v), C.faint, '600 9px "JetBrains Mono", monospace');
  ctx.textAlign = 'center';
  ctx.strokeStyle = C.hi;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const r = (i / 200) * 0.995;
    const W = 1 / (MU - r * MU);
    if (i) ctx.lineTo(xOf(r), yOf(W));
    else ctx.moveTo(xOf(r), yOf(W));
  }
  ctx.stroke();
  // you are here
  const r = Math.min(rho, 1);
  const W = rho < 1 ? 1 / (MU - rho * MU) : Infinity;
  const color = rho >= 1 ? C.bad : rho >= 0.8 ? C.hi : C.ok;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(xOf(r), yOf(W), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  const label = rho >= 1 ? 'you: ∞ (queue grows forever)' : `you: ${Math.round(rho * 100)}% → ${W >= 1 ? W.toFixed(1) + 's' : Math.round(W * 1000) + 'ms'}`;
  ctx.textAlign = rho > 0.6 ? 'right' : 'left';
  text(ctx, label, xOf(r) + (rho > 0.6 ? -10 : 10), Math.max(pt + 6, yOf(W) - 12), color);
  ctx.textAlign = 'center';
}

function drawLittle(ctx: CanvasRenderingContext2D, x0: number, top: number, x1: number, bottom: number, s: World) {
  const st = s.p.stats();
  ctx.textAlign = 'left';
  text(ctx, "Little's Law · measured live over the last 10 s", x0, top, C.muted, '600 11px Inter, system-ui, sans-serif');
  const rows: [string, string, string][] = [
    ['L', `${st.L.toFixed(1)} items`, 'in the system on average'],
    ['λ', `${st.throughput.toFixed(1)}/s`, 'throughput'],
    ['W', st.W >= 1 ? `${st.W.toFixed(2)} s` : `${Math.round(st.W * 1000)} ms`, 'average time inside'],
  ];
  rows.forEach(([sym, val, note], i) => {
    const y = top + 24 + i * 22;
    text(ctx, sym, x0, y, C.hi, '700 14px "JetBrains Mono", monospace');
    text(ctx, val, x0 + 26, y, C.text, '700 13px "JetBrains Mono", monospace');
    text(ctx, note, x0 + 120, y, C.faint, '600 11px Inter, system-ui, sans-serif');
  });
  const lw = st.throughput * st.W;
  // Little's Law only holds in steady state; while the queue is still growing or draining, it won't match
  const steady = st.L < 0.5 || Math.abs(lw - st.L) / st.L < 0.2;
  text(ctx, steady ? `λ × W = ${lw.toFixed(1)}  ≈  L = ${st.L.toFixed(1)}  ✓` : `λ × W = ${lw.toFixed(1)}  ≠  L = ${st.L.toFixed(1)}`, x0, top + 90, steady ? C.ok : C.hi, '700 13px "JetBrains Mono", monospace');
  if (!steady) text(ctx, 'not steady yet: the queue is still growing or draining', x0, top + 106, C.hi, '600 10px Inter, system-ui, sans-serif');

  // p99 history
  const sy = bottom - 4;
  const sTop = top + 134;
  const hist = s.history;
  text(ctx, 'p99 latency · last 30 s', x0, sTop - 6, C.muted, '600 10px Inter, system-ui, sans-serif');
  ctx.textAlign = 'center';
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, sy);
  ctx.lineTo(x1, sy);
  ctx.stroke();
  if (hist.length > 1) {
    const max = Math.max(1, ...hist);
    ctx.strokeStyle = hist[hist.length - 1] > 3 ? C.bad : C.info;
    ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = x0 + ((x1 - x0) * (i + HISTORY - hist.length)) / (HISTORY - 1);
      const y = sy - (v / max) * (sy - sTop - 4);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.textAlign = 'right';
    text(ctx, max >= 1 ? `${max.toFixed(1)}s` : '', x1, sTop - 6, C.faint, '600 9px "JetBrains Mono", monospace');
    ctx.textAlign = 'center';
  }
}

function roundBox(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, color: string) {
  ctx.fillStyle = C.cell;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 10);
  ctx.fill();
  ctx.stroke();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = C.muted, font = '600 11px "JetBrains Mono", monospace') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(s, x, y);
}
