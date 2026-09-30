import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { INTENDED_SHAPE, PARAM_SHAPE, concatenated, parameterised, shapeOf, tokenizeSql, unquote } from './sql';

const ALPHABET = "abcXYZ019 '’\"-;,.()*=?%_\\/\t";
const randomText = (rnd: () => number, max = 14) =>
  Array.from({ length: Math.floor(rnd() * max) }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]).join('');

describe('tokenizeSql', () => {
  it('reads strings with doubled quotes as one literal', () => {
    const t = tokenizeSql("x = 'O''Brien'");
    expect(t.map((k) => k.kind)).toEqual(['ident', 'punct', 'string']);
    expect(unquote(t[2].text)).toBe("O'Brien");
  });
  it('marks a string with no closing quote', () => {
    expect(tokenizeSql("'abc").map((k) => k.kind)).toEqual(['unterminated']);
  });
  it('recognises keywords, placeholders, numbers and comments', () => {
    expect(tokenizeSql('SELECT ? 42 -- note').map((k) => k.kind)).toEqual(['keyword', 'param', 'number', 'comment']);
  });
});

describe('pasting a name into the query', () => {
  it('works for an ordinary surname and finds both Smiths', () => {
    const r = concatenated('Smith');
    expect(r.structureChanged).toBe(false);
    expect(r.outcome).toMatchObject({ kind: 'rows' });
    if (r.outcome.kind === 'rows') expect(r.outcome.rows.map((u) => u.id)).toEqual([1, 5]);
    expect(r.roles.every((x) => x === 'data')).toBe(true);
  });
  it("breaks on O'Brien: the apostrophe ends the string and the rest becomes code", () => {
    const r = concatenated("O'Brien");
    expect(r.outcome.kind).toBe('syntax-error');
    expect(r.roles).toEqual(['data', 'code', 'code', 'code', 'code', 'code', 'code']);
  });
  it('keeps a curly apostrophe as data: only the ASCII quote delimits strings', () => {
    const r = concatenated('O’Brien');
    expect(r.structureChanged).toBe(false);
    expect(r.roles.every((x) => x === 'data')).toBe(true);
  });
  it('looks up the exact text, trailing space included', () => {
    const r = concatenated('Smith ');
    expect(r.outcome).toEqual({ kind: 'rows', rows: [] });
  });
  it('keeps the intended structure for any text without an ASCII quote', () => {
    const rnd = mulberry32(7);
    for (let n = 0; n < 2000; n++) {
      const text = randomText(rnd).replaceAll("'", '');
      const r = concatenated(text);
      expect(r.structureChanged).toBe(false);
      expect(r.roles.every((x) => x === 'data')).toBe(true);
    }
  });
});

describe('sending the name as a parameter', () => {
  it("finds O'Brien", () => {
    const r = parameterised("O'Brien");
    expect(r.outcome).toMatchObject({ kind: 'rows' });
    if (r.outcome.kind === 'rows') expect(r.outcome.rows.map((u) => u.first)).toEqual(['Siobhán']);
  });
  it('sends the same query text and structure for any input, and the value unchanged', () => {
    const rnd = mulberry32(11);
    for (let n = 0; n < 2000; n++) {
      const text = randomText(rnd, 20);
      const r = parameterised(text);
      expect(shapeOf(r.tokens)).toEqual(PARAM_SHAPE);
      expect(r.params).toEqual([text]);
    }
  });
  it('has the same shape as the intended query, with a placeholder where the string was', () => {
    expect(PARAM_SHAPE.slice(0, -1)).toEqual(INTENDED_SHAPE.slice(0, -1));
    expect(PARAM_SHAPE.at(-1)).toBe('param');
    expect(INTENDED_SHAPE.at(-1)).toBe('string');
  });
});
