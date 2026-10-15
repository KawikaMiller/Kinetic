/**
 * kafka-partitioned-log, scene 2: consumer groups, offsets, commit policies and rebalances, as a tick simulation. Pure.
 *
 * One topic of P partitions fills at one seeded record per tick. Group A has C consumers, group B one consumer that reads
 * the same log from its own offsets. A consumer works on one record at a time, in three steps of one tick each:
 *   commit after processing (at-least-once): process, apply the effect, commit the offset;
 *   commit before processing (at-most-once): commit the offset, process, apply the effect.
 * A crash loses the consumer's record in flight (what was committed stays committed), and its replacement resumes from the
 * committed offset. A rebalance lets every consumer finish its record, then reassigns the partitions (round-robin by
 * partition index) and pauses the group for PAUSE_TICKS, an illustrative number. Nothing here is Kafka's protocol.
 */
import { mulberry32 } from '../../core/random';
import { partitionOf } from './partitioning';

export type CommitPolicy = 'after' | 'before';
export const MIN_CONSUMERS = 1;
export const MAX_CONSUMERS = 8;
export const DEFAULT_CONSUMERS = 2;
export const DEFAULT_GROUP_PARTITIONS = 3;
/** Ticks a consumer takes per record (three steps of one tick). */
export const STEPS_PER_RECORD = 3;
/** The stop-the-world pause after a rebalance, in ticks. Illustrative: real pauses depend on the protocol and its settings. */
export const PAUSE_TICKS = 3;
/** The run stops here, so a left-running scene cannot grow without bound. */
export const TICK_CAP = 300;
/** Distinct keys the producer draws from: enough that 2 to 6 partitions each get a share, uneven as real keys are. */
export const KEY_SPACE = 48;
export const DEFAULT_GROUP_SEED = 3;
export const GROUP_B_ID = 'b1';

export type StepName = 'process' | 'effect' | 'commit';
const STEP_ORDER: Record<CommitPolicy, readonly StepName[]> = {
  after: ['process', 'effect', 'commit'],
  before: ['commit', 'process', 'effect'],
};

export interface Task {
  partition: number;
  offset: number;
  /** Steps finished so far (1 or 2: a finished task is dropped). */
  done: number;
}

export interface Consumer {
  id: string;
  partitions: number[];
  task: Task | null;
  /** Round-robin cursor into `partitions`. */
  cursor: number;
  /** Told to leave: finishes its record, fetches nothing new, and is dropped at the next reassignment. */
  leaving: boolean;
}

export interface GroupEvent {
  id: number;
  tick: number;
  group: string;
  text: string;
  tone: 'ok' | 'bad' | 'info' | 'orange' | 'violet';
}

export interface Group {
  name: string;
  policy: CommitPolicy;
  consumers: Consumer[];
  committed: number[];
  position: number[];
  /** How many times each record's effect ran: `processed[partition][offset]`. */
  processed: number[][];
  /** A reassignment is wanted: consumers finish their record, then it happens. */
  rebalance: { reason: string } | null;
  /** Ticks of stop-the-world pause left. */
  pause: number;
  /** The consumer that owned each partition at the last assignment. */
  owners: (string | null)[];
  crashed: string[];
  nextId: number;
  prefix: string;
}

export interface World {
  tick: number;
  p: number;
  seed: number;
  producing: boolean;
  logEnd: number[];
  groups: [Group, Group];
  events: GroupEvent[];
}

/** The round-robin assignment: partition i goes to consumer i mod n. */
export const assign = (consumers: number, partitions: number): number[][] =>
  Array.from({ length: consumers }, (_, c) => Array.from({ length: partitions }, (_, p) => p).filter((p) => p % consumers === c));

/** The partition the record produced at `tick` lands in. */
export const partitionAtTick = (seed: number, tick: number, p: number): number =>
  partitionOf(`k${Math.floor(mulberry32(seed * 7_919 + tick)() * KEY_SPACE)}`, p);

const clone = (w: World): World => ({
  ...w,
  logEnd: [...w.logEnd],
  groups: w.groups.map((g) => ({
    ...g,
    consumers: g.consumers.map((c) => ({ ...c, partitions: [...c.partitions], task: c.task && { ...c.task } })),
    committed: [...g.committed],
    position: [...g.position],
    processed: g.processed.map((row) => [...row]),
    rebalance: g.rebalance && { ...g.rebalance },
    owners: [...g.owners],
    crashed: [...g.crashed],
  })) as [Group, Group],
  events: [...w.events],
});

const say = (w: World, group: Group, text: string, tone: GroupEvent['tone']) => {
  w.events.push({ id: w.events.length, tick: w.tick, group: group.name, text, tone });
};

const newGroup = (name: string, prefix: string, policy: CommitPolicy, consumers: number, p: number): Group => ({
  name, policy, prefix, nextId: consumers + 1,
  consumers: Array.from({ length: consumers }, (_, i) => ({ id: `${prefix}${i + 1}`, partitions: [], task: null, cursor: 0, leaving: false })),
  committed: new Array<number>(p).fill(0),
  position: new Array<number>(p).fill(0),
  processed: Array.from({ length: p }, () => []),
  rebalance: null, pause: 0, owners: new Array<string | null>(p).fill(null), crashed: [],
});

/** Hand the partitions out to the consumers that stay, log what moved, and restart every position at the committed offset. */
function executeRebalance(w: World, g: Group, pause: number) {
  const reason = g.rebalance?.reason ?? 'start';
  g.consumers = g.consumers.filter((c) => !c.leaving);
  const plan = assign(g.consumers.length, w.p);
  g.consumers.forEach((c, i) => { c.partitions = plan[i]; c.cursor = 0; });
  for (let p = 0; p < w.p; p++) {
    const was = g.owners[p];
    const now = g.consumers.find((c) => c.partitions.includes(p))?.id ?? null;
    if (was === now) continue;
    if (was !== null && !g.crashed.includes(was)) say(w, g, `revoke P${p} from ${was}`, 'orange');
    if (now !== null) say(w, g, `assign P${p} to ${now}, resume at committed offset ${g.committed[p]}`, 'info');
    g.owners[p] = now;
  }
  g.position = [...g.committed];
  g.rebalance = null;
  g.pause = pause;
  if (pause > 0) say(w, g, `rebalance (${reason}): the group pauses for ${pause} ticks`, 'violet');
}

/** A new world at tick 0: the groups are assigned and idle, with no pause for the first join. */
export function newWorld(o: { p: number; consumers: number; policy: CommitPolicy; seed: number }): World {
  const w: World = {
    tick: 0, p: o.p, seed: o.seed, producing: true, logEnd: new Array<number>(o.p).fill(0), events: [],
    groups: [newGroup('A', 'c', o.policy, o.consumers, o.p), newGroup('B', 'b', 'after', 1, o.p)],
  };
  for (const g of w.groups) executeRebalance(w, g, 0);
  return w;
}

const doStep = (g: Group, c: Consumer, step: StepName) => {
  const t = c.task!;
  if (step === 'effect') {
    const row = g.processed[t.partition];
    row[t.offset] = (row[t.offset] ?? 0) + 1;
  } else if (step === 'commit') {
    g.committed[t.partition] = t.offset + 1;
  }
};

function stepConsumer(w: World, g: Group, c: Consumer) {
  if (!c.task) {
    if (g.rebalance || c.leaving || c.partitions.length === 0) return;
    for (let k = 0; k < c.partitions.length; k++) {
      const i = (c.cursor + k) % c.partitions.length;
      const p = c.partitions[i];
      if (g.position[p] < w.logEnd[p]) {
        c.task = { partition: p, offset: g.position[p], done: 0 };
        g.position[p]++;
        c.cursor = i + 1;
        break;
      }
    }
    if (!c.task) return;
  }
  doStep(g, c, STEP_ORDER[g.policy][c.task.done]);
  c.task.done++;
  if (c.task.done >= STEPS_PER_RECORD) c.task = null;
}

function stepGroup(w: World, g: Group) {
  if (g.pause > 0) {
    g.pause--;
    return;
  }
  if (g.rebalance && g.consumers.every((c) => c.task === null)) {
    executeRebalance(w, g, PAUSE_TICKS);
    return;
  }
  for (const c of g.consumers) stepConsumer(w, g, c);
}

/** One tick: the producer appends, then each group works. Returns a new world. */
export function advance(world: World): World {
  const w = clone(world);
  w.tick++;
  if (w.producing) w.logEnd[partitionAtTick(w.seed, w.tick, w.p)]++;
  for (const g of w.groups) stepGroup(w, g);
  return w;
}

export const advanceBy = (w: World, ticks: number): World => {
  let next = w;
  for (let i = 0; i < ticks; i++) next = advance(next);
  return next;
};

/** Change the number of consumers (group A): joiners start idle, leavers finish their record, then the group rebalances. */
export function setConsumers(world: World, n: number): World {
  const w = clone(world);
  const g = w.groups[0];
  const staying = g.consumers.filter((c) => !c.leaving);
  if (n === staying.length) return w;
  if (n > staying.length) {
    for (let i = staying.length; i < n; i++) g.consumers.push({ id: `${g.prefix}${g.nextId++}`, partitions: [], task: null, cursor: 0, leaving: false });
    say(w, g, `${n - staying.length} consumer${n - staying.length === 1 ? '' : 's'} joined: a rebalance is requested`, 'info');
  } else {
    staying.slice(n).forEach((c) => { c.leaving = true; });
    say(w, g, `${staying.length - n} consumer${staying.length - n === 1 ? '' : 's'} leaving: a rebalance is requested`, 'info');
  }
  g.rebalance = { reason: n > staying.length ? 'consumer joined' : 'consumer left' };
  return w;
}

/** Consumer `id` of group A dies. Its record in flight is lost; a replacement takes its slot and the group rebalances. */
export function crashConsumer(world: World, id: string): World {
  const w = clone(world);
  const g = w.groups[0];
  const at = g.consumers.findIndex((c) => c.id === id);
  if (at < 0) return w;
  const dead = g.consumers[at];
  const lost = dead.task ? `its record P${dead.task.partition}@${dead.task.offset} was in flight` : 'nothing was in flight';
  g.crashed.push(id);
  g.consumers[at] = { id: `${g.prefix}${g.nextId++}`, partitions: [], task: null, cursor: 0, leaving: false };
  g.rebalance = { reason: `${id} crashed` };
  say(w, g, `${id} crashed (${lost}); a replacement joins`, 'bad');
  return w;
}

/** Is the task in the window where a crash costs a record: processed but not committed (after), committed but not processed (before)? */
export const atRisk = (policy: CommitPolicy, task: Task | null): boolean => {
  if (!task) return false;
  return policy === 'after' ? task.done === 2 : task.done >= 1;
};

/** Run ticks until consumer `id` is in the risky window, then crash it. Returns null when it never gets there within `limit` ticks. */
export function crashAtWorstMoment(world: World, id: string, limit = 3 * STEPS_PER_RECORD * MAX_CONSUMERS): World | null {
  let w = world;
  for (let i = 0; i <= limit; i++) {
    const c = w.groups[0].consumers.find((x) => x.id === id);
    if (!c) return null;
    if (atRisk(w.groups[0].policy, c.task)) return crashConsumer(w, id);
    w = advance(w);
  }
  return null;
}

/** What a consumer is doing, in words, from the steps it has finished. */
export function taskLabel(policy: CommitPolicy, c: Consumer, paused: boolean): string {
  if (c.partitions.length === 0) return c.leaving ? 'leaving' : 'idle: no partition';
  if (!c.task) return paused ? 'paused for the rebalance' : c.leaving ? 'leaving' : 'waiting for a record';
  const at = `P${c.task.partition}@${c.task.offset}`;
  const last = STEP_ORDER[policy][c.task.done - 1];
  if (policy === 'after') return last === 'process' ? `processing ${at}` : `processed ${at}, commit pending`;
  return last === 'commit' ? `committed ${at}, not processed yet` : `committed ${at}, processing`;
}

export const lag = (g: Group, logEnd: readonly number[], p: number): number => logEnd[p] - g.committed[p];
export const totalLag = (g: Group, logEnd: readonly number[]): number => logEnd.reduce((s, end, p) => s + (end - g.committed[p]), 0);

export interface Ledger {
  /** Effects applied, counting repeats. */
  effects: number;
  /** Distinct records that ran at least once. */
  distinct: number;
  /** Extra runs of a record that already ran. */
  duplicates: number;
  /** Records behind the committed offset whose effect never ran and that no consumer is working on now. */
  skipped: number;
}

export function ledger(g: Group): Ledger {
  let effects = 0;
  let distinct = 0;
  let duplicates = 0;
  let skipped = 0;
  const inFlight = new Set(g.consumers.flatMap((c) => (c.task ? [`${c.task.partition}:${c.task.offset}`] : [])));
  g.committed.forEach((committed, p) => {
    for (let off = 0; off < committed; off++) if (!g.processed[p][off] && !inFlight.has(`${p}:${off}`)) skipped++;
  });
  for (const row of g.processed) {
    for (const n of row) {
      if (!n) continue;
      effects += n;
      distinct++;
      duplicates += n - 1;
    }
  }
  return { effects, distinct, duplicates, skipped };
}

/** Group A's busy consumers: those holding a partition. */
export const busyConsumers = (g: Group): number => g.consumers.filter((c) => c.partitions.length > 0).length;

/** The world after the producer stops and every group has drained: nothing left to fetch and nothing in flight. Null if it never drains. */
export function drain(world: World, limit = 4_000): World | null {
  let w = clone(world);
  w.producing = false;
  for (let i = 0; i < limit; i++) {
    if (w.groups.every((g) => !g.rebalance && g.pause === 0 && g.consumers.every((c) => !c.task) && w.logEnd.every((end, p) => g.position[p] >= end))) return w;
    w = advance(w);
  }
  return null;
}
