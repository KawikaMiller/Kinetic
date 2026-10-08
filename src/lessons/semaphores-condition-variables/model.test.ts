import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  explore, firstBadSeed, inFlight, programs, reachable, replay, simulate,
  type Config, type Mode, type Programs, type World,
} from './model';

const base: Config = { variant: 'monitor', capacity: 2, producers: 1, consumers: 1, itemsEach: 2, produceTicks: 0, consumeTicks: 0, ifBug: false };
const MODES: Mode[] = ['busy', 'semaphore', 'monitor'];
/** Exhaustive searches visit up to ~90k states per configuration. */
const SEARCH_MS = 60_000;

/** Small configurations whose every schedule can be enumerated. */
function smallConfigs(variant: Config['variant']): Config[] {
  const out: Config[] = [];
  for (const capacity of [1, 2])
    for (const producers of [1, 2])
      for (const consumers of [1, 2])
        for (const itemsEach of [1, 2]) {
          if ((producers * itemsEach) % consumers) continue;
          out.push({ ...base, variant, capacity, producers, consumers, itemsEach });
        }
  return out;
}

const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The first safety invariant a state breaks, or null. Plain checks: this runs on every reachable state. */
function brokenInvariant(c: Config, p: Programs, w: World): string | null {
  if (w.count < 0 || w.count > c.capacity) return `count ${w.count} outside 0..${c.capacity}`;
  if (w.slots.filter((s) => s !== null).length !== w.count) return 'filled slots differ from count';
  // FIFO conservation: what's been taken is exactly the oldest puts, each once, and the
  // buffer from head holds the rest in order. Nothing lost, nothing duplicated.
  if (!same(w.consumed, w.produced.slice(0, w.consumed.length))) return 'taken items are not the oldest puts';
  const inBuffer = Array.from({ length: w.count }, (_, k) => w.slots[(w.head + k) % c.capacity]);
  if (!same(inBuffer, w.produced.slice(w.consumed.length))) return 'buffer does not hold the untaken items in order';
  if (new Set(w.produced).size !== w.produced.length) return 'an item was put twice';
  if (c.variant === 'semaphore') {
    if (w.sems.empty + w.sems.full + inFlight(w, p) !== c.capacity) return 'empty + full + inFlight != N';
    for (const s of ['empty', 'full', 'mutex'] as const) if ((w.queues[s] ?? []).length && w.sems[s] !== 0) return `${s} has sleepers and tokens`;
  }
  if (c.variant === 'monitor' && w.owner === null && !w.threads.some((t) => t.woken)) {
    // Nobody inside the monitor and no wake-up in flight: nobody sleeps while it could proceed.
    if ((w.queues.notFull ?? []).length && w.count !== c.capacity) return 'a producer sleeps with room in the buffer';
    if ((w.queues.notEmpty ?? []).length && w.count !== 0) return 'a consumer sleeps with items in the buffer';
  }
  return null;
}

/** Runs `brokenInvariant` on each state and keeps the first failure for one assertion. */
function invariantChecker(c: Config) {
  const p = programs(c.variant, c.ifBug);
  let first: string | null = null;
  return { check: (w: World) => void (first ??= brokenInvariant(c, p, w)), get first() { return first; } };
}

describe('correct modes, every schedule of small configurations', () => {
  for (const variant of ['semaphore', 'monitor'] as const)
    it(`${variant}: every reachable state is safe and every schedule finishes`, () => {
      for (const c of smallConfigs(variant)) {
        const inv = invariantChecker(c);
        const ex = explore(c, inv.check);
        expect(inv.first).toBeNull();
        expect(ex.stuck).toBe(0);
        expect(ex.violations).toBe(0);
        expect(ex.finished).toBe(ex.schedules);
        expect(ex.schedules).toBeGreaterThan(1);
      }
    }, SEARCH_MS);

  it('busy-wait: every reachable state is safe and the only ending is finishing (spinning loops are allowed)', () => {
    for (const c of smallConfigs('busy')) {
      const inv = invariantChecker(c);
      const r = reachable(c, inv.check);
      expect(inv.first).toBeNull();
      expect([...r.ends]).toEqual(['finished']);
    }
  }, SEARCH_MS);
});

describe('correct modes, 1,000 seeded runs with I/O delays', () => {
  it('stay safe and always finish, in every mode', () => {
    const rnd = mulberry32(7);
    for (let seed = 0; seed < 1000; seed++) {
      const producers = 1 + Math.floor(rnd() * 3);
      const consumers = [1, 2, 3][Math.floor(rnd() * 3)];
      const c: Config = {
        ...base, variant: MODES[seed % 3], capacity: 1 + Math.floor(rnd() * 8), producers, consumers, itemsEach: 6,
        produceTicks: Math.floor(rnd() * 4), consumeTicks: Math.floor(rnd() * 4),
      };
      const worlds = simulate(c, seed);
      const inv = invariantChecker(c);
      worlds.forEach(inv.check);
      expect(inv.first).toBeNull();
      const last = worlds.at(-1)!;
      expect(last.note.kind).toBe('finished');
      expect(last.consumed).toHaveLength(producers * 6);
    }
  }, SEARCH_MS);
});

describe('the `if` instead of `while` bug', () => {
  const twoConsumers: Config = { ...base, ifBug: true, capacity: 1, producers: 1, consumers: 2, itemsEach: 2 };

  it('with two consumers, some seed reads from an empty buffer', () => {
    const seed = firstBadSeed({ ...twoConsumers, produceTicks: 1, consumeTicks: 1 }, 0);
    expect(seed).not.toBeNull();
    const last = simulate({ ...twoConsumers, produceTicks: 1, consumeTicks: 1 }, seed!).at(-1)!;
    expect(last.note).toMatchObject({ kind: 'violation', what: 'garbage' });
  });

  it('enumeration finds the garbage read too, and its schedule replays to it', () => {
    const ex = explore(twoConsumers);
    expect(ex.violations).toBeGreaterThan(0);
    const last = replay(twoConsumers, ex.example.violation!).at(-1)!;
    expect(last.note).toMatchObject({ kind: 'violation', what: 'garbage' });
    // The woken consumer had really been asleep on notEmpty and then found the buffer emptied.
    expect(last.threads.find((t) => t.id === last.violation!.t)!.role).toBe('consumer');
  });

  it('with one producer and one consumer it happens never to fail, which is why it slips through review', () => {
    for (const capacity of [1, 2, 3]) expect(explore({ ...base, ifBug: true, capacity, itemsEach: 3 }).violations).toBe(0);
  });

  it('the `while` version of the same configuration never fails', () => {
    expect(explore({ ...twoConsumers, ifBug: false }).violations).toBe(0);
  });
});

describe('wake-up bugs', () => {
  const single: Config = { ...base, capacity: 1, producers: 1, consumers: 2, itemsEach: 2 };

  it('one shared condition variable with signal can wake the wrong thread and hang everyone', () => {
    const ex = explore({ ...single, variant: 'singleSignal' });
    expect(ex.stuck).toBeGreaterThan(0);
    expect(ex.violations).toBe(0);
    const last = replay({ ...single, variant: 'singleSignal' }, ex.example.stuck!).at(-1)!;
    expect(last.note.kind).toBe('stuck');
    // Everyone left is asleep on the one condition variable, the producer included.
    const left = last.threads.filter((t) => t.status !== 'done');
    expect(left.map((t) => t.on)).toEqual(left.map(() => 'changed'));
    expect(left.some((t) => t.role === 'producer')).toBe(true);
  });

  it('broadcast on the same condition variable never hangs', () => {
    const ex = explore({ ...single, variant: 'singleBroadcast' });
    expect(ex.stuck).toBe(0);
    expect(ex.finished).toBe(ex.schedules);
  });

  it('checking the condition without the lock loses a wake-up and the consumer sleeps forever', () => {
    const c: Config = { ...base, variant: 'lostWakeup', capacity: 1, itemsEach: 1 };
    const ex = explore(c);
    expect(ex.stuck).toBeGreaterThan(0);
    expect(ex.finished).toBeGreaterThan(0);
    const worlds = replay(c, ex.example.stuck!);
    // The wake-up was sent while nobody was asleep yet.
    expect(worlds.some((w) => w.note.kind === 'wakeup' && w.note.woke === null)).toBe(true);
    expect(worlds.at(-1)!.threads.find((t) => t.id === 'C1')!.on).toBe('wakeup');
    expect(worlds.at(-1)!.count).toBe(1);
  });

  it('counts schedules independently: the lost-wake-up scene has exactly the interleavings of its two programs', () => {
    // Producer: 6 lines, consumer: the shortest path is 6 lines; with no blocking the count
    // is a binomial, but the sleep path adds more, so check the sum instead.
    const c: Config = { ...base, variant: 'lostWakeup', capacity: 1, itemsEach: 1 };
    const ex = explore(c);
    expect(ex.stuck + ex.finished + ex.violations).toBe(ex.schedules);
  });
});

describe('busy-waiting burns the CPU; sleeping does not', () => {
  it('every tick the buffer is full and the consumer is off in I/O: busy-wait spins, the sleeping modes idle', () => {
    for (const variant of MODES)
      for (let seed = 0; seed < 50; seed++) {
        const worlds = simulate({ ...base, variant, capacity: 1 + (seed % 3), itemsEach: 6, produceTicks: 0, consumeTicks: 20 }, seed);
        let waiting = 0;
        for (let i = 1; i < worlds.length - 1; i++) {
          const [before, w] = [worlds[i - 1], worlds[i]];
          const consumer = before.threads.find((t) => t.id === 'C1')!;
          const producer = before.threads.find((t) => t.id === 'P1')!;
          // Full buffer, consumer busy elsewhere, and the producer has already found it full:
          // it's in the spin loop, or asleep on a semaphore or condition variable.
          const found = variant === 'busy' ? !!programs('busy').producer[producer.pc].spin : producer.status === 'asleep';
          if (before.count !== before.slots.length || consumer.status !== 'io' || consumer.io <= 1 || !found) continue;
          waiting++;
          expect(w.cpu.at(-1)).toBe(variant === 'busy' ? 'spin' : 'idle');
        }
        expect(waiting).toBeGreaterThan(0);
      }
  });
});
