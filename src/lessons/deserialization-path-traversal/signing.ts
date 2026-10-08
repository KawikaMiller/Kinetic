import { hmacSha256 } from '../../core/crypto';
import { PRESETS, SAVED_BLOB, SIGNING_KEY, type BlobPreset } from './loader';

/** Compare two tags without stopping at the first difference. */
export function sameTag(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const tagFor = (text: string) => hmacSha256(SIGNING_KEY, text, 'hex');

export interface Signing {
  /** The tag the server stored when it saved the cart. */
  saved: string;
  /** Per preset: does the blob you received still match that tag? */
  valid: Record<BlobPreset['id'], boolean>;
}

/** HMAC-SHA-256 over each preset's blob (a real MAC) compared with the tag from save time. */
export async function computeSigning(): Promise<Signing | null> {
  const saved = await tagFor(SAVED_BLOB);
  if (!saved) return null;
  const valid = {} as Signing['valid'];
  for (const p of PRESETS) {
    const tag = await tagFor(p.typed);
    valid[p.id] = tag !== null && sameTag(tag, saved);
  }
  return { saved, valid };
}
