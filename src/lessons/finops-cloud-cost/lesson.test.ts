import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { PRESETS, bill, dayCost, optimumByRule, optimumByScan, requestsPerDay, storagePerDay, transfer } from './cost';
import lesson from './index';
import { BILL_OPENING, BYTES_OPENING, OPENING, WEB, WEB_OPTIMUM, billCaption, breakEvenHours, bytesCaption, commitRule, dayCaption, spotReason } from './view';

describe('scenes', () => {
  it('every scene component carries its own key and no component is shared between scenes', () => {
    const els = sceneElements('finops-cloud-cost');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('finops-cloud-cost')).toEqual([]);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(OPENING).toMatchObject({ preset: 'web', committed: 0, work: 'user', spot: false });
    expect(BYTES_OPENING).toEqual({ zones: 3, sameZone: 0 });
    expect(BILL_OPENING).toEqual({ committed: 4, zones: 3, sameZone: 0, tier: 'standard', readsTenths: 12 });
    expect(WEB_OPTIMUM).toBe(4);
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: $112.00 and $5.56 per million with nothing committed; at 4: $89.60, $4.44, 87.5%', () => {
    const none = dayCaption(WEB, 0, false);
    expect(none).toContain('$112.00 per day, $5.56 per million requests');
    const four = dayCaption(WEB, 4, false);
    expect(four).toContain('$89.60 per day, $4.44 per million requests');
    expect(four).toContain('87.5% of the paid capacity used');
    expect(lesson.tryThis[0]).toContain('$112.00 per day and $5.56 per million');
    expect(lesson.tryThis[0]).toContain('$89.60 and $4.44 per million');
  });

  it('try-this 2: committing the peak costs $115.20, more than $112.00, and 58.3% of the paid capacity is used', () => {
    const text = dayCaption(WEB, 8, false);
    expect(text).toContain('$115.20 per day');
    expect(text).toContain('This costs more than committing nothing ($112.00).');
    expect(text).toContain('58.3%');
    expect(lesson.tryThis[1]).toContain('$115.20');
  });

  it('try-this 3: 6,720 GB cost $134.40, more than the $89.60 of compute; at 90% in-zone 672 GB and $13.44', () => {
    const open = BYTES_OPENING;
    const text = bytesCaption(requestsPerDay(WEB), open.zones, open.sameZone);
    expect(text).toContain('6,720 of 10,080 GB cross a zone boundary per day, costing $134.40: more than the $89.60 of compute');
    const local = bytesCaption(requestsPerDay(WEB), 3, 0.9);
    expect(local).toContain('672 of 10,080 GB');
    expect(local).toContain('$13.44');
    expect(local).toContain('15% of the $89.60');
  });

  it('try-this 4: $227.33 and $11.28 per million; the colder tier at 0.0 reads is $1.33 of storage, at 3.0 reads $6.33, standard $3.33', () => {
    const o = BILL_OPENING;
    const text = billCaption(o.committed, o.zones, o.sameZone, o.tier, o.readsTenths / 10);
    expect(text).toContain('= $227.33 per day, $11.28 per million requests');
    expect(text).toContain('the two tiers cost the same');
    expect(storagePerDay('standard', 0).toFixed(2)).toBe('3.33');
    expect(storagePerDay('cold', 0).toFixed(2)).toBe('1.33');
    expect(storagePerDay('cold', 3).toFixed(2)).toBe('6.33');
    expect(billCaption(4, 3, 0, 'cold', 0)).toContain('colder tier is cheaper');
    expect(billCaption(4, 3, 0, 'cold', 3)).toContain('standard tier is cheaper');
    expect(lesson.tryThis[3]).toContain('$227.33, or $11.28 per million');
  });
});

describe('manipulations: the wrong move and what the page says', () => {
  it('manipulation 1: committing to the peak reads "this costs more than committing nothing"', () => {
    expect(dayCaption(WEB, 8, false)).toContain('costs more than committing nothing');
    expect(dayCaption(WEB, 4, false)).not.toContain('costs more than committing nothing');
  });

  it('manipulation 2: with no zone-local routing the network line passes the compute line, and the sentence is derived from the numbers', () => {
    const compute = dayCost(WEB, WEB_OPTIMUM).total;
    expect(transfer(requestsPerDay(WEB), 3, 0).cost).toBeGreaterThan(compute);
    expect(bytesCaption(requestsPerDay(WEB), 3, 0)).toContain('more than the');
    expect(bytesCaption(requestsPerDay(WEB), 3, 0.9)).not.toContain('more than the');
  });

  it('manipulation 3: interruptible capacity for the user-facing web traffic is refused with the reason', () => {
    expect(spotReason('user')).toContain('cannot be redone for free');
    expect(spotReason('queue')).toBeNull();
  });
});

describe('the no-traffic state prints words, not NaN', () => {
  it('the caption says no traffic and never prints NaN or Infinity', () => {
    const none = PRESETS.none.profile;
    const text = dayCaption(none, 0, false);
    expect(text).toContain('No traffic: there is no cost per request to show');
    expect(text).not.toMatch(/NaN|Infinity/);
    const b = bill(none, 0, 3, 0, 'standard', 1.2);
    expect(b.perMillion).toBeNull();
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas and quiz explanations quote the model\'s numbers', () => {
    expect(lesson.keyIdeas[0]).toContain('$115.20 against $112.00');
    expect(lesson.keyIdeas[1]).toContain('$5.56 per million requests with nothing committed and $4.44');
    expect(lesson.keyIdeas[2]).toContain('$134.40 per day against $89.60 of compute');
    expect(lesson.keyIdeas[2]).toContain('$13.44');
    expect(lesson.keyIdeas[3]).toContain('1.20 full reads');
    expect([0, 2, 3, 4, 6, 8].map((c) => dayCost(WEB, c).total.toFixed(2))).toEqual(['112.00', '92.80', '91.20', '89.60', '102.40', '115.20']);
    expect(lesson.quiz[1].why).toContain('$112.00, $92.80, $91.20, $89.60, $102.40 and $115.20');
  });
});

describe('the commit rule under the cost curve is derived from the burst price', () => {
  it('with interruptible burst the break-even exceeds the day, so the rule says committing does not pay and the cheapest level really is 0 on every preset', () => {
    expect(breakEvenHours(true)).toBeGreaterThan(24);
    expect(breakEvenHours(false)).toBeCloseTo(14.4, 12);
    for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const profile = PRESETS[id].profile;
      expect(optimumByScan(profile, true), id).toBe(0);
      expect(optimumByRule(profile, true), id).toBe(0);
    }
    const spotRule = commitRule(true);
    expect(spotRule).toContain('committing does not pay, and the cheapest level is 0');
    expect(spotRule).not.toContain('60%');
    expect(dayCaption(WEB, 4, true)).toContain('The cheapest level for this profile is 0');
  });

  it('on demand the rule states the 14.4-hour (60%) break-even, and it names the level the scan finds on the web profile', () => {
    const rule = commitRule(false);
    expect(rule).toContain('more than 14.4 of the 24 hours (60% of the day)');
    expect(optimumByScan(WEB, false)).toBe(4);
    expect(optimumByRule(WEB, false)).toBe(4);
  });
});
