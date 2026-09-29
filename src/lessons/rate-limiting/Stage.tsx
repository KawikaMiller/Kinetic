import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useCanvas, useLoop } from '../../core/hooks';
import { ALGO_IDS, Limiter, WINDOW, type AlgoId, type Outcome, type Params } from './sim';
import './styles.css';

const C = {
  hi: '#ffd166', ok: '#3ddc97', bad: '#ff5d6c', info: '#4cc9f0', violet: '#a78bfa',
  dim: '#3a4152', cell: '#1a1f2d', cellLine: '#2d3447', line: '#323a4f', text: '#e8eaf0', muted: '#8a93a8', faint: '#5b6378',
};

const ALGOS: Record<AlgoId, { label: string; say: ReactNode }> = {
  fixed: {
    label: 'Fixed window',
    say: <><span className="hl">Fixed window</span>: count requests per clock second, reset to zero on the tick. Simple and cheap, but try the boundary attack.</>,
  },
  sliding: {
    label: 'Sliding window',
    say: <><span className="hl info">Sliding window</span>: count requests in the <b>last</b> 1 s, measured from right now. No boundary to game, but it has to remember timestamps.</>,
  },
  token: {
    label: 'Token bucket',
    say: <><span className="hl ok">Token bucket</span>: tokens drip in at the limit rate; each request spends one. A full bucket allows a short <b>burst</b>, then you're held to the average.</>,
  },
  leaky: {
    label: 'Leaky bucket',
    say: <><span className="hl violet">Leaky bucket</span>: requests queue up and leak out at a constant rate. Output is perfectly smooth; bursts wait in line, overflow gets a 429.</>,
  },
};

const TRAVEL_IN = 0.7; // client → limiter
const TRAVEL_OUT = 0.5; // limiter → API / reject bin
const SPAN = 8; // seconds shown on the timeline
const BIN = 0.2;

interface Particle {
  id: number;
  t0: number; // spawned at the client
  outcome: Outcome | null; // decided at the gate
  tGate: number;
  fromBucket?: boolean; // leaky bucket release: starts at the bucket
}

interface World {
  now: number;
  acc: number;
  nextId: number;
  scheduled: number[]; // extra spawn times (bursts / boundary attack)
  particles: Particle[];
  limiters: Record<AlgoId, Limiter>;
  algo: AlgoId;
  rate: number;
  lastSnap: number;
  attackCheck: { at: number; from: number; to: number } | null;
  quietUntil: number; // background traffic paused so the attacker is the only client
}

interface Snap {
  rows: Record<AlgoId, { ok: number; bad: number; rejectPct: number; peak: number }>;
  tokens: number;
  queue: number;
}

const createWorld = (p: Params): World => ({
  now: 0,
  acc: 0,
  nextId: 1,
  scheduled: [],
  particles: [],
  limiters: Object.fromEntries(ALGO_IDS.map((id) => [id, new Limiter(id, { ...p })])) as Record<AlgoId, Limiter>,
  algo: 'token',
  rate: 8,
  lastSnap: 0,
  attackCheck: null,
  quietUntil: 0,
});

function layout(w: number) {
  return { cx: 70, gx: Math.max(300, w * 0.47), ax: w - 80, cy: 128, rejectY: 250, chartTop: 298, chartBottom: 420 };
}

export function Stage() {
  const setCaption = useSetCaption();
  const [algo, setAlgo] = useState<AlgoId>('token');
  const [rate, setRate] = useState(8);
  const [limit, setLimit] = useState(10);
  const [capacity, setCapacity] = useState(10);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);

  const wRef = useRef<World | null>(null);
  const world = () => (wRef.current ??= createWorld({ limit: 10, capacity: 10 }));

  useEffect(() => {
    const w = world();
    w.algo = algo;
    w.rate = rate;
  }, [algo, rate]);

  useEffect(() => {
    for (const l of Object.values(world().limiters)) l.setParams({ limit, capacity });
  }, [limit, capacity]);

  useEffect(() => {
    setCaption(<>Requests fly in from the left and hit the limiter. {ALGOS.token.say}</>);
  }, [setCaption]);

  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => draw(ctx, w, h, world()));

  useLoop((dt) => {
    const w = world();
    w.now += dt;
    const now = w.now;

    // background traffic (bursty-ish Poisson) plus anything scheduled
    if (now >= w.quietUntil) w.acc += w.rate * dt * (0.4 + Math.random() * 1.2);
    while (w.acc >= 1) {
      w.acc -= 1;
      w.particles.push({ id: w.nextId++, t0: now, tGate: now + TRAVEL_IN, outcome: null });
    }
    while (w.scheduled.length && w.scheduled[0] <= now) {
      const t0 = w.scheduled.shift()!;
      w.particles.push({ id: w.nextId++, t0, tGate: t0 + TRAVEL_IN, outcome: null });
    }

    // requests reaching the gate get judged by every limiter (same traffic for all)
    for (const p of w.particles) {
      if (p.outcome === null && now >= p.tGate) {
        for (const id of ALGO_IDS) {
          const out = w.limiters[id].offer(p.tGate);
          if (id === w.algo) p.outcome = out;
        }
      }
    }
    for (const id of ALGO_IDS) {
      const released = w.limiters[id].step(now, dt);
      if (id === w.algo) {
        for (let i = 0; i < released; i++) {
          w.particles.push({ id: w.nextId++, t0: now, tGate: now, outcome: 'ok', fromBucket: true });
        }
      }
    }
    w.particles = w.particles.filter((p) => now - p.tGate < TRAVEL_OUT + 0.6 || p.outcome === null);

    if (w.attackCheck && now >= w.attackCheck.at) {
      const { from, to } = w.attackCheck;
      w.attackCheck = null;
      const lim = w.limiters[w.algo];
      const passed = lim.acceptedBetween(from, to);
      const fixed = w.limiters.fixed.acceptedBetween(from, to);
      const L = lim.p.limit;
      setCaption(
        w.algo === 'fixed' ? (
          <>Boundary attack: fixed window let <span className="hl bad">{fixed}</span> requests through in ~0.4 s. The limit is {L}/s, but
            the counter reset in the middle of the burst, so both windows said yes.</>
        ) : w.algo === 'leaky' ? (
          <>Same attack: the leaky bucket queued what fit and is draining it at a steady {L}/s. Fixed window would have let{' '}
            <span className="hl bad">{fixed}</span> straight through.</>
        ) : (
          <>Same attack: {ALGOS[w.algo].label.toLowerCase()} let <span className="hl ok">{passed}</span> through. Fixed window
            would have allowed <span className="hl bad">{fixed}</span> of the {2 * L}.</>
        ),
      );
    }

    if (now - w.lastSnap > 0.25) {
      w.lastSnap = now;
      const rows = Object.fromEntries(
        ALGO_IDS.map((id) => [id, { ...w.limiters[id].totals(now), peak: w.limiters[id].peak(now) }]),
      ) as Snap['rows'];
      setSnap({ rows, tokens: w.limiters.token.tokens, queue: w.limiters.leaky.queue.length });
    }
    redraw();
  }, !paused);

  const pick = (id: AlgoId) => {
    setAlgo(id);
    world().algo = id;
    setCaption(ALGOS[id].say);
  };

  const burst = () => {
    const w = world();
    for (let i = 0; i < 20; i++) w.scheduled.push(w.now + i * 0.012);
    w.scheduled.sort((a, b) => a - b);
    setCaption(<><span className="hl bad">Burst!</span> 20 requests at once. Which algorithm lets how many through?</>);
  };

  const boundaryAttack = () => {
    const w = world();
    const L = w.limiters.fixed.p.limit;
    // land L requests just before a window boundary and L just after it
    // far enough ahead that requests already in flight land in the earlier window
    const boundary = Math.ceil(w.now + TRAVEL_IN + 1.1);
    w.quietUntil = boundary + 0.2 - TRAVEL_IN;
    for (let i = 0; i < L; i++) {
      w.scheduled.push(boundary - 0.2 + (i / L) * 0.18 - TRAVEL_IN);
      w.scheduled.push(boundary + 0.01 + (i / L) * 0.18 - TRAVEL_IN);
    }
    w.scheduled.sort((a, b) => a - b);
    w.attackCheck = { at: boundary + 0.6, from: boundary - 0.2, to: boundary + 0.2 };
    setCaption(
      <>Boundary attack: one client sends <b>{L}</b> requests just before the clock ticks over, and <b>{L}</b> more just
        after. Watch the timeline around the dashed line.</>,
    );
  };

  const rows = snap?.rows;
  const sel = rows?.[algo];

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Allowed" value={sel ? sel.ok : '–'} color="var(--ok)" sub="last 10 s" />
          <Stat label="Rejected 429" value={sel ? `${sel.rejectPct.toFixed(0)}%` : '–'} color="var(--bad)" sub={sel ? `${sel.bad} requests` : ''} />
          <Stat
            label="Peak in any 1 s"
            value={sel ? sel.peak : '–'}
            color={sel && sel.peak > limit ? 'var(--bad)' : 'var(--hi)'}
            sub={`limit ${limit}/s`}
          />
          {algo === 'token' && <Stat label="Tokens" value={snap ? Math.floor(snap.tokens) : '–'} color="var(--hi)" sub={`of ${capacity}`} />}
          {algo === 'leaky' && <Stat label="Queued" value={snap?.queue ?? '–'} color="var(--violet)" sub={`of ${capacity}`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request', shape: 'dot' },
            { color: 'var(--ok)', label: 'allowed', shape: 'dot' },
            { color: 'var(--bad)', label: 'rejected (429)', shape: 'dot' },
            { color: 'var(--hi)', label: 'token / counter' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Algorithm" options={ALGO_IDS.map((id) => ({ value: id, label: ALGOS[id].label }))} value={algo} onChange={pick} />
          <Slider label="Traffic" value={rate} min={2} max={30} onChange={setRate} format={(v) => `${v}/s`} />
          <Slider label="Limit" value={limit} min={4} max={20} onChange={setLimit} format={(v) => `${v}/s`} />
          <Slider label="Bucket size" value={capacity} min={1} max={30} onChange={setCapacity} />
          <Button variant="danger" onClick={burst}>⚡ Burst ×20</Button>
          <Button onClick={boundaryAttack}>⏱ Boundary attack</Button>
          <Button onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>
        </Controls>
      }
    >
      <div className="rl">
        <div ref={wrapRef} className="rl-canvas">
          <canvas ref={canvasRef} />
        </div>
        <div className="rl-compare">
          <div className="rl-compare-head">
            <span>Same traffic, every algorithm <em>· last 10 s · click to switch</em></span>
          </div>
          <div className="rl-rows">
            {ALGO_IDS.map((id) => {
              const r = rows?.[id];
              return (
                <button key={id} type="button" className={`rl-row ${id === algo ? 'on' : ''}`} onClick={() => pick(id)}>
                  <b>{ALGOS[id].label}</b>
                  <span className="rl-ok">{r ? r.ok : '–'} ok</span>
                  <span className="rl-bad">{r ? r.bad : '–'} rejected</span>
                  <span className={r && r.peak > limit ? 'rl-bad' : 'rl-peak'}>peak {r ? r.peak : '–'}/s</span>
                </button>
              );
            })}
          </div>
          <p className="rl-note">
            Real APIs keep one limiter <b>per key</b> (user, API key or IP). With many servers, the counts live in a shared
            store such as Redis so every server enforces the same limit.
          </p>
        </div>
      </div>
    </StageFrame>
  );
}

/* ─── Drawing ─────────────────────────────────────────────────────── */

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function draw(ctx: CanvasRenderingContext2D, w: number, _h: number, s: World) {
  const L = layout(w);
  const lim = s.limiters[s.algo];
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // wires
  ctx.strokeStyle = C.line;
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L.cx + 26, L.cy);
  ctx.lineTo(L.ax - 44, L.cy);
  ctx.moveTo(L.gx, L.cy + 80);
  ctx.lineTo(L.gx, L.rejectY - 16);
  ctx.stroke();
  ctx.setLineDash([]);

  // client
  box(ctx, L.cx, L.cy, 70, 44, C.info, 'clients');
  // API
  box(ctx, L.ax, L.cy, 88, 50, C.ok, 'API');
  // reject bin
  ctx.fillStyle = 'rgba(255,93,108,0.08)';
  ctx.strokeStyle = 'rgba(255,93,108,0.5)';
  ctx.beginPath();
  ctx.roundRect(L.gx - 90, L.rejectY - 16, 180, 32, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.bad;
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillText('429 Too Many Requests', L.gx, L.rejectY);

  drawLimiter(ctx, L.gx, L.cy, lim, s.now);

  // particles
  for (const p of s.particles) {
    let x: number;
    let y: number;
    let color = C.info;
    let alpha = 1;
    if (p.fromBucket) {
      const t = clamp01((s.now - p.tGate) / TRAVEL_OUT);
      x = lerp(L.gx + 60, L.ax - 44, ease(t));
      y = L.cy;
      color = C.ok;
      if (t >= 1) continue;
    } else if (p.outcome === null || s.now < p.tGate) {
      const t = clamp01((s.now - p.t0) / TRAVEL_IN);
      x = lerp(L.cx + 30, L.gx - 70, ease(t));
      y = L.cy + Math.sin(p.id * 1.7) * 18 * (1 - t);
    } else {
      const t = clamp01((s.now - p.tGate) / TRAVEL_OUT);
      if (p.outcome === 'ok') {
        x = lerp(L.gx - 70, L.ax - 44, ease(t));
        y = L.cy;
        color = C.ok;
        if (t >= 1) continue;
      } else if (p.outcome === 'reject') {
        x = lerp(L.gx - 70, L.gx + ((p.id % 7) - 3) * 18, ease(t));
        y = lerp(L.cy, L.rejectY, ease(t));
        color = C.bad;
        alpha = t >= 1 ? Math.max(0, 1 - (s.now - p.tGate - TRAVEL_OUT) / 0.5) : 1;
      } else {
        continue; // queued: drawn inside the leaky bucket
      }
    }
    ctx.globalAlpha = alpha;
    dot(ctx, x, y, 5, color);
    ctx.globalAlpha = 1;
  }

  drawTimeline(ctx, w, L.chartTop, L.chartBottom, lim, s.now, s.algo === 'fixed');
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, color: string, label: string) {
  ctx.fillStyle = C.cell;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.text;
  ctx.font = '700 13px Inter, system-ui, sans-serif';
  ctx.fillText(label, x, y);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = C.muted, font = '600 11px "JetBrains Mono", monospace') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(text, x, y);
}

function drawLimiter(ctx: CanvasRenderingContext2D, x: number, y: number, lim: Limiter, now: number) {
  const { limit, capacity } = lim.p;
  ctx.lineWidth = 2;

  if (lim.id === 'token' || lim.id === 'leaky') {
    // bucket outline
    const top = y - 62;
    const bottom = y + 72;
    const tw = 64;
    const bw = 50;
    ctx.strokeStyle = lim.id === 'token' ? C.hi : C.violet;
    ctx.fillStyle = 'rgba(26,31,45,0.9)';
    ctx.beginPath();
    ctx.moveTo(x - tw, top);
    ctx.lineTo(x - bw, bottom);
    ctx.lineTo(x + bw, bottom);
    ctx.lineTo(x + tw, top);
    ctx.fill();
    ctx.stroke();

    const n = lim.id === 'token' ? lim.tokens : lim.queue.length;
    const cols = 5;
    const r = 6.5;
    const gap = 16;
    const rows = Math.ceil(capacity / cols);
    const cell = Math.min(gap, (bottom - top - 16) / Math.max(rows, 1));
    for (let i = 0; i < capacity; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = x + (col - (cols - 1) / 2) * gap;
      const cy = bottom - 10 - row * cell;
      const fill = clamp01(n - i);
      ctx.strokeStyle = C.cellLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(r, cell / 2 - 0.5), 0, Math.PI * 2);
      ctx.stroke();
      if (fill > 0) {
        ctx.globalAlpha = lim.id === 'token' ? 0.25 + 0.75 * fill : 1;
        ctx.fillStyle = lim.id === 'token' ? C.hi : C.info;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(r, cell / 2 - 0.5) * (lim.id === 'token' ? Math.max(0.35, fill) : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (lim.id === 'token') {
      // the faucet
      ctx.fillStyle = C.hi;
      const drip = (now * limit) % 1;
      dot(ctx, x, top - 24 + drip * 26, 3.5, C.hi);
      label(ctx, `+${limit} tokens/s`, x, top - 34, C.hi);
      label(ctx, `${Math.floor(lim.tokens)} / ${capacity} tokens`, x, bottom + 16);
    } else {
      // the hole at the bottom leaks at a constant rate
      const drip = (now * limit) % 1;
      if (lim.queue.length) dot(ctx, x + 60 + drip * 10, bottom - 6, 3, C.ok);
      label(ctx, `queue ${lim.queue.length} / ${capacity}`, x, top - 16, C.violet);
      label(ctx, `leaks ${limit}/s →`, x, bottom + 16);
    }
    return;
  }

  // counter box for the window algorithms
  const bw = 160;
  const bh = 112;
  ctx.fillStyle = 'rgba(26,31,45,0.9)';
  ctx.strokeStyle = lim.id === 'fixed' ? C.hi : C.info;
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 12);
  ctx.fill();
  ctx.stroke();

  const count = lim.id === 'fixed' ? lim.count : lim.log.length;
  const full = count >= limit;
  label(ctx, `${count} / ${limit}`, x, y - 8, full ? C.bad : C.text, '700 26px "JetBrains Mono", monospace');

  // fill bar
  const barW = bw - 28;
  ctx.fillStyle = C.dim;
  ctx.beginPath();
  ctx.roundRect(x - barW / 2, y + 20, barW, 7, 4);
  ctx.fill();
  ctx.fillStyle = full ? C.bad : lim.id === 'fixed' ? C.hi : C.info;
  ctx.beginPath();
  ctx.roundRect(x - barW / 2, y + 20, barW * clamp01(count / limit), 7, 4);
  ctx.fill();

  if (lim.id === 'fixed') {
    const into = (now - lim.windowStart) / WINDOW;
    label(ctx, `resets in ${(WINDOW - into * WINDOW).toFixed(1)} s`, x, y + 40);
    // window progress along the top edge
    ctx.strokeStyle = C.hi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - bw / 2 + 10, y - bh / 2);
    ctx.lineTo(x - bw / 2 + 10 + (bw - 20) * clamp01(into), y - bh / 2);
    ctx.stroke();
    label(ctx, 'this clock second', x, y - bh / 2 - 12, C.hi);
  } else {
    // strip of the last second: each accepted request is a tick that slides off the left
    const sx = x - barW / 2;
    label(ctx, 'last 1 s, measured from now', x, y - bh / 2 - 12, C.info);
    ctx.strokeStyle = C.info;
    ctx.lineWidth = 2;
    for (const t of lim.log) {
      const px = sx + barW * (1 - (now - t) / WINDOW);
      ctx.beginPath();
      ctx.moveTo(px, y + 34);
      ctx.lineTo(px, y + 46);
      ctx.stroke();
    }
    ctx.strokeStyle = C.cellLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, y + 32, barW, 16);
  }
}

function drawTimeline(ctx: CanvasRenderingContext2D, w: number, top: number, bottom: number, lim: Limiter, now: number, showWindows: boolean) {
  const left = 44;
  const right = w - 20;
  const plotW = right - left;
  const bins = Math.round(SPAN / BIN);
  const ok = new Array(bins).fill(0);
  const bad = new Array(bins).fill(0);
  const start = now - SPAN;
  for (const t of lim.accepted) if (t >= start) ok[Math.min(bins - 1, Math.floor((t - start) / BIN))]++;
  for (const t of lim.rejected) if (t >= start) bad[Math.min(bins - 1, Math.floor((t - start) / BIN))]++;
  const perBin = lim.p.limit * BIN;
  const maxV = Math.max(perBin * 2.2, ...ok.map((v, i) => v + bad[i]));
  const plotH = bottom - top - 18;
  const yOf = (v: number) => bottom - (v / maxV) * plotH;

  ctx.textAlign = 'left';
  label(ctx, 'requests per 0.2 s · last 8 s', left, top - 2, C.muted, '600 11px Inter, system-ui, sans-serif');
  ctx.textAlign = 'center';

  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  if (showWindows) {
    ctx.strokeStyle = 'rgba(255,209,102,0.35)';
    ctx.setLineDash([3, 4]);
    for (let s = Math.ceil(start); s <= now; s++) {
      const x = left + ((s - start) / SPAN) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, top + 10);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  const bw = plotW / bins;
  for (let i = 0; i < bins; i++) {
    const x = left + i * bw + 1;
    if (ok[i]) {
      ctx.fillStyle = C.ok;
      ctx.fillRect(x, yOf(ok[i]), bw - 2, bottom - yOf(ok[i]));
    }
    if (bad[i]) {
      ctx.fillStyle = C.bad;
      ctx.fillRect(x, yOf(ok[i] + bad[i]), bw - 2, yOf(ok[i]) - yOf(ok[i] + bad[i]));
    }
  }

  // average limit line
  ctx.strokeStyle = C.hi;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(left, yOf(perBin));
  ctx.lineTo(right, yOf(perBin));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'right';
  label(ctx, `limit ${lim.p.limit}/s`, right, yOf(perBin) - 8, C.hi, '600 10px "JetBrains Mono", monospace');
  ctx.textAlign = 'center';
}
