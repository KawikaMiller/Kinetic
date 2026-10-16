/** The numbers the try-this entries and the quiz quote, computed from each scene's opening state by the models the scenes draw. */
import { pct } from '../../core/format';
import { POLICIES, metrics, runScript, type Policy } from './arena';
import { SPACINGS, classTable, internalWaste, pagesOpening, requestSizes, spacingOpening, summarisePages } from './classes';
import { allocate, freeBlock, playScript, sessionOpening, type ArenaSession } from './session';

const press = (s: ArenaSession, sizes: readonly number[]) => sizes.reduce(allocate, s);

/** Try-this 1: the script under the opening settings, then the policy table. */
export function scriptFacts() {
  const open = sessionOpening();
  const played = playScript(open);
  const m = metrics(played.arena);
  const failures = (p: Policy) => {
    const r = runScript(p, open.coalesce);
    return r.failedFragmented + r.failedFull;
  };
  return {
    policy: open.policy,
    holes: m.holes,
    fragmentation: pct(m.fragmentation, 1),
    failures: Object.fromEntries(POLICIES.map((p) => [p, failures(p)])) as Record<Policy, number>,
  };
}

/** Try-this 2 as written: press 12, 8, 12, 8, 12, 8, free the three blocks of 12, press 16. */
export function fragmentedFacts() {
  let s = press(sessionOpening(), [12, 8, 12, 8, 12, 8]);
  for (const id of [1, 3, 5]) s = freeBlock(s, id);
  const before = metrics(s.arena);
  const after = allocate(s, 16);
  return { free: before.freeTotal, largest: before.largestFree, holes: before.holes, outcome: after.last?.kind === 'alloc' ? after.last.result.outcome : null };
}

/** Try-this 3: press 8, 8, free both, with coalescing on (the opening) and then off. */
export function coalesceFacts() {
  const run = (coalesce: boolean) => {
    let s = press({ ...sessionOpening(), coalesce }, [8, 8]);
    s = freeBlock(freeBlock(s, 1), 2);
    return metrics(s.arena);
  };
  return { on: run(true).holes, off: run(false).holes, offLargest: run(false).largestFree };
}

export function classFacts() {
  const reqs = requestSizes();
  const spacing = spacingOpening();
  const stat = (s: (typeof SPACINGS)[number]) => ({ classes: classTable(s).length, waste: pct(internalWaste(classTable(s), reqs), 1) });
  return { opening: spacing, quarter: stat('quarter'), pow2: stat('pow2'), eighth: stat('eighth') };
}

export function pageFacts() {
  const open = pagesOpening();
  const random = summarisePages(open);
  const oldest = summarisePages({ ...open, pattern: 'oldest' });
  return { k: open.objectsPerPage, freed: pct(open.freed), randomReturnable: random.returnable, oldestReturnable: oldest.returnable, pages: random.kinds.length };
}
