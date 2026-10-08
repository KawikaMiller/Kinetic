import { ABSDIFF_SIGNED, ABSDIFF_UNSIGNED, AREA, MAX_BRANCH, MAX_CMOV, SUM, type Listing } from './listings';
import { assemble, runToEnd, signed, startCpu, unsigned, writeMem, type Cpu, type Program, type StepEffect } from '../../core/x86';

/** Where things live. Typical non-PIE Linux addresses, not taken from a real run. */
export const CODE_BASE = 0x401126;
export const DATA_BASE = 0x404020;
/** rsp just before the caller's `call`: 16-byte aligned, so it's ≡ 8 (mod 16) on entry. */
export const STACK_TOP = 0x7ffd1c4e3a60;

export type ProgId = 'sum' | 'max' | 'absdiff' | 'area';

export interface Variant {
  /** max: compiled with cmov instead of a branch. */
  cmov: boolean;
  /** absdiff: on unsigned long instead of long. */
  unsignedTypes: boolean;
}

export interface InputPreset {
  id: string;
  label: string;
  /** sum: the array; max/absdiff: [a, b]; area: [id, w, h]. */
  values: bigint[];
}

export const PRESETS: Record<ProgId, InputPreset[]> = {
  sum: [
    { id: 'four', label: 'a = {10, 20, 30, 40}', values: [10n, 20n, 30n, 40n] },
    { id: 'neg', label: 'a = {5, -7, 2}', values: [5n, -7n, 2n] },
    { id: 'empty', label: 'n = 0', values: [] },
  ],
  max: [
    { id: 'lt', label: 'max(3, 7)', values: [3n, 7n] },
    { id: 'gt', label: 'max(7, 3)', values: [7n, 3n] },
    { id: 'neg', label: 'max(-5, 2)', values: [-5n, 2n] },
  ],
  absdiff: [
    { id: 'small', label: 'absdiff(3, 10)', values: [3n, 10n] },
    { id: 'big', label: 'absdiff(10, 3)', values: [10n, 3n] },
    { id: 'twist', label: 'absdiff(-1, 1)', values: [-1n, 1n] },
  ],
  area: [
    { id: 'small', label: '{ id 7, w 6, h 4 }', values: [7n, 6n, 4n] },
    { id: 'wide', label: '{ id 2, w 120, h 35 }', values: [2n, 120n, 35n] },
  ],
};

export function listingFor(prog: ProgId, v: Variant): Listing {
  switch (prog) {
    case 'sum':
      return SUM;
    case 'max':
      return v.cmov ? MAX_CMOV : MAX_BRANCH;
    case 'absdiff':
      return v.unsignedTypes ? ABSDIFF_UNSIGNED : ABSDIFF_SIGNED;
    case 'area':
      return AREA;
  }
}

export const assembleListing = (l: Listing): Program => assemble(l.asm, CODE_BASE, l.endOffset);

/** What C says the function returns, as the 64-bit pattern in rax. Computed without the listing. */
export function cResult(prog: ProgId, v: Variant, values: readonly bigint[]): bigint {
  switch (prog) {
    case 'sum':
      // long arithmetic on these small inputs never overflows; wrap anyway, like the hardware
      return unsigned(values.reduce((s, x) => s + x, 0n));
    case 'max':
      return unsigned(values[0] > values[1] ? values[0] : values[1]);
    case 'absdiff': {
      if (v.unsignedTypes) {
        const [a, b] = values.map((x) => unsigned(x));
        return unsigned(a < b ? b - a : a - b);
      }
      const [a, b] = values;
      return unsigned(a < b ? b - a : a - b);
    }
    case 'area':
      return unsigned(values[1] * values[2]);
  }
}

export interface DataCell {
  addr: number;
  label: string;
  value: bigint;
}

export interface Setup {
  listing: Listing;
  program: Program;
  start: Cpu;
  /** Memory the function reads, for the data MemoryMap. */
  data: DataCell[];
  /** The C name for each argument register, for captions. */
  args: { reg: 'rdi' | 'rsi'; name: string }[];
}

export function setup(prog: ProgId, v: Variant, values: readonly bigint[]): Setup {
  const listing = listingFor(prog, v);
  const program = assembleListing(listing);
  const mem = new Map<number, number>();
  const data: DataCell[] = [];
  let regs: Partial<Record<'rdi' | 'rsi', bigint>> = {};
  let args: Setup['args'] = [];
  if (prog === 'sum') {
    values.forEach((x, i) => {
      writeMem(mem, DATA_BASE + 8 * i, 64, x);
      data.push({ addr: DATA_BASE + 8 * i, label: `a[${i}]`, value: unsigned(x) });
    });
    regs = { rdi: BigInt(DATA_BASE), rsi: BigInt(values.length) };
    args = [{ reg: 'rdi', name: 'a' }, { reg: 'rsi', name: 'n' }];
  } else if (prog === 'area') {
    ['id', 'w', 'h'].forEach((f, i) => {
      writeMem(mem, DATA_BASE + 8 * i, 64, values[i]);
      data.push({ addr: DATA_BASE + 8 * i, label: `r->${f}`, value: unsigned(values[i]) });
    });
    regs = { rdi: BigInt(DATA_BASE) };
    args = [{ reg: 'rdi', name: 'r' }];
  } else {
    regs = { rdi: unsigned(values[0]), rsi: unsigned(values[1]) };
    args = [{ reg: 'rdi', name: 'a' }, { reg: 'rsi', name: 'b' }];
  }
  const start = startCpu({ regs, rip: program.labels[listing.asm[0].label!], rsp: STACK_TOP, mem, called: true });
  return { listing, program, start, data, args };
}

export interface RunResult extends Setup {
  cpus: Cpu[];
  effects: StepEffect[];
}

export function runProgram(prog: ProgId, v: Variant, values: readonly bigint[]): RunResult {
  const s = setup(prog, v, values);
  return { ...s, ...runToEnd(s.program, s.start) };
}

/** A register value as the learner should read it: pointers in hex, data in decimal. */
export function formatValue(value: bigint, unsignedTypes: boolean): string {
  const looksLikeAddress = value >= 0x400000n && value < 1n << 48n;
  if (looksLikeAddress) return `0x${value.toString(16)}`;
  return (unsignedTypes ? unsigned(value) : signed(value)).toString();
}

export const HONESTY =
  'Hand-copied from gcc 13.3 -O1 output for x86-64 (Intel syntax). The interpreter runs only the instructions shown, not real machine code. Code and stack addresses are typical, not from a real run.';
