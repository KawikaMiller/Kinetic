// A tiny message broker: producers publish, the broker queues, consumers
// process and ack. Unacked messages are redelivered (at-least-once), poison
// messages go to a dead-letter queue after MAX_ATTEMPTS.

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

export type MsgState = 'queued' | 'processing' | 'unacked' | 'done' | 'dlq';

export interface Msg {
  id: number;
  seq: number; // the published message number (copies share it in pub/sub)
  lane: number;
  born: number;
  attempts: number;
  poison: boolean;
  redelivered: boolean;
  sideEffectDone: boolean; // work happened but the ack was lost
  state: MsgState;
  stateAt: number;
  redeliverAt: number;
  heldBy: number; // consumer id that has (or had) it
  // drawing position, eased toward a target each frame
  x: number;
  y: number;
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
  depthHistory: number[] = [];
  redeliveries = 0;
  duplicates = 0;
  dlqTotal = 0;
  published = 0;
  speed = 1;
  events: SimEvent[] = [];
  private nextId = 1;
  private nextConsumer = 1;
  private lastSample = 0;

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

  publish(from: { x: number; y: number }, poison = false) {
    const seq = ++this.published;
    for (let lane = 0; lane < this.lanes.length; lane++) {
      const m: Msg = {
        id: this.nextId++, seq, lane, born: this.now, attempts: 0, poison, redelivered: false,
        sideEffectDone: false, state: 'queued', stateAt: this.now, redeliverAt: 0, heldBy: 0, x: from.x, y: from.y,
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
    const c = pool[Math.floor(Math.random() * pool.length)];
    c.deadUntil = this.now + RESTART_AFTER;
    if (c.msg) {
      const m = c.msg;
      // past halfway: the side effect (email sent, row written) already happened
      m.sideEffectDone = m.sideEffectDone || (this.now - c.started) / c.duration > 0.5;
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
        c.duration = (1 / (this.speed * laneSpeed)) * (0.7 + Math.random() * 0.6);
      }
    }

    // forget finished messages once their exit animation is over
    if (this.dlq.length > 12) this.dlq.splice(0, this.dlq.length - 12);
    this.msgs = this.msgs.filter(
      (m) => !(m.state === 'done' && now - m.stateAt > 0.8) && !(m.state === 'dlq' && !this.dlq.includes(m)),
    );
    this.acked = this.acked.filter((a) => now - a.t < 10);

    if (now - this.lastSample >= 0.5) {
      this.lastSample = now;
      this.depthHistory.push(this.depth());
      if (this.depthHistory.length > 60) this.depthHistory.shift();
    }
  }

  depth() {
    return this.lanes.reduce((n, q) => n + q.length, 0);
  }

  stats() {
    const recent = this.acked.filter((a) => this.now - a.t < 5);
    const lat = this.acked.map((a) => a.latency);
    return {
      depth: this.depth(),
      laneDepths: this.lanes.map((q) => q.length),
      throughput: recent.length / Math.min(5, Math.max(1, this.now)),
      avgLatency: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
      redeliveries: this.redeliveries,
      duplicates: this.duplicates,
      dlq: this.dlqTotal,
    };
  }
}
