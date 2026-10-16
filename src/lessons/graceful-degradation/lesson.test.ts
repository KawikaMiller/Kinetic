import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { brownoutCaption, staleIntro, staleMilestones, staleSummary, widgetCaption } from './captions';
import lesson from './index';
import { PRESETS, applyPreset, initialBrownout, initialStale, initialWidgets } from './init';
import {
  BROKEN_SEED, CACHE_DEFAULT, CACHE_RANGES, DEFAULT_POLICY, FULL_RATE, LOAD_RANGE, NO_BUGS, PRICE, QUEUE_BOUND, SERVICES, THRESHOLD_RANGE,
  allUp, brownoutPoint, checkout, firstMinute, journey, pageMs, runQueue, runTimeline, softSweep, tagVerdicts, withHealth, widgetStates,
} from './model';

const text = expectCaption;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: "pricing down" errors the Price widget and blocks Pay; a stale-cache Price widget still leaves Pay blocked', () => {
    const s = applyPreset(initialWidgets(), 'pricing-down');
    expect(initialWidgets().selected).toBe('price');
    expect(widgetStates(s.health, s.policies, NO_BUGS).price).toBe('error');
    const steps = journey(s.health, s.policies);
    expect(steps.map((x) => x.ok)).toEqual([true, true, false]);
    expect(steps[2].reason).toContain('live price');
    const stale = { ...s.policies, price: 'stale' as const };
    expect(widgetStates(s.health, stale, NO_BUGS).price).toBe('stale');
    expect(journey(s.health, stale)[2].ok).toBe(false);
    expect(lesson.tryThis[0]).toContain('blocked at Pay');
  });

  it('try-this 2: from the default, tagging Pricing soft flags exactly 1 tag', () => {
    const s = initialWidgets();
    expect(tagVerdicts(s.tags, s.policies).filter((v) => v.problem)).toHaveLength(0);
    const flagged = tagVerdicts({ ...s.tags, pricing: 'soft' }, s.policies).filter((v) => v.problem);
    expect(flagged.map((v) => v.service)).toEqual(['pricing']);
    expect(lesson.tryThis[1]).toContain('flags 1 tag');
  });

  it('try-this 3: the buy button that waits on recommendations makes the sweep name {recs}, and without it the sweep finds none', () => {
    const s = initialWidgets();
    expect(softSweep(s.tags, s.policies, NO_BUGS).failing).toBeNull();
    expect(softSweep(s.tags, s.policies, { buyWaitsForRecs: true }).failing).toEqual(['recs']);
    expect(lesson.tryThis[2]).toContain('{recs}');
  });

  it('try-this 4: at the brownout defaults the core page carries 100/s at 50%; at 140% it is 120% of capacity and seed 0 breaks the bound', () => {
    const d = initialBrownout();
    const calm = brownoutPoint(d.lambda, d.threshold, d.degrade);
    expect(d.seed).toBe(BROKEN_SEED);
    expect(calm.on).toEqual([true, false, false, false]);
    expect(calm.rho).toBeCloseTo(0.5, 12);
    const high = brownoutPoint(d.lambda, 1.4, true);
    expect(high.on).toEqual([true, true, true, true]);
    expect(d.lambda / FULL_RATE).toBeCloseTo(1.2, 12);
    const run = runQueue(d.seed, d.lambda, high.mu);
    expect(run.brokeAtS).not.toBeNull();
    expect(lesson.tryThis[3]).toContain(`passes ${QUEUE_BOUND} requests`);
    expect(lesson.tryThis[3]).toContain(`after ${Number((run.brokeAtS as number).toPrecision(3))} s`);
    expect(lesson.tryThis[3]).toContain('50%');
    expect(lesson.tryThis[3]).toContain('120%');
  });

  it('try-this 5: at the stale defaults stale begins at minute 12 on a 6-minute-old copy and errors begin at 42; trusting the cache charges $19.99 against $24.99', () => {
    const rows = runTimeline(initialStale().cache);
    expect(firstMinute(rows, 'stale')).toBe(12);
    expect(rows[12].age).toBe(6);
    expect(firstMinute(rows, 'error')).toBe(42);
    const last = CACHE_DEFAULT.outageStart + CACHE_DEFAULT.outageLength - 1;
    const bug = checkout('stale-price', last, false, rows[last].fetchedAt);
    expect(bug.charged).toBe(19.99);
    expect(bug.livePrice).toBe(24.99);
    expect(lesson.tryThis[4]).toContain('from minute 12 the user sees a copy 6 minutes old');
    expect(lesson.tryThis[4]).toContain('from minute 42');
    expect(lesson.tryThis[4]).toContain('charges $19.99 while the live price is $24.99');
  });
});

describe('every scene opens in the state its try-this assumes', () => {
  it('scene 1 opens with all services up, the default policies and tags, the Price card selected and no bug', () => {
    const s = initialWidgets();
    expect(SERVICES.every((x) => s.health[x] === 'up')).toBe(true);
    expect(s.policies).toEqual(DEFAULT_POLICY);
    expect(s.buyWaitsForRecs).toBe(false);
    expect(journey(s.health, s.policies).every((x) => x.ok)).toBe(true);
    expect(pageMs(s.health, s.policies)).toBe(120);
  });

  it('the opening states are fresh objects each time, so one scene or reset never leaks into the next', () => {
    const a = initialWidgets();
    a.health.reviews = 'down';
    a.policies.price = 'hide';
    a.tags.pricing = 'soft';
    expect(initialWidgets().health.reviews).toBe('up');
    expect(initialWidgets().policies.price).toBe('live');
    expect(initialWidgets().tags.pricing).toBe('hard');
    const c = initialStale();
    c.cache.ttl = 1;
    expect(initialStale().cache.ttl).toBe(CACHE_DEFAULT.ttl);
    expect(initialBrownout()).toEqual(initialBrownout());
  });

  it('visiting all three openings in order gives the same states as visiting them alone', () => {
    const together = [initialWidgets(), initialBrownout(), initialStale()];
    expect(together[0]).toEqual(initialWidgets());
    expect(together[1]).toEqual(initialBrownout());
    expect(together[2]).toEqual(initialStale());
  });

  it('each preset changes only the failures, and "everything soft down" follows the current tags', () => {
    for (const p of PRESETS) {
      const s = applyPreset(initialWidgets(), p.id);
      expect(s.policies).toEqual(DEFAULT_POLICY);
      expect(s.tags).toEqual(initialWidgets().tags);
    }
    const soft = applyPreset(initialWidgets(), 'soft-down');
    expect(SERVICES.filter((x) => soft.health[x] === 'down')).toEqual(['inventory', 'reviews', 'recs', 'profile', 'search']);
    expect(journey(soft.health, soft.policies).every((x) => x.ok)).toBe(true);
    const retagged = applyPreset({ ...initialWidgets(), tags: { ...initialWidgets().tags, pricing: 'soft' } }, 'soft-down');
    expect(retagged.health.pricing).toBe('down');
  });
});

describe('hidden controls do not feed visible numbers', () => {
  it('with the brownout off, the threshold slider changes nothing: every output is the same at both extremes', () => {
    for (let l = LOAD_RANGE.min; l <= LOAD_RANGE.max; l += LOAD_RANGE.step) {
      const a = brownoutPoint(l, THRESHOLD_RANGE.min, false);
      const b = brownoutPoint(l, THRESHOLD_RANGE.max, false);
      expect(a).toEqual(b);
    }
  });

  it('the outage-so-far slider changes only the age shown on a stale widget, never the journey or the page time', () => {
    const s = applyPreset(initialWidgets(), 'reviews-down');
    const stale = { ...s.policies, reviews: 'stale' as const };
    expect(pageMs(s.health, stale)).toBe(140);
    const at = (m: number) => text(widgetCaption(s.health, stale, NO_BUGS, m));
    expect(at(0)).toContain('4 min old');
    expect(at(30)).toContain('34 min old');
    expect(at(0).replace(/\d+ min old/, 'N min old')).toBe(at(30).replace(/\d+ min old/, 'N min old'));
  });

  it('the buy-button bug changes nothing while recommendations are up', () => {
    const base = journey(allUp(), DEFAULT_POLICY);
    expect(journey(allUp(), DEFAULT_POLICY, { buyWaitsForRecs: true })).toEqual(base);
    expect(widgetStates(withHealth(allUp(), { reviews: 'down' }), DEFAULT_POLICY, { buyWaitsForRecs: true })).toEqual(widgetStates(withHealth(allUp(), { reviews: 'down' }), DEFAULT_POLICY));
  });
});

describe('captions say what the model computed', () => {
  it('the widget caption names every failed service, every changed widget, the page time and the verdict, for each preset and the bug', () => {
    for (const bug of [false, true]) {
      for (const p of PRESETS) {
        const s = applyPreset(initialWidgets(), p.id);
        const o = { buyWaitsForRecs: bug };
        const t = text(widgetCaption(s.health, s.policies, o, 4));
        for (const svc of SERVICES.filter((x) => s.health[x] !== 'up')) expect(t.toLowerCase()).toContain(`${svc === 'recs' ? 'recs' : svc} is ${s.health[svc]}`);
        const works = journey(s.health, s.policies, o).every((x) => x.ok);
        expect(t.includes('core journey still works')).toBe(works);
        expect(t.includes('core journey blocked')).toBe(!works);
        expect(t).toContain('The page takes');
      }
    }
  });

  it('the healthy caption says the page takes 120 ms', () => {
    expect(text(widgetCaption(allUp(), DEFAULT_POLICY, NO_BUGS, 4))).toContain('the page takes 120 ms');
  });

  it('pricing down names the reason Pay is blocked', () => {
    const s = applyPreset(initialWidgets(), 'pricing-down');
    const t = text(widgetCaption(s.health, s.policies, NO_BUGS, 4));
    expect(t).toContain('core journey blocked at Pay');
    expect(t).toContain('a charge needs the live price');
    expect(t).toContain('Price is an error');
  });

  it('the brownout caption reads the model at the slider extremes: capacity, utilisation and the break time', () => {
    for (const lambda of [LOAD_RANGE.min, 100, LOAD_RANGE.max]) {
      for (const threshold of [THRESHOLD_RANGE.min, 0.7, THRESHOLD_RANGE.max]) {
        for (const degrade of [true, false]) {
          const point = brownoutPoint(lambda, threshold, degrade);
          const run = runQueue(0, lambda, point.mu);
          const t = text(brownoutCaption(lambda, threshold, degrade, point, run, 0));
          expect(t).toContain(`At ${lambda}/s`);
          expect(t.includes('grows without bound')).toBe(point.rho >= 1);
          expect(t.includes('Mean time in the system')).toBe(point.rho < 1);
          if (run.brokeAtS !== null) expect(t).toContain(`passed ${QUEUE_BOUND} requests`);
        }
      }
    }
  });

  it('the stale milestones sit at the minutes the model produced, and the summary reports the counts it measured', () => {
    for (const cache of [CACHE_DEFAULT, { ...CACHE_DEFAULT, staleIfError: 0 }, { ...CACHE_DEFAULT, outageLength: 0 }, { ...CACHE_DEFAULT, ttl: CACHE_RANGES.ttl.max, staleIfError: CACHE_RANGES.staleIfError.max, outageLength: CACHE_RANGES.outageLength.max }]) {
      const rows = runTimeline(cache);
      const ms = staleMilestones(cache, rows);
      const stale = firstMinute(rows, 'stale');
      const error = firstMinute(rows, 'error');
      expect(ms.some((m) => m.t === stale && text(m.say).includes(`updated ${rows[stale ?? 0].age} min ago`))).toBe(stale !== null);
      expect(ms.some((m) => m.t === error && text(m.say).includes('an error'))).toBe(error !== null);
      ms.forEach((m) => text(m.say));
      text(staleIntro(cache));
      const probe = Math.min(90, Math.max(0, cache.outageStart + cache.outageLength - 1));
      for (const rule of ['fail-closed', 'stale-price'] as const) {
        const t = text(staleSummary(cache, rows, rule, checkout(rule, probe, rows[probe].originUp, rows[probe].fetchedAt)));
        expect(t).toContain(`${rows.filter((r) => r.served === 'stale').length} stale minute`);
        expect(t).toContain(rule === 'fail-closed' ? (rows[probe].originUp ? 'charged the live' : 'refused') : 'Checkout');
      }
    }
  });

  it('the price constants used in prose are the model constants', () => {
    expect(PRICE.before).toBe(19.99);
    expect(PRICE.after).toBe(24.99);
    expect(FULL_RATE).toBeCloseTo(83.333, 3);
  });
});
