import type { ListingLine } from '../../core/x86';

/**
 * Every x86-64 listing here is real compiler output, copied from
 *   gcc 13.3.0 (Ubuntu 24.04, x86-64)
 *   gcc -O1 -masm=intel -fno-asynchronous-unwind-tables -fcf-protection=none -fno-pie -S
 * plus the extra flags named per listing. Byte offsets and the C line each instruction came
 * from are from `objdump -d -l -M intel` of the same build with -g. Assembler directives are
 * left out. `-fcf-protection=none` drops the endbr64 that Ubuntu's gcc adds by default.
 *
 * The AArch64 listing is NOT compiler-checked (no cross compiler was available): it is the
 * usual gcc -O1 shape for this function, and is labelled as such on screen.
 */

export interface AsmLine extends ListingLine {
  /** 1-based line of `c` this instruction came from (objdump -l). */
  cLine?: number;
}

export interface Listing {
  id: string;
  /** The compiler flags beyond the common ones above. */
  extraFlags: string;
  c: string[];
  asm: AsmLine[];
  /** Function size in bytes (offset just past the last instruction). */
  endOffset: number;
}

export const SUM: Listing = {
  id: 'sum',
  extraFlags: '',
  c: ['long sum(const long *a, long n) {', '    long s = 0;', '    for (long i = 0; i < n; i++)', '        s += a[i];', '    return s;', '}'],
  asm: [
    { label: 'sum' },
    { asm: 'test rsi, rsi', offset: 0x0, cLine: 3 },
    { asm: 'jle .L4', offset: 0x3, cLine: 3 },
    { asm: 'mov rax, rdi', offset: 0x5, cLine: 3 },
    { asm: 'lea rcx, [rdi+rsi*8]', offset: 0x8, cLine: 3 },
    { asm: 'mov edx, 0', offset: 0xc, cLine: 2 },
    { label: '.L3' },
    { asm: 'add rdx, QWORD PTR [rax]', offset: 0x11, cLine: 4 },
    { asm: 'add rax, 8', offset: 0x14, cLine: 3 },
    { asm: 'cmp rax, rcx', offset: 0x18, cLine: 3 },
    { asm: 'jne .L3', offset: 0x1b, cLine: 3 },
    { label: '.L1' },
    { asm: 'mov rax, rdx', offset: 0x1d, cLine: 6 },
    { asm: 'ret', offset: 0x20, cLine: 6 },
    { label: '.L4' },
    { asm: 'mov edx, 0', offset: 0x21, cLine: 2 },
    { asm: 'jmp .L1', offset: 0x26, cLine: 5 },
  ],
  endOffset: 0x28,
};

const MAX_C = ['long max(long a, long b) {', '    if (a > b)', '        return a;', '    return b;', '}'];

/** Plain -O1: gcc turns the if into a conditional move. */
export const MAX_CMOV: Listing = {
  id: 'max-cmov',
  extraFlags: '',
  c: MAX_C,
  asm: [
    { label: 'max' },
    { asm: 'cmp rdi, rsi', offset: 0x0, cLine: 2 },
    { asm: 'mov rax, rsi', offset: 0x3, cLine: 2 },
    { asm: 'cmovge rax, rdi', offset: 0x6, cLine: 2 },
    { asm: 'ret', offset: 0xa, cLine: 5 },
  ],
  endOffset: 0xb,
};

/** With if-conversion (and the phiopt pass that makes a max out of it) turned off: a branch. */
export const MAX_BRANCH: Listing = {
  id: 'max-branch',
  extraFlags: '-fno-ssa-phiopt -fno-if-conversion -fno-if-conversion2',
  c: MAX_C,
  asm: [
    { label: 'max' },
    { asm: 'cmp rdi, rsi', offset: 0x0, cLine: 2 },
    { asm: 'jg .L3', offset: 0x3, cLine: 2 },
    { asm: 'mov rax, rsi', offset: 0x5, cLine: 4 },
    { asm: 'ret', offset: 0x8, cLine: 5 },
    { label: '.L3' },
    { asm: 'mov rax, rdi', offset: 0x9, cLine: 3 },
    { asm: 'ret', offset: 0xc, cLine: 5 },
  ],
  endOffset: 0xd,
};

const absC = (type: string) => [`${type} absdiff(${type} a, ${type} b) {`, '    if (a < b)', '        return b - a;', '    return a - b;', '}'];

/** -fno-if-conversion -fno-if-conversion2, so the comparison stays a jump. */
export const ABSDIFF_SIGNED: Listing = {
  id: 'absdiff',
  extraFlags: '-fno-if-conversion -fno-if-conversion2',
  c: absC('long'),
  asm: [
    { label: 'absdiff' },
    { asm: 'cmp rdi, rsi', offset: 0x0, cLine: 2 },
    { asm: 'jl .L4', offset: 0x3, cLine: 2 },
    { asm: 'mov rax, rdi', offset: 0x5, cLine: 4 },
    { asm: 'sub rax, rsi', offset: 0x8, cLine: 4 },
    { asm: 'ret', offset: 0xb, cLine: 5 },
    { label: '.L4' },
    { asm: 'mov rax, rsi', offset: 0xc, cLine: 3 },
    { asm: 'sub rax, rdi', offset: 0xf, cLine: 3 },
    { asm: 'ret', offset: 0x12, cLine: 5 },
  ],
  endOffset: 0x13,
};

/**
 * The same function on `unsigned long` (absdiff_u in the compiled file, shown here as
 * absdiff on its own so its offsets start at 0). Only the jump changes: jl becomes jb.
 */
export const ABSDIFF_UNSIGNED: Listing = {
  id: 'absdiff-u',
  extraFlags: '-fno-if-conversion -fno-if-conversion2',
  c: absC('unsigned long'),
  asm: [
    { label: 'absdiff' },
    { asm: 'cmp rdi, rsi', offset: 0x0, cLine: 2 },
    { asm: 'jb .L8', offset: 0x3, cLine: 2 },
    { asm: 'mov rax, rdi', offset: 0x5, cLine: 4 },
    { asm: 'sub rax, rsi', offset: 0x8, cLine: 4 },
    { asm: 'ret', offset: 0xb, cLine: 5 },
    { label: '.L8' },
    { asm: 'mov rax, rsi', offset: 0xc, cLine: 3 },
    { asm: 'sub rax, rdi', offset: 0xf, cLine: 3 },
    { asm: 'ret', offset: 0x12, cLine: 5 },
  ],
  endOffset: 0x13,
};

export const AREA: Listing = {
  id: 'area',
  extraFlags: '',
  c: ['struct rect { long id; long w; long h; };', '', 'long area(const struct rect *r) {', '    return r->w * r->h;', '}'],
  asm: [
    { label: 'area' },
    { asm: 'mov rax, QWORD PTR [rdi+8]', offset: 0x0, cLine: 4 },
    { asm: 'imul rax, QWORD PTR [rdi+16]', offset: 0x4, cLine: 4 },
    { asm: 'ret', offset: 0x9, cLine: 5 },
  ],
  endOffset: 0xa,
};

export const COMMON_FLAGS = 'gcc 13.3 -O1 -masm=intel';

/** max for AArch64: every instruction is 4 bytes. Not compiler-checked (see above). */
export const MAX_ARM64 = {
  lines: ['max:', '    cmp     x0, x1', '    csel    x0, x0, x1, ge', '    ret'],
  bytes: 12,
};
