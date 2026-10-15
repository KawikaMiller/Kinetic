import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { expectCaption } from '../../core/testing/captions';
import { COLUMN_PX, dagLayout } from './dagLayout';
import { docStart } from './docState';
import { VERSION_TREE, versionDepth, versionTreeHeight } from './versionTree';
import { FACTS } from './facts';
import lesson from './index';
import { VERSION_LIMIT, parseIndex, parseValue, refuseVersion } from './keys';
import {
  capacity,
  childrenOf,
  corruptCells,
  createStore,
  measureCost,
  memorySeries,
  memorySlots,
  pathOf,
  reachable,
  setValue,
  updateMode,
  valuesOf,
  versionsSharingLeaf,
} from './model';
import { BRANCHING, COST_SIZES, DOC_B, DOC_VALUES, MAX_UPDATES, SMALL_B, SMALL_VALUES } from './presets';
import { costCaption, docCaption, pathCaption } from './text';

const text = (node: string) => expectCaption(node);

/** Reference: breadth-first reachability from the roots, using only the nodes' child lists. */
function bfs(s: ReturnType<typeof createStore>, versions: number[]): Set<number> {
  const seen = new Set<number>(versions.map((v) => s.versions[v].root));
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

describe('the version tree is sized from its depth', () => {
  it('a straight chain of 12 versions and a branched one both fit above the bottom edge, and the box grows with each level', () => {
    let chain = createStore(SMALL_VALUES, SMALL_B);
    for (let k = 0; k < VERSION_LIMIT - 1; k++) chain = setValue(chain, k, k % 8, 10 + k);
    expect(chain.versions).toHaveLength(VERSION_LIMIT);
    expect(versionDepth(chain)).toBe(VERSION_LIMIT);
    // node y is top + levelGap x level (TreeSvg); the deepest node's bottom edge must sit inside the box
    const deepestBottom = VERSION_TREE.top + VERSION_TREE.levelGap * (VERSION_LIMIT - 1) + VERSION_TREE.radius;
    expect(versionTreeHeight(VERSION_LIMIT)).toBeGreaterThan(deepestBottom);
    expect(versionTreeHeight(VERSION_LIMIT)).toBeGreaterThan(versionTreeHeight(5));
    let branched = createStore(SMALL_VALUES, SMALL_B);
    for (let k = 0; k < VERSION_LIMIT - 1; k++) branched = setValue(branched, 0, k % 8, 10 + k);
    expect(versionDepth(branched)).toBe(2);
    expect(versionTreeHeight(1)).toBeGreaterThan(VERSION_TREE.top + VERSION_TREE.radius);
  });
});

describe('scene switches', () => {
  it('a component that two scenes share is keyed per scene, so the second scene opens fresh', () => {
    expect(sharedSceneComponents('persistent-data-structures')).toEqual(['PathScene']);
    expect(sceneElements('persistent-data-structures').every((e) => e.keyed || !sharedSceneComponents('persistent-data-structures').includes(e.component))).toBe(true);
  });

  it('after a copy edit then an in-place edit of the same cell, the in-place caption names only the versions that reach the leaf, not v0', () => {
    const copied = setValue(createStore(SMALL_VALUES, SMALL_B), 0, 5, 7, 'path');
    const s = setValue(copied, 1, 5, 3, 'inplace');
    expect(valuesOf(s, 0)[5]).toBe(SMALL_VALUES[5]);
    expect(versionsSharingLeaf(s, 2, 5)).toEqual([1]);
    expect(versionsSharingLeaf(setValue(createStore(SMALL_VALUES, SMALL_B), 0, 5, 7, 'inplace'), 1, 5)).toEqual([0]);
    const caption = text(pathCaption({ n: 8, levels: 4, version: 2, parent: 1, edit: { index: 5, value: 3 }, copied: 0, shared: 15, total: 15, stored: 19, corruptViewed: null, reached: [1] }));
    expect(caption).toContain('a leaf that v1 and v2 reach');
    expect(caption).not.toContain('v0');
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: on 8 cells one update allocates depth + 1 = 4 nodes and shares 11 of the 15 in v1; v0 still reads what it did', () => {
    const v0 = createStore(SMALL_VALUES, SMALL_B);
    expect(v0.nodes).toHaveLength(2 * 8 - 1);
    const s = setValue(v0, 0, 5, 7);
    expect(Math.log2(8) + 1).toBe(4);
    expect(s.versions[1].copied).toHaveLength(4);
    const inV1 = bfs(s, [1]);
    const inV0 = bfs(s, [0]);
    expect(inV1.size).toBe(15);
    expect([...inV1].filter((id) => inV0.has(id))).toHaveLength(11);
    expect(valuesOf(s, 0)).toEqual(SMALL_VALUES);
    expect(valuesOf(s, 1)[5]).toBe(7);
    expect(FACTS).toMatchObject({ pathNodes: 4, pathShared: 11, pathTotal: 15, pathStored: 19 });
    const caption = text(pathCaption({ n: 8, levels: 4, version: 1, parent: 0, edit: { index: 5, value: 7 }, copied: 4, shared: 11, total: 15, stored: 19, corruptViewed: null, reached: [] }));
    expect(caption).toContain('copied 4 nodes (the leaf and its 3 ancestors), and 11 of v1\'s 15 nodes are shared with v0, which is untouched');
    expect(lesson.tryThis[0]).toContain('4 nodes are allocated');
    expect(lesson.tryThis[0]).toContain('11 of the 15 nodes in v1');
  });

  it('try-this 2: in place, v0 walks to 7 at cell 5 although it recorded 9, and only cell 5 is flagged', () => {
    const s = setValue(createStore(SMALL_VALUES, SMALL_B), 0, 5, 7, 'inplace');
    expect(valuesOf(s, 0)[5]).toBe(7);
    expect(s.versions[0].recorded[5]).toBe(9);
    expect(SMALL_VALUES[5]).toBe(9);
    expect(corruptCells(s, 0)).toEqual([5]);
    expect(FACTS.brokenWalked).toBe(7);
    expect(FACTS.oldValue).toBe(9);
    const caption = text(pathCaption({ n: 8, levels: 4, version: 1, parent: 0, edit: { index: 5, value: 7 }, copied: 0, shared: 15, total: 15, stored: 15, corruptViewed: { version: 0, cells: [5] }, reached: [0] }));
    expect(caption).toContain('allocated no nodes');
    expect(caption).toContain('v0 now reads cell 5 differently from what it recorded');
    expect(lesson.tryThis[1]).toContain('v0 now reads 7 at cell 5 although it recorded 9');
  });

  it('try-this 3: at b = 2, n = 1,024 an update is 11 nodes and 21 slots against 1,024; 8 updates store 3,238 against 9,216; b = 32 is 3 nodes and 65 slots', () => {
    // closed forms: v0 holds 1,024 leaf slots + 1,023 internal nodes x 2; each update adds depth x b + 1 slots
    expect(1024 + 1023 * 2).toBe(3070);
    const cost = measureCost(1024, 2);
    expect(cost).toMatchObject({ depth: 10, nodesCopied: 11, slotsCopied: 21, fullCopy: 1024, initialSlots: 3070 });
    const series = memorySeries(1024, 2, 8, mulberry32(11));
    expect(series.persistent[8]).toBe(3070 + 8 * 21);
    expect(series.persistent[8]).toBe(3238);
    expect(series.fullCopies[8]).toBe(9 * 1024);
    expect(measureCost(1024, 32)).toMatchObject({ depth: 2, nodesCopied: 3, slotsCopied: 2 * 32 + 1 });
    const c = text(costCaption({ chosen: 1024, n: 1024, b: 2, depth: 10, nodes: 11, slots: 21, fullCopy: 1024, k: 8, persistent: 3238, fullCopies: 9216 }));
    expect(c).toContain('one update copies 11 nodes (21 slots) where a full copy writes 1,024 slots');
    expect(c).toContain('the tree stores 3,238 slots and 9 full copies would store 9,216.');
    expect(lesson.tryThis[2]).toContain('3,238 slots against 9,216');
    expect(lesson.tryThis[2]).toContain('3 nodes but 65 slots');
  });

  it('try-this 4: undo twice then set makes v3 from v0 (two branches); dropping v1 leaves 1 garbage node and memory falls by 2 slots', () => {
    const start = docStart();
    expect(start.store.versions.map((v) => v.id)).toEqual([0, 1, 2]);
    expect(start.current).toBe(2);
    const undo2 = start.store.versions[start.store.versions[2].parent as number].parent as number;
    expect(undo2).toBe(0);
    const s = setValue(start.store, undo2, 4, 42);
    expect(s.versions[3].parent).toBe(0);
    expect(childrenOf(s, 0)).toEqual([1, 3]);
    const garbage = s.nodes.filter((n) => !bfs(s, [0, 2, 3]).has(n.id));
    expect(garbage).toHaveLength(1);
    expect(garbage[0].id).toBe(s.versions[1].root);
    expect(memorySlots(s, [0, 1, 2, 3]) - memorySlots(s, [0, 2, 3])).toBe(DOC_B);
    expect(FACTS).toMatchObject({ forkId: 3, forkParent: 0, garbageAfterDrop: 1, memoryDrop: 2 });
    expect(lesson.tryThis[3]).toContain('v3 is made from v0');
    expect(lesson.tryThis[3]).toContain('1 node becomes garbage and memory falls by 2 slots');
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  it('walks every branching x size x k extreme through the cost caption: no NaN, the cheaper-way clause appears exactly when the copies win', () => {
    let seen = 0;
    for (const b of BRANCHING) {
      for (const n of COST_SIZES) {
        const cost = measureCost(n, b);
        const series = memorySeries(n, b, MAX_UPDATES, mulberry32(11));
        for (const k of [0, 1, 8, MAX_UPDATES]) {
          const c = text(costCaption({ chosen: n, n: cost.fullCopy, b, depth: cost.depth, nodes: cost.nodesCopied, slots: cost.slotsCopied, fullCopy: cost.fullCopy, k, persistent: series.persistent[k], fullCopies: series.fullCopies[k] }));
          expect(c).not.toMatch(/NaN|undefined/);
          if (k > 0) expect(c.includes('the copies are still the cheaper way'), `b ${b} n ${n} k ${k}`).toBe(series.persistent[k] >= series.fullCopies[k]);
          expect(c.includes('rounded up'), `b ${b} n ${n}`).toBe(cost.fullCopy !== n);
          seen++;
        }
      }
    }
    expect(seen).toBe(BRANCHING.length * COST_SIZES.length * 4);
  });

  it('a tiny array at b = 8 is a case where the copies win for a while, and a big one is not', () => {
    const small = memorySeries(8, 8, 8, mulberry32(1));
    expect(small.persistent[1]).toBeGreaterThanOrEqual(small.fullCopies[1]);
    const big = memorySeries(1024, 2, 8, mulberry32(1));
    expect(big.persistent[8]).toBeLessThan(big.fullCopies[8]);
  });

  it('the path caption never claims sharing for an in-place edit and says untouched only for a copy', () => {
    const base = { n: 8, levels: 4, version: 1, parent: 0, edit: { index: 2, value: 5 }, shared: 15, total: 15, stored: 15 };
    const inPlace = text(pathCaption({ ...base, copied: 0, corruptViewed: null, reached: [0] }));
    expect(inPlace).not.toContain('untouched');
    expect(inPlace).toContain('Look at v0');
    const copy = text(pathCaption({ ...base, copied: 4, shared: 11, stored: 19, corruptViewed: null, reached: [] }));
    expect(copy).toContain('untouched');
    expect(text(pathCaption({ ...base, version: 0, parent: null, edit: null, copied: 0, corruptViewed: null, reached: [] }))).toContain('v0 is a perfect tree over 8 cells: 15 nodes on 4 levels');
  });

  it('the document caption counts live, dropped and garbage from the state', () => {
    const c = text(docCaption({ current: 3, live: 3, versions: 4, stored: 46, garbage: 1, memory: 71 }));
    expect(c).toContain('3 of 4 versions are still alive (1 dropped)');
    expect(c).toContain('keeps 45 nodes and leaves 1 node that nothing reaches');
    expect(text(docCaption({ current: 0, live: 1, versions: 1, stored: 31, garbage: 0, memory: 62 }))).not.toContain('dropped');
  });
});

describe('hostile input', () => {
  it('a cell index is read exactly and refused outside 0 to n - 1; a value outside -999..999 is refused', () => {
    expect(parseIndex('5', 8)).toEqual({ ok: true, value: 5 });
    for (const bad of ['', '8', '-1', '2.5', '1e1', 'abc', '99999999999999999999']) expect(parseIndex(bad, 8).ok, bad).toBe(false);
    expect(parseValue('−42')).toEqual({ ok: true, value: -42 });
    for (const bad of ['', '1000', '-1000', '4.2', 'x', '12 3']) expect(parseValue(bad).ok, bad).toBe(false);
    const refused = parseIndex('9', 8);
    expect(refused.ok ? '' : refused.error).toContain('0 to 7');
  });

  it('more than 12 versions are refused for the drawn DAG', () => {
    expect(refuseVersion(VERSION_LIMIT - 1)).toBeNull();
    expect(refuseVersion(VERSION_LIMIT)).toContain('12 versions');
  });

  it('a value count that is not a power of b is rounded up, and the cost model counts the rounded tree', () => {
    const c = measureCost(100, 4);
    expect(c.depth).toBe(4);
    expect(c.fullCopy).toBe(256);
    expect(capacity(createStore(Array.from({ length: 100 }, (_, i) => i), 4))).toBe(256);
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('the in-place toggle has no effect in the scene that does not offer it: every combination', () => {
    expect(updateMode(false, false)).toBe('path');
    expect(updateMode(false, true)).toBe('path');
    expect(updateMode(true, false)).toBe('path');
    expect(updateMode(true, true)).toBe('inplace');
  });

  it('cost per update does not depend on how many updates the slider shows, and the seed only picks cells, not the totals', () => {
    for (const seed of [1, 2, 3]) {
      const s = memorySeries(64, 4, 10, mulberry32(seed));
      expect(s.persistent[10]).toBe(memorySeries(64, 4, 10, mulberry32(seed + 100)).persistent[10]);
    }
  });
});

describe('the drawing places nodes so nothing overlaps and copies sit beside originals', () => {
  it('over 100 seeded version trees: nodes of a level are a column apart, children are below parents, leaf variants group by cell', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = mulberry32(seed);
      let s = createStore(DOC_VALUES, DOC_B);
      for (let i = 0; i < 11; i++) s = setValue(s, randInt(0, s.versions.length - 1, rnd), randInt(0, 15, rnd), i + 100);
      const layout = dagLayout(s);
      const byLevel = new Map<number, number[]>();
      for (const [, p] of layout.at) byLevel.set(p.level, [...(byLevel.get(p.level) ?? []), p.x]);
      for (const xs of byLevel.values()) {
        xs.sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `seed ${seed}`).toBeGreaterThanOrEqual(COLUMN_PX - 1e-9);
      }
      for (const n of s.nodes) for (const k of n.kids ?? []) expect((layout.at.get(k) as { y: number }).y).toBeGreaterThan((layout.at.get(n.id) as { y: number }).y);
      const leavesOfCell = new Map<number, Set<number>>();
      for (const version of s.versions) for (let cell = 0; cell < 16; cell++) leavesOfCell.set(cell, (leavesOfCell.get(cell) ?? new Set<number>()).add(pathOf(s, version.id, cell)[s.depth]));
      for (let cell = 0; cell + 1 < 16; cell++) {
        const here = [...(leavesOfCell.get(cell) as Set<number>)].map((id) => (layout.at.get(id) as { x: number }).x);
        const next = [...(leavesOfCell.get(cell + 1) as Set<number>)].map((id) => (layout.at.get(id) as { x: number }).x);
        expect(Math.max(...here), `seed ${seed} cell ${cell}`).toBeLessThan(Math.min(...next));
      }
    }
  });
  it('reachable() and the nodes the layout places agree: every node of every version has a place', () => {
    let s = createStore(DOC_VALUES, DOC_B);
    s = setValue(s, 0, 3, 1);
    s = setValue(s, 1, 9, 2);
    const layout = dagLayout(s);
    expect(layout.at.size).toBe(s.nodes.length);
    expect(reachable(s, s.versions.map((v) => v.id)).size).toBe(s.nodes.length);
  });
});
