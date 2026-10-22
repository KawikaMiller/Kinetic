/**
 * hybrid-logical-clocks: the update rules of a hybrid logical clock, the Lamport clock beside it, and the execution the
 * learner edits in scene 1. Timestamps are `(l, c)`: `l` a wall-clock reading, `c` a small counter, compared lexicographically.
 * The algorithm is from the 2014 "logical physical clocks" paper (from memory: the chip says so); the rules below are the ones
 * the lesson prints.
 */

export interface Hlc {
  l: number;
  c: number;
}

/** Lexicographic: wall reading first, then counter. Negative when `a` is the smaller. */
export const compareHlc = (a: Hlc, b: Hlc): number => a.l - b.l || a.c - b.c;
export const hlcText = (h: Hlc): string => `(${h.l}, ${h.c})`;
export const ZERO: Hlc = { l: 0, c: 0 };

export type HlcRule = 'clock advanced' | 'same wall reading' | 'message wall' | 'equal walls';

export const RULE_TEXT: Record<HlcRule, string> = {
  'clock advanced': 'the physical clock is ahead, so l takes it and c resets to 0',
  'same wall reading': 'the wall reading did not move, so c + 1',
  'message wall': 'the message carries the largest wall reading, so c = the message counter + 1',
  'equal walls': 'this node and the message share the largest wall reading, so c = the larger counter + 1',
};

export interface Stepped {
  h: Hlc;
  rule: HlcRule;
}

/** A local or send event: l' = max(l, pt); c' = c + 1 when l did not change, else 0. */
export function hlcSend(h: Hlc, pt: number): Stepped {
  const l = Math.max(h.l, pt);
  return l === h.l ? { h: { l, c: h.c + 1 }, rule: 'same wall reading' } : { h: { l, c: 0 }, rule: 'clock advanced' };
}

/** Receiving the stamp `m`: l' = max(l, l_m, pt), and c' by which of the three equals l'. */
export function hlcReceive(h: Hlc, m: Hlc, pt: number): Stepped {
  const l = Math.max(h.l, m.l, pt);
  if (l === h.l && l === m.l) return { h: { l, c: Math.max(h.c, m.c) + 1 }, rule: 'equal walls' };
  if (l === h.l) return { h: { l, c: h.c + 1 }, rule: 'same wall reading' };
  if (l === m.l) return { h: { l, c: m.c + 1 }, rule: 'message wall' };
  return { h: { l, c: 0 }, rule: 'clock advanced' };
}

/** The Lamport rules, for comparison: a send or local event is L + 1, a receive is max(L, L_m) + 1. */
export const lamportSend = (L: number): number => L + 1;
export const lamportReceive = (L: number, m: number): number => Math.max(L, m) + 1;

// ---------- the execution of scene 1 ----------

export const NODES = ['A', 'B', 'C'] as const;
export type NodeIndex = 0 | 1 | 2;
export const OFFSET_MS = { min: -50, max: 50 } as const;
export const DELAY_MS = { min: 1, max: 10 } as const;
export const TIME_MS = { min: 50, max: 300 } as const;
export const MAX_MESSAGES = 8;
export const MAX_EVENTS = 14;
export const DEFAULT_OFFSETS: readonly [number, number, number] = [0, -20, 15];

export interface Msg {
  from: number;
  to: number;
  /** True time of the send, ms. */
  sendAt: number;
  delay: number;
}
export interface Local {
  node: number;
  at: number;
}
export interface Execution {
  offsets: readonly [number, number, number];
  messages: readonly Msg[];
  locals: readonly Local[];
}

/** The chain of the spec's vector 1: A sends at 100, B receives at 105, B has two local events, B sends at 130, C receives at 133 and sends at 140, A receives at 144. */
export const CHAIN: Execution = {
  offsets: DEFAULT_OFFSETS,
  messages: [
    { from: 0, to: 1, sendAt: 100, delay: 5 },
    { from: 1, to: 2, sendAt: 130, delay: 3 },
    { from: 2, to: 0, sendAt: 140, delay: 4 },
  ],
  locals: [{ node: 1, at: 108 }, { node: 1, at: 125 }],
};

export const eventCount = (e: Execution): number => e.messages.length * 2 + e.locals.length;

export type Edit = { ok: true; exec: Execution } | { ok: false; reason: string };

export function addMessage(e: Execution, m: Msg): Edit {
  if (m.from === m.to) return { ok: false, reason: 'A message goes between two different nodes.' };
  if (m.delay < DELAY_MS.min) return { ok: false, reason: 'A message cannot arrive before it is sent: the delay is at least 1 ms.' };
  if (m.delay > DELAY_MS.max) return { ok: false, reason: `A delay is at most ${DELAY_MS.max} ms in this model.` };
  if (m.sendAt < TIME_MS.min || m.sendAt > TIME_MS.max) return { ok: false, reason: `A send time is between ${TIME_MS.min} and ${TIME_MS.max} ms.` };
  if (e.messages.length >= MAX_MESSAGES) return { ok: false, reason: `At most ${MAX_MESSAGES} messages: remove one first.` };
  if (eventCount(e) + 2 > MAX_EVENTS) return { ok: false, reason: `At most ${MAX_EVENTS} events: remove one first.` };
  return { ok: true, exec: { ...e, messages: [...e.messages, m] } };
}

export function addLocal(e: Execution, l: Local): Edit {
  if (l.at < TIME_MS.min || l.at > TIME_MS.max) return { ok: false, reason: `An event time is between ${TIME_MS.min} and ${TIME_MS.max} ms.` };
  if (eventCount(e) + 1 > MAX_EVENTS) return { ok: false, reason: `At most ${MAX_EVENTS} events: remove one first.` };
  return { ok: true, exec: { ...e, locals: [...e.locals, l] } };
}

export type EventKind = 'send' | 'receive' | 'local';
export interface Event {
  /** Position in true-time order. */
  id: number;
  node: number;
  /** True time, ms. */
  t: number;
  kind: EventKind;
  /** The message this event sends or receives (index into `messages`). */
  msg: number | null;
}

const KIND_RANK: Record<EventKind, number> = { local: 0, send: 1, receive: 2 };

/** Every event of an execution in true-time order (ties: local, send, receive, then node). */
export function eventsOf(e: Execution): Event[] {
  const raw: Omit<Event, 'id'>[] = [
    ...e.locals.map((l) => ({ node: l.node, t: l.at, kind: 'local' as const, msg: null })),
    ...e.messages.flatMap((m, i) => [
      { node: m.from, t: m.sendAt, kind: 'send' as const, msg: i },
      { node: m.to, t: m.sendAt + m.delay, kind: 'receive' as const, msg: i },
    ]),
  ];
  raw.sort((a, b) => a.t - b.t || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.node - b.node || (a.msg ?? -1) - (b.msg ?? -1));
  return raw.map((r, id) => ({ ...r, id }));
}

export interface Stamped {
  event: Event;
  /** The node's physical clock reading at the event: true time plus its offset. */
  pt: number;
  lamport: number;
  hlc: Hlc;
  rule: HlcRule;
}

/** Stamp each event, in true-time order, with the physical clock, the Lamport clock and the HLC. */
export function stampExecution(e: Execution): Stamped[] {
  const events = eventsOf(e);
  const lamport = [0, 0, 0];
  const hlc: Hlc[] = [ZERO, ZERO, ZERO];
  const sentL = new Map<number, number>();
  const sentH = new Map<number, Hlc>();
  return events.map((event) => {
    const pt = event.t + e.offsets[event.node];
    let rule: HlcRule;
    if (event.kind === 'receive') {
      const step = hlcReceive(hlc[event.node], sentH.get(event.msg!)!, pt);
      hlc[event.node] = step.h;
      rule = step.rule;
      lamport[event.node] = lamportReceive(lamport[event.node], sentL.get(event.msg!)!);
    } else {
      const step = hlcSend(hlc[event.node], pt);
      hlc[event.node] = step.h;
      rule = step.rule;
      lamport[event.node] = lamportSend(lamport[event.node]);
      if (event.kind === 'send') {
        sentH.set(event.msg!, step.h);
        sentL.set(event.msg!, lamport[event.node]);
      }
    }
    return { event, pt, lamport: lamport[event.node], hlc: hlc[event.node], rule };
  });
}

/** Ground truth: happens-before as the transitive closure of process order and message edges, independent of every clock. */
export function happenedBefore(e: Execution): boolean[][] {
  const events = eventsOf(e);
  const n = events.length;
  const hb = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const lastOnNode = new Map<number, number>();
  const sendOf = new Map<number, number>();
  for (const ev of events) {
    const prev = lastOnNode.get(ev.node);
    if (prev !== undefined) hb[prev][ev.id] = true;
    lastOnNode.set(ev.node, ev.id);
    if (ev.kind === 'send') sendOf.set(ev.msg!, ev.id);
    if (ev.kind === 'receive') hb[sendOf.get(ev.msg!)!][ev.id] = true;
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (hb[i][k]) for (let j = 0; j < n; j++) if (hb[k][j]) hb[i][j] = true;
  return hb;
}

export type Scheme = 'physical' | 'lamport' | 'hlc';
export const SCHEMES: readonly Scheme[] = ['physical', 'lamport', 'hlc'];

/** A negative number when `a` stamps earlier than `b` under the scheme. */
export function compareUnder(scheme: Scheme, a: Stamped, b: Stamped): number {
  if (scheme === 'physical') return a.pt - b.pt;
  if (scheme === 'lamport') return a.lamport - b.lamport;
  return compareHlc(a.hlc, b.hlc);
}

export interface Inversion {
  cause: number;
  effect: number;
}

/** Pairs where the cause carries the LARGER stamp (a tie is not counted: neither order is claimed). */
export function inversions(stamps: readonly Stamped[], hb: readonly (readonly boolean[])[], scheme: Scheme): Inversion[] {
  const out: Inversion[] = [];
  for (let a = 0; a < stamps.length; a++) for (let b = 0; b < stamps.length; b++) if (hb[a][b] && compareUnder(scheme, stamps[a], stamps[b]) > 0) out.push({ cause: a, effect: b });
  return out;
}

/** Event labels: the node's letter and its position on that node (A1, B2, ...). */
export function eventLabels(events: readonly Event[]): string[] {
  const seen = [0, 0, 0];
  return events.map((ev) => `${NODES[ev.node]}${++seen[ev.node]}`);
}

/** The event labels sorted by a scheme's stamp (ties keep true-time order). */
export function sortedBy(scheme: Scheme, stamps: readonly Stamped[]): string[] {
  const labels = eventLabels(stamps.map((s) => s.event));
  return stamps.map((s, i) => ({ s, i })).sort((x, y) => compareUnder(scheme, x.s, y.s) || x.i - y.i).map(({ i }) => labels[i]);
}

// ---------- the burst of scene 2 ----------

export const RESOLUTION_MS = [1, 10, 50] as const;
export const BURST = { min: 1, max: 20, default: 5 } as const;
export const BURST_START_MS = 100;

export interface BurstRow {
  /** True time of the event, ms (one per ms). */
  t: number;
  /** The clock reading: true time rounded down to the clock's resolution. */
  pt: number;
  hlc: Hlc;
  rule: HlcRule;
}

/** One node whose physical clock only reads multiples of `resolution`, and `burst` events one millisecond apart. */
export function burstRows(resolution: number, burst: number): BurstRow[] {
  let h = ZERO;
  return Array.from({ length: burst }, (_, k) => {
    const t = BURST_START_MS + k;
    const pt = Math.floor(t / resolution) * resolution;
    const step = hlcSend(h, pt);
    h = step.h;
    return { t, pt, hlc: step.h, rule: step.rule };
  });
}
