# Tier 1 · Wave 1 status (paused for a restart)

Paused on 2026-09-30 at a safe point. All work is committed on the batch branches below;
the branches live in this repo's `.git`, so they survive even if the temporary worktree
folders don't. Specs and acceptance criteria: `docs/rollout-plan.md` §"Batch T1-B1/B3/B5".

| Batch | Branch | Last commit | Lessons |
|---|---|---|---|
| T1-B1 Bits & bytes | `t1/b1` | `a2184e1` (WIP) | binary-hex: in progress · twos-complement, floating-point, char-encoding, base64-encodings: not started |
| T1-B3 Memory & runtime | `t1/b3` | `b3561ac` (WIP) | value-vs-reference: in progress · stack-vs-heap, closures-scope, oop-fundamentals, memory-hierarchy: not started |
| T1-B5 Algorithm patterns | `t1/b5` | `6683e51` (WIP) | two-pointers: built, partly verified · sliding-window, prefix-sums, tree-traversals, graph-representations: not started |

WIP commits may not build on their own; nothing is merged into `main`.

## Where each in-progress lesson stands

- **binary-hex** (`t1/b1`): `model.ts` (base formatting/parsing, +1 ripple steps, rwx/RGB
  helpers, presets) and `model.test.ts` (12 tests; re-run them, the last one was added after
  the last run). `Stage.tsx`/`styles.css` drafted, never type-checked. `index.tsx` not
  written yet (so the lesson isn't discovered). Spec deviation: adds a 24-bit width so the
  `#FF8800` preset fits.
- **value-vs-reference** (`t1/b3`): pure memory model, six presets with on-screen code and
  captions, 13 tests that run each preset's code as real JavaScript and compare with the
  model. Left: `layout.ts`, `Stage.tsx` (minWidth ~900), `index.tsx`, `styles.css` (`vr-`).
- **two-pointers** (`t1/b5`): complete lesson (pair sum / palindrome / remove duplicates +
  pair matrix), 9 tests (500 seeded arrays vs brute force). Left: re-shoot after the last
  contrast tweak, drive the palindrome and dedupe scenes, smoke desktop + `--mobile`,
  captions, then replace the WIP commit with a final one.

## Resuming

1. If the worktree folders are gone: `git worktree prune`, then for each batch
   `git worktree add <dir> t1/b<n>` and junction `<dir>\node_modules` to the main repo's
   `node_modules` (never delete that junction recursively).
2. Give each worktree its own Vite dependency cache so it doesn't rebuild main's
   `node_modules/.vite` through the junction: a small untracked config that spreads the
   worktree's `vite.config.ts` and sets `cacheDir` (there is no `--cacheDir` CLI flag).
3. Ports: b1 5351, b3 5353, b5 5355 (`$env:KINETIC_PORT`), scripts via `$env:KINETIC_URL`.
4. Finish each batch per the plan's "done" list: build, lint, test, check-tokens --strict,
   smoke desktop and `--mobile`, captions, screenshots eyeballed, one commit per lesson.

## Phase 2 requests so far

- `ArrayStrip`: the in-range tint on idle cells is always `--hi`, ignoring the range's
  tone (two-pointers overrides it with a scoped 4-line rule). Tint with the range's colour.
- `core/format`: no helpers for very small/large durations (ns → years); memory-hierarchy
  needs `formatLatency(ns)` and `formatHuman(seconds)`.
