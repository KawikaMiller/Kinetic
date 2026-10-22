# Tier 4 sign-off, part A (mechanical audit)

Date: 2026-10-22. Tree: main at `52696cd2`, clean. Auditor: Sentry (QA). Read-only on the tree except this file. No dev server, no browser, no push, no lesson code edited.

**Verdict: PASS with 0 blockers, 0 majors, 6 minors.** Gates are green by exit code. Everything below is mechanical; nothing here says the lessons look right.

## Gates (exit codes, not output greps)

| Command | Exit |
|---|---|
| `npm run build` | 0 |
| `npm run lint` | 0 |
| `npm run check-tokens -- --strict` | 0 (0 hits across 450 lessons, 124 allowed by `allow-color` markers) |
| `npx vitest run src/core/lessonContent src/core/curriculum src/core/testing` (the T4 lint path) | 0 (9 files, 92 tests) |

The full `npm test` was not re-run, as instructed.

## 1. Registry: PASS

- `src/lessons/` has 451 entries: 450 lesson folders, each with `index.tsx`, plus one loose file (`hintGlue.test.ts`, Tier 3, not a lesson). No folder lacks `index.tsx`.
- `curriculum.ts` has 450 topics (T1 62, T2 172, T3 166, T4 50); all 450 have a folder.
- Tier 4 = 50 topics, all 9 existing ones present (raft, distributed-transactions, backpressure, multi-region, lsm-trees, crdts, probabilistic-structures, slos-error-budgets, zero-trust), all built.
- Per-track totals are arch 12, data 3, dsa 7, ops 3, sec 6, hw 1, os 2, lang 2, math 2, craft 2, ml 3, lead 7. Removing the nine existing (arch 4, data 2, dsa 1, ops 1, sec 1) leaves hw 1, os 2, lang 2, math 2, dsa 6, arch 8, data 1, sec 5, ops 2, craft 2, ml 3, lead 7 = 41. That equals the `docs/tier4-plan.md` row exactly.
- No tracked file has a name containing `$`, backtick or braces. No zero-byte tracked or working file under src, docs, scripts or public. Repo root holds only expected files (13 tracked). `.smoke/` and `dist/` are ignored.

## 2. The nine retrofits: PASS

Evidence is from source greps plus the T4 lint test, which has an empty `TIER4_AWAITING_RETROFIT`, an empty `BASELINE` and no exemptions, so all nine are held to the full rules.

| Lesson | Provenance chips | Seed shown | Claim label | try-this tests | Clock/random in source |
|---|---|---|---|---|---|
| raft | simulated, from-memory | `Provenance seed=` + `SeedField` | `ClaimLabel kind="research"` (Raft paper) | 5 | none |
| distributed-transactions | simulated, illustrative, from-memory | yes | n/a | 5 | none |
| crdts | simulated, from-memory | yes | n/a | 5 | none |
| multi-region | simulated, illustrative, from-memory | n/a: deterministic model, no RNG | n/a | 4 | none |
| backpressure | simulated, illustrative, from-memory | yes | n/a | 4 | none |
| lsm-trees | simulated, illustrative, from-memory | yes | n/a | 4 | none |
| probabilistic-structures | simulated, illustrative, toy, from-memory | yes | n/a | 4 | none |
| slos-error-budgets | illustrative, invented, from-memory | n/a: no RNG | n/a | 4 | none |
| zero-trust | invented, scripted, from-memory | n/a: no RNG | n/a | 4 | none |

Rule 29 on the retrofits: crdts pins a naive-overwrite witness per data type (counter seed 11, set 26, register 11, each 6 actions), and `crdt.test.ts:85-87` asserts the broken mode fails on at most 90% of 200 seeds while the CRDT passes the same seeds. raft pins seeds 1 and 3 and distributed-transactions pins 2, 6 and 14. None is 0.

## 3. Per-lesson T4 mechanical rules, all 50: PASS

- **Lint path:** `lintTier4Lesson` over all 50 lessons returns no issue. `DOMAIN_REVIEW_IDS_T4` is 38 and equals the plan's D rows plus the nine; `PROOF_SHAPED_IDS` is 9; `LEAD_IDS` is 7.
- **Banned calls** (independent grep: `Math.random`, `Date.now`, `performance.now`, `new Date`, non-test `.ts`/`.tsx` of all 50 lessons): 0 hits, 0 `allow-random` markers. 0 `allow-fresh` and 0 `allow-no-seed` markers either.
- **Seed visible:** every lesson whose source uses `mulberry32`, `createCluster` or `createTickSim` shows a seed in a `.tsx` file.
- **Chips:** every `REQUIRED_CHIPS` kind is present (simulated on memory-ordering-atomics, lock-free-cas, feature-stores-skew; toy on the five crypto lessons, llm-serving, fine-tuning-quantization; illustrative on llm-serving). The three lessons that call `core/crypto` (elliptic-curves, post-quantum-crypto, e2ee-forward-secrecy) wear `real` chips.
- **`manipulation N:` tests** on all nine proof-shaped lessons, at least 2 each (flp-impossibility 6, np-reductions 4, zero-knowledge-proofs 4, sat-solvers 2, approximation-algorithms 3, byzantine-faults 3, secret-sharing 3, online-algorithms 3, game-theory 3).
- **Pinned failing seed:** no Tier 4 `BROKEN_SEED*` constant is 0 (values 1 to 19 across paxos, byzantine-faults, flp, snapshots, HLC, truetime, failure-detectors, gossip, metastable, DST, chaos, PQC). The zeros in the repo (cache-stampede, kafka-partitioned-log, offline-first-sync and so on) are all Tier 3. sat-solvers asserts `BROKEN_SEED > 0`; formal-methods tests say "lowest failing seed that is not 0". Lessons using the rule 29 witness clause (suffix-arrays, approximation-algorithms, linear-programming, online-algorithms) are covered by the lint's witness exemption; I did not recompute their fail shares.
- **Absolutes:** grep for "impossible / no execution can / in all states / guarantee" in screen text finds only scoped uses: theorem-labelled FLP, "holds in all N reachable states of this model" in paxos and formal-methods (computed from an exhaustive run), approximation "guarantee" tied to the triangle inequality.
- **Security lessons payload-free** (elliptic-curves, post-quantum-crypto, e2ee-forward-secrecy, secret-sharing, zero-knowledge-proofs, zero-trust): no attack strings, key blocks, token shapes, long hex or base64 literals in non-test source. The only secret-like literal is `fakeSecret('ses', 'ame')` in `secret-sharing/shamir.ts:11`. The only long hex is the public P-256 group order in `e2ee-forward-secrecy/ratchet.test.ts:20` (a standard constant, in a test). No sentence calls a toy "secure"; `elliptic-curves/index.tsx:83` says agreement "does not make the code safe to use". The e2ee `thief.ts` runs against the lesson's own seeded toy session. The ZKP extractor works over toy groups only. No key-recovery routine for general sizes exists.

## 4. Shared code: PASS with minors (M1 to M4)

**`docs/shared-api.md` spot-check, 14 entries, all current:**
`BoundedIntField` props (label, value, min, max, onValue, messages, className) and `parseBoundedIntField` / `standardIntMessages` in `components/boundedIntParse.ts`, `.int-field-refusal` at `kit.css:989`; `ChipButton` `ariaDescribedBy` (`ui.tsx:262-287`); `nodeAesGcmOpen` returns `Uint8Array | null` (`nodeCrypto.ts:102`); `memModel` (models, limits 3/5/10/3/9/120, fixtures, `outcomes`, `regsKeys`, `parseLitmus` result shape); `distSim` v2 (`fifo`, `loss` as function, `oneWay`, `from`, `durable`, `dropWhere`, `payloadLabel` export); `core/field` (all 13 methods named in the doc exist); `core/ecc` (`weierstrass`, `TOY_F17`, `P256`, `SECP256K1`, `mul` result shape, `TOY_FIELD_LIMIT`, `hasseBound`, `crossCheckP256`); `core/numberTheory.isqrt`; `core/vertexCover` (all 7 exports); `core/sat` (`dpll`, `replayTrace`, `encodePackages`, `unsatCore` and the rest); `core/tsp`; `core/explore` + `pureProtocol` (`networkExplorer`, `asDistNodes`, `DEFAULT_MAX_STATES`); `explorePathSteps` in `traceFrames.ts`; `ClaimLabel kind="theorem"`.
Earlier duplicates were migrated: no `LengthField` or `length.ts` copy remains.

**Duplicated helpers that should be shared:**
- **M1** Nine local `const fmt = (n) => n.toLocaleString('en-US')` in Tier 4 lessons: `game-theory/EnumScene.tsx:7`, `game-theory/facts.ts:9`, `elliptic-curves/FieldScene.tsx:13`, `elliptic-curves/ScalarScene.tsx:15` (accepts bigint), `post-quantum-crypto/facts.ts:7`, `post-quantum-crypto/LweScene.tsx:10`, `secret-sharing/facts.ts:9`, `secret-sharing/PolyScene.tsx:10`, `zero-knowledge-proofs/SchnorrScene.tsx:20`. `core/format.integer` exists (adds `maximumFractionDigits: 0` and a non-finite guard) and `boundedIntParse.groupInt` is the same one-liner. Repo-wide the pattern is 23 files; Tier 3 carried the same and recorded it as accepted debt.
- **M2** Six lead lessons carry near-identical `StoryScene.tsx` files (49 to 54 lines: walk state, caption effect, `redMeters` colouring, `ENDING_HINT` from `validateScenario`) plus an identical `READ_THE_LEDGER` string in six `scenario.ts`: `strangler-fig-migrations`, `build-vs-buy`, `technical-strategy`, `reversible-decisions`, `influence-without-authority`, `hiring-interviewing`. Only the meters, heights and wording differ. `fx` helpers differ in signature and are fine. This is the clearest "extract on the second use" miss in Tier 4.
- **M3** The "type x, keep the old value, show the refusal" handler is copy-pasted between `zero-knowledge-proofs/SchnorrScene.tsx:56-63` and `ZkScene.tsx:49-56` (identical `parseBoundedInt` call and messages), with a variant in `FiatScene.tsx:32`. Small, same lesson.
- **M4** Local `plural` in `lsm-trees/frames.tsx:36` and `gossip-protocols/init.ts:51` duplicates `core/format.plural` (same signature). Local `clamp` in `linear-programming/edit.ts:38` is character-identical to `core/math.clamp` (the `influence-without-authority` and `hiring-interviewing` clamps close over their own bounds and are fine). Springs: `lsm-trees/Stage.tsx:22` and `probabilistic-structures/HllView.tsx:28` are named constants, so check-tokens accepts them, but no `SPRING` preset matches (260/26 also appears in `sharding`).

## 5. Docs: stale rows listed, not edited

**`docs/rollout-plan.md` section 4.1, Tier 4 rows still showing a stale status (line numbers as of `52696cd2`):**

| Line | Row | Shows | Should be (merge commit) |
|---|---|---|---|
| 6717 | T4-R1 Retrofit part 1 | in progress | done, `59e9a144` |
| 6718 | T4-B3 Hardness | in progress | done, `161d30dd` |
| 6719 | T4-B5 Strings, trees, strategy | in progress | done, `395bccc3` |
| 6720 | T4-B8 Leading change | in progress | done, `8cefcb2b` |
| 6721 | P-follow-up after wave 1 | not started | done or fold into kit-e `303b9872` (decide) |
| 6722 | T4-B1 Failure and membership | not started | done, `ee3e2d54` |
| 6723 | T4-B4 Consensus and global time | not started | done, `507c0889` |
| 6724 | T4-R2 Retrofit part 2 | not started | done, `bfe6f5d2` |
| 6725 | T4-B9 People and judgement | not started | done, `821cda0f` |
| 6726 | K4-3, K4-6, K4-7, K4-11 | not started | done, `28d6831c` (kit-f) and `2c895459` (kit-g) |
| 6727 | P-follow-up after wave 2 | not started | done or fold in (decide) |
| 6728 | T4-B2 Concurrency | not started | done, `ee7eea27` |
| 6729 | T4-B6 Advanced crypto | not started | done, `c83751ec` |
| 6730 | T4-B7 ML serving and cost | not started | done, `83ce2707` |
| 6731 | Tier 4 close-out kit round | not started | done, `16f5d41f` (kit-o) |
| 6732 | Tier 4 sign-off | not started | pending this audit |

Also stale: line 14 headline "Tier total when done ... 167 ... 451" (actual Tier 3 is 166 and the total is 450, because `leases-fencing` stayed in the backlog), and lines 13 and 3.3 "~8 batches" (the plan says 9).

**`docs/tier3-kit-requests.md`:** current. The "Tier 4 kickoff audit" and "Tier 4 close-out kit round (kit-O)" sections match the tree (BoundedIntField, ChipButton `ariaDescribedBy`, `nodeAesGcmOpen` verified in source). The only stale thing is the file's old top-of-file "next kit round" row, which the kickoff audit table already flags as stale. `docs/shared-api.md` last drift fix was `383143b4`; I found no new drift.

**Also noticed:** `CLAUDE.md:148` still says "not all 330 in one process" (now 450).

## 6. Git cleanliness: PASS with one minor (M5)

- `git status --porcelain`: 0 lines before this report was written. `git stash list`: 0.
- `git worktree list`: only `K:/Programming/personalProjects/kinetic` (main). `git branch -a`: only `main` and `origin/main`. No unmerged branch.
- Local `main` is **204 commits ahead of `origin/main`** (origin tip `30663e93`, "Tier 3 sign-off: QA report and tracker rows").
- **M5** An empty leftover directory `.claude/worktrees/agent-a0c0b214ef9d9c650` exists (not a registered worktree, not tracked, no content). Delete it before sign-off.
- This report (`docs/qa-tier4-partA.md`) is untracked and not committed, as instructed.

## Conditions, severity-ranked

No blockers and no majors. All are minors, to fix or accept in writing:

1. **M2 (minor, most worthwhile).** Extract the six-copy lead `StoryScene` wrapper and the shared `READ_THE_LEDGER` string. Files: `src/lessons/{strangler-fig-migrations,build-vs-buy,technical-strategy,reversible-decisions,influence-without-authority,hiring-interviewing}/StoryScene.tsx` (all lines 1 to ~50) and each `scenario.ts` (the `READ_THE_LEDGER` const, around lines 41 to 62). If extracted, the sweep and `--frames` diff must show these six lessons pixel-identical.
2. **M1 (minor).** Replace nine local `fmt` helpers with `core/format.integer` or `groupInt`, or record them as accepted debt as Tier 3 did. Files listed above.
3. **Constant-time label, minor.** Rule 32 and checklist D #3 want "not constant-time, never copy this" on BigInt code. `elliptic-curves`, `e2ee-forward-secrecy` and `zero-knowledge-proofs` say it; `secret-sharing` (BigInt `core/field` arithmetic; toy chips at `PolyScene.tsx:131`, `FailScene.tsx:87` say "a real system would use ... a CSPRNG ... Nothing here splits a real key") and `post-quantum-crypto/shor.ts` (BigInt modPow, toy chip at `LweScene.tsx:95`) do not use those words. The lint does not check it. Add the phrase to the toy chips, or note it for the domain reviewers' sign-off.
4. **M3 (minor).** De-duplicate the secret-x handler in `zero-knowledge-proofs/SchnorrScene.tsx:56` and `ZkScene.tsx:49`.
5. **M4 (minor).** Use `core/format.plural` in `lsm-trees/frames.tsx:36` and `gossip-protocols/init.ts:51`; use `core/math.clamp` in `linear-programming/edit.ts:38`.
6. **M5 (minor).** Remove the empty `.claude/worktrees/agent-a0c0b214ef9d9c650` directory.
7. **Docs (for the coordinator).** Update the stale rollout-plan rows above, the 451 and "~8 batches" headline cells, and `CLAUDE.md:148`.

## What I did NOT verify

- **Anything in a browser or at runtime:** no smoke (desktop or mobile), no `--scenes`, no `npm run sweep`, no `captions`, no screenshots, no focus or console check. Rule 38 (sweep clean) is therefore unverified here.
- **Full `npm test`.** I ran only `lessonContent*`, `curriculum*` and `core/testing` (92 tests). Per-lesson test files were counted and read for names but not individually run.
- **Domain correctness:** no vector, constant, count, litmus-table cell, ML-KEM size, curve parameter or on-screen number was recomputed. The `from-memory` facts were not checked against sources. The 90% fail-share and "lowest failing seed" values of the witness-clause lessons (suffix-arrays 99.0%, linear-programming 93%, approximation-algorithms 94.5%, online-algorithms 95%) were taken from the lint passing, not recomputed.
- **Prose quality beyond grep:** I scanned screen text only for absolutes and secure/safe-to-use wording; I did not read every caption, quiz `why` or key idea. The "Checklist A to G" reads belong to the domain reviewers.
- **Independence of oracles:** I did not read each test to confirm its oracle is independent of the lesson's own output.
- **Pixel identity** of any earlier kit extraction (kit-o BoundedIntField migration and so on): taken from `docs/tier3-kit-requests.md`, not re-diffed.
- **Remote state:** I did not fetch; "204 ahead" is against the local `origin/main` ref as last fetched.
- **Shared-api entries beyond the 14 spot-checked,** and any doc under `docs/` other than rollout-plan, tier3-kit-requests, shared-api and the three Tier 4 planning docs.
