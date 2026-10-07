import { mulberry32, randInt } from '../../core/random';

/**
 * The stack-overflow scene: one simulated frame of `greet(const char *input)` with `char name[8]`,
 * laid out the way gcc on x86-64 typically does it (lowest address first): the buffer, the stack
 * canary just above it, the saved rbp, the return address, then part of main's frame. Nothing here
 * runs native code. The model shows what ends up in memory and stops there; it never models what
 * happens after a corrupted `ret`.
 */

export const NAME_BYTES = 8;
/** The text field refuses longer names (in UTF-8 bytes, which is what a C string holds). */
export const MAX_NAME_BYTES = 64;
/** Bytes per row of the pictures: one 64-bit slot. */
export const ROW_BYTES = 8;

export type SlotId = 'name' | 'canary' | 'rbp' | 'ret' | 'caller';

/** A slot covers frame offsets [from, to). */
export interface Slot {
  id: SlotId;
  from: number;
  to: number;
}

export const SLOTS: readonly Slot[] = [
  { id: 'name', from: 0, to: 8 },
  { id: 'canary', from: 8, to: 16 },
  { id: 'rbp', from: 16, to: 24 },
  { id: 'ret', from: 24, to: 32 },
  { id: 'caller', from: 32, to: 72 },
];

export const FRAME_BYTES = SLOTS.at(-1)!.to;

export const slotOf = (offset: number): Slot => SLOTS.find((s) => offset >= s.from && offset < s.to)!;
export const slotById = (id: SlotId): Slot => SLOTS.find((s) => s.id === id)!;

export type DefenceId = 'memorySafe' | 'boundsCheck' | 'canary' | 'nx' | 'aslr';
export type Defences = Record<DefenceId, boolean>;

/**
 * The order defences act in, so the outcome always names the first one that applies: a memory-safe
 * language never gets as far as an unchecked copy, a bounds-checked copy never overflows, a canary
 * stops the run before `ret`, and NX and ASLR only make an overwrite that did happen harder to use.
 */
export const DEFENCE_ORDER: readonly DefenceId[] = ['memorySafe', 'boundsCheck', 'canary', 'nx', 'aslr'];

export const NO_DEFENCES: Defences = { memorySafe: false, boundsCheck: false, canary: false, nx: false, aslr: false };

export const firstEnabled = (d: Defences): DefenceId | undefined => DEFENCE_ORDER.find((id) => d[id]);

/** Benign sample names: they break the unchecked copy by being long, nothing more. */
export const PRESETS = [
  { id: 'short', label: 'Ada', text: 'Ada' },
  { id: 'grace', label: 'Grace Hopper', text: 'Grace Hopper' },
  { id: 'long', label: '40-character name', text: 'Maria Alejandra de la Cruz Villanueva Li' },
] as const;
export const DEFAULT_PRESET = PRESETS[2];

// Addresses. With ASLR off they're the same every run (the values gdb shows with randomisation
// disabled); with it on, the stack and the program's code land somewhere new each run. Illustrative.
const FIXED_FRAME = 0x7fffffffe0c0;
const FIXED_CODE_BASE = 0x555555554000;
const STACK_LO = 0x7ff000000000;
/** Random 16-byte-aligned frame positions in a 64 GiB window below the top of user space. */
const STACK_POSITIONS = 2 ** 32;
const CODE_LO = 0x550000000000;
const PAGE = 4096;
const CODE_PAGES = 2 ** 28;
/** Where in the program main's call to greet returns to (an offset from the code's start). */
const CALL_SITE = 0x1189;
/** main's frame pointer, relative to the start of name: just past the part of main's frame drawn. */
const MAIN_RBP_OFFSET = 0x50;
/** In this build, without a canary the slot above name is 8 leftover bytes of padding. */
const LEFTOVER_PADDING = [0x10, 0, 0, 0, 0, 0, 0, 0];
/** main's own locals, part of which sits just above greet's frame: five illustrative 64-bit numbers. */
const MAIN_LOCALS = [42, 7, 0, 3, 1000];

export interface RunLayout {
  /** Address of name[0]. */
  frameAddr: number;
  /** The return address greet's `ret` will use: back into main. */
  returnTo: number;
  savedRbp: number;
  /** This run's canary: random, with its lowest byte zero as glibc does on x86-64. */
  canary: number[];
}

/** Little-endian bytes of a 64-bit value. */
export function le64(v: number): number[] {
  const big = BigInt(v);
  return Array.from({ length: 8 }, (_, i) => Number((big >> BigInt(8 * i)) & 0xffn));
}

/** Everything that differs between runs: the canary always, the addresses only with ASLR. */
export function runLayout(aslr: boolean, seed: number): RunLayout {
  const rnd = mulberry32(seed);
  const canary = [0, ...Array.from({ length: 7 }, () => randInt(0, 255, rnd))];
  const frameAddr = aslr ? STACK_LO + randInt(0, STACK_POSITIONS - 1, rnd) * 16 : FIXED_FRAME;
  const codeBase = aslr ? CODE_LO + randInt(0, CODE_PAGES - 1, rnd) * PAGE : FIXED_CODE_BASE;
  return { frameAddr, returnTo: codeBase + CALL_SITE, savedRbp: frameAddr + MAIN_RBP_OFFSET, canary };
}

/** The frame's bytes before the copy. name starts zeroed here (real stack memory holds leftovers). */
export function initialFrame(layout: RunLayout, canaryOn: boolean): Uint8Array {
  const out = new Uint8Array(FRAME_BYTES);
  out.set(canaryOn ? layout.canary : LEFTOVER_PADDING, slotById('canary').from);
  out.set(le64(layout.savedRbp), slotById('rbp').from);
  out.set(le64(layout.returnTo), slotById('ret').from);
  out.set(MAIN_LOCALS.flatMap(le64), slotById('caller').from);
  return out;
}

export interface CopyResult {
  bytes: Uint8Array;
  /** Bytes written, the terminating NUL included. */
  written: number;
  /** Bytes written past name[7]. */
  overflow: number;
}

/**
 * Copy a C string into name, the NUL included. Unchecked, that's `strcpy`: every byte lands, however
 * many there are. Bounds-checked, it's `snprintf(name, sizeof name, "%s", input)`: at most 7
 * characters and the NUL, so the write never leaves the buffer.
 */
export function writeString(frame: Uint8Array, input: Uint8Array, { boundsCheck }: { boundsCheck: boolean }): CopyResult {
  const n = boundsCheck ? Math.min(input.length, NAME_BYTES - 1) : input.length;
  if (n + 1 > frame.length) throw new RangeError(`a ${n + 1}-byte write doesn't fit the ${frame.length}-byte picture`);
  const bytes = frame.slice();
  bytes.set(input.subarray(0, n), 0);
  bytes[n] = 0;
  return { bytes, written: n + 1, overflow: Math.max(0, n + 1 - NAME_BYTES) };
}

/**
 * The Rust version: `name[i] = b` for each byte, into `[0u8; 8]`. Every index is checked, so the
 * write at index 8 panics instead of landing. Rust strings carry their length, so there's no NUL.
 */
export function rustCopy(frame: Uint8Array, input: Uint8Array): { bytes: Uint8Array; written: number; panicAt: number | null } {
  const n = Math.min(input.length, NAME_BYTES);
  const bytes = frame.slice();
  bytes.set(input.subarray(0, n), 0);
  return { bytes, written: n, panicAt: input.length > NAME_BYTES ? NAME_BYTES : null };
}

const slotBytesDiffer = (a: Uint8Array, b: Uint8Array, s: Slot) => a.subarray(s.from, s.to).some((x, i) => x !== b[s.from + i]);

/** The canary check in greet's epilogue: it fires exactly when any canary byte differs. */
export const canaryChanged = (before: Uint8Array, after: Uint8Array) => slotBytesDiffer(before, after, slotById('canary'));

/** The slots past the buffer whose bytes the copy changed. */
export const changedSlots = (before: Uint8Array, after: Uint8Array): SlotId[] =>
  SLOTS.filter((s) => s.id !== 'name' && slotBytesDiffer(before, after, s)).map((s) => s.id);

export type OutcomeKind = 'fits' | 'truncated' | 'panic' | 'aborted' | 'quiet' | 'corrupted';

export interface StackRun {
  layout: RunLayout;
  defences: Defences;
  input: Uint8Array;
  before: Uint8Array;
  after: Uint8Array;
  written: number;
  /** Bytes past name[7] an unchecked copy of this input would write: max(0, len + 1 - 8). */
  wouldOverflow: number;
  changed: SlotId[];
  kind: OutcomeKind;
  /** The defence that decided the outcome, if one did. */
  by?: DefenceId;
}

export function stackRun(input: Uint8Array, defences: Defences, seed: number): StackRun {
  const layout = runLayout(defences.aslr, seed);
  const before = initialFrame(layout, defences.canary);
  const wouldOverflow = Math.max(0, input.length + 1 - NAME_BYTES);
  const base = { layout, defences, input, before, wouldOverflow };

  if (defences.memorySafe) {
    const r = rustCopy(before, input);
    const panicked = r.panicAt !== null;
    return { ...base, after: r.bytes, written: r.written, changed: changedSlots(before, r.bytes), kind: panicked ? 'panic' : 'fits', by: panicked ? 'memorySafe' : undefined };
  }
  const r = writeString(before, input, { boundsCheck: defences.boundsCheck });
  const changed = changedSlots(before, r.bytes);
  const done = { ...base, after: r.bytes, written: r.written, changed };
  if (wouldOverflow === 0) return { ...done, kind: 'fits' };
  if (defences.boundsCheck) return { ...done, kind: 'truncated', by: 'boundsCheck' };
  if (defences.canary && canaryChanged(before, r.bytes)) return { ...done, kind: 'aborted', by: 'canary' };
  if (changed.includes('rbp') || changed.includes('ret')) {
    return { ...done, kind: 'corrupted', by: defences.nx ? 'nx' : defences.aslr ? 'aslr' : undefined };
  }
  return { ...done, kind: 'quiet' };
}

/** How many of a slot's bytes hold input characters (not the terminating NUL). */
export const inputBytesIn = (run: StackRun, id: SlotId) => {
  const s = slotById(id);
  return Math.max(0, Math.min(s.to, run.defences.boundsCheck ? NAME_BYTES - 1 : run.input.length) - s.from);
};

export type ParsedName = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

/** The learner's name, as the bytes a C string would hold, or why it's refused. */
export function parseName(text: string): ParsedName {
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(text)) return { ok: false, error: "Tabs, newlines and other control characters aren't modelled here: type a plain name." };
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_NAME_BYTES) {
    return { ok: false, error: `That's ${bytes.length} bytes: this demo takes names up to ${MAX_NAME_BYTES} bytes (64 plain letters; an accented letter or emoji takes 2-4 bytes in UTF-8).` };
  }
  return { ok: true, bytes };
}

/** Show bytes as text the way a hex dump does: printable ASCII, a dot for anything else. */
export const asText = (bytes: ArrayLike<number>) =>
  Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');

export const hexAddr = (a: number) => `0x${a.toString(16)}`;

export const HONESTY_STACK =
  'Simulated memory: nothing runs native code. One frame drawn as gcc typically lays it out on x86-64; real frame layouts vary by compiler and flags, and the addresses are illustrative.';

/**
 * Why it matters. Sources: Matt Miller, Microsoft Security Response Center, "Trends, challenges and
 * strategic shifts in the software vulnerability mitigation landscape", BlueHat IL 2019 (~70% of the
 * vulnerabilities Microsoft fixes each year are memory-safety issues); The Chromium Projects,
 * "Memory safety" (2020: ~70% of high-severity security bugs are memory-safety problems).
 */
export const WHY_IT_MATTERS =
  'About 70% of the vulnerabilities Microsoft fixes each year are memory-safety bugs (Microsoft MSRC, 2019), and Chromium reports the same share of its high-severity security bugs (2020).';
