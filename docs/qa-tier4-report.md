# Tier 4 QA sign-off

Date: 2026-10-22. Tree: main after the sign-off fixes merge (`4019bf03`). Scope: 50 Tier 4 lessons (41 new, 9 existing, 9 of them retrofitted) and the whole 450-lesson curriculum.

## Verdict

Signed off. No open blockers or majors. Parked minors are listed below.

## Evidence

| Check | Result |
|---|---|
| `npm run build`, `npm run lint`, `npm run check-tokens -- --strict` | exit 0 |
| `npm test` | exit 0, 1046 files, 17490 tests |
| Static audit (`qa-tier4-partA.md`) | PASS, 0 blockers, 0 majors, 6 minors (all fixed or recorded below) |
| Browser sample (`qa-tier4-partB.md`) | 51 lessons x 3 widths read; defects D1-D16 found, 12 fixed, 4 parked |
| `npm run sweep -- --all-tier=4 --fast` | 50/50 clean, 162 scenes, 1822 controls, 0 findings |
| Whole app `npm run smoke` (desktop) | 450/450 clean |
| Whole app `npm run smoke -- --mobile` (390px, includes the new shell-overflow gate) | 450/450 clean |
| Whole app `npm run smoke -- --scenes` in 4 shards | 450/450 clean, 1468 scenes, 3 s idle each |

The whole-app runs happened on a quiet machine on the final tree, after the fixes merged. The dev server was stopped afterwards.

## What the audits caught that the gates did not

- **D1: wide regions clipped at 390px with no way to scroll** (probabilistic-structures, feature-stores-skew, finops-cloud-cost). Fixed at the root (`.stage-shell { max-width: 100% }`), and `scripts/lib/phone.mjs` now fails `smoke --mobile` and `sweep` on it. The old checks treated the stage's own `overflow: hidden` as clipping on purpose.
- **Captions contradicting visible state** (game-theory, paxos, build-vs-buy, zero-knowledge-proofs). Fixed, each with a test.
- **GraphView same-layer edges hidden behind nodes** (technical-strategy). Fixed in shared code with a test.
- **Typed-number field accessibility.** `aria-invalid` and `aria-describedby` now follow the refusal message.
- **Duplicated code.** Six StoryScene files became `components/ScenarioStage`; nine local `fmt` helpers became `core/format.integer`; three copies of the exponent parser became one `readExponent`; the bounded-integer field is shared across five lessons.

## Accepted limitations and parked items

- memModel relaxed mode: reader-side reordering only, release fence not modelled, `seq_cst` stronger than C++ in listed cells. The lessons say what the model does; changing the semantics would reopen the domain review.
- hazard-pointer state count: 305 (builder) against 340 (reviewer), unresolved.
- Parked cosmetic minors from part B: D8 (blank stage before Hunt in deterministic-simulation-testing and byzantine-faults), D9 (long opening caption in zero-trust), D12 (conways-law picker far above its graph), D14 (blank band above raft's Safety monitor). Also formal-methods "Invariant" input slightly past its box at 390 (pre-existing).
- HllView keeps a local 200/30 spring; no `SPRING` preset matches it.
- Dominated paths remain in two Tier 3 scenarios (incident-response, threat-modeling sprint). Informational.

## Not verified

- Real touch devices, Firefox, Safari (headless Edge/Chromium only).
- A screen reader on the new aria wiring.
- Domain correctness beyond the review-protocol passes: no independent recomputation of every constant, table or litmus cell in this sign-off.
- `npm run captions` was not run against a baseline in this sign-off.
- Scenes beyond each lesson's first were checked by sweep and scene smoke, not by eye.
