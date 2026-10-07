// Real AES in four modes through WebCrypto. Every function resolves to null without
// crypto.subtle. ECB isn't offered by WebCrypto (on purpose), so it's built one block at a
// time with core/crypto's aesBlockEncrypt, only to show why you should never use it (NIST still approves ECB, but nothing should use it).
//
// The lesson works on whole 16-byte blocks with no padding, so the pictures and the tamper
// demo show the modes themselves. WebCrypto's AES-CBC always applies PKCS#7 padding, so:
// - cbcEncrypt drops the extra padding block it appends to block-aligned input;
// - cbcDecrypt appends one block that decrypts to valid padding (we hold the key), so a
//   tampered ciphertext decrypts to garbage instead of throwing a padding error.
import { aesBlockEncrypt, hasSubtle } from '../../core/crypto';

export const BLOCK = 16;
/** A full block of PKCS#7 padding: sixteen bytes of 0x10. */
const PAD_BLOCK = new Uint8Array(BLOCK).fill(BLOCK);

type Bytes = Uint8Array<ArrayBuffer>;

const importAes = (raw: Bytes, name: 'AES-CBC' | 'AES-CTR' | 'AES-GCM') =>
  crypto.subtle.importKey('raw', raw, { name }, false, ['encrypt', 'decrypt']);

function assertBlocks(data: Uint8Array) {
  if (data.length % BLOCK !== 0) throw new RangeError(`expected whole ${BLOCK}-byte blocks, got ${data.length} bytes`);
}

export const xorBytes = (a: Uint8Array, b: Uint8Array): Bytes => Uint8Array.from(a, (v, i) => v ^ b[i]);

/** ECB: every block encrypted on its own with the bare block cipher. Equal blocks give equal output. */
export async function ecbEncrypt(key: Bytes, data: Bytes): Promise<Bytes | null> {
  assertBlocks(data);
  if (!hasSubtle()) return null;
  const out = new Uint8Array(data.length);
  const cache = new Map<string, Bytes>();
  for (let i = 0; i < data.length; i += BLOCK) {
    const block = data.slice(i, i + BLOCK);
    const id = block.join();
    let enc = cache.get(id);
    if (!enc) {
      enc = (await aesBlockEncrypt(key, block))!;
      cache.set(id, enc);
    }
    out.set(enc, i);
  }
  return out;
}

/** CBC with no padding: each block is XORed with the previous ciphertext block (the IV for the first). */
export async function cbcEncrypt(key: Bytes, iv: Bytes, data: Bytes): Promise<Bytes | null> {
  assertBlocks(data);
  if (!hasSubtle()) return null;
  const k = await importAes(key, 'AES-CBC');
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, data));
  return out.slice(0, data.length);
}

export async function cbcDecrypt(key: Bytes, iv: Bytes, ct: Bytes): Promise<Bytes | null> {
  assertBlocks(ct);
  if (!hasSubtle()) return null;
  const last = ct.length >= BLOCK ? ct.slice(ct.length - BLOCK) : iv;
  const extra = (await aesBlockEncrypt(key, xorBytes(PAD_BLOCK, last)))!;
  const full = new Uint8Array(ct.length + BLOCK);
  full.set(ct);
  full.set(extra, ct.length);
  const k = await importAes(key, 'AES-CBC');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, k, full));
}

/** CTR: AES of a counter block makes a keystream, XORed onto the data. Encrypt and decrypt are the same. */
export async function ctrCrypt(key: Bytes, counter: Bytes, data: Bytes): Promise<Bytes | null> {
  if (!hasSubtle()) return null;
  const k = await importAes(key, 'AES-CTR');
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CTR', counter, length: 64 }, k, data));
}

/** GCM: CTR encryption plus a 16-byte authentication tag on the end. */
export async function gcmEncrypt(key: Bytes, iv: Bytes, data: Bytes): Promise<Bytes | null> {
  if (!hasSubtle()) return null;
  const k = await importAes(key, 'AES-GCM');
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, data));
}

export type GcmOpen = { ok: true; plain: Bytes } | { ok: false };

/** GCM decrypt: the plaintext, or a refusal when the tag doesn't match (anything was changed). */
export async function gcmDecrypt(key: Bytes, iv: Bytes, sealed: Bytes): Promise<GcmOpen | null> {
  if (!hasSubtle()) return null;
  const k = await importAes(key, 'AES-GCM');
  try {
    return { ok: true, plain: new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, sealed)) };
  } catch {
    return { ok: false };
  }
}

/** Fresh random bytes (a key, an IV, a nonce) from the browser's CSPRNG. */
export const randomBytes = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));
