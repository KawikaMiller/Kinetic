# Kinetic

Software engineering concepts as interactive, animated visuals: algorithms, networking,
architecture, distributed systems. Each lesson is something you play, pause, rewind and poke,
with short captions instead of walls of text.

## Run it

```sh
npm install
npm run dev      # http://localhost:5317  (KINETIC_PORT=5341 npm run dev for a second checkout)
npm run build    # type-check + production build into dist/
npm test         # Vitest unit tests (src/**/*.test.ts and the dev scripts' rules)
npm run smoke    # every lesson in a headless browser (needs the dev server)
npm run shot -- /lesson/sorting s --press=Tab,Space   # screenshot one route, optionally after key presses
```

On Windows Git Bash, run the scripts with `MSYS_NO_PATHCONV=1`; otherwise Git Bash rewrites
`/lesson/x` into a Windows path (the scripts warn and recover when they notice).

## Tiers

| Tier | Name         | Audience          |
| ---- | ------------ | ----------------- |
| 1    | Foundations  | Intern · Junior   |
| 2    | Practitioner | Mid-level         |
| 3    | Architect    | Senior            |
| 4    | Strategist   | Staff · Principal |

The full roadmap lives in `src/core/curriculum.ts`. Topics without a lesson folder show as
"planned" on the home page. Topics belong to one of 14 tracks, grouped into four families
(Computing, Systems, Delivery, Product & people) for the home-page filter; the rollout order
is in `docs/rollout-plan.md`.

## Project layout

```
src/
  core/
    curriculum.ts   tiers, track families, tracks and every topic on the roadmap
    topicFilter.ts  the home-page filter (all / family / track) and its URL encoding
    lessons.ts      auto-discovers src/lessons/*/index.tsx (lazy-loaded)
    usePlayer.ts    step-through player: play/pause/step/scrub/speed + keyboard
    hooks.ts        useLoop (rAF), useCanvas, useElementSize, small utils
    caption.ts      caption context (the subtitle strip under each stage)
    progress.ts     "learned" state in localStorage
  components/
    StageFrame.tsx  standard lesson layout: stats/legend → visual → caption → transport → controls
    Transport.tsx   player controls
    ui.tsx          Button, Slider, Segmented, Legend, Stat
    Quiz.tsx        quick-check questions
  lessons/<id>/     one folder per lesson
  pages/            Home and LessonPage (home/ holds the track filter, tier sections, cards)
  styles/global.css design tokens and shared styles
```

## Adding a lesson

1. Make sure the topic exists in `src/core/curriculum.ts` (id, tier, track, title, tagline).
2. Create `src/lessons/<id>/index.tsx` that default-exports a `LessonModule`:

   ```tsx
   const lesson: LessonModule = {
     Stage,                 // the interactive visual
     summary: {             // the overview shown above the visual
       tldr, what, analogy?, useCases: ['…'], why, watch,
     },
     tryThis: ['…'],        // prompts to poke at the visual
     keyIdeas: ['…'],       // 3-4 one-liners worth remembering
     quiz: [{ q, options, answer, why }],
   };
   export default lesson;
   ```

3. Build `Stage` from `<StageFrame>`. Pick whichever of these fits:
   - **Step-through algorithms:** precompute an array of frames (each with a `say` caption),
     memoize them, and pass them to `usePlayer(frames)`. Hand the player to `<StageFrame player={…}>`.
     `binary-search` is the reference example.
   - **Live simulations:** use `useLoop` + `useCanvas` (or refs), and call `useSetCaption()`
     to narrate events as they happen.
4. Use the semantic colour tokens (`--hi`, `--ok`, `--bad`, `--info`, `--violet`, `--dim`) so
   meaning is consistent across lessons, and the `.hl` chips (`hl ok`, `hl bad`, …) in captions.

5. Write the `summary` before the visual. Every field stays short:
   - `tldr`: one sentence.
   - `what`: 2–3 sentences.
   - `analogy`: optional.
   - `useCases`: 3–4 real places the concept shows up.
   - `why`: why it matters at this tier.
   - `watch`: what the colours and shapes in *your* visual mean.

   It's required, so TypeScript won't build a lesson without one.

That's it. The lesson appears on the home page automatically.

Keyboard shortcuts in any lesson with a player: `Space` play/pause, `←`/`→` step, `R` restart.
