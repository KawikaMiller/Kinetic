import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useCanvas, useLoop } from '../../core/hooks';
import { B_CAP, OPEN_FOR, Sim, THREADS, TIMEOUT, type BreakerState, type Mode } from './sim';
import './styles.css';

const C = {
  hi: '#ffd166', ok: '#3ddc97', bad: '#ff5d6c', info: '#4cc9f0', violet: '#a78bfa',
  dim: '#3a4152', cell: '#1a1f2d', cellLine: '#2d3447', line: '#323a4f', text: '#e8eaf0', muted: '#8a93a8', faint: '#5b6378',
};

const MODES: { id: Mode; label: string; say: ReactNode }[] = [
  { id: 'naive', label: 'Naive retries',
    say: <><span className="hl bad">Naive retries</span>: on any failure, retry immediately, up to 3 times. Sounds helpful. Now give B a bad day.</> },
  { id: 'backoff', label: 'Backoff + jitter',
    say: <><span className="hl violet">Exponential backoff + jitter</span>: wait a random time up to 0.2 s, 0.4 s, 0.8 s before each retry. Retries stop arriving in lockstep.</> },
  { id: 'breaker', label: 'Circuit breaker',
    say: <><span className="hl ok">Circuit breaker</span> (plus backoff): if most recent calls fail, stop calling B at all for a while and serve a fallback.</> },
];

const HISTORY = 60; // samples at 0.5 s

interface World {
  sim: Sim;
  acc: number;
  rate: number;
  lastSnap: number;
  lastSample: number;
  lastInsight: number;
  lastTransition: number; // time of the last breaker transition we narrated
  history: { bLoad: number; err: number; breaker: BreakerState }[];
}

type Snap = ReturnType<Sim['stats']>;

function layout(w: number) {
  return { ux: 52, ax: Math.max(210, w * 0.3), bx: w * 0.52, Bx: w - 110, y: 120, bottomTop: 318 };
}

export function Stage() {
  const setCaption = useSetCaption();
  const [mode, setMode] = useState<Mode>('naive');
  const [fail, setFail] = useState(3);
  const [latency, setLatency] = useState(120);
  const [rate, setRate] = useState(15);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);

  const wRef = useRef<World | null>(null);
  const world = () =>
    (wRef.current ??= { sim: new Sim(), acc: 0, rate: 15, lastSnap: 0, lastSample: 0, lastInsight: 0, lastTransition: -1, history: [] });

  useEffect(() => {
    const s = world().sim;
    s.failRate = fail / 100;
    s.latency = latency / 1000;
  }, [fail, latency]);
  useEffect(() => {
    world().rate = rate;
  }, [rate]);

  useEffect(() => {
    setCaption(
      <>Users hit <b>Service A</b>, which calls <b>Service B</b> for every request. Everything's healthy. {MODES[0].say}</>,
    );
  }, [setCaption]);

  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => draw(ctx, w, h, world()));

  useLoop((dt) => {
    const s = world();
    const sim = s.sim;
    s.acc += s.rate * dt * (0.5 + Math.random());
    while (s.acc >= 1) {
      s.acc -= 1;
      sim.arrive();
    }
    sim.step(dt);

    // narrate breaker transitions
    for (const t of sim.transitions.filter((x) => x.t > s.lastTransition)) {
      s.lastTransition = t.t;
      if (t.to === 'open') setCaption(<>Breaker <span className="hl bad">OPEN</span>: most recent calls failed. For {OPEN_FOR} s, A fails fast with a fallback instead of calling B, and B gets room to recover.</>);
      if (t.to === 'half') setCaption(<><span className="hl">HALF-OPEN</span>: {OPEN_FOR} s are up. Let 3 probe requests through to test whether B has recovered.</>);
      if (t.to === 'closed' && sim.mode === 'breaker') setCaption(<>Probes succeeded → breaker <span className="hl ok">CLOSED</span>. Normal traffic flows to B again.</>);
    }

    if (sim.now - s.lastSample >= 0.5) {
      s.lastSample = sim.now;
      const st = sim.stats();
      s.history.push({ bLoad: st.bLoad, err: st.errorPct, breaker: st.breaker });
      if (s.history.length > HISTORY) s.history.shift();
    }

    if (sim.now - s.lastSnap > 0.3) {
      s.lastSnap = sim.now;
      const st = sim.stats();
      setSnap(st);
      if (sim.now - s.lastInsight > 8) {
        if (st.busyThreads >= THREADS && st.errorPct > 50) {
          s.lastInsight = sim.now;
          setCaption(<><span className="hl bad">Cascade</span>: all {THREADS} of A's threads are stuck waiting on B, so A now fails its own users. B's problem became A's problem.</>);
        } else if (st.bLoad > s.rate * 1.8 && sim.mode !== 'breaker') {
          s.lastInsight = sim.now;
          setCaption(<><span className="hl bad">Retry storm</span>: B is getting {(st.bLoad / s.rate).toFixed(1)}× the real user traffic. Every retry is extra load on a service that's already struggling.</>);
        } else if (st.bConc > B_CAP * 2 && sim.failRate < 0.1) {
          s.lastInsight = sim.now;
          setCaption(<>B is healthy again, but still buried under <b>{st.bConc}</b> calls, many for requests A already gave up on. Retries keep it from recovering.</>);
        }
      }
    }
    redraw();
  }, !paused);

  const pickMode = (m: Mode) => {
    setMode(m);
    world().sim.setMode(m);
    setCaption(MODES.find((x) => x.id === m)!.say);
  };

  const badDay = () => {
    setFail(60);
    setLatency(700);
    setCaption(<><span className="hl bad">B is having a bad day</span>: 60% of calls fail and the rest take 0.7 s. A's timeout is {TIMEOUT} s. Watch what A does to B.</>);
  };
  const heal = () => {
    setFail(3);
    setLatency(120);
    setCaption(<><span className="hl ok">B is fixed</span>. Does the system recover on its own?</>);
  };

  const fmt = (v: number) => (v >= 1 ? `${v.toFixed(1)}s` : `${Math.round(v * 1000)}ms`);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Load on B" value={snap ? `${snap.bLoad.toFixed(0)}/s` : '–'} color={snap && snap.bLoad > rate * 1.5 ? 'var(--bad)' : 'var(--info)'} sub={`users send ${rate}/s`} />
          <Stat label="A error rate" value={snap ? `${snap.errorPct.toFixed(0)}%` : '–'} color="var(--bad)" sub={snap ? `${snap.fallbackPct.toFixed(0)}% fallbacks` : ''} />
          <Stat label="p99 latency" value={snap ? fmt(snap.p99) : '–'} color={snap && snap.p99 > TIMEOUT ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="A threads busy" value={snap ? `${snap.busyThreads}/${THREADS}` : '–'} color={snap && snap.busyThreads >= THREADS ? 'var(--bad)' : 'var(--hi)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'call to B', shape: 'dot' },
            { color: 'var(--ok)', label: 'success', shape: 'dot' },
            { color: 'var(--bad)', label: 'failure / timeout', shape: 'dot' },
            { color: 'var(--violet)', label: 'waiting to retry' },
            { color: 'var(--hi)', label: 'fallback', shape: 'dot' },
            { color: 'var(--faint)', label: 'orphaned work', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Protection" options={MODES.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={pickMode} />
          <Slider label="B failure rate" value={fail} min={0} max={90} onChange={setFail} format={(v) => `${v}%`} />
          <Slider label="B latency" value={latency} min={50} max={1500} step={10} onChange={setLatency} format={(v) => `${v}ms`} />
          <Slider label="User traffic" value={rate} min={5} max={25} onChange={setRate} format={(v) => `${v}/s`} />
          <Button variant="danger" onClick={badDay}>🔥 B has a bad day</Button>
          <Button onClick={heal}>💚 Heal B</Button>
          <Button onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>
        </Controls>
      }
    >
      <div ref={wrapRef} className="cb-canvas">
        <canvas ref={canvasRef} />
      </div>
    </StageFrame>
  );
}

/* ─── Drawing ─────────────────────────────────────────────────────── */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, s: World) {
  const sim = s.sim;
  const L = layout(w);
  const now = sim.now;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const aRight = L.ax + 88;
  const bLeft = L.Bx - 88;

  // wires
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(L.ux + 30, L.y);
  ctx.lineTo(L.ax - 88, L.y);
  ctx.moveTo(aRight, L.y);
  ctx.lineTo(L.bx - 26, L.y);
  ctx.moveTo(L.bx + 26, L.y);
  ctx.lineTo(bLeft, L.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // users
  roundBox(ctx, L.ux, L.y, 64, 42, C.info);
  text(ctx, 'users', L.ux, L.y, C.text, '700 12px Inter, system-ui, sans-serif');

  // Service A with its thread pool
  roundBox(ctx, L.ax, L.y, 176, 170, C.muted);
  text(ctx, 'Service A', L.ax, L.y - 70, C.text, '700 13px Inter, system-ui, sans-serif');
  const cols = 8;
  const cell = 16;
  const gx = L.ax - (cols * cell) / 2 + cell / 2;
  const gy = L.y - 42;
  const waiting = new Set(sim.reqs.filter((r) => r.retryAt !== null).map((r) => r.id));
  sim.threads.forEach((r, i) => {
    const x = gx + (i % cols) * cell;
    const y = gy + Math.floor(i / cols) * cell;
    ctx.fillStyle = !r ? C.cell : waiting.has(r.id) ? C.violet : C.info;
    ctx.strokeStyle = C.cellLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 6, 12, 12, 2);
    ctx.fill();
    ctx.stroke();
  });
  const busy = sim.threads.filter(Boolean).length;
  text(ctx, `threads ${busy}/${THREADS}`, L.ax, L.y + 58, busy >= THREADS ? C.bad : C.muted);
  text(ctx, `timeout ${TIMEOUT}s`, L.ax, L.y + 73, C.faint);

  // the breaker, drawn as a switch on the wire
  drawSwitch(ctx, L.bx, L.y, sim.mode === 'breaker' ? sim.breaker : null, now - sim.openedAt);

  // Service B with its load
  const conc = sim.bConcurrency;
  const { mult } = sim.bLoad(conc);
  const overloaded = conc > B_CAP;
  roundBox(ctx, L.Bx, L.y, 176, 170, overloaded ? C.bad : C.muted);
  text(ctx, 'Service B', L.Bx, L.y - 70, C.text, '700 13px Inter, system-ui, sans-serif');
  // one dot per call B is working on; grey = the caller already gave up
  const inB = sim.calls.filter((c) => c.scheduled && now < c.bDoneAt);
  const shown = inB.slice(0, 80);
  shown.forEach((c, i) => {
    const x = L.Bx - 70 + (i % 16) * 9.3;
    const y = L.y - 44 + Math.floor(i / 16) * 11;
    ctx.fillStyle = c.timedOut ? C.faint : C.info;
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  });
  if (inB.length > shown.length) text(ctx, `+${inB.length - shown.length}`, L.Bx + 70, L.y + 12, C.bad);
  // capacity bar
  const barW = 140;
  ctx.fillStyle = C.dim;
  ctx.fillRect(L.Bx - barW / 2, L.y + 30, barW, 6);
  ctx.fillStyle = overloaded ? C.bad : conc > B_CAP * 0.7 ? C.hi : C.ok;
  ctx.fillRect(L.Bx - barW / 2, L.y + 30, barW * clamp01(conc / (B_CAP * 3)), 6);
  ctx.fillStyle = C.text;
  ctx.fillRect(L.Bx - barW / 2 + barW / 3, L.y + 26, 1.5, 14);
  text(ctx, `${conc} busy · capacity ${B_CAP}`, L.Bx, L.y + 50, overloaded ? C.bad : C.muted);
  text(ctx, `${mult.toFixed(1)}× slower · ${Math.round(sim.failRate * 100)}% fail`, L.Bx, L.y + 66, overloaded ? C.bad : C.faint);

  // calls on the wire
  for (const c of sim.calls) {
    if (now < c.arriveB) {
      const t = clamp01((now - c.sentAt) / (c.arriveB - c.sentAt));
      dot(ctx, lerp(aRight, bLeft, t), L.y + ((c.id % 5) - 2) * 4, 3.5, c.probe ? C.hi : C.info);
    } else if (now >= c.bDoneAt && now < c.respAt) {
      const t = clamp01((now - c.bDoneAt) / (c.respAt - c.bDoneAt));
      const color = c.timedOut ? C.faint : c.ok ? C.ok : C.bad;
      dot(ctx, lerp(bLeft, aRight, t), L.y + 14 + ((c.id % 5) - 2) * 3, 3.5, color);
    }
  }

  // results flying back to users
  for (const sp of sim.sparks) {
    const t = clamp01((now - sp.t) / 0.6);
    ctx.globalAlpha = 1 - t;
    dot(ctx, lerp(L.ax - 88, L.ux + 30, t), L.y + 20 + ((sp.id % 7) - 3) * 4, 3.5, sp.kind === 'fallback' ? C.hi : C.bad);
    ctx.globalAlpha = 1;
  }

  drawRetries(ctx, 20, L.bottomTop, Math.max(220, w * 0.34), h - 14, sim);
  drawChart(ctx, Math.max(260, w * 0.4), L.bottomTop, w - 20, h - 14, s);
}

function drawSwitch(ctx: CanvasRenderingContext2D, x: number, y: number, state: BreakerState | null, openFor: number) {
  const color = state === null ? C.faint : state === 'closed' ? C.ok : state === 'open' ? C.bad : C.hi;
  // contacts
  dot(ctx, x - 24, y, 5, color);
  dot(ctx, x + 24, y, 5, color);
  // lever: flat when closed, raised when open, half-raised when half-open
  const angle = state === 'open' ? -0.75 : state === 'half' ? -0.35 : 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 24, y);
  ctx.lineTo(x - 24 + Math.cos(angle) * 48, y + Math.sin(angle) * 48);
  ctx.stroke();
  ctx.lineCap = 'butt';
  if (state === null) {
    text(ctx, 'no breaker', x, y - 34, C.faint);
    return;
  }

  // the state machine underneath
  const sy = y + 70;
  const nodes: { id: BreakerState; label: string; x: number; y: number; c: string }[] = [
    { id: 'closed', label: 'CLOSED', x: x - 58, y: sy, c: C.ok },
    { id: 'open', label: 'OPEN', x: x + 58, y: sy, c: C.bad },
    { id: 'half', label: 'HALF-OPEN', x, y: sy + 56, c: C.hi },
  ];
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(nodes[0].x + 30, nodes[0].y);
  ctx.lineTo(nodes[1].x - 26, nodes[1].y);
  ctx.moveTo(nodes[1].x - 10, nodes[1].y + 12);
  ctx.lineTo(nodes[2].x + 26, nodes[2].y - 10);
  ctx.moveTo(nodes[2].x - 26, nodes[2].y - 10);
  ctx.lineTo(nodes[0].x + 10, nodes[0].y + 12);
  ctx.stroke();
  text(ctx, 'failures', x, sy - 9, C.faint, '600 9px "JetBrains Mono", monospace');
  text(ctx, 'wait', x + 48, sy + 32, C.faint, '600 9px "JetBrains Mono", monospace');
  text(ctx, 'probes ok', x - 52, sy + 32, C.faint, '600 9px "JetBrains Mono", monospace');
  for (const n of nodes) {
    const on = n.id === state;
    ctx.fillStyle = on ? n.c : C.cell;
    ctx.strokeStyle = n.c;
    ctx.lineWidth = on ? 2 : 1;
    ctx.globalAlpha = on ? 1 : 0.55;
    ctx.beginPath();
    ctx.roundRect(n.x - 34, n.y - 11, 68, 22, 11);
    ctx.fill();
    ctx.stroke();
    text(ctx, n.label, n.x, n.y, on ? '#0a0c11' : n.c, '700 10px "JetBrains Mono", monospace');
    ctx.globalAlpha = 1;
  }
  if (state === 'open') text(ctx, `retry B in ${Math.max(0, OPEN_FOR - openFor).toFixed(1)}s`, x, y - 34, C.bad);
}

function drawRetries(ctx: CanvasRenderingContext2D, x0: number, top: number, x1: number, bottom: number, sim: Sim) {
  ctx.textAlign = 'left';
  text(ctx, 'when retries fire · delay after a failure', x0, top, C.muted, '600 11px Inter, system-ui, sans-serif');
  ctx.textAlign = 'center';
  const axisY = bottom - 14;
  const maxDelay = 1;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, axisY);
  ctx.lineTo(x1, axisY);
  ctx.stroke();
  for (const v of [0, 0.5, 1]) text(ctx, `${v}s`, x0 + ((x1 - x0) * v) / maxDelay, axisY + 10, C.faint, '600 9px "JetBrains Mono", monospace');
  // stack dots into columns so a lockstep spike reads as a tower
  const cols = new Map<number, number>();
  for (const r of sim.retryDelays) {
    const col = Math.round((r.delay / maxDelay) * 60);
    const n = cols.get(col) ?? 0;
    cols.set(col, n + 1);
    const x = x0 + ((x1 - x0) * Math.min(col, 60)) / 60;
    const y = axisY - 5 - (n % 18) * 5;
    ctx.fillStyle = sim.now - r.t < 0.4 ? C.hi : C.violet;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  if (!sim.retryDelays.length) text(ctx, 'no retries right now', (x0 + x1) / 2, axisY - 30, C.faint);
}

function drawChart(ctx: CanvasRenderingContext2D, x0: number, top: number, x1: number, bottom: number, s: World) {
  ctx.textAlign = 'left';
  text(ctx, 'last 30 s', x0, top, C.muted, '600 11px Inter, system-ui, sans-serif');
  ctx.fillStyle = C.info;
  ctx.fillText('— load on B', x0 + 64, top);
  ctx.fillStyle = C.bad;
  ctx.fillText('— A errors %', x0 + 160, top);
  ctx.textAlign = 'center';
  const hist = s.history;
  const plotTop = top + 16;
  const plotBottom = bottom - 14;
  const bandY = bottom - 8;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, plotBottom);
  ctx.lineTo(x1, plotBottom);
  ctx.stroke();
  const xOf = (i: number) => x0 + ((x1 - x0) * (i + HISTORY - hist.length)) / (HISTORY - 1);
  const maxLoad = Math.max(40, ...hist.map((p) => p.bLoad));
  const line = (vals: number[], max: number, color: string) => {
    if (vals.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = xOf(i);
      const y = plotBottom - (v / max) * (plotBottom - plotTop);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  line(hist.map((p) => p.bLoad), maxLoad, C.info);
  line(hist.map((p) => p.err), 100, C.bad);
  // breaker state band
  hist.forEach((p, i) => {
    if (s.sim.mode !== 'breaker' && p.breaker === 'closed') return;
    ctx.fillStyle = p.breaker === 'closed' ? C.ok : p.breaker === 'open' ? C.bad : C.hi;
    ctx.fillRect(xOf(i), bandY, (x1 - x0) / (HISTORY - 1) + 0.5, 5);
  });
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

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = C.muted, font = '600 11px "JetBrains Mono", monospace') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(s, x, y);
}
