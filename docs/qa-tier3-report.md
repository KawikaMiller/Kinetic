# Tier 3 QA report and sign-off

Date: 2026-10-22. Tree: main after `261f3114` (Merge t3/signoff-c). Auditors: Sentry (QA), three independent passes, plus the coordinator's whole-app runs.

**Verdict: signed off.** Every condition the audits raised is closed or recorded below as accepted, with the evidence for each. One flake is noted under "Known limits".

## What Tier 3 is

- 166 Tier 3 registry entries: 154 new lessons (31 batches, B1-B31) plus the 12 existing Tier 3 lessons retrofitted (T3-R1, T3-R2). 409 lessons are registered in total and all 409 have a lesson folder.
- Every batch had an independent Sentry review (two reviewers for the larger or domain-flagged ones), one fixer pass on the same branch, and a merge with the gates run by exit code. Reviews found real majors in nearly every batch (captions contradicting their own numbers, pinned broken seeds that failed for the wrong reason, claims the model disproved, crashes on slider extremes, focus lost to the page body).
- Kit rounds A-N extracted shared code (parseKit, ClassifyBoard, core/regex, core/semver, core/editDistance, core/countMin, core/automata and Turing tables, core/raster3d, raster, raytrace, signal, dct, sha256, forbiddenCalls scans, joinList/dollars, paintPixels, Hint tone, boolean Segmented, SequenceDiagram note width, GanttLanes clip). Each was checked pixel-identical against a baseline before merging.

## Definition of done (docs/rollout-plan.md section 4.2)

| # | Condition | Result |
|---|---|---|
| 1 | Every lesson exists and is registered | PASS. 166 of 166 present, registered, with summary, tryThis, keyIdeas, quiz and Stage and at least one test file each. The awaiting-retrofit exemption lists are empty. |
| 2 | Green on the whole repo | PASS, with the caveats below. Build, lint, test and check-tokens exit 0 on the final tree. Whole-app smoke: desktop 409/409. Mobile 408/409 (see Known limits). Scene scan (every scene of every lesson, 3 s idle each): 409 lessons, 1,328 scenes, 0 failures. Captions: see Known limits. |
| 3 | Eyeballed | PASS with limits. Per-batch reviewers looked at screenshots for their lessons; the sign-off sampled 65 lessons across all 31 batches and all 12 retrofits at 1440, 768 and 390 px and read the screenshots for 46 of them at 390 px. See Known limits for what was automatic only. |
| 4 | Correctness checks passed | PASS. Every [domain review] lesson, retrofits included, appears in at least one review file with its majors fixed. Seven batches have one independent Sentry review each (B1, B3, B5, B7, B8, B16, B21); the builder is the first reader. Sign-off recomputed on-screen numbers independently for numeric-precision, merkle-trees, physical-clocks-skew, privacy-engineering, back-of-envelope, congestion-control, quorums and wifi-shared-medium: all matched. |
| 5 | Existing lessons re-verified | PASS. The 12 retrofits have tests, `try-this N` tests and a provenance chip, pass the AC-0/T3 lint with no exemptions, and no false claim was found in a read of their summaries, key ideas and quizzes. |
| 6 | Shared code settled | PASS. No open kit request that a Tier 3 lesson depends on; zero real cross-lesson imports; `docs/shared-api.md` is current (13 entries spot-checked, four stale headings fixed). Remaining duplication is listed under Accepted debt. |
| 7 | Committed and merged | PASS. All batch branches merged, no worktrees or stray branches, git status clean. |

## Sign-off audits and what they found

- **Part A (mechanical audit):** 0 blockers, 0 majors, 14 minors. Conditions C1 to C8: the 30% correct-option-longest cap was not enforced for Tier 3 (fixed; Tier 3 measures 28.4%); six caption holds fixed or justified; duplicated joiners, source-scan tests and two SHA-256 copies extracted; three real React key and memo warnings fixed; stale doc headings; content nits and nine summary hedges. Git cleanup done by the coordinator.
- **Part B (65-lesson sample, 2,166 control actions, 550 key presses):** 0 blockers, 3 majors, 9 minors, 4 cosmetic. Majors: count-min-heavy-hitters crashed from the default state (slider max), and two focus drops (sharding, ownership-refcounting). Also fixed: the shared Transport dropped focus at the first and last frame, a section title glued to the following text, twelve hand-rolled scroll tables moved to `WideRegion`, ddos-mitigation wording. Zero React warnings of any kind across all 2,166 actions.
- **Sweep (the other 101 lessons, 397 scenes, 3,545 control actions, about 7,070 key presses):** 0 blockers, 4 majors, 6 minors. Four crashes or frozen players reachable from a visible control: graph-coloring (fresh array into the player every render), kafka-partitioned-log (no actor at replay 0), change-data-capture (injected sender not in the actor list), property-based-testing (fresh fallback array). All fixed with regression tests that fail on the old code; a class audit over all 273 `usePlayer` call sites and every sequence-diagram caller found no further instance. Focus drops fixed with a new `ChipButton` `softDisabled` and a shared `refocusAfterRemove`; a source-scan test now fails on a plain Hint directly under a SectionTitle.

## Known limits (stated, not hidden)

- **fourier-transform at 390 px:** one run of the full mobile smoke reported a plot label at 7.6 px (floor 8 px). Three isolated re-runs on the same tree pass, and the per-batch and sign-off reviewers measured no text under 8 px in any scene of this lesson at 390 and 768. Treated as a transient layout measurement, not reproduced. If it recurs, the fix is a larger `StageFrame` `minWidth` for that scene.
- **`npm run captions` coverage:** the script only walks lessons with a step player, 48 of the 166 Tier 3 lessons; the other 118 are covered by unit tests only. A full-repo run takes over an hour on a loaded machine. The sign-off ran it sharded over the Tier 3 lessons, found 11 flagged runs, fixed or justified all of them (justified: first-loss and snapshot captions that stay true for the whole hold), and did not re-run the Tier 1 and 2 baseline.
- **Screenshots:** the sweep of the 101 lessons and the sign-off interaction drivers read the DOM and console at 1440 px, not screenshots. Per-batch reviewers and part B read screenshots for the lessons they covered; 768 px was mostly checked by script (overflow and font-size measurements), and a few fixer changes (new captions and chips) were verified by tests and pixel diffs, not by eye.
- **Real-world facts:** every claim from memory (RFC numbers, vendor defaults, research citations, libjpeg's integer quality rule, cloud-provider behaviour) is shown on screen as a "from memory, verify" chip or hedged. None was checked against a source in this environment.
- **Pinned broken seeds:** in offline-first-sync both broken modes fail on nearly every seed, so the pinned "lowest failing seed" is 0 and means little; the lesson says so on screen and the tests include counterfactuals.
- **Distributed-simulation scope:** invariants hold over at least 200 seeded fault schedules per lesson, not exhaustive search, except where a lesson states an exhaustive check.

## Accepted debt (none blocks a lesson)

- A few local "a, b and c" joiners remain where the output differs from `joinList` (for example garbage-collection prints "nothing" for an empty list); the sign-off fixer migrated the identical ones and did not recount the remainder.
- The `memory-allocators` `Uint8Array|ArrayBuffer` source scan and a few lesson-specific scans stay local.
- Lessons that could use `core/testing/strings` `stringsUpTo` still carry local helpers.
- Cosmetic, parked: sharding Directory scene breaks words mid-word at 390 px; circuit-breakers CLOSED pill overlaps text at 390 px; ml-fairness-bias prints "undefined" in a precision cell when nobody is approved; Gantt bar labels clip in cache-stampede and project-planning-critical-path; prioritization 2x2 labels crowd at efforts of 1-3 weeks; the spec's delivery timeline for prioritization was not built; product-thinking's outcomes tree is stacked cards, not `TreeSvg`.

## Evidence

Sentry reports and fix lists live in the session scratchpad (`qa-tier3-partA.md`, `qa-tier3-partB.md`, `qa-tier3-sweep.md`, per-batch `review-t3b*.md`) and are not committed; the fixes and their tests are in git (`git log --grep "Merge t3/"`). Whole-app smoke logs: desktop 409/409, mobile 408/409 plus the isolated re-run, scene scan 1,328 scenes in four shards, all on the tree at `261f3114`.
