# Tier 3 · Architect: kickoff plan

Written 2026-10-15 against `main` at `3200660` (Tier 1 and 2 signed off and pushed). This file is the Tier 3 equivalent of `docs/rollout-plan.md` §3.1.1 to §3.1.7 and §3.1.9. It does **not** contain per-topic lesson specs; those are the next phase, written per batch from this plan. `rollout-plan.md` is untouched; the coordinator links this file from §3.2 and corrects the tracker rows listed in §7.

**Method.** Every number below was computed, not typed: the 154 ids, their priorities, their "Builds on" targets and the wave order were checked by script against `docs/curriculum-backlog.md` (lines 388-614, plus the two Tier 4/Tier 2 moves), the 255 registered lessons in `src/lessons/`, and the 156 Tier 2 ids in rollout-plan §3.1.2. The script enforces one rule: a "Builds on" target that is itself a Tier 3 topic must sit in an **earlier wave**, or **earlier in the same batch** (agents in the same wave can't see each other's work). Zero violations at the time of writing. The check was a throwaway script, not committed: redo it if a batch moves.

## Headline numbers

| | Count |
|---|---:|
| Backlog Tier 3 rows (`curriculum-backlog.md` lines 388-614) | 155 |
| Already decided: `namespaces-cgroups` dropped (covered by `containers`), `two-generals` merged into `exactly-once-myth` | −2 |
| Already decided: `leases-fencing` moved up from Tier 4, `wifi-shared-medium` moved up from Tier 2 | +2 |
| New in this pass: `fenwick-trees` merged into `segment-trees` | −1 |
| **Validated new Tier 3 lessons** | **154** |
| Existing Tier 3 lessons (retrofit, §5) | 12 |
| **Tier 3 total when done** | **166** (rollout-plan §4.1 says 167; it is 166 after the Fenwick merge) |
| Build batches | 31 new + 2 retrofit (T3-R1, T3-R2) |
| Waves | 10, plus a kickoff kit round and a kit round after every wave |
| Kit items (§4) | 21, plus 5 tooling tickets |
| Domain-review lessons | 86 of 154 (56%), plus 4 retrofits |
| Priority split | 13 core, 88 important, 53 nice |

| Track | hw | os | lang | math | dsa | net | arch | data | sec | ops | craft | web | ml | lead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| New lessons | 4 | 9 | 12 | 15 | 18 | 9 | 16 | 21 | 12 | 10 | 5 | 5 | 11 | 7 |

(dsa is 18, not 19: the Fenwick merge. Everything else matches rollout-plan §3.2.)

---

## 1. Validation of the Tier 3 backlog

Same rules as Tier 2 (§3.1.1): topics stay unless a registered lesson already teaches them or a sibling topic does; nothing moves down into signed-off Tier 2; "narrowed" means the topic stays and its spec draws an explicit **Out of scope** line against a named lesson. Overlaps were checked against the lessons' `keyIdeas` and Stage code, not their titles.

### 1.1 Drop, merge, move

| Topic | Decision | Reason |
|---|---|---|
| `namespaces-cgroups` | **Dropped** (T2 kickoff, confirmed) | The `containers` Isolation panel already shows both. Any depth left over is owed by `sandboxing-isolation` (T3-B28), whose spec must say so. |
| `two-generals` | **Merged** into `exactly-once-myth` (T2 kickoff, confirmed) | It is the impossibility result behind exactly-once; one lesson, with the lossy-link scene first. |
| `leases-fencing` | **Moved T4 → T3** (T2 kickoff, confirmed) | `job-scheduling` needs it. Both land in T3-B20; `leases-fencing` builds on the already-registered `raft`. |
| `wifi-shared-medium` | **Moved T2 → T3** (T2 kickoff, confirmed) | Nice-priority radio detail with no dependants; joins T3-B26 with routing and congestion control. Keeps its backlog visual (CSMA/CA backoff and collisions). |
| `fenwick-trees` | **Merged** into `segment-trees`; the lesson is titled "Segment Trees & Fenwick Trees" | Same range-query problem, and the Fenwick tree is a one-scene "same answer in a quarter of the memory" comparison. As a lesson of its own it is one screen and a slideshow risk. Nice-priority, so no core coverage lost. |
| Any move up into Tier 2 | **None** | Tier 2 is signed off and pushed. |
| Any move down into Tier 4 | **None** | The expensive-to-animate topics (`halting-problem`, `chomsky-hierarchy`, `lambda-calculus`) stay: they get a manipulable toy, not a demotion (Appendix A). |

### 1.2 The seven overlaps listed in §3.2: confirmed, all kept and narrowed

| Topic | vs. existing lesson | Decision | The line the spec must draw |
|---|---|---|---|
| `graceful-degradation` | `circuit-breakers` (fallbacks, retries, backoff), `backpressure` (load shedding) | **Keep, narrowed** | Owns *what the user sees* when a dependency is gone: hard vs soft dependencies, a stale-cache or static fallback, feature tiers, brownouts. Out of scope: breaker states, retry maths, backoff, shed-lowest-priority-first. |
| `mvcc` | `isolation-levels` (its keyIdea 2 already says readers see a snapshot) | **Keep, narrowed** (already fenced at T2) | Owns version chains, the visibility rule, long transactions pinning old versions, vacuum/cleanup. Out of scope: the anomaly list, level names, write skew; link to `isolation-levels` for those. |
| `merkle-trees` | `git-internals` (content-addressed trees, hash of children) | **Keep, narrowed** | Owns anti-entropy: compare roots, descend only into differing subtrees, inclusion proofs, replica repair. Out of scope: object model, commits, packfiles. |
| `logical-clocks` | `crdts` (per-replica counters, merge by max) | **Keep, narrowed** | Owns happens-before, Lamport and vector clocks, detecting concurrency. Out of scope: merge semantics and convergence (that is `crdts`). Hybrid clocks stay T4. |
| `tail-latency` | `load-balancing` (p99 shown), `observability` (percentiles), T3 `percentiles-statistics` | **Keep, narrowed** | Owns fan-out amplification (1 − 0.99ⁿ), hedged and backup requests, queueing as the cause. Out of scope: how a percentile is computed or sampled (`percentiles-statistics`), coordinated omission (`benchmarking-methodology`), balancing algorithms. |
| `alerting-design` | `slos-error-budgets` (burn-rate alerting already taught) | **Keep, narrowed; merge trigger recorded** | Owns symptom vs cause, paging vs ticketing, routing, alert fatigue, runbooks. Out of scope: burn-rate maths. If the spec author can't name a second manipulable beyond a threshold slider, the topic merges into `incident-response` at spec time rather than shipping thin. |
| `backups-disaster-recovery` | `multi-region` (defines RPO/RTO, failover) | **Keep, narrowed** | Owns backups: snapshots vs point-in-time recovery from the log, restore testing ("an untested backup is a hope"), immutability, the 3-2-1 idea, DR drills. Out of scope: RPO/RTO definitions and failover topology. Builds on `write-ahead-log` (same batch, earlier). |

### 1.3 Other overlaps found (all kept, narrowed)

| Topic | Against | Line |
|---|---|---|
| `consistency-models` | `isolation-levels`, `cap-theorem` | System-level models only (linearizable, sequential, causal, eventual) with a history checker. Transaction anomalies stay in `isolation-levels`; the partition trade-off stays in `cap-theorem`. |
| `quorums` | `replication`, `consistency-models` | R + W > N and sloppy quorums; leader-based replication stays in `replication`. |
| `exactly-once-myth` | `idempotency-keys`, `message-queues`, `poison-messages-dlq` | The impossibility and the "at-least-once plus idempotent consumer" resolution. The key mechanics stay in `idempotency-keys`. |
| `transactional-outbox` | `distributed-transactions` (sagas, 2PC), `event-sourcing` | The dual-write bug and the outbox fix only; the relay is `change-data-capture` (built one wave earlier, so it can be linked). |
| `hot-keys-skew` | `sharding`, `consistent-hashing` | Skew and its mitigations (salting, splitting, caching); how sharding places keys stays out. |
| `buffer-pool` | `lru-cache`, T3 `mmap-page-cache` | Database-managed pages: pin counts, dirty pages, clock sweep, scan resistance. OS page cache, readahead and `mmap` faults belong to `mmap-page-cache`, which is built after it and may link back. |
| `service-discovery-mesh` | `load-balancing`, `reverse-proxy-gateway`, `kubernetes-basics` | Registry, health, sidecar proxies, mTLS at the mesh. Balancing algorithms and edge gateways stay out. |
| `safe-config-rollout` | `feature-flags`, `deployment-strategies` | Treating config as code that ships: staged rollout, blast radius, validation, rollback. Flag evaluation and canary mechanics stay out. |
| `zero-downtime-migrations` | `deployment-strategies`, T3 `schema-evolution` | DDL expand/contract against live traffic; wire-format compatibility is `schema-evolution`. |
| `ddos-mitigation` | `rate-limiting`, `resource-exhaustion` | Volumetric vs application-layer, absorbing vs filtering. Token buckets stay in `rate-limiting`. Payload-free, simulated victim only. |
| `numeric-precision` | `floating-point` | Cancellation, summation error, accumulation. The format itself stays in `floating-point`. |
| `randomized-algorithms` | `quickselect` (random pivot), `probabilistic-structures` | Las Vegas vs Monte Carlo; reuses `core/numberTheory` Miller-Rabin as the Monte Carlo example. |
| `sandboxing-isolation` | `containers`, `syscalls-kernel-mode` | Owns the namespaces/cgroups/seccomp depth that `namespaces-cgroups` would have taught. |
| `dp-patterns` | `dynamic-programming` | Knapsack, LIS, intervals, bitmask as a pattern catalogue; memo vs table basics stay out. |
| `design-docs-rfcs` | `technical-writing`, `architecture-diagrams-c4` | The decision document (options, trade-offs, ADR), not sentence-level writing or diagrams. Now lists `technical-writing` as a prerequisite. |

### 1.4 The Tier 2 fences, respected

All 33 fenced topics in §3.2 stay in Tier 3 and keep the line Tier 2 drew: `branch-prediction`, `cache-coherence`, `page-tables-tlb`, `io-models`, `fork-copy-on-write`, `parsing-algorithms`, `regex-engines`, `bytecode-vms`, `ownership-refcounting`, `undefined-behavior`, `modular-exponentiation`, `kmp`, `cache-stampede`, `api-versioning`, `schema-evolution`, `quic`, `congestion-control`, `cloud-networking-vpc`, `materialized-views-denormalization`, `mvcc`, `query-planning`, `join-algorithms`, `envelope-encryption-kms`, `authz-models`, `vector-search`, `property-based-testing`, `technical-debt`, `design-docs-rfcs`, `gitops`, `hypothesis-testing-ab`, `gpu-rendering-pipeline`, `3d-transforms-projection`, `offline-first-sync`. Each Tier 3 spec opens by quoting the Tier 2 lesson's own **Out of scope** line (the Tier 2 specs are in rollout-plan §3.1.8) and starts exactly where it stops. `rasterization` (T2, 2D triangles) is the base for `gpu-rendering-pipeline`.

### 1.5 "Builds on" targets: checked

Every target must exist as a registered lesson (any tier) or be a Tier 3 topic in an earlier slot. Found and fixed:

| Problem | Where | Fix |
|---|---|---|
| Target is an unbuilt Tier 4 topic | `tokenization-bpe` → `llm-serving` | Builds on `attention-transformers` instead (it is also what §3.2's ML order says). |
| Target is an unbuilt Tier 4 topic | `prioritization` → `technical-strategy` | Builds on `estimation`. |
| Target was dropped | `sandboxing-isolation` → `namespaces-cgroups` | Builds on `containers`. |
| Target was dropped in T2 (covered by `ip-ports`) | `nat-traversal-webrtc` → `nat` | Builds on `ip-ports`. |
| Backwards in §3.2's own order | `physical-clocks-skew` → `logical-clocks` | Reversed: physical first, then `logical-clocks` builds on it. |
| Target now merged | `fenwick-trees` references | Merged into `segment-trees`. |
| Cross-tier edge to a registered **Tier 4** lesson | 9 edges, see below | Allowed (the target exists and is built, AC-0/T2 #13), but flagged as an open question. |
| Cross-tier edge that was avoidable | `skip-lists` → `lsm-trees`, `ropes-gap-buffers` → `crdts` | Re-pointed to `trees-bst` and `arrays-linked-lists`; the T4 lesson can still be named in words. |
| Dependency implied but not listed | about two dozen topics | Added (e.g. `consistency-models` also builds on `logical-clocks` and `isolation-levels`; `chomsky-hierarchy` on `turing-machines`; `transactional-outbox` on `change-data-capture`). All in §2. |

**Tier 3 → registered Tier 4 edges that remain (9):** `queueing-theory` → `backpressure`, `logical-clocks` → `crdts`, `alerting-design` → `slos-error-budgets`, `count-min-heavy-hitters` → `probabilistic-structures`, `randomized-algorithms` → `probabilistic-structures`, `backups-disaster-recovery` → `multi-region`, `leases-fencing` → `raft`, `transactional-outbox` → `distributed-transactions`, `offline-first-sync` → `crdts`. A learner on the Tier 3 filter will be sent to a card labelled Tier 4. Recommendation and the question for the owner are in §7.

**Result:** 154 lessons, 0 drops beyond the three already decided, 1 new merge, 0 moves, 7 of 7 listed overlaps kept (all narrowed), 4 broken "Builds on" targets and 1 order inversion fixed.

---

## 2. Tier 3 final list: 154 topics

Titles and taglines are the backlog's, verbatim, except `segment-trees` (merged title). K3-T1 registers them exactly so, grouped by track, minutes unset. The 12 existing Tier 3 lessons stay as registered. **Priority** is the backlog's. **D** marks **[domain review]**: a second-reviewer read of the model and its tests *before the batch is accepted*, for lessons where an error would teach a wrong fact about a real system, standard, protocol or piece of maths. **Builds on** is the corrected prerequisite list (§1.5); a target that is a Tier 3 topic always sits in an earlier wave or earlier in the same batch. **Batch** is the T3-B number from §6, so the table is also the build order index. Within a batch, build core, then important, then nice, except where a dependency inside the batch says otherwise.

| id | Title | Track | Priority | Domain | Builds on | Batch |
|---|---|---|---|---|---|---|
| `dma-io-devices` | I/O Devices, DMA & Memory-Mapped I/O | hw | nice | **D** | `interrupts-context-switch` | B16 |
| `simd-gpu-parallelism` | SIMD & GPU Parallelism | hw | important |  |  | B21 |
| `branch-prediction` | Branch Prediction & Speculative Execution | hw | important | **D** | `cpu-pipelining` | B23 |
| `cache-coherence` | Cache Coherence (MESI) & False Sharing | hw | important | **D** | `race-conditions` | B23 |
| `io-models` | Blocking, Non-Blocking & Async I/O | os | important | **D** | `event-loop` | B16 |
| `fork-copy-on-write` | fork, exec & Copy-on-Write | os | nice | **D** | `virtual-memory-paging` | B16 |
| `mmap-page-cache` | mmap & the Page Cache | os | important | **D** | `virtual-memory-paging`, `buffer-pool`, `file-systems` | B16 |
| `concurrency-models` | Concurrency Models: Threads, Async, Actors & CSP | os | important |  | `event-loop` | B21 |
| `thread-pools-work-stealing` | Thread Pools, Fork-Join & Work Stealing | os | important |  | `concurrency-models` | B21 |
| `parallel-patterns` | Parallel Patterns: Map, Reduce & Scan | os | nice |  | `simd-gpu-parallelism` | B21 |
| `priority-inversion` | Priority Inversion | os | nice | **D** | `cpu-scheduling` | B21 |
| `page-tables-tlb` | Page Tables & the TLB | os | important | **D** | `virtual-memory-paging` | B23 |
| `memory-allocators` | Memory Allocators & Fragmentation | os | nice |  | `stack-vs-heap` | B23 |
| `turing-machines` | Turing Machines | lang | important |  |  | B8 |
| `halting-problem` | The Halting Problem & Undecidability | lang | important | **D** | `turing-machines` | B8 |
| `lambda-calculus` | Lambda Calculus | lang | nice | **D** | `functional-programming` | B8 |
| `bytecode-vms` | Bytecode & Stack-Based VMs | lang | nice |  | `interpreters-compilers-jit` | B8 |
| `compiler-optimisations` | Compiler Optimisations & SSA | lang | nice | **D** | `interpreters-compilers-jit`, `bytecode-vms` | B22 |
| `undefined-behavior` | Undefined Behavior | lang | nice | **D** | `memory-safety-bugs` | B22 |
| `ownership-refcounting` | Reference Counting & Ownership | lang | important |  | `garbage-collection` | B22 |
| `regex-engines` | How Regex Engines Work | lang | important |  | `dfa-nfa` | B24 |
| `parsing-algorithms` | Top-Down vs Bottom-Up Parsing (LL & LR) | lang | nice |  | `parsing-ast` | B24 |
| `pushdown-automata` | Pushdown Automata | lang | nice |  | `stack-queue` | B24 |
| `chomsky-hierarchy` | The Chomsky Hierarchy & Pumping Lemma | lang | nice | **D** | `dfa-nfa`, `pushdown-automata`, `turing-machines` | B24 |
| `metaprogramming-macros` | Metaprogramming, Reflection & Macros | lang | nice |  | `parsing-ast` | B24 |
| `distributions` | Distributions: Normal, Poisson & Long Tails | math | important | **D** | `observability` | B1 |
| `percentiles-statistics` | Percentiles, Sampling & Confidence Intervals | math | important | **D** | `distributions`, `observability` | B1 |
| `queueing-theory` | Queueing Theory & Little's Law | math | core | **D** | `distributions`, `backpressure` | B1 |
| `hypothesis-testing-ab` | Hypothesis Testing & A/B Experiments | math | important | **D** | `conditional-bayes`, `distributions` | B1 |
| `graph-coloring` | Graph Coloring & Scheduling | math | nice |  | `graph-representations` | B9 |
| `entropy-information` | Entropy & Information Theory | math | important | **D** |  | B10 |
| `lz-compression` | Dictionary Compression (LZ77 & DEFLATE) | math | nice |  | `huffman-coding`, `entropy-information` | B10 |
| `markov-chains` | Markov Chains | math | nice | **D** |  | B10 |
| `eigen-pagerank` | Eigenvectors & PageRank | math | nice | **D** | `matrices-transformations`, `markov-chains` | B10 |
| `svd-pca` | SVD & Dimensionality Reduction | math | nice | **D** | `eigen-pagerank` | B10 |
| `modular-exponentiation` | Fast Modular Exponentiation | math | nice |  | `modular-arithmetic` | B19 |
| `chinese-remainder` | The Chinese Remainder Theorem | math | nice |  | `modular-arithmetic` | B19 |
| `numeric-precision` | Numerical Error & Precision Pitfalls | math | nice | **D** | `floating-point` | B22 |
| `fourier-transform` | The Fourier Transform & FFT | math | nice | **D** |  | B27 |
| `lossy-compression` | Lossy Compression (DCT & JPEG) | math | nice | **D** | `fourier-transform` | B27 |
| `shortest-paths-advanced` | Bellman-Ford & Floyd-Warshall | dsa | important |  | `graph-search` | B9 |
| `strongly-connected-components` | Strongly Connected Components | dsa | important |  | `graph-search` | B9 |
| `network-flow` | Max Flow & Min Cut | dsa | important |  |  | B9 |
| `bipartite-matching` | Bipartite Matching | dsa | nice |  | `network-flow` | B9 |
| `count-min-heavy-hitters` | Count-Min Sketch & Heavy Hitters | dsa | important | **D** | `probabilistic-structures`, `kafka-partitioned-log` | B11 |
| `avl-trees` | Self-Balancing Trees & Rotations (AVL) | dsa | important |  | `trees-bst` | B12 |
| `red-black-trees` | Red-Black Trees | dsa | nice |  | `avl-trees` | B12 |
| `skip-lists` | Skip Lists | dsa | important |  | `trees-bst`, `arrays-linked-lists` | B12 |
| `segment-trees` | Segment Trees & Fenwick Trees | dsa | nice |  | `prefix-sums` | B12 |
| `persistent-data-structures` | Persistent & Immutable Data Structures | dsa | important |  | `git-internals` | B12 |
| `kmp` | KMP String Matching | dsa | nice |  | `rolling-hash` | B15 |
| `convex-hull` | Convex Hull & Orientation Tests | dsa | nice |  |  | B15 |
| `sweep-line` | Sweep Line & Interval Problems | dsa | nice |  | `greedy-algorithms` | B15 |
| `spatial-indexes` | Spatial Indexes (k-d Trees, Quadtrees, Geohash) | dsa | important |  | `db-indexes` | B15 |
| `ropes-gap-buffers` | Ropes & Gap Buffers | dsa | nice |  | `arrays-linked-lists` | B15 |
| `dp-patterns` | Classic DP Patterns (Knapsack, LIS, Intervals, Bitmask) | dsa | important |  | `dynamic-programming` | B19 |
| `randomized-algorithms` | Randomized Algorithms (Las Vegas vs Monte Carlo) | dsa | important |  | `probabilistic-structures` | B19 |
| `game-tree-search` | Minimax & Alpha-Beta Pruning | dsa | nice |  | `backtracking` | B19 |
| `routing-algorithms` | Routing: Distance Vector vs Link State | net | important | **D** | `graph-search` | B26 |
| `bgp` | BGP & Internet Routing | net | important | **D** | `routing-algorithms`, `cdn-edge` | B26 |
| `wifi-shared-medium` | Wi-Fi & Shared Media | net | nice | **D** | `ethernet-arp` | B26 |
| `congestion-control` | TCP Congestion Control | net | important | **D** | `tcp-udp` | B26 |
| `quic` | QUIC & 0-RTT | net | nice | **D** | `tls-handshake` | B26 |
| `cloud-networking-vpc` | Cloud Networking: VPCs, Subnets & Security Groups | net | important | **D** | `subnetting-cidr` | B30 |
| `vpns-tunneling` | VPNs & Tunneling (IPsec, WireGuard) | net | important | **D** | `cloud-networking-vpc` | B30 |
| `nat-traversal-webrtc` | NAT Traversal & Peer-to-Peer (STUN, TURN, WebRTC) | net | nice | **D** | `ip-ports` | B30 |
| `adaptive-streaming` | Video Streaming & Adaptive Bitrate | net | nice |  | `cdn-edge`, `http-versions` | B30 |
| `back-of-envelope` | Back-of-the-Envelope Capacity Math | arch | core | **D** | `memory-hierarchy` | B1 |
| `api-versioning` | API Versioning & Backward Compatibility | arch | important |  | `schema-evolution`, `rest-api-design` | B3 |
| `domain-driven-design` | Bounded Contexts & Domain-Driven Design | arch | important |  | `monolith-microservices` | B3 |
| `double-entry-ledgers` | Money, Ledgers & Double-Entry Bookkeeping | arch | important | **D** | `floating-point` | B3 |
| `physical-clocks-skew` | Physical Clocks, NTP & Clock Skew | arch | important | **D** | `time-and-timezones` | B4 |
| `logical-clocks` | Lamport & Vector Clocks | arch | important | **D** | `physical-clocks-skew`, `crdts` | B4 |
| `consistency-models` | Linearizability vs Serializability vs Eventual | arch | core | **D** | `cap-theorem`, `logical-clocks`, `isolation-levels` | B4 |
| `exactly-once-myth` | The Exactly-Once Delivery Myth | arch | core | **D** | `message-queues`, `idempotency-keys` | B4 |
| `leases-fencing` | Leases, Distributed Locks & Fencing Tokens | arch | important | **D** | `raft`, `timeouts-deadlines` | B20 |
| `job-scheduling` | Background Jobs, Delayed Queues & Distributed Cron | arch | important | **D** | `leases-fencing` | B20 |
| `transactional-outbox` | Transactional Outbox & Dual Writes | arch | important | **D** | `distributed-transactions`, `change-data-capture` | B20 |
| `fanout-feeds` | Fan-out on Write vs Read (News Feeds) | arch | important |  | `message-queues` | B20 |
| `graceful-degradation` | Graceful Degradation & Fallbacks | arch | important |  | `circuit-breakers` | B29 |
| `cache-stampede` | Cache Stampede & Thundering Herd | arch | important |  | `caching-patterns` | B29 |
| `multi-tenancy` | Multi-Tenancy & Noisy Neighbours | arch | important |  | `sharding` | B29 |
| `service-discovery-mesh` | Service Discovery & Service Meshes | arch | important | **D** | `load-balancing` | B29 |
| `schema-evolution` | Schema Evolution & Serialization Compatibility | data | important | **D** | `grpc-protobuf` | B3 |
| `quorums` | Quorums: R + W > N | data | core | **D** | `replication`, `consistency-models` | B4 |
| `query-planning` | Query Planning & EXPLAIN | data | core | **D** | `db-indexes` | B7 |
| `join-algorithms` | Join Algorithms: Nested Loop, Hash, Merge | data | important |  | `query-planning` | B7 |
| `mvcc` | MVCC: Multi-Version Concurrency Control | data | important | **D** | `isolation-levels` | B7 |
| `buffer-pool` | Buffer Pools & Database Page Management | data | nice |  | `lru-cache`, `memory-hierarchy` | B7 |
| `materialized-views-denormalization` | Denormalization & Materialized Views | data | important |  | `normalization` | B7 |
| `kafka-partitioned-log` | Partitioned Logs: Kafka Internals | data | core | **D** | `message-queues` | B11 |
| `stream-windowing` | Stream Processing: Windows & Watermarks | data | important | **D** | `message-queues`, `kafka-partitioned-log` | B11 |
| `inverted-index` | Search Engines & Inverted Indexes | data | important |  | `hash-table` | B11 |
| `vector-search` | Vector Search & ANN Indexes | data | important | **D** | `vectors-similarity` | B11 |
| `columnar-storage` | Columnar Storage | data | important |  |  | B14 |
| `warehouse-lake-lakehouse` | Data Warehouses, Lakes & Lakehouses | data | important |  | `columnar-storage` | B14 |
| `etl-orchestration` | ETL vs ELT & Pipeline Orchestration | data | nice |  | `warehouse-lake-lakehouse` | B14 |
| `time-series-data` | Time-Series Data & Downsampling | data | nice |  | `columnar-storage` | B14 |
| `mapreduce-batch` | Batch Processing & MapReduce | data | important |  |  | B14 |
| `write-ahead-log` | Write-Ahead Logging & Crash Recovery | data | core | **D** | `transactions-acid` | B17 |
| `change-data-capture` | Change Data Capture | data | important | **D** | `write-ahead-log` | B17 |
| `zero-downtime-migrations` | Zero-Downtime Schema Migrations (Expand/Contract) | data | core | **D** | `transactions-acid` | B17 |
| `merkle-trees` | Merkle Trees & Anti-Entropy | data | important | **D** | `git-internals` | B17 |
| `hot-keys-skew` | Hot Keys & Data Skew | data | important |  | `sharding` | B20 |
| `timing-side-channels` | Timing & Side-Channel Attacks | sec | important | **D** | `branch-prediction`, `cache-coherence` | B23 |
| `threat-modeling` | Threat Modelling (STRIDE) | sec | core |  |  | B25 |
| `authz-models` | Authorization Models: RBAC, ABAC & ReBAC | sec | important | **D** | `oauth-flows` | B25 |
| `ssrf-access-control` | SSRF & Broken Access Control | sec | important | **D** | `authz-models`, `http-basics` | B25 |
| `envelope-encryption-kms` | Encryption at Rest & Envelope Encryption (KMS) | sec | important | **D** | `symmetric-ciphers` | B25 |
| `randomness-csprng` | Randomness & CSPRNGs | sec | important | **D** |  | B25 |
| `fuzzing` | Fuzzing | sec | important | **D** | `property-based-testing` | B28 |
| `redos` | Catastrophic Backtracking (ReDoS) | sec | important | **D** | `regex-engines` | B28 |
| `sandboxing-isolation` | Sandboxing & Process Isolation | sec | nice | **D** | `containers` | B28 |
| `supply-chain-security` | Software Supply-Chain Security | sec | important | **D** | `dependency-management` | B28 |
| `privacy-engineering` | Privacy Engineering & Data Protection | sec | important | **D** |  | B28 |
| `ddos-mitigation` | DDoS Attacks & Mitigation | sec | important | **D** | `rate-limiting` | B29 |
| `tail-latency` | Tail Latency at Scale | ops | core | **D** | `percentiles-statistics`, `load-balancing` | B5 |
| `capacity-planning` | Load Testing & Capacity Planning | ops | important | **D** | `queueing-theory`, `profiling-flame-graphs` | B5 |
| `autoscaling` | Autoscaling: Horizontal, Vertical & Predictive | ops | important |  | `load-balancing` | B5 |
| `dora-metrics` | DORA Metrics & Delivery Performance | ops | nice | **D** | `ci-pipelines` | B5 |
| `incident-response` | Incident Response & On-Call | ops | core |  | `observability` | B6 |
| `postmortems` | Blameless Postmortems & Contributing Factors | ops | important |  | `incident-response` | B6 |
| `alerting-design` | Alerting: Symptoms vs Causes & Alert Fatigue | ops | important |  | `slos-error-budgets` | B6 |
| `safe-config-rollout` | Config Changes as Deployments | ops | important |  | `feature-flags` | B6 |
| `gitops` | GitOps & Reconciliation Loops | ops | nice |  | `infrastructure-as-code` | B6 |
| `backups-disaster-recovery` | Backups, Disaster Recovery, RPO & RTO | ops | important | **D** | `replication`, `write-ahead-log`, `multi-region` | B17 |
| `property-based-testing` | Property-Based Testing & Shrinking | craft | nice |  | `induction-invariants` | B2 |
| `coverage-mutation-testing` | Code Coverage vs Mutation Testing | craft | nice |  |  | B2 |
| `monorepo-polyrepo` | Monorepo vs Polyrepo | craft | important |  | `dependency-management` | B2 |
| `contract-testing` | Consumer-Driven Contract Testing | craft | nice |  | `api-versioning` | B3 |
| `benchmarking-methodology` | Benchmarking & Performance Measurement Pitfalls | craft | important | **D** | `profiling-flame-graphs` | B5 |
| `webassembly` | WebAssembly | web | nice | **D** | `bytecode-vms` | B8 |
| `3d-transforms-projection` | 3D Transforms, Cameras & Projection | web | nice |  | `matrices-transformations` | B27 |
| `gpu-rendering-pipeline` | The GPU Rendering Pipeline & Shaders | web | nice | **D** | `simd-gpu-parallelism` | B27 |
| `ray-tracing` | Ray Tracing & Lighting | web | nice |  | `gpu-rendering-pipeline` | B27 |
| `offline-first-sync` | Offline-First Clients & Sync | web | nice | **D** | `crdts` | B30 |
| `neural-networks-backprop` | Neural Networks & Backpropagation | ml | important | **D** | `gradient-descent` | B13 |
| `cnns-convolution` | Convolutional Neural Networks | ml | nice | **D** | `neural-networks-backprop` | B13 |
| `attention-transformers` | Attention & Transformers | ml | important | **D** | `neural-networks-backprop` | B13 |
| `tokenization-bpe` | Tokenization & BPE | ml | important | **D** | `attention-transformers` | B13 |
| `training-vs-inference` | Training vs Inference Serving | ml | important | **D** |  | B13 |
| `rag-pipelines` | Retrieval-Augmented Generation | ml | important | **D** | `vector-search` | B18 |
| `llm-agents-tool-use` | LLM Agents & Tool Use | ml | important | **D** | `rag-pipelines` | B18 |
| `model-evals-drift` | Model Evals, Monitoring & Drift | ml | important | **D** | `observability`, `classification-metrics` | B18 |
| `recommender-systems` | Recommender Systems & Collaborative Filtering | ml | nice | **D** | `embeddings`, `svd-pca` | B18 |
| `reinforcement-learning` | Reinforcement Learning Basics | ml | nice | **D** | `markov-chains`, `neural-networks-backprop` | B18 |
| `ml-fairness-bias` | Bias & Fairness in ML Systems | ml | important | **D** | `classification-metrics`, `model-evals-drift` | B31 |
| `design-docs-rfcs` | Design Docs, RFCs & ADRs | lead | core |  | `technical-writing` | B2 |
| `technical-debt` | Managing Technical Debt | lead | important |  | `refactoring-code-smells` | B2 |
| `estimation` | Software Estimation & the Cone of Uncertainty | lead | important | **D** | `distributions` | B31 |
| `mentoring-delegation` | Mentoring & Delegation | lead | nice |  |  | B31 |
| `project-planning-critical-path` | Project Planning & the Critical Path | lead | important |  | `estimation`, `topological-sort` | B31 |
| `prioritization` | Prioritization & Cost of Delay | lead | important | **D** | `estimation` | B31 |
| `product-thinking` | Product Thinking for Engineers | lead | important |  | `hypothesis-testing-ab` | B31 |

**Validated count: 154** (13 core, 88 important, 53 nice; 86 flagged **D**).

---

## 3. AC-0/T3: what every Tier 3 lesson adds on top of AC-0 and AC-0/T2

AC-0 (§1.4) and **AC-0/T2 rules 1-13 (§3.1.3) apply in full**, to new lessons and to the retrofits. Cite them by number in reviews: **1** verdicts computed from state, **2** captions true in every combination, **3** every number from the model, **4** "checked against X" true for every typed input, **5** hostile input defined, **6** quiz rules, **7** colour table, **8** honesty on screen, **9** payload-free security, **10** phones and every frame, **11** keyboard and assistive tech, **12** domain review, **13** links only to lessons that exist or are in an earlier wave. Two clarifications for Tier 3: rule 13 now also forbids linking a lesson in the **same wave but another batch**, and rule 12's second reviewer reads the flagged lessons of a batch before the batch merges, with two reviewers in any wave carrying 10 or more flagged lessons, retrofits included (waves 1, 2, 6, 7, 8).

Tier 3 adds the rules below. Each names the Tier 2 finding class it prevents (`docs/qa-tier2-report.md`, the wave 1-10 review files and the batch brief's "lessons learned"). Every Tier 2 wave from 4 onwards produced MAJOR findings after green gates; these classes account for nearly all of them. K3-T2 automates what can be automated.

14. **Captions and sub-labels state what the numbers show.** A comparative or magnitude word ("close to", "about", "% less", "faster", "stale") is computed from the same function that fills the stat next to it, and a test pins the sentence at several settings, including the slider extremes. A sub-label that states a fact ("rsp aligned", "exact chance 100%") is derived from current state, or it says something true at every step. *(wave 4-10 reviews: "close to the 0.8 the page shows as 2", "% less contradicts the ms beside it", "rsp mod 16 contradicts the step just run", "expires at null s: stale for -6 s".)*
15. **Absolutes about real systems are scoped or hedged.** "never", "always", "every", "all", "only", "must", "guaranteed", "most", "typical" in a caption, key idea, tip or quiz `why` are either true in the lesson's own model (and a test says so) or scoped: "in this model", "by default in current Chrome", "unless the compiler can see the callee". Prefer "many providers…" to "most providers…". Standards and conventions are labelled as such, and credit goes to the right document. K3-T2 flags unscoped absolutes in `keyIdeas` and quiz `why`; an `allow-absolute: <reason>` marker exempts a line. *(gcc rcx across calls, `s-maxage` and proxies, "modern browsers default to Lax", "every provider shares deny-wins", "a leaf never sets up a frame".)*
16. **Every try-this works from the default state, as written, in the order written.** The builder runs each one literally from a fresh load, not after the previous try-this; if a step depends on an earlier one, the text says "first reset". Each try-this is pinned by a test at the real default state, named `try-this N: …`, and K3-T2 checks there is one test per try-this. If the default can't show the point, change the default or the wording. *(failed in waves 4, 7, 8 and 9: flaky-tests #2 and #5, the checkout caption, Redrive.)*
17. **Hidden controls must not feed numbers, and statuses must not outlive their premise.** A control rendered in only one scene or mode is pinned to a constant in the other scenes, or always shown. A test sets each hidden control to its extremes and asserts the other scenes' outputs don't change. A pill, caption or stat that says "ok", "running", "passed" is derived from current state and tested on the failure path. *(Fail-part slider, NoSQL wide-column columns, the green signature for a kernel that isn't there, handler lit after SIGKILL.)*
18. **Comparisons count the same thing, and the pictures obey the numbers.** When a table or chart compares designs, the unit is defined once and applied to every row; a straw man is labelled "the usual naive version" or given its fair version. Never draw more than the model allows (a clamp block bigger than the window). Order of operations on screen follows the real order if the caption claims it. *(pushdown "17 vs 8" including join reordering, the GROUP BY animation running SELECT before HAVING, layered ≠ coupled to storage.)*
19. **Tests prove the claim; they never restate the implementation or lock a bug in.** Reference solutions are independent (brute force, a published vector, an analytic formula, real `RegExp`, real SQLite via `node:sqlite`, hand-worked cases). Before asserting a computed value, ask whether the assertion would fail if the claim were false; where the answer isn't obvious, add a **broken variant** the test must reject. A test whose name states a claim the code doesn't make is a defect. *(tautological fixtures, tests that dodge the failing input, a test pinning dead code.)*
20. **Distributed and concurrent algorithms are tested as invariants over seeded fault schedules, not by screenshots.** Built on the K3-8 harness: for every lesson that simulates nodes, messages, clocks or transactions, a test runs N ≥ 200 seeds with injected delay, loss, duplication, partition, crash and clock skew, and asserts the **safety** property (no two leaders, no lost acknowledged write, linearizable history, at-most-one fence holder) at **every step**, with liveness stated separately and never implied. The lesson's **"broken" mode must actually violate the invariant on at least one seed**, and a test says which; a scripted failure that the model doesn't produce is a staged lie (rule 8). The counterexample seed and trace are shown on screen when a violation occurs.
21. **Simulated, illustrative, scripted, toy, from memory and real are labelled at the moment they matter**, with the shared `Provenance` chip (K3-7), not a footnote. A seeded sim shows its seed. Output of tools or services the lesson did not run ("what `EXPLAIN` prints on Postgres", an AWS console screen, a BGP session, a vendor's rate limit) is chipped **from memory** or **shown, not run**. Real means real: `crypto.subtle`, real `RegExp`, real JS, real SQLite, real React. Quoted RFC and section numbers are included only where the author is certain; otherwise name the topic ("the TCP congestion-control RFC") and hedge.
22. **Statistics and ML are computed, never drawn.** Every plotted curve, interval, boundary, loss and attention weight comes from real code in the lesson model or `core/` on seeded data, with a unit test. Claims about intervals and p-values are verified by Monte Carlo in the test (a 95% interval covers about 95% of 10,000 seeded runs, within a stated tolerance). Toy models are labelled toys, and no lesson implies a toy model understands anything. Real-world numbers (cloud latencies, prices, DORA bands, benchmark scores) are named constants labelled "illustrative" or "from memory, check the source".
23. **Theory lessons need a manipulable object and a way to fail.** The spec names what the learner builds or breaks (a machine, a grammar, a diagonal table, a proof step) and the state where they get it wrong and the lesson says so. A reviewer who can finish the lesson by pressing Next sends it back. A halting-style tool says "did not halt within N steps", never "runs forever". See Appendix A.
24. **Non-technical (lead) lessons separate opinion from evidence.** Every claim is labelled one of: **standard**, **research finding** (named, hedged, from memory), **common practice**, or **one view**. Invented case studies and dialogues say "invented" on screen. No real person, company or incident is attributed unless the author is certain and says so. Decision simulators show the trade-off of every option, including the option the lesson doesn't recommend, and the learner can reach every ending. *(B32: invented history labelled, contested licence verdicts, chip order.)*
25. **Shared code first, and the kit is checked before writing.** Before a batch writes a new component, helper or hook, it greps `docs/shared-api.md`, `src/components/` and `src/core/`, and the batch report opens with "Kit used" and "Kit missing" lists. A local piece that a second lesson in the **tier** needs becomes a Phase 2 request at once, never a copy; two lessons in the **same batch** that need the same missing piece mean the batch stops and asks for the kit round, as it must not carry two copies (batches never edit shared code). Before a lesson names a registered **Tier 4** lesson (the nine edges in §1.5), the builder reads that lesson's claim on the point; a mismatch becomes a ticket for the Tier 4 retrofit, not a silent contradiction.
26. **Every scene, at its first, middle and last frame, at 390 and 768, is looked at, and the report lists which were.** Smoke and `captions` only walk the default scene (a standing wave 2-10 finding), so non-default scenes get driven shots (`shot --click/--press/--settle`) and unit-tested captions. This restates rule 10 with a deliverable: the batch report has a scene × frame × width checklist, and "not checked" is stated plainly. Sideways scrollers keep their hint out of the content (K-4 in Tier 2, still binding).

Reviewers cite these as "AC-0/T3 #n".

---

## 4. Shared-kit prerequisites

Same discipline as §3.1.4: every item has **at least two Tier 3 users** (often more, and often a Tier 2 source it is extracted from), the API is minimal and grows only on a real second need, extractions migrate their Tier 2 callers pixel-identically (`smoke --frames` + `diff`), every item updates `docs/shared-api.md` and the `#/dev/kit` showcase, and **batches never edit shared code**: misfits go into the batch report as Phase 2 requests. A piece whose second user hasn't shown up by its stated wave is folded back into its one lesson at the next kit round, not kept "in case".

What is already built and must be **reused, not rebuilt**: `Plot2D` (`Bars`, `barsFromHistogram`, `Curve`, `Heat`, `VLine`, `Points`, `PointerLayer`), `core/stats` (`histogram`, `binomialPmf`, `runningStats`), `core/sim` (`mean`, `percentile`), `core/random` (`mulberry32`), `useSimulation`, `GanttLanes` (`progress`, `motionId`, `labelMinPx`), `SequenceDiagram` (lost messages, broadcast), `GraphView`, `CellGrid`, `core/automata` (DFA/NFA), `core/vec`, `core/fit`, `core/numberTheory`, `core/testing` (`expectCaption`, `tscErrors`, `node.ts`).

**Gating.** **P0-a** (K3-1 to K3-7) blocks wave 1. **P0-b** (K3-8 to K3-14) blocks wave 2; wave 1 may start once P0-a lands, because no wave 1 lesson uses a P0-b piece. The later items are built in the kit round named in the Gate column and block the wave named.

| # | Piece | Location | Tier 3 users | Minimal API | Gate |
|---|---|---|---|---|---|
| K3-1 | **Distributions kit**: samplers and densities, plus `Plot2D` layers | `src/core/distributions.ts`; `Area`, `Steps`, `Band` and a per-bar tone in `components/Plot2D.tsx`; `ecdf`, `logHistogram` in `core/stats` | distributions, percentiles-statistics, hypothesis-testing-ab, queueing-theory, tail-latency, estimation, entropy-information, model-evals-drift, capacity-planning, benchmarking-methodology (10) | `normal/exponential/lognormal/pareto/poisson` samplers taking an `Rnd` (reuse `mulberry32`), `normalPdf/Cdf`, `poissonPmf`, `quantile`. Plot layers: `<Area fn from to tone>` (shade a tail, p-value or interval), `<Steps data>` (ECDF, as in "percentiles are read off the CDF"), `<Band lo hi>` (confidence band), `Bars` with `tone: (bin) => Tone`, log-spaced bins. Existing `Bars`/`Curve`/`barsFromHistogram` callers untouched. | Tests: sampler mean/variance within tolerance on fixed seeds, pdf integrates to ~1, cdf equals the numeric integral of the pdf, a KS-style check of each sampler against its cdf. Existing Plot2D lessons pixel-identical. **P0-a** |
| K3-2 | **Fixed-tick seeded sim helper** | `src/core/simTick.ts` (+ `useTickSim` bridge on `useSimulation`) | queueing-theory, wifi-shared-medium, autoscaling, capacity-planning, thread-pools-work-stealing, graceful-degradation, cache-stampede, fanout-feeds, simd-gpu-parallelism, benchmarking-methodology (10) | `createTickSim({ seed, init(rnd), step(state, rnd, tick), check?(state, tick) → string \| null })` → `run(n)`, `at(tick)` (deterministic replay from the seed, so scrubbing is free), `history`. The hook advances a fixed `dt` per tick with a `maxTicksPerFrame`, so tests, frames and the live view see the same trace. Wall-clock never enters the model. | Same seed ⇒ same history; `at(k)` equals running k steps; `check` fires on a deliberately broken step. Replaces ad-hoc `setInterval` sims in new lessons; no Tier 2 migration required. **P0-a** |
| K3-3 | **`Stat` multi-line sub** | `components/ui.tsx` | queueing-theory, percentiles-statistics, hypothesis-testing-ab (p, interval, n), capacity-planning, tail-latency, back-of-envelope, benchmarking-methodology (7) | `sub` accepts `ReactNode[]` (one line each, wrapping at 390) as well as a node. | Existing `Stat` callers pixel-identical. **P0-a** |
| K3-4 | **Sortable table header** (`aria-sort`) | `components/ui.tsx` (`SortTh`, `useSortedRows`) | api-versioning (compat matrix), query-planning (candidate plans by cost), join-algorithms (cost table), consistency-models, authz-models (policy table), routing-algorithms (routing table), bgp (path candidates), dora-metrics, kafka-partitioned-log (9) | `useSortedRows(rows, columns)` → `{ sorted, headerProps(col) }`; the header is a `<button>` inside `<th aria-sort>` with Enter/Space, stable sort, numeric/text comparators. Extracted from `distributed-id-generation`'s `TradeoffScene`, which migrates pixel-identically. | Tests for stability, direction cycling and the `aria-sort` value; keyboard drive shot. **P0-a** |
| K3-5 | **`GraphView` underlay and edge-label halo** | `components/GraphView.tsx`, `styles/kit.css` | domain-driven-design (context map), service-discovery-mesh, routing-algorithms and bgp (AS regions), cloud-networking-vpc (VPC and subnet boxes), strongly-connected-components (component hulls), network-flow (the min cut) (7) | `underlay?: ReactNode` rendered inside the same SVG before the edges (in the same coordinate system); `.graph-edge-label` gets `paint-order: stroke` in kit CSS. Migrate `coupling-cohesion`, `layered-hexagonal`, `architecture-diagrams-c4` (each stacks a second SVG today) and `minimum-spanning-trees` (local halo). | Pixel-identical migrations; `smoke --frames` + `diff`. **P0-a** |
| K3-6 | **`CodePanel` min-width fix** | `components/CodePanel.tsx`, CSS | property-based-testing, coverage-mutation-testing, api-versioning, schema-evolution, query-planning, regex-engines, bytecode-vms, compiler-optimisations, undefined-behavior, fuzzing (10) | A long line scrolls inside the panel instead of widening a flex or grid parent (`min-width: 0` plus an inner scroller); keeps `onLineClick` and the roving tabindex. | Every current `CodePanel` caller re-shot at 390; ≥ 900px pixel-identical. **P0-a** |
| K3-7 | **`Provenance` chip** | `components/ui.tsx` + `kit.css` | every **D** lesson: concretely bgp, quic, congestion-control, cloud-networking-vpc, authz-models, envelope-encryption-kms, supply-chain-security, kafka-partitioned-log, dora-metrics, model-evals-drift, estimation and ~40 more (≥ 50) | `<Provenance kind="simulated" \| "illustrative" \| "toy" \| "scripted" \| "from-memory" \| "not-run" \| "real">{short note}</Provenance>`: a muted chip (text `--muted`, never `--bad`/`--ok`), optionally `seed`. Gives AC-0/T3 #21 one visible, testable form. | K3-T2 lint requires ≥ 1 chip on every **D** lesson's Stage. **P0-a** |
| K3-8 | **Distributed-sim harness** | `src/core/distSim/` (`cluster.ts`, `invariants.ts`, `trace.ts`); a `toSequence(trace)` adapter for `SequenceDiagram` | physical-clocks-skew, logical-clocks, consistency-models, quorums, exactly-once-myth, leases-fencing, job-scheduling, transactional-outbox, merkle-trees, kafka-partitioned-log, change-data-capture, routing-algorithms (link-state flooding), offline-first-sync (13; later T4 gossip, paxos, flp) | `createCluster({ seed, nodes, latency: {min,max} \| (rnd) => ms, loss, duplicate, clocks: [{ offsetMs, driftPpm }] })`; a node is `{ onMessage(ctx, msg), onTimer(ctx, id), init(ctx) }` with `ctx.send`, `ctx.setTimer`, `ctx.now()` (the node's *local* skewed clock) and `ctx.trueNow` (tests only). Faults: `partition(a, b, from, to)`, `crash(node, at)`, `restart`, `dropNext(pred)`. A deterministic event queue ordered by `(time, seq)`; `trace` is `{ t, kind: send\|deliver\|drop\|timer\|crash\|…, from, to, payload }[]`. **Invariants helper:** `checkInvariants(cluster, safety: ((snapshot) => string \| null)[])` → first violation with its step; `forSeeds(range, scenario, safety)` → pass, or the lowest failing seed with a trace shortened by truncation. | Self-tests: same seed ⇒ same trace; partition drops exactly the crossing messages; skewed clocks differ from true time; **a deliberately broken protocol (two leaders) is caught by `forSeeds`** and the fixed one passes 500 seeds. This is the enforcement point for AC-0/T3 #20. **P0-b** |
| K3-9 | **`LogStream` / shared log row** | `components/LogStream.tsx`, `kit.css` (`.log-row`) | incident-response, postmortems, alerting-design, change-data-capture, write-ahead-log, kafka-partitioned-log, stream-windowing, fuzzing, job-scheduling, io-models (strace) (10); T2 sources: structured-logging, cert-lifecycle, cors-same-origin, dom-events | `rows: { id, at?, level?, tone?, source?, text }[]`, `max`, `follow`, `highlight?(row)`, `live?: 'off' \| 'polite'` (the live region is mounted before it speaks), wraps at 390, mono, keys by generated id. | Migrate only the Tier 2 callers that match, pixel-identically, and name those that don't, with the reason. **P0-b** |
| K3-10 | **Progressive Gantt helper** (`barAt`) | `core/gantt.ts` | incident-response and postmortems (timeline replay), job-scheduling, etl-orchestration, mapreduce-batch, thread-pools-work-stealing, io-models, tail-latency (hedged requests), cache-stampede, project-planning-critical-path (10) | `barAt(bar, now)` clips a bar to `now` (returns `null` before it starts, a `progress`-ed bar while it runs, the whole bar after); `barsAt(bars, now)`. Pure and tested; replaces the per-lesson clipping loops. | Boundary tests (before, at, inside, at end, after), and `GanttLanes` unchanged. **P0-b** |
| K3-11 | **`GanttBar` zero-length label** | `components/GanttLanes.tsx` | postmortems and incident-response (instants), project-planning-critical-path (milestones), job-scheduling (enqueue), io-models (syscalls), change-data-capture, safe-config-rollout (7) | A bar with `start === end` draws a tick or diamond with its label beside it, reusing the marker label collision logic (today it has no width and no label). | Existing bars pixel-identical; a labelled instant at the domain edges stays inside the track. **P0-b** |
| K3-12 | **`GanttLanes` calendar axis and hide-empty-lanes** | `components/GanttLanes.tsx`, `core/gantt.ts` (`calendarTicks`) | project-planning-critical-path, estimation, job-scheduling (cron), incident-response (on-call), etl-orchestration (daily runs), backups-disaster-recovery (backup schedule), dora-metrics (lead time), safe-config-rollout (8) | `axis={{ calendar: { start: ISO, unit: 'hour' \| 'day' \| 'week' } }}` writes "Mon 09:00"-style ticks in UTC (a fixed zone, stated on screen); `hideEmptyLanes` collapses lanes with no bar in the domain, keeping an accessible summary. | `calendarTicks` unit tests, including week boundaries; existing axes unchanged. **P0-b** |
| K3-13 | **`MetricMeter`** (header) | `components/MetricMeter.tsx` | capacity-planning, autoscaling, tail-latency, alerting-design (SLI vs threshold), buffer-pool (hit ratio), model-evals-drift, dora-metrics, benchmarking-methodology (8); T2 source: core-web-vitals | `{ label, value: number \| null, unit, bands: { upTo, tone, label }[], header?: ReactNode (title and definition line), format?, ariaLabel }`. Extracted from `core-web-vitals`' local meter with the header added; bands take tones per the colour table. | `core-web-vitals` pixel-identical. **P0-b** |
| K3-14 | **`timeFrames`** (time-stepped frame builder) | `core/frames.ts` | tail-latency, cache-stampede, graceful-degradation, io-models, quic (0-RTT timeline), congestion-control, incident-response (7); T2 sources: http-versions, realtime-transports, graphql | `timeFrames({ end, steps, milestones: { t, say }[], intro, summary }) → { now, say?, hold? }[]`. A T2 wave 8 request (B24) that is **not in the tree**; K3-T4 confirms it was never declined, otherwise this row is dropped. | Migrate the three T2 users pixel-identically. **P0-b** |
| K3-15 | **`ScenarioStory`** (branching decision simulator) | `core/scenario.ts` (pure engine), `components/ScenarioStory.tsx` | design-docs-rfcs (the pilot), technical-debt, estimation, mentoring-delegation, project-planning-critical-path, prioritization, product-thinking, ml-fairness-bias, threat-modeling, incident-response, postmortems, safe-config-rollout (12); T2 source: computing-ethics | The lead-grammar pilot's extraction (the T2 plan's own note: "extract when design-docs-rfcs arrives"). `Scenario { start, nodes: { id, prompt, choices: { label, to, effects?, because }[] }, meters, endings }`; the component gives a choices radio group (keyboard), meters, a ledger of what happened, undo and replay, and a mandatory "invented scenario" provenance line. **`validateScenario`**: every node reachable, no dead end, meters stay in bounds on every path (bounded enumeration). | `computing-ethics` pixel-identical; validator tested on a broken scenario. **Kit round after wave 1** (`design-docs-rfcs` builds it locally in wave 1; `technical-debt`, in the same batch, is an interest-accrual simulation, not a branching story, so it does not need it, and if its spec finds it does it waits for this round). Blocks wave 2's `incident-response`. |
| K3-16 | **`CellGrid` per-row tone decoration** | `components/CellGrid.tsx`, `cellGridLayout.ts` | mvcc (version visibility), buffer-pool (frames), join-algorithms, kafka-partitioned-log (partitions), hot-keys-skew, columnar-storage, write-ahead-log, cache-coherence (cores), page-tables-tlb (TLB entries) (9) | `rowDecor?: (r) => { tone?: Tone, label?: ReactNode, style?: 'rail' \| 'band' }`; a rail or band drawn beside or behind a whole row, in SVG and canvas modes. | Omitted ⇒ pixel-identical for all 14 Tier 2 callers. **Kit round after wave 2, blocks wave 3** (first user: mvcc). |
| K3-17 | **Automata extension: PDA, Turing machine, `TapeStrip`** | `core/automata.ts` (+ `core/tm.ts`), `components/TapeStrip.tsx` (on `ArrayStrip`) | pushdown-automata, chomsky-hierarchy, turing-machines, halting-problem (4; regex-engines already uses the NFA half) | `Pda` and `pdaStep` (configuration sets), `Tm` and `tmStep`, `runTm(tm, tape, { maxSteps })` → `halted \| budget-exhausted \| stuck`, and `parseTmTable(text)` for a learner-written transition table through `core/parse` (refusal messages; **no `eval`**). `TapeStrip`: cells, head, an extendable blank tape, one tab stop with arrows. | Tests against hand-built machines (balanced brackets, aⁿbⁿ, binary increment, palindromes), a machine that loops is stopped by the budget and never reported "never halts". **Kit round after wave 2, blocks wave 3.** |
| K3-18 | **`core/linalg.ts`** | `src/core/linalg.ts` (builds on `core/vec`, never duplicates it) | markov-chains, eigen-pagerank, svd-pca, recommender-systems, attention-transformers, cnns-convolution, neural-networks-backprop (7) | `matMul`, `transpose`, `powerIteration(A, { iters })` returning every iterate (for the animation), `jacobiEigen(symmetric)`, `svdSmall(A)` (Jacobi, ≤ 8×8, labelled small-matrix), `covariance`, `pca(points, k)`, `softmax`, `conv2d(image, kernel, { stride, pad })`. | Tests: `A = UΣVᵀ` to 1e-9, `Av = λv` residual, power iteration → the dominant eigenvector, PageRank on a known graph equals the direct solve, `conv2d` equals a naive loop. **Kit round after wave 3, blocks wave 4.** |
| K3-19 | **`core/nn.ts`** (tiny seeded nets + gradient check) | `src/core/nn.ts` | neural-networks-backprop, cnns-convolution, attention-transformers, training-vs-inference, recommender-systems (matrix factorisation by SGD) (5) | A seeded MLP (≤ 2 hidden layers, ≤ 16 units), forward/backward, SGD and momentum, `attention(Q, K, V, { mask })` returning the weights, and **`gradCheck(net, batch)`** (numeric vs analytic, max relative error). Every curve the ML lessons draw comes from here. | `gradCheck` passes for every layer type; XOR loss falls on a fixed seed; **a deliberately wrong backward fails `gradCheck`**. **Kit round after wave 4, blocks wave 5.** |
| K3-20 | **`core/raster3d.ts`** (canvas-2D software renderer; extraction from T2 `rasterization`) | `src/core/raster3d.ts` (+ `raster.ts`) | 3d-transforms-projection, gpu-rendering-pipeline, ray-tracing (3), plus T2 `rasterization` as the extraction source | Perspective and `lookAt`, project to NDC and screen, near-plane `clipTriangle`, barycentric interpolation, z-buffer, `traceRay` (sphere, plane, triangle) and Lambert/Phong shading, at a fixed small resolution into `paintImage`; **no WebGL**, no new dependency, deterministic for smoke. | Projection of known points, z-buffer vs painter's algorithm on seeded scenes, ray-sphere hit vs the analytic root, a frame-time budget test; `rasterization` pixel-identical. **Kit round after wave 8, blocks wave 9.** |
| K3-21 | **`core/signal.ts`** | `src/core/signal.ts` | fourier-transform, lossy-compression (2, same batch: built here because a batch may not carry shared code, and both need the same transform) | `dft`, radix-2 `fft`, `idft`, `dct2`/`idct2` (8-point and 8×8), `window`, a quantisation helper. | `fft` equals `dft`, Parseval, round-trips, DCT orthonormality, a known JPEG block vector. **Kit round after wave 8, blocks wave 9.** |

**Considered and kept local** (one Tier 3 user, or not similar enough): the lambda-calculus reducer (`lambda-calculus` only; `metaprogramming-macros` expands text, not terms), the CSMA/CA medium (`wifi-shared-medium` only; it uses K3-2), a hash-ring view (`consistent-hashing`'s ring stays; no T3 topic needs another), a TLB/page-table view (CellGrid with K3-16 covers it), an LSM/B-tree page view (CellGrid again), a regex backtracking trace (it lives in `regex-engines`, wave 8; `redos` in wave 9 reuses it, so if `redos` needs it the wave 8→9 kit round extracts it then, on the second use), and `useRovingToolbar` (a T2 wave 8 request with no confirmed T3 second user; K3-T4 decides).

**Staffing of the kickoff kit round** (as in Tier 2): three agents with disjoint files, then the coordinator merges and runs the full gates.
- **Agent A:** K3-T1 to K3-T5 (tooling), K3-7.
- **Agent B (extraction):** K3-4, K3-5, K3-6, K3-9, K3-11, K3-12, K3-13, K3-14 and K3-15 later. It owns the pixel-identical migrations.
- **Agent C (new surface):** K3-1, K3-2, K3-3, K3-8, K3-10. K3-8 is the biggest new surface and the most important: if it runs long, wave 1 doesn't wait for it, wave 2 does.

### Tooling tickets (not kit)

| # | Ticket | Done when |
|---|---|---|
| K3-T1 | **Register the 154 Tier 3 topics** in `curriculum.ts` (tier 3, by track; titles and taglines as §2; `segment-trees` merged title). The 12 existing entries are untouched. | Home shows 166 Tier 3 cards (12 built, 154 planned) behind "Show 154 planned"; `curriculum.test.ts` asserts unique ids, every §2 id registered, and that `fenwick-trees`, `namespaces-cgroups`, `two-generals` are **not**; track counts correct; eyeballed at 1440, 768, 390; full smoke passes. |
| K3-T2 | **Extend the K-2 content lint** to the mechanical AC-0/T3 rules | Fails on: an unscoped absolute in `keyIdeas` or quiz `why` (marker `allow-absolute: <reason>`); a **D** lesson with no `Provenance` chip; a lesson with fewer `try-this N:` tests than `tryThis` entries. The 12 existing T3 lessons are allowlisted until T3-R1/R2 remove them. |
| K3-T3 | **CLAUDE.md** gains one paragraph and a pointer | The distributed-sim rule (invariants over seeded faults), the `Provenance` rule, and "read AC-0/T3 in `docs/tier3-plan.md`". Docs-only. |
| K3-T4 | **Audit every open Tier 2 Phase 2 request** in `docs/tier2-wave*-kit-requests.md` | Each is built, declined with a reason in `shared-api.md`'s "Not built", or folded into a K3 item. Specifically `timeFrames` (K3-14), `useRovingToolbar`, and the `plural` doc warning. |
| K3-T5 | **Domain-review protocol** for 86 flagged lessons | Sentry reviews flagged lessons per batch before merge; two reviewers in waves 1, 2, 6, 7 and 8; findings recorded per batch as in Tier 2. |

**Testing conventions set here**, one line per cluster (specs inherit them): stats and queueing lessons check closed-form results against seeded Monte Carlo (M/M/1 mean wait vs simulation, interval coverage); distributed lessons use K3-8 invariants (AC-0/T3 #20); ML lessons use K3-19 `gradCheck`; graphics lessons check projection and ray hits against analytic answers; theory lessons run machines against references; `regex-engines` and `redos` compare against real `RegExp` on seeded strings; `query-planning` checks the plans it can against SQLite's `EXPLAIN QUERY PLAN` via `node:sqlite` (hash joins aren't in SQLite, so `join-algorithms` checks all three algorithms against a brute-force join and labels "what Postgres prints" as from memory).

---

## 5. Retrofitting the 12 existing Tier 3 lessons (T3-R1, T3-R2)

None of the 12 has a test file or a content lint pass (K-2 allowlists them), several keep logic in `.tsx` (`cap-theorem`, `replication`, `isolation-levels`, `monolith-microservices` have a `scenarios.tsx`; `sharding` has `model.tsx`), and none shows its simulations as simulations. They are exactly where Tier 1's T-2/T-3 and Tier 2's wave 1-2 findings will repeat. They run in waves 1 and 2 so any false claim surfaces before the new lessons that link to them ship.

**The split follows who depends on whom**, not the track: every lesson a wave 2 batch builds on is retrofitted in wave 1, so no new lesson links to an unchecked one.

| Batch | Wave | Lessons | Why now |
|---|---|---|---|
| **T3-R1** | 1 | `cap-theorem` **[D]**, `replication` **[D]**, `isolation-levels` **[D]**, `load-balancing`, `observability`, `event-sourcing` | Wave 2 builds `consistency-models` and `quorums` (on all three of the first), `tail-latency` (on `load-balancing` and `observability`), and wave 3 `mvcc` (on `isolation-levels`). `observability` is also linked from wave 1's `percentiles-statistics` and `distributions`. |
| **T3-R2** | 2 | `consistent-hashing`, `sharding`, `circuit-breakers`, `cdn-edge`, `monolith-microservices`, `oauth-flows` **[D]** | Nothing in waves 1-5 builds on these, so they can follow R1. First consumers: `authz-models` (wave 8, on `oauth-flows`), `hot-keys-skew` and `fanout-feeds` (wave 7, on `sharding` and `consistent-hashing`), `graceful-degradation`, `service-discovery-mesh`, `adaptive-streaming` (wave 10). The one early link is `domain-driven-design` (T3-B3, wave 1) to `monolith-microservices`. |

Because R2 runs a wave after T3-B3, **the `domain-driven-design` spec describes the `monolith-microservices` link in plain words** and links by id only once R2 has merged (AC-0/T2 #13).

**Done when, per lesson** (AC-0/T3 applied):
1. **Tests assert every on-screen claim**, against an independent reference (AC-0/T3 #19):
   - `load-balancing`: each strategy's pick against a reference over seeded arrivals; the health-check delay sends some traffic to the dead box first; round robin overloads the slow server and least-connections does not (a test, not a caption).
   - `consistent-hashing`: adding a node moves about K/N keys, and plain `hash mod N` moves about N−1/N of them; virtual nodes reduce load variance on a seeded key set.
   - `circuit-breakers`: the state machine's transitions, "immediate retries multiply load up to 4×" computed from the sim, backoff with jitter spreads arrivals.
   - `cdn-edge`: hit ratio and origin offload under the lesson's own popularity skew, recomputed.
   - `observability`: series cardinality = product of label values; the percentile the lesson shows equals `core/sim`'s.
   - `event-sourcing`: replaying the log reproduces the state for every prefix; snapshot + tail equals full replay.
   - `cap-theorem` **[D]**, `replication` **[D]**: each scripted partition/failover outcome is checked by a **K3-8-style invariant** (acknowledged writes lost only under async failover; a minority partition refuses writes in the CP choice), not by the scripted storyline. Where the lesson scripts an outcome, it says "scripted".
   - `isolation-levels` **[D]**: the anomaly-by-level table is regenerated by enumerating interleavings of two toy transactions under a stated model of each level, and compared to the table the lesson shows. "Level names mean different things in different databases" is kept and hedged ("from memory, check your database").
   - `sharding`: range vs hash vs directory placement and the cost of re-sharding, computed; a hot shard under skew.
   - `monolith-microservices`: every number is a named, illustrative constant; claims about real companies or "typical" teams are removed or hedged.
   - `oauth-flows` **[D]**, payload-free: which parameters bind which party (`state`, PKCE `code_verifier`, exact `redirect_uri` match), the implicit flow's status hedged ("from memory"), no real token or secret literal (`fakeSecret`).
2. **Pure logic moves out of `.tsx`** into `model.ts`/`sim.ts`; `frames.tsx` keeps only captions.
3. **On-screen disclosure** (`Provenance`, K3-7) for whatever is scripted, simulated, illustrative or hedged.
4. **`watch` checked against a screenshot line by line**, colour table applied; absolutes scoped (AC-0/T3 #15); try-this works from the default state with a test (#16); hidden controls checked (#17).
5. **Quiz passes K-2** with a misconception question; the lesson leaves the K-2 allowlist.
6. **Every scene at 390 and 768**, first/middle/last frame (#26), keyboard paths (AC-0/T2 #11).
7. **No scope growth.** Each keeps its side of the line in §1.2 and §1.3: `isolation-levels` keeps the anomalies and leaves versions to `mvcc`; `circuit-breakers` keeps breaker and retry mechanics and leaves user-visible fallbacks to `graceful-degradation`; `cap-theorem` keeps the partition trade-off and leaves history checking to `consistency-models`.
8. **No shared-code edits.** Misfits go into the report as Phase 2 requests.

**The nine registered Tier 4 lessons** (`raft`, `crdts`, `lsm-trees`, `distributed-transactions`, `backpressure`, `multi-region`, `probabilistic-structures`, `slos-error-budgets`, `zero-trust`) are retrofitted at the Tier 4 kickoff as planned. Seven of them have Tier 3 dependents (§1.5), so AC-0/T3 #25 requires each Tier 3 builder to read the relevant claim first and file a ticket on a mismatch. That is a spot check, not a retrofit.

---

## 6. Batches, waves and concurrency

**Batches** (31 new, of which 28 hold 5 lessons, one holds 6 and two hold 4; plus 2 retrofit). Every batch touches only `src/lessons/<its ids>/`. Batches are numbered in wave order, so the tracker reads top to bottom. Lessons are listed in build order inside a batch; a "Builds on" target in the same batch is always listed before its dependant.

**Ordering rationale (§3.2 "Order within Tier 3", applied):**
1. **Statistics and queueing first** (wave 1: distributions → percentiles → queueing, then hypothesis testing and back-of-envelope), because ops and arch lean on them: `tail-latency` and `capacity-planning` are wave 2, `estimation` and `product-thinking` wave 10.
2. **Time and consistency** (wave 2: physical clocks → logical clocks → consistency models → quorums, then exactly-once) right after, with their retrofits `cap-theorem`, `replication` and `isolation-levels` in wave 1 so the claims they stand on are already checked. `leases-fencing` → `job-scheduling` follow in wave 7, after `change-data-capture` (wave 6) so `transactional-outbox` can link it.
3. **Storage internals** across waves 3 to 6: `query-planning` → `join-algorithms`, `mvcc`, `buffer-pool` (wave 3); `columnar-storage` → `warehouse-lake-lakehouse` → `etl-orchestration` (wave 5); `write-ahead-log` → `change-data-capture` (wave 6).
4. **The ML chain** (wave 5: `neural-networks-backprop` → `cnns-convolution` → `attention-transformers` → `tokenization-bpe`; wave 6: `rag-pipelines` → `llm-agents-tool-use`, with `vector-search` in wave 4, and `recommender-systems` and `reinforcement-learning` after the wave 4 `svd-pca` and `markov-chains`).
5. **Everything else by track affinity**, with the load-balancing rules below.
6. **`design-docs-rfcs` is built in wave 1** (T3-B2) as the pilot of the non-technical visual grammar (a decision simulator and a document builder). Its extraction (K3-15) lands before wave 2 so `incident-response` can use it, and Tier 4 inherits it. **The other lead lessons come last** (T3-B31, wave 10).

**Load-balancing rules applied.** No wave carries two hard-theory or two distributed-algorithm batches: stats (wave 1), distributed time (wave 2), the Turing/lambda toys (wave 3, next to a light graph batch), information and matrices (wave 4), neural nets (wave 5), coordination (wave 7), parsing theory (wave 8), graphics and signals (wave 9). Domain-review volume is spread (5 to 11 flagged lessons per wave; waves 1, 2, 6, 7 and 8 take two reviewers). Light algorithm batches (graphs, trees, geometry, techniques) sit next to the heavy ones as relief. **Wave 9 is deliberately the lightest**: two batches, so the two hardest-to-animate batches (graphics, signals) and the payload-free security batch get slack before the finale.

| Batch | Name | Tracks | Lessons, in build order | Wave | Domain review | Pilots |
|---|---|---|---|---:|---|---|
| T3-B1 | Statistics & queues | math, arch | `distributions`, `percentiles-statistics`, `queueing-theory`, `hypothesis-testing-ab`, `back-of-envelope` | 1 | all | K3-1 distributions kit, K3-2 simTick, K3-3 Stat sub |
| T3-B2 | Design docs & craft | lead, craft | `design-docs-rfcs`, `technical-debt`, `property-based-testing`, `coverage-mutation-testing`, `monorepo-polyrepo` | 1 | none | K3-6 CodePanel fix, K3-7 Provenance; local decision-simulator grammar (extracted as K3-15) |
| T3-B3 | Contracts & domains | arch, data, craft | `schema-evolution`, `api-versioning`, `contract-testing`, `domain-driven-design`, `double-entry-ledgers` | 1 | `schema-evolution`, `double-entry-ledgers` | K3-4 sortable header, K3-5 GraphView underlay and halo |
| T3-B4 | Time & consistency | arch, data | `physical-clocks-skew`, `logical-clocks`, `consistency-models`, `quorums`, `exactly-once-myth` | 2 | all | K3-8 distSim (first pilot), K3-7 |
| T3-B5 | Performance & delivery | ops | `tail-latency`, `capacity-planning`, `autoscaling`, `benchmarking-methodology`, `dora-metrics` | 2 | `tail-latency`, `capacity-planning`, `benchmarking-methodology`, `dora-metrics` | K3-13 MetricMeter, K3-10 barAt, K3-14 timeFrames, K3-1, K3-2 |
| T3-B6 | Operating the service | ops | `incident-response`, `postmortems`, `alerting-design`, `safe-config-rollout`, `gitops` | 2 | none | K3-9 LogStream, K3-10 to K3-12 Gantt trio, K3-15 ScenarioStory (first consumer) |
| T3-B7 | Query engine | data | `query-planning`, `join-algorithms`, `mvcc`, `buffer-pool`, `materialized-views-denormalization` | 3 | `query-planning`, `mvcc` | K3-16 CellGrid row tone, K3-4 |
| T3-B8 | Computation toys | lang | `turing-machines`, `halting-problem`, `lambda-calculus`, `bytecode-vms`, `webassembly` | 3 | `halting-problem`, `lambda-calculus`, `webassembly` | K3-17 PDA/TM and TapeStrip |
| T3-B9 | Graph algorithms | dsa, math | `shortest-paths-advanced`, `strongly-connected-components`, `network-flow`, `bipartite-matching`, `graph-coloring` | 3 | none | K3-5 (SCC hulls, min-cut region) |
| T3-B10 | Information & matrices | math | `entropy-information`, `lz-compression`, `markov-chains`, `eigen-pagerank`, `svd-pca` | 4 | `entropy-information`, `markov-chains`, `eigen-pagerank`, `svd-pca` | K3-18 linalg, K3-1 |
| T3-B11 | Streams & search | data, dsa | `kafka-partitioned-log`, `stream-windowing`, `count-min-heavy-hitters`, `inverted-index`, `vector-search` | 4 | `kafka-partitioned-log`, `stream-windowing`, `count-min-heavy-hitters`, `vector-search` | K3-8 distSim (log replication), K3-9 LogStream, K3-16 |
| T3-B12 | Balanced trees & range queries | dsa | `avl-trees`, `red-black-trees`, `skip-lists`, `segment-trees`, `persistent-data-structures` | 4 | none | TreeSvg only (no new kit) |
| T3-B13 | Neural nets to transformers | ml | `neural-networks-backprop`, `cnns-convolution`, `attention-transformers`, `tokenization-bpe`, `training-vs-inference` | 5 | all | K3-19 nn, K3-18 |
| T3-B14 | Analytics storage | data | `columnar-storage`, `warehouse-lake-lakehouse`, `etl-orchestration`, `time-series-data`, `mapreduce-batch` | 5 | none | K3-12 calendar axis (daily DAG runs), K3-16, K3-10 |
| T3-B15 | Geometry & strings | dsa | `kmp`, `convex-hull`, `sweep-line`, `spatial-indexes`, `ropes-gap-buffers` | 5 | none | Plot2D, CellGrid (no new kit) |
| T3-B16 | Kernel & I/O | hw, os | `dma-io-devices`, `io-models`, `fork-copy-on-write`, `mmap-page-cache` | 5 | all | K3-9 LogStream (strace), K3-11 instants, K3-16 |
| T3-B17 | Durability & change | data, ops | `write-ahead-log`, `change-data-capture`, `zero-downtime-migrations`, `merkle-trees`, `backups-disaster-recovery` | 6 | all | K3-9, K3-12 (backup schedule), K3-16, K3-8 |
| T3-B18 | RAG, agents & recommenders | ml | `rag-pipelines`, `llm-agents-tool-use`, `model-evals-drift`, `recommender-systems`, `reinforcement-learning` | 6 | all | K3-19, K3-18, K3-7 |
| T3-B19 | Algorithm techniques | dsa, math | `dp-patterns`, `randomized-algorithms`, `modular-exponentiation`, `chinese-remainder`, `game-tree-search` | 6 | none | no new kit |
| T3-B20 | Coordination & scale patterns | arch, data | `leases-fencing`, `job-scheduling`, `transactional-outbox`, `fanout-feeds`, `hot-keys-skew` | 7 | `leases-fencing`, `job-scheduling`, `transactional-outbox` | K3-8 distSim, K3-12 (distributed cron), K3-10, K3-16 |
| T3-B21 | Parallelism | hw, os | `simd-gpu-parallelism`, `concurrency-models`, `thread-pools-work-stealing`, `parallel-patterns`, `priority-inversion` | 7 | `priority-inversion` | K3-10, K3-2, K3-16 |
| T3-B22 | Language semantics & numeric traps | lang, math | `compiler-optimisations`, `undefined-behavior`, `ownership-refcounting`, `numeric-precision` | 7 | `compiler-optimisations`, `undefined-behavior`, `numeric-precision` | K3-6 CodePanel |
| T3-B23 | CPU & memory | hw, os, sec | `branch-prediction`, `cache-coherence`, `timing-side-channels`, `page-tables-tlb`, `memory-allocators` | 7 | `branch-prediction`, `cache-coherence`, `timing-side-channels`, `page-tables-tlb` | K3-16 (MESI rows, TLB rows), K3-2 |
| T3-B24 | Regex & parsing theory | lang | `regex-engines`, `parsing-algorithms`, `pushdown-automata`, `chomsky-hierarchy`, `metaprogramming-macros` | 8 | `chomsky-hierarchy` | K3-17 (PDA), GraphView |
| T3-B25 | Access & keys | sec | `threat-modeling`, `authz-models`, `ssrf-access-control`, `envelope-encryption-kms`, `randomness-csprng` | 8 | `authz-models`, `ssrf-access-control`, `envelope-encryption-kms`, `randomness-csprng` | K3-4, K3-7, K3-15 |
| T3-B26 | Routing & the internet | net | `routing-algorithms`, `bgp`, `wifi-shared-medium`, `congestion-control`, `quic` | 8 | all | K3-8 (link-state flooding), K3-5, K3-2 (CSMA) |
| T3-B27 | Pixels & signals | web, math | `3d-transforms-projection`, `gpu-rendering-pipeline`, `ray-tracing`, `fourier-transform`, `lossy-compression` | 9 | `gpu-rendering-pipeline`, `fourier-transform`, `lossy-compression` | K3-20 raster3d, K3-21 signal |
| T3-B28 | Hostile input & supply chain | sec | `fuzzing`, `redos`, `sandboxing-isolation`, `supply-chain-security`, `privacy-engineering` | 9 | all | K3-7, K3-9 (fuzz log) |
| T3-B29 | Resilience patterns | arch, sec | `graceful-degradation`, `cache-stampede`, `multi-tenancy`, `service-discovery-mesh`, `ddos-mitigation` | 10 | `service-discovery-mesh`, `ddos-mitigation` | K3-2, K3-14, K3-10 |
| T3-B30 | Cloud & the live web | net, web | `cloud-networking-vpc`, `vpns-tunneling`, `nat-traversal-webrtc`, `adaptive-streaming`, `offline-first-sync` | 10 | `cloud-networking-vpc`, `vpns-tunneling`, `nat-traversal-webrtc`, `offline-first-sync` | K3-5 (VPC underlay), K3-8 (offline sync) |
| T3-B31 | Leading engineers | lead, ml | `estimation`, `mentoring-delegation`, `project-planning-critical-path`, `prioritization`, `product-thinking`, `ml-fairness-bias` | 10 | `estimation`, `prioritization`, `ml-fairness-bias` | K3-15, K3-12, K3-1 |

**File ownership and isolation:** unchanged from Tier 1 (§1.6) and Tier 2 (§3.1.7).
- Each batch runs in its own worktree and branch (`t3/b<n>`, `t3/r<n>`), created through Claude Code's built-in worktree mode, off a freshly fetched `develop`/`main` as the working agreement requires, with its own `KINETIC_PORT`.
- No batch edits `src/core/*`, `src/components/*`, `src/styles/*`, `curriculum.ts` (K3-T1 registers all 154), `docs/shared-api.md` or this file. Status and Phase 2 requests go into the batch report.

**Waves.** Same rhythm as Tier 2: agents build in parallel, the second reviewer (Sentry) reads every **[domain review]** lesson of the wave, then one kit round applies the accepted Phase 2 requests, builds the next items from §4 and runs the full gates before the next wave starts.

| Wave | Batches | Agents | New lessons | Flagged **D** | Why here |
|---|---|---|---|---:|---|
| kickoff | K3-1 to K3-14 and K3-T1 to K3-T5 | 3 kit | none | n/a | P0-a lands, then wave 1 starts; P0-b lands during wave 1. |
| 1 | B1, B2, B3 + **R1** | 4 | 15 (+6 retrofit) | 7 (+3) | Stats pilots the distributions kit, `simTick` and `Stat` on exactly checkable answers. B2 pilots the lead grammar and the `CodePanel` fix. B3 pilots the sortable header and the `GraphView` underlay. R1 checks `cap-theorem`, `replication` and `isolation-levels` before wave 2 stands on them. |
| 2 | B4, B5, B6 + **R2** | 4 | 15 (+6) | 9 (+1) | B4 is the first distributed-harness pilot (`distSim`), and the hardest batch of the tier: build it with the most review. B5 builds on wave 1's stats. B6 is light and is the first consumer of `LogStream`, the Gantt trio and `ScenarioStory`. |
| 3 | B7, B8, B9 | 3 | 15 | 5 | B8 is the earliest of the "manipulable toy" batches (`TapeStrip`, PDA/TM): learning that the toy works, or not, in wave 3 leaves time to react. B7 is storage internals. B9 is the light relief. |
| 4 | B10, B11, B12 | 3 | 15 | 8 | B10 builds `core/linalg`'s first users; B11 finishes `vector-search` ahead of RAG; B12 is light. |
| 5 | B13, B14, B15, B16 | 4 | 19 | 9 | B13 starts the ML chain on `core/nn`. B14 is medium, B15 is light, B16 (kernel and I/O) is medium with four flagged lessons. Four agents because three of the four batches are light-to-medium. |
| 6 | B17, B18, B19 | 3 | 15 | 10 | B17 (durability) and B18 (RAG, agents, recommenders) are both domain-heavy, in different fields, with the light technique batch B19 between them. Two reviewers. |
| 7 | B20, B21, B22, B23 | 4 | 19 | 11 | The coordination batch (B20) is the second distributed-harness batch, so the harness has been through a whole wave and a kit round. B21 and B23 are the OS and hardware pair (parallelism, CPU and memory); B22 is medium. Two reviewers. |
| 8 | B24, B25, B26 | 3 | 15 | 10 | B24 is the parsing/Chomsky theory batch, B25 is the access-control and keys batch, B26 is routing and the internet. `core/automata`'s PDA from wave 3 is ready. Two reviewers; B25 needs a full payload-free review. |
| 9 | B27, B28 | 2 | 10 | 8 | Graphics and signals (`raster3d`, `signal`, built in the wave 8→9 round) and the payload-free security batch (fuzzing, ReDoS, sandboxing, supply chain, privacy). The lightest wave, on purpose. |
| 10 | B29, B30, B31 | 3 | 16 | 9 | Resilience patterns link most earlier lessons; cloud and the live web; and the lead lessons last, which reference the technical ones. |

That is 154 new lessons in 10 waves, plus 12 retrofits in waves 1 and 2. Waves 1, 2, 5 and 7 run four agents (the first two because a retrofit batch is one of them); every other wave runs three or two. **Kit rounds:** one before wave 1 (P0-a), one before wave 2 (P0-b), then one after each of waves 1 to 10. The planned builds are K3-15 (after wave 1), K3-16 and K3-17 (after wave 2), K3-18 (after wave 3), K3-19 (after wave 4), K3-20 and K3-21 (after wave 8); every other round applies only accepted Phase 2 requests and runs the gates. The round after wave 10 is the Tier 3 close-out round before QA.

**Dependency order for "builds on".** Read this as the cross-batch chains; everything else is within a batch or on a registered lesson.

| Chain | Order |
|---|---|
| Statistics → everything quantitative | `distributions` → `percentiles-statistics` → `queueing-theory` (wave 1); `hypothesis-testing-ab` (wave 1); then `tail-latency`, `capacity-planning` (wave 2); `estimation` → `project-planning-critical-path`, `prioritization` and `product-thinking` (wave 10); `model-evals-drift` (wave 6) |
| Time and consistency | `physical-clocks-skew` → `logical-clocks` → `consistency-models` → `quorums` → `exactly-once-myth` (wave 2); `merkle-trees` (wave 6); `leases-fencing` → `job-scheduling` (wave 7); `offline-first-sync` (wave 10) |
| Storage | `query-planning` → `join-algorithms`, `mvcc`, `buffer-pool` (wave 3) → `mmap-page-cache` (wave 5); `columnar-storage` → `warehouse-lake-lakehouse` → `etl-orchestration`, `time-series-data` (wave 5); `write-ahead-log` → `change-data-capture` → `transactional-outbox` (waves 6 and 7); `kafka-partitioned-log` (wave 4) |
| ML | `neural-networks-backprop` → `cnns-convolution`, `attention-transformers` → `tokenization-bpe` (wave 5); `vector-search`, `svd-pca`, `markov-chains` (wave 4) → `rag-pipelines` → `llm-agents-tool-use`, `recommender-systems`, `reinforcement-learning` (wave 6) → `ml-fairness-bias` (wave 10) |
| Theory | `turing-machines` → `halting-problem` (wave 3); `pushdown-automata` → `chomsky-hierarchy` (wave 8, after the Turing toys); `regex-engines` (wave 8) → `redos` (wave 9); `bytecode-vms` (wave 3) → `webassembly` (wave 3), `compiler-optimisations` (wave 7) |
| Graphics and parallelism | `simd-gpu-parallelism` (wave 7) → `parallel-patterns` (wave 7), `gpu-rendering-pipeline` → `ray-tracing` (wave 9) |
| Security | `property-based-testing` (wave 1) → `fuzzing` (wave 9); `branch-prediction` → `cache-coherence` → `timing-side-channels` (wave 7); `authz-models` → `ssrf-access-control` (wave 8); `cloud-networking-vpc` → `vpns-tunneling` (wave 10) |
| Leads | `design-docs-rfcs` (wave 1, the pilot), `technical-debt` (wave 1) ... the rest in wave 10 |

**Between waves** (unchanged): merge the batch branches, run the full `npm run smoke`, `smoke -- --mobile`, `captions`, `check-tokens -- --strict` and `npm test`, triage Phase 2 requests, run the kit round, update the tracker. A review that comes back clean in a light wave (3, 4, 9) lets the coordinator pull a batch forward from the next wave; the builders never decide that.

---

## 7. Known risks, and the tracker rows to add

### 7.1 Known risks, Tier 3

- **Scale.** 154 lessons plus 12 retrofits is about as large as Tier 2 (156 plus 16) with a harder domain mix: 86 lessons (56%) carry a domain-review flag. Review, not agent count, is the constraint. Don't compress waves; add one.
- **53 nice-priority topics.** The owner wants exhaustive, so all are in scope. Inside each batch build core, then important, then nice; the tier isn't done until all 154 ship.
- **Distributed lessons that stage a failure instead of producing it.** The single most likely MAJOR class in waves 2, 6, 7 and 10 (B4, B17, B20, B30): a caption says "the follower lost the write" and the model never loses one. Mitigation: AC-0/T3 #20 and K3-8's self-test (a broken protocol must be caught); the "broken" mode must violate the invariant on a named seed. A `Provenance` chip says "simulated, seed N".
- **The harness is the single largest kit risk.** K3-8 is a new subsystem, not an extraction. If it slips, wave 2 slips, not wave 1. Keep its API to what §4 lists; nodes that need more than `send`, `setTimer`, `now` are a Phase 2 request after wave 2. Tier 4's gossip, paxos and FLP lessons will be its next users, so its tests are part of the deliverable.
- **Theory as slideshow.** B8 (`turing-machines`, `halting-problem`, `lambda-calculus`) and B24 (`chomsky-hierarchy`, the pumping lemma) fail by being completable with Next. AC-0/T3 #23 and Appendix A name the toy for each. Pilot early (B8 is wave 3). Honesty: a bounded run says "did not halt within N steps".
- **Graphics performance and determinism.** `3d-transforms-projection`, `gpu-rendering-pipeline` and `ray-tracing` use a canvas-2D software renderer at small fixed resolution (K3-20): no WebGL, no new dependency, smoke stays deterministic. Watch frame cost (ray tracing especially): the batch test asserts a per-frame budget, and `ray-tracing` renders on demand and on change, not in a loop.
- **ML correctness and overclaiming.** B13 and B18 compute everything with K3-19 and K3-18, test `gradCheck`, and label every toy. Tokenisation is a real BPE on a small seeded corpus, not a claim about any production tokenizer. `llm-agents-tool-use` and `rag-pipelines` use scripted, labelled "model" outputs and say so on screen; no real model name, price, context size or benchmark appears unhedged (AC-0/T3 #21, #22).
- **Payload-free security (B25, B28, B29, B23).** `fuzzing`, `redos`, `ddos-mitigation`, `timing-side-channels`, `ssrf-access-control` and `sandboxing-isolation` are the dangerous ones. Reviewers reject any working attack string, evil-regex catalogue, exploit step, botnet recipe, timing-attack tool or internal-address list. ReDoS shows step counts on benign strings; DDoS is a simulated victim and rates only; timing differences are simulated, never measured on the learner's machine against a real target. Full review of B25 and B28 before merge.
- **Time and clock claims.** `physical-clocks-skew` (NTP behaviour, leap seconds, drift figures) and `adaptive-streaming`/`bgp`/`quic` facts are from memory: hedged, chipped, and in the domain-review list.
- **Hard-to-test real-world behaviour.** `query-planning` and `join-algorithms` print what real planners print; only SQLite is checkable in tests. Everything else is chipped "shown, not run" (§4 testing conventions).
- **Tier inversion on the nine registered Tier 4 edges** (§1.5). Until the owner decides (§7.3), the plan keeps the Tier 4 labels and treats the edges as soft links.
- **Kit surface.** 21 kit items plus 5 tooling tickets is more than Tier 2's 16 kit pieces plus 5 tooling tickets. Mitigations are the same: P0-a/P0-b split, kit rounds timed to the first user, and the rule that a piece with no second user by its stated wave folds back into its lesson. Six items are extractions (K3-4, K3-5, K3-9, K3-13, K3-14, K3-15) with pixel-identical gates; those are the ones most likely to go wrong silently.
- **Retrofit finds Tier 1-style majors.** The 12 existing lessons were built before any test or lint existed. R1 and R2 are in waves 1 and 2 so fixes land before dependants ship; a false claim in `isolation-levels` or `cap-theorem` is the likeliest.
- **Lead and ethics lessons are opinion.** B2 and B31 label every claim (AC-0/T3 #24). The risk is not a wrong number but an unlabelled opinion presented as fact.
- **Merged lessons grow.** `segment-trees` now carries the Fenwick tree and `exactly-once-myth` carries Two Generals. If either spec needs more than about five scenes, the spec splits the extra scene into an "advanced" tab, not a second lesson.

### 7.2 Tracker rows to add to `rollout-plan.md` §4.1

Replace the three Tier 3 rows with the following (the coordinator pastes them in):

```
| 3 | Kickoff: K3-1 to K3-14 (P0-a, P0-b), K3-T1 to K3-T5 | — | pre | kit owner | not started | docs/tier3-plan.md §4 |
| 3 | T3-R1 Retrofit part 1 (cap-theorem, replication, isolation-levels, load-balancing, observability, event-sourcing) | 6 | 1 | t3/r1 | not started | domain review: cap-theorem, replication, isolation-levels |
| 3 | T3-B1 Statistics & queues | 5 | 1 | t3/b1 | not started | |
| 3 | T3-B2 Design docs & craft | 5 | 1 | t3/b2 | not started | lead-grammar pilot |
| 3 | T3-B3 Contracts & domains | 5 | 1 | t3/b3 | not started | |
| 3 | P-follow-up after wave 1 (K3-15 ScenarioStory) | — | 1→2 | kit owner | not started | |
| 3 | T3-R2 Retrofit part 2 (consistent-hashing, sharding, circuit-breakers, cdn-edge, monolith-microservices, oauth-flows) | 6 | 2 | t3/r2 | not started | domain review: oauth-flows |
| 3 | T3-B4 Time & consistency | 5 | 2 | t3/b4 | not started | all domain review; distSim pilot |
| 3 | T3-B5 Performance & delivery | 5 | 2 | t3/b5 | not started | |
| 3 | T3-B6 Operating the service | 5 | 2 | t3/b6 | not started | |
| 3 | P-follow-up after wave 2 (K3-16, K3-17) | — | 2→3 | kit owner | not started | |
| 3 | T3-B7 Query engine | 5 | 3 | t3/b7 | not started | |
| 3 | T3-B8 Computation toys | 5 | 3 | t3/b8 | not started | manipulable-toy pilot |
| 3 | T3-B9 Graph algorithms | 5 | 3 | t3/b9 | not started | |
| 3 | P-follow-up after wave 3 (K3-18) | — | 3→4 | kit owner | not started | |
| 3 | T3-B10 Information & matrices | 5 | 4 | t3/b10 | not started | |
| 3 | T3-B11 Streams & search | 5 | 4 | t3/b11 | not started | |
| 3 | T3-B12 Balanced trees & range queries | 5 | 4 | t3/b12 | not started | |
| 3 | P-follow-up after wave 4 (K3-19) | — | 4→5 | kit owner | not started | |
| 3 | T3-B13 Neural nets to transformers | 5 | 5 | t3/b13 | not started | |
| 3 | T3-B14 Analytics storage | 5 | 5 | t3/b14 | not started | |
| 3 | T3-B15 Geometry & strings | 5 | 5 | t3/b15 | not started | |
| 3 | T3-B16 Kernel & I/O | 4 | 5 | t3/b16 | not started | |
| 3 | P-follow-up after wave 5 | — | 5→6 | kit owner | not started | |
| 3 | T3-B17 Durability & change | 5 | 6 | t3/b17 | not started | |
| 3 | T3-B18 RAG, agents & recommenders | 5 | 6 | t3/b18 | not started | |
| 3 | T3-B19 Algorithm techniques | 5 | 6 | t3/b19 | not started | |
| 3 | P-follow-up after wave 6 | — | 6→7 | kit owner | not started | |
| 3 | T3-B20 Coordination & scale patterns | 5 | 7 | t3/b20 | not started | |
| 3 | T3-B21 Parallelism | 5 | 7 | t3/b21 | not started | |
| 3 | T3-B22 Language semantics & numeric traps | 4 | 7 | t3/b22 | not started | |
| 3 | T3-B23 CPU & memory | 5 | 7 | t3/b23 | not started | |
| 3 | P-follow-up after wave 7 | — | 7→8 | kit owner | not started | |
| 3 | T3-B24 Regex & parsing theory | 5 | 8 | t3/b24 | not started | |
| 3 | T3-B25 Access & keys | 5 | 8 | t3/b25 | not started | payload-free review |
| 3 | T3-B26 Routing & the internet | 5 | 8 | t3/b26 | not started | |
| 3 | P-follow-up after wave 8 (K3-20, K3-21) | — | 8→9 | kit owner | not started | |
| 3 | T3-B27 Pixels & signals | 5 | 9 | t3/b27 | not started | |
| 3 | T3-B28 Hostile input & supply chain | 5 | 9 | t3/b28 | not started | payload-free review |
| 3 | P-follow-up after wave 9 | — | 9→10 | kit owner | not started | |
| 3 | T3-B29 Resilience patterns | 5 | 10 | t3/b29 | not started | |
| 3 | T3-B30 Cloud & the live web | 5 | 10 | t3/b30 | not started | |
| 3 | T3-B31 Leading engineers | 6 | 10 | t3/b31 | not started | |
| 3 | Tier 3 close-out kit round | — | 10→QA | kit owner | not started | |
| 3 | **Tier 3 sign-off** | 166 | — | | not started | 154 new + 12 existing (rollout-plan said 167 before the Fenwick merge) |
```

Also update §3.2's header line ("Validated count: 155 … ~31 batches") to **154**, and the "all 154 ship" sentence stays correct. Tier 4 is untouched: `leases-fencing` is already out of it, so its count stays 41 new.

### 7.3 Open questions for the owner

Only one is genuinely the owner's:

1. **Tier labels of seven registered Tier 4 lessons.** `raft`, `crdts`, `backpressure`, `multi-region`, `slos-error-budgets`, `probabilistic-structures` and `distributed-transactions` are built and registered as Tier 4, but nine Tier 3 topics list them as prerequisites (§1.5). A learner on the Tier 3 filter is sent to a Tier 4 card for background. **Recommendation: keep the Tier 4 labels** (they are advanced lessons; Tier 3 lessons stand on their own with a one-line recap, and the edges are soft links). The alternative is to re-tier those seven to Tier 3, which makes Tier 3 total 173, Tier 4 total 43, adds seven lessons to the Tier 3 retrofit (they have no tests either) and moves the Tier 4 retrofit forward. Say so if you want that; otherwise nothing changes.

Everything else (the Fenwick merge, batch composition, wave order, kit scope) is within the coordinator's remit and is decided above.

---

## Appendix A. Backlog topics whose "visual idea" is hard to animate and needs a manipulable toy

The animation alone teaches nothing here; the learner has to build, break or search. The spec for each must name the toy and the failing state (AC-0/T3 #23).

| Topic | Why animation alone fails | The toy | Where it can fail visibly |
|---|---|---|---|
| `halting-problem` (B8) | The proof is an argument, not a process; a diagram of "H(D)" is a slideshow. | A **diagonalisation table** the learner fills in: rows are programs, columns are inputs, cells say halts or not; they build the "opposite of the diagonal" row and see it can't match any row. A second scene runs a learner-written predictor against the diagonal machine `D` (via K3-17 `runTm`, with a step budget). | The learner's predictor is defeated by `D` on a concrete input; a run past the budget says "did not halt within N steps", never "never halts". |
| `chomsky-hierarchy` and the pumping lemma (B24) | Four language classes and an ∀∃ proof; the learner nods and learns nothing. | A **pumping game**: the lesson picks a language and a pumping length, the learner picks the split and the count, and the string leaves or stays in the language. Plus a class picker: type a language, a DFA, PDA or TM recogniser from K3-17 accepts or rejects strings. | The learner wins the game against a non-regular language and loses it against a regular one; the lesson says which and why. |
| `lambda-calculus` (B8) | Substitution is easy to say and hard to follow. | A **beta-reduction stepper**: click a redex to reduce it; Church numerals and booleans as built-ins; the learner builds `succ` and `add`. Capture-avoiding substitution is highlighted when an alpha rename is forced. | A reduction that would capture a variable is refused with the reason and offered the rename; a non-terminating term shows the step budget. |
| `turing-machines` (B8) | A table of states is dull until it is yours. | A **transition-table editor** (K3-17 `parseTmTable`) with a tape and head: the learner programs binary increment, then a palindrome check. | A wrong table is run, halts in the wrong place, and the tape shows it. |
| `pushdown-automata` (B24) | The stack is the whole idea. | A PDA stepper over a learner-edited string with the stack drawn; aⁿbⁿ accepted, aⁿb²ⁿ not. | The stack underflows or leaves symbols behind, and the rejection says which. |
| `parsing-algorithms` (B24) | LL and LR tables are opaque. | A **parse-table stepper** on a small learner-editable grammar: the stack, input and chosen table cell, step by step, with a conflict the learner can create. | Editing a rule creates a table conflict that is shown, not hidden. |
| `compiler-optimisations` (B22) | SSA and passes are structural, not temporal. | A **pass applier**: three or four passes (constant folding, dead code, CSE) the learner switches on in different orders, over a small IR with a CodePanel diff. | An order where a pass finds nothing, and one where it unlocks the next. |
| `metaprogramming-macros` (B24) | Syntax rewriting has no motion. | A **macro expander** over a toy expression syntax: the learner writes a rewrite rule and sees the expansion, including hygiene. | An unhygienic expansion captures a variable and the lesson shows the wrong result. |
| `eigen-pagerank`, `svd-pca` (B10) | Eigenvectors are not visible. | Drag a point cloud or a graph's edges; the dominant direction or the rank vector updates, and **power iteration is stepped** (K3-18). | A damping factor of 1 on a graph with a dead end shows rank leaking. |
| `fourier-transform`, `lossy-compression` (B27) | Frequency space is abstract. | Draw or pick a waveform and drag **harmonic sliders** until it matches; an 8×8 **DCT coefficient grid** where the learner zeroes coefficients and sees the block degrade (K3-21). | Zeroing the wrong coefficients shows blocking; the quality/size trade-off is computed. |
| `entropy-information` (B10) | Surprise is a feeling. | A **20-questions guessing game** against a seeded distribution, with the learner's average questions compared to the entropy. | A learner strategy worse than entropy is beaten by the optimal one, with the numbers. |
| `network-flow`, `bipartite-matching` (B9) | Augmenting paths and the min cut are search, not motion. | Drag the **cut line** across a flow network; the cut capacity updates; step the augmenting paths. | A cut larger than the max flow is shown beside it. |
| `3d-transforms-projection`, `gpu-rendering-pipeline`, `ray-tracing` (B27) | A pipeline of stages with no input to change. | Drag the **camera** and the near/far planes in a canvas-2D scene (K3-20); step a triangle through each pipeline stage; for rays, move a sphere and a light and watch which pixels trace to what. | Clipping against the near plane and a z-fight at a tight near/far ratio. |
| `consistency-models` (B4) | The definitions are about histories. | A **history checker**: the learner places reads and writes on a timeline per client and the lesson says whether it is linearizable, sequential, causal or eventual, with the violating pair highlighted. | A history that is sequential but not linearizable, and one that is neither. |
| `logical-clocks` (B4) | Clocks on a diagram are static. | A **message diagram editor**: drag messages between processes and watch Lamport and vector timestamps assign; ask whether two events are concurrent. | Two events with equal Lamport order that are concurrent under vector clocks. |
| `hypothesis-testing-ab` (B1) | p-values are a definition. | A **run the experiment 1,000 times** panel and a p-hacking scene: slice the data until something is "significant". | Peeking inflates the false-positive rate, measured. |
| `double-entry-ledgers` (B3), `threat-modeling` (B25), `privacy-engineering` (B28), `design-docs-rfcs` (B2) | Non-visual. | Post journal entries until the trial balance fails; draw a data-flow diagram and tag STRIDE per element; a k-anonymity grid the learner generalises; a document builder where the learner arranges sections and the reader-attention view shows what gets skipped. | An unbalanced ledger, an untagged trust boundary, a re-identified row, a doc whose decision is on page 4. |

Everything else in the tier animates naturally (queues, clocks on a timeline, replication, trees, graphs, memory, pipelines). If a spec author can't name a toy for a topic in this table, the topic goes back to the coordinator before it is built.
