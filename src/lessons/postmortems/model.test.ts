import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { DONES, OWNERS, PRESETS, TAGS, WHATS, checklist, type Item } from './actions';
import { FAULT_REASON, SENTENCES, correctIndex } from './blame';
import { actionsCaption, blameCaption, factorsCaption, whysCaption } from './captions';
import { FACTORS, FACTOR_IDS, LEAF_IDS, ROOT, factorOf, revealed } from './tree';
import { CHAINS, surfaced } from './whys';

describe('the authored factors tree', () => {
  it('has unique ids, children that exist, and 1 to 3 children per node', () => {
    const ids = FACTORS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FACTORS) {
      expect(f.children.length).toBeLessThanOrEqual(3);
      for (const c of f.children) expect(ids).toContain(c);
    }
  });

  it('is acyclic with every node reachable from the root and one parent each (an independent walk)', () => {
    const parents = new Map<string, string[]>();
    for (const f of FACTORS) for (const c of f.children) parents.set(c, [...(parents.get(c) ?? []), f.id]);
    for (const f of FACTORS) expect(parents.get(f.id)?.length ?? 0, f.id).toBe(f.id === ROOT ? 0 : 1);
    const seen = new Set<string>();
    const queue = [ROOT];
    while (queue.length) {
      const id = queue.shift()!;
      expect(seen.has(id), `cycle at ${id}`).toBe(false);
      seen.add(id);
      queue.push(...factorOf(id).children);
    }
    expect(seen.size).toBe(FACTORS.length);
  });

  it('tags every factor and gives the impact no tag; it has about a dozen factors and several leaves', () => {
    for (const f of FACTORS) expect(f.kind === null, f.id).toBe(f.id === ROOT);
    expect(FACTOR_IDS).toHaveLength(12);
    expect(LEAF_IDS).toHaveLength(7);
    expect(LEAF_IDS.length).toBeGreaterThan(1);
  });

  it('reveals the root first, then the children of each node asked about, and everything once all are asked', () => {
    expect([...revealed(new Set())]).toEqual([ROOT]);
    expect(new Set(revealed(new Set([ROOT])))).toEqual(new Set([ROOT, 'pool-zero', 'all-at-once', 'slow-recovery']));
    expect(revealed(new Set(FACTORS.map((f) => f.id))).size).toBe(FACTORS.length);
  });
});

describe('the blame rewrites', () => {
  it('has eight sentences, each with exactly one rewrite that names a condition and a reason for each wrong one', () => {
    expect(SENTENCES).toHaveLength(8);
    for (const s of SENTENCES) {
      expect(s.rewrites.filter((r) => r.fault === undefined), s.id).toHaveLength(1);
      for (const r of s.rewrites) if (r.fault) expect(FAULT_REASON[r.fault].length).toBeGreaterThan(20);
    }
    expect(new Set(SENTENCES.map((s) => s.blame)).size).toBe(8);
  });

  it('try-this 2: the first rewrite of the first sentence still blames a person, and the second names the config tool', () => {
    const s = SENTENCES[0];
    expect(s.rewrites[0].fault).toBe('person');
    expect(correctIndex(s)).toBe(1);
    expect(s.rewrites[1].text).toContain('config tool');
    expect(expectCaption(blameCaption({ [s.id]: 0 }, s.id))).toContain('still blames a person');
    expect(expectCaption(blameCaption({ [s.id]: 1 }, s.id))).toContain('1 of 8 sentences');
  });
});

/** An independent checker written straight from the checklist's sentences, not from the lesson's code. */
function oracle(items: readonly Item[]): boolean[] {
  const what = (id: string | null) => WHATS.find((w) => w.id === id);
  const leafHasAction = (leaf: string) => items.some((i) => what(i.what)?.covers.includes(leaf) ?? false);
  const complete = (i: Item) => i.owner !== null && i.tag !== null && what(i.what) !== undefined && (DONES.find((d) => d.id === i.done)?.verifiable ?? false);
  const concrete = (i: Item) => (what(i.what)?.covers.length ?? 0) > 0;
  const tags = items.map((i) => i.tag).filter((t) => t !== null);
  const concreteTagged = items.filter((i) => i.tag !== null && concrete(i));
  return [
    items.length > 0 && LEAF_IDS.every(leafHasAction),
    items.length > 0 && items.every(complete),
    items.length > 0 && items.every((i) => i.what === null ? false : concrete(i)),
    tags.length > 0 && tags.some((t) => t !== 'prevent'),
    concreteTagged.length > 0 && concreteTagged.every((i) => what(i.what)!.tag === i.tag),
  ];
}

describe('the action-item checklist', () => {
  const run = (id: string) => checklist(PRESETS.find((p) => p.id === id)!.items).map((c) => c.pass);

  it('try-this 3: “be more careful” passes no check and a good postmortem passes all five, with every leaf addressed', () => {
    expect(run('careful')).toEqual([false, false, false, false, false]);
    expect(run('good')).toEqual([true, true, true, true, true]);
    const good = checklist(PRESETS.find((p) => p.id === 'good')!.items);
    expect(good[0].detail).toBe('7 of 7 leaf factors are addressed');
    expect(expectCaption(actionsCaption(PRESETS.find((p) => p.id === 'good')!.items))).toContain('all 5 checks pass');
  });

  it('fails coverage, completeness and the mix for the chain that ends at a person', () => {
    expect(run('person')).toEqual([false, false, false, false, false]);
  });

  it('flags a list of only prevent actions even when every action is complete and covers leaves', () => {
    const onlyPrevent: Item[] = [
      { id: 1, what: 'range-check', owner: OWNERS[0], done: 'ci-test', tag: 'prevent' },
      { id: 2, what: 'preview', owner: OWNERS[1], done: 'ci-test', tag: 'prevent' },
    ];
    const passes = checklist(onlyPrevent).map((c) => c.pass);
    expect(passes[1]).toBe(true);
    expect(passes[3]).toBe(false);
  });

  it('never passes an item with an empty slot', () => {
    for (const slot of ['what', 'owner', 'done', 'tag'] as const) {
      const item = { ...PRESETS[0].items[0], [slot]: null } as Item;
      expect(checklist([item])[1].pass, slot).toBe(false);
    }
  });

  it('agrees with the independent oracle over 500 seeded random lists', () => {
    const rnd = mulberry32(31);
    const pick = <T,>(xs: readonly T[]): T | null => (rnd() < 0.15 ? null : xs[Math.floor(rnd() * xs.length)]);
    for (let n = 0; n < 500; n++) {
      const items: Item[] = Array.from({ length: Math.floor(rnd() * 9) }, (_, i) => ({
        id: i,
        what: pick(WHATS.map((w) => w.id)),
        owner: pick(OWNERS),
        done: pick(DONES.map((d) => d.id)),
        tag: pick(TAGS),
      }));
      expect(checklist(items).map((c) => c.pass), JSON.stringify(items)).toEqual(oracle(items));
    }
  });

  it('gives every authored action a tag, and the six real ones cover each leaf at least once', () => {
    for (const w of WHATS) expect(TAGS).toContain(w.tag);
    for (const leaf of LEAF_IDS) expect(WHATS.some((w) => w.covers.includes(leaf)), leaf).toBe(true);
  });
});

describe('five whys against the tree', () => {
  it('try-this 4: the person chain surfaces 1 of 12 factors, the config-checks chain 3 and one leaf', () => {
    const person = CHAINS[0];
    expect(surfaced(person, person.steps.length)).toEqual({ factors: ['pool-zero'], leaves: [] });
    const schema = CHAINS.find((c) => c.id === 'schema')!;
    expect(surfaced(schema, schema.steps.length)).toEqual({ factors: ['pool-zero', 'no-range', 'old-schema'], leaves: ['old-schema'] });
    expect(expectCaption(whysCaption(person, person.steps.length))).toContain('1 of the tree’s 12 factors');
  });

  it('every chain surfaces fewer factors than the tree, by a number computed from the data', () => {
    for (const c of CHAINS) {
      const { factors } = surfaced(c, c.steps.length);
      expect(factors.length).toBeLessThan(FACTOR_IDS.length);
      for (const f of factors) expect(FACTOR_IDS).toContain(f);
    }
  });

  it('counts steps in order: one why surfaces nothing beyond the impact', () => {
    for (const c of CHAINS) expect(surfaced(c, 1).factors).toEqual([]);
  });
});

describe('the factors captions', () => {
  it('try-this 1: asking about everything shows 12 of 12 factors and 7 of 7 leaves', () => {
    const all = new Set(FACTORS.map((f) => f.id));
    expect(expectCaption(factorsCaption(all, ROOT))).toContain('12 of 12 factors found, 7 of 7 leaves');
  });

  it('says a leaf is the end of its branch, and starts by asking the learner to press the impact', () => {
    expect(expectCaption(factorsCaption(new Set(), null))).toContain('press it');
    expect(expectCaption(factorsCaption(new Set(['old-schema']), 'old-schema'))).toContain('end of its branch');
  });
});
