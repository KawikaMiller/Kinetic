/**
 * A simplified contract and its verifier, written for this lesson (not Pact's file format).
 *
 * A contract names the response a consumer relies on: a status and a pattern of the body that lists
 * only the fields it uses, each with a type matcher, never a value. Verifying walks the provider's
 * real response against the pattern: extra fields are allowed, a missing field or a wrong type is a
 * mismatch with a path such as `$.body.name`. Only a response's own keys are looked at.
 */

export type MatcherType = 'integer' | 'number' | 'string' | 'boolean' | 'any';

export type Pattern =
  | { kind: 'type'; type: MatcherType }
  | { kind: 'object'; fields: Record<string, Pattern> }
  | { kind: 'array'; of: Pattern };

export interface Mismatch {
  path: string;
  expected: string;
  got: string;
}

export const mismatchText = (m: Mismatch) => `${m.path}: expected ${m.expected}, got ${m.got}`;

/** The name a value goes by in a mismatch: "nothing" for a missing one. */
export function kindOf(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function accepts(type: MatcherType, value: unknown): boolean {
  switch (type) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'any':
      return value !== undefined;
  }
}

/** Walk `value` against `pattern`, collecting every mismatch. A missing key is looked up as an own key only. */
export function matchPattern(pattern: Pattern, value: unknown, path: string, out: Mismatch[] = []): Mismatch[] {
  if (pattern.kind === 'type') {
    if (!accepts(pattern.type, value)) out.push({ path, expected: pattern.type, got: kindOf(value) });
  } else if (pattern.kind === 'array') {
    if (!Array.isArray(value)) out.push({ path, expected: 'array', got: kindOf(value) });
    else value.forEach((item, i) => matchPattern(pattern.of, item, `${path}[${i}]`, out));
  } else if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    out.push({ path, expected: 'object', got: kindOf(value) });
  } else {
    for (const [key, child] of Object.entries(pattern.fields)) {
      const own = Object.hasOwn(value, key);
      matchPattern(child, own ? (value as Record<string, unknown>)[key] : undefined, `${path}.${key}`, out);
    }
  }
  return out;
}

export interface Contract {
  consumer: string;
  provider: string;
  description: string;
  method: 'GET';
  path: string;
  status: number;
  body: Pattern;
}

export interface ProviderResponse {
  status: number;
  body: unknown;
}

/** Replay a contract against a response: the status first, then the body. */
export function verify(contract: Contract, response: ProviderResponse): Mismatch[] {
  const out: Mismatch[] = [];
  if (response.status !== contract.status) out.push({ path: '$.status', expected: String(contract.status), got: String(response.status) });
  return matchPattern(contract.body, response.body, '$.body', out);
}

// ── The contract file ───────────────────────────────────────────────────

const typeJson = (p: Pattern): unknown =>
  p.kind === 'type' ? { match: p.type } : p.kind === 'array' ? [typeJson(p.of)] : Object.fromEntries(Object.entries(p.fields).map(([k, v]) => [k, typeJson(v)]));

/** The contract as the JSON file a consumer would publish: matchers, never values. */
export function contractJson(c: Contract): string[] {
  const file = {
    consumer: c.consumer,
    provider: c.provider,
    interactions: [{ description: c.description, request: { method: c.method, path: c.path }, response: { status: c.status, body: typeJson(c.body) } }],
  };
  return JSON.stringify(file, null, 2).split('\n');
}

export const CONSUMER_NAME = 'checkout-web';
export const PROVIDER_NAME = 'user-service';

export const objectOf = (fields: Record<string, MatcherType>): Pattern => ({
  kind: 'object',
  fields: Object.fromEntries(Object.entries(fields).map(([k, type]) => [k, { kind: 'type', type } as Pattern])),
});

export function makeContract(fields: Record<string, MatcherType>, status = 200): Contract {
  return { consumer: CONSUMER_NAME, provider: PROVIDER_NAME, description: 'get user 42', method: 'GET', path: '/users/42', status, body: objectOf(fields) };
}

// ── What a pasted response may be ───────────────────────────────────────

export const PASTE_LIMITS = { bytes: 2048, depth: 6 } as const;

const depthOf = (v: unknown): number => (v !== null && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0);

/** A pasted response body: real JSON of at most 2 KB and 6 levels, or the sentence to show instead. */
export function parsePasted(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (new TextEncoder().encode(text).length > PASTE_LIMITS.bytes) return { ok: false, error: `Keep it under ${PASTE_LIMITS.bytes} bytes.` };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Not valid JSON.' };
  }
  return depthOf(value) > PASTE_LIMITS.depth ? { ok: false, error: `Nest it no deeper than ${PASTE_LIMITS.depth} levels.` } : { ok: true, value };
}
