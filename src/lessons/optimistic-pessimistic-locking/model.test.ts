import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTS, LUNCH_TICKS, MAX_EDITORS, START, USERS, contention, contentionCurve, createWorld, etag, finished, httpScript, lostUpdates, orderings,
  putOutcome, run, sqlFor, step, tally, type Opts, type Strategy, type UserId,
} from './model';

const ORDERS = orderings();
const other = (u: UserId): UserId => (u === 'ana' ? 'ben' : 'ana');
/** Index of the k-th (0-based) action of user u in an ordering. */
const at = (o: readonly UserId[], u: UserId, k: number) => o.reduce<number[]>((acc, x, i) => (x === u ? [...acc, i] : acc), [])[k];

describe('the 20 orderings', () => {
  it('are all distinct sequences of three Ana and three Ben actions', () => {
    expect(ORDERS).toHaveLength(20);
    expect(new Set(ORDERS.map((o) => o.join(','))).size).toBe(20);
    for (const o of ORDERS) expect(USERS.map((u) => o.filter((x) => x === u).length)).toEqual([3, 3]);
  });
});

describe('no locking at READ COMMITTED loses an update when both read before the first save', () => {
  it('in 18 of 20 orderings, and exactly those', () => {
    let lostCount = 0;
    for (const o of ORDERS) {
      const w = run('none', DEFAULT_OPTS, o, true);
      // Independent oracle: both reads come before the first save.
      const bothRead = Math.max(at(o, 'ana', 0), at(o, 'ben', 0)) < Math.min(at(o, 'ana', 2), at(o, 'ben', 2));
      expect(lostUpdates(w) > 0, o.join(',')).toBe(bothRead);
      expect(w.row.stock).toBe(bothRead ? 9 : 8);
      lostCount += bothRead ? 1 : 0;
    }
    expect(lostCount).toBe(18);
  });
  it('the worked example: both read 10, Ana saves 9, Ben saves 9: one decrement lost, no version bump', () => {
    const w = run('none', DEFAULT_OPTS, ['ana', 'ben', 'ana', 'ben', 'ana', 'ben']);
    expect(w.users.ana.seen?.stock).toBe(10);
    expect(w.users.ben.seen?.stock).toBe(10);
    expect(w.row).toMatchObject({ stock: 9, version: START.version });
    expect(w.committed).toBe(2);
    expect(lostUpdates(w)).toBe(1);
  });
});

describe('pessimistic locking never loses one', () => {
  it('final stock 8 and no lost update in every ordering, with the timeout out of the way', () => {
    for (const o of ORDERS) {
      const w = run('pessimistic', { ...DEFAULT_OPTS, lockTimeout: 99 }, o, true);
      expect(finished(w)).toBe(true);
      expect(w.row.stock, o.join(',')).toBe(8);
      expect(lostUpdates(w)).toBe(0);
      expect(w.lock).toBeNull();
    }
  });
  it('the second reader blocks in the same 18 orderings where the transactions overlap, and sees the committed value', () => {
    let blocked = 0;
    for (const o of ORDERS) {
      const w = run('pessimistic', { ...DEFAULT_OPTS, lockTimeout: 99 }, o, true);
      const first = o[0];
      // Independent oracle: the second user's read comes before the first user's save.
      const overlap = at(o, other(first), 0) < at(o, first, 2);
      expect(w.events.some((e) => e.kind === 'wait'), o.join(',')).toBe(overlap);
      if (overlap) {
        blocked++;
        expect(w.users[other(first)].seen?.stock).toBe(9);
      }
    }
    expect(blocked).toBe(18);
  });
  it('the lock is held from the read to the commit', () => {
    const w = createWorld('pessimistic');
    step(w, 'ana');
    expect(w.lock).toBe('ana');
    step(w, 'ben');
    expect(w.users.ben.waitingSince).not.toBeNull();
    step(w, 'ana');
    expect(w.lock).toBe('ana');
    step(w, 'ana');
    expect(w.lock).toBe('ben');
    expect(w.users.ben.seen?.stock).toBe(9);
  });
});

describe('the lock-wait timeout (pessimistic only)', () => {
  const lunch: Opts = { editTicks: { ana: LUNCH_TICKS, ben: 1 }, lockTimeout: 5 };
  it('Ana at lunch holding the lock makes Ben time out: his sale is not made, nothing is lost', () => {
    const w = run('pessimistic', lunch, ['ana', 'ben', 'ana', 'ana', 'ben', 'ben'], true);
    expect(w.users.ben.outcome).toBe('timeout');
    expect(w.users.ana.outcome).toBe('saved');
    expect(w.row.stock).toBe(9);
    expect(lostUpdates(w)).toBe(0);
    const wait = w.events.find((e) => e.kind === 'wait')!;
    expect(wait).toMatchObject({ result: 'timeout', t1: wait.t0 + 5 });
  });
  it('a long enough timeout lets Ben through after the lunch', () => {
    const w = run('pessimistic', { ...lunch, lockTimeout: 12 }, ['ana', 'ben', 'ana', 'ana', 'ben', 'ben'], true);
    expect(w.row.stock).toBe(8);
    expect(w.users.ben.outcome).toBe('saved');
  });
  it('a wait of exactly the timeout still succeeds; one tick more fails', () => {
    // Ana: read [0,1], edit [1,1+e], save to 2+e, release at 2+e. Ben starts waiting at 1: waits 1+e.
    const ordering: UserId[] = ['ana', 'ben', 'ana', 'ana', 'ben', 'ben'];
    expect(run('pessimistic', { editTicks: { ana: 3, ben: 1 }, lockTimeout: 4 }, ordering, true).users.ben.outcome).toBe('saved');
    expect(run('pessimistic', { editTicks: { ana: 3, ben: 1 }, lockTimeout: 3 }, ordering, true).users.ben.outcome).toBe('timeout');
  });
  it('the other strategies ignore the timeout and the lunch changes nothing about the outcome', () => {
    for (const s of ['none', 'optimistic', 'atomic'] as Strategy[])
      for (const o of ORDERS) {
        const a = run(s, DEFAULT_OPTS, o, true);
        const b = run(s, { editTicks: { ana: LUNCH_TICKS, ben: 1 }, lockTimeout: 1 }, o, true);
        expect(b.row).toEqual(a.row);
        expect(USERS.map((u) => b.users[u].outcome)).toEqual(['saved', 'saved']);
      }
  });
});

describe('optimistic locking never loses one and reports a conflict exactly when the version changed', () => {
  it('in every ordering', () => {
    for (const o of ORDERS) {
      const w = run('optimistic', DEFAULT_OPTS, o, true);
      expect(finished(w)).toBe(true);
      expect(w.row.stock, o.join(',')).toBe(8);
      expect(w.row.version).toBe(START.version + 2);
      expect(lostUpdates(w)).toBe(0);
      const conflicts = w.events.filter((e) => e.kind === 'save' && e.result === 'conflict');
      // Independent oracle: the first saver wins; the other conflicts iff it read before that save.
      const first = USERS.reduce((a, b) => (at(o, a, 2) < at(o, b, 2) ? a : b));
      const loser = other(first);
      const changed = at(o, loser, 0) < at(o, first, 2);
      expect(conflicts.length, o.join(',')).toBe(changed ? 1 : 0);
      if (changed) expect(conflicts[0]).toMatchObject({ user: loser, seenVersion: START.version, version: START.version + 1 });
      expect(w.users[loser].retries).toBe(changed ? 1 : 0);
    }
  });
  it('a conflicted save changes nothing, and the retry re-reads the new version', () => {
    const w = run('optimistic', DEFAULT_OPTS, ['ana', 'ben', 'ana', 'ben', 'ana', 'ben']);
    expect(w.row).toMatchObject({ stock: 9, version: START.version + 1 });
    expect(w.users.ben.pc).toBe(0);
    step(w, 'ben');
    expect(w.users.ben.seen).toMatchObject({ stock: 9, version: START.version + 1 });
  });
});

describe('the atomic UPDATE never loses one', () => {
  it('stock - 1 in the database, in every ordering, with no waiting and no conflict', () => {
    const t = tally('atomic', DEFAULT_OPTS);
    expect(t).toEqual({ orderings: 20, lost: 0, blocked: 0, conflicts: 0, timedOut: 0 });
    for (const o of ORDERS) expect(run('atomic', DEFAULT_OPTS, o, true).row.stock).toBe(8);
  });
});

describe('tally', () => {
  it('matches the per-ordering results', () => {
    expect(tally('none', DEFAULT_OPTS)).toMatchObject({ lost: 18, blocked: 0, conflicts: 0 });
    expect(tally('pessimistic', { ...DEFAULT_OPTS, lockTimeout: 99 })).toMatchObject({ lost: 0, blocked: 18, timedOut: 0 });
    expect(tally('optimistic', DEFAULT_OPTS)).toMatchObject({ lost: 0, blocked: 0, conflicts: 18 });
  });
});

describe('the SQL shown is the SQL the model runs', () => {
  it('optimistic save carries the version it read and the one it writes', () => {
    expect(sqlFor('optimistic', 'save', { stock: 10, version: 3, writes: 0 }, 9)).toBe('UPDATE products SET stock = 9, version = 4 WHERE id = 7 AND version = 3;');
    expect(sqlFor('pessimistic', 'read', null, null)).toContain('FOR UPDATE');
  });
});

describe('If-Match over HTTP', () => {
  it('a stale tag gets 412; a current one 200', () => {
    expect(putOutcome(false, etag(3), 4, 3)).toEqual({ status: 412, applied: false, clobbered: false });
    expect(putOutcome(false, etag(4), 4, 4)).toEqual({ status: 200, applied: true, clobbered: false });
  });
  it('a missing tag when required gets 428; when not required it overwrites silently if the copy was stale', () => {
    expect(putOutcome(true, null, 4, 3)).toEqual({ status: 428, applied: false, clobbered: false });
    expect(putOutcome(true, null, 3, 3).status).toBe(428);
    expect(putOutcome(false, null, 4, 3)).toEqual({ status: 200, applied: true, clobbered: true });
    expect(putOutcome(false, null, 3, 3)).toEqual({ status: 200, applied: true, clobbered: false });
  });
  it('the script ends at stock 8 unless Ben sends no If-Match to a server that does not require it', () => {
    for (const require of [true, false])
      for (const sends of [true, false]) {
        const steps = httpScript(require, sends);
        const end = steps[steps.length - 1].product;
        const refusals = steps.filter((s) => s.status && s.status !== 200).map((s) => s.status);
        if (!require && !sends) {
          expect(end.stock).toBe(9);
          expect(steps.some((s) => s.clobbered)).toBe(true);
          expect(refusals).toEqual([]);
        } else {
          expect(end).toEqual({ stock: 8, version: START.version + 2 });
          expect(refusals).toEqual([sends ? 412 : 428]);
        }
      }
  });
});

describe('contention', () => {
  const curve = contentionCurve();
  it('is the same every time (seeded)', () => {
    expect(contention(7)).toEqual(contention(7));
    expect(curve).toHaveLength(MAX_EDITORS);
  });
  it('one editor never conflicts and never waits', () => {
    expect(curve[0].retries).toBe(0);
  });
  it('optimistic loses less at low contention, pessimistic at high', () => {
    for (const c of curve.filter((x) => x.editors <= 3)) expect(c.optimisticLost, `${c.editors}`).toBeLessThan(c.pessimisticLost);
    for (const c of curve.filter((x) => x.editors >= 5)) expect(c.pessimisticLost, `${c.editors}`).toBeLessThan(c.optimisticLost);
  });
  it('both grow with the number of editors', () => {
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].optimisticLost).toBeGreaterThan(curve[i - 1].optimisticLost);
      expect(curve[i].pessimisticLost).toBeGreaterThan(curve[i - 1].pessimisticLost);
    }
  });
});
