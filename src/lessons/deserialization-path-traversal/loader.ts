// Two ways to read a saved shopping cart back: a data-only format (JSON, checked against a schema)
// and a toy type-naming format whose header says which class to build. The classes are fictional,
// their "constructors" only return a description of what they would do, and nothing is executed.
import { fakeSecret } from '../../core/fakeSecret';

export interface CartData {
  items: { sku: string; qty: number }[];
  coupon?: string;
}

// ── The data-only side: JSON, then a schema ───────────────────────────────

export const MAX_ITEMS = 10;
export const MAX_QTY = 99;
const COUPON = /^[A-Z0-9]{3,12}$/;
const SKU = /^[a-z][a-z0-9-]{0,19}$/;
const CART_FIELDS = new Set(['items', 'coupon']);
const ITEM_FIELDS = new Set(['sku', 'qty']);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every problem with a parsed value, in plain words; empty means it is a valid cart. Unknown fields are errors. */
export function validateCart(value: unknown): string[] {
  if (!isRecord(value)) return ['expected an object'];
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!CART_FIELDS.has(key)) errors.push(`unknown field "${key}"`);
  const items = value.items;
  if (!Array.isArray(items)) errors.push('"items" must be a list');
  else {
    if (items.length === 0 || items.length > MAX_ITEMS) errors.push(`"items" needs 1 to ${MAX_ITEMS} entries`);
    items.forEach((item, i) => {
      if (!isRecord(item)) return errors.push(`items[${i}] must be an object`);
      for (const key of Object.keys(item)) if (!ITEM_FIELDS.has(key)) errors.push(`unknown field "${key}" in items[${i}]`);
      if (typeof item.sku !== 'string' || !SKU.test(item.sku)) errors.push(`items[${i}].sku must be a short lowercase name`);
      if (typeof item.qty !== 'number' || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > MAX_QTY) errors.push(`items[${i}].qty must be a whole number from 1 to ${MAX_QTY}`);
    });
  }
  if (value.coupon !== undefined && (typeof value.coupon !== 'string' || !COUPON.test(value.coupon))) errors.push('"coupon" must be 3 to 12 capital letters or digits');
  return errors;
}

export interface DataOnlyResult {
  /** The text was valid JSON. */
  parsed: boolean;
  errors: string[];
  accepted: boolean;
}

export function readDataOnly(text: string): DataOnlyResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { parsed: false, errors: ['not valid JSON'], accepted: false };
  }
  const errors = validateCart(value);
  return { parsed: true, errors, accepted: errors.length === 0 };
}

// ── The type-naming side ──────────────────────────────────────────────────

/** Classes the toy app has. Each "constructor" only describes what it would do. */
export const REGISTRY: Record<string, { effect: string }> = {
  Cart: { effect: 'builds a cart from the fields' },
  Coupon: { effect: 'builds a coupon from the fields' },
  ReportJob: { effect: 'starts a nightly report job' },
  CacheWiper: { effect: 'clears the whole cache' },
};
export const TYPE_NAMES = Object.keys(REGISTRY);
/** The one type this reader is meant to build from a saved cart. */
export const ALLOWED_TYPES: readonly string[] = ['Cart'];

export type TypeStage = 'signature' | 'allow-list' | 'lookup' | 'constructed';

export interface TypeNamingResult {
  /** The type the header names, or null when the blob has no readable header. */
  named: string | null;
  /** Where it stopped: 'constructed' means a constructor ran. */
  stage: TypeStage;
  /** The class whose constructor ran, or null. */
  constructed: string | null;
  /** Fields the loader copied onto the object without checking them. */
  keptFields: string[];
  accepted: boolean;
  reason: string | null;
}

export interface TypeDefences {
  allowList: boolean;
  signed: boolean;
}

/** The type named on the first line (`type: Cart`) and the other `key: value` fields. */
export function parseBlob(text: string): { type: string | null; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  let type: string | null = null;
  for (const line of text.split('\n')) {
    const m = /^([a-z]+): (.*)$/.exec(line);
    if (!m) continue;
    if (m[1] === 'type') type = m[2];
    else fields[m[1]] = m[2];
  }
  return { type, fields };
}

const EXPECTED_FIELDS = new Set(['items', 'coupon']);

export function readTypeNaming(text: string, d: TypeDefences, signatureValid: boolean): TypeNamingResult {
  const { type, fields } = parseBlob(text);
  const stop = (stage: TypeStage, reason: string): TypeNamingResult => ({ named: type, stage, constructed: null, keptFields: [], accepted: false, reason });
  if (d.signed && !signatureValid) return stop('signature', 'the signature does not match: this is not something our server wrote');
  if (type === null) return stop('lookup', 'the header names no type');
  if (d.allowList && !ALLOWED_TYPES.includes(type)) return stop('allow-list', `${type} is not on the allow-list`);
  if (!(type in REGISTRY)) return stop('lookup', `no type called ${type}`);
  // The constructor runs here, before any code of ours looks at the object.
  const keptFields = Object.keys(fields).filter((k) => !EXPECTED_FIELDS.has(k));
  return { named: type, stage: 'constructed', constructed: type, keptFields, accepted: true, reason: null };
}

/** A constructor ran for a class this reader never meant to build: the input chose which code ran. */
export const ranUnexpectedType = (r: TypeNamingResult) => r.constructed !== null && !ALLOWED_TYPES.includes(r.constructed);

// ── Presets: the same saved cart, in both formats ─────────────────────────

export interface BlobPreset {
  id: 'own' | 'swapped' | 'extra';
  label: string;
  /** What the type-naming format holds. */
  typed: string;
  /** What the data-only format holds. */
  json: string;
}

const ITEMS_LINE = 'items: mug x2, tea x1';
const ITEMS_JSON = '"items": [{"sku": "mug", "qty": 2}, {"sku": "tea", "qty": 1}]';

export const PRESETS: BlobPreset[] = [
  {
    id: 'own',
    label: 'Your own saved cart',
    typed: `type: Cart\n${ITEMS_LINE}\ncoupon: SPRING10`,
    json: `{${ITEMS_JSON}, "coupon": "SPRING10"}`,
  },
  {
    id: 'swapped',
    label: 'Edited to name another type',
    typed: `type: CacheWiper\n${ITEMS_LINE}\ncoupon: SPRING10`,
    json: `{"type": "CacheWiper", ${ITEMS_JSON}, "coupon": "SPRING10"}`,
  },
  {
    id: 'extra',
    label: 'Edited with an extra field',
    typed: `type: Cart\n${ITEMS_LINE}\ncoupon: SPRING10\ndiscount: 99`,
    json: `{${ITEMS_JSON}, "coupon": "SPRING10", "discount": 99}`,
  },
];

// ── Signing: only blobs our server wrote are accepted ─────────────────────

/** A made-up signing key for the demo, assembled at run time. */
export const SIGNING_KEY = fakeSecret('cart', '_demo_', 'key_7d2e41');

/** The blob that was signed at save time is always the original cart. */
export const SAVED_BLOB = PRESETS[0].typed;
