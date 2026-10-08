import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { psLines, shutdownFrames, zombieFrames } from './frames';
import { DEFAULT_GRACE, EXIT_CODE, isZombie, LB_LAG, POOL_CLOSE, procTable, requestsFor, shutdown, SIGNALS, SIGTERM_AT, type ChildCase, type Mode } from './model';

const MODES: Mode[] = ['none', 'graceful', 'slow', 'pid1'];
const GRACES = [1, 2, 3, 5, 10, 20, 30, 38, 40, 45, 60];
const T = SIGTERM_AT;

describe('shutdown(config)', () => {
  it('no handler: every request in flight at SIGTERM is cut at that moment', () => {
    for (const g of GRACES) {
      const run = shutdown('none', g);
      expect(run.exitAt).toBe(T);
      expect(run.exitCode).toBe(EXIT_CODE.sigterm);
      for (const r of run.requests) {
        const inFlight = r.start < T && r.start + r.dur > T;
        expect(r.fate === 'cut').toBe(inFlight);
        if (inFlight) expect(r.end).toBe(T);
      }
    }
  });

  it('graceful: cuts nothing whenever draining fits in the grace period', () => {
    for (const g of GRACES) {
      const run = shutdown('graceful', g);
      const lastEnd = Math.max(...requestsFor('graceful').filter((r) => r.start < T + LB_LAG).map((r) => r.start + r.dur));
      const drainTime = Math.max(T + LB_LAG, lastEnd) + POOL_CLOSE - T;
      if (drainTime <= g) {
        expect(run.requests.filter((r) => r.fate === 'cut' || r.fate === 'refused')).toEqual([]);
        expect(run.exitCode).toBe(EXIT_CODE.clean);
      } else expect(run.killed).toBe(true);
    }
  });

  it('too slow: SIGKILL at SIGTERM + grace cuts exactly the requests still running then', () => {
    for (const g of GRACES) {
      const run = shutdown('slow', g);
      if (!run.killed) continue;
      expect(run.exitAt).toBe(T + g);
      for (const r of run.requests) {
        if (r.fate === 'refused' || r.fate === 'elsewhere') continue;
        expect(r.fate === 'cut').toBe(r.start + r.dur > T + g);
      }
    }
    expect(shutdown('slow', DEFAULT_GRACE).requests.filter((r) => r.fate === 'cut').map((r) => r.label)).toEqual(['CSV export']);
  });

  it('PID 1 shell: nothing changes until SIGKILL (every request goes exactly as if no signal were sent)', () => {
    for (const g of GRACES) {
      const run = shutdown('pid1', g);
      expect(run.handled).toBe(false);
      expect(run.exitAt).toBe(T + g);
      expect(run.exitCode).toBe(EXIT_CODE.sigkill);
      for (const r of run.requests) {
        if (r.start >= T + LB_LAG) continue;
        if (r.start >= T + g) continue;
        const finish = r.start + r.dur;
        expect(r.fate).toBe(finish <= T + g ? (finish > T ? 'drained' : 'done') : 'cut');
      }
    }
  });

  it('the load balancer stops sending LB_LAG after SIGTERM, in every mode', () => {
    for (const m of MODES) for (const r of shutdown(m).requests) expect(r.fate === 'elsewhere').toBe(r.start >= T + LB_LAG);
  });

  it('exit codes are 128 + the signal number', () => {
    expect(EXIT_CODE.sigterm).toBe(143);
    expect(EXIT_CODE.sigkill).toBe(137);
  });
});

describe('signal table (signal(7), x86 / ARM Linux)', () => {
  it('pins numbers and catchability', () => {
    const t = Object.fromEntries(SIGNALS.map((s) => [s.name, [s.number, s.catchable, s.action]]));
    expect(t).toEqual({
      SIGHUP: [1, true, 'terminate'],
      SIGINT: [2, true, 'terminate'],
      SIGKILL: [9, false, 'terminate'],
      SIGTERM: [15, true, 'terminate'],
      SIGCHLD: [17, true, 'ignore'],
      SIGSTOP: [19, false, 'stop'],
    });
  });
});

describe('zombies', () => {
  it('a zombie exists iff the child exited and the parent has not reaped it', () => {
    const exited = (c: ChildCase, step: number) => step >= 1 && c !== 'orphan';
    const reaped = (c: ChildCase, step: number) => c === 'reap' && step >= 2;
    for (const c of ['no-reap', 'reap', 'orphan'] as ChildCase[]) {
      for (const step of [0, 1, 2]) expect(procTable(c, step).some(isZombie)).toBe(exited(c, step) && !reaped(c, step));
    }
  });
  it('an orphan is re-parented to PID 1', () => {
    expect(procTable('orphan', 1).find((p) => p.name === 'worker')!.ppid).toBe(1);
  });
  it('ps marks zombies <defunct>, and the frames say so', () => {
    expect(psLines('no-reap', 1).some((l) => l.includes('<defunct>'))).toBe(true);
    expect(psLines('reap', 2).some((l) => l.includes('<defunct>'))).toBe(false);
    for (const c of ['no-reap', 'reap', 'orphan'] as ChildCase[]) {
      const last = captionText(zombieFrames(c).at(-1)!.say);
      expect(last.includes('Still a zombie')).toBe(procTable(c, 2).some(isZombie));
    }
  });
});

describe('shutdown frames, every mode × grace', () => {
  for (const m of MODES) {
    it(m, () => {
      for (const g of GRACES) {
        const run = shutdown(m, g);
        const frames = shutdownFrames(run);
        for (let i = 1; i < frames.length; i++) expect(frames[i].now).toBeGreaterThanOrEqual(frames[i - 1].now);
        const all = frames.map((f) => captionText(f.say)).join(' | ');
        const last = captionText(frames.at(-1)!.say);
        const failed = run.requests.filter((r) => r.fate === 'cut' || r.fate === 'refused').length;
        expect(last.includes('No request failed')).toBe(failed === 0);
        expect(last).toContain(`Exit code ${run.exitCode}`);
        expect(all.includes('SIGKILL')).toBe(run.killed);
        expect(all.includes('exits 0')).toBe(run.exitCode === 0);
        const cut = run.requests.filter((r) => r.fate === 'cut');
        if (run.killed && cut.length) expect(all).toContain(`${cut.length} request${cut.length === 1 ? '' : 's'} cut`);
      }
    });
  }
});

describe('view: countdown and markers', async () => {
  const { graceLeft, shutdownMarkers, requestBars } = await import('./view');
  it('the countdown stops when the process exits on its own, and reaches 0 only for SIGKILL', () => {
    for (const m of MODES) {
      for (const g of GRACES) {
        const run = shutdown(m, g);
        expect(graceLeft(run, T - 1)).toBeNull();
        const after = graceLeft(run, run.exitAt);
        if (run.killed) expect(after).toBe(0);
        else expect(after).toBeNull();
        const marks = shutdownMarkers(run, run.exitAt);
        expect(marks.some((k) => k.label === 'SIGKILL' && k.tone === 'bad')).toBe(run.killed);
        expect(marks.some((k) => k.label === 'deadline')).toBe(false);
      }
    }
  });
  it('bars only appear once their request has arrived, and cut bars are red only after the cut', () => {
    const run = shutdown('slow', DEFAULT_GRACE);
    for (const t of [0, 5, 10, 20, 40]) {
      for (const b of requestBars(run, t)) {
        const r = run.requests.find((x) => x.id === b.id)!;
        expect(r.start).toBeLessThanOrEqual(t);
        if (b.tone === 'bad' && r.fate === 'cut') expect(t).toBeGreaterThanOrEqual(r.end);
      }
    }
  });
});

describe('review G1 / G2', async () => {
  const { handlerState, killedAtLine, HANDLER } = await import('./view');
  it('a dead process never shows a running handler line, for every mode, grace and frame', () => {
    for (const m of MODES) {
      for (const g of GRACES) {
        const run = shutdown(m, g);
        for (const f of shutdownFrames(run)) {
          const state = handlerState(f.phase, run, f.now);
          const lines = HANDLER.map((_, i) => state(i));
          if (f.now >= run.exitAt) expect(lines).not.toContain('now');
          if (f.now >= run.exitAt && run.killed) expect(lines.indexOf('cut')).toBe(killedAtLine(run));
        }
      }
    }
  });
  it('a short grace kills the handler while it still waits for the LB (line 6), a long one while it drains (line 8)', () => {
    expect(killedAtLine(shutdown('graceful', 1))).toBe(5);
    expect(killedAtLine(shutdown('slow', DEFAULT_GRACE))).toBe(7);
  });
  it('the zombie caption gets the SIGCHLD rule right', () => {
    const text = zombieFrames('no-reap').map((f) => captionText(f.say)).join(' ');
    expect(text).not.toContain('ignores SIGCHLD');
    expect(text).toContain('leaves SIGCHLD at its default');
    expect(text).toContain('SIG_IGN would make the kernel reap children');
  });
});
