# QA sign-off: Tier 2 · Practitioner

Reviewer: Sentry (QA). Tree: `main` at `d583103`, plus one uncommitted edit to `docs/rollout-plan.md` (the §4.1 tracker). `git diff -- src` is empty, so the code is exactly what the earlier smoke and captions runs saw. Date: 2026-10-08.
Scope: all 172 tier-2 entries in `src/core/curriculum.ts` (156 new plus 16 retrofitted), within the 255 registered lesson folders.
Out of scope, by instruction: per-batch accuracy reviews. Every batch already had a Sentry review with fixes on-branch, and I did not redo them.

## Summary and verdict

**Verdict: SIGN-OFF WITH CONDITIONS.** There are no blockers and no majors. Every gate is green by exit code. All 172 lessons are registered, built, structurally complete and listed in the tracker. Every cross-reference resolves. The payload-free, no-eval-on-input, no-network, credential and ligature rules all hold. All 172 lessons load at 768px with no console error and no sideways overflow.

Counts: **0 blocker · 0 major · 7 minor · 4 cosmetic.**

Conditions (all small; none changes what a learner sees except C1):
- **C1.** Replace the hand-rolled `<sup>` in dynamic-programming (m-1). It is a one-line fix and a standing-rule violation.
- **C2.** Bring the tracker (§4.1) in line with what is merged (m-2), and record this sign-off in it.
- **C3.** Either run the "Tier 2 close-out kit round" the tracker still lists as not started, or log the reuse debt in m-5 and m-6 as accepted. The tracker should not claim a round that hasn't happened.

What I did not verify (see the end): I did not re-run smoke or captions; I relied on the clean diff against `d583103`. I did not re-check domain accuracy. I did not drive every scene option at 768px.

## 1. Tracker and registration (verified by script)

I wrote a script (`SP\t2audit.mjs`) that parses `curriculum.ts`, the §3.1.2 table, the §3.1.7 batch table and the §4.1 tracker, and compares them with the folders on disk.

| Check | Result |
|---|---|
| Registered topics / folders with `index.tsx` | 255 / 255; every folder is registered and every topic is built |
| Tier 2 registered | 172 (156 new + 16 existing) |
| Duplicate ids, duplicate titles | none |
| §3.1.2 table (156 rows) against curriculum | every id, track, title and tagline matches; every batch letter matches the §3.1.7 table |
| §3.1.7 batch table | 34 batches (32 new + R1, R2), 172 distinct lessons, none missing, none extra |
| §4.1 tracker | 34 tier-2 batch rows, lesson counts sum to 172, each equals its batch-table count, branch names match, all `done` |
| Merge SHAs named in the tracker | 50 found; every one exists and is an ancestor of `HEAD` (B32 `28a855f` and B31 `d583103` included) |
| Per-lesson structure | all 172 have `summary` with non-empty `tldr`, `what`, `useCases`, `why`, `watch`; at least 3 `tryThis`; at least 3 `keyIdeas`; a quiz of at least 3 questions; a `Stage`; and at least one `*.test.ts` |
| Backtick lesson references (`` `id` ``) | every one that names a lesson names a built lesson. The 8 other backticked tokens (`max-age`, `s-maxage`, `no-cache`, `no-store`, `grpc-status`, `grpc-timeout`, `margin-left`, `margin-inline-start`) are not lesson ids |
| Resource-exhaustion | links `file-descriptors`, `connection-pooling`, `memory-leaks`, `file-systems`, `sockets-api`. All are built. Its `GAUGES[*].lesson` ids (the `LessonRef` links) all resolve |
| Authored quiz answers | index 0 in 695 of 780 questions. This is harmless: `components/Quiz.tsx` shuffles options at render via `core/quiz.ts`. It would be the Tier 1 T-1 defect if that shuffle were ever removed |

The `PENDING_RETROFIT` set and the lesson-content baseline for tiers 1 and 2 are empty (`lessonContent.test.ts`), so the K-2 content lint holds every tier-2 lesson to the full rules.

## 2. Gates (on `d583103`, run by me)

| Gate | Exit | Detail |
|---|---|---|
| `npm run build` | 0 | `tsc -b` plus Vite build |
| `npm run lint` | 0 | 45 warnings, all `react/only-export-components` (see m-4) |
| `npm test` | 0 | 461 files, 7,951 tests, all passed, about 55 s |
| `npm run check-tokens -- --strict` | 0 | 0 hits across 255 lessons, 105 `allow-color` markers |
| smoke 255/255 desktop, 255/255 at 390px, captions | not re-run | No source change since `d583103`, so I took your earlier runs as still valid. That is an inference from the diff, not a fresh run |

## 3. Standing-rules scan (all 172 tier-2 lessons, source and tests)

- **Payload-free security: pass.** I grepped lesson source for script tags, event-handler attributes, `javascript:`, SQL tautologies and `DROP`, traversal sequences, shell metacharacter chains, shellcode and NOP sleds, gadget and deserialization terms, and exfiltration code. I then read the samples in the hot lessons (xss, csrf-cookies, deserialization-path-traversal, memory-safety-bugs, iam-least-privilege, mfa-passkeys, auth-sessions-jwt). Every hit was either prose, an unrelated word, or benign:
  - xss samples are ordinary text (`I <3 it`, `Tom's "best" pick`, `5 > 3 & 2 < 4`). The only `<script>` is a template wrapper string the model reads as data, and nothing is rendered as HTML.
  - deserialization-path-traversal's one relative-path sample is `../logo.png`, labelled "a typed path that goes up one folder by accident". The loader's classes are fictional and nothing executes.
  - csrf-cookies is a sequence diagram of a forged request with no attack code.
  - critical-rendering-path's `onload="this.media='all'"` is the standard print-media stylesheet pattern, shown as text in a generated `<head>`.
- **`eval` / `new Function`: pass.** Tier 2 call sites: dependency-injection `run.ts:19`, refactoring-code-smells `model.ts:162`, solid-principles `run.ts:45`, tdd `model.ts:50`, test-doubles `model.ts:198`, `:377`, `:387`. Each has a comment saying the text is fixed and lesson-authored, that no learner input reaches it, and that it needs `unsafe-eval`. I read each site. The only dynamic piece is solid-principles' `call.code`, which comes from the fixed `L_CALLS`. Two workers (`core-web-vitals/busy.worker.ts`, `regex-basics` from Tier 1) take numbers only.
- **No network in lesson code: pass.** No `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon` in any lesson source. The grep hits were the word "fetch" in prose, the CPU-pipelining `fetch()` stage function, and an LRU cache's `db.fetch` line in display text.
- **Credential-shaped literals: pass.** No AWS, Stripe, GitHub, Slack or Google key shapes, no `-----BEGIN`, no raw JWT prefixes and no quoted `password=` / `secret=` / `api_key=` values in lesson source. Fake secrets come from `core/fakeSecret` (auth-sessions-jwt, csrf-cookies, deserialization-path-traversal, object-storage, structured-logging, webhooks). `secretScan.test.ts` scans `src`, `scripts` and `docs`, and it passes.
- **Raw colours: pass** (`check-tokens --strict`, above).
- **Ligatures: pass.** `global.css:89` still sets `font-variant-ligatures: none !important`. No lesson CSS touches `font-feature-settings` or `font-variant-ligatures`.
- **Hand-rolled `<sup>`: one violation**, m-1.

## 4. Cross-lesson consistency and 768px

**Colour meanings.** I extracted all 1,400 or so `{ color: 'var(--x)', label }` legend pairs from tier-2 source (`SP\legend2.txt`). Overall it is disciplined. `--bad` is errors, losses and the costly side; `--ok` is success and the cheap side; `--orange` is the second kind of failure; `--dim` is ruled out or not reached. Two things I checked and found fine:
- async-await-coroutines paints "total = the sum" `--bad` and "total = the slowest" `--ok`. That is the costly-versus-cheap comparison the table allows.
- Failures that use `--orange` (graphql, webhooks, boot-process, dns-resolution, timeouts-deadlines) sit next to a `--bad` for the hard failure, as the table prescribes.
One real drift, m-3.

**Linked-lesson terminology.** connection-pooling and resource-exhaustion agree on the mechanism: a pool that is checked out and not returned, callers waiting until an acquire timeout, then failing. There are two gaps, both in m-3.

**768px, 12 busy wide lessons from waves 9-10.** I started a dev server with `KINETIC_PORT=5361` and confirmed `/__kinetic_root` returned `{"root":"K:/Programming/personalProjects/kinetic"}`, then stopped it afterwards (nothing listens on 5361). I took `--stage` shots at 768x1024 and looked at each: connection-pooling, resource-exhaustion, deployment-strategies, kubernetes-basics, browser-rendering-pipeline, critical-rendering-path, core-web-vitals, bundlers-code-splitting, virtual-dom-reconciliation, structured-logging, cert-lifecycle and iam-least-privilege. Files are `.smoke\shots\q768-<id>.png` (gitignored). All read cleanly: no clipped controls, no text overlap, legends wrap, tiles fit. Small things are under C-1 to C-3.

**768px sweep, all 172 lessons.** I loaded every tier-2 lesson at 768x1024 with a seeded `Math.random` and checked: `scrollWidth <= innerWidth`, no element past the right edge outside a scrolling or hidden ancestor, and no console error or page error. Result: **172 of 172 clean.** I also confirmed every page now has its own title ("Amdahl's & Gustafson's Laws · Kinetic"), which fixes Tier 1's T-6.

## 5. Leftover kit requests (`docs/tier2-wave2…8-kit-requests.md`)

I checked every item that sounds like a bug against the current source. These are fixed on main: the usePlayer caption-inheritance bug (`captionSources` in `core/usePlayer.ts`), the false `e < φ` RSA rule (`numberTheory.ts:180`), `humanDuration` printing "0 s" for tiny values, the `.keep-case` rule (`kit.css:136`), the `defaultPrevented` key guard, the SequenceDiagram `currentStyle: 'tone'` option, the glued-caption strict test (`core/testing/captions.ts`), the ConsolePanel `preserveWhitespace` option, `WideRegion`'s `hint` prop, the token bucket in `core/tokenBucket.ts`, and the `plural()` doc warning. Most wishes were also taken (CallStackPanel `enterFrom`, GanttLanes `labelMinPx`, Button `ref`, and others).
Still open and still bug-shaped: **only** the tooling item in m-7. The rest are reuse wishes: m-5 and m-6.

## Findings

### Minor

**m-1 · MINOR · dynamic-programming · hand-rolled `<sup>` for an exponent**
- `src/lessons/dynamic-programming/frames.tsx:211`: `2<sup>{m}</sup> subsequences`, in the last-frame caption of the LCS scene.
- `CLAUDE.md` says "don't hand-roll `<sup>` for exponents"; `power(k)` exists in `core/format`. It is the only `<sup>` in any lesson `.tsx` (logs-exponentials, Tier 1, mentions one only in a CSS comment).
- `check-tokens` does not catch it.
- **Fix:** use `power(m)` or write `2^m` in words. Add a `check-tokens` rule for `<sup` in `.tsx`.

**m-2 · MINOR · docs/rollout-plan.md §4.1 · tracker out of step with main**
- The B26 to B32 rows now say `done` with merge SHAs, and they match `git log`.
- The "P-follow-up after wave N" rows for waves **5, 6, 7, 8 and 9** still say `not started`, but kit rounds k6, k7 and k8 are merged (`git log --grep=kit`), and the code shows the items landed (m-5 lists what did not). Wave 2 to 4 rows are marked done.
- The "Tier 2 close-out kit round" row is `not started`, which is accurate.
- The "Tier 2 sign-off" row still reads `not started`.
- **Fix:** mark the kit rows with the round that closed them. Move the sign-off row when this report is accepted.

**m-3 · MINOR · caching-patterns, connection-pooling, resource-exhaustion · small cross-lesson drift**
- **a. "miss" is two colours.** lru-cache and cpu-caches paint a cache miss `--bad`. caching-patterns paints it `--hi` ("miss / fill"): `KeyScene.tsx:22`, `PatternScene.tsx:25`, `RaceScene.tsx:38`. That lesson's misses are expected, but the table says `--hi` is "what's happening now", not a status. Either make it `--bad` or say in `watch` why it isn't.
- **b. Timeout scale.** resource-exhaustion's pool scenario says "Requests hang for 30 seconds, then return a 500" (`model.ts:247`, `:159`, `:182`). connection-pooling's acquire timeout is 1 s (`ACQUIRE_TIMEOUT_MS = 1000`, `model.ts:17`), and its caption says "after waiting a second". A learner following the `connection-pooling` link from the gauge meets a different number. Each is a separate simulation, but one line in resource-exhaustion's note ("this lesson assumes a 30 s timeout; the pooling lesson uses 1 s") would settle it.
- **c. Vocabulary.** connection-pooling's gauges are "Pool in use", "Waiting" and "Timeouts"; resource-exhaustion's pool gauge is "DB connections" with the error "pool acquire timeout". Close enough, but "in use" appears in only one.

**m-4 · MINOR · 45 lint warnings, all `react/only-export-components`**
- Counts by lesson: webhooks 13, interpreters-compilers-jit 9, sockets-api 7, i18n-l10n 7, usability-testing 3, mobile-app-lifecycle 3, frontend-state-management 3.
- Lint still exits 0, so no gate fails. The wave-2 note asked for these to be cleaned up when there were 6; it has grown 7-fold, mostly in `frames.tsx` or `captions.tsx` files that export both helpers and components.
- **Fix:** CLAUDE.md already gives the cure (lowerCamelCase helpers, or move non-components out). Do it in the close-out round.

**m-5 · MINOR · duplicated code that the second-use rule says to extract**
- `generics-polymorphism/tscCheck.ts` and `null-option-adts/tscCheck.ts` are byte-identical (49 lines). The wave-7 request was a `core/testing/tsc.ts`.
- A line-diff (LCS) exists in tdd, refactoring-code-smells and solid-principles; the request covered two, and there are now three.
- `architecture-diagrams-c4/layout.test.ts:2` imports `../coupling-cohesion/layout` (`segmentHitsBox`) across lessons. The wave-7 note said to promote it to `core/geometry` when a second user appeared; a second user now exists (cross-lesson import in a test).
- The GraphView edge-label halo and the `underlay` prop were asked for in wave 7 and are not in `GraphView.tsx` or `kit.css`.
- **Fix:** extract in the close-out kit round, or accept as debt.

**m-6 · MINOR · other open wishes from the queues (not bugs)**
- Shared `useRovingToolbar` (http-caching has a local copy); `timeFrames` builder (3 users); `b64urlDecode` and a byte-level `timingSafeEqual` in `core/crypto` (webhooks compares with `===` and says so on screen; pagination has a local `decodeCursor`); `heapGrid` layout; a typed `core/testing/sqlite.ts`.
- Listed so the close-out round has the full list; none affects a learner.

**m-7 · MINOR · scripts/shot.mjs · two tooling bugs from wave 8, still open**
- `--evalfile` runs `page.evaluate(fs.readFileSync(...))` as a plain script (`shot.mjs:95`), so top-level `await` is a SyntaxError.
- `--play` on a scene with no player records `[shot] no play button` as an error for every shot (`shot.mjs:70`).
- The CLAUDE.md keyboard recipe relies on `--evalfile` drive scripts, so this bites reviewers. It does not touch the app.

### Cosmetic

- **c-1 · critical-rendering-path (768px).** The filmstrip caption wraps mid-word: "DOMContentLoa / ded". The cell is too narrow for the unbreakable word. `.smoke\shots\q768-critical-rendering-path.png`.
- **c-2 · connection-pooling.** In a live run at the same instant the stat tile showed "Waiting 123" while the caption said "115 requests waiting". The caption is a moment behind the stats. Self-corrects; nothing false is left on screen.
- **c-3 · cert-lifecycle and iam-least-privilege (768px).** About 150px of empty stage under the explanatory note at the first frame. It is not clipped or broken.
- **c-4 · resource-exhaustion.** Gauge cards print the error code beside the label in dim text (for example "ENOSPC" on both Disk and Inodes), which reads as a stray label until you see the table. Fine once explained.

## What I verified versus assumed

Verified by running or reading in this review:
- The four gates, by exit code.
- The tracker, table and registration cross-checks, by script.
- Structure of all 172 lessons, by script.
- Quiz shuffle wiring (`Quiz.tsx` → `shuffleOptions`).
- Every `new Function` call site and every tier-2 payload, network and credential grep.
- The kit-request items, against current source.
- 12 lessons at 768px by eye.
- All 172 lessons at 768px by script (page overflow and console errors).
- That the dev server served this checkout, and that it is stopped.

Assumed:
- Smoke 255/255 desktop and 390px, and captions, still pass. This rests on `git diff -- src` being empty against the commit you tested.
- Per-lesson accuracy. I trusted the batch reviews, as instructed.
- That the colour audit's regex found every legend pair. It catches the `{ color: 'var(--x)', label: '…' }` form only. Inline `style` colours and legends built another way were not audited.
- Behaviour beyond each lesson's default scene at 768px (scene options, slider extremes, hostile inputs), which this review did not sweep. Tier 1's crawler did that; I did not repeat it for Tier 2.

Housekeeping: while writing a scratch script I accidentally created an empty file `/audit1.mjs` at Git Bash's `/` root (inside the Git for Windows install directory, not in the repo). I tried to remove it and the safety check refused. It is empty and harmless; please delete it by hand.
