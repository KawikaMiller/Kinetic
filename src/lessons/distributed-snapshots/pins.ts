/**
 * The pinned counterexamples of the broken mode (markers on non-FIFO channels at the busy rate): the lowest failing seeds
 * from 1, one per rule, asserted in distributed-snapshots.test.ts against `sweepSeeds` and `forSeeds`.
 */
export const BROKEN_SEED = 1;
/** The lowest seed whose cut fails the closure check (rule 1); BROKEN_SEED fails conservation (rule 0). */
export const BROKEN_SEED_CLOSURE = 11;
