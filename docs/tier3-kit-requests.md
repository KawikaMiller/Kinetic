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

## From T3-R1 (retrofit report)
| Request | Users | Round | Notes |
|---|---|---|---|
| distSim `OpRecord` + `historyOf` (client-op log helper feeding the register-history checkers) | cap-theorem, replication (each wrote its own), consistency-models, quorums | wave 1 to 2 round (blocks wave 2) | add alongside the lane editor |
| 2-D roving-tabindex grid hook (arrow keys between cells) | isolation-levels matrix (20 local lines), likely authz-models, query-planning tables | when a 2nd user appears in a batch | |
| `ProvenanceRow` wrapper (the same flex-wrap chip row each lesson re-styles under its own class) | all R1 lessons and most D lessons | wave 1 to 2 round | tiny; avoids 50 copies |
| Documented `WideRegion reveal` pattern for step timelines | isolation-levels | docs only | |

## From T3-R2 and T3-B5 (builder reports)
| Request | Users | Round | Notes |
|---|---|---|---|
| Synchronous SHA-256 in `core` (core/crypto is async only) | oauth-flows (local 30-line pkce.ts now); extract when a 2nd lesson needs it | on second user | tested against node:crypto |
| Byte-oriented / BigInt FNV-1a in `core/hash` | sharding test re-implements it | on second user | check-tokens flags the offset-basis literal; test files may use `0x811c_9dc5n` |
| Shared `core/testing` wrapper for `node:crypto` (test tsconfig lacks node types) | oauth-flows tests, any crypto test | next kit round | same dynamic-import shim as core/testing/node.ts |
| Normalise `src/core/lessonContent.test.ts` line endings (CRLF in working tree, repo is LF-enforced) so BASELINE edits stop failing silently | all | next kit round | R2 found two lessons hidden by stale entries |
| Move `erlangC` from `queueing-theory/model.ts` to `core/` | capacity-planning (2nd user) | wave 2 to 3 round | |
| Move `nearestRank` from `percentiles-statistics/model` to `core/` | benchmarking-methodology (2nd user), B1 helpers (fmt, SeedField, seed, normalQuantile, drawSample) | wave 2 to 3 round | already queued from B1 |
| Fast inverse normal CDF in `core/distributions` (tail-latency has a tested Acklam approximation; the bisection one is too slow to sample with) | tail-latency, any sampler lesson | wave 2 to 3 round | |

## From the T3-B4 review (consistency-models, quorums, the clocks lessons, exactly-once-myth)
| Request | Users | Round | Notes |
|---|---|---|---|
| Promote `distributions/SeedField` (+ `seed.ts`, `seedField.css`) to `components/` (already queued from B1) | now also consistency-models, quorums (two scenes), physical-clocks-skew, logical-clocks, exactly-once-myth | Phase 2 kit round | Eleven lessons import `../distributions/SeedField`: the extract-on-second-use rule is long past; migrate every caller in one pixel-identical change. |
| `SequenceDiagram`: size `minWidth` from the smallest text it draws (the 11px `times` note), not from `SEQ.FONT` (12px) | consistency-models, quorums scene 3, any lesson passing `times: true` to `toSequence` | Phase 2 kit round | At 390px the notes render at 7.3px (8.5px at 768 with many lanes). The two lessons work around it by drawing only the lanes a run uses and, on a phone, turning `times` off (the times stay in their tables and sliders); the kit should size the note from its real font so a phone keeps them. |

## Spec corrections to carry
- T3-B5 capacity-planning: the M/M/c survival formula in the spec is wrong when theta = mu: the limit is (1 + C*mu*t)e^{-mu t} (equals the spec's only when C = 1). The model uses the correct form; fix the spec text.
- T3-B1 hypothesis-testing-ab: the spec's '14,748' is a truncation; ceil gives 14,749 (the lesson is right).

## From T3-B9 (builder report)
| Request | Users | Round | Notes |
|---|---|---|---|
| `useGraphEdits` (preset load, add edge/node with refusal messages, bounded counts, undo of added edges, scene-keyed notes) | shortest-paths-advanced, strongly-connected-components, network-flow, bipartite-matching, graph-coloring (each carries a ~50-line copy) and later graph lessons | wave 3 to 4 round | five users now: extract |
| `convexHull`/`hullPoints` in `core/geometry` (underlay hulls) | strongly-connected-components (local hull.ts, tested); convex-hull lesson (wave 5) is the natural 2nd user | wave 4 to 5 round | promote when convex-hull is built |
| SCC routine in `core` | strongly-connected-components (user one), markov-chains | on second user | |
| Kit-level default caption for player-less StageFrames | B9 fixed it per scene with `useIntroCaption` in six scenes | wave 3 to 4 round | avoids repeating the fix |
| `ProvenanceRow` margin inside the stage-pad (five lesson-CSS copies of `.xxx-stage ~ .provenance-row`) | B9 lessons | wave 3 to 4 round | tiny kit tweak |

## From the T3-B8 review (turing-machines, bytecode-vms)
| Request | Users | Round | Notes |
|---|---|---|---|
| `core/parse` `parseRows`: accept trailing `# comments` and exempt comment text from `maxLineChars`, or name the comment in the refusal ("a comment counts toward the 40/30 limit; comments must be whole lines") | turing-machines (40), bytecode-vms assembler (30), any lesson using `parseRows` | Phase 2 kit round | A comment over the limit is refused as "Line 8 is 63 characters; keep each rule to 40 or fewer." and a trailing `q1 1 -> 0 L q1 # carry` as "found 8 words", with no on-screen hint. B8 only states the limits in each editor's hint; the shared parser is untouched. |
