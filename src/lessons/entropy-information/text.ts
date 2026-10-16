/** Every number a caption or stat shows comes from the model through these, so tests can pin the sentences. */
import { ASCII_BITS, MAX_BLOCK, blockBitsPerFlip, crossEntropy, excessBits, generatedBits, possibilities } from './model';
import { binaryEntropy, entropy, surprise, type TextEntropy } from '../../core/entropy';

/** A whole number with thousands separators (7,776). */
export const count = (n: number): string => n.toLocaleString('en-US');
export const bits3 = (x: number): string => x.toFixed(3);
export const bits4 = (x: number): string => x.toFixed(4);
export const bits2 = (x: number): string => x.toFixed(2);
/** A bit count that may be unbounded (an impossible outcome, a zero belief). */
export const bitsOrUnbounded = (x: number, dp = 3): string => (Number.isFinite(x) ? x.toFixed(dp) : 'unbounded');

/** A character made visible: a space or line break would otherwise vanish from a table. */
export const showChar = (c: string): string => (c === ' ' ? '␣' : c === '\n' ? '↵' : c === '\t' ? '⇥' : c);

const EPS = 1e-9;

// ── Scene 1 ──────────────────────────────────────────────────────────

export interface CoinReadout {
  p: number;
  heads: number;
  tails: number;
  h: number;
  blockK: number;
  block: number;
}

export function coinReadout(p: number): CoinReadout {
  return { p, heads: surprise(p), tails: surprise(1 - p), h: binaryEntropy(p), blockK: MAX_BLOCK, block: blockBitsPerFlip(p, MAX_BLOCK) };
}

/** "0.10 x 3.32 + 0.90 x 0.15": the entropy as the probability-weighted average of the two surprises, terms with chance 0 dropped. */
export function coinSum(r: CoinReadout): string {
  const terms = [
    [r.p, r.heads],
    [1 - r.p, r.tails],
  ].filter(([chance]) => chance > 0);
  return terms.map(([chance, s]) => `${bits2(chance)} × ${bits2(s)}`).join(' + ');
}

export function coinCaption(p: number): string {
  const r = coinReadout(p);
  const lead =
    p === 0 || p === 1
      ? `At p = ${bits2(p)} the outcome is certain: nothing about a flip is surprising, so the entropy is 0 bits (0 log 0 is taken as 0).`
      : `At p = ${bits2(p)}, heads has a surprise of ${bits2(r.heads)} bits and tails ${bits2(r.tails)}; weighted by how often each happens (${coinSum(r)}) the entropy is ${bits4(r.h)} bits per flip.`;
  const gap = r.block - r.h;
  const tail =
    gap < EPS
      ? `Coding ${r.blockK} flips at a time spends ${bits4(r.block)} bits per flip, exactly the entropy: this coin leaves nothing to squeeze out.`
      : `Coding ${r.blockK} flips at a time spends ${bits4(r.block)} bits per flip, ${bits4(gap)} above the entropy, which no symbol code can get under.`;
  return `${lead} ${tail}`;
}

// ── Scene 2 ──────────────────────────────────────────────────────────

export function textCaption(t: TextEntropy | null): string {
  if (!t) return 'No symbols yet: an empty text has no entropy to report. Type something, or pick one of the examples.';
  const asciiBits = ASCII_BITS * t.n;
  const base = `${t.n} ${t.n === 1 ? 'character' : 'characters'}, ${t.symbols.length} different. Their own frequencies give an order-0 entropy of ${bits3(t.bitsPerChar)} bits per character, ${bits2(t.totalBits)} bits in all, against ${asciiBits} bits at 8 bits per character.`;
  const zero = t.bitsPerChar === 0 ? ' One distinct symbol is never a surprise, so there is nothing to code.' : '';
  const note = ' This treats each character as an independent draw from those frequencies (order 0): a model that sees repeats or words can beat it, which is what dictionary compression does.';
  const ascii = t.nonAscii ? ' This text has characters outside ASCII, which UTF-8 spends more than 8 bits on, so the 8-bit figure is only a baseline.' : '';
  return `${base}${zero}${note}${ascii}`;
}

// ── Scene 3 ──────────────────────────────────────────────────────────

export function generatedCaption(length: number, alphabet: number): string {
  const b = generatedBits(length, alphabet);
  return `${length} ${length === 1 ? 'symbol' : 'symbols'} drawn uniformly from ${count(alphabet)} give ${length} × log2 ${count(alphabet)} = ${bits2(b)} bits: about ${possibilities(b)} equally likely possibilities. That strength comes from how the secret was generated, not from how the string looks.`;
}

export function sampleCaption(t: TextEntropy | null, alphabet: number): string {
  if (!t) return 'Type a string above to see its order-0 total.';
  return `Its order-0 total is ${bits2(t.totalBits)} bits. That describes this one string's letter mix. If its ${t.n} characters had been drawn uniformly from ${count(alphabet)} symbols it would carry ${bits2(generatedBits(t.n, alphabet))} bits, and if a person chose it, a guesser tries common passwords and patterns first.`;
}

// ── Scene 4 ──────────────────────────────────────────────────────────

export function questionsVerdict(expected: number | null, optimal: number): { text: string; tone: 'ok' | 'orange' | 'muted' } {
  if (expected === null) return { text: 'finish splitting every set', tone: 'muted' };
  const gap = expected - optimal;
  if (Math.abs(gap) < EPS) return { text: 'matches the optimal tree', tone: 'ok' };
  return { text: `${bits3(gap)} above the optimal tree`, tone: 'orange' };
}

export function questionsCaption(expected: number | null, open: number, optimal: number, floor: number): string {
  if (expected === null) {
    return `${open} ${open === 1 ? 'set still holds' : 'sets still hold'} more than one item: pick the items that answer yes, then press Split. Any finished tree needs at least ${bits3(floor)} questions on average (the entropy), and the best one needs ${bits3(optimal)}.`;
  }
  const v = questionsVerdict(expected, optimal);
  return `Every set is down to one item. This tree asks ${bits3(expected)} questions on average, ${v.text}; the entropy ${bits3(floor)} is a floor no tree gets under.`;
}

// ── Scene 5 ──────────────────────────────────────────────────────────

export function beliefCaption(p: readonly number[], q: readonly number[]): string {
  const hp = entropy(p);
  const hpq = crossEntropy(p, q);
  if (!Number.isFinite(hpq)) {
    return `The belief gives an outcome that does happen a chance of 0, so a code built for it has no word for that outcome: the cost is unbounded, not a large number.`;
  }
  const extra = excessBits(p, q);
  if (extra < EPS) return `The belief equals the truth, so the cross-entropy ${bits3(hpq)} equals the entropy ${bits3(hp)}: no extra bits. Any other belief costs strictly more.`;
  return `Coding for this belief costs ${bits3(hpq)} bits per outcome against the entropy ${bits3(hp)}: ${bits3(extra)} extra bits for being wrong (the KL divergence).`;
}
