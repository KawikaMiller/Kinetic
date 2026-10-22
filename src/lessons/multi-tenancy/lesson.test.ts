import { describe, expect, it } from 'vitest';
import { sig } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { dataCaption, noisyCaption, policyNames, shuffleCaption } from './captions';
import { enumerateOverlap, exactIdentical, exactShare, monteCarlo } from './combos';
import { ORDERS, SHOPS, listOrders } from './data';
import lesson from './index';
import { SHARED_PLACEMENT, SILO_PLACEMENT, initialData, initialIsolation, initialNoisy, initialShuffle, isolationTenants, tenantsOf } from './init';
import { NOISY_CHEAP, NO_POLICY, RATE_RANGE, SHARD_CAPACITY, runShards, type Policy } from './shardSim';

const text = expectCaption;
const noisyRun = () => {
  const n = initialNoisy();
  return runShards({ seed: n.seed, tenants: tenantsOf(n.rates.map((r, i) => (i === 0 ? NOISY_CHEAP.rate : r))), shardOf: n.shardOf, policy: NO_POLICY });
};
const iso = (mode: 'cheap' | 'expensive', policy: Partial<Policy> = {}, silo = false) => {
  const s = initialIsolation();
  return runShards({ seed: s.seed, tenants: isolationTenants(mode), shardOf: silo ? SILO_PLACEMENT : SHARED_PLACEMENT, policy: { ...NO_POLICY, ...policy } });
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: Tenant 1 is selected at the start; making it noisy puts shard 1 at 136% and costs Tenant 2 30% of its requests and a 109 ms p99, with nothing else hurt', () => {
    const n = initialNoisy();
    expect(n.selected).toBe(0);
    expect(n.rates.every((r) => r === 50)).toBe(true);
    const calm = runShards({ seed: n.seed, tenants: tenantsOf(n.rates), shardOf: n.shardOf, policy: NO_POLICY });
    expect(calm.blast(0)).toBe(0);
    const run = noisyRun();
    expect(Math.round((run.shards[0].demandWork / SHARD_CAPACITY) * 100)).toBe(136);
    expect(run.tenants[1].hurt).toBe(true);
    expect(Math.round(run.tenants[1].errorRate * 100)).toBe(30);
    expect(run.tenants[1].p99Ms).toBe(109);
    expect(run.blast(0)).toBe(1);
    expect(lesson.tryThis[0]).toContain('shard 1 asks for 136% of its capacity');
    expect(lesson.tryThis[0]).toContain('loses 30% of its requests');
    expect(lesson.tryThis[0]).toContain('109 ms p99');
    expect(NOISY_CHEAP.rate).toBeLessThanOrEqual(RATE_RANGE.max);
  });

  it('try-this 2: from the scene 2 default, the rate limit takes Tenant 2 from 30% lost to 0%, expensive requests bring it back to 17%, and the bulkhead brings it to 0%', () => {
    const s = initialIsolation();
    expect(s).toMatchObject({ mode: 'cheap', policy: NO_POLICY, silo: false });
    expect(Math.round(iso('cheap').tenants[1].errorRate * 100)).toBe(30);
    expect(Math.round(iso('cheap', { rateLimit: true }).tenants[1].errorRate * 100)).toBe(0);
    expect(Math.round(iso('expensive', { rateLimit: true }).tenants[1].errorRate * 100)).toBe(17);
    expect(Math.round(iso('expensive', { bulkhead: true }).tenants[1].errorRate * 100)).toBe(0);
    expect(iso('expensive', { rateLimit: true }).tenants[0].throttled).toBe(0);
    expect(lesson.tryThis[1]).toContain('Tenant 2 loses 30%');
    expect(lesson.tryThis[1]).toContain('it loses 0%. Now pick');
    expect(lesson.tryThis[1]).toContain('loses 17% (the expensive stream is under the limit)');
    expect(lesson.tryThis[1]).toContain('Switch the bulkhead on: it loses 0%');
    const fair = iso('expensive', { fair: true }).tenants[1];
    expect(Math.round(fair.errorRate * 100)).toBe(0);
    expect(Math.round(fair.p99Ms ?? -1)).toBe(201);
    expect(lesson.tryThis[1]).toContain('With fair queueing instead: 0% lost and a 201 ms p99, still over the 100 ms line');
  });

  it('try-this 3: siloing Tenant 1 leaves no neighbour on its shard hurt, and Tenant 1 still loses 18% of its own requests', () => {
    const run = iso('cheap', {}, true);
    expect(run.blast(0)).toBe(0);
    expect(run.tenants.filter((t) => t.shard === run.tenants[0].shard)).toHaveLength(1);
    expect(Math.round(run.tenants[0].errorRate * 100)).toBe(18);
    expect(lesson.tryThis[2]).toContain('press Reset first');
    expect(lesson.tryThis[2]).toContain('still loses 18%');
  });

  it('try-this 4: N = 8, k = 2 shares in 13 of 28 and loses in 1; k = 3 shares in 82.1% and loses in 1.8%', () => {
    const s = initialShuffle();
    expect(s).toMatchObject({ n: 8, k: 2 });
    expect(enumerateOverlap(8, 2)).toEqual({ sharing: 13, identical: 1, total: 28 });
    expect(exactShare(8, 3)).toBeCloseTo(46 / 56, 12);
    expect(exactIdentical(8, 3)).toBeCloseTo(1 / 56, 12);
    expect(lesson.tryThis[3]).toContain('13 of 28 assignments (46.4%)');
    expect(lesson.tryThis[3]).toContain('sharing rises to 82.1%');
    expect(lesson.tryThis[3]).toContain('falls to 1.8%');
  });

  it('try-this 5: the forgotten filter returns 5 of 8 rows that belong to other tenants, and row-level security returns 0', () => {
    expect(initialData()).toEqual({ model: 'pooled', rowLevelSecurity: false, ran: false });
    const r = listOrders('pooled', SHOPS[0], { filtered: false, rowLevelSecurity: false });
    expect(r.leaked).toBe(5);
    expect(r.rows).toHaveLength(ORDERS.length);
    expect(listOrders('pooled', SHOPS[0], { filtered: false, rowLevelSecurity: true }).leaked).toBe(0);
    expect(lesson.tryThis[4]).toContain('5 of the 8 rows');
  });
});

describe('every scene opens in the state its try-this assumes', () => {
  it('the four openings are independent fresh objects', () => {
    const a = initialNoisy();
    a.rates[0] = 600;
    a.shardOf[0] = 3;
    expect(initialNoisy().rates[0]).toBe(50);
    expect(initialNoisy().shardOf[0]).toBe(0);
    const b = initialIsolation();
    b.policy.rateLimit = true;
    expect(initialIsolation().policy.rateLimit).toBe(false);
    expect([initialNoisy(), initialIsolation(), initialShuffle(), initialData()].map((s) => typeof s)).toEqual(['object', 'object', 'object', 'object']);
  });

  it('the shared placement has two tenants on each of four shards, and the silo gives Tenant 1 a shard alone', () => {
    for (let sh = 0; sh < 4; sh++) expect(SHARED_PLACEMENT.filter((x) => x === sh)).toHaveLength(2);
    expect(SILO_PLACEMENT.filter((x) => x === SILO_PLACEMENT[0])).toHaveLength(1);
    expect(SILO_PLACEMENT).toHaveLength(8);
  });
});

describe('hidden controls do not feed visible numbers', () => {
  it('row-level security is shown only for the pooled design, and it changes nothing for a schema or a database per tenant', () => {
    for (const model of ['schema', 'database'] as const) {
      expect(listOrders(model, SHOPS[1], { filtered: false, rowLevelSecurity: true })).toEqual(listOrders(model, SHOPS[1], { filtered: false, rowLevelSecurity: false }));
    }
  });

  it('the seed changes the traffic and nothing else: calm tenants stay calm on every seed from 0 to 9', () => {
    for (let seed = 0; seed < 10; seed++) {
      const n = initialNoisy();
      const run = runShards({ seed, tenants: tenantsOf(n.rates), shardOf: n.shardOf, policy: NO_POLICY });
      expect(run.blast(0), `seed ${seed}`).toBe(0);
    }
  });

  it('a tenant that is not the actor changes nothing about the actor\'s own numbers when it is moved to a quiet shard', () => {
    const n = initialNoisy();
    const tenants = tenantsOf(n.rates);
    const a = runShards({ seed: 0, tenants, shardOf: n.shardOf, policy: NO_POLICY });
    const moved = runShards({ seed: 0, tenants, shardOf: n.shardOf.map((s, i) => (i === 2 ? 0 : s)), policy: NO_POLICY });
    expect(moved.tenants[3].p99Ms).toBeLessThanOrEqual((a.tenants[3].p99Ms as number) + 1);
    expect(moved.tenants[0].arrivals).toBe(a.tenants[0].arrivals);
  });
});

describe('captions say what the run measured', () => {
  it('the noisy caption quotes the actor\'s demand, its shard mates, the protection and the neighbours hurt, in every protection combination', () => {
    for (let mask = 0; mask < 8; mask++) {
      const policy: Policy = { rateLimit: !!(mask & 1), bulkhead: !!(mask & 2), fair: !!(mask & 4) };
      for (const mode of ['cheap', 'expensive'] as const) {
        const run = iso(mode, policy);
        const t = text(noisyCaption(run, 0));
        expect(t).toContain(`Tenant 1 asks its shard for ${sig(run.tenants[0].demandWork)} ms`);
        expect(t.includes('no neighbour is hurt')).toBe(run.blast(0) === 0);
        expect(t.includes('Protection on')).toBe(policyNames(policy).length > 0);
        expect(t).toContain('It shares shard 1 with Tenant 2');
      }
    }
  });

  it('a siloed actor shares its shard with nobody and the caption says so', () => {
    expect(text(noisyCaption(iso('cheap', {}, true), 0))).toContain('Nobody else shares shard 1');
  });

  it('the shuffle caption quotes exact counts and what was measured, and the verdict follows the drawn tenant', () => {
    const est = monteCarlo(8, 2, 20_000, 1);
    expect(text(shuffleCaption(8, 2, est, { sharing: false, identical: false }))).toContain('13 of 28 (46.4%)');
    expect(text(shuffleCaption(8, 2, est, { sharing: false, identical: false }))).toContain('shares no worker');
    expect(text(shuffleCaption(8, 2, est, { sharing: true, identical: false }))).toContain('shares a worker and keeps the rest');
    expect(text(shuffleCaption(8, 2, est, { sharing: true, identical: true }))).toContain('all down');
  });

  it('the data caption says whether a row of another tenant came back, and why', () => {
    const open = listOrders('pooled', SHOPS[0], { filtered: false, rowLevelSecurity: false });
    expect(text(dataCaption('pooled', true, SHOPS[0], open, false))).toContain('5 from other tenants');
    const guarded = listOrders('pooled', SHOPS[0], { filtered: false, rowLevelSecurity: true });
    expect(text(dataCaption('pooled', true, SHOPS[0], guarded, true))).toContain('none from another tenant');
    expect(text(dataCaption('schema', true, SHOPS[0], listOrders('schema', SHOPS[0], { filtered: false, rowLevelSecurity: false }), false))).toContain('reaches only this tenant');
    expect(text(dataCaption('pooled', false, SHOPS[0], open, false))).toContain('Run the query');
  });
});
