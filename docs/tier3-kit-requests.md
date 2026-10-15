# Tier 3 kit requests queue

Phase 2 requests from spec writers and builders, applied in the kit round named for each. Batches never edit shared code; misfits go here.

## From the spec phase (2026-10-15)

| Request | Users | Round | Source |
|---|---|---|---|
| `Zipf` sampler + generalised harmonic number in `core/distributions.ts` | fanout-feeds, hot-keys-skew, count-min-heavy-hitters | kickoff (added to K3-1) | specs part3, part4 |
| distSim node-level `pause(node, from, to)` and stable trace row ids | leases-fencing, LogStream consumers | kickoff (added to K3-8) | part4 |
| `ClaimLabel` chip (standard / research / practice / view / invented) | design-docs-rfcs, technical-debt, T3-B31 leads | kickoff (agent A) | part6 |
| `longestPrefixMatch` in `core/ipv4` | routing-algorithms, bgp, cloud-networking-vpc, vpns-tunneling | wave 7 to 8 round | part6 |
| Extract `dependency-management/semver.ts` to `core/semver` | supply-chain-security (2nd user) | wave 8 to 9 round | part6 |
| Extract `edit-distance` `editTable` to `core/editDistance` | supply-chain-security (Levenshtein) | wave 8 to 9 round | part6 |
| Extract `regex-engines` backtracking matcher + trace to `core/` | redos (2nd user) | wave 8 to 9 round | part6, plan |
| BVH inside `raster3d` (or local `bvh.ts`) | ray-tracing | K3-20 | part6 |
| BigInt `BitStrip`/`toBits` (core/bits is capped at 53 bits) | modular-exponentiation; promote only if chinese-remainder or entropy-information also need it | on second user | part4 |
| Shared k-means | vector-search (IVF scene) | on second user | part3 |
| `cross`/`orient` helper in `core/geometry` | convex-hull (exact BigInt test stays local) | on second user | part3 |
| `core/kdtree` | vector-search, spatial-indexes only if both want it | on second user | part3 |
| `core/huffman.ts` (extract from `huffman-coding/model.ts`, add `canonicalCodes(lengths)`; huffman-coding migrates pixel-identically) | entropy-information, lz-compression (same batch, so no local copies) | wave 3 to 4 round (blocks wave 4) | part2 |
| `eigen2x2(A)` added to K3-18 `core/linalg` (real or complex pair, eigenvectors, null when defective; `jacobiEigen` is symmetric-only) | eigen-pagerank, markov-chains | wave 3 to 4 round | part2 |
| Migrate `embeddings` local PCA to K3-18 `pca` | svd-pca is the 2nd user | wave 3 to 4 round | part2 |
| SCC routine in `core` | strongly-connected-components, markov-chains | wave 3 to 4 round if there is room | part2 |
| `core/flow.ts` | network-flow only so far; bipartite-matching redraws locally | only if a 3rd lesson needs max flow | part2 |

## From the T3-B1 review (batch 1 statistics lessons)
| Request | Users | Round | Notes |
|---|---|---|---|
| Move `distributions/fmt.ts` (`sig`, `pctText`, number formatting), `distributions/SeedField` (+ `seed.ts`, `seedField.css`), `normalQuantile` and `drawSample` (from `distributions/model`) into `core/` and `components/` | distributions (origin), percentiles-statistics, queueing-theory, hypothesis-testing-ab; back-of-envelope uses `fmt` only | Phase 2 kit round after batch 1 | Four lessons import these across lesson folders today (documented in the batch). Batches never edit shared code, so nothing was moved; the lessons keep importing `../distributions/...` until the extraction migrates every caller pixel-identically (`smoke --frames` + `diff`). |

## Spec notes to carry into the plan
- `markov-chains`: add registered `probability-basics` as a prerequisite (part2 recommendation).
- `webassembly` is narrower than its backlog row: hand-assembled bytes run through the real engine; the compile step is "shown, not run".
- `alerting-design` merges into `incident-response` if its spec can't carry a second manipulable (the plan's trigger); specs found three, so keep it unless the builder reports otherwise.

## From part5 (B21-B25)
| Request | Users | Round | Notes |
|---|---|---|---|
| **K3-22 `core/parseKit`**: tokenizer + one-rule-per-line row parser with positioned refusal messages (parseBounded* style) | regex-engines, parsing-algorithms, pushdown-automata, metaprogramming-macros, and K3-17 `parseTmTable` | before wave 8 (add to the wave 6 to 7 or 7 to 8 round; K3-17 may adopt it later) | four lessons in one batch need it, so AC-0/T3 #25 says build it first |
| **K3-23 `ClassifyBoard`**: assign items to labelled bins, keyboard-first, check + per-item reveal | undefined-behavior (wave 7, builds locally), chomsky-hierarchy, randomness-csprng (wave 8) | extracted in the wave 7 to 8 round | threat-modeling's drop-a-control interaction differs, stays local |
| Tone override for the memory kit's `HeapObject variant="freed"` (default `--bad`; a correct free should read `--ok`) | ownership-refcounting | optional; wave 6 to 7 round | small Phase 2 note |

## Decisions
- `regex-engines` builds the backtracker and trace; `redos` reuses it after the wave 8 to 9 extraction (as the plan says). The heavy nested-repeat comparison stays in `regex-engines` capped at 24 chars / 100,000 steps; `redos` adds the fixed benign patterns and never takes a learner-typed pattern.
- `chomsky-hierarchy` is the heaviest lesson: DFA minimisation goes in an "advanced" tab if it runs long, not a second lesson.
- `ssrf-access-control` names the metadata service by class, not its provider address; `timing-side-channels` uses an instrumented comparison and a simulated noise model with no guess loop.

## From part1 (B1-B5)
| Request | Users | Round | Assigned |
|---|---|---|---|
| `Provenance`/`ClaimLabel` claim kinds practice, one-view, research, standard | design-docs-rfcs, technical-debt, B31 leads | kickoff | agent A (as ClaimLabel) |
| Extract grpc-protobuf wire codec to `core/protobuf.ts` | schema-evolution (2nd user) | kickoff | agent B |
| Extract `debugger-tools/expr.ts` to `core/expr.ts` (+ ternary, exposed tree) | coverage-mutation-testing (2nd user) | kickoff | agent B |
| Extract memory-hierarchy `LEVELS` to `core/latencyLadder.ts` | back-of-envelope (2nd user) | kickoff | agent B |
| distSim register-history checkers (linearizable, sequential, causal, convergence) | consistency-models, quorums, R1 retrofit | kickoff (K3-8) | agent C |
| distSim `latency(rnd, from, to)` for asymmetric links | physical-clocks-skew (NTP) | kickoff (K3-8) | agent C |
| Shared lane editor (keyboard lanes, slots, add/move/select) | logical-clocks, consistency-models (same batch) | wave 1 to 2 round (blocks wave 2) | not yet assigned |
