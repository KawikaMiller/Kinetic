// A typical Linux boot on UEFI (or legacy BIOS), as a pure model. Stage names follow the
// UEFI spec (boot manager, EFI System Partition) and systemd's bootup(7); timings are
// illustrative, and firmware and distributions differ.

export type Firmware = 'uefi' | 'bios';
export type Scenario = 'normal' | 'no-kernel' | 'no-driver' | 'failing-service' | 'unsigned-kernel';
export type StageId = 'firmware' | 'bootmgr' | 'bootloader' | 'kernel' | 'initramfs' | 'systemd' | 'login';

export interface BootConfig {
  firmware: Firmware;
  secureBoot: boolean;
  scenario: Scenario;
}

export interface StageInfo {
  id: StageId;
  name: string;
  /** Who runs the CPU in this stage. */
  control: string;
  /** Where its code was loaded from. */
  from: string;
  ms: number;
}

/** Illustrative stage lengths, ms. */
const MS: Record<Exclude<StageId, 'systemd'>, number> = { firmware: 1800, bootmgr: 150, bootloader: 1000, kernel: 1200, initramfs: 900, login: 300 };

export const ESP_PATH = (sb: boolean) => (sb ? '\\EFI\\ubuntu\\shimx64.efi → grubx64.efi' : '\\EFI\\ubuntu\\grubx64.efi');
export const KERNEL_PATH = '/boot/vmlinuz-6.8.0';
export const INITRD_PATH = '/boot/initrd.img-6.8.0';

export function stageInfo(id: StageId, c: BootConfig, systemdMs = 0): StageInfo {
  const uefi = c.firmware === 'uefi';
  switch (id) {
    case 'firmware':
      return uefi
        ? { id, name: 'UEFI firmware', control: 'UEFI firmware', from: 'flash chip on the motherboard', ms: MS.firmware }
        : { id, name: 'BIOS firmware', control: 'BIOS firmware', from: 'flash chip on the motherboard', ms: MS.firmware };
    case 'bootmgr':
      return uefi
        ? { id, name: 'Boot manager', control: 'UEFI boot manager', from: `EFI System Partition (FAT32): ${ESP_PATH(c.secureBoot)}`, ms: MS.bootmgr }
        : { id, name: 'MBR boot code', control: '446 bytes of MBR code', from: 'disk sector 0 (the MBR), loaded at 0x7C00', ms: MS.bootmgr };
    case 'bootloader':
      return { id, name: 'Bootloader (GRUB)', control: 'GRUB', from: uefi ? 'EFI System Partition' : 'disk, just after the MBR', ms: MS.bootloader };
    case 'kernel':
      return { id, name: 'Linux kernel', control: 'the kernel', from: `RAM (GRUB loaded ${KERNEL_PATH})`, ms: MS.kernel };
    case 'initramfs':
      return { id, name: 'initramfs', control: 'the kernel, running /init from the initramfs', from: `RAM (GRUB loaded ${INITRD_PATH})`, ms: MS.initramfs };
    case 'systemd':
      return { id, name: 'systemd (PID 1)', control: 'systemd, PID 1', from: 'the real root file system', ms: systemdMs };
    case 'login':
      return { id, name: 'Login prompt', control: 'getty and login', from: 'the real root file system', ms: MS.login };
  }
}

export const STAGES: StageId[] = ['firmware', 'bootmgr', 'bootloader', 'kernel', 'initramfs', 'systemd', 'login'];

// ---- systemd units ---------------------------------------------------------------

export interface Unit {
  id: string;
  /** Must start after these (After=). */
  after: string[];
  /** If one of these fails, this unit isn't started (Requires=). A target only Wants= its units. */
  requires: string[];
  ms: number;
}

/** A small server: illustrative units and times. */
export const UNITS: Unit[] = [
  { id: 'journald', after: [], requires: [], ms: 150 },
  { id: 'local-fs.target', after: [], requires: [], ms: 400 },
  { id: 'network', after: ['journald'], requires: [], ms: 900 },
  { id: 'postgresql', after: ['local-fs.target', 'network'], requires: ['local-fs.target'], ms: 1600 },
  { id: 'sshd', after: ['network'], requires: [], ms: 250 },
  { id: 'app', after: ['postgresql', 'network'], requires: ['postgresql'], ms: 700 },
  { id: 'getty@tty1', after: ['local-fs.target'], requires: [], ms: 120 },
  { id: 'multi-user.target', after: ['sshd', 'app', 'getty@tty1'], requires: [], ms: 0 },
];

/** The unit that breaks in the failing-service preset. */
export const FAILING_UNIT = 'postgresql';

export type UnitState = 'active' | 'failed' | 'dependency-failed';

export interface UnitRun {
  id: string;
  start: number;
  end: number;
  state: UnitState;
}

/**
 * Start every unit as soon as everything it's ordered after has finished (ASAP, so
 * independent units run in parallel). A failed unit's dependants that Require it are
 * never started; ones that are only ordered after it still start once it's settled.
 */
export function scheduleUnits(units: readonly Unit[], failing: ReadonlySet<string> = new Set()): UnitRun[] {
  const runs = new Map<string, UnitRun>();
  const byId = new Map(units.map((u) => [u.id, u]));
  const visit = (id: string): UnitRun => {
    const done = runs.get(id);
    if (done) return done;
    const u = byId.get(id)!;
    const deps = u.after.map(visit);
    const start = deps.reduce((m, d) => Math.max(m, d.end), 0);
    const brokenDep = u.requires.some((r) => runs.get(r)!.state !== 'active');
    const run: UnitRun = brokenDep
      ? { id, start, end: start, state: 'dependency-failed' }
      : { id, start, end: start + u.ms, state: failing.has(id) ? 'failed' : 'active' };
    runs.set(id, run);
    return run;
  };
  units.forEach((u) => visit(u.id));
  return units.map((u) => runs.get(u.id)!);
}

// ---- The whole boot --------------------------------------------------------------

export interface StageRun {
  info: StageInfo;
  start: number;
  end: number;
  status: 'ok' | 'failed' | 'not-reached';
}

export interface Verification {
  /** Who checks the signature. */
  by: string;
  /** What gets checked. */
  what: string;
  ok: boolean;
}

export interface BootResult {
  stages: StageRun[];
  /** The stage that failed and stopped the boot, or null if it reached the login prompt. */
  stoppedAt: StageId | null;
  message: string | null;
  units: UnitRun[] | null;
  verifications: Verification[];
  /** Units that failed while boot carried on. */
  degraded: string[];
}

export const MESSAGES = {
  'no-kernel': `error: file '${KERNEL_PATH}' not found.`,
  'no-driver': 'Gave up waiting for root file system device. ALERT! UUID=… does not exist. Dropping to a shell!',
  'unsigned-kernel': 'error: bad shim signature.',
} as const;

export function bootRun(c0: BootConfig): BootResult {
  // Secure Boot is a UEFI feature: legacy BIOS has nothing to verify signatures with.
  const c = { ...c0, secureBoot: c0.firmware === 'uefi' && c0.secureBoot };
  const failing = new Set(c.scenario === 'failing-service' ? [FAILING_UNIT] : []);
  const units = scheduleUnits(UNITS, failing);
  const systemdMs = units.reduce((m, u) => Math.max(m, u.end), 0);
  const verifications: Verification[] = c.secureBoot
    ? [
        { by: 'UEFI firmware', what: 'shim (signed with Microsoft\'s UEFI key)', ok: true },
        { by: 'shim', what: 'GRUB (signed with the distribution\'s key)', ok: true },
        { by: 'GRUB (via shim)', what: 'the kernel', ok: c.scenario !== 'unsigned-kernel' },
      ]
    : [];
  const failAt: StageId | null =
    c.scenario === 'no-kernel' ? 'bootloader'
    : c.scenario === 'unsigned-kernel' && c.secureBoot ? 'bootloader'
    : c.scenario === 'no-driver' ? 'initramfs'
    : null;
  let t = 0;
  let stopped = false;
  const stages: StageRun[] = STAGES.map((id) => {
    const info = stageInfo(id, c, systemdMs);
    if (stopped) return { info, start: t, end: t, status: 'not-reached' };
    const start = t;
    if (id === failAt) {
      stopped = true;
      const end = start + info.ms / 2;
      t = end;
      return { info, start, end, status: 'failed' };
    }
    t = start + info.ms;
    return { info, start, end: t, status: 'ok' };
  });
  return {
    stages,
    stoppedAt: failAt,
    message: failAt === null ? null : MESSAGES[c.scenario as keyof typeof MESSAGES],
    units: failAt === null ? units : null,
    verifications,
    degraded: failAt === null ? units.filter((u) => u.state !== 'active').map((u) => u.id) : [],
  };
}
