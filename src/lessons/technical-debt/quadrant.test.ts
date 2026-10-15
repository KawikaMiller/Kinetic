import { describe, expect, it } from 'vitest';
import { BOXES, CARDS, isArguable, matches, matchesKey, placed, type BoxId, type Placements } from './quadrant';

const ids = BOXES.map((b) => b.id);

describe('the quadrant key', () => {
  it('accepts one or two real boxes per card, and every box is accepted by at least one card', () => {
    for (const c of CARDS) {
      expect([1, 2]).toContain(c.accepts.length);
      for (const a of c.accepts) expect(ids).toContain(a);
      expect(new Set(c.accepts).size).toBe(c.accepts.length);
    }
    for (const id of ids) expect(CARDS.some((c) => (c.accepts as readonly BoxId[]).includes(id))).toBe(true);
  });

  it('makes arguable cards the ones with two accepted boxes, and gives each a reason', () => {
    expect(CARDS.filter(isArguable).length).toBeGreaterThanOrEqual(2);
    for (const c of CARDS) expect(c.why.length).toBeGreaterThan(20);
  });

  it('scores a placement against the key: right boxes score, wrong or missing ones do not', () => {
    const key: Placements = Object.fromEntries(CARDS.map((c) => [c.id, c.accepts[0]]));
    expect(matches(key)).toBe(CARDS.length);
    const wrong: Placements = Object.fromEntries(CARDS.map((c) => [c.id, ids.find((id) => !(c.accepts as readonly BoxId[]).includes(id))]));
    expect(matches(wrong)).toBe(0);
    expect(matches({})).toBe(0);
    expect(placed({})).toBe(0);
    expect(placed(key)).toBe(CARDS.length);
  });

  it('try-this 5: the library card matches the key in either inadvertent box and in neither deliberate one', () => {
    const library = CARDS.find((c) => c.id === 'library')!;
    expect(isArguable(library)).toBe(true);
    expect(matchesKey(library, 'inadvertent-reckless')).toBe(true);
    expect(matchesKey(library, 'inadvertent-prudent')).toBe(true);
    expect(matchesKey(library, 'deliberate-reckless')).toBe(false);
    expect(matchesKey(library, 'deliberate-prudent')).toBe(false);
    expect(matchesKey(library, undefined)).toBe(false);
  });

  it('uses plain category tones for the boxes, never a status colour', () => {
    for (const b of BOXES) expect(['orange', 'amber', 'pink', 'sky']).toContain(b.tone);
    expect(new Set(BOXES.map((b) => b.tone)).size).toBe(BOXES.length);
  });
});
