/**
 * The replicated to-do list: operations, the ways of merging them, and the check for what a merge lost. Pure.
 *
 * A device records every edit as an operation with a unique id, a logical (Lamport) timestamp, its own wall-clock
 * time (which may be skewed) and the ids of every operation it had applied (`observed`), so "A happened before B"
 * means A is in B's `observed`; two operations neither of which observed the other are concurrent.
 *
 * A replica holds a log of operations and its view is a pure function of that log, so replicas that hold the same
 * operations show the same list: the work of a sync protocol is to get the same operations to everyone.
 *   lww      last write wins, per item: the record written by the operation with the latest device clock replaces the rest.
 *   field    last write wins, per field: title and done are resolved separately by device clock.
 *   merge    operation-based merge: the causally latest write of each field wins, a concurrent loser is kept in a listed
 *            conflict, a delete concurrent with an edit is listed and the item stays, counters add up.
 *   manual   like merge, but a conflicting field has no winner: it is shown as undecided with both values listed.
 *   arrival  the broken one: each operation is applied to the state in the order it arrives, with no id and no merge.
 * A counter is a register under lww and field (each increment writes the value it saw plus one) and a sum under merge
 * and manual (one per operation in the log: a copy delivered twice counts twice unless the replica dedupes by id).
 */
export type DeviceId = 'phone' | 'laptop';
export const DEVICES: readonly DeviceId[] = ['phone', 'laptop'];
export type OpKind = 'add' | 'rename' | 'tick' | 'delete' | 'inc';
export type Strategy = 'lww' | 'field' | 'merge' | 'manual' | 'arrival';
export type MergeStrategy = Exclude<Strategy, 'arrival'>;

export const STRATEGIES: { id: Strategy; label: string; blurb: string }[] = [
  { id: 'lww', label: 'last write wins', blurb: 'the whole item from the latest device clock' },
  { id: 'field', label: 'per-field last write wins', blurb: 'each field from the latest device clock' },
  { id: 'merge', label: 'operation-based merge', blurb: 'keep every edit: causal order, conflicts listed' },
  { id: 'manual', label: 'manual', blurb: 'no winner: both values kept for the user' },
  { id: 'arrival', label: 'arrival order (broken)', blurb: 'apply operations as they arrive, with no ids and no merge' },
];

export const MAX_TITLE = 40;

export interface Op {
  id: string;
  device: DeviceId;
  seq: number;
  lamport: number;
  /** The device's own clock when it made the edit, ms. */
  wall: number;
  observed: readonly string[];
  kind: OpKind;
  item?: string;
  title?: string;
  done?: boolean;
}

export interface ItemView {
  id: string;
  /** null when a manual strategy leaves the title undecided. */
  title: string | null;
  done: boolean | null;
  deleted: boolean;
  conflicted: boolean;
}
export interface Conflict {
  item: string | null;
  field: 'title' | 'done' | 'item';
  text: string;
  ops: string[];
}
export interface View {
  items: ItemView[];
  counter: number;
  conflicts: Conflict[];
}

// ---- helpers ---------------------------------------------------------------------------------

const DEVICE_RANK: Record<DeviceId, number> = { phone: 0, laptop: 1 };
const byLamport = (a: Op, b: Op) => a.lamport - b.lamport || DEVICE_RANK[a.device] - DEVICE_RANK[b.device] || a.seq - b.seq;
const byWall = (a: Op, b: Op) => a.wall - b.wall || DEVICE_RANK[a.device] - DEVICE_RANK[b.device] || a.seq - b.seq;
const latest = (ops: readonly Op[], cmp: (a: Op, b: Op) => number): Op => ops.reduce((m, o) => (cmp(o, m) > 0 ? o : m));

export const uniqueById = (log: readonly Op[]): Op[] => {
  const seen = new Set<string>();
  return log.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
};

/** Neither operation had seen the other. */
export const concurrent = (a: Op, b: Op): boolean => a.id !== b.id && !a.observed.includes(b.id) && !b.observed.includes(a.id);

type Field = 'title' | 'done';
const touches = (o: Op, f: Field): boolean => (f === 'title' ? o.kind === 'add' || o.kind === 'rename' : o.kind === 'add' || o.kind === 'tick');
const valueOf = (o: Op, f: Field): string | boolean => (f === 'title' ? (o.title ?? '') : o.kind === 'add' ? false : (o.done ?? false));

const quote = (s: string | boolean | null) => (typeof s === 'string' ? `"${s}"` : String(s));

/** Sorted ids of every operation in a log (the `observed` set a new edit carries). */
export const idsOf = (log: readonly Op[]): string[] => [...new Set(log.map((o) => o.id))].sort();

// ---- the merging views -------------------------------------------------------------------------

function registerCounter(ops: readonly Op[]): number {
  const incs = ops.filter((o) => o.kind === 'inc');
  if (incs.length === 0) return 0;
  const w = latest(incs, byWall);
  return incs.filter((o) => w.observed.includes(o.id)).length + 1;
}

export function viewOf(log: readonly Op[], strategy: MergeStrategy): View {
  const ops = uniqueById(log);
  const adds = ops.filter((o) => o.kind === 'add').sort(byLamport);
  const conflicts: Conflict[] = [];
  const items: ItemView[] = adds.map((add) => {
    const mine = ops.filter((o) => o.item === add.id || o.id === add.id);
    const edits = mine.filter((o) => o.kind === 'rename' || o.kind === 'tick');
    const deletes = mine.filter((o) => o.kind === 'delete');

    if (strategy === 'lww') {
      const w = latest(mine, byWall);
      const closure = mine.filter((o) => o.id === w.id || w.observed.includes(o.id));
      const titles = closure.filter((o) => touches(o, 'title'));
      const dones = closure.filter((o) => touches(o, 'done'));
      return {
        id: add.id,
        title: String(valueOf(latest(titles, byLamport), 'title')),
        done: Boolean(valueOf(latest(dones, byLamport), 'done')),
        deleted: closure.some((o) => o.kind === 'delete'),
        conflicted: false,
      };
    }
    if (strategy === 'field') {
      const title = latest(mine.filter((o) => touches(o, 'title')), byWall);
      const done = latest(mine.filter((o) => touches(o, 'done')), byWall);
      const lastDelete = deletes.length ? latest(deletes, byWall) : null;
      return { id: add.id, title: String(valueOf(title, 'title')), done: Boolean(valueOf(done, 'done')), deleted: lastDelete !== null && byWall(lastDelete, add) > 0, conflicted: false };
    }

    // merge and manual
    let conflicted = false;
    const resolve = (f: Field): string | boolean | null => {
      const cands = mine.filter((o) => touches(o, f));
      const maximal = cands.filter((c) => !cands.some((p) => p.id !== c.id && p.observed.includes(c.id))).sort(byLamport);
      const values = [...new Set(maximal.map((o) => valueOf(o, f)))];
      const winner = latest(maximal, byLamport);
      if (values.length > 1) {
        conflicted = true;
        const shown = strategy === 'manual' ? 'undecided' : `kept ${quote(valueOf(winner, f))}`;
        conflicts.push({ item: add.id, field: f, text: `${f} of ${quote(add.title ?? '')}: ${values.map(quote).join(' vs ')}; ${shown}`, ops: maximal.map((o) => o.id) });
        return strategy === 'manual' ? null : valueOf(winner, f);
      }
      return valueOf(winner, f);
    };
    const title = resolve('title');
    const done = resolve('done');
    let deleted = false;
    const clashing: Op[] = [];
    for (const d of [...deletes].sort(byLamport)) {
      const clash = edits.filter((e) => concurrent(e, d)).sort(byLamport);
      if (clash.length === 0) deleted = true;
      else clashing.push(d, ...clash);
    }
    if (!deleted && clashing.length > 0) {
      conflicted = true;
      const d = clashing[0];
      const e = clashing[1];
      conflicts.push({ item: add.id, field: 'item', text: `deleted on ${d.device} while ${e.kind === 'rename' ? 'renamed' : 'ticked'} on ${e.device}: the item stays with the edit`, ops: [...new Set(clashing.map((o) => o.id))].sort() });
    }
    return { id: add.id, title: title === null ? null : String(title), done: done === null ? null : Boolean(done), deleted, conflicted };
  });

  const counter = strategy === 'lww' || strategy === 'field' ? registerCounter(ops) : log.filter((o) => o.kind === 'inc').length;
  return { items, counter, conflicts };
}

// ---- the broken one: apply in arrival order -----------------------------------------------------

export interface NaiveState {
  items: { id: string; title: string; done: boolean }[];
  counter: number;
}
export const emptyNaive = (): NaiveState => ({ items: [], counter: 0 });

/** Apply one arriving operation to the state, with no id check and no ordering: a copy applies again, an early edit finds no item. */
export function applyNaive(s: NaiveState, op: Op): NaiveState {
  if (op.kind === 'inc') return { ...s, counter: s.counter + 1 };
  if (op.kind === 'add') return { ...s, items: [...s.items, { id: op.id, title: op.title ?? '', done: false }] };
  if (op.kind === 'delete') return { ...s, items: s.items.filter((i) => i.id !== op.item) };
  const at = s.items.findIndex((i) => i.id === op.item);
  if (at < 0) return s;
  const items = s.items.slice();
  items[at] = op.kind === 'rename' ? { ...items[at], title: op.title ?? '' } : { ...items[at], done: op.done ?? false };
  return { ...s, items };
}
export const naiveView = (s: NaiveState): View => ({ items: s.items.map((i) => ({ id: i.id, title: i.title, done: i.done, deleted: false, conflicted: false })), counter: s.counter, conflicts: [] });

/** The one string two replicas must share to show the same list. */
export const viewKey = (v: View): string => JSON.stringify({ i: v.items.map((x) => [x.id, x.title, x.done, x.deleted]), c: v.counter, k: v.conflicts.map((c) => c.text).sort() });

// ---- what a merge lost -------------------------------------------------------------------------

export interface Lost {
  op: Op;
  reason: string;
}

const kindWord: Record<OpKind, string> = { add: 'adding', rename: 'renaming to', tick: 'ticking', delete: 'deleting', inc: 'incrementing' };
export const opText = (o: Op): string => `${o.device} ${kindWord[o.kind]}${o.title !== undefined ? ` "${o.title}"` : o.kind === 'tick' ? ` ${o.done ? 'done' : 'not done'}` : ''}`;

/**
 * Acknowledged operations whose effect is nowhere in the final view: not the value now showing, not overwritten by a
 * later operation that had seen it, and not in a listed conflict. A counter that ends below the number of increments
 * is one entry for the missing increments.
 */
export function lostUpdates(accepted: readonly Op[], view: View): Lost[] {
  const ops = uniqueById(accepted);
  const listed = new Set(view.conflicts.flatMap((c) => c.ops));
  const lost: Lost[] = [];
  const overwritten = (o: Op, f: Field) => ops.some((p) => p.id !== o.id && p.item === o.item && touches(p, f) && p.observed.includes(o.id));
  for (const o of ops) {
    if (o.kind === 'inc') continue;
    const item = view.items.find((i) => i.id === (o.kind === 'add' ? o.id : o.item));
    if (!item) {
      if (o.kind === 'add') lost.push({ op: o, reason: 'the item is gone from the list' });
      continue;
    }
    if (o.kind === 'rename' && item.title !== o.title && !overwritten(o, 'title') && !listed.has(o.id)) lost.push({ op: o, reason: `the title shows ${item.title === null ? 'nothing' : quote(item.title)} and no conflict lists this rename` });
    if (o.kind === 'tick' && item.done !== o.done && !overwritten(o, 'done') && !listed.has(o.id)) lost.push({ op: o, reason: 'the tick state shows the other value and no conflict lists this edit' });
    if (o.kind === 'delete' && !item.deleted && !listed.has(o.id)) lost.push({ op: o, reason: 'the item is still showing and no conflict lists this delete' });
  }
  const incs = ops.filter((o) => o.kind === 'inc');
  if (incs.length > view.counter) {
    lost.push({ op: incs[incs.length - 1], reason: `${incs.length - view.counter} of ${incs.length} increments are missing from the counter (${view.counter})` });
  }
  return lost;
}
