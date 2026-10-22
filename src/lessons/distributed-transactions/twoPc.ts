// Two-phase commit on core/distSim: a coordinator and three participants, each with its own durable log,
// talking over a network that can lose, duplicate and delay messages, with crashes and restarts injected.
// The same nodes run on screen and in the tests; atomicity is asserted after every event.
import { createCluster, type Cluster, type DistNode, type Safety } from '../../core/distSim';

export const PARTICIPANTS = ['orders', 'payments', 'inventory'] as const;
export type Participant = (typeof PARTICIPANTS)[number];
export type NodeId = 'client' | 'coord' | 'client2' | Participant;
export const NODE_IDS: readonly NodeId[] = ['client', 'coord', 'client2', ...PARTICIPANTS];

export type TxPhase = 'idle' | 'prepared' | 'committed' | 'aborted';
export type Decision = 'commit' | 'abort';

/** 'real' is 2PC; 'early-commit' decides COMMIT as soon as a majority of the participants has voted YES. */
export type TwoPcVariant = 'real' | 'early-commit';

export type TwoPcMsg =
  | { type: 'place' }
  | { type: 'prepare' }
  | { type: 'vote'; from: Participant; yes: boolean }
  | { type: 'commit' }
  | { type: 'abort' }
  | { type: 'ack'; from: Participant }
  | { type: 'result'; placed: boolean }
  | { type: 'reserve' }
  | { type: 'granted' };

export type TwoPcState =
  | { role: 'participant'; phase: TxPhase; votedNo: boolean; stock: number; waiting: boolean }
  | { role: 'coord'; began: boolean; decision: Decision | null; yes: number; no: number; acks: number }
  | { role: 'client'; placed: boolean | null }
  | { role: 'client2'; granted: boolean };

/** Network latency of every message, ms. */
export const LATENCY_MS = { min: 40, max: 120 } as const;
/** The coordinator gives up waiting for votes after this long and aborts. */
export const VOTE_TIMEOUT_MS = 1_500;
/** Gap between the coordinator's decision messages to the three participants: a crash can land between them. */
export const DECISION_STAGGER_MS = 20;
export const RETRY_MS = 1_000;
/** How long a crashed node stays down in the scenes and in the restart runs of the check. */
export const SCENE_DOWN_MS = 120_000;
export const CHECK_DOWN_MS = 2_000;
export const CHECK_HORIZON_MS = 10_000;
export const SCENE_HORIZON_MS = SCENE_DOWN_MS + 20_000;
export const STOCK = 3;
/** Faults applied to every message of the safety check. */
export const CHECK_LOSS = 0.08;
export const CHECK_DUPLICATE = 0.1;
/** Customer #2 asks for the locked item this long after the crash. */
export const CLIENT2_AFTER_MS = 30_000;
const PLACE_AT_MS = 1;

const ALL_YES = PARTICIPANTS.length;
const MAJORITY = Math.floor(PARTICIPANTS.length / 2) + 1;

function coordinator(variant: TwoPcVariant): DistNode<TwoPcMsg, TwoPcState> {
  // Durable (the coordinator's log): survives a crash.
  let began = false;
  let decision: Decision | null = null;
  // Volatile: rebuilt after a restart.
  let yes = new Set<Participant>();
  let no = new Set<Participant>();
  let acks = new Set<Participant>();

  const sendDecision = (ctx: Parameters<DistNode<TwoPcMsg>['init']>[0], to: Participant) => {
    ctx.send(to, { type: decision === 'commit' ? 'commit' : 'abort' });
  };
  const decide = (ctx: Parameters<DistNode<TwoPcMsg>['init']>[0], d: Decision) => {
    decision = d;
    ctx.cancelTimer('vote-timeout');
    ctx.send('client', { type: 'result', placed: d === 'commit' });
    PARTICIPANTS.forEach((p, i) => ctx.setTimer(`send-${p}`, DECISION_STAGGER_MS * (i + 1)));
    ctx.setTimer('retry', RETRY_MS);
  };

  return {
    init: (ctx) => {
      yes = new Set();
      no = new Set();
      acks = new Set();
      if (decision) {
        for (const p of PARTICIPANTS) sendDecision(ctx, p);
        ctx.setTimer('retry', RETRY_MS);
      } else if (began) {
        decide(ctx, 'abort'); // the log has no decision: nobody can have committed, so abort
      }
    },
    onMessage: (ctx, { payload: m }) => {
      if (m.type === 'place' && !began) {
        began = true;
        for (const p of PARTICIPANTS) ctx.send(p, { type: 'prepare' });
        ctx.setTimer('vote-timeout', VOTE_TIMEOUT_MS);
      } else if (m.type === 'vote' && !decision) {
        (m.yes ? yes : no).add(m.from);
        if (no.size > 0) decide(ctx, 'abort');
        else if (yes.size >= (variant === 'real' ? ALL_YES : MAJORITY)) decide(ctx, 'commit');
      } else if (m.type === 'ack') {
        acks.add(m.from);
        if (acks.size === ALL_YES) ctx.cancelTimer('retry');
      }
    },
    onTimer: (ctx, id) => {
      if (id === 'vote-timeout' && !decision) decide(ctx, 'abort');
      else if (id.startsWith('send-') && decision) sendDecision(ctx, id.slice('send-'.length) as Participant);
      else if (id === 'retry' && decision && acks.size < ALL_YES) {
        for (const p of PARTICIPANTS) if (!acks.has(p)) sendDecision(ctx, p);
        ctx.setTimer('retry', RETRY_MS);
      }
    },
    snapshot: () => ({ role: 'coord', began, decision, yes: yes.size, no: no.size, acks: acks.size }),
  };
}

function participant(id: Participant, stock: number): DistNode<TwoPcMsg, TwoPcState> {
  // Everything here is the participant's durable log: a crash loses nothing but its timers.
  let phase: TxPhase = 'idle';
  let votedNo = false;
  let remaining = stock;
  let waiting = false;

  const release = (ctx: Parameters<DistNode<TwoPcMsg>['init']>[0]) => {
    if (!waiting) return;
    waiting = false;
    ctx.send('client2', { type: 'granted' });
  };

  return {
    init: () => {},
    onMessage: (ctx, { payload: m }) => {
      if (m.type === 'prepare') {
        if (phase === 'idle') {
          votedNo = remaining < 1 && id === 'inventory';
          phase = votedNo ? 'aborted' : 'prepared';
        }
        if (phase === 'prepared' || votedNo) ctx.send('coord', { type: 'vote', from: id, yes: phase === 'prepared' });
      } else if (m.type === 'commit') {
        if (phase === 'prepared') {
          phase = 'committed';
          if (id === 'inventory') remaining -= 1;
          release(ctx);
        }
        if (phase === 'committed') ctx.send('coord', { type: 'ack', from: id });
      } else if (m.type === 'abort') {
        if (phase === 'prepared' || phase === 'idle') {
          phase = 'aborted';
          release(ctx);
        }
        if (phase === 'aborted') ctx.send('coord', { type: 'ack', from: id });
      } else if (m.type === 'reserve') {
        if (phase === 'prepared') waiting = true;
        else ctx.send('client2', { type: 'granted' });
      }
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'participant', phase, votedNo, stock: remaining, waiting }),
  };
}

function client(): DistNode<TwoPcMsg, TwoPcState> {
  let placed: boolean | null = null;
  return {
    init: () => {},
    onMessage: (_ctx, { payload: m }) => {
      if (m.type === 'result') placed = m.placed;
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'client', placed }),
  };
}

function client2(): DistNode<TwoPcMsg, TwoPcState> {
  let granted = false;
  return {
    init: () => {},
    onMessage: (_ctx, { payload: m }) => {
      if (m.type === 'granted') granted = true;
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'client2', granted }),
  };
}

export interface Crash {
  node: NodeId;
  at: number;
  /** When it comes back; null means it stays down. */
  restartAt: number | null;
}

export interface TwoPcOptions {
  seed: number;
  variant: TwoPcVariant;
  /** Inventory has no stock, so it votes NO. */
  outOfStock: boolean;
  /** Loss and duplication on every message. */
  faults: boolean;
  crash?: Crash;
  /** Customer #2 asks for the item at this time. */
  client2At?: number;
}

export type TwoPcCluster = Cluster<TwoPcMsg, TwoPcState>;

/** One transaction, from the customer's order to the last ack. */
export function twoPcCluster(o: TwoPcOptions): TwoPcCluster {
  const cluster = createCluster<TwoPcMsg, TwoPcState>({
    seed: o.seed,
    nodes: {
      client: client(),
      coord: coordinator(o.variant),
      client2: client2(),
      orders: participant('orders', STOCK),
      payments: participant('payments', STOCK),
      inventory: participant('inventory', o.outOfStock ? 0 : STOCK),
    },
    latency: LATENCY_MS,
    ...(o.faults ? { loss: CHECK_LOSS, duplicate: CHECK_DUPLICATE } : {}),
  });
  cluster.inject(PLACE_AT_MS, 'coord', { type: 'place' }, { from: 'client' });
  if (o.client2At !== undefined) cluster.inject(o.client2At, 'inventory', { type: 'reserve' }, { from: 'client2' });
  if (o.crash) {
    cluster.crash(o.crash.node, o.crash.at);
    if (o.crash.restartAt !== null) cluster.restart(o.crash.node, o.crash.restartAt);
  }
  return cluster;
}

const phaseOf = (snap: Parameters<Safety<TwoPcState>>[0], id: Participant): TxPhase => {
  const s = snap.nodes[id]?.state;
  return s?.role === 'participant' ? s.phase : 'idle';
};

/** Atomicity: no participant has committed while another has aborted. */
export const atomicity: Safety<TwoPcState> = (snap) => {
  const committed = PARTICIPANTS.filter((p) => phaseOf(snap, p) === 'committed');
  const aborted = PARTICIPANTS.filter((p) => phaseOf(snap, p) === 'aborted');
  return committed.length && aborted.length ? `${committed.join(' and ')} committed but ${aborted.join(' and ')} aborted` : null;
};

export const TWO_PC_SAFETY: readonly Safety<TwoPcState>[] = [atomicity];
