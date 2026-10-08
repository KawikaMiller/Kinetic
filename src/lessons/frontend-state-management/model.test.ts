import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { COMPONENTS, IDS, INITIAL, PRODUCTS, count, createSignalCart, outcome, predict, reduce, shown, total, type Action, type CompId, type ReactApproach, type State } from './model';

const add = (product: number): Action => ({ type: 'add', product });
const THEME: Action = { type: 'theme' };
const run = (approach: ReactApproach, memo: boolean, action: Action, from: State = INITIAL) => predict(approach, memo, from, reduce(from, action));

describe('hand-worked re-render sets (add one Lamp / toggle the theme)', () => {
  it('lifted state with memo: App, then every component whose props changed along the way', () => {
    expect(run('lifted', true, add(2))).toEqual(['app', 'header', 'badge', 'list', 'card2', 'sidebar', 'summary']);
    expect(run('lifted', true, THEME)).toEqual(['app', 'header', 'theme']);
  });

  it('lifted state without memo: a render re-renders every child, so all eleven components run', () => {
    expect(run('lifted', false, add(2))).toEqual(IDS);
    expect(run('lifted', false, THEME)).toEqual(IDS);
  });

  it('context: the provider and every consumer, whichever field changed', () => {
    const consumers = ['app', 'badge', 'theme', 'card0', 'card1', 'card2', 'card3', 'summary'];
    expect(run('context', true, add(2))).toEqual(consumers);
    expect(run('context', true, THEME)).toEqual(consumers);
  });

  it('store with selectors: only components whose selected slice changed', () => {
    expect(run('store', true, add(2))).toEqual(['badge', 'card2', 'summary']);
    expect(run('store', true, THEME)).toEqual(['theme']);
  });
});

describe('what is wasted', () => {
  const wasted = (approach: ReactApproach, memo: boolean, action: Action) => {
    const after = reduce(INITIAL, action);
    return [...outcome(approach, memo, INITIAL, after).kinds].filter(([, k]) => k === 'wasted').map(([id]) => id);
  };

  it('lifted: containers that only forward props; context: consumers of an unrelated field and unchanged cards; store: nothing', () => {
    expect(wasted('lifted', true, add(2))).toEqual(['header', 'list', 'sidebar']);
    expect(wasted('context', true, add(2))).toEqual(['theme', 'card0', 'card1', 'card3']);
    expect(wasted('context', true, THEME)).toEqual(['badge', 'card0', 'card1', 'card2', 'card3', 'summary']);
    expect(wasted('store', true, add(2))).toEqual([]);
    expect(wasted('store', true, THEME)).toEqual([]);
  });

  it('the owner of the state is never counted as wasted', () => {
    expect(outcome('lifted', true, INITIAL, reduce(INITIAL, THEME)).kinds.get('app')).toBe('needed');
  });
});

describe('invariants over 400 seeded random actions', () => {
  const rnd = mulberry32(21);
  const actions: Action[] = Array.from({ length: 400 }, () => (rnd() < 0.3 ? THEME : add(Math.floor(rnd() * 4))));

  it('no approach ever leaves a component stale: whatever changed on screen re-rendered', () => {
    let state = INITIAL;
    for (const action of actions) {
      const next = reduce(state, action);
      for (const approach of ['lifted', 'context', 'store'] as const) {
        for (const memo of [true, false]) {
          const rendered = new Set<CompId>(predict(approach, memo, state, next));
          for (const id of IDS) {
            const changed = JSON.stringify(shown(id, state)) !== JSON.stringify(shown(id, next));
            if (changed) expect(rendered.has(id), `${approach} memo=${memo} ${id}`).toBe(true);
          }
        }
      }
      state = next;
    }
  });

  it('selectors never do more work than context, and memo never more than no memo', () => {
    let state = INITIAL;
    for (const action of actions) {
      const next = reduce(state, action);
      const store = predict('store', true, state, next);
      const ctx = new Set(predict('context', true, state, next));
      expect(store.every((id) => ctx.has(id))).toBe(true);
      expect(predict('lifted', true, state, next).length).toBeLessThanOrEqual(predict('lifted', false, state, next).length);
      state = next;
    }
  });

  it('store re-renders are never wasted', () => {
    let state = INITIAL;
    for (const action of actions) {
      const next = reduce(state, action);
      for (const kind of outcome('store', true, state, next).kinds.values()) expect(kind).toBe('needed');
      state = next;
    }
  });
});

describe('the component tree', () => {
  it('has the shape the spec describes: App > Header (badge, theme), ProductList > 4 cards, Sidebar > CartSummary', () => {
    expect(COMPONENTS).toHaveLength(11);
    const kids = (id: CompId) => COMPONENTS.filter((c) => c.parent === id).map((c) => c.id);
    expect(kids('app')).toEqual(['header', 'list', 'sidebar']);
    expect(kids('list')).toEqual(['card0', 'card1', 'card2', 'card3']);
  });
});

describe('signals: the same cart as a dependency graph', () => {
  it('adding a Lamp runs the badge, that card and the summary bindings, in that order, and recomputes count and total once', () => {
    const cart = createSignalCart();
    const r = cart.apply(add(2));
    expect(r.effects.sort()).toEqual(['e-badge', 'e-card2', 'e-summary']);
    expect(r.computeds.sort()).toEqual(['count', 'total']);
  });

  it('toggling the theme runs one binding and recomputes nothing', () => {
    const r = createSignalCart().apply(THEME);
    expect(r).toEqual({ effects: ['e-theme'], computeds: [] });
  });

  it('matches the store approach: the bindings that run are exactly the components a selector store re-renders', () => {
    const cart = createSignalCart();
    let state = INITIAL;
    const rnd = mulberry32(8);
    for (let i = 0; i < 200; i++) {
      const action: Action = rnd() < 0.3 ? THEME : add(Math.floor(rnd() * 4));
      const next = reduce(state, action);
      const run = cart.apply(action);
      const bound = run.effects.map((e) => e.slice(2)).sort();
      expect(bound, `action ${i}`).toEqual([...predict('store', true, state, next)].sort());
      state = next;
    }
    expect(cart.cart()).toEqual([...state.cart]);
  });
});

describe('derived values', () => {
  it('count and total come from the cart', () => {
    const s = [add(0), add(0), add(2)].reduce(reduce, INITIAL);
    expect(count(s.cart)).toBe(3);
    expect(total(s.cart)).toBe(2 * PRODUCTS[0].price + PRODUCTS[2].price);
  });
});
