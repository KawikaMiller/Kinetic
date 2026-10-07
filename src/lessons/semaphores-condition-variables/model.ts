// Pure model behind semaphores-condition-variables: producer and consumer threads run
// small programs one line per tick on one simulated CPU, sharing a bounded buffer (a ring
// of `capacity` slots). Every waiting primitive is modelled the way real ones behave:
//  - the mutex m lets threads barge: unlock frees it and every thread blocked on it retries;
//  - a semaphore hands its token straight to the thread it wakes (Dijkstra's P and V);
//  - a condition variable is Mesa-style: wait releases m and sleeps, a signal only makes a
//    sleeper ready, and the sleeper must take m again before it carries on. A wake-up is a hint.
import { mulberry32, type Rnd } from '../../core/random';

export type Mode = 'busy' | 'semaphore' | 'monitor';
/** The bounded-buffer modes plus the wake-up bug scenes. */
export type Variant = Mode | 'singleSignal' | 'singleBroadcast' | 'lostWakeup';
export type Role = 'producer' | 'consumer';
type Sem = 'empty' | 'full' | 'mutex';
type Cv = 'notFull' | 'notEmpty' | 'changed';

export type Op =
  | { op: 'produce' }
  | { op: 'consume' }
  | { op: 'lock'; then?: number }
  | { op: 'unlock' }
  | { op: 'P'; s: Sem }
  | { op: 'V'; s: Sem }
  /** while/if (cond): fall through when it holds, else jump to `exit`. */
  | { op: 'test'; cond: 'full' | 'empty'; exit: number }
  | { op: 'wait'; cv: Cv; after: number }
  | { op: 'signal'; cv: Cv }
  | { op: 'broadcast'; cv: Cv }
  | { op: 'put' }
  | { op: 'take' }
  | { op: 'sleep'; then: number }
  | { op: 'wakeup' }
  | { op: 'next' };

export interface Line {
  text: string;
  op: Op;
  /** Part of a busy-wait loop: time spent here is spinning. */
  spin?: boolean;
}

export interface Programs {
  producer: Line[];
  consumer: Line[];
}

/** The two programs for a variant. `ifBug` swaps `while` for `if` around the condition wait. */
export function programs(v: Variant, ifBug = false): Programs {
  const kw = ifBug ? 'if' : 'while';
  if (v === 'busy')
    return {
      producer: [
        { text: 'item = produce()', op: { op: 'produce' } },
        { text: 'lock(m)', op: { op: 'lock' } },
        { text: 'while (count == N) {', op: { op: 'test', cond: 'full', exit: 5 }, spin: true },
        { text: '  unlock(m)', op: { op: 'unlock' }, spin: true },
        { text: '  lock(m) }', op: { op: 'lock', then: 2 }, spin: true },
        { text: 'put(item)', op: { op: 'put' } },
        { text: 'unlock(m)', op: { op: 'unlock' } },
        { text: '} // next item', op: { op: 'next' } },
      ],
      consumer: [
        { text: 'lock(m)', op: { op: 'lock' } },
        { text: 'while (count == 0) {', op: { op: 'test', cond: 'empty', exit: 4 }, spin: true },
        { text: '  unlock(m)', op: { op: 'unlock' }, spin: true },
        { text: '  lock(m) }', op: { op: 'lock', then: 1 }, spin: true },
        { text: 'item = take()', op: { op: 'take' } },
        { text: 'unlock(m)', op: { op: 'unlock' } },
        { text: 'consume(item)', op: { op: 'consume' } },
        { text: '} // next item', op: { op: 'next' } },
      ],
    };
  if (v === 'semaphore')
    return {
      producer: [
        { text: 'item = produce()', op: { op: 'produce' } },
        { text: 'wait(empty)', op: { op: 'P', s: 'empty' } },
        { text: 'wait(mutex)', op: { op: 'P', s: 'mutex' } },
        { text: 'put(item)', op: { op: 'put' } },
        { text: 'signal(mutex)', op: { op: 'V', s: 'mutex' } },
        { text: 'signal(full)', op: { op: 'V', s: 'full' } },
        { text: '} // next item', op: { op: 'next' } },
      ],
      consumer: [
        { text: 'wait(full)', op: { op: 'P', s: 'full' } },
        { text: 'wait(mutex)', op: { op: 'P', s: 'mutex' } },
        { text: 'item = take()', op: { op: 'take' } },
        { text: 'signal(mutex)', op: { op: 'V', s: 'mutex' } },
        { text: 'signal(empty)', op: { op: 'V', s: 'empty' } },
        { text: 'consume(item)', op: { op: 'consume' } },
        { text: '} // next item', op: { op: 'next' } },
      ],
    };
  if (v === 'lostWakeup')
    return {
      producer: [
        { text: 'item = produce()', op: { op: 'produce' } },
        { text: 'lock(m)', op: { op: 'lock' } },
        { text: 'put(item)', op: { op: 'put' } },
        { text: 'unlock(m)', op: { op: 'unlock' } },
        { text: 'wakeup(consumer)', op: { op: 'wakeup' } },
        { text: '} // next item', op: { op: 'next' } },
      ],
      consumer: [
        { text: 'while (count == 0)  // no lock held', op: { op: 'test', cond: 'empty', exit: 2 } },
        { text: '  sleep()', op: { op: 'sleep', then: 0 } },
        { text: 'lock(m)', op: { op: 'lock' } },
        { text: 'item = take()', op: { op: 'take' } },
        { text: 'unlock(m)', op: { op: 'unlock' } },
        { text: 'consume(item)', op: { op: 'consume' } },
        { text: '} // next item', op: { op: 'next' } },
      ],
    };
  // monitor, or the single-condition-variable scenes
  const single = v !== 'monitor';
  const [notFull, notEmpty]: Cv[] = single ? ['changed', 'changed'] : ['notFull', 'notEmpty'];
  const wake = (cv: Cv): Line =>
    v === 'singleBroadcast' ? { text: `broadcast(${cv})`, op: { op: 'broadcast', cv } } : { text: `signal(${cv})`, op: { op: 'signal', cv } };
  return {
    producer: [
      { text: 'item = produce()', op: { op: 'produce' } },
      { text: 'lock(m)', op: { op: 'lock' } },
      { text: `${kw} (count == N)`, op: { op: 'test', cond: 'full', exit: 4 } },
      { text: `  wait(${notFull}, m)`, op: { op: 'wait', cv: notFull, after: ifBug ? 4 : 2 } },
      { text: 'put(item)', op: { op: 'put' } },
      wake(notEmpty),
      { text: 'unlock(m)', op: { op: 'unlock' } },
      { text: '} // next item', op: { op: 'next' } },
    ],
    consumer: [
      { text: 'lock(m)', op: { op: 'lock' } },
      { text: `${kw} (count == 0)`, op: { op: 'test', cond: 'empty', exit: 3 } },
      { text: `  wait(${notEmpty}, m)`, op: { op: 'wait', cv: notEmpty, after: ifBug ? 3 : 1 } },
      { text: 'item = take()', op: { op: 'take' } },
      wake(notFull),
      { text: 'unlock(m)', op: { op: 'unlock' } },
      { text: 'consume(item)', op: { op: 'consume' } },
      { text: '} // next item', op: { op: 'next' } },
    ],
  };
}

export interface Config {
  variant: Variant;
  capacity: number;
  producers: number;
  consumers: number;
  /** Items each producer makes; the consumers split the total evenly. */
  itemsEach: number;
  /** Ticks produce() and consume() spend off the CPU (illustrative I/O). 0 = instant. */
  produceTicks: number;
  consumeTicks: number;
  ifBug: boolean;
}

export type ThreadStatus = 'ready' | 'blocked' | 'asleep' | 'io' | 'done';

export interface Thread {
  id: string;
  role: Role;
  pc: number;
  /** Items still to make or take, this one included. */
  left: number;
  item: string | null;
  made: number;
  status: ThreadStatus;
  /** What it's blocked or asleep on: 'm', a semaphore, a condition variable or 'wakeup'. */
  on: string | null;
  io: number;
  /** Woken from a condition wait: must take m again before it carries on. */
  woken: boolean;
}

export type Note =
  | { kind: 'start' }
  | { kind: 'idle' }
  | { kind: 'produce'; t: string; item: string; io: boolean }
  | { kind: 'consume'; t: string; item: string; io: boolean }
  | { kind: 'lock'; t: string; got: boolean; holder: string | null; spin: boolean; retake: boolean }
  | { kind: 'unlock'; t: string; spin: boolean; retry: string[] }
  | { kind: 'P'; t: string; s: Sem; got: boolean }
  | { kind: 'V'; t: string; s: Sem; woke: string | null }
  | { kind: 'test'; t: string; cond: 'full' | 'empty'; holds: boolean; count: number; spin: boolean; keyword: 'while' | 'if' }
  | { kind: 'wait'; t: string; cv: Cv }
  | { kind: 'signal'; t: string; cv: Cv; woke: string[]; broadcast: boolean }
  | { kind: 'put'; t: string; item: string; slot: number; overflow: boolean }
  | { kind: 'take'; t: string; item: string | null; slot: number; garbage: boolean }
  | { kind: 'sleep'; t: string }
  | { kind: 'wakeup'; t: string; woke: string | null }
  | { kind: 'next'; t: string; done: boolean }
  | { kind: 'finished' }
  | { kind: 'stuck'; asleep: string[] }
  | { kind: 'violation'; what: 'garbage' | 'overflow'; t: string }
  | { kind: 'limit' };

export type CpuUse = 'work' | 'spin' | 'idle';

export interface World {
  tick: number;
  count: number;
  slots: (string | null)[];
  head: number;
  tail: number;
  sems: Record<Sem, number>;
  queues: Record<string, string[]>;
  owner: string | null;
  threads: Thread[];
  /** Item ids in the order they were put in the buffer. */
  produced: string[];
  /** Item ids in the order they were taken out (a garbage read is not counted). */
  consumed: string[];
  violation: { what: 'garbage' | 'overflow'; t: string } | null;
  /** What the CPU did each tick so far. */
  cpu: CpuUse[];
  /** Thread that ran this tick, and the line it ran. */
  active: string | null;
  line: number | null;
  note: Note;
}

export const consumerShare = (c: Pick<Config, 'producers' | 'consumers' | 'itemsEach'>) => (c.producers * c.itemsEach) / c.consumers;

export function initialWorld(c: Config): World {
  const share = consumerShare(c);
  if (!Number.isInteger(share)) throw new RangeError('consumers must split the items evenly');
  const threads: Thread[] = [
    ...Array.from({ length: c.producers }, (_, i): Thread => ({
      id: `P${i + 1}`, role: 'producer', pc: 0, left: c.itemsEach, item: null, made: 0, status: 'ready', on: null, io: 0, woken: false,
    })),
    ...Array.from({ length: c.consumers }, (_, i): Thread => ({
      id: `C${i + 1}`, role: 'consumer', pc: 0, left: share, item: null, made: 0, status: 'ready', on: null, io: 0, woken: false,
    })),
  ];
  return {
    tick: 0, count: 0, slots: Array<string | null>(c.capacity).fill(null), head: 0, tail: 0,
    sems: { empty: c.capacity, full: 0, mutex: 1 }, queues: {}, owner: null, threads,
    produced: [], consumed: [], violation: null, cpu: [], active: null, line: null, note: { kind: 'start' },
  };
}

const clone = (w: World): World => ({
  ...w,
  slots: [...w.slots],
  sems: { ...w.sems },
  queues: Object.fromEntries(Object.entries(w.queues).map(([k, v]) => [k, [...v]])),
  threads: w.threads.map((t) => ({ ...t })),
  produced: [...w.produced],
  consumed: [...w.consumed],
  cpu: [...w.cpu],
});

const enqueue = (w: World, q: string, t: string) => (w.queues[q] = [...(w.queues[q] ?? []), t]);
const dequeue = (w: World, q: string) => {
  const list = w.queues[q] ?? [];
  const first = list[0] ?? null;
  w.queues[q] = list.slice(1);
  return first;
};
const byId = (w: World, id: string) => w.threads.find((t) => t.id === id)!;

/** Release m: it's free, and every thread blocked on it gets to retry (barging, like pthreads). */
function releaseM(w: World): string[] {
  w.owner = null;
  const retry = w.queues.m ?? [];
  w.queues.m = [];
  for (const id of retry) Object.assign(byId(w, id), { status: 'ready', on: null });
  return retry;
}

/** Threads that could run this tick. */
export const readyThreads = (w: World) => w.threads.filter((t) => t.status === 'ready');

/** Run one line of thread `t` (it must be ready). */
function exec(w: World, t: Thread, p: Programs, c: Config): Note {
  const prog = p[t.role];
  const line = prog[t.pc];
  const op = line.op;
  switch (op.op) {
    case 'produce': {
      t.made++;
      t.item = `${t.id}·${t.made}`;
      t.pc++;
      if (c.produceTicks > 0) Object.assign(t, { status: 'io', io: c.produceTicks });
      return { kind: 'produce', t: t.id, item: t.item, io: c.produceTicks > 0 };
    }
    case 'consume': {
      const item = t.item ?? '?';
      t.pc++;
      if (c.consumeTicks > 0) Object.assign(t, { status: 'io', io: c.consumeTicks });
      return { kind: 'consume', t: t.id, item, io: c.consumeTicks > 0 };
    }
    case 'lock': {
      if (w.owner === null) {
        w.owner = t.id;
        t.pc = op.then ?? t.pc + 1;
        return { kind: 'lock', t: t.id, got: true, holder: null, spin: !!line.spin, retake: false };
      }
      const holder = w.owner;
      Object.assign(t, { status: 'blocked', on: 'm' });
      enqueue(w, 'm', t.id);
      return { kind: 'lock', t: t.id, got: false, holder, spin: !!line.spin, retake: false };
    }
    case 'unlock': {
      t.pc++;
      return { kind: 'unlock', t: t.id, spin: !!line.spin, retry: releaseM(w) };
    }
    case 'P': {
      if (w.sems[op.s] > 0) {
        w.sems[op.s]--;
        t.pc++;
        return { kind: 'P', t: t.id, s: op.s, got: true };
      }
      Object.assign(t, { status: 'asleep', on: op.s });
      enqueue(w, op.s, t.id);
      return { kind: 'P', t: t.id, s: op.s, got: false };
    }
    case 'V': {
      t.pc++;
      const sleeper = dequeue(w, op.s);
      if (sleeper) {
        // Hand the token straight to the sleeper: its wait() completes.
        const s = byId(w, sleeper);
        Object.assign(s, { status: 'ready', on: null, pc: s.pc + 1 });
      } else w.sems[op.s]++;
      return { kind: 'V', t: t.id, s: op.s, woke: sleeper };
    }
    case 'test': {
      const holds = op.cond === 'full' ? w.count === c.capacity : w.count === 0;
      t.pc = holds ? t.pc + 1 : op.exit;
      const keyword = line.text.startsWith('if') ? 'if' : 'while';
      return { kind: 'test', t: t.id, cond: op.cond, holds, count: w.count, spin: !!line.spin && holds, keyword };
    }
    case 'wait': {
      if (t.woken) {
        // Woken earlier: take m again before carrying on after the wait.
        if (w.owner === null) {
          w.owner = t.id;
          t.woken = false;
          t.pc = op.after;
          return { kind: 'lock', t: t.id, got: true, holder: null, spin: false, retake: true };
        }
        const holder = w.owner;
        Object.assign(t, { status: 'blocked', on: 'm' });
        enqueue(w, 'm', t.id);
        return { kind: 'lock', t: t.id, got: false, holder, spin: false, retake: true };
      }
      // Atomically: release m and go to sleep on the condition variable.
      releaseM(w);
      Object.assign(t, { status: 'asleep', on: op.cv });
      enqueue(w, op.cv, t.id);
      return { kind: 'wait', t: t.id, cv: op.cv };
    }
    case 'signal':
    case 'broadcast': {
      t.pc++;
      const woke = op.op === 'broadcast' ? [...(w.queues[op.cv] ?? [])] : [dequeue(w, op.cv)].filter((x): x is string => x !== null);
      if (op.op === 'broadcast') w.queues[op.cv] = [];
      for (const id of woke) Object.assign(byId(w, id), { status: 'ready', on: null, woken: true });
      return { kind: 'signal', t: t.id, cv: op.cv, woke, broadcast: op.op === 'broadcast' };
    }
    case 'put': {
      const slot = w.tail;
      const overflow = w.count === c.capacity;
      const item = t.item ?? '?';
      if (overflow) w.violation = { what: 'overflow', t: t.id };
      w.slots[slot] = item;
      w.tail = (w.tail + 1) % c.capacity;
      w.count++;
      w.produced.push(item);
      t.item = null;
      t.pc++;
      return { kind: 'put', t: t.id, item, slot, overflow };
    }
    case 'take': {
      const slot = w.head;
      const garbage = w.count === 0;
      const item = w.slots[slot];
      if (garbage) w.violation = { what: 'garbage', t: t.id };
      else {
        w.consumed.push(item!);
        w.slots[slot] = null;
        w.head = (w.head + 1) % c.capacity;
      }
      w.count--;
      t.item = garbage ? null : item;
      t.pc++;
      return { kind: 'take', t: t.id, item: garbage ? null : item, slot, garbage };
    }
    case 'sleep': {
      Object.assign(t, { status: 'asleep', on: 'wakeup', pc: op.then });
      enqueue(w, 'wakeup', t.id);
      return { kind: 'sleep', t: t.id };
    }
    case 'wakeup': {
      t.pc++;
      const sleeper = dequeue(w, 'wakeup');
      if (sleeper) Object.assign(byId(w, sleeper), { status: 'ready', on: null });
      return { kind: 'wakeup', t: t.id, woke: sleeper };
    }
    case 'next': {
      t.left--;
      t.item = null;
      if (t.left > 0) t.pc = 0;
      else t.status = 'done';
      return { kind: 'next', t: t.id, done: t.left === 0 };
    }
  }
}

/** Time passes: threads whose I/O finishes become ready. */
function passTime(w: World) {
  for (const t of w.threads) if (t.status === 'io' && --t.io <= 0) Object.assign(t, { status: 'ready', io: 0 });
}

/** The outcome once nobody is ready and no I/O is pending, else null. */
export function terminal(w: World): Note | null {
  if (w.violation) return { kind: 'violation', ...w.violation };
  if (w.threads.every((t) => t.status === 'done')) return { kind: 'finished' };
  if (readyThreads(w).length === 0 && !w.threads.some((t) => t.status === 'io'))
    return { kind: 'stuck', asleep: w.threads.filter((t) => t.status !== 'done').map((t) => t.id) };
  return null;
}

/** One tick: `pick` chooses among the ready threads (their indexes in w.threads). */
export function tick(w0: World, p: Programs, c: Config, pick: (ready: number[]) => number): World {
  const w = clone(w0);
  w.tick++;
  passTime(w);
  const ready = w.threads.map((t, i) => (t.status === 'ready' ? i : -1)).filter((i) => i >= 0);
  if (ready.length === 0) {
    Object.assign(w, { active: null, line: null, note: { kind: 'idle' } });
    w.cpu.push('idle');
    return w;
  }
  const t = w.threads[pick(ready)];
  const line = t.pc;
  const spinning = !!p[t.role][line].spin;
  w.note = exec(w, t, p, c);
  // A busy-wait check that finds the way clear is useful work; one that loops back is spin.
  const spun = spinning && !(w.note.kind === 'test' && !w.note.holds);
  w.cpu.push(spun ? 'spin' : 'work');
  w.active = t.id;
  w.line = line;
  return w;
}

export const MAX_TICKS = 600;

/** Run to the end with a seeded scheduler. One world per tick; the last one carries the verdict. */
export function simulate(c: Config, seed: number): World[] {
  const p = programs(c.variant, c.ifBug);
  const rnd: Rnd = mulberry32(seed);
  let w = initialWorld(c);
  const worlds = [w];
  for (let i = 0; i < MAX_TICKS; i++) {
    const end = terminal(w);
    if (end) {
      worlds.push({ ...w, active: null, line: null, note: end });
      return worlds;
    }
    w = tick(w, p, c, (ready) => ready[Math.floor(rnd() * ready.length)]);
    worlds.push(w);
  }
  worlds.push({ ...w, active: null, line: null, note: { kind: 'limit' } });
  return worlds;
}

/** Threads that are between passing wait(empty|full) and their matching signal(full|empty). */
export function inFlight(w: World, p: Programs): number {
  let n = 0;
  for (const t of w.threads) {
    const prog = p[t.role];
    const passed = prog.findIndex((l) => l.op.op === 'P' && (l.op.s === 'empty' || l.op.s === 'full'));
    const released = prog.findIndex((l) => l.op.op === 'V' && (l.op.s === 'full' || l.op.s === 'empty'));
    if (t.status !== 'done' && t.pc > passed && t.pc <= released) n++;
  }
  return n;
}

// ---- exhaustive exploration of every schedule, for small configurations ----

/** Exploration ignores CPU use, so it doesn't carry (and copy) the growing history. */
const withoutCpu = (w: World): World => ({ ...w, cpu: [] });

const keyOf = (w: World) =>
  JSON.stringify([w.count, w.slots, w.head, w.tail, w.sems, w.queues, w.owner, w.threads.map((t) => [t.pc, t.left, t.item, t.made, t.status, t.on, t.woken]), w.violation, w.consumed]);

export interface Exploration {
  states: number;
  /** Complete schedules (choice sequences from the start to an end). */
  schedules: number;
  stuck: number;
  violations: number;
  finished: number;
  /** One schedule (ready-thread ids in order) per outcome, the first found. */
  example: Partial<Record<'finished' | 'stuck' | 'violation', string[]>>;
}

/**
 * Every interleaving of a configuration with no I/O delay, counted by schedule. `check`
 * runs on every reachable state. Throws if the state graph has a cycle (a spin loop), since
 * schedules could then be infinitely long; use `reachable` for those.
 */
export function explore(c: Config, check?: (w: World) => void): Exploration {
  if (c.produceTicks || c.consumeTicks) throw new RangeError('explore models instant produce/consume');
  const p = programs(c.variant, c.ifBug);
  const memo = new Map<string, { schedules: number; stuck: number; violations: number; finished: number }>();
  const onPath = new Set<string>();
  const ex: Exploration = { states: 0, schedules: 0, stuck: 0, violations: 0, finished: 0, example: {} };
  const visit = (w: World, path: string[]): { schedules: number; stuck: number; violations: number; finished: number } => {
    const key = keyOf(w);
    const hit = memo.get(key);
    if (hit) return hit;
    if (onPath.has(key)) throw new Error('state cycle: schedules are unbounded');
    check?.(w);
    ex.states++;
    const end = terminal(w);
    if (end) {
      const kind = end.kind === 'finished' ? 'finished' : end.kind === 'stuck' ? 'stuck' : 'violation';
      ex.example[kind] ??= path;
      const r = { schedules: 1, stuck: +(kind === 'stuck'), violations: +(kind === 'violation'), finished: +(kind === 'finished') };
      memo.set(key, r);
      return r;
    }
    onPath.add(key);
    const total = { schedules: 0, stuck: 0, violations: 0, finished: 0 };
    for (const i of w.threads.map((t, k) => (t.status === 'ready' ? k : -1)).filter((k) => k >= 0)) {
      const r = visit(withoutCpu(tick(w, p, c, () => i)), [...path, w.threads[i].id]);
      total.schedules += r.schedules;
      total.stuck += r.stuck;
      total.violations += r.violations;
      total.finished += r.finished;
    }
    onPath.delete(key);
    memo.set(key, total);
    return total;
  };
  Object.assign(ex, visit(initialWorld(c), []));
  return ex;
}

/** Every reachable state (spin loops allowed), with `check` on each; returns the terminal notes seen. */
export function reachable(c: Config, check?: (w: World) => void): { states: number; ends: Set<Note['kind']> } {
  const p = programs(c.variant, c.ifBug);
  const seen = new Set<string>();
  const ends = new Set<Note['kind']>();
  const stack = [initialWorld(c)];
  while (stack.length) {
    const w = stack.pop()!;
    const key = keyOf(w);
    if (seen.has(key)) continue;
    seen.add(key);
    check?.(w);
    const end = terminal(w);
    if (end) {
      ends.add(end.kind);
      continue;
    }
    for (const i of w.threads.map((t, k) => (t.status === 'ready' ? k : -1)).filter((k) => k >= 0)) stack.push(withoutCpu(tick(w, p, c, () => i)));
  }
  return { states: seen.size, ends };
}

/** Replay a schedule given as thread ids (one per tick), from the start. */
export function replay(c: Config, schedule: readonly string[]): World[] {
  const p = programs(c.variant, c.ifBug);
  let w = initialWorld(c);
  const worlds = [w];
  for (const id of schedule) {
    w = tick(w, p, c, (ready) => ready.find((i) => w.threads[i].id === id) ?? ready[0]);
    worlds.push(w);
  }
  const end = terminal(w);
  if (end) worlds.push({ ...w, active: null, line: null, note: end });
  return worlds;
}

/** The first seed from `from` on whose run ends in a violation or a hang, or null within `tries`. */
export function firstBadSeed(c: Config, from: number, tries = 200): number | null {
  for (let s = from; s < from + tries; s++) {
    const k = simulate(c, s).at(-1)!.note.kind;
    if (k === 'violation' || k === 'stuck') return s;
  }
  return null;
}
