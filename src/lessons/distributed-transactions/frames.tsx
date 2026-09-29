import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

export type NodeId = 'client' | 'coord' | 'orders' | 'payments' | 'inventory' | 'client2';
export type Tone = 'idle' | 'work' | 'ok' | 'bad' | 'hi' | 'violet' | 'dim';

export interface NodeView {
  status: string;
  tone: Tone;
  detail: string;
  lock?: boolean;
  crashed?: boolean;
  hidden?: boolean;
}

export interface Msg {
  from: NodeId;
  to: NodeId;
  label: string;
  tone: Tone;
  viaBus?: boolean;
}

export interface DtFrame extends Frame {
  nodes: Record<NodeId, NodeView>;
  msgs: Msg[];
  phase: string;
  consistency: { label: string; tone: Tone };
  sent: number;
  locks: number;
  stall?: string;
}

export type Protocol = '2pc' | 'saga';
export type TwoPcCase = 'happy' | 'no' | 'crash';
export type SagaCase = 'happy' | 'fail';
export type SagaStyle = 'orch' | 'chor';

const PARTS: NodeId[] = ['orders', 'payments', 'inventory'];

function builder(coordName: string, hideCoord = false) {
  const nodes: Record<NodeId, NodeView> = {
    client: { status: 'customer', tone: 'idle', detail: 'wants order #42' },
    coord: { status: coordName, tone: 'idle', detail: 'waiting', hidden: hideCoord },
    orders: { status: 'idle', tone: 'idle', detail: 'no order yet' },
    payments: { status: 'idle', tone: 'idle', detail: 'card ••4242' },
    inventory: { status: 'idle', tone: 'idle', detail: 'SKU-7 stock: 3' },
    client2: { status: 'another customer', tone: 'idle', detail: 'wants SKU-7 too', hidden: true },
  };
  let consistency: DtFrame['consistency'] = { label: 'nothing yet', tone: 'dim' };
  let sent = 0;
  let phase = 'Start';
  const frames: DtFrame[] = [];
  return {
    set(id: NodeId, patch: Partial<NodeView>) {
      nodes[id] = { ...nodes[id], ...patch };
    },
    all(ids: NodeId[], patch: Partial<NodeView>) {
      for (const id of ids) nodes[id] = { ...nodes[id], ...patch };
    },
    cons(label: string, tone: Tone) {
      consistency = { label, tone };
    },
    phase(p: string) {
      phase = p;
    },
    push(say: ReactNode, msgs: Msg[] = [], extra: { hold?: number; stall?: string } = {}) {
      sent += msgs.length;
      frames.push({
        nodes: structuredClone(nodes),
        msgs,
        say,
        phase,
        consistency,
        sent,
        locks: PARTS.filter((id) => nodes[id].lock).length,
        ...extra,
      });
    },
    frames,
  };
}

const toAll = (from: NodeId, label: string, tone: Tone): Msg[] => PARTS.map((to) => ({ from, to, label, tone }));
const fromAll = (to: NodeId, label: string, tone: Tone, except?: { id: NodeId; label: string; tone: Tone }): Msg[] =>
  PARTS.map((from) => (except && from === except.id ? { from, to, label: except.label, tone: except.tone } : { from, to, label, tone }));

export function twoPhaseCommit(kase: TwoPcCase): DtFrame[] {
  const b = builder('coordinator');
  b.push(
    <>One order touches <b>three services</b>, each with its own database: create the order, charge $40, reserve 1× SKU-7. It has to be <b>all or nothing</b>.</>,
  );
  b.set('coord', { tone: 'work', detail: 'starting transaction T1' });
  b.push(<>The customer places the order. The Order service acts as the <span className="hl">coordinator</span>.</>, [
    { from: 'client', to: 'coord', label: 'place order', tone: 'work' },
  ]);

  b.phase('Phase 1 · Prepare');
  b.all(PARTS, { status: 'preparing', tone: 'work' });
  b.push(<><b>Phase 1:</b> the coordinator asks every participant "can you commit T1?" Nobody commits yet.</>, toAll('coord', 'PREPARE', 'work'));

  b.set('orders', { status: 'prepared', tone: 'hi', detail: 'order #42 (not visible)', lock: true });
  b.set('payments', { status: 'prepared', tone: 'hi', detail: '$40 held on card', lock: true });
  if (kase === 'no') {
    b.set('inventory', { status: 'votes NO', tone: 'bad', detail: 'SKU-7 stock: 0' });
    b.push(
      <>Orders and Payments do the work tentatively, lock the rows and vote <span className="hl ok">YES</span>. Inventory is out of stock and votes <span className="hl bad">NO</span>.</>,
      fromAll('coord', 'YES', 'ok', { id: 'inventory', label: 'NO', tone: 'bad' }),
    );
    b.phase('Decision');
    b.set('coord', { tone: 'bad', detail: 'decision: ABORT (logged)' });
    b.push(<>One NO is enough. The coordinator writes <span className="hl bad">ABORT</span> to its log.</>);
    b.phase('Phase 2 · Abort');
    b.push(<><b>Phase 2:</b> tell everyone to abort.</>, toAll('coord', 'ABORT', 'bad'));
    b.set('orders', { status: 'aborted', tone: 'dim', detail: 'rolled back', lock: false });
    b.set('payments', { status: 'aborted', tone: 'dim', detail: 'hold released', lock: false });
    b.set('inventory', { status: 'aborted', tone: 'dim', detail: 'nothing to undo' });
    b.push(<>Each participant rolls back its tentative work and releases its locks.</>, fromAll('coord', 'ack', 'dim'));
    b.set('coord', { detail: 'T1 aborted' });
    b.set('client', { tone: 'bad', detail: 'order failed: out of stock' });
    b.cons('consistent ✓ nothing happened', 'ok');
    b.push(
      <><b>All or nothing</b>: nothing happened anywhere, as if the order was never attempted. No refund needed, because no charge ever became real.</>,
      [{ from: 'coord', to: 'client', label: 'failed: out of stock', tone: 'bad' }],
      { hold: 2 },
    );
    return b.frames;
  }

  b.set('inventory', { status: 'prepared', tone: 'hi', detail: '1× SKU-7 reserved', lock: true });
  b.cons('in doubt: nobody has committed', 'hi');
  b.push(
    <>Each one does its work tentatively, writes it to its log, <b>locks</b> the rows and votes <span className="hl ok">YES</span>. From now on it can't back out on its own.</>,
    fromAll('coord', 'YES', 'ok'),
  );

  if (kase === 'crash') {
    b.phase('Coordinator down');
    b.set('coord', { tone: 'bad', crashed: true, detail: 'before deciding' });
    b.push(<>The coordinator <span className="hl bad">crashes</span> after collecting the votes, before telling anyone the decision.</>);
    b.all(PARTS, { status: 'prepared · blocked', detail: 'waiting for a decision…' });
    b.push(
      <>The participants are stuck. They voted YES, so they can't abort alone (the others might have committed), and they can't commit (someone might have voted NO). <b>They keep holding their locks.</b></>,
      [],
      { stall: '10 s' },
    );
    b.set('client2', { hidden: false, status: 'another customer', tone: 'bad', detail: 'blocked on SKU-7 lock' });
    b.push(
      <>Meanwhile another customer wants SKU-7. That row is locked by a transaction nobody can finish, so they <span className="hl bad">wait too</span>.</>,
      [{ from: 'client2', to: 'inventory', label: 'reserve SKU-7', tone: 'bad' }],
      { stall: '30 s' },
    );
    b.push(<>This is why 2PC is called a <b>blocking protocol</b>: one dead coordinator freezes every participant until it comes back.</>, [], { stall: '2 min' });
    b.phase('Recovery');
    b.set('coord', { crashed: false, tone: 'work', detail: 'log has no decision' });
    b.push(<>The coordinator restarts and reads its log. No COMMIT was ever written, so the safe choice is <span className="hl bad">ABORT</span>.</>, [], { stall: '2 min' });
    b.all(PARTS, { status: 'aborted', tone: 'dim', lock: false });
    b.set('orders', { detail: 'rolled back' });
    b.set('payments', { detail: 'hold released' });
    b.set('inventory', { detail: 'reservation undone' });
    b.set('client2', { tone: 'ok', detail: 'got the lock, proceeds' });
    b.set('client', { tone: 'bad', detail: 'order failed, try again' });
    b.cons('consistent ✓ after a long stall', 'ok');
    b.push(
      <>ABORT goes out, locks are released, and the other customer can finally go ahead. <b>Correct, but everyone waited</b> on one machine.</>,
      toAll('coord', 'ABORT', 'bad'),
      { hold: 2 },
    );
    return b.frames;
  }

  b.phase('Decision');
  b.set('coord', { tone: 'ok', detail: 'decision: COMMIT (logged)' });
  b.push(<>All YES → the coordinator writes <span className="hl ok">COMMIT</span> to its own log. That single write is the moment T1 is decided.</>);
  b.phase('Phase 2 · Commit');
  b.push(<><b>Phase 2:</b> tell everyone to commit.</>, toAll('coord', 'COMMIT', 'ok'));
  b.set('orders', { status: 'committed', tone: 'ok', detail: 'order #42 CONFIRMED', lock: false });
  b.set('payments', { status: 'committed', tone: 'ok', detail: '$40 charged', lock: false });
  b.set('inventory', { status: 'committed', tone: 'ok', detail: 'SKU-7 stock: 3 → 2', lock: false });
  b.push(<>Each participant commits locally, <b>releases its locks</b> and acks.</>, fromAll('coord', 'ack', 'ok'));
  b.set('coord', { detail: 'T1 committed' });
  b.set('client', { tone: 'ok', detail: 'order #42 placed' });
  b.cons('consistent ✓ all committed', 'ok');
  b.push(
    <><b>Atomic</b>: all three committed, or none would have. The cost: two round trips, and every participant held locks the whole time.</>,
    [{ from: 'coord', to: 'client', label: 'order placed ✓', tone: 'ok' }],
    { hold: 2 },
  );
  return b.frames;
}

export function saga(kase: SagaCase, style: SagaStyle): DtFrame[] {
  return style === 'orch' ? orchestrated(kase) : choreographed(kase);
}

function orchestrated(kase: SagaCase): DtFrame[] {
  const b = builder('saga orchestrator');
  b.push(
    <>A <span className="hl violet">saga</span> splits the order into <b>local transactions</b>, one per service, each committed immediately. No locks are held across services.</>,
  );
  b.set('coord', { tone: 'work', detail: 'running saga #42' });
  b.push(<>The customer places the order; the <b>orchestrator</b> will run the steps in order.</>, [
    { from: 'client', to: 'coord', label: 'place order', tone: 'work' },
  ]);

  b.phase('Step 1');
  b.set('orders', { status: 'working', tone: 'work' });
  b.push(<>Step 1: create the order.</>, [{ from: 'coord', to: 'orders', label: 'create order', tone: 'work' }]);
  b.set('orders', { status: 'committed', tone: 'ok', detail: 'order #42 PENDING' });
  b.cons('partial: 1 of 3 steps applied', 'hi');
  b.push(<>It <b>commits right away</b> in the Orders DB. The order exists, marked PENDING.</>, [
    { from: 'orders', to: 'coord', label: 'created ✓', tone: 'ok' },
  ]);

  b.phase('Step 2');
  b.set('payments', { status: 'working', tone: 'work' });
  b.push(<>Step 2: charge the card, with an <b>idempotency key</b> so a retried request can't charge twice.</>, [
    { from: 'coord', to: 'payments', label: 'charge $40 (key #42)', tone: 'work' },
  ]);
  b.set('payments', { status: 'committed', tone: 'ok', detail: '$40 charged' });
  b.cons('partial: 2 of 3 steps applied', 'hi');
  b.push(<>Committed in the Payments DB. Other services can already see the charge.</>, [
    { from: 'payments', to: 'coord', label: 'charged ✓', tone: 'ok' },
  ]);

  b.phase('Step 3');
  b.set('inventory', { status: 'working', tone: 'work' });
  b.push(<>Step 3: reserve the stock.</>, [{ from: 'coord', to: 'inventory', label: 'reserve SKU-7', tone: 'work' }]);

  if (kase === 'happy') {
    b.set('inventory', { status: 'committed', tone: 'ok', detail: 'SKU-7 stock: 3 → 2' });
    b.push(<>Reserved and committed.</>, [{ from: 'inventory', to: 'coord', label: 'reserved ✓', tone: 'ok' }]);
    b.phase('Finish');
    b.set('orders', { detail: 'order #42 CONFIRMED' });
    b.push(<>Last step: mark the order CONFIRMED.</>, [{ from: 'coord', to: 'orders', label: 'confirm', tone: 'ok' }]);
    b.set('coord', { tone: 'ok', detail: 'saga #42 complete' });
    b.set('client', { tone: 'ok', detail: 'order #42 placed' });
    b.cons('consistent ✓ (eventually)', 'ok');
    b.push(
      <>Done. No service ever waited on a lock held by another. The trade-off: between steps, the system was <b>partially applied</b>, and anyone looking saw that.</>,
      [{ from: 'coord', to: 'client', label: 'order placed ✓', tone: 'ok' }],
      { hold: 2 },
    );
    return b.frames;
  }

  b.set('inventory', { status: 'failed', tone: 'bad', detail: 'SKU-7 stock: 0' });
  b.cons('inconsistent: charged, can\'t ship', 'bad');
  b.push(
    <>Step 3 <span className="hl bad">fails</span>: out of stock. Steps 1 and 2 are already committed, and there is <b>no rollback</b>. Right now the customer is charged for an order that can't ship.</>,
    [{ from: 'inventory', to: 'coord', label: 'FAILED ✗', tone: 'bad' }],
  );
  b.phase('Compensate');
  b.set('coord', { tone: 'violet', detail: 'compensating saga #42' });
  b.set('payments', { status: 'compensating', tone: 'work' });
  b.push(<>So the orchestrator runs <span className="hl violet">compensating actions</span> in <b>reverse order</b>. First, undo step 2.</>, [
    { from: 'coord', to: 'payments', label: 'refund $40', tone: 'violet' },
  ]);
  b.set('payments', { status: '↺ compensated', tone: 'violet', detail: '$40 refunded' });
  b.cons('inconsistent: order still open', 'hi');
  b.push(<>A refund is a <b>new</b> transaction, not an undo. The charge still shows on the statement, followed by a refund.</>, [
    { from: 'payments', to: 'coord', label: 'refunded ✓', tone: 'violet' },
  ]);
  b.set('orders', { status: 'compensating', tone: 'work' });
  b.push(<>Then undo step 1.</>, [{ from: 'coord', to: 'orders', label: 'cancel order', tone: 'violet' }]);
  b.set('orders', { status: '↺ compensated', tone: 'violet', detail: 'order #42 CANCELLED' });
  b.set('coord', { detail: 'saga #42 compensated' });
  b.set('client', { tone: 'bad', detail: 'sorry, out of stock' });
  b.cons('consistent ✓ after compensation', 'ok');
  b.push(
    <><b>Eventually consistent</b>: every service agrees again, but there was a window where the data was "wrong", and every step and compensation must be safe to retry.</>,
    [{ from: 'coord', to: 'client', label: 'out of stock', tone: 'bad' }],
    { hold: 2 },
  );
  return b.frames;
}

function choreographed(kase: SagaCase): DtFrame[] {
  const b = builder('', true);
  b.push(
    <><span className="hl violet">Choreography</span>: no one is in charge. Each service does its local step and <b>publishes an event</b>; whoever cares reacts.</>,
  );
  b.phase('Step 1');
  b.set('orders', { status: 'working', tone: 'work' });
  b.push(<>The customer places the order with the Orders service.</>, [{ from: 'client', to: 'orders', label: 'place order', tone: 'work' }]);
  b.set('orders', { status: 'committed', tone: 'ok', detail: 'order #42 PENDING' });
  b.set('payments', { status: 'working', tone: 'work' });
  b.cons('partial: 1 of 3 steps applied', 'hi');
  b.push(<>Orders commits and publishes <span className="hl info">OrderCreated</span>. Payments is subscribed, so it reacts.</>, [
    { from: 'orders', to: 'payments', label: 'OrderCreated', tone: 'work', viaBus: true },
  ]);
  b.phase('Step 2');
  b.set('payments', { status: 'committed', tone: 'ok', detail: '$40 charged' });
  b.set('inventory', { status: 'working', tone: 'work' });
  b.cons('partial: 2 of 3 steps applied', 'hi');
  b.push(<>Payments charges the card and publishes <span className="hl info">PaymentCharged</span>. Inventory reacts to that.</>, [
    { from: 'payments', to: 'inventory', label: 'PaymentCharged', tone: 'work', viaBus: true },
  ]);
  b.phase('Step 3');
  if (kase === 'happy') {
    b.set('inventory', { status: 'committed', tone: 'ok', detail: 'SKU-7 stock: 3 → 2' });
    b.set('orders', { detail: 'order #42 CONFIRMED' });
    b.push(<>Inventory reserves the stock and publishes <span className="hl info">StockReserved</span>; Orders marks the order CONFIRMED.</>, [
      { from: 'inventory', to: 'orders', label: 'StockReserved', tone: 'ok', viaBus: true },
    ]);
    b.set('client', { tone: 'ok', detail: 'order #42 placed' });
    b.cons('consistent ✓ (eventually)', 'ok');
    b.push(
      <>Done, and nobody coordinated. Services stay loosely coupled, but the overall flow only exists as "who listens to what", which is <b>harder to see and debug</b> than one orchestrator.</>,
      [{ from: 'orders', to: 'client', label: 'order placed ✓', tone: 'ok' }],
      { hold: 2 },
    );
    return b.frames;
  }
  b.set('inventory', { status: 'failed', tone: 'bad', detail: 'SKU-7 stock: 0' });
  b.set('payments', { status: 'compensating', tone: 'work' });
  b.set('orders', { status: 'compensating', tone: 'work' });
  b.cons('inconsistent: charged, can\'t ship', 'bad');
  b.push(
    <>Out of stock. Inventory publishes <span className="hl bad">StockReservationFailed</span>. Both Payments and Orders subscribe to it and start compensating.</>,
    [
      { from: 'inventory', to: 'payments', label: 'StockFailed', tone: 'bad', viaBus: true },
      { from: 'inventory', to: 'orders', label: 'StockFailed', tone: 'bad', viaBus: true },
    ],
  );
  b.phase('Compensate');
  b.set('payments', { status: '↺ compensated', tone: 'violet', detail: '$40 refunded' });
  b.set('orders', { status: '↺ compensated', tone: 'violet', detail: 'order #42 CANCELLED' });
  b.set('client', { tone: 'bad', detail: 'sorry, out of stock' });
  b.cons('consistent ✓ after compensation', 'ok');
  b.push(
    <>Each service compensates its own step: refund, cancel. Eventually consistent again, with no central coordinator to fail, but also none that knows the whole story.</>,
    [{ from: 'orders', to: 'client', label: 'out of stock', tone: 'bad' }],
    { hold: 2 },
  );
  return b.frames;
}
