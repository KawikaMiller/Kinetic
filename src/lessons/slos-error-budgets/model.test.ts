import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildFrames, type SloFrame } from './frames';
import {
  ALERT_RULES, BACKGROUND, INCIDENTS, MIN_PER_DAY, SLOS, WINDOW_DAYS, WINDOW_MIN, alertCounts, alertFor, alertReason, backgroundBurn,
  badMinutes, budgetMinutes, budgetShare, exhaustionDay, fmtBurn, fmtMinutes, policyFor, type Incident,
} from './model';

const text = (f: SloFrame) => renderToStaticMarkup(createElement(Fragment, null, f.say)).replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");
const incident = (id: string): Incident => INCIDENTS.find((i) => i.id === id)!;
const endDay = (i: Incident) => i.start + i.durMin / MIN_PER_DAY;
const ongoing = (i: Incident, t: number) => i.start <= t && t < endDay(i);

describe('error budget arithmetic', () => {
  it('budgetMinutes is (100% - SLO) of 43,200 minutes, worked by hand', () => {
    // 30 days × 24 h × 60 min = 43,200 min. 1% = 432, 0.5% = 216, 0.1% = 43.2, 0.05% = 21.6, 0.01% = 4.32.
    expect(WINDOW_MIN).toBe(43_200);
    const hand: [number, number][] = [[99, 432], [99.5, 216], [99.9, 43.2], [99.95, 21.6], [99.99, 4.32]];
    for (const [slo, minutes] of hand) expect(budgetMinutes(slo)).toBeCloseTo(minutes, 6);
    expect(SLOS.map((s) => +budgetMinutes(s).toFixed(2))).toEqual(hand.map(([, m]) => m));
  });

  it('each extra nine cuts the budget by 10: 7.2 h, 43.2 min, 4.32 min', () => {
    expect(budgetMinutes(99) / budgetMinutes(99.9)).toBeCloseTo(10, 9);
    expect(budgetMinutes(99.9) / budgetMinutes(99.99)).toBeCloseTo(10, 9);
    expect(fmtMinutes(budgetMinutes(99))).toBe('7.2 h');
    expect(fmtMinutes(budgetMinutes(99.9))).toBe('43.2 min');
    expect(fmtMinutes(budgetMinutes(99.99))).toBe('4.32 min');
  });

  it('the 14.4x = 2% arithmetic: 14.4 x 1 h / 720 h; 6x for 6 h is 5%; 1x for 3 days is 10%', () => {
    expect(WINDOW_DAYS * 24).toBe(720);
    expect(14.4 / 720).toBeCloseTo(0.02, 12);
    const [fast, slow, ticket] = ALERT_RULES;
    expect(budgetShare(fast)).toBeCloseTo(0.02, 12);
    expect(budgetShare(slow)).toBeCloseTo(0.05, 12);
    expect(budgetShare(ticket)).toBeCloseTo(0.1, 12);
  });

  it('quiz Q2: a 1.44% error rate against a 99.9% SLO is a 14.4x burn, and Q5: 1 hour at 14.4x spends 2%', () => {
    expect(0.0144 / (1 - 0.999)).toBeCloseTo(14.4, 9);
    const hour = { id: 'x', name: 'x', start: 0, durMin: 60, err: 0.0144 - BACKGROUND, color: '' };
    expect(alertFor(hour, 99.9).burn1h).toBeCloseTo(14.4, 9);
    expect(alertFor(hour, 99.9).kind).toBe('page');
    expect(alertFor({ ...hour, err: 0.0138 }, 99.9).burn1h).toBeLessThan(14.4);
    expect((14.4 * 1) / 720).toBeCloseTo(0.02, 12);
  });

  it('burn rate is the background rate over the allowed rate, rounded against float noise', () => {
    expect(backgroundBurn(99.99)).toBe(1);
    expect(backgroundBurn(99.9)).toBe(0.1);
    expect(backgroundBurn(99)).toBe(0.01);
    expect(fmtBurn(0.1)).toBe('0.1×');
    expect(fmtBurn(133.3)).toBe('133×');
  });

  it('policyFor follows the bands: over half left ships, up to half cares, none left freezes', () => {
    expect(policyFor(100)).toBe('ship');
    expect(policyFor(50.1)).toBe('ship');
    expect(policyFor(50)).toBe('care');
    expect(policyFor(0.1)).toBe('care');
    expect(policyFor(0)).toBe('freeze');
    expect(policyFor(-80)).toBe('freeze');
  });
});

describe('the month', () => {
  it('incidents never overlap, so a caption about one is never about two running at once', () => {
    const sorted = [...INCIDENTS].sort((a, b) => a.start - b.start);
    sorted.slice(1).forEach((inc, i) => expect(inc.start).toBeGreaterThan(endDay(sorted[i])));
  });

  it('badMinutes starts at zero, only grows, and with no incident yet is the background rate alone', () => {
    expect(badMinutes(0)).toBe(0);
    expect(badMinutes(1)).toBeCloseTo(BACKGROUND * MIN_PER_DAY, 9);
    let prev = 0;
    for (let t = 0; t <= WINDOW_DAYS; t += 0.25) {
      expect(badMinutes(t)).toBeGreaterThanOrEqual(prev);
      prev = badMinutes(t);
    }
  });

  it('the month total is the incidents plus the background, summed by hand', () => {
    // deploy 0.2 x 25 = 5, failover 1 x 8 = 8, leak 0.0015 x 3,600 = 5.4, region 0.6 x 45 = 27, background 0.0001 x 43,200 = 4.32
    expect(badMinutes(WINDOW_DAYS)).toBeCloseTo(5 + 8 + 5.4 + 27 + 4.32, 9);
  });

  it('exhaustionDay is the first minute the spend reaches the budget, matching a minute-by-minute scan', () => {
    for (const slo of SLOS) {
      const budget = budgetMinutes(slo);
      let scanned: number | null = null;
      for (let m = 0; m <= WINDOW_MIN && scanned === null; m++) if (badMinutes(m / MIN_PER_DAY) >= budget) scanned = m / MIN_PER_DAY;
      const found = exhaustionDay(slo);
      if (scanned === null) expect(found, `${slo}%`).toBeNull();
      else expect(found!, `${slo}%`).toBeGreaterThan(scanned - 1 / MIN_PER_DAY);
      if (scanned !== null) expect(found!).toBeLessThanOrEqual(scanned + 1e-9);
    }
  });
});

describe('try-this', () => {
  it('try-this 1: at 99.9% the budget runs out on day 23, during the region outage', () => {
    const day = exhaustionDay(99.9)!;
    expect(Math.floor(day)).toBe(23);
    expect(ongoing(incident('region'), day)).toBe(true);
    const caption = buildFrames(99.9).map(text).find((c) => c.includes('Budget exhausted'));
    expect(caption).toContain('Budget exhausted on day 23');
  });

  it('try-this 2: at 99% the same incidents use about 12% of the budget and the region outage is the one page', () => {
    const share = badMinutes(WINDOW_DAYS) / budgetMinutes(99);
    expect(Math.round(share * 100)).toBe(12);
    const kinds = Object.fromEntries(INCIDENTS.map((i) => [i.id, alertFor(i, 99).kind]));
    expect(kinds).toEqual({ deploy: null, failover: null, leak: null, region: 'page' });
    expect(alertCounts(99, WINDOW_DAYS)).toEqual({ pages: 1, tickets: 0 });
    expect(exhaustionDay(99)).toBeNull();
  });

  it('try-this 3: at 99.99% the background alone is a 1x burn that spends exactly the budget, and the incidents empty it by day 4', () => {
    expect(backgroundBurn(99.99)).toBe(1);
    expect(BACKGROUND * WINDOW_MIN).toBeCloseTo(budgetMinutes(99.99), 9);
    expect(Math.floor(exhaustionDay(99.99)!)).toBe(4);
  });

  it('try-this 4: the leak tickets at 99.9% (1.4x over 3 days) and pages at 99.99% (16x over 1 hour)', () => {
    const leak = incident('leak');
    const low = alertFor(leak, 99.9);
    expect(low.kind).toBe('ticket');
    expect(fmtBurn(low.burn3d)).toBe('1.4×');
    expect(low.burn1h).toBeLessThan(14.4);
    const high = alertFor(leak, 99.99);
    expect(high.kind).toBe('page');
    expect(fmtBurn(high.burn1h)).toBe('16×');
  });
});

describe('alerts', () => {
  /** Each tier checked with the arithmetic written out, not by calling alertFor. */
  const expectedKind = (inc: Incident, slo: number) => {
    const burn = (windowMin: number) => (inc.err * Math.min(inc.durMin, windowMin) + 0.0001 * windowMin) / windowMin / (1 - slo / 100);
    return burn(60) >= 14.4 || burn(360) >= 6 ? 'page' : burn(3 * MIN_PER_DAY) >= 1 ? 'ticket' : null;
  };

  it('alertFor and alertCounts agree with the written-out thresholds for every SLO and every half day', () => {
    for (const slo of SLOS) {
      for (let t = 0; t <= WINDOW_DAYS; t += 0.5) {
        const started = INCIDENTS.filter((i) => i.start <= t);
        const kinds = started.map((i) => expectedKind(i, slo));
        const background = backgroundBurn(slo) >= 1 && t > 3 ? 1 : 0;
        expect(alertCounts(slo, t), `${slo}% day ${t}`).toEqual({
          pages: kinds.filter((k) => k === 'page').length,
          tickets: kinds.filter((k) => k === 'ticket').length + background,
        });
      }
      for (const inc of INCIDENTS) expect(alertFor(inc, slo).kind, `${slo}% ${inc.id}`).toBe(expectedKind(inc, slo));
    }
  });

  it('the reason names the rule that fired, or says every window stayed under its threshold', () => {
    expect(alertReason(alertFor(incident('region'), 99.9))).toBe('450× over 1 h is at or above the 14.4× page threshold');
    expect(alertReason(alertFor(incident('leak'), 99.9))).toBe('1.4× over 3 days is at or above the 1× ticket threshold');
    expect(alertReason(alertFor(incident('deploy'), 99))).toBe('8.3× over 1 h, 1.4× over 6 h and 0.1× over 3 days stay under 14.4×, 6× and 1×');
  });
});

describe('captions are read from the month, not assumed', () => {
  /** The caption on screen at each frame: the latest `say` so far. */
  const onScreen = (slo: (typeof SLOS)[number]) => {
    let current = '';
    return buildFrames(slo).map((f) => {
      const own = f.say !== undefined;
      if (own) current = text(f);
      return { f, own, caption: current };
    });
  };

  it('a caption about an incident is only on screen while it runs, or on the frame that announced it', () => {
    for (const slo of SLOS) {
      for (const { f, own, caption } of onScreen(slo)) {
        for (const inc of INCIDENTS) {
          if (caption.includes(`${inc.name}:`)) {
            expect(own || ongoing(inc, f.t), `${slo}% day ${f.t}: "${inc.name}" caption left on screen`).toBe(true);
          }
        }
      }
    }
  });

  it('the quiet caption only appears when no incident is running', () => {
    for (const slo of SLOS) {
      for (const { f, caption } of onScreen(slo)) {
        if (caption.startsWith('Quiet stretch')) {
          expect(INCIDENTS.some((i) => ongoing(i, f.t)), `${slo}% day ${f.t}`).toBe(false);
        }
      }
    }
  });

  it('each incident is announced once with the verdict alertFor gives, and a page, ticket or no alert is named', () => {
    for (const slo of SLOS) {
      const frames = buildFrames(slo);
      for (const inc of INCIDENTS) {
        const announcing = frames.filter((f) => f.say !== undefined && text(f).includes(`${inc.name}:`));
        expect(announcing, `${slo}% ${inc.name}`).toHaveLength(1);
        const a = alertFor(inc, slo);
        const caption = text(announcing[0]);
        expect(caption.includes('Page'), `${slo}% ${inc.id}`).toBe(a.kind === 'page');
        expect(caption.includes('Ticket'), `${slo}% ${inc.id}`).toBe(a.kind === 'ticket');
        expect(caption.includes('No alert'), `${slo}% ${inc.id}`).toBe(a.kind === null);
        expect(caption).toContain(alertReason(a));
      }
    }
  });

  it('the exhausted and half-gone captions appear at the frame where the spend crosses, and only there', () => {
    for (const slo of SLOS) {
      const budget = budgetMinutes(slo);
      const frames = buildFrames(slo);
      const exhausted = frames.filter((f) => f.say !== undefined && text(f).includes('Budget exhausted'));
      const gone = exhausted.length ? exhausted[0] : null;
      expect(exhausted.length, `${slo}%`).toBe(exhaustionDay(slo) === null ? 0 : 1);
      if (gone) {
        expect(badMinutes(gone.t)).toBeGreaterThanOrEqual(budget);
        expect(text(gone)).toContain(`on day ${Math.floor(exhaustionDay(slo)!)}`);
      }
      const half = frames.filter((f) => f.say !== undefined && text(f).includes('Half the budget is gone'));
      for (const f of half) {
        const remaining = 1 - badMinutes(f.t) / budget;
        expect(remaining).toBeGreaterThan(0);
        expect(remaining).toBeLessThanOrEqual(0.5);
      }
      expect(half.length).toBeLessThanOrEqual(1);
    }
  });

  it('the opening and closing captions quote the model: budget, background burn and month total', () => {
    for (const slo of SLOS) {
      const frames = buildFrames(slo);
      expect(text(frames[0])).toContain(fmtMinutes(budgetMinutes(slo)));
      expect(text(frames[0])).toContain(fmtBurn(backgroundBurn(slo)));
      const used = badMinutes(WINDOW_DAYS);
      expect(text(frames[frames.length - 1])).toContain(`spent ${fmtMinutes(used)} of a ${fmtMinutes(budgetMinutes(slo))} budget`);
      expect(text(frames[frames.length - 1])).toContain(`${((used / budgetMinutes(slo)) * 100).toFixed(0)}%`);
    }
  });

  it('every frame is one half day apart and the replay ends at day 30', () => {
    const frames = buildFrames(99.9);
    expect(frames).toHaveLength(61);
    expect(frames[frames.length - 1].t).toBe(WINDOW_DAYS);
  });
});
