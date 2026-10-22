/**
 * The shared-kernel scene: how much of a kernel (or a hypervisor) the plugin can still reach. The numbers are
 * named, illustrative constants, not measurements.
 */
import { SYSCALLS } from './seccomp';
import type { RingId } from './rings';

/** "300 or more" calls on a current Linux kernel (x86-64): illustrative; verify against the kernel's own syscall table. */
export const HOST_SYSCALL_COUNT = 300;
/** The size of the allow-list the seccomp scene offers: twenty calls. */
export const FILTER_SIZE = SYSCALLS.length;
/** A hypervisor exposes a handful of emulated devices to a guest, not hundreds of calls: illustrative. */
export const HYPERVISOR_INTERFACE = 12;

export type SurfaceMode = 'process' | 'seccomp' | 'microvm';

export const SURFACE_MODES: readonly { value: SurfaceMode; label: string }[] = [
  { value: 'process', label: 'A process or plain container' },
  { value: 'seccomp', label: 'With a seccomp filter' },
  { value: 'microvm', label: 'In a microVM' },
];

/** What the plugin can still reach, per mode: the surface it faces and what sits under it. */
export const SURFACES: Record<SurfaceMode, { label: string; exposed: number; unit: string; under: string }> = {
  process: { label: "the host kernel's system call interface", exposed: HOST_SYSCALL_COUNT, unit: 'calls (300 or more)', under: 'the host kernel, shared with every other process' },
  seccomp: { label: 'the calls the filter lets through', exposed: FILTER_SIZE, unit: 'calls', under: 'the same host kernel, reached through fewer calls' },
  microvm: { label: "the hypervisor's device interface", exposed: HYPERVISOR_INTERFACE, unit: 'devices and interfaces', under: 'a separate guest kernel; the host kernel sits behind the hypervisor' },
};

/** Does a plugin behind this ring still share the host's kernel with everything else? Only the microVM puts a guest kernel in between. */
export const sharesHostKernel = (ring: RingId): boolean => ring !== 'microvm';
