import { describe, expect, it } from 'vitest';
import lesson from './index';
import { DEFAULT_LEAKS, DEFAULT_RPS, GAUGES, RPS_MAX, RPS_MIN, RPS_STEP, SCENARIO_FOR, alertHours, cascade, check, hitHours, loopText, usageAt, warningHours, type Load } from './model';

const defaults: Load = { leaks: new Set(DEFAULT_LEAKS), rps: DEFAULT_RPS };
const outbound = (rps: number): Load => ({ leaks: new Set(['outbound'] as const), rps });

describe('the quiz numbers come from the model', () => {
  it('Q1: inodes run out while disk bytes read 44%', () => {
    expect(check('inodes', 'disk').reading).toBeCloseTo(0.44, 2);
    expect(GAUGES.inodes.limit).toBe(6_553_600);
    expect(lesson.quiz[0].why).toContain('6,553,600');
  });

  it('Q2: 468 requests a second fits the port range and 469 does not; 28,232 / 60 is about 470', () => {
    expect(hitHours('ports', outbound(468))).toBeNull();
    expect(hitHours('ports', outbound(469))).not.toBeNull();
    expect(Math.floor(GAUGES.ports.limit / 60)).toBe(470);
    expect(lesson.quiz[1].why).toContain('150 ports');
    expect(lesson.quiz[1].q).toContain('single upstream');
  });

  it('the Traffic slider can land on 468 and 469, so the learner text about them is reachable', () => {
    const reachable = (v: number) => v >= RPS_MIN && v <= RPS_MAX && (v - RPS_MIN) % RPS_STEP === 0;
    expect(reachable(468) && reachable(469)).toBe(true);
  });

  it('the default state matches the first Try this: disk yellow with about 18 GiB free while the inodes are at their limit', () => {
    const disk = usageAt('disk', defaults, 20);
    const freeGiB = (GAUGES.disk.limit - disk) / 1024 ** 3;
    expect(disk / GAUGES.disk.limit).toBeGreaterThan(0.8);
    expect(disk / GAUGES.disk.limit).toBeLessThan(1);
    expect(freeGiB).toBeGreaterThan(17);
    expect(freeGiB).toBeLessThan(19);
    expect(usageAt('inodes', defaults, 20)).toBe(GAUGES.inodes.limit);
    expect(lesson.tryThis[0]).toContain('18 GiB');
    const tempOnly: Load = { leaks: new Set(['tempfiles'] as const), rps: DEFAULT_RPS };
    expect(usageAt('disk', tempOnly, 20) / GAUGES.disk.limit).toBeLessThan(0.5);
  });

  it('Q3: the leaked-socket gauge comes back after about 10.7 hours, while a full disk would fail again at once', () => {
    expect(hitHours('fds', SCENARIO_FOR.fds)).toBeCloseTo(10.71, 2);
    expect(lesson.quiz[2].why).toContain('10.7 hours');
    expect(loopText('disk', SCENARIO_FOR.disk)).toContain('fails again at once');
  });

  it('Q4: inodes hit at 17.6 h, the 80% alert at 14.0 h, 3.6 h earlier', () => {
    expect(hitHours('inodes', defaults)).toBeCloseTo(17.6, 1);
    expect(alertHours('inodes', defaults)).toBeCloseTo(14.0, 1);
    expect(warningHours('inodes', defaults)).toBeCloseTo(3.6, 1);
    expect(0.8 * GAUGES.inodes.limit).toBe(5_242_880);
    expect(lesson.quiz[3].why).toContain('5,242,880');
  });

  it('Q5: 137 is 128 plus 9, and the memory cascade has no health-check step', () => {
    expect(128 + 9).toBe(137);
    expect(cascade('memory').some((s) => s.node === 'health')).toBe(false);
    expect(usageAt('memory', SCENARIO_FOR.memory, 100)).toBe(GAUGES.memory.limit);
    expect(GAUGES.memory.limit).toBe(2 * 1024 ** 3);
  });
});
