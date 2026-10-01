import { toBits, type Bit } from '../../core/bits';
import { enc } from '../../core/crypto';

export const STANDARD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export type Variant = 'standard' | 'url';

const BYTES_PER_BLOCK = 3;
const SEXTET = 6;
const SEXTETS_PER_BLOCK = 4;

export const utf8 = (s: string) => enc.encode(s);

/** One 3-byte block of base64: 24 bits regrouped into four 6-bit alphabet indexes. */
export interface Block {
  bytes: number[];
  /** Always 24 bits; bits past the real data are zero padding. */
  bits: Bit[];
  /** How many of the 24 bits are real data (8, 16 or 24). */
  dataBits: number;
  /** Zero bits added so the last used 6-bit group is complete (4, 2 or 0). */
  zeroPadBits: number;
  /** Alphabet index per 6-bit group, null where the group is only padding. */
  sextets: (number | null)[];
  /** Output characters: alphabet letters, '=' padding (standard only). */
  chars: string[];
}

/** Base64 built from the bits, block by block, the way the visual shows it. */
export function toBlocks(bytes: Uint8Array, variant: Variant): Block[] {
  const alphabet = variant === 'url' ? URL_ALPHABET : STANDARD_ALPHABET;
  const blocks: Block[] = [];
  for (let i = 0; i < bytes.length; i += BYTES_PER_BLOCK) {
    const chunk = [...bytes.slice(i, i + BYTES_PER_BLOCK)];
    const bits = [...chunk.flatMap((b) => toBits(b, 8)), ...new Array<Bit>((BYTES_PER_BLOCK - chunk.length) * 8).fill(0)];
    const dataBits = chunk.length * 8;
    const used = Math.ceil(dataBits / SEXTET); // 2, 3 or 4 groups carry data
    const sextets = Array.from({ length: SEXTETS_PER_BLOCK }, (_, k) => {
      if (k >= used) return null;
      return bits.slice(k * SEXTET, k * SEXTET + SEXTET).reduce<number>((acc, b) => acc * 2 + b, 0);
    });
    const chars = sextets.flatMap((s) => (s === null ? (variant === 'standard' ? ['='] : []) : [alphabet[s]]));
    blocks.push({ bytes: chunk, bits, dataBits, zeroPadBits: used * SEXTET - dataBits, sextets, chars });
  }
  return blocks;
}

export const encode = (bytes: Uint8Array, variant: Variant) => toBlocks(bytes, variant).flatMap((b) => b.chars).join('');

/** Decode base64 (either variant) back to text. No key, nothing secret: that's the point. */
export function decodeToText(b64: string, variant: Variant): string {
  const standard = variant === 'url' ? b64.replace(/-/g, '+').replace(/_/g, '/') : b64;
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export type PercentMode = 'component' | 'form';

export interface PercentToken {
  char: string;
  out: string;
  changed: boolean;
}

/** encodeURIComponent leaves these alone. */
const COMPONENT_SAFE = /[A-Za-z0-9\-_.!~*'()]/;
/** application/x-www-form-urlencoded (URLSearchParams) leaves these alone; space becomes '+'. */
const FORM_SAFE = /[A-Za-z0-9\-_.*]/;

const percentBytes = (ch: string) => [...utf8(ch)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`).join('');

/** Percent-encoding, character by character, so the visual can show what changed and why. */
export function percentTokens(s: string, mode: PercentMode): PercentToken[] {
  return [...s].map((char) => {
    const safe = (mode === 'component' ? COMPONENT_SAFE : FORM_SAFE).test(char);
    const out = safe ? char : mode === 'form' && char === ' ' ? '+' : percentBytes(char);
    return { char, out, changed: out !== char };
  });
}

export const percentEncode = (s: string, mode: PercentMode) => percentTokens(s, mode).map((t) => t.out).join('');

export interface Preset {
  label: string;
  text: string;
}

export const BASE64_PRESETS: readonly Preset[] = [
  { label: 'Man (3 bytes)', text: 'Man' },
  { label: 'Ma (2 bytes)', text: 'Ma' },
  { label: 'M (1 byte)', text: 'M' },
  { label: 'JWT header', text: '{"alg":"HS256","typ":"JWT"}' },
  { label: 'héllo', text: 'héllo' },
  /** Encodes to "Pj4+Pw==": a + and padding, so it's the one where base64url visibly differs. */
  { label: '>>>?', text: '>>>?' },
];

export const PERCENT_PRESETS: readonly Preset[] = [
  { label: 'a b&c=d', text: 'a b&c=d' },
  { label: 'café', text: 'café' },
  { label: '50% off!', text: '50% off!' },
  { label: 'x/y?z#w', text: 'x/y?z#w' },
];

/** Output characters per input byte: base64 grows data by a third. */
export const overhead = (inBytes: number, outChars: number) => (inBytes ? outChars / inBytes : 0);
