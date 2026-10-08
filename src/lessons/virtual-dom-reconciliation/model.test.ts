import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  ITEMS, KEY_MODES, LIST_PRESETS, TREE_OLD, TREE_PRESETS, applyPatches, countsOf, domToV, el, keptInstances, matchChildren, runDiff, runList, stripKeys,
  type Item, type KeyMode, type Scenario, type VNode,
} from './model';

/** The model DOM after every patch is the new virtual tree (keys live on the framework's side, not in the DOM). */
const reaches = (s: Scenario) => stripKeys(domToV(applyPatches(s.old, s.result.patches)));
const target = (s: Scenario) => stripKeys(s.next);

describe('every preset reaches its target tree', () => {
  for (const p of TREE_PRESETS) {
    it(`tree: ${p.label}`, () => {
      const s = runDiff(TREE_OLD, p.next);
      expect(reaches(s)).toEqual(target(s));
    });
  }
  for (const preset of LIST_PRESETS) {
    for (const mode of KEY_MODES) {
      it(`list: ${preset.label}, ${mode.label}`, () => {
        const s = runList(preset.id, mode.value);
        expect(reaches(s)).toEqual(target(s));
      });
    }
  }
});

describe('the rules, with hand-worked counts', () => {
  const run = (preset: Parameters<typeof runList>[0], mode: KeyMode) => countsOf(runList(preset, mode).result);

  it('same type updates in place: one text change is one update and the node keeps its id', () => {
    const s = runDiff(TREE_OLD, TREE_PRESETS[0].next);
    expect(s.result.patches).toEqual([{ op: 'update', id: 3, field: 'text', from: '350 ml', to: '450 ml' }]);
    expect(countsOf(s.result).compared).toBe(4);
  });

  it('a changed class is one update, and unchanged nodes cost no DOM calls', () => {
    const c = countsOf(runDiff(TREE_OLD, TREE_PRESETS[1].next).result);
    expect([c.update, c.ops, c.built]).toEqual([1, 1, 0]);
  });

  it('a different type replaces that subtree only', () => {
    const c = countsOf(runDiff(TREE_OLD, TREE_PRESETS[2].next).result);
    expect([c.replace, c.ops, c.built]).toEqual([1, 1, 1]);
  });

  it('a different root type rebuilds the whole tree, children that did not change included', () => {
    const s = runDiff(TREE_OLD, TREE_PRESETS[3].next);
    const c = countsOf(s.result);
    expect([c.replace, c.ops, c.built, c.compared]).toEqual([1, 1, 4, 1]);
    // The diff did not descend: no step compares the children.
    expect(s.result.steps).toHaveLength(1);
  });

  it('a render with identical output compares every node and touches the DOM zero times', () => {
    const c = countsOf(runDiff(TREE_OLD, TREE_PRESETS[4].next).result);
    expect([c.ops, c.compared]).toEqual([0, 4]);
  });

  it('keyed insert at the start: exactly 1 insert and 0 updates', () => {
    expect(run('insert-start', 'id')).toMatchObject({ insert: 1, update: 0, move: 0, remove: 0, ops: 1, built: 1 });
  });

  it('unkeyed insert at the start: n updates plus 1 insert (n = 5)', () => {
    expect(run('insert-start', 'none')).toMatchObject({ update: 5, insert: 1, move: 0, remove: 0, ops: 6 });
  });

  it('keyed reverse is moves only: the last item stays and the other four move', () => {
    expect(run('reverse', 'id')).toMatchObject({ move: 4, update: 0, insert: 0, remove: 0, replace: 0, ops: 4 });
  });

  it('unkeyed reverse rewrites the four rows that differ (the middle one is the same name) and moves nothing', () => {
    expect(run('reverse', 'none')).toMatchObject({ update: 4, move: 0, insert: 0, remove: 0, ops: 4 });
  });

  it('delete the middle: keyed removes 1; unkeyed updates 2 rows and removes the last', () => {
    expect(run('delete-middle', 'id')).toMatchObject({ remove: 1, update: 0, ops: 1 });
    expect(run('delete-middle', 'none')).toMatchObject({ update: 2, remove: 1, ops: 3 });
  });

  it('changing one item is a single update in every mode', () => {
    for (const mode of ['none', 'index', 'id'] as const) expect(run('change-one', mode)).toMatchObject({ update: 1, ops: 1 });
  });

  it('index keys behave exactly like no keys: React falls back to position when there is no key', () => {
    for (const preset of LIST_PRESETS) {
      const a = runList(preset.id, 'none').result.patches.map((p) => p.op);
      const b = runList(preset.id, 'index').result.patches.map((p) => p.op);
      expect(b, preset.label).toEqual(a);
    }
  });

  it('with id keys, every item that survives keeps its DOM node (same id)', () => {
    for (const preset of LIST_PRESETS) {
      const s = runList(preset.id, 'id');
      const after = applyPatches(s.old, s.result.patches);
      const survivors = s.old.children.filter((kid) => after.children.some((c) => c.key === kid.key));
      expect(survivors.length, preset.label).toBeGreaterThan(0);
      for (const kid of survivors) expect(after.children.find((c) => c.key === kid.key)!.id, `${preset.label}: ${kid.text}`).toBe(kid.id);
    }
  });
});

describe('which row instance a keyed list reuses (the bug in the real React panel)', () => {
  const inserted: Item[] = [{ id: 'f', name: 'Fay' }, ...ITEMS];

  it('index keys: each row keeps the instance of the row that used to sit at its index, so typed text lands on the wrong item', () => {
    expect(keptInstances(ITEMS, inserted, 'index')).toEqual(['a', 'b', 'c', 'd', 'e', null]);
  });

  it('id keys: each item keeps its own instance and only the new one is fresh', () => {
    expect(keptInstances(ITEMS, inserted, 'id')).toEqual([null, 'a', 'b', 'c', 'd', 'e']);
  });
});

// ── Property tests over seeded random inputs ─────────────────────────

const TYPES = ['div', 'p', 'span'];
const randomTree = (rnd: () => number, depth: number): VNode =>
  el(
    TYPES[Math.floor(rnd() * TYPES.length)],
    { text: rnd() < 0.5 ? 'x' : 'y', cls: rnd() < 0.3 ? 'on' : '' },
    depth === 0 ? [] : Array.from({ length: Math.floor(rnd() * 4) }, () => randomTree(rnd, depth - 1)),
  );

/** A mutation of a tree: some nodes get another type, text or class, some children are added or dropped. */
const mutate = (rnd: () => number, v: VNode, depth: number): VNode => {
  const kids = v.children.filter(() => rnd() > 0.15).map((c) => mutate(rnd, c, depth - 1));
  if (depth > 0 && rnd() < 0.3) kids.splice(Math.floor(rnd() * (kids.length + 1)), 0, randomTree(rnd, 1));
  return {
    ...v,
    type: rnd() < 0.1 ? TYPES[Math.floor(rnd() * TYPES.length)] : v.type,
    text: rnd() < 0.2 ? 'z' : v.text,
    cls: rnd() < 0.2 ? 'off' : v.cls,
    children: kids,
  };
};

describe('seeded random mutations', () => {
  it('positional diffs of random trees always reach the target (500 cases)', () => {
    const rnd = mulberry32(31);
    for (let i = 0; i < 500; i++) {
      const old = randomTree(rnd, 3);
      const s = runDiff(old, mutate(rnd, old, 3));
      expect(reaches(s), `case ${i}`).toEqual(target(s));
    }
  });

  const shuffle = <T,>(xs: T[], rnd: () => number): T[] => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const longestIncreasing = (xs: number[]): number => {
    const best = xs.map(() => 1);
    xs.forEach((x, i) => xs.slice(0, i).forEach((y, j) => { if (y < x) best[i] = Math.max(best[i], best[j] + 1); }));
    return Math.max(0, ...best);
  };

  it('keyed list diffs always reach the target, never rebuild a surviving item, and move no more than n - 1 items (1500 cases)', () => {
    const rnd = mulberry32(77);
    for (let i = 0; i < 1500; i++) {
      const n = 1 + Math.floor(rnd() * 8);
      const old: Item[] = Array.from({ length: n }, (_, k) => ({ id: `k${k}`, name: `n${k}` }));
      let next = shuffle(old, rnd).filter(() => rnd() > 0.2).map((it) => (rnd() < 0.2 ? { ...it, name: 'renamed' } : it));
      const extra = Math.floor(rnd() * 3);
      for (let e = 0; e < extra; e++) next.splice(Math.floor(rnd() * (next.length + 1)), 0, { id: `new${e}`, name: `fresh${e}` });
      next = next.slice(0, 9);
      const s = runDiff(
        { type: 'ul', text: '', cls: '', children: old.map((it) => el('li', { key: it.id, text: it.name })) },
        el('ul', {}, next.map((it) => el('li', { key: it.id, text: it.name }))),
      );
      expect(reaches(s), `case ${i}`).toEqual(target(s));
      const c = countsOf(s.result);
      expect(c.replace, `case ${i}`).toBe(0);
      expect(c.insert, `case ${i}`).toBe(next.filter((it) => !old.some((o) => o.id === it.id)).length);
      // A reference bound: items that survive in the same relative order never need to move, so at least n - LIS must.
      const survivors = next.filter((it) => old.some((o) => o.id === it.id)).map((it) => old.findIndex((o) => o.id === it.id));
      expect(c.move, `case ${i}`).toBeGreaterThanOrEqual(survivors.length - longestIncreasing(survivors));
      expect(c.move, `case ${i}`).toBeLessThanOrEqual(Math.max(0, survivors.length - 1));
    }
  });

  it('matchChildren: by key when any new child has one, otherwise by position', () => {
    expect(matchChildren(['a', 'b'], ['b', 'a', 'c'])).toEqual([1, 0, null]);
    expect(matchChildren([undefined, undefined], [undefined, undefined, undefined])).toEqual([0, 1, null]);
    expect(matchChildren(['0', '1'], ['0', '1', '2'])).toEqual([0, 1, null]);
  });
});
