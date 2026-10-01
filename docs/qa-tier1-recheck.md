# QA re-check: Tier 1 · Foundations

Reviewer: Sentry (QA). Tree: `main` at `1ef43eb`, clean. Date: 2026-10-01.
Scope: every finding in `docs/qa-tier1-report.md` (taken at `8826f2e`, report committed in `fbf4544`), re-run against the 98 commits in `fbf4544..1ef43eb`. Also: a regression sweep of all 99 lessons, an independent review of all 211 rewritten Tier 1 quiz questions, and a push-protection check.

## Summary and verdict

**Verdict: ship after one fix.** The injection-attacks shell row still calls command substitution safe. That is the last open major; fix it before Tier 1 is signed off. Before the first push, also take the push-protection decision described below. Nothing else gates the release. The minors listed are worth a follow-up pass, but none of them makes a lesson say something dangerous.

This is a strong round of fixes:
- 7 of the 8 majors are properly fixed, verified live.
- 60 of 64 minors are fixed.
- Nothing regressed badly: no console errors, page overflow or crashes anywhere in 99 lessons at 1440, 768 or 390px.
- Every repo gate is green.
- No quiz answer is wrong.

What's still open:

1. **injection-attacks (major, the rest of M-4).** The five samples are now modelled correctly; checked against real bash. But typing `$(whoami)`, `` `id` ``, `$HOME`, `~` or `{a,b}` into the Text field gives `arguments: ["$(whoami)"]` with no break flagged. The headline stat then counts the shell as safe. That's the textbook command-injection payload, one keystroke away from the samples, and the on-screen note says the model was "checked against bash".
2. **Push protection.** HEAD's source is clean. But none of the 225 local commits has been pushed, and the history still holds the original literals. Those are an `AKIA` + 16 AWS-shaped ID, three `sk_live_` Stripe-shaped keys and an RSA private-key header, in `6a2eacc` and `fbf4544`. `docs/qa-tier1-report.md:487` still quotes one in full. GitHub scans every commit in a push, not just the tip.
3. **Four minors only partly fixed:**
   - floating-point 1e400 / Infinity
   - debugger-tools step-out key idea
   - branching-workflows dev-3 lane colour
   - agile-kanban WIP-change caption
4. **A handful of small regressions from the fixes themselves.** The worst are an unreadable unticked-chip colour in code-review (1.77:1) and a ci-pipelines YAML that is cut off at 390px with no hint.

### Counts

- **Original findings (114):**
  - 8 majors: 7 fixed, 1 partially fixed (M-4).
  - 64 minors: 60 fixed, 4 partially fixed.
  - 42 cosmetics:
    - 4 tier-wide items: T-10, T-11 and T-12 are fixed; T-9 is partially fixed.
    - 38 per-lesson groups: 33 fixed, 4 partially fixed (big-o, arrays-linked-lists, secrets-management, agile-kanban), and 1 had no item to fix (binary-hex).
    - Home's "filter chips use replace" stays a by-design note.
- **New findings (25):**
  - 0 blockers and 0 new majors. The one open major is the rest of M-4.
  - 9 minors.
  - 16 cosmetics.
- **Quiz (211 questions):**
  - 0 wrong answers.
  - 10 minor and 11 cosmetic flags.
  - The position tell is gone, but a weaker longest-option tell remains (finding N-8).

### How this was checked

- **Repo gates on `1ef43eb`**, all judged by exit code:
  - `npm run build` 0.
  - `npm run lint` 0.
  - `npm test` 0: 104 files, 1,349 tests.
  - `npm run check-tokens -- --strict` 0.
  - `npm run smoke` 0 (99/99).
  - `npm run smoke -- --mobile` 0 (99/99 at 390px).
- **My crawler** (`SP\crawl.mjs`, unchanged from the first round), run over all 62 Tier 1 lessons into `SP\recheck\out\` and the other 37 into `SP\recheck\out2\`. For every lesson it:
  - clicked every scene option and stepped the player to the end;
  - clicked every button;
  - fed 10 hostile values into every input;
  - pressed Home and End on every slider;
  - played once under reduced motion;
  - measured overflow at 390 and 768;
  - pressed up to 70 real Tabs.

  Old and new summaries are `SP\summary-all.txt` / `SP\recheck\summary-old.txt` and `SP\recheck\summary-new.txt`, plus `SP\recheck\summary-other.txt` for the other 37.
- **Six parallel reviewers, one per original shard.** Each re-ran its shard's repros live, read the fixing commits, hunted for regressions caused by the fixes, and reviewed its shard's quiz questions independently. Evidence is in `SP\recheck\evidence-A\` … `evidence-F\`.
- **Spot-checks by me:**
  - All shared-code items: radio groups, titles and focus, slider value text, the reduced-motion quiz, ChipButton, the recorder, InlineText, line endings.
  - The surviving major, from the reviewer's real-bash comparison and the screenshot.
  - The secrets-management graph at 390px.
  - The flagged anomalies in the other 37 lessons.
  - The tier-wide quiz statistics.
  - The secret scan.

`SP` = `C:\Users\Hawai\AppData\Local\Temp\claude\K--Programming-personalProjects\60e952a3-6f6e-4d52-b227-6526f33e5564\scratchpad\`.

---

## Finding-by-finding status

"Live" means re-run in the browser; "source" means checked by reading the code and fix diff only.

### Tier-wide

| ID | Status | How verified | Note |
|---|---|---|---|
| T-1 quiz position | **fixed** | live + source (747c04b, quiz rewrite 0e2d055) | `Quiz.tsx` shuffles options once per visit (`core/quiz.ts shuffleOptions`). `LessonLoader` is keyed by lesson id, so prev/next re-shuffles and never shows the old lesson's questions. All 211 questions sit within a 0.75-1.35 correct-to-distractor length ratio. No option refers to another option by position. A weaker length tell remains (N-8). Wrong picks still cost nothing, so clicking through options still passes a lesson; that's a design choice, not a regression. |
| T-2 tests in the 14 older lessons | **fixed** | source + test run | Every one of the 14 now has colocated tests that assert its on-screen claims. Examples: binary-search agrees with linear search on 300 arrays; the sorts are checked against a counting reference on 240 inputs; sql-basics agrees with real `node:sqlite` (WHERE 2, JOIN 6, LEFT JOIN 8 with two NULLs, GROUP BY 3/2/1); hashing-encryption has 3 test files. Pure logic is out of `.tsx`. No hand-rolled `<sup>` is left. |
| T-3 disclosure in the older lessons | **fixed** | live + source | Each lesson now says what it simulates: web-request "(illustrative timings)", git-internals' toy hash, real RSA-OAEP/ECDSA through WebCrypto in hashing-encryption lane ④, the http-basics fake API, client-server/processes-threads/ip-ports scripted scenes, recursion's 11-frame cap vs about 10,000 real frames, and sorting's in-place merge note with a work-based race. |
| T-4 radio-group keys | **fixed** | live (`SP\recheck\shared.mjs`) | On stack-vs-heap, → moves the selection, End and wrap work, and the player stays at 1/8. Every radiogroup has exactly one tab stop. Transport speed buttons are `role="radio"` with `aria-checked`. Tab leaves the group, and Shift+Tab returns to the checked option. |
| T-5 ChipButton selected vs hover | **fixed** | live (evidence-D `chip-*.png`) + source | Rest is a 12% tint, hover 18%, selected 28% plus a full-strength border and inset ring. `aria-pressed` is true only on the selected chip and absent on action chips. |
| T-6 page titles and focus | **fixed** | live | Titles look like "Binary, Hex & Number Bases · Kinetic". The 404 page is "No such lesson · Kinetic", home is "Kinetic". After card, next or Back navigation, focus lands on the page's `<h1>`. The first page you open doesn't steal focus. |
| T-7 AC-0 counts | **fixed** | dumped every Tier 1 module | All 62 lessons are within 3-5 tryThis and 3-4 keyIdeas. |
| T-8 slider value text | **fixed** | live | agile-kanban's WIP slider at End announces "no limit"; arrivals announces "1.2/day". |
| T-9 colour drift | **partially fixed** | source + reviewers | The rule is now written in CLAUDE.md. floating-point's sign bit is orange, http-basics 4xx orange and requests `--info`, hashing bit = 1 is `--hi`, processes-threads blocked is no longer red, recursion and tree-traversals waiting frames are both violet, and the code-review checklist is fixed. Still open: test-pyramid's green unit layer, left on purpose with "no free categorical hue". That justification doesn't hold, because `--sky` and `--amber` are free. Blue still has four meanings (left without comment; the new rule defines `--info` broadly enough to cover them, so I accept that). dev-3's lane went to a pink that reads as `--bad` (see minor 47). The deliberate leave-out of prefix-sums' red minus term is justified under the new "removed" meaning. |
| T-10 reduced motion | **fixed** | live + source | `main.tsx` wraps the app in `MotionConfig reducedMotion="user"`, and `LessonPage` gives stages `"never"`. Under reduced motion the quiz option's scale stays at `none`; without it, the option animates. The stack-vs-heap and oop shakes go through `useShake` and hold still. stack-queue's imperative shake checks `shakeAllowed`. CLAUDE.md still says "Don't add a global MotionConfig", which now contradicts the code (N-C15). |
| T-11 literal backticks | **fixed** | source + live | `InlineText` renders paired backticks as `<code>` in summary, tips, key ideas and quiz text. An unpaired backtick stays literal. No escaped `\"` is left. |
| T-12 two "Systems" chips | **fixed** | live | Only one chip on the home page is labelled "Systems" now. |

### Per-lesson majors

| ID | Status | How verified | Note |
|---|---|---|---|
| M-1 tree-traversals in-order verdict | **fixed** (30e95fc) | live | Removing leaf 35 now gives "…sorted, because this is a search tree". The verdict is now derived from the output, so it's right on all four orders. Pruning the letter tree to a BST gives "sorted"; adding J under 80 gives "not sorted". |
| M-2 test-pyramid "nothing is broken" | **fixed** (e24739c) | live, full matrix | Tested every bug type with its home layer at 0 and at non-zero, on both shapes, across flaky and flake-free runs. A bug that escapes says "shipped" in both the caption and Last run (`--bad`). A caught bug says "Caught by a unit/integration/E2E test" and is never called shipped. "Nothing is broken" appears only with no bug planted. The all-zero suite is a separate issue (N-7). |
| M-3 error-handling-models `finally` stack | **fixed** (532438b, 0fbb52f) | live, all 15 option combinations | chargeCard stays on the stack through its `finally` on every success path. "returns undefined" now appears only on the empty-catch path, where it's true. The final frame pops handleRequest and main together, and its caption says so. |
| M-4 injection-attacks shell row | **partially fixed** (1cef17c) | live + real bash (evidence-D `shellcmp.txt`) | `O'Brien`, `fish & chips`, `<b>`, newline, `;`, `&&`, `\|\|`, `\|`, `>`, `>>`, `<` and backslash all match bash. Command substitution and expansions still read as safe: see N-1. |
| M-5 hashing-encryption lanes at 390 | **fixed** (d6e7d3a) | live, every frame at 390/768/1440 | Nothing leaves `.he-scene`. At 390 the scene is 680px wide and scrolls inside the stage, and the page stays 390. |

### Per-lesson minors

| # | Lesson | Status | Note (evidence in `SP\recheck\evidence-<shard>\`) |
|---|---|---|---|
| 1 | twos-complement | fixed (live) | The adder ends at x=321 in a stage ending at 373. |
| 2 | twos-complement | fixed | The key idea now says C signed overflow is UB. |
| 3 | base64-encodings | fixed (live) | The `>>>?` preset shows `Pj4+Pw==` vs `Pj4-Pw` (node agrees). The JWT tip is now honest. |
| 4 | floating-point | **partially fixed** | 1e39 and 1e-46 now get overflow and underflow captions. **Still wrong:** 1e400, -1e400, 1e-400 and `Infinity` say "fits exactly: it's a sum of powers of two", because `storeOutcome()` (model.ts:139) sees the value after `Number()` has already made it ±Infinity or 0. `-0` gets the same "sum of powers of two" line. Evidence-A `a2.json`, `fp-1e-400.png`. |
| 5 | floating-point | fixed (live) | The EPSILON caveat row is on screen. |
| 6 | char-encoding | fixed (live) | Flags are explained. That fix introduced N-2. |
| 7 | memory-hierarchy | fixed | "3 to 5× per step inside the chip, then a 500× cliff" matches LEVELS. |
| 8 | memory-hierarchy | fixed (live) | One `--info` bar colour; watch text matches. |
| 9 | sets-functions | fixed (live) | With no arrows, the checks show "–". |
| 10 | sets-functions | fixed (live) | The sets toggle has its own captions. |
| 11 | sets-functions | fixed | The text now says injective is enough; the title is "Sets & Functions". |
| 12 | error-handling-models | fixed (live) | "returns err('card expired')". |
| 13 | functional-programming | fixed (live) | |
| 14 | functional-programming | fixed (live) | Both reversals are marked "not ranked". |
| 15 | debugger-tools | fixed (source) | Chrome blue/orange/pink, VS Code red. |
| 16 | debugger-tools | fixed (live) | `constructor`, `__proto__`, `toString` and `.map` say "not supported". |
| 17 | debugger-tools | **partially fixed** | The Step out caption now says real debuggers return to the call line, but key idea 4 (`index.tsx:29`) still says it "pauses on the line after the call site". |
| 18 | command-line | fixed (live) | The `total` line appears, and presets reset the files. |
| 19 | command-line | fixed (live) | |
| 20 | command-line | fixed (live) | `u+s`/`4755` give "real chmod accepts it; not modelled". |
| 21 | oop-fundamentals | fixed (live) | |
| 22 | oop-fundamentals | fixed (live) | |
| 23 | stack-vs-heap | fixed (live, all 6 programs) | Each bug moment is narrated before its own summary frame. |
| 24 | prefix-sums | fixed (live) | |
| 25 | sliding-window | fixed (live) | "Only 2 numbers, so the window uses k = 2." |
| 26 | binary-search | fixed (live) | Linear is green when it wins. |
| 27 | tree-traversals / graph-representations | fixed (live) | Tree nodes are real buttons, named "Add a child under 80" / "Remove leaf 35", operable with Space and Enter, with a visible ring. Graph has a keyboard "Add a node". The graph still needs 78 Tabs to reach the quiz; that was noted as "long, not a trap" and still is. The keyboard fix introduced N-5 and N-C7. |
| 28 | graph-representations | fixed (live) | |
| 29 | two-pointers | fixed (live) | Strict integers; one-letter words accepted. |
| 30 | big-o, stack-queue, recursion, sorting | fixed | watch text matches the render. |
| 31 | arrays-linked-lists, big-o, two-pointers | fixed | |
| 32 | accessibility | fixed (live) | "checkbox, checked". |
| 33 | accessibility | fixed (live) | |
| 34 | browser-storage | fixed (live) | |
| 35 | browser-storage | fixed (live) | |
| 36 | security-principles | fixed (live) | |
| 37 | security-principles | fixed (caption live, path from source) | |
| 38 | dom-events | fixed (live) | At 768 the nodes span 52-716 inside a 24-744 stage. |
| 39 | css-layout | fixed (live) | |
| 40 | css-layout | fixed (live) | A real 600px container with 158px free at 390. |
| 41 | css-layout | fixed (source) | |
| 42 | css-layout | fixed (live) | "the box is 120px wide". |
| 43 | ci-pipelines | fixed (live) | The cancel narration is reachable at 10/11. |
| 44 | debugging-method | fixed (live, 30 random bugs) | |
| 45 | debugging-method | fixed | |
| 46 | static-analysis-linters | fixed (live) | Swipeable with a fade. |
| 47 | branching-workflows | **partially fixed** | The flags-off summary is fixed. dev-3 went from green to `--pink` (#ff5d8f), which is almost the same as `--bad` (#ff5d6c), the conflict colour. watch now promises lane colours are never red. |
| 48 | dependency-management | fixed (live) | |
| 49 | time-and-timezones | fixed (live, NY and London, repeated and skipped times) | Copy slip in N-C1. |
| 50 | requirements-user-stories | fixed (live) | |
| 51 | git-internals | fixed (live) | Rebase reports the conflict and "a real rebase pauses". A clean rebase and a fast-forward both behave. |
| 52 | osi-tcpip-layers | fixed (source) | |
| 53 | osi-tcpip-layers | fixed (source) | |
| 54 | web-request | fixed (live) | Reused forces Cached and has no TCP phase. Caption slips in N-C3. |
| 55 | client-server | fixed (live) | |
| 56 | processes-threads | fixed (source + captions) | |
| 57 | agile-kanban | **partially fixed** | The stats do restart on a WIP change. The new caption "they only measure the new limit" is false: after no limit, then limit 1, cycle time reads 20.1, then 24.9, then 32.3 days while about 29 old cards drain. Evidence-F `ak.mjs`. |
| 58 | hashing-encryption | fixed (live) | |
| 59 | hashing-encryption | fixed (source) | |

### Cosmetic groups

All fixed, live or from source, except the following:

| Group | Status | What's left |
|---|---|---|
| big-o | partially fixed | The n selector's `role="radiogroup"` is still unnamed; the name sits on a wrapping `role="group"`. ARIA wants the name on the radiogroup. |
| arrays-linked-lists | partially fixed | After about 6 inserts the pointer arcs still bundle densely near both ends. |
| secrets-management | partially fixed | The graph is still small in a big box at 1440. At 390 the title now scrolls away (N-C12). |
| agile-kanban | partially fixed | The CFD WIP label still lags half a day (`draw.ts:159`); no commit touches it. "Usually two weeks" vs 10 days is wontfix-justified: `SPRINT_DAYS = 10` is two working weeks. |
| binary-hex | n/a | It had no cosmetic findings. |
| Home | by design | Filter chips still use `replace`, as before. |

---

## New findings

### Major

**N-1 · MAJOR · injection-attacks · the shell row calls command substitution and expansions safe (rest of M-4)**
- **Steps:** "③ Everywhere else", then type `$(whoami)` into Text. Also try `` `id` ``, `$HOME`, `~/notes.txt`, `{a,b}` or `fish (and) chips`.
- **Expected:** the shell row shows the text being run or expanded, or says this syntax isn't modelled, and counts it as broken.
- **Actual:**
  - The Pasted-in shell cell reads `arguments: ["$(whoami)"]`, styled as harmless. The headline stat counts the shell among the places the text is safe.
  - In real bash, `$(whoami)` and `` `id` `` run commands, and `$HOME`, `~` and `{a,b}` expand.
  - `fish (and) chips` is a bash syntax error but shows as 3 arguments.
  - Smaller: `x 2>y` is shown as `> y`, dropping the file descriptor.
  - The on-screen note says the model was checked against bash for "quotes, separators, redirections". The code comment admits variables and subshells are ignored, but the screen doesn't.
- **Fix:** have `parseShell` flag `$`, backtick, `~`, glob characters, `{`, `(` and `#` as "the shell interprets this (not modelled here)" and count the row as broken.
- **Evidence:** `SP\recheck\evidence-D\inj-custom-0.png` (`-1`, `-2`), `shellcmp.txt`. The bash runs used stubbed `open`/`whoami` functions.

### Minor

**N-2 · MINOR · char-encoding · the flag caption sticks after the flag is gone (regression from 7ad808e)**
- **Steps:** click "🇯🇵 flag", then type `abc` or click "café".
- **Actual:** "A flag is two regional-indicator code points, the letters J and P…" stays on screen.
- **Cause:** `load()` (Stage.tsx:47-56) sets that caption but never clears it.
- **Evidence:** evidence-A `ce-stale-abc.png`.

**N-3 · MINOR · ci-pipelines · the YAML is cut off at 390px with no affordance (regression from 8052c76)**
- **Steps:** 390x844, any scene.
- **Actual:** `.ci-yaml ol` is 506px wide in a 324px box. It scrolls, but with no fade, no hint and no keyboard focus, so about 180px of every `needs:` line is hidden. Those lines are the dependency graph the lesson teaches.
- **Note:** my crawler flags it on every scene; it didn't before the fix.
- **Evidence:** evidence-E `ci-390-yaml.png`.

**N-4 · MINOR (accessibility) · code-review · unticked checklist chips are unreadable (regression from 9cf4332)**
- **Actual:** the dim chip text (#3a4152) measures 1.77:1 on `--panel` and 1.65:1 on `--panel-2`. WCAG AA needs 4.5:1.
- **Note:** the "Nit" severity chip already used the same dim tone. Dim-toned chips deserve a tier-wide look.
- **Evidence:** evidence-E `cr-size-one.png`.

**N-5 · MINOR (accessibility) · tree-traversals · keyboard removal throws focus to `<body>`**
- **Steps:** "Remove a leaf", Tab to "Remove leaf 35", Enter.
- **Actual:** `document.activeElement` is BODY on all four orders.
- **Expected:** focus moves to the parent node or the tree.
- **Note:** trees-bst's nodes keep focus after Enter (checked), so the problem is specific to removal.
- **Evidence:** evidence-C `tt.json`.

**N-6 · MINOR · accessibility · the "fixed" status message uses the unreliable live-region pattern**
- **Actual:** with the fix on, `<p role="status">` is mounted at the same moment as its text. Screen readers don't reliably announce a polite region that's inserted already full.
- **Why it matters:** the lesson's simulated reader says it was announced, so learners copying it would ship the bug.
- **Fix:** keep the region mounted and change only its text.
- **Verified:** from source and AT knowledge only; not on a real screen reader.

**N-7 · MINOR · test-pyramid · an empty suite with a planted bug says nothing (pre-existing; missed last round)**
- **Steps:** all three sliders to 0, plant Logic bug, Run.
- **Actual:** the caption stays on "Running 0 tests…" for good, Last run shows "–", and nothing says the bug shipped. This is the same silence M-2 fixed, at the edge.
- **Also:** "1 flaky failure, 1 of them E2E" reads oddly.

**N-8 · MINOR · tier-wide quiz · picking the longest option still beats chance**
- **Actual:**
  - Every question is inside the 0.75-1.35 band, but the correct option is strictly the longest in 81 of 211 questions (38%; chance is 25%).
  - It's always the longest in ci-pipelines, oop-fundamentals and secrets-management, and in 3 of 4 in command-line, data-formats, debugger-tools, fetch-decode-execute, osi-tcpip-layers, stack-vs-heap and time-and-timezones.
  - The authored position is now heavily first (122 of 211). That's harmless only because the shuffle happens at render.
- **Evidence:** `SP\recheck\quiz-t1.json` (dumped from the live modules), and the stats one-liner in this session's notes.

**N-9 · MINOR · sorting · the race's closing caption is false on two inputs (pre-existing; the old crawler's 90-step cap never reached it)**
- **Steps:** Race all 5, Nearly sorted, step to 194/194.
- **Actual:** "O(n²) sorts compare roughly every pair (190 for selection). The best did 20. That gap explodes as n grows." The best was Insertion, itself O(n²), and Bubble did 37. On Reversed, Quick also did 190. The caption is only true on Random and Few unique.
- **Also:** a swap costs one tick, counted as one "write", while Merge pays a tick per element copy. That tilts Quick vs Merge.
- **Evidence:** evidence-C `sorting.json`.

The push-protection residue (N-10, minor) is under its own section below.

### Cosmetic

| # | Lesson | Item |
|---|---|---|
| C1 | time-and-timezones | NY 2026-11-01 01:30: "But which 01:30? This stored moment 1." A word is missing. |
| C2 | debugging-method, requirements-user-stories | Doc comments orphaned by the fixes: `showValue`'s comment sits on `cents`, `MATERIAL`'s comment sits on `SURPRISE_STAGES`, and `testsFor` has two doc comments. |
| C3 | web-request | Reused path: "over 1 round trips". Frame 1 says "the browser has no idea where that is yet" despite the pooled connection. |
| C4 | agile-kanban | The Review band went from amber to `--pink`, which reads as `--bad` "blocked" in the legend. |
| C5 | hashing-encryption | ⑤ wrong pick says "Not hash (sha-256)": the name is lowercased (`Picker.tsx:27`). |
| C6 | two-pointers | Palindrome "x": "0 comparisons for 1 letters". |
| C7 | tree-traversals | The focus ring is violet, which the legend uses for "on the call stack". |
| C8 | prefix-sums | The difference legend says "+ where a range starts / − past its end", but the preset's −3 update shows the opposite signs. |
| C9 | tree-traversals | Editing the numeric BST adds letter labels. Mixed output is then judged by string order (e.g. "+ ×: sorted"). |
| C10 | dom-events | Tree nodes tab bottom-up (span → … → div.card), the reverse of the drawing. |
| C11 | browser-storage | The shown XSS script uses top-level `await`, a SyntaxError in a classic injected `<script>`. The caption reads "the credentials the session cookie and…". |
| C12 | secrets-management | At 390, "② Fix it": the graph auto-scrolls to the newest commit (`scrollLeft` 90 of 412/322), so the title "history after the fix" scrolls with it and starts at x=-44. Move the title out of the scroller. (Found independently by my crawler and by reviewer D.) |
| C13 | debugger-tools | Evaluating `Object` gives "ReferenceError: Object is not defined"; it should say "not supported". Same for `Array` and `JSON` (`expr.ts:144`). |
| C14 | static-analysis-linters | The swipe hint covers the "loop skips the first order" row for 5 s, and it calls the table a "diagram". |
| C15 | docs | CLAUDE.md says "Don't add a global MotionConfig", but `main.tsx` now has one, deliberately and correctly. Update the gotcha. |
| C16 | floating-point / CLAUDE.md | `-0` says "fits exactly: it's a sum of powers of two". Also, the new colour table says `--hi` is not for a state, but every bit lesson uses it for bit = 1. |

### Regression sweep: what came up clean

- **Tier 1 (62 lessons), crawler:**
  - No console errors, crashes or reduced-motion problems.
  - No page overflow at 390 or 768.
  - The only new element-overflow flags are N-3 and C12. twos-complement, css-layout, hashing-encryption and static-analysis-linters dropped off the overflow list.
  - Tab reaches the quiz everywhere except graph-representations (78 Tabs, unchanged). Because pickers are now one tab stop, most lessons need half the Tabs.
  - Space on Play toggles once.
- **The other 37 lessons:**
  - The crawler and both smoke runs are clean.
  - Three crawler flags were false positives:
    - "null" in event-loop is the code `await null`.
    - event-loop's `.el-dot` is a translated full-width track; untouched since `fbf4544`.
    - trees-bst's `g.tree-node` buttons have a visible 3.5px ring and keep focus after Enter; the crawler doesn't read SVG strokes.
  - Quiz shuffling, the radio-group keys, titles and focus, and ChipButton `aria-pressed` are shared. They were verified on Tier 1 lessons, and the crawl shows no fallout in the other tiers.
- **Recorder `close()`/`amendLast()`:** only Tier 1 lessons use them (closures-scope, error-handling-models, oop-fundamentals, stack-vs-heap, value-vs-reference). Diffing old and new captions scene by scene shows only restored narration: nothing dropped, nothing duplicated. circuit-breakers' `finish()` is its own sim method, not the recorder.
- **`parseIntegers` decimal-only:** `0x10`, `1e1`, `5.5`, `+5` and empty are refused with a message in two-pointers and sliding-window, and the previous data is kept.
- **Line endings:** the index is 100% LF (785 text files plus the svg). 53 working-tree files in this checkout still hold CRLF or mixed endings because it was never re-checked out. That's harmless, since `eol=lf` normalises on add, and `git status` is clean.

---

## Quiz review (all 211 Tier 1 questions)

**Coverage:** every question was read against its lesson by one of six reviewers. Anything numeric was recomputed, code-output questions were run in node, the SQL ones in `node:sqlite`, and the time-zone ones through Intl. Questions per shard: A 43, B 38, C 36, D 30, E 33, F 31.

**No marked answer is wrong.** No option refers to another by position in a way that breaks the meaning, with one partial exception (er-data-modeling Q1 below). Every `why` matches its answer.

### Minor: fix these (10)

| Lesson · Q | Problem | Suggested fix |
|---|---|---|
| memory-hierarchy Q3 | "Which is usually slower?" is a two-way comparison padded to four options. "They take the same time" has no pair to refer to after shuffling, and "Reading L3 cache" isn't part of the comparison. | Ask "Which is slowest?", or go back to a real 2-way question. |
| logs-exponentials Q4 | The `why` says "1,024 = 2¹⁰ fits in 10 bits exactly". The value 1,024 needs 11 bits; it's 1,024 *distinct IDs* (0-1023) that fit in 10. This is the off-by-one the question is testing. | "1,024 IDs (0-1023) fit in 10 bits; the 1,025th needs an 11th." |
| agile-kanban Q1 | The answer is "Same throughput, but each card takes about 2× longer". But try-this #1 says throughput *falls*, the `why` says switching "often lowers throughput", and the sim shows 1.34 → 0.82/day. The quiz rewards a claim the lesson's own sim disproves. | "Throughput stays the same or drops, and each card takes longer." |
| recursion Q1 | The distractor "The return statement" is defensible: the base case *is* a return. | "Any return statement", or "Returning a value". |
| regex-basics Q3 | The distractor "Remove the ^" also makes the regex find line 3. | Ask for a fix that matches "only lines that *start* with error". |
| error-handling-models Q3 | The `why` says result types are "hard to ignore". In plain JS nothing forces a caller to check `res.ok`, and "callers must pass them on" overstates it. | Soften both. |
| static-analysis-linters Q3 | "Only layout and whitespace" overstates it: Prettier also normalises quotes, semicolons, parentheses and commas. The `why` says "the tokens stay the same", which contradicts the lesson's own new formatter note. | "Only how the code is written out, never what it does." |
| branching-workflows Q3 | The distractor "Comment the unfinished code out first" does technically merge the feature without users seeing it, and the `why` never says why it's wrong. | Add "…while still being integrated and tested", or cover it in the `why`. |
| er-data-modeling Q1 | "Either of those two columns would work" depends on authored order; after shuffling it can be shown first. | Name the two columns in the option. |
| injection-attacks Q3 | The distractor "Escape the column name before using it" isn't unambiguously wrong: quoting an identifier with the database's own function (`quote_ident`, `format('%I')`) is a real, safe technique. | "Escape it like a string value", or "Strip quotes from it". |

### Cosmetic (11)

| Lesson · Q | Item |
|---|---|
| propositional-logic Q2 | The `why` says "the other two options", but there are three; p ∧ q goes unexplained. |
| twos-complement Q2 | Both "Always…" options are wrong and the only hedged option is right. |
| reading-codebases Q2 | All three distractors use absolute words ("never", "only", "only"). |
| requirements-user-stories Q1 | Same: "Only…", "Only…", "Nobody…" vs "The whole team…". |
| dependency-management Q4 | "Nothing" is only exact because the tree already has the newest 1.x. |
| http-basics Q1 | The `why` says 403 means "the server knows who you are"; RFC 9110 allows a 403 without credentials. |
| http-basics Q2 | "Neither of them" / "Both, always": the word "always" flags a distractor. |
| git-internals Q1 | "Snapshots, not diffs" deserves a nod to packfile deltas. |
| oop-fundamentals Q3 | "now 5 × 2" assumes `new Square(2)`, which the question never states. |
| debugger-tools Q2 | Only the correct option repeats the question's `id === 4217`. |
| stack-vs-heap Q2 | The answer echoes "stack overflow" from the question. |

---

## Push-protection check

**HEAD, as asked: src, tests, scripts and docs.** I grepped all 786 tracked files for AWS (`AKIA`/`ASIA` + 16), Stripe `sk_`/`rk_`, GitHub personal/OAuth token prefixes, Slack token prefixes, Google `AIza`, GitLab, npm, SendGrid, private-key blocks, JWTs, URLs with credentials, and generic `secret/token/password = "<16+ chars>"` assignments.
- **src/, tests, scripts:** clean. secrets-management now builds its fake keys at runtime with `fakeSecret('sk', '_live_', …)`, so no credential-shaped literal is in source. The learner still sees the same strings, and a test runs the lesson's own scanner over its source. The other matches are a regex source and the SHA-256 of "password", both harmless.
- **dist/** is git-ignored.
- **docs/:** one hit. `docs/qa-tier1-report.md:487` quotes the old Stripe-shaped key in full. This recheck deliberately doesn't repeat it.

**History: this is the real risk.** `origin/main` is at `8e6863b`, and **all 225 local commits are unpushed**. A push sends every one of them, and GitHub push protection scans each commit's diff, not just the tip. Lines added in the unpushed range still contain:

| Literal (shape) | Commits | Likely blocked? |
|---|---|---|
| `AKIA` + `EXAMPLE000000000` (exact AWS access-key-ID shape) | 6a2eacc | Probably not by GitHub: AWS push protection keys on an ID + secret pair, and this one says EXAMPLE. Other scanners (gitleaks, trufflehog) will flag it. |
| `sk_live_` + 22 chars, `sk_live_` + 21 chars (Stripe live-key shape) | 6a2eacc, fbf4544 (the QA report) | Probably not: real Stripe secret keys have 24+ characters after the prefix. Unconfirmed. |
| `sk_test_` + 21 chars | 6a2eacc | Test keys aren't push-blocked. |
| An RSA private-key PEM header line (header only, no body) | 6a2eacc | Unlikely: the pattern needs a full key block. |
| `ghp_` + 36 chars | — | Never a literal: built with `.repeat()` in a template expression, so it's safe. |

The other high-entropy hits in the range are `package-lock.json` sha512 integrity hashes, which are harmless.

**Assessment:** I can't prove GitHub won't block without actually pushing, and I didn't push. My judgement is that a block is unlikely but possible. If it happens, GitHub's block page offers a "used in tests / false positive" bypass per secret, which is the cheap way out. The clean way is to rewrite the unpushed history before the first push (for example, squash or rebase `6a2eacc..HEAD`, or `git filter-repo --replace-text`). That's destructive and the owner's call. Either way, change `docs/qa-tier1-report.md:487` to describe the key instead of quoting it. **N-10 · MINOR.**

---

## What could not be tested

- **Real assistive technology:** no NVDA, JAWS or VoiceOver. N-6 (live region) and the radio, title and focus behaviour were checked in the DOM only.
- **Other browsers and touch:** headless Chromium (Edge) only. No Firefox, Safari, real phones or touch swiping. The new swipe scrollers (static-analysis, css-layout, hashing, secrets graph) were checked by measurement, not by finger.
- **768px:** checked by overflow measurement on every scene; only a sample of screenshots was eyeballed.
- **GitHub push protection:** no push was made, so the history assessment above is a judgement, not a result.
- **Option combinations:** explored one dimension at a time, except error-handling-models (all 15 pairs) and test-pyramid (the full bug × layer matrix).
- **The other 37 lessons:** crawled and smoke-tested for breakage only. Their content and quizzes were not re-reviewed; that's outside Tier 1. Their quizzes are shuffled now too, but their option lengths were never rebalanced.
- **No pre-fix baseline crawl for the other 37 lessons,** so "no regression" there means "nothing broken now", not "identical to before".
