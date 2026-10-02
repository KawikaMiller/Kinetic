// Lesson-specific Web Crypto demos. Hashing, hex and bit helpers come from core/crypto.
import { ecdsaKeyPair, ecdsaSign, ecdsaVerify, enc, hasSubtle, sha256Hex, toHex } from '../../core/crypto';

/** SHA-256 of every input, in order ('' where Web Crypto is unavailable). */
export async function sha256Many(inputs: string[]): Promise<string[]> {
  const hex = await Promise.all(inputs.map(sha256Hex));
  return hex.map((h) => h ?? '');
}

export interface AesDemo {
  keyHex: string;
  ivHex: string;
  cipherHex: string;
  decrypted: string;
}

/** Genuine AES-256-GCM round trip of `message` with a fresh random key (null without Web Crypto). */
export async function aesRoundTrip(message: string): Promise<AesDemo | null> {
  if (!hasSubtle()) return null;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(message));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  const raw = await crypto.subtle.exportKey('raw', key);
  return { keyHex: toHex(raw), ivHex: toHex(iv), cipherHex: toHex(cipher), decrypted: new TextDecoder().decode(plain) };
}

export interface AsymDemo {
  /** RSA-OAEP (2048-bit, SHA-256) ciphertext of the message under the public key. */
  cipherHex: string;
  /** What the private key decrypts it back to. */
  decrypted: string;
  /** ECDSA P-256 signature over the release text. */
  sigHex: string;
  /** The signature checks out against the release text it was made for. */
  valid: boolean;
  /** The same signature checked against the tampered text. */
  tamperedValid: boolean;
}

/** Genuine asymmetric encryption and signing with fresh key pairs (null without Web Crypto). */
export async function asymDemo(message: string, release: string, tampered: string): Promise<AsymDemo | null> {
  if (!hasSubtle()) return null;
  const rsa = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    false,
    ['encrypt', 'decrypt'],
  );
  const cipher = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsa.publicKey, enc.encode(message));
  const plain = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsa.privateKey, cipher);
  const ec = (await ecdsaKeyPair())!;
  const sig = (await ecdsaSign(ec.privateKey, enc.encode(release)))!;
  const valid = (await ecdsaVerify(ec.publicKey, sig, enc.encode(release)))!;
  const tamperedValid = (await ecdsaVerify(ec.publicKey, sig, enc.encode(tampered)))!;
  return { cipherHex: toHex(cipher), decrypted: new TextDecoder().decode(plain), sigHex: toHex(sig), valid, tamperedValid };
}
