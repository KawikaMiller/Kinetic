import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BUCKETS, MAPPINGS, applyOp, bucketOf, cardinalityLimits, classify, inResult, moveElement, parseMembers, toggleArrow, universe,
  type Arrow, type Membership, type Op,
} from './model';

const sets = { A: ['1', '2', '3'], B: ['2', '3', '4'], C: ['3', '5'] };

describe('set operations', () => {
  it('match their definitions', () => {
    expect(applyOp('union', sets)).toEqual(['1', '2', '3', '4']);
    expect(applyOp('intersection', sets)).toEqual(['2', '3']);
    expect(applyOp('difference', sets)).toEqual(['1']);
    expect(applyOp('symmetric', sets)).toEqual(['1', '4']);
    expect(applyOp('union3', sets)).toEqual(['1', '2', '3', '4', '5']);
    expect(applyOp('intersection3', sets)).toEqual(['3']);
  });
  it('the two-set operations ignore C', () => {
    for (const op of ['union', 'intersection', 'difference', 'symmetric'] as Op[]) {
      expect(applyOp(op, { ...sets, C: ['1', '99'] })).toEqual(applyOp(op, { ...sets, C: [] }));
    }
  });
  it('agree with JavaScript Set maths on 300 random pairs', () => {
    const rnd = mulberry32(5);
    const pick = () => [...new Set(Array.from({ length: Math.floor(rnd() * 7) }, () => String(Math.floor(rnd() * 9))))];
    for (let i = 0; i < 300; i++) {
      const A = pick();
      const B = pick();
      const a = new Set(A);
      const b = new Set(B);
      const s = { A, B, C: [] };
      expect(new Set(applyOp('union', s))).toEqual(new Set([...a, ...b]));
      expect(new Set(applyOp('intersection', s))).toEqual(new Set(A.filter((x) => b.has(x))));
      expect(new Set(applyOp('difference', s))).toEqual(new Set(A.filter((x) => !b.has(x))));
      expect(new Set(applyOp('symmetric', s))).toEqual(new Set([...A.filter((x) => !b.has(x)), ...B.filter((x) => !a.has(x))]));
    }
  });
  it('handle the empty set', () => {
    const empty = { A: [], B: ['x'], C: [] };
    expect(applyOp('union', empty)).toEqual(['x']);
    expect(applyOp('intersection', empty)).toEqual([]);
    expect(applyOp('difference', empty)).toEqual([]);
    expect(applyOp('union', { A: [], B: [], C: [] })).toEqual([]);
  });
  it('inResult covers all 8 memberships consistently with the formulas', () => {
    for (let k = 0; k < 8; k++) {
      const m: Membership = { A: !!(k & 4), B: !!(k & 2), C: !!(k & 1) };
      expect(inResult('symmetric', m)).toBe((m.A || m.B) && !(m.A && m.B));
      expect(inResult('difference', m)).toBe(m.A && !(m.A && m.B));
    }
  });
  it('parseMembers splits on commas/spaces and drops duplicates', () => {
    expect(parseMembers(' ada, grace  ada,,linus ')).toEqual(['ada', 'grace', 'linus']);
    expect(parseMembers('   ')).toEqual([]);
  });
  it('moveElement puts an element in exactly the chosen sets', () => {
    const next = moveElement(sets, '3', { A: false, B: true, C: false });
    expect(universe(next).find((e) => e.name === '3')?.m).toEqual({ A: false, B: true, C: false });
    expect(next.B).toEqual(['2', '3', '4']);
    expect(moveElement(sets, 'new', { A: true, B: false, C: true }).C).toEqual(['3', '5', 'new']);
  });
});

describe('classifying a mapping', () => {
  it('a one-to-one, onto mapping is a bijection', () => {
    expect(classify(3, 3, [{ from: 0, to: 2 }, { from: 1, to: 0 }, { from: 2, to: 1 }]).kind).toBe('bijective');
  });
  it('two inputs to one output is still a function, just not injective', () => {
    const c = classify(3, 3, [{ from: 0, to: 0 }, { from: 1, to: 0 }, { from: 2, to: 1 }]);
    expect(c.isFunction).toBe(true);
    expect(c.kind).toBe('function');
    expect(c.collisions).toEqual([0]);
    expect(c.unused).toEqual([2]);
  });
  it('an input with two arrows is not a function', () => {
    const c = classify(2, 3, [{ from: 0, to: 0 }, { from: 0, to: 1 }, { from: 1, to: 2 }]);
    expect(c.kind).toBe('not-a-function');
    expect(c.multi).toEqual([0]);
  });
  it('an input with no arrow is not a (total) function', () => {
    const c = classify(3, 3, [{ from: 0, to: 0 }, { from: 2, to: 1 }]);
    expect(c.kind).toBe('not-a-function');
    expect(c.missing).toEqual([1]);
  });
  it('injective-only and surjective-only cases', () => {
    expect(classify(2, 3, [{ from: 0, to: 0 }, { from: 1, to: 2 }]).kind).toBe('injective');
    expect(classify(3, 2, [{ from: 0, to: 0 }, { from: 1, to: 1 }, { from: 2, to: 1 }]).kind).toBe('surjective');
  });
  it('the empty domain maps vacuously: a function, injective, and onto only an empty codomain', () => {
    expect(classify(0, 0, []).kind).toBe('bijective');
    expect(classify(0, 2, []).kind).toBe('injective');
  });
  it('pigeonhole: with more inputs than outputs no function is injective (400 random functions)', () => {
    const rnd = mulberry32(9);
    for (let i = 0; i < 400; i++) {
      const n = 2 + Math.floor(rnd() * 6);
      const m = 1 + Math.floor(rnd() * 7);
      const arrows: Arrow[] = Array.from({ length: n }, (_, from) => ({ from, to: Math.floor(rnd() * m) }));
      const c = classify(n, m, arrows);
      const limits = cardinalityLimits(n, m);
      if (!limits.injectionPossible) expect(c.injective).toBe(false);
      if (!limits.surjectionPossible) expect(c.surjective).toBe(false);
    }
  });
  it('toggleArrow adds and removes', () => {
    const a = toggleArrow([], { from: 0, to: 1 });
    expect(a).toEqual([{ from: 0, to: 1 }]);
    expect(toggleArrow(a, { from: 0, to: 1 })).toEqual([]);
  });
});

describe('presets', () => {
  it('user → id is a bijection, person → birthday is neither injective nor surjective', () => {
    const byId = (id: string) => MAPPINGS.find((m) => m.id === id)!;
    const cls = (id: string) => classify(byId(id).domain.length, byId(id).codomain.length, byId(id).arrows);
    expect(cls('ids').kind).toBe('bijective');
    expect(cls('birthday').kind).toBe('function');
    expect(cls('birthday').collisions.length).toBeGreaterThan(0);
  });
  it('hashing 10 strings into 8 buckets must collide, and uses the real bucket of each string', () => {
    const h = MAPPINGS.find((m) => m.id === 'hash')!;
    expect(h.domain.length).toBeGreaterThan(BUCKETS);
    const c = classify(h.domain.length, h.codomain.length, h.arrows);
    expect(c.isFunction).toBe(true);
    expect(c.injective).toBe(false);
    h.arrows.forEach((a) => expect(a.to).toBe(bucketOf(h.domain[a.from])));
  });
});
