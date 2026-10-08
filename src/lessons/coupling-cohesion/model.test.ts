import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { NODE, VIEW, layoutModules, moduleAt, passThroughs } from './layout';
import {
  EDGES, FN_IDS, PRESETS, PRESET_IDS, REQUESTS, SLOTS, blastRadius, changeSet, coupling, couplingDelta, edgesFlipped, meanCohesion,
  moduleStats, modulesTouched, moveFn, reasonsToChange, requestById, type Assignment, type FnId, type PresetId, type RequestId, type Slot,
} from './model';

/**
 * Independent reference: an adjacency matrix over function indices, and the metrics
 * recomputed from it by plain loops (no shared helpers with model.ts).
 */
function reference(a: Assignment, m: Slot) {
  const n = FN_IDS.length;
  const adj = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  for (const e of EDGES) adj[FN_IDS.indexOf(e.from)][FN_IDS.indexOf(e.to)] = true;
  const inM = (i: number) => a[FN_IDS[i]] === m;
  let internal = 0;
  let touching = 0;
  let crossing = 0;
  const ca = new Set<number>();
  const ce = new Set<number>();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (!adj[i][j]) continue;
      if (a[FN_IDS[i]] !== a[FN_IDS[j]]) crossing++;
      if (inM(i) && inM(j)) internal++;
      if (inM(i) || inM(j)) touching++;
      if (!inM(i) && inM(j)) ca.add(i);
      if (inM(i) && !inM(j)) ce.add(i);
    }
  }
  return { internal, touching, crossing, ca: ca.size, ce: ce.size };
}

const randomAssignment = (rnd: () => number): Assignment =>
  Object.fromEntries(FN_IDS.map((id) => [id, Math.floor(rnd() * 3) as Slot])) as Assignment;

describe('the toy codebase', () => {
  it('has 14 functions and 15 distinct call edges between known functions', () => {
    expect(FN_IDS).toHaveLength(14);
    expect(EDGES).toHaveLength(15);
    expect(new Set(EDGES.map((e) => `${e.from}>${e.to}`)).size).toBe(15);
    for (const e of EDGES) {
      expect(FN_IDS).toContain(e.from);
      expect(FN_IDS).toContain(e.to);
      expect(e.from).not.toBe(e.to);
    }
  });
});

describe('coupling and cohesion on each preset (hand-computed)', () => {
  // Worked by hand from the edge list in model.ts.
  const HAND: Record<PresetId, { coupling: number; cohesion: [number, number] | null; ca: number; ce: number }[]> = {
    layer: [
      { coupling: 9, cohesion: [0, 2], ca: 0, ce: 2 }, // controllers: cartPage→priceCart, checkoutPage→placeOrder both cross
      { coupling: 9, cohesion: [4, 13], ca: 2, ce: 5 }, // services: 4 inside, all 9 crossing edges touch it
      { coupling: 9, cohesion: [2, 9], ca: 5, ce: 0 }, // utils: formatEmail→receiptTemplate, formatEmail→roundMoney inside
    ],
    feature: [
      { coupling: 3, cohesion: [5, 7], ca: 2, ce: 0 }, // cart: placeOrder→priceCart and formatEmail→roundMoney come in
      { coupling: 3, cohesion: [4, 6], ca: 0, ce: 1 }, // payment: placeOrder calls out twice
      { coupling: 3, cohesion: [3, 5], ca: 1, ce: 1 }, // email
    ],
    god: [
      { coupling: 0, cohesion: [15, 15], ca: 0, ce: 0 },
      { coupling: 0, cohesion: null, ca: 0, ce: 0 },
      { coupling: 0, cohesion: null, ca: 0, ce: 0 },
    ],
  };

  for (const id of PRESET_IDS) {
    it(`${id}: matches the hand count`, () => {
      const a = PRESETS[id].assign;
      expect(coupling(a)).toBe(HAND[id][0].coupling);
      for (const m of SLOTS) {
        const s = moduleStats(a, m);
        const h = HAND[id][m];
        if (h.cohesion === null) expect(s.cohesion).toBeNull();
        else {
          expect([s.internal, s.touching]).toEqual(h.cohesion);
          expect(s.cohesion).toBeCloseTo(h.cohesion[0] / h.cohesion[1], 12);
        }
        expect([s.ca, s.ce]).toEqual([h.ca, h.ce]);
        expect(s.instability).toBe(h.ca + h.ce ? h.ce / (h.ca + h.ce) : null);
      }
    });
  }

  it('the god module has no coupling and full cohesion: the edge counts alone cannot see what is wrong with it', () => {
    const a = PRESETS.god.assign;
    expect(coupling(a)).toBe(0);
    expect(meanCohesion(a)).toBe(1);
  });
});

describe('change requests, read off the call graph', () => {
  it('a change set is the seed plus its direct callers', () => {
    expect(changeSet(requestById('coupon'))).toEqual(['couponRules', 'applyCoupon']);
    expect(changeSet(requestById('email'))).toEqual(['emailClient', 'sendReceipt']);
    expect(changeSet(requestById('receipt'))).toEqual(['receiptTemplate', 'formatEmail']);
    expect(changeSet(requestById('gateway'))).toEqual(['cardGateway', 'chargeCard']);
    expect(changeSet(requestById('rounding'))).toEqual(['roundMoney', 'priceCart', 'applyCoupon', 'formatEmail']);
  });

  // Every preset × request, worked by hand: [modules touched, functions in those modules].
  const HAND: Record<PresetId, Record<RequestId, [number, number]>> = {
    layer: { coupon: [2, 12], email: [2, 12], receipt: [1, 7], gateway: [2, 12], rounding: [2, 12] },
    feature: { coupon: [1, 5], email: [1, 4], receipt: [1, 4], gateway: [1, 5], rounding: [2, 9] },
    god: { coupon: [1, 14], email: [1, 14], receipt: [1, 14], gateway: [1, 14], rounding: [1, 14] },
  };
  for (const p of PRESET_IDS) {
    for (const r of REQUESTS) {
      it(`${p} × ${r.id}`, () => {
        const a = PRESETS[p].assign;
        expect([modulesTouched(a, r).length, blastRadius(a, r)]).toEqual(HAND[p][r.id]);
      });
    }
  }

  it('by feature keeps four of five requests in one module; by layer keeps one', () => {
    const local = (p: PresetId) => REQUESTS.filter((r) => modulesTouched(PRESETS[p].assign, r).length === 1).length;
    expect(local('feature')).toBe(4);
    expect(local('layer')).toBe(1);
  });

  it('every request lands in the god module: five reasons to change', () => {
    expect(reasonsToChange(PRESETS.god.assign, 0)).toBe(5);
    expect(SLOTS.map((m) => reasonsToChange(PRESETS.feature.assign, m))).toEqual([2, 1, 3]);
  });
});

describe('moving a function', () => {
  it('changes coupling by exactly the edges that flip (2,000 random moves on random layouts)', () => {
    const rnd = mulberry32(7);
    for (let t = 0; t < 2000; t++) {
      const a = randomAssignment(rnd);
      const fn = FN_IDS[Math.floor(rnd() * FN_IDS.length)] as FnId;
      const to = Math.floor(rnd() * 3) as Slot;
      const b = moveFn(a, fn, to);
      const delta = coupling(b) - coupling(a);
      expect(couplingDelta(a, fn, to)).toBe(delta);
      // Every flipped edge touches the moved function, and the signed flips sum to the delta.
      const flipped = edgesFlipped(a, fn, to);
      expect(flipped.every((e) => e.from === fn || e.to === fn)).toBe(true);
      const signed = flipped.reduce((s, e) => s + (b[e.from] !== b[e.to] ? 1 : -1), 0);
      expect(signed).toBe(delta);
    }
  });

  it('agrees with the matrix reference on 500 random layouts', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 500; t++) {
      const a = randomAssignment(rnd);
      for (const m of SLOTS) {
        const ref = reference(a, m);
        const s = moduleStats(a, m);
        expect(coupling(a)).toBe(ref.crossing);
        expect([s.internal, s.touching, s.ca, s.ce]).toEqual([ref.internal, ref.touching, ref.ca, ref.ce]);
      }
    }
  });

  it('the try-this move: couponRules into services drops coupling by one and makes the coupon change local', () => {
    const a = PRESETS.layer.assign;
    const b = moveFn(a, 'couponRules', 1);
    expect(coupling(b)).toBe(coupling(a) - 1);
    expect(modulesTouched(b, requestById('coupon'))).toEqual([1]);
  });
});

/** Each layout runs a seeded search, so this test gets a budget well past its typical run time. */
const LAYOUT_TEST_MS = 60_000;
const RANDOM_LAYOUTS = 60;

describe('layout', () => {
  it('keeps every function inside its own box, inside the view, without overlaps, for every preset and 60 random layouts', () => {
    const rnd = mulberry32(3);
    const layouts = [...PRESET_IDS.map((p) => PRESETS[p].assign), ...Array.from({ length: RANDOM_LAYOUTS }, () => randomAssignment(rnd))];
    for (const a of layouts) {
      const { boxes, at } = layoutModules(a);
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(VIEW.w);
        expect(b.y + b.h).toBeLessThanOrEqual(VIEW.h);
      }
      for (const id of FN_IDS) {
        const p = at[id];
        const b = boxes[a[id]];
        expect(p.x - NODE.w / 2).toBeGreaterThan(b.x);
        expect(p.x + NODE.w / 2).toBeLessThan(b.x + b.w);
        expect(p.y + NODE.h / 2).toBeLessThan(b.y + b.h);
        expect(moduleAt(boxes, p)).toBe(a[id]);
      }
      for (let i = 0; i < FN_IDS.length; i++) {
        for (let j = i + 1; j < FN_IDS.length; j++) {
          const p = at[FN_IDS[i]];
          const q = at[FN_IDS[j]];
          expect(Math.abs(p.x - q.x) >= NODE.w || Math.abs(p.y - q.y) >= NODE.h).toBe(true);
        }
      }
    }
  }, LAYOUT_TEST_MS);

  it('draws no edge through a node it does not connect, on every preset and after any single move from one (126 layouts)', () => {
    for (const p of PRESET_IDS) {
      expect(passThroughs(layoutModules(PRESETS[p].assign).at), p).toEqual([]);
      for (const fn of FN_IDS) for (const m of SLOTS) expect(passThroughs(layoutModules(moveFn(PRESETS[p].assign, fn, m)).at), `${p} ${fn}→${m}`).toEqual([]);
    }
  }, LAYOUT_TEST_MS);

  it('is deterministic: the same assignment gives the same drawing', () => {
    const a = PRESETS.feature.assign;
    expect(layoutModules({ ...a })).toEqual(layoutModules(a));
  });

  it('finds no module in the gaps between boxes', () => {
    const { boxes } = layoutModules(PRESETS.feature.assign);
    expect(moduleAt(boxes, { x: boxes[0].x + boxes[0].w + 5, y: 100 })).toBeNull();
    expect(moduleAt(boxes, { x: 1, y: 1 })).toBeNull();
  });
});
