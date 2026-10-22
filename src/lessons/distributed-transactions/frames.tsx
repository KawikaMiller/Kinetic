// Captions only: each frame's sentence is chosen by the event that made the frame and quotes numbers read from the run.
import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import type { SagaMsg, SagaOptions } from './saga';
import { sagaSteps } from './sagaSteps';
import { PARTICIPANTS, type TwoPcMsg, type TwoPcOptions } from './twoPc';
import { stallText, twoPcSteps } from './twoPcSteps';
import type { NodeId, Step } from './steps';

export type DtFrame = Step & Frame;

export const NODE_TITLE: Record<NodeId, string> = {
  client: 'Customer',
  coord: 'Coordinator',
  client2: 'Customer #2',
  orders: 'Orders',
  payments: 'Payments',
  inventory: 'Inventory',
};

const upper = (s: string) => s.toUpperCase();
const count = (n: number) => `${n} of ${PARTICIPANTS.length}`;

function twoPcSay(step: Step, o: TwoPcOptions): ReactNode {
  const { row, facts } = step;
  if (!row) {
    return (
      <>
        One order touches <b>three services</b>, each with its own database: create the order, charge $40, reserve 1× SKU-7. It has to be <b>all or nothing</b>.
      </>
    );
  }
  const m = row.payload as TwoPcMsg | undefined;
  const at = (row.to ?? row.node ?? '') as NodeId;
  const who = NODE_TITLE[at];
  if (row.kind === 'crash') {
    const decision = facts.decision as string | null;
    return decision ? (
      <>
        The {who.toLowerCase()} <span className="hl bad">crashes</span> after logging <b>{upper(decision)}</b>, before every participant has been told. The decision is on its disk; the messages not yet sent are gone.
      </>
    ) : (
      <>
        The {who.toLowerCase()} <span className="hl bad">crashes</span> after {count(Number(facts.yes))} votes, before deciding. The participants that voted YES are stuck: they can't abort alone (the others might have committed) and they can't commit (someone might have voted NO). <b>They keep holding their locks.</b>
      </>
    );
  }
  if (row.kind === 'restart') {
    const decision = facts.decision as string | null;
    return decision ? (
      <>
        The coordinator restarts and reads its log: <b>{upper(decision)}</b> was decided. It sends it again to everyone, so the participants can finish.
      </>
    ) : (
      <>
        The coordinator restarts and reads its log. No decision was ever written, so nobody can have committed: the safe choice is <span className="hl bad">ABORT</span>.
      </>
    );
  }
  if (row.kind === 'timer') {
    if (row.detail === 'vote-timeout') return <>The votes did not all arrive in time, so the coordinator <span className="hl bad">aborts</span>.</>;
    if (row.detail === 'retry') return <>The coordinator resends the decision to every participant that has not acked.</>;
    return <>The coordinator sends the decision to {NODE_TITLE[row.detail?.slice('send-'.length) as NodeId]}, one participant at a time.</>;
  }
  switch (m?.type) {
    case 'place':
      return <>The customer places the order. The Order service acts as the <span className="hl">coordinator</span>: it logs the start and asks every participant "can you commit T1?" Nobody commits yet.</>;
    case 'prepare':
      return step.nodes[at as 'orders'].tone === 'bad' ? (
        <>{who} is out of stock: it votes <span className="hl bad">NO</span> and aborts its own part at once.</>
      ) : (
        <>{who} does its work tentatively, writes it to its log, <b>locks</b> the rows and votes <span className="hl ok">YES</span>. From now on it can't back out on its own.</>
      );
    case 'vote': {
      const deciding = String(step.nodes.coord.detail).startsWith('decision');
      const vote = m.yes ? <span className="hl ok">YES</span> : <span className="hl bad">NO</span>;
      if (!deciding) return <>{NODE_TITLE[m.from]} voted {vote}: the coordinator has {count(Number(facts.yes))} YES so far.</>;
      return facts.decision === 'commit' ? (
        <>
          {NODE_TITLE[m.from]} voted {vote}. {o.variant === 'real' ? 'All YES' : `${count(Number(facts.yes))} YES, without waiting for the rest`}: the coordinator writes <span className="hl ok">COMMIT</span> to its own log. That single write is the moment T1 is decided.
        </>
      ) : (
        <>
          {NODE_TITLE[m.from]} voted {vote}. One NO is enough: the coordinator writes <span className="hl bad">ABORT</span> to its log.
        </>
      );
    }
    case 'commit':
      return <>{who} commits locally, <b>releases its locks</b> and acks.</>;
    case 'abort':
      return step.nodes[at as 'orders'].status === 'votes NO' ? <>{who} already aborted when it voted NO; it acks.</> : <>{who} rolls back its tentative work, releases its locks and acks.</>;
    case 'ack':
      return Number(facts.acks) === PARTICIPANTS.length ? <>The last ack is in: T1 is finished everywhere.</> : <>An ack from {NODE_TITLE[m.from]}: {count(Number(facts.acks))} acks in.</>;
    case 'result':
      return m.placed ? <>The customer is told the order is placed.</> : <>The customer is told the order <span className="hl bad">failed</span>.</>;
    case 'reserve':
      return step.stallMs ? (
        <>
          Customer #2 wants SKU-7. That row is locked by a transaction nobody can finish, so they <span className="hl bad">wait too</span>: blocked for {stallText(step.stallMs)} so far.
        </>
      ) : (
        <>Customer #2 asks for SKU-7 and gets it: nothing holds the row.</>
      );
    case 'granted':
      return <>The lock is released and Customer #2 can go ahead, after the wait the stall pill showed. <b>Correct, but everyone waited</b> on one machine.</>;
    default:
      return <>{who} handles a message.</>;
  }
}

function sagaSay(step: Step, o: SagaOptions): ReactNode {
  const { row } = step;
  if (!row) {
    return o.style === 'orch' ? (
      <>A <span className="hl violet">saga</span> splits the order into <b>local transactions</b>, one per service, each committed at once. The orchestrator will run the steps in order.</>
    ) : (
      <><span className="hl violet">Choreography</span>: no one is in charge. Each service does its local step and <b>publishes an event</b>; whoever cares reacts.</>
    );
  }
  if (row.kind === 'crash') return <>{NODE_TITLE[row.node as NodeId]} <span className="hl bad">crashes</span>; its committed work stays on its disk.</>;
  if (row.kind === 'restart') return <>{NODE_TITLE[row.node as NodeId]} restarts and picks up from its log.</>;
  if (row.kind === 'timer') return <>The orchestrator hears nothing back in time and sends the command again: the service must cope with a repeat.</>;
  const m = row.payload as SagaMsg;
  const at = row.to as NodeId;
  const verdict = <b>{step.consistency.label}</b>;
  switch (m.type) {
    case 'place':
      return o.style === 'orch' ? <>The customer places the order; the orchestrator starts step 1.</> : <>The customer places the order with the Orders service.</>;
    case 'create order':
      return <>Step 1: Orders commits at once in its own database. The order exists, marked PENDING. Now {verdict}.</>;
    case 'OrderCreated':
      return <>Orders committed and published <span className="hl info">OrderCreated</span>; Payments reacts to it. Now {verdict}.</>;
    case 'charge':
      return <>Step 2: Payments charges the card{o.variant === 'idempotent' ? ', with an idempotency key so a repeated request cannot charge twice' : ' (this variant has no key)'}. Now {verdict}.</>;
    case 'PaymentCharged':
      return <>Payments charged the card and published <span className="hl info">PaymentCharged</span>; Inventory reacts to it. Now {verdict}.</>;
    case 'reserve':
      return step.nodes.inventory.tone === 'bad' ? (
        <>Step 3 <span className="hl bad">fails</span>: out of stock. Steps 1 and 2 are already committed and there is no rollback. Now {verdict}.</>
      ) : (
        <>Step 3: Inventory reserves the stock and commits. Now {verdict}.</>
      );
    case 'StockReserved':
      return <>Inventory reserved the stock and published <span className="hl info">StockReserved</span>; Orders confirms. Now {verdict}.</>;
    case 'StockFailed':
      return <>Out of stock. Inventory publishes <span className="hl bad">StockFailed</span>; Payments and Orders both react by compensating. Now {verdict}.</>;
    case 'out of stock':
      return <>The orchestrator learns step 3 failed and runs the <span className="hl violet">compensations</span> in <b>reverse order</b>. Now {verdict}.</>;
    case 'reserved':
      return <>Reserved. The orchestrator moves to the last step. Now {verdict}.</>;
    case 'refund':
      return <>Undo step 2: refund the charge. A refund is a <b>new</b> transaction, not an undo: the charge still shows on the statement. Now {verdict}.</>;
    case 'cancel':
      return <>Undo step 1: cancel the order. Now {verdict}.</>;
    case 'confirm':
      return <>Last step: mark the order CONFIRMED. Now {verdict}.</>;
    case 'confirmed':
    case 'cancelled':
    case 'refunded':
    case 'created':
    case 'charged':
      return <>{NODE_TITLE[at]} hears back: {m.type}. Now {verdict}.</>;
    case 'result':
      return m.placed ? (
        <>Done. No service waited on a lock held by another; between the steps the system was partially applied, for {stallText(Number(step.facts.inconsistentMs))} of simulated time, and anyone looking saw that.</>
      ) : (
        <><b>Eventually consistent</b>: every service agrees again, but the data was "wrong" for {stallText(Number(step.facts.inconsistentMs))} of simulated time.</>
      );
    default:
      return <>{NODE_TITLE[at]} handles a message. Now {verdict}.</>;
  }
}

export const twoPcFrames = (o: TwoPcOptions): DtFrame[] => twoPcSteps(o).map((s) => ({ ...s, say: twoPcSay(s, o), hold: s.violation ? 2 : undefined }));
export const sagaFrames = (o: SagaOptions): DtFrame[] => sagaSteps(o).map((s) => ({ ...s, say: sagaSay(s, o), hold: s.violation ? 2 : undefined }));
