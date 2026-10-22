// The three replicas, their network and the messages between them, as pure state transitions: the stage calls
// these from its handlers, and the tests drive the very same functions headless.
import { mulberry32, shuffle } from '../../core/random';
import { RIDS, emptyRep, merge, valueKey, type Kind, type Mode, type Rep, type Rid } from './crdt';

export interface Msg {
  id: number;
  from: Rid;
  to: Rid;
  snap: Rep;
  /** Seconds the message waits before it flies: how a sync staggers its six messages. */
  delay: number;
}

/** A local edit, recorded by the same transition that applied it (so its caption cannot go stale). */
export interface LocalEdit {
  seq: number;
  r: Rid;
  wasOnline: boolean;
  /** "adds +1", "removes 🍎": the caption finishes the sentence. */
  what: string;
}

export interface World {
  reps: Record<Rid, Rep>;
  online: Record<Rid, boolean>;
  msgs: Msg[];
  nextMsg: number;
  /** Local updates made anywhere (for spotting lost updates). */
  made: number;
  syncing: boolean;
  syncsDone: number;
  /** How many syncs have started: the next one uses the next order for the seed. */
  syncCount: number;
  /** The states the last sync started from, for replaying it; null once anything has been edited since (a replay would overwrite those edits). */
  preSync: Record<Rid, Rep> | null;
  /** True from an edit until the next sync finishes: the replicas have not merged it yet. */
  dirty: boolean;
  lastEdit: LocalEdit | null;
}

/** The seed the stage opens with: it fixes the order of each sync's six messages. */
export const DEFAULT_SEED = 7;

/** The edits of try-this 1 and 2: pluses pressed on A and on B while B is offline. */
export const TRY_INCREMENTS = { a: 3, b: 2 } as const;

export const freshWorld = (): World => ({
  reps: { A: emptyRep(), B: emptyRep(), C: emptyRep() },
  online: { A: true, B: true, C: true },
  msgs: [], nextMsg: 1, made: 0, syncing: false, syncsDone: 0, syncCount: 0, preSync: null, dirty: false, lastEdit: null,
});

/** Seconds between the six messages of a sync. */
export const SYNC_STAGGER_S = 0.3;
/** Mixes the sync index into the seed so consecutive syncs of one seed draw different orders. */
const SYNC_SALT = 0x9e3779b1;

export function allPairs(): [Rid, Rid][] {
  const out: [Rid, Rid][] = [];
  for (const a of RIDS) for (const b of RIDS) if (a !== b) out.push([a, b]);
  return out;
}

/** The order of the six messages of the `n`th sync under `seed`: the same every time, different for each `n`. */
export function syncOrder(seed: number, n: number): [Rid, Rid][] {
  return shuffle(allPairs(), mulberry32((seed + Math.imul(n + 1, SYNC_SALT)) >>> 0));
}

/** Apply a local edit on `r`; an online replica also sends its new state to every online peer. */
export function localEdit(prev: World, r: Rid, fn: (s: Rep) => Rep, what: string, counts = true): World {
  const rep = fn(prev.reps[r]);
  const wasOnline = prev.online[r];
  const msgs: Msg[] = wasOnline
    ? RIDS.filter((x) => x !== r && prev.online[x]).map((to, i) => ({ id: prev.nextMsg + i, from: r, to, snap: rep, delay: 0 }))
    : [];
  return {
    ...prev,
    reps: { ...prev.reps, [r]: rep },
    msgs: [...prev.msgs, ...msgs],
    nextMsg: prev.nextMsg + msgs.length,
    made: prev.made + (counts ? 1 : 0),
    preSync: null,
    dirty: true,
    lastEdit: { seq: (prev.lastEdit?.seq ?? 0) + 1, r, wasOnline, what },
  };
}

export const setOnline = (prev: World, r: Rid, on: boolean): World => ({ ...prev, online: { ...prev.online, [r]: on } });

export const partitionAll = (prev: World): World => ({ ...prev, online: { A: false, B: false, C: false } });

/** Everyone reconnects and every replica sends its full state to every other, in `order`; `from` replays an earlier sync's starting states. */
export function startSync(prev: World, order: [Rid, Rid][], from?: Record<Rid, Rep>): World {
  const reps = from ?? prev.reps;
  const msgs = order.map(([a, b], i) => ({ id: prev.nextMsg + i, from: a, to: b, snap: reps[a], delay: i * SYNC_STAGGER_S }));
  return {
    ...prev, reps, online: { A: true, B: true, C: true }, preSync: reps, syncing: true, syncCount: prev.syncCount + 1,
    msgs: [...prev.msgs, ...msgs], nextMsg: prev.nextMsg + msgs.length,
  };
}

/** A message lands: the receiver merges it. The sync is done when the last message is gone. */
export function landMessage(prev: World, m: Msg, kind: Kind, mode: Mode): World {
  if (!prev.msgs.some((x) => x.id === m.id)) return prev;
  const reps = { ...prev.reps, [m.to]: merge(prev.reps[m.to], m.snap, kind, mode) };
  const msgs = prev.msgs.filter((x) => x.id !== m.id);
  const finished = prev.syncing && msgs.length === 0;
  return { ...prev, reps, msgs, syncing: finished ? false : prev.syncing, syncsDone: prev.syncsDone + (finished ? 1 : 0), dirty: finished ? false : prev.dirty };
}

/** Land every message in the order they would fly (by delay, then by id): what the stage does as the animation plays. */
export function landAll(world: World, kind: Kind, mode: Mode): World {
  let w = world;
  for (const m of [...world.msgs].sort((a, b) => a.delay - b.delay || a.id - b.id)) w = landMessage(w, m, kind, mode);
  return w;
}

export const valuesOf = (w: World, kind: Kind, mode: Mode) => RIDS.map((r) => valueKey(w.reps[r], kind, mode));
export const agree = (w: World, kind: Kind, mode: Mode) => w.msgs.length === 0 && valuesOf(w, kind, mode).every((v, _, all) => v === all[0]);

/**
 * The stat "Lost increments": increments made minus what the replicas read. It is only a verdict once the replicas have merged
 * (nothing in flight, no edit since the last sync finished) and agree; until then the increments are merely not merged yet, so
 * it is null and the stage says so instead of printing a number.
 */
export function lostIncrements(w: World, mode: Mode): number | null {
  if (w.msgs.length > 0 || w.dirty || !agree(w, 'counter', mode)) return null;
  return Math.max(0, w.made - Number(valuesOf(w, 'counter', mode)[0]));
}

export type SyncOutcome =
  | { kind: 'nothing' }
  | { kind: 'converged' }
  | { kind: 'still-apart'; values: string[] }
  | { kind: 'diverged'; values: string[] }
  | { kind: 'agree-lost'; lost: number }
  | { kind: 'agree-none-lost' }
  | { kind: 'agree-by-order' };

/** What a finished sync left behind, read from the replicas: the sentence under the stage is chosen from this. */
export function syncOutcome(w: World, kind: Kind, mode: Mode): SyncOutcome {
  const values = valuesOf(w, kind, mode);
  const same = agree(w, kind, mode);
  if (same && w.made === 0) return { kind: 'nothing' };
  if (mode === 'crdt') return same ? { kind: 'converged' } : { kind: 'still-apart', values };
  if (!same) return { kind: 'diverged', values };
  if (kind === 'counter') {
    const lost = lostIncrements(w, mode) ?? 0;
    return lost > 0 ? { kind: 'agree-lost', lost } : { kind: 'agree-none-lost' };
  }
  return { kind: 'agree-by-order' };
}
