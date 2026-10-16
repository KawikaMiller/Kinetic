import { describe, expect, it } from 'vitest';
import { KERNEL_WORD, NEW_WORD, OLD_WORD, dmaScenario } from './coherence';

const bools = [false, true];
const ALL = bools.flatMap((coherent) => bools.flatMap((driverInvalidates) => bools.map((iommu) => ({ coherent, driverInvalidates, iommu }))));

describe('DMA and the cache, all 8 combinations of the three switches', () => {
  it('the CPU reads a stale word exactly when the platform is not coherent and the driver does not invalidate', () => {
    for (const c of ALL) {
      const r = dmaScenario(c);
      const mustBeStale = !c.coherent && !c.driverInvalidates;
      expect(r.stale, JSON.stringify(c)).toBe(mustBeStale);
      expect(r.cpuSaw).toBe(mustBeStale ? OLD_WORD : NEW_WORD);
      expect(r.servedFromCache).toBe(mustBeStale);
      expect(r.ramHolds).toBe(NEW_WORD);
    }
  });

  it('the driver-invalidates switch is hidden state when the platform is coherent: nothing changes with it', () => {
    for (const iommu of bools) expect(dmaScenario({ coherent: true, driverInvalidates: true, iommu })).toEqual(dmaScenario({ coherent: true, driverInvalidates: false, iommu }));
  });

  it('a wrong DMA address overwrites an unrelated buffer unless the IOMMU is on, and the IOMMU does not change the cache result', () => {
    for (const c of ALL) {
      const r = dmaScenario(c);
      expect(r.overwritten, JSON.stringify(c)).toBe(!c.iommu);
      expect(r.blocked).toBe(c.iommu);
      expect(r.kernelBufferAfter).toBe(c.iommu ? KERNEL_WORD : NEW_WORD);
      expect(r.cpuSaw).toBe(dmaScenario({ ...c, iommu: !c.iommu }).cpuSaw);
    }
  });

  it('one narration line per step, and the stale case names it', () => {
    const r = dmaScenario({ coherent: false, driverInvalidates: false, iommu: false });
    expect(r.steps).toHaveLength(5);
    expect(r.steps.map((s) => s.text).join(' ')).toContain('still holds the old word');
    expect(r.steps.filter((s) => s.bad)).toHaveLength(3);
  });

  it('a step is marked bad exactly when something went wrong in it: none when coherent with the IOMMU on', () => {
    expect(dmaScenario({ coherent: true, driverInvalidates: false, iommu: true }).steps.some((s) => s.bad)).toBe(false);
    expect(dmaScenario({ coherent: false, driverInvalidates: true, iommu: false }).steps.filter((s) => s.bad)).toHaveLength(1);
  });
});
