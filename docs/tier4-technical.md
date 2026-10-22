# Tier 4 · Strategist: technical plan

Written 2026-10-22 against `main` at `30663e93` (Tier 3 signed off). This is the technical half of the Tier 4 kickoff: the Tier 4 equivalent of `docs/tier3-plan.md` §3 (AC-0/T3), §4 (shared kit), §5 (retrofit) plus the lint wiring. The other half, `docs/tier4-plan.md` (Atlas: validation, final topic list, batches and waves, risks, tracker rows), is written separately. Where this file needs a batch or a wave it says "provisional" and names topics, not batch ids; Atlas's table wins on ordering, and the Gate column here is a rule ("built and gated before the first batch that uses it starts"), so it survives a reorder.

There are no per-topic lesson specs here. Those are the next phase, written per batch from the two plans.

## What was verified and what was not

Verified by reading the tree on 2026-10-22: `docs/tier3-plan.md` (all), `docs/qa-tier3-report.md`, `docs/tier3-kit-requests.md`, `docs/rollout-plan.md` §1.4, §3.1.3, §3.3, `docs/curriculum-backlog.md` (Tier 4 section), `docs/shared-api.md` entries for the pieces named below, `src/core/distSim/*`, `src/core/scenario.ts`, `src/core/lessonContent.ts`, `src/core/lessonContentT3.ts`, `src/core/lessonContent.test.ts`, `src/core/testing/{forbidden,tier3Plan,sceneKeys}.ts`, `scripts/*.mjs`, `scripts/lib/browser.mjs`, `vite.config.ts`, `.oxlintrc.json`, and the source of all nine existing Tier 4 lessons (summary, key ideas, quiz, the model files, and grep passes over every Stage).

**Not done, on purpose:** no dev server was started, nothing was run, so the retrofit audit in §5 is a **static audit**: it finds what can be found by reading and grepping. The first gate of the retrofit batches is the dynamic sweep (T4-T4), which will find crash and focus classes this audit cannot. Numbers I computed by hand (the quiz-share arithmetic in §6, for example) are marked "hand-computed: verify by running the test". The B29/B30 distSim limits mentioned in the brief are not written up anywhere under `docs/` (the Tier 3 reviews lived in the session scratchpad), so §2.1 derives the limits from `cluster.ts` directly instead of quoting them.

Everything marked **uncertain** is a design bet or a fact I typed from memory and a reviewer must check before it ships.

## Headline numbers

| | Count |
|---|---:|
| New Tier 4 topics (rollout-plan §3.3, backlog Tier 4 minus `leases-fencing`, which moved to Tier 3) | 41 |
| Existing Tier 4 lessons (retrofit, §5) | 9 |
| **Tier 4 total when done** | **50** |
| AC-0/T4 rules (§3, numbered 27 to 39, on top of AC-0, AC-0/T2 1-13, AC-0/T3 14-26) | 13 |
| Kit tickets K4-1 to K4-12 (§4) | 12 |
| Tooling tickets T4-T1 to T4-T8 (§4) | 8 |
| Existing-lesson defects found by the static audit (§5) | 67 across 9 lessons |
| Existing lessons with no test file at all | 8 of 9 (only `raft` has one) |
| Existing lessons with no `Provenance` chip | 9 of 9 |
| Domain-review flags (new, Atlas's table, `docs/tier4-plan.md` §2) | 29 of 41, plus all 9 retrofits = 38 (§6.2) |

---

## 1. What Tier 3 taught, and where it lands in Tier 4

`docs/qa-tier3-report.md` is the input. Every Tier 3 batch produced MAJOR findings after green gates, and the classes repeat. Each class below is tied to the rule or ticket that stops it in Tier 4.

| Tier 3 finding class | Tier 4 answer |
|---|---|
| Crashes and frozen players from a visible control: slider max (`count-min-heavy-hitters`), no actor at replay 0 (`kafka-partitioned-log`), injected sender not in the actor list (`change-data-capture`), a fresh array into `usePlayer` every render (`graph-coloring`, `property-based-testing`) | Rule 37 (stable hook inputs, extremes tested), lint rule `fresh-array-hook`, and the **sweep** (T4-T4), which found all of these when smoke could not. The sweep joins every batch's gates. |
| Focus dropped to `body` (`sharding`, `ownership-refcounting`, the shared `Transport` at first and last frame) | Sweep checks focus after every action; rule AC-0/T2 #11 stays. |
| Captions that contradict the page's own numbers | AC-0/T3 #14 stays; rule 27 adds the theorem version of the same sin ("always", "impossible" from a bounded check). |
| Pinned broken seeds that fail for the wrong reason; "lowest failing seed 0" meaningless when everything fails (`offline-first-sync`) | Rule 29 (named rule, non-trivial failing fraction, counterexample object) and lint rule `pinned-seed-zero`. |
| Facts from memory shown bare (RFC numbers, vendor defaults, libjpeg's quality rule) | Rules 32, 33 and lint `chip-required`. |
| "Distributed lessons that stage a failure instead of producing it" | AC-0/T3 #20 stays; K4-1 and K4-2 give the harness the pieces Tier 4's theory needs (§2.1), so no lesson has an excuse to script. |
| Exhaustive claims made from 200 seeds | Rule 28: say which check ran, and run an exhaustive one where the state space fits. |
| Two copies of the same helper across lessons (SeedField eleven times, joiners, SHA-256 twice) | AC-0/T3 #25 stays; every K4 ticket below has two or more named users before it is built. |

---

## 2. Technical decisions by cluster

### 2.1 Distributed theory: failure-detectors, gossip-protocols, paxos, byzantine-faults, flp-impossibility, distributed-snapshots, hybrid-logical-clocks, distributed-sql-truetime, metastable-failures

**What `core/distSim` has today** (read from `cluster.ts`): seeded latency (range or a function of `(rnd, from, to)`, so asymmetric links work), global `loss` and `duplicate` probabilities, `partition(a, b, from, to)`, `crash`/`restart`, `pause`, `dropNext(pred)` (once), `inject(at, to, payload)`, `randomFaults`, per-node clock offset and drift. Byzantine behaviour needs nothing from the harness: a node is a closure, so it can send a different payload to each peer, and the harness stamps `from`, so channels are authenticated by construction. `forSeeds(range, scenario, safety)` and `checkInvariants` give the lowest failing seed with a truncated trace.

**What Tier 4 needs that it lacks** (derived from the source; the brief's B29/B30 notes are not in the repo):

1. **FIFO links.** Latency is a fresh draw per message, so two messages on one link can arrive swapped. Chandy-Lamport needs FIFO channels; today there is no way to ask for them. Without a switch the lesson could only show the broken case.
2. **Per-link and per-type loss.** `loss` is one global probability and `dropNext` fires once. Failure-detectors need loss on the heartbeat link only; Paxos needs "drop every `Accept`" for a window; chaos-engineering and deterministic-simulation-testing need to kill one link. `partition` is symmetric, so a one-way cut (A hears B, B does not hear A) is also missing, and it is exactly the case that makes failure detectors disagree.
3. **`inject` bypasses the network.** A client request is delivered at `at` regardless of partitions and loss, and its `from` is the string `'client'`, not a node. A client on the minority side of a partition cannot be modelled. Pauses and crashes still apply (checked in `handle`), the network does not.
4. **Nothing enumerates.** The scheduler is one seeded timeline. FLP and Paxos safety are claims about *all* schedules; 200 seeds sample them.

**Decision.** Two tickets, kept separate because they have different risk:

- **K4-1, distSim v2** (small, additive, default-off): `fifo?: boolean` in `ClusterConfig` (arrival time on a link is `max(own arrival, previous arrival on that link)`), `loss?: number | ((msg, now) => number)` (evaluated at send time; the network stream is still drawn exactly once, so changing the rule never shifts another message's latency), `dropWhere(pred, from, to)` for a window rather than once, `partition(..., { oneWay: true })`, and `inject(at, to, payload, { from: nodeId })` which, when `from` is a node, goes through the network like a send. Backward compatibility is the gate: the existing T3 distSim tests and the pinned traces of `electionExample` must pass unchanged with every new option unset.
- **K4-2, `core/explore.ts` with a pure protocol form** (new subsystem, the biggest piece of Tier 4 kit): a breadth-first state-space explorer, plus a protocol written as pure functions so that **one implementation runs under both harnesses**.

```ts
// core/explore.ts: generic, no distributed assumptions
explore<S, A>({
  init: S,
  actions: (s: S) => { label: A; next: S }[],      // deterministic order
  key: (s: S) => string,                           // canonical form; the dedupe key
  invariant?: (s: S) => string | null,             // null while it holds
  maxStates?: number, maxDepth?: number,
}): { states: number; depth: number; truncated: boolean;
      violation: { message: string; path: { label: A; state: S }[] } | null }  // BFS: the SHORTEST path

// core/pureProtocol.ts: the protocol form
interface PureProtocol<S, M> {
  nodes: readonly string[];
  init(id: string): S;
  onMessage(id: string, s: S, m: { from: string; payload: M }): { state: S; send: { to: string; payload: M }[] };
  onTimeout?(id: string, s: S): { state: S; send: { to: string; payload: M }[] } | null;   // spontaneous step
}
networkExplorer(protocol, { network: 'set' | 'multiset', maxCrashed, clientInputs })   // 'set' (default): sent messages are never consumed, so ANY sent message may be delivered any number of times, in any order, or never (loss, duplication and reordering are all subsumed, as in Lamport's Paxos TLA+ spec); 'multiset': in-flight messages are consumed on delivery, for protocols whose counts matter (2PC votes)
asDistNodes(protocol): Record<string, DistNode<M, S>>                         // the SAME functions, driven by distSim's seeded timeline
```

`components/TracePlayer.tsx` (in K4-2) renders an explorer path or a `distSim` violation as a stepped list with a state view per step. It builds its frames with `useMemo` internally, because "a fresh array into `usePlayer`" is the single most repeated crash class of Tier 3, and four or more Tier 4 lessons need a counterexample stepper.

Reuse, not rebuild: `SequenceDiagram` and `toSequence(trace)` for message ladders (explorer paths convert with a small adapter in `TracePlayer`), `GraphView` for the configuration graph, `SeedField` and `Provenance seed=` for seeded runs, `forSeeds` for the seeded leg.

**How invariants are checked (rule 28).** Two legs, and the lesson says on screen which ran and how much:
- **Seeded leg, always:** at least 200 seeds with delay, loss, duplication, partition, crash and skew as the lesson allows, safety asserted after every event (AC-0/T3 #20, unchanged).
- **Exhaustive leg, where it fits:** `explore` over the pure protocol with a budget (default 250,000 states). If it completes, the lesson may say "holds in all N reachable states of this model (3 acceptors, 2 proposers, ballots 1 and 2)". If `truncated` is true, the lesson may not claim "holds"; it says "no violation in the first N states, not exhaustive".

**The "broken mode must violate on a named lowest failing seed" rule, applied to impossibility (rule 29).** Theory says some things cannot be done, so a "broken mode" cannot always be "the buggy variant". Per topic:

| Topic | Safety property and check | Broken modes | The named counterexample |
|---|---|---|---|
| `paxos` | At most one value chosen (a value is chosen when a majority of acceptors accepted the same ballot and value). Exhaustive over single-decree, 3 acceptors, 2 proposers, 2 ballots; seeded leg on `asDistNodes` with loss, duplication and reordering. | (a) acceptor accepts below its promise; (b) proposer ignores the highest accepted value in the promises. | The **shortest counterexample path** from `explore`, with its length, shown in `TracePlayer`. Liveness is separate: dueling proposers fail to decide on some seeds; the lesson shows "no decision by T on k of 200 seeds" and the lowest such seed, then the randomised-backoff fix with its measured decision rate. Never "Paxos always terminates". |
| `byzantine-faults` | Loyal generals agree, and obey a loyal commander (IC1, IC2). **Exhaustive** for oral messages OM(1) at n = 3 and n = 4 over every traitor choice and every message a traitor can send (binary values). OM(2) at n = 7 is too large to enumerate: seeded random traitor behaviour, labelled as sampling. | n = 3 with one traitor. | The traitor and the message vector that break agreement, found by enumeration; the n = 4 exhaustive pass is the contrast. Quorum intersection is also enumerated for f up to 3: every two quorums of size n - f in n = 3f + 1 share at least f + 1 nodes; at n = 3f two quorums can share only traitors. |
| `flp-impossibility` | Safety (agreement) holds; **termination fails for every protocol**, which no seed can show. See the toy below. | A timeout-based protocol that always decides, and violates agreement under one delay. | The shortest schedule (explorer path) that makes the timeout protocol disagree, plus, for the safe protocol, the **bivalent walk**: a computed sequence of deliveries that keeps the configuration bivalent. |
| `distributed-snapshots` | The recorded cut is consistent: tokens are conserved (node states plus recorded channel contents equal the initial total) **and**, as a second independent check, the cut is closed under happens-before (computed from the trace's vector clocks). Seeded, 200+, with `fifo: true`. | Non-FIFO channels (K4-1 `fifo: false`); markers recorded on the wrong side. | Lowest failing seed, with the rule that failed pinned (conservation vs closure). |
| `gossip-protocols` | Convergence of a max-version register among up nodes once partitions heal (liveness, stated as such); no node ever adopts a version nobody wrote (safety). Rounds to full spread measured over seeds at n = 16, 64, 256. | Infect-and-die with fanout f: some nodes are never infected. | Lowest seed where the run leaves nodes uninfected. The final uninfected fraction is checked against the epidemic final-size equation s = e^(-f(1-s)) solved numerically in the test (the independent reference; formula from memory, see below). The "O(log n) rounds" claim is checked as growth, plus a band around log2 n + ln n for push gossip (Pittel; **from memory**, the lesson chips it). |
| `failure-detectors` | No safety invariant; the properties are **completeness** (a crashed node is eventually suspected, bounded in time) and **accuracy** (a live node is not suspected). Measured over 200 seeds on jitter and GC pauses; the trade-off curve (false-positive rate vs detection time) is computed, not drawn. | A fixed timeout shorter than the jitter tail. | Lowest seed with a false suspicion. The headline proof-shaped artefact is **indistinguishability, computed**: two runs, one where the peer crashes and one where it pauses, produce byte-identical monitor observations up to time t*, and a test asserts it. |
| `hybrid-logical-clocks` | HLC is monotonic per node; `l >= physical time`; for any send-receive pair the receive timestamp exceeds the send timestamp; `l - pt` stays under the skew bound when clocks are within the bound. Skew and drift already exist in distSim. | Plain physical timestamps under skew; an HLC that moves its clock backward. | Lowest seed where causality is violated (a receive stamped before its send). |
| `distributed-sql-truetime` | External consistency: if T1 commits before T2 starts (true time), ts(T1) < ts(T2). Commit wait is modelled over an uncertainty interval of half-width epsilon; clocks within epsilon. 200+ seeds. | Epsilon underestimated (skew beyond the assumed bound); commit wait skipped. | Lowest seed where an anomaly occurs. The Raft-replicated shards and the world map are **shown, not run** (`Provenance not-run`, the paper's design from memory). |
| `metastable-failures` | Built on `core/simTick`, not distSim (it is a queueing model with retries). The claims are properties of **trajectories**: after the trigger ends, goodput recovers within H ticks (with a retry budget or cancelled abandoned work) or stays collapsed (without). 200+ seeds. | Retries without a budget or jitter, and work that is not cancelled after the client gave up. | Lowest seed that stays collapsed, with the mechanism named in the test (wasted work on abandoned requests), plus a check that **both regimes exist with margin** (the parameters are not tuned to a knife edge). **Uncertain:** a deterministic discrete model must be tuned until a stable bad equilibrium appears; the spike belongs in the ticket that builds the lesson, and the paper (HotOS 2021, named only) is a from-memory chip. |

**Where the exhaustive leg is not possible** (OM(2), a gossip run at n = 256, a TrueTime run with real latency) the lesson says "sampled". The Tier 3 limit ("not exhaustive search, except where a lesson states an exhaustive check") becomes a labelled choice, not a footnote.

**Paxos state space: re-checked on paper, still unverified.** The first draft modelled the network as a consuming in-flight multiset with explicit drop and duplicate actions. That is the dangerous version: with about 24 message kinds, each in flight, delivered or dropped, the loose bound is 3^24 (about 3e11) and reachability may not save it. **Decision: single-decree Paxos is modelled with the non-consuming `'set'` network** (a message once sent can be delivered any number of times, in any order, or never), which already contains every loss, duplication and reordering behaviour and makes the state monotone. Loose ceiling for 3 acceptors, 2 proposers, ballots 1 and 2, one value per proposer: the sent-message set has at most 2 Prepare, 6 Promise, 4 Accept variants (ballot 1 carries v1; ballot 2 carries none, v1 or v2) and 6 Accepted bits, so 2^18 = 262,144 message sets, times at most 2^3 x 2^3 = 64 proposer receive-sets: **about 1.7e7, a hard but very loose ceiling**. Reachability cuts this hard (an acceptor cannot promise ballot 1 after promising 2; an Accept needs a promise quorum; acceptor state is a function of its sent messages), and my estimate is **10^4 to 10^5 reachable states, inside the 250,000 budget, but an estimate is not a count.** Speed is the second risk: at an explorer throughput I can only guess (tens to a couple of hundred thousand states per second with compact string keys), 250k states is roughly 1 to 5 s, which straddles the 5 s gate. **The K4-2 spike runs first, before any other K4-2 work, and records the real count and time.** If it fails the gate (5 s and 250k states), the stated scope cuts, in order: (1) acceptor symmetry reduction (about a sixth); (2) both proposers propose v1, so the question becomes "never two ballots deciding different values" and the three-valued Accept variant disappears; (3) the exhaustive leg of `paxos` covers one proposer plus one late competing ballot, and the lesson says "exhaustive for this bounded scenario; sampled beyond". **Unaffected by a failed spike:** `byzantine-faults` (its own small enumeration), `flp-impossibility` (its own bounded valency graph, which needs the explorer but not Paxos-sized state) and `formal-methods` (a mutual-exclusion toy spec, not Paxos). If the explorer is too slow even for those, K4-2 does not merge and B1 and B4 in wave 2 slip.

### 2.2 Weak memory: memory-ordering-atomics, lock-free-cas

JavaScript cannot show real reordering reliably: the engine is not a bare CPU, the hardware may be x86-TSO or ARM, results are nondeterministic, and `SharedArrayBuffer` needs cross-origin isolation headers the app does not set. **Decision: no real-hardware demo, and no "try it on your machine" button** (nondeterministic, undebuggable in smoke, and it would let a lesson claim a reordering happened that the page cannot prove). The lesson is a **simulated memory model**, labelled as one (rule 31).

**K4-3, `core/memModel.ts`**, built on K4-2's explorer: a tiny litmus language and three models.

```ts
type Ord = 'rlx' | 'acq' | 'rel' | 'sc';
type Instr =
  | { op: 'store'; loc: string; value: number; ord?: Ord }
  | { op: 'load';  reg: string; loc: string; ord?: Ord }
  | { op: 'fence'; kind: 'full' | 'acq' | 'rel' }
  | { op: 'cas';   reg: string; loc: string; expect: number; value: number; ord?: Ord };
interface Litmus { name: string; init: Record<string, number>; threads: Instr[][] }
type Model = 'sc' | 'tso' | 'relaxed';
outcomes(l: Litmus, model: Model, budget?): { outcomes: Map<string, { regs; mem; example: Step[] }>; states: number; truncated: boolean }
```

- **`sc`:** every interleaving of instruction steps.
- **`tso`:** one FIFO store buffer per thread; loads forward from the thread's own buffer; a store drains at any time; a full fence drains the buffer.
- **`relaxed`:** a per-location modification order with timestamps and a per-thread **view**; a relaxed load may read any write at or after the thread's view; a release store publishes the thread's view and an acquire load that reads it merges it. A view-based acquire/release model. **It does not model load buffering (r1 = r2 = 1), out-of-thin-air values or `consume`, and it is not C++ or ARM.** The lesson says so beside the model's rule list.

**Decision (coordinator): `relaxed` is CUT from K4-3 unless a spec proves it is needed.** TSO plus fences delivers the "your CPU reorders your code" payoff (store buffering is allowed on TSO, a full fence forbids it). **Criterion to build `relaxed`:** the `memory-ordering-atomics` spec contains a scene whose learning goal is "release/acquire forbids the stale-data outcome (flag = 1, data = 0) that a relaxed access allows", **and** that outcome cannot be shown with TSO (it cannot: TSO already forbids message passing, so a TSO-only lesson cannot make release/acquire visible). If the spec's scenes are store buffering, fences and the ABA search only, `relaxed` stays out and the release/acquire material is a `Provenance from-memory` note ("free on x86, not on weaker architectures"). The decision is made at spec time by Vector and Atlas together, default CUT; K4-3 is built without `relaxed` and gains it only through a Phase 2 request that cites the spec scene. The description of `relaxed` above is what to build if the criterion is met.

**Tests and the independent oracle.** The litmus catalogue is classic: store buffering (SB), message passing (MP), load buffering (LB), IRIW, 2+2W. The expected outcome table per model is **typed from memory of the published tables** (x86-TSO from Sewell et al., ARM and Power catalogues) and the domain reviewer verifies every cell against a source; a disagreement is a bug in the table or the model. Two checks do not depend on memory:
1. **SC and TSO from a second formulation:** SC outcomes equal the outcomes of all interleavings; TSO outcomes (for programs where no thread reads a location it has a pending store to) equal SC outcomes over programs in which a store may be swapped past a later load of a different location. This oracle is **uncertain outside that fragment** (store-to-load forwarding cases differ), so the fixture set is restricted to programs inside it and the restriction is a comment in the test.
2. **Counterfactuals:** a deliberately wrong TSO (drain on every store, i.e. SC in disguise) must fail the SB test; a model without fence handling must fail the "fence forbids it" test.

**`lock-free-cas`** uses the `sc` model with the `cas` instruction over a heap with a free list, which is what makes ABA possible: the explorer finds the shortest interleaving that corrupts a Treiber stack, and the tagged-pointer fix is shown to pass the same bounded search (3 threads, at most 4 operations each; state count on screen, "exhaustive in this bound" only if `truncated` is false). "Real programs have far larger state spaces" is a `ClaimLabel standard`-style note, not a measured claim.

**Honesty rule (31):** a persistent `Provenance kind="simulated"` chip reading "a model of weak memory, not your CPU", the model's rules listed in the stage (not the summary), and no sentence of the form "this is what really happens on x86".

### 2.3 Proof-shaped topics: the manipulable toy and the anti-slideshow rule

AC-0/T3 #23 already demands a manipulable object and a way to fail. Tier 4 makes it reviewable (rule 30): the spec names the toy, the **wrong move**, the **exact refusal text**, and the **test that makes the wrong move headless** (named `manipulation N: ...`, counted by the lint for the topics in `PROOF_SHAPED_IDS`). Reviewer's rule: press only Next/Play through every scene; if every caption sequence is identical whatever the controls do, the lesson goes back.

| Topic | The toy | The wrong move, and what the page says | What is computed and tested |
|---|---|---|---|
| `flp-impossibility` | **Be the adversary.** A 3-process binary consensus protocol with a bounded round horizon; the learner picks which pending message to deliver next. Each configuration shows its **valency** (0-valent, 1-valent, bivalent) computed by `explore`. | Deliver a message that makes the configuration univalent: "you decided it: every continuation now ends in 1". | Valency by backward propagation over the explored graph (labelled "within the horizon of R rounds"); an "assist" button picks a delivery that keeps it bivalent, found by search; the safe protocol's bivalent walk; the timeout protocol's shortest disagreement schedule. The theorem (every deterministic protocol, one crash, asynchronous) is a **`ClaimLabel kind="theorem"`**: "argued, not run here". **Uncertain, medium-high risk:** an infinite non-deciding run cannot be shown by a finite explorer. The lesson shows a long admissible prefix plus the repeating pattern, and says "extend this forever" is the theorem's step, not the toy's output. Fallback if the quotient construction does not work: a one-step valency explorer over a 3-node, one-round protocol that exposes the proof's decisive-message step, with the infinite schedule explained as repetition and labelled "argued". |
| `np-reductions` | A 3-SAT formula editor, the 3-SAT to vertex-cover gadget graph built from it, and a vertex picker. | Pick a cover of size K - 1: "the clause triangle for (x1 or not x2 or x3) is not covered by 2 vertices". | The reduction (K = n + 2m) checked **both directions exhaustively** on all formulas up to 5 variables and 7 clauses against brute force on both sides; assignment to cover and cover to assignment round-trip; an unsatisfiable formula shows the exact count of covers of size K (zero). Input above the limits is refused with the limit stated. |
| `sat-solvers` | The learner picks the branching variable in a DPLL tree; unit propagation cascades visibly. | Choose a variable that leads to a conflict: the conflict clause is highlighted and the trace backtracks. | `core/sat.ts` vs brute force on seeded random 3-SAT up to 10 variables; tree size per heuristic (first-unassigned vs most-occurring) measured on 200 seeded formulas; the package-resolution encoding reuses `core/semver`. |
| `approximation-algorithms` | The learner **drags points to try to break the guarantee**: live ratio meter for MST-doubling, Christofides, and a vertex-cover maximal-matching 2-approximation. | Drag toward the known tight example and the ratio approaches 2 but never exceeds it; edit a distance so the triangle inequality fails and the page says "the guarantee no longer applies" while the ratio is unbounded. | Ratios against Held-Karp (n at most 12) and brute-force vertex cover on 1,000 seeded instances; the tight case for the matching algorithm (complete bipartite) hits exactly 2; the 1.5 bound for Christofides checked on the seeded set (a bound on those instances, not a proof, and the lesson says so). |
| `zero-knowledge-proofs` | Two scenes. The Ali Baba cave as the **verifier** (pick the challenge each round; confidence 1 - 2^-k computed, a cheating prover simulated and caught). Then a **Schnorr identification** over a toy group (p = 23, q = 11, g = 2, and a second toy p = 2039, q = 1019, g = 4: **verify in the test** that p and q are prime and g has order q). | Accept a transcript the verifier equation rejects; try to cheat a challenge you can't predict. | **Soundness:** the learner (or the page) runs the prover twice with the same commitment and two challenges, and the **extractor recovers the secret exponent**. **Zero knowledge:** real transcripts and **simulator** transcripts (which never see the secret) have the *identical* distribution, checked by enumerating every (commitment, challenge, response) triple in the small group and comparing the multisets exactly. Fiat-Shamir uses `core/sha256` and says "toy". |
| `secret-sharing` | Pick k - 1 shares and try to guess the secret; add one more share and watch it become certain. | Reconstruct with k - 1 shares: the page shows every candidate secret is equally consistent. | Perfect secrecy **by exhaustion** on GF(7): for every k - 1 shares, each candidate secret has the same number of consistent polynomials. Lagrange over a larger prime field vs direct solve. |
| `byzantine-faults` | The learner is the traitor: choose what the traitor sends to each lieutenant. | At n = 4 every traitor strategy fails to break agreement (enumeration count shown); at n = 3 the page finds one that works. | See §2.1. |
| `online-algorithms`, `game-theory` (if kept) | The learner is the adversary choosing when the ski season ends / the opponent's reply. | The adversary cannot push the break-even strategy's ratio to 2 or above (it stays under 2 - 1/B); cooperating in a one-shot dilemma is a strictly dominated choice. | Ratio over all season lengths for each B, exhaustively; Nash equilibria by enumerating pure profiles vs brute force. |

The remaining proof-adjacent topics (`elliptic-curves`, `local-search-annealing`, `linear-programming`) have a natural toy (drag a point, move the temperature, move a constraint) and take rule 30 as a review check, not a counted-test requirement.

### 2.4 Advanced crypto: elliptic-curves, post-quantum-crypto, e2ee-forward-secrecy, secret-sharing, zero-knowledge-proofs

Highest risk of being subtly wrong, so the rules are strict (rule 32) and every lesson here is domain-reviewed by **two** reviewers: one recomputes every vector independently, one reads only for overclaiming and payload-freeness.

**What may use real crypto.** Only `crypto.subtle` through `core/crypto`, and only where the lesson is about a real primitive: HMAC-SHA256 chains, AES-GCM, ECDH on P-256, HKDF (e2ee, the hybrid handshake, the P-256 cross-check in elliptic-curves). Everything else is **toy BigInt arithmetic**, labelled, and never presented as usable. `core/crypto` has HMAC, AES-CBC raw, and ECDSA, but **no ECDH, HKDF or AES-GCM**: K4-7. Ed25519 and X25519 are **not** relied on (support through `crypto.subtle` is uneven; uncertain, so the plan avoids them). Every helper resolves to `null` without a secure context, so each lesson has a defined "needs https or localhost" state (AC-0/T2 #5 style).

**K4-6, `core/field.ts` and `core/ecc.ts`.** `Fp` operations over `bigint` on top of `core/numberTheory` (`mod`, `modPow`, `modInverse`, `isProbablePrime`), then affine short-Weierstrass curves: point add, double, scalar multiply by double-and-add **returning the step trace** (for the animation), curve membership, point order by enumeration for small curves. Constants: the textbook toy curve y^2 = x^3 + 2x + 2 over F17 (the generator (5, 1) has order 19; **from memory, verified by the test below**), secp256k1 and P-256 parameters.

Tests, with **no dependence on typed-from-memory vectors**:
- **Self-consistency of constants:** the generator lies on the curve, n times G is the point at infinity, n is prime (Miller-Rabin from `numberTheory`). A mistyped digit in any standard constant fails this. A typo that happens to preserve all three is not a realistic failure.
- **Independent oracle:** `node:crypto` `createECDH('secp256k1' | 'prime256v1').setPrivateKey(k).getPublicKey()` for 50 seeded scalars equals our `k * G`, through the existing `core/testing/nodeCrypto` shim (K4-7 adds the ECDH and HKDF wrappers there).
- **Group law, exhaustively on the toy curve:** closure, identity, inverses, and associativity over all 19^3 triples; the point count equals brute-force enumeration; the Hasse bound |N - (p + 1)| <= 2 sqrt(p) holds.
- **Live cross-check in the page (`Provenance real`):** generate a P-256 key pair with `crypto.subtle` (extractable, so the private scalar is readable from the JWK), compute d * G with our `ecc`, and show it equals the browser's public point. That is the only place the page proves its own arithmetic.

**Rules that apply to every crypto lesson (rule 32):** every parameter shows its **bit size**; a persistent `Provenance kind="toy"` chip sits on any key, modulus, curve or group under 128 bits; the page never says "secure", "unbreakable" or "safe to use" about a toy and instead computes **how long brute force takes** for the toy (instant) and for the real size (2^128 operations, computed); BigInt code is **not constant-time** and the lesson says "never copy this"; randomness is **seeded for reproducibility** and says "a real system uses a CSPRNG" (and links `randomness-csprng`); no key or secret literal in source (`fakeSecret` for any placeholder, and the repo's secret-shape scan stays green); test vectors come from a **named standard or the `node:crypto` oracle**, never from the lesson's own output.

**Per lesson, specifics:**
- `elliptic-curves`: real-number picture with `Plot2D` (chord and tangent construction), then the F17 point cloud, then scalar multiplication "easy forward, hard back" with a brute-force discrete-log counter that is instant at p = 17 and astronomically long at 256 bits (computed from group order). Chip: toy, plus real for the cross-check.
- `post-quantum-crypto`: a **toy LWE** (Regev style, n at most 16, small q) showing encryption, noise growth and decryption failing when the noise passes q/4, plus a 2D lattice picture with a good and a bad basis. **Shor is emulated classically for tiny N** (period finding by looping `modPow`, then the gcd step) and the page says so: "a quantum computer finds the period fast; this page finds it the slow way". **ML-KEM is not implemented.** Its sizes (ML-KEM-768 public key 1,184 bytes, ciphertext 1,088 bytes) and the fact of NIST standardisation (FIPS 203, 2024) are typed constants wearing a `from-memory` chip, and the domain reviewer verifies them. The hybrid-handshake scene combines a **real** P-256 ECDH secret with the **toy** KEM secret through **real** HKDF, labelled "the combiner is real, the KEM is a toy, this is not ML-KEM". The "timeline" is not a forecast: it is **Mosca's inequality** (x + y > z means data encrypted today is at risk, with x the years data must stay secret, y the migration time, z the years until a hypothetical large quantum computer), computed from three sliders, with no date predicted.
- `e2ee-forward-secrecy`: a simplified ratchet in the spirit of the Signal Double Ratchet, **not** that protocol and not compatible with it (chip says so). Symmetric ratchet: an HMAC-SHA256 chain through `core/crypto.hmac`; message keys derive one way. DH ratchet: real P-256 ECDH and real HKDF (K4-7). Messages are real AES-GCM (K4-7). **Tests:** compromise the state at message i and decrypt messages j < i with every key derivable from it: AES-GCM authentication fails for all of them (forward secrecy, computed); after a DH ratchet step with a fresh ephemeral, the old state cannot decrypt new messages (post-compromise recovery, computed). HKDF checked against `node:crypto` `hkdfSync`.
- `secret-sharing`: Shamir over GF(p) with `Fp`; the toy field is small and shown; perfect secrecy by exhaustion on GF(7) as in §2.3; "a real vault uses a CSPRNG and a large field" hedged.
- `zero-knowledge-proofs`: as in §2.3. `core/numberTheory.modPow` for the group; no new kit.

**Payload-free (AC-0/T2 #9, restated for crypto):** nothing in these lessons recovers a key from a real system or protocol, shows a step-by-step attack on real software, or demonstrates nonce reuse against real messages. Breaking a **toy** parameter (a 5-bit curve, a 4-bit modulus) is the pedagogy and is allowed; a key-recovery routine written for general sizes is not. The payload-free reviewer's checklist is part of T4-T7.

### 2.5 ML serving: llm-serving, fine-tuning-quantization, feature-stores-skew

**Toy models only, and the numbers are computed (rule 34).** No real model name, parameter count, price, GPU model, benchmark or context-length figure appears unhedged; an illustrative configuration is a set of named constants labelled `illustrative`.

What exists to reuse: `core/nn` (`attention`, `createAttentionHead`, `createFactorisation`, `gradCheck`), `core/linalg` (`svdSmall`, at most 8 by 8; `matMul`), `core/vec`, `core/fit` (logistic regression, `numericGradient`), `core/distributions`, `core/simTick` (seeded fixed-tick simulations), `core/queueing`, and `aucTrapezoid`/`aucPairs` in `lessons/classification-metrics/model.ts`.

- **`llm-serving`.** KV-cache memory is the formula 2 x layers x kv_heads x head_dim x sequence x batch x bytes per element (a pure function, tested against a hand-worked case). **Prefill vs decode** timing comes from an analytic roofline-style function: time = max(compute time, memory time), where prefill is compute-bound (FLOPs grow with tokens) and decode is memory-bound (bytes moved per token: weights plus the cache). Illustrative hardware constants, chipped. **Continuous batching** is a `simTick` simulation: seeded arrivals with variable output lengths, static batching vs continuous batching, tokens per second and TTFT/p99 computed; the test asserts continuous batching is not worse on the seeded set (and says so only for these workloads). **One real, exact claim:** decoding with a KV cache equals recomputing attention from scratch (equal to within 1e-9 on a toy `createAttentionHead`), proved in a test and shown in a scene. Not claimed: any real model's speed.
  **Shared with `fine-tuning-quantization`:** the memory meter (bytes per parameter by dtype, weight bytes, KV-cache bytes, LoRA parameter count) is the same arithmetic in both lessons, which are in the same batch. Cross-lesson imports are not allowed in practice (the Tier 3 sign-off found none) and a batch may not carry shared code, so this is **K4-12, `core/modelFootprint.ts`**, a small pure module (§4.1). The continuous-batching `simTick` simulation and the roofline timing stay **local to `llm-serving`** (one user); the quantiser stays local to `fine-tuning-quantization`.
- **`fine-tuning-quantization`.** LoRA: parameter count r(d_in + d_out) vs d_in x d_out, computed. The "best possible rank-r update" is the truncated SVD (Eckart-Young: the squared error equals the sum of the squared dropped singular values, a test), shown as an upper bound; the update the lesson actually trains is by SGD through `core/nn` (`createFactorisation`), and the page says LoRA is trained by gradient, not by SVD. Matrices stay 8 by 8 or smaller (`svdSmall` limit). Quantization is local code (`quantize(w, bits, { scheme: 'per-tensor' | 'per-group', groupSize })`): symmetric int8/int4 on a seeded weight matrix **with one outlier**, error and memory computed; the per-tensor outlier blow-up is a computed effect. The "accuracy meter" is relabelled by rule: it shows **"output error of one toy layer on seeded inputs"**, never "model accuracy".
- **`feature-stores-skew`.** An offline batch computation and an online streaming computation of the same feature over a seeded event table, with skew sources switched on one at a time (window boundary inclusive vs exclusive, late-arriving events, a time-zone day boundary, null handling), and a **point-in-time-correct join** vs a **leaky join**. Divergence is a computed fraction of rows. Tests: a shared definition gives zero divergence on 200 seeded datasets; each skew source diverges on a named lowest seed; the leaky join's AUC exceeds the correct join's on the seeded set (logistic regression from `core/fit`). **K4-11** extracts `aucPairs`/`aucTrapezoid` to `core/` because this is the second user.

### 2.6 Lead topics: strangler-fig-migrations, build-vs-buy, conways-law, reversible-decisions, technical-strategy, influence-without-authority, hiring-interviewing

**Is the Tier 3 decision-simulator grammar enough?** Read from `core/scenario.ts`, `components/ScenarioStory.tsx`, `shared-api.md` and the seven T3 scenarios (`design-docs-rfcs`, `estimation`, `incident-response`, `mentoring-delegation`, `ml-fairness-bias`, `prioritization`, `threat-modeling`):

- **Sufficient for the branching part:** nodes, choices with a mandatory `because`, meters, endings, undo and replay, a ledger, a mandatory `invented` chip, `validateScenario` (reachability, dead ends, cycles with `allowCycles`, out-of-bounds on every path), `enumeratePaths`, a keyboard radio group where arrowing between choices shows each option's "+n if chosen" preview before Continue (so **every option's trade-off is visible before committing**, including the one the lesson does not recommend), and focus handling after each step.
- **The "meter `bad` edge not relative to start" limit is real but already worked around:** `ml-fairness-bias` and `prioritization` write `bad: { below: START.approvedB }` and `bad: { below: BASE_VALUE }` from the same named constants the `start` uses, and a test pins them. **Decision: do not add `belowStart`/`aboveStart` sugar.** It would give two ways to say one thing, and the named-constant form is the one the tests already read.
- **What the grammar cannot do:** (1) it cannot say a scenario has **no obviously-correct path**, which is the hardest rule for opinion lessons; (2) it assumes effects are authored literals, but several Tier 4 leads claim a **calculation** (a TCO curve, a coordination cost, an expected cost of reversal); (3) three leads are **not branching stories** at all (a Wardley-style evolution board, a team-and-service board, a reversibility grid).

**Decisions.**
- **K4-9, `validateScenario(s, { tradeoffs: true })`:** two new opt-in problem kinds. `dominated-choice`: a choice whose effects are no better than a sibling's on every meter (direction taken from each meter's `bad` edge) and strictly worse on one, to the same or an equally good destination: a straw man. `free-path`: a path to an ending on which no meter ever enters the red and no meter ends worse than it started (a path with no cost, which the lesson would be recommending by default). Pure functions over `enumeratePaths`; lead lessons call it with `tradeoffs: true` and the test must return `[]`. This is the mechanical teeth of "no single obviously-correct path".
- **K4-10, `ClassifyBoard` explore mode:** `build-vs-buy` (components into evolution stages), `conways-law` (services into teams) and `reversible-decisions` (decisions into reversibility-by-impact cells) are classification boards, but `ClassifyBoard` requires an `answerKey` and prints right/wrong and a score. Add `mode="explore"`: no key, no score; `onChange` feeds the lesson's pure model; an optional `reference` placement appears after the learner has placed everything, wearing `ClaimLabel kind="view"` ("one view, not the answer"). Three users, so it is kit, not local.
- **Computed, not authored.** A lead lesson that shows a figure from a model (TCO by year, coordination cost, cost of undoing a decision) computes it in a pure function from **named, invented constants** (`Provenance illustrative`), and its test recomputes the figure and the **crossover points** (the year when buy stops being cheaper, the lock-in cost at which the answer flips). The lesson shows the crossover and the assumption that moves it, **not a verdict**.
- **Simulations where the topic is one:** `strangler-fig-migrations` has a `simTick` traffic-routing simulation (percentage routed to the new path, shadow traffic comparing results, an error rate computed from a modelled defect, rollback) next to a `ScenarioStory` about what to peel first; `technical-strategy` is a `GraphView` of diagnosis, guiding policies and actions with pure orphan and conflict detection (remove a policy and its actions orphan, computed); `influence-without-authority` is a stakeholder map where each conversation changes a stakeholder's position by a **rule-based** model; `hiring-interviewing` is a seeded variance simulation (`core/distributions`).

**The honesty problem specific to the people topics.** `influence-without-authority` and `hiring-interviewing` model people. A model with a smaller noise term for "structured rubric" proves nothing about rubrics: it is circular. So the page says "this shows the arithmetic of variance, not evidence that rubrics work", and the **evidence** claim ("structured interviews are reported to predict job performance better than unstructured ones") is a `ClaimLabel kind="research"`, hedged, from memory, with no study named unless certain. No claim about any demographic group. No real person, company or incident attributed unless certain and said (AC-0/T3 #24).

**Rules for non-technical claims (rule 35):** every practice or research claim wears `ClaimLabel` (standard, research finding, common practice, one view); every number from a model is `illustrative` or `invented`; `validateScenario(..., { tradeoffs: true })` is `[]`; `because` text states **conditions** ("if the team is small and the system is a commodity, buying wins") and never a bare imperative; at least one quiz question is "it depends on X" with X named; the unrecommended ending is reachable and reads as a defensible choice with a real cost.

### 2.7 The other Tier 4 topics: oracles and kit use

These need no new kit beyond the tickets in §4; each names its independent reference (AC-0/T3 #19).

| Topic | Model | Independent reference |
|---|---|---|
| `numa-multicore` | an analytic latency model (local vs remote access), labelled a model, constants illustrative | the formula recomputed; no claim about a real machine |
| `linear-programming` | 2D feasible region by vertex enumeration | brute force over all constraint-pair intersections; refusal above 8 constraints |
| `game-theory` | pure strategy Nash enumeration | brute force over strategy profiles |
| `suffix-arrays` | suffix sort, LCP, binary search | naive sort of all suffixes; `String.prototype.indexOf` for patterns |
| `aho-corasick` | goto, failure and output links | naive multi-pattern search; a hand-built trie (not `core/automata`, a different structure: stated, not reused) |
| `lca-binary-lifting` | jump table | naive parent walk on seeded random trees |
| `online-algorithms` | ski rental, an adversary game | ratio over all season lengths, exhaustive |
| `chaos-engineering` | `simTick` on a dependency `GraphView`; blast radius is reachability | steady-state metric recomputed; the circuit breaker from `circuit-breakers` reused by id |
| `finops-cloud-cost` | pure cost model from invented prices | formulas recomputed; **no real price ever appears**, only named illustrative constants |
| `formal-methods` | `core/explore` over a small spec (mutual exclusion, Paxos-lite); the learner's invariant goes through `core/expr`, the safe hand-written evaluator, **never `eval`** | a counterexample that the explorer finds is replayed through the pure protocol |
| `deterministic-simulation-testing` | distSim plus `forSeeds` | same seed gives an identical trace hash (`core/hash`); a failing seed replays the identical violation |
| `strangler-fig-migrations`, `conways-law`, `technical-strategy`, `hiring-interviewing`, `influence-without-authority`, `reversible-decisions`, `build-vs-buy` | §2.6 | recomputed models and `validateScenario` |

`formal-methods` and `deterministic-simulation-testing` bring K4-2's user count to at least eight (paxos, byzantine-faults, flp-impossibility, memory-ordering-atomics, lock-free-cas, formal-methods, plus `distributed-snapshots` and `deterministic-simulation-testing` on the seeded side), which is why K4-2 is the highest-value ticket in this plan and also the riskiest.

---

## 3. AC-0/T4: what every Tier 4 lesson adds on top of AC-0, AC-0/T2 and AC-0/T3

AC-0 (rollout-plan §1.4), **AC-0/T2 rules 1-13** (§3.1.3) and **AC-0/T3 rules 14-26** (tier3-plan §3) apply in full to new lessons and to the nine retrofits. Cite them by number. The Tier 3 clarifications stand: rule 13 allows a link only to a lesson that exists or sits in an earlier wave, and a link to a lesson in the **same wave but another batch** is forbidden; rule 12's second reviewer reads the flagged lessons of a batch before it merges.

Tier 4 adds the rules below. Each names the Tier 3 finding class it prevents (§1). Reviewers cite them as "AC-0/T4 #n". The mechanical ones are enforced by `lessonContentT4.ts` (§6) and the sweep (T4-T4).

27. **A theorem is labelled or checked, and a bounded check never says "impossible" or "always".** Every theorem-shaped statement on screen (FLP, 3f + 1, the Hasse bound, 1 - 2^-k soundness, the 2-approximation, perfect secrecy) is one of: **(a)** checked by exhaustive enumeration over a stated bound, with the bound on screen ("all 4,812 reachable states of this model"); **(b)** a seeded Monte Carlo with a stated tolerance; **(c)** a `ClaimLabel kind="theorem"` reading "argued, not run here", naming the result. A search that was truncated, or that covered only a bounded model, says "in the N states explored", never "no execution can". A halting-style tool still says "did not decide within N steps" (AC-0/T3 #23). *(Tier 3: an absolute from a bounded run; B8 halting wording.)*
28. **Safety is checked twice where it can be, and the screen says which check ran.** At least 200 seeded fault schedules with the invariant asserted at every step (AC-0/T3 #20), **and** an exhaustive `explore` run when the state space fits the budget (K4-2), reported with its state count and `truncated` flag. A "holds in all states" sentence is permitted only when an exhaustive run completed; otherwise "sampled over 200 seeds". Liveness is a separate claim, stated separately, with the fraction of seeds that did not decide. *(Tier 3 "Distributed-simulation scope: not exhaustive search".)*
29. **A broken mode names its counterexample, fails for the stated reason, and is not trivially everywhere.** The counterexample object is whichever fits the claim: the **lowest failing seed**, the **shortest counterexample path** (explorer, BFS), or for an impossibility the **witness schedule**. A test asserts that the violation message or rule index equals the one the lesson names (a pinned broken seed that fails for a different reason is a defect), that the **fixed** mode passes the same seeds, and that the broken mode fails on **at most 90% of the seeds** unless a counterexample path is shown instead; the lesson prints "fails on k of 200 seeds". "Lowest failing seed 0" with every seed failing is meaningless and is rejected. *(offline-first-sync: both broken modes fail on nearly every seed.)*
30. **Proof-shaped lessons are manipulated, not narrated.** The spec names the **toy**, the **wrong move**, the **exact refusal text**, and a test named `manipulation N: ...` that makes the wrong move headless and asserts the refusal; the lint counts at least two such tests for the topics in `PROOF_SHAPED_IDS`. Review check: press only Next/Play through every scene; if the caption sequence does not depend on any control, the lesson goes back. Appendix A lists the toy per topic. *(Tier 3 AC-0/T3 #23, made enforceable.)*
31. **A simulated machine is labelled a model, with its rules on screen.** For weak memory, hardware, schedulers and any "what the CPU/network/cluster really does": a persistent `Provenance kind="simulated"` chip reading "a model of X, not X", the model's rules listed **in the stage** (store buffers drain in order; loads forward from the thread's own buffer), what the model does **not** cover (load buffering, out-of-thin-air), and an expected-outcome table verified against an independent oracle or a named published table by the domain reviewer. Never "this is what happens on your machine". *(rollout-plan §3.3 risk on memory-ordering-atomics.)*
32. **Toy crypto is honest.** Every parameter shows its bit size; a persistent `Provenance kind="toy"` chip sits on any key, modulus, curve or group under 128 bits; real crypto means `crypto.subtle` through `core/crypto` (chip `real`) or a BigInt implementation **cross-checked against `node:crypto` in a test**; never "secure", "unbreakable" or "safe to use" about a toy; the cost of breaking the toy and the real size is **computed** and shown side by side; BigInt code carries "not constant-time, never copy this"; randomness is seeded and says so; no key or secret literal (`fakeSecret`, and the secret-shape scan stays green); test vectors come from a **named standard or `node:crypto`**, never from the lesson's own output; the lesson is payload-free (AC-0/T2 #9): no key recovery for real systems, only toy-size breaks. Two domain reviewers (one recomputes vectors, one reads for overclaiming). *(Tier 3 #21, #22; rollout-plan §3.3 risk "advanced crypto".)*
33. **Real-world facts from memory are chipped, and named by topic, not by section number.** Sizes of standardised objects, product behaviours, vendors' names, papers and figures not computed in the lesson wear `Provenance kind="from-memory"` at the point they matter. A paper or standard is named by title, venue or year only where the author is certain ("the HotOS 2021 metastable-failures paper"); RFC and section numbers are included only where certain, otherwise the topic is named. A typed constant of a standard (ML-KEM sizes, curve parameters) has an internal-consistency test (the generator is on the curve, n times G is infinity) in addition to the reviewer's source check. *(Tier 3 #21; the T3 sign-off "every claim from memory ... shown as a chip".)*
34. **ML serving is a toy with computed numbers, and every meter says what it measures.** Toy models, seeded data, constants named and labelled `illustrative`; no real model name, size, price, GPU, benchmark or context length unhedged. A meter that stands for quality is labelled by what it measures ("output error of one toy layer", never "accuracy"). An equality the lesson asserts (cached decoding equals recomputation) is a test to within a stated tolerance. *(Tier 3 #22.)*
35. **Lead and decision lessons: every claim labelled, every option's cost visible, no dominated option, invented numbers invented.** `ClaimLabel` on every practice or research claim (AC-0/T3 #24); `Provenance illustrative` or the scenario's `invented` chip on every modelled figure; `validateScenario(s, { tradeoffs: true })` returns `[]` (K4-9: no straw man, no free path); a figure the lesson presents as a calculation comes from a pure function whose test recomputes it **and its crossover points**; the lesson shows the assumption that flips the answer, not a verdict; `because` text states conditions; at least one quiz question is "it depends on X" with X named; no real person, company or incident unless certain. *(Tier 3 B31 reviews: invented history labelled, contested verdicts, chip order.)*
36. **Models are deterministic, and a seeded run shows its seed.** Lesson source (tests excluded) never calls `Math.random`, `Date.now`, `performance.now` or `new Date` (lint `no-clock-or-random`; `allow-random: <reason>` exempts a line); every random choice comes from a seeded `Rnd` (`mulberry32`); a lesson that builds a cluster, a tick sim or an explorer shows `Provenance seed=` or a `SeedField` (lint `seed-visible`). React keys come from generated ids, never from the clock. *(Tier 3: `raft` and `backpressure`-style unseeded sims; `Date.now()` keys.)*
37. **Hook inputs are stable, and every control is tested at its extremes and one beyond.** Arrays, frames and objects passed to `usePlayer`, `useTickSim`, `useSimulation` or an `introKey` are memoised or module constants, never built in the render (lint `fresh-array-hook`; `allow-fresh: <reason>`). Every pure model function that takes a control value has a test at the control's **minimum, maximum, and one step beyond** (clamped or refused with a message), the Tier 3 slider-max crash class. A fallback is a module-level constant, never `?? []`. *(count-min-heavy-hitters slider max; graph-coloring and property-based-testing fresh arrays.)*
38. **`npm run sweep` is clean, per batch.** Every lesson passes `npm run sweep -- <ids>` (T4-T4) at 1440 and `--mobile` with zero console errors or warnings, zero visible `NaN`/`Infinity`/`undefined`/float-residue text, no error-boundary text, no focus drop to `body`, no frozen player, and no network request off the page. The batch report carries the sweep's summary line. Smoke and `captions` are necessary, not sufficient (they only walk the default scene). *(Tier 3 sign-off: the sweep found 4 crashes and 3 focus drops that smoke passed.)*
39. **The Tier 4 kit and the prerequisite claims are read before writing.** The batch report opens with "Kit used" and "Kit missing" (AC-0/T3 #25), now naming the §4 pieces (`core/explore`, `distSim` v2, `memModel`, `sat`, `tsp`, `ecc`, `ClassifyBoard` explore mode); two lessons in one batch needing the same missing piece stop for a kit round. A lesson that builds on one of the nine retrofitted lessons (`raft`, `crdts`, `backpressure`, `multi-region`, `distributed-transactions`, ...) reads that lesson's claim on the point first and files a ticket on a mismatch; until the retrofit has merged it describes the point in words and links by id only afterwards (AC-0/T2 #13). *(Tier 3 #25.)*

Rules 14-26 that matter most for Tier 4, called out so builders do not skim them: **#20** (distSim invariants, the broken mode), **#21** (chips), **#22** (statistics and ML computed), **#23** (manipulable object), **#24** (lead claims), **#26** (every scene at 390 and 768).

---

## 4. Shared-kit prerequisites and tooling tickets

Same discipline as tier3-plan §4: every ticket has **two or more named Tier 4 users** (K4-8 and K4-11 are small and noted), the API is minimal and grows on a real second need, extractions migrate their callers pixel-identically (`smoke --frames` plus `diff`), every ticket updates `docs/shared-api.md` and the `#/dev/kit` showcase, and **batches never edit shared code**: misfits go into the batch report as Phase 2 requests.

**Reused, not rebuilt:** `core/distSim`, `core/simTick` and `useTickSim`, `core/scenario` and `ScenarioStory`, `core/regex` (not needed in Tier 4; stated so nobody pulls it in), `core/automata` (not reused for Aho-Corasick: different structure), `core/crypto`, `core/fakeSecret`, `core/numberTheory`, `core/sha256`, `core/vec`, `core/fit`, `core/linalg`, `core/nn`, `core/distributions`, `core/expr`, `core/parseKit` (learner-written CNF, litmus text, invariants: refusal messages, no `eval`), `Plot2D`, `GraphView` (with the K3-5 underlay), `SequenceDiagram`, `CellGrid` (KV-cache grid, store buffers), `ClassifyBoard`, `Provenance`/`ClaimLabel`, `SeedField`, `core/testing/{forbidden,nodeCrypto,sqlite,strings}`.

### 4.1 Kit tickets

**Position and Gate (the coordinator's wave order, which Atlas's plan follows).** **Wave 1:** T4-R1, T4-B3 (np-reductions, sat-solvers, approximation-algorithms, local-search-annealing, linear-programming), T4-B5 (strings, trees, games), T4-B8 (strangler-fig-migrations, conways-law, build-vs-buy, technical-strategy). **Wave 2:** T4-B1 (failure-detectors, gossip-protocols, metastable-failures, chaos-engineering, deterministic-simulation-testing), T4-B4 (paxos, byzantine-faults, flp-impossibility, distributed-snapshots, hybrid-logical-clocks, distributed-sql-truetime), T4-R2, T4-B9 (reversible-decisions, influence-without-authority, hiring-interviewing). **Wave 3:** T4-B2 (memory-ordering-atomics, lock-free-cas, numa-multicore, formal-methods), T4-B6 (the five crypto lessons), T4-B7 (llm-serving, fine-tuning-quantization, feature-stores-skew, finops-cloud-cost). **P0** = the kickoff kit round, **merged before wave 1**. **P1** = built by its own agent **during wave 1**, **merged before wave 2**. **P2** = built **during wave 2**, **merged before wave 3**. The rule behind the column is unchanged (a ticket is gated before its first user), so a reorder only changes the labels.

| # | Piece | Location | Tier 4 users | Minimal API | Gate (done when) | Position, blocks |
|---|---|---|---|---|---|---|
| K4-1 | **distSim v2** | `core/distSim/cluster.ts` (additive) | distributed-snapshots (`fifo`), failure-detectors (per-link loss, one-way partition), gossip-protocols (loss), paxos (per-type loss), deterministic-simulation-testing, chaos-engineering (kill a link), plus any T3 distSim lesson that wants a client behind a partition | `fifo?: boolean`; `loss?: number \| ((msg, now) => number)` (drawn once per send, so unrelated latencies never shift); `dropWhere(pred, from, to)`; `partition(a, b, from, to, { oneWay })`; `inject(at, to, payload, { from: nodeId })` goes through the network | **Backward compatibility first:** every existing distSim test and the pinned `electionExample` trace pass with all options unset. Then: with `fifo`, per-link arrival order equals send order over 500 seeds with random latency, and without it order is violated on at least one seed (so the option does something); `loss` as a function drops exactly the matching messages; one-way partition drops only the crossing direction; a network `inject` is dropped by a partition and an unconstrained `inject` is not. | P1 (during wave 1, merged before wave 2); blocks **B1** (failure-detectors, gossip-protocols, chaos-engineering, DST) and **B4** (paxos, distributed-snapshots) |
| K4-2 | **`core/explore` + pure protocol + `TracePlayer`** | `core/explore.ts`, `core/pureProtocol.ts`, `components/TracePlayer.tsx` | paxos, byzantine-faults, flp-impossibility, formal-methods, memory-ordering-atomics (via K4-3), lock-free-cas (via K4-3), distributed-snapshots (small-N exhaustive leg), deterministic-simulation-testing (8) | As §2.1: `explore({ init, actions, key, invariant, maxStates, maxDepth })` returning `{ states, depth, truncated, violation: { message, path } \| null }` (BFS, so the shortest path); `PureProtocol`, `networkExplorer`, `asDistNodes`; `TracePlayer` memoises its frames internally. | Explorer finds a planted violation at its **shortest** depth on a toy system and reports `truncated` honestly when the budget is hit; the Paxos exhaustive run completes within 5 s and 250k states or the ticket records the scope reduction (**uncertain**, §2.1); **`asDistNodes(protocol)` under `forSeeds` and `explore` over the same protocol agree on a planted violation** (found by both); the same protocol, a deliberately broken copy, is caught by both. | P1 (during wave 1, merged before wave 2; **the Paxos spike runs first**, scope cuts in §2.1); blocks **B1** (deterministic-simulation-testing), **B4** (paxos, byzantine-faults, flp-impossibility), **B2** (formal-methods) and K4-3 |
| K4-3 | **`core/memModel`** | `core/memModel.ts` | memory-ordering-atomics, lock-free-cas (2) | `Litmus`, `Instr`, `Model = 'sc' \| 'tso' \| 'relaxed'`, `outcomes(l, model, budget)`; learner text through `parseKit` (refusals, no `eval`) | SC and TSO outcome sets equal the second-formulation oracle on the in-fragment fixtures; the expected-outcome table for SB, MP, LB, IRIW, 2+2W is checked in review against published tables (typed from memory); the wrong-TSO and no-fence counterfactuals fail their tests; ABA found by the explorer on a free-list heap and absent from the tagged-pointer version in the stated bound. `relaxed` is optional (cut if the spec does not need it). | P2 (during wave 2, merged before wave 3; needs K4-2, merged by then); blocks **B2** (memory-ordering-atomics, lock-free-cas). Built **without** `relaxed` unless the §2.2 criterion is met |
| K4-4 | **`core/sat`** | `core/sat.ts` | np-reductions (checker), sat-solvers, formal-methods (bounded check toy) (3) | `Cnf`, `parseCnf` (via `core/parseKit`), `dpll(cnf, { heuristic })` returning the decision/propagation/conflict trace, `bruteForce(cnf)` as the oracle; package-resolution encoding reuses `core/semver` | DPLL vs brute force on 1,000 seeded random 3-SAT formulas up to 10 variables (satisfiability and model validity); the trace replays to the same result; refusal above the size limits. | P0; blocks **B3** (np-reductions, sat-solvers) |
| K4-5 | **`core/tsp`** | `core/tsp.ts` | approximation-algorithms, local-search-annealing (2) | Euclidean distance matrix, Prim MST, Held-Karp (n at most 12), 2-opt with the step trace, a double-tree tour and a Christofides tour (minimum-weight perfect matching on the odd-degree vertices by bitmask DP, at most 12 of them), `tourLength` | Held-Karp vs brute force for n at most 8; MST weight vs a second algorithm (Kruskal via `core/disjointSet`); the tour ratios on 1,000 seeded Euclidean instances stay under 2 and 1.5 (a bound on the set, not a proof); a planted non-metric instance exceeds the bound (so the test can fail). | P0; blocks **B3** (approximation-algorithms, local-search-annealing) |
| K4-6 | **`core/field` + `core/ecc`** | `core/field.ts`, `core/ecc.ts` | elliptic-curves, post-quantum-crypto (toy ECDLP and the hybrid scene), secret-sharing (`Fp`), zero-knowledge-proofs (`Fp`) (4) | `Fp` ops on `bigint` over `numberTheory`; short-Weierstrass `add`, `double`, `mul(k, P)` with the step trace, `onCurve`, `orderOf(P)` for toy curves, named constants for the toy curve, secp256k1, P-256 | The four tests of §2.4: constants self-consistent; **equal to `node:crypto` ECDH for 50 seeded scalars on both curves**; the F17 group law exhaustively (all 19^3 associativity triples, point count, Hasse bound); the live `crypto.subtle` P-256 cross-check helper. | P2 (during wave 2, merged before wave 3); blocks **B6** (elliptic-curves, post-quantum-crypto, secret-sharing, zero-knowledge-proofs) |
| K4-7 | **`core/crypto` additions and test oracles** | `core/crypto.ts`, `core/testing/nodeCrypto.ts` | e2ee-forward-secrecy, post-quantum-crypto (hybrid), elliptic-curves (the real cross-check) (3) | `ecdhKeyPair`, `ecdhDerive`, `exportPublicPoint`/`exportPrivateScalar` (for the cross-check), `hkdf(ikm, salt, info, length)`, `aesGcmEncrypt`/`aesGcmDecrypt`; every helper null without `crypto.subtle`; oracle wrappers `nodeEcdhPublic`, `nodeHkdf` | HKDF equals `node:crypto` `hkdfSync` on seeded inputs; AES-GCM round-trips and **rejects a flipped bit and a wrong key**; ECDH shared secrets agree both ways; all null paths covered. | P2 (during wave 2, merged before wave 3); blocks **B6** (e2ee-forward-secrecy, post-quantum-crypto, the elliptic-curves cross-check) |
| K4-8 | **`ClaimLabel kind="theorem"`** | `components/ui.tsx`, `core/provenance.ts`, `kit.css` | flp-impossibility, byzantine-faults, np-reductions, approximation-algorithms, secret-sharing, zero-knowledge-proofs (6) | One more kind, printed "theorem (argued, not run here)", same muted chip, distinct border style, `role="note"`, aria text as the other kinds | `provenance.test.ts` pins the kind, its distinct label and aria text; existing kinds pixel-identical. (Small; one commit.) | P0 (decided: build it); blocks theorem lessons in all three waves: **B3** (np-reductions, approximation-algorithms), **B4** (byzantine-faults, flp-impossibility), **B6** (secret-sharing, zero-knowledge-proofs) |
| K4-9 | **`validateScenario` trade-off checks** | `core/scenario.ts` | strangler-fig-migrations, build-vs-buy, technical-strategy, influence-without-authority, hiring-interviewing, reversible-decisions (6) | `validateScenario(s, { tradeoffs: true })` adds `dominated-choice` and `free-path` to `ProblemKind`; both pure, over `enumeratePaths` | Each new kind is shown on a deliberately broken scenario and absent from a good one (the T3 `design-docs-rfcs` scenario must pass with `tradeoffs: true`, or the ticket records why it is exempt); existing kinds unchanged. **No `belowStart` sugar** (§2.6). | P0; blocks **B8** (strangler-fig-migrations, technical-strategy, build-vs-buy) and **B9** (reversible-decisions, influence-without-authority, hiring-interviewing) |
| K4-10 | **`ClassifyBoard` explore mode** | `components/ClassifyBoard.tsx`, `core/classify.ts` | build-vs-buy, conways-law, reversible-decisions (3) | `mode="explore"`: `answerKey` optional, no score or per-item verdict, `onChange` feeds the lesson's model, optional `reference` revealed after everything is placed under `ClaimLabel kind="view"` | Existing `ClassifyBoard` callers (`undefined-behavior`, `chomsky-hierarchy`, `randomness-csprng`) pixel-identical; keyboard path and focus after each placement tested; `classify.test.ts` covers the no-key path. | P0; blocks **B8** (build-vs-buy, conways-law) and **B9** (reversible-decisions) |
| K4-11 | **`core/rocAuc`** | `core/` (extracted from `classification-metrics/model.ts`) | feature-stores-skew, classification-metrics (migrates) (2) | `aucPairs`, `aucTrapezoid` exported from `core/` | `classification-metrics` pixel-identical; tests move with the functions; the two methods agree on seeded data. (Small.) | P2 (during wave 2, merged before wave 3); blocks **B7** (feature-stores-skew) |
| K4-12 | **`core/modelFootprint`** | `core/modelFootprint.ts` | llm-serving, fine-tuning-quantization (2, same batch, so a kit ticket and not a cross-import); finops-cloud-cost may read it if its spec wants memory sizing (not counted) | `dtypeBytes(dtype)` (fp32, fp16, bf16, int8, int4), `weightBytes(params, dtype)`, `kvCacheBytes({ layers, kvHeads, headDim, seq, batch, dtype })`, `loraParams(dIn, dOut, r)`, `fullParams(dIn, dOut)`. Pure; illustrative model configs live in the lessons, not here | A hand-worked KV-cache case; `loraParams` against a direct count of a small adapter's entries; int4 packing (two values per byte) checked; no lesson constants in `core/` | P2 (during wave 2, merged before wave 3); blocks **B7** (llm-serving, fine-tuning-quantization) |

**Considered and kept local** (one Tier 4 user, or not similar enough): the phi-accrual detector and SWIM (failure-detectors only), HLC functions (hybrid-logical-clocks; promoted to `core/hlc` **only if** distributed-sql-truetime lands in the same batch and needs them, because a batch may not carry shared code), Shamir and Schnorr (one lesson each; they use `Fp`), the quantiser (fine-tuning-quantization), the KV-cache and roofline formulas (llm-serving), `lp2d` and the Nash enumerator, the Wardley-style stage labels (build-vs-buy), the stakeholder model (influence-without-authority), the DPLL-tree drawing (sat-solvers).

**Order and staffing.** **Kickoff round (P0): three agents, disjoint files, merged before wave 1, in this order.** **Agent B (tooling) first: T4-T6 (parallel-agent robustness) and T4-T4 (the sweep), then T4-T5**, because parallel agents corrupt each other's runs until T4-T6 lands and the sweep is the gate every later batch uses. **Agent A:** T4-T1 to T4-T3, T4-T7, T4-T8, K4-8, K4-9. **Agent C:** K4-4, K4-5, K4-10. **During wave 1**, a fourth agent builds **K4-1 and K4-2** (the Paxos spike first; merged before wave 2). **During wave 2**, an agent builds **K4-3, K4-6, K4-7, K4-11 and K4-12** (merged before wave 3). Wave 2's B1 needs K4-1 and K4-2 (DST uses `explore`); wave 3's B2 needs K4-2 for `formal-methods` and K4-3 for memory-ordering-atomics and lock-free-cas (K4-3 itself needs K4-2): all satisfied by merging K4-1 and K4-2 before wave 2 and K4-3 before wave 3.

### 4.2 Tooling tickets

| # | Ticket | Done when |
|---|---|---|
| T4-T1 | **Register the 41 Tier 4 topics** in `curriculum.ts` (tier 4, by track, titles and taglines from the backlog or Atlas's list, minutes unset). The nine existing entries are untouched. | Home shows 50 Tier 4 cards (9 built, 41 planned) behind "Show 41 planned"; `curriculum.test.ts` gains a "Tier 4 roadmap" block asserting unique ids, every id in Atlas's final list registered, per-track counts (hw 1, os 2, lang 2, math 2, dsa 6 new + 1 existing, arch 8 new + 4 existing, data 1 new + 2 existing, sec 5 new + 1 existing, ops 2 new + 1 existing, craft 2, ml 3, lead 7 per rollout-plan §3.3, adjusted by Atlas's validation), and that `leases-fencing` is **Tier 3**; eyeballed at 1440, 768, 390; smoke passes. |
| T4-T2 | **Tier 4 content lint** (`lessonContentT4.ts` plus the test wiring of §6) | The mechanical rules of §6 fail on planted bad fixtures, run over every Tier 4 lesson, and the nine existing lessons are on a named allowlist that T4-R1/R2 empty. A new Tier 4 lesson is linted **from its first commit**. |
| T4-T3 | **CLAUDE.md** gains one paragraph and a pointer | The Tier 4 rules by heart (theorems labelled, exhaustive-or-sampled stated, toy crypto honest, no `Math.random`/`Date.now` in lesson source, sweep clean) and "read AC-0/T4 in `docs/tier4-technical.md` §3". Docs-only. |
| T4-T4 | (first in the kickoff order, with T4-T6) **`npm run sweep`**: the Tier 3 sign-off drivers as a repo script (§4.3) | `scripts/sweep.mjs` plus `scripts/lib/sweep/`, with a self-test that proves each detector fires on a fixture; joins every batch's gates (rule 38) and the Tier 4 sign-off (four shards). |
| T4-T5 | **`npm run captions` coverage** (§4.4) | Lessons without a step player are listed as skipped with the pointer to the sweep, and the sweep's caption capture applies the same glued-sentence rule to every caption it sees. |
| T4-T6 | (first in the kickoff order) **Parallel-agent robustness** (§4.5) | Vite and oxlint ignore `.claude/worktrees` (anchored); smoke and the sweep survive a cold first run; a parallel-agent edit no longer reloads another checkout's server. |
| T4-T7 | **Domain-review protocol** for the flagged lessons | Sentry reviews each flagged lesson per batch **before merge**; the crypto and theory lessons get two reviewers with the split of §2.4 (vector recomputation vs overclaim and payload-free reading); per-area checklists (theorem labels and bounds, litmus tables against published sources, toy-parameter honesty, lead claim labels); findings recorded per batch as in Tier 2 and 3. |
| T4-T8 | **Audit the open Tier 3 kit requests that Tier 4 touches** (`docs/tier3-kit-requests.md` "left over") | Each of these is built, declined with a reason in `shared-api.md`'s "Not built", or folded into a K4 item: the `Tray` array-children `hasItems` fix, `parseRows` trailing-comment handling, the `StageFrame` `introKey` array-by-value fix (also stopped by rule 37), the per-lesson "no `RegExp` or `eval` on learner text" scan helper (the learner-text parsers of K4-3, K4-4 and the formal-methods invariant box need it), the remaining joiner migration (optional), and the `core/testing/strings` `stringsUpTo` migration (optional). |

### 4.3 T4-T4: `npm run sweep`

**Why.** The Tier 3 sign-off found four crashes or frozen players (`graph-coloring`, `kafka-partitioned-log`, `change-data-capture`, `property-based-testing`) and three focus drops that plain smoke and even `smoke --scenes` could not see, by driving every control with extremes through throwaway scripts that live only in a session scratchpad. They are not in the repo, so the next tier would redo the work or skip it. The Tier 3 numbers to beat: 2,166 control actions and 550 key presses over 65 lessons, then 3,545 actions and about 7,070 key presses over 101 lessons, with zero React warnings of any kind at the end.

**Where it lives.** `scripts/sweep.mjs` (CLI), `scripts/lib/sweep/` with `controls.mjs` (control enumeration run inside the page), `actions.mjs` (the plan per control kind), `observe.mjs` (console, focus and text observers), `scan.mjs` (pure detectors) and `report.mjs`. `package.json`: `"sweep": "node scripts/sweep.mjs"`. It reuses `openPage`, `visit`, `lessonIds`, `parseArgs` from `scripts/lib/browser.mjs` and `scanScenes`/`shardIds` from `scripts/lib/scenes.mjs`, and imports `src/core/testing/glue.ts` for the caption glue rule the way `captions.mjs` does. Pure detectors have unit tests in `scripts/lib/sweep/*.test.mjs` (Vitest already includes `scripts/**/*.test.mjs`).

**Interface.**

```
npm run sweep -- <ids...>                       # these lessons, 1440 wide, seeded Math.random
npm run sweep -- <ids...> --mobile              # 390 x 844, also the overflow and clipped-content checks of smoke
npm run sweep -- --shard=2/4                    # every 4th lesson from the 2nd; ids and shard combine
npm run sweep -- <ids...> --fast                # extremes and one click per control, 1 s idle (a pre-push check)
npm run sweep -- --selftest                     # fixtures: proves each detector fires and a clean page stays clean
flags: --idle=<ms> (default 3000)  --max-actions=<n> (default 400 per lesson)  --json=<file>
output: one line per lesson, then SWEEP_SUMMARY {json}; exit 1 on any finding
```

**What it does for each lesson**, per scene (it clicks every scene tab through the shared scene scan):
1. **Enumerates the controls** in the stage and the page: buttons, `role=radio`/`tab`/`button`, `summary`, checkboxes, selects, `input[type=range]`, number and text inputs, step-player controls.
2. **Exercises each with extremes.** Sliders: set to `min`, `max`, the middle, and one step either side, through the native value setter plus an `input` event; then `Home`, `End`, `PageUp`, `PageDown` and five `ArrowLeft`/`ArrowRight` presses with the slider focused. Text and number fields: the hostile list of AC-0/T2 #5 (empty, a space, `-1`, `0`, a 23-digit number, `1e400`, `NaN`, an emoji, `<b>x</b>`, a comma list with a gap). Selects: every option. Radio groups: every radio. Buttons: one click each, in DOM order, then a second pass in reverse order (order-dependent state is a real class). Step players: Play, wait three intervals, step, scrub to first and last.
3. **After every action** (with a 120 ms settle) it checks:
   - **Console:** every `error` **and `warning`** and every `pageerror`: React key warnings ("unique key"), "Maximum update depth exceeded", "Received NaN for the `cx` attribute", uncaught exceptions. Zero tolerance.
   - **Text residue:** `document.body` text, SVG `<text>`, `title` and `aria-label`, scanned by `scanResidue(text)`: the words `NaN`, `Infinity`, `-Infinity`, `undefined`, `[object Object]`; `null` directly before a unit; and **float-residue** shapes such as `0.0000000000000568` and `5.68e-14` (digits after the point beyond nine, or any `e-NN` exponent). An element with `data-sci` (a legitimate scientific display such as 2^128) is exempt; nothing else is.
   - **Error boundary:** the text "This lesson hit an error" or "Something went wrong", `.crash-panel`.
   - **Focus:** `document.activeElement` was inside the stage before the action and is `body` (or a detached or hidden node) afterwards. The pre-action target matters: a click on a non-focusable SVG area is not a drop.
   - **Frozen player:** after Play, the frame counter must change within three intervals unless it is at the last frame.
   - **Off-page requests:** any request to a host other than the dev server's own (the runtime enforcement of "stays inside the page"; the Vite HMR socket and `/@vite` paths are ignored).
   - **Captions:** every caption seen goes through `gluedSentences` and is checked for the placeholder "Press play, or poke" once an action has happened.
4. **Reports** the first offence per control with the control's description and the value that triggered it, so a failure is reproducible by hand.

**Determinism.** `openPage({ seed: 1, reducedMotion: false })`: seeded `Math.random` (rule 36 makes this belt and braces), the same hostile list, the same order. Two runs over the same tree give the same report.

**Where it sits in the gates.** Added to the per-batch gate list beside `npm run smoke`, `smoke -- --mobile`, `captions`, `check-tokens -- --strict`, `npm test` (AC-0/T4 #38), run on the batch's own ids. The Tier 4 sign-off runs it over all 50 lessons in four shards (about 50 lessons, a fraction of Tier 3's 166). Like smoke it needs the dev server on demand (`npm run dev`, stopped afterwards) and checks it serves its own checkout (`/__kinetic_root`).

**Done when.** `--selftest` passes: a fixture page that renders `NaN`, prints a key warning to the console, drops focus to `body` on a click, shows `0.0000000000000568`, throws into an error boundary and spins a render loop is flagged on every one of those, and a clean fixture is not; the sweep reports clean on five existing lessons the Tier 3 sign-off fixed (so it can be shown to pass); and each of the four Tier 3 crash classes is reproduced by a fixture and caught.

**Uncertain:** the right default `--max-actions` and idle time are a guess; Tier 3's runs took long on a loaded machine. `--fast` and sharding are the escape valves, and the ticket's first report records the measured time per lesson so the batch gate can be sized.

### 4.4 T4-T5: `npm run captions` for lessons without a step player

`scripts/captions.mjs` skips any lesson with no `.tbtn-play` (the line `if (!(await page.$('.tbtn-play'))) continue;`). In Tier 3 that is 118 of 166 lessons, covered by unit tests only. **Decision: do not teach `captions` to drive controls.** Its stale-run check ("six frames with the same caption") only means something for a recorded frame sequence; a live simulation has no frames. The sweep already visits every state a control can reach and reads every caption it produces, so it is the right home. Concretely: (1) `captions` prints `skip <id> (no step player: covered by npm run sweep)` and a final count, and its exit code is unchanged; (2) the sweep applies `gluedSentences` and the "no caption after interaction" check to every caption it captures; (3) `docs/shared-api.md` or the README line on `captions` says the split in one sentence. The change is about ten lines in `captions.mjs` and nothing else.

### 4.5 T4-T6: robustness so parallel agents stop corrupting each other's runs

Three concrete defects in the current setup, with the fix for each. **The first failure mode is reported (cold server first-run timeout); I have not reproduced it and could not start a server here, so each fix needs a builder's confirmation.**

1. **Cold server.** `openPage()` does `fetch(BASE_URL)` and then `page.goto(..., { waitUntil: 'networkidle0' })` with Puppeteer's 30 s default; a freshly started Vite transforms and pre-bundles on the first request and can exceed it. Fix in `scripts/lib/browser.mjs`: `page.setDefaultNavigationTimeout(90_000)`, one **warm-up navigation** to `BASE_URL` (retry once) before the first lesson is measured, and `visit()` retrying once on a timeout error with a log line saying it retried (never silently).
2. **A worktree under the repo is watched by the main checkout's Vite.** `.claude/worktrees/<name>/` lives inside the main checkout, so the main dev server's watcher sees every edit an agent makes there, including copies of `index.html`, and can reload or confuse the page. Fix in `vite.config.ts`: `server.watch.ignored` containing the **absolute, config-anchored** path `path.join(path.dirname(fileURLToPath(import.meta.url)), '.claude', 'worktrees', '**')` and the same for `.smoke`. **Anchoring is the point:** a bare `'**/.claude/worktrees/**'` would also ignore *every file* of a dev server whose own root is a worktree (its root path contains `.claude/worktrees`), which would silently break a worktree's HMR. Verify two things before merging: that `server.watch.ignored` is **merged** with Vite's default ignores (`.git`, `node_modules`) and does not replace them (**uncertain: I believe it merges; confirm in the installed Vite 8 source or with a throwaway check**), and that nothing imports from `.claude/` (nothing does today: lesson globs are relative to `src`). Add a small unit test for the pattern builder (it matches `<root>/.claude/worktrees/x/y` and does **not** match `<root>/src/x`, including when `<root>` itself contains `.claude/worktrees`).
3. **oxlint scanning worktrees.** `.oxlintrc.json` has no `ignorePatterns`, so `npm run lint` in the main checkout can lint a worktree's copy of the code and fail or slow on someone else's half-edited files. Add `"ignorePatterns": [".claude/**", ".smoke/**", "dist/**"]` (paths in an oxlint config are relative to the config file, so this is correct in the main checkout **and** inside a worktree without anchoring tricks). **Uncertain:** oxlint may already skip them if it honours the global git ignore (`~/.config/git/ignore`, which already hides worktrees); the line is harmless either way. Confirm `check-tokens` (`scripts/check-tokens.mjs`) walks `src/` only; if it walks the repo, give it the same exclusion.

Not touched: `tsc -b` (its `include` is `src`), `vitest` (its `include` is `src/**` and `scripts/**` relative to the root), `vite build` (starts from `index.html`).

---

## 5. Retrofitting the 9 existing Tier 4 lessons (T4-R1, T4-R2)

`raft`, `distributed-transactions`, `backpressure`, `multi-region`, `lsm-trees`, `crdts`, `probabilistic-structures`, `slos-error-budgets`, `zero-trust`. They predate every test, chip and lint rule: **eight of nine have no test file at all** (only `raft/sim.test.ts` exists, and it runs 12 seeds of one scripted scenario), **none has a `Provenance` chip**, all nine are on the K-2 quiz baseline, and every claim a Tier 3 lesson makes about them (the nine Tier 3 to Tier 4 edges of tier3-plan §1.5) rests on text no test has checked. Method: the source of every lesson (index, model files, Stage by grep) read against AC-0/T2, AC-0/T3 and AC-0/T4. **Static only (see the top of this file):** the sweep may add crash and focus findings.

### 5.1 Findings, per lesson

Counts are distinct numbered defects (a claim counts once per claim). "Chip" means no `Provenance` anywhere in the lesson's source (a grep over all nine returns nothing). Quiz findings are the K-2 baseline plus my reading of the questions.

**`raft` (9)** [domain review]
1. No chip: the sim is simulated, its constants (`LATENCY` 550 ms, `HEARTBEAT` 800 ms, timeouts 1,500 to 4,500 ms) are "slowed right down so humans can watch" (a comment in `sim.ts`), and crash and partition are scripted by buttons; none of it says so on screen.
2. `Math.random` unseeded in `sim.ts` (election timeout, message latency jitter, lines 99 and 111): the live run shows no seed and cannot be reproduced.
3. Safety is tested on **12 seeds** (`TRIALS = 12`) through one scripted scenario (elect, two commands, partition, heal, crash), by globally mocking `Math.random` with `vi.spyOn`; AC-0/T3 #20 wants at least 200 fault schedules.
4. **No broken mode.** Nothing shows the invariants can fail. A variant that commits without a majority, or grants votes without the log up-to-date check, must violate "one leader per term" or log matching on a named seed (and a counterexample path under K4-2).
5. No `try-this N:` tests (4 try-this entries, 0 tests).
6. Quiz: `quiz-length` and `quiz-longest` (Q2 and Q3 have the correct option strictly longest; 2 of 3 against a limit of 1).
7. The analogy says losing a couple of members "can never lose a decision": unscoped, and true only for committed entries on a majority.
8. Q2's `why` says staggered timeouts let one candidate "collect votes before anyone else even starts", contradicting the lesson's own key idea ("usually") and the sim's own split votes.
9. `what` says an entry is committed "once a majority has stored it"; the sim (`sim.ts` around line 170) only commits by counting replicas for entries of the **leader's own term**, which is the Raft rule the text omits. Hedge or state it.

**`distributed-transactions` (8)** [domain review]
1. No test file at all. All logic lives in `frames.tsx` next to the captions.
2. The whole lesson is a **recorded script** (`createRecorder` frames), not an execution, and it is not labelled "scripted" on screen.
3. No executed protocol: 2PC atomicity ("no participant commits while another aborted") and the blocking behaviour after a coordinator crash are asserted by the recorder, not produced by the protocol. AC-0/T3 #20 wants the protocol on `distSim` with a crash injected at every step and the invariants asserted over 200+ seeds, with a broken variant (commit decided before all votes) that violates atomicity on a named seed.
4. Hand-typed numbers and verdicts: the stalls `'10 s'`, `'30 s'`, `'2 min'` (`frames.tsx` lines 145 to 156) and the verdict strings (`'consistent ✓ after a long stall'`, line 163) are literals, not computed (AC-0/T2 #1 and #3).
5. No chip.
6. No `try-this N:` tests (4 entries).
7. Quiz: `quiz-length` and `quiz-longest` (the correct option is the longest in Q1).
8. `what` says sagas are "available and lock-free": overclaim. Each local transaction still locks its own rows, and a saga gives up **isolation**, which the lesson mentions only as "temporarily inconsistent".

**`backpressure` (8)** [domain review]
1. No test file for `sim.ts` or `draw.ts`.
2. Unseeded `Math.random` in the sim (four call sites in `sim.ts`: priority mix twice, service time, arrival jitter): no seed on screen, unreproducible, untestable.
3. No chip: the process model, the 10/s service rate, the OOM line and the 80% red zone are illustrative and simulated.
4. The Little's Law stat is "measured live" and try-this 4 says "check that λ × W ≈ L each time": needs a tolerance test and an honest "noisy over short windows" hedge.
5. Key idea 4 states W = 1/(μ - λ) unscoped; that is the **M/M/1** result (Poisson arrivals, exponential service). The live arrivals are jittered (`JITTER_MIN`, `JITTER_SPAN`) and are not Poisson, while the dot sits on the analytic M/M/1 curve; say so on screen.
6. No `try-this N:` tests (4 entries; try-this 2 claims "latency stays flat" with backpressure, which needs a pinned bound).
7. Quiz: `quiz-length` and `quiz-longest`; Q3's numeric answer (L = 200 x 0.05 = 10) should be recomputed in a test.
8. Overlap with Tier 3: `queueing-theory` draws the same M/M/1 curve and **builds on this lesson**. One of them should own the formula (`core/queueing`); this lesson links by id and keeps only the overload-policy mechanics.

**`multi-region` (8)** [domain review]
1. No test file for `model.ts`.
2. No chip: every number is invented (round-trip times, `DETECT_S` 30 s, `PROMOTE_S` 120 s, `DNS_S` 300 s, `ASYNC_LAG_S` 1.2 s, `WRITES_PER_S` 30, user shares) while the file comment says "realistic-ish".
3. Hand-typed strings in `MODE_INFO`: cost `'1×'`, `'~2×'`, `'~3×+'` and `'hours (until the region recovers)'` are literals, not model outputs.
4. **Likely contradiction (verify):** active-passive prints an RTO of `~${DNS_S / 60} min` = "~5 min", but the same file's failover timeline adds `DETECT_S` + `PROMOTE_S` + `DNS_S` = 450 s = 7.5 min if the phases are sequential, as the lesson's try-this 2 describes ("detection, promotion and DNS each add downtime"). If the stat and the timeline disagree, that is the Tier 3 class "contradicts its own numbers".
5. Unscoped absolutes: key idea 3 "active-active is always on"; `what` "can never get a round trip much under ~150 ms" (true for a 15,000 km path only; scope it); quiz option and `why` language is fine.
6. No `try-this N:` tests (4 entries; try-this 3 hard-codes "within ~30 s", which is `REROUTE_S`).
7. Quiz: `quiz-length` and `quiz-longest`.
8. "Synchronous replication removes data loss" / key idea 4 "RPO = 0" is true only while the synchronous replica survives; scope it. Also "(they do happen)" is an unchecked claim about real outages; chip it from memory or drop it.

**`lsm-trees` (7)** [domain review]
1. No test file; the model, the compaction and the Bloom bits live in **`lsm.tsx`** together with JSX captions (`createRecorder`), so nothing pure can be tested. Split into `lsm.ts` (model) and `frames.tsx` (captions).
2. No chip: the model is simplified (two levels, `MEM_CAP` 4, `L0_TRIGGER` 3, 16-bit filters) and says so nowhere on screen.
3. No reference-model test: reads must equal a plain `Map` after any operation sequence; compaction must not change any read; tombstones must hide older versions; the write-amplification figure (`diskWrites / userWrites`) is never checked.
4. No `try-this N:` tests (4 entries). Try-this 4 promises "the occasional false positive": at the default state a test must show one exists among the `MISSING` keys, otherwise the try-this does not work as written (AC-0/T3 #16).
5. Quiz: `quiz-length` and `quiz-longest`.
6. Key idea 2 and the `what` say compaction discards tombstones. That is true **here** only because L1 is the bottom level (the code comment at the drop site says so); real engines keep a tombstone until it has reached the bottom or all older versions are gone. Scope it "in this two-level model".
7. Key idea 1 "Nothing is updated in place" is unscoped (the memtable is updated in memory; the claim is about SSTables on disk).

**`crdts` (7)** [domain review]
1. No test file for `crdt.ts`, which is the entire lesson's claim.
2. The defining laws are never tested: merge is commutative, associative and idempotent, so merging the same updates in **any order, with duplicates**, reaches one state. A seeded property test over 200 schedules (random order, repeats, partitions) is the AC-0/T3 #20 form, with the naive-overwrite mode as the broken variant.
3. "Naive overwrite diverges or loses updates" is not produced by a test; the lowest seed where it loses an increment should be named and shown.
4. No chip: simulated replication, scripted sync order ("Replay sync, new order" needs its seed shown).
5. No `try-this N:` tests (4 entries; try-this 1 hard-codes "Total: 5").
6. Quiz: `quiz-length` and `quiz-longest`.
7. `what` says the merge design means "conflicts can't happen": they are resolved by construction, and LWW resolves by **discarding** a write. The product list names "Figma-style multiplayer" (as far as I recall, not a pure CRDT product) and "Azure Cosmos DB" (multi-region writes with last-writer-wins or custom resolution; I do not recall it as a CRDT store): chip from memory or cut, **uncertain, needs a source check**.

**`probabilistic-structures` (7)** [domain review]
1. No test file for `sketches.ts`: Bloom false-positive rate against (1 - e^(-kn/m))^k, the optimal k, HyperLogLog error against 1.04/sqrt(m).
2. Try-this 4 says 256 registers "stays within a few percent": 1.04/sqrt(256) is about 6.5% **standard error**, so a run can be 13% off; "a few percent" understates it.
3. `what` says the estimate is "to within about 1.04/√m, whether there are thousands of items or billions": 1.04/sqrt(m) is a standard error, not a bound; and the sketch uses a **32-bit hash with only a small-range correction** (`sketches.ts` line 64, no large-range correction), so counts near and above about a billion are not supported. Remove "billions" or implement and test the large-range case.
4. `Date.now()` as the key and id for Bloom actions (`BloomView.tsx` lines 52 and 65): two actions in the same millisecond share a key (a React key warning the sweep would catch), and the id is nondeterministic in `--frames`.
5. No chip: toy 32-bit hash; "192 bytes" assumes 6-bit registers and does not say so.
6. No `try-this N:` tests (4 entries; try-this 2 "false-positive rate collapses" needs a pinned default-state check).
7. Quiz: `quiz-length` (this one is not on the `quiz-longest` baseline; hand-computed, see §6).

**`slos-error-budgets` (6)** [domain review]
1. No test file for `model.ts` (`budgetMinutes`, the burn-rate classification, `backgroundBurn`, the incident table).
2. The incidents are invented (`INCIDENTS`) and unlabelled.
3. Every try-this claim is typed and unpinned: the day the budget runs out at 99.9%, "page only once" at 99%, "the background error rate alone burns the whole budget" at 99.99%, "a ticket at 99.9% but a page at 99.99%" for the slow leak. Four entries, no tests.
4. The alert rule is simplified: `model.ts` (around line 65) pages on `burn1h >= 14.4 || burn6h >= 6` with a single window each, where the published multi-window rules pair a long window with a short one to stop paging after recovery. The 14.4x for 1 hour (2% of a 30-day budget: 14.4 / 720) and 6x for 6 hours figures are from memory of the SRE workbook: chip "from memory, simplified" and test the 2% arithmetic.
5. Quiz: `quiz-length`.
6. No question targets the main misconception ("more nines is always better" or "100% is the goal"): Q1 and Q2 are arithmetic and Q3 is policy.

**`zero-trust` (7)** [domain review]
1. No test file.
2. The whole attack replay is **scripted** (frames with hand-set `owned` and `bobPwned` flags): "Systems breached" is authored per frame, not computed, and nothing says "scripted".
3. The policy decisions ("which check stopped each step": identity, device, role, certificate) are authored strings; there is no pure `decide(request, policy)` whose outputs a test can assert for both models.
4. No chip (scripted, product names from memory: Cloudflare Access, Zscaler, Google IAP, Istio, Linkerd, SPIFFE).
5. Absolutes: the `why` "Most serious breaches start with one phished laptop or leaked credential" is an unsourced "most" about the real world (hedge to "many", from memory, or cut); key idea 1 "Never trust the network: being inside grants nothing" is a slogan stated as a fact of the model (scope it "in zero trust").
6. Quiz: `quiz-length` and `quiz-longest`.
7. No `try-this N:` tests (4 entries; try-this 4 compares the "Systems breached" stat between the models, which must be computed).

**Totals:** 9 + 8 + 8 + 8 + 7 + 7 + 7 + 6 + 7 = **67 defects**. Of the classes: no test file 8/9; no chip 9/9; no `try-this N:` tests 9/9; `quiz-length` 9/9; `quiz-longest` 7/9 (the baseline); something scripted, hand-typed or invented that is presented as computed or left unlabelled 6/9 (distributed-transactions, multi-region, zero-trust, slos-error-budgets, crdts, raft); unscoped or unsupported real-world claims in 8/9.

### 5.2 One batch, or two?

**Two.** One batch of nine is too heavy: five of the nine need an executable model or a migration, not only tests (a `raft` move onto a seeded, testable sim with a broken mode and a counterexample; `distributed-transactions` and `crdts` as protocols run over seeded schedules; `backpressure` reseeded and tested; `zero-trust` given a policy evaluator), the first four are the domain-heaviest lessons of the tier, and Tier 2 and 3 both split their retrofits at 6 to 8.

| Batch | Lessons | Why |
|---|---|---|
| **T4-R1** | `raft`, `distributed-transactions`, `crdts`, `multi-region`, `backpressure` | The lessons the **new Tier 4 distributed-theory lessons stand on** (`paxos`, `byzantine-faults` and `flp-impossibility` build on `raft`; `distributed-sql-truetime` on `multi-region` and `distributed-transactions`; `metastable-failures` on `backpressure`), and the Tier 3 edges (`leases-fencing` to `raft`, `offline-first-sync` and `logical-clocks` to `crdts`, `transactional-outbox` to `distributed-transactions`, `backups-disaster-recovery` to `multi-region`, `queueing-theory` to `backpressure`). Domain review for all five. |
| **T4-R2** | `lsm-trees`, `probabilistic-structures`, `slos-error-budgets`, `zero-trust` | Nothing in Tier 4's new list builds on them (and `alerting-design` and `count-min-heavy-hitters` in Tier 3 are the only dependants), so they can follow. |

**Placement (decided):** **T4-R1 in wave 1, merged before wave 2** (rule 39: wave 2's paxos, byzantine-faults, flp-impossibility, distributed-sql-truetime and metastable-failures link `raft`, `multi-region`, `distributed-transactions` and `backpressure` by id only because the retrofit has merged); **T4-R2 in wave 2**. Because K4-1 and K4-2 are built **during** wave 1 and merge only before wave 2, **`raft` and `distributed-transactions` in T4-R1 cannot use `asDistNodes`**: `raft` keeps its own sim with an injected `Rnd` and its own invariant checks over 200+ seeds, and `distributed-transactions` runs on the **existing** distSim (crash, pause, loss and duplication are already there; it needs none of K4-1). Neither waits for K4-2.

**Done when, per lesson** (the AC-0/T4 list applied; same eight-point shape as tier3-plan §5):
1. **Tests assert every on-screen claim** against an independent reference (AC-0/T3 #19). Per lesson:
   - `raft`: re-seed the sim (`Rnd` injected, no global mock); safety (one leader per term, log matching, committed entries never lost, leader completeness) asserted after every event over **200+ seeded schedules** with loss, duplication, partition and crash, on the existing class with an injected `Rnd` (K4-2 is not merged until after R1, so no `asDistNodes`); a broken variant (commit without majority, or no up-to-date check) violates on a named seed with its rule pinned; state the current-term commit rule.
   - `distributed-transactions`: a 2PC participant and coordinator on `distSim` with a crash at every step: atomicity holds on 200+ seeds, blocking after a coordinator crash is a computed outcome, a broken variant violates atomicity on a named seed; the saga runs with compensations and an idempotency key, and its intermediate inconsistency is computed; stall durations come from the simulated clock, verdicts from a function.
   - `crdts`: the merge laws as a property test over 200 seeds (any order, duplicates); the naive mode loses an update on a named seed; OR-set add-wins and LWW-discards tested on the concurrent cases; try-this values pinned.
   - `multi-region`: every table and stat from `model.ts`; the RTO figure derived from the timeline (or the discrepancy of item 4 resolved); chip every invented constant; scope the absolutes.
   - `backpressure`: seeded sim; Little's Law within a stated tolerance over a long window; the M/M/1 curve from `core/queueing`; bounded queue keeps latency bounded (pinned); the shedding policy sheds the lowest priority first (a test, not a caption).
   - `lsm-trees`: reads equal a `Map` reference after any seeded operation sequence; compaction preserves every read; tombstones hide older versions; write amplification recomputed; the false positive exists at the default state.
   - `probabilistic-structures`: Bloom FPR against the formula within a Monte Carlo tolerance, optimal k, HLL standard error against 1.04/sqrt(m) over seeded runs, duplicates do not move the estimate, the large-range case either implemented and tested or the "billions" claim removed.
   - `slos-error-budgets`: `budgetMinutes`, burn rates, the 14.4x = 2% arithmetic, each try-this claim pinned, the simplified alert rule labelled.
   - `zero-trust`: a pure `decide(request, policy)`; the replay's outcomes (what is breached, which check denied) computed from it for both models and asserted; "scripted" removed where it is no longer true, or stated where it remains.
2. **Pure logic moves out of `.tsx`** (`lsm.tsx` into `lsm.ts` and `frames.tsx`; `distributed-transactions/frames.tsx` keeps captions only).
3. **On-screen disclosure** with `Provenance` for what is simulated, illustrative, scripted, toy or from memory (AC-0/T3 #21), and `seed=` where a sim is seeded.
4. **`watch` checked against a screenshot line by line**, colour table applied; absolutes scoped (AC-0/T3 #15); try-this tests at the real default state (#16); hidden controls checked (#17); no unseeded random (#36).
5. **Quiz passes K-2** with a misconception question (`slos-error-budgets` is the one that needs a new one); the lesson leaves the allowlist.
6. **Every scene at 390 and 768**, first, middle and last frame (#26), keyboard paths (AC-0/T2 #11), **sweep clean** (#38).
7. **No scope growth.** `backpressure` keeps overload policies and leaves the queueing formula to `queueing-theory`; `multi-region` keeps topology and leaves backup mechanics to `backups-disaster-recovery`; `raft` stays Raft (Paxos is its own lesson).
8. **No shared-code edits.** Misfits go to the report as Phase 2 requests. (K4-1 and K4-2 are kit tickets that merge after R1: `raft` keeps its own deterministic sim, as under Placement above.)

**Order inside R1:** `raft` first (the biggest job and the foundation), then `distributed-transactions` and `crdts` (both protocols), then `multi-region` and `backpressure`.

---

## 6. Making Tier 4 lessons linted from day one: the exact wiring

### 6.1 How Tier 3 did it (read from the source)

- `src/core/lessonContentT3.ts` exports pure functions (`unscopedAbsolutes`, `tryThisTestNumbers`, `lintTier3Lesson(lesson, evidence)`), the `DOMAIN_REVIEW_IDS` set (86 ids), and the rule names. It does **not** know about tiers: the caller decides who is checked and supplies `evidence.domainReview`.
- `src/core/lessonContent.test.ts` holds the wiring: `BASELINE` (K-2 rules a built lesson is allowed to fail, with a ticket), `PENDING_RETROFIT` (lessons not counted in the tier-wide 30% quiz-longest tally until retrofitted), `TIERS_AWAITING_KICKOFF = new Set([4])` (a tier skipped by that tally), `TIER3_AWAITING_RETROFIT` (the allowlist for the AC-0/T3 rules, **now empty**), and the test "passes the AC-0/T3 rules if it is a Tier 3 lesson, apart from any still on the retrofit allowlist", which filters on `tierOf.get(id) !== 3`.
- The nine existing Tier 4 lessons currently sit in `BASELINE` with the ticket string "Tier 4 kickoff: existing Tier 4 lessons are retrofitted then" (`quiz-length` for all nine, `quiz-longest` for seven). Tier 4 is excluded from the tier-wide tally.

### 6.2 What to change at kickoff (T4-T2)

**Decision: a new `src/core/lessonContentT4.ts` that imports and extends the Tier 3 lint, plus a table-driven loop in the test. `lessonContentT3.ts` gets one backward-compatible edit and is otherwise untouched.** A "tier switch" inside the T3 file would force every Tier 3 test to be re-read for a Tier 4 change; a second file keeps the Tier 3 lint frozen (it is signed off) and lets Tier 4 rules grow. The mechanical rules of AC-0/T3 (#15 absolutes, #16 try-this tests, #21 chips) are reused as-is.

**Edit 1: `src/core/lessonContentT3.ts` (one optional parameter).** `unscopedAbsolutes(text, extraScope?: RegExp)`: a sentence is scoped if it matches the built-in `SCOPE` **or** `extraScope`. Default unchanged, so every Tier 3 test is byte-for-byte unaffected. (Reason: theorem lessons legitimately say "every deterministic protocol"; the Tier 4 lint passes a scope list that adds `theorem|proved|proof|assum(e|es|ing|ption)|in the asynchronous model|in this protocol|within the horizon`.) Update the header comment ("Tier 3 content lint") to say Tier 4 reuses it.

**Edit 2: new `src/core/lessonContentT4.ts`.**

```ts
export type Tier4Rule = Tier3Rule | 'chip-required' | 'claim-label' | 'no-clock-or-random'
  | 'fresh-array-hook' | 'pinned-seed-zero' | 'seed-visible' | 'manipulation-tests';

export const DOMAIN_REVIEW_IDS_T4: ReadonlySet<string>;   // Atlas's D rows + the nine retrofits (see below)
export const PROOF_SHAPED_IDS: ReadonlySet<string>;       // flp-impossibility, np-reductions, zero-knowledge-proofs, approximation-algorithms, sat-solvers, byzantine-faults, secret-sharing, online-algorithms
export const LEAD_IDS: ReadonlySet<string>;               // the 7 lead topics
export const REQUIRED_CHIPS: Readonly<Record<string, readonly ProvenanceKind[]>>;
//   memory-ordering-atomics: ['simulated'];  lock-free-cas: ['simulated'];
//   elliptic-curves, post-quantum-crypto, e2ee-forward-secrecy, secret-sharing, zero-knowledge-proofs: ['toy'];
//   (plus 'real' where the source uses crypto.subtle: see below);  llm-serving: ['illustrative', 'toy'];
//   fine-tuning-quantization: ['toy'];  feature-stores-skew: ['simulated']

export interface Tier4Evidence extends Tier3Evidence {
  /** The lesson id, so the id-keyed tables above apply. */
  id: string;
  /** Test-file source, for `manipulation N:` and pinned-seed checks. */
  testSource: string;
}
export function lintTier4Lesson(lesson: LessonModule, ev: Tier4Evidence): Tier4Issue[]
//   = lintTier3Lesson(lesson, ev)  (keyIdeas and quiz `why` absolutes, D chip, try-this tests)
//   + the rules below
```

**The mechanical rules** (each fails on a planted bad fixture in the test, as Tier 3's do):

| Rule | Fails when | Marker |
|---|---|---|
| `absolutes` (extended) | an unscoped absolute (`never always every all only must guaranteed most typical`) in `keyIdeas`, quiz `why`, **and now `summary.tldr`, `summary.what`, `summary.why`, `summary.analogy`**, with the T4 extra scope list. The Tier 3 sign-off fixed nine summary hedges by hand; scanning the summary makes that mechanical. | `allow-absolute: <reason>` on the line |
| `provenance` (Tier 3, reused) | a D lesson with no `<Provenance`; a lead lesson additionally needs a `ClaimLabel` (below) | none |
| `chip-required` | `REQUIRED_CHIPS[id]` names a kind that has no `kind="<k>"` chip in the non-comment source; **and** the source mentions `crypto.subtle` or imports `core/crypto` but has no `kind="real"` chip | none |
| `claim-label` | **any of the 7 lead lessons** (`strangler-fig-migrations`, `build-vs-buy`, `conways-law`, `reversible-decisions`, `technical-strategy`, `influence-without-authority`, `hiring-interviewing`) has no `<ClaimLabel` in source, or uses `ScenarioStory` without `claimOf=` or `notes=`. `hiring-interviewing` is also D, so it needs a `Provenance` chip **and** a `ClaimLabel`; the lead rules apply to all seven whatever their D flag | none |
| `no-clock-or-random` | non-test lesson source matches `Math.random`, `Date.now`, `performance.now` or `new Date` (the `clock` pattern of `core/testing/forbidden.ts` plus `Math.random`), comments stripped with `stripComments` | `allow-random: <reason>` on the line |
| `fresh-array-hook` | non-test source has `usePlayer(` or `introKey=` with an array literal or a direct call as the argument, or a `?? []` / `\|\| []` fallback as an argument: the three shapes of the Tier 3 crash class. (A regex catches those shapes only; the sweep catches the rest.) | `allow-fresh: <reason>` |
| `pinned-seed-zero` | source or tests define a `BROKEN_SEED`/`FAILING_SEED`/`LOWEST_*SEED*`/`COUNTEREXAMPLE_*SEED*` constant equal to `0` | `allow-seed-zero: <reason>` (the reason must say why zero is not everything-fails) |
| `seed-visible` | non-test source calls `createCluster`, `createTickSim` or `mulberry32` and has no `seed=` prop and no `<SeedField` | `allow-no-seed: <reason>` |
| `manipulation-tests` | an id in `PROOF_SHAPED_IDS` has fewer than 2 distinct tests named `manipulation N: ...` | none |
| `try-this-tests` (Tier 3, reused) | fewer `try-this N:` tests than `tryThis` entries | none |

Not mechanised, on purpose, and left to review: whether a caption says "impossible" after a bounded check, whether a pinned seed fails for the stated reason, whether a "toy" label sits next to the right number, whether a lead lesson's options really trade off. (K4-9's `validateScenario` covers the dominated-choice part in code.)

**Edit 3: `src/core/lessonContent.test.ts`.**
1. Replace the `TIER4` ticket string with two: `T4_R1 = 'T4-R1 retrofit (docs/tier4-technical.md §5)'` for `raft`, `distributed-transactions`, `crdts`, `multi-region`, `backpressure`, and `T4_R2` for `lsm-trees`, `probabilistic-structures`, `slos-error-budgets`, `zero-trust`. The rule lists per lesson stay exactly as they are today.
2. Add `TIER4_AWAITING_RETROFIT` (those nine ids) and `TIER4_EXISTING_COUNT = 9`, mirroring the Tier 3 pair, with the three companion tests ("allowlists only built Tier 4 lessons...", "reports the issues the allowlisted lessons still have", "passes the Tier 4 rules apart from the allowlist").
3. **Fix the tier-wide quiz-longest tally, and note two traps.** Set `TIERS_AWAITING_KICKOFF = new Set()` (Tier 4 now counts) **and** `PENDING_RETROFIT = new Set(TIER4_AWAITING_RETROFIT)`. Do not set only the first. *Trap one:* the tally excludes lessons with `quiz-longest` on the baseline, but `probabilistic-structures` and `slos-error-budgets` have only `quiz-length` there, so with `PENDING_RETROFIT` empty they would be counted. Hand-computed from their quizzes (the correct option is strictly longest in `probabilistic-structures` Q2 only, and in `slos-error-budgets` Q3 only; the `slos-error-budgets` Q1 correct option ties its neighbour in length, so it is not strictly longest): **1 of 3 each, 2 of 6 = 33%, over the 30% cap** (`longest / total <= 0.3`), so the test would fail the day Tier 4 is enabled. With all nine in `PENDING_RETROFIT` the tier tally starts empty (the test skips a tier with nothing counted), new Tier 4 lessons are measured alone, and each retrofit joins when it merges. *Trap two, from the same arithmetic:* a tier-wide share over a handful of lessons is noise. **One** new lesson with one strictly-longest correct option in three questions is 33% and fails the aggregate even though the per-lesson rule allows it (`floor(3/2) = 1`). Add `MIN_QUESTIONS_FOR_SHARE = 30` to the tier-share test (skip the aggregate until at least 30 questions are counted; the per-lesson `quiz-longest` rule still applies from the first commit). Tiers 1 to 3 have far more than 30 questions, so their behaviour is unchanged. **Both numbers are hand-computed: run the test both ways to confirm.** When a retrofit batch merges, its lessons leave `BASELINE`, `TIER4_AWAITING_RETROFIT` and `PENDING_RETROFIT` together.
4. Generalise the Tier 3 block into a small table so a third tier needs no copy-paste:

```ts
const TIER_LINT = [
  { tier: 3, awaiting: TIER3_AWAITING_RETROFIT, domain: DOMAIN_REVIEW_IDS, lint: lintTier3Lesson },
  { tier: 4, awaiting: TIER4_AWAITING_RETROFIT, domain: DOMAIN_REVIEW_IDS_T4, lint: lintTier4Lesson },
];
// for each: lessons of that tier not on `awaiting`: lint with evidence built from the lesson folder's source and tests
```

   `tier3Evidence(id)` becomes `tierEvidence(id, domainSet)` and also returns `id` and `testSource` for the Tier 4 rules. The source and test files are already loaded through `import.meta.glob('../lessons/**/*.{ts,tsx}')`.
5. Tests for the new file: each rule fails on a planted fixture and passes the fixed one (as for Tier 3); `DOMAIN_REVIEW_IDS_T4` ids are all registered Tier 4 topics and `PROOF_SHAPED_IDS`, `LEAD_IDS` and `REQUIRED_CHIPS` ids are too; `DOMAIN_REVIEW_IDS_T4.size` equals the pinned count; and a plan-pin test (below).
6. **Plan pin (decided).** Add `src/core/testing/tier4Plan.ts`, a copy of `tier3Plan.ts`. Atlas's final-list table in `docs/tier4-plan.md` already has the Tier 3 shape (heading `## 2.`, next heading `## 3.`, rows `| \`id\` | Title | Track | Priority | D | ... |` with `**D**` in the fifth column), so the parser is reused as is. `DOMAIN_REVIEW_IDS_T4` is the **29 D rows of that table plus the 9 retrofits (38 ids)**; the test "flags exactly the D rows of the plan" (`it.skipIf(!tier4PlanRows.length)`) compares the 29 new ids to the table, and a second assertion checks the 9 retrofits are in the set and registered Tier 4. The set is hard-coded in `lessonContentT4.ts` (as `DOMAIN_REVIEW_IDS` is for Tier 3) and pinned to the table by the test, so a change to Atlas's table fails the test until the set is updated.
7. Normalise the line endings of `lessonContent.test.ts` while it is open for editing: a T3-R2 note recorded CRLF in the working tree against an LF-enforced repo, which let edits to `BASELINE` fail silently. Check `.gitattributes` first.

**The domain-review set (decided: Atlas's table stands).** 29 of the 41 new topics are D (`docs/tier4-plan.md` §2): everything except `chaos-engineering`, `sat-solvers`, `local-search-annealing`, `suffix-arrays`, `aho-corasick`, `lca-binary-lifting` and six of the seven leads (`strangler-fig-migrations`, `conways-law`, `build-vs-buy`, `technical-strategy`, `reversible-decisions`, `influence-without-authority`). It includes `online-algorithms`, `game-theory`, `linear-programming`, `finops-cloud-cost`, `numa-multicore`, `formal-methods`, `deterministic-simulation-testing` and **`hiring-interviewing`**. All nine retrofits are D. `DOMAIN_REVIEW_IDS_T4` therefore holds 29 + 9 = **38** ids. **All seven leads** carry the lead rules (`ClaimLabel`, `tradeoffs` validation) regardless of the flag.

**Result.** A new Tier 4 lesson is linted from its first commit: it is not on `TIER4_AWAITING_RETROFIT`, it is in the `TOPICS` registry (T4-T1) and so in `tierOf`, and `lessonContent.test.ts` loops over tier 3 and tier 4 with the same machinery. No allowlist entry is ever added for a new lesson.

---

## 7. Known risks, and open questions

### 7.1 Technical risks

- **K4-2 is a new subsystem and the single largest kit risk** (as K3-8 was). The explorer is simple; the **pure-protocol form** is where the design can go wrong, because every distributed lesson must be expressible as pure `onMessage` functions over a multiset network. If a lesson cannot be written that way (Raft's timers are the obvious stress), it keeps `distSim` for the seeded leg and says "sampled". The Paxos state-space size is uncounted (**uncertain**): the ticket's spike decides it before any lesson is specified. Wave 1 does not wait for K4-2; the distributed batch does.
- **FLP fidelity.** An infinite run cannot come out of a finite explorer. The honest version (a long admissible prefix plus the argued repetition, labelled "theorem, argued") may feel weaker than the learner expects. The fallback is stated in §2.3. If the spec author cannot name a **wrong move** that the page refuses (rule 30), the topic goes back to Atlas before it is built.
- **The memory model's expected tables are typed from memory.** A wrong cell teaches a wrong fact about hardware. The oracle covers SC and TSO inside a fragment only. The relaxed mode is the likeliest thing to be subtly wrong and is optional; a reviewer may cut it.
- **Crypto correctness.** Mitigated by the node oracle, constant self-consistency tests, and exhaustive group tests; not mitigated for prose. Two reviewers, payload-free reading, and rules 32 and 33.
- **Metastable failures need tuning** to produce a stable bad equilibrium in a deterministic model, and a model tuned to a knife edge teaches fragility of the toy, not of systems. The test must assert both regimes exist with margin.
- **Exhaustive tests are slow.** `testTimeout` is 45 s; an explorer budget that runs 5 s on a quiet machine can pass 45 s under four parallel checkouts. Each exhaustive test states its budget, and any that exceeds 10 s locally is a flag to shrink the model.
- **The sweep is long.** Tier 3's runs took long on a loaded machine. `--fast`, sharding and per-batch ids bound it; the ticket records measured time per lesson.
- **Domain-review capacity.** 29 new D lessons plus 9 retrofits is 38 flagged lessons in a tier of 50 (76%), against 86 of 154 in Tier 3 (56%). By Atlas's batch counts (B1 4, B2 4, B3 3, B4 6, B5 2, B6 5, B7 4, B8 0, B9 1, plus the retrofits): wave 1 carries R1's 5, B3's 3 and B5's 2 (10); wave 2 carries B1's 4, B4's 6, R2's 4 and B9's 1 (15, the hardest distributed-theory lessons of the tier); wave 3 carries B2's 4, B6's 5 and B7's 4 (13). **Wave 2 is the bottleneck:** two reviewers, and no compressing waves to save time.
- **Lead and people topics are opinion.** The failure is an unlabelled opinion, not a wrong number. Rule 35 and K4-9 give it teeth; `influence-without-authority` and `hiring-interviewing` model people, and the circular-model warning of §2.6 must be on screen.
- **Kit surface.** 11 kit tickets plus 8 tooling tickets is half of Tier 3's 21 plus 5 in kit count but heavier in new subsystems (K4-1, K4-2, K4-3, K4-6, K4-7). Mitigations as before: tickets timed to their first user, a ticket with no second user by its wave folds back into its lesson.
- **Tier inversion carries over.** Several new Tier 4 lessons build on lessons that Tier 3 built (`logical-clocks`, `physical-clocks-skew`, `consistency-models`, `quorums`, `circuit-breakers`, `leases-fencing`) and on the nine retrofitted ones; rule 13's same-wave ban applies in both directions.

### 7.2 Decisions taken by the coordinator (previously open)

1. **Wave order and kit timing:** as in §4.1 (P0 before wave 1; K4-1 and K4-2 during wave 1; K4-3, K4-6, K4-7, K4-11 and K4-12 during wave 2).
2. **`relaxed` memory mode:** cut unless the §2.2 criterion is met by the `memory-ordering-atomics` spec.
3. **D flags:** Atlas's 29 stand (§6.2).
4. **`ClaimLabel kind="theorem"`:** yes, K4-8, P0.
5. **LLM-serving shared meter:** K4-12 `core/modelFootprint`, not a cross-lesson import.

### 7.3 Unknowns that remain (nothing here was run)

- The Paxos reachable-state count and the explorer's throughput (§2.1): estimated, not measured; the K4-2 spike is first and has stated scope cuts.
- Whether `server.watch.ignored` merges with Vite's default ignores, and whether oxlint already skips worktrees (§4.5).
- The litmus-table cells and every from-memory constant (ML-KEM sizes, the F17 toy curve, Pittel's round count, the epidemic final-size equation): reviewers verify against sources.
- The FLP quotient construction (§2.3) and the metastable-failures tuning (§2.1): design risk, with fallbacks stated.
- The hand-computed quiz-share arithmetic in §6.2 item 3.
- The retrofit audit is static; the sweep may add findings.

---

## Appendix A. Tier 4 topics whose "visual idea" is not enough on its own

The animation alone teaches nothing here: the learner has to build, break or search. The spec for each names the toy and the failing state (AC-0/T3 #23, AC-0/T4 #30). If a spec author cannot name a wrong move the page refuses, the topic goes back to Atlas before it is built.

| Topic | Why animation alone fails | The toy | Where it fails visibly |
|---|---|---|---|
| `flp-impossibility` | The proof is a bivalence argument, not a process | Be the adversary: choose each delivery; valency computed per configuration | The learner's delivery makes the configuration univalent and the page says "you decided it" |
| `paxos` | A message dance with ballot numbers | Choose the delivery order, drop and duplicate messages; learner-edited proposer values | A broken acceptor produces two chosen values and `TracePlayer` shows the shortest schedule |
| `byzantine-faults` | "Traitor" is a story | Choose what the traitor sends to each lieutenant | At n = 3 a traitor strategy splits the loyal generals; at n = 4 none exists, with the enumeration count |
| `distributed-snapshots` | A cut is a set of events, not motion | Place the marker times; check the cut against happens-before | With non-FIFO channels the recorded total is wrong on the lowest failing seed |
| `failure-detectors` | Dead versus slow looks identical | Drag the jitter and the timeout; run the crash and pause twin traces | The two traces are identical until t*, then the fixed timeout raises a false alarm |
| `np-reductions` | A reduction is a function, not a picture | Build the gadget graph from a formula and pick a cover | A cover of size K - 1 leaves a clause triangle uncovered, named |
| `sat-solvers` | Search trees animate but teach nothing without a choice | Choose the branching variable and see propagation | A bad choice triggers a conflict and a backtrack, counted |
| `approximation-algorithms` | A guarantee is a statement about all inputs | Drag points to push the live ratio toward the bound | The ratio approaches 2 and never exceeds it; a non-metric edit voids the guarantee, shown |
| `zero-knowledge-proofs` | "Convinced but learns nothing" has no motion | Play the verifier; run the extractor; compare real and simulated transcripts | A prover who cheats fails with probability 1/2 per round; the two transcript sets are identical multisets |
| `secret-sharing` | Polynomials hide a secret abstractly | Guess the secret from k - 1 shares | Every candidate is equally consistent; the k-th share makes it certain |
| `elliptic-curves` | Group law over a finite field is not geometric | Step double-and-add; try to invert by search | Brute-force discrete log is instant at 17 and astronomically long at 256 bits, computed |
| `memory-ordering-atomics` | Reordering is invisible in a single trace | Enumerate all outcomes of a litmus test under SC, TSO and (optionally) relaxed; add fences | The forbidden-looking outcome appears under TSO and disappears with a fence |
| `lock-free-cas` | ABA needs a specific interleaving | The explorer finds the interleaving; the learner steps it | The stack is corrupted at the named step; the tagged pointer version survives the same search |
| `metastable-failures` | A loop that sustains itself is a trajectory | Remove the trigger and watch goodput; toggle the retry budget and cancellation | Without them goodput stays collapsed after the trigger ends, on a named seed |
| `formal-methods` | A state graph is not a check | Type an invariant (safe evaluator, no `eval`) and run the explorer | The explorer returns a counterexample that the learner replays |
| `build-vs-buy`, `conways-law`, `reversible-decisions` | Opinion has no motion | Place components, services or decisions on a board; the model recomputes | The page shows the crossover or cost that flips the answer; no placement is marked right |
| `strangler-fig-migrations`, `technical-strategy`, `influence-without-authority`, `hiring-interviewing` | Judgement, not process | A `ScenarioStory` with `tradeoffs` validated, plus a computed model (traffic routing, orphan detection, stakeholder rules, variance) | Every ending is reachable, none is free, and the unrecommended option reads as defensible with a real cost |

Everything else in the tier animates naturally (gossip curves, clocks on a timeline, KV-cache grids, annealing landscapes, point clouds).
