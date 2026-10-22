// The 2PC scenes: a scene is one run of the protocol in twoPc.ts, turned into frames. Nothing here is scripted:
// every status, lock, stall and verdict is read from the state of the run.
import { payloadLabel } from '../../core/distSim';
import { humanDuration } from '../../core/format';
import {
  atomicity, CHECK_HORIZON_MS, CLIENT2_AFTER_MS, DECISION_STAGGER_MS, PARTICIPANTS, SCENE_DOWN_MS, SCENE_HORIZON_MS, twoPcCluster,
  type NodeId, type Participant, type TwoPcMsg, type TwoPcOptions, type TwoPcVariant,
} from './twoPc';
import { walk, type Consistency, type NodeView, type Step, type StepMsg, type Tone } from './steps';

export type TwoPcCase = 'happy' | 'no' | 'crash-before' | 'crash-after';
export const TWO_PC_CASES: readonly TwoPcCase[] = ['happy', 'no', 'crash-before', 'crash-after'];

/** A lock is only reported as a stall once it has been held this long. */
const STALL_SHOW_MS = 1_000;
const CRASH_BEFORE_MS = 0.001;
/** Lands after the first decision message has gone out and before the second is sent. */
const CRASH_AFTER_MS = DECISION_STAGGER_MS * 1.5;

type Snap = Parameters<typeof atomicity>[0];

/** The run behind a scene: crash cases find the crash time in the same seed's crash-free run. */
export function sceneOptions(kase: TwoPcCase, seed: number, variant: TwoPcVariant, faults: boolean): TwoPcOptions {
  const o: TwoPcOptions = { seed, variant, outOfStock: kase === 'no', faults };
  if (kase !== 'crash-before' && kase !== 'crash-after') return o;
  const clean = twoPcCluster(o);
  clean.run({ until: CHECK_HORIZON_MS });
  // The vote that makes the coordinator decide: the last one for the real rule, the second YES for early-commit.
  const votes = clean.trace.filter((r) => r.kind === 'deliver' && r.to === 'coord' && r.payload?.type === 'vote' && !r.dup);
  const decidedAt = (variant === 'real' ? votes.at(-1) : (votes[1] ?? votes.at(-1)))?.t ?? 0;
  const at = kase === 'crash-before' ? decidedAt - CRASH_BEFORE_MS : decidedAt + CRASH_AFTER_MS;
  return { ...o, crash: { node: 'coord', at, restartAt: at + SCENE_DOWN_MS }, client2At: at + CLIENT2_AFTER_MS };
}

const tone = (m: TwoPcMsg): Tone => {
  switch (m.type) {
    case 'prepare':
    case 'place':
    case 'reserve':
      return 'work';
    case 'vote':
      return m.yes ? 'ok' : 'bad';
    case 'commit':
    case 'granted':
      return 'ok';
    case 'abort':
      return 'bad';
    case 'ack':
      return 'dim';
    case 'result':
      return m.placed ? 'ok' : 'bad';
  }
};

const label = (m: TwoPcMsg): string => {
  if (m.type === 'vote') return m.yes ? 'YES' : 'NO';
  if (m.type === 'result') return m.placed ? 'order placed ✓' : 'failed';
  const text = payloadLabel(m);
  return m.type === 'prepare' || m.type === 'commit' || m.type === 'abort' ? text.toUpperCase() : text;
};

const part = (snap: Snap, id: Participant) => {
  const s = snap.nodes[id].state;
  if (s?.role !== 'participant') throw new Error(`${id} has no participant state`);
  return s;
};
const coordState = (snap: Snap) => {
  const s = snap.nodes.coord.state;
  if (s?.role !== 'coord') throw new Error('coord has no coordinator state');
  return s;
};

const IDLE_DETAIL: Record<Participant, (stock: number) => string> = {
  orders: () => 'no order yet',
  payments: () => 'card ••4242',
  inventory: (stock) => `SKU-7 stock: ${stock}`,
};
const PREPARED_DETAIL: Record<Participant, string> = {
  orders: 'order #42 (not visible)',
  payments: '$40 held on card',
  inventory: '1× SKU-7 reserved',
};
const COMMITTED_DETAIL: Record<Participant, (stock: number) => string> = {
  orders: () => 'order #42 CONFIRMED',
  payments: () => '$40 charged',
  inventory: (stock) => `SKU-7 stock: ${stock + 1} → ${stock}`,
};
const ABORTED_DETAIL: Record<Participant, string> = { orders: 'rolled back', payments: 'hold released', inventory: 'reservation undone' };

function participantView(snap: Snap, id: Participant): NodeView {
  const s = part(snap, id);
  const coordUp = snap.nodes.coord.up;
  if (!snap.nodes[id].up) return { status: 'crashed', tone: 'bad', crashed: true, detail: 'the log survives', lock: s.phase === 'prepared' };
  switch (s.phase) {
    case 'idle':
      return { status: 'idle', tone: 'idle', detail: IDLE_DETAIL[id](s.stock) };
    case 'prepared':
      return { status: coordUp ? 'prepared' : 'prepared · blocked', tone: 'hi', detail: coordUp ? PREPARED_DETAIL[id] : 'waiting for a decision…', lock: true };
    case 'committed':
      return { status: 'committed', tone: 'ok', detail: COMMITTED_DETAIL[id](s.stock) };
    case 'aborted':
      return s.votedNo
        ? { status: 'votes NO', tone: 'bad', detail: IDLE_DETAIL[id](s.stock) }
        : { status: 'aborted', tone: 'dim', detail: ABORTED_DETAIL[id] };
  }
}

function coordView(snap: Snap): NodeView {
  const s = coordState(snap);
  const name = 'coordinator';
  if (!snap.nodes.coord.up) return { status: name, tone: 'bad', crashed: true, detail: s.decision ? `after deciding ${s.decision.toUpperCase()}` : 'before deciding' };
  if (s.decision) {
    const done = s.acks === PARTICIPANTS.length;
    const word = s.decision === 'commit' ? 'COMMIT' : 'ABORT';
    return { status: name, tone: s.decision === 'commit' ? 'ok' : 'bad', detail: done ? `T1 ${s.decision === 'commit' ? 'committed' : 'aborted'}` : `decision: ${word} (logged)` };
  }
  if (s.began) return { status: name, tone: 'work', detail: `collecting votes: ${s.yes + s.no} of ${PARTICIPANTS.length}` };
  return { status: name, tone: 'idle', detail: 'waiting' };
}

function clientView(snap: Snap): NodeView {
  const s = snap.nodes.client.state;
  if (s?.role === 'client' && s.placed !== null) return s.placed ? { status: 'customer', tone: 'ok', detail: 'order #42 placed' } : { status: 'customer', tone: 'bad', detail: 'order failed, try again' };
  return { status: 'customer', tone: 'idle', detail: 'wants order #42' };
}

function client2View(snap: Snap, asked: boolean): NodeView {
  const s = snap.nodes.client2.state;
  const granted = s?.role === 'client2' && s.granted;
  if (granted) return { status: 'another customer', tone: 'ok', detail: 'got the lock, proceeds' };
  return { status: 'another customer', tone: asked ? 'bad' : 'idle', detail: asked ? 'blocked on SKU-7 lock' : 'wants SKU-7 too', hidden: !asked };
}

export function consistencyOf(snap: Snap): Consistency {
  const phases = PARTICIPANTS.map((p) => part(snap, p).phase);
  const committed = phases.filter((p) => p === 'committed').length;
  const aborted = phases.filter((p) => p === 'aborted').length;
  const prepared = phases.filter((p) => p === 'prepared').length;
  if (committed && aborted) return { label: 'ATOMICITY BROKEN', tone: 'bad' };
  if (committed === PARTICIPANTS.length) return { label: 'consistent ✓ all committed', tone: 'ok' };
  if (aborted === PARTICIPANTS.length) return { label: 'consistent ✓ nothing happened', tone: 'ok' };
  if (committed) return { label: 'in doubt: committing, not finished', tone: 'hi' };
  if (prepared) return { label: 'in doubt: nobody has committed', tone: 'hi' };
  return { label: 'nothing yet', tone: 'dim' };
}

function phaseOf(snap: Snap, restarted: boolean): string {
  const s = coordState(snap);
  if (!snap.nodes.coord.up) return 'Coordinator down';
  if (!s.began) return 'Start';
  if (!s.decision) return 'Phase 1 · Prepare';
  if (s.acks === PARTICIPANTS.length) return 'Done';
  const word = s.decision === 'commit' ? 'Commit' : 'Abort';
  return restarted ? `Recovery · ${word}` : `Phase 2 · ${word}`;
}

const coordFacts = (snap: Snap) => {
  const { yes, no, acks, decision } = coordState(snap);
  return { yes, no, acks, decision };
};

/** The scene's frames: the run of `o`, one frame per visible event. */
export function twoPcSteps(o: TwoPcOptions): Step[] {
  const cluster = twoPcCluster(o);
  const preparedSince = new Map<Participant, number>();
  let restarted = false;
  /** What the coordinator's log held when it crashed: the decision it will find again on restart, or none. */
  let loggedAtCrash: string | null = null;
  const steps = walk(cluster, SCENE_HORIZON_MS, ({ snap, rows, row, sent }) => {
    const now = row?.t ?? 0;
    if (row?.kind === 'restart' && row.node === 'coord') restarted = true;
    if (row?.kind === 'crash' && row.node === 'coord') loggedAtCrash = coordState(snap).decision;
    for (const p of PARTICIPANTS) {
      if (part(snap, p).phase === 'prepared') {
        if (!preparedSince.has(p)) preparedSince.set(p, now);
      } else preparedSince.delete(p);
    }
    const asked = o.client2At !== undefined && now >= o.client2At;
    const nodes: Record<NodeId, NodeView> = {
      client: clientView(snap),
      coord: coordView(snap),
      client2: client2View(snap, asked),
      orders: participantView(snap, 'orders'),
      payments: participantView(snap, 'payments'),
      inventory: participantView(snap, 'inventory'),
    };
    const msgs: StepMsg[] = rows
      .filter((r) => r.kind === 'send' && r.from && r.to)
      .map((r) => ({ from: r.from as NodeId, to: r.to as NodeId, label: label(r.payload as TwoPcMsg), tone: tone(r.payload as TwoPcMsg) }));
    const longest = Math.max(0, ...[...preparedSince.values()].map((since) => now - since));
    return {
      time: now,
      row,
      nodes,
      msgs,
      sent,
      locks: PARTICIPANTS.filter((p) => nodes[p].lock).length,
      phase: phaseOf(snap, restarted),
      consistency: consistencyOf(snap),
      stallMs: longest >= STALL_SHOW_MS ? longest : 0,
      violation: atomicity(snap),
      facts: { ...coordFacts(snap), participants: PARTICIPANTS.length, loggedAtCrash },
    };
  });
  return foldRetries(steps);
}

/** The coordinator resends an unacked decision every second for the whole horizon: keep the first of a run of identical retry frames. */
function foldRetries(steps: Step[]): Step[] {
  const isRetry = (s: Step) => s.row?.kind === 'timer' && s.row.detail === 'retry';
  return steps.filter((s, i) => {
    const prev = steps[i - 1];
    return !(prev && isRetry(s) && isRetry(prev) && prev.violation === s.violation && prev.stallMs === s.stallMs && JSON.stringify(prev.nodes) === JSON.stringify(s.nodes));
  });
}

/** "30 s", "2 min": a stall as the stat prints it. */
export const stallText = (ms: number) => humanDuration(ms / 1000);
