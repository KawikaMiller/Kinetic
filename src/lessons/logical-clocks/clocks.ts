/**
 * logical-clocks, scenes 1 and 2: Lamport and vector timestamps on an execution, and the ground truth they are measured against.
 *
 * An execution is events on process lanes in a global order (a slot, or a trace position), with messages from a send event to a
 * later receive event on another lane. The ground truth, happened-before, is the transitive closure of two kinds of edge:
 * consecutive events on one process, and a message from its send to its receive. It is computed from the graph and never from a clock.
 *
 * Rules (Lamport 1978 for scalar clocks; vector clocks are from independent work in the late 1980s by Fidge and Mattern; from memory):
 * - Lamport: a local event or a send does L <- L + 1; a receive does L <- max(L, every message stamp) + 1.
 * - Vector: a local event or a send does V[i] <- V[i] + 1; a receive takes the componentwise max of V and every message's vector, then V[i] <- V[i] + 1.
 */
import type { LaneModel } from '../../core/laneEditor';

export interface ExecEvent {
  id: string;
  lane: number;
  /** Position in the global order; events are stamped in increasing order. */
  order: number;
}

export interface Execution {
  lanes: number;
  /** Sorted by `order`. */
  events: ExecEvent[];
  /** A message from event id to event id; the send comes earlier in `order`. */
  messages: { from: string; to: string }[];
}

/** The events and messages of an editor model, in slot order (ties by lane). */
export function executionOf(model: LaneModel<unknown>): Execution {
  const events = [...model.items]
    .sort((a, b) => a.start - b.start || a.lane - b.lane)
    .map((it, order): ExecEvent => ({ id: it.id, lane: it.lane, order }));
  return { lanes: model.limits.lanes, events, messages: model.links.map((l) => ({ from: l.from, to: l.to })) };
}

export type EventKind = 'local' | 'send' | 'receive' | 'both';

export interface Stamped extends ExecEvent {
  kind: EventKind;
  lamport: number;
  vector: number[];
  /** What the clock before this event read on its own process, and the stamps of the messages that arrived. */
  prevLamport: number;
  prevVector: number[];
  incoming: { from: string; lamport: number; vector: number[] }[];
}

export interface StampOptions {
  /** A deliberately broken vector clock for tests: a receive forgets the componentwise max. */
  forgetMax?: boolean;
}

export function stampExecution(exec: Execution, o: StampOptions = {}): Stamped[] {
  const byId = new Map<string, Stamped>();
  const lastOnLane: (Stamped | undefined)[] = Array.from({ length: exec.lanes }, () => undefined);
  const out: Stamped[] = [];
  for (const e of exec.events) {
    const incoming = exec.messages.filter((m) => m.to === e.id).map((m) => byId.get(m.from)).filter((s): s is Stamped => s !== undefined);
    const prev = lastOnLane[e.lane];
    const prevLamport = prev?.lamport ?? 0;
    const prevVector = prev?.vector ?? new Array<number>(exec.lanes).fill(0);
    const sends = exec.messages.some((m) => m.from === e.id);
    const vector = [...prevVector];
    if (!o.forgetMax) for (const m of incoming) m.vector.forEach((v, i) => (vector[i] = Math.max(vector[i], v)));
    vector[e.lane] += 1;
    const stamped: Stamped = {
      ...e,
      kind: incoming.length > 0 ? (sends ? 'both' : 'receive') : sends ? 'send' : 'local',
      lamport: Math.max(prevLamport, ...incoming.map((m) => m.lamport)) + 1,
      vector,
      prevLamport,
      prevVector,
      incoming: incoming.map((m) => ({ from: m.id, lamport: m.lamport, vector: m.vector })),
    };
    byId.set(e.id, stamped);
    lastOnLane[e.lane] = stamped;
    out.push(stamped);
  }
  return out;
}

/** Happened-before as a matrix over the events (by index in `exec.events`): `hb[i][j]` is true when event i happened before event j. */
export function happenedBefore(exec: Execution): boolean[][] {
  const n = exec.events.length;
  const index = new Map(exec.events.map((e, i) => [e.id, i]));
  const hb = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const lastOnLane: number[] = new Array<number>(exec.lanes).fill(-1);
  exec.events.forEach((e, i) => {
    if (lastOnLane[e.lane] >= 0) hb[lastOnLane[e.lane]][i] = true;
    lastOnLane[e.lane] = i;
  });
  for (const m of exec.messages) hb[index.get(m.from)!][index.get(m.to)!] = true;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (hb[i][k]) for (let j = 0; j < n; j++) if (hb[k][j]) hb[i][j] = true;
  return hb;
}

export type Relation = 'before' | 'after' | 'concurrent' | 'same';

/** The ground truth about two events. */
export function truthBetween(hb: boolean[][], i: number, j: number): Relation {
  if (i === j) return 'same';
  return hb[i][j] ? 'before' : hb[j][i] ? 'after' : 'concurrent';
}

/** What the vector stamps say: V(a) < V(b) is before, V(b) < V(a) is after, incomparable is concurrent. */
export function vectorBetween(a: readonly number[], b: readonly number[]): Relation {
  const le = (x: readonly number[], y: readonly number[]) => x.every((v, i) => v <= y[i]);
  const aLeB = le(a, b);
  const bLeA = le(b, a);
  if (aLeB && bLeA) return 'same';
  return aLeB ? 'before' : bLeA ? 'after' : 'concurrent';
}

/** What the Lamport stamps order (ties broken by lane, the usual way to make a total order); it cannot say "concurrent". */
export function lamportBetween(a: Pick<Stamped, 'lamport' | 'lane'>, b: Pick<Stamped, 'lamport' | 'lane'>): 'before' | 'after' {
  if (a.lamport !== b.lamport) return a.lamport < b.lamport ? 'before' : 'after';
  return a.lane < b.lane ? 'before' : 'after';
}

export interface PairIndex {
  a: number;
  b: number;
}

/** Pairs (a, b) with L(a) < L(b) strictly although a did not happen before b: the converse of the clock condition fails. */
export function misleadingPairs(stamps: readonly Stamped[], hb: boolean[][]): PairIndex[] {
  const out: PairIndex[] = [];
  for (let a = 0; a < stamps.length; a++) for (let b = 0; b < stamps.length; b++) if (a !== b && stamps[a].lamport < stamps[b].lamport && !hb[a][b]) out.push({ a, b });
  return out;
}

export const vectorText = (v: readonly number[]): string => `[${v.join(',')}]`;

/** Which components of its vector an event changed: the ones it raised by a message's max, and its own. */
export const bumped = (s: Pick<Stamped, 'vector' | 'prevVector'>): boolean[] => s.vector.map((v, i) => v !== s.prevVector[i]);

/** The rule in force for an event, with its numbers: what the learner sees highlighted. */
export function ruleText(s: Stamped, laneName: string): { kind: string; lamport: string; vector: string } {
  const kind = { local: 'a local event', send: 'a send', receive: 'a receive', both: 'a receive that is also a send' }[s.kind];
  if (s.incoming.length === 0) {
    return {
      kind,
      lamport: `L ← L + 1 = ${s.prevLamport} + 1 = ${s.lamport}`,
      vector: `V[${laneName}] ← V[${laneName}] + 1: ${vectorText(s.prevVector)} becomes ${vectorText(s.vector)}`,
    };
  }
  const stamps = s.incoming.map((m) => m.lamport);
  const maxed = s.prevVector.map((v, i) => Math.max(v, ...s.incoming.map((m) => m.vector[i])));
  return {
    kind,
    lamport: `L ← max(L, message) + 1 = max(${[s.prevLamport, ...stamps].join(', ')}) + 1 = ${s.lamport}`,
    vector: `V ← max(V, message) = max(${[s.prevVector, ...s.incoming.map((m) => m.vector)].map(vectorText).join(', ')}) = ${vectorText(maxed)}, then V[${laneName}] ← V[${laneName}] + 1 = ${vectorText(s.vector)}`,
  };
}
