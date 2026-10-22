import { describe, expect, it } from 'vitest';
import { SEED_MAX } from '../../core/seed';
import { add, emptyRep, inc, merge, remove, setReg, setValue, valueKey, type Kind, type Mode } from './crdt';
import {
  buildSchedule, canonical, checkLaws, checkSchedules, describeSchedules, loadedWorld, NAIVE_WITNESS, runSchedule, SCHEDULE_SEEDS,
} from './schedule';
import { agree, freshWorld, landAll, localEdit, lostIncrements, setOnline, startSync, syncOrder, syncOutcome, TRY_INCREMENTS, valuesOf, DEFAULT_SEED } from './world';
import lesson from './index';

const KINDS: Kind[] = ['counter', 'set', 'register'];

describe('merge, on hand-worked vectors', () => {
  it('G-Counter: slot-wise maximum, value is the sum, a repeat changes nothing', () => {
    // A has pressed +1 three times, B twice: the merged slots are {A: 3, B: 2, C: 0}, the sum is 5.
    const a = [1, 2, 3].reduce((s) => inc(s, 'A'), emptyRep());
    const b = [1, 2].reduce((s) => inc(s, 'B'), emptyRep());
    const m = merge(a, b, 'counter', 'crdt');
    expect(m.vec).toEqual({ A: 3, B: 2, C: 0 });
    expect(valueKey(m, 'counter', 'crdt')).toBe('5');
    expect(canonical(merge(m, m, 'counter', 'crdt'), 'counter', 'crdt')).toBe(canonical(m, 'counter', 'crdt'));
  });

  it('OR-Set: a remove cancels the tags it saw, so a concurrent add survives', () => {
    const a1 = add(emptyRep(), 'A', '🍎'); // tag A1
    const b = merge(emptyRep(), a1, 'set', 'crdt'); // B has seen A1
    const bRemoved = remove(b, '🍎'); // B removes A1
    const aAgain = add(a1, 'A', '🍎'); // A adds again: a fresh tag A2
    const m = merge(aAgain, bRemoved, 'set', 'crdt');
    expect(setValue(m, 'crdt')).toEqual(['🍎']);
    expect(m.removed).toEqual(['A1']);
    // Without the concurrent add, the remove wins.
    expect(setValue(merge(a1, bRemoved, 'set', 'crdt'), 'crdt')).toEqual([]);
  });

  it('LWW-Register: the higher timestamp wins, a tie goes to the higher replica id', () => {
    const a = setReg(emptyRep(), 'A', 'red'); // ts 1 by A
    const b = setReg(emptyRep(), 'B', 'blue'); // ts 1 by B
    expect(merge(a, b, 'register', 'crdt').reg?.v).toBe('blue');
    expect(merge(b, a, 'register', 'crdt').reg?.v).toBe('blue');
    const later = setReg(setReg(emptyRep(), 'A', 'x'), 'A', 'green'); // ts 2
    expect(merge(later, b, 'register', 'crdt').reg?.v).toBe('green');
  });

  it('naive overwrite keeps whatever arrives last', () => {
    const a = [1, 2, 3].reduce((s) => inc(s, 'A'), emptyRep());
    const b = [1, 2].reduce((s) => inc(s, 'B'), emptyRep());
    expect(merge(a, b, 'counter', 'naive').n).toBe(2);
    expect(merge(b, a, 'counter', 'naive').n).toBe(3);
  });
});

describe.each(KINDS)('the %s CRDT over seeded random schedules', (kind) => {
  it(`obeys the three merge laws on all ${SCHEDULE_SEEDS} seeds (any order, duplicates, partitions)`, () => {
    const laws = checkLaws(kind, 'crdt');
    expect(laws).toMatchObject({ seeds: SCHEDULE_SEEDS, commutative: 0, associative: 0, idempotent: 0 });
  });

  it(`ends with every replica on the value the edit log works out, on all ${SCHEDULE_SEEDS} seeds`, () => {
    const check = checkSchedules(kind, 'crdt');
    expect(check.failures).toBe(0);
    expect(check.lowest).toBeNull();
  });

  it('breaks the laws when the merge is the naive overwrite', () => {
    const laws = checkLaws(kind, 'naive');
    expect(laws.commutative + laws.associative + laws.idempotent).toBeGreaterThan(0);
  });
});

describe.each(KINDS)('the naive overwrite of the %s', (kind) => {
  const check = checkSchedules(kind, 'naive');

  it('pins the shortest failing schedule with the exact reason it fails: a witness, not just the first seed that happens to fail', () => {
    const witness = NAIVE_WITNESS[kind];
    expect(check.shortest?.seed).toBe(witness.seed);
    expect(check.shortest?.actions).toHaveLength(witness.actions);
    expect(check.shortest?.problem).toBe(witness.problem);
    // No failing seed has fewer actions than the witness.
    for (let seed = 1; seed <= SCHEDULE_SEEDS; seed += 1) {
      const run = runSchedule(seed, kind, 'naive');
      if (run.problem) expect(run.actions.length, `seed ${seed}`).toBeGreaterThanOrEqual(witness.actions);
    }
  });

  it('is not failing everywhere: some seeds, at most 90% of them, and the CRDT passes the same seeds', () => {
    expect(check.failures).toBeGreaterThan(0);
    expect(check.failures).toBeLessThanOrEqual(SCHEDULE_SEEDS * 0.9);
    for (let seed = 1; seed <= SCHEDULE_SEEDS; seed += 1) expect(runSchedule(seed, kind, 'crdt').problem, `seed ${seed}`).toBeNull();
  });

  it('prints the numbers the check produced', () => {
    const text = describeSchedules(check, checkLaws(kind, 'naive'));
    expect(text).toContain(`${check.failures} of ${SCHEDULE_SEEDS} seeds`);
    const w = NAIVE_WITNESS[kind];
    expect(text).toContain(`Shortest failing schedule: seed ${w.seed}, ${w.actions} actions: ${w.problem}`);
  });
});

describe('the seeded schedule and the sync order', () => {
  it('is the same for the same seed and different for another', () => {
    expect(buildSchedule(5, 'set')).toEqual(buildSchedule(5, 'set'));
    expect(buildSchedule(5, 'set')).not.toEqual(buildSchedule(6, 'set'));
  });

  it('gives six distinct messages in every order, and a new order for each sync of a seed', () => {
    const orders = Array.from({ length: 8 }, (_, n) => syncOrder(DEFAULT_SEED, n));
    for (const o of orders) expect(new Set(o.map(([a, b]) => `${a}${b}`)).size).toBe(6);
    expect(new Set(orders.map((o) => JSON.stringify(o))).size).toBeGreaterThan(3);
    expect(syncOrder(DEFAULT_SEED, 2)).toEqual(syncOrder(DEFAULT_SEED, 2));
  });

  it('survives the ends of the seed range', () => {
    for (const seed of [0, SEED_MAX]) {
      for (const kind of KINDS) expect(runSchedule(seed, kind, 'crdt').problem).toBeNull();
      expect(syncOrder(seed, 0)).toHaveLength(6);
    }
  });
});

describe("try-this entries, from the default state, as written", () => {
  const press = (w: ReturnType<typeof freshWorld>, r: 'A' | 'B' | 'C', times: number) => {
    let next = w;
    for (let i = 0; i < times; i += 1) next = landAll(localEdit(next, r, (s) => inc(s, r), 'adds +1'), 'counter', 'crdt');
    return next;
  };
  const counterScene = (mode: Mode) => {
    let w = freshWorld();
    w = setOnline(w, 'B', false);
    for (let i = 0; i < TRY_INCREMENTS.a; i += 1) w = landAll(localEdit(w, 'A', (s) => inc(s, 'A'), 'adds +1'), 'counter', mode);
    for (let i = 0; i < TRY_INCREMENTS.b; i += 1) w = landAll(localEdit(w, 'B', (s) => inc(s, 'B'), 'adds +1'), 'counter', mode);
    return landAll(startSync(w, syncOrder(DEFAULT_SEED, w.syncCount)), 'counter', mode);
  };

  it('try-this 1: after the sync every replica reads 5', () => {
    const w = counterScene('crdt');
    expect(valuesOf(w, 'counter', 'crdt')).toEqual(['5', '5', '5']);
    expect(agree(w, 'counter', 'crdt')).toBe(true);
    expect(lostIncrements(w, 'crdt')).toBe(0);
    expect(press(freshWorld(), 'A', 1).made).toBe(1);
  });

  it('try-this 2: with naive overwrite Lost increments reads at least 2, and never more than the 5 made', () => {
    const w = counterScene('naive');
    expect(lostIncrements(w, 'naive')).toBeGreaterThanOrEqual(TRY_INCREMENTS.a + TRY_INCREMENTS.b - TRY_INCREMENTS.a);
    expect(lostIncrements(w, 'naive')).toBeLessThanOrEqual(w.made);
  });

  it('try-this 3: the OR-Set add wins on every replica after the sync', () => {
    let w = freshWorld();
    w = landAll(localEdit(w, 'A', (s) => add(s, 'A', '🍎'), 'adds 🍎'), 'set', 'crdt');
    expect(setValue(w.reps.B, 'crdt')).toEqual(['🍎']);
    w = setOnline(w, 'B', false);
    w = localEdit(w, 'B', (s) => remove(s, '🍎'), 'removes 🍎');
    expect(setValue(w.reps.B, 'crdt')).toEqual([]);
    w = landAll(localEdit(w, 'A', (s) => add(s, 'A', '🍎'), 'adds 🍎'), 'set', 'crdt');
    w = landAll(startSync(w, syncOrder(DEFAULT_SEED, w.syncCount)), 'set', 'crdt');
    expect(valuesOf(w, 'set', 'crdt')).toEqual(['🍎', '🍎', '🍎']);
  });

  it('try-this 4: replaying the sync in a new order lands on the same answer each time', () => {
    let w = counterScene('crdt');
    const answer = valuesOf(w, 'counter', 'crdt');
    const seen = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const order = syncOrder(DEFAULT_SEED, w.syncCount);
      seen.add(JSON.stringify(order));
      w = landAll(startSync(w, order, w.preSync ?? undefined), 'counter', 'crdt');
      expect(valuesOf(w, 'counter', 'crdt')).toEqual(answer);
    }
    expect(seen.size, 'the replays really used different orders').toBeGreaterThan(1);
  });

  it(`try-this 5: the CRDT check finds no failing seed, the naive one breaks and the shortest failing schedule is seed ${NAIVE_WITNESS.counter.seed}`, () => {
    expect(checkSchedules('counter', 'crdt').failures).toBe(0);
    const naive = checkSchedules('counter', 'naive');
    expect(naive.failures).toBeGreaterThan(0);
    expect(naive.shortest?.seed).toBe(NAIVE_WITNESS.counter.seed);
    const loaded = runSchedule(NAIVE_WITNESS.counter.seed, 'counter', 'naive');
    expect(loaded.problem).toBe(NAIVE_WITNESS.counter.problem);
    expect(loadedWorld(loaded).lastEdit, 'the last edit narration must not replace the verdict').toBeNull();
  });
});

describe('the lesson text', () => {
  it('has five try-this entries and five quiz questions, and names no product it is unsure of', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
    const text = lesson.summary.useCases.join(' ');
    expect(text).not.toMatch(/Figma|Cosmos/);
  });
});
