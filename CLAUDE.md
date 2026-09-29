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

## Verify before calling anything done

- `npm run build` (type-check + build) and `npm run lint`.
- `npm run smoke`: loads every lesson in a headless browser and fails on console errors or
  missing structure. Needs the dev server running (`npm run dev`, pinned to 127.0.0.1:5317
  because another local app owns 5199).
- Look at the screenshots; "no errors" is not "looks right".

## Gotchas already paid for

- No JSX in `.ts` files.
- Effect bodies must not return values: `useEffect(() => { window.scrollTo(0, 0); })`.
  Chromium's `scrollTo` returns a Promise, which React treats as a broken cleanup.
- Don't read `ref.current` during render (oxlint `react/refs`).
- For motion SVG attributes you animate, set the start value via `initial`, not as a plain attribute too.
- motion's `pathLength` breaks with `vector-effect: non-scaling-stroke`.
