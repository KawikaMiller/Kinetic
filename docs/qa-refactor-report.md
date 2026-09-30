# QA report: shared-kit refactor (d6cd406 → b5da8c9)

Independent regression pass by Sentry (QA), 2026-09-30. Old build = worktree of `d6cd406` served on
:5330; new build = HEAD `b5da8c9` on :5317. Nothing under `src/` or `scripts/` was modified; all
harness code and evidence lives in the session scratchpad (paths below, temporary).

## Summary

**The refactor is behaviourally sound.** Across ~1,230 scripted interaction paths per build (51 lessons),
there is exactly **one regression**, and it's cosmetic: the db-indexes "root" label lights up when
the root node is highlighted. Everything else that differs between the builds is either a
documented deliberate change (verified, see below) or harmless timing and phase noise that I traced to
its cause. No console errors on either build in any sweep, no leaked timers or rAF loops, no crashes
under rapid clicking, and back/forward works everywhere.

The shell (home, overview, quiz, transport, player keyboard handling, progress) is unchanged by the
refactor, and it behaves identically on both builds. It does have **pre-existing** problems, the
biggest being phone-width layout. They're listed so they don't get blamed on the refactor.

| Severity | Regressions | Pre-existing | Total |
|---|---|---|---|
| Blocker | 0 | 0 | 0 |
| Major | 0 | 1 | 1 |
| Minor | 0 | 6 | 6 |
| Cosmetic | 1 | 2 | 3 |

## How this was tested (and why you can trust the diffs)

- **Deterministic virtual clock.** Every page got a seeded `Math.random` plus a fake clock: `requestAnimationFrame`,
  `setTimeout`/`setInterval`, `performance.now` and `Date` only advance when the harness says so.
  So live canvas sims run frame-for-frame identically on both builds. Proof: new vs a second new run
  gave **0 text diffs and 0 pixel diffs**, and circuit-breakers old vs new gave a pixel-identical canvas.
  So any old/new difference is a real code difference, not flake.
- **Explorer sweep** (`scratchpad/qa/explore.mjs`): for every lesson, fresh load, then every control
  (buttons, segmented options, sliders at min and max, text fields typed and typed+Enter), plus every
  control *revealed* by a first click (second level: scene pickers, lanes, modes). After each path:
  caption, stats row, stage text, control inventory and selected state, a screenshot after 2.5 s and
  after 6.5 s, and for players a sweep of **every frame's** caption, stats and stage text. Old: 975
  paths, new: 972 (the gap: hash-table's field clears on Enter in new, so 3 fewer follow-up paths exist).
- **Stage-click pass**: every non-button element in the stage with a pointer cursor (SVG nodes, table
  rows, the CDN map canvas), clicked once and twice, with real mouse events.
- **Targeted scenarios** for interactions the generic pass can't reach: load-balancing server
  kill/revive on the canvas (incl. least-conn with a dead-but-healthy server, all servers dead, spike
  while all dead), graph-search wall drawing by drag, start-cell drag and all four algorithms, raft
  (crash the leader while paused, majority loss plus send, partition/heal), trees-bst node pick/delete.
- **60 s long runs** of all 12 live sims (default plus every button), caption and stats timeline every
  second, end-state pixel diff.
- Every surviving difference was then checked with a **settled replay** (pause, 5 s settle, finish
  animations) or a **real-time re-check** in a normal browser, because the virtual clock can't drive
  motion's WAAPI animations (see "Harness caveats").

## Findings

### F1 · Cosmetic · REGRESSION · db-indexes: "root" label turns bright when the root is highlighted

- **Steps:** open *Database Indexes* and pick *Index lookup*, *Range query* or *Insert a row* (or run the
  default). Step to the frame where the lookup visits the root node (one frame per operation).
- **Expected (old):** the small uppercase "ROOT" label beside the root node stays `--faint` (#5b6378).
- **Actual (new):** it renders in `--text` (#e8eaf0), bright white, on that frame.
- **Cause:** the refactor removed `!important` from `.ix-level` and replaced it with
  `.ix-node .ix-level` (specificity 0,2,0), but `.ix-node.hot text { fill: var(--text) }` is 0,2,1
  and wins while the root is `.hot` (`src/lessons/db-indexes/styles.css` lines 15-18). Fix: e.g.
  `.ix-node.hot .ix-level` or `.ix-node .ix-level.ix-level`.
- **Evidence:** measured fill on the root-hot frame, every operation: old `rgb(91, 99, 120)`, new
  `rgb(232, 234, 240)`. Image `scratchpad/qa-out/m-db.png` (old / new / diff); settled replays
  `scratchpad/qa-out/replay/{old,new,diff}/db-indexes/0.png`.
- **Note:** this is probably the "0.003% bar-end antialiasing in db-indexes" the batch-6 commit waved
  through. A 20-pixel diff can be a real colour change; look before dismissing.

### F2 · Major · pre-existing · Horizontal page overflow at phone width (390 px)

Six lessons make the whole page scroll sideways because a fixed-width row doesn't shrink:

| Lesson | Page overflow at 390 px |
|---|---|
| sql-basics | +266 px |
| arrays-linked-lists | +256 px (array row of 10 fixed cells) |
| probabilistic-structures | +230 px |
| hashing-encryption | +90 px |
| hash-table | +59 px |
| sharding | +28 px |

- **Steps:** 390×844 viewport, open the lesson, compare `document.documentElement.scrollWidth` with
  `innerWidth`.
- **Expected:** no horizontal scroll (the smoke test itself checks for this, but only at 1440 px).
- **Actual:** see the table. Measurements are identical on old and new.
- **Evidence:** `scratchpad/qa-out/responsive/{old,new}.json`, full-page shots
  `scratchpad/qa-out/responsive/new/<id>-390.png`, stage shot `scratchpad/qa-out/stageshots/arrays-linked-lists-new-390.png`.
- 768 px (tablet): no overflow, clipping or tiny controls in any lesson on either build.

### F3 · Minor · pre-existing · Phone width: unreadable SVG text and clipped stage content

- **Unreadable text:** SVG scenes scale their viewBox to the ~320 px stage, so text shrinks to
  **4 px** (web-request, client-server, ip-ports, oauth-flows, zero-trust) or **5 px** (auth-sessions-jwt,
  distributed-transactions, heaps, multi-region, tcp-udp), with db-indexes, monolith-microservices and
  trees-bst at 6 px. Evidence: `scratchpad/qa-out/stageshots/web-request-new-390.png`.
- **Clipped content:** git-internals' commit graph sits mostly off the left edge
  (labels span −82…204 px inside a 39…351 px box), so you can't see or click commits. cap-theorem
  and replication cut their client boxes off at the stage edges, and lru-cache's request tape
  overflows its row by 103 px. Evidence: `scratchpad/qa-out/stageshots/clip390.png`.
- Identical on both builds.

### F4 · Minor · pre-existing · Phone width: canvas sims overlap themselves

- load-balancing: the server cards are drawn on top of the LB hexagon and the client wires ("api-3"
  covers "LB"). message-queues: the "queue" and "head →" labels collide, and the depth sparkline runs
  into the dead-letter box.
- Evidence: `scratchpad/qa-out/stageshots/lb390.png` (old above, new below: same),
  `scratchpad/qa-out/stageshots/message-queues-new-390.png`.

### F5 · Minor · pre-existing · Wrong-shape localStorage values white-screen the app

- **Steps:** set `localStorage['kinetic:overview-open'] = 'null'` and open any lesson, or set
  `localStorage['kinetic:done']` to `'null'` or `'{}'` and open anything.
- **Expected:** `core/storage.ts` says it "never throws" and falls back to defaults.
- **Actual:** a blank page (React unmounts the whole root, no error boundary).
  `Cannot read properties of null (reading 'sorting')` in `Overview`, `done.includes is not a function`
  in `App`. `readJSON` only guards `JSON.parse` failures, not valid JSON of the wrong shape. (Invalid JSON like
  `{not json` is handled fine.) Recovery requires the user to clear site data by hand.
- Identical on both builds. Likelihood is low (storage edited by hand or by a future schema change), impact is total.

### F6 · Minor · pre-existing · Space on a focused control toggles playback instead of pressing it

- **Steps:** on any player lesson (sorting, oauth-flows, trees-bst, arrays-linked-lists…), Tab to a
  control such as the "Insertion" algorithm button and press **Space**.
- **Expected:** the focused button activates, as it does everywhere else on the web.
- **Actual:** the player's window key handler `preventDefault()`s Space for anything that isn't an
  input, so the button doesn't activate and playback toggles instead. Enter works. Keyboard users
  can't press controls with Space.
- Identical on both builds (`core/usePlayer.ts`, unchanged by the refactor). Suggest skipping when
  `e.target` is a `button`, `[role=radio]` or `a`.

### F7 · Minor · pre-existing · No focus indicator on sliders or the timeline scrubber

- Every `input[type=range]` (29 lesson sliders plus the scrubber on 34 player lessons) has
  `outline: none` from `global.css` and no replacement style, so keyboard focus is invisible.
- Everything else checked has a visible indicator: buttons use the browser's default focus ring, and the new
  TextField shows an accent border and ring. Verified by tabbing through every lesson's stage and
  comparing computed styles, plus zoomed screenshots (`scratchpad/qa-out/focus/`). Identical on both builds.

### F8 · Minor · pre-existing · raft: duplicate React keys in the event log

- **Steps:** *Raft*, wait for a leader, click **Pause**, then **Partition network**, **Heal network**,
  **Partition network**.
- **Actual:** console error "Encountered two children with the same key". Event rows are keyed
  `${e.t}-${e.text}`, and while paused `t` doesn't move, so two identical events collide. React may then
  drop or duplicate rows. The control storm hit it 130 times on old and 36 times on new.
- Identical on both builds.

### F9 · Cosmetic · pre-existing · Player keyboard hint shown on lessons with no player

- The side panel always shows "Space play/pause · ← → step · R restart", including on the 17 live-sim
  lessons (backpressure, cdn-edge, circuit-breakers, raft, …) where none of those keys do anything.

### F10 · Cosmetic · pre-existing · One-frame players get stuck showing "Pause"

- On an idle 1-frame player (trees-bst, hash-table, heaps, arrays-linked-lists, lsm-trees before an
  operation), Space or ▶ flips the button to ❚❚ "Pause (Space)" but nothing plays, and it stays that way.
  `usePlayer.play()` sets `playing` even when `last === 0`.

## Differences investigated and judged benign

These show up in any old/new diff. Each was traced to a cause and none is user-visible as a defect.

- **Snapshot phase in every `useSimulation` sim.** Old code snapshotted at `sim.now - last > 0.3`;
  `useSimulation` accumulates dt starting from `Infinity` (so it snapshots on the first frame). The world is
  identical (canvases pixel-identical in circuit-breakers, raft, rate-limiting and others after 60 s), but stat
  readouts sample different instants, e.g. backpressure "In queue 0 vs 1", load-balancing "Round
  robin 2.3 s vs 1.5 s" p99 label, message-queues "backlog 26 vs 27". Insight captions evaluate
  instantaneous stats, so which insight fires can differ at a given moment. circuit-breakers
  "bad day" matches for 40 s, then old re-fires "Retry storm" at 41 s while new keeps "Cascade".
- **observability**: old restarted its 400 ms tick whenever the incident changed (`[incident]`
  deps); `useInterval` keeps the phase. The first request after switching lands at a different
  moment and draws a different random outcome (error rate 31.8% vs 27.3% at the same instant).
  Undocumented but harmless.
- **graph-search**: re-picking the already-selected algorithm now restarts playback (explicit
  `player.restart()`). Old silently armed a play that fired on the next board edit. Consistent with
  the documented fix. Playback also starts one render earlier via `queueNext` (frame 108 vs 109 at the
  same instant).
- **raft**: the motion layer runs its own rAF loop, registered before the parent's step loop, so on
  code reading it probably draws one frame (16 ms) behind the sim. Invisible.
- **hashing-encryption**: symmetric keys and ciphertexts differ run to run on both builds. It's real
  `crypto.getRandomValues`, not a regression.
- **Timing of decorative motion** (zero-trust Pulse ring phase, spring mid-flight positions in
  binary-search, crdts flyers): every case settles to pixel-identical or was confirmed identical in real time.
- **Improvement:** every TextField now has an accessible name (`aria-label`); several inputs had none before.

## Deliberate changes confirmed working

- PKCE toggle "Off | On" and CDN toggle "No CDN | On" (order swapped, behaviour identical).
- http-basics control-row dividers; shared TextField look in trees-bst, hash-table,
  probabilistic-structures (placeholders and maxLength preserved).
- trees-bst key field: typing "45" now inserts 45 on Enter (old clamped it to 99). hash-table Enter
  inserts on both builds (old via a `<form>` submit).
- recursion fib-tree return frames now have their own captions ("fib(1) returns 1 to fib(2)…"),
  verified frame by frame in real time.
- tcp-udp quiet status captions: all 85 frame captions identical in real time.
- Reduced motion: **163** infinite animations running across the app on old vs **0** on new; teaching
  motion (players advancing, sims running) identical on both builds; multi-region's `mr-pulse` now holds still.
- Near-miss inks moved to tokens (e.g. hashing-encryption "SHA-256" pill text): tiny, intentional.

## Tested and found fine (both builds identical unless noted)

- **Lesson content:** overview, try-this, key ideas, quiz questions/options, breadcrumbs and footer
  text byte-identical in all 51 lessons.
- **Every control in every lesson** (975 / 972 paths, plus 160 stage-click paths and 95 sixty-second runs) with per-frame captions and stats: no unexplained
  differences beyond F1 and the benign list. Zero console errors or warnings from app code.
- **Canvas sims** (load-balancing, rate-limiting, message-queues, circuit-breakers, backpressure,
  cdn-edge, raft): sliders at extremes, every mode, spikes, crashes, poison messages, bad day/heal,
  purge, origin shield, canvas clicks (server kill/revive, edge selection), raft node crash/restart,
  60 s runs.
- **Keyboard shortcuts:** → steps +1, ← steps back, Space plays/pauses (no page scroll), R restarts,
  on all 34 players. **Typing in every TextField** (hash-table, hashing-encryption ×2, http-basics,
  probabilistic-structures, trees-bst) with " r1" and arrow keys never moves the player, and focus stays in the field.
- **Quizzes (all 51):** wrong answer shows "Not quite. Try another." and the right answer is still
  selectable; the right answer locks the other options; the score increments; completing marks the lesson learned
  (badge, footer button, progress pill, `kinetic:done` in storage).
- **Overview:** open by default when not learned; Hide persists across reload; Show re-opens;
  marking learned mid-visit doesn't collapse it; a learned lesson with no stored choice opens collapsed.
- **Home:** all 8 track filters (card counts per tier, "Nothing in this track" for empty tiers),
  Start → Continue CTA and counts after progress, tier progress bars, "✓ Learned" cards, card
  navigation.
- **Rapid clicking:** 60 random clicks, slider jumps and key presses 25 ms apart in every lesson: no errors
  except F8, and no blank stages.
- **Pause then reset:** backpressure Reset while paused stays paused and shows fresh stats; Resume
  runs again in every sim with a pause button.
- **Leaving mid-simulation:** start each lesson running, SPA-navigate to the next lesson, then home.
  Nothing from any lesson remains alive (only Vite's HMR ping and motion's frame loop, same as a fresh
  home page).
- **Back/forward:** back returns to the previous lesson with its stage rendered, forward re-opens the
  next lesson at scroll 0, on all 51.
- **Tablet (768 px):** no overflow, clipping or undersized controls anywhere.

## Could not test / not covered

- Real touch input and real mobile browsers (Chromium emulation of widths only; no touch events,
  no iOS Safari). F2-F4 may be worse on a real phone.
- Screen readers (only accessible names and focus visibility were checked).
- Firefox and Safari rendering (Edge/Chromium only).
- A production `vite build` bundle (both builds were compared on dev servers).
- Pixel comparison of motion's mid-animation frames: motion drives some animations through WAAPI on the
  real document timeline, which the virtual clock can't control. Those states were compared settled,
  or in real time.
- Sim runs longer than 60 s virtual time; memory growth over long sessions.

## Harness caveats (for whoever reruns this)

- The first time I started the old dev server it shared `node_modules/.vite` through the junction and
  re-optimized deps into the HEAD server's cache. I moved it to its own `cacheDir`
  immediately. The HEAD server kept serving fine (every sweep ran error-free), but give the second
  server its own `cacheDir` from the start.
- Caption reads under the virtual clock can be stale: `AnimatePresence mode="wait"` keeps the old
  caption until a real-time exit finishes. Every caption diff was re-verified in real time before being
  accepted or dismissed. Most early "diffs" were this.
- Too many parallel browsers exhaust local sockets (`ERR_ADDRESS_IN_USE`); keep to about 6.

## Evidence index (scratchpad, temporary)

Root: `C:\Users\Hawai\AppData\Local\Temp\claude\K--Programming-personalProjects\60e952a3-6f6e-4d52-b227-6526f33e5564\scratchpad\`

- Harness: `qa\qalib.mjs` (virtual clock, pixel diff), `qa\explore.mjs` (sweep / stage / replay /
  capsweep modes), `qa\compare.mjs`, `qa\scenarios.mjs`, `qa\longrun.mjs`, `qa\robust.mjs`,
  `qa\gaps.mjs`, `qa\responsive.mjs`, `qa\reduced.mjs`.
- Per-lesson diffs: `qa-out\compare-old-new\<id>.txt`, `qa-out\compare-stage-old-new\`.
- Raw data: `qa-out\explore\{old,new}\`, `qa-out\gaps\`, `qa-out\robust\`, `qa-out\responsive\`,
  `qa-out\reduced\`, `qa-out\longrun\`.
- Key images: `qa-out\m-db.png` (F1), `qa-out\stageshots\` (F2-F4), `qa-out\focus\` (F7).
