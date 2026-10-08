import type { MemCell, MemPointer, MemRegion } from '../../components/memory';
import { mulberry32 } from '../../core/random';
import { BASE, type LinkResult, type Mode } from './link';
import { GEOM_O } from './objects';

/**
 * What happens between `./app` and main, for the linked program: a simplified Linux/glibc loader.
 * The program is linked with -no-pie, so its own segments sit at fixed addresses; ASLR still
 * randomises the stack, the heap and where shared libraries are mapped (with PIE, gcc's default
 * on most distributions, the program itself would move too).
 */

export type Binding = 'lazy' | 'now';

export const PAGE = 0x1000;

/** Illustrative sizes and offsets of the shared objects (glibc's real ones vary by build). */
export const LIBC_SIZE = 0x1e0000;
export const LIBC_PRINTF = 0x60100;
export const LDSO_SIZE = 0x2b000;
export const STACK_SIZE = 0x21000;
export const HEAP_SIZE = 0x21000;

export interface Bases {
  libc: number;
  ldso: number;
  stack: number;
  heap: number;
}

/**
 * Page-aligned random bases in the usual Linux x86-64 neighbourhoods: shared libraries near
 * 0x7f…, the stack near 0x7ffc…, the brk heap a little above the program. Seeded, so a run
 * is repeatable; "Run again" changes the seed, which is what ASLR does on every exec.
 */
export function randomBases(seed: number): Bases {
  const rnd = mulberry32(seed);
  const pages = (lo: number, span: number) => lo + Math.floor(rnd() * span) * PAGE;
  const libc = pages(0x7f0000000000, 0xf000000);
  return {
    libc,
    ldso: libc + LIBC_SIZE + pages(0x100000, 0x40),
    stack: pages(0x7ffc00000000, 0x3f0000),
    heap: pages(0x1000000, 0x2000),
  };
}

/** What main computes: area(3, 4) with scale = 2, read from geom.o's .data. */
export function printedLine(): string {
  const data = GEOM_O.sections['.data']!;
  const scale = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
  return `area=${3 * 4 * scale}`;
}

export type LoadPhase = 'exec' | 'interp' | 'needed' | 'bind' | 'main' | 'firstCall' | 'printed';

export interface LoadStep {
  phase: LoadPhase;
  regions: MemRegion[];
  cells: MemCell[];
  pointer: MemPointer | null;
  /** The GOT slot's value now, or null with no GOT (static). */
  got: number | null;
  /** True on the step the GOT slot is written. */
  gotWritten: boolean;
  output: string[];
}

export interface LoadPlan {
  steps: LoadStep[];
  printf: number;
  pltStub: number | null;
  gotSlot: number | null;
}

const hexOf = (n: number) => `0x${n.toString(16)}`;

export function loadPlan(link: LinkResult, mode: Mode, binding: Binding, bases: Bases): LoadPlan {
  const dynamic = mode === 'dynamic';
  const plt = dynamic ? link.plt.find((p) => p.symbol === 'printf') ?? null : null;
  const printf = dynamic ? bases.libc + LIBC_PRINTF : link.symbols.get('printf')!;
  const main = link.symbols.get('main')!;
  const textEnd = Math.max(...link.layout.filter((p) => p.section === '.text').map((p) => p.addr + p.size));

  const exe: MemRegion[] = [
    { from: 0x400000, to: BASE.text, label: 'r-- · ELF headers', tone: 'amber' },
    { from: BASE.text, to: Math.ceil(textEnd / PAGE) * PAGE, label: dynamic ? 'r-x · .plt .text' : 'r-x · .text (with libc code)', tone: 'sky' },
    { from: BASE.rodata, to: BASE.rodata + PAGE, label: 'r-- · .rodata', tone: 'amber' },
    { from: BASE.data, to: BASE.data + PAGE, label: dynamic ? 'rw- · .got.plt .data .bss' : 'rw- · .data .bss', tone: 'pink' },
  ];
  const stack: MemRegion = { from: bases.stack, to: bases.stack + STACK_SIZE, label: 'rw- · stack', tone: 'muted' };
  const ldso: MemRegion = { from: bases.ldso, to: bases.ldso + LDSO_SIZE, label: 'ld-linux-x86-64.so.2', tone: 'orange' };
  const libc: MemRegion = { from: bases.libc, to: bases.libc + LIBC_SIZE, label: 'libc.so.6', tone: 'orange' };
  const heap: MemRegion = { from: bases.heap, to: bases.heap + HEAP_SIZE, label: 'rw- · heap', tone: 'muted' };

  // Lazy: the slot starts out pointing back into the stub, at the instruction after its jmp.
  const unresolved = plt ? plt.addr + 6 : null;
  const textCell = (value: string): MemCell => ({ addr: BASE.text, value });
  const gotOffset = plt ? plt.got - BASE.data : 0;
  const gotCell = (got: number, written: boolean): MemCell => ({ addr: BASE.data, value: `+${hexOf(gotOffset)} GOT[printf] = ${hexOf(got)}`, tone: written ? 'info' : undefined, ring: written ? 'info' : undefined });
  const libcCell: MemCell = { addr: printf - (printf % PAGE), value: `printf at ${hexOf(printf)}` };
  const textValue = dynamic ? `main ${hexOf(main)}, printf@plt ${hexOf(plt!.addr)}` : `main ${hexOf(main)}, printf ${hexOf(printf)}`;

  const steps: LoadStep[] = [];
  const push = (phase: LoadPhase, regions: MemRegion[], cells: MemCell[], pointer: MemPointer | null, got: number | null, gotWritten = false, output: string[] = []) =>
    steps.push({ phase, regions, cells, pointer, got, gotWritten, output });
  const rip = (addr: number): MemPointer => ({ addr, label: 'rip', tone: 'hi' });

  if (!dynamic) {
    const cells = [textCell(textValue)];
    // The real entry is _start from crt1.o, which this simplified link leaves out, so no rip yet.
    push('exec', [...exe, stack], cells, null, null);
    push('main', [...exe, stack], cells, rip(main), null);
    push('printed', [...exe, heap, stack], cells, rip(printf), null, false, [printedLine()]);
    return { steps, printf, pltStub: null, gotSlot: null };
  }

  const got0 = binding === 'lazy' ? unresolved! : 0;
  const cellsWith = (got: number, written: boolean, withLibc: boolean) => [textCell(textValue), gotCell(got, written), ...(withLibc ? [libcCell] : [])];
  push('exec', [...exe, stack], [textCell(textValue), gotCell(unresolved!, false)], null, unresolved);
  push('interp', [...exe, stack, ldso], [textCell(textValue), gotCell(unresolved!, false)], rip(bases.ldso), unresolved);
  push('needed', [...exe, libc, ldso, stack], cellsWith(unresolved!, false, true), rip(bases.ldso), unresolved);
  if (binding === 'now') push('bind', [...exe, libc, ldso, stack], cellsWith(printf, true, true), rip(bases.ldso), printf, true);
  const afterBind = binding === 'now' ? printf : got0;
  push('main', [...exe, libc, ldso, stack], cellsWith(afterBind, false, true), rip(main), afterBind);
  push('firstCall', [...exe, libc, ldso, stack], cellsWith(printf, binding === 'lazy', true), rip(printf), printf, binding === 'lazy');
  push('printed', [...exe, heap, libc, ldso, stack], cellsWith(printf, false, true), rip(printf), printf, false, [printedLine()]);
  return { steps, printf, pltStub: plt!.addr, gotSlot: plt!.got };
}
