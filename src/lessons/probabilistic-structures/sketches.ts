// A Bloom filter and HyperLogLog, small enough to watch.
import { fmix32, fnv1a } from '../../core/hash';
import { mulberry32, pick, type Rnd } from '../../core/random';

/** The seed the stage opens with. */
export const DEFAULT_SEED = 7;
/** Added to the seed per draw, so draw n uses its own stream and the nth press is the same on every run. */
const DRAW_STRIDE = 0x9e3779b1;
/** The random source of the `n`-th draw under `seed`. */
export const drawRnd = (seed: number, n: number): Rnd => mulberry32(seed + n * DRAW_STRIDE);

// ── Bloom filter ────────────────────────────────────────────────────

/** k bit positions via double hashing: h1 + i·h2 (mod m). */
export function bloomPositions(word: string, k: number, m: number) {
  const h1 = fmix32(fnv1a(word));
  const h2 = fmix32(fnv1a(`${word}\u0001`)) | 1;
  return Array.from({ length: k }, (_, i) => (h1 + Math.imul(i, h2)) >>> 0).map((h) => h % m);
}

export function buildBloom(words: string[], k: number, m: number) {
  const bits = new Uint8Array(m);
  for (const w of words) for (const p of bloomPositions(w, k, m)) bits[p] = 1;
  return bits;
}

export const bloomHas = (bits: Uint8Array, word: string, k: number) =>
  bloomPositions(word, k, bits.length).every((p) => bits[p] === 1);

/** Theoretical false-positive rate: (1 - e^(-kn/m))^k */
export const bloomFpTheory = (n: number, k: number, m: number) => (n === 0 ? 0 : Math.pow(1 - Math.exp((-k * n) / m), k));

/** The k that minimises the false-positive rate for n items in m bits, rounded: (m/n)·ln 2, at least 1. */
export const optimalK = (n: number, m: number) => Math.max(1, Math.round((m / n) * Math.LN2));

const PROBES = Array.from({ length: 1000 }, (_, i) => `probe-${i}-x`);
export function bloomFpMeasured(bits: Uint8Array, k: number) {
  return PROBES.filter((w) => bloomHas(bits, w, k)).length / PROBES.length;
}

export const WORDS = [
  'apple', 'banana', 'cherry', 'dragon', 'eagle', 'falcon', 'grape', 'harbor', 'igloo', 'jungle', 'koala', 'lemon',
  'mango', 'nectar', 'ocean', 'panda', 'quartz', 'raven', 'salmon', 'tiger', 'umbra', 'violet', 'walrus', 'xenon',
  'yak', 'zebra', 'amber', 'basil', 'cedar', 'delta', 'ember', 'fjord', 'glacier', 'hazel', 'iris', 'juniper',
];

/** The first word not yet inserted, in list order (the "Insert next word" button). */
export const nextWord = (words: readonly string[]) => WORDS.find((w) => !words.includes(w)) ?? `word${words.length}`;

/** A word never inserted, drawn from `rnd` (the "Query an unseen word" button). */
export const unseenWord = (words: readonly string[], rnd: Rnd) => {
  const pool = WORDS.filter((w) => !words.includes(w));
  return pool.length ? pick(pool, rnd) : `word${words.length}`;
};

// ── HyperLogLog ─────────────────────────────────────────────────────

export const itemHash = (id: number) => fmix32(Math.imul(id + 1, 0x9e3779b1));

/** Register index from the top p bits; rank = position of the first 1 in the remaining bits. */
export function hllSplit(h: number, p: number) {
  const idx = h >>> (32 - p);
  const rest = (h << p) >>> 0;
  const rank = rest === 0 ? 32 - p + 1 : Math.clz32(rest) + 1;
  return { idx, rank };
}

export function hllAdd(regs: Uint8Array, id: number, p: number) {
  const { idx, rank } = hllSplit(itemHash(id), p);
  if (rank > regs[idx]) regs[idx] = rank;
  return { idx, rank };
}

export function hllEstimate(regs: Uint8Array) {
  const m = regs.length;
  const alpha = m === 16 ? 0.673 : m === 32 ? 0.697 : m === 64 ? 0.709 : 0.7213 / (1 + 1.079 / m);
  let sum = 0;
  let zeros = 0;
  for (const r of regs) {
    sum += Math.pow(2, -r);
    if (r === 0) zeros++;
  }
  const raw = (alpha * m * m) / sum;
  // small-range correction: linear counting while many registers are still empty
  if (raw <= 2.5 * m && zeros > 0) return m * Math.log(m / zeros);
  return raw;
}

/** Registers after adding the ids start .. start+count-1 (a different `start` is an independent stream of items). */
export function hllBuild(count: number, p: number, start = 0) {
  const regs = new Uint8Array(1 << p);
  for (let i = start; i < start + count; i++) hllAdd(regs, i, p);
  return regs;
}

/** HyperLogLog's relative standard error with m registers: 1.04/√m. One run lands within it about two times in three. */
export const hllStdErr = (m: number) => 1.04 / Math.sqrt(m);

/** Register memory when each register takes 6 bits (ranks stay below 64); the demo's arrays are plain bytes. */
export const HLL_BITS_PER_REGISTER = 6;
export const hllBytes = (m: number) => (m * HLL_BITS_PER_REGISTER) / 8;

export const bits32 = (h: number) => (h >>> 0).toString(2).padStart(32, '0');
