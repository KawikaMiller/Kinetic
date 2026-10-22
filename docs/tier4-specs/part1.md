# Tier 4 build specs, part 1: batches T4-B3, T4-B5 and T4-B8 (14 lessons)

Written 2026-10-22 against `main` at `30663e93`. Sources of truth: `docs/tier4-plan.md` (§1.2 fences, §2 final list, Appendix A toys), `docs/tier4-technical.md` (§2.3, §2.6, §2.7, AC-0/T4 #27 to #39, K4-n tickets), `docs/tier3-specs/part1.md` (format), `docs/qa-tier3-report.md`, `CLAUDE.md`. Lessons, in build order: **T4-B3** `np-reductions`, `sat-solvers`, `approximation-algorithms`, `local-search-annealing`, `linear-programming` (wave 1); **T4-B5** `suffix-arrays`, `aho-corasick`, `lca-binary-lifting`, `online-algorithms`, `game-theory` (wave 2); **T4-B8** `strangler-fig-migrations`, `conways-law`, `build-vs-buy`, `technical-strategy` (wave 3).

Every number in a "vector" below was computed by a throwaway script written for this document (plain Node, independent of any lesson code) and the arithmetic is shown so a reviewer can redo it by hand. Seeded figures (rates over seeds, "lowest failing seed") come from a prototype generator built on `mulberry32`: the builder's own generator will give other seeds, so the builder **re-pins** the seed and keeps the *inequality* the spec states. Anything marked **uncertain, verify** is a design bet or a fact typed from memory that a reviewer must check.

## Conventions used by every spec below

- **Rules by number.** "AC-0/T4 #n" is a rule from `tier4-technical.md` §3 (#27 to #39); AC-0/T3 and T2 rules are cited as such. *(rule n)* marks where a rule bites hardest.
- **Model first.** Every number, verdict and caption comes from a pure function in `model.ts` (or `sim.ts`) that the test file recomputes. A caption that says "close to", "far above" or "every" is built from the same numbers as the stat beside it and pinned at each control's minimum, maximum and one step beyond (rule 37, AC-0/T3 #14). **Hidden controls feed no number**: a constant a number depends on (the LP box of 1,000, a cap, a price) is a named constant shown in the stage.
- **Seeds.** Anything seeded shows a `SeedField` (`parseBoundedInt`, `SEED_MAX = 2^31 - 1`; other text refused with a message, old seed kept) and `Provenance kind="simulated" seed={n}`. No `Math.random`, `Date.now`, `performance.now` or `new Date` in lesson source (rule 36, lint `no-clock-or-random`). Default seeds are named constants pinned in the test.
- **Stable hook inputs, keyed scenes.** Frames, arrays and options handed to `usePlayer`, `useTickSim`, `useSimulation` or `introKey` are module constants or `useMemo`, never built in render, and a fallback is a module constant, never `?? []` (rule 37, lint `fresh-array-hook`). Each scene component carries `key={sceneId}` so state never leaks across a scene switch. Every control has a test at its minimum, maximum and one step beyond (refused with a message, or clamped and said so).
- **Broken mode (rule 29).** A lesson with a model that can fail ships a **broken mode** that names its counterexample object (lowest failing seed, shortest path, or witness input), fails for the stated reason (the test asserts the rule index or message), is not trivially everywhere (fails on at most 90% of the seeds unless a witness is shown instead, and the page prints "fails on k of N"), and the fixed mode passes the same inputs. Where a broken mode fails on more than 90%, the spec says so and the witness is what the page shows.
- **Proof-shaped lessons (rule 30)** `np-reductions`, `sat-solvers`, `approximation-algorithms`, `online-algorithms`, `game-theory` (and `local-search-annealing`, `linear-programming` as review checks): each names the toy, the wrong move, the exact refusal text, and tests named `manipulation N: ...` (at least two per `PROOF_SHAPED_IDS` id; `game-theory` and `online-algorithms` are listed in `tier4-technical.md` §2.3 as "if kept", this part keeps both). Reviewer check: press only Next and Play through every scene; if no caption depends on a control, the lesson goes back.
- **Theorems and bounds (rule 27).** A theorem-shaped sentence is `ClaimLabel kind="theorem"` ("argued, not run here"), an exhaustive check with its bound on screen ("all 793 formulas of 2 variables and at most 4 clauses"), or a seeded measurement with tolerance. A bounded or sampled check never says "impossible", "never" or "always" (the spec words each one). The extra scope words accepted by the T4 absolutes lint are `theorem|proved|proof|assum*|within the horizon`; `keyIdeas`, quiz `why` and the summary use them or say "in this model", "in this lesson", "unless".
- **Chips (rule 33, AC-0/T3 #21).** `Provenance` at the moment a number or claim matters: `simulated` (with seed), `illustrative`, `toy`, `scripted`, `from-memory`, `not-run`, `real`, `invented`; `ClaimLabel` (`standard`, `research`, `practice`, `view`, and `theorem` from K4-8). A name, year or figure recited from memory carries a `from-memory` chip and a **verify against** line below.
- **Counts and quiz (K-2 lint, read from `lessonContent.ts`).** 3 to 4 use cases, 3 to 5 try-this, 3 to 4 key ideas, 3 to 5 quiz questions, a `why` on every question, no duplicate options, no "of the above". The lint measures the correct option's length divided by the mean of the three distractors and wants **0.75 to 1.35**; the correct option may be strictly the longest in at most `floor(n / 2)` questions of a lesson and in at most 30% tier-wide. Quiz seeds below are checked by script against exactly that definition (70 questions: all inside 0.75 to 1.35, the correct option strictly longest in 13 of 70, never more than 2 in a lesson). Options are shuffled at runtime, so the order shown is for reading only. `why` is written by the builder from the vectors and scoped (see rule 27 above).
- **Try-this (AC-0/T3 #16).** Each entry is a concrete action with an expected number or sentence, runs **from the default state in written order** (an entry that needs a different state says "Reset" or names the scene; scene switches are part of the entry), and has a test named `try-this N: ...` that replays the whole list in order from a fresh mount.
- **Phones.** 390 and 768 are first-class: wide drawings go in `StageFrame minWidth` (from `minWidthForText`) or a `WideRegion`, controls `flex-wrap`, Plot2D at width 356. Each spec says what scrolls at 390.
- **Kit and links.** Names in **Kit** exist in `docs/shared-api.md` unless prefixed `K4-n` (tickets in `tier4-technical.md` §4.1). **Kit missing** lines are Phase 2 requests (AC-0/T4 #39); the report at the end of the file collects them. A lesson links by id only to lessons that exist or sit earlier in its own batch or in an earlier wave; later lessons are named in words.
- **Colour vocabulary.** CLAUDE.md's table applies; plain categories take `orange`/`amber`/`pink`/`sky`, never `--ok`/`--bad`.

---

##### Batch T4-B3 · Hardness & optimisation (`lang`, `dsa`, `math`)
Wave 1. **[domain review]** `np-reductions`, `approximation-algorithms`, `linear-programming` (one reviewer); the other two carry no domain flag but are in `PROOF_SHAPED_IDS`. Pilot `np-reductions` first (the hardest toy). Needs **K4-4** (`core/sat`), **K4-5** (`core/tsp`) and **K4-8** (`ClaimLabel kind="theorem"`), all built in the kickoff kit round. Build order: `np-reductions` then `sat-solvers`; `approximation-algorithms` then `local-search-annealing` and `linear-programming`. **Kit gap that blocks the batch:** `np-reductions` and `approximation-algorithms` both need an exact `minVertexCover` and a `maximalMatching` (two lessons in one batch needing the same missing piece, AC-0/T4 #39), so a kit round must add `core/vertexCover.ts` (branch on the highest-degree vertex, plus a bitmask brute force as its own oracle) before the batch starts; see the report.

**`np-reductions` · Reductions**
Track `lang` · *"If you can solve this, you can solve everything"* · Priority important · Builds on: `p-vs-np`, `propositional-logic`, `graph-representations` · **[domain review]**
**Starts where `p-vs-np` stops.** It quotes `p-vs-np` key idea 2 ("NP-complete = in NP and NP-hard: every NP problem reduces to it") and starts at the word *reduces*: this lesson makes the learner perform one. Out of scope: the P, NP and NP-complete vocabulary (`p-vs-np`), the Cook-Levin proof (a `ClaimLabel kind="theorem"`, named), other reductions (clique, subset sum: named only), SAT solving (`sat-solvers`, the next lesson in the batch, named in words only, no link until it is built).
**Toy and wrong move (rule 30).** The learner **builds the 3-SAT to vertex-cover graph** from a formula, then moves a satisfying assignment to a cover and a cover back. Wrong moves, with exact refusal text (shown in a `Hint`, old state kept):
- Joining two vertices the construction never joins (x1 and x2): *"The construction never joins x1 and x2: it joins only a literal to its own negation, the three vertices inside one clause, and a clause vertex to the literal it names."*
- Joining a clause vertex to the opposite literal (c1.2 holds the literal not x2, learner picks x2): *"Clause 1 has the literal not x2 here, so c1.2 joins the vertex not x2, not x2: that would encode the opposite clause."*
- A cover of size K - 1 (K = 7 on the default formula): *"No cover of 6 exists: the 3 variable edges are disjoint from each other and from the 2 clause triangles, and a triangle needs 2 vertices, so every cover has at least 3 + 2 x 2 = 7. Edge (x1, not x1) is still uncovered."* (numbers computed).
- "Check my graph" on an incomplete build: names the first clause not fully encoded and the missing edge ("Clause 2 (not x1 or x2 or not x3) is missing the triangle edge c2.1 to c2.3").
Tests named `manipulation 1` to `manipulation 4` assert each text through the model, not the DOM.
**Spec.**
- **Formula editor (all scenes).** n up to 4 variables and m up to 5 clauses, each clause exactly 3 literals (repeats allowed: a short clause is padded by repeating a literal, the standard idiom). Pickers per literal (`Segmented`) or typed via `parseCnf` (K4-4, `core/parseKit` refusals, no `eval`): "a clause needs exactly three literals", "x5 is beyond the 4 variables allowed", "x1 or not x1 in one clause is always true: leave it out". More than 4 variables or 5 clauses is refused with the limit stated. Default formula **F1** = (x1 or not x2 or x3) and (not x1 or x2 or not x3), n = 3, m = 2.
- **Scene 1 · Build the graph.** Vertices are pre-placed (literal vertices in a row, each clause as a labelled triple below) and the learner adds edges (`GraphView` with `editable.onAddEdge`; keyboard: Enter on a vertex, arrows to a target, Enter). Edge kinds take plain categories once accepted (variable edge `sky`, triangle edge `amber`, connection edge `pink`); an edge counter reads "3 of 15"; K = n + 2m is shown beside it. Buttons: Check my graph, Undo edge, Clear, **Show the reference** (draws the model's graph as a ghost and keeps the learner's edges).
- **Scene 2 · Assignment to cover.** One `Toggle` per variable (default all off). The cover is built by the rule: take the true literal of each variable, and in each clause leave out one clause vertex whose literal is true (the first by default; the learner can click another valid one) and cover the other two. The size is compared with K. An assignment that falsifies a clause shows the clause and the price: *"Clause 1 has no true literal, so all three of its vertices must be covered: size K + 1 = 8."*
- **Scene 3 · Cover to assignment.** The learner clicks vertices into a cover; uncovered edges show `--bad`; "Read the assignment" appears when the cover has size at most K and covers every edge (literal vertices in the cover are true, and the lesson then verifies the formula). Exact minimum shown from `minVertexCover`.
- **Scene 4 · No solution.** Preset **U** = (x1 or x2 or x2) and (x1 or not x2 or not x2) and (not x1 or x2 or x2) and (not x1 or not x2 or not x2): n = 2, m = 4, 16 vertices, 26 edges, K = 10. A table of the 4 assignments each shows the clause it falsifies and the cover size 11. The page states the exact count of size-10 covers (0) and the minimum (11).
- **Scene 5 · Break the reduction.** A `Toggle` drops the variable edges; the same checks then run on the broken graph (see Broken mode).
**Model and tests (rule 27).** `buildGraph(F)`, `coverFromAssignment`, `assignmentFromCover`, `minVertexCover` (branch on the highest-degree vertex) all in `model.ts`; `bruteForce` from K4-4. Hand-worked vectors on **F1**:
- Vertices 2n + 3m = 6 + 6 = 12; edges n + 3m + 3m = 3 + 6 + 6 = 15; K = n + 2m = 3 + 4 = 7.
- Satisfying assignments: clause 1 is false only for (x1, x2, x3) = (F, T, F) and clause 2 only for (T, F, T), so 8 - 2 = 6 satisfy.
- Covers of size 7: each satisfying assignment gives one cover per way of choosing which true literal each clause leaves out, the product of the numbers of true literals per clause. For all six assignments that product is 2 (000: 1 x 2; 001: 2 x 1; 011: 1 x 2; 100: 2 x 1; 110: 1 x 2; 111: 2 x 1), so 6 x 2 = **12** covers of size 7, which the test confirms by brute force over all 2^12 subsets.
- Falsifying assignment (F, T, F): variable vertices not x1, x2, not x3 = 3; clause 1 has no true literal, so its three vertices are covered = 3; clause 2 has 3 true literals, so 2 are covered; total 3 + 3 + 2 = **8 = K + 1**.
- **U**: 16 vertices, 26 edges (2 + 12 + 12), K = 2 + 8 = 10, minimum cover 11, 0 covers of size 10; each of the 4 assignments falsifies exactly one clause (TT falsifies clause 4, TF clause 3, FT clause 2, FF clause 1), so each costs K + 1 = 11.
**Independent oracles.** Brute force over all 2^V vertex subsets (V up to 20) and over all 2^n assignments, written separately from `minVertexCover` and `coverFromAssignment`. **Exhaustive:** all 793 formulas of 2 variables and 1 to 4 clauses over the 12 distinct non-tautological clauses (12 + 66 + 220 + 495): the minimum cover is at most K exactly when the formula is satisfiable, and the minimum is never below n + 2m; plus 200 seeded formulas with 3 variables and up to 4 clauses (V up to 18). The page may say "checked on all 793 formulas ... and 200 seeded 3-variable formulas" (rule 27a), never "for every formula" without the bound. **Uncertain, verify:** `tier4-technical.md` §2.3 proposed exhaustive up to 5 variables and 7 clauses; brute force on 31 vertices is infeasible as an *independent* oracle, so this spec shrinks the exhaustive leg to what fits and samples beyond (labelled "sampled").
**Broken mode (rule 29).** The variable edges are omitted and K stays n + 2m. On the 793 formulas it gives the wrong verdict on **186 (23.5%)**; the page prints "fails on 186 of 793". The named counterexample is the smallest failing formula in clause-count then clause-list order, F* = (x1 or x1 or x1) and (not x1 or not x1 or not x1) (unsatisfiable): without the edge a cover of size K = 6 exists by taking x1 **and** not x1 (the variable is both true and false) plus two vertices per triangle. The test asserts the failing rule ("cover of size K exists but no assignment satisfies") and that the fixed mode agrees with brute force on all 793.
**Try this** (default: F1, scene 1, no edges placed).
1. Click x1 then not x1: a variable edge appears and the counter reads 1 of 15.
2. Click x1 then x2: refused with the construction's rule, counter unchanged.
3. Press Show the reference, open scene 2 (assignment all off, a satisfying one, size 7), then turn x2 on: clause 1 has no true literal and the size reads 8 = K + 1.
4. In scene 3 pick any 6 vertices and press Check: the K - 1 refusal appears with the bound 3 + 2 x 2 = 7.
5. In scene 4 read the unsatisfiable preset: 0 covers of size 10, minimum 11.
**Quiz seeds.** Misconception: *a reduction solves the problem*, or runs the wrong way. Question 2 is arithmetic (K = n + 2m with n = 4, m = 5 is 14).
1. *(misconception)* You turn any 3-SAT formula into a vertex-cover graph in polynomial time. What does that show?
   - A. 3-SAT is at least as hard as vertex cover, because the formula is the bigger object. *[direction reversed]*
   - B. A fast vertex-cover algorithm would give a fast 3-SAT algorithm. **(correct)**
   - C. Both problems are now solvable in polynomial time, since the graph is easy to build. *[confuses building the instance with solving it]*
   - D. Only the formulas you tried are hard; other formulas may map to easy graphs. *[confuses one instance with the whole map]*
2. *(arithmetic)* A formula has 4 variables and 5 clauses. What target size K does the gadget graph use?
   - A. K = 14: 4 for the variable edges plus 2 per clause triangle. **(correct)**
   - B. K = 9: one vertex per variable and one per clause, 4 + 5. *[forgets that a triangle needs two vertices]*
   - C. K = 19: one per variable plus all three vertices of each clause, 4 + 15. *[covers whole triangles]*
   - D. K = 23: both literal vertices per variable plus three per clause, 8 + 15. *[counts every vertex]*
3. *(unsat)* The graph built from a formula has a vertex cover of size K + 1 but none of size K. What follows about the formula?
   - A. It is satisfiable, but the cover found is simply not a minimum one. *[confuses minimum with size K]*
   - B. It is satisfiable with exactly one variable left without a value. *[invents a half-assignment]*
   - C. Nothing follows, because cover size is unrelated to satisfiability. *[denies the equivalence the lesson checks]*
   - D. No assignment satisfies it, so every attempt falsifies some clause. **(correct)**
4. *(why polynomial)* Why must the reduction itself run in polynomial time?
   - A. So that the graph still fits on the screen for small formulas. *[a display concern, not a proof concern]*
   - B. Because vertex cover is already known to be solvable in polynomial time. *[false premise]*
   - C. Otherwise it could solve the problem while building the graph and prove nothing. **(correct)**
   - D. Because SAT solvers refuse inputs that were produced by a slow program. *[invented rule]*
5. *(gadget)* In the gadget graph, why does every variable get an edge between x and its negation?
   - A. It makes the graph connected so that a cover search can reach every vertex. *[connectivity is not the reason]*
   - B. A cover must take one of the two, and that choice is the truth value. **(correct)**
   - C. It forces both x and its negation into the cover, so each variable counts twice. *[a cover may take just one endpoint]*
   - D. It marks the variable as unused whenever neither literal appears in a clause. *[invented meaning]*
**Honesty and provenance.** `Provenance toy` ("at most 4 variables and 5 clauses: real instances have thousands"); `ClaimLabel theorem` on "3-SAT is NP-complete" ("argued, not run here", Cook-Levin, named) and on "the equivalence holds for every formula" (argued from the two directions shown, checked only on the stated sets); `Provenance from-memory` on the gadget's attribution (the textbook 3-SAT to vertex-cover construction; Karp's 1972 list of 21 problems). **Verify against:** Garey and Johnson, *Computers and Intractability* (1979), the vertex-cover reduction (from memory); Karp 1972, "Reducibility among combinatorial problems" (named from memory).
**Kit.** K4-4 (`Cnf`, `parseCnf`, `bruteForce`), `core/vertexCover` (kit gap), `GraphView` (editable), `ClaimLabel` theorem (K4-8), `Provenance`, `Toggle`, `Segmented`, `ChipButton`, `Stat`, `useScenePicker`, `SeedField` not needed (no seed). **Kit missing:** `core/vertexCover.ts` (see batch note); confirm `GraphView editable` can accept edges between fixed vertices with `onAddNode` unset and report a refusal back to the caller (**uncertain, verify**; the refusal text is shown by the lesson in a `Hint`).
**Phone.** 20 vertices at most: the graph sits in a `StageFrame minWidth` of about 560 and scrolls sideways at 390 with the shared hint; the formula editor and toggles wrap; the edge counter and K sit above the graph.
**Risks.** The pilot of the batch: if the edge-placement flow cannot be made keyboard-reachable the toy degrades to a slideshow (AC-0/T3 #23). The exhaustive bound (793 formulas) is a deliberate shrink of the technical plan, recorded above.

**`sat-solvers` · SAT & Constraint Solvers**
Track `lang` · *"Throw your hard problem at a solver"* · Priority nice · Builds on: `np-reductions`, `backtracking`, `propositional-logic` · no domain flag (in `PROOF_SHAPED_IDS`)
**Starts where the neighbours stop.** `np-reductions` showed a problem turned into a formula; `backtracking` walked a decision tree for any solution; `propositional-logic` taught truth tables. This lesson owns DPLL: unit propagation, conflicts, the choice of branching variable, and a package-resolution encoding. Out of scope: the reduction (previous lesson), truth tables, CDCL (clause learning, restarts: named and sketched in one sentence, not built).
**Toy and wrong move (rule 30).** The learner **drives DPLL**: chooses the variable and value of each decision and steps propagation. Wrong moves, exact text:
- Deciding an already-assigned variable: *"b is already forced true by clause 1 (not a or b), so a decision on it would repeat or contradict a forced value. Pick an unassigned variable."*
- Pressing **Declare UNSAT** while a branch is open: *"Not yet: a = false is untried, so the search has not covered every case."*
- (Allowed, and the point of the lesson) a decision that leads to a conflict highlights the falsified clause and offers Backtrack.
Tests `manipulation 1` and `manipulation 2` assert both texts.
**Spec.**
- **Scene 1 · Propagate.** The six-clause formula **F2** over a, b, c, d, e: 1 (not a or b), 2 (not b or c), 3 (not c or d), 4 (not d or not a), 5 (a or e), 6 (not e or not b). Clause chips show status (satisfied `--ok` tint, unit `--hi`, falsified `--bad`, open `muted`). Controls: variable chips, value `Segmented` (true, false), Step (one forced assignment or the conflict), Backtrack (disabled with the reason "nothing to undo: no conflict yet" until one occurs), Undo, Reset. A trail lists decisions and propagations with the clause that forced each.
- **Scene 2 · You are the heuristic.** Formula **H** over x1 to x6, y1, y2 (vars 1 to 8): (x1 or x2), (x3 or x4), (x5 or x6), (y1 or y2), (y1 or not y2), (not y1 or y2), (not y1 or not y2) (unsatisfiable, the contradiction hides in the last four). The learner picks every branching variable; counters read branches, propagations, conflicts; beside them the two reference runs "first unassigned" and "most occurring". Tree drawn collapsed beyond depth 4 with "+n more" (`TreeSvg`, local).
- **Scene 3 · A heuristic over 200 formulas.** Seeded random 3-SAT, 8 variables, 30 clauses, seeds 1 to 200: both heuristics, verdicts compared (they must agree on all 200), mean branches per heuristic, `Bars` of tree size per formula. A `SeedField` shifts the seed window.
- **Scene 4 · Package resolution.** Four variables lib@1.0.0, lib@2.0.0, util@1.0.0, util@2.0.0. The learner picks the root's range for each package with `Segmented` (lib: any, ^1, ^2; util: any, ^1, ^2); ranges are matched with `core/semver` `satisfies`; the live CNF is printed with a plain-words gloss per clause ("lib 2.0.0 requires util ^2"). Solve runs DPLL; a satisfiable result lists the install set, an unsatisfiable one shows an unsat core by deletion (drop a clause, re-solve, keep it dropped if still unsatisfiable), computed.
**Model and tests.** `core/sat` K4-4 `dpll(cnf, { heuristic })` returning decisions, propagations and conflicts; counting convention (pinned in the test): a **branch** is each tried value of a decision variable (both values count), a **propagation** each forced assignment, a **conflict** each falsified clause found. Propagation scans clauses in order and restarts after each unit. Hand-worked vectors:
- **F2**, first-unassigned, true first: decide a = T (branch 1); clause 1 forces b (prop 1), clause 2 forces c (prop 2), clause 3 forces d (prop 3), clause 4 (not d or not a) is falsified (conflict 1). Backtrack: a = F (branch 2); clause 5 forces e (prop 4), clause 6 forces not b (prop 5); nothing else is unit; decide c = T (branch 3); clause 3 forces d (prop 6); every clause holds. **3 branches, 6 propagations, 1 conflict**, model a = F, b = F, c = T, d = T, e = T (check: clause 1 true by not a, 2 by not b, 3 by d, 4 by not a, 5 by e, 6 by not b).
- **H**, first-unassigned: with B(k) the branches below k untouched pairs (x1,x2), (x3,x4), (x5,x6), B(0) = 2 (the y subtree: y1 = T forces y2 = T by clause 6 and clause 7 is falsified; y1 = F forces y2 = T by clause 4 and clause 5 is falsified: 2 branches, 2 propagations, 2 conflicts). Deciding the first variable of a pair true leaves the pair's other variable free (2 branches plus two copies of the rest) while false forces it, so B(k) = (1 + 2 + 2B(k-1)) + (1 + B(k-1)) = 4 + 3B(k-1): B(1) = 10, B(2) = 34, **B(3) = 106 branches**; propagations P(k) = 3P(k-1) + 1 with P(0) = 2 give 7, 22, **67**; conflicts C(k) = 3C(k-1), C(0) = 2 give **54**. Most-occurring (counted over unsatisfied clauses, ties lowest index) picks y1 first: **2 branches, 2 propagations, 2 conflicts**.
- A unit chain (x) and (not x or y) and (not y or z): **0 branches**, 3 propagations.
- Package preset **A** (root needs lib any and util ^1): variables 1 lib1, 2 lib2, 3 util1, 4 util2; clauses [3], [1,2], [-1,-2], [-3,-4], [-2,4], [-1,3,4]. Propagation alone: util1 (c1), not util2 (c4), not lib2 (c5), lib1 (c2): 4 propagations, **0 branches**, unique solution lib1 and util1 (brute force finds exactly 1 of 16 assignments). Preset **B** (root needs lib ^2): clauses [2], [3], [-1,-2], [-3,-4], [-2,4], [-1,3,4] are unsatisfiable (util1 forces not util2, lib2 forces util2); the deletion core is exactly {[2], [3], [-3,-4], [-2,4]}, 4 clauses, and deleting any one of them makes the set satisfiable (asserted).
**Independent oracles.** `bruteForce(cnf)` for satisfiability and model validity on 1,000 seeded random 3-SAT formulas up to 10 variables (K4-4's own gate, reused); every returned model satisfies every clause; replaying the recorded decisions reproduces the result; heuristic comparison on seeds 1 to 200 (prototype: verdicts agree on all 200, 183 satisfiable, mean branches 6.48 first-unassigned against 4.59 most-occurring; the builder re-pins and asserts only **agreement of verdicts** and **mean(most) at most mean(first)**, not a per-formula ordering).
**Broken mode (rule 29).** DPLL that tries only the first value of each decision (no flip on conflict). Seed-free hand schedule: on **F2** it reports UNSAT although F2 has 3 models (a = T conflicts and it never tries a = F). Seeded: on 200 random formulas (8 variables, 30 clauses) the prototype gives a wrong UNSAT on **127 of 200 (63.5%)**, lowest failing seed 1; the test asserts the rule "reports UNSAT but `bruteForce` finds a model" and that the fixed mode is right on all 200.
**Try this** (default: scene 1, F2, nothing assigned).
1. Decide a = true and press Step four times: b, c, d are forced and clause 4 turns `--bad` (a conflict).
2. Press Backtrack, then Step twice: a = false, e is forced true and b forced false.
3. Try to decide b: refused (b is already forced).
4. Decide c = true: d is forced and the page reports the model a = F, b = F, c = T, d = T, e = T.
5. Open scene 2 and pick y1 as the first branch: the tree ends with 2 branches against 106 for first-unassigned.
**Quiz seeds.** Misconception: unit propagation is a guess. Question 2 is the zero-decision chain; question 3 separates verdict from tree size.
1. *(misconception)* What does unit propagation do in a DPLL search?
   - A. It picks the variable that occurs in the most clauses and tries true first. *[that is the branching heuristic]*
   - B. When all literals of a clause but one are false, it sets the last one true. **(correct)**
   - C. It deletes every satisfied clause and leaves the assignment unchanged. *[simplification without forcing]*
   - D. It tries both values of a variable and keeps the one with fewer conflicts. *[look-ahead, not propagation]*
2. *(arithmetic)* The formula (x) and (not x or y) and (not y or z) is handed to DPLL. How many decisions does the search make?
   - A. None: propagation sets x, then y, then z, and every clause holds. **(correct)**
   - B. One: it must guess x first and then propagate the rest of the variables. *[x is already a unit clause]*
   - C. Three: one decision per variable, each tried true first, in order. *[ignores propagation]*
   - D. Eight: the solver walks through all 2 to the power 3 assignments. *[brute force, not DPLL]*
3. *(heuristic)* You change the branching rule from first-unassigned to most-occurring variable. What can change?
   - A. Whether it is satisfiable, since a different order finds different models. *[a different model, not a different verdict]*
   - B. Nothing, because both rules end up visiting exactly the same nodes. *[the lesson shows 106 vs 2 branches]*
   - C. Only the printed model, since the tree size is fixed by the formula. *[tree size depends on the order]*
   - D. How large the search tree is, but never the verdict about satisfiability. **(correct)**
4. *(encoding)* In the package encoding, what does the clause (not lib2 or util2) say?
   - A. Lib 2.0 and util 2.0 can never be installed together in one project. *[that would be (not lib2 or not util2)]*
   - B. At least one of lib 2.0 and util 2.0 has to be installed. *[that would be (lib2 or util2)]*
   - C. Picking lib 2.0 forces util 2.0, because lib 2.0 requires it. **(correct)**
   - D. Util 2.0 requires lib 2.0, so installing util will pull in lib as well. *[implication reversed]*
5. *(unsat core)* A solver reports that your dependency set is unsatisfiable. Which output helps you most?
   - A. The last assignment it tried before giving up, which is rarely meaningful. *[a trail is not an explanation]*
   - B. A few rules that cannot all hold, such as the four that clash. **(correct)**
   - C. The number of conflicts it hit, since a larger count means a harder problem. *[a count explains nothing]*
   - D. A random-looking subset of packages with the conflicts left out of the report. *[hides the cause]*
**Honesty and provenance.** `Provenance toy` ("toy sizes; real solvers add clause learning and restarts, which this lesson names and does not build"); `Provenance from-memory` for "dependency solvers in some package managers use SAT techniques" (**verify against** each tool's documentation before naming one; the spec names none); `ClaimLabel standard` for the DPLL name (Davis, Putnam, Logemann, Loveland; named from memory). The package ranges are real `core/semver` matching, so that part wears no chip.
**Kit.** K4-4 (`dpll`, `parseCnf`, `bruteForce`), `core/semver` (`satisfies`), `core/parseKit`, `TreeSvg` (local DPLL drawing, collapsed beyond depth 4), `Segmented`, `ChipButton`, `Stat`, `Bars` (Plot2D), `SeedField`, `useScenePicker`, `Provenance`, `ClaimLabel`. **Kit missing:** none. The DPLL tree drawing is single-user and stays local.
**Phone.** Clause chips wrap two per row; the tree scrolls in a `WideRegion` (about 480); the trail is a stacked list.
**Risks.** The recursion in `dpll` must stay iterative or depth-bounded (10 variables is safe; the page caps the editor at 10 and refuses more with the limit). Counting conventions must match the test exactly or the hand vectors disagree.


**`approximation-algorithms` · Approximation Algorithms**
Track `dsa` · *"Provably close enough, in polynomial time"* · Priority important · Builds on: `np-reductions`, `minimum-spanning-trees`, `greedy-algorithms` · **[domain review]**
**Starts where the neighbours stop.** `p-vs-np` says NP-hard problems get "heuristics, approximations and solvers"; `minimum-spanning-trees` builds the tree; `greedy-algorithms` taught greedy choice. This lesson owns the **guarantee**: a ratio proved against an optimum the lesson can compute on small inputs. Out of scope: NP-hardness itself (`np-reductions`, `p-vs-np`), MST algorithms, inapproximability results (named only), local search (the next lesson).
**Toy and wrong move (rule 30).** The learner **builds the 2-approximation** for vertex cover and **tries to break the tour guarantee**. Wrong moves, exact text:
- Adding a matching edge that reuses a matched vertex: *"Edge (0, 4) shares vertex 0 with a matching edge you already picked. A matching may not reuse a vertex, which is exactly why its edges are disjoint."*
- Pressing Done before the matching is maximal: *"Not maximal yet: edge (1, 5) still has both endpoints free, so it could be added."*
- Raising a star distance until the triangle inequality fails (scene 3, M above 2): *"The guarantee no longer applies: d(L1, L2) = 100 exceeds the detour d(L1, O) + d(O, L2) = 2, so shortcutting can lengthen the tour. Ratio here: 31.3."* (numbers computed).
Tests `manipulation 1` to `manipulation 3` assert these through the model.
**Spec.**
- **Scene 1 · Vertex cover, 2-approximation.** A graph of up to 8 vertices and 12 edges (`GraphView` editable; presets K3,3, a path of 4, a triangle, a star). The learner clicks edges into a **maximal matching** (accepted edges `--info`); Done computes the cover (both endpoints of every matching edge, `--hi`), the exact optimum by `minVertexCover` (outlined `--ok`) and the ratio. A proof panel states the argument ("the matching edges share no vertex, so any cover needs at least one endpoint per matching edge; ours takes both") as a `ClaimLabel theorem`.
- **Scene 2 · Metric TSP, drag the points.** 5 to 10 draggable points on a 0 to 100 plane (`Plot2D` `Points` draggable with keyboard twins, `components/useDragPoint`); four drawn tours: MST (thin), **MST doubling** (shortcut preorder of the doubled tree), **Christofides** (MST plus a minimum-weight perfect matching on the odd-degree vertices, shortcut Euler tour), and the **optimum** (Held-Karp, K4-5); a ratio meter with the 2 and 1.5 lines, and an "MST at most optimum" bar. Preset **M7** below. An **Adversary** button runs a seeded hill climb over the point positions (300 steps of one-unit moves, `SeedField`) to push the MST-doubling ratio up and reports the best ratio found and "the bound of 2 is not reached with 7 points" (**uncertain, verify:** how close the climb gets; the number is measured at build time and only `at most 2` is asserted).
- **Scene 3 · Break the metric.** A 5-node instance, the **star**: centre O joined to leaves L1 to L4 by distance 1; leaf pairs (L1, L3), (L3, L2), (L2, L4) cost 1.5; the other leaf pairs cost M, set by a slider from 1.5 to 200 in steps of 0.25 (default 2). A banner appears the moment M exceeds the detour 2. Christofides is deliberately not shown here: its tour depends on the Euler-circuit tie-break and would look better than it should (named in a note).
**Model and tests (K4-5 `core/tsp`, `core/vertexCover`).** Hand-worked vectors:
- **K3,3** (vertices 0 to 2 on the left, 3 to 5 on the right): clicking (0,3), (1,4), (2,5) gives a maximal matching of 3 edges; the cover is {0,...,5}, size 6; the optimum is {0,1,2}, size 3; ratio exactly 2.
- **Path 0-1-2-3**: matching {(0,1), (2,3)} gives cover size 4 against optimum 2 (ratio 2); matching {(1,2)} is also maximal and gives cover size 2 (ratio 1): the ratio depends on which maximal matching is built. **Triangle:** one matching edge, cover 2, optimum 2.
- **M7** = P0 (1.4, 7.2), P1 (10, 5), P2 (6.2, 3.2), P3 (8.8, 0.7), P4 (8.1, 8.6), P5 (6.8, 8.7), P6 (4.2, 2.4) (all distances distinct). MST edges 0-6 5.5570, 6-2 2.1541, 2-3 3.6069, 2-1 4.2048, 1-4 4.0706, 4-5 1.3038, **weight 20.8972**. Doubling, preorder from P0 with children in index order, 0 6 2 1 4 5 3: 5.5570 + 2.1541 + 4.2048 + 4.0706 + 1.3038 + 8.2462 + 9.8494 = **35.3858**, at most 2 x 20.8972 = 41.7944. Odd-degree vertices {0, 2, 3, 5}; the minimum matching is (0,5) 5.6045 + (2,3) 3.6069 = 9.2114 (the other pairings cost more: (0,2) + (3,5) = 6.2482 + 8.2462 = 14.4944); the Euler circuit 0 5 4 1 2 3 2 6 0 shortcut to 0 5 4 1 2 3 6 is 5.6045 + 1.3038 + 4.0706 + 4.2048 + 3.6069 + 4.9041 + 5.5570 = **29.2517**, at most MST + matching = 30.1086. Optimum 0 5 4 1 3 2 6 = 5.6045 + 1.3038 + 4.0706 + 4.4643 + 3.6069 + 2.1541 + 5.5570 = **26.7612**. Ratios 35.3858 / 26.7612 = **1.3223** and 29.2517 / 26.7612 = **1.0931**; MST 20.8972 is below the optimum 26.7612 (a tour minus one edge is a spanning tree).
- **Star:** MST is the four unit edges, weight 4; the optimum uses two centre edges (1 + 1) and the three cheap leaf pairs (3 x 1.5): 6.5; the doubling tour O L1 L2 L3 L4 costs 1 + M + 1.5 + M + 1 = 3.5 + 2M, so the ratio is (3.5 + 2M) / 6.5: M = 1.5 gives 1.000, M = 2 gives 7.5 / 6.5 = **1.154** (metric holds with equality, no banner), M = 4.75 gives 13 / 6.5 = **2.000**, M = 10 gives 3.615, M = 100 gives 203.5 / 6.5 = **31.31**.
**Independent oracles.** Held-Karp against brute-force permutations for n up to 8; the MST weight against Kruskal (`core/disjointSet`) as well as Prim; minimum vertex cover against a bitmask brute force; **1,000 seeded Euclidean instances (n 5 to 10)**: doubling at most 2, Christofides at most 1.5, MST at most optimum, the tour a permutation (a bound on the seeded set, not a proof: the page says "on 1,000 seeded maps" and carries the theorem chip for the proof); 1,000 seeded graphs: matching cover at most twice the optimum. A **planted non-metric** instance (the star at M = 100) must exceed 2, so the metric test can fail. Euler tie-break pinned: smallest-index neighbour first (`tier4-technical.md` K4-5 leaves it open; **uncertain, verify** that the kit pins it, since a different circuit changes the Christofides shortcut tour).
**Broken mode (rule 29).** The learner-visible broken variant keeps **one endpoint** per matching edge instead of both. It breaks the invariant "the result is a vertex cover": on the prototype's 200 seeded graphs (7 vertices, edge probability 0.4) it leaves an edge uncovered on **189 of 200 (94.5%)**, so the page shows the shortest witness instead of a rate: the triangle with matching edge (a, b), cover {a}, edge (b, c) uncovered. The test asserts the validity rule fires and that the fixed mode returns a valid cover on all 200.
**Try this** (default: scene 1, K3,3, empty matching).
1. Click (0,3), (1,4), (2,5), then Done: cover 6, optimum 3, ratio exactly 2.00.
2. Click (0,4): refused because vertex 0 is already matched.
3. Open scene 2 and load preset M7: doubling 1.32, Christofides 1.09, MST 20.90 below the optimum 26.76.
4. In scene 3 drag M to 100: the guarantee-voided banner appears and the ratio reads 31.31.
5. Set M back to 2: the banner is gone and the ratio reads 1.154 (the triangle inequality holds with equality).
**Quiz seeds.** Misconception: *approximation means heuristic with no guarantee*, and *one good ratio proves the bound*.
1. *(misconception)* What makes the matching-based vertex cover an approximation algorithm, not just a heuristic?
   - A. It always finds the exact minimum cover, only a little slower than greedy. *[it is not exact]*
   - B. A proved bound: its cover is at most twice the optimum on any graph. **(correct)**
   - C. It runs fast on the graphs the author tried, which the ratio meter shows. *[examples are not a guarantee]*
   - D. It is randomised, so the average over many runs is close to optimal. *[it is deterministic]*
2. *(arithmetic)* On the complete bipartite graph with 3 vertices per side, a maximal matching has 3 edges. What are the cover sizes?
   - A. Matching cover 6 against optimum 3, a ratio of exactly 2. **(correct)**
   - B. The matching cover has 3 vertices, the same as the optimum cover. *[counts edges as vertices]*
   - C. The matching cover has 6 vertices, and so does the optimum cover. *[one whole side is enough]*
   - D. The matching cover has 9 vertices and the optimum has 3, a ratio of 3. *[counts edges of the graph]*
3. *(metric)* You change one distance so that the triangle inequality fails. What happens to the 2x guarantee of MST doubling?
   - A. It still holds, because the MST itself is unchanged by the edit you made. *[the tree is unchanged, the shortcut argument is not]*
   - B. It still holds, but the constant 2 is replaced by a constant 3 instead. *[no such constant exists]*
   - C. It becomes exact, because the tour now follows only the cheapest edges. *[tours get worse, not exact]*
   - D. It no longer applies; on the lesson's star the tour hits 31 times optimal. **(correct)**
4. *(lower bound)* On the lesson's 7-point map the MST weighs 20.9 and the best tour 26.8. Why can the MST never weigh more than the best tour?
   - A. The MST visits fewer vertices than the tour, so it has to be shorter. *[it spans all vertices]*
   - B. Because distances are Euclidean, every tree is shorter than every tour. *[a tree can exceed a short tour]*
   - C. A tour minus one edge is a spanning tree, so the MST weighs no more. **(correct)**
   - D. It is a coincidence of this instance and it fails on some other maps. *[it holds on every map]*
5. *(one instance)* Christofides gave a tour of 29.25 against the optimum 26.76 on one map, a ratio of 1.09. What does that prove?
   - A. That Christofides always stays within 9 percent of the optimal tour. *[generalises one instance]*
   - B. Nothing about other maps; the guarantee is the proved bound of 1.5. **(correct)**
   - C. That the 1.5 bound is wrong, because 1.09 is far smaller than 1.5. *[a bound is a ceiling]*
   - D. That the tour would be optimal after one more shortcut pass over it. *[no such pass]*
**Honesty and provenance.** `Provenance toy` ("at most 10 points so the optimum can be computed; real instances are far larger"); `ClaimLabel theorem` on the 2-approximation for vertex cover (argued in the proof panel, checked on the seeded set), on "MST doubling is within 2 for metric inputs" and "Christofides is within 1.5" (argued, not run here); `Provenance from-memory` for the attribution (Christofides 1976; Serdyukov 1978 independently), and for "no general constant-factor approximation exists for non-metric TSP unless P = NP" (named only). **Verify against:** Christofides 1976 technical report and Serdyukov 1978 (from memory); Vazirani, *Approximation Algorithms* (2001) for the vertex-cover and TSP bounds (from memory).
**Kit.** K4-5 (`core/tsp`: distance matrix, Prim, Held-Karp, double-tree tour, Christofides, `tourLength`), `core/vertexCover` (kit gap), `core/disjointSet`, `GraphView` (editable), `Plot2D` (`Points` draggable, `Polygon`, `Curve`, `HLine`), `useDragPoint`, `ClaimLabel` theorem (K4-8), `Provenance`, `SeedField`, `Stat`, `Slider`, `ChipButton`, `useScenePicker`. **Kit missing:** `core/vertexCover` (shared with `np-reductions`).
**Phone.** Plot2D at 356 wide; the four tours are toggled by chips (one extra tour at a time on phones) to keep the picture legible; the matching graph in a `StageFrame minWidth` of about 400; the star table wraps.
**Risks.** The adversary's reachable ratio at n = 7 may look unimpressive (it cannot approach 2 with so few points); the page says so rather than hiding it. Christofides needs the exact minimum matching on at most 10 odd vertices (bitmask DP in K4-5).

**`local-search-annealing` · Local Search & Simulated Annealing**
Track `dsa` · *"Climb hills, and sometimes jump off them"* · Priority nice · Builds on: `approximation-algorithms`, `randomized-algorithms`, `gradient-descent` · no domain flag
**Starts where the neighbours stop.** `gradient-descent` showed local minima of a smooth loss; `randomized-algorithms` separated Las Vegas from Monte Carlo. This lesson owns hill climbing against **annealing** on a discrete landscape and **2-opt** on a tour. Out of scope: gradient methods, genetic algorithms and tabu search (named), proofs of convergence (named in a chip).
**Toy and failing state.** A ball on a 20-cell landscape: hill climbing gets stuck, annealing escapes. The landscape **f** (value at cells 0 to 19) is the named constant `[6,5,4,3,2,3,5,4,3,2,1,0,1,2,3,4,5,6,7,8]`: local minimum at cell 4 (value 2, both neighbours 3), global minimum at cell 11 (value 0), ridge at cell 6 (value 5). No step is refused (the page shows costs instead): setting T far too low or too high prints the computed consequence ("T = 0.05: a step that is 1 worse is accepted with probability e^-20 = 2.1e-9: this is hill climbing"; "T = 50: the same step is accepted 98.0% of the time: this is a random walk").
**Spec.**
- **Scene 1 · One ball.** Controls: start cell (slider 0 to 19, default 2), mode (`Segmented`: hill climbing, annealing; default hill climbing), start temperature T0 (0.05 to 8, default 4), cooling factor alpha (0.95 to 0.999, default 0.998), steps (100 to 4,000, default 2,000), `SeedField`. Run animates the trail; Step advances one proposal (neighbour left or right with equal probability, out-of-range proposals stay put; accept if not worse, else with probability e^(-delta/T); T multiplied by alpha each step). Stats: final cell and value, best cell seen, steps accepted uphill.
- **Scene 2 · Over 1,000 seeds.** Has its own schedule controls (defaults T0 4, alpha 0.998, 2,000 steps, independent of scene 1) and runs 1,000 seeded runs from random starts for that schedule and shows the success rate (final cell is the global minimum) with a 95% binomial interval, a histogram of end cells, and beside it the **exact** hill-climbing rate 13 / 20 = 65% (computed by running steepest descent from all 20 starts).
- **Scene 3 · What temperature does.** A table of acceptance probabilities e^(-delta/T) for delta in {1, 2, 3} and T in {0.5, 1, 2, 5, 50}, and a bar chart of the exact stationary distribution at the chosen T (Boltzmann, computed by iterating the transition matrix) beside the empirical occupancy of a long run, with the note that low T mixes slowly (the run may not have reached the distribution).
- **Scene 4 · 2-opt.** 6 to 12 seeded points, a random initial tour; Step applies the first improving 2-opt move (K4-5 trace) and prints the move and its delta; counters for moves and length; final length against the Held-Karp optimum. A `Toggle` switches to **annealed 2-opt** (random segment reversals under the same Metropolis rule, then a 2-opt polish); a button runs 100 seeded maps and reports mean ratio and how many reached the optimum for both. Preset **crossed square** below.
**Model and tests.** `landscape.ts` (steepest descent with ties to the lower index, Metropolis step, schedule), `tour.ts` (a thin wrapper over K4-5 `twoOpt`). Hand-worked vectors:
- Steepest descent from every start, ties to the lower index: starts 0 to 6 end at cell 4 (7 starts), starts 7 to 19 end at cell 11 (13 starts, **65%**). Examples: from 6 (the ridge, value 5) the neighbours are 5 (3) and 7 (4), so it goes to 5 then 4; from 7 (value 4) the neighbours are 6 (5) and 8 (3), so 8, 9, 10, 11.
- Acceptance probabilities: delta 2 at T = 1: e^-2 = **0.1353**; delta 1 at T = 2: e^-0.5 = **0.6065**; delta 1 at T = 0.05: e^-20 = **2.06e-9**; delta 1 at T = 50: e^-0.02 = **0.9802**.
- Boltzmann at T = 1: the 20 values contain 0 once, 1 twice, 2 three times, 3 four times, 4 three times, 5 three times, 6 twice, 7 once and 8 once, so Z = 1 + 2e^-1 + 3e^-2 + 4e^-3 + 3e^-4 + 3e^-5 + 2e^-6 + e^-7 + e^-8 = 1 + 0.73576 + 0.40601 + 0.19915 + 0.05495 + 0.02021 + 0.00496 + 0.00091 + 0.00034 = 2.42229, so P(cell 11) = 1 / Z = **0.4128**; at T = 2 it is 0.1996.
- **Crossed square:** points (0,0), (2,0), (2,2), (0,2) visited 0, 2, 1, 3: length 2 sqrt 8 + 2 + 2 = 4 + 5.6569 = **9.6569**; one 2-opt move (reverse the middle pair) gives 0, 1, 2, 3 = **8**, delta = (2 + 2) - (2.8284 + 2.8284) = -1.6569.
**Independent oracles.** The exact Metropolis chain (a 20 x 20 transition matrix, symmetric proposals, rejected out-of-range proposals staying put) iterated to convergence equals the Boltzmann distribution to 1e-9 at T in {1, 2, 5} (the prototype also reached 3e-13 at T = 0.5); a 2 x 10^6-step seeded run's occupancy is within 0.01 of it (tolerance stated); hill climbing equals steepest descent computed by brute force from all 20 starts; **quench** (T0 = 0.05) ends where steepest descent does from every start except cell 6, where either side is possible; 2-opt: the recomputed tour length equals the running total after every move, no improving 2-opt move remains at the end (all pairs checked), the tour is a permutation; Held-Karp against brute force for n up to 8.
**Broken mode (rule 29).** **Quench** (T0 = 0.05, annealing with no temperature): the invariant is "annealing reaches the global minimum at least 85% of the time". Prototype, random starts, seeds 1 to 1,000: the default schedule (T0 = 4, alpha = 0.998, 2,000 steps) succeeds on **90.6%**, quench on **66.0%**; in the first 200 seeds quench fails on **70 (35%)**, lowest failing seed 7 (start cell 0, ends at cell 4). The test asserts the default rate is at least 0.85 and quench at most 0.70 (builder re-pins the seed and keeps the inequalities), and that quench's failures are exactly the starts in cell 4's basin (start 6, the ridge, may go either way). Seed-free witness: from cell 2, hill climbing ends at cell 4 on every seed.
**Try this** (default: scene 1, start 2, hill climbing).
1. Press Run: the ball ends at cell 4 (value 2), not cell 11 (value 0).
2. Switch to annealing and Run with the default seed (the builder pins `DEFAULT_SEED` so this run ends at cell 11 and asserts it): the trail climbs over the ridge.
3. Drag T0 to 0.05 and Run: back to cell 4, and the caption shows e^-20 = 2.1e-9.
4. Open scene 2 (its own default schedule) and press Run 1,000 seeds: about 91% success against the exact 65% for hill climbing.
5. In scene 4 load the crossed square and Step once: length 9.66 becomes 8.
**Quiz seeds.** Misconception: *annealing always finds the global optimum*. Question 2 is the Metropolis arithmetic (delta 2 at T = 1 is 13.5%).
1. *(misconception)* A learner says: simulated annealing always finds the global optimum. What is the accurate version?
   - A. It always finds it, provided the starting temperature is above zero. *[a finite run can fail]*
   - B. Slow cooling finds it with high probability, but a finite run can stall. **(correct)**
   - C. It never beats hill climbing, because accepting worse moves wastes steps. *[it escapes local optima]*
   - D. It finds the global optimum only when started inside the right basin. *[that describes hill climbing]*
2. *(arithmetic)* At temperature 1, a move that makes the score 2 worse is accepted with what probability?
   - A. About 13.5 percent, which is e to the power minus 2. **(correct)**
   - B. About 2 percent, because the move is 2 worse and so is rare. *[confuses the size with a percentage]*
   - C. Exactly 50 percent, since a worse move is as likely as a better one. *[ignores the temperature]*
   - D. About 86.5 percent, which is 1 minus e to the power minus 2. *[takes the complement]*
3. *(local optimum)* Hill climbing from position 2 stops at position 4 on the lesson's landscape. Why?
   - A. Position 4 is the lowest point on the whole landscape. *[the global minimum is elsewhere]*
   - B. The climber ran out of steps before it could reach the lowest point. *[it stopped, it did not run out]*
   - C. The landscape slopes upward from position 2, so the climber never moves. *[it moved down first]*
   - D. Both neighbours are higher, so no single step improves it. **(correct)**
4. *(cooling)* You cool from T = 4 to almost 0 within a handful of steps. What does the run resemble?
   - A. A random walk, because a low temperature accepts every proposed move. *[that is a high temperature]*
   - B. An exhaustive search, since the falling temperature visits every state once. *[no state sweep happens]*
   - C. Plain hill climbing: the ball freezes in the nearest basin, as only downhill moves get accepted. **(correct)**
   - D. A guaranteed global search, because the temperature did start out high. *[a quench forfeits the benefit]*
5. *(2-opt)* 2-opt reaches a tour where no single swap shortens it. Is the tour then optimal?
   - A. Yes, because no swap shortens it, so nothing shorter can exist anywhere. *[local is not global]*
   - B. Not necessarily: it is a local optimum, and sometimes longer than the best. **(correct)**
   - C. Yes, whenever the map has fewer than twenty points to visit in total. *[no such size rule]*
   - D. No, but only because 2-opt can lengthen a tour while it is working. *[2-opt only shortens]*
**Honesty and provenance.** `Provenance simulated` with the seed on every run; `Provenance toy` on the landscape ("a 20-cell teaching landscape: real landscapes have millions of states"); `ClaimLabel standard` on the Metropolis rule; `Provenance from-memory` on "annealing converges to the global optimum under a logarithmic cooling schedule (Hajek, 1988), which is far too slow to use", on Kirkpatrick et al. (1983) as the origin, and on "2-opt local optima are typically a few percent above the optimum" (do not state a number from memory; the page shows its own measured ratios). **Verify against:** Kirkpatrick, Gelatt, Vecchi, *Science* 1983; Hajek, *Mathematics of Operations Research* 1988 (both named from memory).
**Kit.** K4-5 (`twoOpt` with step trace, `heldKarp`, `tourLength`), `Plot2D` (`Bars`, `Curve`), `Segmented`, `Slider`, `Toggle`, `SeedField`, `Stat`, `ChipButton`, `core/random` (`mulberry32`), `useScenePicker`, `useTickSim` not needed. **Kit missing:** none (the Metropolis chain and the landscape are single-user and local).
**Phone.** The landscape is a bar row of 20 cells that fits 356 wide; the ball and trail are overlays; the tables wrap; the tour plot is 356 wide.
**Risks.** Annealing success depends on the pinned schedule: the builder must pin it and the test must show both the inequality and the numbers. Slow mixing at low T makes the "empirical vs exact" panel look wrong if the run is short; the note must say so.

**`linear-programming` · Linear Programming & Optimization**
Track `math` · *"Best answer under constraints"* · Priority nice · Builds on: `approximation-algorithms`, `matrices-transformations`, `greedy-algorithms` · **[domain review]**
**Starts where the neighbours stop.** `gradient-descent` follows a slope; `matrices-transformations` taught linear maps. This lesson owns the **feasible region**, the **vertex theorem** and the objective line. Out of scope: simplex pivot tables beyond one worked geometric step, duality, interior-point methods and integer programming beyond one example (named only).
**Toy and failing states.** The learner drags constraint lines and rotates the objective until the optimum jumps vertex. Two named failing states: **infeasible** (the region is empty) and **unbounded** (the objective grows without limit). Wrong moves, exact text:
- Making the region empty: *"Infeasible: no point satisfies all constraints. The clash is x + y <= 4 against -x - y <= -5 (together they need x + y at most 4 and at least 5)."* (the clash is found by dropping one constraint at a time and keeping it dropped while the system stays infeasible; in the plane an infeasible system always contains a clashing subset of at most 3 constraints, by Helly's theorem, a `ClaimLabel theorem`).
- An objective the region does not bound: *"Unbounded: the best point sits on the artificial wall at 1,000. Nothing in the constraints stops the objective growing."*
- Walking a simplex step along an edge that does not improve the objective (scene 2): *"That edge lowers 3x + 2y from 9 to 0: a simplex step only follows an edge that improves the objective."*
Tests `manipulation 1` to `manipulation 3` (this lesson takes rule 30 as a review check; the tests are still required to fail on a planted bad model).
**Spec.**
- **Scene 1 · The region.** Up to 6 constraints `a x + b y <= c` plus the implicit `x >= 0, y >= 0`; per constraint sliders a and b in [-4, 4] and c in [-10, 20] (steps of 0.5) and a draggable line handle (keyboard twin); add and remove buttons (a 7th is refused: "at most 6 constraints: the picture stops being readable, remove one first"; a = b = 0 is refused: "a = 0 and b = 0 is not a line"). Objective `cx x + cy y` with integer sliders in [-5, 5]. `Plot2D` draws the feasible `Polygon`, the constraint lines, the objective line at its optimal level (`--hi`), and a table of the polygon's vertices with the objective at each. The artificial wall is the named constant `BOX = 1000`, shown in the stage and used only for the unbounded test (valid because with these slider ranges every bounded vertex has coordinates below 640, since the numerator of a two-line intersection is at most 2 x 20 x 4 = 160 and the smallest non-zero determinant is 0.25; **uncertain, verify** by the extremes test).
- **Scene 2 · One simplex step, geometrically.** From the vertex (0,0) with objective 3x + 2y the learner picks an edge to walk (the table shows each edge's direction and whether it improves); the ratio test is drawn as the distance to the next constraint (x + y <= 4 at 4, x + 3y <= 7 at 7, x <= 3 at 3: the nearest is 3), the walk goes to (3,0) worth 9, then up to (3,1) worth 11, and the page says "no improving edge: optimal, because a linear objective over a convex region has no other kind of peak". No tableau is shown (named only).
- **Scene 3 · Whole numbers.** A fixed copy of the default region with objective x + 2y and a `Toggle` for integers: the LP optimum (2.5, 1.5) worth 5.5 is drawn with its rounding (3, 2) marked infeasible and the integer optimum 5 at (1, 2) and (3, 1); "integer programming is a different problem" (named).
**Model and tests.** `lp2d.ts`: vertex enumeration over all pairs of constraint lines (including the axes and the wall), a feasibility filter, a status (optimal, infeasible, unbounded). Hand-worked vectors on the **default** region (x + y <= 4, x + 3y <= 7, x <= 3, x, y >= 0):
- Vertices (0,0), (3,0), (3,1) (x = 3 meets x + y = 4; x + 3y = 3 + 3 = 6 <= 7 holds), (2.5,1.5) (x + y = 4 meets x + 3y = 7: 2y = 3, y = 1.5, x = 2.5), (0, 7/3 = 2.333).
- Objective 3x + 2y: 0, 9, 3 x 3 + 2 x 1 = **11**, 3 x 2.5 + 2 x 1.5 = 10.5, 2 x 2.333 = 4.667: optimum **11 at (3,1)**. Objective x + 2y: 0, 3, 5, 2.5 + 3 = **5.5** at (2.5,1.5), 4.667. Objective x + y: 0, 3, 4, 4, 2.333: a **tie of 4** between (3,1) and (2.5,1.5), the whole edge x + y = 4 optimal. Objective y alone (cx = 0, cy = 1): 2.333 at (0, 2.333). Objective (-1, -1): 0 at the origin.
- Infeasible: add -x - y <= -5: no vertex survives the filter. Unbounded: the single constraint -x - y <= -1 with objective x + y: the optimum is the wall corner (1000, 1000), value 2000, status unbounded.
- Integer: for x + 2y the integer points of the region best at (1, 2) and (3, 1), value 5, against the LP 5.5; rounding (2.5, 1.5) to (3, 2) breaks x + y <= 4 (5 > 4).
- Extremes: c at its minimum with x + y <= -10 (a = b = 1) is infeasible; c at its maximum 20 with a = b = 1 and objective (1, 1) is optimal at 20, a tie along the whole edge x + y = 20.
**Independent oracles.** (a) A grid search at step 0.05 over [0, 10] x [0, 10] on 200 seeded bounded LPs (3 to 5 constraints with a, b in 1 to 4 and c in 4 to 20, objective coefficients in 1 to 5): the grid best never exceeds the vertex optimum and sits within 0.05 (|cx| + |cy|) of it; (b) a **second algorithm**, greedy edge walking from the origin (the scene 2 rule), reaches the same optimum on the same set; (c) infeasible and unbounded verdicts on 200 seeded cases checked against a feasibility scan on a coarse grid (a point exists exactly when the model says feasible, within grid resolution). The vertex theorem is stated as a `ClaimLabel theorem` and **checked** on the seeded set (rule 27b).
**Broken mode (rule 29).** The solver **forgets x, y >= 0** (the implicit constraints). Witness: the default region with objective y minimised (cx = 0, cy = -1): correct answer optimal, value 0 at (3,0) or (0,0) (a tie along the bottom edge); broken answer unbounded, because y can run to minus 1,000. On the prototype's 200 seeded LPs with objectives in [-5, 5] it is wrong on **186 of 200 (93%)**, over the 90% cap, so the page shows the witness rather than a rate; the second named failure "does not check feasibility of the line intersections" reports 21 at (7, 0) on the default region (x + 3y = 7 meets y = 0 at (7, 0), which breaks x <= 3 and x + y <= 4), against the true 11. The test asserts the rule ("the reported point violates a constraint") and that the fixed mode passes the same inputs.
**Try this** (default: scene 1, the default region, objective 3x + 2y).
1. Read the vertex table: the best value is 11 at (3, 1).
2. Set the objective to cx = 1, cy = 2: the optimum jumps to (2.5, 1.5), value 5.5.
3. Set cx = 1, cy = 1: two corners tie at 4 and the page says the whole edge x + y = 4 is optimal.
4. Add a fourth constraint with a = -1, b = -1, c = -5: the page reports Infeasible and names x + y <= 4 against -x - y <= -5.
5. Open scene 3 (its own copy of the default region): the LP optimum 5.5 against the integer optimum 5, and the rounded point (3, 2) is marked infeasible.
**Quiz seeds.** Misconception: *the optimum can sit in the interior or is smooth*. Question 2 is the arithmetic on the default region.
1. *(misconception)* Where does a linear objective reach its best value on a bounded feasible polygon?
   - A. At an interior point, where every constraint still has some slack left. *[objective keeps improving toward the boundary]*
   - B. At a corner, or along a whole edge parallel to the objective line. **(correct)**
   - C. At the point nearest the origin, whatever the objective happens to be. *[depends on the objective]*
   - D. At the midpoint of the longest edge, because of a symmetry argument. *[no symmetry argument]*
2. *(arithmetic)* Maximise 3x + 2y under x + y <= 4, x + 3y <= 7, x <= 3 and x, y >= 0. What is the optimum value?
   - A. 11, reached at the corner (3, 1) where two constraints are tight. **(correct)**
   - B. 10.5, reached at the corner (2.5, 1.5) where two constraints meet. *[a corner, but not the best]*
   - C. 9, reached at the corner (3, 0) on the bottom edge of the region. *[a corner, but not the best]*
   - D. 12, reached at the point (3, 1.5), which lies on the line x = 3. *[that point breaks x + y <= 4]*
3. *(tie)* For the objective x + y the lesson's region has two corners worth 4. What does that mean?
   - A. One of the two corners is a rounding error in the drawing of the region. *[both values are exact]*
   - B. The solver has failed, and the problem is infeasible as it stands now. *[the region is feasible]*
   - C. The optimum lies only at the midpoint of the edge between the corners. *[every point on the edge ties]*
   - D. The whole edge between them is optimal, so the best point is not unique. **(correct)**
4. *(infeasible)* You add x + y >= 5 to a model that already requires x + y <= 4. What does the lesson report?
   - A. Unbounded: the objective grows without limit inside the new region. *[that needs an open region]*
   - B. Feasible, with a smaller region shaded where the constraints overlap. *[the overlap is empty]*
   - C. Infeasible: no point satisfies both, and the two clashing constraints are named. **(correct)**
   - D. Optimal at the origin, since all constraints are relaxed together. *[the origin breaks the new constraint]*
5. *(integer)* For x + 2y the LP optimum is (2.5, 1.5) worth 5.5. What does rounding to a whole point give?
   - A. The point (3, 2), worth 7, which turns out to be the integer optimum. *[that point is infeasible]*
   - B. Rounding leaves the region; the best whole point is worth 5. **(correct)**
   - C. The point (2, 1), worth 4, which turns out to be the integer optimum. *[a feasible point, but not the best]*
   - D. The point (2.5, 1.5) itself, since integer programs allow fractional values. *[integers are required]*
**Honesty and provenance.** `Provenance toy` ("two variables, at most six constraints: real models have thousands and are solved by simplex or interior-point codes"); `ClaimLabel theorem` on "a linear objective over a bounded convex polygon reaches its best value at a vertex" (argued, checked on 200 seeded LPs) and on Helly's theorem for the clash; `Provenance from-memory` on "simplex can take exponentially many steps on contrived inputs (Klee-Minty, 1972) yet is fast in practice" and "interior-point methods are polynomial (Karmarkar, 1984)". **Verify against:** Dantzig (1947) for simplex, Klee and Minty (1972), Karmarkar (1984), all named from memory.
**Kit.** `Plot2D` (`Polygon`, `Curve`, `Points` draggable, `HLine`), `components/useDragPoint`, `.data-table`, `Slider`, `Toggle`, `ChipButton`, `Stat`, `ClaimLabel` theorem (K4-8), `Provenance`, `useScenePicker`. **Kit missing:** none (`lp2d` stays local, one user, as `tier4-technical.md` §4.1 says). K4-8's user list should add this lesson.
**Phone.** One plot at 356; each constraint is a card with three sliders, collapsed to a one-line summary except the one being edited; the vertex table wraps; the plot has a keyboard-movable handle per line.
**Risks.** Vertex enumeration with the wall adds near-degenerate intersections when constraints are almost parallel; compare with a tolerance (1e-9) and test slider extremes. Degenerate vertices (three lines through one point, as in the original example where b2 = 6) must not duplicate vertices: de-duplicate with the same tolerance.


---

##### Batch T4-B5 · Strings, trees & strategy (`dsa`, `math`)
Wave 2, the light relief batch. **[domain review]** `online-algorithms`, `game-theory` (one reviewer); the three structure lessons are tested against brute force and make no claim about a real system. Build order as listed; `suffix-arrays`, `aho-corasick` and `lca-binary-lifting` need no new kit; `online-algorithms` and `game-theory` need **K4-8** (`ClaimLabel kind="theorem"`, built in the kickoff round). No lesson in this batch links another (no new-to-new edges), and none links a Tier 4 lesson by id.

**`suffix-arrays` · Suffix Arrays & Suffix Trees**
Track `dsa` · *"Index every substring at once"* · Priority nice · Builds on: `tries`, `sorting`, `binary-search` · no domain flag
**Starts where the neighbours stop.** `tries` taught prefix trees and `kmp` single-pattern matching; `inverted-index` indexes words. This lesson owns the **sorted-suffix index and the LCP column**. Out of scope: trie mechanics, KMP, linear-time construction (SA-IS, DC3: named only), the suffix tree itself (described in one scene sentence as "the suffix array plus the LCP column is a suffix tree flattened into arrays"; not built), Burrows-Wheeler (named).
**Toy and wrong move.** The learner **sorts the suffixes by hand**. Wrong moves, exact text (computed from the two strings):
- A pair out of order: *"anana sorts before banana: at position 0, 'a' comes before 'b'."*
- The prefix rule: *"ana sorts before anana: ana is a prefix of anana, and a suffix that ends first sorts first (think of an end marker that sorts before every letter)."*
- Searching an empty pattern: *"An empty pattern matches at every position: type at least one character."*
**Spec.**
- **Scene 1 · Sort the suffixes.** Text up to 16 printable characters (default `banana`; presets `mississippi`, `aa`, `abracadabra`; compared by UTF-16 code unit, said on screen if an emoji is typed). The n suffixes are listed unsorted; the learner reorders with move-up and move-down buttons or a drag handle (keyboard twin); **Check order** names the first out-of-order adjacent pair with the reason above; **Sort for me** reveals the suffix array SA.
- **Scene 2 · LCP and repeats.** The LCP column (longest common prefix of each suffix with the previous sorted one, entry 0 = 0), the maximum highlighted as the **longest repeated substring**, and the count of distinct substrings n(n+1)/2 - sum(LCP).
- **Scene 3 · Search.** A pattern field (up to 8 characters). The page shows the **lower-bound** and **upper-bound** binary searches over SA (each probe compares only the first |p| characters of the probed suffix), the resulting range [lo, hi), its width as the occurrence count, and the text positions SA[lo..hi).
- **Scene 4 · What building costs.** A random string (alphabet 2, 4 or 26; length 16 to 1,000, default 200, `SeedField`) and the worst case `aaa...a`; the lesson counts the comparator's calls and the characters it compares while sorting, and plots both against n from real runs. Constructions named, not built, wear a chip.
**Model and tests.** `model.ts`: `suffixArray` (comparator sort with the shorter-first rule), `lcpKasai`, `lowerBound` and `upperBound`, `distinctSubstrings`. Hand-worked vectors:
- **banana**: suffixes 0 banana, 1 anana, 2 nana, 3 ana, 4 na, 5 a sort to a (5), ana (3), anana (1), banana (0), na (4), nana (2): **SA = [5, 3, 1, 0, 4, 2]**. LCP (entry 0 is 0): lcp(a, ana) = 1, lcp(ana, anana) = 3, lcp(anana, banana) = 0, lcp(banana, na) = 0, lcp(na, nana) = 2, so **LCP = [0, 1, 3, 0, 0, 2]**, sum 6, longest repeated substring **ana** (maximum 3), distinct substrings 6 x 7 / 2 - 6 = 21 - 6 = **15**.
- Searches on banana: ana gives lower bound 1 (probes at SA positions 3, 1, 0) and upper bound 3 (probes 3, 1, 2), range [1, 3), **2 occurrences** at text positions 3 and 1; a gives [0, 3), **3** occurrences (5, 3, 1); na gives [4, 6), 2 occurrences (4, 2); banana gives [3, 4), 1 occurrence; nab and x give empty ranges, 0 occurrences. Each bound takes at most ceil(log2 7) = 3 probes.
- **mississippi**: SA = [10, 7, 4, 1, 0, 9, 8, 6, 3, 5, 2], LCP = [0, 1, 1, 4, 0, 0, 1, 0, 2, 1, 3] (sum 13), longest repeated substring **issi**, distinct substrings 66 - 13 = **53**. **aa**: SA = [1, 0], LCP = [0, 1], 2 distinct substrings.
**Independent oracles.** Exhaustive over **all 2,046 strings over {a, b} of length 1 to 10** and every pattern of length 1 to 4 (30 patterns): SA equals a naive sort of all `slice(i)` strings; LCP equals the definition computed by direct comparison (independent of Kasai); occurrence positions equal repeated `String.prototype.indexOf` (overlapping allowed); distinct substrings equal the size of a `Set` of all `slice(i, j)`. Seeded random strings over a 4-letter alphabet (500 of length up to 40) repeat the same checks.
**Broken mode (rule 29).** The prefix rule inverted (a suffix that ends first sorts *after* the longer one). Shortest witness **`aa`**: correct SA [1, 0], broken [0, 1]. The broken mode is wrong on 2,026 of the 2,046 binary strings (**99.0%**), over the 90% cap, so the page shows the witness (the failing rule: "ana must sort before anana") rather than a rate; the test asserts the rule and that the fixed mode matches the oracle on all 2,046.
**Try this** (default: text `banana`, scene 1, suffixes in text order).
1. Press Check order: the first out-of-order pair is named, "anana sorts before banana: at position 0, 'a' comes before 'b'".
2. Press Sort for me: SA = 5, 3, 1, 0, 4, 2.
3. Open scene 2: LCP 0, 1, 3, 0, 0, 2; the longest repeated substring is ana; 15 distinct substrings.
4. In scene 3 type `ana`: range [1, 3), 2 occurrences at positions 3 and 1.
5. Type `nab`: an empty range, 0 occurrences.
**Quiz seeds.** Misconception: *a suffix array stores every substring*. Question 5 recomputes 15 from 21 - 6.
1. *(what it stores)* The suffix array of banana is [5, 3, 1, 0, 4, 2]. What do those numbers say?
   - A. The sorted letters of banana, each one replaced by its alphabet rank. *[numbers are positions, not letters]*
   - B. Where each suffix starts, listed in sorted order of the suffixes. **(correct)**
   - C. The positions of the letter a first, then the positions of b and n. *[groups by letter only]*
   - D. The lengths of the six suffixes, sorted from the shortest to the longest. *[5 is a start, not a length]*
2. *(misconception)* Someone says a suffix array stores every substring of the text. What is the accurate picture?
   - A. It holds only n start positions; any substring is a prefix of some suffix, found by binary search. **(correct)**
   - B. It stores all n(n+1)/2 substrings, sorted, which is why it needs so much memory. *[that is the substring list, not the array]*
   - C. It stores one string per distinct letter and rebuilds the rest on demand later. *[no such structure]*
   - D. It stores only the repeated substrings, which it finds with the LCP column. *[LCP is an extra column]*
3. *(search)* Binary search for ana in the sorted suffixes of banana lands on the range [1, 3). How often does ana occur?
   - A. Once, at the first position listed in that range, which is the earliest hit. *[the range has two entries]*
   - B. Three times, because the range covers positions 1 to 3 inclusive of both ends. *[the end is exclusive]*
   - C. Never, because no single suffix of banana is exactly equal to the word ana. *[prefix matches count]*
   - D. Twice, at text positions 3 and 1; the range width is the count. **(correct)**
4. *(LCP)* The LCP column of banana is 0, 1, 3, 0, 0, 2. What is the longest substring that occurs at least twice?
   - A. banana, because the whole word is also a suffix of the word itself. *[it occurs once]*
   - B. na, because the last entry of the LCP column is 2, the final value. *[2 is not the maximum]*
   - C. ana, because the largest common prefix between neighbouring suffixes is 3. **(correct)**
   - D. a, because it is the first suffix to appear in the sorted suffix order. *[sorted order is not repetition]*
5. *(counting)* How many different substrings does banana have?
   - A. 21, because a word of 6 letters has 6 times 7 over 2 substrings. *[counts repeats]*
   - B. 15: the 21 start-and-length pairs minus 6 repeats. **(correct)**
   - C. 6, one substring for each of the six starting positions in the word. *[counts suffixes]*
   - D. 12, one for each start position paired with each possible length. *[arbitrary product]*
**Honesty and provenance.** Nothing is simulated: "every comparison is counted from the run you see". `Provenance from-memory` on real uses (genome indexing, the Burrows-Wheeler transform behind some compressors, full-text indexes; **verify against** a text such as Gusfield, *Algorithms on Strings, Trees and Sequences* (1997)) and on linear-time construction (SA-IS, Nong, Zhang and Chan, 2009: named from memory). The cost scene says it counts comparisons, not CPU time.
**Kit.** `ArrayStrip` (suffix rows, `pointers`), `CodePanel` optional, `TextField` (sanitised), `ChipButton`, `Stat`, `Plot2D` (`Curve`) for the cost scene, `SeedField`, `Segmented`, `WideRegion`, `useScenePicker`, `Provenance`. **Kit missing:** none.
**Phone.** The suffix list is a single column of full-width rows; the probe table and LCP column wrap; the cost plot is 356 wide. No `minWidth`.
**Risks.** Sorting 1,000 suffixes of `aaa...a` with counted comparisons must not freeze the page (cap n at 1,000, run in one frame budget or chunk it). The broken mode is a witness, not a rate, by design.

**`aho-corasick` · Aho-Corasick Multi-Pattern Matching**
Track `dsa` · *"Search for a thousand words in one pass"* · Priority nice · Builds on: `tries`, `kmp` · no domain flag
**Starts exactly where `kmp` stops.** `kmp` ends with the failure function of one pattern and a text pointer that never moves back; this lesson generalises the *failure link* to a trie of many patterns. Out of scope: KMP's own failure table (`kmp`), trie insertion mechanics (`tries`), regular expressions (`regex-engines`), `core/automata` (a different structure; the trie here is hand-built, and the lesson does not reuse it).
**Toy and wrong move.** The learner **assigns the failure links by hand** in breadth-first order. Wrong moves, exact text (computed):
- Pointing at a deeper or equal string: *"A failure link must point to a shorter string. For 'sh' the longest proper suffix that is also a pattern prefix is 'h' (state 1), not 'she'."*
- Pointing at the root when a longer suffix exists: *"Not the longest: 'h' (state 1) is also a suffix of 'sh' and a prefix of 'he', so the link goes there, not to the root."*
Tests `manipulation 1` and `manipulation 2` assert both.
**Spec.**
- **Pattern editor.** Up to 6 patterns, 1 to 6 lowercase letters each, 24 letters in all. Refusals: empty ("a pattern needs at least one letter"), duplicate ("he is already a pattern"), characters outside a to z ("lowercase letters only in this lesson"). Default patterns he, she, his, hers.
- **Scene 1 · The trie.** The trie of the patterns (`GraphView`, hand-built), states numbered in insertion order, pattern ends drawn as double rings.
- **Scene 2 · Failure links, by hand.** States are offered in BFS order; the learner clicks a target for each; correct links draw dashed `--violet`; wrong ones are refused as above. **Reveal** fills the rest. A second row shows **output links** (skip from a state to the nearest state on its failure chain that ends a pattern).
- **Scene 3 · Stream the text.** A text field (up to 24 letters, default `ushers`) and a step player: a token moves along trie edges; on a missing edge it follows failure links (each follow counted `--info`); on arriving at a state it reports that state's pattern and then every pattern reached by output links (`--ok`).
- **Scene 4 · Count the work.** Characters read, failure follows and matches for the run, beside the **naive** cost of scanning once per pattern (characters compared, counted by running the naive matcher). The bound "failure follows are at most the text length" is derived from the two counters on screen (depth rises by at most 1 per character and every follow lowers it).
**Model and tests.** `model.ts`: `buildTrie`, `failureLinks` (BFS), `outputLinks`, `scan`. Hand-worked vectors for **he, she, his, hers**:
- States by insertion order: 0 root; 1 h; 2 he; 3 s; 4 sh; 5 she; 6 hi; 7 his; 8 her; 9 hers. Failure links: 1, 2, 3, 6, 8 go to the root; **4 (sh) to 1 (h)**; **5 (she) to 2 (he)** (goto(fail(sh) = h, e) = he); **7 (his) to 3 (s)**; **9 (hers) to 3 (s)**. Output link: only 5 to 2 (she ends a pattern and its failure state he ends one too).
- **ushers** (positions 0 to 5): states after each character 0 (u), 3 (s), 4 (h), 5 (e), then r: state 5 has no r edge, follow fail(5) = 2, goto(2, r) = 8 (her), then s: 9 (hers). Matches: **she at 1 to 3 and he at 2 to 3** (both reported at the e, the second through the output link), **hers at 2 to 5**: 3 matches. 6 characters read, **1 failure follow**. Naive scanning per pattern compares he 6 + she 6 + his 5 + hers 6 = **23** characters.
- **hishers** (7 letters): his at 0, she at 2, he at 3, hers at 3.
- A second pattern set {a, ab, bab, bc, bca, c, caa} on `abccab`: a at 0, ab at 0, bc at 1, c at 2, c at 3, a at 4, ab at 4 (7 matches).
**Independent oracles.** A naive multi-pattern scan (every pattern at every alignment, overlapping and nested matches included) on **500 seeded (pattern set, text) pairs** (2 to 6 patterns of length 1 to 4 over {a, b, c}, texts up to 30; the prototype found 0 mismatches); failure links against the definition (the longest proper suffix of the state's string that is a trie prefix, found by trying every suffix); outputs against "every pattern that is a suffix of the state's string"; **exhaustive** over all 511 texts of length 1 to 8 over {a, b} for three fixed pattern sets. The trie is built independently of `core/automata` and a test asserts the lesson imports nothing from it.
**Broken mode (rule 29).** **No output links** (report only the pattern that ends at the current state). On the prototype's 500 seeded sets it misses a nested match on **218 (43.6%)**, lowest seed 1. Seed-free witness: **ushers** reports she and hers and **misses he at 2 to 3**. The test asserts the rule ("a pattern that ends here as a suffix of the state's string is missing") and that the fixed mode matches the naive scan on all 500.
**Try this** (default: patterns he, she, his, hers, text `ushers`, scene 3).
1. Press Play: matches she at 1, he at 2 and hers at 2, with one failure follow at the r.
2. Step to the e: the state is she, and the output link to he is drawn.
3. In scene 2 click sh, then she as its target: refused ("must point to a shorter string ... 'h' (state 1)").
4. Change the text to `hishers` and Play: his at 0, she at 2, he at 3, hers at 3.
5. In scene 4 the failure follows (2 for this text) never exceed the 7 characters read.
**Quiz seeds.** Misconception: *run KMP once per pattern is as good*. Question 4 is about output links; question 5 about the amortised bound.
1. *(misconception)* Why is Aho-Corasick better than running KMP once for every pattern?
   - A. It compares fewer characters per alignment than KMP does for one pattern. *[KMP never realigns either]*
   - B. The text is read only once, however many patterns the automaton holds. **(correct)**
   - C. It needs no failure links at all, so it is simpler than plain KMP. *[it uses failure links]*
   - D. It reports only the longest pattern at each position, which saves work. *[it reports all matches]*
2. *(trace)* Patterns he, she, his, hers are searched in ushers. Which matches end at the same position?
   - A. she and he, which both end at position 3 because he is a suffix of she. **(correct)**
   - B. his and hers, both ending at position 5, because they share the letter h. *[neither occurs at position 5 together]*
   - C. she and hers, both ending at position 5, since hers continues she. *[she ends at 3]*
   - D. None: each position of the text reports at most one pattern. *[the output link reports both]*
3. *(failure link)* What does the failure link of a state point to?
   - A. The state of the shortest pattern that contains its string somewhere inside. *[not a containment link]*
   - B. The parent of the state, whose string is one letter shorter than its own. *[that is the trie edge reversed]*
   - C. The root of the trie, unless the string is already a complete pattern. *[links often point deeper]*
   - D. The longest proper suffix of its string that is a pattern prefix. **(correct)**
4. *(output links)* Why does the automaton keep output links as well as failure links?
   - A. They replace the failure links once the trie has been fully built up. *[both stay]*
   - B. They store the text position at which each pattern was last found. *[positions come from the scan]*
   - C. A pattern can end inside a longer one, and the link finds it quickly. **(correct)**
   - D. They are only needed when two of the patterns happen to be equal. *[duplicates are not the case]*
5. *(bound)* The text has n characters. How many failure-link follows can a whole scan make?
   - A. At most n per character, so about n squared in the worst possible case. *[amortised, not per character]*
   - B. At most n in total, since each follow lowers the depth. **(correct)**
   - C. Exactly one per character of the text, and never more than that one. *[can be zero or several at once]*
   - D. About as many as the total length of all the patterns put together. *[independent of pattern length]*
**Honesty and provenance.** Nothing is simulated. `ClaimLabel standard` on the algorithm's name (Aho and Corasick, 1975, named from memory); `Provenance from-memory` on "used in fixed-string search tools, intrusion-detection and content filters" (**verify against** each tool's documentation before naming one; the spec names none). "Characters compared" counts the naive matcher in this lesson, not a real library.
**Kit.** `GraphView` (trie, links as dashed edges), `ArrayStrip` (text row, `pointers`), `usePlayer` with a memoised frame list (a module-level builder keyed by patterns and text), `TextField`, `ChipButton`, `Stat`, `WideRegion`, `useScenePicker`. **Kit missing:** none.
**Phone.** The trie (up to 25 states) is in a `StageFrame minWidth` of about 560 and scrolls sideways; the text strip is in a `WideRegion` that follows the token (`reveal`); the counters sit above.
**Risks.** Frames must be memoised on (patterns, text) or the step player crashes (the Tier 3 class). Numbering of states in insertion order must be stable under pattern edits (renumbered after every edit, shown).

**`lca-binary-lifting` · Lowest Common Ancestor & Binary Lifting**
Track `dsa` · *"Jump up the tree in powers of two"* · Priority nice · Builds on: `tree-traversals`, `trees-bst` · no domain flag
**Starts where the neighbours stop.** `tree-traversals` fixes visit order and `trees-bst` search order; `segment-trees` answers range queries. This lesson owns the **jump table** `up[k][v]` and the 2^k climb. Out of scope: Euler tour with range-minimum and Tarjan's offline LCA (named only), traversal order, range-query trees.
**Toy and wrong move.** The learner **plays the climb**: chooses the jumps. Wrong moves, exact text (computed):
- Filling a table cell wrongly: *"up[1][6] is the grandparent of 6: parent(6) = 3 and parent(3) = 1, so it is 1, not 3."*
- Jumping when the landing nodes are equal: *"The landing nodes are equal (0 and 0): this jump reaches or passes the LCA, so skip it."*
- Skipping a jump whose landing nodes differ: *"The landing nodes differ (3 and 4), so this jump keeps both below the LCA: take it."*
- Asking for a k-th ancestor with a jump larger than the remainder: *"2^3 = 8 is more than the 5 steps still to climb."*
Tests `manipulation 1` to `manipulation 3`.
**Spec.**
- **Scene 1 · Build the table.** A rooted tree of up to 16 nodes (default **T0**, 12 nodes; **Add leaf** takes a parent, refused "a node needs an existing parent"); levels k = 0 to K - 1 with K = max(1, ceil(log2 n)) (12 nodes: 4 levels; 13 to 16 nodes stay at 4). The learner fills level 1 by clicking the node two parents up (checked per cell) and sees level k computed as up[k][v] = up[k-1][up[k-1][v]]; **Fill the rest** reveals.
- **Scene 2 · k-th ancestor.** Choose a node and k (0 to its depth; larger refused "node 10 is only 5 levels deep"); the learner presses the binary digits of k as jumps.
- **Scene 3 · LCA.** Click two nodes (default 10 and 8). Phase 1: lift the deeper node by the depth difference, choosing the jump sizes. Phase 2: for k from the top level down, **jump or skip** (the wrong choices are refused as above). The answer is the common parent. Counters: jumps taken against parent steps of the naive walk.
- **Scene 4 · Count the work.** For a path of n nodes (16, 64, 256, 1,024) the jumps for lca(deepest, root) against n - 1 parent steps, from real runs.
**Model and tests.** `model.ts`: `buildTable`, `kthAncestor`, `lca` returning the jump log. **T0** parents (node: parent): 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 3, 7: 3, 8: 4, 9: 6, 10: 9, 11: 5; depths 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 5, 3; the root is its own parent in the table. Hand-worked vectors:
- Level 0 (parents) 0,0,0,1,1,2,3,3,4,6,9,5; level 1 (grandparents) 0,0,0,0,0,0,1,1,1,3,6,2; level 2 (4th ancestors) 0,0,0,0,0,0,0,0,0,0,1,0; level 3 all 0. Check up[2][10]: ancestors of 10 are 9, 6, 3, 1, so the 4th is 1; up[1][6]: 3, 1, so 1.
- **lca(10, 8) = 1**: depths 5 and 3, difference 2 = 10b, lift 10 by 2^1 to 6 (up[1][10] = 6); now both at depth 3: k = 3: up 0 and 0, equal, skip; k = 2: 0 and 0, skip; k = 1: up[1][6] = 1 and up[1][8] = 1, equal, skip; k = 0: up[0][6] = 3 and up[0][8] = 4, differ, jump to (3, 4); the common parent is 1. **2 jumps** against the naive walk 10 to 9 to 6 (2 steps), then 6 to 3 to 1 and 8 to 4 to 1 (4 steps) = **6 parent steps**; distance = 5 + 3 - 2 x 1 = 6.
- **lca(10, 11) = 0**: lift 10 by 2^1 to 6 (11 is at depth 3); k = 1: up[1][6] = 1 and up[1][11] = 2 differ, jump to (1, 2); k = 0: up[0][1] = 0 and up[0][2] = 0 equal, skip; parent of 1 is 0. 2 jumps. **lca(9, 6) = 6** with 1 jump (lift 9 by 2^0); **lca(7, 7) = 7**, 0 jumps.
- **5th ancestor of 10** = root 0: 5 = 101b, jump 2^2 (up[2][10] = 1) then 2^0 (up[0][1] = 0): 2 jumps.
- Path of n nodes, lca(deepest, root) takes popcount(n - 1) jumps: n = 16: 4 (against 15 steps), 64: 6 (63), 256: 8 (255), 1,024: 10 (1,023).
**Independent oracles.** The naive parent-walk LCA and k-th ancestor on **all 720 parent arrays of 7 nodes** (every tree in which each node's parent has a smaller number) and all pairs, plus the 24 and 120 arrays of 5 and 6 nodes (the prototype found 0 mismatches), plus seeded random trees of 8 to 200 nodes including a path, a star and a caterpillar, all pairs on the small ones and 2,000 sampled pairs on the large ones.
**Broken mode (rule 29).** The table is **one level short** (K - 1 levels). It is wrong only on trees deeper than the table can climb: on the 720 seven-node trees it fails on **6 (0.8%)**, and on every path of 5 or more nodes. Named counterexample: parents [0, 0, 0, 1, 3, 4, 5], query (2, 6): the depth difference 4 = 100b needs a level 2 jump the broken table lacks, so the nodes never reach one depth and the answer is wrong. A second broken variant (no depth equalisation) fails 719 of 720 and is shown as a witness only. The test asserts both fail the oracle and the fixed mode passes all.
**Try this** (default: tree T0, scene 3 with nodes 10 and 8 selected; scene 1 is the opening scene, so the list starts there).
1. In scene 1 press Fill the rest: the four levels match the vectors above.
2. In scene 3 take the equalising jump of 2^1: node 10 lands on 6.
3. At k = 1 press Jump: refused, the landing nodes are equal (1 and 1).
4. At k = 0 press Jump: allowed (3 and 4); the answer is node 1 after 2 jumps against 6 naive parent steps.
5. Select nodes 10 and 11: the answer is node 0 with 2 jumps.
**Quiz seeds.** Misconception: *lift both nodes with the same jumps from the start*. Question 4 sizes the table (20 levels for 1,000,000 nodes).
1. *(table)* What does up[k][v] hold in the jump table?
   - A. The k-th child of v, counted in left-to-right order among its children. *[children, not ancestors]*
   - B. The 2^k-th ancestor of v, or the root if the tree is not that tall. **(correct)**
   - C. The ancestor of v that sits exactly k levels above it in the tree. *[that is 2^k levels]*
   - D. The number of nodes in the subtree hanging k levels below the node v. *[a different table]*
2. *(misconception)* Why must the deeper node first be lifted to the depth of the other?
   - A. So that equal jumps land at equal depths and can be compared. **(correct)**
   - B. Because jumps are only allowed to start from nodes deeper than level 2. *[no such rule]*
   - C. To make the two nodes meet at the root of the tree before comparing. *[they meet at the LCA]*
   - D. So that the table needs only one level instead of about log n levels. *[the table is unchanged]*
3. *(rule)* Both nodes are at the same depth and the jump of size 2^2 lands them on the same node. What do you do with that jump?
   - A. Take it, because equal landing nodes mean that you have found the LCA already. *[the LCA may be lower]*
   - B. Take it, and then jump again by 2^2 to confirm the meeting node found. *[overshoots]*
   - C. Restart the query with the other node treated as the deeper of the two. *[depths are already equal]*
   - D. Skip it: it reaches the LCA or higher, so only differing landings are taken. **(correct)**
4. *(size)* A tree has 1,000,000 nodes. How many levels does the jump table need?
   - A. 10, because 2^10 is already about a thousand, which is plenty for any query. *[too few for depth near a million]*
   - B. 1,000, one for each possible number of steps up that a jump may take. *[linear, not logarithmic]*
   - C. 20 levels, since 2^20 is 1,048,576, enough to reach the root from any node. **(correct)**
   - D. 6, one for each digit of the node count when written out in decimal form. *[arbitrary]*
5. *(cost)* What do you pay for answering each LCA query in O(log n)?
   - A. Nothing, because the table is built while the queries run, using no extra memory. *[the table takes memory]*
   - B. About n log n table entries, built once, instead of O(n) parent walks. **(correct)**
   - C. A table of n squared entries, one for each pair of nodes in the tree. *[far larger than needed]*
   - D. A sorted copy of the tree, searched by binary search over the node labels. *[not how lifting works]*
**Honesty and provenance.** Nothing is simulated. `Provenance from-memory` on uses ("tree path queries in file systems, org charts, phylogenies"; commit graphs are directed acyclic graphs, not trees, so this exact method does not apply there: the page says so; **verify** any named system before naming it). `ClaimLabel standard` on the O(n log n) space and O(log n) query bounds (derived on screen from the table height).
**Kit.** `TreeSvg` (clickable nodes, `nodeMark`, one tab stop), `CellGrid` (the table), `ChipButton`, `Stat`, `Plot2D` for scene 4 optional, `useScenePicker`. **Kit missing:** none.
**Phone.** The 16-node tree fits 356 wide; the table scrolls in a `WideRegion` (about 480); the jump or skip buttons sit under the tree.
**Risks.** The root-is-its-own-parent convention must be stated on screen or the table's zeros read as "node 0 is an ancestor of everything", which is true only at the top; the lesson shows the clamp.

**`online-algorithms` · Online Algorithms & Competitive Analysis**
Track `dsa` · *"Decide now, without seeing the future"* · Priority nice · Builds on: `lru-cache`, `amortized-analysis`, `randomized-algorithms` · **[domain review]**
**Starts where the neighbours stop.** `lru-cache` taught how LRU evicts; `amortized-analysis` averaged cost over a sequence; `randomized-algorithms` separated Las Vegas from Monte Carlo. This lesson owns the **competitive ratio** against the hindsight optimum and the adversary. Out of scope: how LRU works, amortised cost, randomised online algorithms (the e/(e-1) ski-rental ratio is named only, in a chip).
**Toy and wrong move (rule 30).** The learner is the **adversary**: they choose when the ski season ends, then each request to a paging cache. Wrong moves, exact text:
- Challenging a ratio that cannot be reached: target 2.00 against the break-even strategy: *"No season length up to 60 reaches ratio 2.00 against this strategy: the best is N = 10 at 1.90 = 2 - 1/10. For N above B the ratio stays at (2B - 1) / B, so longer seasons cannot help (read off the formula, not found by search)."*
- Declaring 'never buy' competitive: *"Never buying is not competitive: at season length 60 the ratio is 60 / 10 = 6.0, and it equals N / B, which grows without bound."*
Tests `manipulation 1` and `manipulation 2` assert both through the model; a third checks that against threshold 10 the same challenge **succeeds** (N = 11, ratio 2.00).
**Spec.**
- **Scene 1 · Ski rental.** Buy price B (slider 2 to 50, default 10), threshold t (0 to 3B, default B - 1: rent t days, buy on day t + 1; clamped when B shrinks and the page says so), a **never buy** `Toggle`, season length N (1 to 6B, default 11). A `Plot2D` shows online cost, optimum min(N, B) and the ratio curve over N with the line 2 - 1/B. Stats at N: online cost, optimum, ratio.
- **Scene 2 · Be the adversary.** Days reveal one at a time; the learner clicks the day the season ends (or sets N) to maximise the ratio; a target-ratio field (`parseBoundedDecimal`, 1.00 to 20.00) starts the **Challenge**; a second panel sweeps every threshold and shows the worst-case ratio of each, minimised at t = B - 1.
- **Scene 3 · Paging.** Cache size k (2 to 4, default 3), pages 1 to k + 1. The learner requests pages one at a time; the LRU cache, hits, misses and the offline optimum (Belady, farthest in future) for the same sequence update after each request; **Autopilot** requests the lowest-numbered page not in LRU's cache. Ratio shown with k.
**Model and tests.** `model.ts`: `skiCost(t, B, N)` = N if N <= t else t + B, `opt(B, N)` = min(N, B), `worstRatio(t, B)`, `lruMisses`, `beladyMisses`. Hand-worked vectors, B = 10:
- Break-even t = 9: N = 5 gives 5 / 5 = **1.00**; N = 9 gives 9 / 9 = **1.00**; N = 10 gives (9 + 10) / 10 = **1.90**; N = 11 gives 19 / 10 = 1.90; N = 100 gives 19 / 10 = 1.90. The worst case is 2 - 1/B = 1.90.
- Buy at once (t = 0): N = 1 gives 10 / 1 = **10.00**; N = 5 gives 10 / 5 = 2.00; N = 100 gives 10 / 10 = 1.00. Threshold t = 10: N = 10 gives 1.00, N = 11 gives (10 + 10) / 10 = **2.00**. Never buy: N / B, 6.0 at N = 60.
- Paging, k = 3, requests 1 2 3 4 repeated 3 times (12 requests): LRU misses all **12**; the optimum misses at requests 1, 2, 3, 4, 7 and 10 = **6** (at request 4 it evicts 3, whose next use is farthest; at request 7 it evicts 2; at request 10 it evicts 1); ratio 2.0. The Autopilot over 30 requests: LRU 30, optimum 12, ratio **2.5**, climbing toward k = 3.
**Independent oracles.** **Exhaustive:** for every B from 1 to 50, every threshold t from 0 to 3B and every season length N from 1 to 6B, the worst ratio is at least 2 - 1/B and is exactly 2 - 1/B only at t = B - 1 (the prototype confirms this for all 50 values of B; since every deterministic ski-rental strategy is a threshold, this covers all of them within the bound, and the page says "checked for B up to 50", with the lower-bound argument as a `ClaimLabel theorem`). Closed form: for t below B the worst ratio is (t + B) / (t + 1). Paging: Belady's misses against a dynamic program over all cache contents (independent of the farthest-in-future rule) on 500 seeded sequences of length up to 14 with k from 2 to 4; LRU misses at most k times the optimum on 500 seeded sequences of length 40 (prototype: 0 violations, maximum ratio 1.91), a bound on the seeded set.
**Broken mode (rule 29).** The break-even **threshold off by one** (t = B, buying a day late). The claimed bound 2 - 1/B is violated for every N above B: witness **N = 11, ratio 20 / 10 = 2.00 against 1.90**. It fails on 190 of the 200 season lengths (**95%**), over the 90% cap, so the page shows the witness; the test asserts the violated claim and that the fixed mode satisfies the bound for all N up to 200.
**Try this** (default: scene 1, B = 10, t = 9, N = 11).
1. Read the stats: online 19, optimum 10, ratio 1.90.
2. Drag N to 9: ratio 1.00 (the strategy never bought).
3. Set t = 0 and N = 1: ratio 10.00 (buying at once against a one-day season).
4. Open scene 2 (default strategy t = 9) and challenge a target of 2.00: refused with the best N = 10 at 1.90.
5. In scene 3 press Autopilot for 12 requests: LRU 12 misses, optimum 6.
**Quiz seeds.** Misconception: *a competitive ratio is an average*. Question 5 contrasts LRU with the optimum on the cyclic sequence.
1. *(misconception)* What does a competitive ratio of 1.9 mean for break-even ski rental with a purchase price of 10 days of rent?
   - A. The cost is 1.9 times the optimum on an average season, but not always. *[a worst-case claim, not an average]*
   - B. On every possible season length it pays at most 1.9 times the hindsight optimum. **(correct)**
   - C. The strategy is 90 percent likely to match the optimum on a random season. *[not a probability]*
   - D. The strategy beats the hindsight optimum by 1.9 days on a typical season. *[optimum cannot be beaten]*
2. *(arithmetic)* Rent for 9 days, then buy (price 10), and the season ends on day 11. What do you pay, and what was optimal?
   - A. You pay 19, while buying at once would have cost 10, so the ratio is 1.9. **(correct)**
   - B. You pay 11, since renting all 11 days is optimal and the ratio is exactly 1. *[ignores the purchase]*
   - C. You pay 10, while the optimum was only 5, which makes the ratio exactly 2. *[arbitrary numbers]*
   - D. You pay 20, while the optimum was 11, which makes the ratio about 1.8. *[buys a day too late]*
3. *(adversary)* Why can no season length push the ratio of break-even to 2 or more?
   - A. The adversary does not know the strategy in advance, so it cannot aim at it. *[the adversary knows it]*
   - B. The season cannot exceed 100 days in the lesson, which caps the ratio below 2. *[a cap is not the reason]*
   - C. Randomisation hides the purchase day, so the adversary cannot time its attack. *[break-even is deterministic]*
   - D. Its cost tops out at 2B - 1 against an optimum of B, so 2 - 1/B. **(correct)**
4. *(extreme)* What happens to a strategy that buys on day 1 every time?
   - A. Nothing bad: buying at once is optimal for every season length. *[not for short seasons]*
   - B. It pays twice the optimum on every season length, short or long. *[only break-even gets near 2]*
   - C. On a one-day season it pays 10 times the optimum. **(correct)**
   - D. It is optimal for short seasons and ten times worse for long ones. *[reversed]*
5. *(paging)* LRU with 3 cache slots serves 1, 2, 3, 4 repeated. How does it compare with the optimum?
   - A. LRU misses once per cycle of four, while the optimum never misses at all. *[LRU misses all four]*
   - B. LRU misses every request; the optimum misses about a third of them. **(correct)**
   - C. Both miss on every request, so the ratio between them is exactly 1. *[the optimum keeps pages]*
   - D. LRU is optimal here, since it evicts the page used least recently of all. *[that choice is the one hurt]*
**Honesty and provenance.** `Provenance toy` ("invented prices: renting costs 1 a day, buying costs B days of rent"); `ClaimLabel theorem` on "2 - 1/B is the best ratio any deterministic strategy can guarantee" (argued from the threshold form, checked for B up to 50) and on "LRU is k-competitive and no deterministic online paging algorithm does better" (Sleator and Tarjan, 1985, named from memory); `Provenance from-memory` on the randomised ratio e/(e-1) (about 1.58, named only). **Verify against:** Sleator and Tarjan, "Amortized efficiency of list update and paging rules", *CACM* 1985; Karlin, Manasse, Rudolph, Sleator (1988) for ski rental (both from memory).
**Kit.** `Plot2D` (`Curve`, `HLine`, `VLine` draggable), `CellGrid` (the cache), `ArrayStrip` (request row), `ClaimLabel` theorem (K4-8), `Provenance`, `Slider`, `Toggle`, `TextField` + `parseBoundedDecimal`, `ChipButton`, `Stat`, `useScenePicker`. **Kit missing:** none. K4-8's user list should add this lesson.
**Phone.** The ratio plot is 356 wide with the day axis thinned; the cache and request strip are separate rows; the adversary buttons wrap.
**Risks.** B up to 50 with N up to 300 and thresholds up to 150 makes the scene 2 sweep 150 x 300 evaluations: trivial, but cap them so the page cannot freeze. The "exhaustive for B up to 50" claim is bounded and must say so.

**`game-theory` · Game Theory Basics**
Track `math` · *"Strategy when others react"* · Priority nice · Builds on: `expected-value`, `probability-basics`, `game-tree-search` · **[domain review]**
**Starts where the neighbours stop.** `game-tree-search` is sequential minimax; `expected-value` weighs outcomes. This lesson owns **simultaneous** games: the payoff matrix, dominant strategies, Nash equilibrium and mixed strategies. Out of scope: minimax and pruning (`game-tree-search`), mechanism design and auctions (named), repeated games (named), cooperative games.
**Toy and wrong move (rule 30).** The learner **claims cells are equilibria** and edits payoffs to change what is stable. Wrong moves, exact text (computed from the matrix):
- Claiming a non-equilibrium cell: *"(Cooperate, Cooperate) is not an equilibrium: Row gains by switching to Defect (-1 becomes 0)."* (names the first profitable deviation, Row's before Column's.)
- Declaring "no equilibrium" on matching pennies in the pure-strategy view: *"Not quite: pure strategies have none, but a mixed equilibrium (1/2, 1/2) exists: against it each player earns 0 from heads and from tails."*
Tests `manipulation 1` and `manipulation 2`.
**Spec.**
- **Scene 1 · The matrix.** A 2 x 2 up to 3 x 3 payoff grid (integers -9 to 9 via `parseBoundedInt`, decimals refused "payoffs are whole numbers here"), presets: prisoner's dilemma, matching pennies, battle of the sexes, stag hunt. Best-response arrows (Row's best reply in each column, Column's in each row) and cells where both point are marked equilibria; a strictly dominated strategy is crossed out with the comparison ("Defect strictly dominates Cooperate for Row: 0 > -1 and -2 > -3"). A **Claim equilibrium** action on any cell.
- **Scene 2 · Mixed strategies (2 x 2).** Sliders for p (Row's chance of the first row) and q (Column's of the first column) with expected payoffs and indifference lines; the page computes the mixed equilibrium when one exists and shows both opponents indifferent there. Degenerate matrices (a zero denominator) say "no unique mixed equilibrium".
- **Scene 3 · Does every game have one?** Over all **65,536** 2 x 2 games with payoffs 0 to 3: how many have 0, 1, 2, 3 and 4 pure equilibria (histogram), and for the games with none, that the mixed formula yields a valid equilibrium in every one. Computed on opening the scene.
- **Scene 4 · Change the game.** Edit the prisoner's dilemma until cooperation is stable: the page shows the condition for a cell to be an equilibrium (no profitable deviation for either player) and names the cell that flips.
**Model and tests.** `model.ts`: `pureEquilibria`, `strictlyDominated`, `bestResponses`, `mixed2x2`. For payoffs A (Row) and B (Column) the mixed equilibrium is q* = (A22 - A12) / (A11 - A12 - A21 + A22) (Column's probability of the first column) and p* = (B22 - B21) / (B11 - B21 - B12 + B22) (Row's probability of the first row). Hand-worked vectors:
- **Prisoner's dilemma**, rows and columns (Cooperate, Defect): A = [[-1, -3], [0, -2]], B = [[-1, 0], [-3, -2]]. Against a cooperating Column, Row gets -1 (cooperate) or 0 (defect); against a defecting Column -3 or -2: defect wins both, so it strictly dominates. Pure equilibrium: **(Defect, Defect) only**, payoffs (-2, -2), worse for both than (Cooperate, Cooperate) = (-1, -1). Raising mutual cooperation to 1 for each player (A11 = B11 = 1) makes (Cooperate, Cooperate) a second equilibrium (a deviation gives 0 < 1), and (Defect, Defect) stays one.
- **Matching pennies**, A = [[1, -1], [-1, 1]], B = [[-1, 1], [1, -1]]: no pure equilibrium; q* = (1 - (-1)) / (1 - (-1) - (-1) + 1) = 2 / 4 = **1/2**, p* = (-1 - 1) / (-1 - 1 - 1 - 1) = -2 / -4 = **1/2**; value 0.
- **Battle of the sexes**, A = [[2, 0], [0, 1]], B = [[1, 0], [0, 2]]: pure equilibria **(O, O) and (F, F)**; q* = (1 - 0) / (2 - 0 - 0 + 1) = **1/3**, p* = (2 - 0) / (1 - 0 - 0 + 2) = **2/3**; expected payoff for each player 2/3 (Row: (2/3)(1/3)2 + (1/3)(2/3)1 = 4/9 + 2/9 = 6/9).
- **Stag hunt**, A = [[4, 0], [3, 3]], B = [[4, 3], [0, 3]]: pure equilibria (S, S) and (H, H); mixed p = q = **3/4**.
- **Exhaustive over 65,536 games (payoffs 0 to 3):** 2,592 have no pure equilibrium; all 2,592 have a valid mixed one (probabilities in [0, 1], both players indifferent); counts of pure equilibria per game: 0: 2,592, 1: 29,376, 2: 27,936, 3: 5,376, 4: 256 (sum 65,536).
**Independent oracles.** Brute-force enumeration of every pure profile and every unilateral deviation (separate from the best-response arrows); for each mixed solution, the expected payoff of each pure reply is checked against the equilibrium payoff to 1e-9 (no profitable deviation); 2,000 seeded 3 x 3 games for pure equilibria against the brute force; the exhaustive 65,536 sweep above. The page may say "checked on all 65,536 games with payoffs 0 to 3" (rule 27a), never "every game has one" without the theorem chip.
**Broken mode (rule 29).** The equilibrium finder checks **only Row's deviations**. On the 65,536 games it differs from the correct set on **49,632 (75.7%)**; the page prints "fails on 49,632 of 65,536". Named counterexample: the prisoner's dilemma cell **(Defect, Cooperate)** is reported as an equilibrium (Row cannot gain, 0 beats -2 against a cooperator), yet Column gains by switching to Defect (-3 becomes -2). The test asserts the rule ("a player has a profitable deviation") and that the fixed mode equals the brute force on all 65,536.
**Try this** (default: scene 1, prisoner's dilemma, no cell claimed).
1. Claim (Cooperate, Cooperate): refused, Row gains by switching (-1 becomes 0).
2. Claim (Defect, Defect): accepted, neither player gains (-2 against -3 for each switch).
3. Load matching pennies and press "no equilibrium": refused, the mixed (1/2, 1/2) is shown.
4. Load battle of the sexes: two cells glow, and scene 2 shows p = 2/3 and q = 1/3.
5. Open scene 3: 2,592 of 65,536 games have no pure equilibrium, and all of them have a mixed one.
**Quiz seeds.** Misconception: *a Nash equilibrium is the best outcome*. Question 5 is the battle-of-the-sexes mix.
1. *(dilemma)* Why is (Defect, Defect) the equilibrium of the prisoner's dilemma although (Cooperate, Cooperate) pays both players more?
   - A. Because players cannot see each other's choice and so must guess blindly. *[the equilibrium does not need secrecy]*
   - B. Neither player gains by switching alone; defecting beats cooperating either way. **(correct)**
   - C. Because mutual cooperation is not a feasible outcome of the game as stated. *[it is feasible, just unstable]*
   - D. Because defecting has the higher average payoff over both possible outcomes. *[dominance is per opponent choice]*
2. *(misconception)* Which statement about a Nash equilibrium is accurate?
   - A. No player can improve their own payoff by changing only their own strategy. **(correct)**
   - B. It is the outcome with the highest total payoff summed over all players. *[that is a social optimum]*
   - C. It is always unique in a finite game between two players, like a fixed point. *[battle of the sexes has two]*
   - D. It requires the players to agree on it with each other before they play. *[agreement is not part of the definition]*
3. *(mixed)* Matching pennies has no pure equilibrium. What is its equilibrium?
   - A. Both players pick heads, because the payoff there is highest for the matcher. *[the other player then deviates]*
   - B. The game has no equilibrium of any kind, since no pure one exists. *[a mixed one exists]*
   - C. Each player copies the option the opponent picked on the previous turn. *[that is not a stable rule]*
   - D. Each player picks heads with probability one half, which leaves the other indifferent. **(correct)**
4. *(multiple)* In battle of the sexes, how many pure equilibria does the lesson find?
   - A. One: the single pair of choices with the highest total payoff to the two players. *[both coordination cells qualify]*
   - B. None: the two players prefer different cells, so no cell is ever stable. *[coordinated cells are stable]*
   - C. Two: both at the opera or both at football, where neither gains by moving alone. **(correct)**
   - D. Four: every cell is stable once each player has made their own choice. *[mismatched cells are not]*
5. *(arithmetic)* In battle of the sexes (opera pays 2 to the row player, football pays 1), with what probability does the row player pick opera in the mixed equilibrium?
   - A. One third, which is the mirror image of the column player's own mix. *[the column mix is 1/3]*
   - B. Two thirds, which leaves the column player indifferent. **(correct)**
   - C. One half, so that the two choices are treated in a symmetric way. *[the payoffs are not symmetric]*
   - D. Three quarters, the same figure as in the stag hunt game. *[a different game]*
**Honesty and provenance.** `Provenance toy` ("payoffs are invented whole numbers; real strategic situations rarely fit a 2 x 2 table"); `ClaimLabel theorem` on "every finite two-player game has a Nash equilibrium, possibly mixed" (Nash, 1950; named from memory; **checked** here only on the 65,536 small games); `ClaimLabel standard` on the definitions; `Provenance from-memory` on the story names (prisoner's dilemma and its 1950 origin, battle of the sexes, stag hunt). **Verify against:** Nash (1950), "Equilibrium points in n-person games", *PNAS* (named from memory).
**Kit.** `CellGrid` (the payoff matrix with `onCellClick`), `Plot2D` (indifference lines), `Slider`, `Segmented`, `ChipButton`, `TextField` + `parseBoundedInt`, `Stat`, `ClaimLabel` theorem (K4-8), `Provenance`, `useScenePicker`. **Kit missing:** none (the Nash enumerator stays local, one user). K4-8's user list should add this lesson.
**Phone.** The 3 x 3 matrix with two numbers per cell fits 356 wide at a readable size; arrows are drawn in cell margins; sliders stack; the histogram scrolls in a `WideRegion` if it must.
**Risks.** Weak (tied) equilibria: the lesson defines an equilibrium as "no *strictly* profitable deviation" and says so, otherwise the 65,536 histogram changes. The two-player, simultaneous-move, complete-information assumptions must be stated beside the first matrix.


---

##### Batch T4-B8 · Leading change & strategy (`lead`)
Wave 3, **no domain flag**: these lessons carry opinion, not checkable fact, so they are held to AC-0/T3 #24 and AC-0/T4 #35 instead. Build order: `strangler-fig-migrations` (core), `conways-law`, `build-vs-buy`, then `technical-strategy` (builds on `build-vs-buy`). Needs **K4-9** (`validateScenario(s, { tradeoffs: true })`) and **K4-10** (`ClassifyBoard mode="explore"`), both gated before the batch starts (`tier4-technical.md` marks them P0; `tier4-plan.md` §6.2 says before wave 3). Every lesson: `Provenance invented` (or the scenario's own `invented` chip) on every case and every figure, a `ClaimLabel` on every practice or research claim, framed "one view" where contested, no real company, person or product named unless certain, and **at least one quiz question that is "it depends on X" with X named**. Options always show their costs before commitment; no option is dominated; no ending is marked correct.
**Rules for the three scenarios in this batch (read from `core/scenario.ts` and `ScenarioStory`).** Each is a `Scenario` with the `provenance` note ("an invented ...: every effect is a made-up number"), `notes` carrying the claim chips, `claimOf(choiceId)` labelling each picked reason, `endingHint` only when `validateScenario(s)` is `[]`, and a test that runs **`validateScenario(s, { tradeoffs: true })` and expects `[]`**, runs `enumeratePaths`, and pins the path count. Every `because` states a **condition** ("if the team is small and the system is a commodity, buying wins"), never a bare imperative. A meter that can only improve and never be red (here "unknowns still ahead") is declared with a bad edge it cannot reach and the stage says so. **Uncertain, verify:** K4-9's exact definition of `dominated-choice` ("same or an equally good destination"). The scenarios below were checked two ways, comparing only choices that share a destination and comparing all choices at a node, and pass both; the prototype's definition of `free-path` was "no meter ever red and none ends worse than it started", and every path here makes at least one cost meter worse than its start.

**`strangler-fig-migrations` · Large Migrations & the Strangler Fig**
Track `lead` · *"Replace the plane while it's flying"* · Priority **core** · Builds on: `monolith-microservices`, `deployment-strategies`, `zero-downtime-migrations`, `feature-flags` · no domain flag
**Starts where the neighbours stop.** `zero-downtime-migrations` is schema DDL (expand and contract) and `deployment-strategies` is canary mechanics; `monolith-microservices` introduced the split. This lesson owns the **multi-quarter, route-by-route migration**: a facade, shadow traffic, rollback per step and the long tail. Out of scope: schema DDL, canary and blue-green mechanics, service decomposition (`monolith-microservices`).
**Toy and failing state.** A monolith behind a routing facade with eight routes. The failing state the lesson stages, computed and never scripted: **a cutover with no rollback path**. Setting a data-owning route to Serve at 100% with dual-write off and waiting 60 minutes makes the page print, in `--bad`: *"Rolling back checkout now loses 720 writes that exist only in the new store: there is no safe way back."* Nothing is refused: the cost is shown.
**Spec.**
- **Scene 1 · The facade.** The route table (all figures **invented**, named constants): `login` 18% of traffic, coupling 1, defect rate 1.5%; `search` 22%, 0, 0.5%, read-only; `catalog` 25%, 2, 2.5%; `cart` 10%, 3, 3.5%, data-owning, 30 writes a minute; `checkout` 6%, 6, 6.5%, data-owning, 12 writes a minute; `orders` 8%, 4, 4.5%, data-owning, 20 writes a minute; `reports` 6%, 5, 5.5%, read-only batch; `admin` 5%, 2, 2.5%. Coupling is the number of shared tables; the defect rate is the share of requests on which the new implementation answers differently from the monolith, modelled as 0.5% + 1% x coupling (stated on screen as an invented rule). Total load `REQ_PER_MIN = 10,000`. Per route: mode chips **Off**, **Shadow**, **Serve**; routed share chips 10, 25, 50, 100% (Serve only); for the three data-owning routes a **dual-write** `Toggle` (default off); a **minutes since cutover** slider 0 to 120 (default 0, visible, feeds the rollback figure); a **Roll back** button per route. A seeded tick simulation (`createTickSim`, one tick = one minute, `SeedField`) draws each minute's requests: in Serve a request is wrong with the route's defect rate; in Shadow every request is mirrored and a mismatch is counted but the user sees the monolith's answer. Stats, each beside its expected value: **user-visible error rate** (percent of all requests), **shadow mismatch** (percent of mirrored requests and count per minute), **traffic on the new stack**, **writes lost on rollback**.
- **Scene 2 · What first?** The `ScenarioStory` below (three decisions, four endings, four meters).
- **Scene 3 · Read the ledger.** From `enumeratePaths`: the 28 paths, which are all-green, that **no path is best on every meter** (the four best-meter sets share no path), and the cost meters each path leaves worse than the start, all computed.
**The scenario** (all numbers invented; meters: **incidents** "customer-visible incidents" start 0, range 0 to 10, red above 3; **weeks** "weeks spent" start 0, range 0 to 60, red above 26; **strain** "team strain from running two systems" start 2, range 0 to 10, red above 6; **surprises** "unknowns still ahead" start 8, range 0 to 10, lower is better, cannot go red). Effects are (incidents, weeks, strain, surprises):
- **Node 1, the facade is up: which slice first?** *a1* peel `search`, read-only, 22% of traffic: (0, +6, +1, -1); because "if the team is new to the facade and a wrong answer must be cheap to switch off, a read-only route limits the damage; it also teaches the least about writes". *a2* peel `checkout`, 6% of traffic, most revenue, writes data: (+2, +10, +2, -4); because "if the sponsor needs the hardest unknown surfaced early, the route most coupled to shared tables retires four unknowns at once, at the price of the riskiest first slice". *a3* peel `catalog`, read-mostly, 25% of traffic, two shared tables: (+1, +10, +1, -2); because "if a visible win on a large share of traffic is needed to keep funding, the catalogue moves the most traffic of any low-write route; it still touches shared tables". *a4* freeze features and cut everything over in one weekend (goes straight to the ending *bigbang*): (+6, +24, +3, -8); because "if the monolith is small and the team can stop shipping, one cutover avoids running two systems; it removes every early warning".
- **Node 2, the data question** (the next slice writes data): *b1* dual-write to both stores and reconcile nightly: (+1, +8, +2, -2); because "if the monolith must stay a safe fallback, writing both ways keeps rollback possible; it doubles the write path to maintain". *b2* cut the data over once with no way back: (+3, +4, +1, -2); because "if the old store is being retired anyway and the data model is simple, one cutover is quickest; a defect found afterwards cannot be rolled back". *b3* move reads first and keep writes on the monolith: (0, +4, +2, -1); because "if the writes are few and the team wants no data risk, reads first is safest; the monolith stays the owner and strain stays high".
- **Node 3, the long tail** (reports, admin and batch jobs, 11% of traffic, weakest tests): *c1* peel the tail route by route to the end, ending *tailPeeled* "Monolith retired, slowly": (+1, +14, -1, -2); because "if the tail routes have owners and can be tested, finishing is worth the weeks; strain falls as the monolith shrinks". *c2* freeze the tail on the monolith and run two systems, ending *twoSystems* "Two systems, for good": (0, +4, +2, 0); because "if the tail changes rarely and retirement has no business case, leaving it costs little a month; the strain never goes away". *c3* rewrite the whole tail at once, ending *tailRewrite* "The tail in one push": (+2, +10, 0, -2); because "if one team can own the whole tail for a quarter, one push beats thirty small slices; a defect in a rarely used route may surface late".
- Endings read neutrally ("read the ledger: every path here costs something"); none says "success".
**The real trade-offs (so there is no single correct path).** Speed against risk (b2 is the fastest data step and the one with no way back), early learning against early safety (a2 against a1), visible progress against hidden coupling (a3), finishing against living with two systems (c1 against c2). The checks the test pins: `validateScenario(s, { tradeoffs: true })` is `[]`; 28 paths (3 x 3 x 3 plus the big bang); no choice dominated at any node; no free path; the best-meter sets for incidents (only a1, b3, c2 with 0), weeks (a1 with b2 or b3 and c2, 14), strain (a1, b2, c1 and a3, b2, c1, 3) and surprises (a4 and the a2 paths with b1 or b2 and c1 or c3, 0) share no path; **five paths have no meter ever red** (a1-b1-c3, a1-b2-c2, a1-b3-c1, a1-b3-c3, a3-b3-c3), and incidents, weeks and strain each go red on some path.
**Hand-worked vectors.**
- Path **a1, b3, c1**: incidents 0 + 0 + 1 = **1**; weeks 6 + 4 + 14 = **24**; strain 2 + 1 + 2 - 1 = **4**; surprises 8 - 1 - 1 - 2 = **4**; no meter red, yet 24 weeks were spent.
- Path **a4**: incidents 0 + 6 = **6** (red); weeks 24; strain 2 + 3 = 5; surprises 8 - 8 = 0. Path **a2, b2, c1**: incidents 2 + 3 + 1 = 6 (red), weeks 10 + 4 + 14 = 28 (red), strain 2 + 2 + 1 - 1 = 4, surprises 8 - 4 - 2 - 2 = 0.
- Scene 1: `search` Serve 100%: 1.0 x 0.22 x 0.005 = 0.0011, **0.11%** of all requests (11 per minute of 10,000). `checkout` Shadow 100%: 6% x 10,000 = 600 mirrored requests a minute, mismatch 6.5%, so about **39 per minute** (0.065 x 600), user-visible errors from it **0.000%**. Search 100% plus checkout 50%: 0.0011 + 0.5 x 0.06 x 0.065 = 0.0011 + 0.00195 = **0.305%**. Checkout Serve 100% (with search 100%): 0.0011 + 1.0 x 0.06 x 0.065 = 0.0011 + 0.0039 = **0.50%**.
- Rollback: loss = routed share x writes a minute x minutes since cutover when the route owns data and dual-write is off. Checkout 100%, 60 minutes: 1.0 x 12 x 60 = **720**; at 50%: **360**; with dual-write on: **0**. A read-only route always loses 0.
**Independent oracles.** The closed-form error rate recomputed in the test; the seeded simulation's long-run error rate and mismatch rate over 10,000 ticks within 3 standard errors of the closed form; shadow mode never increases the user-visible error rate (asserted over 200 seeded configurations); `enumeratePaths` against a hand-written triple loop over the three choice lists; the Pareto statement (no path best on every meter) recomputed by a separate argmin pass.
**Try this** (default: scene 1, every route Off, dual-write off, minutes since cutover 0).
1. Set `search` to Serve 100%: the user-visible error rate reads 0.11% and rollback losses 0 (read-only).
2. Set `checkout` to Shadow 100%: the error rate stays 0.11%, the shadow mismatch reads about 39 a minute (6.5% of 600).
3. Set `checkout` to Serve 100% and move minutes since cutover to 60: the error rate reads 0.50% and the banner says rolling back loses 720 writes.
4. Turn dual-write on for `checkout`: the loss reads 0.
5. Open scene 2 and choose a1, b3, c1: the ledger reads incidents 1, weeks 24, strain 4, surprises 4.
**Quiz seeds.** Question 1 is the "it depends on X" question (X is risk against early learning); question 2 is the misconception (*shadow traffic shows users the new answers*); question 3 recomputes 0.305%; question 4 the 720 lost writes.
1. *(it depends)* Which route should a migration peel off first?
   - A. Always the highest-traffic route, because it proves the most about the new stack. *[absolute and ignores risk]*
   - B. It depends: low risk favours a read-only route, early learning favours the riskiest. **(correct)**
   - C. Always the smallest route, because small steps are the safest way to start. *[absolute and ignores learning]*
   - D. The route the monolith team dislikes most, to retire their pain first of all. *[pain is not a selection criterion by itself]*
2. *(misconception)* In shadow mode the facade mirrors requests to the new service. What do users see?
   - A. The monolith's answers; the new service is only compared. **(correct)**
   - B. The new service's answers, with the monolith kept as a silent backup behind it. *[that is a canary or cutover]*
   - C. A blend of both answers, averaged field by field before they are returned. *[answers are not blended]*
   - D. An error whenever the two answers differ, so that mismatches get noticed. *[mismatches are logged, not shown]*
3. *(arithmetic)* Search is routed 100 percent and checkout 50 percent, with defect rates of 0.5 and 6.5 percent and traffic shares of 22 and 6 percent. What share of all requests fail?
   - A. 0.39 percent, which treats checkout as if it were fully routed to the new path. *[ignores the 50 percent]*
   - B. 7 percent, the plain sum of the two defect rates of the routes involved. *[ignores traffic shares]*
   - C. 0.11 percent, since only the read-only route can possibly count towards it. *[drops checkout]*
   - D. 0.305 percent: 0.11 from search plus 0.195 from checkout. **(correct)**
4. *(rollback)* Checkout is fully cut over for 60 minutes with dual-write off, at 12 writes a minute. What does a rollback cost?
   - A. Nothing, because the monolith still holds its own copy of every write. *[it never saw them]*
   - B. Only 12 writes, those of the final minute before the rollback. *[all 60 minutes count]*
   - C. 720 writes, all of which exist only in the new store. **(correct)**
   - D. 360 writes, because only half of the writes are important to keep. *[routing is 100 percent]*
5. *(long tail)* Why do migrations often stall near the end?
   - A. Because the new system turns out to be slower for the last slices of traffic. *[not a general cause]*
   - B. Rarely used routes tend to have the weakest tests and owners, so the last slices cost a lot. **(correct)**
   - C. Because the facade stops working correctly beyond 90 percent of traffic routed. *[no such limit]*
   - D. Because the monolith gets faster and faster as more traffic leaves for good. *[not a cause of stalling]*
**Honesty and provenance.** `Provenance invented` ("Acme Retail, its routes, defect rates, writes and every effect are invented"), `illustrative` on the route table, `simulated` with the seed on the tick simulation. Claims: `ClaimLabel practice` on routing through a facade and peeling routes one at a time (the "strangler fig" name is credited to Martin Fowler's 2004 write-up, `from-memory`), on shadow traffic and dark launching, on dual-writes and their consistency risk; `ClaimLabel view` on "start with the read-only route" and "start with the riskiest route" (both defended in practice), on "migrations stall on the long tail" and on "a big-bang cutover is defensible for a small system". **Verify against:** Fowler's bliki entry on the strangler fig application (name and date from memory); no vendor or company is named.
**Kit.** `core/scenario` + `ScenarioStory` with K4-9 `tradeoffs`, `core/simTick` (`createTickSim`) + `useTickSim`, `core/random`, `Segmented`, `ChipButton`, `Toggle`, `Slider`, `Stat`, `.data-table`, `SeedField`, `Provenance`, `ClaimLabel`, `useScenePicker`. **Kit missing:** none beyond K4-9.
**Phone.** The route table becomes one card per route at 900px and below; mode and share chips wrap; the stats stack; `ScenarioStory` is full width inside `stage-pad`.
**Risks.** Opinion presented as fact is the failure mode: every `because` must read as a condition and carry a `ClaimLabel`. The tick simulation must keep `useTickSim` inputs stable (module-level configuration, memoised snapshot). K4-9 semantics are unverified (above).

**`conways-law` · Conway's Law & Team Topologies**
Track `lead` · *"You ship your org chart"* · Priority important · Builds on: `domain-driven-design`, `monolith-microservices` · no domain flag
**Starts where the neighbours stop.** `monolith-microservices` states Conway's law in one line (chipped as practice) and `domain-driven-design` taught context maps. This lesson starts from that one line and owns **team topologies, the inverse Conway manoeuvre and cognitive load**, as a board the learner rearranges. Out of scope: bounded-context mapping (`domain-driven-design`), service decomposition. **No `ScenarioStory`:** nothing branches, so K4-9 does not apply; the "no dominated option" rule is enforced by a test over the presets instead, and the board is K4-10's explore mode.
**Toy and failing states.** Eight invented services (complexity points: web 3, mobile 2, catalog 3, search 4, cart 2, checkout 4, payments 5, orders 3, total 26), ten service-to-service call edges (web-catalog, web-cart, web-checkout, mobile-catalog, mobile-cart, mobile-checkout, search-catalog, cart-checkout, checkout-payments, checkout-orders) and six invented change requests (F1 gift option at checkout touches web, mobile, cart, checkout, orders; F2 new payment method: checkout, payments, web, mobile; F3 faster search: search, catalog; F4 stock on the product page: catalog, web, mobile; F5 guest checkout: cart, checkout, web, mobile; F6 order history page: orders, web, mobile). The learner assigns services to up to three teams. Failing states shown, never scripted: a team over its **cognitive-load cap** (red) and **a change that touches three teams** (flagged).
**Spec.**
- **Scene 1 · Draw the team lines.** `ClassifyBoard mode="explore"` (K4-10): the eight services as items, Team A, B and C as categories, no answer key and no score; `onChange` feeds the model; keyboard path through `useRadioGroup`. A `GraphView` of the services (fixed layout) recolours each edge: inside a team `--dim`, across teams `--bad`-tinted "interface". Preset chips: **one team**, **by layer** (A web and mobile; B catalog, search, cart, checkout, orders; C payments), **by journey** (A web, mobile, cart, checkout; B catalog, search; C payments, orders). Until all eight are placed the numbers read "place all 8 services".
- **Scene 2 · What the numbers say.** Per layout: **handoffs** (for each change, teams touched minus 1, summed), **interfaces** (cross-team call edges), **cognitive load per team** (complexity owned plus one per cross-team edge touching a service it owns, so every cross edge counts for both teams) against the cap, and **skill peers** (services that share a skill tag with another service in the same team; web and mobile are front-end, catalog, search, cart, checkout and orders back-end, payments payments). The cap is a visible `Slider` from 13 to 30 (default **16**, labelled invented).
- **Scene 3 · One reference, and what moves it.** After all eight are placed, **Show one reference** reveals (under `ClaimLabel view`, "one view, not the answer") the layouts that minimise handoffs + w x interfaces subject to every team's cognitive load at most the cap, found by exhausting all 3^8 = 6,561 assignments; `w` is a slider (0 to 2, default 1). A table sweeps the cap: the reference score by cap, so the learner sees what flips it.
- **Scene 4 · The inverse Conway manoeuvre.** From the learner's layout the page lists the interfaces it will create (every cross-team edge becomes a contract the two teams negotiate), and moves one service across a line on request to show the change in handoffs, interfaces and load. Wording: the manoeuvre is a `ClaimLabel practice`/`view`, not a recipe.
**Model and tests.** Hand-worked vectors at cap 16 (axes: handoffs, interfaces, maximum cognitive load, skill peers):
- **One team:** handoffs 0 (every change touches 1 team), interfaces 0, cognitive load 26 (over the cap), peers 7 (web, mobile = 2, and the five back-end services = 5; payments alone 0).
- **By layer:** changes touch 2, 3, 1, 2, 2, 2 teams, so handoffs 1 + 2 + 0 + 1 + 1 + 1 = **6**; interfaces **7** (the six edges of web and mobile plus checkout-payments); loads A 5, B 16, C 5; cross edges touching teams A 6, B 7, C 1 give cognitive loads **11, 23, 6**: team B is over 16; peers **7**.
- **By journey:** teams touched 2, 2, 1, 2, 1, 2, so handoffs 1 + 1 + 0 + 1 + 0 + 1 = **4**; the cross edges are web-catalog, mobile-catalog, checkout-payments and checkout-orders, so interfaces **4**; loads A 11, B 7, C 8; cognitive loads A 11 + 4 = 15, B 7 + 2 = 9, C 8 + 2 = 10, so **15, 9, 10**, all inside 16; peers **6** (A: web and mobile share front-end, cart and checkout share back-end = 4; B: catalog and search = 2; C: payments and orders share no skill = 0).
- **Move payments from C to A in the journey layout:** A = web, mobile, cart, checkout, payments (load 16); cross edges web-catalog, mobile-catalog, checkout-orders = 3; handoffs 1 + 0 + 0 + 1 + 0 + 1 = **3**; cognitive load of A = 16 + 3 = **19, over the cap**: fewer handoffs, but a team that no longer fits.
- **Reference at cap 16, w = 1:** minimum handoffs + interfaces = **8** (4 + 4), reached by **three tied layouts**: {web, mobile, cart, checkout | catalog, search, payments | orders}, {web, mobile, cart, checkout | catalog, search, orders | payments} and the by-journey layout; so the lesson has no unique answer even in its own model. Cap sweep (w = 1), the minimum score: below 13 no layout fits; 13: 12; 14: 11; 15 and 16: 8; 17 and 18: 5; 19 and 20: 4; 21: 3; 22 to 25: 2; 26 and above: **0** (one team has cognitive load 26 and no cross-team edge, so it fits once the cap reaches 26).
- No preset dominates another on (handoffs and interfaces lower, maximum cognitive load lower, skill peers higher): one team (0, 0, 26, 7), by layer (6, 7, 23, 7), by journey (4, 4, 15, 6). By layer is not dominated because it keeps skill peers together; the lesson says that is the reason layered teams exist.
**Independent oracles.** All 6,561 assignments recomputed by a separate loop (metrics against direct counting from the edge and change lists); the reference minimum and the three tied layouts; the cap sweep table; the three presets' non-dominance; `ClassifyBoard` placements round-trip through the model (placing the same service twice moves it). **Uncertain, verify:** the exhaustive search of 6,561 assignments is fast, but the cap and weight sliders must not recompute it on every pixel of a drag (memoise per (cap, w), 8 x 30 values at most).
**Try this** (default: scene 1, no service placed).
1. Press the **one team** preset: handoffs 0, interfaces 0, load 26, red against the cap of 16.
2. Press **by layer**: handoffs 6, interfaces 7, team B's load 23 in red, and F2 (new payment method) touches three teams.
3. Press **by journey**: handoffs 4, interfaces 4, largest load 15, inside the cap.
4. Move `payments` from C to A: handoffs 3, interfaces 3, but team A's load reads 19 and goes red.
5. Open scene 3, Show one reference (cap 16): three tied layouts at 8; set the cap to 26 and the reference becomes one team at 0.
**Quiz seeds.** Question 1 is the claim itself (one view); question 2 is the "it depends on X" question (X is how often changes cross the new lines); question 4 asks why one team is not the answer; question 5 is the misconception (*the law is a theorem or an iron rule*).
1. *(statement)* What does Conway's observation say, in one view?
   - A. Teams should be as large as the system they build, so that nobody is idle. *[not a claim of the paper]*
   - B. Organisations tend to build designs that mirror their communication paths. **(correct)**
   - C. Software always ends up with exactly one module for each team in the company. *[absolute and not the claim]*
   - D. A good architecture makes the org chart unnecessary for the people who work in it. *[not the claim]*
2. *(it depends)* Splitting one team into three lowers each team's load. What does the lesson show it costs?
   - A. More handoffs and interfaces; whether that pays depends on change patterns. **(correct)**
   - B. Nothing, because smaller teams are strictly better at every size of system. *[absolute]*
   - C. More load, because every team then has to know about all of the services. *[not what the model computes]*
   - D. Fewer interfaces, because services merge together when their teams are split. *[services do not merge]*
3. *(inverse)* What is the inverse Conway manoeuvre?
   - A. Redesigning the software to match whichever org chart exists today. *[that is plain Conway]*
   - B. Removing all team boundaries so that one single design emerges from the whole group. *[one team has its own cost]*
   - C. Moving each service to whichever team complains about it the loudest in planning. *[not a design principle]*
   - D. Shaping teams and communication to encourage the architecture you want. **(correct)**
4. *(model)* The one-team preset has 0 handoffs in the lesson. Why is it not the answer?
   - A. Handoffs do not matter, so the preset has no real advantage over the others. *[they are one of the computed axes]*
   - B. One team is not allowed by the board, which needs at least two teams. *[it is allowed and shown]*
   - C. Its load of 26 is over the cap of 16, an assumption that moves the answer. **(correct)**
   - D. It has the most interfaces of all the presets, because everything talks to everything. *[it has none]*
5. *(misconception)* A reader concludes that Conway's law means architecture can never be changed without a reorganisation. What is wrong with that?
   - A. Nothing is wrong with it, because the law is a proven theorem about organisations. *[it is an observation]*
   - B. It is only a tendency, and communication, tooling and contracts can offset it. **(correct)**
   - C. Reorganisations never change architecture at all, which shows the law is false. *[absolute]*
   - D. The law applies only to companies with more than one hundred people on staff. *[no such size rule]*
**Honesty and provenance.** `Provenance invented` (services, edges, changes, complexity points, and the cap of 16 are all invented) and `illustrative`; `ClaimLabel view` on Conway's observation (Melvin Conway, "How do committees invent?", 1968, `from-memory`), on the inverse Conway manoeuvre and on cognitive load as a design input in team-topology writing (Skelton and Pais, *Team Topologies*, 2019, `from-memory`: stream-aligned, enabling, complicated-subsystem and platform teams are named in one sentence and not built). **Verify against:** Conway (1968) and Skelton and Pais (2019), titles and years from memory; no real company's structure is described.
**Kit.** K4-10 `ClassifyBoard mode="explore"` with `reference` and `onChange`, `GraphView` (fixed layout, `edgeMark`), `core/useRadioGroup` via the board, `Slider`, `ChipButton`, `Stat`, `.data-table`, `Provenance`, `ClaimLabel`, `useScenePicker`. **Kit missing:** none beyond K4-10.
**Phone.** The board stacks the eight items as full-width radio rows (three categories each); the service diagram sits in a `StageFrame minWidth` of about 520 and scrolls sideways; the metric table wraps to one card per team.
**Risks.** The whole point is "no single answer", but a reference placement can still read as the answer; it is hidden until everything is placed, labelled "one view", shown beside its ties, and the cap sweep shows it moving. The skill-peers axis exists so that no preset is a straw man, and the lesson says so on screen.

**`build-vs-buy` · Build vs Buy**
Track `lead` · *"Your core, or someone else's commodity?"* · Priority important · Builds on: `technical-debt`, `product-thinking`, `design-docs-rfcs` · no domain flag
**Starts where the neighbours stop.** `technical-debt` priced interest on shortcuts; `product-thinking` asked which problem to solve; `software-licensing` covered licence terms. This lesson owns **the decision**: commodity against core, and a three-year cost of ownership that includes maintenance and lock-in. Out of scope: licence terms (`software-licensing`), debt interest, vendor selection checklists.
**Toy and failing states.** Three invented components of an invented scheduling product, each with three options (build, adopt open source and self-host, buy). The learner **places each component on an evolution board**; the placement decides whether a component's differentiation benefit counts. Failing states shown, computed: a build whose benefit was claimed for a component placed as a commodity (the benefit is dropped and the build loses), and a three-year view that hides the year where buying becomes the dearer path.
**Spec.**
- **Scene 1 · Place the components.** `ClassifyBoard mode="explore"` (K4-10): three items (email delivery, search, the scheduling engine) and four stages as categories (**Genesis**, **Custom-built**, **Product**, **Commodity**, after the evolution axis of Wardley-style maps, a `ClaimLabel view`); no key, no score. **Default placement: all three in Product** (neutral). A component's yearly benefit B counts only when the learner places it in Genesis or Custom-built ("you said it sets you apart"); in Product or Commodity the benefit is zero ("table stakes"). After all three are placed **Show one reference** reveals the author's placement (email Commodity, search Product, engine Custom-built) under `ClaimLabel view`.
- **Scene 2 · Three-year cost.** For the chosen component and option: cumulative cost by year as `Plot2D` `Steps` (one line per option), a table (three-year cost, benefit counted, **net cost**, months to first value, cost to reverse the choice, control points), and the assumptions as sliders: licence growth g (0 to 40%, default 15%), maintenance share m (5 to 40%, default 20%), horizon in years (1 to 10, default 3), yearly benefit B (0 to 800, default the component's own), and a `Toggle` to include the reversal cost. It prints the **crossover year** (the first year-end where buying has cost more than building) and the **break-even benefit** at which the ranking of two options flips.
- **Scene 3 · The vendor raises the price.** The `ScenarioStory` below (two decisions, three endings, three meters).
**Cost model (all numbers invented, in thousands of an invented currency; named constants).** Build: upfront U, then maintenance m x U a year. Buy: integration I, then a licence L1 in year 1 growing by g a year. Open source: setup J, then operations O a year. Benefit = B x control share (build 1; open source and buy per component: email 0.5 and 0; search 0.5 and 0.25; engine 0.25 and 0). Components: **email delivery** U 360, I 30, L1 60, J 80, O 60, B 0, reversal build 90, open source 30, buy 40, months to value 9, 3, 1; **search** U 480, I 40, L1 80, J 100, O 80, B 150, reversal 120, 40, 60, months 10, 4, 1; **scheduling engine** U 720, I 60, L1 100, J 150, O 90, B 400, reversal 150, 60, 150, months 12, 6, 2. Control points (build 5, open source 3, buy 1 for email and the engine, 2 for search) are a visible, non-monetary column.
**Hand-worked vectors (defaults: 3 years, g 15%, m 20%).**
- **Email, cumulative cost by year 0 to 3:** build 360, 360 + 72 = 432, 504, **576**; open source 80, 140, 200, **260**; buy 30, 30 + 60 = 90, 90 + 69 = 159, 159 + 79.35 = **238.35** (licences 60, 60 x 1.15 = 69, 69 x 1.15 = 79.35). B = 0, so net cost equals cost: buy 238.35, open source 260, build 576. **Crossover:** build costs 360 + 72n, buy 30 + 60 (1.15^n - 1) / 0.15; at year 8 build 936 and buy 853.61, at year 9 build 1,008 and buy 1,037.15: buying becomes the dearer path between years 8 and 9 (**year 9**).
- **Search:** costs build 768, open source 340, buy 317.8; benefits 150 x 3 x control = 450, 225, 112.5; **net cost** build 318, open source **115**, buy 205.3.
- **Scheduling engine:** costs build 720 + 3 x 144 = **1,152**, open source 150 + 3 x 90 = **420**, buy 60 + (100 + 115 + 132.25) = **407.25**; benefits 400 x 3 x control = 1,200, 300, 0; **net cost** build **-48**, open source **120**, buy **407.25**. Break-even benefits (net cost equal): build against buy at B = (1,152 - 407.25) / 3 = **248.25**; open source against buy at 420 - 0.75 B = 407.25, B = **17**; build against open source at 1,152 - 3 B = 420 - 0.75 B, 2.25 B = 732, B = **325.33**. So at B = 400 the order is build, open source, buy; at B = 200 build costs 552 net, open source 270, buy 407.25 (open source wins).
- No option is dominated on (net cost, months to value, cost to reverse, control points) for any of the three components at the defaults; the test asserts it, and the page prints that no option is best on all four columns.
**The scenario** (invented; meters: **extra cost** over the next two years start 0, range 0 to 400, red above 200; **weeks diverted** start 0, range 0 to 60, red above 20; **lock-in exposure** start 6, range 0 to 10, red above 8). Effects are (extra cost, weeks, lock-in): **Node 1, "your email vendor announces a 40% price rise from next year"**: *accept* stay: (32, 0, +1), because "if email is a commodity for you and switching costs more than the rise, staying is the cheapest move; it deepens the dependency"; *renegotiate* a two-year price lock: (14, 3, +2), because "if the vendor values the account, a longer commitment can cap the rise; you are bound to them for longer"; *open source* self-host: (48, 16, -3), because "if the team can run it and volume is high, operating costs can undercut the licence; someone now owns operations and upgrades"; *build* in house: (180, 40, -4), because "if email were part of what customers buy from you, owning it could be worth the cost; for a commodity the extra cost buys no customer-visible benefit". **Node 2, "a year later: how ready are you to leave?"**: *adapter* build a thin seam so the vendor can be swapped: (20, 6, -2), because "if the dependency will outlive this decision, a seam makes the next change cheaper; it costs weeks now"; *plan* write and keep an exit plan with a tested data export: (2, 1, -1), because "if weeks are scarce, a written plan lowers the risk a little at almost no cost"; *nothing* revisit at the next renewal: (0, 0, +1), because "if the contract is short and nothing is changing, waiting costs nothing today; the exposure grows quietly". Endings *adapter*, *plan*, *nothing*. Checked: 12 paths; no dominated choice (also with destinations ignored); no free path (extra cost is positive on every path); lock-in goes red only on reneg-nothing (6 + 2 + 1 = 9) and weeks go red on oss-adapter (16 + 6 = 22) and on all three build paths; accept-nothing ends at (32, 0, 8); oss-plan at (50, 17, 2).
**The real trade-offs.** Upfront cost against yearly cost and growth; speed to first value against control; reversal cost on both sides; a benefit that only counts if the component truly differentiates. The page shows the crossover and the assumption that moves it, not a verdict.
**Independent oracles.** Cumulative cost recomputed by a direct sum, and the crossover by scanning years 1 to 15; break-even benefits solved by bisection against the closed forms above; the net-cost ordering over a grid of 200 seeded parameter sets compared with a direct sort; the placement rule (benefit counts only in Genesis or Custom-built) tested for all 4^3 = 64 placements; the scenario test as above.
**Try this** (default: scene 1, all three components in Product).
1. In scene 2 pick email delivery: buy 238.35, open source 260, build 576 over 3 years.
2. Set the horizon to 9 years: build 1,008 against buy 1,037.15, so buying is now the dearer path (crossover year 9).
3. Open scene 1 and move the scheduling engine to Custom-built, then in scene 2 pick the engine and the horizon back to 3: net cost build -48, buy 407.25.
4. Lower B to 200: build 552 net against buy 407.25, so buying wins (break-even at 248.25).
5. In scene 3 choose open source, then plan: the ledger reads (50, 17, 2).
**Quiz seeds.** Question 1 is the "it depends on X" question (X is the horizon and whether a build captures a benefit); question 2 recomputes 248.25; question 3 is the misconception (*lock-in belongs to vendors only*).
1. *(it depends)* In the lesson's model, buying email delivery is cheaper than building it over three years. What would flip that?
   - A. Nothing could flip it, because buying is always cheaper than building anything. *[absolute and false in the model]*
   - B. A horizon near 9 years, or a benefit only a build captures. **(correct)**
   - C. A larger vendor, whatever the price schedule that the vendor chooses to charge. *[vendor size is not in the model]*
   - D. Any growth in the licence price, however small it is in any one year. *[needs enough growth over enough years]*
2. *(arithmetic)* The scheduling engine costs 1,152 to build over 3 years and 407.25 to buy. At what yearly benefit does building break even?
   - A. About 248.25 a year: (1,152 - 407.25) / 3, invented numbers. **(correct)**
   - B. About 400 a year, which is the benefit that the lesson assumes for the engine. *[that is the assumption, not the break-even]*
   - C. About 744.75 a year, which is the whole cost gap taken in a single year. *[forgets to divide over 3 years]*
   - D. Zero a year, since buying has no benefit of its own to be compared with. *[ignores the cost gap]*
3. *(misconception)* Which statement about vendor lock-in is accurate?
   - A. Building removes lock-in entirely, because you own all of the code you wrote. *[ignores your own reversal cost]*
   - B. Lock-in is a vendor myth that never costs anything in practice for a team. *[it is a computed cost]*
   - C. Open source has no lock-in because the source code is public to everybody. *[ops and customisation still bind you]*
   - D. Building has a reversal cost of its own, so neither side is free of lock-in. **(correct)**
4. *(core)* Which component most plausibly deserves an in-house build?
   - A. The one that is the most expensive to buy, so that the licence is saved. *[price alone says nothing about benefit]*
   - B. The one that the engineering team finds most interesting and fun to build. *[interest is not a criterion]*
   - C. One that sets the product apart and is worth the extra cost. **(correct)**
   - D. The one that has the largest number of vendors competing for the business. *[many vendors suggests a commodity]*
5. *(tco)* What does a three-year total cost of ownership leave out if you only compare licence and salary lines?
   - A. Nothing at all, because licence and salaries are the whole cost of either path. *[omits maintenance, integration and exit]*
   - B. Integration, upkeep, operations and the cost of reversing the choice. **(correct)**
   - C. Only the interest on the money that is tied up while the work goes on. *[small next to the others]*
   - D. The marketing value of having the vendor's logo on the product web page. *[not a cost of the decision]*
**Honesty and provenance.** `Provenance invented` and `illustrative` on every figure ("no real product, price or salary appears"); `ClaimLabel view` on "build what differentiates you, buy what does not" and on the evolution axis (Wardley maps: Simon Wardley, named from memory); `ClaimLabel practice` on three-year cost of ownership as a decision input and on the cost of self-hosting. No vendor is named. **Verify against:** Wardley's published material on evolution axes (named from memory).
**Kit.** K4-10 `ClassifyBoard mode="explore"`, `core/scenario` + `ScenarioStory` with K4-9, `Plot2D` (`Steps`, `Curve`, `VLine`), `.data-table`, `Slider`, `Toggle`, `Segmented`, `Stat`, `Provenance`, `ClaimLabel`, `useScenePicker`. **Kit missing:** none beyond K4-9 and K4-10. The cost model is a pure function in `model.ts` (single user).
**Phone.** The board is three full-width radio rows; the cost plot is 356 wide with year ticks every year; the option table becomes cards; sliders stack.
**Risks.** A model with a benefit term can be tuned to give any answer; the page therefore shows the benefit as an explicit, learner-controlled assumption and prints the break-even beside it. OSS looks cheapest in several cells; its operations cost is a plain invented constant and the lesson says "operations staff time beyond this constant is not counted".

**`technical-strategy` · Technical Strategy & Roadmaps**
Track `lead` · *"Diagnosis, guiding policy, coherent action"* · Priority important · Builds on: `build-vs-buy`, `prioritization`, `design-docs-rfcs` · no domain flag
**Starts where the neighbours stop.** `prioritization` ordered one team's backlog by cost of delay; `design-docs-rfcs` taught the decision document; `build-vs-buy` made one decision. This lesson owns **diagnosis, guiding policy and coherent action across teams**. Out of scope: ordering a backlog, the decision document, OKRs. It links `build-vs-buy` (earlier in the batch) by id once, as an example of an action justified by a policy.
**Toy and failing states.** A **strategy canvas**: two invented diagnoses, four policies, seven roadmap actions. The learner removes a policy and the page shows what it orphans. Failing states, computed: **a removed policy orphans its actions**, **a removed policy leaves a diagnosis uncovered**, **two policies (or two actions) conflict**.
**Spec.**
- **Scene 1 · The canvas.** A layered `GraphView`: diagnoses (`--info`), guiding policies (`--violet`), actions (`muted`); edges run diagnosis to policy to action; conflicts are dashed `--bad` edges between the two conflicting items. Each node has Remove and Restore (keyboard reachable). Counters: **orphaned actions** (outlined `--bad`, "no policy supports this"), **uncovered diagnoses** (outlined `--orange`), **active conflicts** (listed).
- **Scene 2 · Which storage policy?** The `ScenarioStory` below.
**The invented canvas (organisation "Acme Platform", invented).** Diagnoses: **D1** "delivery slows because 14 teams each run their own build pipeline and storage choices"; **D2** "on-call load is concentrated in three legacy services". Policies: **P1** "one paved road for build and deploy; deviations need a written reason" (answers D1); **P2** "consolidate on one primary datastore family" (D1); **P3** "teams own their on-call; the platform team ships the tooling" (D2); **P4** "each team picks the storage that fits its needs" (D1). Actions: **A1** ship the shared pipeline (P1); **A2** move one team's services onto the paved deploy path (P1); **A3** move billing's store onto the primary datastore (P2); **A4** freeze new datastore types (P2); **A5** paging-policy templates and on-call dashboards (P3); **A6** a storage evaluation checklist for teams (P4); **A7** pilot a graph database for recommendations (P4). Conflicts: **P2 against P4**, **A4 against A7**. An action is *orphaned* when none of the policies that support it is present; a diagnosis is *uncovered* when none of its policies is present; a conflict is *active* when both ends are present (an orphaned action still counts as present).
**Hand-worked vectors.**
- All present: orphans 0, uncovered 0, conflicts **2** (P2/P4 and A4/A7).
- Remove P1: orphans **A1, A2**; conflicts 2. Remove P3: orphans **A5**, uncovered **D2**, conflicts 2. Remove P2: orphans **A3, A4**, conflicts **1** (A4/A7; P2/P4 is gone). Remove P4: orphans **A6, A7**, conflicts **1** (A4/A7 still active: A7 is orphaned, not gone).
- Remove P2 and P4: orphans A3, A4, A6, A7; D1 stays covered by P1; conflicts **1** (A4/A7) until an action is removed too. Remove all four policies: all 7 actions orphaned, D1 and D2 uncovered, conflicts 1.
**The scenario** (invented; meters: **autonomy** start 6, range 0 to 10, red below 4; **effort** "migration effort" start 2, range 0 to 12, red above 8; **drag** "delivery drag" start 5, range 0 to 10, red above 6). Effects are (autonomy, effort, drag): **Node 1, "which storage policy?"**: *consolidate* (P2): (-2, +3, -2), because "if one team's storage change often blocks several others, one datastore family removes most of the blocking; teams lose choice and someone pays the migration"; *team choice* (P4): (+1, 0, +1), because "if teams' data needs differ widely and few changes cross team lines, letting each team choose keeps them fast; operations knowledge fragments and delivery drag rises"; *hybrid* "standard for core data, free for experiments with a sunset rule": (-1, +2, -1), because "if only a few datastores hold the data every team depends on, standardising those and leaving the rest free captures most of the benefit; the rule needs an owner". **Node 2, "how is it enforced?"**: *hard rule*: (-2, +2, -1), because "if a past exception caused an incident, a hard rule is easy to explain and to audit; teams with a real need are blocked"; *exception process*: (0, +2, 0), because "if needs vary but a reviewer can decide in days, a written exception keeps the rule honest; the reviewers' time is a cost"; *advice only*: (+1, 0, +1), because "if trust is high and the cost of a mistake is small, advice costs nothing; the policy may be ignored". Endings *hardrule*, *exception*, *advice*. Checked: 9 paths; no dominated choice; no free path; hybrid then exception ends at (5, 6, 4), no meter red; consolidate then hard rule ends at (2, 7, 2), autonomy red; team choice then advice ends at (8, 2, 7), drag red.
**The real trade-offs.** Autonomy against drag, effort now against drag later, enforcing against trusting; there is no path that is best on all three, and the policy conflict is real (P2 and P4 cannot both hold).
**Independent oracles.** **Exhaustive:** all 2^4 policy subsets x 2^7 action subsets = 2,048 canvas states, with orphans, uncovered diagnoses and conflicts recomputed by direct set arithmetic from the support lists (separate code) and compared; the six hand states above pinned; the scenario test as in the batch rules.
**Try this** (default: scene 1, every node present).
1. Read the counters: 0 orphans, 0 uncovered diagnoses, 2 conflicts (P2 against P4, A4 against A7).
2. Remove P1: A1 and A2 turn orphaned.
3. Restore P1, then remove P4: A6 and A7 are orphaned, the policy conflict clears, one action conflict (A4 against A7) remains.
4. Restore P4, then remove P3: D2 is uncovered and A5 is orphaned.
5. In scene 2 choose hybrid, then exception: the ledger reads autonomy 5, effort 6, drag 4.
**Quiz seeds.** Question 1 defines a guiding policy; question 2 is the misconception (*a roadmap is a strategy*); question 4 is the "it depends on X" question (X is who pays the coordination cost).
1. *(kernel)* In the diagnosis, guiding policy and coherent action model, what is a guiding policy?
   - A. A goal such as reducing the time to deploy by thirty percent this year. *[a goal is not a policy]*
   - B. An approach to the problem that rules some actions out. **(correct)**
   - C. A list of the projects that have been scheduled for the coming quarter. *[those are the actions]*
   - D. A company-wide rule that every team must follow without any exception allowed. *[policies have scope]*
2. *(misconception)* A manager says: our roadmap is our strategy. What does the lesson say is missing?
   - A. A diagnosis and policies that explain why these items made the list. **(correct)**
   - B. A longer roadmap that covers more quarters into the future than this one. *[length is not the gap]*
   - C. A budget that is attached to every one of the items on the roadmap. *[cost does not give coherence]*
   - D. A slide with the company mission written at the very top of the page. *[a mission is not a policy]*
3. *(orphans)* You remove the guiding policy P1 and two roadmap items turn orphaned. What does that tell you?
   - A. Those items are now complete, so they can be marked as done on the roadmap. *[orphaned means unjustified]*
   - B. The diagnosis has changed, so it must be rewritten from the beginning again. *[the diagnosis is unchanged]*
   - C. Nothing at all, since orphans appear whenever a policy is edited in any way. *[only when removed]*
   - D. Nothing justifies those items now, so each needs a new reason or should go. **(correct)**
4. *(it depends)* Should an organisation consolidate on one datastore family or let teams choose?
   - A. Consolidate, because having fewer technologies is always the cheaper way to run. *[absolute]*
   - B. Let teams choose, because autonomy always beats standardisation in the long run. *[absolute]*
   - C. It depends on who pays the coordination cost and how teams' data needs differ. **(correct)**
   - D. Whichever option the biggest team in the organisation happens to prefer most. *[popularity is not a criterion]*
5. *(conflict)* Two policies conflict: consolidate storage and let each team choose storage. What are the defensible moves?
   - A. Keep both unchanged, since a strategy should never exclude any possibility at all. *[that is the bad-strategy pattern]*
   - B. Pick one, or scope each (core data standardised, experiments free) and say which applies. **(correct)**
   - C. Remove the diagnosis, so that neither of the two policies needs to apply anywhere. *[hides the problem]*
   - D. Let the roadmap decide case by case, with no written policy to guide anyone. *[no coherence]*
**Honesty and provenance.** `Provenance invented` ("Acme Platform, its diagnoses, policies, actions and every effect are invented"); `ClaimLabel view` on the diagnosis, guiding policy and coherent action kernel (Richard Rumelt, *Good Strategy Bad Strategy*, 2011, title and year `from-memory`; the page says it is one author's framework) and on "a goal or a list is not a policy"; `ClaimLabel practice` on a paved road as a platform pattern. **Verify against:** Rumelt (2011), title and year from memory; no real company's strategy is described.
**Kit.** `GraphView` (`layout="layered"`, `nodeMark`, `edgeMark`, `edgeClass`), `core/scenario` + `ScenarioStory` with K4-9, `Stat`, `ChipButton`, `Provenance`, `ClaimLabel`, `useScenePicker`. **Kit missing:** none beyond K4-9. The orphan and conflict logic is a pure function in `model.ts` (single user, kept local as `tier4-technical.md` §4.1 says).
**Phone.** The canvas (3 layers, 13 nodes) sits in a `StageFrame minWidth` of about 620 and scrolls sideways; Remove and Restore buttons are a list under it so nothing depends on tapping a small node; counters stack.
**Risks.** Strategy lessons slide into prescription; every sentence about what "good" looks like carries a `ClaimLabel view`. The canvas must keep focus on the node after Remove or Restore (the Tier 3 focus-drop class), so removal re-focuses the restored or neighbouring node.

---

## Report for the coordinator: kit used, kit missing, spec-level concerns

**Kit used (all exist unless prefixed K4):** `GraphView`, `Plot2D` (`Polygon`, `Points` draggable, `Steps`, `Curve`, `HLine`, `VLine`), `TreeSvg`, `ArrayStrip`, `CellGrid`, `ClassifyBoard` (existing keyed mode; K4-10 explore mode), `core/scenario` and `ScenarioStory` (K3-15; K4-9 trade-off checks), `core/simTick` and `useTickSim`, `core/semver`, `core/disjointSet`, `core/parseKit`, `SeedField`, `ClaimLabel` and `Provenance` (K4-8 adds the theorem kind), `useDragPoint`, K4-4 `core/sat`, K4-5 `core/tsp`.
**Kit missing, in order of urgency:**
1. **`core/vertexCover.ts`** (exact `minVertexCover` by branching on the highest-degree vertex, a bitmask brute force as its own oracle, `maximalMatching`): needed by `np-reductions` **and** `approximation-algorithms`, two lessons of one batch, so a kit round must add it before T4-B3 (AC-0/T4 #39). Cheapest home: Agent C's K4-4/K4-5 slot in the kickoff round.
2. **K4-5 detail:** Christofides must pin its Euler-circuit tie-break (smallest-index neighbour first) and `twoOpt` must return the move trace with deltas; **uncertain, verify** against the ticket text.
3. **K4-8 user list** should add `linear-programming`, `online-algorithms` and `game-theory` (all three use `ClaimLabel kind="theorem"`).
4. **K4-9 semantics** of `dominated-choice` (same or equally good destination) and `free-path` should be read before B8 builds; the three scenarios here pass both a strict and a loose reading.
5. `GraphView editable` with fixed vertices and caller-reported refusals (`np-reductions`, `approximation-algorithms`) is **uncertain, verify**.
**Spec-level concerns:**
- **Exhaustive bound shrunk.** `tier4-technical.md` §2.3 asked for `np-reductions` to be exhaustive up to 5 variables and 7 clauses; brute force on up to 31 vertices is not an independent oracle, so this spec uses all 793 two-variable formulas with at most 4 clauses plus 200 seeded three-variable formulas, and says "sampled" beyond.
- **Broken modes above 90%.** Four broken modes (`approximation-algorithms` one-endpoint cover 94.5%, `suffix-arrays` inverted prefix rule 99.0%, `linear-programming` forgotten non-negativity 93%, `online-algorithms` late threshold 95%) exceed AC-0/T4 #29's 90% cap and use the witness clause instead; each names its shortest witness. The other broken modes are 23.5% to 75.7% (`np-reductions`, `sat-solvers`, `local-search-annealing`, `aho-corasick`, `lca-binary-lifting` 0.8%, `game-theory`).
- **Seeds are prototype seeds.** Every "lowest failing seed" and seeded rate was measured with a prototype generator; builders re-pin and keep the stated inequality.
- **Quiz length and the longest-correct cap** were checked by script against `lessonContent.ts`'s own definition; all 70 seeded questions are in range and the correct option is strictly longest in 13 (19%), at most 2 per lesson.
- **Lead lessons.** The three scenarios and the two boards are built so that no option is dominated and no path is free (checked by script, strict and loose); `conways-law` adds a fourth "skill peers" axis so that the layered preset is not a straw man, and says so on screen. `build-vs-buy` uses an invented cost model with a learner-controlled benefit term; it is a tuning risk and the page prints the break-even.
- **Overlaps.** `sat-solvers` and `np-reductions` are separated as the plan says (reduction versus DPLL); the vertex-cover helper is the only shared code. `lca-binary-lifting` says commit graphs are not trees. No spec links a lesson that does not exist yet.
