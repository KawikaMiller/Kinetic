import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAKS, DEFAULT_RPS, GAUGE_IDS, MAX_HOURS, firstIncident, hitHours, type Load } from './model';
import { clockLabel, formatValue, gaugeTone, history, logEntries } from './view';

const defaults: Load = { leaks: new Set(DEFAULT_LEAKS), rps: DEFAULT_RPS };

describe('gauge colour', () => {
  it('idle gauges are dim, whatever the clock says', () => {
    for (const h of [0, 20, MAX_HOURS]) {
      for (const g of ['fds', 'pool', 'ports', 'memory'] as const) expect(gaugeTone(g, defaults, h)).toBe('dim');
    }
  });

  it('a filling gauge goes blue, then yellow past 80%, then red at its limit', () => {
    const inodeHit = hitHours('inodes', defaults)!;
    expect(gaugeTone('inodes', defaults, 1)).toBe('info');
    expect(gaugeTone('inodes', defaults, inodeHit - 0.5)).toBe('hi');
    expect(gaugeTone('inodes', defaults, inodeHit)).toBe('bad');
    expect(gaugeTone('inodes', defaults, MAX_HOURS)).toBe('bad');
  });
});

describe('formatting', () => {
  it('formats bytes and counts, and the clock as H:MM:SS', () => {
    expect(formatValue('disk', 1024 ** 3)).toBe('1.0 GB');
    expect(formatValue('inodes', 6_553_600)).toBe('6,553,600');
    expect(clockLabel(0)).toBe('0:00:00');
    expect(clockLabel(17.5)).toBe('17:30:00');
    expect(clockLabel(1 + 31 / 3600)).toBe('1:00:31');
  });
});

describe('the log', () => {
  it('lists the alerts that are on, the first failure and its cascade, all in time order', () => {
    const entries = logEntries(defaults, new Set(['inodes', 'disk'] as const));
    // The inode alert (14.0 h) precedes the failure (17.6 h); the disk alert (19.4 h) comes after the incident's own cascade.
    expect(entries.map((e) => e.kind)).toEqual(['alert', 'first', 'downstream', 'downstream', 'downstream', 'downstream', 'downstream', 'alert']);
    expect(entries.every((e, i) => i === 0 || entries[i - 1].at <= e.at)).toBe(true);
    const first = entries.find((e) => e.kind === 'first')!;
    expect(first.at).toBeCloseTo(firstIncident(defaults)!.hours, 9);
    expect(first.text).toContain('ENOSPC');
  });

  it('has no alert line for a gauge nobody enabled an alert on, and no failure when nothing leaks', () => {
    expect(logEntries(defaults, new Set()).some((e) => e.kind === 'alert')).toBe(false);
    expect(logEntries({ leaks: new Set(), rps: 100 }, new Set(GAUGE_IDS))).toEqual([]);
  });

  it('every alert comes before the first failure that its own gauge causes', () => {
    for (const g of ['inodes', 'disk'] as const) {
      const e = logEntries(defaults, new Set([g]));
      const alert = e.find((x) => x.kind === 'alert');
      expect(alert).toBeDefined();
      expect(alert!.at).toBeLessThan(hitHours(g, defaults)!);
    }
  });
});

describe('history', () => {
  it('starts at the baseline share and never exceeds 100', () => {
    const h = history('inodes', defaults, MAX_HOURS, 0.5);
    expect(h[0]).toBeCloseTo((200_000 / 6_553_600) * 100, 6);
    expect(Math.max(...h)).toBeLessThanOrEqual(100);
    expect(h).toHaveLength(MAX_HOURS * 2 + 1);
  });
});
