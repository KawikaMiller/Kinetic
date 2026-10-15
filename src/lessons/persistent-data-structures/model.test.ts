import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  capacity,
  childrenOf,
  corruptCells,
  createStore,
  depthFor,
  digits,
  measureCost,
  memorySeries,
  memorySlots,
  pathOf,
  read,
  reachable,
  setValue,
  sharedBy,
  slotsOf,
  valuesOf,
  type Store,
} from './model';

const range = (n: number) => Array.from({ length: n }, (_, i) => i * 10);

/** Freeze the store's arrays (the model already freezes every node, version and child list), so any write to an old version throws. */
function freezeStore(s: Store): Store {
  Object.freeze(s.nodes);
  Object.freeze(s.versions);
  return Object.freeze(s);
}

/** The reference: breadth-first reachability from the roots, using only the nodes' child lists. */
function bfsReachable(s: Store, roots: number[]): Set<number> {
  const seen = new Set<number>(roots.map((v) => s.versions[v].root));
  const queue = [...seen];
  while (queue.length) {
    const id = queue.shift() as number;
    for (const k of s.nodes[id].kids ?? []) {
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return seen;
}

describe('every version stays equal to the snapshot taken when it was made', () => {
  it.each([
    [8, 2],
    [16, 2],
    [16, 4],
    [64, 2],
    [64, 4],
    [64, 8],
  ])('200 seeds x 100 updates over %i values at branching %i, on a deep-frozen store', (n, b) => {
    let untouched = true;
    let wrong = 0;
    let reads = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      let s = freezeStore(createStore(range(n), b));
      const snapshots: number[][] = [range(n)];
      for (let i = 0; i < 100; i++) {
        const from = randInt(0, s.versions.length - 1, rnd);
        const index = randInt(0, n - 1, rnd);
        const value = randInt(-99, 99, rnd);
        const before = s;
        s = freezeStore(setValue(s, from, index, value));
        const next = [...snapshots[from]];
        next[index] = value;
        snapshots.push(next);
        untouched = untouched && before.nodes.every((node, k) => s.nodes[k] === node);
      }
      // every version at every index, against the snapshot taken when it was made
      for (let v = 0; v < s.versions.length; v++) {
        for (let i = 0; i < n; i++) {
          reads++;
          if (read(s, v, i) !== snapshots[v][i]) wrong++;
        }
        if (s.versions[v].recorded.join() !== snapshots[v].join()) wrong++;
      }
    }
    expect(untouched, 'an update never replaces or edits a node an older version can see').toBe(true);
    expect(wrong).toBe(0);
    expect(reads).toBe(200 * 101 * n);
  });
});
describe('allocation per update', () => {
  it.each([
    [8, 4],
    [16, 5],
    [1024, 11],
  ])('at b = 2 and n = %i an update allocates %i nodes, and k updates add k times that', (n, perUpdate) => {
    let s = createStore(range(n), 2);
    expect(s.nodes.length).toBe(2 * n - 1);
    const rnd = mulberry32(n);
    for (let k = 1; k <= 20; k++) {
      s = setValue(s, s.versions.length - 1, randInt(0, n - 1, rnd), k);
      expect(s.versions[s.versions.length - 1].copied).toHaveLength(perUpdate);
      expect(s.nodes.length).toBe(2 * n - 1 + k * perUpdate);
    }
    expect(depthFor(n, 2) + 1).toBe(perUpdate);
  });

  it.each([2, 4, 8, 32])('measured cost at b = %i: nodes = depth + 1 and slots = depth x b + 1, against n slots for a full copy', (b) => {
    for (const n of [b, b * b, b ** 3].filter((x) => x <= 1024)) {
      const c = measureCost(n, b);
      expect(c.depth).toBe(Math.round(Math.log(n) / Math.log(b)));
      expect(c.nodesCopied).toBe(c.depth + 1);
      expect(c.slotsCopied).toBe(c.depth * b + 1);
      expect(c.fullCopy).toBe(n);
    }
  });

  it('a value count that is not a power of b is rounded up with zeros and the depth follows ceil(log_b n)', () => {
    expect(depthFor(5, 2)).toBe(3);
    expect(depthFor(8, 2)).toBe(3);
    expect(depthFor(9, 2)).toBe(4);
    expect(depthFor(1, 2)).toBe(1);
    const s = createStore([7, 8, 9, 1, 2], 2);
    expect(capacity(s)).toBe(8);
    expect(valuesOf(s, 0)).toEqual([7, 8, 9, 1, 2, 0, 0, 0]);
  });

  it('digits are the base-b expansion with depth digits', () => {
    expect(digits(5, 2, 3)).toEqual([1, 0, 1]);
    expect(digits(13, 4, 3)).toEqual([0, 3, 1]);
    expect(digits(0, 8, 2)).toEqual([0, 0]);
  });
});

describe('structure sharing', () => {
  it('a path-copy update shares every node off the path with the old version', () => {
    let s = createStore(range(8), 2);
    s = setValue(s, 0, 5, 77);
    const oldNodes = reachable(s, [0]);
    const newNodes = reachable(s, [1]);
    const shared = [...newNodes].filter((id) => oldNodes.has(id));
    expect(newNodes.size).toBe(15);
    expect(shared).toHaveLength(15 - 4);
    expect(new Set(s.versions[1].copied)).toEqual(new Set([...newNodes].filter((id) => !oldNodes.has(id))));
    const counts = sharedBy(s, [0, 1]);
    expect([...counts.values()].filter((c) => c === 2)).toHaveLength(11);
    expect([...counts.values()].filter((c) => c === 1)).toHaveLength(4 + 4);
  });

  it('the path of the edit runs from the root to the leaf, one node per level', () => {
    const s = setValue(createStore(range(16), 2), 0, 11, 5);
    const path = pathOf(s, 1, 11);
    expect(path).toHaveLength(5);
    expect(path).toEqual(s.versions[1].copied);
  });

  it('memory after k updates is the initial tree plus k x (depth x b + 1) slots, against k + 1 full copies', () => {
    for (const [n, b] of [[8, 2], [64, 4], [1024, 2], [1024, 32]] as const) {
      const c = measureCost(n, b);
      for (const k of [0, 1, 5, 20]) {
        const m = memorySeries(n, b, k, mulberry32(k + 1));
        expect(m.persistent[k]).toBe(c.initialSlots + k * c.slotsCopied);
        expect(m.fullCopies[k]).toBe((k + 1) * n);
      }
    }
  });

  it('a tiny array saves nothing at first: at n = 8 and b = 2 the tree costs more than the copies until k passes 14', () => {
    const c = measureCost(8, 2);
    expect(c.initialSlots).toBe(22);
    expect(c.slotsCopied).toBe(7);
    const wins = (k: number) => c.initialSlots + k * c.slotsCopied < (k + 1) * c.fullCopy;
    expect(wins(14)).toBe(false);
    expect(wins(15)).toBe(true);
    expect(measureCost(1024, 2).initialSlots + 3 * measureCost(1024, 2).slotsCopied).toBeLessThan(4 * 1024);
  });

  it('slots: a leaf is one, an internal node is b', () => {
    const s = createStore(range(8), 2);
    const leaf = s.nodes.find((n) => n.kids === null)!;
    const inner = s.nodes.find((n) => n.kids !== null)!;
    expect(slotsOf(leaf)).toBe(1);
    expect(slotsOf(inner)).toBe(2);
  });
});

describe('the broken variant: mutate in place', () => {
  it('changes every version that shares the leaf, and the version check notices on v0', () => {
    let s = createStore(range(8), 2);
    expect(corruptCells(s, 0)).toEqual([]);
    s = setValue(s, 0, 5, 77, 'inplace');
    expect(valuesOf(s, 0)[5]).toBe(77);
    expect(s.versions[0].recorded[5]).toBe(50);
    expect(corruptCells(s, 0)).toEqual([5]);
    expect(corruptCells(s, 1)).toEqual([]);
    expect(s.nodes.length).toBe(15);
    const good = setValue(createStore(range(8), 2), 0, 5, 77);
    expect(corruptCells(good, 0)).toEqual([]);
    expect(valuesOf(good, 0)[5]).toBe(50);
  });

  it('writing into a frozen store throws, so the broken update cannot be passing as a copy: it replaces a node the old version still points at', () => {
    const frozen = freezeStore(createStore(range(8), 2));
    const next = setValue(frozen, 0, 5, 77, 'inplace');
    const replaced = next.nodes.filter((n, i) => n !== frozen.nodes[i]);
    expect(replaced).toHaveLength(1);
    expect(reachable(next, [0]).has(replaced[0].id)).toBe(true);
    expect(() => {
      (frozen.nodes as unknown as { value: number }[])[0].value = 1;
    }).toThrow();
  });

  it('the check catches the in-place corruption on seeded runs and never flags the path-copy version', () => {
    let caught = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = mulberry32(seed);
      let bad = createStore(range(16), 2);
      let good = createStore(range(16), 2);
      for (let i = 0; i < 6; i++) {
        const idx = randInt(0, 15, rnd);
        const val = randInt(100, 199, rnd);
        bad = setValue(bad, bad.versions.length - 1, idx, val, 'inplace');
        good = setValue(good, good.versions.length - 1, idx, val);
      }
      if (corruptCells(bad, 0).length > 0) caught++;
      for (let v = 0; v < good.versions.length; v++) expect(corruptCells(good, v)).toEqual([]);
    }
    expect(caught).toBe(100);
  });
});

describe('garbage: what nothing reaches', () => {
  it('marking from the live versions equals a breadth-first reference walk, over seeded version trees', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = mulberry32(seed);
      let s = createStore(range(16), 2);
      for (let i = 0; i < 8; i++) s = setValue(s, randInt(0, s.versions.length - 1, rnd), randInt(0, 15, rnd), i + 1);
      const live = s.versions.map((v) => v.id).filter(() => rnd() < 0.5);
      if (!live.length) live.push(0);
      expect(reachable(s, live)).toEqual(bfsReachable(s, live));
      const garbage = s.nodes.filter((n) => !reachable(s, live).has(n.id)).length;
      expect(garbage + reachable(s, live).size).toBe(s.nodes.length);
    }
  });

  it('a node becomes garbage exactly when the last live version that reaches it is dropped', () => {
    let s = createStore(range(8), 2);
    s = setValue(s, 0, 2, 11);
    s = setValue(s, 1, 6, 22);
    s = setValue(s, 0, 3, 33);
    const all = [0, 1, 2, 3];
    for (const drop of [[2], [2, 0], [2, 0, 3], [2, 0, 3, 1]]) {
      const live = all.filter((v) => !drop.includes(v));
      const before = sharedBy(s, all.filter((v) => !drop.slice(0, -1).includes(v)));
      const count = new Map(sharedBy(s, live));
      for (const node of s.nodes) {
        const reached = reachable(s, live).has(node.id);
        expect(reached, `node ${node.id} after dropping ${drop}`).toBe((count.get(node.id) ?? 0) > 0);
        if (before.get(node.id) === 1 && !reached) {
          const last = drop[drop.length - 1];
          expect(reachable(s, [last]).has(node.id), 'the dropped version was the last to reach it').toBe(true);
        }
      }
    }
    expect(memorySlots(s, [])).toBe(0);
  });

  it('memory falls only by the nodes no live version shares', () => {
    let s = createStore(range(8), 2);
    s = setValue(s, 0, 5, 77);
    const both = memorySlots(s, [0, 1]);
    const only1 = memorySlots(s, [1]);
    const only0 = memorySlots(s, [0]);
    expect(only0).toBe(22);
    expect(only1).toBe(22);
    expect(both).toBe(22 + 7);
    expect(both - only1).toBe(only0 - (22 - 7));
  });
});

describe('versions form a tree', () => {
  it('forking from v2 makes v3 and v4 children of v2, and leaves v2 and its parent untouched', () => {
    let s = createStore(range(8), 2);
    s = setValue(s, 0, 1, 11);
    s = setValue(s, 1, 2, 22);
    const v2 = s.versions[2];
    const before = valuesOf(s, 2);
    s = setValue(s, 2, 3, 33);
    s = setValue(s, 2, 4, 44);
    expect(childrenOf(s, 2)).toEqual([3, 4]);
    expect(s.versions[3].parent).toBe(2);
    expect(s.versions[4].parent).toBe(2);
    expect(s.versions[2]).toBe(v2);
    expect(valuesOf(s, 2)).toEqual(before);
    expect(valuesOf(s, 3)[3]).toBe(33);
    expect(valuesOf(s, 3)[4]).toBe(40);
    expect(valuesOf(s, 4)[3]).toBe(30);
    expect(valuesOf(s, 4)[4]).toBe(44);
  });

  it('undo is the parent pointer and redo returns to the same version id', () => {
    let s = createStore(range(8), 2);
    s = setValue(s, 0, 1, 11);
    s = setValue(s, 1, 2, 22);
    const redo: number[] = [];
    let current = 2;
    const undo = () => {
      redo.push(current);
      current = s.versions[current].parent as number;
    };
    undo();
    expect(current).toBe(1);
    undo();
    expect(current).toBe(0);
    current = redo.pop() as number;
    expect(current).toBe(1);
    current = redo.pop() as number;
    expect(current).toBe(2);
    expect(valuesOf(s, current)).toEqual([0, 11, 22, 30, 40, 50, 60, 70]);
  });
});
