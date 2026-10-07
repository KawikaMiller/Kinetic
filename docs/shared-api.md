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
Caption chips: `<span className="hl">` is `--hi`; add `ok`, `bad`, `info`, `violet`, `amber` or `orange`
for the others (big-o's curve chips, css-layout's margin).
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
| `.keep-case` | `text-transform: none` inside an uppercased label (see the `Stat` note) |
| `.stage-pad` | flex column stage padding 20/22 |
| `.canvas-wrap` | `position: relative; height: var(--h, 420px)`, canvas `display: block` |
| `.data-table`, `.log-row` | shared table look; left-bordered tinted log row in `--c` |

Existing rules win over the kit when the lesson's stylesheet overrides them (it loads later), so
`<Box className="cs-panel">` with `.cs-panel { background: … 75% }` keeps the lesson's fill.
**Class names are global**: never style bare `.on`, `.bad`, `.hint`, etc. without your lesson prefix.
One breakpoint: `@media (max-width: 900px)`.

`kit.css` and the scene kit's `scene.css` are both loaded globally from `main.tsx`, so a lesson can
use any of these classes (including `scene-*` on its own custom shapes) without importing anything.

### Typography: characters render as typed

- **No ligatures, anywhere.** `global.css` sets `font-variant-ligatures: none !important` on every
  element, so `>=`, `===`, `=>`, `!=`, `->` and `--` show as the characters people type (JetBrains Mono
  and Inter's contextual alternates would otherwise join them into single glyphs, e.g. `≥`).
  `!important` is deliberate: the `font:` shorthand used all over lesson CSS resets ligatures. Don't
  add lesson-level ligature rules and never re-enable them.
- **Superscripts are real glyphs.** `index.html` fetches the superscripts `⁰ ⁴-⁹ ⁺ ⁻ ⁼ ⁽ ⁾ ⁿ`
  (U+2070-207F) from Google Fonts with `text=`, because no regular subset includes them (they used to
  fall back to a mismatched system font: 2¹⁰ read as "2¹ᵒ"). So Unicode exponents render properly in
  both fonts, in HTML and SVG text: write `power(10)` / `2³²` rather than hand-rolling `<sup>`.

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
`categorical()` hands out the semantic roles (info, violet, ok, hi) as categories, so use it only on a
stage where those colours mean nothing else. Next to semantic colours, use `plainTone(i)` from `tone.ts`.
Delete the lesson's `const C = {…}`. **`C.line` was `#323a4f` = `TOKENS.line2`**, not `TOKENS.line`.
A dev-only check (`assertTokensInSync`, run from `main.tsx`) logs a console error, which fails
smoke, if this table drifts from `global.css`.

### `tone.ts`
```ts
type Tone = 'hi' | 'ok' | 'bad' | 'info' | 'violet' | 'dim'   // semantic roles
          | 'muted'                                            // plain readable grey: deliberately uncoloured
          | 'orange' | 'amber' | 'pink' | 'sky';               // categorical hues
TONES                                            // every Tone, e.g. one arrowhead marker per tone
toneVar('ok')                                    // 'var(--ok)'
toneFor(errPct, { warn: 20, bad: 50 })           // 'ok' | 'hi' | 'bad'; { invert: true } when higher is better
plainTone(i)                                     // 'amber' | 'pink' | 'sky' | 'orange', wraps: categories that never wear a meaning (PLAIN_TONES)
```
- Every tone has a `.tone-*` class in kit.css (`--c` plus `--on-c` ink: `--on-amber`, `--on-pink`, `--on-sky` are tokens
  too) and a `TOKENS` entry, so every tone-driven component (BitStrip, CellGrid in both modes, ByteGrid fields,
  TreeSvg/GraphView marks and arrowheads, ArrayStrip ranges) draws the categorical hues with no extra code.
- Plain categories (a Hamming parity group, a float field, Euclid's step colours) take `orange`/`amber`/`pink`/`sky`,
  never `bad`/`ok` as decoration (CLAUDE.md's colour table). Lesson SVG can colour by class too:
  `className={`tone-${t}`}` plus `fill: var(--c)` in lesson CSS, as gcd-euclid's squares do.

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
latency(50_000)       // '50 µs' — a time in ns, in ns / µs / ms / s (memory-hierarchy)
humanDuration(50_000) // '14 hours' — seconds in s / min / hours / days / years; singular at exactly 1 ('1 day')
                      // past a million years a power of ten, never a raw float: '3.2 × 10²⁹² years' (no-break spaces round ×)
                      // a positive span under a microsecond is 'under a microsecond' (exactly 0 stays '0 s')
humanDurationLog10(608)  // 'about 10⁶⁰¹ years' — takes log₁₀ seconds, for spans past a double (diffie-hellman, rsa);
                      // humanDuration while it fits (below 10¹⁵ s), 'under a microsecond' below 10⁻⁶
decimal(-0.25, 2)     // '−0.25' — rounded to dp places, trailing zeros dropped, real minus sign, -0 → '0' (the B8 readouts)
superscript(23)       // '²³' — an integer in superscript digits
power(10)             // '2¹⁰'; power(-4, 10) → '10⁻⁴' (BitStrip exponent labels, logs-exponentials)
power(k, 10, { grouped: true })   // '10³⁰¹ ⁰²⁹ ⁹⁷²': digits in threes, narrow no-break space (big-o); superscript takes it too
```

### `parse.ts`
```ts
parseIntegers('1, 3 ,4  8')   // [1, 3, 4, 8]; commas and/or spaces; null if empty or any value isn't an integer
parseInteger(' -7 ')          // -7; one plain decimal integer or null

// One learner-typed field, within bounds, or the sentence to show instead: { ok: true, value } | { ok: false, error }
parseBoundedInt(text, { min: 0, max: 999 })                       // generic messages: 'Type a whole number.', 'Keep it between 0 and 999.'
parseBoundedInt(text, { min: 0, max: 255, prefixes: ['hex', 'binary'], underscores: true })   // 202, 0xCA, 0b1100_1010
parseBoundedInt(text, { min: 0, max: 1e12, thousands: true })     // 1,000,003 (commas only between groups of three)
parseBoundedInt(text, { min: -10, max: 10, typographicMinus: true })  // −7 reads as -7
parseBoundedBigInt(text, { min: 0n, max: 2n ** 64n - 1n, prefixes: ['hex'], plainRadix: 16, spaces: true })  // hex-only: '1e400' is 0x1E400
parseBoundedInt(text, { min: 2, max: 24, messages: {
  empty: '…', invalid: (typed) => '…', tooSmall: (value, cleaned) => '…', tooBig: (value, cleaned) => '…',
  negative: 'Primes are positive…',   // optional: any leading minus refused with this, first
  grouping: 'Commas only between…',   // optional, with thousands: bad comma use refused with this instead of `invalid`
} })
```
Reads exactly (as a bigint inside), so a long digit run is refused rather than rounded into range, and
out-of-range input is refused, never clamped or masked. Decimals, exponents (`1e3`), `+5`, `Infinity`
and markup are always refused; only plain decimal takes a minus. Used by bit-manipulation, endianness
(hex value, port), gcd-euclid, modular-arithmetic, primes-factoring and minimum-spanning-trees; their
own wording goes in `messages`. Fields that parse lists (adders-alu) or other bases (binary-hex's octal
and `#`) keep their own parsers.

```ts
parseBoundedDecimal(text, { min: 0, max: 1e6, typographicMinus: true, messages: { tooSmall: () => "a weight can't be negative" } })
```
The decimal counterpart, same `FieldParse` result and message shape (`empty`, `invalid`, `tooSmall`,
`tooBig`, `negative`). Plain decimals only (`2.5`, `-3`; not `.5`, `2.`, `1e3`, `+5`, `Infinity`, `NaN`,
units or markup); out-of-range is refused, never clamped, compared on the parsed double. Used by
expected-value's table cells.

### `fixtures/` — shared sample data
```ts
import { ACCESS_LOG } from '../../core/fixtures/accessLog';  // 12-line Common Log Format, RFC 5737 IPs
```
Sample data that two or more lessons use lives here instead of being copied, since lessons can't
import each other (regex-basics matches `ACCESS_LOG`; command-line greps it as `access.log`).

### `useMeasure.ts` — css-layout, responsive-design
```tsx
const m = useMeasure(ref, (el) => ({ box: rectIn(el.querySelector('.child')!, el), pad: px(getComputedStyle(el), 'paddingLeft') }));
```
Measures real layout under `ref` after every render, whenever it or anything inside it resizes, and
once web fonts have loaded (a late font changes line heights without resizing the container). The
value only changes when the measurement does, so it can't loop. `rectIn(el, origin)` is an element's
border box relative to `origin` (0.1px precision); `px(cs, prop)` reads a computed length.
For the "type your own array" fields (two-pointers, sliding-window).

### `math.ts`, `random.ts`, `hash.ts` — patterns 9, 11
```ts
clamp(v, lo, hi), clamp01(t), lerp(a, b, t)
ease(t), easeInOutQuad(t)                                      // cubic and quadratic ease-in-out
randInt(lo, hi), randRange(lo, hi), pick(xs), shuffle(xs)      // all take an optional rnd
type Rnd = () => number                                        // import it, don't redeclare it
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
SHAKE                       // the keyframes; in a stage, use useShake() below instead
enterFromLeft, popIn        // spread: <motion.li {...enterFromLeft} />
```

### `useShake.ts` — error-feedback shake
```ts
const { shake, allowed } = useShake();          // or useShake(HARDER_KEYFRAMES)
<motion.g animate={shake(world.crashed)} />     // SHAKE when true, { x: 0 } otherwise
<motion.div animate={{ opacity: 1, ...shake(alarm) }} />
if (allowed) animate(el, KEYFRAMES)             // imperative animate() calls
```
Holds still under prefers-reduced-motion, even inside a stage's `reducedMotion="never"`: a shake is
feedback, not teaching motion. Used by `CallStackPanel`'s `alarm`, stack-vs-heap, oop-fundamentals,
containers, processes-threads, hashing-encryption and stack-queue.
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
The bytes-level `hmac`, `hotp`/`totp`, `aesBlockEncrypt` and the ECDSA helpers are under "Tier 2 kit (rollout plan P0-b)".
`useSignedJwt`'s string-key hack becomes
`useAsyncValue(() => signJwt(payload, secret), JSON.stringify([payload, secret]))`.

### `recorder.ts` — pattern 15
```ts
const r = createRecorder<MyFrame>({ reads: 0, hot: null }, { transient: { hot: null } });
r.set({ reads: r.get().reads + 1 });
r.snap(<>Read the root</>, hold?, patch?);   // set(patch), push { ...state, say, hold }, then reset transient keys
r.close(<>Done in 3 reads</>, 2);             // push the summary as its own frame (state unchanged)
r.amendLast(<>Read the root: done</>, 2);     // or: replace the last caption, only if it's a shorter version
return r.frames;
```
End with `close()` by default: it keeps the last step's narration. `amendLast()` overwrites the last
caption, so use it only when that caption says less than the summary (a "Prints 5 6." step followed
by "Prints 5 6. For primitives…"). There's no `finish()` any more: it silently overwrote, which lost
narration in stack-vs-heap, ci-pipelines, closures-scope, oop-fundamentals and error-handling-models.
It makes a shallow copy, so clone nested arrays and objects before mutating them. Mandatory for
db-indexes and lsm-trees, recommended wherever a local push/snap exists, optional for class
recorders (sorting, heaps) and declarative scripts.

### Captions (`caption.ts`) — pattern 17
```ts
useIntroCaption(<>Intro…</>, deps?)          // set on mount and when deps change (replaces ~17 intro effects)
setCaption(node, { quiet: true })            // swap text in place, no fade (live readouts, per keystroke)
// step frames: { say, quiet: true } → the player passes it through
```
A frame without `say` shows the caption of the last frame at or before it that has one, however
the player got there: playing, stepping, jumping or scrubbing (`captionSources(frames)` in
`usePlayer.ts`, memoized per frames array and unit-tested). Before frame 0..k has any `say`, the
intro caption stays. The player sets the caption only when that source frame changes, so a caption
the stage sets itself between frames survives until the next frame with its own `say`.

### Player keyboard (`usePlayer.ts`, `playerRegistry.ts`)
Space / ← / → / R are bound by `usePlayer` (unless `keyboard: false`). They never fire while typing,
and Space on a focused button, link or `role=radio|button|…` control presses that control instead
of toggling playback. ← / → are left to radio groups, tabs and sliders, where they move the
selection. The mapping is the pure `shortcutFor(event, target)` (unit-tested). A player
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
Clickable `TreeSvg` nodes draw their focus as an accent ring on the node's shape.

### Radio groups (`useRadioGroup.ts`, `core/radio.ts`)
`Segmented` (so `Toggle` and `useScenePicker`) and the player's speed buttons follow the WAI-ARIA radio
pattern: one tab stop, ← → ↑ ↓ / Home / End move the selection and focus with it, `aria-checked` on every
option. `useScenePicker` also keeps focus across a scene switch: each scene renders its own copy
of the picker, so switching unmounts the focused button, and the hook puts focus back on the new picker's
chosen option (only when the switch was made while something had focus and focus then fell to `<body>`,
so a scene change never steals focus on load). The same goes for a `setScene` handoff button. Lessons
need no workaround; `Segmented` takes a `ref` to its radiogroup for this. A hand-rolled single-choice row should use the hook rather than plain buttons:
```tsx
const radio = useRadioGroup(options.length, checkedIndex, (i) => select(options[i]));
options.map((o, i) => <button key={o.id} {...radio.itemProps(i)} onClick={() => select(o)}>{o.label}</button>)
```

### Page titles and focus (`usePageHeading.ts`, `core/pageTitle.ts`)
Every page sets `document.title` ("Binary Search · Kinetic") and, after an in-app navigation, focuses its
`<h1>` so keyboard and screen-reader users land in the new page. The page the app opens on doesn't steal
focus. A new top-level page does the same: `const heading = usePageHeading(title)` and
`<h1 ref={heading} tabIndex={-1}>`.

### Reduced motion in the app chrome
The app runs inside `MotionConfig reducedMotion="user"`: motion transforms in the shell (page entrances,
the quiz shake, card reveals, the home hero) go still for people who ask for reduced motion. Each lesson
`Stage` is wrapped in `reducedMotion="never"`, because its motion is the teaching; decorative loops inside
a stage should still go still on their own (`Pulse` does), and so should shakes (`useShake` does).

### Inline code in lesson text (`InlineText.tsx`, `core/inlineCode.ts`)
Summary fields, try-this tips, key ideas and every quiz line render `backtick` pairs as inline code, so
write "relies on `x | 0`" in a plain string. An unpaired backtick stays literal.

### Quiz (`Quiz.tsx`, `core/quiz.ts`)
Options are shuffled once per visit (`shuffleOptions`), so author the right answer wherever it reads
naturally: its position carries no hint. A lesson is learned once every question is answered correctly;
wrong picks are free. Keep wrong options plausible and of similar length, since the shuffle can't hide an
answer that is always the longest.

---

## Components (`src/components/`)

### Controls (`ui.tsx`, `options.ts`, `ScenePicker.tsx`) — pattern 16
```tsx
<Segmented label="n" value={n} onChange={setN} options={[{ value: 8, label: '8' }]} />  // numbers now allowed
<Segmented ariaLabel="Input size n" value={n} onChange={setN} options={…} />  // no visible label: names the radiogroup itself
toOptions(MODES)                                         // [{id,label}] → options (import from components/options)
<Toggle label="DNS" value={cached} onChange={setCached} off="Cold lookup" on="Cached" />  // off option always first
<TextField label="Key" value={k} onChange={setK} onEnter={insert} onBlur={normalise}
           sanitize={(s) => s.replace(/\W/g, '')} width={120} spellCheck={false} className="xx-field" disabled={off} />
<ControlGroup label="Presets" inline className="xx-presets">{buttons}</ControlGroup>   // inline: label left of the group
<Hint>…or click a number</Hint>                          // tone="muted", block (its own line), className
<Stat label="Load" value={…} className="xx-stat">{<Bar …/>}</Stat>   // children render under the value
<Stat label={<>Tail <span className="keep-case">μ</span></>} value={3} />   // labels are uppercased by CSS: μ would show as Μ ("M")
<PauseButton paused={paused} onToggle={togglePause} />
<ChipButton tone="info" on={loaded === p.id} onClick={() => load(p)}>{p.label}</ChipButton>  // a preset chip; size="md" for word-sized labels
<ChipButton tone="info" on={flags.includes(f)} onStyle="solid" onClick={toggle}>{f}</ChipButton>  // solid fill when on (a flag, an answer)
<ChipButton tone="bad" ariaLabel={`Remove watch ${w}`} onClick={remove}>×</ChipButton>          // an action: no `on`, no aria-pressed
const [scene, picker, setScene] = useScenePicker({ label: 'Lane', options: LANES, initial: 'hash' });  // setScene: one scene hands off to another
<StageFrame controls={[rowOne, rowTwo]}>   // array → each wrapped in <Controls>, stacked with a dashed divider
<StageFrame minWidth={880}>                // phones: the visual keeps 880px and scrolls sideways inside the stage
<WideRegion minWidth={728} label="Pipeline diagram: scroll sideways to see all of it">
  <Dag />                                  // or just one wide part of a stage (components/WideRegion)
</WideRegion>
<WideRegion minWidth={720} gutter={{ top: 30, bottom: 4, x: 8 }}>  // room for labels drawn outside the children
```
- `ChipButton`: pass `on` only for a chip with a state (the loaded preset, a set flag); it's then a
  toggle with `aria-pressed`. A chip without `on` is a plain action and must not announce a pressed
  state. `onStyle="solid"` fills an on chip with its tone (replaces lesson `.is-on` overrides). An
  outline chip that's on gets a stronger tint and a full 2px edge, so it never looks like a hovered one.
- `Slider` announces `format(value)` as `aria-valuetext`, so give it a `format` whenever the label
  shows something other than the raw number ("no limit", "1.2/day").
- `WideRegion` is the scroller behind `StageFrame minWidth` (same edge fades, focus and swipe hint).
  The hint sits in its own row under the scroller, only while it overflows, so it never covers
  content; the row stays after the hint goes, so nothing shifts.
  A sideways scroller always clips vertically too (CSS forces `overflow-y` off `visible` once
  `overflow-x` scrolls), so anything drawn above or below the children (ArrayStrip range labels,
  pointers, outlines) needs room reserved with `gutter` (debugging-method's bisect strip).
  Wrap only the wide part when the rest of the stage is HTML that can reflow: in ci-pipelines only the
  DAG scrolls on a phone, while the Gantt chart and YAML fit the screen. An SVG directly inside it
  should be `display: block`, or it picks up a baseline gap.
- `StageFrame minWidth`: the narrowest width at which the visual stays readable. Below it the stage scrolls
  sideways *inside itself* (edge fades, a "swipe" hint that hides on scroll or after 5 s, keyboard-focusable)
  instead of shrinking the drawing; wider screens see no difference. Set it on any stage with a fixed-layout
  SVG, canvas or absolutely positioned scene. Pick the value with `npm run smoke -- --mobile <id>`: it fails
  when scene text renders under 8px or the frame clips content. Rough guide: `356 × 8 / smallestTextPx` at 390.
  For a drawing of known natural width, compute it: `minWidthForText(W, 13)` from `core/scale` (below).
- A `Toggle` swap changes the option order when the lesson listed "on" first (cdn-edge). That's a deliberate change, so list it.
- `TextField`: Enter does nothing unless `onEnter` is set. For clamped number fields, keep the raw text in state and clamp in `onBlur` and when the value is used, not on every keystroke (see trees-bst).
- `TextField` has the shared look (a 14px mono input with an accent focus ring). A lesson `className` can resize it; a disabled field dims to 0.45 as a whole.

### Panels (`Panel.tsx`) — pattern 4
```tsx
<Box variant="default | sunken | raised" className="xx-panel">…</Box>
<SectionTitle hint="last 10 s">Queue</SectionTitle>     // weight="regular" for the lighter label style; className
<Tray label="Output" labelWeight="regular" empty="nothing yet" ariaLabel="Output">{items}</Tray>
<Tray stack label="Search the repo">{field}{results}</Tray>   // label on its own line above the content
<Box role="region" aria-label="Order pipeline" id="pipe">…</Box>  // native attributes are forwarded
```
`Box`, `SectionTitle` and `Tray` forward native attributes (`aria-*`, `role`, `id`, `data-*`, events)
to their root element. They used to drop them, and TS doesn't catch that (hyphenated JSX props aren't
checked against declared props); `Panel.test.ts` renders them to prove the attributes arrive.
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
Line states: `idle past now next done cut cached pending bad` (`bad`: the line that threw or is
wrong, a `--bad` tint and left bar). `solid` gives the now-line a `--hi` fill
(tx-acid); `bar` gives it a tint and a left bar (race, recursion, containers). The CSS is generic,
so expect to keep a few lesson overrides for exact pixel parity.
```tsx
<CodePanel lines={SRC} active={pc}
           renderLine={(line, i) => highlightTokens(line, i)}        // rich code, e.g. struck-through skipped parts
           onLineClick={toggleBreakpoint} pressed={(i) => bps.has(i)} // each line a button (debugger-tools)
           lineLabel={(i) => `Line ${i + 1}: toggle breakpoint`} />
```
- `renderLine` replaces a line's code content; `lines` stays the plain text (keys, labels).
- `marker={(i) => <Dot/> | null}` adds a 12px slot left of the line number for every line, like a
  debugger's breakpoint gutter (debugger-tools); return null for an empty slot. Don't inject markers
  into the code with `renderLine`.
- `onLineClick` turns every line into a button that looks identical to a plain line: Space/Enter,
  the focus-visible ring, `aria-pressed` from `pressed(i)`, and `lineLabel(i)` as its name (default
  "Line N: code"). The dev kit showcase (`#/dev/kit`) has a breakpoint demo.
- Not adopted, deliberately: propositional-logic's short-circuit `TraceLine` (a label + code + result
  row, not a panel line) and code-review's diff (file headers, a sign column and severity tags) stay local.

### `ConsolePanel.tsx` — value-vs-reference, closures-scope; debugger-tools next
```tsx
<ConsolePanel lines={mem.out} error={mem.error} />                      // error prints last as "Uncaught …" in red
<ConsolePanel lines={['ok', { text: 'deprecated', tone: 'orange' }]} title="output" empty="(silent)" />
```
Plain lines are green (`--ok`); a `{ text, tone }` line takes its own tone. Shows `empty` while nothing's printed.

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
`.scene-zone` is 10px on desktop and 11px at ≤900px, where scenes are drawn scaled down to their
`minWidth` and it would otherwise be the first label under 8px. Don't override it per lesson.

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

### Gate circuits (`components/scene/Gates.tsx`, `gateGeometry.ts`) — logic-gates, adders-alu, sequential-logic
```tsx
import { GateGlyph, GateInput, GateLamp, GateWire, SWire, TravelDot, wiresOf, wirePoints } from '../../components/scene';
const wires = wiresOf(circuit, board);        // circuit: { inputs, gates: [{ id, type, inputs }], outputs: [{ label, from }] }
<svg viewBox="0 0 640 310" className="lg-svg">  {/* board: { at: { A: {x,y}, g1: {x,y} }, outputs: [{x,y}] } */}
  {wires.map((w) => <SWire key={w.key} from={w.start} to={w.end} state={w.unused ? 'unused' : v[w.from] ? 'high' : 'low'} />)}
  <TravelDot path={wirePoints(w.start, w.end)} color="var(--hi)" r={4} className="gate-dot" … />
  {circuit.inputs.map((n) => <GateInput key={n} name={n} at={board.at[n]} on={v[n]} onFlip={() => flip(n)} />)}   {/* DOM order = Tab order */}
  <GateGlyph type="NAND" at={board.at.g1} on={v.g1} className="lg-gate is-editable" role="button" …>{/* extras, gate coords */}</GateGlyph>
  <GateLamp label="sum" at={board.outputs[0]} value={v.sum ? 1 : 0} />          {/* '?' for unknown; className for lesson states */}
  <GateWire d={customPath} state="unknown" />                                   {/* hand-routed feedback loops (SR latch) */}
</svg>
```
- Geometry is pure and tested: `gateBodyPath`, `XOR_BACK_PATH`, `bubbleAt`, `typeLabelX`, `inputPort(t, at, port, count?)`, `outputPort(t, at)`, `sourcePort`, `wiresOf`, `wirePath`, `wirePoints`; constants `IO_R` 18, `BUBBLE_R` 4, `PORT_DY` 11. Types: `GateKind` (AND OR NOT NAND NOR XOR), `GateCircuit`, `GateBoard`, `GateWire`.
- CSS in scene.css: `.gate-wire` (`is-high` / `is-low` / `is-unused` / `is-unknown`), `.gate`, `.gate-body`, `.gate-back`, `.gate-type` (11px; brightens when the gate is on), `.gate-input`, `.gate-lamp`, `.gate-io-value`, `.gate-io-name` (14px), `.gate-dot`. Lessons tune size and glow on their own svg class (logic-gates: 10.5px type labels, 13px names, glowing wires and lamps; adders-alu: glowing wires; sequential-logic: 12px labels, stored/broken lamp rings).
- All three lessons migrated: frames and 8 driven states pixel-identical, except sequential-logic's lit NOR label, which now brightens like the other two lessons' (deliberate).

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
chunkGroups(20, 8, { align: 'right', tone: 'violet' })   // bytes of a number, from the LSB: 4 + 8 + 8 (logs-exponentials)
```
```tsx
<BitStrip bits={bits} onToggle={(i) => setBits(flipBit(bits, i))} placeValues
          groups={chunkGroups(16, 4, { tone: 'violet', label: … })} highlight={[carryAt]} />
<BitStrip bits={f32} size="sm" groups={[{ from: 0, to: 0, tone: 'bad', label: 'sign' }, …]} />
<BitStrip bits={utf8} toneOf={(i) => (isPrefix(i) ? 'dim' : 'info')} />          // per-bit tone beats the group's
<BitStrip bits={toBits(0o754, 9)} labelOf={(i) => 'rwx'[i % 3]} groups={chunkGroups(9, 3, …)} />
<BitStrip bits={perms} onToggle={flip} ariaLabelOf={bitName} />   // screen readers hear "group write", not "bit 4"
<BitStrip bits={out} pending={(i) => i < width - filled} toneOf={…} />  // columns not worked out yet: empty dashed slots
// A row of a CSS-grid table (error-detection-correction's Hamming table): bits fill the grid's columns
<div style={{ display: 'grid', gridTemplateColumns: `auto repeat(7, 38px)` }}>
  <span>received</span>
  <BitStrip layout="cells" clear="toned" bits={received} toneOf={(i) => (flipped(i) ? 'bad' : groupTone(i))}
            onToggle={flip} pressedOf={flipped} ariaLabel="received codeword" />
</div>
```
- Give toggleable bits a meaningful `ariaLabelOf(i)` (i counts from the most significant bit): the
  default "bit i" says nothing about what the bit does (command-line `bitName`, floating-point `bitRole`).
- Set bits are a solid fill in their tone; clear bits are a dark cell outlined in it. Tone: `toneOf(i, bit)`, else the group's, else `hi`.
- `placeValues` (or `'value'`) prints each bit's place value above it, compacted (`32K`); `placeValues="exponent"` prints it as a power of two (`2²³`), for registers wider than ~16 bits where values stop fitting; `labelOf` overrides either.
- `highlight` rings bits in `highlightTone` (default `info`: binary-hex's carry ripple).
- It wraps between groups only, never inside one: split a long run (a 23-bit mantissa) into a few groups, labelling only the first.
- With `onToggle` the bits are `aria-pressed` buttons (pressed = the bit is 1, or `pressedOf(i)`, e.g. "flipped in
  transit") with **one tab stop**: arrow keys move between bits (wrapping, the radio key map), Home/End jump to the
  ends, Space/Enter toggles, and the tab stop stays on the last bit used. Without `onToggle` they're read-only.
- `pending(i)`: a bit not computed yet draws as an empty dashed slot in its tone, whatever its value
  (bit-manipulation's column-by-column result); a pending button's name ends "not worked out yet".
- `clear="toned"` draws clear bits with their tone at full strength (edge and digit, 2px edge) instead of the quiet
  default, for rows where the colour carries meaning on every bit, 0s included (Hamming parity groups).
- `layout="cells"`: no strip box, groups or labels; the bits become items of the parent's CSS grid (the wrapper is
  `display: contents`), each filling its column, so table rows line up. Size them from lesson CSS with
  `--bit-h` / `--bit-fs` on `.bit-strip` (error-detection-correction: 34px / 13px). `size`: `sm` 18px, `md` 24px, `lg` 30px (one step smaller at ≤900px).

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
Variable-name headers keep their case (`p` stays `p`; output headers use the table's uppercase style).
A `mismatchRows` row turns red as a whole, its T/F values included.

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
```tsx
// layout helpers
const { tops, end } = stackBoxes(heights, { start: TOP, gap: 18 });                        // downward
const frames = stackBoxes(frameHeights, { start: STACK_BOTTOM, gap: 6, direction: 'up' }); // a call stack
<RefArrow bend={fanBend(i, arrowsIntoThisBox)} … />                                        // spread n arrows into one box
// a reference that leaves to the left, and a structural link between two whole boxes
<HeapObject … fields={[{ name: '[[Environment]]', isRef: true, port: 'left' }]} />
<RefArrow from={heapFieldPort(at, w, 0, 'left')} to={envRect} />
<RefArrow from={childEnvRect} to={parentEnvRect} color="var(--faint)" dashed thin />
```
- Sizes: `SLOT` (150 × 30, name tag 58) and `HEAP` (title 24, rows 22) are exported, so layout maths and the shapes agree. `heapHeight(n)` and `heapRect(at, w, n)` size a block.
- `stackBoxes(heights, { start, gap, direction })` returns each box's top y and the running `end`; `fanBend(i, n, spread = 22)` is the sideways bow for arrow `i` of `n` into one box. Both are pure and tested.
- `RefArrow` ends on the target box's border facing its source (`rectEdgeToward`), so arrows never poke inside. `from` can be a box too (edge to edge). `bend` bows it; `dangling` is dashed `--bad`; `color` / `dashed` / `thin` draw a non-reference link.
- A field's `port: 'left'` puts its reference dot on the left border; start the arrow at `heapFieldPort(at, w, i, 'left')`.
- `collectable` is dim and dashed with a corner tag (unreachable, waiting for GC). `freed` is dashed `--bad` with a "freed" tag. Pass `tag` to override the corner text (e.g. `GC`). The tag shares the title row, so title + tag must fit in `w`; if they don't, use `tagPlacement="above"` rather than widening the box.
- Heap blocks fade in; solid arrows draw themselves in and dashed ones fade in (motion's `pathLength` draw-in writes its own `stroke-dasharray`, which would erase the dashes). Under reduced motion both appear at once.

### `ArrayStrip.tsx` — two-pointers, sliding-window, prefix-sums, debugging-method; binary-search
```tsx
<ArrayStrip values={arr} cellState={(i) => 'idle | active | info | violet | done | dim | bad'}
            ranges={[{ from: lo, to: hi, labels: ['lo', 'hi'] }, { from: b0, to: b1, tone: 'violet' }]}
            pointers={[{ i: l, label: 'L', tone: 'info' }, { i: r, label: 'R', tone: 'violet' }]}
            onCellClick={(i) => pick(i)} cellTitle={(i) => `Search for ${arr[i]}`}
            showIndex fontSize={12} cellMax={56} />
```
- `active` lifts in `--hi` (checking now), `info` / `violet` lift the same way in those colours (a second and third
  pointer: cycle-detection's slow and fast cells match their S and F markers), `done` lifts in `--ok` (found), `dim` is ruled out, `bad` is a `--bad` fill. `idle` cells inside the **first** range get a light tint in that range's own tone (`--hi` by default).
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
```tsx
<ResizablePane min={320} max={1440} value={device} onChange={setDevice} label="Device width" scaleToFit>
  <div className="rd-page">…</div>   {/* laid out at the true `device` width, then scaled into the pane */}
</ResizablePane>
```
`scaleToFit` keeps the children laid out at the full `value` width (their media and container
queries see the real width) and scales them into the pane, with the box height following the scaled
content; the readout then says "laid out at a true Npx, then scaled to fit" (responsive-design).

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
minWidthForText(520, 13)                      // 320: StageFrame/WideRegion minWidth keeping 13px text at the 8px floor (MIN_TEXT_PX)
minWidthForText(placement.width, 12, 320)     // third argument: never narrower than this
minWidthForText(SCENE_W, 9, { padX: 36 })     // stage padding the drawing doesn't scale into, added on top; { floor, padX } together too
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
- `onNodeClick` makes every node a keyboard button (`role="button"`, Enter/Space press it, accent focus ring) and the SVG a `group`. The tree is **one tab stop** (roving tabindex, starting at the first node in reading order, then staying on the last node used) and the arrow keys follow its structure: Up = parent, Down = leftmost child, Left/Right = the neighbour on the same level (across subtrees, and across trees in a forest), Home/End = first and last node. `treeKeyTarget(key, from, shape, place, visible?)` in `core/treeLayout` is the pure, tested key map; hidden nodes are skipped. A lesson that moves focus itself (tree-traversals after a removal) just calls `.focus()` on `[data-node="id"]`, and that node becomes the tab stop. Its accessible name is the node's text label or id; pass `nodeAriaLabel(id)` for a better one ("Remove leaf 35"). Only pass `onNodeClick` while clicking does something, or every node becomes a dead tab stop.
- `nodeScale(id)` and `nodeOpacity(id)` (0..1) animate size and fade. motion owns the node group's opacity, so fade nodes through `nodeOpacity`, not CSS (tree-traversals fades nodes that can't be removed).
- trees-bst (in-order, the null ghost as an `overlay`) runs on it pixel-identically. recursion's fib tree (tidy, custom nodes, `hidden`) does too, except for subpixel antialiasing on a few label glyphs (≤0.03% of the stage), because labels are now placed by the node's transform instead of absolute coordinates.
- heaps keeps its own tree: nodes sit at array-index positions of a complete binary tree with `2i+1`/`2i+2` edge labels, and they're keyed by item so swaps animate. A third layout mode is worth adding only when a Tier 1 lesson needs it.

### `CallStackPanel.tsx` — tree-traversals, error-handling-models, debugger-tools; recursion
```tsx
<CallStackPanel
  frames={[{ id: 3, name: 'chargeCard(order)', detail: 'throws CardDeclined', state: 'error' },  // TOP FIRST
           { id: 2, name: 'handleRequest()', state: 'waiting' },
           { id: 1, name: 'main()', state: 'waiting' }]}
  meta="3 frames" alarm={crashed} anchor="bottom"
  selected={frameId} onSelect={setFrameId} selectedTone="info"               // debugger: pick a frame
  empty={<p className="empty-note">nothing running</p>} overlay={crashed && <CrashBanner />} />
```
- `state`: `idle` (default), `running` (solid `--hi`), `waiting` (dimmed), `returning` (`--info`), `ok` (`--ok`: a base case, a `catch` that handled it), `error` (`--bad`: throwing, crashed, unwinding).
- `tone` on a frame accents an `idle` or `waiting` frame in that colour, to match the lesson's own colour for it (tree-traversals: violet, like its "on the stack" nodes). Other states keep their colours.
- `frames` is **top first**. `anchor="bottom"` (default) stacks from the bottom up like plates; `anchor="top"` lists from the top like the DevTools pane. `showDepth` numbers frames by depth (0 = outermost).
- Frames push in from above and pop off to the right (`layout` + `SPRING.snappy`); `alarm` shakes them and turns the box red.
- `onSelect` makes frames buttons (focus ring included); `selected` highlights one with a ring in
  `selectedTone` (default `hi`; debugger-tools uses `info` so selection doesn't read as "running").
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
- **Parallel work:** by default each commit gets its own column. Give commits a `column` to share one;
  `depthColumns(commits)` places each commit one column after its latest parent, so several developers'
  same-day commits line up (branching-workflows: a 3-developer GitFlow week goes from ~40 columns to ~20).
- `laneLabel={(lane) => name}` draws a name per lane in its own gutter, pinned to the left edge while the graph scrolls.
- `messageFit="truncate"` cuts each message to the room before its same-lane neighbour (`fitMessages`), so
  close commits never overlap. It's opt-in, so git-internals keeps its usual 12-character messages.
- git-internals runs on it, pixel-identical on desktop, and at 390px its graph now starts at the first commit instead of scrolled past the end.

## Tier 2 kit (rollout plan P0-a)

Built before Tier 2 lessons, each for 2+ of them. All of them are on `#/dev/kit` under "Tier 2 kit"
(`pages/DevKitTier2.tsx`), checked at 1440 and 390. CSS is in `kit.css`; pure logic lives in
`src/core/` with Vitest tests next to it.

### `core/numberTheory.ts` — modular-arithmetic, gcd-euclid, primes-factoring, rsa, diffie-hellman, digital-signatures-pki, rolling-hash
```ts
mod(-7n, 5n)              // 3n: always non-negative
modPow(4n, 13n, 497n)     // 445n, square-and-multiply
gcd(48n, 18n)             // 6n
egcd(240n, 46n)           // { g: 2n, x: -9n, y: 47n, steps: EuclidStep[] }: 240x + 46y = g; steps = the remainder table
modInverse(3n, 11n)       // 4n; null when gcd(a, m) ≠ 1
isProbablePrime(n)        // { prime, certain }: Miller-Rabin, first 13 primes as bases; certain below MR_DETERMINISTIC_BOUND (≈3.3e24)
sieve(100)                // { isPrime, primes, passes: [{ prime, crossed: number[] }] }: one pass per prime ≤ √n, for animating
trialFactor(360n)         // { factors: [2n, 2n, 2n, 3n, 3n, 5n], steps }
toyRsa(61n, 53n, 17n)     // { ok: true, n, phi, e, d } | { ok: false, reason }: textbook RSA, toy sizes only
                          // valid for any e > 1 with gcd(e, φ) = 1, e > φ included (65537 → the same d as 17)
```
- Everything is `bigint` except `sieve` (a `number` limit). Tests check against brute force below 10⁴, Carmichael numbers, Bézout identities and RSA round-trips.

### `core/stats.ts` — combinatorics, birthday-paradox, probability-basics, expected-value, conditional-bayes, shuffle-reservoir, linear-time-sorting, classification-metrics
```ts
factorial(20); choose(52, 5)         // bigint, exact
log2Factorial(n)                     // log₂ n!, for the comparison-sort bound
variance(xs); stdDev(xs)             // population; { sample: true } divides by n − 1. mean/percentile stay in core/sim
histogram(xs, { bins: 10, min: 0, max: 1 })   // { edges (bins + 1), counts, outside }: max lands in the last bin
binomialPmf(n, k, p)
collisionProbability(23, 365)        // { p: 0.507…, method: 'exact' }: exact product up to COLLISION_EXACT_LIMIT, then 1 − e^(−n(n−1)/2N)
collisionProbability(2, 2 ** 128).p  // 2.9e-39, not 0: both forms run in log space (log1p / expm1), so huge ID spaces keep tiny chances
runningMean(xs)                      // the convergence curve for simulated frequencies
logCheckpoints(n, perDecade = 40)    // counts worth a point on a convergence chart: 1..10, then ~perDecade per decade, then n
runningStats(xs, at = logCheckpoints(xs.length))   // [{ n, mean, sd }] at those counts: Welford's update, population SD,
                                     // stable on a huge offset (probability-basics, expected-value)
```

### `core/disjointSet.ts` — union-find, minimum-spanning-trees
```ts
const dsu = createDisjointSet(8, { compress: true, byRank: true, trace: true });
dsu.union(0, 1)           // true if it merged two sets
dsu.find(5); dsu.connected(2, 3); dsu.count    // count = number of sets
dsu.parents(); dsu.ranks(); dsu.height()       // snapshots for drawing
dsu.events                // with trace: find {node, path} · reparent {node, from, to} · union {a, b, merged, root, child} · rank {root, rank}
```
- Turn `compress` / `byRank` off to show the naive forest. Draw it with `TreeSvg` forest mode: `roots` = the nodes that are their own parent.

### `TreeSvg` forest mode — union-find, huffman-coding, tries
`shape.roots: K[]` (instead of `root`, which is then left out: `{ roots, children }`) lays several trees side by side; `forestGap` (default `FOREST_GAP`, 0.5) is the empty columns between them. Additive: every single-root caller is pixel-identical (all six TreeSvg lessons diffed).

### `core/grid.ts`, `CellGrid.tsx` — error-detection-correction, primes-factoring, modular-arithmetic, birthday-paradox, conditional-bayes, cpu-caches, cpu-pipelining, shuffle-reservoir, virtual-memory-paging, file-systems, storage-devices, edit-distance, deployment-strategies, feature-flags
```tsx
<CellGrid rows={10} cols={10} size="md"                      // xs 10px · sm 22px · md 34px cells, or { cell: 40, gap?, font? }
          cell={(r, c) => ({ text: n(r, c), tone: 'ok', fill: 'tint', intensity: 0.3 })}   // fill: solid | tint | outline | none
          rowLabels={…} colLabels={…} highlight={[{ r, c, tone: 'info' }]}
          onCellClick={(r, c) => pick(r, c)} cellAriaLabel={(r, c) => `${n(r, c)}, crossed out`} cellTitle={…}
          rowSuffix={{ width: 100, render: (r) => text }} ariaLabel="Numbers 1 to 100"
          overlay={({ center }) => <line {...from(center(i, j - 1))} {...to(center(i, j))} markerEnd={…} />} />  // DP arrows
```
- Natural size (one unit = 1px), shrinking to fit narrow screens. `fill: 'none'` mutes the cell's text (a crossed-out number).
- With `onCellClick` it's one tab stop: arrows move (no wrap), Home/End go to the row ends, Ctrl+Home/End to the corners, PageUp/Down five rows, Enter/Space press (`gridKeyTarget` in `core/grid`, the WAI-ARIA grid pattern). Reuse `gridKeyTarget` for any HTML grid of buttons, as graph-representations' adjacency matrix does.
- Above `CANVAS_THRESHOLD` (400) cells it paints them on a canvas from `TOKENS` (same API) with one focusable hit area and a cursor ring, so a 1,000-person crowd is one element. Cell text (strings and numbers) is painted too whenever it lands at `MIN_TEXT_PX` (8px) or more on screen (the SVG's rendered scale is measured); below that it's left out, so a lesson whose canvas grid can shrink that far must say so on screen. modular-arithmetic's mod 22–24 tables now show their numbers (its WideRegion keeps them ≥ 9px), so its "too many to number" note is gone. `cellTitle` tooltips are SVG-mode only.
- `size` takes a custom `{ cell, gap?, font? }` beyond the presets (gap defaults to ~9% of the cell, font to ~38%, none under 16px cells). Pure rules (`resolveSize`, `textReadable`, `canvasFill`, `canvasInk`) live in `components/cellGridPaint.ts`, tested.
- `overlay(geometry)` draws SVG over the cells and rings, in the grid's coordinates (`at`, `center`, `cell`, `gap`, `width`, `height`), with no pointer events: dependency arrows, a path through the grid. Not migrated yet: dynamic-programming's LCS table (an HTML grid of 40px cells with its own SVG arrow overlay) can now be expressed as `size={{ cell: 40 }}` + `overlay`, but moving it from HTML to SVG isn't pixel-identical, so it's left for that lesson's owner.

### `core/bytes.ts`, `ByteGrid.tsx` — endianness, grpc-protobuf, symmetric-ciphers, macs-hmac, packet-capture-debugging, file-systems
```tsx
<ByteGrid bytes={frame} perRow={16} offsetBase={0x1000} ascii
          fields={[{ from: 0, to: 5, tone: 'info', label: 'destination MAC' }, …]}
          toneOf={(i) => (i === decoding ? 'hi' : undefined)} highlight={[{ i: 12, tone: 'hi' }]}
          onByteClick={(i) => pick(i)} ariaLabel="Frame bytes" />
```
- A CellGrid underneath: hex offsets on the left, tinted fields with a key below, printable ASCII on the right (`printable`), the same keyboard model.
- `perRow` defaults to 16, or 8 on a phone (`useMediaQuery(PHONE_QUERY)`, ≤600px), so the digits stay readable at 390.

### `core/plot.ts`, `Plot2D.tsx` — birthday-paradox, probability-basics, expected-value, classification-metrics, vectors-similarity, matrices-transformations, gradient-descent, linear-logistic-regression, supervised-learning, decision-trees-ensembles, clustering-kmeans, embeddings, usability-laws, amdahls-law, bezier-interpolation, color-spaces, linear-time-sorting, latency-bandwidth
```tsx
<Plot2D x={{ domain: [1, 80], label: 'people' }} y={{ domain: [1e-9, 1e21], log: true, ticks: 6 }}   // format?: (v) => string
        width={356} height={240} ariaLabel="…">            {/* the defaults fit a phone with 10px ticks */}
  <Heat fn={region} resolution={48} />                      {/* first: a canvas under the rest; memoise fn */}
  <Bars bars={barsFromHistogram(histogram(xs, …))} tone="violet" />
  <Polygon points={[[0, 0], a, sum, b]} tone="violet" dashed />
  <Curve fn={(x) => p(x)} tone="info" />  <Curve points={pts} dashed />
  <Segments segments={[{ from, to, tone }]} />
  <VLine at={23} label="n = 23" />  <HLine at={0.5} label="50%" tone="dim" />
  <Arrow from={[0, 0]} to={v} label="a" tone="info" />
  <Points data={[{ x, y, tone, hollow }]} r={4.5} onDrag={(i, [x, y]) => …} pointLabel={(i) => 'centroid A'} />
</Plot2D>
```
- Layers are children in data coordinates, drawn in order; path layers are clipped to the plot box. Custom layers call `usePlot()` (from `components/plotContext`) for `xs`, `ys` and `box`.
- `tickValues: [1, 1e25, 1e50, 1e75, 1e100]` on an axis replaces the automatic ticks (values outside the domain are dropped): a log axis over a huge range otherwise strides by an awkward number of decades and can miss the top. `axisTickValues(spec)` in `core/plot` is the tested logic.
- A range past ~10³⁰⁸ can't be a real log axis (doubles stop at 1.8 × 10³⁰⁸): plot log₁₀ of the value on a linear axis with `format: (v) => power(v, 10)`, as primes-factoring does.
- `Curve fn` is sampled evenly on screen (so log axes too) and breaks where `fn` isn't finite. `Heat fn` returns a 0..1 intensity of `tone` or `{ tone, intensity }` (a region), or pass `grid` (row 0 at the top); memoise `fn`, since it repaints when it changes.
- Draggable `Points` take pointer drags and are focusable: arrow keys move 4 units (Shift: 20), always clamped to the domain (`nudgePoint`, `clampPoint`).
- A `dim` rule is a quiet reference line (faint line, muted label). `formatTick` writes 1.5k, 2M, and 10ⁿ on log axes.
- `paintImage(w, h, draw)` (`components/canvasImage.ts`) is the shared paint-to-data-URL step behind Heat and CellGrid's canvas mode.

### `core/graphLayout.ts`, `GraphView.tsx` — topological-sort, union-find, minimum-spanning-trees, relations-orders, cycle-detection, dfa-nfa, lexing-tokens, deadlocks, garbage-collection, memory-leaks, build-systems, bundlers-code-splitting, coupling-cohesion, test-doubles, dependency-injection, behavioral-patterns, mobile-app-lifecycle, sockets-api, software-licensing; graph-representations, ci-pipelines
```tsx
// An editor (graph-representations): fixed positions, one tab stop, click/drag/keyboard editing
<GraphView nodes={[{ id, label, at: { x, y } }]} edges={[{ from, to, weight }]} directed width={640} height={380}
           nodeColor={(id) => categorical(component(id))}
           nodeMark={(id) => (id === sel ? { tone: 'hi', fill: 'solid' } : null)}
           edgeMark={(e) => (inCycle(e) ? { tone: 'bad', width: 3.5 } : null)}
           onNodeClick={select} onEdgeClick={(e, i) => select(e)}
           editable={{ onAddNode: (p) => …, onAddEdge: (from, to) => …, minGap: 48 }} ariaLabel="…" />

// A DAG (ci-pipelines): layered columns, S-curves, your own node drawing
<GraphView nodes={jobs.map((j) => ({ id: j.id, shape: 'box' }))} edges={deps} directed layout="layered"
           spacing={{ direction: 'right', layerGap: 150, nodeGap: 64, padMain: 70, padCross: 44 }}
           box={{ w: 112, h: 46 }} edgeStyle="curve" edgeClass={(e) => (dead(e) ? 'is-dead' : '')}
           renderNode={(n, at) => <SceneNode at={at} … />} ariaLabel="…" />

// A state machine: start arrow, accepting states, self-loops, labels; a⇄b pairs bend apart by themselves
<GraphView nodes={[{ id: 'q2', at, accept: true }, …]} edges={[{ from: 'q0', to: 'q0', label: '1' }, …]}
           directed startNode="q0" width={500} height={220} ariaLabel="…" />
```
- `layout`: `fixed` (each `at`), `layered` (`layeredLayout`: longest-path layers, cycles broken depth-first; barycentre ordering kept only when it removes crossings, so a crossing-free input order stays exactly as given), `circle` (`circlePositions`, first node at the top). Layered sizes itself; `width` overrides that (ci keeps its width when deploy is absent).
- `layoutEdges` (layered only) is the edge set the layout uses; `edges` is still what's drawn. topological-sort lays out by
  the preset's edges plus any added edge that keeps the graph acyclic, so closing a cycle draws the new arrow without
  moving a single node.
- Layered + straight edges: an edge that would cross another node (a back edge closing a cycle) bends round it in a
  "lane" curve beside the straight line, nearest lane first, alternating sides (`detourBend` / `curveHits` in
  `core/graphLayout`, tested; `DETOUR_MARGIN` 8px clearance). If no lane within reach clears, it stays straight.
  S-curve (`edgeStyle="curve"`) and fixed/circle layouts are untouched.
- `editable.onAddNode` is optional: leave it out for an edges-only editor (topological-sort); clicking empty space then
  does nothing and the crosshair cursor goes away.
- `renderNode(node, at, base)`: `base` is the default drawing (focus ring, circle or box, label), so adding a badge or a
  tag is `<>{base}<Badge/></>` (topological-sort's in-degree badges, cycle-detection's S/F tags) rather than a copy of
  the ring/shape/label markup. `box={{ w, h, rx }}` sets the box's corner radius (default 10; the ring follows at rx + 4).
- Natural size, shrinking on narrow screens; stretch it with `width: 100%` in lesson CSS (both migrated lessons do). Big graphs on phones belong in a `WideRegion`, as in ci-pipelines.
- Node marks use TreeSvg's shape (`{ tone, fill: 'tint' | 'solid', tint? }`); edges take `{ tone, dashed?, width? }` (default 3.5), and the arrowhead follows the tone. `nodeColor` colours only unmarked nodes. Classes: `.graph-node`, `.graph-node-shape`, `.graph-node-label`, `.graph-edge` (+ `is-marked`, `is-dashed`), `.graph-edge-label`.
- With `onNodeClick` / `onEdgeClick` / `editable` the graph is one tab stop (roving tabindex, starting top-left): arrows move to the nearest node or clickable edge in that direction (`spatialNext`), Home/End jump to the ends, Enter/Space press. `editable`: clicking empty space adds a node (at least `minGap` from the rest), dragging node to node adds an edge, and from the keyboard it's C on a node then Enter on another (Escape cancels). Adding a node from the keyboard stays a lesson button, since only the lesson knows where it goes.
- Both lessons migrated pixel-identically: smoke frames plus ten driven states (presets, weights, a selected edge, a cycle, two-colouring; feature branch, 1 and 4 shards, a broken test, fail-fast). graph-representations' Tab path to the quiz went from 78 stops to 24 (L-7): the graph and the adjacency matrix are one stop each.

### Smaller pieces
- `useMediaQuery(query)` and `PHONE_QUERY` (`components/useMediaQuery.ts`): for layout choices CSS can't make (ByteGrid's bytes per row). SSR-safe (`useSyncExternalStore`).
- `arrowMarkerDef(id, color, size, refX)` (`ArrowMarker.tsx`): one `<marker>` element, for a set of them under one `<defs>`. `useArrowMarker` is built on it.
- `fakeSecret(...parts)` (`core/fakeSecret.ts`): joins an example credential from pieces so no source line holds a credential-shaped literal (secrets-management, auth-sessions-jwt, and secretScan's own fixtures). Every value built with it is fake; the secretScan test checks the repo for strays.

## Tier 2 kit (rollout plan P0-b)

Built before the wave 2-4 lessons that need them. Every visual is on `#/dev/kit` under "Tier 2 kit · P0-b"
(`pages/DevKitTier2b.tsx`), checked at 1440 and 390. CSS is in `kit.css`; the pure logic sits in a `.ts`
file with Vitest tests beside it. Motion is CSS transitions, or motion with `useReducedMotion`, so reduced motion stills all of it.

### `core/gantt.ts`, `GanttLanes.tsx` — cpu-scheduling, interrupts-context-switch, async-await-coroutines, http-versions, critical-rendering-path, rendering-strategies, orm-n-plus-one, graphql, timeouts-deadlines, serverless-cold-starts, realtime-transports, core-web-vitals, signals-graceful-shutdown, profiling-flame-graphs; ci-pipelines
```tsx
<GanttLanes
  lanes={[{ id: 'p1', label: 'P1' }, …]}
  bars={[
    { id: 'a', lane: 'p1', start: 0, end: 4, tone: 'info', label: 'P1' },          // work (solid)
    { id: 'w', lane: 'p2', start: 0, end: 4, tone: 'violet', kind: 'wait' },        // hatched: ready, not running
    { id: 'io', lane: 'p2', start: 7, end: 15, tone: 'violet', kind: 'blocked' },   // dashed: blocked on I/O
    { id: 'j', lane: 'build', start: 12, end: 40, tone: 'hi', progress: 0.4, ring: 'violet' }, // 40% drawn over a dashed plan; outlined
  ]}
  domain={[0, 20]} now={clock} unit=" ms" axis size="md"
  markers={[{ at: 18, label: 'deadline', tone: 'bad' }]}
  onBarClick={(id) => …} labelWidth={92} ariaLabel="…"
/>
barGeometry(start, end, domain, progress)   // { left, full, shown } in % of the track
domainFraction(t, domain)                   // clamped to [0, 1]: where the cursor sits
ganttTicks(domain, count)                   // [{ value, at }] from core/scale
```
- Positions are percentages, so it stretches to its container. When bars get too thin on a phone, wrap it in a `WideRegion` (cpu-scheduling uses `minWidth={480}`). `size="sm"` is 12px tracks (dense, no labels) and `md` is 20px with room for bar labels. A bar with no `tone` draws nothing, which is how a job that hasn't started looks (pair it with `progress` to show its dashed plan).
- The `now` cursor and markers span only the lanes, never the marker or axis label rows, and clicks pass through them to the bars. Bars are `<button>`s when `onBarClick` is set.
- ci-pipelines renders its wall-clock chart through it (it adds only `.ci-gantt .gantt { margin-top: 8px }`). The migration is pixel-identical: its smoke frames plus a driven matrix of 8 option combos × 5 frames × 1440/390, 80/80 unchanged.

### `core/sequenceLayout.ts`, `SequenceDiagram.tsx` — dhcp, ethernet-arp, dns-resolution, diffie-hellman, packet-capture-debugging, http-caching, idempotency-keys, webhooks, mfa-passkeys, csrf-cookies, sockets-api, realtime-transports
```tsx
<SequenceDiagram
  actors={[{ id: 'alice', label: 'Alice', tone: 'info' }, { id: 'eve', label: 'Eve', waiting: true }, { id: 'bob', label: 'Bob' }]}
  messages={[
    { id: 'd', from: 'laptop', to: '*', label: 'DHCPDISCOVER' },                 // broadcast: a head on every other lifeline
    { id: 'a', from: 'server', to: 'laptop', label: 'DHCPACK', lost: true },      // stops partway with a ✕
    { id: 'r', from: 'laptop', to: '*', label: 'DHCPREQUEST', note: 'after a 4 s timeout' },
    { id: 's', from: 'laptop', to: 'laptop', label: 'configure the interface' }, // self-message loop
  ]}
  step={player.frame.index}           // later messages hidden; the current one is --hi
  onMessageClick={(id) => …}          // Enter/Space too
  width={640}                         // spread the lanes (never below the natural width)
/>
sequenceLayout(actors, messages, width?)   // { width, height, lanes, head, rows, lifelineEnd, minWidth }
wrapLabel(label, maxW)                     // one line, or two balanced lines split at a space
```
- Labels wrap to two lines before the lanes widen. The diagram sits in a `WideRegion` at `layout.minWidth`, the narrowest container where its 12px text still renders at 8px or more. Three actors with short labels fit a 390 phone, and five scroll (see the DNS demo).
- Under the SVG, a screen-reader-only list of the messages shown so far ("Laptop to everyone: DHCPDISCOVER").
- Example addresses in network demos come from the documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32) or RFC 1918 ranges.

### `MemoryMap` (`components/memory/`) — calling-conventions, memory-safety-bugs, endianness, isa-assembly, virtual-memory-paging, linking-loading
```tsx
import { MemoryMap, MemoryMapGroup, memCellRect, memPort, memRegionRect, memoryMapLayout, RefArrow } from '../../components/memory';

<MemoryMap
  regions={[
    { from: 0x7fe0, to: 0x8010, label: 'greet() frame', tone: 'info' },            // [from, to): `to` is one past the end
    { from: 0x7ff0, to: 0x7ff8, label: 'canary', tone: 'orange', variant: 'guard' }, // live (default) | freed | guard
  ]}
  cells={[{ addr: 0x8008, value: 'return → main+42', tone: 'violet' }]}
  pointers={[{ addr: 0x7fe0, label: 'rsp', tone: 'hi' }]}
  unit={8}                 // bytes per row: 1, 8, 4096 (pages)…
  direction="down"         // down: high addresses on top (default); up: low on top
  highlight={[0x7ff0]}
  overlay={(L) => <RefArrow from={memPort(L, 0x600000, 'right')!} to={memPort(L, 0x603000, 'right')!} dangling bend={-40} />}
/>
// inside a lesson's own scene, beside VarSlots and HeapObjects:
const L = memoryMapLayout(props);   // same props → same rows
<MemoryMapGroup at={at} {...props} />
<RefArrow from={slotPort(slotAt)} to={memCellRect(L, addr, at)!} />
```
- Rows are drawn only where they matter: region ends, cells, pointer targets, and every row of a region up to 12 rows long. A longer empty run collapses into one "⋮" gap row, so a process image from 0x400000 to 0x7ffd… fits. More than 400 rows is refused: use a bigger `unit`.
- Columns are sized to their content (address digits, the longest value, the longest region label at its nesting depth); `width` stretches the cell column. A 24px link gutter between the cells and the brackets is where arrows between two cells bow (a negative `bend` heads right).
- A region inside another gets `depth` 1 and its bracket steps inward. A cell is tinted by its innermost region; a cell's own `tone` is stronger. `freed` is hatched with struck values, and `guard` has a heavy border.
- Ports: `memPort(L, addr, 'left' | 'right', at)`, `memCellRect(L, addr, at)` (a RefArrow `to`), `memRegionRect(L, i, at)`, `rowAt(L, addr)`. `memPort`, `memCellRect` and `rowAt` return null for an address off the map.
- memory-safety-bugs is payload-free: the overflow demo is a name too long for its buffer, nothing more.

### `core/automata.ts` — dfa-nfa, lexing-tokens; later regex-engines
```ts
const dfa: Dfa = { kind: 'dfa', states, alphabet, start: 'r0', accept: ['r0'], delta: { r0: { '0': 'r0', '1': 'r1' }, … } };
const nfa: Nfa = { kind: 'nfa', …, delta: { s: { [EPSILON]: ['p', 'q'] }, p: { a: ['r'] } } };
dfaStep(dfa, state, 'a')          // next state, or null: a missing transition means "dies"
dfaRun(dfa, input)                // { path: (State | null)[], accepted }
epsilonClosure(nfa, states); nfaStep(nfa, states, 'a'); nfaRun(nfa, input)   // sorted state sets
accepts(dfaOrNfa, input)
subsetConstruct(nfa)              // { dfa, rows: SubsetRow[] (discovery order, isNew), members: name → NFA states }
subsetName(['0', '1'])            // "{0,1}"; "∅" for the empty set (only present when reachable)
longestMatch(dfa, input, from)    // { end, state, steps } | null: maximal munch; steps counts the char that killed it
delta: { cmt: { a: 'cmt', …, [OTHER]: 'cmt' } }   // OTHER: any symbol OUTSIDE the alphabet (é, emoji halves); in-alphabet symbols never take it
edgesOf(dfaOrNfa)                 // { from, to, symbols[] }[]: one arrow per pair, symbols in order ε, alphabet, OTHER
```
- `OTHER` lets a lexer keep a finite alphabet and still say "anything but newline": explicit arrows for the alphabet minus `
`, plus `[OTHER]`. lexing-tokens uses it instead of rewriting the source first. It's DFA-only.
- Draw the machines with `GraphView` state mode. Minimisation is deliberately left out (T3 chomsky-hierarchy). Tests compare the subset DFA with the NFA and with a JS RegExp on every string up to length 10.

### `core/ipv4.ts` — subnetting-cidr, ethernet-arp, dhcp
```ts
parseIPv4(' 192.168.1.10 ')       // FieldParse<number>: { ok, value: 0xc0a8010a } or { ok: false, error } with the reason
parsePrefix('24'); parseCidr('10.0.0.0/8'); parseCidr('10.0.0.1', 24)   // fallback prefix when there's no slash
ipv4('192.168.1.1')               // a lesson-authored literal → number; throws RangeError on a typo (never learner input)
ipToString(0xc0a8010a)            // '192.168.1.10'
maskOf(24); wildcardOf(24); blockSize(24)              // 0xffffff00, 0xff, 256 (/0 handled: no `<< 32`)
networkOf(a, 24); broadcastOf(a, 24); contains(net, 24, a)   // unsigned throughout
IPV4_BITS; IPV4_MAX_INPUT         // 32; 40 (text longer than this is refused as far too long)
```
- Parsing is strict on purpose: exactly four parts of 0-255, no leading zeros (some tools read `010` as octal), no shorthand like `10.1`, and every refusal says why.
- Tests compare masks, network, broadcast and membership with a no-bitwise reference at every prefix over thousands of seeded addresses, and round-trip text for every octet value. check-tokens flags a local `parseIPv4`/`ipToString` or `0xffffffff <<` in a lesson.
- Block-level maths a lesson draws (host range, /31 and /32 semantics, splitting, summarising) stays in subnetting-cidr's model until a second lesson needs it.

### `core/vec.ts`, `core/fit.ts`, `core/fixtures/datasets.ts` — vectors-similarity, matrices-transformations, gradient-descent, linear-logistic-regression, supervised-learning, classification-metrics, decision-trees-ensembles, clustering-kmeans, embeddings, usability-laws, rasterization, bezier-interpolation
```ts
dot(a, b); norm(a); cosine(a, b) /* NaN for a zero vector */; add; sub; scale(a, k); distance; normalize /* null for zero */
matMul(a, b); apply(m, v) /* m·v */; transpose; identity(n); det(m) /* 2×2, 3×3 */; rotation2(rad)
solve(A, b) /* partial pivoting; null if singular */; inverse(m) /* null if singular */; conditionNumber(m) /* κ₁ */
leastSquaresQR(A, b)   // Householder QR: { x, rDiag, conditionEstimate } | null (rank deficient); never forms AᵀA

leastSquares(xs, ys, degree, { lambda })  // { coeffs (constant first), condition, illConditioned } | null; ridge leaves the intercept alone
polyEval(coeffs, x); sigmoid(z); mse(pred, actual); logLoss(probs, labels)   // probs clamped by LOG_LOSS_EPS
linearPredict(params, x)                  // params = [b, ...w]
mseGradient(params, xs, ys); logLossGradient(params, xs, labels); gradientStep(params, grad, rate)
numericGradient(f, params)                // central differences: the check that a gradient is right

blobs({ seed, centers, n, spread }); moons({ seed, n, noise })   // { x, y, label }[]: Plot2D Points take them as they are
lineWithNoise({ seed, n, slope, intercept, noise, xRange })     // { x, y }[]
twoClassScores({ seed, positives, negatives, separation })      // { score ∈ (0,1), label }[], sorted by score
gaussian(rnd)                                                   // Box–Muller from a mulberry32
```
- `leastSquaresQR` keeps the digits the normal equations lose (their κ is κ(A)²): a degree-12 polynomial on 15 points solves where `solve(XᵀX, …)`'s absolute 1e-12 pivot calls it singular. Null means rank deficient (fewer rows than columns, or some |Rᵢᵢ| ≤ max(m, n)·ε·max |Rᵢᵢ|). For ridge, append √λ·eⱼ rows with target 0 for each penalised column. supervised-learning fits through it; `core/fit` `leastSquares` still uses the normal equations.
- Every curve an ML lesson draws comes from these numbers. Same seed, same data. Tests cover the hand-computed 3-point fit, closed-form regression, ridge against the explicit inverse, both gradients against finite differences, and gradient descent converging to least squares.

### `ConfusionMatrix.tsx` (+ `core/stats.ts` metrics) — conditional-bayes, classification-metrics, decision-trees-ensembles
```tsx
<ConfusionMatrix tp={90} fp={45} fn={10} tn={855} labels={{ positive: 'sick', negative: 'healthy' }}
                 highlight="fn" share metrics />
classificationMetrics({ tp, fp, fn, tn })   // { precision, recall, specificity, fpr, accuracy, f1 }: NaN when undefined, never a made-up 0
confusionAt(examples, threshold)            // counts; score ≥ threshold predicts positive
CONFUSION_TONE                              // { tp: 'ok', tn: 'ok', fp: 'bad', fn: 'orange' }: reuse it for legends and dots
```
- A real `<table>` (rows are the actual class, columns the prediction). Undefined metrics show as `–`. `.sr-only` (in `kit.css`) gives each cell its full name for screen readers. It's the shared visually-hidden class: use it rather than a local one.

### `crypto.ts` additions — mfa-passkeys, macs-hmac, webhooks, symmetric-ciphers, digital-signatures-pki; hashing-encryption
```ts
hmac(key: BufferSource, data: BufferSource, { hash: 'SHA-1' | 'SHA-256', out: 'hex' | 'bytes' })
hotp(key, counter, { digits = 6, hash = 'SHA-1' })      // RFC 4226
totp(key, unixSeconds, { step = 30, digits, hash })     // RFC 6238: what authenticator apps show
aesBlockEncrypt(key, block16)                           // one bare AES block = what ECB does to every block
ecdsaKeyPair(); ecdsaSign(privateKey, data); ecdsaVerify(publicKey, sig, data)   // P-256 / SHA-256; signature = 64 bytes r‖s
```
- Everything resolves to null without `crypto.subtle`, like the rest of `crypto.ts`. `hmacSha256` now runs on `hmac`, with unchanged output. hashing-encryption signs through the ECDSA helpers.
- `aesBlockEncrypt` uses AES-CBC with a zero IV and keeps the first 16 bytes. WebCrypto has no ECB, so that's the only way to get it. It exists to show why ECB leaks patterns, never to encrypt anything.
- Tests: RFC 4231 and RFC 2202 HMAC, RFC 4226 HOTP, RFC 6238 TOTP (SHA-1 and SHA-256), FIPS-197 C.1 and C.3, and ECDSA with one flipped byte failing in the message and in the signature. Test keys are the published RFC ones; nothing in source has a real credential shape (K-3 scan).

## Tier 2 kit (wave 3→4 kit round)

Showcased on `#/dev/kit` under "Tier 2 kit · wave 3→4" (`pages/DevKitTier2c.tsx`).

### `ColorField.tsx`, `core/contrast.ts` (K-21) — accessibility, color-spaces
```tsx
<ColorField label="Text colour" value={fg} onChange={setFg} />   // native colour input, its label, and the #rrggbb beside it
```
```ts
contrastRatio('#777', '#fff')   // 4.478…: (L1 + 0.05) / (L2 + 0.05), lighter over darker, 1 to 21; order doesn't matter
formatRatio(r)                  // '4.48:1'; never rounds a failing ratio up onto a threshold (4.496 → '4.49:1')
grade(r)                        // { aaNormal, aaLarge, aaaNormal, aaaLarge } against THRESHOLDS (AA 4.5 / 3, AAA 7 / 4.5)
luminance([r, g, b])            // WCAG 2.x relative luminance of 0..255 channels (the published 0.03928 knee)
parseHex('#abc')                // [170, 187, 204]; 3- or 6-digit
```
- Moved unchanged from the accessibility lesson, which now uses both (pixel-identical). Styles live in
  `components/colorField.css`, loaded globally from `main.tsx`.
- Tests: the lesson's contrast tests, plus the published figures: white 1, black 0, each primary its own
  coefficient, the 0.03928 knee, and #767676 4.54, #595959 7.00, blue 8.59 and red 4.00 on white.

### `crypto.ts`: `hexToBytes`, raw AES-CBC — symmetric-ciphers, macs-hmac, digital-signatures-pki
```ts
hexToBytes('00ff7fa0')                 // Uint8Array [0, 255, 127, 160]; either case; '' → empty; odd length or non-hex throws RangeError
AES_BLOCK                              // 16
aesCbcRawEncrypt(key, iv, data)        // CBC on whole blocks, no padding: output is exactly data.length bytes
aesCbcRawDecrypt(key, iv, ct)          // the inverse; a tampered ct decrypts to garbled bytes, never a padding error
```
- WebCrypto's AES-CBC always applies PKCS#7. Encrypt drops the extra padding block it appends to
  block-aligned input; decrypt appends one block that decrypts to valid padding (AES(PAD ⊕ last block),
  possible because we hold the key). Both throw RangeError on partial blocks and resolve to null without
  `crypto.subtle`. For lessons showing the mode itself, never for real data (no padding, no MAC).
- Tests: SP 800-38A F.2.1/F.2.2, a flipped bit garbling its block and flipping the same bit in the next,
  empty input, partial-block refusal; hexToBytes round-trips all 256 bytes through `toHex`.

### `core/paint.ts` — diffie-hellman, tls-handshake
```ts
equalMix(['var(--amber)', 'var(--sky)'])   // 'color-mix(in oklab, var(--amber) 50%, var(--sky))'
```
- Equal parts of every colour as one real CSS colour (the k-th joins at 1/(k+1)). Pass the colours in a
  canonical order (the lessons sort their parts first), so the mix depends only on which paints went in.
  Both lessons' paint-mixing analogies use it; their exact colour strings are unchanged (asserted in their tests).

---

## Not built (deliberately)

- **heaps on `TreeSvg`:** see above; its complete-binary, index-keyed layout stays local. (`SlotStrip` shipped as `ArrayStrip`.)
- **Multi-state `CodePanel` lines:** requested in Phase 2 and declined; lessons that need more line states keep a small local override.
- **`CompareRows`:** not built.
- **web-request's waterfall on `GanttLanes`:** it's one stacked bar whose segments grow with
  motion springs, plus a legend, not lanes on a time axis. Moving it would swap flex for absolute
  positioning and the spring for a linear transition, so it couldn't be pixel-identical. It stays local.
- **Per plan §6:** a scene engine, `DataTable`, `KeyValue`, `EventLog`, `ChipChoice` and `CanvasStage`.

Revisit any of these when a second, genuinely similar lesson needs one.

## Known flaky screenshot frames

These differ between runs even on unchanged code, because a motion transition is still settling
1.5 s after the seek. Treat them as eyeball-only:
- `db-indexes@2`
- `replication@3`, `replication@7`
- `ci-pipelines@0`, `endianness@0`, `minimum-spanning-trees@0` (seen in kit-k4's run)
- `macs-hmac@0`, `@2`, `@4`: the key comes from `crypto.getRandomValues`, which `--frames` doesn't seed,
  so the tag bytes differ every run (~0.5%; seen in kit-k5's run, same tree twice)
- every `@live` shot (simulations are timing-dependent)
- driven shots of a stage with a `WideRegion` at 390: its "swipe" hint times out after 5 s, so a
  shot taken around then may catch it mid-fade

Motion-lib infinite loops no longer cause flakes: `Pulse` holds still under the reduced motion
that `smoke --frames` turns on.
