import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACME_LIFETIME_DAYS, ACME_START, ALERT_DAYS, DAY, GOTCHA_DEFAULTS, GOTCHAS, HOUR, ISSUE_DEFAULT_INDEX, ISSUE_LAST_INDEX, LIFETIME_SCHEDULE, MANUAL_ISSUED, MANUAL_LIFETIME_DAYS, OLD_INTERMEDIATE, TRUE_CLIENT,
  acmeScenario, alertsBeforeFix, chainValidAt, formatInZone, gotchaScenario, handshake, isValidAt, issueDateAt, issueLabel, lifetimeDays, manualScenario, maxLifetimeDays, outageRanges, renewAfterDays, renewalsPerYear, sampleTimes,
  servedAt, utc, type Cert, type Scenario,
} from './model';

const cert = (nb: number, na: number, id = 'c'): Cert => ({ id, label: id, notBefore: nb, notAfter: na });
const NB = utc(2026, 1, 1);
const NA = utc(2026, 4, 1);

describe('validity: notBefore through notAfter, inclusive (RFC 5280)', () => {
  const c = cert(NB, NA);
  it('is valid at both ends and one second inside, invalid one second outside', () => {
    expect(isValidAt(c, NB - 1000)).toBe(false);
    expect(isValidAt(c, NB)).toBe(true);
    expect(isValidAt(c, NA)).toBe(true);
    expect(isValidAt(c, NA + 1000)).toBe(false);
  });

  it('a chain is valid exactly when every certificate in it is, over all combinations', () => {
    const certs = [cert(NB, NA, 'a'), cert(NB + 10 * DAY, NA - 10 * DAY, 'b'), cert(NB - 400 * DAY, NB - 5 * DAY, 'old')];
    const times = [NB - DAY, NB + 5 * DAY, NB + 20 * DAY, NA - 5 * DAY, NA + DAY];
    for (let mask = 1; mask < 8; mask++) {
      const chain = certs.filter((_, i) => mask & (1 << i));
      for (const t of times) expect(chainValidAt(chain, t)).toBe(chain.every((x) => x.notBefore <= t && t <= x.notAfter));
    }
  });
});

describe('time zones never change validity', () => {
  const ZONES = ['UTC', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'Pacific/Auckland'];
  afterEach(() => vi.unstubAllEnvs());

  it('gives the same verdict for every instant under five emulated process time zones', () => {
    const c = cert(utc(2025, 9, 15), utc(2026, 9, 15));
    const instants = Array.from({ length: 200 }, (_, i) => utc(2026, 9, 10) + i * 3 * HOUR);
    const verdicts = ZONES.map((z) => {
      vi.stubEnv('TZ', z);
      return instants.map((t) => isValidAt(c, t));
    });
    for (const v of verdicts) expect(v).toEqual(verdicts[0]);
    expect(verdicts[0].filter(Boolean).length).toBeGreaterThan(0);
    expect(verdicts[0].filter((x) => !x).length).toBeGreaterThan(0);
  });

  it('while the process zone does change what a local date method says (the trap)', () => {
    const t = utc(2026, 9, 15);
    const hours = ZONES.map((z) => {
      vi.stubEnv('TZ', z);
      return new Date(t).getHours();
    });
    expect(new Set(hours).size).toBeGreaterThan(1);
  });

  it('formats the same instant as different wall-clock times, by explicit zone', () => {
    const t = utc(2026, 9, 15);
    expect(formatInZone(t, 'UTC')).toBe('15 Sep 2026, 00:00');
    expect(formatInZone(t, 'America/Los_Angeles')).toBe('14 Sep 2026, 17:00');
    expect(formatInZone(t, 'Asia/Tokyo')).toBe('15 Sep 2026, 09:00');
  });
});

describe('the CA/Browser Forum schedule', () => {
  it('has the published steps', () => {
    expect(LIFETIME_SCHEDULE.map((s) => s.maxDays)).toEqual([398, 200, 100, 47]);
    expect(LIFETIME_SCHEDULE.map((s) => s.from)).toEqual([null, utc(2026, 3, 15), utc(2027, 3, 15), utc(2029, 3, 15)]);
  });

  it('switches at 00:00 UTC on the effective date, not before', () => {
    expect(maxLifetimeDays(utc(2026, 3, 15) - 1)).toBe(398);
    expect(maxLifetimeDays(utc(2026, 3, 15))).toBe(200);
    expect(maxLifetimeDays(utc(2027, 3, 14, 23))).toBe(200);
    expect(maxLifetimeDays(utc(2027, 3, 15))).toBe(100);
    expect(maxLifetimeDays(utc(2029, 3, 14))).toBe(100);
    expect(maxLifetimeDays(utc(2029, 3, 15))).toBe(47);
    expect(maxLifetimeDays(utc(2035, 1, 1))).toBe(47);
  });

  it('renewing at two thirds of the lifetime, hand-worked: 90 days is day 60, six renewals a year', () => {
    expect(renewAfterDays(90)).toBe(60);
    expect(renewAfterDays(47)).toBeCloseTo(31.333, 3);
    expect(renewalsPerYear(90)).toBeCloseTo(365 / 60, 6);
    expect(renewalsPerYear(47)).toBeCloseTo(11.65, 2);
    expect(renewalsPerYear(398)).toBeLessThan(2);
  });
});

describe('manual mode', () => {
  const left = manualScenario(true);
  const a = left.leaves[0];

  it('uses a 1-year certificate that the CA limit of its issue date allows', () => {
    expect(lifetimeDays(a)).toBe(MANUAL_LIFETIME_DAYS);
    expect(a.notBefore).toBe(MANUAL_ISSUED);
    expect(lifetimeDays(a)).toBeLessThanOrEqual(maxLifetimeDays(a.notBefore));
  });

  it('fails every handshake after notAfter, and none before, when the owner has left', () => {
    expect(outageRanges(left)).toEqual([{ from: a.notAfter, to: left.end }]);
    expect(handshake(left.served, TRUE_CLIENT, a.notAfter - HOUR).ok).toBe(true);
    expect(handshake(left.served, TRUE_CLIENT, a.notAfter + HOUR).ok).toBe(false);
  });

  it('has no outage when the owner renews, but the new certificate is capped at 200 days', () => {
    const stays = manualScenario(false);
    expect(outageRanges(stays)).toEqual([]);
    expect(lifetimeDays(stays.leaves[1])).toBe(200);
    expect(servedAt(stays.served, stays.leaves[1].notBefore)?.leafId).toBe(stays.leaves[1].id);
  });
});

describe('ACME mode', () => {
  const works = acmeScenario({ problem: 'none', fixedAt: null, reload: true });

  it('renews at day 60 of 90, computed from the dates', () => {
    const first = works.leaves[0];
    expect(lifetimeDays(first)).toBe(ACME_LIFETIME_DAYS);
    expect(works.renewalWindows[0].from).toBe(first.notBefore + 60 * DAY);
    expect(works.leaves[1].notBefore).toBe(first.notBefore + 60 * DAY);
    expect(outageRanges(works)).toEqual([]);
  });

  it('never issues more than the CA limit for the day it was issued', () => {
    for (const s of [works, ...GOTCHAS.map((g) => gotchaScenario(g.id, GOTCHA_DEFAULTS))]) {
      for (const c of s.leaves) expect(lifetimeDays(c)).toBeLessThanOrEqual(maxLifetimeDays(c.notBefore));
    }
  });

  it('with a broken job, alerts fire exactly 30, 14 and 7 days before notAfter, and then it expires', () => {
    const broken = acmeScenario({ problem: 'dns', fixedAt: null, reload: true });
    const first = broken.leaves[0];
    const alerts = broken.events.filter((e) => e.kind === 'alert').map((e) => e.t);
    expect(alerts).toEqual(ALERT_DAYS.map((n) => first.notAfter - n * DAY).sort((x, y) => x - y));
    expect(broken.events.some((e) => e.kind === 'expired' && e.t === first.notAfter)).toBe(true);
    expect(outageRanges(broken)).toEqual([{ from: first.notAfter, to: broken.end }]);
  });

  it('alerts always come before expiry for every day the problem could be fixed, and fixing inside the window leaves no outage', () => {
    const first = works.leaves[0];
    for (let fixDay = 60; fixDay <= 95; fixDay++) {
      const s = acmeScenario({ problem: 'dns', fixedAt: first.notBefore + fixDay * DAY, reload: true });
      const expiry = s.events.find((e) => e.kind === 'expired')?.t;
      for (const alert of s.events.filter((e) => e.kind === 'alert' && e.t < first.notAfter)) if (expiry !== undefined) expect(alert.t).toBeLessThan(expiry);
      const outage = outageRanges(s);
      if (fixDay <= 90) expect(outage).toEqual([]);
      else expect(outage).toEqual([{ from: first.notAfter, to: first.notBefore + fixDay * DAY }]);
    }
  });

  it('a fix before an alert threshold stops that alert', () => {
    const first = works.leaves[0];
    const s = acmeScenario({ problem: 'rate-limit', fixedAt: first.notBefore + 70 * DAY, reload: true });
    expect(s.events.filter((e) => e.kind === 'alert').map((e) => e.t)).toEqual([first.notAfter - 30 * DAY]);
  });

  it('logs failed tries in the window, one per day, in order', () => {
    const first = works.leaves[0];
    const s = acmeScenario({ problem: 'dns', fixedAt: first.notBefore + 65 * DAY, reload: true });
    const fails = s.events.filter((e) => e.kind === 'attempt-failed').map((e) => e.t);
    expect(fails).toEqual([60, 61, 62, 63, 64].map((d) => first.notBefore + d * DAY));
  });
});

describe('gotchas', () => {
  it('an expired intermediate fails the handshake although every leaf is valid; updating the chain fixes it', () => {
    const s = gotchaScenario('intermediate', GOTCHA_DEFAULTS);
    expect(outageRanges(s)).toEqual([{ from: OLD_INTERMEDIATE.notAfter, to: s.end }]);
    const t = OLD_INTERMEDIATE.notAfter + 5 * DAY;
    const leaf = servedAt(s.served, t)!.chain[0];
    expect(isValidAt(leaf, t)).toBe(true);
    expect(handshake(s.served, TRUE_CLIENT, t)).toMatchObject({ ok: false });
    expect(outageRanges(gotchaScenario('intermediate', { ...GOTCHA_DEFAULTS, chainUpdated: true }))).toEqual([]);
  });

  it('a skewed client fails exactly when its own clock is outside the served leaf period, for every skew', () => {
    for (let days = -7; days <= 7; days++) {
      const s = gotchaScenario('skew', { ...GOTCHA_DEFAULTS, skewDays: days });
      const client = s.clients[1];
      for (const t of sampleTimes(s, 300)) {
        const leaf = servedAt(s.served, t)!.chain[0];
        const clock = t + days * DAY;
        const shouldFail = clock < leaf.notBefore || clock > leaf.notAfter;
        expect(handshake(s.served, client, t).ok).toBe(!shouldFail);
        expect(handshake(s.served, s.clients[0], t).ok).toBe(true);
      }
    }
  });

  it('a clock behind fails with "not yet valid", and a clock ahead with "expired"', () => {
    const behind = gotchaScenario('skew', { ...GOTCHA_DEFAULTS, skewDays: -3 });
    const t = behind.leaves[1].notBefore + DAY;
    expect(handshake(behind.served, behind.clients[1], t)).toEqual({ ok: false, reason: 'certificate is not yet valid (leaf certificate)' });
    const manual = manualScenario(true);
    const ahead = { ...TRUE_CLIENT, skewMs: 3 * DAY };
    expect(handshake(manual.served, ahead, manual.leaves[0].notAfter - 2 * DAY)).toEqual({ ok: false, reason: 'certificate has expired (leaf certificate)' });
    expect(handshake(manual.served, ahead, manual.leaves[0].notAfter - 4 * DAY).ok).toBe(true);
  });

  it('a renewed certificate on disk does not help while the server keeps the old one in memory', () => {
    const s = gotchaScenario('reload', GOTCHA_DEFAULTS);
    expect(s.onDisk).toHaveLength(1);
    expect(outageRanges(s)).toEqual([{ from: s.leaves[0].notAfter, to: s.end }]);
    expect(s.events.some((e) => e.kind === 'alert')).toBe(true);
    const fixed = gotchaScenario('reload', { ...GOTCHA_DEFAULTS, reloadHook: true });
    expect(fixed.onDisk).toEqual([]);
    expect(outageRanges(fixed)).toEqual([]);
  });

  it('a restart later loads the certificate that was on disk and ends the outage', () => {
    const base = acmeScenario({ problem: 'none', fixedAt: null, reload: false });
    const restartAt = base.leaves[0].notAfter + 2 * DAY;
    const s = acmeScenario({ problem: 'none', fixedAt: null, reload: false, restartAt });
    expect(outageRanges(s)[0]).toEqual({ from: base.leaves[0].notAfter, to: restartAt });
  });

  it('a client pinned to the first certificate fails from the first renewal on, and only that client', () => {
    const s = gotchaScenario('pinned', GOTCHA_DEFAULTS);
    const [, pinned] = s.clients;
    for (const t of sampleTimes(s, 200)) {
      const serving = servedAt(s.served, t)!.leafId;
      expect(handshake(s.served, pinned, t).ok).toBe(serving === pinned.pinId);
      expect(handshake(s.served, TRUE_CLIENT, t).ok).toBe(true);
    }
    expect(outageRanges(s, pinned)).toEqual([{ from: s.leaves[1].notBefore, to: s.end }]);
  });
});

describe('outageRanges matches an hour-by-hour brute force', () => {
  const scenarios: Scenario[] = [
    manualScenario(true),
    manualScenario(false),
    acmeScenario({ problem: 'dns', fixedAt: ACME_START + 93 * DAY, reload: true }),
    acmeScenario({ problem: 'none', fixedAt: null, reload: false, restartAt: ACME_START + 100 * DAY }),
    gotchaScenario('intermediate', GOTCHA_DEFAULTS),
    gotchaScenario('skew', GOTCHA_DEFAULTS),
  ];
  it.each(scenarios.map((s, i) => [i, s] as const))('scenario %i', (_i, s) => {
    for (const client of s.clients) {
      const ranges = outageRanges(s, client);
      for (let t = s.start + 30 * 60_000; t < s.end; t += 3 * HOUR) {
        const inRange = ranges.some((r) => t >= r.from && t < r.to);
        expect(inRange).toBe(!handshake(s.served, client, t).ok);
      }
    }
  });
});

describe('the issue-date picker', () => {
  const indexOf = (label: string) => Array.from({ length: ISSUE_LAST_INDEX + 1 }, (_, i) => i).find((i) => issueLabel(i) === label)!;

  it('can land on both sides of every limit change, with the label naming the exact date', () => {
    const cases: [string, string, number, number][] = [
      ['1 Mar 2026', '15 Mar 2026', 398, 200],
      ['1 Mar 2027', '15 Mar 2027', 200, 100],
      ['1 Mar 2029', '15 Mar 2029', 100, 47],
    ];
    for (const [before, from, a, b] of cases) {
      expect(maxLifetimeDays(issueDateAt(indexOf(before)))).toBe(a);
      expect(maxLifetimeDays(issueDateAt(indexOf(from)))).toBe(b);
    }
  });

  it('starts on a date the label shows exactly, and the last position is the end of 2030', () => {
    expect(issueLabel(ISSUE_DEFAULT_INDEX)).toBe('1 Sep 2026');
    expect(issueLabel(ISSUE_LAST_INDEX)).toBe('15 Dec 2030');
  });
});

describe('ACME alerts before a fix', () => {
  it('matches the alerts the scenario really raises for every fix day, and none when the first try works', () => {
    for (let fixDay = 55; fixDay <= 90; fixDay++) {
      const s = acmeScenario({ problem: 'dns', fixedAt: ACME_START + fixDay * DAY, reload: true });
      const alerts = s.events.filter((e) => e.kind === 'alert' && e.t < ACME_START + ACME_LIFETIME_DAYS * DAY).length;
      expect(alertsBeforeFix(fixDay)).toBe(alerts);
    }
    expect(alertsBeforeFix(60)).toBe(0);
  });
});
