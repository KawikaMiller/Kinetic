import type { ListingLine } from '../../core/x86';

/**
 * Compiled listings are real gcc output, copied from
 *   gcc 13.3.0 (Ubuntu 24.04, x86-64)
 *   gcc -O1 -masm=intel -fno-asynchronous-unwind-tables -fcf-protection=none -fno-pie -S
 * with `-fno-omit-frame-pointer -mno-omit-leaf-frame-pointer` where a listing says
 * "frame pointers". (gcc 13 still gives the leaf `mul` no frame at -O1.) Byte offsets and
 * source lines are from `objdump -d -l -M intel` of the same build with -g. The functions
 * are marked __attribute__((noinline)) in the C file, so -O1 keeps the calls; that
 * attribute is left out of the C shown on screen.
 *
 * CLOBBER and CLOBBER_SAVED are hand-written (across a call it cannot see into, a compiler never leaves a live value in rcx; with -fipa-ra it may when it can see the callee leaves rcx alone;
 * showing the rule is the point), assembled with GNU as 2.42 for their byte offsets.
 */

export interface AsmLine extends ListingLine {
  cLine?: number;
  /** A short comment shown beside the line. */
  note?: string;
}

export interface Listing {
  id: string;
  flags: string;
  /** C source, or null for a hand-written listing. */
  c: string[] | null;
  asm: AsmLine[];
  endOffset: number;
  /** The function the run starts in. */
  entry: string;
}

const CALLS_C = [
  'long mul(long a, long b) {',
  '    return a * b;',
  '}',
  '',
  'long area(long w, long h) {',
  '    long border = w + h;',
  '    long inner = mul(w, h);',
  '    return inner + border;',
  '}',
  '',
  'int main(void) {',
  '    long r = area(6, 4);',
  '    return (int) r;',
  '}',
];

export const CALLS_FP: Listing = {
  id: 'calls-fp',
  flags: 'gcc 13.3 -O1 -fno-omit-frame-pointer',
  c: CALLS_C,
  entry: 'main',
  asm: [
    { label: 'mul' },
    { asm: 'mov rax, rdi', offset: 0x0, cLine: 2 },
    { asm: 'imul rax, rsi', offset: 0x3, cLine: 2 },
    { asm: 'ret', offset: 0x7, cLine: 3 },
    { label: 'area' },
    { asm: 'push rbp', offset: 0x8, cLine: 5, note: 'save the caller\'s frame pointer' },
    { asm: 'mov rbp, rsp', offset: 0x9, cLine: 5, note: 'rbp = this frame' },
    { asm: 'push rbx', offset: 0xc, cLine: 5, note: 'rbx is callee-saved: keep the caller\'s copy' },
    { asm: 'sub rsp, 8', offset: 0xd, cLine: 5, note: 'pad so rsp is 16-aligned at the call' },
    { asm: 'lea rbx, [rdi+rsi]', offset: 0x11, cLine: 6, note: 'border = w + h, kept in rbx' },
    { asm: 'call mul', offset: 0x15, cLine: 7 },
    { asm: 'add rax, rbx', offset: 0x1a, cLine: 8 },
    { asm: 'mov rbx, QWORD PTR [rbp-8]', offset: 0x1d, cLine: 9, note: 'restore the caller\'s rbx' },
    { asm: 'leave', offset: 0x21, cLine: 9, note: 'rsp = rbp; pop rbp' },
    { asm: 'ret', offset: 0x22, cLine: 9 },
    { label: 'main' },
    { asm: 'push rbp', offset: 0x23, cLine: 11 },
    { asm: 'mov rbp, rsp', offset: 0x24, cLine: 11 },
    { asm: 'mov esi, 4', offset: 0x27, cLine: 12, note: 'h → 2nd argument' },
    { asm: 'mov edi, 6', offset: 0x2c, cLine: 12, note: 'w → 1st argument' },
    { asm: 'call area', offset: 0x31, cLine: 12 },
    { asm: 'pop rbp', offset: 0x36, cLine: 14 },
    { asm: 'ret', offset: 0x37, cLine: 14 },
  ],
  endOffset: 0x38,
};

/**
 * gcc skips the usual 16-byte padding in this build: it can see that area and mul never need an aligned stack
 * (-fipa-stack-alignment, on by default). With -fno-ipa-stack-alignment, or with area in another
 * file, the same main pads to 16 bytes before the call.
 */
export const NO_PAD_NOTE = 'no 16-byte padding: gcc saw area and mul don\'t need it';

/** Plain -O1: no frame pointers at all. */
export const CALLS_NOFP: Listing = {
  id: 'calls-nofp',
  flags: 'gcc 13.3 -O1 (frame pointer omitted, the default)',
  c: CALLS_C,
  entry: 'main',
  asm: [
    { label: 'mul' },
    { asm: 'mov rax, rdi', offset: 0x0, cLine: 2 },
    { asm: 'imul rax, rsi', offset: 0x3, cLine: 2 },
    { asm: 'ret', offset: 0x7, cLine: 3 },
    { label: 'area' },
    { asm: 'push rbx', offset: 0x8, cLine: 5, note: 'rbx is callee-saved: keep the caller\'s copy' },
    { asm: 'lea rbx, [rdi+rsi]', offset: 0x9, cLine: 6, note: 'border = w + h, kept in rbx' },
    { asm: 'call mul', offset: 0xd, cLine: 7 },
    { asm: 'add rax, rbx', offset: 0x12, cLine: 8 },
    { asm: 'pop rbx', offset: 0x15, cLine: 9 },
    { asm: 'ret', offset: 0x16, cLine: 9 },
    { label: 'main' },
    { asm: 'mov esi, 4', offset: 0x17, cLine: 12, note: 'h → 2nd argument' },
    { asm: 'mov edi, 6', offset: 0x1c, cLine: 12, note: 'w → 1st argument' },
    { asm: 'call area', offset: 0x21, cLine: 12, note: NO_PAD_NOTE },
    { asm: 'ret', offset: 0x26, cLine: 14 },
  ],
  endOffset: 0x27,
};

export const SEVEN: Listing = {
  id: 'seven',
  flags: 'gcc 13.3 -O1 -fno-omit-frame-pointer',
  c: ['long sum7(long a, long b, long c, long d, long e, long f, long g) {', '    return a + b + c + d + e + f + g;', '}', '', 'int main(void) {', '    return (int) sum7(1, 2, 3, 4, 5, 6, 7);', '}'],
  entry: 'main',
  asm: [
    { label: 'sum7' },
    { asm: 'push rbp', offset: 0x0, cLine: 1 },
    { asm: 'mov rbp, rsp', offset: 0x1, cLine: 1 },
    { asm: 'add rdi, rsi', offset: 0x4, cLine: 2 },
    { asm: 'add rdi, rdx', offset: 0x7, cLine: 2 },
    { asm: 'add rdi, rcx', offset: 0xa, cLine: 2 },
    { asm: 'add rdi, r8', offset: 0xd, cLine: 2 },
    { asm: 'lea rax, [rdi+r9]', offset: 0x10, cLine: 2 },
    { asm: 'add rax, QWORD PTR [rbp+16]', offset: 0x14, cLine: 2, note: 'g: the 7th argument, on the stack' },
    { asm: 'pop rbp', offset: 0x18, cLine: 3 },
    { asm: 'ret', offset: 0x19, cLine: 3 },
    { label: 'main' },
    { asm: 'push rbp', offset: 0x1a, cLine: 5 },
    { asm: 'mov rbp, rsp', offset: 0x1b, cLine: 5 },
    { asm: 'sub rsp, 8', offset: 0x1e, cLine: 6, note: 'pad: one push follows, keep rsp 16-aligned' },
    { asm: 'push 7', offset: 0x22, cLine: 6, note: '7th argument: no register left' },
    { asm: 'mov r9d, 6', offset: 0x24, cLine: 6 },
    { asm: 'mov r8d, 5', offset: 0x2a, cLine: 6 },
    { asm: 'mov ecx, 4', offset: 0x30, cLine: 6 },
    { asm: 'mov edx, 3', offset: 0x35, cLine: 6 },
    { asm: 'mov esi, 2', offset: 0x3a, cLine: 6 },
    { asm: 'mov edi, 1', offset: 0x3f, cLine: 6 },
    { asm: 'call sum7', offset: 0x44, cLine: 6 },
    { asm: 'add rsp, 16', offset: 0x49, cLine: 6, note: 'drop the argument and the pad' },
    { asm: 'leave', offset: 0x4d, cLine: 7 },
    { asm: 'ret', offset: 0x4e, cLine: 7 },
  ],
  endOffset: 0x4f,
};

const clobberLines = (callerSaves: boolean): AsmLine[] => {
  const o = callerSaves ? -4 : 0; // the saved variant drops `sub rsp, 8` (4 bytes)
  return [
    { label: 'main' },
    { asm: 'push rbp', offset: 0x0 },
    { asm: 'mov rbp, rsp', offset: 0x1 },
    { asm: 'push rbx', offset: 0x4, note: 'main uses rbx, so it saves its own caller\'s copy' },
    ...(callerSaves ? [] : [{ asm: 'sub rsp, 8', offset: 0x5, note: 'keep rsp 16-aligned for the call' }]),
    { asm: 'mov ecx, 100', offset: 0x9 + o, note: 'a value kept in rcx: caller-saved' },
    { asm: 'mov ebx, 200', offset: 0xe + o, note: 'a value kept in rbx: callee-saved' },
    ...(callerSaves
      ? [
          { asm: 'push rcx', offset: 0xf, note: 'the caller saves rcx itself' },
          { asm: 'call helper', offset: 0x10 },
          { asm: 'pop rcx', offset: 0x15, note: 'and gets it back' },
        ]
      : [{ asm: 'call helper', offset: 0x13 }]),
    { asm: 'mov rbx, QWORD PTR [rbp-8]', offset: callerSaves ? 0x16 : 0x18 },
    { asm: 'leave', offset: callerSaves ? 0x1a : 0x1c },
    { asm: 'ret', offset: callerSaves ? 0x1b : 0x1d },
    { label: 'helper' },
    { asm: 'push rbp', offset: callerSaves ? 0x1c : 0x1e },
    { asm: 'mov rbp, rsp', offset: callerSaves ? 0x1d : 0x1f },
    { asm: 'push rbx', offset: callerSaves ? 0x20 : 0x22, note: 'helper wants rbx too: save the caller\'s' },
    { asm: 'mov ebx, 1', offset: callerSaves ? 0x21 : 0x23 },
    { asm: 'mov ecx, 2', offset: callerSaves ? 0x26 : 0x28, note: 'rcx is free to overwrite' },
    { asm: 'mov eax, ebx', offset: callerSaves ? 0x2b : 0x2d },
    { asm: 'add eax, ecx', offset: callerSaves ? 0x2d : 0x2f },
    { asm: 'mov rbx, QWORD PTR [rbp-8]', offset: callerSaves ? 0x2f : 0x31, note: 'put the caller\'s rbx back' },
    { asm: 'leave', offset: callerSaves ? 0x33 : 0x35 },
    { asm: 'ret', offset: callerSaves ? 0x34 : 0x36 },
  ];
};

export const CLOBBER: Listing = { id: 'clobber', flags: 'hand-written, assembled with GNU as', c: null, entry: 'main', asm: clobberLines(false), endOffset: 0x37 };
export const CLOBBER_SAVED: Listing = { id: 'clobber-saved', flags: 'hand-written, assembled with GNU as', c: null, entry: 'main', asm: clobberLines(true), endOffset: 0x35 };

export const DEEP: Listing = {
  id: 'deep',
  flags: 'gcc 13.3 -O1 -fno-omit-frame-pointer',
  c: ['long depth(long n) {', '    if (n == 0)', '        return 0;', '    return 1 + depth(n - 1);', '}', '', 'int main(void) {', '    return (int) depth(1000000000);', '}'],
  entry: 'main',
  asm: [
    { label: 'depth' },
    { asm: 'mov rax, rdi', offset: 0x0, cLine: 1 },
    { asm: 'test rdi, rdi', offset: 0x3, cLine: 2 },
    { asm: 'jne .L7', offset: 0x6, cLine: 2 },
    { asm: 'ret', offset: 0x8, cLine: 5 },
    { label: '.L7' },
    { asm: 'push rbp', offset: 0x9, cLine: 1 },
    { asm: 'mov rbp, rsp', offset: 0xa, cLine: 1 },
    { asm: 'lea rdi, [rdi-1]', offset: 0xd, cLine: 4 },
    { asm: 'call depth', offset: 0x11, cLine: 4 },
    { asm: 'add rax, 1', offset: 0x16, cLine: 4 },
    { asm: 'pop rbp', offset: 0x1a, cLine: 5 },
    { asm: 'ret', offset: 0x1b, cLine: 5 },
    { label: 'main' },
    { asm: 'push rbp', offset: 0x1c, cLine: 7 },
    { asm: 'mov rbp, rsp', offset: 0x1d, cLine: 7 },
    { asm: 'mov edi, 1000000000', offset: 0x20, cLine: 8 },
    { asm: 'call depth', offset: 0x25, cLine: 8 },
    { asm: 'pop rbp', offset: 0x2a, cLine: 9 },
    { asm: 'ret', offset: 0x2b, cLine: 9 },
  ],
  endOffset: 0x2c,
};
