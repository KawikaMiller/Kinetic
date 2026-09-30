# Shared API reference

What exists in the shared layer, how to call it, and which copy-pasted pattern it replaces
(pattern numbers refer to `docs/shared-components-plan.md` §1.1). All 51 lessons are migrated.
New lessons start here: reach for these before writing anything local.

Good reference implementations:
- **client-server**: scene kit (`SceneNode`, `Packet`), `Box`.
- **circuit-breakers**: `useSimulation`, canvas kit, sim utils, `PauseButton`, `toOptions`, format helpers, sim/draw split (`sim.ts` / `draw.ts` / `Stage.tsx`).
- **raft**: `useSimulation` with `refresh()` for actions taken while paused.
- **ip-ports**, **zero-trust**, **distributed-transactions**: the `Packet` variants (`bounce`/`absorb`, `even` hops, outline + lesson classes).

Changing shared code: keep the API backward compatible or migrate every caller in the same
change, and prove it pixel-identical: `npm run smoke -- --frames --label=<name> <ids>` then
`npm run diff -- <baseline> <name> <ids>` (see CLAUDE.md).

---

## Tokens and CSS

### Colour tokens (`src/styles/global.css`) — patterns 1-3

Phase 0b already converted every lesson-CSS literal that exactly matched a token. New tokens:

| Token | Value | Use |
|---|---|---|
| `--orange`, `--amber`, `--pink`, `--sky` | `#ff8c5a`, `#f7b538`, `#ff5d8f`, `#8fb8ff` | categorical hues (amber = `--t3`, pink = `--t4`) |
| `--land` | `#2a3246` | map landmass dots |
| `--on-hi`, `--on-ok`, `--on-bad`, `--on-info`, `--on-violet`, `--on-orange` | dark inks | text on a solid token fill |
| `--on-hi-muted`, `--on-bad-muted` | `#4a3b00`, `#4a0d14` | secondary (dimmer) text on a solid fill |
| `--on-fill` | `var(--bg)` | text on packets/pills |
| `--cell-dead` | `#1a1216` | a crashed/dead node's box (the cell warmed toward `--bad`); `TOKENS.cellDead` on canvas |
| `--trk-<id>` (14) | see `global.css` | curriculum track colours (`TRACKS[id].color` is `var(--trk-<id>)`; `TOKENS.trkDsa` etc. on canvas). App chrome only (cards, chips, crumbs): lessons keep using the semantic tokens |

Tints: `color-mix(in srgb, var(--hi) 14%, transparent)`.
Colours: DOM/SVG use `var(--x)`, canvas uses `TOKENS.x` / `alpha()`. A literal that genuinely
can't be a token (a drawing's own material, a neutral shadow) carries an `allow-color` marker with
a reason on the same line, and `npm run check-tokens -- --strict` must pass (see CLAUDE.md):
```css
box-shadow: 0 6px 20px -6px rgb(0 0 0 / 0.7); /* allow-color: neutral drop shadow */
```
```ts
const WALL_SWATCH = '#4a5370'; // allow-color: maze wall material
```
New tokens go in `global.css`, and in `palette.ts` too if canvas code needs them
(`assertTokensInSync` checks every `palette.ts` entry against the CSS in dev).

### Utility classes (`src/styles/kit.css`) — pattern 4

Loaded globally. Colour flows through `--c` / `--on-c`, set by a `.tone-*` class or inline.

| Class | What |
|---|---|
| `.tone-hi/ok/bad/info/violet/orange/dim` | sets `--c` and `--on-c` |
| `.cell` + `.is-solid` / `.is-tint` / `.is-dim` | value box; solid fill in `--c` with `--on-c` ink and glow; tinted; dimmed |
| `.chip` | small mono tag in `--c` (muted by default) |
| `.box` (+ `.box-sunken`, `.box-raised`) | sub-panel: padding 12/14, radius 12, `--line` border, `--bg` 72% fill |
| `.tray` | dashed collector panel |
| `.section-title` (+ `.is-regular`, `> .hint-inline`) | 11px uppercase label: 700 weight / .1em, or regular weight / .08em |
| `.empty-note`, `.hint` (+ `.is-muted`, `.is-block`), `.focus-ring` | faint mono placeholder; 13px hint; 3px ring in `--c` |
| `.stage-pad` | flex column stage padding 20/22 |
| `.canvas-wrap` | `position: relative; height: var(--h, 420px)`, canvas `display: block` |
| `.data-table`, `.log-row` | shared table look; left-bordered tinted log row in `--c` |

Existing rules win over the kit when the lesson's stylesheet overrides them (it loads later), so
`<Box className="cs-panel">` with `.cs-panel { background: … 75% }` keeps the lesson's fill.
**Class names are global**: never style bare `.on`, `.bad`, `.hint`, etc. without your lesson prefix.
One breakpoint: `@media (max-width: 900px)`.

`kit.css` and the scene kit's `scene.css` are both loaded globally from `main.tsx`, so a lesson can
use any of these classes (including `scene-*` on its own custom shapes) without importing anything.

---

## Core utilities (`src/core/`)

### `palette.ts` — canvas colours (pattern 3)
```ts
TOKENS.hi, TOKENS.line2, TOKENS.cellLine, TOKENS.orange …   // hex mirror of the CSS tokens
alpha(TOKENS.hi, 0.3)         // 'rgb(255 209 102 / 0.3)'
cssVar('cellLine')            // 'var(--cell-line)'
categorical(i)                // 'var(--info)', 'var(--violet)', … wraps; categorical(i, 'hex') for canvas
CATEGORICAL                   // ['info','violet','ok','amber','pink','orange','hi','sky']
```
Delete the lesson's `const C = {…}`. **`C.line` was `#323a4f` = `TOKENS.line2`**, not `TOKENS.line`.
A dev-only check (`assertTokensInSync`, run from `main.tsx`) logs a console error, which fails
smoke, if this table drifts from `global.css`.

### `tone.ts`
```ts
type Tone = 'hi' | 'ok' | 'bad' | 'info' | 'violet' | 'dim' | 'orange';
toneVar('ok')                                    // 'var(--ok)'
toneFor(errPct, { warn: 20, bad: 50 })           // 'ok' | 'hi' | 'bad'; { invert: true } when higher is better
```

### `format.ts` — pattern 10
```ts
NA                    // '–', the one placeholder
duration(0.34)        // '340ms'; duration(1.26) → '1.3s'   (the 4 identical `fmt` copies)
ms(41.6)              // '42 ms'
perSec(12)            // '12/s'
pct(0.123)            // '12%'; pct(0.0004, 1) → '<0.1%'
bytes(1536)           // '1.5 KB' (binary); bytes(12000, { base: 1000 }) → '12.0 KB'; { dp: 0 } → '12 KB'
times(3)              // '3×'
plural(3, 'step')     // '3 steps'; plural(2, 'entry', 'entries')
pad2(7), clock(605)   // '07', '10:05'
```

### `math.ts`, `random.ts`, `hash.ts` — patterns 9, 11
```ts
clamp(v, lo, hi), clamp01(t), lerp(a, b, t)
ease(t), easeInOutQuad(t)                                      // cubic and quadratic ease-in-out
randInt(lo, hi), randRange(lo, hi), pick(xs), shuffle(xs)      // all take an optional rnd
expSample(mean), weightedPick(items, weightFn), mulberry32(seed), freshInt(lo, hi, taken) // null if none free
fnv1a(s)          // unsigned 32-bit FNV-1a
fmix32(h)         // murmur3 finaliser
hash32(s)         // fmix32(fnv1a(s)): byte-identical to consistent-hashing's hash32
hexHash(s, 7)     // byte-identical to git-internals' hash()
```
Verified: `hash32`, `hexHash` and `fnv1a` produce identical output to the consistent-hashing,
git-internals and probabilistic-structures copies, and `mulberry32` matches tcp-udp's. lsm-trees
and sharding use the same FNV loop. Still diff captions after swapping.
`hooks.ts` is hooks only (`useLoop`, `useElementSize`, `useCanvas`); maths and randomness come from here.

### `geometry.ts`
```ts
interface Pt { x: number; y: number }
pointAlong(a, b, t), midpoint(a, b)
pillWidth(label, charW = 6.5, pad = 20)          // label.length * charW + pad
archPath(x1, x2, baseY, lift)                    // quadratic arch 'M … Q … …'
treeToPixels({ x, depth }, { count, width, pad, top, levelGap })
```

### `motion.ts` — pattern 18
```ts
SPRING.soft (170/24), SPRING.snappy (300/28), SPRING.stiff (450/32)
SHAKE                       // animate={SHAKE}
enterFromLeft, popIn        // spread: <motion.li {...enterFromLeft} />
```
Map an inline spring to the nearest preset only if it looks the same. Otherwise keep a named local constant.

### `sim.ts` — pattern 9
```ts
percentile(sortedAsc, 0.99)     // sorted[min(len-1, floor(len*p))], 0 if empty (CB/LB formula)
mean(xs)
const hist = createSampler<P>({ every: 0.5, cap: 60 }); hist.tick(now, () => sample); hist.values; hist.clear()
trimWindow(xs, now, span, (x) => x.t)     // in place, front of a time-ordered array
windowRate(count, span)
travel(from, to, t0, dur, now, easing?)   // { x, y, t }; LINEAR by default, pass `ease` for LB/RL
const insight = createCooldown(8); if (insight.ready(now) && cond) { insight.fire(now); … }
createCooldown(8, { armed: true })        // ready immediately instead of 8 s into the run
```
`createCooldown` has separate `ready()`/`fire()` because insight gates only re-arm when an
insight actually fires; a throttle that re-arms on every true check would behave differently.

### `spark.ts`
```ts
sparkPoints(values, w, h, { cap, max?, minMax?, align?: 'left' | 'right', pad?: { top?, bottom? } })   // Pt[] in a w×h box
sparkMax(values, { max?, minMax? })
sparkY(v, max, h, pad?)                    // the same y mapping, for reference lines
```
Right-aligned by default: x = (i + cap - len) · w/(cap-1). That's the CB/LB chart formula.

### `canvas.ts` — pattern 8
```ts
FONT.mono(11), FONT.sans(13, 700)
text(ctx, s, x, y, { color = TOKENS.muted, font = FONT.mono(11), align?, baseline? })  // align/baseline restored after
box(ctx, cx, cy, w, h, { stroke = muted, fill = cell, lineWidth = 2, radius = 10 })     // centred (CB/BP roundBox)
rect(ctx, x, y, w, h, { fill?, stroke?, lineWidth = 1, radius = 0 })                    // top-left; draws only what you pass
dot(ctx, x, y, r, color, { glow? })
wire(ctx, [[a, b], …], { color = line2, width = 2, dash = [4, 6] })                     // dash: [] for solid
bar(ctx, x, y, w, h, ratio, color, { track = dim, radius = 0 })                         // ratio clamped
tintBox(ctx, x, y, w, h, color, { label?, fillAlpha = .1, strokeAlpha = .6, radius = 8 })
drawSpark(ctx, { x, y, w, h }, values, { cap, max?, minMax?, color, width = 2 })
```
`text()` without `align` uses the context's current alignment, so lessons that set
`ctx.textAlign = 'center'` once per frame keep working.

### `useSimulation.ts` — pattern 7
```ts
const { world, snap, paused, setPaused, togglePause, reset, refresh } = useSimulation({
  create: () => createWorld(rate),            // lazy; again on reset()
  step: (w, dt) => { advance(w, dt); narrate(w); },
  snapshot: (w) => w.sim.stats(),             // plain data for React
  snapshotEvery: 0.3,                         // seconds (default)
  onSnapshot: (w, snap) => maybeInsight(w, snap),
  initiallyPaused: false,
});
const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => drawScene(ctx, w, h, world()));
useLoop(redraw, !paused);                     // registered after the sim, so it draws after each step
```
- `world()` is stable. Use it in effects, handlers and draw callbacks, **never during render**; render from `snap` (null until the first snapshot).
- The first snapshot is taken on mount, so a sim that starts paused still has stats.
- `refresh()` re-reads `snap` right now, even while paused. Call it after an action changes the world (raft: crash a node, send a command). It skips `onSnapshot`, so the action's own caption isn't replaced by an insight.
- "Sync React state into the world" stays a plain `useEffect` in the lesson: `useEffect(() => { world().rate = rate; }, [world, rate])`.
- Deviation from the plan: there is **no `afterStep` option**. `useCanvas` needs `world` and the sim needs `redraw`, which is a circular reference that oxlint rejects. Redraw on its own `useLoop` instead, as above.

### `useInterval.ts`, `useAsyncValue.ts`, `crypto.ts` — pattern 19
```ts
useInterval(() => tick(), 250, !paused)                     // setInterval sims (observability, event-sourcing, multi-region)
const digest = useAsyncValue(() => sha256Hex(text), text)   // null while pending or stale
useAsyncValue(fn, key, { keepPrevious: true })              // keep the last result until the new one lands (no flicker while typing)
enc, hasSubtle(), toHex(buf), b64url(buf), hexToBits(hex)
sha256Hex(text): Promise<string | null>                     // null without crypto.subtle
hmacSha256(secret, data, 'hex' | 'b64url'): Promise<string | null>
```
`useSignedJwt`'s string-key hack becomes
`useAsyncValue(() => signJwt(payload, secret), JSON.stringify([payload, secret]))`.

### `recorder.ts` — pattern 15
```ts
const r = createRecorder<MyFrame>({ reads: 0, hot: null }, { transient: { hot: null } });
r.set({ reads: r.get().reads + 1 });
r.snap(<>Read the root</>, hold?, patch?);   // set(patch), push { ...state, say, hold }, then reset transient keys
r.finish(<>Done</>, 2);                       // replace last frame's say/hold
return r.frames;
```
It makes a shallow copy, so clone nested arrays and objects before mutating them. Mandatory for
db-indexes and lsm-trees, recommended wherever a local push/snap exists, optional for class
recorders (sorting, heaps) and declarative scripts.

### Captions (`caption.ts`) — pattern 17
```ts
useIntroCaption(<>Intro…</>, deps?)          // set on mount and when deps change (replaces ~17 intro effects)
setCaption(node, { quiet: true })            // swap text in place, no fade (live readouts, per keystroke)
// step frames: { say, quiet: true } → the player passes it through
```

### Player keyboard (`usePlayer.ts`, `playerRegistry.ts`)
Space / ← / → / R are bound by `usePlayer` (unless `keyboard: false`). They never fire while typing,
and Space on a focused button, link or `role=radio|button|…` control presses that control instead
of toggling playback. The mapping is the pure `shortcutFor(event, target)` (unit-tested). A player
with the keyboard on registers itself with the lesson page, which shows the shortcut hint only
then, so lessons do nothing extra. A one-frame player never reports `playing`.

### Persisted state (`storage.ts`)
```ts
const store = createPersistedStore('overview-open', {}, isBooleanRecord); // key, fallback, shape guard
usePersistedStore(store)                                                   // value; re-renders on set
```
The shape guard is required: a stored value that fails it (hand-edited, older schema, `null`)
reads as the fallback instead of crashing a component. Guards provided: `isStringArray`,
`isBooleanRecord`; `parseStored` is the pure, tested core.

### Error boundaries (`components/ErrorBoundary.tsx`)
The lesson page wraps every `Stage` in `ErrorBoundary`: a crashing visual shows "This lesson hit an
error" with a "Reload the lesson" button while the overview, side panels and quiz keep working. The
app root has a last-resort boundary. Lessons don't add their own.

### Focus
Every keyboard-focused control gets the shared accent ring from a global `:focus-visible` rule
(sliders and the scrubber included). Don't set `outline: none` without a replacement focus style.

---

## Components (`src/components/`)

### Controls (`ui.tsx`, `options.ts`, `ScenePicker.tsx`) — pattern 16
```tsx
<Segmented label="n" value={n} onChange={setN} options={[{ value: 8, label: '8' }]} />  // numbers now allowed
toOptions(MODES)                                         // [{id,label}] → options (import from components/options)
<Toggle label="DNS" value={cached} onChange={setCached} off="Cold lookup" on="Cached" />  // off option always first
<TextField label="Key" value={k} onChange={setK} onEnter={insert} onBlur={normalise}
           sanitize={(s) => s.replace(/\W/g, '')} width={120} spellCheck={false} className="xx-field" disabled={off} />
<ControlGroup label="Presets" inline className="xx-presets">{buttons}</ControlGroup>   // inline: label left of the group
<Hint>…or click a number</Hint>                          // tone="muted", block (its own line), className
<Stat label="Load" value={…} className="xx-stat">{<Bar …/>}</Stat>   // children render under the value
<PauseButton paused={paused} onToggle={togglePause} />
const [scene, picker] = useScenePicker({ label: 'Lane', options: LANES, initial: 'hash' });
<StageFrame controls={[rowOne, rowTwo]}>   // array → each wrapped in <Controls>, stacked with a dashed divider
<StageFrame minWidth={880}>                // phones: the visual keeps 880px and scrolls sideways inside the stage
```
- `StageFrame minWidth`: the narrowest width at which the visual stays readable. Below it the stage scrolls
  sideways *inside itself* (edge fades, a "swipe" hint that hides on scroll or after 5 s, keyboard-focusable)
  instead of shrinking the drawing; wider screens see no difference. Set it on any stage with a fixed-layout
  SVG, canvas or absolutely positioned scene. Pick the value with `npm run smoke -- --mobile <id>`: it fails
  when scene text renders under 8px or the frame clips content. Rough guide: `356 × 8 / smallestTextPx` at 390.
- A `Toggle` swap changes the option order when the lesson listed "on" first (cdn-edge). That's a deliberate change, so list it.
- `TextField`: Enter does nothing unless `onEnter` is set. For clamped number fields, keep the raw text in state and clamp in `onBlur` and when the value is used, not on every keystroke (see trees-bst).
- `TextField` has the shared look (a 14px mono input with an accent focus ring). A lesson `className` can resize it; a disabled field dims to 0.45 as a whole.

### Panels (`Panel.tsx`) — pattern 4
```tsx
<Box variant="default | sunken | raised" className="xx-panel">…</Box>
<SectionTitle hint="last 10 s">Queue</SectionTitle>     // weight="regular" for the lighter label style; className
<Tray label="Output" labelWeight="regular" empty="nothing yet" ariaLabel="Output">{items}</Tray>
```
`Tray` shows `empty` as a faint mono note. If your empty text needs its own styling, render it as
a child instead (heaps, trees-bst). A `SectionTitle` is an inline span: inside a block (not flex)
parent, give it `display: block` in the lesson CSS so its line box matches a div's.

### `Bar.tsx` — pattern 12
```tsx
<Bar value={load} max={1} tone="hi" marker={0.75} height={8} label={…} trailing={…} animate />
<Bar … color={c} track="var(--line-2)" transition={{ duration: 0.15 }} markOpacity={0.7} markLabel="resize threshold" className="xx-bar" />
```
It renders `.meter` / `.meter-track` / `.meter-fill` / `.meter-mark`: a track (default `--line`)
with a radius-99 fill in `--c`. `transition` is the fill's motion transition (default 0.4 s
easeOut; `{}` = motion's default tween). Lesson CSS can restyle `.xx-bar .meter-mark` (hash-table's taller tick).

### `CodePanel.tsx` — pattern 13
```tsx
<CodePanel title="Dockerfile" lines={LINES} stateOf={(i) => …} gutter="number | arrow | none"
           nowStyle="solid | bar" trailing={(i) => status[i]} />
// or active={3} / active={[2, 3]}
```
Line states: `idle past now next done cut cached pending`. `solid` gives the now-line a `--hi` fill
(tx-acid); `bar` gives it a tint and a left bar (race, recursion, containers). The CSS is generic,
so expect to keep a few lesson overrides for exact pixel parity.

### `Sparkline.tsx`, `AnimatedValue.tsx`, `ArrowMarker.tsx`
```tsx
<Sparkline values={hist} width={80} height={22} cap={60} align="left" minMax={100}
           pad={{ top: 2, bottom: 1 }} color="var(--info)" strokeWidth={1.6} refLine={target} className="xx-spark" />
<AnimatedValue value={count} variant="pop | flip" as="b" className="…" />
const arrow = useArrowMarker('var(--violet)', { size: 6, refX: 9 });   // <svg>{arrow.def}<path markerEnd={arrow.url} /></svg>
```
`Sparkline` draws nothing, not even the dashed ref line (`.sparkline-ref`), until there are two
samples. `useArrowMarker` uses a per-instance id so markers never collide; `refX` (0-10) sets
where the tip sits relative to the line's end (default 8, 9-10 = at the end).

### Scene kit (`components/scene/`) — patterns 5-6
```tsx
import { Flyer, Packet, Pulse, SceneNode, TravelDot } from '../../components/scene';

<SceneNode at={POS.api} w={100} h={56} rx={10} title="api-1" sub="stateless"
           titleDy={-4} subDy={13} on={active} busy={working} tone="info" variant="default | bad | dim">
  {/* extras in scene coordinates */}
</SceneNode>

<Packet key={frameIndex} path={[a, b]} label="GET /users/42" color="var(--info)"
        arrive="fade | stay | absorb | bounce" keyframes="timed | even" duration={1.15}
        height={22} charW={6.4} pad={20}
        timing={{ travelEnd: 0.62, fadeStart: 0.8, fadeInEnd: 0.12 }}   // default, = client-server
        stopAt={0.82} delay={0} variant="solid | outline" trail
        scaleIn={0.6 | null} fadeIn={0.15 | 'full' | 'first-hop'} lift={34}
        classes={{ pill: 'xx-pill', text: 'xx-pill-text' }} />

<Pulse at={p} from={30} to={80} color={c} duration={1} opacity={0.9} mode="ripple | breathe" className="…" />
<TravelDot path={[a, b, c]} color="var(--ok)" r={5} duration={4} delay={1} repeat />
<Flyer from={{ x: 10, y: 40 }} to={{ x: 80, y: 40 }} className="rep-pkt kind-write" style={…}
       axis="both | x" center fade="arrive | lost | in | none | number[]" startScale={0.6 | null}
       exitScale={0.6 | null} opacityDuration={0.2} arc={22} duration={0.8} delay={0} onArrive={merge}>W</Flyer>
```
CSS classes you can reuse on custom shapes: `.scene-edge` (dashed link), `.scene-zone` (uppercase
zone label), `.scene-node` / `.scene-node-box` / `-title` / `-sub`, `.scene-packet(-text)`.
Packet text size is `var(--packet-fs, 10.5px)`: set `--packet-fs: 11px` on the svg if yours was 11px.

Behaviour notes, for pixel parity:
- **`SceneNode`**
  - The box is centred and the text offsets are relative to the centre (default title −3, sub +13).
  - `.on` beats `.is-bad`, so an active down node stays highlighted, as in client-server.
  - `busy` renders `<Pulse from=max(w,h)/2 to=max(w,h)>`. If your pulse radii differ, render your own `<Pulse>`.
- **`Packet` with `arrive="fade"`** reproduces client-server/oauth/auth exactly when you pass their
  duration, height, `charW` and `timing`. Examples:
  - oauth: `timing {0.62, 0.82, 0.1}`, 1.4 s, h 24, `charW` 6.2, pad 22.
  - auth: `travelEnd` 0.65, `fadeStart` 0.82; read its opacity `times` for `fadeInEnd`.
  - Multi-point paths split `travelEnd` evenly between the legs.
- **`Packet` with `arrive="stay"` and `trail`** is web-request's pill and line (0.7 s travel, 0.15 s fade-in).
- **`Packet` variants:**
  - `keyframes="even"` spaces every hop evenly and fades out on the last one (zero-trust).
  - `arrive="absorb"` dissolves into the target, `arrive="bounce"` hops up by `lift` and pulses in place (ip-ports).
  - `scaleIn={null}` + `fadeIn="full" | "first-hop"` + `variant="outline"` + `classes` is distributed-transactions' outline pill, including the bus route as a 4-point path.
- **`Flyer`:**
  - `axis="both"` is replication's `rep-pkt` motion: `x`/`y` −50% centring, `left`/`top` in %, and an `exit` shrink. There, `arc` wraps the children in `.flyer-arc`.
  - `axis="x"` moves `left` only (tls, http-basics, processes-threads). `center` centres it horizontally, and `arc` lifts the element itself (crdts).
  - `onArrive` fires once per mount, only for the trip, not the exit animation.
- **`Pulse`** is decoration, so with `prefers-reduced-motion` it renders a still ring instead of looping. Teaching motion (packets, flyers, `TravelDot` traffic) always plays.

---

## Tier 1 kit (rollout plan P1)

Built before Tier 1, each for 2+ Tier 1 lessons. All of them are on the dev-only showcase at
`#/dev/kit` (`pages/DevKit.tsx`, not in production builds): open it to see and poke each piece.
Component CSS lives in `kit.css`, so the classes work without importing anything.

### `core/bits.ts`, `BitStrip.tsx` — binary-hex, twos-complement, floating-point, char-encoding, base64-encodings, command-line
```ts
toBits(0x2a7f, 16)        // Bit[] MSB first; negatives in two's complement, out-of-range wraps: toBits(-1, 8) → 11111111
fromBits(bits), fromBitsSigned(bits), flipBit(bits, i), placeValue(i, width)   // width 1..53
chunkGroups(16, 4, { tone: 'violet', label: (k, from, to) => hexDigit(from, to) })  // nibbles, bytes, 6-bit, rwx
```
```tsx
<BitStrip bits={bits} onToggle={(i) => setBits(flipBit(bits, i))} placeValues
          groups={chunkGroups(16, 4, { tone: 'violet', label: … })} highlight={[carryAt]} />
<BitStrip bits={f32} size="sm" groups={[{ from: 0, to: 0, tone: 'bad', label: 'sign' }, …]} />
<BitStrip bits={utf8} toneOf={(i) => (isPrefix(i) ? 'dim' : 'info')} />          // per-bit tone beats the group's
<BitStrip bits={toBits(0o754, 9)} labelOf={(i) => 'rwx'[i % 3]} groups={chunkGroups(9, 3, …)} />
```
- Set bits are a solid fill in their tone; clear bits are a dark cell outlined in it. Tone: `toneOf(i, bit)`, else the group's, else `hi`.
- `placeValues` prints 2^k above each bit, compacted (`32K`); `labelOf` overrides that label.
- `highlight` rings bits in `highlightTone` (default `info`: binary-hex's carry ripple).
- It wraps between groups only, never inside one: split a long run (a 23-bit mantissa) into a few groups, labelling only the first.
- With `onToggle` the bits are `aria-pressed` buttons; without it they're read-only. `size`: `sm` 18px, `md` 24px, `lg` 30px (one step smaller at ≤900px).

### `core/truth.ts`, `TruthTable.tsx` — logic-gates, propositional-logic
```ts
truthRows(['p', 'q'])                 // [{p:F,q:F}, {p:F,q:T}, {p:T,q:F}, {p:T,q:T}]; { trueFirst: true } for TT…FF
truthRowIndex(['A', 'B'], inputs)     // the row matching the current inputs
```
```tsx
<TruthTable vars={['A', 'B']} format="10" trueTone="hi" currentTone="info"          // logic-gates
            columns={[{ label: 'sum', fn: (r) => r.A !== r.B }, { label: 'carry', fn: (r) => r.A && r.B }]}
            currentRow={truthRowIndex(['A', 'B'], inputs)} onRowClick={(row) => setInputs(row)} />
<TruthTable vars={['p', 'q']} columns={[f1, f2]} mismatchRows={diffRows} />       // T/F, true = --ok, current = --hi
```
Rows with `onRowClick` are keyboard-focusable buttons (Enter/Space). Outputs are separated from inputs by a rule.

### Memory kit (`components/memory/`) — stack-vs-heap, value-vs-reference, closures-scope, oop-fundamentals
SVG primitives in scene coordinates, plus the geometry to connect them:
```tsx
import { HeapObject, RefArrow, VarSlot, heapFieldPort, heapRect, slotPort } from '../../components/memory';

<VarSlot at={{ x: 10, y: 70 }} name="a" isRef tone="violet" highlight={seesMutation} dead={framePopped} />
<VarSlot at={{ x: 10, y: 30 }} name="count" value={3} />
<HeapObject at={user} w={180} title="{ } user" variant="live | collectable | freed"
            fields={[{ name: 'name', value: '"Ada"' }, { name: 'tags', isRef: true }]} highlight={searching} />
<RefArrow from={slotPort({ x: 10, y: 70 })} to={heapRect(user, 180, 2)} bend={-12} />
<RefArrow from={heapFieldPort(user, 180, 1)} to={heapRect(tags, 180, 1)} dangling={freed} />
```
- Sizes: `SLOT` (150 × 30, name tag 58) and `HEAP` (title 24, rows 22) are exported, so layout maths and the shapes agree. `heapHeight(n)` and `heapRect(at, w, n)` size a block.
- `RefArrow` ends on the target box's border facing its source (`rectEdgeToward`), so arrows never poke inside. `bend` bows it to separate two arrows to one box. `dangling` is dashed `--bad`.
- `collectable` is dim and dashed with a corner tag (unreachable, waiting for GC). `freed` is dashed `--bad` with a "freed" tag. Pass `tag` to override the corner text (e.g. `GC`).
- Heap blocks fade in and arrows draw themselves in, except under reduced motion, where both appear at once.

### `ArrayStrip.tsx` — two-pointers, sliding-window, prefix-sums, debugging-method; binary-search
```tsx
<ArrayStrip values={arr} cellState={(i) => 'idle | active | done | dim | bad'}
            ranges={[{ from: lo, to: hi, labels: ['lo', 'hi'] }, { from: b0, to: b1, tone: 'violet' }]}
            pointers={[{ i: l, label: 'L', tone: 'info' }, { i: r, label: 'R', tone: 'violet' }]}
            onCellClick={(i) => pick(i)} cellTitle={(i) => `Search for ${arr[i]}`}
            showIndex fontSize={12} cellMax={56} />
```
- `active` lifts in `--hi` (checking now), `done` lifts in `--ok` (found), `dim` is ruled out, `bad` is a `--bad` fill. `idle` cells inside the **first** range get the "still possible" tint.
- Pass `pointers={[]}` (not undefined) when pointers come and go, so the pointer lane keeps its height.
- Ranges and pointers glide with `SPRING.snappy`. Pointers keep their identity by `id`, or by `label` when it's a string.
- Cells share the strip width equally. For short arrays pass `cellMax`: the strip narrows, so the markers stay aligned.
- Range labels sit about 28px above the strip, so leave that room above it.
- binary-search runs on it, pixel-identical: 11/11 frames against the pre-migration code, including 8 and 40 cells and a fully ruled-out missing-value search.

### `ResizablePane.tsx` — css-layout, responsive-design
```tsx
<ResizablePane min={320} max={1440} value={width} onChange={setWidth} label="Device width" step={10} height={260}>
  <SamplePage />   {/* real DOM: measure it with getBoundingClientRect */}
</ResizablePane>
```
Drag the handle, or focus it and use ←/→ (`step`, ×5 with Shift), Home and End. It's a `separator`
with `aria-valuenow`. When the stage is narrower than `value`, the pane is shown at the stage's width
and the readout says "shown at Npx", so measurements inside stay honest.

### `TextArea` (in `ui.tsx`) — regex-basics, data-formats
```tsx
<TextArea label="Test text" value={text} onChange={setText} rows={6} />      // mono by default
<TextArea label="Notes" value={v} onChange={setV} mono={false} spellCheck />
```
The same look and focus ring as `TextField` (same `.text-field` wrapper). Enter inserts a newline.
Spellcheck is off by default, since this is usually code or data. Highlighting matches inside the
text (regex-basics) is lesson-local until a second lesson needs it.

### `core/scale.ts` — floating-point, logs-exponentials, memory-hierarchy
```ts
const x = linearScale(0, 100, 0, 500);        // x.map(50) → 250, x.invert(250) → 50, x.ticks(5) → [0, 20, …, 100]
const y = logScale(1e-9, 1e-1, 300, 0);       // y axis, bottom-up; y.ticks(9) → [1e-9, 1e-8, …, 1e-1]
logScale(1, 1024, 0, 10, 2)                   // base 2
```
Linear ticks are "nice" (1, 2 or 5 × 10^k) with float noise rounded off (0.3, not 0.30000000000000004).
Log ticks are whole powers of the base inside the domain, thinned evenly beyond `count`. A log
scale needs a positive domain (it throws otherwise) and maps `v <= 0` to `NaN`.

## Tier 1 extractions (rollout plan P2)

### `core/treeLayout.ts`, `TreeSvg.tsx` — tree-traversals, dom-events, accessibility, dependency-management; trees-bst, recursion
```tsx
const shape: TreeShape<number> = { root, children: (id) => [nodes[id].left, nodes[id].right] }; // null = empty slot
<TreeSvg shape={shape} layout="inorder" width={900} height={380}            // viewBox; size it with CSS
         label={(id) => nodes[id].key} onNodeClick={(id) => pick(id)}
         nodeMark={(id) => (id === hi ? { tone: 'hi', fill: 'solid' } : onPath(id) ? { tone: 'violet', fill: 'tint' } : null)}
         edgeMark={(parent, child) => (onPath(child) ? { tone: 'violet', dashed: false } : null)}
         nodeScale={(id) => (id === hi ? 1.15 : 1)}
         overlay={({ at, levelGap }) => <Ghost at={at(parentId)} />} />

// n-ary / custom nodes: tidy layout, fixed level gap, your own shapes around (0, 0)
<TreeSvg shape={domShape} layout="tidy" width={640} height={300} levelGap={70}
         renderNode={(id) => <><rect x={-40} y={-14} width={80} height={28} rx={6} /><text y={4}>{tag(id)}</text></>}
         hidden={(id) => !revealed.has(id)} />
```
- `layoutTree(shape, 'inorder' | 'tidy')` is pure (tested): `inorder` places a binary tree by in-order rank, so a BST reads sorted left to right and a node with only a right child still sits left of it. `tidy` gives leaves consecutive columns in depth-first order and centres each parent between its first and last child: right for DOM, dependency and accessibility trees and for call trees like fib(n). `treeX(col, columns, width, pad)` maps a column to pixels.
- Vertical spacing: `levelGap` fixes it; otherwise it's `min(maxLevelGap, (height - bottomRoom) / depth)`.
- Nodes glide with `transition` (default `SPRING.soft`) when the shape changes, pop in from `enterScale` and fade out when removed. `hidden(id)` removes a node and the edge to it without moving anything else (the layout always uses the whole shape), e.g. fib calls not made yet.
- Default nodes are a circle of `radius` with a centred label. The base node CSS is wrapped in `:where()`, so classes you use inside `renderNode` always win.
- Marks: `nodeMark` → `{ tone, fill: 'tint' | 'solid', tint?: % }` (tint default 16%), `edgeMark` → `{ tone, dashed? }`, `markedEdgeWidth` (default 3.5). `nodeClass(id)` adds lesson classes.
- trees-bst (in-order, the null ghost as an `overlay`) runs on it pixel-identically. recursion's fib tree (tidy, custom nodes, `hidden`) does too, except for subpixel antialiasing on a few label glyphs (≤0.03% of the stage), because labels are now placed by the node's transform instead of absolute coordinates.
- heaps keeps its own tree: nodes sit at array-index positions of a complete binary tree with `2i+1`/`2i+2` edge labels, and they're keyed by item so swaps animate. A third layout mode is worth adding only when a Tier 1 lesson needs it.

### `CallStackPanel.tsx` — tree-traversals, error-handling-models, debugger-tools; recursion
```tsx
<CallStackPanel
  frames={[{ id: 3, name: 'chargeCard(order)', detail: 'throws CardDeclined', state: 'error' },  // TOP FIRST
           { id: 2, name: 'handleRequest()', state: 'waiting' },
           { id: 1, name: 'main()', state: 'waiting' }]}
  meta="3 frames" alarm={crashed} anchor="bottom"
  selected={frameId} onSelect={setFrameId}                                   // debugger: pick a frame
  empty={<p className="empty-note">nothing running</p>} overlay={crashed && <CrashBanner />} />
```
- `state`: `idle` (default), `running` (solid `--hi`), `waiting` (dimmed), `returning` (`--info`), `ok` (`--ok`: a base case, a `catch` that handled it), `error` (`--bad`: throwing, crashed, unwinding).
- `frames` is **top first**. `anchor="bottom"` (default) stacks from the bottom up like plates; `anchor="top"` lists from the top like the DevTools pane. `showDepth` numbers frames by depth (0 = outermost).
- Frames push in from above and pop off to the right (`layout` + `SPRING.snappy`); `alarm` shakes them and turns the box red.
- `onSelect` makes frames buttons (focus ring included); `selected` highlights one.
- recursion's stack runs on it, pixel-identical. Its "↓ value" return chip is lesson-local, passed in `detail`.

### `core/commitGraph.ts`, `CommitGraph.tsx` — branching-workflows, secrets-management; git-internals
```tsx
<CommitGraph
  commits={[{ id, lane, parents, short: id.slice(0, 4), message: msg, dead: !reachable.has(id), tone?: 'bad' }]} // oldest first
  refs={[{ name: 'main', at: tipId, head: true }, { name: 'feature-1', at: otherTip }]}
  selected={openId} onSelect={setOpenId} title="commit graph · click a commit to open it"
  overlay={(at) => <ConflictMarker at={at(id)} />} />
```
- Commits run left to right in the order given, one row per lane. Edges are straight along a lane and S-curves across lanes. Merge commits (2+ parents) get a thicker ring, `dead` commits fade and dash, and `tone` overrides a commit's ring colour (e.g. the commit that leaked a key). Tags stack above their commit; HEAD's reads "HEAD → name" in `--hi`.
- It is its own horizontal scroller. When commits are added it scrolls the newest into view (never past the start), and the side with hidden commits gets an inner glow (`has-more-left` / `has-more-right`), so on a phone you can see there's more to swipe to. `follow={false}` turns the auto-scroll off.
- The drawing is exactly as wide as the commits need (no minimum width), so short histories don't create an empty scroll area.
- `layoutCommitGraph`, `commitEdgePath`, `shortMessage` and `defaultLaneColor` are pure and tested; `spacing` overrides `DEFAULT_SPACING`.
- git-internals runs on it, pixel-identical on desktop, and at 390px its graph now starts at the first commit instead of scrolled past the end.

---

## Not built (deliberately)

- **heaps on `TreeSvg`:** see above; its complete-binary, index-keyed layout stays local. (`SlotStrip` shipped as `ArrayStrip`.)
- **Multi-state `CodePanel` lines:** requested in Phase 2 and declined; lessons that need more line states keep a small local override.
- **`CompareRows`:** not built.
- **Per plan §6:** a scene engine, `DataTable`, `KeyValue`, `EventLog`, `ChipChoice` and `CanvasStage`.

Revisit any of these when a second, genuinely similar lesson needs one.

## Known flaky screenshot frames

These differ between runs even on unchanged code, because a motion transition is still settling
1.5 s after the seek. Treat them as eyeball-only:
- `db-indexes@2`
- `replication@3`, `replication@7`
- every `@live` shot (simulations are timing-dependent)

Motion-lib infinite loops no longer cause flakes: `Pulse` holds still under the reduced motion
that `smoke --frames` turns on.
