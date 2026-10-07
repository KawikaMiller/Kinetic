import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { buildFrames } from './frames';
import lesson from './index';
import {
  BAD, GOOD, HOT_PCT, LIMIT_MB, LEAK_STEP_MB, SLOW_BUILD_SECONDS, START, WORKER, cacheBuild, containerDiskMb, leakTick,
  meterHot, pidSeenFrom, restartPhase, vmDiskGb, type Change, type Instr,
} from './model';

const FILES: [string, Instr[]][] = [['good', GOOD], ['bad', BAD]];
const CHANGES: Change[] = ['first', 'code', 'deps'];
const NPM_CI = 'RUN npm ci';

describe('layer caching', () => {
  it('reuses exactly the layers below the first changed input (reference rule), for every file and change', () => {
    for (const [, file] of FILES) {
      for (const change of CHANGES) {
        const build = cacheBuild(file, change);
        file.forEach((_, i) => {
          const missBelowOrHere = change === 'first' || file.slice(0, i + 1).some((ins) => ins.inputs.includes(change as never));
          expect(build[i].status).toBe(missBelowOrHere ? 'built' : 'cached');
        });
        // build time is the sum of the rebuilt layers
        const expected = file.reduce((t, ins, i) => t + (build[i].status === 'built' ? ins.seconds : 0), 0);
        expect(build.at(-1)!.seconds).toBeCloseTo(expected);
      }
    }
  });

  it('a code edit keeps npm ci cached with deps first, and reruns it when everything is copied first', () => {
    const at = (file: Instr[], change: Change) => cacheBuild(file, change)[file.findIndex((i) => i.text === NPM_CI)].status;
    expect(at(GOOD, 'code')).toBe('cached');
    expect(at(BAD, 'code')).toBe('built');
    expect(at(GOOD, 'deps')).toBe('built');
    expect(at(BAD, 'deps')).toBe('built');
    expect(cacheBuild(GOOD, 'code').at(-1)!.seconds).toBeLessThan(SLOW_BUILD_SECONDS);
    expect(cacheBuild(BAD, 'code').at(-1)!.seconds).toBeGreaterThan(SLOW_BUILD_SECONDS);
  });

  it('every frame is captioned, and the closing caption reports the model\'s time and reuse', () => {
    for (const [, file] of FILES) {
      for (const change of CHANGES) {
        const frames = buildFrames(file, change);
        for (const f of frames) expect(text(f.say).length).toBeGreaterThan(0);
        const build = cacheBuild(file, change);
        const reused = build.filter((b) => b.status === 'cached').length;
        expect(text(frames.at(-1)!.say)).toContain(`Build took ${build.at(-1)!.seconds.toFixed(1)}s with ${reused}/${file.length} layers reused.`);
      }
    }
  });

  it('the quiz answer: with COPY . . before npm ci, a source edit reruns npm ci', () => {
    const q = lesson.quiz.find((x) => x.q.includes('COPY . . before RUN npm ci'))!;
    expect(q.options[q.answer]).toMatch(/npm ci runs again/);
    expect(cacheBuild(BAD, 'code')[BAD.findIndex((i) => i.text === NPM_CI)].status).toBe('built');
  });
});

describe('VMs vs containers', () => {
  it('a VM pays a guest OS per app; containers pay only the app', () => {
    expect(vmDiskGb(3)).toBeCloseTo(6.6);
    expect(containerDiskMb(3)).toBeCloseTo(600); // shown rounded to whole MB
    for (let n = 1; n <= 4; n++) expect(vmDiskGb(n) * 1000).toBeGreaterThan(containerDiskMb(n) * 10);
  });
});

describe('isolation', () => {
  it('inside its namespace every process is PID 1; the host sees its real PID', () => {
    for (const c of START) {
      expect(pidSeenFrom(c, false)).toBe(1);
      expect(pidSeenFrom(c, true)).toBe(c.hostPid);
    }
  });

  it('a leak climbs to the cgroup limit, never past it, and the kernel kills it there', () => {
    let c = START[WORKER];
    let ticks = 0;
    while (c.status === 'running') {
      c = leakTick(c);
      ticks++;
      expect(c.mem).toBeLessThanOrEqual(LIMIT_MB);
    }
    expect(c.status).toBe('oom');
    expect(c.mem).toBe(LIMIT_MB);
    expect(ticks).toBe(Math.ceil((LIMIT_MB - START[WORKER].mem) / LEAK_STEP_MB));
  });

  it('the meter turns red near the limit, before the kill', () => {
    expect(meterHot(LIMIT_MB * (HOT_PCT / 100) + 1, LIMIT_MB)).toBe(true);
    expect(meterHot(LIMIT_MB * (HOT_PCT / 100) - 1, LIMIT_MB)).toBe(false);
  });

  it('restart: killed -> restarting -> a fresh process with a new host PID, still PID 1 inside', () => {
    const killed = { ...START[WORKER], mem: LIMIT_MB, status: 'oom' as const };
    const restarting = restartPhase(killed, START[WORKER]);
    expect(restarting.status).toBe('restarting');
    const fresh = restartPhase(restarting, START[WORKER]);
    expect(fresh.status).toBe('running');
    expect(fresh.mem).toBe(START[WORKER].mem);
    expect(fresh.hostPid).not.toBe(killed.hostPid);
    expect(pidSeenFrom(fresh, false)).toBe(1);
    // a running container is left alone
    expect(restartPhase(START[0], START[0])).toBe(START[0]);
  });
});
