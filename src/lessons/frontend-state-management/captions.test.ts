import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import { DERIVED_INTRO, RENDER_INTRO, SWR_INTRO, actionCaption, derivedCaption, swrCaption } from './captions';
import { EMPTY_CART, editCart } from './derived';
import { INITIAL, createSignalCart, outcome, reduce, type Action, type ReactApproach } from './model';
import { swrFrames } from './swr';

const ADD_LAMP: Action = { type: 'add', product: 2 };
const THEME: Action = { type: 'theme' };

describe('render captions', () => {
  for (const approach of ['lifted', 'context', 'store'] as ReactApproach[]) {
    for (const memo of [true, false]) {
      for (const action of [ADD_LAMP, THEME]) {
        it(`${approach} memo=${memo} ${action.type}: reads cleanly and states the model's count`, () => {
          const o = outcome(approach, memo, INITIAL, reduce(INITIAL, action));
          const text = captionText(expectCaption(actionCaption(approach, memo, action, o, null)));
          expect(text).toContain(`${o.rendered.length} of 11 components re-rendered`);
        });
      }
    }
  }

  it('names the components that re-ran for nothing, and says so when there were none', () => {
    const o = outcome('lifted', true, INITIAL, reduce(INITIAL, ADD_LAMP));
    expect(captionText(actionCaption('lifted', true, ADD_LAMP, o, null))).toContain('Re-ran with identical output: Header, ProductList, Sidebar.');
    const s = outcome('store', true, INITIAL, reduce(INITIAL, ADD_LAMP));
    expect(captionText(actionCaption('store', true, ADD_LAMP, s, null))).toContain('None of them re-ran for nothing.');
  });

  it('signals: no component ran again, and it names the bindings that did from the real run', () => {
    const run = createSignalCart().apply(ADD_LAMP);
    const text = captionText(expectCaption(actionCaption('signals', true, ADD_LAMP, null, run)));
    expect(text).toContain('No component function ran again');
    expect(text).toContain('3 text bindings');
    expect(text).toContain('count and total recomputed once each');
    expect(text).not.toMatch(/card\d|\be-/);
    expect(captionText(actionCaption('signals', true, THEME, null, createSignalCart().apply(THEME)))).toContain('Nothing was recomputed');
  });

  it('the intros read cleanly', () => {
    for (const intro of [RENDER_INTRO, SWR_INTRO, DERIVED_INTRO]) expectCaption(intro);
  });
});

describe('server captions', () => {
  it('every frame in both modes, at a changed and an unchanged price, reads cleanly', () => {
    for (const price of [14, 12]) for (const mode of ['swr', 'copy'] as const) for (const f of swrFrames(price, mode)) expectCaption(swrCaption(f, mode, price));
  });

  it('calls the value stale only while the UI shows a number the server no longer has', () => {
    const frames = swrFrames(14, 'swr');
    const text = (i: number) => captionText(swrCaption(frames[i], 'swr', 14));
    const edit = frames.findIndex((f) => f.event === 'edit');
    expect(text(edit)).toContain('stale');
    expect(text(frames.findIndex((f) => f.event === 'fresh'))).not.toContain('stale');
    expect(text(frames.findIndex((f) => f.event === 'refreshed'))).toContain('fresh');
    expect(captionText(swrCaption(swrFrames(12, 'swr')[5], 'swr', 12))).toContain('nothing the UI shows is out of date');
  });

  it('the copy mode ends by saying the two sources drifted, with the real numbers', () => {
    const last = swrFrames(14, 'copy').at(-1)!;
    expect(captionText(swrCaption(last, 'copy', 14))).toContain('cache and the server say 14');
  });
});

describe('derived captions', () => {
  it('say agree before any removal and stale after one, with the figures the model holds', () => {
    let cart = editCart(EMPTY_CART, { type: 'add', product: 0 });
    expect(captionText(derivedCaption(cart, 12))).toContain('Both totals read $12');
    cart = editCart(cart, { type: 'remove', product: 0 });
    const text = captionText(expectCaption(derivedCaption(cart, 0)));
    expect(text).toContain('stored total says $12');
    expect(text).toContain('add up to $0');
  });
});
