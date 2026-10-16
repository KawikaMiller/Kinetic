import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_MAPPINGS, FLAT_TABLE_BYTES, LEVELS, PAGE_BYTES, WALK_REFERENCES, buildSpace, canonicalise, chosenMappings, indexAt, isCanonical, mappingCovering, offsetOf,
  spaceFor, walk, type Level, type Mapping, type PageSize,
} from './paging';
import {
  CORES, IPI_CYCLES, SWITCH, UNMAPS, WORKING_SET, addresses, hitRate, hitRateCurve, reachBytes, runSwitching, runTlb, shootdown, tlbOpening, translationCost,
  type TlbConfig,
} from './tlb';

const rndBig = (rnd: () => number, bits: number) => {
  let v = 0n;
  for (let done = 0; done < bits; done += 24) v = (v << 24n) | BigInt(Math.floor(rnd() * 2 ** 24));
  return v & ((1n << BigInt(bits)) - 1n);
};
const randomCanonical = (rnd: () => number) => canonicalise(rndBig(rnd, 48));

describe('index extraction', () => {
  it('equals the shifts and masks on 10,000 seeded canonical addresses', () => {
    const rnd = mulberry32(1);
    for (let k = 0; k < 10_000; k++) {
      const va = randomCanonical(rnd);
      expect(indexAt(va, 39n)).toBe(Number((va >> 39n) & 0x1ffn));
      expect(indexAt(va, 30n)).toBe(Number((va >> 30n) & 0x1ffn));
      expect(indexAt(va, 21n)).toBe(Number((va >> 21n) & 0x1ffn));
      expect(indexAt(va, 12n)).toBe(Number((va >> 12n) & 0x1ffn));
      expect(offsetOf(va, 'p4k')).toBe(va & 0xfffn);
      expect(offsetOf(va, 'p2m')).toBe(va & 0x1fffffn);
      expect(offsetOf(va, 'p1g')).toBe(va & 0x3fffffffn);
    }
    expect(LEVELS.map((l) => l.top - Number(l.shift) + 1)).toEqual([9, 9, 9, 9]);
  });
});

describe('the walk against a flat map', () => {
  const rnd = mulberry32(2);
  const space = buildSpace(DEFAULT_MAPPINGS);

  /** The flat oracle: a plain scan of the mapping list. */
  const flat = (va: bigint) => {
    const m = mappingCovering(DEFAULT_MAPPINGS, va);
    return m ? m.phys + (va - m.va) : null;
  };
  /** The level whose entry is absent, from prefixes alone. */
  const faultLevel = (va: bigint): Level => {
    const prefix = (x: bigint, shift: bigint) => x >> shift;
    if (!DEFAULT_MAPPINGS.some((m) => prefix(m.va, 39n) === prefix(va, 39n))) return 4;
    if (!DEFAULT_MAPPINGS.some((m) => prefix(m.va, 30n) === prefix(va, 30n))) return 3;
    // a 1 GiB page ends at level 3 and has no deeper table
    if (!DEFAULT_MAPPINGS.some((m) => m.size !== 'p1g' && prefix(m.va, 21n) === prefix(va, 21n) && prefix(m.va, 30n) === prefix(va, 30n))) return 2;
    return 1;
  };

  it('has about a dozen mappings including huge pages, and builds without overlap', () => {
    expect(DEFAULT_MAPPINGS).toHaveLength(12);
    expect(new Set(DEFAULT_MAPPINGS.map((m) => m.size))).toEqual(new Set(['p4k', 'p2m', 'p1g']));
    expect(DEFAULT_MAPPINGS.every((m) => isCanonical(m.va) && isCanonical(m.sample))).toBe(true);
    expect(space.tables.length).toBeGreaterThan(12);
  });

  it('matches the flat map on 10,000 seeded addresses, mapped and unmapped, huge pages included', () => {
    for (let k = 0; k < 10_000; k++) {
      const m = DEFAULT_MAPPINGS[k % DEFAULT_MAPPINGS.length];
      // half the addresses land inside a mapping (anywhere in its page), half are random canonical addresses
      const va = k % 2 === 0 ? m.va + rndBig(rnd, Number(Math.log2(Number(PAGE_BYTES[m.size])))) : randomCanonical(rnd);
      const expected = flat(va);
      const out = walk(space, va);
      if (expected === null) {
        expect(out.ok).toBe(false);
        if (!out.ok && out.reason === 'not-present') {
          expect(out.faultLevel).toBe(faultLevel(va));
          expect(out.steps[out.steps.length - 1].state).toBe('absent');
          expect(out.memoryRefs).toBe(5 - out.faultLevel);
        }
      } else {
        expect(out.ok).toBe(true);
        if (out.ok) expect(out.physical).toBe(expected);
      }
    }
  });

  it('every sample address translates, ends at the level of its page size, and makes as many references as levels read', () => {
    for (const m of DEFAULT_MAPPINGS) {
      const out = walk(space, m.sample);
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      expect(out.size).toBe(m.size);
      expect(out.memoryRefs).toBe(WALK_REFERENCES[m.size]);
      expect(out.steps).toHaveLength(WALK_REFERENCES[m.size]);
      expect(out.physical % PAGE_BYTES[m.size]).toBe(m.sample % PAGE_BYTES[m.size]);
      // each step's entry address is the table base plus index x 8
      for (const s of out.steps) expect(s.entryAddress).toBe(s.table + BigInt(s.index * 8));
    }
  });

  it('translation is a bijection on the mapped pages: the offset passes through and distinct pages get distinct frames', () => {
    const phys = DEFAULT_MAPPINGS.map((m) => m.phys);
    expect(new Set(phys).size).toBe(phys.length);
    for (const m of DEFAULT_MAPPINGS) {
      const bits = BigInt(Math.log2(Number(PAGE_BYTES[m.size])));
      const out = walk(space, m.va + 0x123n);
      expect(out.ok && out.physical - m.phys).toBe(0x123n);
      expect(bits).toBeGreaterThan(0n);
    }
  });

  it('a flat table would need 512 GiB, and the walk allocates a few tables of 4 KiB instead', () => {
    expect(FLAT_TABLE_BYTES).toBe(512n * 2n ** 30n);
    expect(BigInt(space.tables.length) * 4096n).toBeLessThan(FLAT_TABLE_BYTES / 1_000_000n);
  });
});

describe('canonical addresses', () => {
  const space = buildSpace(DEFAULT_MAPPINGS);
  it('sign-extension violations are refused before any table is read, and the sign-extended spellings are accepted', () => {
    const rnd = mulberry32(3);
    for (let k = 0; k < 500; k++) {
      const v48 = rndBig(rnd, 48) | (1n << 47n);
      const bad = v48; // bit 47 set but bits 63-48 zero
      expect(isCanonical(bad)).toBe(false);
      expect(walk(space, bad)).toEqual({ ok: false, reason: 'not-canonical', steps: [], memoryRefs: 0 });
      expect(isCanonical(canonicalise(v48))).toBe(true);
      expect(walk(space, canonicalise(v48))).not.toMatchObject({ reason: 'not-canonical' });
      const low = rndBig(rnd, 47);
      expect(isCanonical(low)).toBe(true);
      expect(isCanonical(low | (1n << 55n))).toBe(false);
    }
  });
});

describe('huge pages and unmapping', () => {
  const small = DEFAULT_MAPPINGS.find((m) => m.size === 'p4k')!;
  it('a 2 MiB mapping ends the walk at the PD in three references with a 21-bit offset, a 1 GiB one at the PDPT in two', () => {
    const two = spaceFor(small.sample, { size: 'p2m', unmapped: false });
    const out = walk(two, small.sample);
    expect(out.ok && out.size).toBe('p2m');
    expect(out.memoryRefs).toBe(3);
    expect(out.ok && out.offsetBits).toBe(21);
    const one = walk(spaceFor(small.sample, { size: 'p1g', unmapped: false }), small.sample);
    expect(one.ok && one.offsetBits).toBe(30);
    expect(one.memoryRefs).toBe(2);
    expect(walk(spaceFor(small.sample, { size: null, unmapped: false }), small.sample).memoryRefs).toBe(4);
  });

  it('unmapping the page leaves the tables and faults at the level of its entry', () => {
    const out = walk(spaceFor(small.sample, { size: null, unmapped: true }), small.sample);
    expect(out).toMatchObject({ ok: false, reason: 'not-present', faultLevel: 1, memoryRefs: 4 });
    const huge = DEFAULT_MAPPINGS.find((m) => m.size === 'p2m')!;
    expect(walk(spaceFor(huge.sample, { size: null, unmapped: true }), huge.sample)).toMatchObject({ reason: 'not-present', faultLevel: 2, memoryRefs: 3 });
  });

  it('a choice on an address nothing maps changes nothing', () => {
    const nowhere = 0x1234n;
    expect(chosenMappings(DEFAULT_MAPPINGS, nowhere, { size: 'p2m', unmapped: true })).toEqual([...DEFAULT_MAPPINGS]);
  });

  it('the offset passes through unchanged whatever the page size', () => {
    for (const size of ['p4k', 'p2m', 'p1g'] as PageSize[]) {
      const out = walk(spaceFor(small.sample, { size, unmapped: false }), small.sample);
      expect(out.ok && out.physical % PAGE_BYTES[size]).toBe(small.sample % PAGE_BYTES[size]);
    }
  });

  it('overlapping mappings are refused', () => {
    const a: Mapping = { va: 0n, size: 'p2m', phys: 0n, present: true };
    const b: Mapping = { va: 0x1000n, size: 'p4k', phys: 0x1000n, present: true };
    expect(() => buildSpace([a, b])).toThrow(RangeError);
    expect(() => buildSpace([b, { va: 0n, size: 'p2m', phys: 0n, present: true }])).toThrow(RangeError);
  });
});

describe('the TLB', () => {
  const cfg = (patch: Partial<TlbConfig>): TlbConfig => ({ ...tlbOpening(), ...patch });

  it('a cyclic scan over W pages with capacity C under LRU hits 0% after warm-up when W > C and 100% when W <= C (C = 4 to 64)', () => {
    for (const entries of [4, 8, 16, 32, 64]) {
      for (const workingSet of [1, entries - 1, entries, entries + 1, entries * 2].filter((w) => w >= 1 && w <= 128)) {
        const run = runTlb(cfg({ entries, workingSet, pattern: 'sequential' }), 1024);
        const afterWarmup = run.steps.slice(workingSet);
        if (workingSet > entries) expect(afterWarmup.filter((s) => s.hit)).toHaveLength(0);
        else expect(afterWarmup.every((s) => s.hit)).toBe(true);
      }
    }
  });

  it('the reach is entries x page size: 8 x 4 KiB = 32 KiB against 8 x 2 MiB = 16 MiB', () => {
    expect(reachBytes({ entries: 8, size: 'p4k' })).toBe(32 * 1024);
    expect(reachBytes({ entries: 8, size: 'p2m' })).toBe(16 * 1024 * 1024);
  });

  it('the huge-page toggle never lowers the hit rate on the same stream', () => {
    for (const pattern of ['sequential', 'stride', 'random'] as const) {
      for (const entries of [4, 8, 64]) {
        for (const workingSet of [1, 3, 10, 70, 128]) {
          for (const stride of [1, 3, 16]) {
            const a = hitRate(runTlb(cfg({ pattern, entries, workingSet, stride, size: 'p4k' })));
            const b = hitRate(runTlb(cfg({ pattern, entries, workingSet, stride, size: 'p2m' })));
            expect(b).toBeGreaterThanOrEqual(a);
          }
        }
      }
    }
  });

  it('the opening setting is a cyclic scan over 10 pages with 8 entries: every access misses', () => {
    const run = runTlb(tlbOpening());
    expect([run.hits, run.misses]).toEqual([0, 128]);
    expect(runTlb(cfg({ workingSet: 8 })).misses).toBe(8);
  });

  it('the average translation cost is recomputed from hits, misses and the walk length', () => {
    const run = runTlb(cfg({ workingSet: 8 }));
    expect(translationCost(run, 'p4k')).toBeCloseTo((run.hits * 1 + run.misses * 4 * 30) / 128, 12);
    expect(translationCost(run, 'p2m')).toBeCloseTo((run.hits * 1 + run.misses * 3 * 30) / 128, 12);
  });

  it('addresses follow the pattern: the stride skips pages and random is reproducible', () => {
    expect(addresses(cfg({ pattern: 'stride', workingSet: 8, stride: 4 }), 4)).toEqual([0, 4 * 4096, 0, 4 * 4096]);
    expect(addresses(cfg({ pattern: 'random', workingSet: 50 }))).toEqual(addresses(cfg({ pattern: 'random', workingSet: 50 })));
    expect(hitRateCurve(tlbOpening())).toHaveLength(WORKING_SET.max);
    const curve = hitRateCurve(tlbOpening());
    expect(curve[7][1]).toBeGreaterThan(0.9);
    expect(curve[8][1]).toBe(0);
  });
});

describe('context switches and shootdowns', () => {
  it('a flush on every switch has at least as many misses as address-space tags on every seeded alternation', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const workingSet = SWITCH.workingSet.min + (seed % (SWITCH.workingSet.max - SWITCH.workingSet.min + 1));
      const slice = SWITCH.slice.min + ((seed * 7) % (SWITCH.slice.max - SWITCH.slice.min + 1));
      const flush = runSwitching({ workingSet, slice }, 'flush', seed);
      const asid = runSwitching({ workingSet, slice }, 'asid', seed);
      expect(flush.misses, `seed ${seed}`).toBeGreaterThanOrEqual(asid.misses);
      expect(flush.hits + flush.misses).toBe(SWITCH.switches * slice);
    }
  });

  it('with tags the entries survive, so a small working set misses only on its first touch; flushing re-pays it every switch', () => {
    const asid = runSwitching({ workingSet: 4, slice: 64 }, 'asid');
    const flush = runSwitching({ workingSet: 4, slice: 64 }, 'flush');
    expect(asid.misses).toBeLessThanOrEqual(8);
    expect(flush.misses).toBeGreaterThan(asid.misses * 2);
  });

  it('shootdown IPIs equal cores running the process minus one, over a grid of core counts', () => {
    for (let cores = CORES.min; cores <= CORES.max; cores++) {
      const one = shootdown({ cores, unmaps: 1, batched: false });
      expect(one.ipis).toBe(cores - 1);
      for (let unmaps = UNMAPS.min; unmaps <= UNMAPS.max; unmaps++) {
        expect(shootdown({ cores, unmaps, batched: true }).ipis).toBe(cores - 1);
        expect(shootdown({ cores, unmaps, batched: false }).ipis).toBe(unmaps * (cores - 1));
        expect(shootdown({ cores, unmaps, batched: true }).cost).toBeLessThanOrEqual(shootdown({ cores, unmaps, batched: false }).cost);
      }
    }
    expect(shootdown({ cores: 16, unmaps: 1, batched: false }).cost).toBe(15 * IPI_CYCLES + 50);
  });
});
