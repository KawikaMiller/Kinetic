# Kinetic: working agreement

Interactive, animated software-engineering lessons. Vite + React 19 + TypeScript + motion.
See README.md for layout and the lesson recipe.

## Standing rule: reuse first, clean code always

- **Reach for a shared component before writing a new one.** Check `src/components/` and
  `src/core/` first. If two lessons need the same thing, it belongs in shared code, not
  copy-pasted into both.
- **Extract on the second use.** When you find yourself building something a lesson already
  has (a packet scene, a toggle, a stat row, a colour table), promote it to
  `src/components/` or `src/core/` and use it from both places. Don't leave a third copy for
  the next person.
- **Clean code over clever code.** Small focused components, descriptive names, no dead code,
  no commented-out code, no magic numbers without a named constant. Pure logic (simulations,
  frame builders, algorithms) lives in its own `.ts` file, separate from rendering.
- **Shared code changes are deliberate.** Changing a shared component affects every lesson that
  uses it. Keep the API backward compatible or migrate every caller in the same change, then
  run the full smoke test.

## Lesson contract

Each `src/lessons/<id>/index.tsx` default-exports a `LessonModule` (see `src/core/types.ts`):
`summary` (required; `watch` must describe the colours/shapes the visual actually uses),
`tryThis`, `keyIdeas`, `quiz`, `Stage`. Use semantic colour tokens (`--hi`, `--ok`, `--bad`,
`--info`, `--violet`, `--dim`) so colours mean the same thing in every lesson.

Captions: a frame without `say` keeps the previous caption. Only rely on that when the old
caption is still true; otherwise give the frame its own caption.

Be honest with the learner: if a visual scripts or simplifies something (e.g. a forced packet
loss), say so on screen.

## Shared kit

`docs/shared-api.md` lists every shared piece with usage. The durable rules:

- Colours: CSS uses tokens (`var(--hi)`, tints via `color-mix(in srgb, var(--hi) 14%, transparent)`,
  text on solid fills via `var(--on-hi)` etc.). Canvas uses `TOKENS` / `alpha()` from
  `core/palette.ts`; never a local hex table. New tokens go in `global.css` (and `palette.ts` if
  canvas needs them). A literal that truly can't be a token gets a same-line
  `allow-color: <reason>` comment.
- `kit.css` and `components/scene/scene.css` load globally from `main.tsx`: use their classes
  anywhere, no import needed.
- Live simulations use `useSimulation` (mutable world + throttled snapshot); canvas drawing goes
  through `core/canvas.ts` and lives in the lesson's `draw.ts`, sim logic in `sim.ts`.
- SVG actor/packet scenes compose `components/scene` (`SceneNode`, `Packet`, `Pulse`, `TravelDot`,
  `Flyer`). Custom shapes stay in the lesson but reuse the scene CSS classes.
- Formatting, hashing, randomness, maths and motion presets come from `core/format`, `core/hash`,
  `core/random`, `core/math`, `core/motion`. Don't re-declare `percentile`, `lerp`, FNV, springs.
- Lesson CSS class names are global: always prefix them with the lesson's own prefix.
- Lesson file convention: `frames.tsx` for frame builders with JSX captions, `sim.ts`/`model.ts`
  for pure logic, `draw.ts` for canvas drawing, `Stage.tsx` for React only.

## Verify before calling anything done

- `npm run build` (type-check + build) and `npm run lint`.
- `npm test`: Vitest over colocated `*.test.ts` files. Pure logic (`sim.ts`, `model.ts`,
  frame builders, core utilities) gets a test next to it; correctness claims a lesson makes
  ("round-trips for every value", "matches real JavaScript") are asserted here, not just eyeballed.
- `npm run smoke`: loads every lesson in a headless browser and fails on console errors or
  missing structure. Needs the dev server running (`npm run dev`, on 127.0.0.1:5317 by default
  because another local app owns 5199). A second checkout (e.g. a git worktree) runs side by
  side with `KINETIC_PORT=5341 npm run dev`, and the scripts follow it with
  `KINETIC_URL=http://127.0.0.1:5341`.
- Look at the screenshots; "no errors" is not "looks right".
- Refactors must be pixel-identical unless a change is deliberate. Capture a baseline on the
  untouched tree first (`npm run smoke -- --frames --label=base`: seeded `Math.random`, reduced
  motion, step players shot paused at their first/middle/last frame), then after the change
  `npm run smoke -- --frames --label=after <ids>` and `npm run diff -- base after <ids>`.
  `@live` shots of simulations are timing-dependent and only reported. `npm run captions`
  should match its baseline too.
- `npm run check-tokens -- --strict` must pass: no raw colour literals without an
  `allow-color` reason, no local copies of shared helpers.

## Gotchas already paid for

- No JSX in `.ts` files.
- Effect bodies must not return values: `useEffect(() => { window.scrollTo(0, 0); })`.
  Chromium's `scrollTo` returns a Promise, which React treats as a broken cleanup.
- Don't read `ref.current` during render (oxlint `react/refs`).
- For motion SVG attributes you animate, set the start value via `initial`, not as a plain attribute too.
- motion's `pathLength` breaks with `vector-effect: non-scaling-stroke`.
- Looping decorative motion (busy ripples, gate rings) goes through `Pulse`, which holds still
  under prefers-reduced-motion. Don't add a global MotionConfig: it would strip teaching motion.
- Never `outline: none` without a replacement focus style; the global `:focus-visible` ring is the default.
- React keys must be unique even when two items look identical at the same instant (e.g. two
  events while a sim is paused): key by a generated id, not by text + timestamp.
- Anything read from localStorage goes through `createPersistedStore` with a shape guard.
