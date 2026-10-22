# Tier 4 kickoff: decisions that amend the plan, the technical doc and the specs

Date: 2026-10-22. Authority: coordinator, under the owner's standing decisions (exhaustive and holistic, tier by tier, push only when a tier is finished, security lessons defensive and payload-free, reuse-first clean code). This file wins over `tier4-plan.md`, `tier4-technical.md` and `tier4-specs/part1-3.md` wherever they disagree. Read it before the kickoff kit round and before every batch.

## 1. Settled with the owner's defaults

- The nine existing Tier 4 lessons (raft, distributed-transactions, backpressure, slos-error-budgets, multi-region, crdts, lsm-trees, probabilistic-structures, zero-trust) stay Tier 4. Sign-off count is 50 (41 new + 9 existing). Nothing in the signed-off Tier 3 is re-tiered.
- Tier 4 is the end of the curriculum: no Tier 5. New topics after sign-off need a gap pass the owner commissions.

## 2. Wave order (the plan's §6 and the technical doc's §4.1 agree on this; the specs were written to it)

| Wave | Batches | Kit that must be merged first |
|---|---|---|
| 1 | T4-R1 (raft, distributed-transactions, crdts, multi-region, backpressure), T4-B3 (hardness), T4-B5 (strings, trees, games), T4-B8 (leading change) | Kickoff kit round (P0): tooling T4-T1..T4-T8, K4-4, K4-5, K4-8, K4-9, K4-10, `core/vertexCover` (new, see §4) |
| 2 | T4-B1 (failure and membership), T4-B4 (consensus and global time), T4-R2 (lsm-trees, probabilistic-structures, slos-error-budgets, zero-trust), T4-B9 (people and judgement) | K4-1, K4-2 (built during wave 1) |
| 3 | T4-B2 (concurrency), T4-B6 (advanced crypto), T4-B7 (ML serving and cost) | K4-3, K4-6, K4-7, K4-11, K4-12 if kept (built during wave 2) |

The part-2 specs for B1 were written as if wave 1. B1 now runs in wave 2, so its builder MAY use K4-1 (the optional one-way-partition scene in failure-detectors) and K4-2 (deterministic-simulation-testing's exploration).

## 3. Rule amendments (AC-0/T4)

- **Rule 29 witness clause.** A broken mode that fails on more than 90% of seeds is acceptable ONLY for a deterministic algorithm lesson with no meaningful seed, and only if the lesson names a shortest witness (the smallest input, trace or schedule on which it fails) and shows it. Four specs rely on it: approximation-algorithms (one-endpoint cover, 94.5%), suffix-arrays (inverted prefix rule, 99.0%), linear-programming (forgot x,y >= 0, 93%), online-algorithms (late threshold, 95%). For simulation lessons rule 29 stands as written (at most 90% of seeds, a named lowest failing seed that is not trivially 0). Lessons without any simulation (feature-stores-skew, numa-multicore, finops-cloud-cost) use a pinned counterexample object. The Tier 4 lint's `pinned-seed-zero` rule must encode this: exempt lessons that declare a witness, and fail a seeded lesson whose lowest failing seed is 0 and whose fail share exceeds 90%.
- Rule 27 is unchanged: a bounded check never says "impossible" or "always"; theorem lessons use `ClaimLabel kind="theorem"` (K4-8).
- Lead lessons: invented numbers are labelled invented, every practice or research claim is a `ClaimLabel` framed as one view, no dominated option, no free path (K4-9).

## 4. Kit changes found by the specs (the kickoff kit agents must apply these)

- **New: `core/vertexCover.ts`** (P0, blocks T4-B3): exact `minVertexCover` and `maximalMatching`; np-reductions and approximation-algorithms (same batch) both need them; tests against brute force on small graphs.
- **K4-5 (`core/tsp`):** pin the Christofides Euler-circuit tie-break (smallest vertex index first) so the lesson's hand-worked tours reproduce.
- **K4-8:** besides the theorem lessons it is used by linear-programming, online-algorithms and game-theory.
- **K4-9 (`validateScenario({ tradeoffs: true })`):** reconcile the definition of `dominated-choice` with BOTH spec readings (the technical doc's, and part 2's narrower "same or an equally good destination"). Fixtures: the three B8 scenarios (strangler-fig-migrations, build-vs-buy, technical-strategy) and the B9 scenarios (reversible-decisions, influence-without-authority, hiring-interviewing) from the specs must pass, and each planted-bad scenario must fail with the right problem kind. Every spec scenario must be re-validated against the shipped K4-9 by its builder.
- **K4-2 (`core/explore`):** (a) explore actions carry the acting thread's or node's label (needed by memory-ordering-atomics, lock-free-cas, formal-methods); (b) `networkExplorer` gets an optional FIFO per-channel mode (distributed-snapshots otherwise writes its own queues); (c) an optional way to return the state graph or visit callback so FLP valency can use it (otherwise the lesson keeps a local memoised search, which is acceptable); (d) the Paxos spike runs first with the non-consuming "set" network: the part-2 prototype counted 7,224 states at 2 ballots (fits) and 614,208 at 3 ballots (does not); the gate stays 250k states and 5 s, and the scope-cut order stays as in the technical doc.
- **K4-3 (`core/memModel`):** `relaxed` mode is KEPT, scoped to what message passing needs (the spec shows release/acquire visibly forbidding the stale-data outcome that relaxed allows, which TSO cannot show). Load buffering, IRIW and 2+2W are not modelled and named on screen. The `cas` instruction and the free-list ABA heap are DROPPED from K4-3: lock-free-cas is lesson-local over `core/explore` (the litmus language has no loops or conditional retry).
- **K4-6 (`core/field`):** add interpolate-at-zero (Lagrange) so secret-sharing does not write local Gaussian elimination.
- **K4-12 (`core/modelFootprint`):** keep only if, after the specs, two lessons still share more than one-line formulas; the specs say fine-tuning-quantization shares only `parameters x bits / 8` with llm-serving. Default: DROP K4-12 and let both lessons carry the one-line formula with a test each, noting it as accepted duplication; reopen only if a builder finds more. The LLM-serving simulator stays local to llm-serving (the plan's kit row for it is withdrawn). It uses `createTickSim` with one tick per scheduler iteration; document that in `docs/shared-api.md`.
- **Existing-lesson fixes** (kit round, one line each): `diffie-hellman` use-cases claim `tls-handshake` shows a post-quantum key share (it does not; post-quantum-crypto owns that); forward secrecy is only one caption in `tls-handshake` and one use-case bullet in `diffie-hellman` (e2ee-forward-secrecy owns the demonstration).
- **finops-cloud-cost:** do not copy `object-storage`'s price constants by value; use ratios only (lessons cannot import each other).

## 5. Build-order notes for builders

- **T4-B4: build `flp-impossibility` FIRST** as the pilot; it is the riskiest lesson. Per the part-2 spec, a bivalent walk for a safe protocol cannot be shown with a finite explorer (every initial configuration is univalent in the toy), so the lesson shows: every one-round decision rule fails exhaustively (0 of 16, 0 of 4,096), a 12-delivery cycle where the safe protocol never decides, and a fair coin that breaks the same schedule with undecided probability exactly 2^-(r-1). This departs from the technical doc's §2.3, whose fallback is scene 1. The Paxos liveness duel is a scripted witness (36 steps, 6 ballots, verified by replay), not a found livelock.
- **T4-B3:** np-reductions is exhaustive over all 793 two-variable formulas with at most 4 clauses plus 200 seeded three-variable formulas and says "sampled" beyond; do not claim exhaustive up to 5 variables.
- **reversible-decisions** uses a "cost to undo x chance of being wrong" grid instead of Appendix A's "reversibility x impact": accepted.
- The plan lists `distributed-sql-truetime` as also building on `multi-region` (added by Atlas): kept; `multi-region` is registered, and R1 merges before wave 2.

## 6. What is NOT verified at kickoff

- No spec has been built or run against the real kit. Numbers marked [proto] or [hand] in the specs come from throwaway scripts and must be re-derived by the builder; seeded "lowest failing seed" values must be re-pinned with the stated inequality kept.
- The Paxos state count under `networkExplorer` is unmeasured until the K4-2 spike.
- The retrofit audit of the nine existing lessons was static (no tests or servers were run); the first gate of each retrofit batch includes `npm run sweep`.
- Every real-world fact in the specs (papers, authors, years, products, constants, ML-KEM sizes) is from memory and must be chipped on screen; none was checked against a source.
- Specs run 9 to 18 KB each against a 5 to 8 KB target; builders may skim the quiz seeds first.
