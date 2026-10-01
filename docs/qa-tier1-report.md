# QA sign-off: Tier 1 · Foundations

Reviewer: Sentry (QA). Tree: `main` at `8826f2e`, clean. Date: 2026-09-30.
Scope: all 62 tier-1 entries in `src/core/curriculum.ts` (48 second-pass lessons plus 14 older ones), and the home page's Tier 1 section.

## Summary and verdict

**Verdict: not shippable as-is. Ship after fixing the 8 majors below.** There are no blockers. Every lesson loads and plays, with no console errors at 1440, 768 or 390px or under reduced motion. No page scrolls sideways. Tab reaches the quiz on every lesson with a visible focus ring.

The domain content is mostly excellent. Reviewers recomputed hundreds of values independently and they held up, including:
- the IEEE-754 gaps
- DST transitions in five emulated time zones
- semver ranges, against real node-semver over 1,584 cases
- SHA-256 and AES output
- SQL join rows
- CORS and cookie rules
- WCAG contrast ratios

What stops sign-off:

1. **Four lessons say something false on screen at a moment they invite the learner to reach:**
   - **tree-traversals:** the in-order verdict is wrong on any edited BST.
   - **test-pyramid:** says "nothing is broken" while a bug is planted.
   - **error-handling-models:** the call stack is wrong on every success path that runs `finally`.
   - **injection-attacks:** the shell row teaches that `&` and `'` are harmless.
2. **One lesson can't be read on a phone:** hashing-encryption's symmetric and asymmetric lanes are clipped at 390px.
3. **The quiz can be gamed tier-wide:** 74% of correct answers are the second option, and 24 lessons have every answer in that position.
4. **The 14 older lessons fail the tier definition of done (§4.2 items 4-5):** none has a unit test, and most don't say on screen what is simulated.

Counts: **0 blocker · 8 major (3 tier-wide, 5 in single lessons) · 64 minor (5 tier-wide, 59 in single lessons) · 42 cosmetic (4 tier-wide, plus 38 per-lesson groups, each of which may hold several small items).**

### How this review was done

- **Independent crawler** (`scratchpad/crawl.mjs`, not the repo smoke test). For every lesson it:
  - loaded the page fresh with a seeded `Math.random`;
  - clicked every option of every Segmented control, one dimension at a time, and stepped the player to the end of each, recording every caption;
  - clicked every lesson button;
  - fed every text input 10 hostile values (empty, `zzz`, 23 digits, `-1`, `1e400`, whitespace, emoji, `0`, `1,2,,3`, markup);
  - pressed Home and End on every slider;
  - played under `prefers-reduced-motion`;
  - measured page and element overflow at 390x844 and 768x1024 for every scene option;
  - pressed real Tab keys (up to 70) recording focus visibility and accessible names;
  - pressed Space on a focused Play button.
- **Six parallel reviewers.** Each read the source, the spec and AC-0 for its shard, recomputed the on-screen claims, looked at the screenshots, and ran targeted keyboard and edge-case probes.
- **Spot-checks.** I reconfirmed the following myself against source or by running them:
  - every major
  - the ChipButton, Segmented and document.title findings
  - the base64url, sets-functions and memory-hierarchy claims
- **Tier-wide passes:**
  - quiz answer distribution
  - DOM structure counts against AC-0
  - a legend colour/label audit (334 pairs)
  - the home page (filters, counts, progress, corrupt storage)
  - navigation (back/forward, 404, prev/next).

Evidence root: `C:\Users\Hawai\AppData\Local\Temp\claude\K--Programming-personalProjects\60e952a3-6f6e-4d52-b227-6526f33e5564\scratchpad\` (written below as `SP\`).
- `SP\out\<id>\`: crawler screenshots plus `result.json`
- `SP\summary-all.txt`: the anomaly summary
- `SP\evidence-A`…`evidence-F\`: per-shard evidence
- `SP\home-out\`: home page and navigation evidence

---

## Findings

### Tier-wide

**T-1 · MAJOR · all lessons · the quiz can be passed by always picking the second option**
- **Steps:** count the `answer:` indices across the 62 tier-1 lessons (`grep -rhoE "answer: [0-9]" src/lessons/<id>/`).
- **Expected:** correct answers spread across positions, or options shuffled at render.
- **Actual:**
  - Of 211 correct answers, 157 are index 1, 43 index 2, 10 index 0 and 1 index 3.
  - 24 lessons have every answer at index 1: sorting, client-server, git-internals, two-pointers, sliding-window, binary-hex, base64-encodings, fetch-decode-execute, closures-scope, oop-fundamentals, functional-programming, error-handling-models, regex-basics, data-formats, branching-workflows, debugger-tools, dependency-management, time-and-timezones, reading-codebases, requirements-user-stories, agile-kanban, dom-events, responsive-design, accessibility.
  - `Quiz.tsx` doesn't shuffle, and wrong picks cost nothing, so "click B everywhere" marks a lesson Learned.
  - Shard E also found the correct option is usually the longest.
- **Fix:** shuffle options at render (seeded per lesson, `core/random` already has `shuffle`), or rebalance the data.

**T-2 · MAJOR · the 14 older lessons · no correctness tests (DoD §4.2 items 4-5, AC-0 #8)**
- **Lessons:** big-o, binary-search, stack-queue, sorting, arrays-linked-lists, recursion, web-request, ip-ports, http-basics, client-server, sql-basics, processes-threads, hashing-encryption, git-internals.
- **Steps:** `ls src/lessons/<id>/*.test.ts`, and grep every test file for `lessons/<id>/`.
- **Expected:** the tests the tier DoD requires.
- **Actual:** none of the 14 has a test file, and no test anywhere refers to them.
- **Pure logic sits in `.tsx` files:**
  - `http-basics/server.tsx`
  - `sql-basics/queries.tsx`
  - `processes-threads/scenarios.tsx`
  - `arrays-linked-lists/model.tsx`, which has JSX captions inside the model
  - frame builders inside `Stage.tsx` for web-request, ip-ports and client-server
- **Also:** big-o hand-rolls `<sup>`, which CLAUDE.md forbids.
- **What reviewers checked by hand:** the on-screen numbers. They're right, but nothing guards them.

**T-3 · MAJOR · older lessons · simulations aren't disclosed on screen (AC-0 #5)**
- **Steps:** grep the older lesson folders for illustrative, simulated, scripted, simplified, toy or fictional. Nothing comes back for the shard-F set.
- **web-request:** every latency is invented, yet it reports "Page up in 362 ms". Cold lookups always walk root → TLD → authoritative.
- **git-internals:** the 7-hex IDs come from a toy hash (`hexHash` in `repo.ts`), not SHA-1, but the panel says "Each object's name is the hash of its content". `git hash-object` gives different values.
- **hashing-encryption lane ④:** shows a hard-coded ciphertext "8f1c…e4a9", right next to lane ③'s honest "real encryption, done in your browser".
- **http-basics:** a fake in-memory API that lets anyone PUT or DELETE, with no note saying so.
- **client-server, processes-threads, ip-ports:** scripted scenes, none labelled.
- **recursion:** overflows at 11 visual frames; the roughly 10,000-frame real limit is only in a code comment.
- **sorting:**
  - Merge is animated as an in-place rotation while the note says "O(n) extra memory".
  - The race is ranked by frame count, which includes narration frames. That gives Quick sort 5th behind Selection on "nearly sorted".
- **Evidence:** `SP\evidence-F\`, `SP\evidence-C\`.

**T-4 · MINOR · shared `Segmented` and `Transport` · arrow keys on a focused option drive the player**
- **Steps:** `npm run shot -- /lesson/stack-vs-heap x "--press-on=.lesson-main .segmented button" --press=ArrowRight,ArrowRight`.
- **Expected:** a `role="radiogroup"` moves the selection with the arrow keys and acts as a single tab stop.
- **Actual:**
  - The player goes from 1/7 to 3/7 and the selection stays on "JavaScript (managed)".
  - Every option is its own tab stop.
  - `Transport`'s speed group is `role="radiogroup"` with plain buttons: no `role="radio"`, no `aria-checked` (`Transport.tsx:65`). The current speed isn't exposed to assistive technology.
- **Evidence:** `SP\home-out\svh-arrow.png`. Affects every lesson with a picker and a player.

**T-5 · MINOR · shared `ChipButton` · the selected state is almost invisible and looks the same as hover**
- `kit.css:57-58` styles `.chip-button:hover` and `.chip-button.is-on` with one rule, an 18% tint against 12% at rest.
- A selected device, attack or sample chip can't be told from its neighbours, and hovering any chip makes it look selected.
- **Seen in:** responsive-design, security-principles, accessibility and injection-attacks. 28 lessons use `ChipButton`.
- **Evidence:** `SP\evidence-D\rd-chips.png`.

**T-6 · MINOR · app shell · every lesson's page title is "Kinetic" and focus stays on `<body>` after navigation**
- **Steps:** open any lesson and read `document.title`; follow a card link and read `document.activeElement`.
- **Expected:** a per-page title (WCAG 2.4.2), and a route change a screen-reader user can perceive.
- **Actual:**
  - `document.title === "Kinetic"` on all 62 lessons; nothing in `src/` sets it.
  - Focus stays on BODY.
  - Tabs, history entries and bookmarks are indistinguishable.
- **Evidence:** `SP\structure.json`, `SP\nav.mjs` output.

**T-7 · MINOR · AC-0 #3 count deviations**
- er-data-modeling has 5 keyIdeas (AC says 3-4).
- debugger-tools has 6 tryThis prompts (AC says 3-5).
- **Evidence:** `SP\structure.json`.

**T-8 · MINOR · shared `Slider` · no `aria-valuetext`**
- agile-kanban's WIP slider at "no limit" is announced as "11". Other lessons with labelled ends may do the same.

**T-9 · COSMETIC · colour meanings drift between lessons**
- From the legend audit (`SP\legends.txt`), mostly disciplined, but:
  - **Requests:** http-basics paints them violet; cors-same-origin and browser-storage use `--info` as AC-0 says.
  - **bit = 1:** hashing-encryption uses `--info`; binary-hex, twos-complement and logs-exponentials use `--hi`.
  - **floating-point:** the sign bit is `--bad`.
  - **Status colours:** http-basics colours 4xx yellow, while osi, client-server and ip-ports use red for failures.
  - **Waiting call frames:** dimmed in recursion, violet in tree-traversals, though tree-traversals points learners to recursion.
  - **Blue (`--info`) means four things:** a heap block, a function object, a returning frame and the selected frame.
  - **Green stops meaning "done" where colours are categories:** test-pyramid lanes, branching-workflows' dev-3 lane, code-review's unticked checklist, and css-layout's devtools box-model palette (defensible there).
- Worth one tier-wide rule.

**T-10 · COSMETIC · JS-driven motion ignores reduced motion**
- The app's reduced-motion CSS only stops CSS animations.
- Under `prefers-reduced-motion` the motion-driven quiz shake and scale (`Quiz.tsx`), the lesson-header entrance and lesson shakes (stack-vs-heap, oop-fundamentals) still play.
- They're short, but they're still motion.

**T-11 · COSMETIC · raw Markdown backticks render literally**
- twos-complement useCase ("relies on \`x | 0\`"), propositional-logic quiz Q4, plus command-line and static-analysis-linters index text.
- time-and-timezones tryThis #5 shows literal `\"` escapes.

**T-12 · COSMETIC · home · two filter chips are both called "Systems"**
- The family label "Systems" and the arch track chip "▦ Systems" sit next to each other and filter different sets (11 vs 1 tier-1 cards).

### Per-lesson majors

**M-1 · MAJOR · tree-traversals · the in-order verdict is false on any edited BST**
- **Steps:** Tree = BST, Order = In-order, "Click a node to" = Remove a leaf, click 35, step to the end.
- **Expected:** "sorted", because the tree is still a BST.
- **Actual:** "20 30 40 50 60 70 80 is **not** sorted: in-order only gives sorted output on a binary search tree."
- **Cause:** `verdict()` in `frames.tsx:41-42` decides on `preset === 'bst'`, not on the output; any edit makes the preset `custom`. The caption is wrong exactly on the lesson's main misconception.
- **Evidence:** `SP\evidence-C\tree-traversals-bst-removed-leaf-inorder.png`.

**M-2 · MAJOR · test-pyramid · "nothing is broken" while a planted bug ships**
- **Steps:** Plant a bug = Logic bug, Unit tests → 0, Run the suite. This is what Try-this #3 tells the learner to do.
- **Expected:** the caption says the bug slipped through.
- **Actual:** "Red, but nothing is broken: 1 flaky failure…". The no-flake path reads "All green… even though the code never changes".
- **Cause:** `finishedCaption()` (`Stage.tsx:160`) only reads `s.failed` and `s.flaky`, never the planted bug. The "Last run" stat has the same blind spot.
- **Evidence:** `SP\evidence-E\tp-logic-nounit.png`. The all-green variant is confirmed from source; no seed produced a flake-free run.

**M-3 · MAJOR · error-handling-models · the call stack is wrong on every success path that runs `finally`**
- **Steps:** Exceptions mode, "Make this fail" = Nothing fails, "Catch at the boundary", pause, step through 8-10 of 11.
- **Expected:** main → handleRequest → chargeCard, with chargeCard in its `finally`.
- **Actual:**
  - At 8/11 the stack shows "2 deep" with `finally` on handleRequest.
  - At 9/11 the caption says chargeCard "returns undefined" because it "reaches its end without a return statement", contradicting frame 7 and line 6 (`return callBank(order)`).
  - At 10/11 handleRequest is missing.
  - The same happens in "Rethrow with cause" and "No catch at all".
- **Cause:** `mergedLeaves()` in `frames.tsx` only merges a `leave` that directly follows its `return`.
- **Evidence:** `SP\evidence-B\ehm-nothing-fails-f8.png`, `-f9.png`, `-f10.png`.

**M-4 · MAJOR · injection-attacks · the shell context is modelled as word-splitting, so it teaches command injection wrong**
- **Steps:** "③ Everywhere else", click each sample, read the shell row.
- **Expected:** a shell treats `'`, `&`, `;`, `|`, `<`, `>` and newline as syntax, or the screen says it's simplified.
- **Actual:**
  - `O'Brien` → `["O'Brien"]`, labelled "worked this time". A real shell fails with an unterminated quote.
  - `fish & chips` → three harmless args. A real shell runs `chips` as a second command, which is the injection.
  - `<b>` is shown as text; a real shell reads it as redirections.
  - A newline is shown as an argument; a real shell starts a second command.
- **Disclosure:** only "Simulated contexts", which doesn't cover it.
- **Code:** `shellWords` and the shell entry of `contextViews` in `contexts.ts`. Shell is the most dangerous of the five contexts. The payload-free re-scope can be kept; the row just has to stop calling these strings safe.
- **Evidence:** `SP\evidence-D\inj-contexts-obrien.png`.

**M-5 · MAJOR · hashing-encryption · lanes ③ Symmetric and ④ Asymmetric are clipped at 390px**
- **Steps:** 390x844, Lane ③ or ④, step to frames 3-8.
- **Expected:** the message card and key chips stay inside the stage, or the stage scrolls (`minWidth`).
- **Actual:**
  - The stage spans x = 17-373, but the card lands at -52..186, 203..441 and -89..223.
  - The Alice and Bob blocks span -28..162 and 228..418.
  - The ciphertext and lock can't be read.
  - These frames have no `minWidth` and are positioned by percentage. Smoke only shoots the default lane and frame, so it misses them.
- **Evidence:** `SP\evidence-F\he390-Symmetric-f3.png`, `he390-Asymmetric-f4.png`, `SP\out\hashing-encryption\w390-g0o2.png`.

### Per-lesson minors

Format: lesson · steps → actual (expected) · evidence.

**Bits, logic & maths**
1. **twos-complement:** 390px, Mode = Add two numbers → the `.tc-columns` box runs to x=392 in a stage ending at 373, clipping about 19px including the last bit column (expected: it fits or scrolls). `SP\evidence-A\tc-add-390.png`.
2. **twos-complement:** a key idea says overflow "doesn't throw in C…", implying C signed overflow wraps. The stage itself (correctly) says it's UB (`Stage.tsx:256`), so the two contradict.
3. **base64-encodings:** "JWT header" preset + base64url (the tryThis) → nothing changes. The 27-byte header has no `+ / =`, so base64 and base64url are identical (verified in node). The prompt also implies base64url produces `eyJ`.
4. **floating-point:** type `1e39`, "Store as float32" → "snaps it to the nearest value… Infinity, off by Infinity. Not random: the nearest binary fraction." It's overflow; that caption shouldn't fire.
5. **floating-point:** the float64 panel offers `Math.abs(a-b) < Number.EPSILON` as the fix with no caveat. It fails for magnitudes far from 1 (`1000.1+1000.2` vs `2000.3`).
6. **char-encoding:** the "🇯🇵 flag" preset renders as the letters "JP" on Windows (no flag glyphs), on the card, the decoded text and the chip. Nothing explains it. `SP\evidence-A\ceflag.png`.
7. **memory-hierarchy:** a key idea says "each level is roughly 10× to 1000× slower than the one above"; the lesson's own data gives 3.3×, 4× and 5× for the upper levels (`index.tsx:26`, `model.ts` LEVELS).
8. **memory-hierarchy:** the per-level bars use `categorical(i)`. RAM is red (reads as `--bad`), L2 green (reads as `--ok`), and the amber L3 and datacenter bars match the `--hi` travelling dot, hiding it. The legend shows one blue swatch.
9. **sets-functions:** Functions → Draw your own, no arrows → the injective row shows ✗, though nothing collides (`model.ts:111` ANDs it with `isFunction`). `SP\evidence-A\sf-draw.png`.
10. **sets-functions:** Sets = "A, B, C" → the caption still says "Two sets of users…" (stale). `SP\out\sets-functions\desk-g2o1-end.png`.
11. **sets-functions:** a useCase claims a mapping is reversible "only if it is a bijection". Injective is enough, and the UTF-8 and base64 lessons depend on that. The title promises "Relations", which the lesson never covers.

**Memory, code flow & tools**
12. **error-handling-models:** Result type, callBank fails, frame 6 → "callBank checks the result: it's an Err". It creates the Err; there's nothing to check.
13. **functional-programming:** Pure functions, set the discount to 25% before the first call → caption "Both return 90" while the log shows `→ 75` in green. `SP\evidence-B\fp-pure25.png`.
14. **functional-programming:** Mutation with `.reverse()` or `.toReversed()` → "Leaderboard" [19, 7, 42] in green with "gets its order"; reversing isn't ranking. `SP\evidence-B\fp-toreversed.png`.
15. **debugger-tools:** the Real shortcuts scene and `watch` say DevTools breakpoints are "red-ish markers". In Chrome DevTools they're blue line-number markers (orange for conditional, pink for logpoints); VS Code uses red. This is from reviewer knowledge, not run. The spec AC carries the same error.
16. **debugger-tools:** the console evaluator returns `function Object()` for `constructor` and `toString`, and `{}` for `__proto__`. `expr.ts:101` uses `in` (it should use `Object.hasOwn`), which breaks the module's own "nothing callable comes back". Not exploitable, since calls are rejected. `cart.items.map` returns `undefined` instead of "not supported". `SP\evidence-B\dbg-console.png`.
17. **debugger-tools:** Step out pauses on the next line (22); real debuggers pause back on the call line (21) with the assignment pending. Not disclosed.
18. **command-line:** `wc -l *.txt` with two files prints no "total" line (real wc does). Files persist across presets, so preset output depends on history.
19. **command-line:** `echo $NOPE end` prints " end" (bash prints "end"); the caption shows `echo '' end`.
20. **command-line:** `chmod u+s` and `chmod 4755` → "invalid mode". Real chmod accepts both; the message should say "not modelled here". `SP\evidence-B\cl-chmod-invalid.png`.
21. **oop-fundamentals:** Encapsulation, click `acct.#balance = 1e6`, then Reset → the SyntaxError caption survives the reset. `SP\evidence-B\oop-reset-stale.png`.
22. **oop-fundamentals:** Method dispatch says the object "only holds data (r = 1)" and the box shows only `r`. The constructor on screen also sets `this.name`.
23. **stack-vs-heap:** `recorder.finish()` replaces the last step's caption in every preset, so the moment each bug happens is never narrated ("*p = 8 still writes…", "Reading *p is undefined behaviour", "no leak", "it's collectable").

**Algorithms (dsa)**
24. **prefix-sums:** Difference array, frame 4/14 ("Add −3 to [3, 8]") → cells are coloured by value sign, so the range start is red and just-past-end is green, the opposite of the legend and caption chips. `SP\evidence-C\prefix-sums-diff-f4.png`.
25. **sliding-window:** Max sum of k, numbers "5, -3", k = 5 → it runs with k = 2 (`Math.min(k, n)`) while the selector still shows 5, with no hint. `SP\evidence-C\sliding-window-k5-n2.png`.
26. **binary-search:** click the first number → the final frame says "Linear: 1 checks. Binary: 4…", with linear in red and binary in green although linear won. `SP\evidence-C\binary-search-first-cell.png`.
27. **tree-traversals / graph-representations:** editing is mouse-only. `TreeSvg` nodes are `<g onClick>` with no tabindex or role. Graph has no keyboard way to add a node, and it takes more than 70 Tabs to reach the quiz (long, not a trap).
28. **graph-representations:** Clear, then "Delete selected" (still enabled) → "Removed ? and every edge touching it." `SP\evidence-C\graph-representations-after-clear-delete.png`.
29. **two-pointers:** an empty Target silently becomes 0, "0x10" is accepted as 16, and a one-letter palindrome input is ignored, keeping the old word.
30. **big-o, stack-queue, recursion, sorting (older):** `watch` doesn't match the render.
    - stack-queue names no colours; the legend has green/yellow/red.
    - big-o omits the race lanes, readout cards and chips.
    - recursion omits the yellow current call.
    - sorting omits the sub-range box and dimmed bars.
31. **arrays-linked-lists, big-o:** code-convention gaps under T-2 (JSX in the model, hand-rolled `<sup>`), listed for the fixer. `two-pointers/styles.css` ends with an orphan comment.

**Web, security & data**
32. **accessibility:** the simulated screen reader always says the newsletter checkbox is "not checked", even after ticking it (hard-coded in `buildTree`).
33. **accessibility:** Contrast, pick Deuteranopia, then Typical vision → the deuteranopia caption stays.
34. **browser-storage:** HttpOnly off on the session cookie, run the XSS script → "The HttpOnly cookie is the only thing it couldn't see" (none is HttpOnly). It also counts `theme=dark` and `lang=en-GB` as "secrets". `SP\evidence-D\bst-xss-nohttponly.png`.
35. **browser-storage:** the shown script reads only `document.cookie` and `localStorage`, but the stolen list includes sessionStorage and IndexedDB. The summary says localStorage is "per site"; it's per origin, as the drawer itself says.
36. **security-principles:** send phish, then toggle Identity or change attack → the stats reset but "Stopped at Identity" stays. `SP\evidence-D\sp-stale-after-toggle.png`.
37. **security-principles:** stolen laptop with Data off → "Logging raised an alert", and the dot animates through the Network, Identity and App rings, though no network or login is involved. `SP\evidence-D\sp-laptop-breach.png`.
38. **dom-events:** at 768px the DOM tree's outer nodes are cut off: nodes span x = 7-761 in a stage spanning 24-744. At 1440 the input node touches the edge. `SP\evidence-D\dom-768-stage.png`.
39. **css-layout:** 390px, Box model → the "border 6", "padding 16" and "content 200×44" labels are clipped. `SP\evidence-D\css-390-box.png`.
40. **css-layout:** 390px, Flexbox → "Container width 600px" is shown at 324px, the items shrink, and free space is 0, so the scene and the 2:1 flex-grow prompt can't be done on a phone. `SP\out\css-layout\w390-g0o1.png`.
41. **css-layout:** the margin-collapse quiz `why` says padding or a border "separates" margins. That's true for parent/child, not for the sibling paragraphs the question asks about.
42. **css-layout:** width 80, padding 40, border 20, switch to border-box → "the total stays 80px" while the measured box is 120px. `SP\evidence-D\css-box-overfull.png`.

**Shipping, craft & teams**
43. **ci-pipelines:** Break a test + Fail fast = Cancel the run → the fail-fast caption never shows. The final frame's caption is overwritten by `summary(run)`, so the cancel narration is unreachable. `SP\evidence-E\ci-broken-failfast.png`.
44. **debugging-method:** when the bug is in normalize, the probe shows "199.89999999999998¢ × 3" (`showValue` doesn't round at `i === 2`). It looks like a second bug. `SP\evidence-E\dbg-float-normalize.png`.
45. **debugging-method:** quiz Q2's `why` gives "15 → 7 → 3 → 1 = 4 steps"; that's three halvings. The worst case is 15 → 8 → 4 → 2 → 1. The answer (4) is right; `runBisect` was verified for every f in 1..15.
46. **static-analysis-linters:** at 390px `.sa-matrix-scroll` hides the Tests column with no fade or swipe hint, and that column carries the lesson's key point. `SP\evidence-E\sa-390-matrix.png`.
47. **branching-workflows:** dev-3's lane is green, the legend's "merged into main" colour. `watch` promises lane colours on both sides, but the trunk side is status-coloured. With Trunk flags = Off, the final caption still says branches live "hours, not weeks" (they live 3 days). `SP\evidence-E\bw-day5.png`.
48. **dependency-management:** Transitive deps, Security fix = Not yet → "Needs a maintainer: A, B". It's c-utils that has to ship the fix.
49. **time-and-timezones:** 2026-11-01 01:30 New York → it warns the time is ambiguous, then "Storing it" silently picks 05:30Z as "one moment for everyone". `SP\evidence-E\tz-meet-ambig.png`.
50. **requirements-user-stories:** "Unknown email reveals nothing" (anti-enumeration) sits next to "Google sign-in accounts are sent to Google", which reveals that an account exists. Juniors will copy this.

**Networks, data & the older lessons (shard F)**
51. **git-internals:** branch and main both edit README, then Rebase → "replayed 1 commit" and main's change is silently overwritten (`repo.ts:164`). The same case with Merge reports a conflict.
52. **osi-tcpip-layers:** Diagnose, "destination host unreachable" → the explanation "a router has no route" describes ICMP *net* unreachable; *host* unreachable is usually the last hop's ARP failing.
53. **osi-tcpip-layers:** in Diagnose, wrong-answer explanations are rendered in `--muted`, dimmer than right ones (`styles.css:75-76`). `SP\evidence-F\osi-diagnose-checked.png`.
54. **web-request:** "Cold lookup" plus "Reused connection" is an impossible combination. In Reused mode the skip step is tagged TCP (Phase = TCP, blue pulse) while the caption says TCP is skipped. `watch` omits the five phase colours.
55. **client-server:** Breaking change → after the fix the old mobile app calls `/v1/users/42`, a path it never knew.
56. **processes-threads:** blocked threads are drawn red ("crashed / blocked"), but blocking is a normal I/O wait and `watch` says red means crashed. The green RUNNING outline isn't in `watch`. The context-switch counter misses frame 9.
57. **agile-kanban:** changing the WIP limit mid-run doesn't reset the 40-day trailing stats. After no limit → limit 1, cycle time reads 18.3 days, which the tryThis invites the learner to misread. It needs "press Restart" or an auto-reset.
58. **hashing-encryption:** ⑤ "Which one?" hand-rolls buttons (no `aria-pressed`) instead of `ChipButton`. "Salted slow hash" is pre-coloured `--ok`, so it looks correct before the verdict.
59. **hashing-encryption:** ② Passwords calls a lookup table a "rainbow table", and the race bar isn't to scale (0.4% drawn against a real ratio of about 10⁻⁶). Neither is said on screen.

### Cosmetic

- **binary-hex:** none.
- **twos-complement:** backticks (T-11).
- **floating-point:**
  - −0 shows as "-0", but +0 shows as "0.0000000000000000000".
  - The sign bit uses `--bad` (T-9).
- **char-encoding:** quiz Q4's wrong option "Trailing spaces only" is wrong only because of the word "only".
- **logic-gates:** in Build your own, Tab reaches gates G1-G4 before inputs A-C, the reverse of the visual order. `SP\evidence-A\lg-g4-enter.png`.
- **propositional-logic:** backticks in quiz Q4.
- **stack-vs-heap:** the dashed stack-limit line crosses the "stack" label; red crashed frames aren't in `watch`.
- **command-line:**
  - The card shows `cut '-d ' -f1` for the typed `cut -d' ' -f1`.
  - Pipe counts show before the pipeline runs.
- **data-formats:**
  - The YAML bug card shows `address: null` (a learner would write `address:`).
  - `1e400` shows Infinity in YAML and XML, unflagged.
  - The schema error has an empty path.
  - The caption says "The same three users" after edits.
  - The quiz says YAML 1.1 booleans are "any case" (only lowercase, Capitalised and UPPER count).
- **debugger-tools:** at 390px the Step buttons sit about two screens below the code.
- **sliding-window:** "a 'a'", "1 windows", and the last Shortest frame says "grow from where r is" when r is at the end.
- **two-pointers:** the missed answer is a green chip, though `watch` says red; "the first 1 cells".
- **tree-traversals:** a post-order leaf caption says "Both of 3's children are finished".
- **big-o:**
  - The "n →" label overlaps the 32 tick.
  - "1 ops".
  - The O(n²) caption is red while its curve is orange.
  - The n selector has no accessible name.
  - O(n log n) takes `--hi`.
- **stack-queue:** the first sandbox job is "job 8" (shared counter); peeking an empty stack says "underflow".
- **arrays-linked-lists:** Delete End on a one-item list mentions "the node before the tail"; the pointer arcs tangle after several inserts.
- **prefix-sums:** "-1" and "−1" mixed; the dashed blue guide line isn't in `watch`.
- **graph-representations:**
  - "Neighbours of one node" silently uses A when an edge is selected.
  - The "1 component" badge is barely legible.
  - The memory stats reuse legend colours.
- **recursion:** "Call factorial(4) is not the base case…" reads oddly.
- **responsive-design:**
  - "at least 44 × 44px" is stated as absolute (that's AAA and Apple's guideline; WCAG 2.2 AA is 24px).
  - The breakpoint ruler labels are clipped at 390px.
- **accessibility:**
  - `watch` promises a red-bordered bad example; only the label text is red.
  - "One small step darker" jumps from #777 to #595959 (7:1); #767676 is the one-step pass.
  - It says deuteranopia is the most common type; deuteranomaly is.
  - It announces a "Thanks, you are signed up." that doesn't exist on the page.
- **cors-same-origin:**
  - The "and it ran" sub-label stays when the value is "no".
  - The curl run shows a browser Cookie header.
  - An unsent DELETE lists a Cookie.
  - The `Access-Control-Request-*` headers are never shown.
- **dom-events:**
  - Delegation item numbers skip in dev (StrictMode double-runs a counter in a state updater).
  - The "editing" outline looks like the "cut by stopPropagation" dashed style.
- **css-layout:** spanning 3 columns on `200px 1fr` creates an unexplained 22px implicit track, while the caption still says two columns.
- **secrets-management:** the commit graph is tiny in a big box, with truncated messages; the "HEAD → main" tag isn't in `watch`.
- **er-data-modeling:** the blue border on a selected relationship's tables isn't in `watch` (the keyIdeas count is under T-7).
- **injection-attacks:** a quiz `why` says `<` only starts markup before a letter or `/` (`<!` and `<?` do too).
- **ci-pipelines:** at 390px the condensed YAML's wrapped lines lose their indentation. `SP\out\ci-pipelines\w390-g0o1.png`.
- **code-review:**
  - The PR header says "+18 lines" but the diff adds 19.
  - Unticked checklist chips are already green; the checklist isn't in `watch`.
- **static-analysis-linters:** "whitespace only" ignores Prettier's quote normalisation (`'No orders'` becomes `"No orders"`).
- **requirements-user-stories:**
  - The "What if we skip this?" replay jumps around in time.
  - "google sign-in" is lowercased.
- **time-and-timezones:** "days are 23 or 25 hours" (Lord Howe's are 23.5 and 24.5).
- **agile-kanban:**
  - The axis labels overlap ("day 230sprints").
  - The Review band and in-progress cards are both yellow.
  - The CFD WIP label lags by half a day.
  - A garbled `watch` phrase.
  - "Usually two weeks" vs the sim's 10 days.
- **osi-tcpip-layers:**
  - "up to 1460 B each" describes the MSS, not the frame size.
  - KB is used as 1,024 bytes in one place and 1,000 in another.
- **web-request:**
  - 93.184.216.34 is no longer example.com's address and doesn't match the 203.0.113.10 used by ip-ports and osi.
  - The waterfall scrolls sideways at 390px instead of reflowing.
- **git-internals:** graph labels overlap ("E.edit README.edit README…"); "app.js" is truncated at 390px.
- **ip-ports:**
  - "Packets sent" counts trips, not packets.
  - The phone's NAT dot is violet, which this lesson uses for loopback.
- **http-basics:**
  - Clicking faster than 850 ms stalls the exchange (it recovers).
  - If-None-Match always sends the current ETag, so a stale cache can't be shown.
- **sql-basics:**
  - GROUP BY uses a non-unique `users.name`.
  - The GROUP BY result is shown sorted without an ORDER BY.
- **client-server:** the contract text is always `--hi`.
- **Home:** filter chips use `replace`, so Back after filtering leaves the app instead of undoing the filter (by design, noted only).

---

## Per-lesson pass notes

✓ = no findings above cosmetic. Otherwise the finding IDs are listed.

| Lesson | Result | Notes |
|---|---|---|
| big-o | minor 30-31, T-2 | Every timing recomputed (31,746 years, 29.9 µs, 16.7 min, 8.3 h, 11.6 days). |
| binary-search | minor 26, T-2 | Worst-case counts and captions correct. |
| stack-queue | minor 30, T-2 | Story and sandbox work; overflow honestly labelled. |
| sorting | T-2, T-3, minor 30 | All 5 sorts end sorted on all 4 inputs; reversed-input counts right. |
| arrays-linked-lists | T-2, minor 31 | Costs and verdicts right; buttons disable when empty; capacity disclosed. |
| recursion | T-2, T-3, minor 30 | factorial, sum (length 0) and fib call/repeat counts right. |
| web-request | T-2, T-3, minor 54 | Round trips right (TCP 1, TLS 1.3 1, TLS 1.2 2); captions true in all 4 modes. |
| ip-ports | T-2, T-3 | Private and documentation ranges, ephemeral port, RST and NAT ports all correct. |
| http-basics | T-2, T-3 | DELETE ×3 → 204/404/404; PUT idempotent; 400/304/429 + Retry-After; 401 vs 403 right. |
| client-server | T-2, T-3, minor 55 | Scale-out and server-down backoff (2 s → 4 s) right. |
| sql-basics | T-2 | JOIN 6 rows, LEFT JOIN 8 (two NULLs), GROUP BY and WHERE recomputed. |
| processes-threads | T-2, T-3, minor 56 | Process/thread facts right. |
| hashing-encryption | **M-5**, T-2, T-3, minor 58-59 | Real SHA-256 and AES-GCM (recomputed with node crypto); crack times 20.9 s / 241.7 days right. |
| git-internals | T-2, T-3, minor 51 | Blob/tree counts, fast-forward and the two-parent merge right. |
| two-pointers | minor 29 | Pair sums with negatives and duplicates; elimination grid adds up (27 + 1 = 28). |
| sliding-window | minor 25 | abcabcbb → 3, max sum 23, shortest ≥7 is 2; moves never above 2n. |
| prefix-sums | minor 24 | Range 19, the off-by-one 10, difference rebuild all right. |
| tree-traversals | **M-1**, minor 27 | All four orders right; RPN evaluates to 14. |
| graph-representations | minor 27-28 | Memory figures and cycle/DAG/bipartite badges right. |
| binary-hex | ✓ | 42 = 0x002A = 0o52; chmod 755 → r-x; 255+1 → 0; `watch` matches. |
| twos-complement | minor 1-2 | Add mode (100+50 → −106), 2038 dates right. |
| floating-point | minor 4-5 | float32(0.1), the gaps, subnormal 2^−149, 2²⁴+1 all right. |
| char-encoding | minor 6 | é → C3 A9, NFD bytes, Ã© mojibake right. |
| base64-encodings | minor 3 | Man → TWFu, URL escaping, `user:pass` right. |
| logic-gates | ✓ | De Morgan, NAND-only and the Build table right; keyboard gate picker works. |
| fetch-decode-execute | ✓ | All 3 programs stepped (16/43/19 frames); toy-ISA disclosed. |
| memory-hierarchy | minor 7-8 | Human-scale conversions and 5.95 ns average right. |
| propositional-logic | ✓ | Converse has 2 red rows; short-circuit trace right (backticks cosmetic). |
| sets-functions | minor 9-11 | Set operations and the birthday preset right; keyboard alternatives to dragging exist. |
| logs-exponentials | ✓ | 2⁴⁰ and the 20-step halving from 1,000,000 right. |
| value-vs-reference | ✓ | All six snippets match real JS, including the const TypeError text. |
| closures-scope | ✓ | All five outputs right; lookup captions true at every frame. |
| oop-fundamentals | minor 21-22 | All 9 dispatch combinations right; V8 error texts match. |
| functional-programming | minor 13-14 | Call counts (16 vs 14) and $74 right. |
| error-handling-models | **M-3**, minor 12 | Failure paths right; success paths with `finally` wrong. |
| regex-basics | ✓ | Replace output identical to real `replaceAll`; `(a+)+$` stopped at 0.5 s with a ReDoS note; invalid patterns handled. |
| command-line | minor 18-20 | Top-IPs pipeline identical to real bash; grep exit codes; both `2>&1` orders right. |
| stack-vs-heap | minor 23 | Every JS and C program stepped; leak counter and dangling visuals right. |
| osi-tcpip-layers | minor 52-53 | 37 B request → 95 B frame; overhead tables right; TTL and MAC rewrite shown. |
| er-data-modeling | T-7 | FK placement, NULL rules, join tables, self-reference right. |
| data-formats | ✓ | CSV and big-id corruption right; Excel behaviour disclosed (cosmetics only). |
| ci-pipelines | minor 43 | 8:17 vs 6:55 (82 s); critical path with 4 shards; illustrative note shown. |
| branching-workflows | minor 47 | Lead times 5.5/1.0/1.9 days match the model; simplification disclosed. |
| injection-attacks | **M-4** | Payload-free as re-scoped; SQL and HTML models right; simulation disclosed. |
| security-principles | minor 36-37 | Stop logic matches tryThis (network alone stops 2 of 6). |
| secrets-management | ✓ | History persistence and the `.gitignore`-on-tracked-file model right; rotation taught; timeline labelled scripted. |
| cors-same-origin | ✓ | Origin comparisons (:443, file:// → null), preflight per the Fetch spec, curl bypass right. |
| debugging-method | minor 44-45 | Bisect worst case 4, mis-marking blames the wrong commit as promised; $58.29 right. |
| debugger-tools | T-7, minor 15-17 | Conditional breakpoints, logpoints and the mission all work; 90/81/72.9 right. |
| test-pyramid | **M-2** | Other paths fine. |
| static-analysis-linters | minor 46 | Layered checks and eslint-disable right. |
| code-review | ✓ | The planted bugs are real (page offset, null dereference, the test that still passes). |
| dependency-management | minor 48 | Semver matcher agrees with real node-semver on 1,584 cases; `npm ci` text accurate. |
| time-and-timezones | minor 49 | DST dates, offsets and job runs exact; identical output under 5 emulated time zones. |
| reading-codebases | ✓ | All four replays complete; breadcrumbs right; Austin 8.25% right. |
| requirements-user-stories | minor 50 | Ambiguity reaches 0% after 9 questions; 7 criteria give 7 tests; illustrative note shown. |
| agile-kanban | minor 57, T-8 | Little's law verified live (4.2 ÷ 1.20 = 3.5 vs 3.6 measured); simulated-team note shown. |
| dom-events | minor 38 | Real dispatch order; stopPropagation, preventDefault and `once` right. |
| css-layout | minor 39-42 | Numbers read from real elements: flex-grow +95/+47, margin collapse 30/10/−20. |
| responsive-design | T-5 | Container-query breakpoints, srcset picks and the keyboard resize handle right. |
| accessibility | minor 32-33, T-5 | Contrast maths exact (#777 = 4.48:1); `role="alert"` fix announces. |
| browser-storage | minor 34-35 | All 7 cookie request verdicts right (host-only, Secure, Lax/Strict/None). |

### Home page (Tier 1)

- **Cards:** 62 at 1440, 768 and 390; 0 planned; no "Show planned" toggle; no overflow at any width.
- **Filters:** every family and track chip filters to the right count, and the counts add up to 62:
  - dsa 11, hw 8, math 3, lang 6
  - os 3, net 4, data 3, arch 1
  - ops 3, sec 5, craft 10
  - web 5
  - ML and Leadership show "Nothing in this track at this tier yet".
- **Progress:** completing binary-hex's quiz gives the ✓ Learned badge, "1/99 learned" in the header, 1/62 on the Tier 1 bar and a done card.
- **Corrupt storage:** `not json`, `{"done":42}`, `[1,2]` and `null` all degrade to 0/62 with no errors.
- **Navigation:**
  - Card → lesson → next works; Back restores the home scroll position; Forward works.
  - Unknown ids show "No such lesson".
  - The first lesson has no ←, and browser-storage's → goes on to Tier 2's Hash Tables.
- **Evidence:** `SP\home-out\`, `SP\home.mjs`, `SP\nav.mjs`.

## What was tested

- Every tier-1 lesson at 1440x1000, 768x1024 and 390x844.
- Every Segmented option, with the player stepped to the end and every caption recorded.
- Every lesson button and hostile text input.
- Slider extremes.
- Reduced-motion playback.
- Real Tab order through to the quiz, plus Space on Play.
- Hand-driven deep paths per lesson (listed in the pass notes), and domain values recomputed independently in node: crypto, semver, Intl time zones, IEEE-754, regex `replaceAll`, real bash for the pipeline.
- Five emulated browser time zones for time-and-timezones.

## What could not be tested

- **Real assistive technology:** no NVDA, JAWS or VoiceOver. Accessible names and roles were checked in the DOM only.
- **Other browsers:** headless Chromium (Edge) only; no Firefox, Safari or real mobile. The JP-flag rendering elsewhere is assumed.
- **Touch:** dragging and swiping (graph edges, resize handles, wide-stage swipes). Keyboard equivalents were checked instead.
- **768px:** checked by overflow measurement on every scene, but screenshots were only eyeballed for a sample.
- **Mid-animation states:** only settled frames and end frames were shot. The motion itself under reduced motion was checked for errors and the final state, not for how it feels.
- **Combinations:** scene options were explored one dimension at a time, not every combination (for example, every error-handling option pair). Random faults in debugging-method were sampled, not exhausted.
- **Repo-level secret scanning:** a fake Stripe-style live key literal in `secrets-management/model.ts` is shaped like a real Stripe key. Check it against GitHub push protection before pushing.
