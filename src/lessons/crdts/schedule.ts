// Seeded random edit schedules for the three replicas, with an oracle that says what the final value should be.
// The same world transitions as the stage: edits (online or offline), partitions, syncs in a seeded order,
// messages that land at once or hang in flight and land late (so some arrive out of order and some twice over).
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import {
  COLORS, ITEMS, RIDS, add, inc, merge, remove, setReg, valueKey,
  type Kind, type Mode, type Rep, type Rid,
} from './crdt';
import { freshWorld, landAll, localEdit, setOnline, startSync, syncOrder, type World } from './world';

export const SCHEDULE_SEEDS = 200;

/**
 * The shortest failing schedule of the naive overwrite for each data type: the lowest seed among those with the fewest actions,
 * and the exact reason it fails. (The lowest failing seed itself says little: seeds 1 to 12 all fail for the counter.)
 * crdt.test.ts re-derives all three by brute force over the checked seeds.
 */
export const NAIVE_WITNESS: Record<Kind, { seed: number; actions: number; problem: string }> = {
  counter: { seed: 11, actions: 6, problem: 'an update was lost: the replicas read 4 but the edits add up to 6 (increments)' },
  set: { seed: 26, actions: 6, problem: 'an update was lost: the replicas read 🍎,🥝 but the edits add up to 🍇,🍎,🥝 (elements)' },
  register: { seed: 11, actions: 6, problem: 'the replicas disagree: #3ddc97 | #3ddc97 | #ff5d8f' }, // allow-color: the exact problem text the run prints, which names register values
};
const ACTIONS = { min: 6, max: 14 } as const;
/** Chance that the messages in flight land right after an action; otherwise they hang and land with a later one. */
const LAND_NOW = 0.8;
const OFFLINE_CHANCE = 0.1;
const SYNC_CHANCE = 0.2;
/** The schedule's own stream is the seed run through this constant, independent of the sync orders. */
const SCHEDULE_SALT = 0x85ebca6b;

type Op = { t: 'inc' } | { t: 'add'; e: string } | { t: 'remove'; e: string } | { t: 'set'; c: string };
export type Action =
  | { kind: 'edit'; r: Rid; op: Op }
  | { kind: 'offline'; r: Rid }
  | { kind: 'online'; r: Rid }
  | { kind: 'sync' };

/** What the oracle remembers about each edit: tags a remove had seen, the stamp of a register write. */
interface OpLog {
  made: number;
  adds: { e: string; tag: string }[];
  removes: { e: string; seen: string[] }[];
  writes: { v: string; ts: number; by: Rid }[];
}

function opFor(kind: Kind, rnd: Rnd): Op {
  if (kind === 'counter') return { t: 'inc' };
  if (kind === 'register') return { t: 'set', c: pick(COLORS, rnd) };
  return rnd() < 0.65 ? { t: 'add', e: pick(ITEMS, rnd) } : { t: 'remove', e: pick(ITEMS, rnd) };
}

export function buildSchedule(seed: number, kind: Kind): Action[] {
  const rnd = mulberry32((seed ^ SCHEDULE_SALT) >>> 0);
  const offline = new Set<Rid>();
  const actions: Action[] = [];
  const count = randInt(ACTIONS.min, ACTIONS.max, rnd);
  for (let i = 0; i < count; i += 1) {
    const roll = rnd();
    const r = pick(RIDS, rnd);
    if (roll < OFFLINE_CHANCE) {
      if (offline.has(r)) {
        offline.delete(r);
        actions.push({ kind: 'online', r });
      } else {
        offline.add(r);
        actions.push({ kind: 'offline', r });
      }
    } else if (roll < OFFLINE_CHANCE + SYNC_CHANCE) {
      offline.clear();
      actions.push({ kind: 'sync' });
    } else actions.push({ kind: 'edit', r, op: opFor(kind, rnd) });
  }
  return actions;
}

function applyEdit(w: World, r: Rid, op: Op, log: OpLog): World {
  const before = w.reps[r];
  switch (op.t) {
    case 'inc': {
      log.made += 1;
      return localEdit(w, r, (s) => inc(s, r), 'adds +1');
    }
    case 'add': {
      const next = localEdit(w, r, (s) => add(s, r, op.e), `adds ${op.e}`);
      log.adds.push({ e: op.e, tag: next.reps[r].adds.at(-1)!.tag });
      return next;
    }
    case 'remove': {
      const seen = before.adds.filter((a) => a.e === op.e && !before.removed.includes(a.tag)).map((a) => a.tag);
      log.removes.push({ e: op.e, seen });
      return localEdit(w, r, (s) => remove(s, op.e), `removes ${op.e}`);
    }
    case 'set': {
      const next = localEdit(w, r, (s) => setReg(s, r, op.c), 'sets the colour');
      const reg = next.reps[r].reg!;
      log.writes.push({ v: reg.v, ts: reg.ts, by: reg.by });
      return next;
    }
  }
}

/** What every replica should read once all updates are everywhere, worked out from the edit log alone. */
export function expectedValue(kind: Kind, log: OpLog): string {
  if (kind === 'counter') return String(log.made);
  if (kind === 'set') {
    const removedTags = new Set(log.removes.flatMap((r) => r.seen));
    return [...new Set(log.adds.filter((a) => !removedTags.has(a.tag)).map((a) => a.e))].sort().join(',');
  }
  const winner = log.writes.reduce<OpLog['writes'][number] | null>(
    (best, w) => (!best || w.ts > best.ts || (w.ts === best.ts && w.by > best.by) ? w : best),
    null,
  );
  return winner?.v ?? '';
}

export interface Run {
  seed: number;
  kind: Kind;
  mode: Mode;
  /** The world after the last action, before the closing syncs. */
  open: World;
  /** The world after two full syncs with everyone online. */
  world: World;
  actions: Action[];
  expected: string;
  /** What the replicas read at the end. */
  values: string[];
  /** Null when all replicas agree on the expected value, else why not. */
  problem: string | null;
}

const KIND_WORD: Record<Kind, string> = { counter: 'increments', set: 'elements', register: 'writes' };

/** Run seed `seed`'s schedule for `kind` under merge `mode`, then sync everyone twice and compare with the oracle. */
export function runSchedule(seed: number, kind: Kind, mode: Mode): Run {
  const actions = buildSchedule(seed, kind);
  const landRnd = mulberry32((seed ^ SCHEDULE_SALT ^ 1) >>> 0);
  const log: OpLog = { made: 0, adds: [], removes: [], writes: [] };
  let w = freshWorld();
  for (const a of actions) {
    if (a.kind === 'edit') w = applyEdit(w, a.r, a.op, log);
    else if (a.kind === 'offline') w = setOnline(w, a.r, false);
    else if (a.kind === 'online') w = setOnline(w, a.r, true);
    else w = landAll(startSync(w, syncOrder(seed, w.syncCount)), kind, mode);
    if (landRnd() < LAND_NOW) w = landAll(w, kind, mode);
  }
  const open = w;
  for (let i = 0; i < 2; i += 1) w = landAll(startSync(w, syncOrder(seed, w.syncCount)), kind, mode);
  const expected = expectedValue(kind, log);
  const values = RIDS.map((r) => valueKey(w.reps[r], kind, mode));
  let problem: string | null = null;
  if (new Set(values).size > 1) problem = `the replicas disagree: ${values.map((v) => v || 'empty').join(' | ')}`;
  else if (values[0] !== expected) problem = `an update was lost: the replicas read ${values[0] || 'nothing'} but the edits add up to ${expected || 'nothing'} (${KIND_WORD[kind]})`;
  return { seed, kind, mode, open, world: w, actions, expected, values, problem };
}

/** The world the stage shows for a loaded run: its end state, without the last edit's narration (which would replace the run's verdict). */
export const loadedWorld = (run: Run): World => ({ ...run.world, lastEdit: null });

export interface ScheduleCheck {
  kind: Kind;
  mode: Mode;
  seeds: number;
  failures: number;
  /** The lowest seed that failed, with its run; null when every seed passed. */
  lowest: Run | null;
  /** The failing run with the fewest actions (the lowest seed among ties): the one worth reading. */
  shortest: Run | null;
}

/** Seeds 1..count: how many end with replicas disagreeing or an update lost, and the lowest that does. */
export function checkSchedules(kind: Kind, mode: Mode, count = SCHEDULE_SEEDS): ScheduleCheck {
  let failures = 0;
  let lowest: Run | null = null;
  let shortest: Run | null = null;
  for (let seed = 1; seed <= count; seed += 1) {
    const run = runSchedule(seed, kind, mode);
    if (!run.problem) continue;
    failures += 1;
    lowest ??= run;
    if (!shortest || run.actions.length < shortest.actions.length) shortest = run;
  }
  return { kind, mode, seeds: count, failures, lowest, shortest };
}

/** The part of a replica's state a merge is about, as text: equal text means equal state (the Lamport clock included). */
export function canonical(s: Rep, kind: Kind, mode: Mode): string {
  if (kind === 'counter') return JSON.stringify([s.clock, mode === 'crdt' ? s.vec : s.n]);
  if (kind === 'set') {
    return JSON.stringify([s.clock, mode === 'crdt' ? [s.adds.map((a) => a.tag).sort(), [...s.removed].sort()] : [...s.items].sort()]);
  }
  return JSON.stringify([s.clock, mode === 'crdt' ? s.reg : s.plain]);
}

export interface LawCheck {
  kind: Kind;
  mode: Mode;
  seeds: number;
  /** Seeds on which a law failed for the three replicas' mid-run states. */
  commutative: number;
  associative: number;
  idempotent: number;
}

/**
 * The three merge laws on the replicas' states partway through each seed's schedule (A, B and C as they stood before the
 * closing syncs): merge(a, b) = merge(b, a), merge(merge(a, b), c) = merge(a, merge(b, c)) and merge(a, a) = a.
 */
export function checkLaws(kind: Kind, mode: Mode, count = SCHEDULE_SEEDS): LawCheck {
  const out: LawCheck = { kind, mode, seeds: count, commutative: 0, associative: 0, idempotent: 0 };
  const m = (x: Rep, y: Rep) => merge(x, y, kind, mode);
  const same = (x: Rep, y: Rep) => canonical(x, kind, mode) === canonical(y, kind, mode);
  for (let seed = 1; seed <= count; seed += 1) {
    const { A: a, B: b, C: c } = runSchedule(seed, kind, mode).open.reps;
    if (!same(m(a, b), m(b, a))) out.commutative += 1;
    if (!same(m(m(a, b), c), m(a, m(b, c)))) out.associative += 1;
    if (!same(m(a, a), a)) out.idempotent += 1;
  }
  return out;
}

/** The sentence under the check button: the outcome of the schedules and of the three merge laws, with the lowest failing seed. */
export function describeSchedules(check: ScheduleCheck, laws: LawCheck): string {
  const lawText = `Merge laws on the replicas' mid-run states, failing seeds out of ${laws.seeds}: commutative ${laws.commutative}, associative ${laws.associative}, idempotent ${laws.idempotent}.`;
  if (!check.lowest) {
    return `Sampled, not exhaustive: in none of ${check.seeds} seeded schedules did the replicas end up disagreeing or an update get lost. ${lawText}`;
  }
  return `The replicas ended up disagreeing or lost an update on ${check.failures} of ${check.seeds} seeds. Shortest failing schedule: seed ${check.shortest!.seed}, ${check.shortest!.actions.length} actions: ${check.shortest!.problem}. ${lawText}`;
}

