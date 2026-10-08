import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { EMPTY_CART, derivedTotal, editCart, isDrifting, type CartEdit, type DerivedCart } from './derived';
import { PRODUCTS } from './model';
import { FIRST_PRICE, isStale, swrFrames, swrMessages } from './swr';

describe('stale-while-revalidate', () => {
  it('shows the stale value first and the fresh one after, in that order, once the server changed', () => {
    const frames = swrFrames(14, 'swr');
    const stale = frames.map(isStale);
    const firstStale = stale.indexOf(true);
    const lastStale = stale.lastIndexOf(true);
    expect(firstStale).toBeGreaterThan(-1);
    expect(stale.slice(firstStale, lastStale + 1).every(Boolean)).toBe(true);
    expect(lastStale).toBeLessThan(frames.length - 1);
    expect(frames.at(-1)).toMatchObject({ ui: 14, cache: 14, server: 14 });
    expect(isStale(frames.at(-1)!)).toBe(false);
  });

  it('the cache answers with the old value before the revalidation request, and updates after the response', () => {
    const messages = swrMessages(14, 'swr');
    const at = (id: string) => messages.findIndex((m) => m.id === id);
    expect(at('instant')).toBeLessThan(at('revalidate'));
    expect(at('revalidate')).toBeLessThan(at('updated'));
    expect(at('updated')).toBeLessThan(at('refreshed'));
    const frames = swrFrames(14, 'swr');
    expect(frames[at('instant') + 1].ui).toBe(FIRST_PRICE);
    expect(frames[at('updated') + 1].cache).toBe(14);
    expect(frames[at('updated') + 1].ui).toBe(FIRST_PRICE);
  });

  it('the copy-into-local-state anti-pattern never catches up: cache and server say 14, the UI keeps 12', () => {
    const last = swrFrames(14, 'copy').at(-1)!;
    expect(last).toMatchObject({ server: 14, cache: 14, ui: FIRST_PRICE });
    expect(isStale(last)).toBe(true);
    expect(swrMessages(14, 'copy').at(-1)!.lost).toBe(true);
    expect(swrMessages(14, 'swr').at(-1)!.lost).toBeFalsy();
  });

  it('if the server price did not actually change, nothing is ever stale in either mode', () => {
    for (const mode of ['swr', 'copy'] as const) expect(swrFrames(FIRST_PRICE, mode).some(isStale)).toBe(false);
  });

  it('every frame points at a real message', () => {
    const n = swrMessages(20, 'swr').length;
    for (const f of swrFrames(20, 'swr')) expect(f.step).toBeLessThan(n);
    expect(swrFrames(20, 'swr').at(-1)!.step).toBe(n - 1);
  });
});

describe('derived total against a stored copy', () => {
  const rnd = mulberry32(14);
  const randomEdit = (): CartEdit => {
    const r = rnd();
    return r < 0.55 ? { type: 'add', product: Math.floor(rnd() * 4) } : r < 0.9 ? { type: 'remove', product: Math.floor(rnd() * 4) } : { type: 'clear' };
  };

  it('the derived total equals a brute-force sum after any of 300 random edit sequences', () => {
    for (let run = 0; run < 300; run++) {
      let cart: DerivedCart = EMPTY_CART;
      const quantities = [0, 0, 0, 0];
      for (let i = 0; i < 12; i++) {
        const e = randomEdit();
        cart = editCart(cart, e);
        if (e.type === 'add') quantities[e.product]++;
        else if (e.type === 'remove') quantities[e.product] = Math.max(0, quantities[e.product] - 1);
        else quantities.fill(0);
      }
      let brute = 0;
      quantities.forEach((q, p) => { for (let k = 0; k < q; k++) brute += PRODUCTS[p].price; });
      expect(derivedTotal(cart), `run ${run}`).toBe(brute);
    }
  });

  it('the stored copy stays right while only adds happen and goes stale after a remove that took something out', () => {
    let cart = EMPTY_CART;
    for (const p of [0, 2, 2, 3]) cart = editCart(cart, { type: 'add', product: p });
    expect(isDrifting(cart)).toBe(false);
    cart = editCart(cart, { type: 'remove', product: 2 });
    expect(derivedTotal(cart)).toBe(12 + 40 + 15);
    expect(cart.storedTotal).toBe(12 + 40 + 40 + 15);
    expect(isDrifting(cart)).toBe(true);
  });

  it('removing from an empty line changes nothing, so nothing drifts', () => {
    expect(isDrifting(editCart(EMPTY_CART, { type: 'remove', product: 1 }))).toBe(false);
  });
});
