import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { classifyCaption, interestCaption, priceCaption } from './captions';
import { DEFAULT_PLAN, HORIZONS, PAYDOWN_MAX, RATE_MAX, SHORTCUT_MAX, outcome, type Plan } from './model';
import { CARDS } from './quadrant';
import { ITEMS, monthlyInterest, paybackText, paybackMonths } from './register';

const text = (plan: Plan, horizon: number) => expectCaption(interestCaption(plan, horizon));
const whole = (v: number) => Math.round(v).toLocaleString('en-US');

describe('the interest caption states what the stats show', () => {
  it('names the break-even sprint and the totals the stats print, at the default', () => {
    const o = outcome(DEFAULT_PLAN);
    const c = text(DEFAULT_PLAN, 24);
    expect(c).toContain(`sprint ${o.breakEven}`);
    expect(c).toContain(`${whole(o.total)} features against ${whole(o.baselineTotal)}`);
    expect(c).toContain(`${whole(o.finalDebt)} points of debt left against ${whole(o.baselineFinalDebt)}`);
  });

  it('says paying has not paid for itself exactly when there is no break-even, with the totals', () => {
    const low = { ...DEFAULT_PLAN, rate: 0.01 };
    const o = outcome(low);
    expect(o.breakEven).toBeNull();
    const c = text(low, 24);
    expect(c).toContain('has not paid for itself');
    expect(c).toContain(`${whole(o.total)} features against ${whole(o.baselineTotal)}`);
    expect(c).not.toMatch(/overtakes/);
  });

  it('says no paydown is planned, and calls the lines one line, when paydown is zero', () => {
    const c = text({ ...DEFAULT_PLAN, paydownShare: 0 }, 24);
    expect(c).toContain('No paydown planned');
    expect(c).toContain('one line');
    expect(c).not.toMatch(/overtakes|has not paid/);
  });

  it('mentions rushing only when the team rushes, with the sprint count the model reports', () => {
    const rushing = { ...DEFAULT_PLAN, rush: true };
    const o = outcome(rushing);
    expect(text(rushing, 24)).toContain(`extra shortcuts in ${o.rushedSprints} of 24 sprints`);
    expect(text(DEFAULT_PLAN, 24)).not.toMatch(/rushing team/);
  });

  it('stays consistent with the model over the slider extremes and every horizon', () => {
    for (const rate of [0, 0.01, RATE_MAX]) {
      for (const shortcuts of [0, 5, SHORTCUT_MAX]) {
        for (const paydownShare of [0, 0.15, PAYDOWN_MAX]) {
          for (const rush of [false, true]) {
            for (const horizon of HORIZONS) {
              const plan = { rate, shortcuts, paydownShare, rush };
              const o = outcome(plan, horizon);
              const c = text(plan, horizon);
              if (paydownShare === 0) expect(c).toContain('No paydown planned');
              else if (o.breakEven === null) expect(c).toContain('has not paid for itself');
              else expect(c).toContain(`overtakes the no-paydown plan at sprint ${o.breakEven}`);
              expect(c).toContain(whole(o.total));
              expect(c).not.toMatch(/NaN|Infinity|undefined/);
            }
          }
        }
      }
    }
  });
});

describe('the price caption', () => {
  it('quotes the selected item interest, payback and both ranks from the register', () => {
    const order = ITEMS.find((i) => i.id === 'order')!;
    const c = expectCaption(priceCaption(ITEMS, order, 12));
    expect(c).toContain(`${monthlyInterest(order)} days a month of interest`);
    expect(c).toContain(paybackText(paybackMonths(order)));
    expect(c).toContain('ranks 1 of 6 on pain and 3 of 6 on return');
  });

  it('says leave it beyond the horizon, and zero interest and never for an untouched item', () => {
    const order = ITEMS.find((i) => i.id === 'order')!;
    expect(expectCaption(priceCaption(ITEMS, order, 3))).toContain('leave it');
    expect(expectCaption(priceCaption(ITEMS, order, 12))).not.toContain('leave it');
    const report = ITEMS.find((i) => i.id === 'report')!;
    const c = expectCaption(priceCaption(ITEMS, report, 12));
    expect(c).toContain('interest is 0');
    expect(c).toContain('never');
    expect(c).toContain('In this model a mess nobody touches');
    expect(c).toContain('risk that the model leaves out');
    expect(c).not.toMatch(/Infinity|NaN/);
  });
});

describe('the classify caption', () => {
  it('counts placed cards before checking and shows the score only after', () => {
    expect(expectCaption(classifyCaption({}, false))).toContain(`0 of ${CARDS.length} cards placed`);
    expect(expectCaption(classifyCaption({}, false))).not.toMatch(/match the key/);
    const one = { demo: 'deliberate-reckless' as const };
    expect(expectCaption(classifyCaption(one, true))).toContain('1 of 1 placed cards match the key');
    expect(expectCaption(classifyCaption({ demo: 'inadvertent-prudent' as const }, true))).toContain('0 of 1 placed cards match the key');
  });
});
