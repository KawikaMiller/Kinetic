# Tier 2 · Wave 1 status (paused by the owner)

Paused on 2026-10-01 at a safe point. All work is committed on the branches below; the branches
live in this repo's `.git`, so they survive even if the temporary worktree folders don't. Nothing
is merged into `main` or pushed. Specs and acceptance criteria: `docs/rollout-plan.md` §3.1.

| Batch | Branch | Last commit | State |
|---|---|---|---|
| T2-B1 Bits & encoding | `t2/b1` | `ca2c1f6` (WIP) | bit-manipulation: code done, screenshots/captions/drive/keyboard not checked · endianness, error-detection-correction, adders-alu, sequential-logic: not started |
| T2-B2 Number theory & counting | `t2/b2` | `cab2fc5` (WIP) | modular-arithmetic: done and verified (`ba11e3b`) · gcd-euclid: `model.ts` only (no `index.tsx` yet) · primes-factoring, combinatorics, birthday-paradox: not started |
| T2-B3 Graph algorithms | `t2/b3` | `b11c1a2` | topological-sort: done and verified · union-find, minimum-spanning-trees, cycle-detection, relations-orders: not started |
| T2-R1 Retrofit, part 1 | `t2/r1` | `425083f` (WIP) | hash-table: done and verified (`7081d3f`) · graph-search: done, smoke/diff/captions/screenshots pending · trees-bst, heaps, dynamic-programming, lru-cache, rate-limiting, message-queues: not started |
| P0-b kit (K-13..K-19) | `t2/kitb` | `8734d08` (WIP) | automata, vec/fit/datasets, ConfusionMatrix + metrics, crypto additions: done and verified · GanttLanes + ci-pipelines migration: written, pixel identity unproven · SequenceDiagram, MemoryMap, docs section: not started |

WIP commits may not build or pass every gate on their own.

## Resuming

1. If a worktree folder is gone: `git worktree prune`, then `git worktree add <dir> <branch>`, and
   junction `<dir>\node_modules` to the main repo's `node_modules` (never delete that junction
   recursively). Give each worktree a private Vite cache: an untracked `vite.worktree.config.mjs`
   that spreads `vite.config.ts` and sets `cacheDir`.
2. Ports: b1 5391, b2 5392, b3 5393, r1 5394, kitb 5395 (`$env:KINETIC_PORT`, scripts via
   `$env:KINETIC_URL`).
3. `t2/r1` worktree has an untracked helper `src/lessons/heaps/zz-tmp-lint.test.ts` that breaks
   tsc there: delete it before running the gates (never commit it).
4. Each batch finishes per the plan's done list, one commit per lesson; then the coordinator
   merges, runs the full gates and the wave 1 → 2 kit round.

## Phase 2 requests so far

- CellGrid: draw cell text in canvas mode (>400 cells), e.g. mod-24 tables lose their numbers.
- core/parse: a bounded-integer parser with a refusal message (local in every number lesson).
- core/stats `collisionProbability`: use `-Math.expm1(...)` so tiny probabilities in 2¹²⁸-sized
  spaces don't round to 0 (needed by birthday-paradox).
- GraphView: `layoutEdges` (layer on a subset of edges so adding a back edge doesn't rearrange
  the drawing); route back edges / layer-skipping edges around nodes; `editable` edges-only mode.
- ArrayStrip `cellState` lacks info/violet states. TreeSvg clickable nodes need a roving tabindex.
- BitStrip: roving tabindex (32-bit mode puts 64 bits in the Tab order) and a "pending" bit state.
- Tones: no `amber`/`sky` Tone for parity bands.
- Tooling: Puppeteer `page.focus` can't focus SVG cells, so `shot --press-on` fails on SVG targets.
