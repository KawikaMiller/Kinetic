import { assemble, hex, startCpu, step, type Cpu } from './x86';

/** The register-widths demo: one register, a few writes of different widths. */
export const START_VALUE = 0x1122334455667788n;
export const WIDTH_WRITES = ['mov eax, -1', 'mov ax, -1', 'mov al, -1', 'movabs rax, 0x1122334455667788'] as const;
export type WidthWrite = (typeof WIDTH_WRITES)[number];

/** Nested views of rax, widest first: name and how many low bytes it covers. */
export const VIEWS = [
  { name: 'rax', bytes: 8 },
  { name: 'eax', bytes: 4 },
  { name: 'ax', bytes: 2 },
  { name: 'al', bytes: 1 },
] as const;

export const widthStart = (): Cpu => startCpu({ regs: { rax: START_VALUE }, rip: 0, rsp: 0x8000 });

/** rax as 8 bytes, most significant first. */
export const bytesOf = (v: bigint) => Array.from({ length: 8 }, (_, i) => Number((v >> BigInt(8 * (7 - i))) & 0xffn));

export type ByteChange = 'written' | 'zeroed' | 'kept';

export interface WidthResult {
  before: bigint;
  after: bigint;
  /** Per byte, most significant first. */
  change: ByteChange[];
}

/** Runs one write through the interpreter and classifies every byte of rax. */
export function applyWrite(cpu: Cpu, asm: WidthWrite): { cpu: Cpu; result: WidthResult } {
  const program = assemble([{ asm, offset: 0 }], 0, 4);
  const r = step(program, { ...cpu, rip: 0 });
  const before = cpu.regs.rax;
  const after = r.cpu.regs.rax;
  const wrote = asm.startsWith('movabs rax') ? 8 : asm.startsWith('mov eax') ? 4 : asm.startsWith('mov ax') ? 2 : 1;
  const zeroExtends = wrote === 4;
  const change: ByteChange[] = Array.from({ length: 8 }, (_, i) => {
    const fromLow = 7 - i;
    if (fromLow < wrote) return 'written';
    return zeroExtends ? 'zeroed' : 'kept';
  });
  return { cpu: { ...r.cpu, rip: 0 }, result: { before, after, change } };
}

export const widthSay = (asm: WidthWrite, r: WidthResult) => `${asm}: rax went from ${hex(r.before)} to ${hex(r.after)}.`;
