// Real Web Crypto helpers, so digests, ciphertexts and signatures on screen are genuine.
// crypto.subtle only exists in secure contexts (https or localhost); every async
// helper resolves to null when it's unavailable.

export const enc = new TextEncoder();

export const hasSubtle = () => typeof crypto !== 'undefined' && !!crypto.subtle;

const asBytes = (buf: ArrayBuffer | Uint8Array) => (buf instanceof Uint8Array ? buf : new Uint8Array(buf));

/** Bytes as lower-case hex. */
export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...asBytes(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Bytes as unpadded base64url (the JWT encoding). */
export const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...asBytes(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Hex text (either case, even length, nothing else) → bytes; '' → no bytes. Throws RangeError on anything else. */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) throw new RangeError(`not an even-length hex string: "${hex}"`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** Hex string → array of bits, most significant first. */
export function hexToBits(hex: string): number[] {
  const bits: number[] = [];
  for (const ch of hex) {
    const n = parseInt(ch, 16);
    for (let b = 3; b >= 0; b--) bits.push((n >> b) & 1);
  }
  return bits;
}

/** SHA-256 of the UTF-8 text, as hex. */
export async function sha256Hex(text: string): Promise<string | null> {
  if (!hasSubtle()) return null;
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export type HmacHash = 'SHA-1' | 'SHA-256';

/**
 * HMAC of `data` under `key` with SHA-1 (what TOTP authenticator apps use) or SHA-256.
 * Bytes in, hex or bytes out; null without Web Crypto.
 */
export async function hmac(key: BufferSource, data: BufferSource, o: { hash: HmacHash; out: 'hex' }): Promise<string | null>;
export async function hmac(key: BufferSource, data: BufferSource, o: { hash: HmacHash; out: 'bytes' }): Promise<Uint8Array<ArrayBuffer> | null>;
export async function hmac(key: BufferSource, data: BufferSource, o: { hash: HmacHash; out: 'hex' | 'bytes' }): Promise<string | Uint8Array<ArrayBuffer> | null> {
  if (!hasSubtle()) return null;
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: o.hash }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
  return o.out === 'hex' ? toHex(mac) : mac;
}

/** HMAC-SHA256 of `data` with `secret`, as hex or base64url. */
export async function hmacSha256(secret: string, data: string, out: 'hex' | 'b64url'): Promise<string | null> {
  const mac = await hmac(enc.encode(secret), enc.encode(data), { hash: 'SHA-256', out: 'bytes' });
  if (!mac) return null;
  return out === 'hex' ? toHex(mac) : b64url(mac);
}

/**
 * HOTP (RFC 4226): the HMAC of an 8-byte big-endian counter, dynamically truncated to
 * `digits` decimal digits. The counter is a number, exact up to 2^53.
 */
export async function hotp(key: BufferSource, counter: number, o: { digits?: number; hash?: HmacHash } = {}): Promise<string | null> {
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const mac = await hmac(key, msg, { hash: o.hash ?? 'SHA-1', out: 'bytes' });
  if (!mac) return null;
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  const digits = o.digits ?? 6;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** TOTP (RFC 6238): HOTP with the counter floor(unixSeconds / step); 30-second steps by default. */
export const totp = (key: BufferSource, unixSeconds: number, o: { step?: number; digits?: number; hash?: HmacHash } = {}) =>
  hotp(key, Math.floor(unixSeconds / (o.step ?? 30)), o);

/**
 * One raw AES block: `block16` encrypted under a 16-, 24- or 32-byte key with no mode at
 * all, which is exactly what ECB does to every block. WebCrypto has no ECB (on purpose), so
 * this runs AES-CBC with a zero IV and keeps the first 16 output bytes: with a zero IV,
 * CBC's first block is the bare block cipher. Only for showing why ECB leaks patterns;
 * never a way to encrypt real data.
 */
export async function aesBlockEncrypt(key: BufferSource, block16: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (block16.length !== 16) throw new RangeError('aesBlockEncrypt takes exactly one 16-byte block');
  if (!hasSubtle()) return null;
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt']);
  const out = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, block16);
  return new Uint8Array(out, 0, 16).slice();
}

/** The AES block size in bytes. */
export const AES_BLOCK = 16;
/** A full block of PKCS#7 padding: sixteen bytes of 0x10. */
const PAD_BLOCK = new Uint8Array(AES_BLOCK).fill(AES_BLOCK);

function assertAesBlocks(data: Uint8Array) {
  if (data.length % AES_BLOCK !== 0) throw new RangeError(`expected whole ${AES_BLOCK}-byte blocks, got ${data.length} bytes`);
}

const importAesCbc = (key: BufferSource) => crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);

/**
 * AES-CBC with no padding, on whole 16-byte blocks: each block XORed with the previous ciphertext
 * block (the IV for the first). WebCrypto always adds PKCS#7, which appends a full padding block to
 * block-aligned input; this drops it. For lessons that show the mode itself, not for real data.
 */
export async function aesCbcRawEncrypt(key: BufferSource, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  assertAesBlocks(data);
  if (!hasSubtle()) return null;
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, await importAesCbc(key), data));
  return out.slice(0, data.length);
}

/**
 * The inverse of aesCbcRawEncrypt. WebCrypto checks PKCS#7 padding on decrypt, so this appends one
 * block that decrypts to a valid padding block (we hold the key: AES(PAD ⊕ last ciphertext block)).
 * A tampered ciphertext therefore decrypts to garbled bytes, as raw CBC does, instead of throwing.
 */
export async function aesCbcRawDecrypt(key: BufferSource, iv: Uint8Array<ArrayBuffer>, ct: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  assertAesBlocks(ct);
  if (!hasSubtle()) return null;
  const last = ct.length >= AES_BLOCK ? ct.slice(ct.length - AES_BLOCK) : iv;
  const extra = (await aesBlockEncrypt(key, Uint8Array.from(PAD_BLOCK, (v, i) => v ^ last[i])))!;
  const full = new Uint8Array(ct.length + AES_BLOCK);
  full.set(ct);
  full.set(extra, ct.length);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, await importAesCbc(key), full));
}

const ECDSA_ALG = { name: 'ECDSA', hash: 'SHA-256' } as const;

/** A fresh ECDSA P-256 key pair (private key not extractable); null without Web Crypto. */
export async function ecdsaKeyPair(): Promise<CryptoKeyPair | null> {
  if (!hasSubtle()) return null;
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
}

/** ECDSA P-256 / SHA-256 signature over `data`: 64 bytes, r‖s. Null without Web Crypto. */
export async function ecdsaSign(privateKey: CryptoKey, data: BufferSource): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!hasSubtle()) return null;
  return new Uint8Array(await crypto.subtle.sign(ECDSA_ALG, privateKey, data));
}

/** Whether `signature` is valid for `data` under `publicKey`. Null without Web Crypto. */
export async function ecdsaVerify(publicKey: CryptoKey, signature: BufferSource, data: BufferSource): Promise<boolean | null> {
  if (!hasSubtle()) return null;
  return crypto.subtle.verify(ECDSA_ALG, publicKey, signature, data);
}
