import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { bootFrames, consoleFor, secText } from './frames';
import { bootRun, FAILING_UNIT, scheduleUnits, STAGES, UNITS, type BootConfig, type Firmware, type Scenario } from './model';

const SCENARIOS: Scenario[] = ['normal', 'no-kernel', 'no-driver', 'failing-service', 'unsigned-kernel'];

/** Every unit that has to finish before `id` can start, followed transitively. */
function ancestors(id: string): Set<string> {
  const out = new Set<string>();
  const walk = (x: string) => UNITS.find((u) => u.id === x)!.after.forEach((d) => (out.has(d) ? null : (out.add(d), walk(d))));
  walk(id);
  return out;
}

describe('systemd unit schedule', () => {
  const runs = scheduleUnits(UNITS);
  const at = new Map(runs.map((r) => [r.id, r]));

  it('is a topological order: no unit starts before everything it is ordered after has ended', () => {
    for (const u of UNITS) for (const d of u.after) expect(at.get(u.id)!.start).toBeGreaterThanOrEqual(at.get(d)!.end);
  });

  it('starts every unit as early as its dependencies allow (hand-worked times)', () => {
    expect(at.get('journald')!.start).toBe(0);
    expect(at.get('local-fs.target')!.start).toBe(0);
    expect(at.get('network')!.start).toBe(150);
    expect(at.get('postgresql')!.start).toBe(1050);
    expect(at.get('app')!.start).toBe(2650);
    expect(at.get('multi-user.target')!.end).toBe(3350);
  });

  it('runs two units at the same time only when neither depends on the other', () => {
    for (const a of runs) {
      for (const b of runs) {
        if (a.id >= b.id) continue;
        const overlap = a.start < b.end && b.start < a.end;
        if (overlap) {
          expect(ancestors(a.id).has(b.id)).toBe(false);
          expect(ancestors(b.id).has(a.id)).toBe(false);
        }
      }
    }
    expect(runs.some((a) => runs.some((b) => a !== b && a.start < b.end && b.start < a.end))).toBe(true);
  });

  it('a failed unit stops only the units that Require it', () => {
    const r = new Map(scheduleUnits(UNITS, new Set([FAILING_UNIT])).map((x) => [x.id, x]));
    expect(r.get(FAILING_UNIT)!.state).toBe('failed');
    expect(r.get('app')!.state).toBe('dependency-failed');
    expect(r.get('sshd')!.state).toBe('active');
    expect(r.get('multi-user.target')!.state).toBe('active');
  });
});

describe('bootRun, per preset', () => {
  const run = (scenario: Scenario, secureBoot = false, firmware: Firmware = 'uefi') => bootRun({ firmware, secureBoot, scenario });

  it('normal boots reach the login prompt with every stage ok', () => {
    for (const sb of [false, true]) {
      const r = run('normal', sb);
      expect(r.stoppedAt).toBeNull();
      expect(r.stages.every((s) => s.status === 'ok')).toBe(true);
    }
  });

  it('a missing kernel stops in the bootloader; a missing disk driver stops in the initramfs', () => {
    expect(run('no-kernel').stoppedAt).toBe('bootloader');
    expect(run('no-driver').stoppedAt).toBe('initramfs');
    for (const s of ['no-kernel', 'no-driver'] as const) {
      const r = run(s);
      const i = STAGES.indexOf(r.stoppedAt!);
      r.stages.forEach((st, j) => expect(st.status).toBe(j < i ? 'ok' : j === i ? 'failed' : 'not-reached'));
      expect(r.units).toBeNull();
    }
  });

  it('a failing service lets the boot carry on, marked degraded', () => {
    const r = run('failing-service');
    expect(r.stoppedAt).toBeNull();
    expect(r.degraded).toEqual([FAILING_UNIT, 'app']);
    expect(r.stages.at(-1)!.status).toBe('ok');
  });

  it('with Secure Boot on, an unsigned kernel always stops the chain; with it off, it boots', () => {
    for (const scenario of SCENARIOS) {
      const r = bootRun({ firmware: 'uefi', secureBoot: true, scenario });
      // The kernel check: refused for the unsigned kernel, never made when there is no kernel (review B1).
      const kernel = r.verifications.at(-1)!.status;
      if (scenario === 'unsigned-kernel') {
        expect(r.stoppedAt).toBe('bootloader');
        expect(kernel).toBe('failed');
      } else if (scenario === 'no-kernel') expect(kernel).toBe('not-reached');
      else expect(kernel).toBe('ok');
      expect(r.verifications.slice(0, 2).every((v) => v.status === 'ok')).toBe(true);
    }
    expect(run('unsigned-kernel', false).stoppedAt).toBeNull();
  });

  it('legacy BIOS never does Secure Boot, even if the toggle says on', () => {
    const r = run('unsigned-kernel', true, 'bios');
    expect(r.verifications).toEqual([]);
    expect(r.stoppedAt).toBeNull();
    expect(r.stages[1].info.from).toContain('MBR');
  });

  it('stages follow each other with no gaps, starting at power on', () => {
    for (const scenario of SCENARIOS) {
      const r = run(scenario);
      expect(r.stages[0].start).toBe(0);
      for (let i = 1; i < r.stages.length; i++) expect(r.stages[i].start).toBe(r.stages[i - 1].end);
    }
  });

  it('pins the stage names and paths (UEFI spec; systemd bootup(7))', () => {
    const r = run('normal', true);
    expect(r.stages.map((s) => s.info.id)).toEqual(['firmware', 'bootmgr', 'bootloader', 'kernel', 'initramfs', 'systemd', 'login']);
    expect(r.stages[1].info.from).toContain('EFI System Partition (FAT32)');
    expect(r.stages[1].info.from).toContain('shimx64.efi');
    expect(run('normal', false).stages[1].info.from).toContain('\\EFI\\ubuntu\\grubx64.efi');
    expect(r.stages[5].info.control).toBe('systemd, PID 1');
  });
});

describe('boot frames, every firmware × Secure Boot × scenario', () => {
  for (const firmware of ['uefi', 'bios'] as Firmware[]) {
    for (const secureBoot of [false, true]) {
      for (const scenario of SCENARIOS) {
        it(`${firmware}, SB ${secureBoot ? 'on' : 'off'}, ${scenario}`, () => {
          const c: BootConfig = { firmware, secureBoot, scenario };
          const r = bootRun(c);
          const frames = bootFrames(c, r);
          const texts = frames.map((f) => captionText(f.say));
          const last = texts.at(-1)!;
          if (r.stoppedAt) {
            expect(last).toContain('The boot stopped');
            expect(texts.join(' ')).toContain(r.message!);
          } else {
            const end = r.stages.at(-1)!.end;
            expect(last).toContain(`login prompt in ${secText(end)}`);
          }
          expect(texts.some((t) => t.includes('degraded'))).toBe(r.degraded.length > 0);
          expect(texts.some((t) => t.includes('Secure Boot'))).toBe(firmware === 'uefi' && secureBoot);
          for (const f of frames) expect(f.lines).toBeLessThanOrEqual(consoleFor(c, r).length);
          // Frames never move the clock backwards.
          for (let i = 1; i < frames.length; i++) expect(frames[i].now).toBeGreaterThanOrEqual(frames[i - 1].now);
        });
      }
    }
  }
});

describe('view helpers', async () => {
  const { stageBars, unitView, plannedEnd } = await import('./view');
  it('unit states over time: pending, running, then active or failed; skipped units never run', () => {
    const runs = scheduleUnits(UNITS, new Set([FAILING_UNIT]));
    for (const u of runs) {
      expect(unitView(u, u.start - 1)).toBe('pending');
      if (u.state === 'dependency-failed') expect(unitView(u, u.start)).toBe('skipped');
      else if (u.end > u.start) {
        expect(unitView(u, u.start)).toBe('running');
        expect(unitView(u, u.end)).toBe(u.state === 'failed' ? 'failed' : 'active');
      }
    }
  });
  it('a stopped boot draws the stages it never reached as a dim plan, after the failure', () => {
    const r = bootRun({ firmware: 'uefi', secureBoot: false, scenario: 'no-kernel' });
    const bars = stageBars(r, r.stages[2].end, 2);
    expect(bars.find((b) => b.lane === 'bootloader')!.tone).toBe('bad');
    for (const id of ['kernel', 'initramfs', 'systemd', 'login']) expect(bars.find((b) => b.lane === id)!.tone).toBe('dim');
    expect(plannedEnd(r)).toBeGreaterThan(r.stages[2].end);
    // Before the failure nothing gives the ending away.
    expect(stageBars(r, r.stages[1].end, 1).some((b) => b.tone === 'dim')).toBe(false);
  });
});

describe('review fixes: captions say what is true', () => {
  const text = (c: BootConfig) => bootFrames(c, bootRun(c)).map((f) => captionText(f.say)).join(' | ');
  it('Secure Boot is not claimed to cover everything (B2)', () => {
    const t = text({ firmware: 'uefi', secureBoot: true, scenario: 'unsigned-kernel' });
    expect(t).not.toContain('nothing unsigned ever gets control');
    expect(t).toContain("The initramfs isn't checked in this chain");
  });
  it('a degraded boot is not sold as a rule: required mounts go to emergency mode (B3)', () => {
    const t = text({ firmware: 'uefi', secureBoot: false, scenario: 'failing-service' });
    expect(t).not.toContain("One failed unit doesn't stop the boot");
    expect(t).toContain('emergency mode');
  });
  it('PID 1 passes from the initramfs /init to systemd in place (B4)', () => {
    const t = text({ firmware: 'uefi', secureBoot: false, scenario: 'normal' });
    const kernelAt = t.indexOf('runs its /init as PID 1');
    const systemdAt = t.indexOf('so systemd keeps PID 1');
    expect(kernelAt).toBeGreaterThan(-1);
    expect(systemdAt).toBeGreaterThan(kernelAt);
    expect(t.split('first user-space process').length - 1).toBe(1);
  });
  it('the login caption gives getty its real start time and keeps systemd as PID 1', () => {
    const r = bootRun({ firmware: 'uefi', secureBoot: false, scenario: 'normal' });
    const systemd = r.stages.find((x) => x.info.id === 'systemd')!;
    const getty = r.units!.find((u) => u.id === 'getty@tty1')!;
    expect(text({ firmware: 'uefi', secureBoot: false, scenario: 'normal' })).toContain(`login prompt up since ${secText(systemd.start + getty.end)}`);
    expect(getty.end).toBeLessThan(systemd.end - systemd.start);
  });
});
