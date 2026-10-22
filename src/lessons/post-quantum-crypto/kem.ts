import { enc, hkdf } from '../../core/crypto';
import { mulberry32 } from '../../core/random';
import { decryptBit, encryptBit, keygen, type Ciphertext, type KeyPair, type LweParams } from './lwe';

/** The toy KEM: 16 bits sent as 16 toy-LWE ciphertexts under fixed parameters where decryption cannot fail (accumulated noise at most m B = 8, below 24). This is not ML-KEM. */
export const KEM_PARAMS: LweParams = { n: 4, m: 8, B: 1 };
export const KEM_BITS = 16;
export const HYBRID_INFO = 'kinetic toy hybrid demo';
export const HYBRID_BYTES = 32;

export interface Encapsulation {
  /** The 16-bit shared secret the sender chose. */
  secret: number;
  bits: (0 | 1)[];
  cts: Ciphertext[];
  kp: KeyPair;
}

const bitsOf = (value: number): (0 | 1)[] => Array.from({ length: KEM_BITS }, (_, i) => ((value >> (KEM_BITS - 1 - i)) & 1) as 0 | 1);

/** A seeded 16-bit secret encrypted bit by bit under a seeded toy key. */
export function encapsulate(seed: number): Encapsulation {
  const rnd = mulberry32(seed);
  const kp = keygen(KEM_PARAMS, rnd);
  const secret = Math.floor(rnd() * 2 ** KEM_BITS);
  const bits = bitsOf(secret);
  return { secret, bits, cts: bits.map((bit) => encryptBit(kp.pub, bit, rnd)), kp };
}

/** The receiver's side: decrypt each ciphertext and reassemble the 16-bit value. */
export function decapsulate(kp: KeyPair, cts: readonly Ciphertext[]): number {
  return cts.reduce((acc, ct) => (acc << 1) | decryptBit(kp.s, ct).bit, 0);
}

/** ikm = ECDH secret (32 bytes) followed by the toy KEM secret (2 bytes, big endian). */
export const hybridInput = (ecdhSecret: Uint8Array, kemSecret: number): Uint8Array<ArrayBuffer> => Uint8Array.from([...ecdhSecret, (kemSecret >> 8) & 0xff, kemSecret & 0xff]);

/** Real HKDF-SHA256 over the combined input: empty salt, a fixed info label, 32 bytes out. Null without crypto.subtle. */
export const combine = (ecdhSecret: Uint8Array, kemSecret: number): Promise<Uint8Array | null> =>
  hkdf(hybridInput(ecdhSecret, kemSecret), new Uint8Array(0), enc.encode(HYBRID_INFO), HYBRID_BYTES);

/** Number of bits that differ between two equal-length byte strings. */
export const bitDistance = (a: Uint8Array, b: Uint8Array): number =>
  a.reduce((acc, byte, i) => {
    let x = byte ^ b[i];
    let count = 0;
    while (x) {
      count += x & 1;
      x >>= 1;
    }
    return acc + count;
  }, 0);

/** Flip bit `index` (0 = the first bit of the first byte) of a copy. */
export function flipBit(bytes: Uint8Array, index: number): Uint8Array {
  const out = Uint8Array.from(bytes);
  out[index >> 3] ^= 0x80 >> (index & 7);
  return out;
}

/* ── sizes: typed from memory, with a formula to check the typing ─────────── */

export interface MlKemSet {
  name: string;
  k: number;
  du: number;
  dv: number;
  /** Public key and ciphertext bytes, typed from memory. */
  publicKey: number;
  ciphertext: number;
}

export const ML_KEM_SECRET_BYTES = 32;
export const ML_KEM_SETS: readonly MlKemSet[] = [
  { name: 'ML-KEM-512', k: 2, du: 10, dv: 4, publicKey: 800, ciphertext: 768 },
  { name: 'ML-KEM-768', k: 3, du: 10, dv: 4, publicKey: 1184, ciphertext: 1088 },
  { name: 'ML-KEM-1024', k: 4, du: 11, dv: 5, publicKey: 1568, ciphertext: 1568 },
];

/** The size formulas the typed constants are checked against (from memory; the reviewer checks them against FIPS 203). */
export const publicKeyBytes = (k: number): number => 384 * k + 32;
export const ciphertextBytes = (k: number, du: number, dv: number): number => 32 * (du * k + dv);

/** An uncompressed P-256 public point: 1 + 32 + 32 bytes. */
export const P256_SHARE_BYTES = 65;
/** The hybrid client share used in the page's table: a P-256 share plus an ML-KEM public key. */
export const hybridShareBytes = (set: MlKemSet): number => P256_SHARE_BYTES + set.publicKey;
