import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE_DATE, BROWNOUT_HOURS, BROWNOUT_LEADS, EXTENSION_DAYS, REACTION_DAYS, SUNSET_CLIENTS, WINDOW, addDays, dayNumber, daysBetween, deprecationHeaderValue, simulate, sunsetHeaderValue, type Choice,
} from './sunset';

describe('date arithmetic counts whole UTC days', () => {
  it('crosses a leap day: 2028-02-28 plus 1 is the 29th, plus 2 is March 1', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('a leap year is 366 days and an ordinary one 365', () => {
    expect(daysBetween('2028-02-28', '2029-02-28')).toBe(366);
    expect(daysBetween('2027-03-01', '2028-03-01')).toBe(366);
    expect(daysBetween('2028-03-01', '2029-03-01')).toBe(365);
    expect(daysBetween('2026-03-01', '2027-03-01')).toBe(365);
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-12-31', 365)).toBe('2027-12-31');
    expect(daysBetween('2026-12-25', '2027-01-05')).toBe(11);
  });

  it('the announcement to the leap day is 484 days, and back again', () => {
    expect(daysBetween(ANNOUNCE_DATE, '2028-02-29')).toBe(484);
    expect(addDays(ANNOUNCE_DATE, 484)).toBe('2028-02-29');
    expect(addDays(ANNOUNCE_DATE, WINDOW.max)).toBe('2028-11-01');
  });

  it('add and between undo each other for every window in range', () => {
    for (let w = WINDOW.min; w <= WINDOW.max; w++) expect(daysBetween(ANNOUNCE_DATE, addDays(ANNOUNCE_DATE, w))).toBe(w);
  });

  it('refuses a date that is not yyyy-mm-dd', () => {
    expect(() => dayNumber('2026-11')).toThrow();
    expect(() => dayNumber('2 Nov 2026')).toThrow();
  });

  it('writes the Sunset header as an HTTP date in GMT: the announcement day is a Monday', () => {
    expect(sunsetHeaderValue(ANNOUNCE_DATE)).toBe('Mon, 02 Nov 2026 00:00:00 GMT');
    expect(sunsetHeaderValue(addDays(ANNOUNCE_DATE, 90))).toBe('Sun, 31 Jan 2027 00:00:00 GMT');
    expect(sunsetHeaderValue('2028-02-29')).toBe('Tue, 29 Feb 2028 00:00:00 GMT');
  });
});

describe('the Deprecation header', () => {
  it('is @ and the Unix seconds of the day, an RFC 9745 Structured Field Date, matching Date.parse', () => {
    expect(deprecationHeaderValue(ANNOUNCE_DATE)).toBe(`@${Date.parse('2026-11-02T00:00:00Z') / 1000}`);
    expect(deprecationHeaderValue('1970-01-02')).toBe('@86400');
    expect(deprecationHeaderValue('2023-07-01')).toBe('@1688169600');
  });
});

describe('who is still on the old version at the sunset', () => {
  const lag = Object.fromEntries(SUNSET_CLIENTS.map((c) => [c.id, c.lag]));
  const stillOld = (window: number, choice: Choice) => simulate(window, choice).clients.filter((c) => c.onOldAtSunset).map((c) => c.id).sort();

  it('with no mitigation, exactly the clients whose lag exceeds the window (or who never migrate), for every window', () => {
    for (let w = WINDOW.min; w <= WINDOW.max; w++) {
      const expected = SUNSET_CLIENTS.filter((c) => c.lag === null || c.lag > w).map((c) => c.id).sort();
      expect(stillOld(w, 'break'), `window ${w}`).toEqual(expected);
    }
  });

  it('a client that finishes on the sunset day itself has migrated in time', () => {
    expect(stillOld(45, 'break')).not.toContain('mobile');
    expect(stillOld(44, 'break')).toContain('mobile');
    expect(lag.mobile).toBe(45);
  });

  it('an extension keeps the clients whose lag exceeds the window plus the extension', () => {
    for (let w = WINDOW.min; w <= WINDOW.max; w++) {
      const expected = SUNSET_CLIENTS.filter((c) => c.lag === null || c.lag > w + EXTENSION_DAYS).map((c) => c.id).sort();
      expect(stillOld(w, 'extend'), `window ${w}`).toEqual(expected);
      expect(simulate(w, 'extend').sunsetDay).toBe(w + EXTENSION_DAYS);
      expect(simulate(w, 'extend').announcedSunsetDay).toBe(w);
    }
  });

  it('a brownout never leaves anyone on the old version who would have migrated in time without it', () => {
    for (let w = WINDOW.min; w <= WINDOW.max; w++) {
      const without = new Set(stillOld(w, 'break'));
      for (const id of stillOld(w, 'brownout')) expect(without.has(id as never), `${id} at window ${w}`).toBe(true);
    }
  });

  it('a client that never migrates is still on the old version under every choice and window', () => {
    for (const choice of ['break', 'extend', 'brownout'] as const) {
      for (let w = WINDOW.min; w <= WINDOW.max; w += 17) expect(stillOld(w, choice)).toContain('batch');
    }
  });

  it('a longer window never leaves more clients on the old version', () => {
    for (let w = WINDOW.min; w < WINDOW.max; w++) {
      expect(stillOld(w + 1, 'break').length).toBeLessThanOrEqual(stillOld(w, 'break').length);
    }
  });
});

describe('the three choices at the default window, worked by hand', () => {
  it('break at 90 days: the partner (lag 120) and the batch job are cut off', () => {
    const o = simulate(90, 'break');
    expect(o.sunsetDay).toBe(90);
    expect(o.brokenAtSunset).toBe(2);
    expect(o.plannedClientHours).toBe(0);
    expect(o.brownoutDays).toEqual([]);
  });

  it('extend at 90 days: the sunset moves to day 150, the partner makes it, the batch job does not', () => {
    const o = simulate(90, 'extend');
    expect(o.sunsetDay).toBe(150);
    expect(o.brokenAtSunset).toBe(1);
  });

  it('brownout at 90 days: brownouts on days 76 and 83; the partner reacts and migrates on day 83; 3 client-hours of planned failure', () => {
    const o = simulate(90, 'brownout');
    expect(o.brownoutDays).toEqual([90 - BROWNOUT_LEADS[0], 90 - BROWNOUT_LEADS[1]]);
    expect(o.brownoutDays).toEqual([76, 83]);
    expect(o.clients.find((c) => c.id === 'partner')?.migratedAt).toBe(76 + REACTION_DAYS);
    expect(o.brokenAtSunset).toBe(1);
    // Day 76: the partner (migrates on 83) and the batch job are on v1, 2 hours. Day 83: the partner just moved, so only the batch job: 1 hour.
    expect(o.plannedClientHours).toBe(3 * BROWNOUT_HOURS);
  });

  it('brownout at 30 days: all three noticing clients are pulled forward, 5 client-hours, only the batch job is cut off', () => {
    const o = simulate(30, 'brownout');
    expect(o.clients.map((c) => [c.id, c.migratedAt])).toEqual([['mobile', 23], ['partner', 23], ['web', 20], ['batch', null]]);
    expect(o.plannedClientHours).toBe(5);
    expect(o.brokenAtSunset).toBe(1);
  });
});
