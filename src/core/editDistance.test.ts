import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from './random';
import { editTable, INDEL, LEVENSHTEIN, type Costs } from './editDistance';

/** The textbook recursive definition, no table: the independent reference. */
function recursive(a: string, b: string, c: Costs): number {
  if (a === '') return b.length * c.ins;
  if (b === '') return a.length * c.del;
  const last = a[a.length - 1] === b[b.length - 1] ? 0 : c.sub;
  return Math.min(
    recursive(a.slice(0, -1), b, c) + c.del,
    recursive(a, b.slice(0, -1), c) + c.ins,
    recursive(a.slice(0, -1), b.slice(0, -1), c) + last,
  );
}

const seeded = (rnd: Rnd, max: number) => Array.from({ length: randInt(0, max, rnd) }, () => 'abc'[randInt(0, 2, rnd)]).join('');
const distance = (a: string, b: string, c: Costs = LEVENSHTEIN) => editTable(a, b, c).d[[...a].length][[...b].length];

describe('editTable', () => {
  it('matches the recursive definition on seeded pairs up to length 7, with both cost settings', () => {
    const rnd = mulberry32(51);
    for (let t = 0; t < 300; t++) {
      const a = seeded(rnd, 7);
      const b = seeded(rnd, 7);
      expect(distance(a, b), `${a} / ${b}`).toBe(recursive(a, b, LEVENSHTEIN));
      expect(distance(a, b, INDEL), `${a} / ${b}`).toBe(recursive(a, b, INDEL));
    }
  });

  it('gives the published values', () => {
    expect(distance('kitten', 'sitting')).toBe(3);
    expect(distance('flaw', 'lawn')).toBe(2);
    expect(distance('intention', 'execution')).toBe(5);
  });

  it("empty strings give the other's length", () => {
    expect(distance('', 'abc')).toBe(3);
    expect(distance('abcd', '')).toBe(4);
    expect(distance('', '')).toBe(0);
  });
});
