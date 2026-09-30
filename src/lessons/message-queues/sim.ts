// A tiny message broker: producers publish, the broker queues, consumers
// process and ack. Unacked messages are redelivered (at-least-once), poison
// messages go to a dead-letter queue after MAX_ATTEMPTS.
// Pure state only: where things are drawn is draw.ts's business.
import { pick, randRange } from '../../core/random';
import { createCooldown, createSampler, mean, trimWindow } from '../../core/sim';

export type Mode = 'work' | 'pubsub';
export const MAX_ATTEMPTS = 3;
export const REDELIVER_AFTER = 1.6; // seconds without an ack before redelivery
export const RESTART_AFTER = 2.8;
export const SUBSCRIBERS = [
  // msgs/s at 1x consumer speed: email and search keep up with the default 3/s, analytics can't
  { name: 'email', speed: 4.5 },
  { name: 'analytics', speed: 1.6 },
  { name: 'search', speed: 3.8 },
];
export const PRODUCERS = 2;
export const DONE_FADE = 0.7; // seconds an acked message takes to fade out
const DONE_FORGET = 0.8; // ...and when the broker forgets it (after the fade)
export const DLQ_SHOWN = 12; // dead letters kept for display
export const DEPTH_HISTORY = 60; // queue-depth samples at 0.5 s = 30 s
const DEPTH_SAMPLE_EVERY = 0.5;
const ACK_WINDOW = 10; // latency averaged over the last 10 s
const THROUGHPUT_WINDOW = 5;
const WORK_JITTER = { min: 0.7, max: 1.3 }; // service time varies ±30%
/** A mid-message crash past this fraction of the work means the side effect already happened. */
const SIDE_EFFECT_AT = 0.5;

export type MsgState = 'queued' | 'processing' | 'unacked' | 'done' | 'dlq';

export interface Msg {
  id: number;
  seq: number; // the published message number (copies share it in pub/sub)
  lane: number;
  producer: number;
  born: number;
  attempts: number;
  poison: boolean;
  redelivered: boolean;
  sideEffectDone: boolean; // work happened but the ack was lost
  state: MsgState;
  stateAt: number;
  redeliverAt: number;
  heldBy: number; // consumer id that has (or had) it
}

export interface Consumer {
  id: number;
  lane: number;
  msg: Msg | null;
  started: number;
  duration: number;
  deadUntil: number;
}

export type SimEvent =
  | { kind: 'dlq'; msg: Msg }
  | { kind: 'duplicate'; msg: Msg }
  | { kind: 'redelivered'; msg: Msg }
  | { kind: 'poisonRetry'; msg: Msg };

export class Broker {
  now = 0;
  mode: Mode;
  lanes: Msg[][];
  consumers: Consumer[] = [];
  msgs: Msg[] = [];
  dlq: Msg[] = [];
  acked: { t: number; latency: number }[] = [];
  depthHistory = createSampler<number>({ every: DEPTH_SAMPLE_EVERY, cap: DEPTH_HISTORY });
  redeliveries = 0;
  duplicates = 0;
  dlqTotal = 0;
  published = 0;
  speed = 1;
  events: SimEvent[] = [];
  private nextId = 1;
  private nextConsumer = 1;

  constructor(mode: Mode, consumers: number) {
    this.mode = mode;
    this.lanes = mode === 'work' ? [[]] : SUBSCRIBERS.map(() => []);
    if (mode === 'work') this.setConsumers(consumers);
    else SUBSCRIBERS.forEach((_, lane) => this.consumers.push(this.makeConsumer(lane)));
  }

  private makeConsumer(lane: number): Consumer {
    return { id: this.nextConsumer++, lane, msg: null, started: 0, duration: 1, deadUntil: -1 };
  }

  setConsumers(n: number) {
    if (this.mode !== 'work') return;
    while (this.consumers.length < n) this.consumers.push(this.makeConsumer(0));
    while (this.consumers.length > n) {
      const c = this.consumers.pop()!;
      if (c.msg) this.requeue(c.msg, true); // a consumer leaving mid-message hands it back
    }
  }

  publish(producer: number, poison = false) {
    const seq = ++this.published;
    for (let lane = 0; lane < this.lanes.length; lane++) {
      const m: Msg = {
        id: this.nextId++, seq, lane, producer, born: this.now, attempts: 0, poison, redelivered: false,
        sideEffectDone: false, state: 'queued', stateAt: this.now, redeliverAt: 0, heldBy: 0,
      };
      this.msgs.push(m);
      this.lanes[lane].push(m);
    }
  }

  crashOne(): Consumer | null {
    const alive = this.consumers.filter((c) => c.deadUntil < this.now);
    const busy = alive.filter((c) => c.msg);
    const pool = busy.length ? busy : alive;
    if (!pool.length) return null;
    const c = pick(pool);
    c.deadUntil = this.now + RESTART_AFTER;
    if (c.msg) {
      const m = c.msg;
      // past halfway: the side effect (email sent, row written) already happened
      m.sideEffectDone = m.sideEffectDone || (this.now - c.started) / c.duration > SIDE_EFFECT_AT;
      m.state = 'unacked';
      m.stateAt = this.now;
      m.redeliverAt = this.now + REDELIVER_AFTER;
      c.msg = null;
    }
    return c;
  }

  private requeue(m: Msg, front: boolean) {
    m.state = 'queued';
    m.stateAt = this.now;
    m.redelivered = true;
    if (front) this.lanes[m.lane].unshift(m);
    else this.lanes[m.lane].push(m);
  }

  step(dt: number) {
    this.now += dt;
    const now = this.now;

    // redeliver messages whose consumer never acked
    for (const m of this.msgs) {
      if (m.state === 'unacked' && now >= m.redeliverAt) {
        m.attempts++;
        this.redeliveries++;
        this.requeue(m, true);
        this.events.push({ kind: 'redelivered', msg: m });
      }
    }

    for (const c of this.consumers) {
      if (c.deadUntil >= now) continue;
      if (c.msg && now - c.started >= c.duration) {
        const m = c.msg;
        c.msg = null;
        if (m.poison) {
          m.attempts++;
          if (m.attempts >= MAX_ATTEMPTS) {
            m.state = 'dlq';
            m.stateAt = now;
            this.dlq.push(m);
            this.dlqTotal++;
            this.events.push({ kind: 'dlq', msg: m });
          } else {
            // a nack puts it straight back at the head, like RabbitMQ's requeue
            this.requeue(m, true);
            this.events.push({ kind: 'poisonRetry', msg: m });
          }
        } else {
          m.state = 'done';
          m.stateAt = now;
          this.acked.push({ t: now, latency: now - m.born });
          if (m.sideEffectDone) {
            this.duplicates++;
            this.events.push({ kind: 'duplicate', msg: m });
          }
        }
      }
      const q = this.lanes[c.lane];
      if (!c.msg && q.length) {
        const m = q.shift()!;
        m.state = 'processing';
        m.stateAt = now;
        c.msg = m;
        m.heldBy = c.id;
        c.started = now;
        const laneSpeed = this.mode === 'pubsub' ? SUBSCRIBERS[c.lane].speed : 1;
        c.duration = (1 / (this.speed * laneSpeed)) * randRange(WORK_JITTER.min, WORK_JITTER.max);
      }
    }

    // forget finished messages once their exit animation is over
    if (this.dlq.length > DLQ_SHOWN) this.dlq.splice(0, this.dlq.length - DLQ_SHOWN);
    this.msgs = this.msgs.filter(
      (m) => !(m.state === 'done' && now - m.stateAt > DONE_FORGET) && !(m.state === 'dlq' && !this.dlq.includes(m)),
    );
    trimWindow(this.acked, now, ACK_WINDOW, (a) => a.t);
    this.depthHistory.tick(now, () => this.depth());
  }

  depth() {
    return this.lanes.reduce((n, q) => n + q.length, 0);
  }

  stats() {
    const recent = this.acked.filter((a) => this.now - a.t < THROUGHPUT_WINDOW);
    return {
      depth: this.depth(),
      laneDepths: this.lanes.map((q) => q.length),
      throughput: recent.length / Math.min(THROUGHPUT_WINDOW, Math.max(1, this.now)),
      avgLatency: mean(this.acked.map((a) => a.latency)),
      redeliveries: this.redeliveries,
      duplicates: this.duplicates,
      dlq: this.dlqTotal,
    };
  }
}

export type Stats = ReturnType<Broker['stats']>;

/* ─── The lesson's world: the broker plus bursty producers ─── */

/** A queue deeper than this is a backlog worth warning about (stat colour, chart, caption). */
export const BACKLOG_WARN = 14;
const SLOW_LANE = 1; // analytics
const SLOW_LANE_WARN = 10;
const INSIGHT_COOLDOWN = 12;
const BURSTINESS = { min: 0.5, spread: 1 }; // arrivals jitter between 0.5× and 1.5× the rate

export interface World {
  broker: Broker;
  acc: number;
  rate: number;
  nextProducer: number;
  insight: ReturnType<typeof createCooldown>;
}

function freshBroker(mode: Mode, consumers: number, speed: number) {
  const broker = new Broker(mode, consumers);
  broker.speed = speed;
  return broker;
}

export function createWorld(mode: Mode, consumers: number, rate: number, speed: number): World {
  return { broker: freshBroker(mode, consumers, speed), acc: 0, rate, nextProducer: 0, insight: createCooldown(INSIGHT_COOLDOWN) };
}

/** Advance by dt: the broker, then new messages from alternating producers. Returns the broker's events. */
export function advance(w: World, dt: number): SimEvent[] {
  const b = w.broker;
  b.step(dt);
  w.acc += w.rate * dt * (BURSTINESS.min + Math.random() * BURSTINESS.spread);
  while (w.acc >= 1) {
    w.acc -= 1;
    b.publish(w.nextProducer++ % PRODUCERS);
  }
  return b.events.splice(0);
}

/** Swap in a fresh broker in the other mode, keeping the producer rate and consumer speed. */
export function switchMode(w: World, mode: Mode, consumers: number, speed: number) {
  w.broker = freshBroker(mode, consumers, speed);
  w.acc = 0;
  w.insight = createCooldown(INSIGHT_COOLDOWN);
}

export function publishPoison(w: World) {
  w.broker.publish(0, true);
}

export type Insight = 'backlog' | 'slowSubscriber';

/** An insight worth narrating, if the cooldown allows one. Firing it re-arms the cooldown. */
export function takeInsight(w: World, st: Stats): Insight | null {
  const b = w.broker;
  if (!w.insight.ready(b.now)) return null;
  const insight: Insight | null =
    b.mode === 'work' && st.depth > BACKLOG_WARN ? 'backlog'
      : b.mode === 'pubsub' && st.laneDepths[SLOW_LANE] > SLOW_LANE_WARN ? 'slowSubscriber'
        : null;
  if (insight) w.insight.fire(b.now);
  return insight;
}
