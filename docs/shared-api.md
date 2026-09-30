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
```
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

## Not built (deliberately)

- **`SlotStrip`, `TreeSvg`:** the layouts in heaps, trees-bst, arrays-linked-lists and recursion differ in exactly the parts a shared component would have to model. The batch owners advised against extracting them, and I agree.
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
