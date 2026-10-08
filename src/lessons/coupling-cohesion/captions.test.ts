import { describe, expect, it } from 'vitest';
import { layoutCaption, moveCaption, requestCaption } from './captions';
import { PRESETS, PRESET_IDS, REQUESTS, moveFn, requestById } from './model';

describe('captions follow the current layout', () => {
  it('layout captions state the computed coupling', () => {
    expect(layoutCaption('By layer', PRESETS.layer.assign)).toContain('9 of 15 call edges');
    expect(layoutCaption('By feature', PRESETS.feature.assign)).toContain('3 of 15 call edges');
    expect(layoutCaption('God module', PRESETS.god.assign)).toContain('coupling is 0');
  });

  it('request captions name the edited functions and the modules, for every preset × request', () => {
    for (const p of PRESET_IDS) {
      for (const r of REQUESTS) {
        const text = requestCaption(r, PRESETS[p].assign, PRESETS[p].modules);
        expect(text).toContain(r.seed);
        expect(text).toMatch(/lands in (1 module|\d modules)/);
      }
    }
    expect(requestCaption(requestById('coupon'), PRESETS.layer.assign, PRESETS.layer.modules)).toBe(
      '"Change the coupon rules" edits couponRules and its 1 caller applyCoupon: it lands in 2 modules (services and utils), with 12 functions to re-read and retest alongside it.',
    );
    expect(requestCaption(requestById('rounding'), PRESETS.feature.assign, PRESETS.feature.modules)).toContain(
      'its 3 callers priceCart, applyCoupon and formatEmail: it lands in 2 modules (cart and email)',
    );
  });

  it('a move caption reports the before and after coupling and recomputes the active request', () => {
    const a = PRESETS.layer.assign;
    expect(moveCaption('couponRules', a, 1, PRESETS.layer.modules, requestById('coupon'))).toBe(
      'Moved couponRules to services: coupling 9 → 8 (−1). "Change the coupon rules" now lands in 1 module.',
    );
    // A move that makes things worse says so.
    const worse = moveCaption('priceCart', PRESETS.feature.assign, 2, PRESETS.feature.modules, null);
    expect(worse).toMatch(/coupling 3 → \d+ \(\+\d+\)/);
    expect(moveFn(a, 'couponRules', 2)).toEqual(a);
  });
});
