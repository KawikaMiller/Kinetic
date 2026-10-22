import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  LEAF_MAX, arrayCreate, arrayDelete, arrayInsert, codePoints, depthBound, gapCreate, gapDelete, gapInsert, gapInvariantViolations, gapLength, gapMoveTo, gapText,
  hasLoneSurrogate, needsRebalance, ropeBuild, ropeConcat, ropeCreate, ropeDelete, ropeDepth, ropeIndex, ropeInsert, ropeInvariantViolations, ropeLeaves, ropeRebalance, ropeSplit, ropeText,
  type GapBug, type RopeBug,
} from './structures';

const ALPHABET = ['a', 'b', 'c', ' ', 'é', '日', '😀', '👍', 'z'];
const randomText = (rnd: () => number, n: number) => Array.from({ length: n }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]);

type Op = { kind: 'insert'; at: number; items: string[] } | { kind: 'delete'; from: number; to: number } | { kind: 'move'; to: number };

/** A seeded operation list; positions are drawn against the reference length so every op is valid. */
function* operations(seed: number, count: number, refLength: () => number): Generator<Op> {
  const rnd = mulberry32(seed);
  for (let n = 0; n < count; n++) {
    const len = refLength();
    const roll = rnd();
    if (roll < 0.45 || len === 0) yield { kind: 'insert', at: Math.floor(rnd() * (len + 1)), items: randomText(rnd, 1 + Math.floor(rnd() * 4)) };
    else if (roll < 0.6) yield { kind: 'insert', at: Math.floor(rnd() * (len + 1)), items: randomText(rnd, 20 + Math.floor(rnd() * 40)) };
    else if (roll < 0.85) {
      const a = Math.floor(rnd() * len);
      yield { kind: 'delete', from: a, to: Math.min(len, a + 1 + Math.floor(rnd() * 12)) };
    } else yield { kind: 'move', to: Math.floor(rnd() * (len + 1)) };
  }
}

describe('all three structures against a plain string splice', () => {
  it('equal the reference after every operation, for 300 seeds x 200 operations of inserts, pastes, range deletes and cursor moves (multi-byte characters included)', () => {
    for (let seed = 0; seed < 300; seed++) {
      const start = randomText(mulberry32(seed + 1000), 30);
      const ref = [...start];
      const arr = arrayCreate(start);
      const gap = gapCreate(start);
      const rope = ropeCreate();
      rope.root = ropeBuild(rope, start);
      let cursor = start.length;
      for (const op of operations(seed, 200, () => ref.length)) {
        if (op.kind === 'insert') {
          ref.splice(op.at, 0, ...op.items);
          arrayInsert(arr, op.at, op.items);
          gapInsert(gap, op.at, op.items);
          ropeInsert(rope, op.at, op.items);
          cursor = op.at + op.items.length;
        } else if (op.kind === 'delete') {
          ref.splice(op.from, op.to - op.from);
          arrayDelete(arr, op.from, op.to);
          gapDelete(gap, op.from, op.to);
          ropeDelete(rope, op.from, op.to);
          cursor = op.from;
        } else {
          gapMoveTo(gap, op.to);
          cursor = op.to;
        }
        if (needsRebalance(rope)) ropeRebalance(rope);
        const want = ref.join('');
        expect(arr.chars.join(''), `array seed ${seed}`).toBe(want);
        expect(gapText(gap).join(''), `gap seed ${seed}`).toBe(want);
        expect(ropeText(rope).join(''), `rope seed ${seed}`).toBe(want);
        expect(gapInvariantViolations(gap, ref, cursor), `gap seed ${seed}`).toEqual([]);
        expect(ropeInvariantViolations(rope, ref), `rope seed ${seed}`).toEqual([]);
        expect(ropeDepth(rope)).toBeLessThanOrEqual(Math.max(depthBound(ropeLeaves(rope).length), 2));
      }
      for (let i = 0; i < ref.length; i += 7) expect(ropeIndex(rope, i).char, `index ${i} seed ${seed}`).toBe(ref[i]);
    }
  }, 180_000);

  it('index(i) equals string[i] for every i on a rope built from a long mixed text, and split(i) then concat returns the original', () => {
    const text = randomText(mulberry32(5), 300);
    const rope = ropeCreate();
    rope.root = ropeBuild(rope, text);
    for (let i = 0; i < text.length; i++) expect(ropeIndex(rope, i).char).toBe(text[i]);
    for (let i = 0; i <= text.length; i += 13) {
      const [a, b] = ropeSplit(rope, rope.root, i);
      expect(ropeText(rope, a).join('') + ropeText(rope, b).join('')).toBe(text.join(''));
      const joined = ropeConcat(rope, a, b);
      expect(ropeText(rope, joined)).toEqual(text);
      expect(ropeText(rope, a)).toHaveLength(i);
    }
  });

  it('leaves stay within the limit, and a rebalance brings the depth to at most the stated bound', () => {
    const rope = ropeCreate();
    rope.root = ropeBuild(rope, randomText(mulberry32(2), 40));
    // many single-character inserts at the front fragment the leaves and deepen the tree
    for (let n = 0; n < 150; n++) ropeInsert(rope, 0, ['x']);
    for (const id of ropeLeaves(rope)) expect(rope.nodes[id].leaf!.length).toBeLessThanOrEqual(LEAF_MAX);
    ropeRebalance(rope);
    expect(ropeDepth(rope)).toBeLessThanOrEqual(depthBound(ropeLeaves(rope).length));
    expect(ropeInvariantViolations(rope, ropeText(rope))).toEqual([]);
    expect(depthBound(1)).toBe(2);
    expect(depthBound(9)).toBe(8);
  });
});

describe('touch counts', () => {
  it('an array insert at i costs exactly n - i moves: 60 characters at position 10 costs 50', () => {
    const a = arrayCreate(Array.from({ length: 60 }, () => 'a'));
    arrayInsert(a, 10, ['x']);
    expect(a.moves).toBe(50);
    expect(a.writes).toBe(1);
    const b = arrayCreate(Array.from({ length: 60 }, () => 'a'));
    arrayInsert(b, 60, ['x']);
    expect(b.moves).toBe(0);
    arrayDelete(b, 0, 5);
    expect(b.moves).toBe(61 - 5);
  });

  it('a gap-buffer cursor move of d costs exactly d moves, an insert into a non-empty gap exactly 1, and capacity never drops below the content', () => {
    const g = gapCreate(codePoints('hello world'));
    gapMoveTo(g, 3);
    expect(g.moves).toBe(8);
    gapMoveTo(g, 10);
    expect(g.moves).toBe(8 + 7);
    const before = g.moves;
    gapInsert(g, 10, ['!']);
    expect([g.moves - before, g.writes, g.copies]).toEqual([0, 1, 0]);
    for (let i = 0; i < 100; i++) {
      gapInsert(g, Math.floor(i / 2), ['q']);
      expect(g.buf.length).toBeGreaterThanOrEqual(gapLength(g));
    }
    expect(g.grows).toBeGreaterThan(0);
    expect(g.copies).toBeGreaterThan(0);
  });

  it('the capacity doubles when the gap would be left empty, copying the content once', () => {
    const g = gapCreate([], 4);
    for (const c of 'abc') gapInsert(g, g.start, [c]);
    expect([g.buf.length, g.grows, g.copies]).toEqual([4, 0, 0]);
    gapInsert(g, g.start, ['d']);
    expect([g.buf.length, g.grows, g.copies]).toEqual([8, 1, 3]);
    expect(gapText(g).join('')).toBe('abcd');
  });

  it('a rope split reads no more nodes than the tree is deep', () => {
    const rope = ropeCreate();
    rope.root = ropeBuild(rope, randomText(mulberry32(3), 500));
    const depth = ropeDepth(rope);
    for (let i = 1; i < 500; i += 17) {
      const before = rope.reads;
      ropeSplit(rope, rope.root, i);
      expect(rope.reads - before).toBeLessThanOrEqual(depth);
    }
    expect(ropeIndex(rope, 250).path.length).toBeLessThanOrEqual(depth);
  });

  it('concatenation creates one node, and a split shares everything off the cut path', () => {
    const rope = ropeCreate();
    const a = ropeBuild(rope, codePoints('abcdefghij'));
    const b = ropeBuild(rope, codePoints('klmnop'));
    const created = rope.created;
    const joined = ropeConcat(rope, a, b);
    expect(rope.created - created).toBe(1);
    expect(rope.nodes[joined!].weight).toBe(10);
    const [l, r] = ropeSplit(rope, joined, 3);
    expect(ropeText(rope, l).join('')).toBe('abc');
    expect(ropeText(rope, r).join('')).toBe('defghijklmnop');
    expect(rope.nodes.length).toBeLessThan(created + 12);
  });
});

describe('broken variants are rejected by the string-equality oracle', () => {
  it('a rope whose weight is not updated on split returns the wrong characters on the lowest failing seed', () => {
    const bug: RopeBug = 'stale-weight';
    let lowest = -1;
    for (let seed = 0; seed < 100 && lowest < 0; seed++) {
      const start = randomText(mulberry32(seed + 1000), 30);
      const ref = [...start];
      const rope = ropeCreate();
      rope.root = ropeBuild(rope, start);
      for (const op of operations(seed, 60, () => ref.length)) {
        if (op.kind === 'insert') {
          ref.splice(op.at, 0, ...op.items);
          ropeInsert(rope, op.at, op.items, bug);
        } else if (op.kind === 'delete') {
          ref.splice(op.from, op.to - op.from);
          ropeDelete(rope, op.from, op.to, bug);
        }
        const bad = ropeText(rope).join('') !== ref.join('') || ropeInvariantViolations(rope, ref).length > 0 || ref.some((c, i) => ropeIndex(rope, i).char !== c);
        if (bad) {
          lowest = seed;
          break;
        }
      }
    }
    expect(lowest).toBe(BROKEN_SEEDS.rope);
  });

  it('a gap buffer that forgets to move the gap before an insert puts text in the wrong place on the lowest failing seed', () => {
    const bug: GapBug = 'no-move';
    let lowest = -1;
    for (let seed = 0; seed < 100 && lowest < 0; seed++) {
      const start = randomText(mulberry32(seed + 1000), 30);
      const ref = [...start];
      const gap = gapCreate(start);
      for (const op of operations(seed, 60, () => ref.length)) {
        if (op.kind === 'insert') {
          ref.splice(op.at, 0, ...op.items);
          gapInsert(gap, op.at, op.items, bug);
        } else if (op.kind === 'delete') {
          ref.splice(op.from, op.to - op.from);
          gapDelete(gap, op.from, op.to);
        }
        if (gapText(gap).join('') !== ref.join('')) {
          lowest = seed;
          break;
        }
      }
    }
    expect(lowest).toBe(BROKEN_SEEDS.gap);
  });
});

const BROKEN_SEEDS = { rope: 0, gap: 0 };

describe('hostile text', () => {
  it('lone surrogates are detected, whole emoji are not, and an emoji is one code point', () => {
    expect(hasLoneSurrogate('\ud83d')).toBe(true);
    expect(hasLoneSurrogate('\ude00x')).toBe(true);
    expect(hasLoneSurrogate('a😀b')).toBe(false);
    expect(codePoints('a😀b')).toHaveLength(3);
    expect('a😀b'.length).toBe(4);
  });

  it('an empty text, deleting nothing and inserting nothing are safe on all three', () => {
    const rope = ropeCreate();
    ropeInsert(rope, 0, []);
    expect(ropeText(rope)).toEqual([]);
    ropeDelete(rope, 0, 0);
    ropeInsert(rope, 0, ['a']);
    expect(ropeText(rope)).toEqual(['a']);
    const g = gapCreate([]);
    gapDelete(g, 0, 0);
    expect(gapText(g)).toEqual([]);
    const a = arrayCreate([]);
    arrayDelete(a, 0, 0);
    expect(a.chars).toEqual([]);
  });
});
