# Shared components refactor plan

Owner: engineering (Vector). Status: proposal, ready to execute.
Scope: all 51 lessons in `src/lessons/`, plus `src/core/`, `src/components/` and `src/styles/global.css`.
Goal: pay down the copy-paste from parallel lesson authoring **before** ~90 more lessons get built on top of it, per the "reuse first, clean code always" rule in `CLAUDE.md`.

The one-line version: most of the duplication is not in big components. It's in **colours, CSS rule shapes, tiny helpers and the same five motion snippets**. The big-component wins are real but limited: the packet-scene kit, the sim loop hook, the canvas kit, and a handful of display widgets. Build those, codemod the colours, and leave the one-off domain visuals alone.

---

## 0. How to read this

- Refs are `lesson/file:line` against the tree as audited (2026-09-29).
- **Worth it?** is judged against the 90-lesson backlog in `docs/curriculum-backlog.md`. That backlog is heavy on bit/cell grids (hw, math), charts (math, ml, ops) and actor/message diagrams (net, arch, sec). Things that pay off there get extracted even with only 2-3 current users. Things that are one-off domain drawings don't.
- "Pixel-identical" means the migration must not change the screenshot. "Deliberate change" means we accept a small visual change and say so in the batch notes.

---

## 1. Audit: duplicated patterns

### 1.1 Summary table (ranked by payoff)

| # | Pattern | Copies | Lessons (count) | Extract? |
|---|---|---|---|---|
| 1 | Hard-coded tints of token colours `rgb(255 209 102 / 0.14)` etc. | ~330 lines | ~45 | **Yes**, codemod to `color-mix(var(--tok) N%)` |
| 2 | Dark "ink on bright fill" hexes (`#1a1400`, `#04160d`, `#1f0508`, `#03202b`, `#150a33`/`#140c2b`, `#0a0c11`, `#0b0d12`) | ~60 | ~30 | **Yes**, `--on-*` tokens, codemod |
| 3 | Canvas `const C = {hex...}` colour table + categorical palettes + untokenised `#ff8c5a` | 6 tables, 8 palettes | ~20 | **Yes**, `core/palette.ts` + new tokens |
| 4 | Recurring CSS rule shapes: cell box, sub-panel, uppercase section label, hint text, dashed tray, tone chip, "solid active" state, canvas wrapper | 10-35 each | ~45 | **Yes**, shared utility classes |
| 5 | Actors + flying packet pills (SVG, player-driven) | 9 Packet copies, 8 NodeBox copies, 5 busy pulses | 9 | **Yes**, `components/scene/` |
| 6 | HTML %-positioned flyers | 5 | 5 | **Yes**, one `Flyer` component |
| 7 | Mutable sim in ref + `useLoop` + throttled snapshot + pause button | 7 | 7 | **Yes**, `useSimulation` + `PauseButton` |
| 8 | Canvas drawing helpers (`text`, `box`/`roundBox`, `dot`, wires, bars, bins, font strings) | 4-6 each | 6 | **Yes**, `core/canvas.ts` |
| 9 | Sim maths: percentile (5), capped history sampler (6), rolling window, rate-over-window, `lerp`/`ease`/`clamp01` (3-4), exp sample, particle travel | 3-6 each | 8 | **Yes**, `core/sim.ts` |
| 10 | Formatters: duration `fmt` (4 identical), `/s`, `%`, bytes, plural (~16 ad hoc), clock | 4-16 | ~25 | **Yes**, `core/format.ts` |
| 11 | FNV-1a hash (5 copies), mulberry32 (1), `pick` from array (~12 inline) | 5 / ~12 | ~15 | **Yes**, `core/hash.ts`, `core/random.ts` |
| 12 | Bar / meter track (`height; radius 99px; bg var(--line); > i fill`) | ~13 | ~11 | **Yes**, `<Bar>` |
| 13 | Code panel with highlighted current line | 5 | 5 | **Yes**, `<CodePanel>` |
| 14 | Sparklines / mini line charts | 8 | 8 | **Yes**, `sparkPoints` + `<Sparkline>` + `drawSpark` |
| 15 | Frame recorder (`get/set/snap`, patch-last-frame, defaults spread, transient resets) | 2 identical, ~12 similar | ~14 | **Yes**, `createRecorder`, opt-in |
| 16 | Controls: boolean-as-Segmented (10), numbers-through-Segmented (3), text inputs (6), multi-row controls (5), label+buttons groups (5), hint text (8), sub-scene pickers (3) | | ~25 | **Yes**, `Toggle`, `TextField`, `ControlGroup`, `Hint`, `ScenePicker`, Segmented widening |
| 17 | Captions: intro-on-mount effect (~17), fade-on-every-update noise (4 bad cases) | | ~20 | **Yes**, `useIntroCaption`, quiet mode |
| 18 | Motion presets: springs (~19 inline, 6 local `const spring`), shake (3), flip-number (3), pop-on-change (4), enter-from-left rows (5) | | ~15 | **Yes**, `core/motion.ts` + `<AnimatedValue>` |
| 19 | Web Crypto helpers + async-value hook | 2 files, 5 hook copies | 2 | **Yes** (small), `core/crypto.ts`, `useAsyncValue` |
| 20 | Tree node/edge SVG + depth/slot-to-pixel mapping | 3 | 3 | Yes, low priority, `<TreeSvg>` + `treeToPixels` |
| 21 | Slot strip with %-positioned items | 2 exact + 1 close | 3 | Yes, low priority, `<SlotStrip>` |
| 22 | Clickable comparison rows with a bar | 3-5 | 5 | Yes, low priority, `<CompareRows>` |
| 23 | SVG arrow markers (global ids, collide) / arched edge path | 2 / 3 | 4 | Tiny `<ArrowMarker>` + `archPath` |
| 24 | Tables | 5 | 5 | **CSS only** (`.data-table`), no component |
| 25 | Event-log strips | 5-6 | 6 | **Motion preset + CSS only**, no component |
| 26 | Lane/timeline layouts, step lists, key-value blocks | 2-4 | | **No** |

### 1.2 Colours and tokens (patterns 1-3)

**Tints.** About 330 lesson CSS lines hand-write a token's RGB with an alpha: `rgb(255 209 102 / 0.14)` is `--hi` at 14%. The alphas for the same meaning drift between 0.05 and 0.3 (the hi tint shows up as .05, .08, .1, .14, .16, .18, .2). Only `global.css` `.hl.*` (112-115), arrays-linked-lists, big-o, race-conditions, slos and hashing `.he-card` already use `--c` plus `color-mix()`. Histogram of alphas: 0.5 (30), 0.1 (27), 0.12 (25), 0.08 (24), 0.14 (19), 0.18 (17), 0.2 (16), then a long tail. Fixed tint tokens can't cover that spread, so `color-mix` at the **same** percentage is the right mechanical conversion.

**Ink on fill.** "Dark text on a bright token fill" is hand-picked per lesson:
- `#1a1400` on `--hi`: al, bs, heaps, bst, ht, rc, dp ×3, pb, sql, tx-acid, sharding
- `#04160d` on `--ok`: al, bs, sorting, heaps, bst, ht, dp, oauth, hashing
- `#1f0508` on `--bad`: al ×2, bst, rc
- `#03202b` / `#041018` / `#04121a` on `--info`: three different values (rc, dp, crdts, hashing)
- `#150a33` / `#140c2b` / `#1a1030` on `--violet`: three different values (heaps:41, lru:122, processes-threads:77)
- `#0a0c11` / `#0b0d12` on packets and pills: these are just `--bg`. Used by auth, client-server, oauth, ip-ports, web-request, zero-trust, tcp-udp, raft, tls, http-basics, graph-search, replication, cap-theorem.

**Canvas colour tables.** `const C = {...}` appears in load-balancing, cdn-edge, rate-limiting, message-queues, circuit-breakers and backpressure, each at `Stage.tsx:9-15`. RL, MQ, CB and BP are byte-identical. **Latent bug:** `C.line = '#323a4f'` is actually `--line-2`. `--line` is `#242a3a`. So every canvas "line" is a shade off from CSS `--line`. Only CDN uses the real value, inlined at 172.

**Untokenised colours used across lessons:**
- `#ff8c5a` (orange): web-request:17, load-balancing:15, cdn-edge:13, raft:16, observability `sim.ts:14`, event-sourcing:18, big-o `complexities.ts:25` + `Stage.tsx:75`, consistent-hashing:11, sharding:9, hashing `Picker.tsx:14` + css:279. That's 10+ lessons with no token.
- `#f7b538` = `--t3`, `#ff5d8f` = `--t4`: used as literals. Nobody references the `--t*` tokens outside the tier chrome, except git-internals.
- `#8fb8ff` soft blue: raft, observability, consistent-hashing.
- Map land: `#2a3246` (cdn) vs `#2c3448` (multi-region).

**Categorical palettes.** There are 8 near-identical arrays built from `info, violet, ok, amber, pink, orange, hi, sky`:
- crdts `crdt.ts:10`
- sharding `Stage.tsx:9`
- sql-basics `Stage.tsx:16`
- raft `TERM_HUES`
- consistent-hashing `COLORS`
- observability `SVC_COLOR`
- monolith-microservices `scenarios.tsx:34-37`
- event-sourcing projections

`slos-error-budgets/model.ts:29` hard-codes `#ff5d6c`, which is `--bad`.

### 1.3 CSS rule shapes (pattern 4)

| Shape | Canonical rule | Copies / where |
|---|---|---|
| **Cell box** | `background: var(--cell); border: 1px solid var(--cell-line); border-radius: 6-10px; font: 600 12-16px var(--mono); transition: background/border/color .25s` | ~17: al `.al-item span`/`.al-node`, bs `.bs-cell`, heaps `.hp-cell b`, ht `.ht-node`/`.ht-chip`, lru `.lru-slot`/`.lru-tape-chip`, sq `.sq-item`, rc `.rc-frame`, dp `.dp-mcell`/`.dp-cell`, gs `.gs-chip`, pb `.pb-bit`, lsm `.lsm-chip`, gi `.gi-obj-row`, bo `.bo-real-cell`, rep `.rep-log li` |
| **Solid active state** | `background: var(--hi); border-color: var(--hi); color: <ink>; box-shadow: 0 6px 18px -6px <hi .7>` | ~10 for hi, plus ok/bad/info siblings. The class names are chaos: `is-hi`, `mid`, `cmp`, `hi`, `probe`, `tone-active`, `st-active`, `current`, `just`, `hot`, `now` |
| **Tone chip / tinted box** | `color: var(--X); border-color: X/.4; background: X/.1` | iso-levels, tx-acid, containers, auth, event-sourcing, tcp-udp, crdts, race, lsm, pb, bs, sq, gi |
| **Sub-panel** | `padding: 10-14px; border-radius: 10-12px; border: 1px solid var(--line); background: <one of 4>` | 24 lessons use `rgb(10 12 17 / .55-.85)` or `rgb(18 22 34 / .85)`. The others use `var(--bg-2)` or `var(--panel)` for the same intent |
| **Section label** | `font-size: 11-13px; text-transform: uppercase; letter-spacing: .06-.14em; color: muted/faint` (+ faint lowercase suffix span) | 35 stylesheets. `.rc-label` = `.ct-label` and `.iso h4` = `.tx-panel h4` are byte-identical |
| **Hint text** | `font-size: 13px; color: var(--faint); align-self: center` | al, bs, bst, ix, gs, lb, cdn, raft, tx-acid `.tx-hint` |
| **Dashed tray** | `border: 1px dashed var(--line-2); background: var(--bg-2); border-radius: 10px` + label + empty text | heaps `.hp-out`, bst `.bst-out`, rc `.rc-stack`, lsm `.lsm-vs`, dp `.dp-stack`/`.dp-letters` |
| **Canvas wrapper** | `.x-canvas { position: relative; height: N }` + `canvas { display:block }` | lb, rl, mq, cb, bp. The mq, cb and bp stylesheets contain **nothing else** |
| **Focus ring** | `box-shadow: 0 0 0 3px rgb(255 209 102 / .18-.2)` | iso, tx-acid, sharding |
| **Stage padding** | `display: flex; column; gap; padding: 18-22px 20-24px` | sql, tx-acid, pt, he-lab, containers, wr, rep, ... |
| **Responsive collapse** | `@media (max-width: 800/860/900px) { grid-template-columns: 1fr }` | 7+ with three different breakpoints |

### 1.4 Actors + flying packets (patterns 5-6)

Four mechanisms exist. Two of them are copy-paste families. The other two are deliberately different.

**A. SVG, user-unit viewBox, player-driven `motion.g` pill (the big family).**

| Lesson | Packet | Node | Pulse | Differences |
|---|---|---|---|---|
| web-request `Stage.tsx:396-427` | pill 24h, `w = len*6.6+20`, 0.7 s, **stays at target**, draws a `pathLength` trail line | `ActorBox` 329-342 (rect + label + sub, `--c` tint when on), custom `BrowserBox` | 307-317 `r 30→80` | phase colour |
| client-server `268-288` | pill 22h, `w = len*6.4+20`, 1.15 s, **arrive-then-fade** `times [0,.62,.8,1]`, fail = die at midpoint+40 | inline rect nodes + custom hexagon LB + DB cylinder + `ClientBox` | none | |
| oauth-flows `294-308` | pill 24h, `len*6.2+22`, 1.4 s, arrive-fade `[0,.62,.82,1]` | `Node` 279-292 rect 184×54 + title/sub + busy | in Node | |
| auth-sessions-jwt `Flow.tsx:226-242` | pill 24h, `len*6.3+22`, 1.3 s, arrive-fade `[0,.65,.82,1]` | `NodeBox` 210-224 rect 160×52 | in NodeBox `r 40→90` | `Scale.tsx:96-120` re-inlines nodes instead of reusing NodeBox |
| zero-trust `246-273` | pill 22h, `len*6.2+20`, **multi-hop path**, staggered `delay`, denied = stop 82% + burst | `Node` 225-244 rect 152×50 | gate breathing ring | |
| ip-ports `407-433` | pill 24h, `len*7+22`, three variants: travel, **absorb** into a slot, **still** bounce | custom | | |
| distributed-transactions `202-229` | **outline** pill, `len*6.9+18`, stop at 70%, **via bus** waypoint | custom rect groups with chip | | |
| monolith-microservices `99-107` | **dot** (`motion.circle`), per-hop duration | `BoxView` | | |
| multi-region `288-352` | looping dots (`repeat: Infinity`, stagger), one-shot write dots | region groups | serving pulse `r 16→30`, conflict ring | |

CSS for the pill is identical across copies: `.xx-packet { filter: drop-shadow(0 4px 12px rgb(0 0 0 / .5)) }` and `.xx-packet-text { font: 700 10.5-11px var(--mono); fill: #0a0c11 }`. See auth:19-20, cs:49-50, oa:25-26, ipp:89-95, wr:96-102, zt:27-28. Node CSS is the same `rect { fill: var(--panel); stroke: var(--cell-line); 1.5 }` / `.on rect { stroke: var(--c|info); 2.5; fill: color-mix(... 10-12%) }` (wr:56-67, aj:7-14, oa:10-11, zt:18, cs:18-27). Edges `stroke: var(--line-2); 1.5; dasharray 4 6` and zone labels `600 10px mono; .14em; faint` are identical (cs:8/15, zt:3/11, wr:14/20, aj:3).

**B. HTML, %-positioned `motion.span`/`div` flyers.**
- **replication** `Stage.tsx:180-198` and **cap-theorem** `204-221`: near-identical. Both do `left/top %` from→to, `opacity [0,1,1,0]` or lost `[1,1,0]`, and duration = `INTERVAL * 0.8-0.85 / speed`. CSS `.rep-pkt`/`.cap-pkt` is identical, including `kind-*` backgrounds (rep:73-89, cap:80-96).
- **crdts** `240-253`: arc `y: [0,-22,0]`, per-message delay, `onAnimationComplete` drives the merge. `.cr-wire` `16.67%` is hard-coupled to `X = {A: 1/6, ...}` (Stage:39).
- **tls-handshake** `WirePill` 417-432: 1-D `left` from→to.
- **processes-threads** `.pt-ipc` 229-240: 1-D `left 6% → 74%`.
- **hashing-encryption** `Keys.tsx` `Card` spring, `.he-wire 14%` coupled to `X` (Keys:10).

**C. SVG from sim state + CSS transition: tcp-udp.** Leave alone. It's correct for a scrubbable sim and uses no motion.

**D. `layoutId` FLIP: sharding, event-sourcing markers.** Leave alone.

**Verdict.** Extract the SVG kit (Node, Packet, Pulse, TravelDot, pill width, scene CSS) and one HTML `Flyer`. The ~6 network/security lessons in the backlog will all want the SVG kit. Custom node shapes (browser window, hexagon LB, DB cylinder, region, gate) stay lesson-specific but reuse the CSS and `Pulse`.

### 1.5 Live simulations (patterns 7-9, 14)

**Loop pattern.** It appears in load-balancing, cdn-edge, rate-limiting, message-queues, circuit-breakers, backpressure and raft:
- lazy `ref ??=` world accessor
- `useLoop(..., !paused)`
- sync-React-state-into-world effects (LB 106-110, CDN 35-37, RL 96-104, MQ 86-94, CB 55-62, BP 55-57)
- snapshot throttled at 0.25-0.4 s
- "insight" caption cooldowns of 8-12 s
- `redraw()` at the end

**raft snapshots every frame** (`Stage.tsx:109`): a deep copy of logs and msgs at 60 fps into React state. That's the one real performance smell in the repo.

**Pause button** `{paused ? '▶ Resume' : '❚❚ Pause'}` is identical in 7 lessons (LB 277, CDN 330, RL 248, MQ 217, CB 167, BP 170, raft 176).

**Canvas helpers.**
- `text()`/`label()` with the mono-11 default: 4 identical copies (RL, MQ, CB, BP).
- `roundBox`: CB = BP byte-identical. RL/MQ `box` is the same plus a label.
- `dot`: LB and CB have no glow, RL has glow.
- `lerp`: LB, RL, CB. `ease`: LB, RL. `clamp01`: RL, CB, BP.
- Around 40 repeated font literals.
- Recurring sub-drawings: dashed wire, progress bar, tinted "bin", queue pipe, axis baseline.
- `textAlign` juggling.

**Sim maths.**
- `percentile`: 5 copies (LB, CDN, CB, BP, observability).
- Capped history sampler: 6 copies (LB, CDN, MQ, CB, BP, observability).
- Rolling window trim: 6.
- Rate over a window: 4.
- Exponential sample: 2.
- Particle `travel` by age: 4 (LB, RL, CB, CDN).
- `0.8` s fade constant: 4.

**Sparklines.** Six line charts, six implementations:
- LB SVG `LatencyChart`
- CDN inline canvas with magic `/79`
- MQ canvas with `/59`
- CB `drawChart`
- BP `drawLittle`
- observability SVG `Spark`

lru-cache has its own `Sparkline` too, and dp has `CallsChart` with a hard-coded 59. The maths is identical; only alignment, max floor and decoration differ.

**Not the same pattern:** observability, event-sourcing and multi-region use `setInterval` plus immutable state (3 copies → a `useInterval` helper is enough). event-loop writes DOM refs directly on purpose. big-o's race is a single `useLoop` → `setElapsed`.

### 1.6 Step-through display widgets (patterns 12, 13, 20-23)

- **CodePanel.** recursion `Code` (123-134, 1-based line numbers), lru-cache `CodePanel` (357-384, absolutely positioned `top:318px`), transactions-acid (426-437, states done/now/cut, CSS counter), race-conditions (222-233, ▶ gutter, past/ran/next), containers Dockerfile (261-269, pending/cached/built + trailing status). sql-basics `SqlLine` is inline tokens, not lines, so it stays.
- **Bar.** tx-acid `.tx-total-bar`, containers `Meter`/`.ct-boot`, sharding `.sh-load`, hashing `RaceBar`, hash-table `LoadMeter`, lru `.lru-compare-bar`, gs `.gs-score-bar`, ch `.ch-bar-track`, pb `.hll-mem-bar`, ix `.ix-bar`, big-o `.bo-lane-track`, rc `.rc-count`, cdn `.cdn-ttl`, event-loop `.el-bar`. About 14.
- **Tree SVG.** heaps (`nodePos` 159-165, render 171-199), trees-bst (layout `bst.tsx:74-88`, px map `Stage.tsx:122-124`, render 139-190), recursion (layout `frames.tsx:170-187`, px 190-191, render 199-240). They share the node CSS (circle `r 19-22`, `stroke-width 2`) and edge `.hot`. db-indexes (B+tree rects) and git-internals (lane graph) are different; exclude them.
- **SlotStrip.** arrays-linked-lists (131-152) and heaps (140-151) are near-identical, including CSS containers and `nth-child(CAP)` hacks coupled to TS constants (al css:42, heaps css:25). binary-search `Row` is close.
- **CompareRows.** lru `.lru-compare` (204-223) and gs `.gs-score-row` (149-172) are the same rule. ch `.ch-bar` is a third copy. LB chart keys and RL `rl-rows` are similar.
- **Arrow markers.** al (187-192) and dp (212-217) use global ids, so two instances on a page collide. `archPath` appears 3× (al 170-176, dp 114, pb 193).

### 1.7 Frame builders (pattern 15)

**Four shapes:**
- Recorder class: sorting `algorithms.tsx:37-69`, heaps `heap.tsx:26-54`.
- `recorder()` closure: db-indexes `btree.tsx:89-112` and lsm-trees `lsm.tsx:81-99` are character-for-character identical.
- Local `push`/`snap` + defaults spread: ~10 lessons.
- Declarative scripts: stack-queue, big-o, processes-threads.

**Two semantics:**
- Carry-forward with transient resets: auth Flow resets `msg/busy/verdict`; processes-threads resets `heapHot/touching/ipc/switching`.
- Fresh-from-defaults: Passwords, Keys, Scale.

"Patch the last frame" (`last.hold = 2; last.say = …`) appears 6+ times.

**Hand-rolled `queueNext`.** lru-cache (`pendingSeek`, 126-142) and graph-search (`pendingPlay`, 151-166) reimplement what `player.queueNext({ play, from })` already does.

### 1.8 Controls (pattern 16)

- **Boolean via two-option Segmented** (10 copies): web-request ×3 (229-255), oauth ×3 (160-162), cdn ×2 (307-324, with inconsistent on/off order), recursion (100-110), hash-table (286-294), race-conditions (119-128), containers (391-408), http-basics If-None-Match (208-216).
- **Button whose label flips = toggle:** multi-region residency (259), raft partition (172-174), observability (283-285), crdts `.cr-net` (297), big-o legend chips (80-94).
- **Numbers squeezed through `Segmented<T extends string>`:** probabilistic-structures (340-349), dynamic-programming (84-89), big-o (125-133).
- **`LIST.map(x => ({ value: x.id, label: x.label }))`:** LB 260, RL 242, CB 161, BP 158, event-loop 66.
- **Text inputs** (6 lessons, all differently styled and with different Enter behaviour):
  - trees-bst `.bst-field` (78-87): number, Enter does nothing
  - hash-table `.ht-form` (260-284): Enter = Insert
  - probabilistic-structures `.pb-form` (150-160): Enter = Query
  - hashing `HashLab` (130-133)
  - auth `Tamper` (112)
  - http-basics `.hb-input` (183-195)

  There are three different focus styles and no global input style.
- **Multiple control rows** as `<><Controls/><Controls/></>`: http-basics ×3, probabilistic-structures ×3, containers ×3, event-loop ×2, hashing `Keys` ×2. Each `Controls` draws its own `border-top`.
- **Label + button groups:** http-basics `.hb-presets`, stack-queue `.sq-btns`, lru `.lru-palette`, gs `.gs-presets`, auth `.aj-role`, hashing `.he-scn-opts`.
- **Sub-scene pickers:**
  - hashing-encryption `Stage.tsx:21-28` ("Lane", `modePicker`)
  - auth-sessions-jwt `Stage.tsx:19-22` ("Lane", `modePicker`, `key={mode}` remount)
  - containers `Stage.tsx:14-28` ("Demo", `picker`)
  - event-loop `15-26` (injected into both sub-stages)
- **Pause/Resume:** see §1.5.

### 1.9 Captions (pattern 17)

`Caption` (`StageFrame.tsx:47-62`) re-keys on `version` with `AnimatePresence mode="wait"`, so every `setCaption` does a 120 ms exit plus a 120 ms enter, even for identical text. The four places where that hurts:
- event-sourcing `scrub`: `setCaption` from Slider `onChange` (103-118, 224-231). **Stutters on drag.**
- hashing `HashLab` caption effect (37-59): fires per keystroke, then again when the digest lands.
- auth `Tamper` (29-59): per keystroke, re-sign, then the same caption again.
- tcp-udp status frames (51-65): a fade every 1-3 frames at 260 ms.

multi-region is fine; it only fires on phase transitions.

The intro-caption-on-mount effect `useEffect(() => setCaption(...), [setCaption])` appears in about 17 lessons.

### 1.10 Small shared utilities (patterns 10, 11, 18, 19)

- **Formatters:**
  - duration `v >= 1 ? '1.2s' : '340ms'`: LB 234, MQ 179, CB 134, BP 131 (identical)
  - `` `${v}/s` `` slider format: 6×
  - bytes: pb 241, db-indexes 230
  - pct: lru 16, pb 49, cdn 281, multi-region 214, HashLab 54
  - `plural`: about 16 ad hoc (al, bs, bst ×2, ht, lsm ×3, git ×2, sql, crdts, Flow, tcp-udp ×4)
  - clock `padStart`: sharding, event-sourcing, multi-region
  - "no value" placeholder is `'–'`, `'·'`, `'—'` or `'…'` depending on the lesson
- **Hashing:** FNV-1a `0x811c9dc5` in consistent-hashing `hash.ts:3`, git-internals `repo.ts:26`, lsm-trees `lsm.tsx:53`, probabilistic-structures `sketches.ts:4`, sharding `model.tsx:39`. `fmix32` in sketches, inlined in consistent-hashing. hash-table's ×31 hash is pedagogical; **keep it local.**
- **Random:**
  - mulberry32 only in tcp-udp `sim.ts:78`
  - sorting `algorithms.tsx:219-225` re-implements `core/hooks.shuffle`
  - `xs[randInt(0, xs.length - 1)]` ~12× inline
  - "random unused key in 1..99" 3× (bst `pickNew`, btree `freshKey`, bs `missingValue`)
  - exp sample 2×
  - observability `r(lo, hi)` and module-level `let logId`
- **Crypto:**
  - hashing `crypto.ts` has `enc, hasSubtle, toHex, sha256Hex, hexToBits` plus 3 hooks.
  - auth `jwt.ts` has its own `enc`, its own subtle check, `b64url`, `hmac` plus 1 hook.
  - The async-value-with-`alive`-flag hook exists 5× (4 hooks + Tamper:29-44). `useSignedJwt` packs its args into a string key and parses them back out (jwt.ts:43, 47).
- **Motion:**
  - ~19 inline springs `{ type: 'spring', stiffness: 170-500, damping: 16-34 }`, 6 local `const spring` (al 113, bs 249, heaps 110, bst 126, big-o 188, containers)
  - shake `x: [0,-5,5,-4,4,0]` 3× (processes-threads 287, containers 426, Keys 34)
  - flip-number `AnimatePresence popLayout` + keyed `motion.b` 3× (tx-acid 455-464, race 142-152, containers 436-440)
  - pop-on-change keyed `scale 1.15-1.25` 4× (crdts 304, event-sourcing 214, slos 232, Tamper 143)
  - formula pill with keyed swap 2× (al 122-128, heaps 126-132; CSS identical al:13-21 = heaps:4-14)

### 1.11 Honest skips (duplication that is fine)

These look alike but aren't worth a shared abstraction:

- **Lesson content, not chrome:**
  - `index.tsx` lesson data. It's content with a uniform shape already enforced by `LessonModule`.
  - Tree layout algorithms (complete-by-index vs in-order vs leaf-counter): the algorithm is the lesson.
- **Single-use domain visuals:**
  - lane/timeline layouts (isolation-levels, race-conditions, auth Scale, tcp-udp)
  - sql `Table`, whose row geometry is coupled to the SVG join links
  - db-indexes B+tree, git commit graph, consistent-hashing ring, stack-queue tubes, hash-table chains, graph-search painter grid, sorting bars
  - the CDN world map, RL `drawLimiter`/`drawTimeline`, CB `drawSwitch`/`drawRetries`, BP `drawCurve`, MQ `envelope`
  - big-o `Chart`/`Race`, observability Waterfall/ServiceMap, raft Cluster
- **Deliberately different mechanisms:**
  - tcp-udp's CSS-transition packets
  - sharding's `layoutId` flow
  - event-loop's direct DOM writes
- **Too small or too varied to share:**
  - DataTable/KeyValue/ExecOrder/event-log as components. Row content varies too much; share CSS and a motion preset instead.
  - id counters (`nextId`). Trivial.
  - Reset/New buttons. Trivial.
  - Histograms. Share only axis drawing if a third one appears.

---

## 2. The shared layer

Principles:
- Small, composable pieces.
- Pure logic in `.ts` with no JSX.
- Components in `.tsx` under `src/components/`.
- Every existing API stays backward compatible until Phase 3 removes the shims.
- CSS: **shared utility classes go in a new `src/styles/kit.css`**, imported once from `main.tsx` after `global.css`. Keep `global.css` for tokens and app chrome. Component-specific CSS lives next to the component (`src/components/scene/scene.css`) and is imported by it. No CSS-in-JS, no CSS modules. That keeps it consistent with the existing per-lesson `styles.css` convention.

### 2.1 File map

```
src/styles/
  global.css            + new tokens (2.2)
  kit.css               NEW: shared utility classes (2.3)
src/core/
  palette.ts            NEW: token hex mirror, categorical palette, alpha()
  tone.ts               NEW: Tone type, toneVar(), toneFor() thresholds
  format.ts             NEW
  math.ts               NEW: clamp, clamp01, lerp, ease, (moved) randInt/shuffle re-exported by hooks.ts
  random.ts             NEW: pick, randRange, expSample, weightedPick, mulberry32, freshInt
  hash.ts               NEW: fnv1a, fmix32, hash32, hexHash
  geometry.ts           NEW: Pt, pointAlong, midpoint, pillWidth, archPath, treeToPixels
  motion.ts             NEW: SPRING, SHAKE, enterFromLeft, popIn presets
  canvas.ts             NEW: FONT, text, box, dot, wire, bar, tintBox, drawSpark
  sim.ts                NEW: percentile, mean, createSampler, trimWindow, windowRate, travel, createThrottle, FADE_S
  spark.ts              NEW: sparkPoints (pure; shared by SVG + canvas)
  recorder.ts           NEW: createRecorder
  crypto.ts             NEW: enc, hasSubtle, toHex, hexToBits, b64url, sha256Hex, hmacSha256
  useSimulation.ts      NEW
  useAsyncValue.ts      NEW
  useInterval.ts        NEW
  caption.ts            CHANGED: setCaption(node, { quiet? }), useIntroCaption
  hooks.ts              unchanged API; clamp/randInt/shuffle become re-exports from math.ts/random.ts
src/components/
  ui.tsx                CHANGED: Segmented widened; + Toggle, TextField, ControlGroup, Hint, PauseButton
  StageFrame.tsx        CHANGED: controls accepts ReactNode | ReactNode[]; Caption honours quiet
  ScenePicker.tsx       NEW
  Bar.tsx               NEW
  CodePanel.tsx         NEW
  Sparkline.tsx         NEW
  AnimatedValue.tsx     NEW
  Panel.tsx             NEW: Box, SectionTitle, Tray
  CompareRows.tsx       NEW (low priority)
  SlotStrip.tsx         NEW (low priority)
  TreeSvg.tsx           NEW (low priority)
  ArrowMarker.tsx       NEW (tiny)
  scene/
    SceneNode.tsx  Packet.tsx  Pulse.tsx  TravelDot.tsx  Flyer.tsx  index.ts  scene.css
scripts/
  smoke.mjs             CHANGED: --frames mode (4.1)
  diff.mjs              NEW: screenshot diff via puppeteer canvas, no new deps
  check-tokens.mjs      NEW: guard against hex literals / tint literals / banned local helpers in lessons
  codemods/tints.mjs    NEW: one-shot mechanical CSS conversion
```

### 2.2 Tokens (`global.css`)

Add these. They are additive, so nothing changes visually.

```css
:root {
  /* extra categorical hues that lessons already use as literals */
  --orange: #ff8c5a;
  --amber: #f7b538;   /* = --t3; semantic alias */
  --pink: #ff5d8f;    /* = --t4; semantic alias */
  --sky: #8fb8ff;
  --land: #2a3246;    /* map landmass dots (cdn-edge, multi-region) */

  /* ink for text drawn on a solid token fill (values = today's literals, so pixel-identical) */
  --on-hi: #1a1400;
  --on-ok: #04160d;
  --on-bad: #1f0508;
  --on-info: #03202b;
  --on-violet: #150a33;
  --on-fill: var(--bg);  /* generic: packets, pills */
}
```

Tints stay as `color-mix(in srgb, var(--hi) 14%, transparent)`. **No** fixed `--hi-soft` tokens: the alphas legitimately vary, and a mechanical conversion must be exact. Normalising alphas is a separate, later, deliberate design pass (see §6).

### 2.3 Utility classes (`kit.css`)

A single tone convention replaces the ten spellings: set `--c` (and `--on-c`) via a `tone-*` class, then state classes read them.

```css
.tone-hi     { --c: var(--hi);     --on-c: var(--on-hi); }
.tone-ok     { --c: var(--ok);     --on-c: var(--on-ok); }
.tone-bad    { --c: var(--bad);    --on-c: var(--on-bad); }
.tone-info   { --c: var(--info);   --on-c: var(--on-info); }
.tone-violet { --c: var(--violet); --on-c: var(--on-violet); }
.tone-orange { --c: var(--orange); --on-c: var(--on-fill); }
.tone-dim    { --c: var(--dim);    --on-c: var(--text); }

.cell        { background: var(--cell); border: 1px solid var(--cell-line); border-radius: 8px;
               font: 600 14px var(--mono); transition: background .25s, border-color .25s, color .25s, box-shadow .25s; }
.cell.is-solid { background: var(--c); border-color: var(--c); color: var(--on-c);
                 box-shadow: 0 6px 18px -6px color-mix(in srgb, var(--c) 70%, transparent); }
.cell.is-tint  { border-color: color-mix(in srgb, var(--c) 45%, transparent);
                 background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c); }
.cell.is-dim   { opacity: .45; }

.chip        { /* small mono tag */ font: 700 11px var(--mono); padding: 2px 8px; border-radius: 6px;
               color: var(--c, var(--muted)); background: color-mix(in srgb, var(--c, var(--muted)) 12%, transparent);
               border: 1px solid color-mix(in srgb, var(--c, var(--muted)) 40%, transparent); }

.box         { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); background: rgb(10 12 17 / .72); }
.box-sunken  { background: var(--bg-2); }
.box-raised  { background: var(--panel); }
.tray        { border: 1px dashed var(--line-2); background: var(--bg-2); border-radius: 10px; padding: 8px 10px; }
.section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
.section-title > .hint-inline { text-transform: none; letter-spacing: 0; color: var(--faint); font-weight: 500; }
.empty       { font: 500 12px var(--mono); color: var(--faint); }
.hint        { font-size: 13px; color: var(--faint); align-self: center; }
.focus-ring  { box-shadow: 0 0 0 3px color-mix(in srgb, var(--c, var(--hi)) 20%, transparent); }
.stage-pad   { display: flex; flex-direction: column; gap: 14px; padding: 20px 22px 22px; }
.canvas-wrap { position: relative; height: var(--h, 420px); }
.canvas-wrap > canvas { display: block; }
.field       { /* TextField */ }
.data-table  { /* shared table look for es-table, slo-nines, he users */ }
.log-row     { /* left border in --c + tint; used by event-log strips */ }
.controls + .controls { border-top-style: dashed; padding-top: 10px; }   /* stacked control rows */
```

`--bp-stack: 900px` is documented as the one responsive breakpoint (CSS vars can't be used in media queries, so it's a documented constant). Batches converge on `@media (max-width: 900px)` unless a lesson has a reason not to.

`.box` fixes the background at one value. Lessons using the other three fills add `.box-sunken`/`.box-raised`, or keep a one-line override. **Migrations must keep the lesson's existing fill** (pixel-identical). Unifying fills is a §6 design follow-up.

### 2.4 Colour, tone and format utilities (`core/*.ts`)

```ts
// core/palette.ts. Hex mirror of the CSS tokens for canvas code. CSS stays the source of truth.
export const TOKENS = {
  bg: '#0a0c11', bg2: '#0e1118', panel: '#121622', panel2: '#181d2b',
  line: '#242a3a', line2: '#323a4f', text: '#e8eaf0', muted: '#8a93a8', faint: '#5b6378',
  hi: '#ffd166', ok: '#3ddc97', bad: '#ff5d6c', info: '#4cc9f0', violet: '#a78bfa', dim: '#3a4152',
  cell: '#1a1f2d', cellLine: '#2d3447', orange: '#ff8c5a', amber: '#f7b538', pink: '#ff5d8f', sky: '#8fb8ff', land: '#2a3246',
} as const;
export type TokenName = keyof typeof TOKENS;
/** 'var(--hi)' etc. For SVG/DOM, prefer this over hex. */
export const cssVar = (t: TokenName) => `var(--${t.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())})`;
export function alpha(hex: string, a: number): string;           // '#ffd166', .3 → 'rgb(255 209 102 / 0.3)'
export const CATEGORICAL: readonly TokenName[] = ['info', 'violet', 'ok', 'amber', 'pink', 'orange', 'hi', 'sky'];
export const categorical = (i: number, as: 'var' | 'hex' = 'var') => ...;
/** Dev-only: compares TOKENS against getComputedStyle(:root) once; console.error on drift (smoke fails on it). */
export function assertTokensInSync(): void;
```
`assertTokensInSync()` is called once from `main.tsx` under `import.meta.env.DEV`.

> **Migration rule for canvas lessons:** today's `C.line` (`#323a4f`) maps to `TOKENS.line2`, **not** `TOKENS.line`, so the migration is pixel-identical. The name was the bug, not the colour.

```ts
// core/tone.ts
export type Tone = 'hi' | 'ok' | 'bad' | 'info' | 'violet' | 'dim' | 'orange';
export const toneVar = (t: Tone) => `var(--${t})`;
/** Traffic-light by thresholds: ok below warn, hi at/over warn, bad at/over bad. `invert` for "higher is better". */
export function toneFor(value: number, t: { warn: number; bad: number; invert?: boolean }): 'ok' | 'hi' | 'bad';

// core/format.ts
export const NA = '–';                                      // the one "no value yet" placeholder
export function duration(seconds: number): string;          // 1.2s / 340ms  (the 4 identical copies)
export const ms = (v: number) => `${Math.round(v)} ms`;
export const perSec = (v: number, dp = 0) => `${v.toFixed(dp)}/s`;
export function pct(ratio: number, dp = 0): string;         // 0.123 → '12%'; tiny non-zero → '<0.1%' when dp=1
export function bytes(n: number): string;                   // B / KB / MB / GB, 1 dp above KB
export const times = (v: number) => `${v}×`;
export function plural(n: number, one: string, many = one + 's'): string;  // '1 step' / '3 steps'
export function clock(totalMinutes: number): string;        // 'HH:MM'
export const pad2 = (n: number) => String(n).padStart(2, '0');
```

Lesson-specific formatters stay local: `money`, `fmtMinutes`, `fmtBurn`, big-o `fmtOps`/`fmtTime`.

```ts
// core/math.ts
export const clamp, clamp01, lerp, ease /* easeInOutCubic, as LB/RL use */;
// core/random.ts
export const pick = <T,>(xs: readonly T[], rnd = Math.random) => xs[Math.floor(rnd() * xs.length)];
export const randRange = (lo: number, hi: number, rnd = Math.random) => ...;
export const expSample = (mean: number, rnd = Math.random) => -Math.log(1 - rnd()) * mean;
export function weightedPick<T>(items: readonly T[], weight: (t: T) => number, rnd = Math.random): T;
export function mulberry32(seed: number): () => number;
/** Random integer in [lo, hi] not in `taken` (bst pickNew, btree freshKey, bs missingValue). */
export function freshInt(lo: number, hi: number, taken: ReadonlySet<number> | readonly number[], rnd = Math.random): number;
// core/hash.ts
export function fnv1a(s: string): number;      // unsigned 32-bit
export function fmix32(h: number): number;
export const hash32 = (s: string) => fmix32(fnv1a(s));
export const hexHash = (s: string, len = 7) => fnv1a(s).toString(16).padStart(8, '0').slice(0, len);
```
`hooks.ts` keeps exporting `clamp`, `randInt` and `shuffle` as re-exports until Phase 3.

> **Hash migration warning:** each FNV copy must be checked for exact output parity (seed, `>>> 0`, hex slicing). A changed hash changes which shard, ring slot or bloom bit lights up, so the frames and captions change. The batch owner diffs captions before and after.

### 2.5 Motion presets and `AnimatedValue`

```ts
// core/motion.ts
export const SPRING = {
  soft:   { type: 'spring', stiffness: 170, damping: 24 },
  snappy: { type: 'spring', stiffness: 300, damping: 28 },
  stiff:  { type: 'spring', stiffness: 450, damping: 32 },
} as const;
export const SHAKE = { x: [0, -5, 5, -4, 4, 0] };
export const enterFromLeft = { initial: { opacity: 0, x: -16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0 } };
export const popIn = { initial: { opacity: 0, scale: 0.5 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.5 } };
```
Migrations map each inline spring to the nearest preset. **If a lesson's spring differs noticeably, keep it inline with a named local constant.** Don't make a preset for one lesson.

```tsx
// components/AnimatedValue.tsx: flip-number and pop-on-change
export function AnimatedValue({ value, variant = 'pop', as = 'span', className }: {
  value: ReactNode; /** used as key */ id?: string | number;
  variant?: 'pop' | 'flip'; as?: 'span' | 'b' | 'code'; className?: string;
}): JSX.Element;
```
The formula pill (al, heaps) becomes `<AnimatedValue className="chip tone-hi formula" .../>`, not a component of its own.

### 2.6 Captions

```ts
// core/caption.ts (backward compatible)
export interface CaptionOptions { /** Update text in place without the exit/enter fade. For live readouts. */ quiet?: boolean }
export const SetCaptionContext = createContext<(node: ReactNode, opts?: CaptionOptions) => void>(() => {});
/** Set the caption once on mount (and again when `deps` change): replaces ~17 copies of the same effect. */
export function useIntroCaption(node: ReactNode, deps: DependencyList = []): void;
```
Implementation: in `LessonPage`, a quiet set replaces `node` **without bumping `version`**. `Caption` keys on `version`, so there's no remount and no fade. usePlayer keeps loud mode. This touches `LessonPage.tsx`, `caption.ts` and `StageFrame.tsx`, all owned by Phase 0.

Quiet-mode adopters: event-sourcing scrub, HashLab, Tamper, tcp-udp status frames. For tcp-udp, add an optional `quiet?: boolean` on `Frame`; usePlayer passes it through.

### 2.7 Controls (`components/ui.tsx`)

```tsx
// Segmented: widen, keep old call sites compiling
export interface Option<T extends string | number> { value: T; label: ReactNode }
export function Segmented<T extends string | number>(props: { options: Option<T>[]; value: T; onChange: (v: T) => void; label?: string }): JSX.Element;
/** Map a lesson's {id,label} table to Segmented options. */
export const toOptions = <T extends string | number>(xs: readonly { id: T; label: ReactNode }[]): Option<T>[] => ...;

/** Boolean choice rendered as a two-option Segmented. Off option first, always. */
export function Toggle({ label, value, onChange, off = 'Off', on = 'On' }: {
  label?: string; value: boolean; onChange: (v: boolean) => void; off?: ReactNode; on?: ReactNode;
}): JSX.Element;

/** Single-line text/number input with the one shared look and explicit Enter behaviour. */
export function TextField(props: {
  label?: string; value: string; onChange: (v: string) => void;
  onEnter?: () => void;               // lesson decides what Enter does (today it's accidental)
  sanitize?: (raw: string) => string; // e.g. letters only; applied before onChange
  type?: 'text' | 'number'; min?: number; max?: number;
  width?: number | string; maxLength?: number; placeholder?: string; disabled?: boolean; ariaLabel?: string;
}): JSX.Element;

/** Inline label + a tight group of controls (preset buttons, palettes, role pickers). */
export function ControlGroup({ label, children }: { label?: string; children: ReactNode }): JSX.Element;
/** Faint explanatory text inside a controls row. */
export function Hint({ children }: { children: ReactNode }): JSX.Element;
/** The ▶ Resume / ❚❚ Pause button every live sim has. */
export function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }): JSX.Element;
```
```tsx
// StageFrame: controls accepts rows
controls?: ReactNode | ReactNode[];   // array → each element wrapped in <Controls>, stacked with the dashed divider
```
```tsx
// components/ScenePicker.tsx: the "Lane"/"Demo" sub-scene pattern (hashing, auth, containers, event-loop)
export function useScenePicker<T extends string>(opts: { label: string; options: Option<T>[]; initial: T }):
  [T, ReactNode /* the Segmented to drop first into each sub-scene's controls */];
```
A hook instead of a `<SceneSwitch render={...}>` component, because each sub-scene owns its own StageFrame and player, and the hook doesn't fight that.

**Not built:** a `ChipChoice` component. Tamper `.aj-role` and hashing `.he-scn-opts` become `ControlGroup` + `Segmented`, or keep a local style. Two copies, and Segmented covers it.

### 2.8 Scene kit (`components/scene/`)

```ts
// core/geometry.ts
export interface Pt { x: number; y: number }
export const pointAlong = (a: Pt, b: Pt, t: number): Pt => ...;
export const midpoint = (a: Pt, b: Pt) => pointAlong(a, b, 0.5);
/** Width of a mono label pill in SVG user units. Replaces 6.2-7.0 × len + 18-22 heuristics. */
export const pillWidth = (label: string, charW = 6.5, pad = 20) => label.length * charW + pad;
export function archPath(x1: number, x2: number, baseY: number, lift: number): string;
```
```tsx
// SVG. Children go inside an <svg viewBox> the lesson owns.
export function SceneNode(props: {
  at: Pt; w: number; h: number; rx?: number;        // centred box
  title: ReactNode; sub?: ReactNode;
  tone?: Tone;                                        // colour used when `on` (default info)
  on?: boolean; busy?: boolean;                       // busy renders a <Pulse>
  variant?: 'default' | 'bad' | 'dim';
  className?: string; children?: ReactNode;          // extras (locks, badges) in node coords
}): JSX.Element;

export function Packet(props: {
  path: Pt[];                                         // ≥2 points: from → [via…] → to
  label: string; color: string;
  style?: 'solid' | 'outline';                        // outline = distributed-transactions
  arrive?: 'fade' | 'stay' | 'absorb';                // fade = cs/oauth/auth; stay = web-request; absorb = ip-ports
  stopAt?: number;                                    // 0..1 along the LAST leg: failed/denied/parallel stop-short
  duration?: number;                                  // seconds, default 1.3
  delay?: number;
  trail?: boolean;                                    // web-request's pathLength line
  charW?: number;
}): JSX.Element;

export function Pulse(props: { at: Pt; from: number; to: number; color?: string; duration?: number; repeat?: number /* default Infinity */ }): JSX.Element;
export function TravelDot(props: { path: Pt[]; color: string; r?: number; duration: number; delay?: number; repeat?: boolean }): JSX.Element;
```
```tsx
// HTML, %-positioned. For scenes laid out with divs (replication, cap-theorem, crdts, tls, processes-threads)
export function Flyer(props: {
  from: Pt; to: Pt;                                   // in % of the positioned parent
  children: ReactNode; className?: string;            // lesson styles the pill via kind classes
  fade?: 'arrive' | 'lost' | 'none';
  arc?: number;                                       // px of vertical lift (crdts)
  duration: number; delay?: number;
  onArrive?: () => void;                              // crdts merge
}): JSX.Element;
```
`scene.css` provides `.scene-node`, `.scene-node.on` (via `--c`), `.scene-edge` (dashed), `.scene-zone`, `.scene-packet`, `.scene-packet-text` (fill `var(--on-fill)`) and `.flyer` (the rep/cap pill base).

Stays lesson-specific:
- custom shapes (web-request `BrowserBox`, client-server hexagon LB, DB cylinder and `ClientBox`, zero-trust gate and deny burst, distributed-transactions node cards and bus, multi-region regions and map, oauth popup)
- the message/frame data
- the layout tables (`POS`)

Timing parity: each migration passes the lesson's current `duration`/`times`, so the first pass is pixel-identical. Converging timings across lessons is a deliberate follow-up.

### 2.9 Live simulations

```ts
// core/useSimulation.ts
export function useSimulation<W, S>(opts: {
  create: () => W;
  step: (world: W, dt: number) => void;           // mutate in place; dt already capped by useLoop
  snapshot: (world: W) => S;                      // cheap, plain data for React
  snapshotEvery?: number;                         // seconds, default 0.3
  afterStep?: (world: W) => void;                 // e.g. redraw() for canvas lessons
  initiallyPaused?: boolean;
}): {
  world: () => W;                                 // stable accessor; call in handlers/effects, never during render
  snap: S;                                        // throttled snapshot (React state)
  paused: boolean; setPaused: (p: boolean) => void; togglePause: () => void;
  reset: () => void;                              // world = create(); immediate snapshot
};

// core/sim.ts
export const FADE_S = 0.8;
export function percentile(sorted: readonly number[], p: number): number;
export const mean = (xs: readonly number[]) => ...;
export function createSampler<T>(opts: { every: number; cap: number }): { tick(now: number, sample: () => T): void; readonly values: readonly T[]; clear(): void };
export function trimWindow<T>(xs: T[], now: number, span: number, at: (x: T) => number): void;  // in place
export const windowRate = (count: number, span: number) => count / span;
/** Position of a travelling particle: t = clamp01((now - t0) / dur), eased. */
export function travel(from: Pt, to: Pt, t0: number, dur: number, now: number, easing = ease): Pt & { t: number };
/** Returns true at most once per `seconds` of sim time. For insight-caption cooldowns. */
export function createThrottle(seconds: number): (now: number) => boolean;

// core/useInterval.ts: for the setInterval sims (observability, event-sourcing, multi-region)
export function useInterval(cb: () => void, ms: number, enabled = true): void;
```
`useSimulation` owns the lazy world ref, the `useLoop`, the throttled `setSnap`, pause and reset. It does **not** own the "sync React state into the world" effects. Those stay in the lesson, as one plain `useEffect` each. The hook's stable accessor removes raft's `eslint-disable` (raft:103).

**Raft must use the throttle** (`snapshotEvery` ≈ 1/30 s is fine for its HTML-positioned messages). Check message motion stays smooth.

```ts
// core/canvas.ts. All take ctx first; colours default to TOKENS.
export const FONT = { mono: (px: number, w = 600) => `${w} ${px}px "JetBrains Mono", monospace`,
                      sans: (px: number, w = 600) => `${w} ${px}px Inter, system-ui, sans-serif` };
export function text(ctx, s: string, x: number, y: number, o?: { color?: string; font?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline }): void; // restores align
export function box(ctx, cx: number, cy: number, w: number, h: number, o?: { stroke?: string; fill?: string; radius?: number; lineWidth?: number; label?: string; labelFont?: string }): void;
export function rect(ctx, x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; radius?: number; lineWidth?: number }): void; // top-left variant (LB)
export function dot(ctx, x: number, y: number, r: number, color: string, o?: { glow?: number }): void;
export function wire(ctx, segs: [Pt, Pt][], o?: { color?: string; dash?: number[]; width?: number }): void;
export function bar(ctx, x: number, y: number, w: number, h: number, ratio: number, color: string, o?: { track?: string; radius?: number }): void;
export function tintBox(ctx, x: number, y: number, w: number, h: number, color: string, o?: { label?: string; fillA?: number; strokeA?: number; radius?: number }): void; // reject bin / DLQ / drop bin
export function drawSpark(ctx, r: { x: number; y: number; w: number; h: number }, values: readonly number[], o: SparkOpts & { color: string | ((v: number) => string); width?: number }): void;
```
```ts
// core/spark.ts (pure, shared by canvas and SVG)
export interface SparkOpts { cap: number; max?: number; minMax?: number; align?: 'left' | 'right' }
export function sparkPoints(values: readonly number[], w: number, h: number, o: SparkOpts): Pt[];
```
```tsx
// components/Sparkline.tsx (SVG): LB LatencyChart series, observability Spark, lru Sparkline, dp CallsChart
export function Sparkline(props: SparkOpts & { values: readonly number[]; width: number; height: number; color: string; refLine?: number; className?: string }): JSX.Element;
```
The CDN `/79` and MQ `/59` magic numbers go away because `cap` is passed from the sim constant.

`CanvasStage` is **not** built as a component. `.canvas-wrap` + `style={{ '--h': '430px' }}` + the existing `useCanvas` is enough. Wrapping `useCanvas` in a component would hide the `redraw` handle the loop needs.

### 2.10 Display widgets

```tsx
// components/Panel.tsx
export function Box({ variant = 'default', className, children }: { variant?: 'default' | 'sunken' | 'raised'; className?: string; children: ReactNode }): JSX.Element;
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }): JSX.Element;   // renders .section-title
export function Tray({ label, empty, children }: { label: ReactNode; empty?: ReactNode; children?: ReactNode }): JSX.Element; // shows `empty` when no children

// components/Bar.tsx
export function Bar(props: {
  value: number; max?: number /* 1 */; tone?: Tone; color?: string;
  height?: number /* 8 */; marker?: number /* threshold tick, same units as value */;
  label?: ReactNode; trailing?: ReactNode; animate?: boolean /* motion width, default true */;
}): JSX.Element;

// components/CodePanel.tsx
export type LineState = 'idle' | 'past' | 'now' | 'next' | 'done' | 'cut' | 'cached' | 'pending';
export function CodePanel(props: {
  title?: ReactNode; lines: readonly string[];
  stateOf?: (i: number) => LineState;       // or:
  active?: number | readonly number[] | null;
  gutter?: 'number' | 'arrow' | 'none';
  nowStyle?: 'solid' | 'bar';               // tx-acid solid hi; race/recursion/containers tint + left bar
  trailing?: (i: number) => ReactNode;      // containers status <em>
  className?: string;
}): JSX.Element;

// components/CompareRows.tsx (low priority): lru compare, gs scoreboard, ch fairness, LB chart keys, RL rows
export function CompareRows<K extends string>(props: {
  rows: { id: K; label: ReactNode; value: number; max?: number; right?: ReactNode; color?: string }[];
  selected?: K; onPick?: (id: K) => void; marker?: number;
}): JSX.Element;

// components/SlotStrip.tsx (low priority): al array, heaps array, maybe binary-search
export function SlotStrip<I>(props: {
  count: number; renderSlot?: (i: number) => ReactNode;       // index labels, addresses
  items: { key: string | number; pos: number; content: ReactNode; className?: string }[];
  className?: string;
}): JSX.Element;   // owns grid, borders (:last-child, not nth-child(CAP)), %-positioning, SPRING.snappy

// components/TreeSvg.tsx (low priority): heaps, trees-bst, recursion
export interface TreeNodeView { id: string | number; x: number; depth: number; label: ReactNode; tone?: Tone; ghost?: boolean }
export function TreeSvg(props: {
  nodes: TreeNodeView[]; edges: { from: TreeNodeView['id']; to: TreeNodeView['id']; hot?: boolean }[];
  width: number; height: number; pad?: number; levelGap?: number; r?: number;
  onPick?: (id: TreeNodeView['id']) => void; className?: string;
}): JSX.Element;
// core/geometry.ts
export function treeToPixels(p: { x: number; depth: number }, o: { count: number; width: number; pad: number; top: number; levelGap: number }): Pt;

// components/ArrowMarker.tsx: useId-based, no global id collisions
export function useArrowMarker(color: string, size?: number): { id: string; def: JSX.Element };
```

### 2.11 Frames and async

```ts
// core/recorder.ts
export function createRecorder<F extends Frame>(initial: Omit<F, 'say' | 'hold'>, opts?: {
  /** Keys reset to these values after every snap (auth Flow msg/busy/verdict, processes-threads flashes). */
  transient?: Partial<Omit<F, 'say' | 'hold'>>;
}): {
  readonly frames: F[];
  get(): Omit<F, 'say' | 'hold'>;
  set(patch: Partial<Omit<F, 'say' | 'hold'>>): void;
  snap(say?: ReactNode, hold?: number, patch?: Partial<Omit<F, 'say' | 'hold'>>): void;   // set(patch) then push
  finish(say: ReactNode, hold?: number): void;                                            // patch the last frame
};
```
It is `.ts` with no JSX, which is fine because `say` is just a `ReactNode` value. Callers must still clone mutable nested state (arrays, nodes) themselves. The recorder does a shallow spread and documents that. **Opt-in:**
- mandatory for db-indexes and lsm-trees (identical copies)
- recommended where a lesson has a local `push`/`snap`/`base()`
- **not** for declarative scripts (stack-queue, big-o, processes-threads `SCENARIOS`) or class recorders that carry counters (sorting, heaps). Those may adopt `finish()`-style clarity but are not required to.

```ts
// core/useAsyncValue.ts
/** Resolve an async value for `key`; returns null while pending or when the result is for a stale key. */
export function useAsyncValue<T>(fn: () => Promise<T>, key: string | number): T | null;
// core/crypto.ts
export const enc: TextEncoder; export const hasSubtle: () => boolean;
export function toHex(buf: ArrayBuffer): string; export function hexToBits(hex: string): number[];
export function b64url(bytes: ArrayBuffer | Uint8Array): string;
export function sha256Hex(text: string): Promise<string>;
export function hmacSha256(secret: string, data: string, out: 'hex' | 'b64url'): Promise<string>;
```
JWT pieces (`signJwt`, `verifyJwt`, `HEADER`, `PAYLOAD`, `TokenString`) stay in auth-sessions-jwt. `TokenString` moves out of `Flow.tsx` into `auth-sessions-jwt/JwtParts.tsx`, since Tamper imports it from Flow today.

---

## 3. Migration plan

### 3.1 Phases

```
Phase -1  git init + baseline commit (the repo is NOT a git repo today; do not start without this)
Phase 0a  Tooling: smoke --frames, diff.mjs, check-tokens.mjs (report-only), capture baselines
Phase 0b  Codemods over all lesson CSS (one owner, mechanical, pixel-identical, verified by diff)
Phase 0c  Shared layer (one owner): everything in §2, with tests-by-use in 1-2 pilot lessons max
Phase 1   Six parallel lesson batches (§3.3). Lesson folders only.
Phase 2   Shared-code change requests from batches, applied serially by the shared owner
Phase 3   Remove compat shims, turn check-tokens into a failing check, full smoke + captions
```

**Phase -1.** Without version control, six agents editing in parallel is how you lose a day. `git init`, commit everything including `.smoke/before/`, and give each batch its own branch/worktree. Merge order doesn't matter, because batches touch disjoint folders.

**Phase 0a: tooling (owner: shared-layer owner).**
- `smoke.mjs --frames`: for step-player lessons, pause the player (it autoplays when frames change) and screenshot frame 0, the middle frame and the last frame via `stepForward` (the same helper `captions.mjs` uses). Output `.smoke/<label>/<id>@<n>.png`. This makes step-player screenshots deterministic. The current 2.5 s-after-play shot is timing-dependent, and every live sim uses `Math.random`, so the existing `.smoke/before/` is only good for eyeballing.
- `scripts/diff.mjs <labelA> <labelB> [ids]`: loads both PNGs into a puppeteer page, compares via canvas `getImageData`, and reports the changed-pixel percentage plus a red-overlay diff PNG. No new dependencies.
- `scripts/check-tokens.mjs [ids]` flags, per lesson:
  - hex literals in `.ts/.tsx/.css`
  - `rgb(<token rgb> / a)` literals
  - local definitions of banned helper names (`fnv`, `hash32` with FNV constant, `mulberry32`, `percentile`, `lerp`, `clamp01`, `const C = {`, `function roundBox`, `pendingPlay`, `const spring =`)

  Report-only until Phase 3.
- Capture the baselines on the untouched tree: `npm run smoke -- --label=before-frames --frames` and `npm run captions > .smoke/captions-before.txt`.

**Phase 0b: codemods (pixel-identical).**
- `codemods/tints.mjs`: `rgb(R G B / a)` where RGB matches a token → `color-mix(in srgb, var(--tok) {a*100}%, transparent)`. The same goes for `rgba(r,g,b,a)` in lesson CSS. Canvas TS strings are **not** codemodded; they move to `alpha(TOKENS.x, a)` in Phase 1.
- Ink hexes → `var(--on-*)` / `var(--bg)` on exact value match only. The two non-canonical violet inks (`#140c2b`, `#1a1030`) and info inks (`#041018`, `#04121a`) are left for the batch owner to decide (they differ by a hair, so choose `--on-*` and accept a deliberate change, or leave them).
- `#ff8c5a` → `var(--orange)`, `#f7b538` → `var(--amber)`, `#ff5d8f` → `var(--pink)`, `#8fb8ff` → `var(--sky)` in CSS.
- Verify: `smoke --frames --label=after-0b` + `diff before-frames after-0b` must be 0 changed pixels on every step-player lesson. The sims get eyeballed. `color-mix` in sRGB with `transparent` should produce the same premultiplied RGBA; **if the diff shows any drift, stop and fall back** to tokens-with-alpha via `rgb(from var(--hi) r g b / .14)` or leave the literals.

Doing this before the batches means batch agents never hand-edit 330 tint lines, and the colour work gets one review instead of six.

**Phase 0c: the shared layer.**
- One owner (a single agent or person) writes all of §2.
- Two pilot migrations validate the APIs before anyone else uses them. These pilots are the **only** lesson edits in Phase 0:
  - `client-server` for the scene kit, Toggle and controls
  - `circuit-breakers` for `useSimulation`, canvas kit, sim utils and `PauseButton`
- The pilots are then excluded from their batches' diffs but still listed there.
- Phase 0 ends with build, lint, full smoke and the pilot diffs reviewed.
- The API is **frozen** after that. Changes go through Phase 2.

### 3.2 Rules for batch agents

1. Edit only `src/lessons/<id>/` for lessons in your batch. Never edit `src/core`, `src/components`, `src/styles`, `scripts`, or another batch's lesson.
2. If a shared API doesn't fit, **don't fork it locally and don't edit it**. Keep the lesson's current code for that piece and file a request under "Phase 2 requests" in the batch report: what, why, proposed signature. A lesson-local adapter is acceptable only if it's under ~10 lines.
3. First pass is **pixel-identical** by default: pass existing durations, sizes and fills. Every deliberate visual change is listed in the batch report with a before/after screenshot pair.
4. No behavioural or pedagogical changes: same frames, same captions, same controls. The `captions` output must match except where a quiet caption or a fixed bug is documented.
5. Split files as listed in the batch's clean-code items. Pure logic goes to `.ts`; frame builders with JSX captions may be `.tsx`.
6. Don't rename a lesson's existing logic files just for naming consistency. Churn with no payoff.
7. Done = build + lint clean, `check-tokens <ids>` clean (or each remaining hit justified), smoke clean, diffs reviewed, captions diff reviewed, report written.

### 3.3 Batches (run in parallel after Phase 0)

Every lesson is in exactly one batch; 51 in total. Batches are grouped by which shared kit they mostly adopt, so each agent learns one or two kits well, and sizes are balanced by effort, not count.

#### Batch 1: SVG actor scenes (9)

`web-request, client-server (pilot), oauth-flows, auth-sessions-jwt, zero-trust, ip-ports, distributed-transactions, monolith-microservices, multi-region`

- **Adopts:** `SceneNode`, `Packet`, `Pulse`, `TravelDot`, `pillWidth`, `scene.css`, `Toggle` (web-request ×3, oauth ×3), `useScenePicker` (auth), `useAsyncValue`, `core/crypto` + quiet caption (auth Tamper), `useInterval` (multi-region), `categorical`/`--orange`, `Box`/`SectionTitle` (cs/aj/oa panels, zt log), `SPRING`, format.
- **Clean-code items:**
  - auth `Scale.tsx` re-inlined nodes → `SceneNode`.
  - Move `TokenString` to `JwtParts.tsx`.
  - Drop the `useSignedJwt` string-key hack via `useAsyncValue`.
  - Remove the auth css `!important` ×4.
  - multi-region: move `phaseOf`, `route`, `replicaPairs` and the latency maths into `model.ts`, `CONTINENTS` into `continents.ts`, and the SVG map into `RegionMap.tsx`. Name the phase-pill geometry constants.
- **Risks:**
  - Packet variants (web-request `stay`+`trail`, ip-ports `absorb`/`still`, zero-trust multi-hop+deny, dt outline+bus). Verify each variant frame by frame.
  - ip-ports' "still bounce" may not fit `Packet`. If so, keep it local and file a Phase 2 request.
  - multi-region is the largest single refactor in this batch.
- **Verify:** `smoke --frames` + diff for the 8 player lessons. multi-region is a sim: eyeball, kill/restore a region, trigger a conflict, toggle residency, and check for no console errors. Run `captions`.

#### Batch 2: HTML flyers and protocols (8)

`replication, cap-theorem, crdts, tls-handshake, processes-threads, tcp-udp, sharding, http-basics`

- **Adopts:** `Flyer` (replication, cap-theorem, crdts with `arc` + `onArrive`, tls `WirePill`, processes-threads IPC), `.flyer` CSS + `kind-*` classes, `Toggle` (http-basics If-None-Match), `TextField` ×2 (http-basics), `ControlGroup` (http-basics presets), `controls` array (http-basics 3 rows), `CodePanel` if http-basics' `<pre>` fits, quiet caption (tcp-udp status frames via `Frame.quiet`), `mulberry32` from core (tcp-udp), `hash32`/`fnv1a` (sharding), `createRecorder` with `transient` (processes-threads, sharding push), `SHAKE`, `AnimatedValue` (crdts pop), `plural`.
- **Clean-code items:**
  - crdts: derive the `.cr-wire` 16.67% from the same `X` table (CSS var); drop the `say` alias; fix the stale `w.online[r]` read in `local` (a real bug); `.cr-tiebreak` → `Hint`; `.cr-act` → `Button`.
  - tcp-udp: move `narrate` + `buildFrames` next to `sim.ts`; name the receiver geometry (`x0 = 722`).
  - processes-threads: `SCENARIOS` into `scenarios.tsx`.
  - sharding: name the hot-shard threshold.
- **Risks:**
  - crdts' `onAnimationComplete` drives state. `Flyer.onArrive` must fire exactly once per message, including under StrictMode and when a message is removed mid-flight.
  - sharding hash parity: diff the captions.
  - tcp-udp keeps its CSS-transition packets (don't migrate them to motion).
- **Verify:** `smoke --frames` + diff (all 8 have players except crdts and http-basics, which are interactive: click through sync/offline/merge, and send every preset). Run `captions`, especially tcp-udp.

#### Batch 3: Canvas simulations (7)

`load-balancing, rate-limiting, message-queues, circuit-breakers (pilot), backpressure, cdn-edge, raft`

- **Adopts:** `useSimulation`, `PauseButton`, `core/canvas` (`text/box/rect/dot/wire/bar/tintBox/FONT`), `TOKENS`/`alpha` (delete all six `const C`), `core/sim` (`percentile`, `createSampler`, `trimWindow`, `windowRate`, `travel`, `createThrottle`, `FADE_S`), `expSample`/`weightedPick`, `drawSpark` + `Sparkline` (LB `LatencyChart`), `duration`/`perSec`/`pct`/`NA`, `toneFor`, `toOptions`, `Toggle` (cdn ×2, raft partition), `.canvas-wrap` (deletes the mq/cb/bp stylesheets), `Box`/`SectionTitle`/`Hint`, `CompareRows` if it fits LB and RL.
- **Clean-code items:**
  - rate-limiting (575 lines): move the spawn/routing/fan-out/boundary-attack logic into `sim.ts` as a `World`, and the drawing into `draw.ts`.
  - load-balancing (529): move `World` and orchestration into `sim.ts`, `drawScene` into `draw.ts`.
  - cdn-edge: turn the `draw`/`mapImage` closures into module-level `draw.ts`; remove the dead `Snapshot.requests`.
  - mq/bp: stop calling `layout()` from the sim loop with the `900` fallback. The sim stores logical slots and draw maps them to pixels.
  - raft: throttle the snapshot; use `HEARTBEAT` instead of `- 800`; remove the eslint-disable.
  - Name the throttle, cooldown and spike constants.
  - Remove RL's unused `_h` param and redundant `fillStyle`/`textAlign` sets.
  - `C.line` → `TOKENS.line2` (pixel parity).
- **Risks:**
  - The biggest and hardest batch: two sim/draw splits plus the hook in 7 files. Sims are nondeterministic, so screenshot diffs aren't meaningful.
  - cdn toggles change option order to off-first (a deliberate change).
  - raft motion smoothness after throttling.
  - Consider giving this batch two agents (LB+RL+CDN / MQ+BP+raft). The file sets are still disjoint.
- **Verify:** eyeball screenshots vs `.smoke/before/`. For each lesson, a manual checklist: pause/resume, every control, reset, spike/attack buttons, the insight caption appears. No console errors. Optional: temporarily seed `Math.random` in dev via a query flag for a like-for-like screenshot. Only do that if it's cheap; don't build infra for it.

#### Batch 4: DOM sims, data and ops panels (9)

`observability, event-sourcing, event-loop, big-o, slos-error-budgets, isolation-levels, transactions-acid, race-conditions, containers`

- **Adopts:** `useInterval` (observability, event-sourcing), `Sparkline` (observability `Spark`), `percentile`/`createSampler` (observability), `CodePanel` (transactions-acid, race-conditions, containers Dockerfile), `Bar` (tx-acid total, containers `Meter`/boot), `AnimatedValue` flip (tx-acid, race, containers) and pop (event-sourcing, slos), `enterFromLeft` + `.log-row` (tx-acid WAL, event-sourcing log), `.data-table` (event-sourcing, slos), `useScenePicker` (containers, event-loop), quiet caption (event-sourcing scrub), `Toggle` (race lock order, containers host view), `Hint` (tx-acid), Segmented number widening (big-o), `categorical`/`--orange` (observability, event-sourcing, big-o), `.tone-*` T1/T2 convention (iso, race), `SHAKE`, `useIntroCaption`.
- **Clean-code items:**
  - transactions-acid: move `buildFrames`/`crashFrames` (55-321) into `frames.tsx`; remove the redundant `letters.D` writes and the always-true check.
  - containers (477): split into `Stacks.tsx`/`Layers.tsx`/`Isolation.tsx`/`Meter` → `Bar`. **Fix the leak effect that has no dependency array** (338-355) and the missing `patchWorker` dep (358-368). This is the most fragile code in the repo.
  - observability: remove the module-level `let logId` global; name `series = 5*4*5`; `.ob-link` → `Button`.
  - big-o: read the O(n²) stat colour from `COMPLEXITIES` instead of the literal.
  - slos: move `buildFrames` into `frames.tsx`; remove the `z-index` stacking hack if `.data-table` makes it unnecessary.
- **Risks:**
  - `CodePanel` must reproduce three different "now" styles (use `nowStyle`).
  - The containers split and effect fix change timing behaviour. Verify the leak/restart demo carefully.
- **Verify:** `smoke --frames` + diff for the player lessons (isolation, tx-acid, race, containers, slos, big-o, event-loop). For the others, eyeball and interact: observability incident injection + trace click; event-sourcing scrub (the caption no longer stutters) + rebuild; event-loop both lanes. Run `captions`.

#### Batch 5: DSA cells, arrays and trees (9)

`arrays-linked-lists, heaps, trees-bst, binary-search, sorting, recursion, dynamic-programming, stack-queue, hash-table`

- **Adopts:**
  - Styling: `.cell` + `.tone-*` + `is-solid`/`is-tint` (the single biggest CSS reduction here, replacing `is-hi`/`mid`/`probe`/`st-active`/...), `.chip`, `Tray` (heaps run order, bst output, recursion stack, dp stack), `AnimatedValue` (the al/heaps formula pill), `SPRING` (5 local springs).
  - Components: `SlotStrip` (al, heaps, maybe bs), `TreeSvg` + `treeToPixels` (heaps, bst, recursion), `CodePanel` (recursion), `Bar` (hash-table `LoadMeter`, rc counts), `useArrowMarker` + `archPath` (al, dp).
  - Controls and utilities: `TextField` (trees-bst with `onEnter` = insert, hash-table), `Toggle` (recursion base case, hash-table good/bad hash), Segmented numbers (dp), `createRecorder` where a local push/base exists (al, dp, recursion, bst, hash-table; sorting/heaps optional), `freshInt` (bst, bs), `pick`, `plural`, core `shuffle` (delete sorting's copy), `Hint`.
- **Clean-code items:**
  - hash-table: move `hashSteps`/`build`/`opFrames` into `frames.tsx`; `LoadMeter` → `Bar` + `Stat`.
  - binary-search: move `buildFrames` out.
  - stack-queue: `SCRIPT`/`buildScenario` into `scenario.tsx`; fix the double padding.
  - Remove the `nth-child(CAP)` CSS couplings.
  - dp: drop the hard-coded `59` and the no-op `width: auto`.
  - Name the sorting interval constant (written twice).
- **Risks:**
  - `.cell` state classes touch every visual state in 9 lessons. Pixel diff every frame sample.
  - `TreeSvg` must support bst ghost nodes and recursion memo tones. If it can't do that cleanly for one lesson, leave that lesson's renderer local; forcing it is worse than one copy.
  - Enter-key behaviour in trees-bst is a deliberate change (Enter now inserts). Note it.
- **Verify:** `smoke --frames` + diff (all 9 have players), `captions`, and manually test inputs, Enter and random/reset.

#### Batch 6: Data structures, storage and crypto (9)

`lru-cache, graph-search, probabilistic-structures, consistent-hashing, db-indexes, lsm-trees, git-internals, sql-basics, hashing-encryption`

- **Adopts:**
  - Core utilities: `core/hash` (FNV in consistent-hashing, git-internals, lsm-trees, probabilistic-structures), `createRecorder` (db-indexes and lsm-trees mandatory, lru `sim.ts` recommended), `core/crypto` + `useAsyncValue` (hashing-encryption's three hooks), `bytes`/`pct`/`plural`, `freshInt` (db-indexes `freshKey`), `categorical` (consistent-hashing, sql `TINTS`), `useIntroCaption` (prob ×2, ch, git), `SPRING`.
  - Components: `CodePanel` (lru), `Sparkline` (lru's own copy), `CompareRows` (lru compare, gs scoreboard, ch fairness), `Bar` (hll memory, ix bars, ch).
  - Controls: `TextField` (probabilistic-structures, HashLab), `controls` array (probabilistic-structures, hashing `Keys`), `useScenePicker` (hashing-encryption), Segmented numbers (probabilistic-structures), quiet caption (HashLab).
  - Queue handling: `player.queueNext` replaces lru `pendingSeek` and gs `pendingPlay`.
- **Clean-code items:**
  - probabilistic-structures: split `BloomView`/`HllView` into files.
  - graph-search: move frames/captions into `frames.tsx`; name the `height={0}`.
  - lru: move captions/`buildFrames` into `frames.tsx`; derive the CSS `top:318px` from the `Y` table.
  - consistent-hashing: split `Ring`/`Buckets`/side panel into files.
  - lsm-trees: stop `idle()` re-declaring the recorder's initial state; memoise `liveKeys`.
  - git: remove the identity `map`.
  - db-indexes: remove the `!important` and the `b.bad` hack.
  - hashing: couple `.he-wire 14%` to `X`.
- **Risks:**
  - **Hash parity**: consistent-hashing's `hash32` is `fmix32(fnv1a)` inlined; git's is hex-sliced. Byte-compare outputs for a fixed input list before swapping, then diff the captions.
  - `queueNext` swaps change autoplay behaviour at the edges (adding a request, picking a preset). Test those exact interactions.
- **Verify:** `smoke --frames` + diff (lru, gs, db, lsm, sql, hashing `Keys`/`Passwords` have players). For prob, ch and git, interact: insert/query, add/remove a server, commit/branch. Run `captions`.

### 3.4 Batch file-ownership check

| Owner | Files |
|---|---|
| Phase 0 (shared owner) | `src/core/**`, `src/components/**`, `src/styles/**`, `src/pages/LessonPage.tsx`, `src/main.tsx`, `scripts/**`; the Phase 0b codemod over lesson CSS; pilots `client-server/**`, `circuit-breakers/**` |
| Batch N | `src/lessons/<its ids>/**` only |
| Phase 2 (shared owner, serial) | `src/core/**`, `src/components/**`, `src/styles/**` |

No lesson imports another lesson (verified: no cross-folder imports under `src/lessons`), so the batches are truly independent. The only shared runtime resource is the dev server on 127.0.0.1:5317. All agents can share one server; smoke runs in parallel are fine because each opens its own headless browser. With worktrees, run one dev server per worktree on its own port, or point smoke's base URL at the right one. Check `scripts/lib/browser.mjs` for a base-URL flag, and add one in Phase 0a if it's missing.

### 3.5 Phase 3: close-out

1. Remove the compat re-exports (`hooks.ts` → `clamp`/`randInt`/`shuffle`) once `grep` shows no users.
2. `check-tokens.mjs` becomes failing and is added to the verify list in `CLAUDE.md`. This is the guard that stops the next 90 lessons from re-growing the copy-paste.
3. Add a short "Shared kit" section to `README.md` (what exists and when to use it) and a line in `CLAUDE.md` pointing to it.
4. Full run: `npm run build`, `npm run lint`, `npm run smoke -- --label=after --frames`, `diff before-frames after`, `npm run smoke -- --label=after` (eyeball against `.smoke/before/`), and `npm run captions` compared against `captions-before.txt`.

---

## 4. Clean-code problems beyond duplication (prioritised)

### P1: fix in this pass (bugs, fragility, rule violations)

| Issue | Where | Batch |
|---|---|---|
| Effect with **no dependency array** runs every render; restart effect missing a dep | containers `Stage.tsx:338-355`, `:358-368` | 4 |
| Stale state read outside the updater feeds a caption | crdts `Stage.tsx:108` | 2 |
| raft deep-copies logs + messages into React state **every frame** | raft `Stage.tsx:109` | 3 |
| Module-level mutable `let logId` persists across remounts | observability `sim.ts:46` | 4 |
| Canvas `C.line` is really `--line-2` (misnamed token) | LB/RL/MQ/CB/BP `Stage.tsx:11` | 3 |
| SVG marker ids are global and collide if two instances render | al `:187-192`, dp `:212-217` | 5 |
| Hand-rolled reimplementations of `player.queueNext` | lru `:126-142`, graph-search `:151-166` | 6 |
| Sim/model logic inside `Stage.tsx` (violates "pure logic in its own .ts") | rate-limiting 112-176, load-balancing 62-187, multi-region 44-57 and 116-152, cdn-edge draw closures 53-193, tx-acid 55-321 | 3, 1, 4 |
| CSS magic numbers coupled to TS constants | `nth-child(10/15)` (al, heaps), lru `top:318px`, crdts `16.67%`, hashing `14%`, cdn `/79`, mq `/59` | 5, 6, 2, 3 |
| `eslint-disable` for exhaustive deps | raft `:103` | 3 |
| Inconsistent Enter-key behaviour in text inputs | bst / hash-table / probabilistic | 5, 6 |

### P2: fix in this pass if the file is being touched anyway

- **Split oversized files:**
  - rate-limiting 575, load-balancing 529, transactions-acid 509, containers 477, hash-table 425, probabilistic-structures 417, graph-search 411, observability 383 (optional), lru 384, consistent-hashing 452, multi-region 451, backpressure 438 / circuit-breakers 437 / message-queues 411 (these shrink on their own with the canvas kit), stack-queue 328, binary-search 291.
  - The target is that no `Stage.tsx` mixes simulation or frame logic with rendering. Line count is a symptom, not the rule.
- **Magic numbers:** throttle intervals, insight cooldowns, spike multipliers and durations, pill geometry, tcp-udp receiver x, sharding hot threshold, containers leak timings, the event-sourcing tick. All become named constants.
- **Hacks:** `!important` (auth ×4, db-indexes), the slos `z-index` hack, the db-indexes `b.bad` override, `.cr-tiebreak` placed after the media query, stack-queue double padding.
- **`useSignedJwt`** packs its args into a string key and parses them back out.
- **Buttons outside `Button`:** crdts `.cr-act`, observability `.ob-link`.

### P3: small dead code (do it, but don't make a ticket of it)

- RL unused `_h` param and redundant `fillStyle`/`textAlign` sets
- LB redundant `textAlign`
- CDN `Snapshot.requests` never read
- git identity `map`
- dp no-op `width: auto`
- tx-acid redundant `letters.D` writes and an always-true check
- crdts `say` alias
- lsm `liveKeys` computed 3× per render

No commented-out code, TODOs or stray `console` calls were found anywhere, which is good.

---

## 5. Payoff ranking (what to build first if time is short)

1. **Token work (§2.2 + codemods).** Touches ~45 lessons for almost zero risk. Gives every future lesson one colour vocabulary.
2. **`kit.css` tone/cell/box/section-title/hint/tray.** The largest CSS reduction, and new lessons get the house look for free.
3. **Scene kit.** 9 current users plus most of the net/arch/sec backlog.
4. **`useSimulation` + canvas kit + sim utils.** 7 current users, the largest and most-duplicated files, and it fixes raft.
5. **Controls (`Toggle`, `TextField`, `ControlGroup`, `controls` rows, `useScenePicker`, `PauseButton`, Segmented widening).** Cheap, used everywhere.
6. **`format.ts`, `hash.ts`, `random.ts`, `math.ts`, `motion.ts`, captions (quiet + intro).** Cheap, used everywhere.
7. **`Bar`, `CodePanel`, `Sparkline`, `AnimatedValue`, `createRecorder`.** Medium effort, clear users.
8. **`CompareRows`, `SlotStrip`, `TreeSvg`, `ArrowMarker`, crypto.** Low priority. Build them if the backlog lessons (bits, trees, charts) are imminent; otherwise defer to the second real user.

---

## 6. What NOT to do

- **Don't build a declarative "scene engine"** (a JSON-described diagram DSL, a generic `<Diagram nodes edges messages>`). The lessons differ in exactly the parts such an engine would have to model: custom node shapes, deny bursts, bus routing, absorb-into-port. Primitives compose; an engine ossifies.
- **Don't normalise the tint alphas, fills, timings or font sizes in the same pass.** The first pass is pixel-identical so a reviewer can see regressions. Visual unification (one tint strength per meaning, one panel fill, one packet timing) is a separate design pass afterwards, one decision at a time.
- **Don't force the odd sims onto `useSimulation`.** observability, event-sourcing and multi-region use `setInterval` with immutable state and are small (`useInterval` is enough). event-loop writes the DOM directly on purpose. tcp-udp's CSS-transition packets and sharding's `layoutId` are correct as they are.
- **Don't extract one-off domain visuals** (§1.11): tree layout algorithms, lanes, sql `Table`, the B+tree, the git graph, the ring, the map, the histograms, the sorting race.
- **Don't build `DataTable`, `KeyValue`, `EventLog`, `ChipChoice` or `CanvasStage` components.** Shared CSS and motion presets cover them; the component APIs would be all escape hatches.
- **Don't read CSS tokens via `getComputedStyle` at draw time.** Mirror them in `palette.ts` and assert sync once in dev.
- **Don't introduce seeded RNG across the app.** Use it only where determinism is the lesson (tcp-udp) or needed for a test.
- **Don't rename lesson files for naming consistency** (`model`/`frames`/`bst`/`lsm`...). Set the convention for new lessons in the README instead: `frames.tsx` for frame builders with JSX captions, `sim.ts`/`model.ts` for pure logic, `draw.ts` for canvas drawing.
- **Don't let batch agents touch shared code**, even "just one prop". That is how parallel work turns into merge conflicts and silent API drift. Route it through Phase 2.
- **Don't start without git.** Seriously.
