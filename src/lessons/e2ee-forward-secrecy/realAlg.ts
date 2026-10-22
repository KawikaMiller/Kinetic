import { aesGcmDecrypt, aesGcmEncrypt, enc, hkdf, hmac } from '../../core/crypto';
import { P256, mul, type AffinePoint } from '../../core/ecc';
import { mulberry32 } from '../../core/random';
import { sha256 } from '../../core/sha256';
import type { Algebra, Header, Party } from './ratchet';

export type Bytes = Uint8Array<ArrayBuffer>;

/** The labels of the demo protocol. They are demo constants, not keys. */
export const RATCHET_INFO = 'kinetic-demo-ratchet';
export const MESSAGE_INFO = 'kinetic-demo-msg';
export const ROOT_LABEL = 'kinetic demo root';
export const CHAIN_LABEL = 'demo chain 0';

/** HMAC constants of the chain step: the message key is HMAC(ck, 0x01), the next chain key HMAC(ck, 0x02). */
export const MK_BYTE = 0x01;
export const CK_BYTE = 0x02;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const SCALAR_WORDS = 8;
const SALTS: Record<Party, number> = { A: 104729, B: 1299709 };

const need = <T>(value: T | null): T => {
  if (value === null) throw new Error('needs https or localhost: crypto.subtle is not available');
  return value;
};

export const utf8 = (text: string): Bytes => new Uint8Array(enc.encode(text));
const be32 = (n: bigint): Bytes => {
  const out = new Uint8Array(KEY_BYTES);
  for (let i = KEY_BYTES - 1, v = n; i >= 0; i--, v >>= 8n) out[i] = Number(v & 0xffn);
  return out;
};

/** A deterministic private scalar in 1..n-1 for the n-th key of a party under a seed. Demo only: a real app uses a CSPRNG. */
export function scalarFor(seed: number, party: Party, n: number): bigint {
  const rnd = mulberry32((seed * 7919 + SALTS[party] + n * 15485863) >>> 0);
  let k = 0n;
  for (let i = 0; i < SCALAR_WORDS; i++) k = (k << 32n) | BigInt(Math.floor(rnd() * 2 ** 32));
  return (k % (P256.n - 1n)) + 1n;
}

const pubCache = new Map<bigint, AffinePoint>();
const dhCache = new Map<string, Bytes>();

/** The public point of a scalar on P-256 (this page's own arithmetic, cross-checked against node:crypto in the tests). */
export function publicPoint(priv: bigint): AffinePoint {
  let point = pubCache.get(priv);
  if (!point) {
    point = mul(P256, priv, P256.G).point!;
    pubCache.set(priv, point);
  }
  return point;
}

/** The ECDH shared secret: the x-coordinate of priv times the peer's point, 32 bytes. */
export function dhSecret(priv: bigint, pub: AffinePoint): Bytes {
  const key = `${priv}|${pub.x}|${pub.y}`;
  let secret = dhCache.get(key);
  if (!secret) {
    secret = be32(mul(P256, priv, pub).point!.x);
    dhCache.set(key, secret);
  }
  return secret;
}

/** The authenticated header: 0x04 || x || y (65 bytes) and the chain counter as one byte. */
export function headerBytes(header: Header<AffinePoint>): Bytes {
  const out = new Uint8Array(1 + 2 * KEY_BYTES + 1);
  out[0] = 0x04;
  out.set(be32(header.pub.x), 1);
  out.set(be32(header.pub.y), 1 + KEY_BYTES);
  out[out.length - 1] = header.n & 0xff;
  return out;
}

/** The AES-256-GCM key and 12-byte nonce of a message key: HKDF-SHA256 with the label, 44 bytes split 32 + 12. */
export async function messageKeys(mk: Bytes): Promise<{ key: Bytes; nonce: Bytes }> {
  const okm = need(await hkdf(mk, new Uint8Array(0), utf8(MESSAGE_INFO), KEY_BYTES + NONCE_BYTES));
  return { key: okm.slice(0, KEY_BYTES), nonce: okm.slice(KEY_BYTES) };
}

/** Opens with a message key, or null when authentication fails (the real OperationError is caught). */
export async function openWith(mk: Bytes, header: Header<AffinePoint>, sealed: Bytes): Promise<string | null> {
  const { key, nonce } = await messageKeys(mk);
  try {
    const plain = need(await aesGcmDecrypt(key, nonce, sealed, headerBytes(header)));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

const hmacBytes = async (key: Bytes, byte: number): Promise<Bytes> => need(await hmac(key, Uint8Array.of(byte), { hash: 'SHA-256', out: 'bytes' }));

/** One chain step with real HMAC-SHA256: the message key and the next chain key. */
export async function chainStep(ck: Bytes): Promise<{ mk: Bytes; ck: Bytes }> {
  return { mk: await hmacBytes(ck, MK_BYTE), ck: await hmacBytes(ck, CK_BYTE) };
}

/** The root key of the demo conversation: SHA-256 of a label. */
export const demoRoot = (): Bytes => new Uint8Array(sha256(utf8(ROOT_LABEL)));
/** The first chain key of the chain scene: SHA-256("demo chain 0"). */
export const demoChainKey = (): Bytes => new Uint8Array(sha256(utf8(CHAIN_LABEL)));

/** The protocol on real bytes: P-256 from this page's arithmetic, HMAC, HKDF and AES-GCM from Web Crypto. */
export function realAlgebra(seed: number): Algebra<Bytes, bigint, AffinePoint, Bytes, Bytes> {
  return {
    initialRoot: demoRoot,
    keyPair: async (party, n) => {
      const priv = scalarFor(seed, party, n);
      return { priv, pub: publicPoint(priv) };
    },
    dh: async (priv, pub) => dhSecret(priv, pub),
    kdfRk: async (rk, d) => {
      const okm = need(await hkdf(d, rk, utf8(RATCHET_INFO), 2 * KEY_BYTES));
      return { rk: okm.slice(0, KEY_BYTES), ck: okm.slice(KEY_BYTES) };
    },
    kdfCk: chainStep,
    chains: async (root) => ({ ab: demoChainKey(), ba: await hmacBytes(root, 0x0b) }),
    seal: async (mk, header, text) => {
      const { key, nonce } = await messageKeys(mk);
      return need(await aesGcmEncrypt(key, nonce, utf8(text), headerBytes(header)));
    },
    open: openWith,
    samePub: (a, b) => a.x === b.x && a.y === b.y,
  };
}
