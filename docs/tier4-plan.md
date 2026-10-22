# Tier 4 · Strategist: kickoff plan

Written 2026-10-22 against `main` at `30663e93` (Tier 3 signed off, 409 lessons registered). This file is the Tier 4 equivalent of `docs/tier3-plan.md`. Atlas wrote sections 1, 2, 6 and 7 (waves re-sequenced by kit readiness after reconciling with Vector's document) and the appendix. **Sections 3 to 5 (AC-0/T4, kit prerequisites, the retrofit's technical definition of done) are Vector's and live in `docs/tier4-technical.md`**; the stubs below only say where. It does **not** contain per-topic lesson specs; those are the next phase, written per batch from this plan. `rollout-plan.md` is untouched; the coordinator links this file from §3.3 and pastes the tracker rows from §7.2.

**Method.** The counts, ids and "Builds on" targets in §2 were produced by a throwaway script, not typed: it parsed `docs/curriculum-backlog.md` (lines 615 to 717), checked every "Builds on" id against the 409 directories in `src/lessons/`, checked that no id is placed twice or already registered, and summed the priority, track and domain-review columns. Result: 41 ids placed once each, 0 missing targets, 0 cross-batch edges between new topics (every new-to-new edge is inside one batch, earlier in the build order). Redo the check if a batch moves; it is not committed.

## Headline numbers

| | Count |
|---|---:|
| Backlog Tier 4 rows (`curriculum-backlog.md`, heading says 42) | 42 |
| Already decided: `leases-fencing` moved up to Tier 3 (T2 kickoff; built in T3-B20 and registered) | −1 |
| New in this pass: further drops, merges or moves | 0 |
| **Validated new Tier 4 lessons** | **41** |
| Existing Tier 4 lessons (retrofit tickets T4-R1 five lessons and T4-R2 four lessons, §5) | 9 |
| **Tier 4 total when done** | **50** (41 + 9, matches rollout-plan §4.1) |
| Whole curriculum when done | 450 (62 + 172 + 166 + 50); 409 registered today, so 41 to add |
| Build batches | 9 new + 2 retrofit (T4-R1, T4-R2) |
| Waves | 3 (4, 4 and 3 builders), plus the kickoff kit round and a kit round after every wave |
| Domain-review lessons | 29 of 41 (71%; Tier 3 was 56%), plus all 9 retrofits; per wave 5, 11 and 13 new (§6.4) |
| Priority split | 1 core, 14 important, 26 nice |

| Track | hw | os | lang | math | dsa | arch | data | sec | ops | craft | ml | lead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| New lessons | 1 | 2 | 2 | 2 | 6 | 8 | 1 | 5 | 2 | 2 | 3 | 7 |

(Sums to 41 and matches rollout-plan §3.3. The backlog heading says 42 because `leases-fencing`, an arch row, still sits in it: the backlog's arch table has 9 rows, the plan 8.)

**Batch count is 9, not the "~8" of rollout-plan §3.3.** Eight batches would have forced a 7-lesson lead batch or 6-lesson batches throughout; at about 150k tokens a lesson, a seven-lesson builder blows the 600-850k envelope Tier 3 paid for. Nine batches hold 5, 4, 5, 6, 5, 5, 4, 4, 3 lessons. Wave count stays at 3. The two retrofit batches (5 and 4 lessons) follow Vector's split ( §5.2).

---

## 1. Validation of the Tier 4 backlog

Same rules as Tiers 2 and 3: a topic stays unless a registered lesson already teaches it or a sibling topic does; nothing moves down into signed-off tiers; "narrowed" means the topic stays and its spec draws an explicit **Out of scope** line against a named lesson. Tier 4 is the last tier, so nothing moves up or out either. Overlaps were checked against the lessons' `keyIdeas` and source, not their titles.

### 1.1 Drop, merge, move

| Topic | Decision | Reason |
|---|---|---|
| `leases-fencing` | **Moved T4 to T3** (T2 kickoff, confirmed) | Built and registered in T3-B20. This is the one row that takes the backlog from 42 to 41. |
| Any other drop | **None** | The backlog synthesizer dropped nothing for overlap (its own note); the checks in §1.2 and §1.3 found no registered lesson that already teaches a Tier 4 topic. |
| Any other merge | **None, with two recorded triggers** | `deterministic-simulation-testing` merges into `chaos-engineering` at spec time if the spec author cannot name a manipulable beyond "a seed replays the failure" (the same pattern as T3's `alerting-design`). `formal-methods` merges into `deterministic-simulation-testing` or is demoted to an "advanced" scene of it only if its model checker cannot be run on a learner-edited spec. Both stay nice-priority, so no core coverage is at risk. |
| Merges considered and rejected | `np-reductions` + `sat-solvers`; `lock-free-cas` into `memory-ordering-atomics`; `hybrid-logical-clocks` into T3 `logical-clocks`; `secret-sharing` into `zero-knowledge-proofs`; `linear-programming` into `approximation-algorithms` | Each pair has two different manipulables (a reduction the learner performs vs a search tree; reordering vs a CAS race and ABA; a (wall, counter) pair vs Lamport stamps; a polynomial vs a cave; a feasible region vs a tour). Merging would produce a 10-scene lesson, the failure mode T3 §7.1 warned about. |
| Any move up into Tier 3 or down from it | **None** | Tiers 1 to 3 are signed off. |
| Hard-to-animate topics demoted | **None** | They get a manipulable toy (Appendix A), not a demotion. |

### 1.2 Overlaps against registered lessons: all kept, all narrowed

Every one of the 41 stays. The line each spec must draw, against the lesson that already teaches the neighbouring idea:

| Topic | vs. existing lesson | The line the spec must draw |
|---|---|---|
| `paxos` | `raft` (terms, majority commit), `quorums`, `consistency-models` | Owns ballots, the two phases, duelling proposers, why an accepted value can never change, Multi-Paxos as "a stable proposer skips phase 1". Out of scope: election timeouts, log replication and terms (`raft`), R + W > N (`quorums`). The spec opens by quoting `raft`'s keyIdeas 1 to 4 and says what differs. |
| `byzantine-faults` | `raft` (crash faults only), `quorums`, `digital-signatures-pki` | Owns equivocation, why 3f + 1 and not 2f + 1, what signatures buy. Out of scope: crash-fault majorities, signature mechanics (`digital-signatures-pki`). The traitor is a node implementation in `core/distSim`, not a script. |
| `flp-impossibility` | `raft`, `exactly-once-myth` (Two Generals merged in T3) | Owns the asynchronous-system result: bivalence and an adversarial scheduler. Out of scope: lossy-link impossibility (`exactly-once-myth`), leader election (`raft`). Must state which assumptions FLP removes (timeouts, randomness) rather than imply Raft is "impossible". |
| `distributed-snapshots` | `logical-clocks` (cuts, happens-before), `kafka-partitioned-log`, `backups-disaster-recovery` (snapshots), `stream-windowing` | Owns markers, channel state and the consistent-cut check. Out of scope: clock definitions, backup snapshots (a different word for a different thing: the spec says so on screen), stream watermarks. |
| `hybrid-logical-clocks` | `physical-clocks-skew`, `logical-clocks` | Owns the (wall, counter) pair, the update rule, and why it stays within the skew bound of physical time. Out of scope: drift and NTP maths, Lamport and vector definitions. Reuses the clock model of `physical-clocks-skew` through `core/` or the kit, never a copy. |
| `distributed-sql-truetime` | `physical-clocks-skew` (its interval scene already shows an uncertainty interval and the 2ε wait, chipped "from memory"), `consistency-models`, `mvcc`, `distributed-transactions` | Owns commit-wait for external consistency across shards, a consensus group per shard, 2PC across groups, snapshot reads at a timestamp. Out of scope: what an interval is (open by quoting that scene and starting where it stops). Every claim about Spanner or CockroachDB is chipped from memory. |
| `failure-detectors` | `service-discovery-mesh` (registry TTL, eviction of live instances), `health-checks`, `timeouts-deadlines` | Owns detection theory: completeness vs accuracy, phi-accrual, SWIM indirect probes. Out of scope: registry TTL and refresh (`service-discovery-mesh`), probe configuration (`health-checks`). |
| `gossip-protocols` | `merkle-trees` (anti-entropy), `service-discovery-mesh`, one-line gossip mentions in `cap-theorem` and `logical-clocks` | Owns epidemic dissemination: push, pull, rounds against log n, membership by rumour. Out of scope: Merkle-tree repair (`merkle-trees`), registries. |
| `metastable-failures` | `circuit-breakers` (retry multiplication, backoff and jitter), `cache-stampede` (a self-feeding herd), `backpressure` (registered, in retrofit), `graceful-degradation`, `multi-tenancy` | Owns the sustaining loop: a trigger, a feedback path that keeps the overload alive after the trigger is gone, and what breaks it (shed load, retry budgets). Out of scope: breaker states, coalescing, shedding policy. Does not link `backpressure` by id in wave 1 (§6.3). |
| `chaos-engineering` | `circuit-breakers`, `health-checks`, `observability`, `graceful-degradation`, `slos-error-budgets` | Owns the experiment: steady-state hypothesis, blast radius, abort condition. Out of scope: the resilience mechanisms themselves. Does not link `slos-error-budgets` by id in wave 1. |
| `deterministic-simulation-testing` | `property-based-testing`, `flaky-tests`, `chaos-engineering`, and the T3 `core/distSim` harness | Owns the technique: seeded scheduler, a failing seed replays the identical bug. Out of scope: shrinking (`property-based-testing`), live fault injection (`chaos-engineering`). It runs on the real `core/distSim`, so the lesson is its own proof. |
| `formal-methods` | `induction-invariants`, `property-based-testing`, `nosql-data-models` (mentions model checking) | Owns state-space exploration, an invariant, a counterexample trace. Out of scope: proof by induction, random testing. The checker runs on a learner-editable tiny spec, not TLA+ syntax. |
| `memory-ordering-atomics` | `race-conditions` (read-add-write, atomic RMW), `cache-coherence` (MESI; its scenes use a store buffer inside the coherence story) | Owns visible reordering: store buffers, the SB and MP litmus tests, fences, acquire/release. Out of scope: MESI, false sharing, `fetch_add` as the fix for a lost update. States up front that coherence is per location and ordering is across locations. |
| `lock-free-cas` | `concurrency-models`, `thread-pools-work-stealing` (deque), `priority-inversion` (locks), `cache-coherence` (a contended line bounces) | Owns the CAS loop, retries, ABA, reclamation (hazard pointers or epochs, named and sketched), lock-free vs wait-free. Out of scope: the work-stealing deque, locking protocols and inversion fixes. |
| `numa-multicore` | `cache-coherence`, `memory-hierarchy`, `cpu-caches`, `page-tables-tlb` | Owns socket distance: local vs remote memory, first-touch placement, interconnect cost. Out of scope: MESI traffic inside a socket, TLB. Every latency is a named, illustrative constant. |
| `np-reductions` | `p-vs-np` (definitions, "NP-complete means every NP problem reduces") | Owns performing a reduction: 3-SAT to a graph problem, with a solution mapped both ways. Out of scope: the P, NP, NP-complete vocabulary. |
| `sat-solvers` | `np-reductions`, `backtracking`, `propositional-logic` | Owns DPLL: unit propagation, conflicts, the branching choice; a package-resolution encoding. Out of scope: the reduction itself, truth tables. CDCL is named, not built. |
| `approximation-algorithms` | `p-vs-np` ("heuristics, approximations and solvers"), `greedy-algorithms`, `minimum-spanning-trees` | Owns the guarantee: a ratio proved against an optimum the lesson can compute on small inputs. Out of scope: NP-hardness, MST itself. |
| `local-search-annealing` | `gradient-descent` (local minima), `randomized-algorithms` | Owns hill climbing vs annealing and 2-opt on a tour. Out of scope: gradient-based optimisation, Las Vegas vs Monte Carlo. |
| `linear-programming` | `gradient-descent`, `matrices-transformations` | Owns the feasible region, the vertex theorem and the objective line. Out of scope: simplex pivot tables beyond one worked step, integer programming (named). |
| `game-theory` | `game-tree-search` (sequential minimax), `expected-value` | Owns simultaneous games: payoff matrix, dominant strategies, Nash, mixed strategies. Out of scope: minimax and pruning. |
| `online-algorithms` | `lru-cache`, `caching-patterns`, `randomized-algorithms`, `amortized-analysis` | Owns competitive ratio against hindsight-optimal and the adversary. Out of scope: how LRU works, amortised cost. |
| `suffix-arrays` | `tries`, `rolling-hash`, `kmp`, `inverted-index` | Owns the sorted-suffix index and LCP. Out of scope: trie mechanics, single-pattern matching. |
| `aho-corasick` | `kmp` (failure links), `tries`, `regex-engines` | Owns the multi-pattern automaton and output links. Out of scope: KMP's single-pattern failure function (starts exactly where `kmp` stops). |
| `lca-binary-lifting` | `tree-traversals`, `trees-bst`, `segment-trees` (range queries) | Owns the jump table and the 2^k climb. Out of scope: traversal order, range-query trees. |
| `secret-sharing` | `randomness-csprng`, `envelope-encryption-kms`, `secrets-management` | Owns Shamir over a small prime field and "k − 1 points reveal nothing". Out of scope: KMS wrapping, vault operations. Toy field labelled as a toy; no real key material. |
| `zero-knowledge-proofs` | `hashing-encryption`, `digital-signatures-pki`, `diffie-hellman` | Owns completeness, soundness and zero-knowledge through an interactive proof with toy discrete-log parameters. Out of scope: signatures, SNARK internals (named only). |
| `elliptic-curves` | `rsa`, `diffie-hellman` (ECDH named) | Owns the group law and scalar multiplication on a tiny field. Out of scope: the DH protocol, RSA. Never implies a toy curve is secure. |
| `e2ee-forward-secrecy` | `diffie-hellman` and `tls-handshake` (both already say forward secrecy and ephemeral keys), `mfa-passkeys` | Owns the double ratchet idea: a symmetric key chain plus a DH ratchet, what one stolen key opens, post-compromise recovery. Out of scope: DH maths, the TLS handshake. A stolen key is a state in a simulation; no recovery procedure. |
| `post-quantum-crypto` | `elliptic-curves`, `rsa`, `tls-handshake` | Owns harvest-now-decrypt-later, hybrid key exchange, and a toy lattice (noise) scheme. Out of scope: ECC and RSA mechanics. Shor's algorithm is described, not run; the toy lattice is labelled and no real parameter set is shown as secure. |
| `llm-serving` | `training-vs-inference` (static batching, B / (a + cB), 2 vs 16 bytes per parameter), `attention-transformers` (n² weights), `tokenization-bpe`, `rag-pipelines`, `llm-agents-tool-use` | Owns prefill vs decode, KV-cache growth, continuous batching. Out of scope: the static-batching formula, attention maths, retrieval, agents. The spec says in words how continuous batching differs from the batch-or-wait model already taught. No real model, GPU or price unhedged. |
| `fine-tuning-quantization` | `svd-pca` (low rank), `neural-networks-backprop`, `floating-point`, `numeric-precision` | Owns a low-rank adapter and weight rounding to a coarser grid with a memory and error meter. Out of scope: SVD derivation, float formats. |
| `feature-stores-skew` | `training-vs-inference` (its serving-preprocessing skew toy), `model-evals-drift`, `etl-orchestration`, `warehouse-lake-lakehouse` | Owns point-in-time correctness and one shared definition for two pipelines. Out of scope: drift detection, pipeline scheduling. |
| `finops-cloud-cost` | `autoscaling`, `capacity-planning`, `object-storage`, `serverless-cold-starts`, `virtualization-hypervisors` | Owns unit economics: cost per request, commitment vs on-demand vs spot, egress, storage tiers. Out of scope: scaling mechanics. Every price is a named constant labelled illustrative. |
| `strangler-fig-migrations` | `zero-downtime-migrations` (DDL expand/contract), `deployment-strategies`, `safe-config-rollout`, `monolith-microservices` | Owns multi-quarter route-by-route migration: facade, shadow traffic, rollback per step, the long tail. Out of scope: schema DDL, canary mechanics. |
| `conways-law` | `monolith-microservices` (states Conway's law in one line, chipped as practice), `domain-driven-design` | Owns team topologies, the inverse Conway manoeuvre, cognitive load. Out of scope: the one-line observation (starts from it) and context mapping. |
| `build-vs-buy` | `technical-debt`, `product-thinking`, `software-licensing` | Owns the decision: commodity vs core, TCO over three years including maintenance and lock-in. Out of scope: licence terms, debt interest. |
| `technical-strategy` | `prioritization` (cost of delay), `estimation`, `design-docs-rfcs`, `build-vs-buy` | Owns diagnosis, guiding policy, coherent action across teams. Out of scope: ordering one team's backlog, the decision document. |
| `reversible-decisions` | `prioritization`, `design-docs-rfcs` | Owns calibrating rigour to reversibility. Out of scope: impact/effort ordering, how to write the document. |
| `influence-without-authority` | `design-docs-rfcs`, `mentoring-delegation` | Owns pre-wiring and moving stakeholders before the meeting. Out of scope: the document, delegation. |
| `hiring-interviewing` | `mentoring-delegation`, `hypothesis-testing-ab`, `distributions` | Owns loop design and rubric calibration. Out of scope: mentoring, the statistics themselves. Research claims are labelled research finding, hedged, from memory. |

### 1.3 Backlog "Overlaps" ids and "Builds on" targets: checked

Every target in §2 is a registered lesson (409 directories checked) or an earlier topic **in the same batch**. Found and fixed:

| Problem | Where | Fix |
|---|---|---|
| Overlap id does not exist | `finops-cloud-cost` lists `cloud-compute-primitives` | No such lesson or topic. Re-pointed to `serverless-cold-starts`, `virtualization-hypervisors`, `autoscaling`, `object-storage`, `capacity-planning`. |
| Direction reversed by Tier 3 | `prioritization` once built on `technical-strategy` | T3 re-pointed it to `estimation`; `technical-strategy` now builds on `prioritization`. |
| Implied but not listed | about 30 topics | Added in §2 (e.g. `paxos` also on `quorums`; `distributed-sql-truetime` on `mvcc` and `distributed-transactions`; `e2ee-forward-secrecy` on `macs-hmac`; `finops-cloud-cost` on `capacity-planning`). |
| Cross-wave dependency on an unchecked lesson | `paxos`, `byzantine-faults`, `flp-impossibility` build on `raft`; `distributed-sql-truetime` on `distributed-transactions` and (via its sharding story) `multi-region`; `metastable-failures` on `backpressure` | All are in T4-R1 (wave 1), so T4-B4 and T4-B1 sit in wave 2, after R1 has merged (§6). `chaos-engineering` to `slos-error-budgets` is the one edge that stays in words: that lesson is in T4-R2, same wave as T4-B1. |
| Tier 4 topic referenced by an existing lesson | none | A grep for all 41 ids across `src/lessons`, `core`, `pages` and `components` found no link or reference to any of them, so there is no dangling link to fix. |

### 1.4 The nine existing Tier 4 lessons

Registered, built, no tests, K-2 allowlisted. They are retrofitted at this kickoff in two batches (**T4-R1**: `raft`, `distributed-transactions`, `crdts`, `multi-region`, `backpressure`, wave 1; **T4-R2**: `lsm-trees`, `probabilistic-structures`, `slos-error-budgets`, `zero-trust`, wave 2; §5). Seven have Tier 3 dependents (the nine edges in tier3-plan §1.5), so they are also the lessons the new Tier 4 batches stand on.

| Lesson | Track | Who stands on it |
|---|---|---|
| `raft` (R1) | arch | T4: `paxos`, `byzantine-faults`, `flp-impossibility`, `distributed-sql-truetime`; T3: `leases-fencing` |
| `distributed-transactions` (R1) | arch | T4: `distributed-sql-truetime`; T3: `transactional-outbox` |
| `backpressure` (R1) | arch | T3: `queueing-theory`; T4: `metastable-failures` (links it by id, R1 merges first) |
| `multi-region` (R1) | arch | T3: `backups-disaster-recovery`; T4: `distributed-sql-truetime` |
| `lsm-trees` (R2) | data | none in Tier 4 |
| `crdts` (R1) | data | T3: `logical-clocks`, `offline-first-sync` |
| `probabilistic-structures` (R2) | dsa | T3: `count-min-heavy-hitters`, `randomized-algorithms`; T4: none |
| `slos-error-budgets` (R2) | ops | T3: `alerting-design`; T4: `chaos-engineering` (same wave, so named in words; link patched after wave 2) |
| `zero-trust` (R2) | sec | none |

**Result:** 41 lessons, 0 drops beyond the one already decided, 0 new merges (two recorded triggers), 0 moves, 41 of 41 overlaps drawn as lines, 1 non-existent overlap id and 1 cross-wave dependency fixed.

---

## 2. Tier 4 final list: 41 topics

Titles and taglines are the backlog's, verbatim, minus the "(critic)" marker. K4-T1 registers them exactly so, grouped by track, minutes unset. The 9 existing Tier 4 lessons stay as registered. **Priority** is the backlog's. **D** marks **[domain review]**: a second-reviewer read of the model and its tests before the batch is accepted. **Builds on** is the corrected prerequisite list (§1.3); a target that is a Tier 4 topic always sits **earlier in the same batch**. **Batch** is the T4-B number from §6. Within a batch, build in the order of the §6 table, which already puts a prerequisite before its dependant and otherwise core, then important, then nice.

| id | Title | Track | Priority | Domain | Builds on | Batch |
|---|---|---|---|---|---|---|
| `failure-detectors` | Failure Detectors & Heartbeats | arch | important | **D** | `timeouts-deadlines`, `health-checks`, `physical-clocks-skew`, `distributions` | B1 |
| `gossip-protocols` | Gossip Protocols | arch | important | **D** | `failure-detectors`, `service-discovery-mesh`, `logical-clocks` | B1 |
| `metastable-failures` | Retry Storms & Metastable Failures | arch | important | **D** | `circuit-breakers`, `cache-stampede`, `queueing-theory`, `timeouts-deadlines` | B1 |
| `chaos-engineering` | Chaos Engineering | ops | important |  | `circuit-breakers`, `health-checks`, `observability`, `graceful-degradation` | B1 |
| `deterministic-simulation-testing` | Deterministic Simulation Testing | craft | nice | **D** | `chaos-engineering`, `property-based-testing`, `flaky-tests` | B1 |
| `memory-ordering-atomics` | Memory Ordering & Atomics | os | important | **D** | `race-conditions`, `cache-coherence`, `cpu-pipelining` | B2 |
| `lock-free-cas` | Compare-and-Swap & Lock-Free Structures | os | nice | **D** | `memory-ordering-atomics`, `race-conditions`, `thread-pools-work-stealing` | B2 |
| `numa-multicore` | Multicore, NUMA & Memory Locality | hw | nice | **D** | `cache-coherence`, `memory-hierarchy`, `cpu-caches` | B2 |
| `formal-methods` | Formal Methods & Model Checking (TLA+) | craft | nice | **D** | `induction-invariants`, `proof-techniques`, `property-based-testing` | B2 |
| `np-reductions` | Reductions | lang | important | **D** | `p-vs-np`, `propositional-logic`, `graph-representations` | B3 |
| `sat-solvers` | SAT & Constraint Solvers | lang | nice |  | `np-reductions`, `backtracking`, `propositional-logic` | B3 |
| `approximation-algorithms` | Approximation Algorithms | dsa | important | **D** | `np-reductions`, `minimum-spanning-trees`, `greedy-algorithms` | B3 |
| `local-search-annealing` | Local Search & Simulated Annealing | dsa | nice |  | `approximation-algorithms`, `randomized-algorithms`, `gradient-descent` | B3 |
| `linear-programming` | Linear Programming & Optimization | math | nice | **D** | `approximation-algorithms`, `matrices-transformations`, `greedy-algorithms` | B3 |
| `paxos` | Paxos | arch | important | **D** | `raft`, `quorums`, `consistency-models` | B4 |
| `byzantine-faults` | Byzantine Faults & BFT | arch | nice | **D** | `raft`, `quorums`, `digital-signatures-pki` | B4 |
| `flp-impossibility` | FLP Impossibility | arch | nice | **D** | `raft`, `consistency-models`, `exactly-once-myth` | B4 |
| `distributed-snapshots` | Distributed Snapshots (Chandy-Lamport) | arch | nice | **D** | `logical-clocks`, `message-queues`, `kafka-partitioned-log` | B4 |
| `hybrid-logical-clocks` | Hybrid Logical Clocks | arch | nice | **D** | `physical-clocks-skew`, `logical-clocks` | B4 |
| `distributed-sql-truetime` | Distributed SQL & TrueTime (Spanner) | data | nice | **D** | `hybrid-logical-clocks`, `paxos`, `distributed-transactions`, `multi-region`, `sharding`, `mvcc` | B4 |
| `suffix-arrays` | Suffix Arrays & Suffix Trees | dsa | nice |  | `tries`, `sorting`, `binary-search` | B5 |
| `aho-corasick` | Aho-Corasick Multi-Pattern Matching | dsa | nice |  | `tries`, `kmp` | B5 |
| `lca-binary-lifting` | Lowest Common Ancestor & Binary Lifting | dsa | nice |  | `tree-traversals`, `trees-bst` | B5 |
| `online-algorithms` | Online Algorithms & Competitive Analysis | dsa | nice | **D** | `lru-cache`, `amortized-analysis`, `randomized-algorithms` | B5 |
| `game-theory` | Game Theory Basics | math | nice | **D** | `expected-value`, `probability-basics`, `game-tree-search` | B5 |
| `elliptic-curves` | Elliptic Curve Cryptography | sec | nice | **D** | `rsa`, `modular-arithmetic`, `diffie-hellman` | B6 |
| `post-quantum-crypto` | Post-Quantum Cryptography | sec | nice | **D** | `elliptic-curves`, `rsa`, `tls-handshake` | B6 |
| `e2ee-forward-secrecy` | End-to-End Encryption & Forward Secrecy | sec | nice | **D** | `diffie-hellman`, `symmetric-ciphers`, `macs-hmac`, `digital-signatures-pki` | B6 |
| `secret-sharing` | Secret Sharing & Threshold Crypto | sec | nice | **D** | `modular-arithmetic`, `randomness-csprng`, `secrets-management` | B6 |
| `zero-knowledge-proofs` | Zero-Knowledge Proofs | sec | nice | **D** | `modular-arithmetic`, `hashing-encryption`, `probability-basics` | B6 |
| `llm-serving` | LLM Serving: Tokens, KV Cache & Batching | ml | important | **D** | `training-vs-inference`, `attention-transformers`, `tokenization-bpe` | B7 |
| `fine-tuning-quantization` | Fine-Tuning, LoRA & Quantization | ml | nice | **D** | `llm-serving`, `neural-networks-backprop`, `svd-pca`, `floating-point` | B7 |
| `feature-stores-skew` | Feature Stores & Training/Serving Skew | ml | nice | **D** | `training-vs-inference`, `etl-orchestration`, `model-evals-drift` | B7 |
| `finops-cloud-cost` | Cloud Cost & FinOps | ops | important | **D** | `serverless-cold-starts`, `autoscaling`, `object-storage`, `capacity-planning` | B7 |
| `strangler-fig-migrations` | Large Migrations & the Strangler Fig | lead | core |  | `monolith-microservices`, `deployment-strategies`, `zero-downtime-migrations`, `feature-flags` | B8 |
| `conways-law` | Conway's Law & Team Topologies | lead | important |  | `domain-driven-design`, `monolith-microservices` | B8 |
| `build-vs-buy` | Build vs Buy | lead | important |  | `technical-debt`, `product-thinking`, `design-docs-rfcs` | B8 |
| `technical-strategy` | Technical Strategy & Roadmaps | lead | important |  | `build-vs-buy`, `prioritization`, `design-docs-rfcs` | B8 |
| `reversible-decisions` | One-Way vs Two-Way Door Decisions | lead | nice |  | `design-docs-rfcs`, `prioritization` | B9 |
| `influence-without-authority` | Influence Without Authority | lead | important |  | `design-docs-rfcs`, `mentoring-delegation` | B9 |
| `hiring-interviewing` | Hiring & Technical Interviewing | lead | nice | **D** | `mentoring-delegation`, `distributions` | B9 |

**Validated count: 41** (1 core, 14 important, 26 nice; 29 flagged **D**).

Per batch: B1 5 lessons (4 D), B2 4 (4 D), B3 5 (3 D), B4 6 (6 D), B5 5 (2 D), B6 5 (5 D), B7 4 (4 D), B8 4 (0 D), B9 3 (1 D). Totals 41 and 29. Per wave (§6.4): wave 1 holds B3, B5, B8 (14 lessons, 5 D), wave 2 B1, B4, B9 (14 lessons, 11 D), wave 3 B2, B6, B7 (13 lessons, 13 D). This table is the one the content lint pins: keep its shape (a `## 2.` heading, **D** in column 5).

Why these 12 are not flagged: `chaos-engineering`, `sat-solvers`, `local-search-annealing`, `suffix-arrays`, `aho-corasick`, `lca-binary-lifting` have tests against brute force or a reference and no claim about a real system; the six lead lessons without a flag carry opinion rather than checkable fact and are held to AC-0/T3 #24 (labelled claims) instead, as Tier 3's `mentoring-delegation` was.

---

## 3. AC-0/T4: what every Tier 4 lesson adds on top of AC-0, AC-0/T2 and AC-0/T3

**Not Atlas's. See `docs/tier4-technical.md` §3.** AC-0 and AC-0/T2 and AC-0/T3 (tier3-plan §3, rules 1 to 26) apply in full to the 41 new lessons and to T4-R1 and T4-R2. Rule 13 (links only to lessons that exist or sit in an earlier wave), rule 20 (invariants over 200+ seeded fault schedules; "broken" mode violates the invariant on a named seed), rule 23 (a manipulable object and a way to fail) and rule 24 (labelled opinion for lead lessons) are the ones this plan leans on most.

## 4. Shared-kit prerequisites

**Not Atlas's. See `docs/tier4-technical.md` §4.** §6.2 below lists which batch needs a piece, and the wave it must be merged before, so Vector's items can be gated; the rule from tier3-plan AC-0/T3 #25 applies: two lessons in one batch that need the same missing piece mean a kit round **before** that batch, never a copy.

## 5. Retrofitting the 9 existing Tier 4 lessons (T4-R1, T4-R2)

**The technical "done when" is Vector's, in `docs/tier4-technical.md` §5 (§5.2 sets the split).** Atlas's part: **two batches**, each one builder in its own worktree, one fixer, all nine lessons domain-reviewed (every one states facts about real systems):

| Batch | Lessons | Wave | Branch | Reviewers |
|---|---|---|---|---:|
| **T4-R1** | `raft`, `distributed-transactions`, `crdts`, `multi-region`, `backpressure` | 1 | `t4/r1` | 2 |
| **T4-R2** | `lsm-trees`, `probabilistic-structures`, `slos-error-budgets`, `zero-trust` | 2 | `t4/r2` | 1 |

R1 holds the lessons the new Tier 4 distributed-theory lessons and the Tier 3 edges stand on, so it goes first and **merges before wave 2 starts**; R2 has no Tier 4 dependant and follows in wave 2. Order inside R1: `raft` first (the biggest job and the foundation), then `distributed-transactions` and `crdts`, then `multi-region` and `backpressure`. The tickets carry the same eight conditions as tier3-plan §5 (tests assert every on-screen claim against an independent reference, logic out of `.tsx`, `Provenance` on whatever is scripted, `watch` checked against a screenshot, K-2 pass, every scene at 390 and 768, no scope growth, no shared-code edits). Sign-off count is unchanged: 41 + 9 = 50.

---

## 6. Batches, waves and concurrency

### 6.1 Batches

**Batches** (9 new: sizes 5, 4, 5, 6, 5, 5, 4, 4, 3; plus 2 retrofit of 5 and 4). Every batch touches only `src/lessons/<its ids>/`. Batches keep their B1 to B9 numbers (the id is the topic cluster, not the wave); the wave column is the placement. Lessons are listed in build order; a "Builds on" target in the same batch is always earlier.

**Ordering rationale.** The rollout-plan §3.3 order ("distributed theory first, then concurrency, algorithms, crypto, ML serving, lead last") is a **pedagogical build order, not a dependency**, and it is kept *inside* each batch (`failure-detectors` before `gossip-protocols`; `hybrid-logical-clocks` before `distributed-sql-truetime`; `np-reductions` before `sat-solvers`; `elliptic-curves` before `post-quantum-crypto`; `llm-serving` before `fine-tuning-quantization`; `build-vs-buy` before `technical-strategy`). The **waves are sequenced by kit readiness** (Vector's kit tickets, `docs/tier4-technical.md` §4.1):
1. **Wave 1 = what needs little or only small kit:** T4-R1 (the retrofit the distributed lessons stand on), T4-B3 (hardness: needs K4-4 `core/sat`, K4-5 `core/tsp`, K4-8 theorem label), T4-B5 (strings, trees, games: no kit), T4-B8 (leading change: needs K4-9 and K4-10, both small). All of it is built in the kickoff round.
2. **Wave 2 = distributed theory, once the heavy new surface lands:** K4-1 (distSim v2) and K4-2 (`core/explore`, pure protocol, `TracePlayer`) are the biggest new kit and are built *during wave 1* and merged before wave 2; the K4-2 Paxos exhaustive-search spike may force a scope cut, so nothing in wave 1 waits for it. T4-B1 (failure & membership; K4-1, K4-2) and T4-B4 (consensus & global time; K4-1, K4-2, K4-8) are the distributed batches; T4-R2 and T4-B9 (people & judgement; K4-9) fill the wave.
3. **Wave 3 = what depends on later kit:** K4-3 `core/memModel`, K4-6 `core/field` and `core/ecc`, K4-7 crypto additions and K4-11 `core/rocAuc` are built *during wave 2* (K4-3 uses K4-2's explorer, so it cannot start earlier) and merged before wave 3: T4-B2 (concurrency; K4-3), T4-B6 (advanced cryptography; K4-6, K4-7, K4-8), T4-B7 (ML serving & cost; K4-11, plus a local LLM-serving simulator Vector keeps inside the lesson).
4. **The lead lessons can go early** because no new-to-new edge connects them to any technical Tier 4 lesson. They are not "last" any more; the scenario grammar they need is confirmed to exist: `src/components/ScenarioStory.tsx` and `src/core/scenario.ts` (with `validateScenario`) shipped as K3-15 and seven Tier 3 lessons use them (`design-docs-rfcs`, `estimation`, `incident-response`, `mentoring-delegation`, `ml-fairness-bias`, `prioritization`, `threat-modeling`). K4-9 adds trade-off checks to `validateScenario`; K4-10 adds `ClassifyBoard` explore mode for the boards. Only lessons with real branching use `ScenarioStory` (`strangler-fig-migrations`, `influence-without-authority`, `reversible-decisions` are the likely three); the rest are boards.
5. **T4-B4 stays after T4-R1**: it stands on retrofitted `raft`, `distributed-transactions` and `multi-region`. R1 merges before wave 2 starts, so the link rule (links only to lessons that exist and have been checked) holds.

| Batch | Name | Tracks | Lessons, in build order | Wave | Domain review | Reviewers |
|---|---|---|---|---:|---|---:|
| T4-R1 | Retrofit, part 1 | arch, data | `raft`, `distributed-transactions`, `crdts`, `multi-region`, `backpressure` | 1 | all 5 | 2 |
| T4-B3 | Hardness & optimisation | lang, dsa, math | `np-reductions`, `sat-solvers`, `approximation-algorithms`, `local-search-annealing`, `linear-programming` | 1 | `np-reductions`, `approximation-algorithms`, `linear-programming` | 1 |
| T4-B5 | Strings, trees & strategy | dsa, math | `suffix-arrays`, `aho-corasick`, `lca-binary-lifting`, `online-algorithms`, `game-theory` | 1 | `online-algorithms`, `game-theory` | 1 |
| T4-B8 | Leading change & strategy | lead | `strangler-fig-migrations`, `conways-law`, `build-vs-buy`, `technical-strategy` | 1 | none | 1 |
| T4-B1 | Failure & membership | arch, ops, craft | `failure-detectors`, `gossip-protocols`, `metastable-failures`, `chaos-engineering`, `deterministic-simulation-testing` | 2 | 4 of 5 (not `chaos-engineering`) | 2 |
| T4-B4 | Consensus & global time | arch, data | `paxos`, `byzantine-faults`, `flp-impossibility`, `distributed-snapshots`, `hybrid-logical-clocks`, `distributed-sql-truetime` | 2 | all 6 | 2 (3 lessons each) |
| T4-R2 | Retrofit, part 2 | data, dsa, ops, sec | `lsm-trees`, `probabilistic-structures`, `slos-error-budgets`, `zero-trust` | 2 | all 4 | 1 |
| T4-B9 | People & judgement | lead | `reversible-decisions`, `influence-without-authority`, `hiring-interviewing` | 2 | `hiring-interviewing` | 1 |
| T4-B2 | Concurrency, cores & proofs | os, hw, craft | `memory-ordering-atomics`, `lock-free-cas`, `numa-multicore`, `formal-methods` | 3 | all 4 | 2 |
| T4-B6 | Advanced cryptography | sec | `elliptic-curves`, `post-quantum-crypto`, `e2ee-forward-secrecy`, `secret-sharing`, `zero-knowledge-proofs` | 3 | all 5, payload-free review | 2 |
| T4-B7 | ML serving & cloud cost | ml, ops | `llm-serving`, `fine-tuning-quantization`, `feature-stores-skew`, `finops-cloud-cost` | 3 | all 4 | 2 |

Counts: new lessons 5 + 5 + 4 (wave 1) + 5 + 6 + 3 (wave 2) + 4 + 5 + 4 (wave 3) = **41** in 9 batches; plus 9 retrofitted in 2 batches. `hiring-interviewing` stays **D** and also needs `ClaimLabel` (it quotes research). `formal-methods` uses K4-2 and K4-4 and `deterministic-simulation-testing` uses K4-1 and K4-2, all merged before their waves.

### 6.2 What each batch needs from the kit

Vector owns the tickets (`docs/tier4-technical.md` §4.1); this table says which batch needs which and **when it must be merged**. A one-lesson need stays local. Rule: a ticket is gated before its first user, and two lessons in one batch that need the same missing piece mean the kit round comes before that batch.

| Kit ticket | Used by (batch) | Built | Must be merged before |
|---|---|---|---|
| K4-4 `core/sat` | `np-reductions`, `sat-solvers` (B3); `formal-methods` (B2) | kickoff round (P0) | wave 1 |
| K4-5 `core/tsp` | `approximation-algorithms`, `local-search-annealing` (B3) | kickoff round (P0) | wave 1 |
| K4-8 `ClaimLabel kind="theorem"` | `np-reductions`, `approximation-algorithms` (B3); `flp-impossibility`, `byzantine-faults` (B4); `secret-sharing`, `zero-knowledge-proofs` (B6); `online-algorithms`, `game-theory`, `linear-programming` | kickoff round (P0) | wave 1 |
| K4-9 `validateScenario` trade-off checks | B8 and B9 (the branching lead lessons) | kickoff round (P0) | wave 1 |
| K4-10 `ClassifyBoard` explore mode | `build-vs-buy`, `conways-law` (B8); `reversible-decisions` (B9) | kickoff round (P0) | wave 1 |
| T4-T1 to T4-T8 (register the 41, content lint T4, CLAUDE.md, sweep, captions, parallel-agent robustness, review protocol, audit) | every batch | kickoff round (P0) | wave 1 |
| K4-1 distSim v2 | `failure-detectors`, `gossip-protocols`, `chaos-engineering`, `deterministic-simulation-testing` (B1); `paxos`, `distributed-snapshots` (B4) | **during wave 1** | wave 2 |
| K4-2 `core/explore`, pure protocol, `TracePlayer` | `paxos`, `byzantine-faults`, `flp-impossibility`, `distributed-snapshots` (B4); `deterministic-simulation-testing` (B1); `formal-methods`, `memory-ordering-atomics`, `lock-free-cas` (B2, the last two via K4-3) | **during wave 1** (spike first; may cut scope) | wave 2 |
| K4-3 `core/memModel` | `memory-ordering-atomics`, `lock-free-cas` (B2) | **during wave 2** (needs K4-2) | wave 3 |
| K4-6 `core/field`, `core/ecc` | `elliptic-curves`, `post-quantum-crypto`, `secret-sharing`, `zero-knowledge-proofs` (B6) | **during wave 2** | wave 3 |
| K4-7 `core/crypto` additions and oracles | `e2ee-forward-secrecy`, `post-quantum-crypto`, `elliptic-curves` (B6) | **during wave 2** | wave 3 |
| K4-11 `core/rocAuc` | `feature-stores-skew` (B7) | **during wave 2** | wave 3 |
| Local, no ticket | model checker (`formal-methods`), LLM-serving and KV-cache formulas (`llm-serving`), `lp2d` and the Nash enumerator, HLC functions, phi-accrual and SWIM | n/a | n/a |

T4-B5 needs no new kit.

### 6.3 Process facts, learned in Tier 3 and binding here

Sources: `docs/qa-tier3-report.md`, `docs/tier3-plan.md` §6.

1. **One builder per batch**, in its own worktree and branch (`t4/b<n>`, `t4/r<n>`) created through Claude Code's built-in worktree mode, off a freshly fetched `main` (never a stale local branch), with its own `KINETIC_PORT`. Every agent **commits per lesson**: usage limits can stall work for days, and an uncommitted lesson in a stalled worktree is a lost lesson.
2. **Independent review per batch.** After the builder finishes, a Sentry review writes a **fix list**: two reviewers for larger or [domain review] batches (split by lesson; the §6.1 table says which: R1, B1, B4, B2, B6, B7 have two; R2, B3, B5, B8, B9 have one). The domain review runs before the batch is accepted.
3. **One fixer** on the same worktree, working from the fix list. Never two writers at once.
4. **The coordinator merges with gates by exit code, never by grepping output:** `npm run build`, `npm run lint`, `npm test`, `npm run check-tokens -- --strict`, then `npm run smoke -- --scenes <the batch's ids>` (the batch only, never all 450 lessons in one process).
5. **Kit rounds only between waves.** Builders never edit shared code (`src/core/*`, `src/components/*`, `src/styles/*`, `curriculum.ts`, `docs/shared-api.md`, this file); misfits go in the batch report as Phase 2 requests. Kit tickets built *during* a wave are built by kit agents in their own worktrees and merged in the round between waves; no builder sees them mid-wave.
6. **Whole-app smoke only at the end of a wave and at sign-off, and never while any agent is editing files.** Desktop and mobile (`--mobile`), `captions`, `check-tokens --strict`.
7. **A crash and focus sweep per wave** (`npm run sweep`, T4-T4): run on the wave's lessons at the wave-end gate, not only at sign-off. Tier 3's sign-off sweep found four crashes and several focus drops no per-batch review saw.
8. **Cost levers** (the owner's Tier 3 direction: cut token cost and wall-clock without losing quality): keep every review; drop polling loops; scene smoke only on the batch's lessons; fix MAJOR and trivial minors, park the rest in the report; do not rerun whole-app smoke after a fix that touched one lesson.
9. **Link rule (AC-0/T2 #13, T3 #13) and the retrofit edges.** A lesson links by id only to lessons that exist and are built in an earlier wave, or earlier in its own batch. Applied to the retrofit: T4-R1 (wave 1) merges before wave 2 starts, so **T4-B1's `metastable-failures` links `backpressure` by id** (R1, an earlier wave) and **T4-B4 links `raft`, `distributed-transactions` and `multi-region`** by id. The one edge that stays in words is **`chaos-engineering` to `slos-error-budgets`**: T4-R2 and T4-B1 are in the same wave 2, so `chaos-engineering` describes the lesson in plain words and the kit round after wave 2 includes a one-line link patch by the kit owner (lesson links are not shared code, but the builders are gone by then). Nothing in wave 1 builds on a lesson retrofitted in the same wave.

### 6.4 Waves and concurrency

Expect **4, 4 and 3 concurrent builders**: three waves. A wave ends when every batch in it is built, reviewed, fixed and merged and the wave-end gate (§6.3 items 6 and 7) is green. Then the kit round, then the next wave. **R1 merges before wave 2 starts.**

| Wave | Batches | Builders | New lessons | Retrofit | Flagged **D** (new) | Why here |
|---|---|---|---:|---:|---:|---|
| kickoff | T4-T1 to T4-T8, K4-4, K4-5, K4-8, K4-9, K4-10 | 3 kit | none | none | n/a | Everything wave 1 needs. Registers the 41, extends the content lint, builds `core/sat`, `core/tsp`, the theorem label, the trade-off checks and `ClassifyBoard` explore mode. |
| 1 | T4-R1, B3, B5, B8 | 4 | 14 | 5 | 5 (+5 retrofit) | The retrofit goes first so wave 2 can stand on `raft`, `distributed-transactions`, `multi-region` and `backpressure`. B3 has the two proof-shaped pilots (`np-reductions` first). B5 is light relief and needs no kit. B8 opens the lead lessons early because nothing technical depends on them. **K4-1 and K4-2 are built during this wave.** Two reviewers on R1. |
| 2 | B1, B4, R2, B9 | 4 | 14 | 4 | 11 (+4 retrofit) | The distributed theory, on distSim v2 and the explorer. B4 is the hardest batch of the tier (six flagged lessons); two reviewers on B1 and B4. R2 and B9 are the lighter fill. **K4-3, K4-6, K4-7 and K4-11 are built during this wave.** |
| 3 | B2, B6, B7 | 3 | 13 | none | 13 | The three batches that depend on later kit: concurrency (`memModel`), advanced cryptography (`core/field`, `core/ecc`, crypto additions) and ML serving (`rocAuc`). All three are fully domain-reviewed with two reviewers: the heaviest wave for review, with the fewest builders. |

41 new lessons in 3 waves (14 + 14 + 13), 9 retrofits (5 in wave 1, 4 in wave 2), 29 flagged new (5 + 11 + 13). **Kit rounds:** one before wave 1 (kickoff, P0), one after wave 1 (merges K4-1 and K4-2), one after wave 2 (merges K4-3, K4-6, K4-7, K4-11 and the `slos-error-budgets` link patch), and the Tier 4 close-out round after wave 3 before QA.

**Dependency order for "builds on".** No new-to-new edge crosses a batch. Cross-batch chains are on registered lessons only:

| Chain | Order |
|---|---|
| Retrofit first | R1 (`raft`, `distributed-transactions`, `crdts`, `multi-region`, `backpressure`, wave 1) then B4 and B1 (wave 2) |
| Hardness | `np-reductions` then `sat-solvers`, `approximation-algorithms` then `local-search-annealing`, `linear-programming` (B3, wave 1) |
| Strings and games | independent; `kmp` and `tries` are Tier 3 or earlier (B5, wave 1) |
| Leads | `build-vs-buy` then `technical-strategy` (B8, wave 1); `reversible-decisions`, `influence-without-authority`, `hiring-interviewing` (B9, wave 2) |
| Distributed theory | `failure-detectors` then `gossip-protocols`, then `metastable-failures`, `chaos-engineering`, `deterministic-simulation-testing` (B1, wave 2); `paxos`, `byzantine-faults`, `flp-impossibility`, `distributed-snapshots`, `hybrid-logical-clocks` then `distributed-sql-truetime` (B4, wave 2) |
| Concurrency | `memory-ordering-atomics` then `lock-free-cas`, `numa-multicore`, `formal-methods` (B2, wave 3) |
| Crypto | `elliptic-curves` then `post-quantum-crypto`; `e2ee-forward-secrecy`, `secret-sharing`, `zero-knowledge-proofs` (B6, wave 3) |
| ML serving | `llm-serving` then `fine-tuning-quantization`; `feature-stores-skew`, `finops-cloud-cost` (B7, wave 3) |

### 6.5 Effort, honestly (all figures are estimates)

Basis: Tier 3's known cost: builders about 600-850k tokens each for a 5-lesson batch; review plus fix roughly 40% on top. Scaled by lesson count and by how much new simulation each batch needs (B4, B6 heavy per lesson; B5 and B9 light; a retrofit lesson costs less than a new one). **None of this is measured for Tier 4.**

| Wave | Builders | Builder tokens (est.) | + review and fix, +40% (est.) | Notes |
|---|---:|---|---|---|
| 1 | 4 | R1 0.4-0.55M, B3 0.6-0.85M, B5 0.6-0.8M, B8 0.5-0.7M = 2.1-2.9M | 2.9-4.1M | R1 is five retrofits, but `raft` is a re-seeded executable model: the least certain figure. Kit agents for K4-1 and K4-2 run alongside and are not in this row. |
| 2 | 4 | B1 0.6-0.85M, B4 0.8-1.0M, R2 0.3-0.45M, B9 0.4-0.55M = 2.1-2.85M | 2.9-4.0M | B4 (six lessons) is the only batch likely to exceed the 850k Tier 3 ceiling. |
| 3 | 3 | B2 0.5-0.7M, B6 0.6-0.85M, B7 0.5-0.7M = 1.6-2.25M | 2.2-3.2M | Three fully flagged batches: the review share may exceed 40%. |
| Total builders and reviews | | 5.8-8.0M | **about 8-11M** | |
| Kit rounds (kickoff plus 3, including the K4-1/K4-2 spike) | | | about 1-2M (est.) | K4-1 and K4-2 are the heavy new surface. |
| Sign-off QA (audit, sample, sweep, fixers) | | | about 1-1.5M (est.) | Whole-app smoke over 450 lessons. |
| **Tier 4 grand total** | | | **about 10-14M tokens (est.)** | |

Wall-clock is not estimated: usage limits have stalled work for days before. The shape: 3 waves of (build, review, fix, merge, wave-end gate, kit round), with wave 1 gated on R1 merging and the K4-1 and K4-2 kit work, and wave 2 gated on K4-3, K4-6, K4-7 and K4-11.

---

## 7. Known risks, and the tracker rows to add

### 7.1 Known risks, Tier 4

- **Review density is the constraint.** 29 of 41 new lessons (71%) are flagged for domain review, against 56% in Tier 3, plus nine retrofitted lessons that all state real-system facts. Wave 3 carries 13 flagged lessons (three fully flagged batches), wave 2 carries 11 plus the four R2 retrofits, wave 1 carries 5 plus the five R1 retrofits. Two reviewers on six batches (R1, B1, B4, B2, B6, B7); do not trade review for speed, and do not compress the three waves into two (wave 3 is the heaviest for review and has the fewest builders, on purpose). Add a wave before cutting a review.
- **26 nice-priority topics.** The owner wants exhaustive, so all stay in scope. Inside a batch, build core, then important, then nice; the tier is not done until all 41 ship. If a spec author cannot name the manipulable for a topic in Appendix A, it goes back to the coordinator before it is built.
- **Proof-shaped lessons as slideshows** (`flp-impossibility`, `np-reductions`, `zero-knowledge-proofs`, `byzantine-faults`, `formal-methods`, `online-algorithms`, `game-theory`). A reviewer who can finish the lesson by pressing Next sends it back (AC-0/T3 #23). Each has a toy and a failing state in Appendix A. Pilot the two hardest (`np-reductions`, `flp-impossibility`) at the front of their batches.
- **Weak memory cannot be shown for real in JavaScript** (`memory-ordering-atomics`, `lock-free-cas`). The visual is a simulated memory model, labelled on screen with the `Provenance` chip; a litmus outcome is never presented as measured. The CAS race and the ABA scene are simulated schedules and say so.
- **Advanced crypto is the likeliest to be subtly wrong** (B6, wave 3, all five flagged). Toy fields and curves are labelled toys when shown and nothing implies a toy key is secure; `crypto.subtle` is "real" only where the lesson really calls it, with vectors in the tests; the toy lattice scheme in `post-quantum-crypto` is a labelled toy, ML-KEM parameters are named from memory and not built; `zero-knowledge-proofs` never claims a SNARK is demonstrated. Payload-free applies: no key-recovery or forgery walkthrough, a "stolen key" in `e2ee-forward-secrecy` is a state in a simulation, and nothing shows a working break of a real scheme. Full payload-free review of B6 before merge.
- **Distributed lessons that stage a failure instead of producing it** (B1 and B4, both wave 2). The same MAJOR class as Tier 3's B4, B17, B20 and B30: a caption says "the proposer lost the vote" and the model never loses it. AC-0/T3 #20: invariants over at least 200 seeded fault schedules, the "broken" mode violates the invariant on a named seed. `flp-impossibility` is the exception that proves the point: it shows that an adversary can keep a run undecided for N steps, never that "it runs forever" (the bounded-run wording from tier3 Appendix A).
- **`distSim` extension is the largest kit risk.** Delivery control and an equivocating node are new surface on a harness that has been through a whole tier. K4-1 and K4-2 are built during wave 1; if they slip or the K4-2 Paxos exhaustive-search spike forces a scope cut, wave 2 slips or narrows, not wave 1. Keep the API to what B4's five lessons need; the rest is a Phase 2 request.
- **Retrofit finds Tier 1-style majors.** The nine were built before any test existed. T4-R1 (the five lessons new distributed lessons stand on) is in wave 1 and merges before wave 2, so the fixes land before they are linked; T4-R2 follows in wave 2; a false claim in `raft` or `crdts` is the likeliest.
- **Perishable real-world facts** (`llm-serving`, `fine-tuning-quantization`, `finops-cloud-cost`, `distributed-sql-truetime`, `numa-multicore`). Model names, GPU specs, cloud prices, Spanner and CockroachDB behaviour, NUMA latencies: each is a named constant labelled illustrative or a "from memory, check the source" chip. No real price, model or benchmark appears unhedged (AC-0/T3 #21, #22). The spec says in words how `llm-serving`'s continuous batching differs from the static-batching formula `training-vs-inference` already teaches, so the two do not contradict.
- **Lead lessons are opinion** (B8 in wave 1, B9 in wave 2; 7 lessons). The risk is not a wrong number but an unlabelled opinion presented as fact (AC-0/T3 #24): every claim is labelled standard, research finding, common practice or one view; invented cases say "invented"; no real person or company attributed unless certain. `hiring-interviewing` is flagged because it quotes research. `ScenarioStory` is used only where the spec has real branching; a board is not forced into a story.
- **Distributed lessons doubling as test fixtures.** `deterministic-simulation-testing` runs on the real `core/distSim`; a change to the harness at a kit round can break it silently. Its test pins a seed and trace.
- **Whole-curriculum sign-off.** Tier 4 sign-off is also the last: whole-app smoke covers 450 lessons, and any shared-code change in a kit round touches all of them. Pixel-identical migrations only; no kit round after wave 3 except the close-out.
- **Tier inversion on the nine registered Tier 4 lessons.** Settled (§7.3).

### 7.2 Tracker rows to add to `rollout-plan.md` §4.1

Replace the three current Tier 4 rows (Kickoff, Batches T4-B1 ... T4-B8, sign-off) with the following; the coordinator pastes them in. Granularity matches Tier 3: one row per batch, kit rounds, retrofit, sign-off. Kit ticket ids are Vector's (`docs/tier4-technical.md` §4).

```
| 4 | Kickoff: validation, final list, batch and wave plan (docs/tier4-plan.md, docs/tier4-technical.md) | — | pre | Atlas, Vector | in progress | 41 new + 9 existing = 50; 9 batches + 2 retrofit (R1 5, R2 4); 3 waves of 4, 4, 3 builders; leases-fencing was the one row moved out (42 to 41) |
| 4 | Kickoff kit (P0): T4-T1 to T4-T8, K4-4 sat, K4-5 tsp, K4-8 theorem label, K4-9 scenario trade-off checks, K4-10 ClassifyBoard explore | — | pre | kit owner | not started | docs/tier4-technical.md §4; register the 41, content lint T4, sweep |
| 4 | T4-R1 Retrofit, part 1 (raft, distributed-transactions, crdts, multi-region, backpressure) | 5 | 1 | t4/r1 | not started | domain review: all 5; two reviewers; merges before wave 2 |
| 4 | T4-B3 Hardness & optimisation | 5 | 1 | t4/b3 | not started | domain review: 3 of 5; proof-toy pilot (np-reductions first) |
| 4 | T4-B5 Strings, trees & strategy | 5 | 1 | t4/b5 | not started | domain review: online-algorithms, game-theory; no new kit |
| 4 | T4-B8 Leading change & strategy | 4 | 1 | t4/b8 | not started | opinion labelled (AC-0/T3 #24); ScenarioStory where the spec branches |
| 4 | K4-1 distSim v2 and K4-2 core/explore + TracePlayer | — | built during 1 | kit agent | not started | Paxos exhaustive-search spike first; may force a scope cut; blocks wave 2 |
| 4 | P-follow-up after wave 1 (merge K4-1, K4-2) | — | 1→2 | kit owner | not started | wave-end gates: whole-app smoke desktop + 390px, captions, sweep of the wave's lessons |
| 4 | T4-B1 Failure & membership | 5 | 2 | t4/b1 | not started | domain review: 4 of 5; two reviewers; metastable-failures links backpressure |
| 4 | T4-B4 Consensus & global time | 6 | 2 | t4/b4 | not started | all domain review; two reviewers (3 lessons each); hardest batch |
| 4 | T4-R2 Retrofit, part 2 (lsm-trees, probabilistic-structures, slos-error-budgets, zero-trust) | 4 | 2 | t4/r2 | not started | domain review: all 4; one reviewer |
| 4 | T4-B9 People & judgement | 3 | 2 | t4/b9 | not started | domain review: hiring-interviewing |
| 4 | K4-3 memModel, K4-6 field + ecc, K4-7 crypto additions, K4-11 rocAuc | — | built during 2 | kit agents | not started | block wave 3 |
| 4 | P-follow-up after wave 2 (merge K4-3, K4-6, K4-7, K4-11; link chaos-engineering to slos-error-budgets) | — | 2→3 | kit owner | not started | wave-end gates as above |
| 4 | T4-B2 Concurrency, cores & proofs | 4 | 3 | t4/b2 | not started | all domain review; two reviewers; simulated memory model |
| 4 | T4-B6 Advanced cryptography | 5 | 3 | t4/b6 | not started | all domain review; payload-free review; two reviewers |
| 4 | T4-B7 ML serving & cloud cost | 4 | 3 | t4/b7 | not started | all domain review; two reviewers |
| 4 | Tier 4 close-out kit round | — | 3→QA | kit owner | not started | last kit round of the curriculum |
| 4 | **Tier 4 sign-off** | 50 | — | | not started | 41 new + 9 existing; whole-curriculum DoD (450 lessons); push only when the tier is finished |
```

Also update §3.3's header lines when pasting: "Validated count: 41, in 9 batches plus 2 retrofit" (it says "~8"), and its "Order within Tier 4" is a build order inside batches, not a wave order (§6.1). Tier 3 and earlier tracker rows are untouched.

### 7.3 Settled, and what remains open

**Settled by the coordinator under the owner's standing decisions** (exhaustive and holistic, tier by tier, push only when a tier is finished):
1. **The nine registered Tier 4 lessons keep their Tier 4 label**, so Tier 4 sign-off = 41 + 9 = 50. (This closes the question carried from tier3-plan §7.3.)
2. **Tier 4 is the end of the curriculum**: no Tier 5. Any new topic after sign-off comes from a gap pass the owner commissions, not from this plan growing.

**Open questions for the owner: none.** Everything else is within the coordinator's remit and decided above: the 9 + 2 batch count, batch composition, wave order (by kit readiness), reviewer counts, the demoted-to-trigger merges, the one soft link, and the kit scope (Vector).

---

## Appendix A. Tier 4 topics whose "visual idea" is hard to animate and needs a manipulable toy

The animation alone teaches nothing here; the learner has to build, break, schedule or search. The spec for each must name the toy and the failing state (AC-0/T3 #23). If a spec author cannot, the topic goes back to the coordinator before it is built.

| Topic | Why animation alone fails | The toy | Where it can fail visibly |
|---|---|---|---|
| `flp-impossibility` (B4) | The proof is an argument about all schedules; a diagram of "the undecided state" is a slideshow. | An **adversarial scheduler game** on a small asynchronous agreement protocol (`core/distSim`, three nodes): the learner picks which message is delivered next and tries to keep the run undecided, with a bivalent/univalent label computed by exhausting the small state space. A second scene lets the learner add a timeout or a coin flip. | The learner keeps the run undecided for N steps ("did not decide within N steps", never "forever"), then adds a timeout or a coin and the same adversary loses. |
| `paxos` (B4) | Ballots and two phases are a table of messages. | A **drivable message scheduler**: the learner delays and reorders Prepare, Promise, Accept and Accepted between proposers and three acceptors, and starts a second proposer to duel. | The learner creates a livelock (two proposers keep raising ballots); the safety check ("no two different values chosen") holds on every schedule and the broken variant (acceptor forgets its promise) violates it on a named seed. |
| `byzantine-faults` (B4) | "3f + 1" is a number; the point is what a liar can do. | **The learner is the traitor**: choose what a faulty general tells each peer. With 3 generals the loyal ones disagree; with 4 the signed or relayed messages make them agree. | The learner makes 3 generals disagree and the lesson shows the exact pair of conflicting messages. |
| `distributed-snapshots` (B4) | A marker spreading through channels is a diagram. | A **snapshot trigger**: the learner chooses when the initiator records and watches markers; a checker says whether the cut is consistent (no message received but not sent). | An uncoordinated "record everyone now" cut that is inconsistent, with the offending message highlighted, against the marker algorithm's consistent one. |
| `hybrid-logical-clocks`, `distributed-sql-truetime` (B4) | Clock pairs and intervals are static labels. | A **message editor** (drag messages between nodes with skewed clocks, watch (wall, counter) update) and a **commit-wait slider** for the uncertainty ε with two transactions racing on two shards. | A transaction visible before an earlier one finished when commit-wait is set to 0; the learner raises ε and the order is restored at a computed latency cost. |
| `memory-ordering-atomics` (B2) | Reordering is invisible in real JavaScript. | A **litmus-test explorer** over a simulated weak-memory model: pick SB or MP, a model (sequentially consistent, store-buffered, relaxed), toggle fences or acquire/release, and the lesson enumerates every outcome the model allows. | The "impossible" outcome appears under the relaxed model and disappears when the learner adds the fence; the screen says "simulated memory model, not your CPU". |
| `lock-free-cas` (B2) | A retry loop is a loop; ABA is a story. | A **schedule editor** for two or three threads CASing a stack head: the learner interleaves steps, then sets up the ABA sequence by popping and re-pushing a node. | ABA corrupts the stack in the model, and a tagged-pointer variant rejects it; both outcomes are computed by the simulation. |
| `numa-multicore` (B2) | Local vs remote is two numbers. | **Pin threads and memory** on a two-socket diagram: the learner places each thread and each page and sees the access mix and mean latency computed. | A first-touch placement by the wrong thread makes most accesses remote; the latency constants are labelled illustrative. |
| `formal-methods` (B2) | State spaces are large and abstract. | A **model checker on a learner-editable tiny spec** (a two-process lock): edit a guard, the checker re-explores and either passes or prints a counterexample trace the learner can replay. | Remove one guard and the invariant breaks; the shortest violating trace is shown. |
| `np-reductions` (B3) | A reduction is a construction; narrating it is a slideshow. | The learner **performs the reduction**: given a 3-SAT formula, they build the vertex-cover (or independent-set) graph gadget by gadget, then toggle an assignment and watch the cover change, or the reverse. | A gadget built wrongly is rejected by the checker with the clause it fails to encode; an unsatisfiable formula has no cover of the target size. |
| `sat-solvers` (B3) | DPLL is a tree you read. | A **DPLL stepper** on a small CNF: the learner picks the branching variable, watches unit propagation cascade and a conflict backtrack, then encodes a tiny package-version problem. | A bad branching choice visibly explodes the tree against the best one, with node counts. |
| `approximation-algorithms`, `local-search-annealing` (B3) | The ratio is a theorem; hill climbing is a metaphor. | **Drag the points** of a metric TSP, with MST-doubling and the optimum (brute force on small n) and a live ratio meter; a landscape with a temperature slider and a 2-opt tour. | A configuration where the ratio gets close to its bound; hill climbing stuck at a local optimum that annealing leaves, measured over seeded runs. |
| `linear-programming` (B3) | The optimum is a vertex; nothing moves. | **Drag the constraint lines** of a 2D feasible region and rotate the objective until it touches a vertex. | An infeasible region and an unbounded objective are both shown and named. |
| `game-theory`, `online-algorithms` (B5) | Equilibria and ratios are definitions. | An **editable payoff matrix** with best-response arrows and a Nash finder; **ski rental with the learner as the adversary**: they choose the day the season ends. | A matrix with no pure Nash, solved by the mixed strategy; the 2x bound approached by the adversary's best day. |
| `zero-knowledge-proofs` (B6) | "I know it and reveal nothing" is a claim. | The **cave game**: the learner is the verifier and challenges a prover; a cheating prover passes a round half the time, so confidence follows 1 − 2⁻ⁿ, and a transcript view shows that a simulator can fake the transcript without the secret. | A cheating prover is caught within a few rounds on a seeded run; the lesson says the toy proves nothing about a real system. |
| `elliptic-curves`, `secret-sharing` (B6) | A group law and a polynomial are invisible. | **Point addition on a tiny curve** the learner steps, then computes kP by hand against a checker; a **polynomial through k points** the learner drags, with k − 1 points leaving many possible secrets. | A scalar the learner picks gives the point at infinity or a repeated order; k − 1 shares reconstruct nothing, counted. |
| `e2ee-forward-secrecy`, `post-quantum-crypto` (B6) | A ratchet is a diagram; lattices are abstract. | A **ratchet** the learner turns message by message, with a "steal the key at message k" control that shows exactly which messages open; a **toy noisy-linear-equations scheme** with a noise slider. | The stolen key opens one message and not the next after a ratchet step; too much noise breaks decryption (labelled toy, not a real parameter set). |
| `llm-serving`, `fine-tuning-quantization` (B7) | Prefill, decode and a KV cache are a pipeline. | A **batch-slot simulator** with a request arrival slider, a KV-cache memory meter, and a rank and bit-width slider with an error meter. | The KV cache fills and requests queue; an over-aggressive bit width degrades the toy's score, computed. |
| `feature-stores-skew` (B7) | Two pipelines, one number. | Offline and online pipelines computing the same feature with a **diff meter**, and a point-in-time join where the learner can leak a future value. | A join that leaks the future inflates the offline metric and collapses online, shown in numbers. |
| `strangler-fig-migrations`, `conways-law`, `build-vs-buy`, `technical-strategy`, `reversible-decisions`, `influence-without-authority`, `hiring-interviewing` (B8, B9) | Non-visual; the lessons are judgement. | Route peeling behind a facade with shadow traffic and rollback; team boxes dragged against a service diagram; a Wardley-style drag grid with a three-year cost chart; a strategy canvas where removing a policy orphans roadmap items; a reversibility-vs-impact grid; a stakeholder map with pre-wiring conversations; an interview-loop funnel and a calibration chart. Real branching uses `ScenarioStory` and `validateScenario`. | A cutover with no rollback path, a team split that makes a service span three owners, a policy removal that orphans items, a stakeholder never pre-wired who opposes in the meeting, a loop with no signal at one stage. |

Everything else in Tier 4 animates naturally (gossip rounds, heartbeats and failure detection, a tour, a trie with failure links, a suffix list sorting, a tree jumping upward, a retry storm that keeps itself alive).
