import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { DONES, OWNERS, PRESETS, TAGS, WHATS, checklist, passes, problemsOf, tagAdvice, type Item } from './actions';
import { FAULT_REASON, SENTENCES, correctIndex } from './blame';
import { actionsCaption, blameCaption, factorsCaption, whysCaption } from './captions';
import { FACTORS, FACTOR_IDS, LEAF_IDS, MAX_WHYS, ROOT, factorOf, revealed } from './tree';
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

/**
 * An independent checker written straight from the checklist's sentences, with its own hand-written tables (which actions
 * point at a factor, which done-when checks which action, which done-whens anyone can verify), not from the lesson's data.
 */
const SPEC_COVERS: Record<string, string[]> = {
  'range-check': ['old-schema'],
  preview: ['one-line-review'],
  staged: ['no-stages', 'shared-file'],
  'alert-window': ['noisy-history'],
  'one-step-rollback': ['manual-revert'],
  runbook: ['stale-runbook'],
  careful: [],
  retrain: [],
};
const SPEC_CHECKS: Record<string, string[]> = {
  'range-check': ['ci-test'],
  preview: ['ci-test', 'next-changes'],
  staged: ['next-changes'],
  'alert-window': ['replay'],
  'one-step-rollback': ['drill'],
  runbook: ['drill', 'replay'],
  careful: [],
  retrain: [],
};
const SPEC_VERIFIABLE = ['ci-test', 'drill', 'replay', 'next-changes'];
const SPEC_LEAVES = ['old-schema', 'one-line-review', 'no-stages', 'shared-file', 'noisy-history', 'manual-revert', 'stale-runbook'];

/** The two per-action facts the card and the checklist both depend on, from the spec tables. */
const specComplete = (i: Item) =>
  i.what !== null && i.owner !== null && i.tag !== null && i.done !== null && SPEC_VERIFIABLE.includes(i.done) && SPEC_CHECKS[i.what].includes(i.done);
const specConcrete = (i: Item) => i.what !== null && SPEC_COVERS[i.what].length > 0;

function oracle(items: readonly Item[]): boolean[] {
  const leafHasAction = (leaf: string) => items.some((i) => i.what !== null && SPEC_COVERS[i.what].includes(leaf));
  const tags = items.map((i) => i.tag).filter((t) => t !== null);
  return [
    items.length > 0 && SPEC_LEAVES.every(leafHasAction),
    items.length > 0 && items.every(specComplete),
    items.length > 0 && items.every(specConcrete),
    tags.length > 0 && tags.some((t) => t !== 'prevent'),
  ];
}

describe('the action-item checklist', () => {
  const run = (id: string) => checklist(PRESETS.find((p) => p.id === id)!.items).map((c) => c.pass);

  it('try-this 3: “be more careful” passes no check and a good postmortem passes all four, with every leaf addressed', () => {
    expect(run('careful')).toEqual([false, false, false, false]);
    expect(run('good')).toEqual([true, true, true, true]);
    const good = checklist(PRESETS.find((p) => p.id === 'good')!.items);
    expect(good[0].detail).toBe('7 of 7 leaf factors are addressed');
    expect(expectCaption(actionsCaption(PRESETS.find((p) => p.id === 'good')!.items))).toContain('all 4 checks pass');
  });

  it('fails coverage, completeness and the mix for the chain that ends at a person', () => {
    expect(run('person')).toEqual([false, false, false, false]);
  });

  it('flags a list of only prevent actions even when every action is complete and covers leaves', () => {
    const onlyPrevent: Item[] = [
      { id: 1, what: 'range-check', owner: OWNERS[0], done: 'ci-test', tag: 'prevent' },
      { id: 2, what: 'preview', owner: OWNERS[1], done: 'ci-test', tag: 'prevent' },
    ];
    const results = checklist(onlyPrevent).map((c) => c.pass);
    expect(results[1]).toBe(true);
    expect(results[3]).toBe(false);
  });

  it('never passes an item with an empty slot', () => {
    for (const slot of ['what', 'owner', 'done', 'tag'] as const) {
      const item = { ...PRESETS[0].items[0], [slot]: null } as Item;
      expect(checklist([item])[1].pass, slot).toBe(false);
      expect(passes(item), slot).toBe(false);
    }
  });

  it('does not let a vague item look fine: “be more careful” with an owner, a verifiable done-when and a tag fails its card and the concrete check', () => {
    const vague: Item = { id: 1, what: 'careful', owner: OWNERS[0], done: 'ci-test', tag: 'prevent' };
    expect(passes(vague)).toBe(false);
    expect(problemsOf(vague)).toContain('vague');
    expect(checklist([vague])[2].pass).toBe(false);
  });

  it('fails a done-when that is checkable but does not check this action', () => {
    const mismatched: Item = { id: 1, what: 'staged', owner: OWNERS[1], done: 'ci-test', tag: 'mitigate' };
    expect(problemsOf(mismatched)).toEqual(['wrong-check']);
    expect(checklist([mismatched])[1].pass).toBe(false);
    expect(passes({ ...mismatched, done: 'next-changes' })).toBe(true);
  });

  it('treats the tag as a judgment: staged rollout tagged prevent still passes every per-action rule and only draws advice', () => {
    const staged: Item = { id: 1, what: 'staged', owner: OWNERS[1], done: 'next-changes', tag: 'prevent' };
    expect(passes(staged)).toBe(true);
    expect(tagAdvice(staged)).toContain('most teams call this mitigate');
    expect(tagAdvice({ ...staged, tag: 'mitigate' })).toBeNull();
    expect(checklist([staged]).some((c) => c.label.toLowerCase().includes('tag matches'))).toBe(false);
  });

  it('one source of truth: a card passes exactly when the checklist run on that single item passes its complete and concrete checks', () => {
    const rnd = mulberry32(77);
    const pick = <T,>(xs: readonly T[]): T | null => (rnd() < 0.15 ? null : xs[Math.floor(rnd() * xs.length)]);
    for (let n = 0; n < 500; n++) {
      const i: Item = { id: 1, what: pick(WHATS.map((w) => w.id)), owner: pick(OWNERS), done: pick(DONES.map((d) => d.id)), tag: pick(TAGS) };
      const [, complete, concrete] = checklist([i]);
      expect(passes(i), JSON.stringify(i)).toBe(complete.pass && concrete.pass);
      expect(passes(i), JSON.stringify(i)).toBe(specComplete(i) && specConcrete(i));
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

  it('keeps the authored tables in step with the oracle’s, and each action’s usual tag a real tag', () => {
    for (const w of WHATS) {
      expect(TAGS).toContain(w.usualTag);
      expect([...w.covers], w.id).toEqual(SPEC_COVERS[w.id]);
      expect([...w.checkedBy], w.id).toEqual(SPEC_CHECKS[w.id]);
    }
    expect(DONES.filter((d) => d.verifiable).map((d) => d.id).sort()).toEqual([...SPEC_VERIFIABLE].sort());
    for (const leaf of LEAF_IDS) expect(WHATS.some((w) => w.covers.includes(leaf)), leaf).toBe(true);
    expect([...LEAF_IDS].sort()).toEqual([...SPEC_LEAVES].sort());
  });
});

describe('five whys against the tree', () => {
  it('try-this 4: the person chain surfaces 1 of 12 factors, the config-checks chain 3 and one leaf', () => {
    const person = CHAINS[0];
    expect(surfaced(person, person.steps.length)).toEqual({ factors: ['pool-zero'], leaves: [] });
    const schema = CHAINS.find((c) => c.id === 'schema')!;
    expect(surfaced(schema, schema.steps.length)).toEqual({ factors: ['pool-zero', 'no-range', 'old-schema'], leaves: ['old-schema'] });
    expect(expectCaption(whysCaption(person, person.steps.length))).toContain('1 of the authored tree’s 12 factors');
  });

  it('has chains of genuinely differing depth, none with five whys, because no branch of the tree is that deep (an independent depth walk)', () => {
    const depthBelow = (id: string): number => Math.max(0, ...factorOf(id).children.map((c) => 1 + depthBelow(c)));
    expect(MAX_WHYS).toBe(depthBelow(ROOT));
    expect(MAX_WHYS).toBeLessThan(5);
    const answers = CHAINS.map((c) => c.steps.length - 1);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const n of answers) expect(n).toBeLessThanOrEqual(MAX_WHYS);
    expect(CHAINS.find((c) => c.id === 'person')!.label).toContain('naive');
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
