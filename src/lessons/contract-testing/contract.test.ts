import { describe, expect, it } from 'vitest';
import {
  PASTE_LIMITS, contractJson, kindOf, makeContract, matchPattern, mismatchText, parsePasted, verify, type MatcherType, type Pattern,
} from './contract';

const T = (type: MatcherType): Pattern => ({ kind: 'type', type });
const O = (fields: Record<string, Pattern>): Pattern => ({ kind: 'object', fields });
const A = (of: Pattern): Pattern => ({ kind: 'array', of });
const paths = (p: Pattern, v: unknown) => matchPattern(p, v, '$').map(mismatchText);

describe('the matcher on 30 hand-written cases', () => {
  const cases: [string, Pattern, unknown, string[]][] = [
    ['integer takes an integer', T('integer'), 7, []],
    ['integer takes zero and a negative', T('integer'), -3, []],
    ['integer refuses 1.5', T('integer'), 1.5, ['$: expected integer, got number']],
    ['integer refuses the numeric string "7"', T('integer'), '7', ['$: expected integer, got string']],
    ['integer refuses null', T('integer'), null, ['$: expected integer, got null']],
    ['integer refuses a missing value', T('integer'), undefined, ['$: expected integer, got nothing']],
    ['number takes 1.5', T('number'), 1.5, []],
    ['number takes an integer', T('number'), 7, []],
    ['number refuses "1.5"', T('number'), '1.5', ['$: expected number, got string']],
    ['string takes the empty string', T('string'), '', []],
    ['string refuses 7', T('string'), 7, ['$: expected string, got integer']],
    ['string refuses an array', T('string'), ['a'], ['$: expected string, got array']],
    ['boolean takes false', T('boolean'), false, []],
    ['boolean refuses 0', T('boolean'), 0, ['$: expected boolean, got integer']],
    ['any takes null', T('any'), null, []],
    ['any takes an object', T('any'), { a: 1 }, []],
    ['any refuses a missing value', T('any'), undefined, ['$: expected any, got nothing']],
    ['an object takes extra fields', O({ id: T('integer') }), { id: 1, extra: 'x' }, []],
    ['an object reports a missing field with its path', O({ id: T('integer'), name: T('string') }), { id: 1 }, ['$.name: expected string, got nothing']],
    ['an object reports every mismatch, in field order', O({ a: T('integer'), b: T('string') }), { a: 'x', b: 2 }, ['$.a: expected integer, got string', '$.b: expected string, got integer']],
    ['an object refuses null', O({ a: T('any') }), null, ['$: expected object, got null']],
    ['an object refuses an array', O({ a: T('any') }), [], ['$: expected object, got array']],
    ['an object refuses a string', O({}), 'x', ['$: expected object, got string']],
    ['an empty object pattern takes any object', O({}), { anything: 1 }, []],
    ['a nested object is walked', O({ user: O({ id: T('integer') }) }), { user: { id: 'x' } }, ['$.user.id: expected integer, got string']],
    ['a nested missing object reports the leaf', O({ user: O({ id: T('integer') }) }), {}, ['$.user: expected object, got nothing']],
    ['an array checks every element', A(T('integer')), [1, 2, 'x', 4], ['$[2]: expected integer, got string']],
    ['an empty array passes', A(T('integer')), [], []],
    ['an array refuses an object', A(T('integer')), { 0: 1 }, ['$: expected array, got object']],
    ['an array of objects reports the element path', A(O({ id: T('integer') })), [{ id: 1 }, {}], ['$[1].id: expected integer, got nothing']],
  ];
  expect(cases).toHaveLength(30);
  it.each(cases)('%s', (_name, pattern, value, expected) => {
    expect(paths(pattern, value)).toEqual(expected);
  });
});

describe('only own keys count', () => {
  it('an inherited property name is a missing field', () => {
    expect(paths(O({ toString: T('any') }), {})).toEqual(['$.toString: expected any, got nothing']);
    expect(paths(O({ constructor: T('any') }), {})).toEqual(['$.constructor: expected any, got nothing']);
  });

  it('a JSON body with a __proto__ key is read as plain data and changes nothing global', () => {
    const body = JSON.parse('{"__proto__": {"admin": true}, "id": 1}');
    expect(Object.hasOwn(body, '__proto__')).toBe(true);
    expect(paths(O({ id: T('integer') }), body)).toEqual([]);
    expect(paths(O({ __proto__: T('any') }), body)).toEqual([]);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });
});

describe('verifying a response', () => {
  const contract = makeContract({ id: 'integer', name: 'string' });
  it('passes a response with the fields it names, extras allowed', () => {
    expect(verify(contract, { status: 200, body: { id: 1, name: 'Ada', extra: true } })).toEqual([]);
  });

  it('puts the status first, then the body mismatches with their paths', () => {
    const out = verify(contract, { status: 201, body: { id: '1' } }).map(mismatchText);
    expect(out).toEqual(['$.status: expected 200, got 201', '$.body.id: expected integer, got string', '$.body.name: expected string, got nothing']);
  });

  it('writes the contract file with matchers and no values', () => {
    const text = contractJson(contract).join('\n');
    expect(text).toContain('"match": "integer"');
    expect(JSON.parse(text).interactions[0].response.body).toEqual({ id: { match: 'integer' }, name: { match: 'string' } });
    expect(text).not.toMatch(/Ada|ada@|2500/);
  });
});

describe('a pasted response', () => {
  it('accepts real JSON within the limits', () => {
    expect(parsePasted('{"id":1,"tags":["a"]}')).toEqual({ ok: true, value: { id: 1, tags: ['a'] } });
  });

  it('shows the parser\'s own message for invalid JSON', () => {
    const r = parsePasted('{"id": ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });

  it('refuses more than 2 KB', () => {
    expect(parsePasted(JSON.stringify({ a: 'x'.repeat(PASTE_LIMITS.bytes) }))).toEqual({ ok: false, error: 'Keep it under 2048 bytes.' });
    expect(parsePasted(JSON.stringify({ a: 'x'.repeat(PASTE_LIMITS.bytes - 20) })).ok).toBe(true);
  });

  it('refuses more than 6 levels, and accepts exactly 6', () => {
    const nest = (n: number): unknown => (n === 0 ? 1 : { a: nest(n - 1) });
    expect(parsePasted(JSON.stringify(nest(6))).ok).toBe(true);
    expect(parsePasted(JSON.stringify(nest(7)))).toEqual({ ok: false, error: 'Nest it no deeper than 6 levels.' });
  });

  it('kindOf names a value the way a mismatch does', () => {
    expect([undefined, null, [], 3, 3.5, 'a', true, {}].map(kindOf)).toEqual(['nothing', 'null', 'array', 'integer', 'number', 'string', 'boolean', 'object']);
  });
});
