/**
 * Merkle trees over real SHA-256 (core/sha256.ts), in the domain-separated form of the Certificate
 * Transparency tree: a leaf is `H(0x00 || data)`, an inner node is `H(0x01 || left || right)`,
 * and the empty tree is `H("")`. Two ways to treat a leaf count that is not a power of two:
 * `rfc` splits at the largest power of two below n, `duplicate` pairs a lone last node with a copy
 * of itself, level by level. `toy8` keeps only the first byte of every hash: a toy, to show
 * why width matters.
 */
import { hexToBytes, toHex } from '../../core/crypto';
import { sha256 } from '../../core/sha256';

export type HashKind = 'sha256' | 'toy8';
export type OddRule = 'rfc' | 'duplicate';

export const LEAF_PREFIX = 0x00;
export const NODE_PREFIX = 0x01;
export const TOY_BYTES = 1;
export const HASH_BYTES = 32;
export const MAX_LEAF_BYTES = 64;

const encoder = new TextEncoder();
export const utf8 = (text: string) => encoder.encode(text);

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** The hash of `bytes` at the given width, as lowercase hex. */
export function digest(kind: HashKind, bytes: Uint8Array): string {
  const full = sha256(bytes);
  return toHex(kind === 'toy8' ? full.slice(0, TOY_BYTES) : full);
}

export const leafHashOfBytes = (kind: HashKind, data: Uint8Array) => digest(kind, concat(Uint8Array.of(LEAF_PREFIX), data));
export const leafHash = (kind: HashKind, text: string) => leafHashOfBytes(kind, utf8(text));
export const nodeHash = (kind: HashKind, left: string, right: string) =>
  digest(kind, concat(Uint8Array.of(NODE_PREFIX), hexToBytes(left), hexToBytes(right)));
export const emptyHash = (kind: HashKind) => digest(kind, new Uint8Array(0));

/** A node of a drawn tree. `id` is its path from the root (`r`, `rL`, `rRL`...), the same in two trees of one shape. */
export interface MNode {
  id: string;
  hash: string;
  /** The leaves it covers, [lo, hi). */
  lo: number;
  hi: number;
  left: MNode | null;
  right: MNode | null;
  /** A copy added by the duplicate-last rule, not a leaf of its own. */
  copy: boolean;
}

const largestPowerOfTwoBelow = (n: number) => {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
};

function inner(kind: HashKind, left: MNode, right: MNode, copy = false): MNode {
  return { id: '', hash: nodeHash(kind, left.hash, right.hash), lo: left.lo, hi: right.hi, left, right, copy };
}

function rfcTree(kind: HashKind, hashes: readonly string[], lo: number, hi: number): MNode {
  if (hi - lo === 1) return { id: '', hash: hashes[lo], lo, hi, left: null, right: null, copy: false };
  const k = largestPowerOfTwoBelow(hi - lo);
  return inner(kind, rfcTree(kind, hashes, lo, lo + k), rfcTree(kind, hashes, lo + k, hi));
}

const cloneAsCopy = (n: MNode): MNode => ({ ...n, copy: true, left: n.left && cloneAsCopy(n.left), right: n.right && cloneAsCopy(n.right) });

function duplicateTree(kind: HashKind, hashes: readonly string[]): MNode {
  let level: MNode[] = hashes.map((hash, i) => ({ id: '', hash, lo: i, hi: i + 1, left: null, right: null, copy: false }));
  while (level.length > 1) {
    const next: MNode[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const right = level[i + 1] ?? cloneAsCopy(level[i]);
      next.push(inner(kind, level[i], right));
    }
    level = next;
  }
  return level[0];
}

function assignIds(n: MNode, id: string): MNode {
  return { ...n, id, left: n.left && assignIds(n.left, `${id}L`), right: n.right && assignIds(n.right, `${id}R`) };
}

/** The tree over `leaves`, or null for no leaves (its root is `emptyHash`). */
export function buildTree(kind: HashKind, leaves: readonly string[], rule: OddRule = 'rfc'): MNode | null {
  if (leaves.length === 0) return null;
  const hashes = leaves.map((t) => leafHash(kind, t));
  return assignIds(rule === 'rfc' ? rfcTree(kind, hashes, 0, hashes.length) : duplicateTree(kind, hashes), 'r');
}

export const rootHash = (kind: HashKind, leaves: readonly string[], rule: OddRule = 'rfc') => buildTree(kind, leaves, rule)?.hash ?? emptyHash(kind);

/** Every node, parents before children, left before right. */
export function flatten(root: MNode | null): MNode[] {
  if (!root) return [];
  return [root, ...flatten(root.left), ...flatten(root.right)];
}

export const isLeaf = (n: MNode) => n.left === null;

/** Ancestors of a node id, root first, including itself: `rLR` gives `r`, `rL`, `rLR`. */
export const pathIds = (id: string): string[] => Array.from({ length: id.length }, (_, i) => id.slice(0, i + 1));

// ── Inclusion proofs (the CT audit path) ─────────────────────────────

export interface ProofStep {
  hash: string;
  /** Which side of the running hash the sibling sits on. */
  side: 'left' | 'right';
}

/** The sibling hashes from the leaf up to the root, for the `rfc` tree over `leaves`. */
export function auditPath(kind: HashKind, leaves: readonly string[], index: number): ProofStep[] {
  const hashes = leaves.map((t) => leafHash(kind, t));
  const mth = (lo: number, hi: number): string => {
    if (hi - lo === 1) return hashes[lo];
    const k = largestPowerOfTwoBelow(hi - lo);
    return nodeHash(kind, mth(lo, lo + k), mth(lo + k, hi));
  };
  const path = (m: number, lo: number, hi: number): ProofStep[] => {
    if (hi - lo === 1) return [];
    const k = largestPowerOfTwoBelow(hi - lo);
    return m < lo + k ? [...path(m, lo, lo + k), { hash: mth(lo + k, hi), side: 'right' }] : [...path(m, lo + k, hi), { hash: mth(lo, lo + k), side: 'left' }];
  };
  return path(index, 0, hashes.length);
}

/** How many hashes the audit path of leaf `index` in an n-leaf tree holds, counted from the shape alone. */
export function auditPathLength(n: number, index: number): number {
  let length = 0;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const k = largestPowerOfTwoBelow(hi - lo);
    if (index < lo + k) hi = lo + k;
    else lo += k;
    length++;
  }
  return length;
}

export interface VerifyStep {
  /** The sibling hash taken from the proof. */
  sibling: string;
  side: 'left' | 'right';
  /** The running hash after combining. */
  hash: string;
}

export interface Verification {
  ok: boolean;
  reason: string;
  /** The hash of the leaf bytes, and the running hash after each proof hash. */
  leaf: string;
  steps: VerifyStep[];
  computedRoot: string | null;
}

/**
 * Recompute the root from a leaf, its claimed index, the tree size and the sibling hashes, deciding the
 * side of each sibling from the index and size alone (the verifier never trusts a `side` the prover sends),
 * and compare with the trusted root. This is the verification loop of the CT inclusion proof.
 */
export function verifyInclusion(kind: HashKind, leaf: Uint8Array, index: number, size: number, proof: readonly string[], trusted: string): Verification {
  const leafH = leafHashOfBytes(kind, leaf);
  const fail = (reason: string, steps: VerifyStep[] = [], computedRoot: string | null = null): Verification => ({ ok: false, reason, leaf: leafH, steps, computedRoot });
  if (!Number.isInteger(index) || index < 0 || index >= size) return fail(`index ${index} is outside a tree of ${size} leaves`);
  let fn = index;
  let sn = size - 1;
  let r = leafH;
  const steps: VerifyStep[] = [];
  for (const p of proof) {
    if (sn === 0) return fail('the proof has more hashes than the tree is deep', steps, r);
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(kind, p, r);
      steps.push({ sibling: p, side: 'left', hash: r });
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      r = nodeHash(kind, r, p);
      steps.push({ sibling: p, side: 'right', hash: r });
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  if (sn !== 0) return fail('the proof has fewer hashes than the tree is deep', steps, r);
  return r === trusted ? { ok: true, reason: 'the recomputed root equals the trusted root', leaf: leafH, steps, computedRoot: r } : fail('the recomputed root is not the trusted root', steps, r);
}

// ── Leaf text rules ──────────────────────────────────────────────────

const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export type LeafCheck = { ok: true } | { ok: false; error: string };

/** A leaf block is text: at most 64 UTF-8 bytes, no control characters and no unpaired surrogates. */
export function checkLeafText(text: string): LeafCheck {
  if (UNPAIRED_SURROGATE.test(text)) return { ok: false, error: 'That is not valid text (an unpaired surrogate), so it was refused.' };
  if (/\p{Cc}/u.test(text)) return { ok: false, error: 'Control characters are not text, so they were refused.' };
  const n = utf8(text).length;
  if (n > MAX_LEAF_BYTES) return { ok: false, error: `A leaf block holds at most ${MAX_LEAF_BYTES} bytes; that is ${n}.` };
  return { ok: true };
}

/** The 4-hex-character display form of a hash (display only: the full hash is what is compared). */
export const shortHash = (hex: string) => hex.slice(0, 4);
