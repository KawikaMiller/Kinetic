// A saga on core/distSim: three services that each commit locally at once, an optional orchestrator, compensations
// run in reverse when a step fails, and an idempotency key so a retried charge cannot charge twice. Orchestration and
// choreography share the services; only who decides the next step differs.
import { createCluster, type Cluster, type DistNode, type Safety } from '../../core/distSim';
import type { NodeId } from './twoPc';

export type SagaStyle = 'orch' | 'chor';
/** 'idempotent' deduplicates a charge by its key; 'no-key' charges again for every copy of the request it receives. */
export type SagaVariant = 'idempotent' | 'no-key';
export type OrderStatus = 'none' | 'pending' | 'confirmed' | 'cancelled';
export type SagaPhase = 'idle' | 'creating' | 'charging' | 'reserving' | 'confirming' | 'refunding' | 'cancelling' | 'done' | 'rolled-back';

/** Commands and replies of the orchestrated saga, events of the choreographed one, and the customer's two messages. */
export type SagaMsg =
  | { type: 'place' }
  | { type: 'create order' | 'charge' | 'reserve' | 'refund' | 'cancel' | 'confirm' }
  | { type: 'created' | 'charged' | 'reserved' | 'out of stock' | 'refunded' | 'cancelled' | 'confirmed' }
  | { type: 'OrderCreated' | 'PaymentCharged' | 'StockReserved' | 'StockFailed' }
  | { type: 'result'; placed: boolean };

export type SagaState =
  | { role: 'orders'; status: OrderStatus }
  | { role: 'payments'; charges: number; refunds: number }
  | { role: 'inventory'; reserved: boolean; failed: boolean; stock: number }
  | { role: 'coord'; phase: SagaPhase }
  | { role: 'client'; placed: boolean | null };

export const SAGA_IDS = ['client', 'coord', 'orders', 'payments', 'inventory'] as const;
export const PRICE = 40;
export const STOCK = 3;
export const LATENCY_MS = { min: 40, max: 120 } as const;
export const RETRY_MS = 400;
export const CHECK_LOSS = 0.1;
export const CHECK_DUPLICATE = 0.15;
export const CHECK_HORIZON_MS = 20_000;
export const CHECK_DOWN_MS = 1_500;
export const SCENE_HORIZON_MS = 10_000;
const PLACE_AT_MS = 1;

type Ctx = Parameters<DistNode<SagaMsg>['init']>[0];

const COMMAND: Record<SagaPhase, { to: NodeId; type: SagaMsg['type'] } | null> = {
  idle: null,
  creating: { to: 'orders', type: 'create order' },
  charging: { to: 'payments', type: 'charge' },
  reserving: { to: 'inventory', type: 'reserve' },
  confirming: { to: 'orders', type: 'confirm' },
  refunding: { to: 'payments', type: 'refund' },
  cancelling: { to: 'orders', type: 'cancel' },
  done: null,
  'rolled-back': null,
};

/** The reply that moves each phase on, and the phase it moves to. */
const NEXT: Partial<Record<SagaPhase, [SagaMsg['type'], SagaPhase][]>> = {
  creating: [['created', 'charging']],
  charging: [['charged', 'reserving']],
  reserving: [['reserved', 'confirming'], ['out of stock', 'refunding']],
  confirming: [['confirmed', 'done']],
  refunding: [['refunded', 'cancelling']],
  cancelling: [['cancelled', 'rolled-back']],
};

function orchestrator(): DistNode<SagaMsg, SagaState> {
  let phase: SagaPhase = 'idle'; // the orchestrator's durable log
  const enter = (ctx: Ctx, next: SagaPhase) => {
    phase = next;
    const cmd = COMMAND[phase];
    if (cmd) {
      ctx.send(cmd.to, { type: cmd.type } as SagaMsg);
      ctx.setTimer('retry', RETRY_MS);
    } else {
      ctx.cancelTimer('retry');
      if (phase === 'done' || phase === 'rolled-back') ctx.send('client', { type: 'result', placed: phase === 'done' });
    }
  };
  return {
    init: (ctx) => {
      if (COMMAND[phase]) enter(ctx, phase); // resume from the log: ask again, the services deduplicate
    },
    onMessage: (ctx, { payload: m }) => {
      if (m.type === 'place' && phase === 'idle') enter(ctx, 'creating');
      const move = NEXT[phase]?.find(([reply]) => reply === m.type);
      if (move) enter(ctx, move[1]);
    },
    onTimer: (ctx) => {
      if (COMMAND[phase]) enter(ctx, phase);
    },
    snapshot: () => ({ role: 'coord', phase }),
  };
}

function ordersService(style: SagaStyle): DistNode<SagaMsg, SagaState> {
  let status: OrderStatus = 'none';
  return {
    init: () => {},
    onMessage: (ctx, { payload: m }) => {
      if (m.type === 'create order' || (style === 'chor' && m.type === 'place')) {
        if (status === 'none') status = 'pending';
        if (style === 'orch') ctx.send('coord', { type: 'created' });
        else ctx.send('payments', { type: 'OrderCreated' });
      } else if (m.type === 'confirm') {
        if (status === 'pending') status = 'confirmed';
        ctx.send('coord', { type: 'confirmed' });
      } else if (m.type === 'cancel') {
        if (status !== 'confirmed') status = 'cancelled';
        ctx.send('coord', { type: 'cancelled' });
      } else if (m.type === 'StockReserved' && status === 'pending') {
        status = 'confirmed';
        ctx.send('client', { type: 'result', placed: true });
      } else if (m.type === 'StockFailed' && status !== 'confirmed') {
        status = 'cancelled';
        ctx.send('client', { type: 'result', placed: false });
      }
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'orders', status }),
  };
}

function paymentsService(style: SagaStyle, variant: SagaVariant): DistNode<SagaMsg, SagaState> {
  // The charge ledger and the set of keys already seen are durable.
  let charges = 0;
  let refunds = 0;
  let charged = false;
  let refunded = false;
  const reply = (ctx: Ctx, orch: SagaMsg, chor: SagaMsg) => (style === 'orch' ? ctx.send('coord', orch) : ctx.send('inventory', chor));
  const charge = () => {
    if (variant === 'idempotent' && charged) return;
    charged = true;
    charges += 1;
  };
  return {
    init: () => {},
    onMessage: (ctx, { payload: m }) => {
      if (m.type === 'charge' || m.type === 'OrderCreated') {
        charge();
        reply(ctx, { type: 'charged' }, { type: 'PaymentCharged' });
      } else if (m.type === 'refund' || m.type === 'StockFailed') {
        if (!refunded && charged) {
          refunded = true;
          refunds += 1;
        }
        if (m.type === 'refund') ctx.send('coord', { type: 'refunded' });
      }
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'payments', charges, refunds }),
  };
}

function inventoryService(style: SagaStyle, stock: number): DistNode<SagaMsg, SagaState> {
  let reserved = false;
  let failed = false;
  let remaining = stock;
  return {
    init: () => {},
    onMessage: (ctx, { payload: m }) => {
      if (m.type !== 'reserve' && m.type !== 'PaymentCharged') return;
      if (!reserved && !failed) {
        if (remaining > 0) {
          reserved = true;
          remaining -= 1;
        } else failed = true;
      }
      if (style === 'orch') ctx.send('coord', { type: reserved ? 'reserved' : 'out of stock' });
      else if (reserved) ctx.send('orders', { type: 'StockReserved' });
      else {
        ctx.send('payments', { type: 'StockFailed' });
        ctx.send('orders', { type: 'StockFailed' });
      }
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'inventory', reserved, failed, stock: remaining }),
  };
}

function client(): DistNode<SagaMsg, SagaState> {
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

export interface Crash {
  node: NodeId;
  at: number;
  restartAt: number | null;
}

export interface SagaOptions {
  seed: number;
  style: SagaStyle;
  variant: SagaVariant;
  /** Inventory has no stock: step 3 fails. */
  outOfStock: boolean;
  /** Loss and duplication on every message. */
  faults: boolean;
  crash?: Crash;
}

export type SagaCluster = Cluster<SagaMsg, SagaState>;

export function sagaCluster(o: SagaOptions): SagaCluster {
  const nodes: Record<string, DistNode<SagaMsg, SagaState>> = {
    client: client(),
    orders: ordersService(o.style),
    payments: paymentsService(o.style, o.variant),
    inventory: inventoryService(o.style, o.outOfStock ? 0 : STOCK),
  };
  if (o.style === 'orch') nodes.coord = orchestrator();
  const cluster = createCluster<SagaMsg, SagaState>({
    seed: o.seed,
    nodes,
    latency: LATENCY_MS,
    ...(o.faults ? { loss: CHECK_LOSS, duplicate: CHECK_DUPLICATE } : {}),
  });
  cluster.inject(PLACE_AT_MS, o.style === 'orch' ? 'coord' : 'orders', { type: 'place' }, { from: 'client' });
  if (o.crash) {
    cluster.crash(o.crash.node, o.crash.at);
    if (o.crash.restartAt !== null) cluster.restart(o.crash.node, o.crash.at === o.crash.restartAt ? o.crash.at + 1 : o.crash.restartAt);
  }
  return cluster;
}

type Snap = Parameters<Safety<SagaState>>[0];

/** What the services' own state says right now: how many dollars are charged net, and which steps have been applied. */
export function ledgerOf(snap: Snap) {
  const orders = snap.nodes.orders.state;
  const payments = snap.nodes.payments.state;
  const inventory = snap.nodes.inventory.state;
  if (orders?.role !== 'orders' || payments?.role !== 'payments' || inventory?.role !== 'inventory') throw new Error('a service has no state');
  const netCharges = payments.charges - payments.refunds;
  return { orders: orders.status, netDollars: netCharges * PRICE, reserved: inventory.reserved, stockFailed: inventory.failed };
}

export interface Verdict {
  label: string;
  tone: 'ok' | 'hi' | 'bad' | 'dim';
  /** True once nothing is half-done: all applied and confirmed, or all compensated. */
  consistent: boolean;
}

/** The saga's consistency, computed from the three services' state. */
export function verdictOf(snap: Snap): Verdict {
  const l = ledgerOf(snap);
  if (l.netDollars > PRICE) return { label: `inconsistent: charged $${l.netDollars} for a $${PRICE} order`, tone: 'bad', consistent: false };
  if (l.orders === 'confirmed' && l.netDollars === PRICE && l.reserved) return { label: 'consistent ✓ all steps applied', tone: 'ok', consistent: true };
  if (l.orders === 'cancelled' && l.netDollars === 0 && !l.reserved) return { label: 'consistent ✓ after compensation', tone: 'ok', consistent: true };
  if (l.orders === 'none' && l.netDollars === 0 && !l.reserved) return { label: 'nothing yet', tone: 'dim', consistent: true };
  if (l.stockFailed && l.netDollars > 0) return { label: "inconsistent: charged, can't ship", tone: 'bad', consistent: false };
  if (l.stockFailed) return { label: 'inconsistent: order still open', tone: 'hi', consistent: false };
  const applied = Number(l.orders !== 'none') + Number(l.netDollars > 0) + Number(l.reserved);
  return { label: `partial: ${applied} of 3 steps applied`, tone: 'hi', consistent: false };
}

/** Safety rule 1: the customer is never charged more than once for the order. */
export const chargedAtMostOnce: Safety<SagaState> = (snap) => {
  const { netDollars } = ledgerOf(snap);
  return netDollars > PRICE ? `the customer is charged $${netDollars} for a $${PRICE} order` : null;
};

/** Safety rule 2: an order is confirmed only when the charge and the reservation both happened. */
export const confirmedMeansComplete: Safety<SagaState> = (snap) => {
  const l = ledgerOf(snap);
  return l.orders === 'confirmed' && (l.netDollars < PRICE || !l.reserved) ? 'the order is confirmed but its charge or its reservation is missing' : null;
};

export const SAGA_SAFETY: readonly Safety<SagaState>[] = [chargedAtMostOnce, confirmedMeansComplete];
