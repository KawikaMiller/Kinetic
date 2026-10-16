/** The numbers the try-this entries and the quiz quote, computed from each scene's opening state by the models the scenes draw. */
import { pct } from '../../core/format';
import { hex, spaceFor, walk, walkOpening } from './paging';
import { hitRate, runSwitching, runTlb, shootdown, shootdownOpening, switchOpening, tlbOpening } from './tlb';

export function walkFacts() {
  const { address, choice } = walkOpening();
  const space = spaceFor(address, choice);
  const base = walk(space, address);
  const huge = walk(spaceFor(address, { size: 'p2m', unmapped: false }), address);
  const gone = walk(spaceFor(address, { size: null, unmapped: true }), address);
  if (!base.ok || !huge.ok || gone.ok || gone.reason !== 'not-present') throw new Error('the opening address no longer walks as the try-this says');
  return {
    address: hex(address),
    refs: base.memoryRefs,
    tables: space.tables.length,
    physical: hex(base.physical),
    hugeRefs: huge.memoryRefs,
    hugeOffsetBits: huge.offsetBits,
    faultLevel: gone.steps[gone.steps.length - 1].name,
    faultRefs: gone.memoryRefs,
  };
}

export function tlbFacts() {
  const open = tlbOpening();
  const base = runTlb(open);
  const eight = runTlb({ ...open, workingSet: 8 });
  const huge = runTlb({ ...open, workingSet: 8, size: 'p2m' });
  return {
    entries: open.entries,
    workingSet: open.workingSet,
    accesses: base.steps.length,
    openingHits: base.hits,
    openingMisses: base.misses,
    eightMisses: eight.misses,
    eightRate: pct(hitRate(eight), 1),
    hugeMisses: huge.misses,
    hugeRate: pct(hitRate(huge), 1),
  };
}

export function switchFacts() {
  const sw = switchOpening();
  const sd = shootdownOpening();
  return {
    flushMisses: runSwitching(sw, 'flush').misses,
    asidMisses: runSwitching(sw, 'asid').misses,
    cores: sd.cores,
    unmaps: sd.unmaps,
    ipis: shootdown(sd).ipis,
    batchedIpis: shootdown({ ...sd, batched: true }).ipis,
  };
}
