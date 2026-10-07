/**
 * Fixed, lesson-authored text: the stack scene's listings and the "Finding it" reports. Nothing
 * here is compiled or run; the reports are illustrative, in the style of AddressSanitizer.
 */

export interface StackListing {
  lang: 'C' | 'Rust';
  lines: string[];
  notes: Record<number, string>;
  /** The line that does the copy. */
  copyLine: number;
  /** The closing brace: the epilogue in C. */
  endLine: number;
}

const C_COPY = {
  strcpy: { line: '    strcpy(name, input);', note: 'copies until the NUL: no length check' },
  snprintf: { line: '    snprintf(name, sizeof name, "%s", input);', note: 'writes at most 8 bytes, NUL included' },
};

export function cListing(boundsCheck: boolean, canary: boolean): StackListing {
  const copy = boundsCheck ? C_COPY.snprintf : C_COPY.strcpy;
  return {
    lang: 'C',
    lines: ['void greet(const char *input) {', '    char name[8];', copy.line, '}'],
    notes: { 1: '8 bytes on the stack', 2: copy.note, 3: canary ? 'epilogue: check the canary, leave, ret' : 'epilogue: leave, ret' },
    copyLine: 2,
    endLine: 3,
  };
}

/** The Rust panic points at `name[i] = b;`: line 4, column 9. */
export const RUST_LISTING: StackListing = {
  lang: 'Rust',
  lines: ['fn greet(input: &str) {', '    let mut name = [0u8; 8];', '    for (i, b) in input.bytes().enumerate() {', '        name[i] = b;', '    }', '}'],
  notes: { 1: 'an 8-byte array', 3: 'every index is checked' },
  copyLine: 3,
  endLine: 5,
};

export const RUST_PANIC = [
  "thread 'main' panicked at src/main.rs:4:9:",
  'index out of bounds: the len is 8 but the index is 8',
  'note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace',
];

/** glibc's message when the canary check fails, then the shell's report of the abort. */
export const CANARY_ABORT = ['*** stack smashing detected ***: terminated', 'Aborted (core dumped)'];

/** Illustrative AddressSanitizer report for strcpy of "Grace Hopper" (13 bytes) into name[8]. */
export const ASAN_STACK = [
  '==4242==ERROR: AddressSanitizer: stack-buffer-overflow on address 0x7ffc… at pc 0x… bp 0x… sp 0x…',
  'WRITE of size 13 at 0x7ffc… thread T0',
  '    #0 0x… in strcpy',
  '    #1 0x… in greet greet.c:3',
  '    #2 0x… in main',
  '  This frame has 1 object(s):',
  "    [32, 40) 'name' (line 2) <== Memory access at offset 40 overflows this variable",
  'SUMMARY: AddressSanitizer: stack-buffer-overflow greet.c:3 in greet',
];

/** Illustrative AddressSanitizer report for the use-after-free program with no defence. */
export const ASAN_UAF = [
  '==4242==ERROR: AddressSanitizer: heap-use-after-free on address 0x602… at pc 0x… bp 0x… sp 0x…',
  'WRITE of size 4 at 0x602… thread T0',
  '    #0 0x… in strcpy',
  '    #1 0x… in main uaf.c:7',
  '0x602… is located 0 bytes inside of 16-byte region [0x602…,0x602…)',
  'freed by thread T0 here:',
  '    #0 0x… in free',
  '    #1 0x… in main uaf.c:4',
  'previously allocated by thread T0 here:',
  '    #0 0x… in malloc',
  '    #1 0x… in main uaf.c:2',
  'SUMMARY: AddressSanitizer: heap-use-after-free uaf.c:7 in main',
];
