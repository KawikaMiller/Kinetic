// TOTP step by step (RFC 6238 over RFC 4226): the same HMAC-SHA-1 as core/crypto's `totp`, but with
// every intermediate value kept so the lesson can show the counter, the 20-byte MAC, the offset
// nibble and the four selected bytes. The base32 codec is local (authenticator apps show secrets
// in base32, RFC 4648).
import { hmac } from '../../core/crypto';

export const STEP_SECONDS = 30;
export const DIGITS = 6;
export const SECRET_BYTES = 20;
/** How many 30-second steps either side of the server's own the server also accepts. */
export const ACCEPT_WINDOW = 1;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 without padding, in uppercase (what authenticator apps display). */
export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

/** Decode base32 (case-insensitive, spaces and `=` padding ignored); null if any other character appears. */
export function base32Decode(text: string): Uint8Array | null {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  return Uint8Array.from(out);
}

/** The secret in groups of four, as an enrolment screen shows it. */
export const groupSecret = (b32: string) => b32.match(/.{1,4}/g)?.join(' ') ?? '';

export interface TotpSteps {
  unix: number;
  counter: number;
  /** The counter as 8 big-endian bytes: what the HMAC is computed over. */
  counterBytes: Uint8Array;
  mac: Uint8Array;
  /** The low nibble of the last MAC byte. */
  offset: number;
  /** The four bytes starting at `offset`, with the top bit cleared (a 31-bit number). */
  truncated: number;
  digits: number;
  code: string;
}

export const counterAt = (unix: number) => Math.floor(unix / STEP_SECONDS);
export const secondsLeft = (unix: number) => STEP_SECONDS - (unix % STEP_SECONDS);

export function counterToBytes(counter: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(counter));
  return out;
}

/** Truncate a MAC to `digits` digits (RFC 4226 section 5.3), keeping each intermediate value. */
export function truncate(mac: Uint8Array, digits: number) {
  const offset = mac[mac.length - 1] & 0x0f;
  const truncated = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return { offset, truncated, code: String(truncated % 10 ** digits).padStart(digits, '0') };
}

export async function totpSteps(key: Uint8Array<ArrayBuffer>, unix: number, digits = DIGITS): Promise<TotpSteps | null> {
  const counter = counterAt(unix);
  const counterBytes = counterToBytes(counter);
  const mac = await hmac(key, counterBytes, { hash: 'SHA-1', out: 'bytes' });
  if (!mac) return null;
  return { unix, counter, counterBytes, mac, ...truncate(mac, digits), digits };
}

/** Does a server whose clock reads `serverUnix` accept the code a phone showing `phoneUnix` displays? */
export const accepts = (serverUnix: number, phoneUnix: number) => Math.abs(counterAt(phoneUnix) - counterAt(serverUnix)) <= ACCEPT_WINDOW;

/** How many steps the phone's counter is ahead (+) or behind (-) the server's. */
export const stepsApart = (serverUnix: number, phoneUnix: number) => counterAt(phoneUnix) - counterAt(serverUnix);

/**
 * Will a phone whose clock is off by `skew` seconds be accepted? Always when the error is within one
 * step (the counters differ by at most one wherever in the step you are), never from two steps, and
 * otherwise it depends on how far into the current step the moment falls.
 */
export const skewVerdict = (skew: number): 'always' | 'sometimes' | 'never' => {
  const a = Math.abs(skew);
  if (a <= STEP_SECONDS) return 'always';
  return a >= 2 * STEP_SECONDS ? 'never' : 'sometimes';
};
