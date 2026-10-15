import { describe, expect, it } from 'vitest';
import { ATTRIBUTES, REQUESTS, TEAMS, blastRadius, teamsOf, teamsTouched, widelyShared, type Team } from './monolith';

describe('the Customer matrix', () => {
  it('has 14 attributes, and every cell is read, write or none', () => {
    expect(ATTRIBUTES).toHaveLength(14);
    expect(new Set(ATTRIBUTES.map((a) => a.id)).size).toBe(14);
    for (const a of ATTRIBUTES) {
      expect(a.access).toHaveLength(TEAMS.length);
      for (const cell of a.access) expect(['r', 'w', '']).toContain(cell);
    }
  });

  it('every attribute is written by a team that owns it, never by more than two', () => {
    for (const a of ATTRIBUTES) {
      const writers = a.access.filter((x) => x === 'w').length;
      expect(writers, a.id).toBeGreaterThanOrEqual(a.id === 'name' ? 0 : 1);
      expect(writers, a.id).toBeLessThanOrEqual(2);
    }
  });
});

describe('the blast radius of a change request is recomputed by a plain loop', () => {
  it('counts the teams with any access to a named attribute', () => {
    for (const r of REQUESTS) {
      const touched = new Set<Team>();
      for (const id of r.attributes) {
        const attr = ATTRIBUTES.find((a) => a.id === id)!;
        TEAMS.forEach((t, i) => {
          if (attr.access[i] === 'r' || attr.access[i] === 'w') touched.add(t.id);
        });
      }
      expect(teamsTouched(r), r.id).toEqual(TEAMS.map((t) => t.id).filter((t) => touched.has(t)));
      expect(blastRadius(r), r.id).toBe(touched.size);
    }
  });

  it('every one of the five requests touches 3 of the 4 teams in the default (single-model) state', () => {
    expect(REQUESTS).toHaveLength(5);
    for (const r of REQUESTS) expect(blastRadius(r), r.id).toBe(3);
  });

  it('the tier rename reaches billing, shipping and support but not marketing', () => {
    expect(teamsTouched(REQUESTS[0])).toEqual(['billing', 'shipping', 'support']);
    expect(teamsOf(ATTRIBUTES.find((a) => a.id === 'supportTier')!)).toEqual(['billing', 'shipping', 'support']);
  });

  it('a request that names two attributes touches the union of their teams', () => {
    const both = { id: 'x', label: 'x', attributes: ['billingAddress', 'shippingAddress'] };
    expect(teamsTouched(both)).toEqual(['billing', 'shipping', 'support', 'marketing']);
  });

  it('counts the attributes three or more teams touch', () => {
    const brute = ATTRIBUTES.filter((a) => a.access.filter((x) => x !== '').length >= 3).map((a) => a.id);
    expect(widelyShared().map((a) => a.id)).toEqual(brute);
    expect(brute.length).toBeGreaterThan(5);
  });
});
