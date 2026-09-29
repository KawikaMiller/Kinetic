import { useEffect, useRef, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useCanvas, useLoop } from '../../core/hooks';
import { Broker, MAX_ATTEMPTS, SUBSCRIBERS, type Mode, type Msg } from './sim';
import './styles.css';

const C = {
  hi: '#ffd166', ok: '#3ddc97', bad: '#ff5d6c', info: '#4cc9f0', violet: '#a78bfa',
  dim: '#3a4152', cell: '#1a1f2d', cellLine: '#2d3447', line: '#323a4f', text: '#e8eaf0', muted: '#8a93a8', faint: '#5b6378',
};

const SLOT = 22;

interface World {
  broker: Broker;
  acc: number;
  rate: number;
  lastSnap: number;
  lastInsight: number;
  nextProducer: number;
}

type Snap = ReturnType<Broker['stats']>;

function layout(w: number, h: number, b: Broker) {
  const qx0 = Math.max(170, w * 0.24);
  const qx1 = w * 0.64;
  const cx = w * 0.82;
  const producers = [{ x: 58, y: h * 0.3 }, { x: 58, y: h * 0.58 }];
  if (b.mode === 'work') {
    const laneY = h * 0.44;
    const n = b.consumers.length;
    const top = 44;
    const bottom = h - 120;
    const consumers = b.consumers.map((_, i) => ({ x: cx, y: n === 1 ? laneY : top + ((bottom - top) * i) / (n - 1) }));
    return { qx0, qx1, lanes: [laneY], consumers, producers, topic: null, dlq: { x: (qx0 + qx1) / 2, y: h - 44 } };
  }
  const lanes = [h * 0.15, h * 0.39, h * 0.63];
  return {
    qx0: qx0 + 50, qx1, lanes, consumers: b.consumers.map((c) => ({ x: cx, y: lanes[c.lane] })), producers,
    topic: { x: qx0 - 10, y: h * 0.39 }, dlq: { x: (qx0 + qx1) / 2 + 25, y: h - 44 },
  };
}

type Layout = ReturnType<typeof layout>;

function target(m: Msg, b: Broker, L: Layout): { x: number; y: number; a: number } {
  const laneY = L.lanes[m.lane];
  switch (m.state) {
    case 'queued': {
      // fresh pub/sub messages fan out through the topic first
      if (L.topic && !m.redelivered && b.now - m.born < 0.35) return { ...L.topic, a: 1 };
      const i = b.lanes[m.lane].indexOf(m);
      const maxSlots = Math.floor((L.qx1 - L.qx0) / SLOT);
      return { x: i < maxSlots ? L.qx1 - 12 - i * SLOT : L.qx0 + 8, y: laneY, a: i < maxSlots ? 1 : 0 };
    }
    case 'processing':
    case 'unacked': {
      const ci = b.consumers.findIndex((c) => c.id === m.heldBy);
      const p = ci >= 0 ? L.consumers[ci] : { x: m.x + 36, y: m.y };
      return { x: p.x - 36, y: p.y, a: 1 };
    }
    case 'done':
      return { x: m.x + 200, y: m.y, a: Math.max(0, 1 - (b.now - m.stateAt) / 0.7) };
    case 'dlq': {
      const i = b.dlq.indexOf(m);
      return { x: L.dlq.x - 66 + (i % 12) * 12, y: L.dlq.y + 6, a: 1 };
    }
  }
}

export function Stage() {
  const setCaption = useSetCaption();
  const [mode, setMode] = useState<Mode>('work');
  const [rate, setRate] = useState(3);
  const [consumers, setConsumers] = useState(2);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);

  const wRef = useRef<World | null>(null);
  const world = () => (wRef.current ??= { broker: new Broker('work', 2), acc: 0, rate: 3, lastSnap: 0, lastInsight: 0, nextProducer: 0 });

  useEffect(() => {
    world().rate = rate;
  }, [rate]);
  useEffect(() => {
    world().broker.speed = speed;
  }, [speed]);
  useEffect(() => {
    world().broker.setConsumers(consumers);
  }, [consumers]);

  useEffect(() => {
    setCaption(
      <>Producers publish 3 messages/s, but 2 workers only manage about 2/s between them. Watch the <b>backlog</b> grow in the queue.</>,
    );
  }, [setCaption]);

  const { wrapRef, canvasRef, size, redraw } = useCanvas((ctx, w, h) => draw(ctx, w, h, world().broker));

  useLoop((dt) => {
    const s = world();
    const b = s.broker;
    b.step(dt);
    const L = layout(size.width || 900, size.height || 400, b);

    s.acc += s.rate * dt * (0.5 + Math.random());
    while (s.acc >= 1) {
      s.acc -= 1;
      b.publish(L.producers[s.nextProducer++ % 2]);
    }

    for (const m of b.msgs) {
      const t = target(m, b, L);
      const k = Math.min(1, dt * 9);
      m.x += (t.x - m.x) * k;
      m.y += (t.y - m.y) * k;
    }

    for (const e of b.events.splice(0)) {
      if (e.kind === 'dlq') {
        setCaption(<>After {MAX_ATTEMPTS} failed attempts the poison message is parked in the <span className="hl bad">dead-letter queue</span>. The queue keeps flowing; a human (or a tool) inspects it later.</>);
      } else if (e.kind === 'poisonRetry') {
        setCaption(<>The consumer choked on the <span className="hl violet">poison message</span> (attempt {e.msg.attempts} of {MAX_ATTEMPTS}). It goes back in the queue to be retried.</>);
      } else if (e.kind === 'duplicate') {
        setCaption(<><span className="hl bad">Processed twice!</span> The first worker did the work but died before acking, so the broker redelivered it. At-least-once delivery means consumers must be <b>idempotent</b>.</>);
      } else if (e.kind === 'redelivered') {
        setCaption(<>No ack arrived, so the broker <span className="hl">redelivers</span> message #{e.msg.seq} to the front of the queue. Nothing is lost.</>);
      }
    }

    if (b.now - s.lastSnap > 0.3) {
      s.lastSnap = b.now;
      const st = b.stats();
      setSnap(st);
      if (b.now - s.lastInsight > 12 && b.mode === 'work' && st.depth > 14) {
        s.lastInsight = b.now;
        setCaption(<>Backlog at <span className="hl bad">{st.depth}</span> and rising: consumers are slower than producers. Add consumers or speed them up; the queue just buys you time.</>);
      } else if (b.now - s.lastInsight > 12 && b.mode === 'pubsub' && st.laneDepths[1] > 10) {
        s.lastInsight = b.now;
        setCaption(<>The slow <span className="hl">analytics</span> subscriber has its own backlog, but email and search are unaffected. Each subscriber consumes at its own pace.</>);
      }
    }
    redraw();
  }, !paused);

  const switchMode = (m: Mode) => {
    setMode(m);
    const s = world();
    s.broker = new Broker(m, consumers);
    s.broker.speed = speed;
    s.acc = 0;
    s.lastInsight = 0;
    setCaption(
      m === 'work' ? (
        <><span className="hl info">Work queue</span>: each message goes to exactly <b>one</b> consumer. Add consumers to share the load.</>
      ) : (
        <><span className="hl violet">Pub/sub</span>: every message is copied to <b>each subscriber</b>'s queue. Email, analytics and search each get their own copy.</>
      ),
    );
  };

  const crash = () => {
    const c = world().broker.crashOne();
    if (!c) return;
    const who = mode === 'pubsub' ? SUBSCRIBERS[c.lane].name : `worker ${c.id}`;
    setCaption(<><span className="hl bad">{who} crashed</span> mid-message. It never sent an ack, so the broker still owns that message.</>);
  };

  const poison = () => {
    const s = world();
    s.broker.publish(layout(size.width || 900, size.height || 400, s.broker).producers[0], true);
    setCaption(<>A <span className="hl violet">poison message</span>: malformed data that makes the consumer throw every single time.</>);
  };

  const fmtLat = (v: number) => (v >= 1 ? `${v.toFixed(1)}s` : `${Math.round(v * 1000)}ms`);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Queue depth" value={snap?.depth ?? 0} color={snap && snap.depth > 14 ? 'var(--bad)' : 'var(--hi)'} />
          <Stat label="Throughput" value={snap ? `${snap.throughput.toFixed(1)}/s` : '–'} color="var(--ok)" sub={mode === 'pubsub' ? `acks across 3 subscribers` : `producing ${rate}/s`} />
          <Stat label="Avg latency" value={snap ? fmtLat(snap.avgLatency) : '–'} sub="publish → ack" />
          <Stat label="Redelivered" value={snap?.redeliveries ?? 0} color="var(--hi)" sub={`${snap?.duplicates ?? 0} duplicates`} />
          <Stat label="Dead letters" value={snap?.dlq ?? 0} color="var(--bad)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'message' },
            { color: 'var(--hi)', label: 'redelivered' },
            { color: 'var(--violet)', label: 'poison' },
            { color: 'var(--ok)', label: 'acked' },
            { color: 'var(--bad)', label: 'crashed / dead letter' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Mode"
            options={[{ value: 'work', label: 'Work queue' }, { value: 'pubsub', label: 'Pub/sub fan-out' }]}
            value={mode}
            onChange={switchMode}
          />
          <Slider label="Producer rate" value={rate} min={1} max={10} onChange={setRate} format={(v) => `${v}/s`} />
          {mode === 'work' && <Slider label="Consumers" value={consumers} min={1} max={6} onChange={setConsumers} />}
          <Slider label="Consumer speed" value={speed} min={0.5} max={3} step={0.25} onChange={setSpeed} format={(v) => (mode === 'work' ? `${v}/s each` : `${v}×`)} />
          <Button variant="danger" onClick={crash}>💥 Crash a consumer</Button>
          <Button onClick={poison}>☠ Poison message</Button>
          <Button onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>
        </Controls>
      }
    >
      <div ref={wrapRef} className="mq-canvas">
        <canvas ref={canvasRef} />
      </div>
    </StageFrame>
  );
}

/* ─── Drawing ─────────────────────────────────────────────────────── */

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, b: Broker) {
  const L = layout(w, h, b);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // wires
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  for (const p of L.producers) {
    const to = L.topic ?? { x: L.qx0 - 10, y: L.lanes[0] };
    ctx.moveTo(p.x + 40, p.y);
    ctx.lineTo(to.x, to.y);
  }
  if (L.topic) {
    for (const y of L.lanes) {
      ctx.moveTo(L.topic.x, L.topic.y);
      ctx.lineTo(L.qx0 - 10, y);
    }
  }
  L.consumers.forEach((p, i) => {
    const y = L.lanes[b.consumers[i].lane];
    ctx.moveTo(L.qx1 + 10, y);
    ctx.lineTo(p.x - 60, p.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  for (const p of L.producers) box(ctx, p.x, p.y, 84, 40, C.info, 'producer');
  if (L.topic) {
    ctx.fillStyle = C.cell;
    ctx.strokeStyle = C.violet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(L.topic.x, L.topic.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(ctx, 'topic', L.topic.x, L.topic.y - 38, C.violet, '700 12px Inter, system-ui, sans-serif');
  }

  // queue pipes
  const maxSlots = Math.floor((L.qx1 - L.qx0) / SLOT);
  L.lanes.forEach((y, lane) => {
    ctx.fillStyle = 'rgba(10,12,17,0.8)';
    ctx.strokeStyle = C.cellLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(L.qx0 - 8, y - 15, L.qx1 - L.qx0 + 16, 30, 8);
    ctx.fill();
    ctx.stroke();
    const name = b.mode === 'work' ? 'queue' : `${SUBSCRIBERS[lane].name} queue`;
    ctx.textAlign = 'left';
    text(ctx, name, L.qx0 - 6, y - 25, C.muted);
    ctx.textAlign = 'right';
    text(ctx, 'head →', L.qx1 + 6, y - 25, C.faint);
    const depth = b.lanes[lane].length;
    if (depth > maxSlots) {
      ctx.textAlign = 'left';
      text(ctx, `+${depth - maxSlots} more waiting`, L.qx0 - 6, y + 25, C.bad);
    }
    ctx.textAlign = 'center';
  });

  // consumers
  b.consumers.forEach((c, i) => {
    const p = L.consumers[i];
    const dead = c.deadUntil >= b.now;
    const name = b.mode === 'work' ? `worker ${c.id}` : SUBSCRIBERS[c.lane].name;
    ctx.fillStyle = dead ? 'rgba(255,93,108,0.1)' : C.cell;
    ctx.strokeStyle = dead ? C.bad : c.msg ? C.ok : C.cellLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(p.x - 58, p.y - 20, 116, 40, 9);
    ctx.fill();
    ctx.stroke();
    text(ctx, dead ? `💥 restarting ${(c.deadUntil - b.now).toFixed(1)}s` : name, p.x + 6, p.y - 5, dead ? C.bad : C.text, '600 12px Inter, system-ui, sans-serif');
    if (!dead) {
      const prog = c.msg ? Math.min(1, (b.now - c.started) / c.duration) : 0;
      ctx.fillStyle = C.dim;
      ctx.fillRect(p.x - 20, p.y + 9, 70, 4);
      ctx.fillStyle = c.msg?.poison ? C.violet : C.ok;
      ctx.fillRect(p.x - 20, p.y + 9, 70 * prog, 4);
    }
  });

  // dead-letter queue
  ctx.fillStyle = 'rgba(255,93,108,0.06)';
  ctx.strokeStyle = 'rgba(255,93,108,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(L.dlq.x - 80, L.dlq.y - 22, 160, 44, 9);
  ctx.fill();
  ctx.stroke();
  text(ctx, `dead-letter queue · ${b.dlqTotal}`, L.dlq.x, L.dlq.y - 10, C.bad);

  // messages
  for (const m of b.msgs) {
    const t = target(m, b, L);
    if (t.a <= 0.02) continue;
    ctx.globalAlpha = m.state === 'unacked' ? 0.55 : t.a;
    const fill = m.state === 'done' ? C.ok : m.state === 'dlq' ? C.bad : m.poison ? C.violet : C.info;
    envelope(ctx, m.x, m.y, fill, m.redelivered && m.state !== 'done' && m.state !== 'dlq');
    if (m.state === 'unacked') {
      // ring draining until the broker gives up waiting for an ack
      const left = Math.max(0, (m.redeliverAt - b.now) / (m.redeliverAt - m.stateAt));
      ctx.strokeStyle = C.hi;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.stroke();
      text(ctx, 'no ack', m.x, m.y - 22, C.hi);
    }
    ctx.globalAlpha = 1;
  }

  // queue depth sparkline
  const hist = b.depthHistory;
  const sx = 20;
  const sy = h - 18;
  const sw = Math.min(220, L.qx0 - 50);
  ctx.textAlign = 'left';
  text(ctx, 'queue depth · last 30 s', sx, sy - 44, C.muted, '600 11px Inter, system-ui, sans-serif');
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + sw, sy);
  ctx.stroke();
  if (hist.length > 1) {
    const max = Math.max(10, ...hist);
    ctx.strokeStyle = hist[hist.length - 1] > 14 ? C.bad : C.hi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = sx + (i / 59) * sw;
      const y = sy - (v / max) * 32;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.textAlign = 'center';
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, color: string, label: string) {
  ctx.fillStyle = C.cell;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 9);
  ctx.fill();
  ctx.stroke();
  text(ctx, label, x, y, C.text, '700 12px Inter, system-ui, sans-serif');
}

function envelope(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string, outline: boolean) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x - 8, y - 6, 16, 12, 2.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,12,17,0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 5);
  ctx.lineTo(x, y + 1);
  ctx.lineTo(x + 7, y - 5);
  ctx.stroke();
  if (outline) {
    ctx.strokeStyle = C.hi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 10, y - 8, 20, 16, 4);
    ctx.stroke();
  }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = C.muted, font = '600 11px "JetBrains Mono", monospace') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(s, x, y);
}
