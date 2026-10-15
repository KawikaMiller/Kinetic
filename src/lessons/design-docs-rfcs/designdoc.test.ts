import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { buildCaption } from './captions';
import {
  COST_MAX, OPENING_CONTENT, OPENING_ORDER, READERS, SECTIONS, keptOrder, lintDoc, moveSection, noDecision, askCounts, readerReach, reachOf, sectionOf, type DocContent, type SectionId,
} from './designdoc';

const skimmer = READERS[0].budget;
const approver = READERS[1].budget;
const implementer = READERS[2].budget;

/** Every permutation of a list (Heap's algorithm), as a generator. */
function* permutations<T>(items: readonly T[]): Generator<T[]> {
  const a = [...items];
  const c = Array(a.length).fill(0);
  yield [...a];
  let i = 0;
  while (i < a.length) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i];
      [a[j], a[i]] = [a[i], a[j]];
      yield [...a];
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

describe('reader reach', () => {
  it('is hand-worked for order [Context 300, Proposal 900, Alternatives 500, Recommendation 60] and a 600-word budget', () => {
    const order: SectionId[] = ['context', 'proposal', 'alternatives', 'recommendation'];
    const reach = readerReach(order, 600);
    expect(reach.map((r) => [r.id, r.read, r.reach])).toEqual([
      ['context', 300, 'full'],
      ['proposal', 300, 'partly'],
      ['alternatives', 0, 'none'],
      ['recommendation', 0, 'none'],
    ]);
    expect(noDecision(order, 600)).toBe(true);
  });

  it('never reads more than the budget, reads sections in order, and stops at the first section it cannot finish, for 500 seeded orders and every budget', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let k = 0; k < 500; k++) {
      const order = [...OPENING_ORDER].sort(() => rnd() - 0.5);
      for (const budget of [0, 1, skimmer, approver, implementer, 100_000]) {
        const reach = readerReach(order, budget);
        const read = reach.reduce((s, r) => s + r.read, 0);
        expect(read).toBe(Math.min(budget, order.reduce((s, id) => s + sectionOf(id).words, 0)));
        const firstShort = reach.findIndex((r) => r.reach !== 'full');
        if (firstShort >= 0) for (const r of reach.slice(firstShort + 1)) expect(r.reach).toBe('none');
      }
    }
  });

  it('lets the 150-word skimmer reach the recommendation for every one of the 8! = 40,320 orders of the other eight sections, once it is first', () => {
    const others = OPENING_ORDER.filter((id) => id !== 'recommendation');
    let count = 0;
    for (const perm of permutations(others)) {
      count++;
      expect(noDecision(['recommendation', ...perm], skimmer)).toBe(false);
      expect(reachOf(['recommendation', ...perm], skimmer, 'recommendation')!.reach).toBe('full');
    }
    expect(count).toBe(40_320);
  });

  it('misses the ask for all three readers in the opening order, where it is last, but not for a reader whose budget covers the whole doc', () => {
    // the opening order: the ask is last, so none of the three reaches it
    for (const r of READERS) expect(noDecision(OPENING_ORDER, r.budget), r.id).toBe(true);
    // a reader with a budget over the whole doc reaches it wherever it sits
    const total = SECTIONS.reduce((s, x) => s + x.words, 0);
    for (const perm of [OPENING_ORDER, [...OPENING_ORDER].reverse()]) expect(noDecision(perm, total)).toBe(false);
  });

  it('has the skimmer stop inside Context after the ask moves to the top, and the approver reach every section up to Proposal', () => {
    const order = ['recommendation', ...OPENING_ORDER.filter((id) => id !== 'recommendation')] as SectionId[];
    expect(reachOf(order, skimmer, 'recommendation')!.reach).toBe('full');
    expect(reachOf(order, skimmer, 'context')).toMatchObject({ reach: 'partly', read: skimmer - sectionOf('recommendation').words });
    expect(reachOf(order, approver, 'goals')!.reach).toBe('full');
  });
});

describe('moving sections', () => {
  it('moves one element and shifts the rest, and leaves the order alone for an out-of-range move', () => {
    const o = ['a', 'b', 'c', 'd'];
    expect(moveSection(o, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveSection(o, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveSection(o, 1, 1)).toEqual(o);
    expect(moveSection(o, -1, 2)).toEqual(o);
    expect(moveSection(o, 1, 9)).toEqual(o);
  });

  it('is a permutation: it keeps every section exactly once, for 200 seeded moves', () => {
    let order: readonly SectionId[] = OPENING_ORDER;
    for (let k = 0; k < 200; k++) {
      order = moveSection(order, (k * 7) % 9, (k * 5 + 3) % 9);
      expect([...order].sort()).toEqual([...OPENING_ORDER].sort());
    }
  });
});

describe('the doc checks, computed from the arrangement and content', () => {
  const pass = (c: DocContent) => Object.fromEntries(lintDoc(c).map((l) => [l.id, l.pass]));
  const full: DocContent = {
    ...OPENING_CONTENT,
    order: ['recommendation', ...OPENING_ORDER.filter((id) => id !== 'recommendation')],
    alternatives: [{ id: 'nothing', cost: 'Slow page stays' }, { id: 'cache', cost: 'Stale reads' }],
    decision: 'approve',
    deadline: 'friday',
  };

  it('fails alternatives, costs and the ask at the opening content, and passes non-goals and open-question placement', () => {
    expect(pass(OPENING_CONTENT)).toEqual({ nongoals: true, alternatives: false, costs: false, ask: false, questions: true });
  });

  it('try-this 2: only two checks pass at first, and doing nothing, costs, a decision and a date make all five pass', () => {
    expect(lintDoc(OPENING_CONTENT).filter((l) => l.pass)).toHaveLength(2);
    expect(Object.values(pass(full)).every(Boolean)).toBe(true);
    expect(expectCaption(buildCaption(full))).toContain('5 of 5 doc checks pass');
  });

  it('needs two alternatives that include do nothing, a non-blank cost on each, and a decision and a date together', () => {
    expect(pass({ ...full, alternatives: [{ id: 'nothing', cost: 'x' }] }).alternatives).toBe(false);
    expect(pass({ ...full, alternatives: [{ id: 'cache', cost: 'x' }, { id: 'replica', cost: 'y' }] }).alternatives).toBe(false);
    expect(pass({ ...full, alternatives: [{ id: 'nothing', cost: 'x' }, { id: 'replica', cost: '   ' }] }).costs).toBe(false);
    expect(pass({ ...full, alternatives: [] }).costs).toBe(false);
    expect(pass({ ...full, decision: 'none' }).ask).toBe(false);
    expect(pass({ ...full, deadline: 'none' }).ask).toBe(false);
    expect(pass({ ...full, dropped: ['recommendation'] }).ask).toBe(false);
  });

  it('follows the arrangement: dropping Non-goals fails that check, and open questions before the proposal fail theirs', () => {
    expect(pass({ ...full, dropped: ['nongoals'] }).nongoals).toBe(false);
    const buried: DocContent = { ...full, order: ['questions', ...full.order.filter((id) => id !== 'questions')] };
    expect(pass(buried).questions).toBe(false);
    expect(pass(full).questions).toBe(true);
    expect(pass({ ...full, dropped: ['questions'] }).questions).toBe(true);
  });

  it('needs the Alternatives section in the doc: listing and pricing alternatives passes nothing when the section is dropped', () => {
    expect(pass(full)).toEqual({ nongoals: true, alternatives: true, costs: true, ask: true, questions: true });
    const dropped = { ...full, dropped: ['alternatives' as SectionId] };
    expect(pass(dropped)).toMatchObject({ alternatives: false, costs: false, ask: true });
    expect(lintDoc(dropped).filter((l) => l.pass)).toHaveLength(3);
    expect(expectCaption(buildCaption(dropped))).toContain('3 of 5 doc checks pass');
    expect(lintDoc(dropped).find((l) => l.id === 'alternatives')!.found).toContain('no Alternatives section');
  });

  it('keeps only kept sections in the reading order, so a dropped section gives its words to the ones after it', () => {
    const dropped: DocContent = { ...OPENING_CONTENT, dropped: ['context'] };
    expect(keptOrder(dropped)).toEqual(OPENING_ORDER.filter((id) => id !== 'context'));
    expect(readerReach(keptOrder(dropped), skimmer)[0]).toMatchObject({ id: 'goals', read: 120, reach: 'full' });
  });

  it('bounds the typed cost text at 60 characters', () => {
    expect(COST_MAX).toBe(60);
  });
});

describe('the ask: read in full, cut off inside it, or never reached', () => {
  /** Independent oracle: the ask is read in full when the budget covers every word up to and including it. */
  const oracle = (order: readonly SectionId[], budget: number) => {
    const upTo = order.slice(0, order.indexOf('recommendation') + 1).reduce((s, id) => s + sectionOf(id).words, 0);
    const before = upTo - sectionOf('recommendation').words;
    return order.includes('recommendation') ? (budget >= upTo ? 'read' : budget > before ? 'cut' : 'none') : 'none';
  };

  it('says "every reader gets to the recommendation" only when each reader reads the whole ask, for 500 seeded orders with sections dropped', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let sawCut = 0;
    for (let k = 0; k < 500; k++) {
      const order = [...OPENING_ORDER].sort(() => rnd() - 0.5);
      const dropped = OPENING_ORDER.filter(() => rnd() < 0.3);
      const c: DocContent = { ...OPENING_CONTENT, order, dropped };
      const kept = keptOrder(c);
      const want = READERS.map((r) => oracle(kept, r.budget));
      const counts = askCounts(kept);
      expect(counts.read).toBe(want.filter((w) => w === 'read').length);
      expect(counts.cut).toBe(want.filter((w) => w === 'cut').length);
      const text = expectCaption(buildCaption(c));
      expect(text.includes('every reader gets to the recommendation')).toBe(want.every((w) => w === 'read'));
      expect(text.includes('cut off inside it')).toBe(want.includes('cut'));
      if (want.includes('cut')) sawCut++;
    }
    expect(sawCut).toBeGreaterThan(5);
  });

  it('describes Goals then Recommendation then the rest: the skimmer is cut off inside the ask, so the caption does not claim every reader gets there', () => {
    const order: SectionId[] = ['goals', 'recommendation', ...OPENING_ORDER.filter((id) => id !== 'goals' && id !== 'recommendation')];
    // 120 words of Goals leave the 150-word skimmer 30 of the ask's 60 words
    expect(askCounts(order)).toEqual({ read: 2, cut: 1, none: 0 });
    const text = expectCaption(buildCaption({ ...OPENING_CONTENT, order }));
    expect(text).toContain('1 reader is cut off inside it');
    expect(text).not.toContain('every reader gets to the recommendation');
  });
});

describe('the opening caption', () => {
  it('try-this 1: the opening order leaves all three readers without the ask, and the ask first gives it to all three', () => {
    const text = expectCaption(buildCaption(OPENING_CONTENT));
    expect(text).toContain('3 readers reach no decision');
    const first: DocContent = { ...OPENING_CONTENT, order: ['recommendation', ...OPENING_ORDER.filter((id) => id !== 'recommendation')] };
    expect(expectCaption(buildCaption(first))).toContain('every reader gets to the recommendation');
    for (const r of READERS) expect(noDecision(keptOrder(first), r.budget)).toBe(false);
  });
});
