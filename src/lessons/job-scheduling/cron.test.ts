import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { CRON_NOW_MS, DOM_DOW_PRESET, MAX_CRON_CHARS, fireLabel, firesBetween, nextFires, parseCron } from './cron';

const must = (text: string) => {
  const r = parseCron(text);
  if (!r.ok) throw new Error(r.error);
  return r.cron;
};

/** An independent reading of one field: the values 0..max a text names, token by token. */
function oracleField(text: string, lo: number, hi: number): Set<number> {
  const out = new Set<number>();
  for (const token of text.split(',')) {
    const [range, step = '1'] = token.split('/');
    const [a, b] = range === '*' ? [lo, hi] : range.includes('-') ? range.split('-').map(Number) : [Number(range), Number(range)];
    for (let v = a; v <= b; v++) if ((v - a) % Number(step) === 0) out.add(v);
  }
  return out;
}

interface Minute {
  t: number;
  min: number;
  hour: number;
  dom: number;
  month: number;
  dow: number;
}

/** Every minute of a UTC year, with its calendar fields read from Date (the oracle's own clock). */
function yearOfMinutes(year: number): Minute[] {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const rows: Minute[] = [];
  for (let t = start; t < end; t += 60_000) {
    const d = new Date(t);
    rows.push({ t, min: d.getUTCMinutes(), hour: d.getUTCHours(), dom: d.getUTCDate(), month: d.getUTCMonth() + 1, dow: d.getUTCDay() });
  }
  return rows;
}

/** The brute-force matcher for one expression text: reads each field token by token, then tests one minute at a time from the man page's rule. */
function bruteMatcher(fields: string[]): (m: Minute) => boolean {
  const [fMin, fHour, fDom, fMonth, fDow] = fields;
  const [mins, hours, doms, months, dows] = [oracleField(fMin, 0, 59), oracleField(fHour, 0, 23), oracleField(fDom, 1, 31), oracleField(fMonth, 1, 12), oracleField(fDow, 0, 6)];
  const restricted = !fDom.startsWith('*') && !fDow.startsWith('*');
  return (m) => {
    if (!mins.has(m.min) || !hours.has(m.hour) || !months.has(m.month)) return false;
    const byDom = doms.has(m.dom);
    const byDow = dows.has(m.dow);
    return restricted ? byDom || byDow : byDom && byDow;
  };
}

const pickItem = (rnd: () => number, lo: number, hi: number): string => {
  const kind = Math.floor(rnd() * 5);
  const a = lo + Math.floor(rnd() * (hi - lo + 1));
  const b = a + Math.floor(rnd() * (hi - a + 1));
  const step = 1 + Math.floor(rnd() * Math.min(hi - lo, 12));
  if (kind === 0) return '*';
  if (kind === 1) return String(a);
  if (kind === 2) return `${a}-${b}`;
  if (kind === 3) return `*/${step}`;
  return `${a}-${b}/${step}`;
};
const randomField = (rnd: () => number, lo: number, hi: number) =>
  Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pickItem(rnd, lo, hi)).join(',');

describe('the cron parser equals a brute-force minute-by-minute matcher', () => {
  const year = yearOfMinutes(2026);
  const leap = yearOfMinutes(2028);
  it('over every minute of 2026 for 200 seeded expressions, including both-days-restricted ones (the OR rule)', () => {
    const rnd = mulberry32(2026);
    let bothRestricted = 0;
    let withFires = 0;
    for (let i = 0; i < 200; i++) {
      const fields = [randomField(rnd, 0, 59), randomField(rnd, 0, 23), randomField(rnd, 1, 31), randomField(rnd, 1, 12), randomField(rnd, 0, 6)];
      if (!fields[2].startsWith('*') && !fields[4].startsWith('*')) bothRestricted++;
      const text = fields.join(' ');
      const expected = year.filter(bruteMatcher(fields)).map((m) => m.t);
      if (expected.length > 0) withFires++;
      const got = firesBetween(must(text), year[0].t, Date.UTC(2027, 0, 1));
      expect(got.length, text).toBe(expected.length);
      expect(got, text).toEqual(expected);
    }
    expect(bothRestricted).toBeGreaterThan(20);
    expect(withFires).toBeGreaterThan(100);
  });

  it('and over a leap year for the days that only a leap year has', () => {
    for (const text of ['0 0 29 2 *', '30 6 29 2 *', '0 0 29 2 1', '0 12 * 2 0']) {
      const fields = text.split(' ');
      expect(firesBetween(must(text), leap[0].t, Date.UTC(2029, 0, 1)), text).toEqual(leap.filter(bruteMatcher(fields)).map((m) => m.t));
    }
  });
});

describe('the day-of-month versus day-of-week rule', () => {
  it('0 0 15 * 5 fires on every Friday and on every 15th, whatever weekday it is (oracle: the calendar through Date)', () => {
    const oracle = (from: number, to: number) => {
      const out: number[] = [];
      for (let t = from; t < to; t += 86_400_000) {
        const d = new Date(t);
        if (d.getUTCDate() === 15 || d.getUTCDay() === 5) out.push(d.getUTCDate());
      }
      return out;
    };
    const days = (from: number, to: number) => firesBetween(must(DOM_DOW_PRESET), from, to).map((t) => new Date(t).getUTCDate());
    // March 2026 from Monday the 2nd: Fridays 6, 13, 20, 27 and Sunday the 15th. April 1 is excluded.
    expect(days(CRON_NOW_MS, Date.UTC(2026, 3, 1))).toEqual([6, 13, 15, 20, 27]);
    expect(days(CRON_NOW_MS, Date.UTC(2026, 3, 1))).toEqual(oracle(CRON_NOW_MS, Date.UTC(2026, 3, 1)));
    // April 2026: Fridays 3, 10, 17, 24 and the 15th (a Wednesday).
    expect(days(Date.UTC(2026, 3, 1), Date.UTC(2026, 4, 1))).toEqual([3, 10, 15, 17, 24]);
    expect(days(Date.UTC(2026, 3, 1), Date.UTC(2026, 4, 1))).toEqual(oracle(Date.UTC(2026, 3, 1), Date.UTC(2026, 4, 1)));
  });

  it('with a star in one day field the other alone decides, and */2 counts as a star (both have to match)', () => {
    const fridays = firesBetween(must('0 0 * * 5'), CRON_NOW_MS, Date.UTC(2026, 3, 1)).map((t) => new Date(t).getUTCDate());
    expect(fridays).toEqual([6, 13, 20, 27]);
    const both = firesBetween(must('0 0 */2 * 5'), CRON_NOW_MS, Date.UTC(2026, 3, 1)).map((t) => new Date(t).getUTCDate());
    // odd days of the month (1, 3, 5...) that are also Fridays: the 13th and the 27th.
    expect(both).toEqual([13, 27]);
  });

  it('the next five fires after the lesson\'s Monday are the five Fridays and 13ths the calendar gives, labelled in UTC', () => {
    const five = nextFires(must(DOM_DOW_PRESET), CRON_NOW_MS, 5).map(fireLabel);
    expect(five).toEqual([
      'Fri 6 Mar 2026 00:00 UTC',
      'Fri 13 Mar 2026 00:00 UTC',
      'Sun 15 Mar 2026 00:00 UTC',
      'Fri 20 Mar 2026 00:00 UTC',
      'Fri 27 Mar 2026 00:00 UTC',
    ]);
  });
});

describe('hostile input is refused with the reason', () => {
  const refused = (text: string) => {
    const r = parseCron(text);
    return r.ok ? null : r.error;
  };
  it('names the field and the problem', () => {
    expect(refused('61 * * * *')).toContain('61 is outside 0 to 59 in the minute field');
    expect(refused('* 24 * * *')).toContain('24 is outside 0 to 23');
    expect(refused('* * 0 * *')).toContain('0 is outside 1 to 31');
    expect(refused('* * * 13 *')).toContain('13 is outside 1 to 12');
    expect(refused('* * * * 7')).toContain('7 is outside 0 to 6');
    expect(refused('*/0 * * * *')).toContain('A step of 0');
    expect(refused('')).toContain('five fields');
    expect(refused('* * * *')).toContain('not 4');
    expect(refused('* * * * * *')).toContain('not 6');
    expect(refused('5-1 * * * *')).toContain('runs backwards');
    expect(refused('1,,2 * * * *')).toContain('stray comma');
    expect(refused('* * * jan *')).toContain('not supported');
    expect(refused('5/10 * * * *')).toContain('a step needs a range or a star');
    expect(refused('1/2/3 * * * *')).toContain('more than one "/"');
    expect(refused('x'.repeat(MAX_CRON_CHARS + 1))).toContain('under');
  });
  it('accepts the shapes it documents', () => {
    for (const ok of ['* * * * *', '*/15 0-6 1,15 * 1-5', '0 0 1 1 *', '5-10/2 * * * *', ' 0   *  * * * ']) expect(parseCron(ok).ok, ok).toBe(true);
  });
});
