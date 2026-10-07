/**
 * The use-after-free scene: p's block is freed, q asks for a block of the same size and gets the
 * same memory back, and a write through the stale p lands in q's data. The allocator is a black
 * box: all the model says is that it may hand freed memory to the next request (here it does).
 * Pure, so the tests can prove the stale write changes q's bytes and nothing else.
 */

export const BLOCK_BYTES = 16;
/** Illustrative heap addresses. */
const HEAP_START = 0x55555555a2c0;
const BLOCK_STRIDE = 0x20;

export type UafVar = 'p' | 'q';
export type UafDefence = 'none' | 'null' | 'rust' | 'gc';

export type UafOp =
  | { kind: 'malloc'; v: UafVar }
  | { kind: 'write'; v: UafVar; text: string }
  | { kind: 'free'; v: UafVar }
  | { kind: 'null'; v: UafVar }
  | { kind: 'print'; v: UafVar };

export interface UafProgram {
  lang: 'C' | 'Rust' | 'JavaScript';
  lines: string[];
  /** Each step runs one source line. Rust has none: the compiler rejects the program. */
  steps: { line: number; ops: UafOp[] }[];
  /** The line the stale use is on. */
  staleLine: number;
}

const C_HEAD = ['int main(void) {', '    char *p = malloc(16);', '    strcpy(p, "Ada");', '    free(p);'];
const C_TAIL = ['    char *q = malloc(16);', '    strcpy(q, "Grace");', '    strcpy(p, "Lin");', '    printf("%s\\n", q);', '}'];

const cSteps = (shift: number): UafProgram['steps'] => [
  { line: 1, ops: [{ kind: 'malloc', v: 'p' }] },
  { line: 2, ops: [{ kind: 'write', v: 'p', text: 'Ada' }] },
  { line: 3, ops: [{ kind: 'free', v: 'p' }] },
  ...(shift ? [{ line: 4, ops: [{ kind: 'null', v: 'p' } as const] }] : []),
  { line: 4 + shift, ops: [{ kind: 'malloc', v: 'q' }] },
  { line: 5 + shift, ops: [{ kind: 'write', v: 'q', text: 'Grace' }] },
  { line: 6 + shift, ops: [{ kind: 'write', v: 'p', text: 'Lin' }] },
  { line: 7 + shift, ops: [{ kind: 'print', v: 'q' }] },
];

export const UAF_PROGRAMS: Record<UafDefence, UafProgram> = {
  none: { lang: 'C', lines: [...C_HEAD, ...C_TAIL], steps: cSteps(0), staleLine: 6 },
  null: { lang: 'C', lines: [...C_HEAD, '    p = NULL;', ...C_TAIL], steps: cSteps(1), staleLine: 7 },
  rust: {
    lang: 'Rust',
    lines: ['fn main() {', '    let mut p = String::from("Ada");', '    drop(p);', '    let q = String::from("Grace");', '    p.push_str("Lin");', '    println!("{q}");', '}'],
    steps: [],
    staleLine: 4,
  },
  gc: {
    lang: 'JavaScript',
    lines: ["let p = { name: 'Ada' };", "let q = { name: 'Grace' };", "p.name = 'Lin';", 'console.log(q.name);'],
    steps: [
      { line: 0, ops: [{ kind: 'malloc', v: 'p' }, { kind: 'write', v: 'p', text: 'Ada' }] },
      { line: 1, ops: [{ kind: 'malloc', v: 'q' }, { kind: 'write', v: 'q', text: 'Grace' }] },
      { line: 2, ops: [{ kind: 'write', v: 'p', text: 'Lin' }] },
      { line: 3, ops: [{ kind: 'print', v: 'q' }] },
    ],
    staleLine: 2,
  },
};

/**
 * rustc's E0382 error for the Rust program, written out in rustc's format and trimmed (the help
 * notes are left out). Fixed, lesson-authored text: no compiler runs in the lesson.
 */
export const RUST_ERROR = [
  'error[E0382]: borrow of moved value: `p`',
  ' --> src/main.rs:5:5',
  '  |',
  '2 |     let mut p = String::from("Ada");',
  "  |         ----- move occurs because `p` has type `String`, which does not implement the `Copy` trait",
  '3 |     drop(p);',
  '  |          - value moved here',
  '4 |     let q = String::from("Grace");',
  '5 |     p.push_str("Lin");',
  '  |     ^ value borrowed here after move',
];

export interface HeapBlock {
  addr: number;
  bytes: Uint8Array;
  freed: boolean;
}

export interface UafState {
  /** undefined: not declared yet; null: NULL. */
  vars: Partial<Record<UafVar, number | null>>;
  /** Variables still holding the address of a block that was freed through them. */
  stale: UafVar[];
  blocks: HeapBlock[];
  out: string[];
  crash: string | null;
  /** The bytes the last step wrote: block address and the byte range [from, to). */
  wrote: { addr: number; from: number; to: number } | null;
}

export interface UafStep {
  /** The source line this step ran; null for the state before the first line. */
  line: number | null;
  state: UafState;
  /** The block the step's malloc handed out, and whether it was one freed earlier. */
  reused?: boolean;
}

const cloneState = (s: UafState): UafState => ({
  ...s,
  vars: { ...s.vars },
  stale: [...s.stale],
  blocks: s.blocks.map((b) => ({ ...b, bytes: b.bytes.slice() })),
  out: [...s.out],
  wrote: null,
});

export const blockAt = (s: UafState, addr: number | null | undefined) => (addr == null ? undefined : s.blocks.find((b) => b.addr === addr));

/** The C string a block holds: bytes up to the first NUL. */
export const blockText = (b: HeapBlock) => {
  const end = b.bytes.indexOf(0);
  return new TextDecoder().decode(b.bytes.subarray(0, end < 0 ? b.bytes.length : end));
};

export const NULL_CRASH = 'Segmentation fault (core dumped)';

/**
 * The black-box allocator: it may hand freed memory to the next request. In this model it hands
 * back a freed block if there is one, otherwise new memory.
 */
function allocate(s: UafState): { addr: number; reused: boolean } {
  const freed = s.blocks.find((b) => b.freed);
  if (freed) {
    freed.freed = false;
    return { addr: freed.addr, reused: true };
  }
  const addr = HEAP_START + s.blocks.length * BLOCK_STRIDE;
  s.blocks.push({ addr, bytes: new Uint8Array(BLOCK_BYTES), freed: false });
  return { addr, reused: false };
}

function apply(s: UafState, op: UafOp): { reused?: boolean } {
  switch (op.kind) {
    case 'malloc': {
      const { addr, reused } = allocate(s);
      s.vars[op.v] = addr;
      s.stale = s.stale.filter((v) => v !== op.v);
      return { reused };
    }
    case 'write': {
      const block = blockAt(s, s.vars[op.v]);
      if (!block) {
        s.crash = NULL_CRASH;
        return {};
      }
      const bytes = new TextEncoder().encode(op.text);
      block.bytes.set(bytes, 0);
      block.bytes[bytes.length] = 0;
      s.wrote = { addr: block.addr, from: 0, to: bytes.length + 1 };
      return {};
    }
    case 'free':
      blockAt(s, s.vars[op.v])!.freed = true;
      s.stale.push(op.v);
      return {};
    case 'null':
      s.vars[op.v] = null;
      s.stale = s.stale.filter((v) => v !== op.v);
      return {};
    case 'print':
      s.out.push(blockText(blockAt(s, s.vars[op.v])!));
      return {};
  }
}

/** Run a program to the end, or until it crashes. */
export function runUaf(defence: UafDefence): UafStep[] {
  let state: UafState = { vars: {}, stale: [], blocks: [], out: [], crash: null, wrote: null };
  const steps: UafStep[] = [{ line: null, state }];
  for (const step of UAF_PROGRAMS[defence].steps) {
    state = cloneState(state);
    let reused: boolean | undefined;
    for (const op of step.ops) reused = apply(state, op).reused ?? reused;
    steps.push({ line: step.line, state, reused });
    if (state.crash) break;
  }
  return steps;
}

export const HONESTY_UAF =
  "Simulated memory. The allocator is a black box: it may hand freed memory to the next request, and in this run it does. Addresses are illustrative.";
