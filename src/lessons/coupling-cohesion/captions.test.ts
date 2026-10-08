import { describe, expect, it } from 'vitest';
import { layoutCaption, layoutName, moveCaption, requestCaption } from './captions';
import { PRESETS, PRESET_IDS, REQUESTS, modulesTouched, moveFn, requestById, type Assignment } from './model';

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
      "\"Change the coupon rules\" edits couponRules and its 1 caller applyCoupon: it lands in 2 modules (services and utils), with a blast radius of 12 (the functions in those modules: this lesson's rough proxy for code to re-read and retest).",
    );
    expect(requestCaption(requestById('rounding'), PRESETS.feature.assign, PRESETS.feature.modules)).toContain(
      'its 3 callers priceCart, applyCoupon and formatEmail: it lands in 2 modules (cart and email)',
    );
  });

  it('after a move the layout is "Custom layout", not the preset it started as', () => {
    const p = PRESETS.layer;
    expect(layoutName(p.label, p.assign, p.assign)).toBe('By layer');
    const moved = moveFn(p.assign, 'couponRules', 1);
    expect(layoutName(p.label, p.assign, moved)).toBe('Custom layout');
    expect(layoutCaption(layoutName(p.label, p.assign, moved), moved)).toBe('Custom layout: 8 of 15 call edges cross a module boundary. Pick a change request to see how far a change spreads.');
  });

  it('the Q2 distractor is provably false and the correct option is provably true', async () => {
    const { default: lesson } = await import('./index');
    const q = lesson.quiz[1];
    const touched = (a: Assignment) => modulesTouched(a, requestById('email')).length;
    expect(touched(PRESETS.feature.assign)).toBe(1);
    expect(q.options[q.answer]).toContain('feature');
    // "emailClient and sendReceipt in different modules" can never keep the email change in one module.
    const split = moveFn(PRESETS.feature.assign, 'sendReceipt', 0);
    expect(touched(split)).toBe(2);
    expect(q.options).toContain('Putting emailClient and sendReceipt in different modules');
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
