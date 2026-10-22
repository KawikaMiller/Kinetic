/**
 * The lowest seeds on which the two broken modes violate their invariant over the 200 seeded fault schedules
 * (`check.ts`), and how many of the 200 they fail on. A test recomputes all of it with the checker and fails if a number
 * drifts or a broken mode stops violating. The seeds are the default seed when the learner picks the broken mode.
 *
 * Honest reading: both modes fail on most seeds, so the lowest failing seed is 0 or 1 because nearly every seed fails, not
 * because that seed is special. What is pinned is the cause, which the tests isolate: arrival order fails even on a quiet
 * network (no ids, so a copy applies twice and concurrent edits apply in a different order on each replica), and last write
 * wins still loses edits once the counter is taken out of the schedule.
 */
/** "Apply operations in arrival order" breaks convergence: the replicas differ once everything is delivered. */
export const BROKEN_SEED_ARRIVAL = 0;
/** Last write wins breaks "no acknowledged edit disappears silently": an update is lost with nothing listed. */
export const BROKEN_SEED_LWW = 0;

/** How many of the 200 seeded schedules each broken mode fails on, and the counterfactuals that isolate the cause. */
export const BROKEN_FACTS = {
  arrival: { fails: 195, failsOnQuietNetwork: 197 },
  lww: { fails: 166, failsWithoutCounter: 135, lowestWithoutCounter: 1 },
} as const;
