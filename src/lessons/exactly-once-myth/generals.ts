/**
 * exactly-once-myth, scene 1: the Two Generals toy.
 *
 * Armies A and B agree to attack at dawn by sending messengers across a valley where each is captured with probability p. A protocol of
 * depth k is a chain of k messages: m1 goes from A to B, m2 is B's reply, m3 is A's reply to that, and so on; a general sends the next
 * message only after receiving the one before. The TOY RULE: a general attacks if it received every message the full protocol
 * addresses to it, or if it sent the last message of the protocol (m_k).
 *
 * This illustrates the impossibility argument (no finite protocol over a lossy link makes agreement certain); it is not the proof.
 * The proof removes the last message: it can be lost, so the protocol must work without it, so it was unnecessary; repeat.
 */
import { mulberry32 } from '../../core/random';

export const DEPTH = { min: 1, max: 8 } as const;
export const LOSS_MAX = 0.95;
export const DEFAULT_DEPTH = 4;
export const DEFAULT_LOSS = 0.3;
/** The default seed: a run that ends in the generals disagreeing (only the last message captured), so the first picture shows the point. */
export const GENERALS_SEED = 18;
export type General = 'A' | 'B';
export type Outcome = 'both' | 'disagree' | 'nobody';

/** Who sends message i (1-based) of the chain: A sends the odd ones. */
export const senderOf = (i: number): General => (i % 2 === 1 ? 'A' : 'B');
export const receiverOf = (i: number): General => (senderOf(i) === 'A' ? 'B' : 'A');

export interface Messengers {
  /** Message i (index i-1) was sent: every earlier message arrived. */
  sent: boolean[];
  /** Message i arrived. */
  delivered: boolean[];
}

/** From which of the k messages were delivered if sent (a delivery pattern), what actually happened: a message is sent only after its predecessor arrived. */
export function messengersFor(pattern: readonly boolean[]): Messengers {
  const sent: boolean[] = [];
  const delivered: boolean[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const wasSent = i === 0 || delivered[i - 1];
    sent.push(wasSent);
    delivered.push(wasSent && pattern[i]);
  }
  return { sent, delivered };
}

/** Does general `g` attack, by the toy rule, given what happened? */
export function attacks(g: General, m: Messengers): boolean {
  const k = m.sent.length;
  const addressed = Array.from({ length: k }, (_, i) => i + 1).filter((i) => receiverOf(i) === g);
  const receivedAll = addressed.every((i) => m.delivered[i - 1]);
  const sentLast = senderOf(k) === g && m.sent[k - 1];
  return receivedAll || sentLast;
}

export function outcomeOf(pattern: readonly boolean[]): Outcome {
  const m = messengersFor(pattern);
  const [a, b] = [attacks('A', m), attacks('B', m)];
  return a && b ? 'both' : a || b ? 'disagree' : 'nobody';
}

export interface Enumeration {
  patterns: number;
  /** Probabilities, summing the weight p^(lost) (1-p)^(delivered) of every pattern with that outcome. */
  both: number;
  disagree: number;
  nobody: number;
  /** How many of the 2^k patterns make the generals disagree, and which. */
  disagreeing: boolean[][];
}

const patternOf = (mask: number, k: number): boolean[] => Array.from({ length: k }, (_, i) => (mask & (1 << i)) !== 0);

/** Walk all 2^k delivery patterns. */
export function enumerate(k: number, p: number): Enumeration {
  const out: Enumeration = { patterns: 1 << k, both: 0, disagree: 0, nobody: 0, disagreeing: [] };
  for (let mask = 0; mask < 1 << k; mask++) {
    const pattern = patternOf(mask, k);
    const weight = pattern.reduce((w, d) => w * (d ? 1 - p : p), 1);
    const outcome = outcomeOf(pattern);
    out[outcome] += weight;
    if (outcome === 'disagree') out.disagreeing.push(pattern);
  }
  return out;
}

/** The closed forms: P(disagree) = p (1 - p)^(k-1), P(both attack) = (1 - p)^k, and the rest is nobody. */
export const pDisagree = (k: number, p: number): number => p * (1 - p) ** (k - 1);
export const pBoth = (k: number, p: number): number => (1 - p) ** k;
export const pNobody = (k: number, p: number): number => Math.max(0, 1 - pBoth(k, p) - pDisagree(k, p));

/** One seeded run: each message that is sent is captured with probability p. */
export function simulateRun(k: number, p: number, rnd: () => number): { pattern: boolean[]; outcome: Outcome; messengers: Messengers } {
  const pattern = Array.from({ length: k }, () => rnd() >= p);
  return { pattern, outcome: outcomeOf(pattern), messengers: messengersFor(pattern) };
}

export function runSeeded(k: number, p: number, seed: number) {
  return simulateRun(k, p, mulberry32(seed));
}

/** Monte Carlo shares of each outcome over `n` seeded runs. */
export function monteCarlo(k: number, p: number, n: number, seed: number): Record<Outcome, number> {
  const rnd = mulberry32(seed);
  const counts: Record<Outcome, number> = { both: 0, disagree: 0, nobody: 0 };
  for (let i = 0; i < n; i++) counts[simulateRun(k, p, rnd).outcome]++;
  return { both: counts.both / n, disagree: counts.disagree / n, nobody: counts.nobody / n };
}

/** How many of the 2^k delivery patterns end each way. */
export function patternCounts(k: number): Record<Outcome, number> {
  const counts: Record<Outcome, number> = { both: 0, disagree: 0, nobody: 0 };
  for (let mask = 0; mask < 1 << k; mask++) counts[outcomeOf(patternOf(mask, k))]++;
  return counts;
}
