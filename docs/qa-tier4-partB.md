# Tier 4 sign-off, Part B: browser sample (Sentry)

Tree: `main` @ 52696cd2, nothing edited, nothing committed or pushed. Own dev server on 127.0.0.1:5961 (stopped afterwards, port verified closed).

## What was run

| Check | Scope | Result |
|---|---|---|
| Per-lesson driver (console errors and warnings on load, 22 real Tab presses with focus-ring and focus-drop check, Space and Enter on the first 3 chips, caption/provenance/seed/absolute scan, typed-number fields) | 51 lessons: all 50 Tier 4 plus attention-transformers; 3 viewports each (1440, 390, 768) = 153 visits, all 7 lead lessons, all 9 retrofits, all batches and tracks | 0 console errors or warnings, 0 crashes, 0 focus drops to body |
| 390 and 768 screenshots of the stage frame (sliced), READ by eye | 51 lessons, 169 images | findings below |
| Typed-number fields, every scene tab, 19 hostile values each (empty, text, -5, 0, 1e5, 1.5, 0x10, spaces, Arabic-Indic and fullwidth digits, +7, markup, 400 digits, 2^53+1, 1_000) plus real keystrokes, Tab-away, End/Home on sliders, chips | attention-transformers (4 fields), llm-serving (4), fine-tuning-quantization (3), feature-stores-skew (2), finops-cloud-cost (2 across scenes) | all pass, see below |
| `npm run sweep -- --all-tier=4 --fast` | all 50 Tier 4 lessons (the sample covers all 50, so there was no "unsampled" remainder; I swept the whole tier) | 50/50 clean, 162 scenes, 1822 controls, 402 key presses, 795 captions, 0 findings, 1628 s |
| `npm run smoke -- --scenes` | zero-knowledge-proofs, elliptic-curves, llm-serving, finops-cloud-cost, probabilistic-structures, hybrid-logical-clocks, conways-law, paxos | 8/8 clean, 26 scenes, 3 s idle each |
| `npm run smoke -- --mobile` | elliptic-curves, probabilistic-structures, finops-cloud-cost, feature-stores-skew, hybrid-logical-clocks | 5/5 "clean" (and see D1: it passes the clipped lessons) |
| Absolute-word scan of every scene's stage, stats, chips and caption text (not quiz, not key ideas) | 51 lessons, all scenes | 70 hits triaged, one worth fixing (D6) |

### Typed-number fields (BoundedIntField), all five migrated lessons
- Every hostile value is refused with a sentence naming the bound ("Prompt tokens: the largest allowed value is 8,192. Keeping 1,000."), the old value is kept, focus stays in the field, no NaN or undefined anywhere on the page, no error boundary.
- Empty string and whitespace are refused ("type a whole number from 1 to 8,192"); 400-digit and 2^53+1 inputs are refused as too large, not mis-parsed.
- Tab-away restores the kept value (finops: typed 12 with max 8, ended on 1, the last valid entry).
- Sliders move the field text (llm-serving prompt slider End gave 8,192 in the field, Home gave 1) and focus stays on the slider. Chips that set a field (attention-transformers n chips: 1,024 / 8,192 / 131,072 / 1,000,000) update the text.
- Not wrong, but note: "+7" is refused while "2,000" is accepted (grouping accepted, plus sign not). The refusal text quotes the raw input back (rendered as text, so safe). Fields carry no `aria-invalid` and no `aria-describedby` to the refusal (it is `role="status"`, so it is announced, but the link is missing).
- The fields live only in some scenes (attention: Cost of context; llm-serving: One request, KV cache; finops: What a day costs, Storage tier), so testing the default scene alone would have found none of them in attention-transformers.

## Per-lesson verdicts

PASS = no console output, Tab order sane with visible ring, chips respond to Space and Enter, 390 and 768 read, no caption contradiction, chips and seed present where needed. "minor" items are in the defect list.

| Lesson | Verdict | Note |
|---|---|---|
| strangler-fig-migrations (lead) | PASS | 6 chips, seed 7 shown |
| conways-law (lead) | PASS, minor | 8 placement rows push the graph ~1000 px down (D12) |
| build-vs-buy (lead) | PASS, minor | opens with "3 of 3 placed" though the learner placed nothing (D11) |
| technical-strategy (lead) | PASS, minor | conflict dashes hidden behind nodes (D13) |
| reversible-decisions (lead) | PASS | |
| influence-without-authority (lead) | PASS | -22 and support arithmetic checked by hand |
| hiring-interviewing (lead) | PASS | |
| elliptic-curves | PASS | tangent caption checked against the curve (slope -1 at (0,1): correct) |
| post-quantum-crypto | PASS | |
| e2ee-forward-secrecy | PASS | seed 11 visible, real/simulated/toy chips |
| secret-sharing | PASS | toy chip with seed |
| zero-knowledge-proofs | PASS, minor | caption "can always come out of it" (D6); cave labels touch the ring at 390 |
| llm-serving | PASS | 390 stage scrolls with hint |
| fine-tuning-quantization | PASS | memory arithmetic checked (112.00 / 14.56 / 4.06 GB) |
| feature-stores-skew | FAIL (D1, moderate) | timeline clipped, no hint |
| finops-cloud-cost | FAIL (D1, moderate) | day bars clipped, no hint |
| attention-transformers | PASS | caption matches the 0.34 / 0.24 row |
| raft | PASS, minor | blank band above Safety monitor at 390 (D14) |
| distributed-transactions | PASS | |
| crdts | PASS | |
| multi-region | PASS | average latency 92.75 checked, shows 93 |
| backpressure | PASS | |
| lsm-trees | PASS | |
| probabilistic-structures | FAIL (D1, major) | Bloom bit grid loses bits 0-2 and 13-18, 29-31 at 390, unreachable |
| slos-error-budgets | PASS | |
| zero-trust | PASS, minor | opening caption is a ~150-word wall (D9) |
| numa-multicore | PASS | |
| memory-ordering-atomics | PASS | relaxed tags disabled in SC mode, reason printed |
| lock-free-cas | PASS | |
| np-reductions | PASS, minor | formula text field too narrow, clips the text (D15) |
| sat-solvers | PASS | |
| linear-programming | PASS | |
| game-theory | PASS, minor | answer already shown under "click a cell to claim" (D5) |
| approximation-algorithms | PASS | |
| local-search-annealing | PASS | |
| suffix-arrays | PASS | |
| aho-corasick | PASS | |
| lca-binary-lifting | PASS | |
| online-algorithms | PASS | 19 vs 10, ratio 1.90 checked |
| failure-detectors | PASS | |
| gossip-protocols | PASS | |
| metastable-failures | PASS | |
| paxos | PASS, minor | "Seeded schedule 1: A chosen at 17 ms" shown at step 0 beside "chosen: none" (D10) |
| byzantine-faults | PASS, minor | blank stage band at 768 (D8) |
| flp-impossibility | PASS | |
| distributed-snapshots | PASS | |
| hybrid-logical-clocks | FAIL (D4, moderate) | 390 event table crushed |
| distributed-sql-truetime | PASS | closed form 34.27% vs 71/200 sampled |
| chaos-engineering | PASS | |
| deterministic-simulation-testing | PASS, minor | empty 600 px stage before Hunt (D8) |
| formal-methods | PASS, minor | guard inputs clip long guards (D15) |

## Ranked defects

**D1 (major for probabilistic-structures, moderate for feature-stores-skew and finops-cloud-cost). A WideRegion inside a centred flex column is centred, not scrollable, so content is cut off on both sides at 390 with no swipe hint.**
Repro: open `/lesson/probabilistic-structures` at 390 px. The Bloom bit row starts at bit 3 and ends at bit 12 (second row 19 to 28). Measured: `.stage-shell` is 602 px wide at x = -106 inside a 356 px `.stage` that is `overflow: hidden`; the shell's own scroller has nothing to scroll, so no `more-right` class and no hint. feature-stores-skew and finops-cloud-cost: shell 420 px at x = -15, so about 32 px is lost across the two edges (timeline and 24-hour bars).
Cause: the parent is `display:flex; flex-direction:column; align-items:center`, and a WideRegion with a minWidth wider than the parent is centred and overflows both sides. Sites: `src/lessons/probabilistic-structures/BloomView.tsx:171` (parent `.pb`, `styles.css:2`), `src/lessons/feature-stores-skew/PipelineScene.tsx:99` (`.fss-stage`, `styles.css:1`), `src/lessons/finops-cloud-cost/DayScene.tsx:133` (`.fin-stage`, `styles.css:1`). Likely fix is shared: make `.stage-shell` `align-self: stretch; max-width: 100%` (or `min-width:0; width:100%`) so the scroller, not the stage, absorbs the overflow. That is a shared-code change (global.css:836), so it needs the kit round, not a lesson edit.
Why nothing caught it: `smoke --mobile` passes all three, because the stage frame itself does not overflow the page; sweep --fast does not check reachability. Other flex-centred WideRegions may hide more of the same: grep for `WideRegion` under a parent with `align-items: center`.

**D4 (moderate). hybrid-logical-clocks, 390 px: "Every event, three stamps" table is crushed.** The hybrid stamp wraps mid-token ("(10" / "0)"), "true t" wraps, and rows are ~140 px tall because the "rule that fired" column text is squeezed. The wrapper scrolls (`.hl-table-wrap { overflow-x: auto }`, `styles.css:12`) but the table shrinks to 100% instead of keeping a width. Fix: `white-space: nowrap` on `.hl-hybrid` and a `min-width` on the table in `ExecScene.tsx:117` / `BurstScene.tsx:43`.

**D5 (minor). game-theory: "Click a cell to claim it is an equilibrium" while the answer is already on screen** (green (Defect, Defect) cell, both best-reply dots, "Pure equilibria 1"). The prompt asks the learner to find what is displayed. Either hide the marks until a claim, or reword the caption.

**D6 (minor). Unscoped "always" in a Tier 4 caption.** zero-knowledge-proofs scene 0 caption: "a prover who knows the passphrase can always come out of it." True of the model, but the rule is that a bounded check never says "always". Scope it ("in this model, an honest prover passes every round"). The other 69 absolute hits were scoped, quoted quiz distractors, "never type a real secret", theorem-labelled lines, or state-scoped ("nothing can be wrong in the new stack" while every route is Off).

**D8 (minor). Large empty stage before the first action.** deterministic-simulation-testing: ~600 px blank grid at 768 (250 px at 390) until Hunt is pressed. byzantine-faults "Be the traitor": ~250 px blank at 768. A placeholder or a pre-drawn empty state would read better.

**D9 (minor). zero-trust opening caption is ~150 words** (attacker script plus two author facts), in the caption slot. Move the script to the panel; keep the caption to one or two sentences.

**D10 (minor). paxos step 0 shows "Seeded schedule 1: A chosen at 17 ms, and at most one value chosen after every event"** under "Verdict: chosen: none". It describes a pre-computed schedule, not what is drawn. Label it as the seed's precomputed result.

**D11 (minor). build-vs-buy opens "3 of 3 placed"** with every component preset to Product. Caption says nothing is placed as something that sets you apart; the counter wording suggests the learner already acted.

**D12 (minor). conways-law:** eight team-picker rows (~1000 px) sit above the graph the picks change, so the effect is off screen on phones and tablets. Consider the graph first or sticky.

**D13 (minor). technical-strategy:** the dashed red conflict edges are drawn between adjacent nodes only; A4-A7 passes behind A6 and is nearly invisible (only the stat tile names it).

**D14 (minor). raft at 390:** about 110 px of blank space between the event log and the Safety monitor.

**D15 (minor, cosmetic).** np-reductions "Type a formula" input and formal-methods guard inputs are too narrow to show typical content. Text is clipped; the field scrolls.

**D16 (minor, a11y).** BoundedIntField has no `aria-invalid` and no `aria-describedby` link to its refusal message (shared component, `src/components/BoundedIntField.tsx`). The refusal is `role="status"`, so it is announced, but only if the region mounts after the field is focused.

### Checked and cleared (false alarms from my own detectors)
- SVG focusables (elliptic-curves points, lca nodes, graph nodes, cell grids, game-theory cells) report no outline but draw a white 2.5 px stroke ring on `:focus-visible`; confirmed in cropped focus/no-focus screenshots (game-theory, lca, attention, elliptic).
- "Focus left the chip" on aho-corasick, hybrid-logical-clocks and flp: removal chips hand focus to the next chip, which is right.
- memory-ordering "relaxed" chips are `disabled` in SC mode; the reason is printed under them.
- byzantine "Make C the traitor" with L2 already the traitor is refused with a caption ("This scene allows one traitor (f = 1)") and keeps focus. Intended.
- Provenance chips are present on every lesson that simulates, scripts or toys; every lesson with randomness shows its seed. Lessons with no seed (reversible-decisions, build-vs-buy, technical-strategy, suffix-arrays, lca, numa, multi-region, elliptic-curves, finops) have nothing random.
- `linear-programming` showed SVG curve paths extending past the viewport in my clip probe; those are clipped plot paths, not layout.

## Not verified
- Only the default scene of each lesson was screenshotted; non-default scenes were run by sweep (console, focus, NaN, 8 px text) and smoke --scenes (8 lessons) but not read by eye. Slices below the first screen of the tallest 390 pages (conways-law, zero-trust, reversible-decisions) were only partly read.
- Real-device or touch behaviour, the swipe affordance by gesture, and Windows Edge only (no Firefox or Safari).
- Chip Space/Enter was tested on the first three chips of each lesson only. Radio groups (Segmented) and sliders were exercised by sweep, not by my own per-control key tests.
- Captions were judged against state at default and after chip presses; I did not step every player to every frame. Maths were spot-checked by hand in about 12 lessons (list in verdicts), not in all 51.
- Live simulations (raft, backpressure) are timing-dependent; their shots are one moment.
- Domain correctness of cryptography, consensus and ML claims (the Provenance text says "from memory, verify"); that is the domain reviewers' job, and I did not check any citation.
- No build, lint, unit test or check-tokens run (the static-audit agent owns those). I did not run the baseline-diff tools or `npm run captions`.
- The sample was all 50 lessons plus attention-transformers, so there is no unsampled remainder; the sweep over the whole tier stands in for it.

Scratch scripts and screenshots (not in the repo): `C:\Users\Hawai\AppData\Local\Temp\claude\K--Programming-personalProjects\60e952a3-6f6e-4d52-b227-6526f33e5564\scratchpad\pb\` (drive.mjs, shots.mjs, fields.mjs, clip.mjs, absscan.mjs, out\).
