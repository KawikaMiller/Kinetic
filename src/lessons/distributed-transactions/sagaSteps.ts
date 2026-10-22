// The saga scenes: one run of the saga in saga.ts turned into frames; every status and verdict comes from the services' state.
import { payloadLabel } from '../../core/distSim';
import {
  chargedAtMostOnce, confirmedMeansComplete, ledgerOf, PRICE, SCENE_HORIZON_MS, sagaCluster, verdictOf,
  type SagaMsg, type SagaOptions, type SagaPhase, type SagaState, type SagaStyle, type SagaVariant,
} from './saga';
import { walk, type NodeView, type Step, type StepMsg, type Tone } from './steps';
import type { NodeId } from './twoPc';

export type SagaCase = 'happy' | 'fail';

export const sagaScene = (kase: SagaCase, style: SagaStyle, seed: number, variant: SagaVariant, faults: boolean): SagaOptions => ({
  seed, style, variant, outOfStock: kase === 'fail', faults,
});

type Snap = Parameters<typeof chargedAtMostOnce>[0];

const COMMANDS = new Set(['create order', 'charge', 'reserve', 'confirm', 'place']);
const COMPENSATIONS = new Set(['refund', 'cancel']);
const EVENTS = new Set(['OrderCreated', 'PaymentCharged', 'StockReserved', 'StockFailed']);

const tone = (m: SagaMsg): Tone => {
  if (m.type === 'result') return m.placed ? 'ok' : 'bad';
  if (COMPENSATIONS.has(m.type)) return 'violet';
  if (m.type === 'out of stock' || m.type === 'StockFailed') return 'bad';
  if (COMMANDS.has(m.type) || m.type === 'OrderCreated' || m.type === 'PaymentCharged') return 'work';
  return 'ok';
};

const label = (m: SagaMsg, keyed: boolean): string => {
  if (m.type === 'result') return m.placed ? 'order placed ✓' : 'out of stock';
  if (m.type === 'charge') return keyed ? `charge $${PRICE} (key #42)` : `charge $${PRICE}`;
  if (m.type === 'refund') return `refund $${PRICE}`;
  const text = payloadLabel(m);
  return text === 'out of stock' ? 'FAILED ✗' : text;
};

const state = <R extends SagaState['role']>(snap: Snap, id: NodeId, role: R) => {
  const s = snap.nodes[id]?.state;
  return s?.role === role ? (s as Extract<SagaState, { role: R }>) : null;
};

function serviceView(snap: Snap, id: 'orders' | 'payments' | 'inventory'): NodeView {
  const l = ledgerOf(snap);
  const crashed = !snap.nodes[id].up;
  const payments = state(snap, 'payments', 'payments');
  const inventory = state(snap, 'inventory', 'inventory');
  const view = ((): NodeView => {
    if (id === 'orders') {
      if (l.orders === 'cancelled') return { status: '↺ compensated', tone: 'violet', detail: 'order #42 CANCELLED' };
      if (l.orders === 'confirmed') return { status: 'committed', tone: 'ok', detail: 'order #42 CONFIRMED' };
      if (l.orders === 'pending') return { status: 'committed', tone: 'ok', detail: 'order #42 PENDING' };
      return { status: 'idle', tone: 'idle', detail: 'no order yet' };
    }
    if (id === 'payments') {
      if (l.netDollars > PRICE) return { status: 'double charged', tone: 'bad', detail: `$${l.netDollars} charged` };
      if (l.netDollars > 0) return { status: 'committed', tone: 'ok', detail: `$${l.netDollars} charged` };
      if (payments && payments.refunds > 0) return { status: '↺ compensated', tone: 'violet', detail: `$${PRICE} refunded` };
      return { status: 'idle', tone: 'idle', detail: 'card ••4242' };
    }
    if (inventory?.failed) return { status: 'failed', tone: 'bad', detail: 'SKU-7 stock: 0' };
    if (inventory?.reserved) return { status: 'committed', tone: 'ok', detail: `SKU-7 stock: ${inventory.stock + 1} → ${inventory.stock}` };
    return { status: 'idle', tone: 'idle', detail: `SKU-7 stock: ${inventory?.stock ?? 0}` };
  })();
  return crashed ? { ...view, status: 'crashed', tone: 'bad', crashed: true } : view;
}

const COORD_DETAIL: Record<SagaPhase, { detail: string; tone: Tone }> = {
  idle: { detail: 'waiting', tone: 'idle' },
  creating: { detail: 'running saga #42', tone: 'work' },
  charging: { detail: 'running saga #42', tone: 'work' },
  reserving: { detail: 'running saga #42', tone: 'work' },
  confirming: { detail: 'running saga #42', tone: 'work' },
  refunding: { detail: 'compensating saga #42', tone: 'violet' },
  cancelling: { detail: 'compensating saga #42', tone: 'violet' },
  done: { detail: 'saga #42 complete', tone: 'ok' },
  'rolled-back': { detail: 'saga #42 compensated', tone: 'violet' },
};

const PHASE_NAME: Record<SagaPhase, string> = {
  idle: 'Start',
  creating: 'Step 1',
  charging: 'Step 2',
  reserving: 'Step 3',
  confirming: 'Finish',
  refunding: 'Compensate',
  cancelling: 'Compensate',
  done: 'Done',
  'rolled-back': 'Done',
};

/** The choreographed saga has no orchestrator, so its phase is read off the services. */
function choreographyPhase(snap: Snap): string {
  const l = ledgerOf(snap);
  if (l.orders === 'confirmed' || (l.orders === 'cancelled' && l.netDollars === 0)) return 'Done';
  if (l.stockFailed) return 'Compensate';
  if (l.reserved) return 'Step 3';
  if (l.netDollars > 0) return 'Step 2';
  return l.orders === 'none' ? 'Start' : 'Step 1';
}

const clientView = (snap: Snap): NodeView => {
  const s = state(snap, 'client', 'client');
  if (s?.placed === true) return { status: 'customer', tone: 'ok', detail: 'order #42 placed' };
  if (s?.placed === false) return { status: 'customer', tone: 'bad', detail: 'sorry, out of stock' };
  return { status: 'customer', tone: 'idle', detail: 'wants order #42' };
};

/** The scene's frames, plus how long the saga was inconsistent (the sum of the gaps between frames that were). */
export function sagaSteps(o: SagaOptions): Step[] {
  const cluster = sagaCluster(o);
  const keyed = o.variant === 'idempotent';
  let inconsistentMs = 0;
  let lastTime = 0;
  let lastConsistent = true;
  return walk(cluster, SCENE_HORIZON_MS, ({ snap, rows, row, sent }) => {
    const now = row?.t ?? 0;
    if (!lastConsistent) inconsistentMs += now - lastTime;
    const verdict = verdictOf(snap);
    lastTime = now;
    lastConsistent = verdict.consistent;
    const coordPhase = state(snap, 'coord', 'coord')?.phase ?? 'idle';
    const coordInfo = COORD_DETAIL[coordPhase];
    const hidden = o.style === 'chor';
    const nodes: Record<NodeId, NodeView> = {
      client: clientView(snap),
      coord: { status: 'saga orchestrator', tone: coordInfo.tone, detail: coordInfo.detail, hidden, crashed: !hidden && !snap.nodes.coord?.up },
      client2: { status: 'another customer', tone: 'idle', detail: '', hidden: true },
      orders: serviceView(snap, 'orders'),
      payments: serviceView(snap, 'payments'),
      inventory: serviceView(snap, 'inventory'),
    };
    const msgs: StepMsg[] = rows
      .filter((r) => r.kind === 'send' && r.from && r.to)
      .map((r) => {
        const m = r.payload as SagaMsg;
        return { from: r.from as NodeId, to: r.to as NodeId, label: label(m, keyed), tone: tone(m), viaBus: EVENTS.has(m.type) };
      });
    return {
      time: now,
      row,
      nodes,
      msgs,
      sent,
      locks: 0,
      phase: o.style === 'orch' ? PHASE_NAME[coordPhase] : choreographyPhase(snap),
      consistency: { label: verdict.label, tone: verdict.tone },
      stallMs: 0,
      violation: chargedAtMostOnce(snap) ?? confirmedMeansComplete(snap),
      facts: { inconsistentMs: Math.round(inconsistentMs), netDollars: ledgerOf(snap).netDollars, settled: verdict.consistent ? 1 : 0 },
    };
  });
}
