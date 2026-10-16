/** Captions and stat text, every number taken from the model on screen. Plain strings, so tests can read them. */
import { bytes, pct } from '../../core/format';
import { POLICY_LABELS, metrics, type Arena, type Policy } from './arena';
import { SPACING_LABELS, WORKED_REQUEST, WORST_FROM, classOf, classTable, type PageSetup, type PageSummary, type Spacing } from './classes';
import type { LastEvent } from './session';

export const n = (v: number) => v.toLocaleString('en-US');
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;
const iec = (b: number) => bytes(b, { iec: true });

export const ARENA_INTRO = 'A 64-unit arena (16 bytes a unit). Press an allocation size to place a block with the chosen policy, or click a block to free it.';

const WHY: Record<Policy, (rover: number) => string> = {
  first: () => 'the lowest-address hole that fits',
  best: () => 'the smallest hole that fits',
  worst: () => 'the largest hole that fits',
  next: (rover) => `the first hole that fits when the search resumes at unit ${n(rover)}, where the last allocation ended (a hole that starts before it is skipped, and the search wraps to the lowest fitting hole if none starts after it)`,
};

export function arenaCaption(last: LastEvent, arena: Arena): string {
  const m = metrics(arena);
  if (!last) return ARENA_INTRO;
  if (last.kind === 'alloc') {
    const r = last.result;
    if (r.outcome === 'placed') {
      const left = r.hole!.size - r.size;
      return `alloc(${n(r.size)}) with ${POLICY_LABELS[last.policy].toLowerCase()} took ${WHY[last.policy](last.rover)}: ${n(r.hole!.size)} units at unit ${n(r.hole!.start)}, leaving ${n(left)} ${left === 1 ? 'unit' : 'units'} free in it.`;
    }
    if (r.outcome === 'fragmented') {
      return `alloc(${n(r.size)}) failed: ${n(m.freeTotal)} units are free in ${plural(m.holes, 'hole')}, but the largest is ${n(m.largestFree)}. Enough bytes, no hole big enough: fragmented, not out of memory.`;
    }
    return `alloc(${n(r.size)}) failed: only ${n(m.freeTotal)} units are free. That is out of memory, not fragmentation.`;
  }
  if (last.kind === 'free') {
    const merged = last.coalesce && last.holesAfter < last.holesBefore + 1;
    return `Freed block ${n(last.id)} (${plural(last.size, 'unit')}): ${merged ? 'it merged with a free neighbour' : last.coalesce ? 'both neighbours are live, so it is its own hole' : 'coalescing is off, so it stays its own hole'}. ${plural(m.holes, 'hole')} now, the largest ${n(m.largestFree)} of ${n(m.freeTotal)} free.`;
  }
  return `Ran the 200-operation script under ${POLICY_LABELS[last.policy].toLowerCase()}, coalescing ${last.coalesce ? 'on' : 'off'}: ${plural(last.failedFragmented, 'allocation')} failed as fragmented and ${n(last.failedFull)} as out of memory. ${plural(m.holes, 'hole')} remain.`;
}

export function classesCaption(spacing: Spacing, classes: number, waste: number, worst: number): string {
  const cls = classOf(classTable(spacing), WORKED_REQUEST);
  const example = `A request of ${n(WORKED_REQUEST)} bytes is rounded up to the ${n(cls)}-byte class, wasting ${n(cls - WORKED_REQUEST)}. `;
  return `${example}With ${SPACING_LABELS[spacing].toLowerCase()} spacing there are ${n(classes)} size classes. Over the seeded requests, ${pct(waste, 1)} of the bytes handed out are internal waste, and a single request of ${n(WORST_FROM)} bytes or more can waste as much as ${pct(worst, 1)}. Same-size slots are interchangeable, so a freed slot is reusable by the next request of its class: external fragmentation shrinks and internal waste appears instead.`;
}

export function pagesCaption(s: PageSetup, sum: PageSummary): string {
  const share = sum.freedObjects === 0 ? 0 : sum.returnedBytes / sum.freedBytes;
  return `${pct(s.freed)} of the objects are freed (${n(sum.freedObjects)} of ${n(sum.kinds.length * s.objectsPerPage)}), ${s.pattern === 'random' ? 'at random' : s.pattern === 'oldest' ? 'oldest first' : 'in one run from the end'}. ${plural(sum.returnable, 'page')} ${sum.returnable === 1 ? 'is' : 'are'} completely empty, so ${iec(sum.returnedBytes)} can go back to the operating system of the ${iec(sum.freedBytes)} freed (${pct(share)}); ${iec(sum.stuckBytes)} sit free inside ${plural(sum.partial, 'partly used page')}.`;
}
