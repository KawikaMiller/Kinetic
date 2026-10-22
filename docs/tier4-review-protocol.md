# Tier 4 domain-review protocol (T4-T7)

Written 2026-10-22. Source: `docs/tier4-technical.md` §2, §3 (AC-0/T4 #27 to #39), §6.2 and §7.1; `docs/tier4-kickoff-decisions.md` (wins on conflict). 38 of the 50 Tier 4 lessons are flagged for domain review (29 new D rows of `docs/tier4-plan.md` §2 plus the nine retrofits); the flag set is `DOMAIN_REVIEW_IDS_T4` in `src/core/lessonContentT4.ts`. The mechanical rules (chips, claim labels, clock and random ban, fresh arrays, pinned seed 0, visible seed, `manipulation N:` tests, absolutes) are enforced by that lint and are **not** re-checked by hand; this protocol covers what a regex cannot.

## When and who

- **Before merge, per batch.** The reviewer reads every flagged lesson of the batch (not a sample) after the builder's gates are green: build, `npx oxlint src scripts`, the lesson's tests, `check-tokens --strict`, `npm run sweep -- <ids>` (and `--mobile`). A flagged lesson that has not been reviewed does not merge.
- **One reviewer** for a flagged lesson by default (Sentry, the QA role). **Two reviewers with a split** for the crypto lessons (`elliptic-curves`, `post-quantum-crypto`, `e2ee-forward-secrecy`, `secret-sharing`, `zero-knowledge-proofs`) and for the theory lessons whose headline is a theorem or an impossibility (`flp-impossibility`, `byzantine-faults`, `np-reductions`, `approximation-algorithms`, `paxos`):
  - **Reviewer 1 recomputes.** Re-derive every vector, count and constant independently (a second implementation, `node:crypto`, brute force, a hand calculation) and confirm the test's oracle is not the lesson's own output.
  - **Reviewer 2 reads for overclaiming and payload-freeness.** Reads the screen text, captions, quiz and key ideas only (no code): anything that says more than the model shows, any "secure", "impossible", "always", any step-by-step attack on a real system.
  - The two do not share notes until both have written their findings.
- `hiring-interviewing` (D) has one reviewer; the six other lead lessons are not D but are reviewed against the lead checklist below by the batch's second reader (AC-0/T2 rule 12).
- **Recording.** Findings go in the batch's section of the Tier 4 QA report, as in `docs/qa-tier3-report.md`: severity (blocker, major, minor), file and line, the rule cited as "AC-0/T4 #n" or "AC-0/T3 #n", and the fix or "parked". Blockers and majors are fixed before merge; one-line wording, colour, legend and absolute fixes are fixed too; the rest are parked with file:line. A reviewer states what they did **not** check.
- **Reviewer's first move for any proof-shaped lesson (rule 30):** press only Next and Play through every scene without touching a control. If the caption sequence is identical whatever the controls do, the lesson goes back to the builder.

## Checklist A: every flagged lesson

1. At least one `Provenance` chip, at the moment it matters, naming what is simulated, toy, illustrative, scripted, from memory or not run (AC-0/T3 #21). A chip that sits in a footer while the number it excuses is three screens away is a finding.
2. Every number, verdict and caption on screen comes from the model on screen (AC-0/T2 #1, #3). Sample three captions against their stats at a non-default setting.
3. The independent oracle exists and is independent: brute force, closed form, `node:crypto`, a published table, a hand-worked spec vector. A test that recomputes the model's own output is a finding.
4. Every control is tested at its minimum, maximum and one step beyond (rule 37); the reviewer tries the extremes in a browser once, with the sweep's summary line in hand.
5. Real-world facts written from memory (names, years, sizes, defaults) wear `from-memory` and are checked against a source the reviewer can reach; what cannot be checked stays hedged on screen.
6. The lesson stays inside its fences (the spec's "Starts where the neighbours stop"): it does not re-teach, and does not contradict, a lesson it builds on.

## Checklist B: theorem labels and bounds (rules 27, 28, 29)

1. List every theorem-shaped sentence on screen (key ideas, quiz `why`, summary, captions). Each is exactly one of: (a) checked exhaustively over a bound that is on screen with its count ("all 4,812 reachable states of this model"), (b) a seeded Monte Carlo with a stated tolerance, or (c) a `ClaimLabel kind="theorem"` naming the result.
2. A truncated or bounded search never says "impossible", "always" or "no execution can". It says "in the N states explored". A halting-style tool says "did not decide within N steps".
3. A "holds in all states" sentence exists only if the exhaustive run finished (`truncated` false, state count shown). Otherwise it reads "sampled over N seeds". Liveness is a separate sentence with its own fraction ("no decision on k of 200 seeds").
4. Broken mode: it names its counterexample (lowest failing seed, shortest path, or witness schedule); a test asserts the violation message or rule index equals the one named; the fixed mode passes the same seeds; the broken mode fails on at most 90% of seeds, and "fails on k of 200 seeds" is printed. A broken mode over 90% is acceptable only for a deterministic algorithm lesson that declares and shows a shortest witness (decisions §3: approximation-algorithms, suffix-arrays, linear-programming, online-algorithms). A pinned seed of 0 with everything failing is rejected (the lint also catches the constant).
5. Check one bound by hand: pick one number in the exhaustive claim and recount it.

## Checklist C: litmus tables and published outcome tables (rule 31, memory-ordering-atomics, lock-free-cas)

1. A persistent `Provenance kind="simulated"` chip reads "a model of X, not X". No sentence says "this is what happens on your machine".
2. The model's rules are listed in the stage (store buffers drain in order, loads forward from the thread's own buffer, and so on) and what it does not model is named (load buffering, IRIW, 2+2W, out-of-thin-air, `consume`).
3. Every cell of the expected-outcome table (store buffering, message passing, and any other litmus test shown) is checked against a named published source (the x86-TSO paper's tables, the architecture litmus catalogues) by the reviewer, who records the source and the cell. A disagreement is a bug in the table or the model, never "close enough".
4. The SC and TSO outcome sets equal the second-formulation oracle on the in-fragment fixtures; the wrong-TSO (drain on every store) and no-fence counterfactuals fail their tests.
5. `relaxed` mode, where it exists, shows release/acquire forbidding the stale-data outcome that relaxed allows, and nothing broader.

## Checklist D: toy-parameter honesty (rule 32, crypto)

1. Every parameter shows its bit size; a persistent `Provenance kind="toy"` chip sits on any key, modulus, curve or group under 128 bits; real crypto (`crypto.subtle` via `core/crypto`) wears `real`.
2. No sentence calls a toy "secure", "unbreakable" or "safe to use". The cost of breaking the toy and of breaking the real size is computed and shown side by side.
3. BigInt code is labelled "not constant-time, never copy this"; randomness is seeded and says "a real system uses a CSPRNG".
4. Constants of a standard (curve parameters, ML-KEM sizes, group orders) have an internal-consistency test (generator on the curve, n times G is infinity, the modulus is prime) **and** the reviewer checks them against the named standard. Test vectors come from a named standard or `node:crypto`, never from the lesson's own output.
5. **Payload-free (AC-0/T2 #9):** nothing recovers a key from a real system, shows a step-by-step attack on real software, or demonstrates nonce reuse against real messages. Breaking a toy-size parameter (a 5-bit curve, a 4-bit modulus) is the pedagogy and is fine; a key-recovery routine written for general sizes is not. No key or secret literal in source (`fakeSecret`).
6. Reviewer 1 recomputes one vector per scene independently (not through the lesson's own helper); reviewer 2 reads the prose for overclaiming ("the server can never read it" needs its scope).
7. `post-quantum-crypto`: ML-KEM is not implemented, its sizes and the standardisation fact are `from-memory` chips, the timeline is Mosca's inequality computed from sliders with no date predicted, and the combiner scene says "the combiner is real, the KEM is a toy".

## Checklist E: lead and people lessons (rule 35)

1. Every practice or research claim wears a `ClaimLabel` (kind `view` for anything contested, never `standard`); no claim wears a heavier label than its evidence.
2. Every modelled figure is `Provenance invented` or `illustrative`, comes from a pure function, and its test recomputes the figure **and its crossover points**. The page shows the assumption that flips the answer, not a verdict.
3. `validateScenario(s, { tradeoffs: true })` is `[]` in the lesson's test (no straw-man choice, no free path). That is necessary, not sufficient: the reviewer plays the scenario three times, picking a different "obvious" option each time, and asks whether any one path read as the right answer.
4. Every `because` states a condition ("if the team is small and the system is a commodity, buying wins"), never a bare imperative. The unrecommended ending is reachable and reads as defensible with a real cost. No ending says "success" or "correct".
5. At least one quiz question is "it depends on X" with X named; none of the distractors is "always" or "never" as its only flaw.
6. No real person, company, product or incident unless certain, and then chipped.
7. **People models** (`influence-without-authority`, `hiring-interviewing`): the page says in words that the toy shows the arithmetic of ordering or of variance, not evidence about people (a rubric modelled as a smaller noise term proves nothing about rubrics). No claim about any demographic group.

## Checklist F: distributed-systems theory (rules 20, 28, 29; AC-0/T3 #20)

1. The safety property is an invariant asserted after every event over at least 200 seeded fault schedules, **and** an exhaustive `explore` run where the state space fits the budget, with state count and `truncated` on screen.
2. The protocol that runs on screen is the one the tests check (one implementation under both harnesses where K4-2's `asDistNodes` applies); a recorded script is labelled "scripted".
3. For impossibility topics (`flp-impossibility`) the screen says what the toy shows (an admissible prefix plus an argued repetition) and labels the theorem "argued, not run here".

## Checklist G: ML serving (rule 34)

1. Toy models, seeded data; constants named and labelled `illustrative`; no real model name, size, price, GPU or context length unhedged.
2. A meter that stands for quality says what it measures ("output error of one toy layer on seeded inputs", never "accuracy").
3. An equality the lesson asserts (cached decoding equals recomputation) has a test to a stated tolerance.

## What the reviewer does not do

Re-run the whole app smoke (the coordinator does that every two waves), re-derive what the spec already hand-worked and the builder pinned, or review code style beyond what the checklists name. If a checklist item cannot be checked in this environment, the report says "not checked" with the reason, and the lesson keeps the matching hedge or chip on screen.
