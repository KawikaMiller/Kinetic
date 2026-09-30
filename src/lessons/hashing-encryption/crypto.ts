// Lesson-specific Web Crypto demos. Hashing, hex and bit helpers come from core/crypto.
import { enc, hasSubtle, sha256Hex, toHex } from '../../core/crypto';

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
