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

**Colour meanings, tier-wide.** A learner moving between lessons should never have to relearn
what a colour means:

| Token | Means | Not for |
|---|---|---|
| `--bad` | error, failure, removed/lost, or the costly side of a comparison | a plain category (a bit field, an event type, a lane) |
| `--ok` | success, found, done, the cheap side of a comparison | a plain category |
| `--hi` | what's happening *now*: the current step, the item being looked at; also a set bit (bit = 1) in the bit lessons, the bit that is "lit" | a status or a category |
| `--info` | secondary or in-flight: a request travelling, a second pointer | |
| `--violet` | tertiary or structural: references, groupings, the third role | |
| `--dim` | ruled out, inactive, not reached | |
| `muted` (Tone) | plain readable grey, deliberately uncoloured: a working row, a neutral extra bit | anything that should read as faded or ruled out (that's `--dim`) |

Plain categories (the fields of a float, lanes, layers) take the categorical tokens
(`--orange`, `--amber`, `--pink`, `--sky`, the track colours; as a shared component `Tone`
these are `orange`/`amber`/`pink`/`sky`, so BitStrip, CellGrid, ByteGrid etc. draw them directly) or the roles above in their
structural sense, never `--bad`/`--ok` as decoration. When two kinds of failure must be told
apart (HTTP 4xx vs 5xx), the second takes `--orange`, not `--hi`. State the mapping in the
lesson's `watch` text.

Captions: a frame without `say` keeps the previous caption. Only rely on that when the old
caption is still true; otherwise give the frame its own caption.

Be honest with the learner: if a visual scripts or simplifies something (e.g. a forced packet
loss), say so on screen.

**Security lessons are defensive and payload-free.** Teach the risk and the fix, never the
exploit: no working attack strings, injection payloads, exfiltration snippets (e.g. code that
collects storage and sends it somewhere), shell one-liners or step-by-step exploitation, on
screen or in source. Show the class of bug with ordinary inputs that break things by
accident (a surname like O'Brien breaking a glued-together query), describe in plain words
what an attacker *could* reach, and show the fix (parameters, encoding, argument arrays,
allow-lists, HttpOnly). Everything runs against a simulated system inside the lesson; never
inject into the real page, eval learner input or make network requests. Example secrets are
assembled at runtime from parts (`fakeSecret` from `core/fakeSecret`) so nothing in source matches a real credential format.

**Runtime code execution** (`new Function`, `eval`) is allowed only to run fixed,
lesson-authored program text, as error-handling-models does to make its trace real. Never
pass it anything derived from user input: a learner-typed expression gets a hand-written
evaluator over a documented safe subset (as debugger-tools does), not `eval`. Tests may run
on-screen snippets as real JS freely. Note that runtime execution needs `'unsafe-eval'`, so a
strict Content Security Policy would break those lessons; comment every call site saying why
it's safe.

**Tier 3 lessons carry extra rules: read AC-0/T3 in `docs/tier3-plan.md` §3 before writing one.**
Two to know by heart. A lesson that simulates nodes, messages, clocks or transactions tests its
safety property as an invariant over at least 200 seeded fault schedules (delay, loss,
duplication, partition, crash, clock skew) with the `core/distSim` harness (K3-8), never by screenshot,
and its "broken" mode must violate the invariant on a named seed (AC-0/T3 #20). Anything
simulated, illustrative, scripted, a toy, quoted from memory or shown without being run wears the
`Provenance` chip from `components/ui` at the moment it matters, and every domain-reviewed lesson
has at least one (#21). `lessonContentT3.ts` lints the mechanical rules (unscoped absolutes in key
ideas and quiz `why`, exempted per line with `allow-absolute: <reason>`; a missing chip; fewer
`try-this N:` tests than try-this entries) on Tier 3 lessons only.

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
- Recurring bits of UI already exist: preset chips are `ChipButton`, a program's printed output is
  `ConsolePanel`, a learner-typed list is `core/parse` `parseIntegers` and one bounded number field is
  `parseBoundedInt` / `parseBoundedBigInt` (refusal messages included), ns/long spans are
  `latency`/`humanDuration`, exponents are `power(k)`. Memory scenes lay out with `stackBoxes`/`fanBend`,
  not local loops. Real-DOM measurement is `core/useMeasure`. Clickable code lines (breakpoints) are
  `CodePanel onLineClick`; commit histories with parallel work use `depthColumns` + `laneLabel`.
- Text renders as typed: ligatures are off app-wide (`>=` never becomes `≥`), and superscripts are
  real font glyphs. Never re-enable ligatures, and don't hand-roll `<sup>` for exponents.
- Lesson CSS class names are global: always prefix them with the lesson's own prefix.
- Lesson file convention: `frames.tsx` for frame builders with JSX captions, `sim.ts`/`model.ts`
  for pure logic, `draw.ts` for canvas drawing, `Stage.tsx` for React only.
- Phones (390px) are a first-class target. Wide visuals never shrink below a readable scale and
  never push the page sideways: give the `StageFrame` a `minWidth` (the narrowest width where the
  drawing still reads; `minWidthForText(W, smallestTextPx, { floor?, padX? })` from `core/scale` computes it for the
  8px text floor) and on narrower screens the stage scrolls sideways inside itself with an affordance. If only part of the stage is wide (a diagram above HTML that can reflow), wrap just
  that part in `WideRegion` instead, so the rest fits the phone. HTML controls and panels wrap
  (`flex-wrap`), never `nowrap` rows that can outgrow a phone. Don't build per-lesson narrow layouts
  unless a scroll genuinely doesn't work.

## Verify before calling anything done

- `npm run build` (type-check + build) and `npm run lint`.
- `npm test`: Vitest over colocated `*.test.ts` files. Pure logic (`sim.ts`, `model.ts`,
  frame builders, core utilities) gets a test next to it; correctness claims a lesson makes
  ("round-trips for every value", "matches real JavaScript") are asserted here, not just eyeballed.
- `npm run smoke`: loads every lesson in a headless browser and fails on console errors or
  missing structure. Needs the dev server running (`npm run dev`, on 127.0.0.1:5317 by default
  because another local app owns 5199). A second checkout (e.g. a git worktree) runs side by
  side with `KINETIC_PORT=5341 npm run dev`, and the scripts follow it with
  `KINETIC_URL=http://127.0.0.1:5341`. The scripts check that the server they reach serves
  *their own* checkout (the dev server answers `/__kinetic_root` with its project root) and abort
  with both paths named when another checkout owns the port; restart the right server rather than
  setting `KINETIC_SKIP_ROOT_CHECK=1`.
- `npm run smoke -- --mobile` must pass too: at 390x844 it fails on page overflow, content the
  stage frame clips, and scene (SVG) text rendered under 8px. Look at the 390px screenshots of
  anything you touched, and check 768px as well.
- Look at the screenshots; "no errors" is not "looks right".
- Refactors must be pixel-identical unless a change is deliberate. Capture a baseline on the
  untouched tree first (`npm run smoke -- --frames --label=base`: seeded `Math.random`, reduced
  motion, step players shot paused at their first/middle/last frame), then after the change
  `npm run smoke -- --frames --label=after <ids>` and `npm run diff -- base after <ids>`.
  `@live` shots of simulations are timing-dependent and only reported. `npm run captions`
  should match its baseline too.
- `npm run check-tokens -- --strict` must pass: no raw colour literals without an
  `allow-color` reason, no local copies of shared helpers, no anonymous inline springs
  (`transition={{ type: 'spring', … }}`: use a `SPRING` preset or a named constant).
- Check builds and type-checks by **exit code**, never by grepping the output for "error"
  (a lesson is literally called error-handling-models), and don't pipe a command into
  `Select-Object -First` before reading `$LASTEXITCODE`: cutting the pipe loses the code.
- Keyboard: drive real key presses with `npm run shot -- <route> <name> --press=Tab,Tab,Space`
  (`--press-on=<selector>` focuses something first, SVG elements with a tabindex included; modifiers
  join with `+`, e.g. `Shift+Tab`). It prints the element that ends up focused, so a focus-order check
  needs no throwaway script. Captions cross-fade, so a fast read after a click or key can catch the
  outgoing one: pass `--settle` (or `--settle=<ms>`) to wait out the fade after every click/press/play,
  and in an `--evalfile` drive script `await window.kineticCaptionSettled()` before reading `.caption-text`.
- In Git Bash, set `MSYS_NO_PATHCONV=1`: it rewrites `/lesson/x` into a Windows path. The
  scripts warn and recover the route when they spot it, but don't rely on that.

## Gotchas already paid for

- No JSX in `.ts` files.
- Effect bodies must not return values: `useEffect(() => { window.scrollTo(0, 0); })`.
  Chromium's `scrollTo` returns a Promise, which React treats as a broken cleanup.
- Don't read `ref.current` during render (oxlint `react/refs`).
- oxlint `react/only-export-components` treats any uppercase arrow helper (`const P = (…) => …`)
  as a component, and once it has one it flags every other export in the file. Name such helpers
  in lowerCamelCase or move them out of a file that exports non-components.
- For motion SVG attributes you animate, set the start value via `initial`, not as a plain attribute too.
- motion's `pathLength` breaks with `vector-effect: non-scaling-stroke`.
- Reduced motion is split on purpose: `main.tsx` wraps the app in `MotionConfig reducedMotion="user"`
  (page chrome and the quiz respect the OS setting), and `LessonPage` resets stages to `"never"`,
  because teaching motion must still play. Don't move either boundary. Inside stages, looping
  decorative motion (busy ripples, gate rings) goes through `Pulse`, which holds still under
  prefers-reduced-motion.
  Error-feedback shakes go through `useShake()` (core/useShake.ts) for the same reason; don't
  write `animate={x ? SHAKE : …}` or gate on `useReducedMotion` by hand.
- Never `outline: none` without a replacement focus style; the global `:focus-visible` ring is the default.
- React keys must be unique even when two items look identical at the same instant (e.g. two
  events while a sim is paused): key by a generated id, not by text + timestamp.
- Anything read from localStorage goes through `createPersistedStore` with a shape guard.
