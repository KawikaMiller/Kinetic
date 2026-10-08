import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Booting is a relay: firmware starts first and loads a bootloader, the bootloader loads the kernel and an initramfs, and the kernel starts init (systemd, PID 1), which starts everything else in parallel.',
    what: 'At power on the CPU runs firmware from a flash chip on the motherboard. UEFI firmware tests the hardware, reads its boot entries from NVRAM and loads a bootloader file (such as GRUB) from the EFI System Partition, a small FAT32 partition. The bootloader loads the kernel and a small initramfs into RAM. The kernel sets up memory and drivers, and the initramfs finds and mounts the real root file system, then hands over with switch_root. The kernel then runs init, PID 1, which on most Linux systems is systemd: it starts services in parallel wherever their dependencies allow, until it reaches a target such as multi-user.target. With Secure Boot, the firmware, shim and GRUB each check the signature of the next stage before running it, up to the kernel (the initramfs isn\'t checked in this chain).',
    analogy: 'A relay race where each runner can only hand the baton to the next one: the firmware can\'t run Linux, but it knows how to fetch the bootloader; the bootloader can\'t run your services, but it knows how to fetch the kernel. With Secure Boot, each runner checks the next one\'s ID badge first.',
    useCases: [
      'A server stuck at the GRUB prompt or an initramfs emergency shell after a kernel update',
      'Speeding up boot by reading systemd-analyze blame and fixing slow units',
      'Why a server boots "degraded" when one service fails, and why the rest still start',
      'Why containers start in milliseconds while VMs take seconds to boot',
    ],
    why: 'When a machine doesn\'t come back after a reboot, knowing which stage was in control tells you where to look: firmware settings, the bootloader config, a missing driver in the initramfs, or a failed unit. It also explains PID 1, which matters for `processes-threads` and for signal handling in containers, and why `containers` skip all of this. It builds on `fetch-decode-execute` (the reset vector) and `file-systems` (the partitions it reads).',
    watch: 'The timeline has one lane per stage. The stage in control is yellow; finished stages alternate sky blue and amber (plain categories, so neighbours stay apart); a failed stage is red; once the boot has stopped, the stages it never reached are a dim dashed plan. Above the timeline, the handoff shows the previous stage passing control to the current one with a violet arrow (at the login stage it notes instead that systemd stays PID 1), the yellow chip names who is in control and the grey chip where its code came from. With Secure Boot each signature check is a pill: green with a tick when it passes, red with a cross when a stage is refused, dashed grey until it happens, or if there was nothing to check. In the systemd unit graph an arrow means "starts after": a yellow unit is starting now, green ones are running, an orange one failed while the boot carried on, and dim ones were skipped because a unit they need failed. In the blame table a failed unit is orange. Boot messages are green, a red line is a stopping error and an orange one a dependency failure.',
  },
  tryThis: [
    'Press play on Normal and watch "in control" pass from firmware to GRUB to the kernel to systemd.',
    'Pick Kernel missing, then initramfs lacks disk driver: see which stage stops each one and what never runs.',
    'Pick A service fails: postgresql turns orange and app is skipped, but the boot still reaches the login prompt.',
    'Pick Unsigned kernel and flip Secure Boot off and on: the same kernel boots, then gets refused.',
    'Flip Firmware to Legacy BIOS and read how the boot manager stage changes to the MBR.',
  ],
  keyIdeas: [
    'Firmware runs first and loads the bootloader; the OS does not start first and load the hardware.',
    'The initramfs is a temporary root in RAM whose job is to find and mount the real root file system.',
    'systemd, PID 1, starts units in parallel by their dependencies; a failed unit that\'s only wanted leaves the boot degraded, but a failed required mount drops it to emergency mode.',
    'Secure Boot: firmware, shim and GRUB each verify the next stage, so an unsigned bootloader or kernel never runs.',
  ],
  quiz: [
    {
      q: 'What runs first when you press the power button?',
      options: [
        'Firmware from a flash chip on the motherboard',
        'The kernel, which then wakes up the hardware',
        'systemd, which starts the firmware as a unit',
        'The bootloader, read straight from RAM',
      ],
      answer: 0,
      why: 'RAM is empty at power on, so the CPU starts at a reset vector pointing into the firmware. The firmware prepares the hardware and loads the bootloader, which loads the kernel. The OS doesn\'t start first and then load the hardware.',
    },
    {
      q: 'A kernel update leaves a server at "ALERT! UUID=… does not exist. Dropping to a shell!". Which stage is failing?',
      options: ['The initramfs', 'The UEFI firmware', 'The GRUB menu', 'A systemd unit'],
      answer: 0,
      why: 'The kernel started and unpacked the initramfs, but the initramfs couldn\'t find the real root file system, often because it lacks the disk or encryption driver. GRUB already worked, and systemd never got to run.',
    },
    {
      q: 'On boot, one service fails to start. What does systemd do?',
      options: [
        'Marks it failed and starts the units that don\'t need it',
        'Halts the boot and reboots the machine at once',
        'Retries it forever before it starts any others',
        'Drops to the GRUB prompt so you can choose again',
      ],
      answer: 0,
      why: 'Units that Require the failed one (and are ordered After it) are skipped; the rest start, and the target is reached in a degraded state. It doesn\'t halt or reboot. The exception is a failed required mount, which drops systemd to emergency mode.',
    },
    {
      q: 'Why does a container start in milliseconds while a VM takes seconds?',
      options: [
        'It is a process on a kernel already running',
        'A container boots a small OS from a cached image',
        'A container skips POST but runs its own GRUB',
        'A container keeps a VM paused and resumes it',
      ],
      answer: 0,
      why: 'A VM goes through the whole chain with virtual firmware, a bootloader and its own kernel. A container boots nothing: it is an isolated process on the host\'s running kernel, so it starts at the "run init" step or later.',
    },
    {
      q: 'With Secure Boot on, what stops a tampered kernel from running?',
      options: [
        'The bootloader verifies it first',
        'The kernel checks itself after it starts',
        'systemd scans it once it is loaded',
        'The firmware encrypts the whole disk',
      ],
      answer: 0,
      why: 'Each stage verifies the next before handing over: firmware checks shim, shim checks GRUB, GRUB (through shim) checks the kernel. (The initramfs isn\'t covered by this chain.) A check after the kernel starts would be too late, since the tampered code would already be running.',
    },
  ],
};

export default lesson;
