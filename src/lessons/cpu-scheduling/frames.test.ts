import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { scheduleFrames } from './frames';
import lesson from './index';
import { compareAll, DEFAULT_OPTS, metricsOf, POLICIES, PRESETS, schedule, STARVE_TICKS } from './model';
import { CPU_LANE, ganttBars } from './view';

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

describe('scheduleFrames: every preset under every policy (25 combinations)', () => {
  for (const p of PRESETS) {
    for (const { value: policy } of POLICIES) {
      it(`${p.id} / ${policy}: one captioned frame per moment plus a true summary`, () => {
        const s = schedule(p.jobs, policy, p.opts);
        const frames = scheduleFrames(p.jobs, s, policy, p.opts);
        expect(frames).toHaveLength(s.moments.length + 1);
        expect(frames.every((f) => f.say !== undefined)).toBe(true);
        frames.slice(0, -1).forEach((f, i) => {
          const m = s.moments[i];
          const text = captionText(f.say);
          expect(f.at).toBe(i);
          expect(text.startsWith(`t = ${m.t}:`)).toBe(true);
          if (m.cpu?.kind === 'run') expect(text).toMatch(new RegExp(`${p.jobs[m.cpu.job].name} (gets the CPU|keeps running|runs now)`));
          if (m.cpu?.kind === 'idle') expect(text).toContain('idles');
          if (text.includes('keeps running')) expect(s.moments[i - 1].cpu).toEqual(m.cpu);
          if (m.cpu === null) expect(text).toContain('Every job is done');
          const starving = m.streak.some((x) => x >= STARVE_TICKS);
          expect(text.includes('starving')).toBe(starving);
        });
        const x = metricsOf(s);
        const last = captionText(frames.at(-1)!.say);
        expect(last).toContain(`at t = ${s.end}`);
        expect(last).toContain(`average waiting ${fmt(x.waiting)}`);
        expect(last).toContain(`average turnaround ${fmt(x.turnaround)}`);
        expect(last).toContain(`average response ${fmt(x.response)}`);
        expect(last.includes('went on switching')).toBe(s.switchTicks > 0);
      });
    }
  }
});

describe('ganttBars', () => {
  it('the CPU lane covers every tick so far exactly once, and only the running slice is ringed', () => {
    for (const p of PRESETS) {
      for (const { value: policy } of POLICIES) {
        const s = schedule(p.jobs, policy, p.opts);
        for (let now = 0; now < s.moments.length; now++) {
          const bars = ganttBars(p.jobs, s, now);
          const cpu = bars.filter((b) => b.lane === CPU_LANE);
          const drawn = Math.min(now + 1, s.end);
          expect(cpu.reduce((a, b) => a + (b.end - b.start), 0)).toBe(drawn);
          cpu.forEach((b, i) => i > 0 && expect(b.start).toBe(cpu[i - 1].end));
          const ringed = bars.filter((b) => b.ring);
          if (s.moments[now].cpu?.kind === 'run') {
            expect(ringed.map((b) => b.lane).sort()).toEqual([CPU_LANE, `job-${(s.moments[now].cpu as { job: number }).job}`].sort());
            ringed.forEach((b) => expect(b.end).toBe(now + 1));
          } else {
            expect(ringed).toEqual([]);
          }
        }
      }
    }
  });
});

describe('quiz numbers come from the model', () => {
  const textbook = PRESETS.find((p) => p.id === 'textbook')!;
  it('Q1: FCFS averages 17 ticks of waiting on the textbook jobs', () => {
    const q = lesson.quiz[0];
    expect(q.options[q.answer]).toBe(`${metricsOf(schedule(textbook.jobs, 'fcfs', DEFAULT_OPTS)).waiting} ticks`);
    expect(q.why).toContain(`an average of ${metricsOf(schedule(textbook.jobs, 'sjf', DEFAULT_OPTS)).waiting}`);
  });
  it('Q3: Long waits 12 under SJF; FCFS never makes anyone wait more than 9', () => {
    const starve = PRESETS.find((p) => p.id === 'starvation')!;
    const c = compareAll(starve.jobs, starve.opts);
    expect(schedule(starve.jobs, 'sjf', starve.opts).stats[0].waiting).toBe(12);
    expect(c.rows.find((r) => r.policy === 'fcfs')!.values.worstWait).toBe(9);
    expect(lesson.quiz[2].why).toContain('Long waits 12 ticks');
  });
});
