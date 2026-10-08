import { describe, expect, it } from 'vitest';
import lesson from './index';
import {
  DEFAULT_ORDER, FLAGS, FLAG_KEY, FLAG_REFRESH_SECONDS, MONTHS, PIPELINE_SECONDS, REPLACE_SECONDS, bucketOf, combinations, evaluate, flickerCount, inRollout, liveFlags, makeUsers,
  shareStillOn, staleFlags,
} from './model';

const users = makeUsers();

describe('the quiz numbers come from the model', () => {
  it('Q1: at 50% about half the users change their answer between two rounds', () => {
    const big = Array.from({ length: 10_000 }, (_, i) => ({ id: `q-${i}`, staff: false, country: 'US' as const }));
    expect(flickerCount(big, 50, 3) / big.length).toBeGreaterThan(0.45);
    expect(flickerCount(big, 50, 3) / big.length).toBeLessThan(0.55);
    expect(lesson.quiz[0].why).toContain('about half the users');
  });

  it('Q2: a bucket below 10 is below 20, so nobody who was in is dropped', () => {
    for (const u of users) if (bucketOf(FLAG_KEY, u.id) < 10) expect(bucketOf(FLAG_KEY, u.id)).toBeLessThan(20);
    expect(bucketOf('another-flag', users[0].id) === bucketOf(FLAG_KEY, users[0].id) && bucketOf('another-flag', users[1].id) === bucketOf(FLAG_KEY, users[1].id)).toBe(false);
  });

  it('Q3: a Dutch non-staff user outside the 50% is decided by the NL rule and is off', () => {
    const u = users.find((x) => x.country === 'NL' && !x.staff && bucketOf(FLAG_KEY, x.id) >= 50)!;
    expect(evaluate(DEFAULT_ORDER, u, 10, false)).toEqual({ on: false, rule: 'nl' });
  });

  it('Q4: the flag reaches everyone in 30 s, the rollback needs 4 minutes plus 5', () => {
    expect(FLAG_REFRESH_SECONDS).toBe(30);
    expect(PIPELINE_SECONDS / 60).toBe(4);
    expect(REPLACE_SECONDS / 60).toBe(5);
    expect(shareStillOn(users, 'kill', FLAG_REFRESH_SECONDS)).toBe(0);
    expect(shareStillOn(users, 'rollback', PIPELINE_SECONDS)).toBeGreaterThan(0.95);
    expect(lesson.quiz[3].why).toContain('30 seconds');
  });

  it('Q5: eight flags are 256 combinations', () => {
    expect(combinations(8)).toBe(256);
    expect(FLAGS).toHaveLength(8);
  });
});

describe('the try-this steps work from the default state, as written', () => {
  it('1: every user in at 10% is still in at 20%, and random each request flickers', () => {
    for (const u of users) if (inRollout(FLAG_KEY, u.id, 10)) expect(inRollout(FLAG_KEY, u.id, 20)).toBe(true);
    expect(users.filter((u) => inRollout(FLAG_KEY, u.id, 20)).length).toBeGreaterThan(users.filter((u) => inRollout(FLAG_KEY, u.id, 10)).length);
    expect(flickerCount(users, 10, 1)).toBeGreaterThan(0);
  });

  it('3: moving "everyone else" to the top gives it every user', () => {
    for (const u of users) expect(evaluate(['default', 'staff', 'nl'], u, 10, false).rule).toBe('default');
  });

  it('4: at 6:00 the rollback is partway and the flag flip is done', () => {
    const rollback = shareStillOn(users, 'rollback', 360);
    expect(rollback).toBeGreaterThan(0);
    expect(rollback).toBeLessThan(1);
    expect(shareStillOn(users, 'kill', 30)).toBe(0);
  });

  it('5: at month 12 removing the stale flags takes 256 combinations down to 4', () => {
    const none = new Set<string>();
    expect(combinations(liveFlags(MONTHS, none).length)).toBe(256);
    const removed = new Set(staleFlags(MONTHS, none).map((f) => f.name));
    expect(combinations(liveFlags(MONTHS, removed).length)).toBe(4);
    expect(liveFlags(MONTHS, removed).map((f) => f.kind).sort()).toEqual(['ops', 'permission']);
  });
});
