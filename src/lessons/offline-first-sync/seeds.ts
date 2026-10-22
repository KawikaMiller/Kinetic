/**
 * The lowest seeds on which the two broken modes violate their invariant over the 200 seeded fault schedules
 * (`check.ts`). A test recomputes both with `forSeeds` and fails if these drift or if a broken mode stops violating.
 * They are the default seeds when the learner picks the broken mode, and are shown on screen with it.
 */
/** "Apply operations in arrival order" breaks convergence: the replicas differ once everything is delivered. */
export const BROKEN_SEED_ARRIVAL = 0;
/** Last write wins breaks "no acknowledged edit disappears silently": an update is lost with nothing listed. */
export const BROKEN_SEED_LWW = 0;
