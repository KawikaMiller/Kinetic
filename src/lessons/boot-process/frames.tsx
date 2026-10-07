import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { INITRD_PATH, KERNEL_PATH, type BootConfig, type BootResult, type StageRun } from './model';

export interface BootFrame extends Frame {
  /** Boot clock, ms since power on. */
  now: number;
  /** Index of the stage in control (into result.stages). */
  stage: number;
  /** Console lines printed so far. */
  lines: number;
}

export const secText = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const join = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** The illustrative boot log, one batch of lines per stage reached. */
export function consoleFor(c: BootConfig, r: BootResult): { stage: number; text: string; tone?: 'bad' | 'orange' | 'ok' }[] {
  const out: { stage: number; text: string; tone?: 'bad' | 'orange' | 'ok' }[] = [];
  const sb = c.firmware === 'uefi' && c.secureBoot;
  r.stages.forEach((s, i) => {
    if (s.status === 'not-reached') return;
    const say = (text: string, tone?: 'bad' | 'orange' | 'ok') => out.push({ stage: i, text, tone });
    switch (s.info.id) {
      case 'firmware':
        say(c.firmware === 'uefi' ? 'UEFI: POST done, BootOrder 0001 (ubuntu)' : 'BIOS: POST done, booting from disk 0 (MBR)');
        break;
      case 'bootmgr':
        say(c.firmware === 'uefi' ? `Loading ${s.info.from.split(': ')[1]}` : 'MBR code: loading GRUB core image');
        if (sb) say('Secure Boot: shim signature OK', 'ok');
        break;
      case 'bootloader':
        if (sb) say('shim: GRUB signature OK', 'ok');
        if (s.status === 'failed') {
          say(r.message!, 'bad');
          break;
        }
        say(`GRUB: loading ${KERNEL_PATH} and ${INITRD_PATH}`);
        if (sb) say('shim: kernel signature OK', 'ok');
        break;
      case 'kernel':
        say('Linux version 6.8.0: unpacking initramfs');
        break;
      case 'initramfs':
        if (s.status === 'failed') say(r.message!, 'bad');
        else say('initramfs: root found, mounted, switch_root');
        break;
      case 'systemd':
        say('systemd 255 running as PID 1');
        for (const u of r.units ?? []) {
          if (u.state === 'failed') say(`[FAILED] Failed to start ${u.id}`, 'bad');
          else if (u.state === 'dependency-failed') say(`[DEPEND] Dependency failed for ${u.id}`, 'orange');
        }
        say('Reached target multi-user.target');
        break;
      case 'login':
        say('host login:');
        break;
    }
  });
  return out;
}

function stageCaption(c: BootConfig, r: BootResult, s: StageRun): ReactNode {
  const uefi = c.firmware === 'uefi';
  const sb = uefi && c.secureBoot;
  const failed = s.status === 'failed';
  switch (s.info.id) {
    case 'firmware':
      return uefi ? (
        <>Power on. The CPU starts at its reset vector, which points into the firmware on the motherboard's flash chip. UEFI tests and initialises RAM and devices (POST), then reads its boot entries from NVRAM. No operating system is running yet.</>
      ) : (
        <>Power on. The CPU starts in the BIOS on the flash chip. It runs POST, then reads the first 512-byte sector of the boot disk, the MBR, into memory at 0x7C00 and jumps to it.</>
      );
    case 'bootmgr':
      return uefi ? (
        <>
          The boot manager opens the EFI System Partition, a small FAT32 partition, and loads <code>{s.info.from.split(': ')[1]}</code> into RAM.
          {sb ? <> Secure Boot: the firmware checks shim's signature against the keys it trusts before running it.</> : null}
        </>
      ) : (
        <>446 bytes of MBR code are all there's room for, so its only job is to load GRUB's next stage from the sectors just after the MBR. (Legacy BIOS has no way to check signatures, so nothing here is verified.)</>
      );
    case 'bootloader':
      if (failed && c.scenario === 'no-kernel') return <>GRUB looks for the kernel and it isn't there: <code>{r.message}</code> Boot stops at GRUB.</>;
      if (failed) {
        return (
          <>
            Secure Boot: the kernel isn't signed by a trusted key, so it's refused (<code>{r.message}</code>). Each stage only runs the next one if its signature checks out, so
            nothing unsigned ever gets control.
          </>
        );
      }
      return (
        <>
          GRUB shows its menu, then loads the kernel (<code>{KERNEL_PATH}</code>) and the initramfs into RAM and jumps to the kernel.
          {sb ? <> shim checked GRUB, and GRUB asks shim to check the kernel too.</> : null}
        </>
      );
    case 'kernel':
      return <>The kernel decompresses itself, sets up memory management and its drivers, and unpacks the initramfs into RAM as a temporary root file system.</>;
    case 'initramfs':
      return failed ? (
        <>
          The initramfs has no driver for this disk, so the real root never shows up: <code>{r.message}</code> Boot stops in an emergency shell. (With no initramfs at all, a kernel
          missing the driver panics instead: "VFS: Unable to mount root fs".)
        </>
      ) : (
        <>
          <code>/init</code> in the initramfs loads the storage driver, finds the real root file system by its UUID (unlocking it if it's encrypted), mounts it, and{' '}
          <code>switch_root</code> hands over to it.
        </>
      );
    case 'systemd':
      return <>The kernel runs <code>/sbin/init</code>, which is systemd, as PID 1: the first user-space process. It starts units in parallel wherever their dependencies allow.</>;
    case 'login':
      return <>getty prints the login prompt on the console.</>;
  }
}

export function bootFrames(c: BootConfig, r: BootResult): BootFrame[] {
  const log = consoleFor(c, r);
  const linesUpTo = (stage: number) => log.filter((l) => l.stage <= stage).length;
  const rec = createRecorder<BootFrame>({ now: 0, stage: 0, lines: 0 });
  r.stages.forEach((s, i) => {
    if (s.status === 'not-reached') return;
    if (s.info.id === 'systemd' && r.units) {
      rec.snap(stageCaption(c, r, s), 1.4, { now: s.start, stage: i, lines: linesUpTo(i - 1) + 1 });
      const waves = [...new Set(r.units.map((u) => u.start))].sort((a, b) => a - b);
      for (const w of waves) {
        const starting = r.units.filter((u) => u.start === w && u.state !== 'dependency-failed').map((u) => u.id);
        const failedNow = r.units.filter((u) => u.end === w && u.state === 'failed').map((u) => u.id);
        const skipped = r.units.filter((u) => u.start === w && u.state === 'dependency-failed').map((u) => u.id);
        if (starting.length === 0 && failedNow.length === 0 && skipped.length === 0) continue;
        rec.snap(
          <>
            {failedNow.length > 0 && <><span className="hl orange">{join(failedNow)} failed.</span> </>}
            {skipped.length > 0 && <>{join(skipped)} {skipped.length === 1 ? 'requires' : 'require'} it, so systemd won't start {skipped.length === 1 ? 'it' : 'them'}. </>}
            {starting.length > 0 && (
              <>
                At {secText(s.start + w)}: {starting.length > 1 ? <>starting {join(starting)} in parallel</> : <>starting {starting[0]}</>}
                {w === 0 ? <>: nothing has to come first</> : <>: everything they're ordered after has finished</>}.
              </>
            )}
          </>,
          1.2,
          { now: s.start + w },
        );
      }
      const degraded = r.degraded.length > 0;
      rec.snap(
        degraded ? (
          <>
            Reached multi-user.target in {secText(s.end - s.start)}, but degraded: {join(r.degraded)} {r.degraded.length === 1 ? "isn't" : "aren't"} running. One failed unit
            doesn't stop the boot; the target only wants its units.
          </>
        ) : (
          <>Reached multi-user.target in {secText(s.end - s.start)} with every unit started.</>
        ),
        1.4,
        { now: s.end, lines: linesUpTo(i) },
      );
      return;
    }
    rec.snap(stageCaption(c, r, s), s.status === 'failed' ? 2 : 1.4, { now: s.end, stage: i, lines: linesUpTo(i) });
  });
  const last = r.stages.filter((s) => s.status !== 'not-reached').at(-1)!;
  rec.close(
    r.stoppedAt === null ? (
      <>From power button to login prompt in {secText(last.end)} (illustrative). The operating system didn't start first: firmware, then a bootloader, then the kernel each had to load the next.</>
    ) : (
      <>The boot stopped in {last.info.name} after {secText(last.end)}; nothing after it ran.</>
    ),
    2,
  );
  return rec.frames;
}
