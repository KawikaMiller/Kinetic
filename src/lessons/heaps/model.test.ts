import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from '../../core/random';
import { extractFrames, heapifyFrames, insertFrames, OUT_SHOWN, type OutItem } from './frames';
import { heapExtract, heapify, heapInsert, internalNodesBottomUp, isHeap, left, MAX, parent, right, type HItem } from './model';

const START = [2, 5, 3, 8, 9, 6, 4, 12, 10];
const items = (vs: number[], from = 1): HItem[] => vs.map((v, i) => ({ id: from + i, v }));
const vals = (a: HItem[]) => a.map((x) => x.v);
const depth = (i: number) => Math.floor(Math.log2(i + 1));

describe('index arithmetic', () => {
  it('children of i are 2i+1 and 2i+2, and each child\'s parent is ⌊(i−1)/2⌋ = i', () => {
    for (let i = 0; i < MAX; i++) {
      expect(parent(left(i))).toBe(i);
      expect(parent(right(i))).toBe(i);
    }
    expect([left(3), right(3)]).toEqual([7, 8]);
  });
  it('odd indices are left children (2i+1), even ones right children (2i+2), as the edge labels say', () => {
    for (let c = 1; c < MAX; c++) expect(c % 2 ? left(parent(c)) : right(parent(c))).toBe(c);
  });
  it(`${MAX} items fill exactly four levels`, () => {
    expect(depth(MAX - 1)).toBe(3);
    expect(depth(MAX)).toBe(4);
  });
});

describe('the heap property after every operation', () => {
  it('2,000 seeded inserts and extracts: always a heap, and extract-min matches a reference', () => {
    const rand = mulberry32(17);
    let heap: HItem[] = [];
    const ref: number[] = [];
    let id = 1;
    for (let k = 0; k < 2000; k++) {
      if (heap.length < MAX && (heap.length === 0 || rand() < 0.55)) {
        const v = 1 + Math.floor(rand() * 30);
        heap = heapInsert(heap, { id: id++, v }).items;
        ref.push(v);
      } else {
        const res = heapExtract(heap);
        ref.sort((a, b) => a - b);
        expect(res.min.v).toBe(ref.shift());
        heap = res.items;
      }
      expect(isHeap(vals(heap))).toBe(true);
      expect(vals(heap).sort((a, b) => a - b)).toEqual([...ref].sort((a, b) => a - b));
    }
  });

  it('every frame of an operation ends on a heap, identical to the model\'s result', () => {
    const h = items(START);
    const ins = insertFrames(h, [], { id: 99, v: 1 });
    expect(vals(ins.frames.at(-1)!.items)).toEqual(vals(heapInsert(h, { id: 99, v: 1 }).items));
    expect(isHeap(vals(ins.frames.at(-1)!.items))).toBe(true);
    const ext = extractFrames(h, []);
    expect(vals(ext.items)).toEqual(vals(heapExtract(h).items));
    expect(isHeap(vals(ext.frames.at(-1)!.items))).toBe(true);
    const hf = heapifyFrames(items(shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], mulberry32(4))));
    expect(isHeap(vals(hf.frames.at(-1)!.items))).toBe(true);
  });

  it('the stats on the last frame match the model\'s comparison and swap counts', () => {
    const h = items(START);
    const m = heapInsert(h, { id: 99, v: 1 });
    const last = insertFrames(h, [], { id: 99, v: 1 }).frames.at(-1)!;
    expect([last.comparisons, last.swaps]).toEqual([m.comparisons, m.swaps]);
  });
});

describe('O(log n): at most one swap per level', () => {
  it('insert compares once per level it climbs and never swaps more than the new slot\'s depth', () => {
    for (let n = 0; n < MAX; n++) {
      const h = heapify(items(Array.from({ length: n }, (_, i) => 10 + i))).items;
      const res = heapInsert(h, { id: 999, v: 0 }); // smaller than everything: climbs to the root
      expect(res.swaps).toBe(depth(n));
      expect(res.comparisons).toBe(depth(n));
      expect(res.end).toBe(0);
    }
  });
  it('extract-min swaps at most once per level on the way down', () => {
    const rand = mulberry32(8);
    for (let k = 0; k < 300; k++) {
      const n = 1 + Math.floor(rand() * MAX);
      const h = heapify(items(Array.from({ length: n }, () => Math.floor(rand() * 30)))).items;
      expect(heapExtract(h).swaps).toBeLessThanOrEqual(Math.max(0, depth(n - 2)));
    }
  });
  it('extracting everything comes out smallest-first: the run order', () => {
    let h = heapify(items(shuffle(START, mulberry32(2)))).items;
    const out: number[] = [];
    while (h.length) {
      const r = heapExtract(h);
      out.push(r.min.v);
      h = r.items;
    }
    expect(out).toEqual([...START].sort((a, b) => a - b));
  });
});

describe('heapify', () => {
  it('sifts down exactly the nodes that have children, deepest first', () => {
    for (let n = 1; n <= MAX; n++) {
      const nodes = internalNodesBottomUp(n);
      expect(nodes.every((i) => left(i) < n)).toBe(true);
      expect(nodes).toHaveLength(Array.from({ length: n }, (_, i) => i).filter((i) => left(i) < n).length);
      expect([...nodes].sort((a, b) => b - a)).toEqual(nodes);
    }
  });
  it('is cheaper than n inserts: fewer swaps on a worst-case (descending) array', () => {
    const desc = items(Array.from({ length: MAX }, (_, i) => MAX - i));
    const built = heapify(desc);
    let inserted: HItem[] = [];
    let insertSwaps = 0;
    for (const it of desc) {
      const r = heapInsert(inserted, it);
      inserted = r.items;
      insertSwaps += r.swaps;
    }
    expect(built.swaps).toBeLessThan(insertSwaps);
    expect(built.swaps).toBeLessThanOrEqual(MAX); // O(n): bounded by the item count
  });
});

describe('what the stage shows', () => {
  it('mid-extract the root is not always the minimum, which is why the Min stat flags it', () => {
    const { frames } = extractFrames(items(START), []);
    const rootIsMin = (f: (typeof frames)[number]) => f.items.every((x) => x.v >= f.items[0].v);
    expect(frames.some((f) => !rootIsMin(f))).toBe(true);
    expect(rootIsMin(frames.at(-1)!)).toBe(true);
  });
  it(`the run order numbers every extraction, even after the tray drops all but the latest ${OUT_SHOWN}`, () => {
    let h = items([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    let out: OutItem[] = [];
    for (let k = 0; k < 11; k++) ({ items: h, out } = extractFrames(h, out));
    expect(out).toHaveLength(OUT_SHOWN);
    expect(out.map((o) => o.run)).toEqual([11, 10, 9, 8, 7, 6, 5, 4]);
    expect(out.map((o) => o.v)).toEqual([11, 10, 9, 8, 7, 6, 5, 4]);
  });
  it('the starting heap is a heap but its array is not sorted (the quiz\'s misconception)', () => {
    expect(isHeap(START)).toBe(true);
    expect(START).not.toEqual([...START].sort((a, b) => a - b));
  });
});
