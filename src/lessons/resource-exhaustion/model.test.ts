import { describe, expect, it } from 'vitest';
import {
  ALERT_FRACTION, DEFAULT_LEAKS, DEFAULT_RPS, EDGES, EPHEMERAL_PORTS, GAUGES, GAUGE_IDS, GIB, LEAKS, LEAK_IDS, MAX_HOURS, NODE_TEXT, PRIMARY, SCENARIO_FOR, SYMPTOMS, TIME_WAIT_SECONDS,
  WRONG_GUESS_MINUTES, alertHours, cascade, check, firstIncident, hitHours, loopText, steadyPorts, symptomOrder, usageAt, warningHours, type GaugeId, type Load, type LeakId,
} from './model';

const load = (leaks: LeakId[], rps = DEFAULT_RPS): Load => ({ leaks: new Set(leaks), rps });
const SUBSETS: LeakId[][] = Array.from({ length: 1 << LEAK_IDS.length }, (_, m) => LEAK_IDS.filter((_, i) => m & (1 << i)));

describe('limits and their documented errors', () => {
  it('uses the Linux default ephemeral range 32768-60999: 28,232 ports, and a 60 s TIME_WAIT', () => {
    expect(EPHEMERAL_PORTS).toBe(28_232);
    expect(60_999 - 32_768 + 1).toBe(28_232);
    expect(TIME_WAIT_SECONDS).toBe(60);
    expect(GAUGES.ports.limit).toBe(28_232);
  });

  it('maps each gauge to the error systems report', () => {
    expect(GAUGES.disk.error).toBe('ENOSPC');
    expect(GAUGES.inodes.error).toBe('ENOSPC');
    expect(GAUGES.fds.error).toBe('EMFILE');
    expect(GAUGES.ports.error).toBe('EADDRNOTAVAIL');
    expect(GAUGES.memory.error).toContain('137');
    expect(GAUGES.pool.error).toContain('timeout');
    for (const g of GAUGE_IDS) {
      const first = NODE_TEXT[PRIMARY[g] as keyof typeof NODE_TEXT];
      const word = GAUGES[g].error.split(' ')[0];
      expect(first.toLowerCase()).toContain(word.toLowerCase());
    }
    expect(NODE_TEXT.oom).toContain('SIGKILL');
    expect(NODE_TEXT.oom).toContain('137');
  });

  it('has hand-checkable limits: a 100 GiB disk with one inode per 16 KiB is 6,553,600 inodes', () => {
    expect(GAUGES.inodes.limit).toBe(6_553_600);
    expect(GAUGES.disk.limit).toBe(100 * GIB);
    for (const g of GAUGE_IDS) expect(GAUGES[g].baseline).toBeLessThan(GAUGES[g].limit * ALERT_FRACTION);
  });
});

describe('gauges fill under load', () => {
  const defaults = load([...DEFAULT_LEAKS]);

  it('hits at hand-worked times: inodes at 17.6 h, disk at 25.9 h, with both default leaks', () => {
    expect(hitHours('inodes', defaults)).toBeCloseTo((6_553_600 - 200_000) / 360_000, 6);
    expect(hitHours('inodes', defaults)).toBeCloseTo(17.65, 2);
    // Per hour: logs 5120 B x 360,000 requests + temp files 4096 B x 360,000.
    expect(hitHours('disk', defaults)).toBeCloseTo((80 * GIB) / (360_000 * (5120 + 4096)), 6);
    expect(hitHours('disk', defaults)).toBeCloseTo(25.9, 1);
    expect(firstIncident(defaults)).toEqual({ gauge: 'inodes', hours: hitHours('inodes', defaults) });
  });

  it('inode exhaustion gives ENOSPC with free bytes remaining', () => {
    const l = load(['tempfiles']);
    const at = hitHours('inodes', l)!;
    expect(usageAt('inodes', l, at)).toBeCloseTo(GAUGES.inodes.limit, 3);
    const freeBytes = GAUGES.disk.limit - usageAt('disk', l, at);
    expect(freeBytes).toBeGreaterThan(50 * GIB);
    expect(PRIMARY.inodes).toBe('enospc-inodes');
  });

  it('matches a minute-by-minute accumulation for every leak subset and several traffic levels', () => {
    for (const rps of [20, 100, 350]) {
      for (const leaks of SUBSETS) {
        const l = load(leaks, rps);
        for (const g of GAUGE_IDS) {
          if (g === 'ports') continue;
          const perRequest = leaks.flatMap((id) => LEAKS[id].effects).filter((e) => e.gauge === g).reduce((s, e) => s + e.perRequest, 0);
          let used = GAUGES[g].baseline;
          let minutes = 0;
          while (used < GAUGES[g].limit && minutes < MAX_HOURS * 60 && perRequest > 0) {
            used += perRequest * rps * 60;
            minutes++;
          }
          const hit = hitHours(g, l);
          if (perRequest === 0 || minutes >= MAX_HOURS * 60) {
            if (perRequest === 0) expect(hit).toBeNull();
            continue;
          }
          expect(Math.abs(hit! * 60 - minutes)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('ports sit at rps x 60 and run out exactly when 150 + 60 x rps reaches 28,232 (469 requests a second)', () => {
    const at = (rps: number) => load(['outbound'], rps);
    expect(steadyPorts(at(100))).toBe(6000);
    expect(hitHours('ports', at(468))).toBeNull();
    expect(hitHours('ports', at(469))).not.toBeNull();
    expect(hitHours('ports', at(500))! * 3600).toBeCloseTo((28_232 - 150) / 500, 6);
    expect(hitHours('ports', load([], 500))).toBeNull();
  });

  it('never reads above its limit and never goes down', () => {
    for (const leaks of SUBSETS.filter((_, i) => i % 5 === 0)) {
      const l = load(leaks, 300);
      for (const g of GAUGE_IDS) {
        let prev = 0;
        for (let h = 0; h <= MAX_HOURS; h += 0.25) {
          const u = usageAt(g, l, h);
          expect(u).toBeLessThanOrEqual(GAUGES[g].limit);
          expect(u).toBeGreaterThanOrEqual(prev);
          prev = u;
        }
      }
    }
  });
});

describe('the first failure and its cascade', () => {
  const EXPECTED: Record<GaugeId, [string, number][]> = {
    disk: [['enospc-bytes', 0], ['log-writes-fail', 1], ['health', 31], ['restart', 91], ['loop', 92]],
    inodes: [['enospc-inodes', 0], ['tmp-fails', 1], ['errors5xx', 3], ['health', 33], ['restart', 93], ['loop', 94]],
    fds: [['emfile', 0], ['refused', 1], ['errors5xx', 3], ['health', 11], ['restart', 71], ['loop', 72]],
    pool: [['pool-timeout', 0], ['piled', 30], ['errors5xx', 31], ['health', 45], ['restart', 105], ['loop', 106]],
    ports: [['eaddrnotavail', 0], ['outbound-fails', 1], ['errors5xx', 3], ['health', 33], ['restart', 93], ['loop', 94]],
    memory: [['oom', 0], ['lost', 0], ['restart', 5], ['loop', 6]],
  };

  it.each(GAUGE_IDS)('%s: matches the hand-worked order and times', (g) => {
    expect(cascade(g).map((s) => [s.node, s.seconds])).toEqual(EXPECTED[g]);
  });

  it.each(GAUGE_IDS)('%s: every effect comes after a cause that is in the cascade, by the edge delay', (g) => {
    const steps = cascade(g);
    const time = new Map(steps.map((s) => [s.node, s.seconds]));
    for (const s of steps.slice(1)) {
      const causes = EDGES.filter((e) => e.to === s.node && time.has(e.from));
      expect(causes.length).toBeGreaterThan(0);
      expect(Math.min(...causes.map((e) => time.get(e.from)! + e.seconds))).toBe(s.seconds);
      for (const e of causes) expect(time.get(e.from)!).toBeLessThanOrEqual(s.seconds);
    }
    expect(steps.every((s, i) => i === 0 || steps[i - 1].seconds <= s.seconds)).toBe(true);
  });

  it('a memory limit is the only one that restarts without a failed health check', () => {
    for (const g of GAUGE_IDS) expect(cascade(g).some((s) => s.node === 'health')).toBe(g !== 'memory');
  });

  it('a restart never clears a full disk but does clear a leaked descriptor, with the time it takes to come back', () => {
    const l = load(['sockets']);
    expect(loopText('disk', load(['logs']))).toContain('still full');
    expect(loopText('inodes', load(['tempfiles']))).toContain('still full');
    expect(loopText('fds', l)).toContain(`${hitHours('fds', l)!.toFixed(1)} h`);
    expect(loopText('ports', load(['outbound'], 500))).toContain('traffic takes them straight back');
  });
});

describe('headroom alerts', () => {
  it('an 80% alert fires before the limit, and by the time the limit says, for every fill', () => {
    for (const leaks of SUBSETS) {
      for (const rps of [20, 100, 250, 469, 600]) {
        const l = load(leaks, rps);
        for (const g of GAUGE_IDS) {
          const hit = hitHours(g, l);
          const warn = alertHours(g, l);
          if (hit === null) continue;
          expect(warn).not.toBeNull();
          expect(warn!).toBeLessThan(hit);
          expect(usageAt(g, l, warn!)).toBeCloseTo(GAUGES[g].limit * ALERT_FRACTION, 3);
          expect(warningHours(g, l)).toBeCloseTo(hit - warn!, 9);
        }
      }
    }
  });

  it('gives hand-worked warning time: for the inode leak the 80% alert is about 14.1 h in, 3.5 h before the failure', () => {
    const l = load(['tempfiles']);
    expect(alertHours('inodes', l)).toBeCloseTo((0.8 * 6_553_600 - 200_000) / 360_000, 6);
    expect(warningHours('inodes', l)!).toBeGreaterThan(3);
  });
});

describe('find the limit', () => {
  it.each(GAUGE_IDS)('the %s scenario makes that gauge the first to fail', (g) => {
    expect(firstIncident(SCENARIO_FOR[g])?.gauge).toBe(g);
    expect(SYMPTOMS[g].length).toBeGreaterThan(10);
  });

  it('a wrong guess costs ten minutes and reads a gauge below its limit; the right one costs nothing and reads full', () => {
    for (const answer of GAUGE_IDS) {
      for (const guess of GAUGE_IDS) {
        const c = check(answer, guess);
        if (guess === answer) {
          expect(c).toMatchObject({ correct: true, minutesLost: 0 });
          expect(c.reading).toBeCloseTo(1, 9);
        }
        else {
          expect(c.correct).toBe(false);
          expect(c.minutesLost).toBe(WRONG_GUESS_MINUTES);
          expect(c.reading).toBeLessThan(1);
        }
      }
    }
  });

  it('the inode symptom leaves the disk-bytes gauge well under its limit, which is the misconception', () => {
    expect(check('inodes', 'disk').reading).toBeLessThan(0.6);
  });

  it('every seed shows all six symptoms exactly once, and seeds differ', () => {
    const orders = Array.from({ length: 50 }, (_, s) => symptomOrder(s));
    for (const o of orders) expect([...o].sort()).toEqual([...GAUGE_IDS].sort());
    expect(new Set(orders.map((o) => o.join())).size).toBeGreaterThan(5);
  });
});
