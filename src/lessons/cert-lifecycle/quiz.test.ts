import { describe, expect, it } from 'vitest';
import lesson from './index';
import { DAY, GOTCHA_DEFAULTS, TRUE_CLIENT, acmeScenario, formatInZone, gotchaScenario, handshake, maxLifetimeDays, outageRanges, utc } from './model';

describe('the quiz numbers come from the model', () => {
  it('Q1: 00:00 UTC on 15 September is 5 pm the day before in Los Angeles and 9 am in Tokyo', () => {
    const t = utc(2026, 9, 15);
    expect(formatInZone(t, 'America/Los_Angeles')).toBe('14 Sep 2026, 17:00');
    expect(formatInZone(t, 'Asia/Tokyo')).toBe('15 Sep 2026, 09:00');
    expect(lesson.quiz[0].why).toContain('17:00 the day before');
  });

  it('Q2: with no reload hook the outage starts at the old notAfter although a valid certificate sat on disk for 30 days', () => {
    const s = gotchaScenario('reload', GOTCHA_DEFAULTS);
    const [first, second] = s.leaves;
    expect(outageRanges(s)[0].from).toBe(first.notAfter);
    expect((first.notAfter - second.notBefore) / DAY).toBe(30);
    expect(handshake(s.served, TRUE_CLIENT, first.notAfter + DAY).ok).toBe(false);
    expect(lesson.quiz[1].why).toContain('30 days');
  });

  it('Q3: the 7, 14 and 30 days-left alerts fire on days 83, 76 and 60 of a 90-day certificate', () => {
    const s = acmeScenario({ problem: 'dns', fixedAt: null, reload: true });
    const days = s.events.filter((e) => e.kind === 'alert').map((e) => (e.t - s.leaves[0].notBefore) / DAY);
    expect(days).toEqual([60, 76, 83]);
    expect(lesson.quiz[2].why).toContain('day 76');
  });

  it('Q4: a certificate issued on 1 June 2027 is capped at 100 days', () => {
    expect(maxLifetimeDays(utc(2027, 6, 1))).toBe(100);
    expect(maxLifetimeDays(utc(2026, 6, 1))).toBe(200);
    expect(maxLifetimeDays(utc(2029, 3, 15))).toBe(47);
  });

  it('Q5: a client three days slow fails for exactly the first three days after each issuance', () => {
    const s = gotchaScenario('skew', { ...GOTCHA_DEFAULTS, skewDays: -3 });
    const slow = s.clients[1];
    const second = s.leaves[1];
    expect(handshake(s.served, slow, second.notBefore + 2.9 * DAY).ok).toBe(false);
    expect(handshake(s.served, slow, second.notBefore + 3.1 * DAY).ok).toBe(true);
    expect(lesson.quiz[4].why).toContain('first three days');
  });
});
