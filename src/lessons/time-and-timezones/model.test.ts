import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  DST, HOUR, dstTimeline, falsehoods, gapWeeks, hoursInDay, instantsFor, naiveJobRuns, offsetText, parseWall, storageComparison, transitions,
  wallClock,
} from './model';

const iso = (ms: number) => new Date(ms).toISOString();
const YEAR_START = Date.UTC(2026, 0, 1);
const YEAR_END = Date.UTC(2027, 0, 1);

describe('2026 transitions, found through Intl (never a hard-coded offset)', () => {
  it('US: 8 March and 1 November', () => {
    expect(transitions('America/New_York', YEAR_START, YEAR_END).map((t) => [iso(t.at), t.from, t.to])).toEqual([
      ['2026-03-08T07:00:00.000Z', -300, -240],
      ['2026-11-01T06:00:00.000Z', -240, -300],
    ]);
  });

  it('EU: 29 March and 25 October', () => {
    expect(transitions('Europe/London', YEAR_START, YEAR_END).map((t) => [iso(t.at), t.from, t.to])).toEqual([
      ['2026-03-29T01:00:00.000Z', 0, 60],
      ['2026-10-25T01:00:00.000Z', 60, 0],
    ]);
  });
});

describe('wall clocks, gaps and overlaps', () => {
  it('02:30 on 8 March 2026 never happens in New York; 01:30 on 1 November happens twice', () => {
    expect(instantsFor({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York')).toEqual([]);
    expect(instantsFor({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York').map(iso)).toEqual([
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T06:30:00.000Z',
    ]);
  });

  it('round-trips random instants through wall clocks, including half-hour and DST zones', () => {
    const rnd = mulberry32(3);
    for (const zone of ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'UTC']) {
      for (let n = 0; n < 300; n++) {
        const at = Math.floor((YEAR_START + rnd() * (YEAR_END - YEAR_START)) / 60_000) * 60_000;
        expect(instantsFor(wallClock(at, zone), zone)).toContain(at);
      }
    }
  });

  it('reads offsets, including half and quarter hours', () => {
    const jan = Date.UTC(2026, 0, 15, 12);
    expect(wallClock(jan, 'America/New_York').offset).toBe(-300);
    expect(wallClock(jan, 'Asia/Kolkata').offset).toBe(330);
    expect(wallClock(jan, 'Asia/Kathmandu').offset).toBe(345);
    expect(offsetText(-300)).toBe('UTC-05:00');
    expect(offsetText(345)).toBe('UTC+05:45');
  });

  it('has 23- and 25-hour days', () => {
    expect(hoursInDay(2026, 3, 8, 'America/New_York')).toBe(23);
    expect(hoursInDay(2026, 11, 1, 'America/New_York')).toBe(25);
    expect(hoursInDay(2026, 3, 9, 'America/New_York')).toBe(24);
    expect(hoursInDay(2026, 3, 29, 'Europe/London')).toBe(23);
  });

  it('parses a date-only ISO string as UTC midnight', () => {
    expect(new Date('2026-03-08').getTime()).toBe(Date.UTC(2026, 2, 8));
    const ny = wallClock(new Date('2026-03-08').getTime(), 'America/New_York');
    expect([ny.day, ny.hour]).toEqual([7, 19]);
  });

  it('handles leap days and rejects impossible dates', () => {
    expect(parseWall('2028-02-29', '12:00')).toEqual({ year: 2028, month: 2, day: 29, hour: 12, minute: 0 });
    expect(parseWall('2026-02-29', '12:00')).toBeNull();
    expect(parseWall('2026-13-01', '12:00')).toBeNull();
    expect(parseWall('2026-03-08', '24:00')).toBeNull();
    expect(hoursInDay(2028, 2, 29, 'UTC')).toBe(24);
  });
});

describe('the lesson scenarios', () => {
  it('marks the skipped and repeated local hours on the timeline', () => {
    const springLine = dstTimeline(DST.spring, ['UTC', 'America/New_York']);
    const ny = springLine.rows['America/New_York'];
    expect(ny).toHaveLength(48);
    const jump = ny.filter((c) => c.afterGap);
    expect(jump.map((c) => [iso(c.at), c.local.hour, c.skipped])).toEqual([['2026-03-08T07:00:00.000Z', 3, '02:00-02:59']]);
    expect(ny.some((c) => c.local.day === 8 && c.local.hour === 2)).toBe(false);
    const fall = dstTimeline(DST.fall, ['America/New_York']).rows['America/New_York'];
    expect(fall.filter((c) => c.repeated).map((c) => c.local.hour)).toEqual([1, 1]);
  });

  it('a naive daily job is skipped in spring and runs twice in the fall', () => {
    expect(naiveJobRuns(DST.spring).map((r) => r.runs.length)).toEqual([1, 0, 1]);
    expect(naiveJobRuns(DST.fall).map((r) => r.runs.length)).toEqual([1, 2, 1]);
  });

  it('the NY-London lead is 4 hours exactly in the gap weeks', () => {
    const days = gapWeeks();
    const short = days.filter((d) => d.lead === 4).map((d) => d.date.day);
    expect(short).toEqual(Array.from({ length: 21 }, (_, k) => k + 8)); // 8-28 March
    expect(days.find((d) => d.date.day === 2)!.meetingInLondon).toBe('14:00');
    expect(days.find((d) => d.date.day === 10)!.meetingInLondon).toBe('13:00');
  });

  it('a naive local time means different instants to different servers; UTC + zone means one', () => {
    const wall = { year: 2026, month: 3, day: 10, hour: 9, minute: 0 };
    const cmp = storageComparison(wall, 'America/New_York', ['America/New_York', 'Europe/London']);
    const [ny, london] = cmp.naive.map((n) => n.instant!);
    expect((ny - london) / HOUR).toBe(4);
    expect(cmp.stored.utc).toBe('2026-03-10T13:00:00.000Z');
  });

  it('falsehood cards carry computed counterexamples', () => {
    const cards = Object.fromEntries(falsehoods().map((f) => [f.id, f]));
    expect(cards['day-24h'].evidence).toEqual(['8 Mar 2026 in New York: 23 hours', '1 Nov 2026 in New York: 25 hours']);
    expect(cards['offset-zone'].evidence[1]).toBe('July: New York UTC-04:00, Bogotá UTC-05:00');
    expect(cards['date-only'].evidence[0]).toBe('toISOString() → 2026-03-08T00:00:00.000Z');
    expect(cards['whole-hours'].evidence[1]).toBe('Kathmandu: UTC+05:45');
  });
});
