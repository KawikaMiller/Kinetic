import { mulberry32, randInt } from '../../core/random';

/**
 * The stack-overflow scene: one simulated frame of `greet(const char *input)` with `char name[8]`.
 * The layout is one possible one, matching gcc -O1 -fno-omit-frame-pointer on x86-64 (lowest
 * address first): without a stack protector, name sits directly under the saved rbp; with
 * -fstack-protector-strong, gcc puts the canary between them. Then the return address and part of
 * main's frame. Nothing here runs native code. The model shows what ends up in memory and stops
 * there; it never models what happens after a corrupted `ret`.
 */

export const NAME_BYTES = 8;
/** The text field refuses longer names (in UTF-8 bytes, which is what a C string holds). */
export const MAX_NAME_BYTES = 64;
/** Bytes per row of the pictures: one 64-bit slot. */
export const ROW_BYTES = 8;
/** Bytes of memory drawn: enough for the longest name plus its NUL in either layout. */
export const FRAME_BYTES = 72;

export type SlotId = 'name' | 'canary' | 'rbp' | 'ret' | 'caller';

/** A slot covers frame offsets [from, to). */
export interface Slot {
  id: SlotId;
  from: number;
  to: number;
}

const WITH_CANARY: readonly Slot[] = [
  { id: 'name', from: 0, to: 8 },
  { id: 'canary', from: 8, to: 16 },
  { id: 'rbp', from: 16, to: 24 },
  { id: 'ret', from: 24, to: 32 },
  { id: 'caller', from: 32, to: FRAME_BYTES },
];

const WITHOUT_CANARY: readonly Slot[] = [
  { id: 'name', from: 0, to: 8 },
  { id: 'rbp', from: 8, to: 16 },
  { id: 'ret', from: 16, to: 24 },
  { id: 'caller', from: 24, to: FRAME_BYTES },
];

/** The frame's slots, lowest address first: the canary exists only in a build with the stack protector. */
export const frameSlots = (canary: boolean): readonly Slot[] => (canary ? WITH_CANARY : WITHOUT_CANARY);

export const slotAt = (slots: readonly Slot[], offset: number): Slot => slots.find((s) => offset >= s.from && offset < s.to)!;
export const findSlot = (slots: readonly Slot[], id: SlotId): Slot | undefined => slots.find((s) => s.id === id);

export type DefenceId = 'memorySafe' | 'boundsCheck' | 'canary' | 'nx' | 'aslr';
export type Defences = Record<DefenceId, boolean>;

/** Defences that stop the run, in the order they act: the first one enabled that applies decides the outcome. */
export type Stopper = 'memorySafe' | 'boundsCheck' | 'canary';
export const STOP_ORDER: readonly Stopper[] = ['memorySafe', 'boundsCheck', 'canary'];
/** Defences that leave an overwrite in place and only make it harder to abuse, in the order the caption names them. */
export type Mitigation = 'nx' | 'aslr';
export const MITIGATIONS: readonly Mitigation[] = ['nx', 'aslr'];

export const NO_DEFENCES: Defences = { memorySafe: false, boundsCheck: false, canary: false, nx: false, aslr: false };

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
/** main's frame pointer, relative to the start of name: inside main's frame, above greet's. */
const MAIN_RBP_OFFSET = 0x50;
/** main's own locals, part of which sits just above greet's frame: six illustrative 64-bit numbers. */
const MAIN_LOCALS = [42, 7, 0, 3, 1000, 1];

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
  const slots = frameSlots(canaryOn);
  const out = new Uint8Array(FRAME_BYTES);
  if (canaryOn) out.set(layout.canary, findSlot(slots, 'canary')!.from);
  out.set(le64(layout.savedRbp), findSlot(slots, 'rbp')!.from);
  out.set(le64(layout.returnTo), findSlot(slots, 'ret')!.from);
  const caller = findSlot(slots, 'caller')!;
  out.set(MAIN_LOCALS.flatMap(le64).slice(0, caller.to - caller.from), caller.from);
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

/** The canary check in greet's epilogue (canary build): it fires exactly when any canary byte differs. */
export const canaryChanged = (before: Uint8Array, after: Uint8Array) => slotBytesDiffer(before, after, findSlot(WITH_CANARY, 'canary')!);

/** The slots past the buffer whose bytes the copy changed. */
export const changedSlots = (slots: readonly Slot[], before: Uint8Array, after: Uint8Array): SlotId[] =>
  slots.filter((s) => s.id !== 'name' && slotBytesDiffer(before, after, s)).map((s) => s.id);

export type OutcomeKind = 'fits' | 'truncated' | 'panic' | 'aborted' | 'quiet' | 'corrupted';

const STOP_KIND: Record<Stopper, OutcomeKind> = { memorySafe: 'panic', boundsCheck: 'truncated', canary: 'aborted' };

export interface StackRun {
  layout: RunLayout;
  defences: Defences;
  /** Whether this build has a canary: the C build with the stack protector on (rustc adds none by default). */
  hasCanary: boolean;
  slots: readonly Slot[];
  input: Uint8Array;
  before: Uint8Array;
  after: Uint8Array;
  written: number;
  /** Bytes past name[7] an unchecked copy of this input would write: max(0, len + 1 - 8). */
  wouldOverflow: number;
  changed: SlotId[];
  kind: OutcomeKind;
  /** The defence that stopped the run, if one did. */
  stoppedBy?: Stopper;
  /** For a corrupted run: the mitigations switched on, which leave the overwrite in place. */
  mitigations: Mitigation[];
}

export function stackRun(input: Uint8Array, defences: Defences, seed: number): StackRun {
  const hasCanary = defences.canary && !defences.memorySafe;
  const slots = frameSlots(hasCanary);
  const layout = runLayout(defences.aslr, seed);
  const before = initialFrame(layout, hasCanary);
  const wouldOverflow = Math.max(0, input.length + 1 - NAME_BYTES);
  const copy = defences.memorySafe ? rustCopy(before, input) : writeString(before, input, { boundsCheck: defences.boundsCheck });
  const after = copy.bytes;
  const changed = changedSlots(slots, before, after);
  const fits = defences.memorySafe ? input.length <= NAME_BYTES : wouldOverflow === 0;
  const applies: Record<Stopper, boolean> = {
    memorySafe: defences.memorySafe && !fits,
    boundsCheck: defences.boundsCheck && !defences.memorySafe && !fits,
    canary: hasCanary && canaryChanged(before, after),
  };
  const stoppedBy = STOP_ORDER.find((id) => applies[id]);
  const kind: OutcomeKind = stoppedBy
    ? STOP_KIND[stoppedBy]
    : fits
      ? 'fits'
      : changed.includes('rbp') || changed.includes('ret')
        ? 'corrupted'
        : 'quiet';
  const mitigations = kind === 'corrupted' ? MITIGATIONS.filter((id) => defences[id]) : [];
  return { layout, defences, hasCanary, slots, input, before, after, written: copy.written, wouldOverflow, changed, kind, stoppedBy, mitigations };
}

/** How many of a slot's bytes hold input characters (not the terminating NUL). */
export const inputBytesIn = (run: StackRun, id: SlotId) => {
  const s = findSlot(run.slots, id);
  if (!s) return 0;
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
  'Simulated memory: nothing runs native code. One possible layout: gcc -O1 -fno-omit-frame-pointer on x86-64, with -fstack-protector-strong when the canary is on. Real layouts vary by compiler and flags, and the addresses are illustrative.';

/**
 * Why it matters. Sources: Matt Miller, Microsoft Security Response Center, "Trends, challenges and
 * strategic shifts in the software vulnerability mitigation landscape", BlueHat IL 2019 (~70% of the
 * CVEs Microsoft assigns each year are memory-safety issues); The Chromium Projects, "Memory safety"
 * (2020: ~70% of high-severity security bugs are memory-safety problems). That share covers every
 * kind of memory-safety bug, not only the two shown here.
 */
export const WHY_IT_MATTERS =
  "Memory-safety bugs (these two are among the most common kinds) are behind about 70% of the CVEs Microsoft fixes each year (Microsoft MSRC, 2019) and of Chromium's high-severity security bugs (2020).";
