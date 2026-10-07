// The MAC lesson's model: the order the sender signs, what the editor in the channel
// changes, real tags (HMAC-SHA-256 or a plain SHA-256 for contrast), and the two ways to
// compare tags. Everything runs inside the lesson; nothing is sent anywhere.
import { enc, hasSubtle, hmac } from '../../core/crypto';

type Bytes = Uint8Array<ArrayBuffer>;

export const DEFAULT_ORDER = '{"item": "socks", "amount": 10}';
export const ORDER_MAX = 400;
/** What the editor in the channel sets the amount to (or 1, if it's already 1000). */
export const EDITED_AMOUNT = 1000;
export const KEY_BYTES = 32;

export type TagKind = 'hmac' | 'hash';

export interface Order {
  text: string;
  amount: number;
}

/** The learner's order, or the reason it's refused (the last good order stays on screen). */
export function parseOrder(text: string): { ok: true; order: Order } | { ok: false; error: string } {
  if (text.trim() === '') return { ok: false, error: 'Type a JSON order, like {"amount": 10}.' };
  if (text.length > ORDER_MAX) return { ok: false, error: `Keep the order under ${ORDER_MAX} characters.` };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That isn\'t valid JSON.' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, error: 'The order must be a JSON object: {…}.' };
  const amount = (value as Record<string, unknown>).amount;
  if (typeof amount !== 'number') return { ok: false, error: 'The order needs a top-level "amount" number for the editor to change.' };
  return { ok: true, order: { text, amount } };
}

export interface Edit {
  text: string;
  /** Where the new number sits in the edited text, for highlighting. */
  from: number;
  to: number;
  amount: number;
}

const AMOUNT_RE = /"amount"\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/**
 * The channel's edit: the top-level amount changed in place, every other character kept.
 * Tries each "amount": number in the text and keeps the first one that is the top-level
 * field (a nested "amount" or one inside a string doesn't count).
 */
export function editAmount(order: Order): Edit | null {
  const amount = order.amount === EDITED_AMOUNT ? 1 : EDITED_AMOUNT;
  for (const m of order.text.matchAll(AMOUNT_RE)) {
    const from = m.index + m[0].length - m[1].length;
    const to = from + m[1].length;
    const text = order.text.slice(0, from) + amount + order.text.slice(to);
    try {
      if ((JSON.parse(text) as { amount: unknown }).amount === amount) return { text, from, to: from + String(amount).length, amount };
    } catch {
      // This match wasn't a real field (e.g. inside a string); try the next.
    }
  }
  return null;
}

/** The tag for a message: HMAC-SHA-256 under the shared key, or a keyless SHA-256 (the flawed alternative). */
export async function tagFor(kind: TagKind, key: Bytes, message: string): Promise<Bytes | null> {
  if (!hasSubtle()) return null;
  if (kind === 'hmac') return hmac(key, enc.encode(message), { hash: 'SHA-256', out: 'bytes' });
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(message)));
}

export type Verdict = 'accepted' | 'caught' | 'forged';

export interface Delivery {
  kind: TagKind;
  sent: string;
  /** What arrives: the edited message when the channel tampers. */
  received: string;
  edit: Edit | null;
  tagSent: Bytes;
  /** The tag that arrives. With a plain hash the editor recomputes it; with HMAC it can't, so it's passed on unchanged. */
  tagReceived: Bytes;
  /** What the receiver computes over the message it got. */
  expected: Bytes;
  verdict: Verdict;
}

/** One trip through the channel, with real tags. Null without Web Crypto. */
export async function deliver(kind: TagKind, key: Bytes, order: Order, tamper: boolean): Promise<Delivery | null> {
  const edit = tamper ? editAmount(order) : null;
  const received = edit ? edit.text : order.text;
  const tagSent = await tagFor(kind, key, order.text);
  // The editor has no key. A keyless hash it can simply recompute; an HMAC it can't.
  const tagReceived = edit && kind === 'hash' ? await tagFor('hash', key, received) : tagSent;
  const expected = await tagFor(kind, key, received);
  if (!tagSent || !tagReceived || !expected) return null;
  const match = constantTimeEqual(tagReceived, expected).equal;
  const verdict: Verdict = !match ? 'caught' : edit ? 'forged' : 'accepted';
  return { kind, sent: order.text, received, edit, tagSent, tagReceived, expected, verdict };
}

/** Byte indexes where two tags differ. */
export const mismatches = (a: Uint8Array, b: Uint8Array) => Array.from(a).flatMap((v, i) => (v !== b[i] ? [i] : []));

export interface Compare {
  equal: boolean;
  /** How many bytes the comparison looked at before answering. */
  looked: number;
}

/** The tempting comparison: stops at the first differing byte, so its running time depends on how much matched. */
export function naiveEqual(a: Uint8Array, b: Uint8Array): Compare {
  if (a.length !== b.length) return { equal: false, looked: 0 };
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return { equal: false, looked: i + 1 };
  return { equal: true, looked: a.length };
}

/** Constant-time comparison: always reads every byte, folding the differences together. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): Compare {
  if (a.length !== b.length) return { equal: false, looked: 0 };
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return { equal: diff === 0, looked: a.length };
}

export const randomKey = (): Bytes => crypto.getRandomValues(new Uint8Array(KEY_BYTES));
