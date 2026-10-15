import { parseBoundedInt, type FieldParse } from '../../core/parse';

export const KEY_MIN = -999;
export const KEY_MAX = 999;
/** What the drawing holds: 31 nodes is a perfect tree of height 5. */
export const NODE_LIMIT = 31;

const keyMessages = {
  empty: 'Type a whole number.',
  invalid: (typed: string) => `"${typed}" is not a whole number. Use plain digits, like 42.`,
  tooSmall: () => `Keys go from ${KEY_MIN} to ${KEY_MAX}.`,
  tooBig: () => `Keys go from ${KEY_MIN} to ${KEY_MAX}.`,
};

/** One key typed into the Key field, or the sentence that refuses it. */
export const parseKey = (text: string): FieldParse<number> => parseBoundedInt(text, { min: KEY_MIN, max: KEY_MAX, typographicMinus: true, messages: keyMessages });

/**
 * A key list typed by the learner ("30 10, 20"): every token a whole number in range, no key twice,
 * at most `limit` of them. A refused list says which token and why; nothing is applied.
 */
export function parseKeyList(text: string, limit = NODE_LIMIT): FieldParse<number[]> {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'Type some keys, like 30 10 20.' };
  const keys: number[] = [];
  for (const token of tokens) {
    const one = parseKey(token);
    if (!one.ok) return { ok: false, error: one.error };
    if (keys.includes(one.value)) return { ok: false, error: `${one.value} is typed twice: it is already in the tree, and a tree holds each key once.` };
    keys.push(one.value);
  }
  if (keys.length > limit) return { ok: false, error: `That is ${keys.length} keys; the drawing holds ${limit}.` };
  return { ok: true, value: keys };
}

/** Why a single insert or delete is refused on this tree, or null when it can go ahead. */
export function refuseOp(op: 'insert' | 'delete', key: number, size: number, has: boolean): string | null {
  if (op === 'insert') {
    if (has) return `${key} is already in the tree.`;
    if (size >= NODE_LIMIT) return `The tree already has ${NODE_LIMIT} nodes, the most the drawing holds.`;
    return null;
  }
  if (size === 0) return 'The tree is empty: there is nothing to delete.';
  if (!has) return `${key} is not in the tree.`;
  return null;
}
