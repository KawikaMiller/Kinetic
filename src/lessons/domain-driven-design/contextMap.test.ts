import { describe, expect, it } from 'vitest';
import { mulberry32, pick, type Rnd } from '../../core/random';
import {
  ALL_IN_ONE, CONCEPTS, CONTEXTS, CUSTOMER_MEANINGS, EDGES, activePatterns, describeEdge, IDENTITY_KEY, NODE_BOX, PARTS, PART_CONTEXT, RELATIONSHIPS, REGION, START_STATE, SUGGESTED, VIEW, contextOf, danglingEdges,
  identityLinks, layout, patternCost, regionX, resolveEdges, statsOf, type Assignment, type ConceptId, type Context, type MapState, type PartId, type RelationshipId, type UsageEdge,
} from './contextMap';

const ctxIds = CONTEXTS.map((c) => c.id);

/** The post-split context of an endpoint, by a straight loop: a part sits in its own context, a concept where it was put. */
const place = (n: ConceptId | PartId, a: Assignment): Context | undefined => (n in PART_CONTEXT ? PART_CONTEXT[n as PartId] : a[n as ConceptId]);

/** Counts worked by a plain loop over EDGES, without resolveEdges. */
function brute(state: MapState) {
  let inside = 0;
  let raw = 0;
  let internals = 0;
  let translated = 0;
  for (const e of EDGES) {
    const viaPart = state.split && (e.a === 'Customer' || e.b === 'Customer');
    const x = place(viaPart && e.a === 'Customer' ? e.part! : e.a, state.assign);
    const y = place(viaPart && e.b === 'Customer' ? e.part! : e.b, state.assign);
    if (!x || !y) continue;
    if (x === y) inside++;
    else if (viaPart) translated++;
    else if (e.ref === 'object') internals++;
    else raw++;
  }
  return { inside, raw: raw + internals, internals, translated, crossing: raw + internals + translated, placed: inside + raw + internals + translated };
}

function randomAssignment(rnd: Rnd): Assignment {
  return Object.fromEntries(CONCEPTS.filter(() => rnd() < 0.8).map((c) => [c, pick(ctxIds, rnd)]));
}

describe('the numbers are recomputed from the assignment by a straight loop', () => {
  it('on 300 seeded assignments, split and unsplit', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const state: MapState = { assign: randomAssignment(rnd), split: rnd() < 0.5, patterns: {} };
      const want = brute(state);
      const got = statsOf(state);
      expect({ inside: got.inside, raw: got.raw, internals: got.internals, translated: got.translated, crossing: got.crossing, placed: got.placed }, `#${i}`).toEqual(want);
      expect(got.cohesion).toBe(want.placed ? want.inside / want.placed : null);
    }
  });

  it('nothing placed means nothing counted and no cohesion', () => {
    const s = statsOf(START_STATE);
    expect(s).toMatchObject({ placed: 0, inside: 0, crossing: 0, cohesion: null });
    expect(resolveEdges(START_STATE).every((e) => e.kind === 'pending')).toBe(true);
  });

  it('everything in one context has no crossing edge and cohesion 1', () => {
    const s = statsOf({ ...START_STATE, assign: ALL_IN_ONE });
    expect(s).toMatchObject({ placed: 17, inside: 17, crossing: 0, cohesion: 1 });
  });

  it('only an edge with a split-off Customer end becomes translated, and only when it crosses', () => {
    const state: MapState = { assign: { ...SUGGESTED, Invoice: 'fulfilment' }, split: true, patterns: {} };
    const kinds = resolveEdges(state).map((e, i) => ({ e, edge: EDGES[i] }));
    for (const { edge } of kinds.filter((k) => k.e.kind === 'translated')) expect(edge.a === 'Customer' || edge.b === 'Customer').toBe(true);
    expect(statsOf(state).translated).toBe(1);
  });
});

describe('the suggested partition', () => {
  /** Edges that cross, with the three Customer models fixed one per context. */
  const crossingOf = (a: Assignment) => {
    const where = { ...a } as Record<string, Context>;
    return EDGES.filter((e) => {
      const from = e.a === 'Customer' ? PART_CONTEXT[e.part!] : where[e.a];
      const to = e.b === 'Customer' ? PART_CONTEXT[e.part!] : where[e.b];
      return from !== to;
    }).length;
  };

  it('has the fewest edges crossing a boundary of all 3^8 = 6,561 placements of the other concepts, with 2 to 5 concepts in each context', () => {
    const others = CONCEPTS.filter((c) => c !== 'Customer');
    const suggested = crossingOf(SUGGESTED);
    let valid = 0;
    let better = 0;
    let ties = 0;
    for (let m = 0; m < ctxIds.length ** others.length; m++) {
      const a: Assignment = {};
      let x = m;
      const sizes: Record<Context, number> = { billing: 0, fulfilment: 0, support: 0 };
      for (const c of others) {
        const ctx = ctxIds[x % 3];
        a[c] = ctx;
        sizes[ctx]++;
        x = Math.floor(x / 3);
      }
      if (ctxIds.some((c) => sizes[c] < 2 || sizes[c] > 5)) continue;
      valid++;
      const n = crossingOf(a);
      if (n < suggested) better++;
      if (n === suggested) ties++;
    }
    // Sizes (2,2,4) in 3 orders at 8!/(2!2!4!) = 420 each, and (2,3,3) in 3 orders at 8!/(2!3!3!) = 560 each: 1,260 + 1,680.
    expect(valid).toBe(2940);
    expect(better).toBe(0);
    expect(ties).toBe(1);
    expect(suggested).toBe(4);
  });

  it('is itself a valid placement: 4, 2 and 2 of the other concepts', () => {
    const sizes = ctxIds.map((c) => CONCEPTS.filter((k) => k !== 'Customer' && SUGGESTED[k] === c).length);
    expect(sizes).toEqual([4, 2, 2]);
  });

  it('read unsplit it crosses on 7 edges, 4 of them into the other side\'s objects; split, it crosses on 4 and none is translated', () => {
    const unsplit = statsOf({ ...START_STATE, assign: SUGGESTED });
    expect({ crossing: unsplit.crossing, raw: unsplit.raw, internals: unsplit.internals, inside: unsplit.inside }).toEqual({ crossing: 7, raw: 7, internals: 4, inside: 10 });
    const split = statsOf({ ...START_STATE, assign: SUGGESTED, split: true });
    expect({ crossing: split.crossing, raw: split.raw, internals: split.internals, translated: split.translated, inside: split.inside }).toEqual({
      crossing: 4, raw: 4, internals: 1, translated: 0, inside: 13,
    });
  });
});

describe('splitting Customer', () => {
  it('names three meanings and pins one model to each context', () => {
    expect(Object.keys(CUSTOMER_MEANINGS)).toEqual(PARTS);
    expect(new Set(PARTS.map((p) => PART_CONTEXT[p])).size).toBe(3);
  });

  it('unsplit, Customer serves several meanings; split, none is left', () => {
    expect(statsOf(START_STATE).unsplitMeanings).toEqual(['Customer']);
    expect(statsOf({ ...START_STATE, split: true }).unsplitMeanings).toEqual([]);
  });

  it('keeps an identity link: the three models are connected by the customer id, and only once split', () => {
    const links = identityLinks({ ...START_STATE, split: true });
    const connected = new Set<PartId>([PARTS[0]]);
    for (let pass = 0; pass < PARTS.length; pass++) for (const [a, b] of links) if (connected.has(a) || connected.has(b)) [a, b].forEach((p) => connected.add(p));
    expect(connected.size).toBe(PARTS.length);
    expect(identityLinks(START_STATE)).toEqual([]);
    expect(IDENTITY_KEY).toBe('customerId');
  });

  it('every edge touching Customer names the model it goes to, so none is left dangling', () => {
    expect(danglingEdges()).toEqual([]);
    expect(EDGES.filter((e) => e.a === 'Customer').every((e) => e.part)).toBe(true);
  });

  it('a split with a dangling reference is flagged', () => {
    const broken: UsageEdge[] = [...EDGES, { a: 'Customer', b: 'Product', weight: 1, ref: 'object' }];
    expect(danglingEdges(broken)).toHaveLength(1);
    expect(danglingEdges(broken)[0].b).toBe('Product');
  });

  it('after a split, the edges keep their indexes, so a pattern chosen for one stays on it', () => {
    const before = resolveEdges({ ...START_STATE, assign: SUGGESTED });
    const after = resolveEdges({ ...START_STATE, assign: SUGGESTED, split: true });
    expect(after.map((e) => e.index)).toEqual(before.map((e) => e.index));
    expect(after[0].from).toBe('Payer');
    expect(after[0].to).toBe('Invoice');
  });
});

describe('relationship patterns', () => {
  it('are five distinct patterns with a consequence and a cost from 1 to 5', () => {
    expect(RELATIONSHIPS).toHaveLength(5);
    expect(new Set(RELATIONSHIPS.map((r) => r.id)).size).toBe(5);
    for (const r of RELATIONSHIPS) {
      expect(r.consequence.length).toBeGreaterThan(20);
      expect(r.cost).toBeGreaterThanOrEqual(1);
      expect(r.cost).toBeLessThanOrEqual(5);
    }
  });

  it('add their costs', () => {
    expect(patternCost({})).toBe(0);
    expect(patternCost({ 3: 'anticorruption', 8: 'conformist', 9: 'published-language' })).toBe(4 + 2 + 1);
  });
});

describe('the drawing', () => {
  it('puts every node inside the view, none on top of another, and placed ones inside their region, for 300 seeded states', () => {
    const rnd = mulberry32(21);
    for (let i = 0; i < 300; i++) {
      const state: MapState = { assign: randomAssignment(rnd), split: rnd() < 0.5, patterns: {} };
      const nodes = layout(state);
      expect(nodes).toHaveLength(state.split ? 11 : 9);
      for (const n of nodes) {
        expect(n.at.x - NODE_BOX.w / 2, `#${i} ${n.id}`).toBeGreaterThanOrEqual(0);
        expect(n.at.x + NODE_BOX.w / 2, `#${i} ${n.id}`).toBeLessThanOrEqual(VIEW.width);
        expect(n.at.y + NODE_BOX.h / 2, `#${i} ${n.id}`).toBeLessThanOrEqual(VIEW.height);
        const ctx = contextOf(n.id, state.assign);
        if (ctx) {
          expect(n.at.y - NODE_BOX.h / 2).toBeGreaterThanOrEqual(REGION.top);
          expect(n.at.x - NODE_BOX.w / 2).toBeGreaterThanOrEqual(regionX(ctx));
          expect(n.at.x + NODE_BOX.w / 2).toBeLessThanOrEqual(regionX(ctx) + REGION.width);
        } else {
          expect(n.at.y + NODE_BOX.h / 2).toBeLessThan(REGION.top);
        }
      }
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          const overlap = Math.abs(nodes[a].at.x - nodes[b].at.x) < NODE_BOX.w && Math.abs(nodes[a].at.y - nodes[b].at.y) < NODE_BOX.h;
          expect(overlap, `#${i} ${nodes[a].id} ${nodes[b].id}`).toBe(false);
        }
      }
    }
  });
});

describe('a chosen pattern changes how the edge is read and counted', () => {
  // Independent oracle: the patterns that put a translation or a documented format between the sides.
  const CONTRACT_IDS = ['anticorruption', 'published-language'];
  const DIRECTIONAL_IDS = ['customer-supplier', 'conformist', 'anticorruption'];
  const states: MapState[] = [
    { ...START_STATE, assign: SUGGESTED },
    { ...START_STATE, assign: SUGGESTED, split: true },
    { ...START_STATE, assign: { ...SUGGESTED, Invoice: 'fulfilment' }, split: true },
  ];

  it('for every pattern on every crossing edge, a contract pattern makes the edge translated and no other pattern changes its kind', () => {
    for (const base of states) {
      const plain = resolveEdges(base);
      for (const e of plain.filter((x) => ['raw', 'internals', 'translated'].includes(x.kind))) {
        for (const r of RELATIONSHIPS) {
          const [got] = resolveEdges({ ...base, patterns: { [e.index]: r.id } }).filter((x) => x.index === e.index);
          const want = e.kind === 'translated' || CONTRACT_IDS.includes(r.id) ? 'translated' : e.kind;
          expect(got.kind, `${e.index} ${r.id} ${base.split}`).toBe(want);
          expect(got.pattern).toBe(r.id);
        }
      }
    }
  });

  it('counts move with the pattern: a published language on a raw edge takes it out of raw and into translated', () => {
    const base: MapState = { ...START_STATE, assign: SUGGESTED };
    const before = statsOf(base);
    const edge = resolveEdges(base).find((e) => e.kind === 'internals')!;
    const after = statsOf({ ...base, patterns: { [edge.index]: 'published-language' } });
    expect([after.raw, after.internals, after.translated, after.crossing]).toEqual([before.raw - 1, before.internals - 1, before.translated + 1, before.crossing]);
    const conformist = statsOf({ ...base, patterns: { [edge.index]: 'conformist' } });
    expect([conformist.raw, conformist.internals, conformist.translated]).toEqual([before.raw, before.internals, before.translated]);
  });

  it('the words follow: a contract clears the internals flag, a conformist or shared kernel keeps the dependence and says so', () => {
    const base: MapState = { ...START_STATE, assign: SUGGESTED };
    const edge = resolveEdges(base).find((e) => e.kind === 'internals')!;
    const text = (id: RelationshipId) => describeEdge(resolveEdges({ ...base, patterns: { [edge.index]: id } })[edge.index]);
    expect(describeEdge(resolveEdges(base)[edge.index])).toContain("dependence on another context's internals");
    for (const r of RELATIONSHIPS) {
      if (CONTRACT_IDS.includes(r.id)) expect(text(r.id), r.id).not.toContain('internals');
      else {
        expect(text(r.id), r.id).toContain("dependence on another context's internals");
        expect(text(r.id), r.id).toContain('does not remove it');
      }
    }
  });

  it('directional patterns say there is an upstream and a downstream side the map does not draw; the others do not', () => {
    expect(RELATIONSHIPS.filter((r) => r.directional).map((r) => r.id).sort()).toEqual([...DIRECTIONAL_IDS].sort());
    const base: MapState = { ...START_STATE, assign: SUGGESTED };
    const edge = resolveEdges(base).find((e) => e.kind === 'internals')!;
    for (const r of RELATIONSHIPS) {
      const text = describeEdge(resolveEdges({ ...base, patterns: { [edge.index]: r.id } })[edge.index]);
      expect(text.includes('upstream and a downstream side'), r.id).toBe(DIRECTIONAL_IDS.includes(r.id));
      if (DIRECTIONAL_IDS.includes(r.id)) expect(text).toContain('does not say which side is which');
    }
  });

  it('a pattern chosen for an edge that no longer crosses is ignored and costs nothing', () => {
    const edge = resolveEdges({ ...START_STATE, assign: SUGGESTED }).find((e) => e.kind === 'internals')!;
    const crossing: MapState = { ...START_STATE, assign: SUGGESTED, patterns: { [edge.index]: 'anticorruption' } };
    expect(patternCost(activePatterns(crossing))).toBe(4);
    const merged: MapState = { ...crossing, assign: ALL_IN_ONE };
    expect(activePatterns(merged)).toEqual({});
    expect(patternCost(activePatterns(merged))).toBe(0);
    expect(resolveEdges(merged).every((e) => e.kind === 'inside')).toBe(true);
  });
});
