import { describe, expect, it } from 'vitest';
import { initialMitigate, mitigateView, mitigationOf, STREAM_SEED } from './init';
import { conservationText, loadFractions, pct, totalOf } from './shardMath';
import {
  FILL_TICKS, KEYS, MITIGATIONS, READ_SHARE, SHARDS, SKEW, UTILISATION, copyCounts, fillSim, hottestKeys, hottestShare, keyStandsOut, makeStream, plainLoads, saturationAt, shardLoads, shardOf,
} from './skew';

describe('the mitigation stats agree with the bars and add up', () => {
  const states = MITIGATIONS.flatMap((kind) => [0, 0.2, 0.5, 0.9, 1].map((readShare) => ({ ...initialMitigate(), kind, readShare })));

  it('hottest / mean is measured against the plain mean, so it is the inverse of the saturation point and hottestLoad / utilisation (every mitigation x five read shares)', () => {
    for (const s of states) {
      const v = mitigateView(s);
      for (const [sum, loads] of [[v.nowSummary, v.now.loads], [v.withoutSummary, v.without.loads]] as const) {
        const independent = Math.max(...loads) / (v.now.requests / SHARDS);
        expect(sum.maxOverMean, `${s.kind} ${s.readShare}`).toBeCloseTo(independent, 12);
        expect(sum.maxOverMean * sum.saturatesAt).toBeCloseTo(1, 12);
        expect(sum.hottestLoad / s.util).toBeCloseTo(sum.maxOverMean, 12);
      }
      expect(v.nowSummary.maxOverMean < v.withoutSummary.maxOverMean, `${s.kind} ${s.readShare}: the ratio improves exactly when saturation does`).toBe(v.nowSummary.saturatesAt > v.withoutSummary.saturatesAt);
    }
  });

  it('the two cases that used to read as a gain are now a loss: salting at 90% reads and replicas at 0% reads', () => {
    for (const s of [{ ...initialMitigate(), kind: 'salt' as const, readShare: 0.9 }, { ...initialMitigate(), kind: 'replicate' as const, readShare: 0 }]) {
      const v = mitigateView(s);
      expect(v.nowSummary.maxOverMean).toBeGreaterThan(v.withoutSummary.maxOverMean);
      expect(v.nowSummary.saturatesAt).toBeLessThan(v.withoutSummary.saturatesAt);
      expect(v.nowSummary.hottestLoad).toBeGreaterThan(v.withoutSummary.hottestLoad);
    }
  });

  it('shard requests = requests - cached + extra, printed as exact whole numbers with separators', () => {
    for (const s of states) {
      const v = mitigateView(s);
      expect(totalOf(v.now), `${s.kind} ${s.readShare}`).toBe(v.now.requests - v.now.absorbed + v.now.extra);
    }
    const d = mitigateView(initialMitigate());
    expect(totalOf(d.now)).toBe(23_414);
    expect(conservationText(d.now)).toBe('20,000 requests - 0 cached + 3,414 extra');
  });

  it('a load that rounds to 100% without being 100% shows a decimal, so red never sits beside a bare 100%', () => {
    expect(pct(1.002)).toBe('100.2%');
    expect(pct(0.996)).toBe('99.6%');
    expect(pct(1)).toBe('100%');
    expect(pct(1.18)).toBe('118%');
  });
});

describe('the melt stats colour against the utilisation slider, not a fixed number', () => {
  it('"first shard saturates at" is below the utilisation exactly when a shard is past its capacity (skew x utilisation grid)', () => {
    for (const skew of [0, 0.5, 1, 1.5]) {
      const sim = fillSim(STREAM_SEED, skew);
      sim.run(FILL_TICKS);
      const final = sim.at(FILL_TICKS)!;
      const exact = saturationAt(final.loads.map((x) => x / final.requests));
      for (let util = UTILISATION.min; util <= UTILISATION.max + 1e-9; util += UTILISATION.step) {
        const past = Math.max(...loadFractions(final.loads, util, final.requests)) > 1;
        expect(exact < util, `s=${skew} util=${util.toFixed(2)}`).toBe(past);
      }
    }
  });

  it('the culprit card uses one predicate: no key stands out at s = 0.1, user:1 does at s = 1', () => {
    expect(keyStandsOut(0)).toBe(false);
    expect(keyStandsOut(0.1)).toBe(false);
    expect(keyStandsOut(1)).toBe(true);
    expect(hottestShare(0.1)).toBeLessThanOrEqual(2 / KEYS);
  });
});

describe('salt sub-keys on consecutive shards are the best case, and the random-placement figure is computed', () => {
  it('the per-copy counts reproduce shardLoads when the copies go back on consecutive shards (salting and replicas)', () => {
    for (const kind of ['salt', 'replicate'] as const) {
      const s = { ...initialMitigate(), kind };
      const stream = makeStream({ seed: s.seed, skew: SKEW.default, readShare: s.readShare });
      const mit = mitigationOf(s);
      const counted = copyCounts(stream, mit)!;
      const loads = counted.base.slice();
      for (const [key, c] of counted.copies) c.forEach((n, j) => (loads[(shardOf(key) + j) % SHARDS] += n));
      expect(loads, kind).toEqual(shardLoads(stream, mit, SKEW.default).loads);
    }
  });

  it('at the default (4 sub-keys, 20% reads) a random placement is worse than no mitigation in most of 500 draws, as an independent simulation found (69%, median 123%)', () => {
    const v = mitigateView(initialMitigate());
    expect(v.placement!.draws).toBe(500);
    expect(v.placement!.worseShare).toBeGreaterThan(0.6);
    expect(v.placement!.worseShare).toBeLessThan(0.8);
    expect(v.placement!.median).toBeGreaterThan(1.2);
    expect(v.placement!.median).toBeLessThan(1.27);
    expect(v.placement!.median).toBeGreaterThan(v.nowSummary.hottestLoad);
  });

  it('the figure exists only for salting and replication, and repeats exactly (seeded)', () => {
    for (const kind of ['none', 'split', 'cache'] as const) expect(mitigateView({ ...initialMitigate(), kind }).placement).toBeNull();
    expect(mitigateView(initialMitigate()).placement).toEqual(mitigateView(initialMitigate()).placement);
  });

  it('with no mitigation the loads are the plain loads of the stream', () => {
    const stream = makeStream({ seed: 1, skew: 1, readShare: READ_SHARE.default });
    expect(shardLoads(stream, { kind: 'none', m: 4, hit: 0, hot: hottestKeys(4) }, 1).loads).toEqual(plainLoads(stream));
  });
});
