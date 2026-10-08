// How a hypervisor catches a guest kernel's privileged instructions, on x86. Pure logic.
//
// Simplified instruction stream; real VM exits cost hundreds to thousands of cycles, and
// the costs here are illustrative.

export type Technique = 'classic' | 'bt' | 'pv' | 'hw';
export type InstrKind = 'ordinary' | 'privileged' | 'sensitive';
export type Handling = 'direct' | 'trap' | 'translate' | 'hypercall' | 'shared' | 'bad';

export interface Instr {
  id: string;
  text: string;
  kind: InstrKind;
  /** What it means to the guest kernel. */
  does: string;
}

export const INSTRS: Record<string, Instr> = {
  load: { id: 'load', text: 'mov rax, [rbx]', kind: 'ordinary', does: 'load a value from memory' },
  add: { id: 'add', text: 'add rax, 1', kind: 'ordinary', does: 'add one' },
  copy: { id: 'copy', text: 'mov rcx, rax', kind: 'ordinary', does: 'copy a register' },
  cli: { id: 'cli', text: 'cli', kind: 'privileged', does: 'turn interrupts off' },
  popf: { id: 'popf', text: 'popf', kind: 'sensitive', does: 'restore the flags, interrupts back on' },
  cr3: { id: 'cr3', text: 'mov cr3, rax', kind: 'privileged', does: 'switch page tables' },
  out: { id: 'out', text: 'out 0x3f8, al', kind: 'privileged', does: 'write a byte to the serial port' },
  hlt: { id: 'hlt', text: 'hlt', kind: 'privileged', does: 'idle until the next interrupt' },
};

/** A guest kernel's code path: mostly ordinary instructions, a few that touch the machine. */
export const STREAM: Instr[] = ['load', 'add', 'cli', 'copy', 'popf', 'add', 'cr3', 'out', 'add', 'hlt'].map((k) => INSTRS[k]);

export const TECHNIQUES: { value: Technique; label: string }[] = [
  { value: 'classic', label: 'Trap only (classic x86)' },
  { value: 'bt', label: 'Binary translation (VMware)' },
  { value: 'pv', label: 'Paravirtualisation (Xen)' },
  { value: 'hw', label: 'Hardware assist (VT-x / AMD-V)' },
];

/**
 * Where an instruction gets caught.
 * - classic: the guest kernel runs deprivileged (ring 1 on 32-bit x86), so privileged
 *   instructions fault into the hypervisor. popf is sensitive but not privileged: outside
 *   ring 0 it silently ignores the interrupt flag, so nothing traps and the guest is wrong.
 *   That is a Popek-Goldberg violation, and why plain trap-and-emulate failed on x86.
 * - bt: the hypervisor rewrites the guest kernel's code before it runs, replacing every
 *   sensitive instruction with a safe call; ordinary instructions are copied and run as-is.
 * - pv: the guest kernel is modified to cooperate. In Xen PV, cli/sti/popf don't touch the
 *   real interrupt flag at all: they become an ordinary write to an event mask in vcpu_info,
 *   memory shared with the hypervisor ('shared', no exit). Switching page tables, console
 *   output and idling are hypercalls (mmuext_op, console_io, sched_op).
 * - hw: the guest kernel really runs in ring 0, in VMX non-root (guest) mode, so cli and
 *   popf just work on its own virtual state. Only configured events cause a VM exit: here
 *   I/O and hlt. With nested paging (EPT/NPT) the hypervisor lets mov cr3 run directly.
 */
export function handle(instr: Instr, technique: Technique): Handling {
  if (instr.kind === 'ordinary') return 'direct';
  switch (technique) {
    case 'classic':
      return instr.kind === 'sensitive' ? 'bad' : 'trap';
    case 'bt':
      return 'translate';
    case 'pv':
      return instr.id === 'cli' || instr.id === 'popf' ? 'shared' : 'hypercall';
    case 'hw':
      return instr.id === 'out' || instr.id === 'hlt' ? 'trap' : 'direct';
  }
}

/**
 * Illustrative cycles per handling: a VM exit and re-entry is the expensive part. Not
 * comparable across techniques in any precise way: real costs depend on the CPU generation
 * (early VT-x exits were slower than VMware's binary translation, for example).
 */
export const CYCLES: Record<Handling, number> = { direct: 1, bad: 1, shared: 2, translate: 40, hypercall: 900, trap: 1500 };

export interface Tally {
  direct: number;
  /** PV: plain writes to memory shared with the hypervisor (they run directly, without an exit). */
  shared: number;
  caught: number;
  bad: number;
  cycles: number;
}

export function tally(stream: readonly Instr[], technique: Technique): Tally {
  const t: Tally = { direct: 0, shared: 0, caught: 0, bad: 0, cycles: 0 };
  for (const i of stream) {
    const h = handle(i, technique);
    if (h === 'direct') t.direct++;
    else if (h === 'shared') t.shared++;
    else if (h === 'bad') t.bad++;
    else t.caught++;
    t.cycles += CYCLES[h];
  }
  return t;
}

// ---- Memory and I/O --------------------------------------------------------------

/**
 * Memory reads for one TLB miss with nested paging: every step of the guest's n-level
 * walk, plus the final guest-physical address, needs its own m-level host walk. That gives
 * (n + 1)(m + 1) − 1: 24 for two 4-level tables.
 */
export const nestedWalkRefs = (guestLevels: number, hostLevels: number) => (guestLevels + 1) * (hostLevels + 1) - 1;

export type Device = 'emulated' | 'virtio';
/** Register accesses an emulated NIC needs per packet, each one a VM exit (illustrative). */
export const EXITS_PER_PACKET = 3;
/** virtio: the guest queues a burst of packets in a shared ring, then notifies once. */
export const VIRTIO_BURST = 8;
export const EXIT_CYCLES = CYCLES.trap;

export function deviceExits(device: Device, packets: number): number {
  return device === 'emulated' ? packets * EXITS_PER_PACKET : Math.ceil(packets / VIRTIO_BURST);
}

// ---- Overcommit -------------------------------------------------------------------

export const HOST_GB = 16;
export const VM_GB = 8;

export interface Overcommit {
  committed: number;
  ratio: number;
  used: number;
  /** Memory the guests touch beyond what the host has: has to be reclaimed. */
  short: number;
}

export function overcommit(vms: number, usedPerVm: number): Overcommit {
  const committed = vms * VM_GB;
  const used = vms * usedPerVm;
  return { committed, ratio: committed / HOST_GB, used, short: Math.max(0, used - HOST_GB) };
}

// ---- Two-stage translation example -------------------------------------------------

export const PAGE_BITS = 12;
/** One mapping in each table: the guest's page table, then the hypervisor's EPT / NPT. */
export const GUEST_PT = new Map([[0x7f3a1, 0x42]]);
export const EPT = new Map([[0x42, 0x9c8e2]]);
export const EXAMPLE_GVA = 0x7f3a1234;

/** Swap the page number through a table and keep the 12-bit offset; null if unmapped. */
export function translate(addr: number, table: ReadonlyMap<number, number>): number | null {
  const page = Math.floor(addr / 2 ** PAGE_BITS);
  const offset = addr % 2 ** PAGE_BITS;
  const frame = table.get(page);
  return frame === undefined ? null : frame * 2 ** PAGE_BITS + offset;
}
