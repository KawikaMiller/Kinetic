import { describe, expect, it } from 'vitest';
import { hash32 } from '../../core/hash';
import {
  BUCKETS, DEFAULT_ORDER, FLAGS, FLAG_KEY, FLAG_REFRESH_SECONDS, KIND_INFO, MONTHS, PIPELINE_SECONDS, REPLACE_SECONDS, RULES, STALE_AFTER, USER_COUNT,
  bucketOf, combinations, moveRule, countOn, debtCode, evaluate, flickerCount, goesOffAt, inRollout, isStale, liveFlags, makeUsers, percentFor, randomEach, reached, shareStillOn,
  staleFlags, stillOn, usersByRule, type RuleId, type User,
} from './model';

const users = makeUsers();
const SIZE = 10_000;
const COUNTRY_CYCLE = ['NL', 'US', 'DE', 'BR', 'JP'] as const;
const big: User[] = Array.from({ length: SIZE }, (_, i) => ({ id: `big-${i}`, staff: i % 20 === 0, country: COUNTRY_CYCLE[i % 5] }));

const permutations = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
const ORDERS = permutations<RuleId>(['staff', 'nl', 'default']);

describe('the crowd', () => {
  it('is the same 400 users every time, with unique ids', () => {
    expect(users).toEqual(makeUsers());
    expect(users).toHaveLength(USER_COUNT);
    expect(new Set(users.map((u) => u.id)).size).toBe(USER_COUNT);
  });
  it('has some staff and some Dutch users, so every rule has someone to match', () => {
    expect(users.filter((u) => u.staff).length).toBeGreaterThan(5);
    expect(users.filter((u) => u.country === 'NL').length).toBeGreaterThan(40);
  });
});

describe('bucketing', () => {
  it('is hash32 of the flag key and user id, mod 100, and always in range', () => {
    for (const u of users) {
      expect(bucketOf(FLAG_KEY, u.id)).toBe(hash32(`${FLAG_KEY}:${u.id}`) % 100);
      expect(bucketOf(FLAG_KEY, u.id)).toBeGreaterThanOrEqual(0);
      expect(bucketOf(FLAG_KEY, u.id)).toBeLessThan(BUCKETS);
    }
  });

  it('is stable: the same user and flag give the same bucket, and a different flag reshuffles the users', () => {
    for (const u of users) expect(bucketOf(FLAG_KEY, u.id)).toBe(bucketOf(FLAG_KEY, u.id));
    const moved = users.filter((u) => bucketOf(FLAG_KEY, u.id) !== bucketOf('other-flag', u.id)).length;
    expect(moved).toBeGreaterThan(USER_COUNT * 0.9);
  });

  it('ramping up never removes a user who was already in, for every step of the dial', () => {
    for (const set of [users, big]) {
      for (let dial = 0; dial < 100; dial++) {
        for (const u of set) if (inRollout(FLAG_KEY, u.id, dial)) expect(inRollout(FLAG_KEY, u.id, dial + 1)).toBe(true);
      }
    }
  });

  it('puts the measured share within 3 points of the dial for 10,000 users at every step of 10', () => {
    for (let dial = 0; dial <= 100; dial += 10) {
      const on = big.filter((u) => inRollout(FLAG_KEY, u.id, dial)).length;
      expect(Math.abs((100 * on) / SIZE - dial), `dial ${dial}`).toBeLessThanOrEqual(3);
    }
    expect(big.filter((u) => inRollout(FLAG_KEY, u.id, 0))).toHaveLength(0);
    expect(big.filter((u) => inRollout(FLAG_KEY, u.id, 100))).toHaveLength(SIZE);
  });

  it('uses every bucket: each holds roughly its share of the users', () => {
    const counts = new Array<number>(BUCKETS).fill(0);
    for (const u of big) counts[bucketOf(FLAG_KEY, u.id)]++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(SIZE / BUCKETS / 2);
      expect(c).toBeLessThan((SIZE / BUCKETS) * 2);
    }
  });

  it('going 10 to 20 keeps the original 10% and adds new users only', () => {
    const at10 = new Set(big.filter((u) => inRollout(FLAG_KEY, u.id, 10)).map((u) => u.id));
    const at20 = new Set(big.filter((u) => inRollout(FLAG_KEY, u.id, 20)).map((u) => u.id));
    for (const id of at10) expect(at20.has(id)).toBe(true);
    expect(at20.size).toBeGreaterThan(at10.size);
  });
});

describe('random each request (the mistake)', () => {
  it('gives a user a different answer from round to round, and the same answer when asked twice about one round', () => {
    expect(users.some((u) => randomEach(u.id, 1, 50) !== randomEach(u.id, 2, 50))).toBe(true);
    for (const u of users) expect(randomEach(u.id, 3, 50)).toBe(randomEach(u.id, 3, 50));
  });

  it('flickers about 2p(1-p) of the users each round, and nobody in round zero', () => {
    for (const percent of [10, 50, 90]) {
      const p = percent / 100;
      expect(Math.abs(flickerCount(big, percent, 4) / SIZE - 2 * p * (1 - p)), `${percent}%`).toBeLessThan(0.02);
    }
    expect(flickerCount(users, 50, 0)).toBe(0);
  });

  it('puts the share on at the dial, like the stable scheme does', () => {
    for (const percent of [10, 50, 90]) {
      const on = big.filter((u) => randomEach(u.id, 7, percent)).length;
      expect(Math.abs((100 * on) / SIZE - percent)).toBeLessThanOrEqual(3);
    }
  });
});

describe('targeting rules', () => {
  /** Reference written the long way: explicit conditions per rule, walked in order. */
  function reference(order: RuleId[], u: User, dial: number): { on: boolean; rule: RuleId } {
    const decide = (rule: RuleId, percent: number) => ({ on: bucketOf(FLAG_KEY, u.id) < percent, rule });
    for (const id of order) {
      if (id === 'staff' && u.staff) return decide('staff', 100);
      if (id === 'nl' && u.country === 'NL') return decide('nl', 50);
      if (id === 'default') return decide('default', dial);
    }
    throw new Error('unreachable: the default rule matches everyone');
  }

  it('is first-match for every reorder of the three rules and every dial, over the whole crowd', () => {
    expect(ORDERS).toHaveLength(6);
    for (const order of ORDERS) {
      for (const dial of [0, 10, 33, 50, 100]) {
        for (const u of [...users, ...big.slice(0, 1000)]) {
          expect(evaluate(order, u, dial, false), `${order.join('>')} dial ${dial} ${u.id}`).toEqual(reference(order, u, dial));
        }
      }
    }
  });

  it('with the default rule first, nothing after it is ever reached', () => {
    for (const u of users) expect(evaluate(['default', 'staff', 'nl'], u, 10, false).rule).toBe('default');
    const counts = usersByRule(users, ['default', 'staff', 'nl'], 10);
    expect(counts.staff.matched + counts.nl.matched).toBe(0);
    expect(counts.default.matched).toBe(USER_COUNT);
  });

  it('a user who matches NL and falls outside its 50% does not fall through to the default', () => {
    const nl = users.filter((u) => u.country === 'NL' && !u.staff && bucketOf(FLAG_KEY, u.id) >= 50);
    expect(nl.length).toBeGreaterThan(0);
    for (const u of nl) expect(evaluate(DEFAULT_ORDER, u, 100, false)).toEqual({ on: false, rule: 'nl' });
  });

  it('staff are on at any dial when their rule is first, and follow the dial when the default comes first', () => {
    const staff = users.filter((u) => u.staff);
    for (const u of staff) expect(evaluate(DEFAULT_ORDER, u, 0, false)).toEqual({ on: true, rule: 'staff' });
    expect(staff.some((u) => !evaluate(['default', 'staff', 'nl'], u, 0, false).on)).toBe(true);
  });

  it('swapping staff and NL changes only users who are both', () => {
    const swapped: RuleId[] = ['nl', 'staff', 'default'];
    for (const u of users) {
      if (!(u.staff && u.country === 'NL')) expect(evaluate(swapped, u, 10, false)).toEqual(evaluate(DEFAULT_ORDER, u, 10, false));
    }
  });

  it('the per-rule table adds up to everyone, for every order', () => {
    for (const order of ORDERS) {
      const t = usersByRule(users, order, 10);
      expect(t.staff.matched + t.nl.matched + t.default.matched).toBe(USER_COUNT);
      expect(t.staff.on + t.nl.on + t.default.on).toBe(countOn(users, order, 10, false));
    }
  });

  it('moving a rule swaps it with its neighbour and stays put at the ends', () => {
    expect(moveRule(DEFAULT_ORDER, 1, -1)).toEqual(['nl', 'staff', 'default']);
    expect(moveRule(DEFAULT_ORDER, 1, 1)).toEqual(['staff', 'default', 'nl']);
    expect(moveRule(DEFAULT_ORDER, 0, -1)).toEqual(DEFAULT_ORDER);
    expect(moveRule(DEFAULT_ORDER, 2, 1)).toEqual(DEFAULT_ORDER);
    for (const order of ORDERS) expect([...moveRule(order, 0, 1)].sort()).toEqual([...order].sort());
  });

  it('the rule text and percentages are the ones the lesson shows', () => {
    expect(RULES.staff.text).toBe('internal staff');
    expect(percentFor('staff', 10)).toBe(100);
    expect(percentFor('nl', 10)).toBe(50);
    expect(percentFor('default', 37)).toBe(37);
    expect(reached(DEFAULT_ORDER, 'nl')).toBe(2);
    expect(reached(DEFAULT_ORDER, null)).toBe(0);
  });
});

describe('the kill switch', () => {
  it('turns every user off on the next evaluation, whatever the order and dial', () => {
    for (const order of ORDERS) {
      for (const dial of [0, 50, 100]) for (const u of [...users, ...big.slice(0, 500)]) expect(evaluate(order, u, dial, true)).toEqual({ on: false, rule: null });
    }
    expect(countOn(users, DEFAULT_ORDER, 100, true)).toBe(0);
  });

  it('reaches everyone within the refresh window, while a rollback keeps users on the new UI for minutes', () => {
    for (const u of users) {
      expect(goesOffAt('kill', u.id)).toBeLessThanOrEqual(FLAG_REFRESH_SECONDS);
      expect(goesOffAt('rollback', u.id)).toBeGreaterThanOrEqual(PIPELINE_SECONDS);
      expect(goesOffAt('rollback', u.id)).toBeLessThan(PIPELINE_SECONDS + REPLACE_SECONDS);
    }
    expect(shareStillOn(users, 'kill', 0)).toBe(1);
    expect(shareStillOn(users, 'kill', FLAG_REFRESH_SECONDS)).toBe(0);
    expect(shareStillOn(users, 'rollback', PIPELINE_SECONDS - 1)).toBe(1);
    expect(shareStillOn(users, 'rollback', PIPELINE_SECONDS + REPLACE_SECONDS)).toBe(0);
  });

  it('the share still on only falls as time passes', () => {
    for (const remedy of ['kill', 'rollback'] as const) {
      let last = 1;
      for (let t = 0; t <= 600; t += 5) {
        const s = shareStillOn(users, remedy, t);
        expect(s).toBeLessThanOrEqual(last);
        last = s;
      }
    }
    expect(users.every((u) => stillOn('kill', u.id, 0))).toBe(true);
  });
});

describe('flag debt', () => {
  it('a flag is stale once its job finished at least a month ago; ops and permission flags never are', () => {
    for (const f of FLAGS) {
      for (let month = 0; month <= MONTHS; month++) {
        expect(isStale(f, month), `${f.name} month ${month}`).toBe(f.done !== null && month >= f.done + STALE_AFTER);
      }
      if (f.kind === 'ops' || f.kind === 'permission') expect(f.done).toBeNull();
    }
    expect(KIND_INFO.ops.months).toBeNull();
    expect(KIND_INFO.permission.months).toBeNull();
  });

  it('only flags created by a month are live in it, and removing a flag takes it out', () => {
    expect(liveFlags(0, new Set())).toHaveLength(0);
    expect(liveFlags(1, new Set()).map((f) => f.name)).toEqual(['new-checkout']);
    expect(liveFlags(MONTHS, new Set())).toHaveLength(FLAGS.length);
    expect(liveFlags(5, new Set(['new-checkout'])).map((f) => f.name)).not.toContain('new-checkout');
  });

  it('removing the stale flags leaves none stale, and the code paths halve for each one removed', () => {
    for (let month = 0; month <= MONTHS; month++) {
      const none = new Set<string>();
      const stale = staleFlags(month, none);
      const removed = new Set(stale.map((f) => f.name));
      expect(staleFlags(month, removed)).toHaveLength(0);
      expect(combinations(liveFlags(month, none).length) / combinations(liveFlags(month, removed).length)).toBe(2 ** stale.length);
    }
    expect(combinations(0)).toBe(1);
    expect(combinations(8)).toBe(256);
  });

  it('the code shows one nested if per live flag, balanced, with the checkout innermost', () => {
    for (let month = 0; month <= MONTHS; month++) {
      const live = liveFlags(month, new Set());
      const code = debtCode(live);
      expect(code.filter((l) => l.includes('if (flags.'))).toHaveLength(live.length);
      expect(code.filter((l) => l.trim() === '}')).toHaveLength(live.length);
      if (live.length) expect(code[live.length].trim()).toBe('renderCheckout();');
    }
    expect(debtCode([])).toEqual(['renderCheckout();']);
  });
});
