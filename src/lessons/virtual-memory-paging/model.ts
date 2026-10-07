import { parseBoundedBigInt } from '../../core/parse';

/**
 * A toy paged memory: two processes with 16-page virtual address spaces (64 KiB, 4 KiB
 * pages), single-level page tables, 8 physical frames shared by both, and a swap area.
 * Everything the stage shows (the split, the page-table row, the physical address, faults,
 * evictions, swap writes) comes from `access()`; `simulate()` runs bare reference strings
 * for the FIFO / Clock fault counts.
 */

export const PAGE_SIZE = 4096;
export const OFFSET_BITS = 12;
export const VPN_BITS = 4;
export const PAGES = 2 ** VPN_BITS;
export const ADDR_MAX = PAGES * PAGE_SIZE - 1;
export const FRAMES = 8;

export type Proc = 'A' | 'B';
export const PROCS: readonly Proc[] = ['A', 'B'];
export type Kind = 'code' | 'libc' | 'heap' | 'stack';
export type Policy = 'fifo' | 'clock';
/** Where a non-present page's contents come from when it's loaded. */
export type Backing = 'file' | 'zero' | 'swap';

export interface Pte {
  vpn: number;
  /** Null: the page is not mapped at all (the gap between heap and stack). */
  kind: Kind | null;
  present: boolean;
  frame: number | null;
  writable: boolean;
  dirty: boolean;
  backing: Backing;
}

export interface PhysFrame {
  /** Every (process, page) mapped here: two for the shared libc page, none when free. */
  owners: { proc: Proc; vpn: number }[];
  /** Clock's reference bit. */
  ref: boolean;
  /** Load order, for FIFO. */
  loadedAt: number;
}

export interface Machine {
  tables: Record<Proc, Pte[]>;
  frames: PhysFrame[];
  /** Clock hand: the next frame Clock looks at. */
  hand: number;
  loads: number;
  faults: number;
  /** Faults that had to read the disk (swap or the program file). */
  major: number;
  /** Faults served without the disk (a zero-filled page, or a page already in RAM for the other process). */
  minor: number;
  swapWrites: number;
  swapReads: number;
  hits: number;
}

// ---------- the address space ----------

/** Page kinds by VPN, the same layout in both processes: code, libc, heap, a gap, the stack. */
export const LAYOUT: readonly (Kind | null)[] = [
  'code', 'code', 'libc', 'heap', 'heap', 'heap', 'heap', null, null, null, null, null, null, 'stack', 'stack', 'stack',
];
export const LIBC_VPN = 2;
export const writableKind = (k: Kind | null) => k === 'heap' || k === 'stack';

export const split = (vaddr: number) => ({ vpn: vaddr >>> OFFSET_BITS, offset: vaddr & (PAGE_SIZE - 1) });
export const physical = (frame: number, offset: number) => frame * PAGE_SIZE + offset;

const clone = (m: Machine): Machine => ({
  ...m,
  tables: { A: m.tables.A.map((p) => ({ ...p })), B: m.tables.B.map((p) => ({ ...p })) },
  frames: m.frames.map((f) => ({ ...f, owners: f.owners.map((o) => ({ ...o })) })),
});

/**
 * The starting machine: each process has its first code page, heap page and top stack page
 * in RAM, libc's page is shared, one heap page of A's sits in swap, and frame 7 is free.
 */
export function startMachine(): Machine {
  const table = (): Pte[] =>
    LAYOUT.map((kind, vpn) => ({ vpn, kind, present: false, frame: null, writable: writableKind(kind), dirty: false, backing: kind === 'code' || kind === 'libc' ? 'file' : 'zero' }));
  const m: Machine = { tables: { A: table(), B: table() }, frames: [], hand: 0, loads: 0, faults: 0, major: 0, minor: 0, swapWrites: 0, swapReads: 0, hits: 0 };
  const resident: [Proc, number, boolean][][] = [
    [['A', 0, false]],
    [['A', LIBC_VPN, false], ['B', LIBC_VPN, false]],
    [['A', 3, true]],
    [['A', 15, true]],
    [['B', 0, false]],
    [['B', 3, true]],
    [['B', 15, true]],
    [],
  ];
  m.frames = resident.map((owners, f) => {
    for (const [proc, vpn, dirty] of owners) Object.assign(m.tables[proc][vpn], { present: true, frame: f, dirty });
    return { owners: owners.map(([proc, vpn]) => ({ proc, vpn })), ref: owners.length > 0, loadedAt: owners.length > 0 ? m.loads++ : -1 };
  });
  m.tables.A[4].backing = 'swap';
  return m;
}

// ---------- translation ----------

export type Translation =
  | { ok: true; vpn: number; offset: number; frame: number; paddr: number }
  | { ok: false; vpn: number; offset: number; reason: 'unmapped' | 'not-present' };

/** Translate with one page table: VPN → PTE → frame × 4096 + offset. No side effects. */
export function translate(table: readonly Pte[], vaddr: number): Translation {
  const { vpn, offset } = split(vaddr);
  const pte = table[vpn];
  if (!pte.kind) return { ok: false, vpn, offset, reason: 'unmapped' };
  if (!pte.present || pte.frame === null) return { ok: false, vpn, offset, reason: 'not-present' };
  return { ok: true, vpn, offset, frame: pte.frame, paddr: physical(pte.frame, offset) };
}

/** Physical address → every virtual address mapped onto it. */
export function reverse(m: Machine, paddr: number): { proc: Proc; vaddr: number }[] {
  const frame = Math.floor(paddr / PAGE_SIZE);
  const offset = paddr % PAGE_SIZE;
  return (m.frames[frame]?.owners ?? []).map((o) => ({ proc: o.proc, vaddr: o.vpn * PAGE_SIZE + offset }));
}

// ---------- one memory access, step by step ----------

export type StepKind =
  | 'split' // the address splits into VPN and offset
  | 'lookup' // the page-table row
  | 'segv' // protection fault: the process is killed
  | 'fault' // page fault: trap to the kernel
  | 'free' // a free frame is available
  | 'shared' // the page is already in RAM for the other process: just map it
  | 'victim' // RAM is full: the policy picks a victim
  | 'swapout' // the dirty victim is written to swap first
  | 'load' // the page is read in (or zero-filled) and the PTE updated
  | 'retry' // the instruction runs again
  | 'done'; // translated: the physical address

export interface AccessStep {
  kind: StepKind;
  m: Machine;
  frame?: number;
  /** For victim / swapout: whose page leaves. */
  evicted?: { proc: Proc; vpn: number }[];
  /** Clock: frames whose reference bit was cleared on the way round. */
  cleared?: number[];
  paddr?: number;
  reason?: 'unmapped' | 'read-only';
  from?: Backing;
}

export interface Access {
  proc: Proc;
  vaddr: number;
  write: boolean;
}

export type Outcome = 'hit' | 'fault' | 'segv';

export interface AccessResult {
  m: Machine;
  steps: AccessStep[];
  outcome: Outcome;
  vpn: number;
  offset: number;
  paddr: number | null;
}

/** FIFO: the frame loaded longest ago. Clock: sweep from the hand, clearing set reference bits. */
function pickVictim(m: Machine, policy: Policy): { frame: number; cleared: number[] } {
  if (policy === 'fifo') {
    let best = 0;
    m.frames.forEach((f, i) => {
      if (f.loadedAt < m.frames[best].loadedAt) best = i;
    });
    return { frame: best, cleared: [] };
  }
  const cleared: number[] = [];
  for (;;) {
    const f = m.frames[m.hand];
    if (!f.ref) {
      const frame = m.hand;
      m.hand = (m.hand + 1) % m.frames.length;
      return { frame, cleared };
    }
    f.ref = false;
    cleared.push(m.hand);
    m.hand = (m.hand + 1) % m.frames.length;
  }
}

/** One load or store by `proc` at `vaddr`, with every intermediate machine state. */
export function access(before: Machine, { proc, vaddr, write }: Access, policy: Policy): AccessResult {
  if (!Number.isInteger(vaddr) || vaddr < 0 || vaddr > ADDR_MAX) throw new RangeError('address out of range');
  const m = clone(before);
  const steps: AccessStep[] = [];
  const snap = (s: Omit<AccessStep, 'm'>) => steps.push({ ...s, m: clone(m) });
  const { vpn, offset } = split(vaddr);
  const pte = m.tables[proc][vpn];
  snap({ kind: 'split' });
  snap({ kind: 'lookup' });

  if (!pte.kind) {
    snap({ kind: 'segv', reason: 'unmapped' });
    return { m, steps, outcome: 'segv', vpn, offset, paddr: null };
  }
  if (write && !pte.writable) {
    snap({ kind: 'segv', reason: 'read-only' });
    return { m, steps, outcome: 'segv', vpn, offset, paddr: null };
  }

  let outcome: Outcome = 'hit';
  if (!pte.present) {
    outcome = 'fault';
    m.faults++;
    snap({ kind: 'fault' });
    const sharedFrame = pte.kind === 'libc' ? m.frames.findIndex((f) => f.owners.some((o) => m.tables[o.proc][o.vpn].kind === 'libc')) : -1;
    if (sharedFrame >= 0) {
      m.frames[sharedFrame].owners.push({ proc, vpn });
      Object.assign(pte, { present: true, frame: sharedFrame });
      m.frames[sharedFrame].ref = true;
      m.minor++;
      snap({ kind: 'shared', frame: sharedFrame });
    } else {
      let frame = m.frames.findIndex((f) => f.owners.length === 0);
      if (frame >= 0) {
        snap({ kind: 'free', frame });
      } else {
        const v = pickVictim(m, policy);
        frame = v.frame;
        const victim = m.frames[frame];
        const evicted = victim.owners.map((o) => ({ ...o }));
        const dirty = evicted.some((o) => m.tables[o.proc][o.vpn].dirty);
        snap({ kind: 'victim', frame, evicted, cleared: v.cleared });
        if (dirty) {
          m.swapWrites++;
          for (const o of evicted) m.tables[o.proc][o.vpn].backing = 'swap';
        }
        for (const o of evicted) Object.assign(m.tables[o.proc][o.vpn], { present: false, frame: null, dirty: false });
        victim.owners = [];
        if (dirty) snap({ kind: 'swapout', frame, evicted });
      }
      const from = pte.backing;
      if (from === 'swap') m.swapReads++;
      if (from === 'zero') m.minor++;
      else m.major++;
      // A page read back from swap keeps its swap copy: evicting it clean later costs no write.
      Object.assign(pte, { present: true, frame, dirty: false });
      m.frames[frame] = { owners: [{ proc, vpn }], ref: true, loadedAt: m.loads++ };
      snap({ kind: 'load', frame, from });
    }
    snap({ kind: 'retry' });
  } else {
    m.hits++;
  }

  const f = pte.frame!;
  m.frames[f].ref = true;
  if (write) pte.dirty = true;
  const paddr = physical(f, offset);
  snap({ kind: 'done', frame: f, paddr });
  return { m, steps, outcome, vpn, offset, paddr };
}

/** Replay a list of accesses from the start machine. */
export function replay(accesses: readonly Access[], policy: Policy): Machine {
  return accesses.reduce((m, a) => access(m, a, policy).m, startMachine());
}

// ---------- presets ----------

export interface AddressPreset {
  id: string;
  label: string;
  access: Access;
}

export const ADDRESS_PRESETS: AddressPreset[] = [
  { id: 'code', label: 'A reads its code', access: { proc: 'A', vaddr: 0x0123, write: false } },
  { id: 'heap-write', label: 'A writes its heap', access: { proc: 'A', vaddr: 0x3010, write: true } },
  { id: 'swapped', label: 'A reads a swapped page', access: { proc: 'A', vaddr: 0x4a00, write: false } },
  { id: 'new-heap', label: 'A grows its heap', access: { proc: 'A', vaddr: 0x5000, write: true } },
  { id: 'libc', label: 'B calls libc', access: { proc: 'B', vaddr: 0x2abc, write: false } },
  { id: 'stack', label: 'B, same stack address', access: { proc: 'B', vaddr: 0xf800, write: true } },
  { id: 'ro', label: 'A writes its code', access: { proc: 'A', vaddr: 0x0100, write: true } },
  { id: 'gap', label: 'A reads the gap', access: { proc: 'A', vaddr: 0x8000, write: false } },
];

/** The working-set loop: A touches all ten of its mapped pages in turn, three times round. */
export const THRASH_ROUNDS = 3;
export const thrashAccesses = (): Access[] => {
  const pages = LAYOUT.flatMap((k, vpn) => (k ? [vpn] : []));
  return Array.from({ length: THRASH_ROUNDS }, () => pages.map((vpn) => ({ proc: 'A' as const, vaddr: vpn * PAGE_SIZE + 0x40, write: writableKind(LAYOUT[vpn]) }))).flat();
};
export const WORKING_SET = LAYOUT.filter(Boolean).length;

/** Illustrative costs for the "useful work" bar: a RAM access vs a page fault served from disk. */
export const RAM_NS = 100;
/** A major fault: the page comes from disk (swap or the program file). */
export const MAJOR_FAULT_NS = 5_000_000;
/** A minor fault: no disk, just the kernel finding or zeroing a frame. */
export const MINOR_FAULT_NS = 1_000;
/** Share of time spent on accesses that hit RAM (the rest goes to fault handling and disk). */
export const usefulShare = ({ hits, major, minor }: Pick<Machine, 'hits' | 'major' | 'minor'>) => {
  const total = hits * RAM_NS + major * MAJOR_FAULT_NS + minor * MINOR_FAULT_NS;
  return total === 0 ? 1 : (hits * RAM_NS) / total;
};

// ---------- bare reference strings (for the fault-count tests and the quiz) ----------

export function simulate(refs: readonly number[], frames: number, policy: Policy): { faults: number; resident: number[][] } {
  const slots: (number | null)[] = Array(frames).fill(null);
  const ref: boolean[] = Array(frames).fill(false);
  const loadedAt: number[] = Array(frames).fill(-1);
  let hand = 0;
  let loads = 0;
  let faults = 0;
  const resident: number[][] = [];
  for (const page of refs) {
    const at = slots.indexOf(page);
    if (at >= 0) {
      ref[at] = true;
    } else {
      faults++;
      let slot = slots.indexOf(null);
      if (slot < 0) {
        if (policy === 'fifo') {
          slot = loadedAt.indexOf(Math.min(...loadedAt));
        } else {
          while (ref[hand]) {
            ref[hand] = false;
            hand = (hand + 1) % frames;
          }
          slot = hand;
          hand = (hand + 1) % frames;
        }
      }
      slots[slot] = page;
      ref[slot] = true;
      loadedAt[slot] = loads++;
    }
    resident.push(slots.filter((s): s is number => s !== null));
  }
  return { faults, resident };
}

export const BELADY_REFS = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5] as const;

// ---------- the address field ----------

/** A hex address field: 0x-prefixed or bare hex, 0x0000 to 0xFFFF; anything else is refused with a sentence. */
export function parseAddress(text: string): { ok: true; value: number } | { ok: false; error: string } {
  const r = parseBoundedBigInt(text, {
    min: 0n,
    max: BigInt(ADDR_MAX),
    prefixes: ['hex'],
    plainRadix: 16,
    messages: {
      empty: 'Type a hex address, like 0x3010.',
      invalid: () => 'Use hex digits only, like 0x3010 or 3010.',
      tooSmall: () => 'Addresses start at 0x0000.',
      tooBig: () => 'This toy address space runs from 0x0000 to 0xFFFF (16 pages of 4 KiB).',
    },
  });
  return r.ok ? { ok: true, value: Number(r.value) } : r;
}
