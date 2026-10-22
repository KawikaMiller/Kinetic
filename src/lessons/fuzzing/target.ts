/**
 * The lesson's toy target: an INVENTED record format (magic bytes K N T C, a length byte, that many payload
 * bytes, a checksum byte) read by a lesson-authored parser with one deliberate bug: it trusts the length byte.
 * A native parser would read past its buffer (a memory-safety bug); here the instrumented reader throws when it
 * is asked for a byte that is not there, which stands for "a crash".
 *
 * `runTarget` is the whole target: pure, bounded by the input length (at most MAX_INPUT_BYTES) and by the length
 * byte (at most 255 payload reads), so no input can hang the page. It records every branch it visits.
 */

/** The branches of the target, labelled b1..b11 in the source panel and in the graph. */
export const BRANCH = {
  magic0: 1,
  magic1: 2,
  magic2: 3,
  /** The magic bytes were accepted. */
  magicOk: 4,
  lengthRead: 5,
  payloadByte: 6,
  payloadDone: 7,
  checksumRead: 8,
  checksumOk: 9,
  checksumBad: 10,
  reject: 11,
} as const;

export type BranchId = (typeof BRANCH)[keyof typeof BRANCH];
export const ENTRY = 0;
export const BRANCH_COUNT = 11;

/** The four magic bytes: the ASCII codes of K, N, T, C. */
export const MAGIC: readonly number[] = [0x4b, 0x4e, 0x54, 0x43];
export const MAGIC_LENGTH = MAGIC.length;
/** Offset of the length byte, and of the first payload byte. */
export const LENGTH_AT = MAGIC_LENGTH;
export const PAYLOAD_AT = MAGIC_LENGTH + 1;

/** Longest input anything in the lesson feeds the target (the typed hex field refuses more). */
export const MAX_INPUT_BYTES = 64;

export interface TargetOptions {
  /** `bytewise`: each magic byte is its own branch, so progress through the magic shows up as new coverage. `single`: one comparison of all four bytes. */
  magic: 'bytewise' | 'single';
  /** The reader's bounds check (what a sanitizer adds): on, an over-read throws; off, it quietly returns 0 and carries on. */
  boundsCheck: boolean;
}

export const DEFAULT_TARGET: TargetOptions = { magic: 'bytewise', boundsCheck: true };

export type RejectReason = 'magic' | 'short' | 'checksum';

export type Outcome = { kind: 'accepted' } | { kind: 'rejected'; reason: RejectReason } | { kind: 'crash'; site: BranchId };

export interface TargetRun {
  outcome: Outcome;
  /** Every branch visited, in order, starting from ENTRY. */
  path: number[];
  /** Reads that went past the end of the input (thrown when the bounds check is on, silent when off). */
  overReads: number;
}

class OverRead extends RangeError {}

/** The checksum of a payload: the sum of its bytes modulo 256. */
export const checksumOf = (payload: readonly number[]): number => payload.reduce((sum, b) => (sum + b) & 0xff, 0);

/** An edge is an ordered pair of consecutive branches; this packs it into one number for a Set. */
export const edgeId = (from: number, to: number): number => from * (BRANCH_COUNT + 1) + to;
export const edgeFrom = (id: number): number => Math.floor(id / (BRANCH_COUNT + 1));
export const edgeTo = (id: number): number => id % (BRANCH_COUNT + 1);

export function runTarget(bytes: readonly number[], options: TargetOptions = DEFAULT_TARGET): TargetRun {
  const path: number[] = [ENTRY];
  let overReads = 0;
  const visit = (b: BranchId) => path.push(b);
  /** The instrumented reader: the one place an over-read is noticed. */
  const read = (i: number): number => {
    if (i < bytes.length) return bytes[i];
    overReads++;
    if (options.boundsCheck) throw new OverRead(`read at ${i}, input has ${bytes.length} bytes`);
    return 0;
  };
  const finish = (outcome: Outcome): TargetRun => ({ outcome, path, overReads });
  const reject = (reason: RejectReason) => {
    visit(BRANCH.reject);
    return finish({ kind: 'rejected', reason });
  };

  if (options.magic === 'single') {
    if (bytes.length < MAGIC_LENGTH || MAGIC.some((m, i) => bytes[i] !== m)) return reject('magic');
    visit(BRANCH.magicOk);
  } else {
    const steps = [BRANCH.magic0, BRANCH.magic1, BRANCH.magic2, BRANCH.magicOk] as const;
    for (let i = 0; i < MAGIC_LENGTH; i++) {
      if (bytes[i] !== MAGIC[i]) return reject('magic');
      visit(steps[i]);
    }
  }
  if (bytes.length <= LENGTH_AT) return reject('short');
  visit(BRANCH.lengthRead);
  const length = bytes[LENGTH_AT];

  const payload: number[] = [];
  let site: BranchId = BRANCH.payloadByte;
  try {
    for (let i = 0; i < length; i++) {
      site = BRANCH.payloadByte;
      const b = read(PAYLOAD_AT + i);
      visit(BRANCH.payloadByte);
      payload.push(b);
    }
    visit(BRANCH.payloadDone);
    site = BRANCH.checksumRead;
    const stored = read(PAYLOAD_AT + length);
    visit(BRANCH.checksumRead);
    if (stored === checksumOf(payload)) {
      visit(BRANCH.checksumOk);
      return finish({ kind: 'accepted' });
    }
    visit(BRANCH.checksumBad);
    return finish({ kind: 'rejected', reason: 'checksum' });
  } catch (e) {
    if (!(e instanceof OverRead)) throw e;
    return finish({ kind: 'crash', site });
  }
}

/** The edges one run covered. */
export function edgesOf(path: readonly number[]): number[] {
  return path.slice(1).map((to, i) => edgeId(path[i], to));
}

/** The branch edges that can exist in a given mode (the control-flow graph the lesson draws). Hand-listed; the tests check every observed edge is here and every one here is reachable. */
export function cfgEdges(magic: TargetOptions['magic']): [number, number][] {
  const b = BRANCH;
  const toMagicOk: [number, number][] =
    magic === 'bytewise'
      ? [[ENTRY, b.magic0], [b.magic0, b.magic1], [b.magic1, b.magic2], [b.magic2, b.magicOk], [ENTRY, b.reject], [b.magic0, b.reject], [b.magic1, b.reject], [b.magic2, b.reject]]
      : [[ENTRY, b.magicOk], [ENTRY, b.reject]];
  return [
    ...toMagicOk,
    [b.magicOk, b.lengthRead], [b.magicOk, b.reject],
    [b.lengthRead, b.payloadByte], [b.payloadByte, b.payloadByte], [b.lengthRead, b.payloadDone], [b.payloadByte, b.payloadDone],
    [b.payloadDone, b.checksumRead],
    [b.checksumRead, b.checksumOk], [b.checksumRead, b.checksumBad],
  ];
}
