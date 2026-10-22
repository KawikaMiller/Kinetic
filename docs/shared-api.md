`# Shared API reference
`
`What exists in the shared layer, how to call it, and which copy-pasted pattern it replaces
`(pattern numbers refer to `docs/shared-components-plan.md` §1.1). All 51 lessons are migrated.
`New lessons start here: reach for these before writing anything local.
`
`Good reference implementations:
`- **client-server**: scene kit (`SceneNode`, `Packet`), `Box`.
`- **circuit-breakers**: `useSimulation`, canvas kit, sim utils, `PauseButton`, `toOptions`, format helpers, sim/draw split (`sim.ts` / `draw.ts` / `Stage.tsx`).
`- **raft**: `useSimulation` with `refresh()` for actions taken while paused.
`- **ip-ports**, **zero-trust**, **distributed-transactions**: the `Packet` variants (`bounce`/`absorb`, `even` hops, outline + lesson classes).
`
`Changing shared code: keep the API backward compatible or migrate every caller in the same
`change, and prove it pixel-identical: `npm run smoke -- --frames --label=<name> <ids>` then
``npm run diff -- <baseline> <name> <ids>` (see CLAUDE.md).
`
`---
`
`## Tokens and CSS
`
`### Colour tokens (`src/styles/global.css`) — patterns 1-3
`
`Phase 0b already converted every lesson-CSS literal that exactly matched a token. New tokens:
`
`| Token | Value | Use |
`|---|---|---|
`| `--orange`, `--amber`, `--pink`, `--sky` | `#ff8c5a`, `#f7b538`, `#ff5d8f`, `#8fb8ff` | categorical hues (amber = `--t3`, pink = `--t4`) |
`| `--land` | `#2a3246` | map landmass dots |
`| `--on-hi`, `--on-ok`, `--on-bad`, `--on-info`, `--on-violet`, `--on-orange` | dark inks | text on a solid token fill |
`| `--on-hi-muted`, `--on-bad-muted` | `#4a3b00`, `#4a0d14` | secondary (dimmer) text on a solid fill |
`| `--on-fill` | `var(--bg)` | text on packets/pills |
`| `--cell-dead` | `#1a1216` | a crashed/dead node's box (the cell warmed toward `--bad`); `TOKENS.cellDead` on canvas |
`| `--trk-<id>` (14) | see `global.css` | curriculum track colours (`TRACKS[id].color` is `var(--trk-<id>)`; `TOKENS.trkDsa` etc. on canvas). App chrome only (cards, chips, crumbs): lessons keep using the semantic tokens |
`
`Tints: `color-mix(in srgb, var(--hi) 14%, transparent)`.
`Caption chips: `<span className="hl">` is `--hi`; add `ok`, `bad`, `info`, `violet`, `amber` or `orange`
`for the others (big-o's curve chips, css-layout's margin).
`Colours: DOM/SVG use `var(--x)`, canvas uses `TOKENS.x` / `alpha()`. A literal that genuinely
`can't be a token (a drawing's own material, a neutral shadow) carries an `allow-color` marker with
`a reason on the same line, and `npm run check-tokens -- --strict` must pass (see CLAUDE.md):
````css
`box-shadow: 0 6px 20px -6px rgb(0 0 0 / 0.7); /* allow-color: neutral drop shadow */
````
````ts
`const WALL_SWATCH = '#4a5370'; // allow-color: maze wall material
````
`New tokens go in `global.css`, and in `palette.ts` too if canvas code needs them
`(`assertTokensInSync` checks every `palette.ts` entry against the CSS in dev).
`
`### Utility classes (`src/styles/kit.css`) — pattern 4
`
`Loaded globally. Colour flows through `--c` / `--on-c`, set by a `.tone-*` class or inline.
`
`| Class | What |
`|---|---|
`| `.tone-hi/ok/bad/info/violet/orange/dim` | sets `--c` and `--on-c` |
`| `.cell` + `.is-solid` / `.is-tint` / `.is-dim` | value box; solid fill in `--c` with `--on-c` ink and glow; tinted; dimmed |
`| `.chip` | small mono tag in `--c` (muted by default) |
`| `.box` (+ `.box-sunken`, `.box-raised`) | sub-panel: padding 12/14, radius 12, `--line` border, `--bg` 72% fill |
`| `.tray` | dashed collector panel |
`| `.section-title` (+ `.is-regular`, `> .hint-inline`) | 11px uppercase label: 700 weight / .1em, or regular weight / .08em |
`| `.empty-note`, `.hint` (+ `.is-muted`, `.is-block`), `.focus-ring` | faint mono placeholder; 13px hint; 3px ring in `--c` |
`| `.keep-case` | `text-transform: none` inside an uppercased label (see the `Stat` note), on the label itself or on a `.data-table th` (Greek type variables) |
`| `.stage-pad` | flex column stage padding 20/22 |
`| `.canvas-wrap` | `position: relative; height: var(--h, 420px)`, canvas `display: block` |
`| `.data-table`, `.log-row` | shared table look; left-bordered tinted log row in `--c` |
`
`Existing rules win over the kit when the lesson's stylesheet overrides them (it loads later), so
``<Box className="cs-panel">` with `.cs-panel { background: … 75% }` keeps the lesson's fill.
`**Class names are global**: never style bare `.on`, `.bad`, `.hint`, etc. without your lesson prefix.
`One breakpoint: `@media (max-width: 900px)`.
`
``kit.css` and the scene kit's `scene.css` are both loaded globally from `main.tsx`, so a lesson can
`use any of these classes (including `scene-*` on its own custom shapes) without importing anything.
`
`### Typography: characters render as typed
`
`- **No ligatures, anywhere.** `global.css` sets `font-variant-ligatures: none !important` on every
`  element, so `>=`, `===`, `=>`, `!=`, `->` and `--` show as the characters people type (JetBrains Mono
`  and Inter's contextual alternates would otherwise join them into single glyphs, e.g. `≥`).
`  `!important` is deliberate: the `font:` shorthand used all over lesson CSS resets ligatures. Don't
`  add lesson-level ligature rules and never re-enable them.
`- **Superscripts are real glyphs.** `index.html` fetches the superscripts `⁰ ⁴-⁹ ⁺ ⁻ ⁼ ⁽ ⁾ ⁿ`
`  (U+2070-207F) from Google Fonts with `text=`, because no regular subset includes them (they used to
`  fall back to a mismatched system font: 2¹⁰ read as "2¹ᵒ"). So Unicode exponents render properly in
`  both fonts, in HTML and SVG text: write `power(10)` / `2³²` rather than hand-rolling `<sup>`.
`
`---
`
`## Core utilities (`src/core/`)
`
`### `palette.ts` — canvas colours (pattern 3)
````ts
`TOKENS.hi, TOKENS.line2, TOKENS.cellLine, TOKENS.orange …   // hex mirror of the CSS tokens
`alpha(TOKENS.hi, 0.3)         // 'rgb(255 209 102 / 0.3)'
`cssVar('cellLine')            // 'var(--cell-line)'
`categorical(i)                // 'var(--info)', 'var(--violet)', … wraps; categorical(i, 'hex') for canvas
`CATEGORICAL                   // ['info','violet','ok','amber','pink','orange','hi','sky']
````
``categorical()` hands out the semantic roles (info, violet, ok, hi) as categories, so use it only on a
`stage where those colours mean nothing else. Next to semantic colours, use `plainTone(i)` from `tone.ts`.
`Delete the lesson's `const C = {…}`. **`C.line` was `#323a4f` = `TOKENS.line2`**, not `TOKENS.line`.
`A dev-only check (`assertTokensInSync`, run from `main.tsx`) logs a console error, which fails
`smoke, if this table drifts from `global.css`.
`
`### `tone.ts`
````ts
`type Tone = 'hi' | 'ok' | 'bad' | 'info' | 'violet' | 'dim'   // semantic roles
`          | 'muted'                                            // plain readable grey: deliberately uncoloured
`          | 'orange' | 'amber' | 'pink' | 'sky';               // categorical hues
`TONES                                            // every Tone, e.g. one arrowhead marker per tone
`toneVar('ok')                                    // 'var(--ok)'
`toneFor(errPct, { warn: 20, bad: 50 })           // 'ok' | 'hi' | 'bad'; { invert: true } when higher is better
`plainTone(i)                                     // 'amber' | 'pink' | 'sky' | 'orange', wraps: categories that never wear a meaning (PLAIN_TONES)
````
`- Every tone has a `.tone-*` class in kit.css (`--c` plus `--on-c` ink: `--on-amber`, `--on-pink`, `--on-sky` are tokens
`  too) and a `TOKENS` entry, so every tone-driven component (BitStrip, CellGrid in both modes, ByteGrid fields,
`  TreeSvg/GraphView marks and arrowheads, ArrayStrip ranges) draws the categorical hues with no extra code.
`- Plain categories (a Hamming parity group, a float field, Euclid's step colours) take `orange`/`amber`/`pink`/`sky`,
`  never `bad`/`ok` as decoration (CLAUDE.md's colour table). Lesson SVG can colour by class too:
`  `className={`tone-${t}`}` plus `fill: var(--c)` in lesson CSS, as gcd-euclid's squares do.
`
`### `format.ts` — pattern 10
````ts
`NA                    // '–', the one placeholder
`duration(0.34)        // '340ms'; duration(1.26) → '1.3s'   (the 4 identical `fmt` copies)
`ms(41.6)              // '42 ms'
`perSec(12)            // '12/s'
`pct(0.123)            // '12%'; pct(0.0004, 1) → '<0.1%'
`bytes(1536)           // '1.5 KB' (binary); bytes(12000, { base: 1000 }) → '12.0 KB'; { dp: 0 } → '12 KB'; bytes(4096, { iec: true }) → '4.0 KiB' (IEC names for lessons that tell KiB from KB; ignored with base 1000)
`times(3)              // '3×'
`plural(3, 'step')     // '3 steps'; plural(2, 'entry', 'entries')
`integer(23414)        // '23,414' — an exact whole count with separators (sig() rounds to 3 figures)
`pad2(7), clock(605)   // '07', '10:05'
`joinList(['a', 'b', 'c'])  // 'a, b and c' ('a and b' for two, the item alone for one): the list-in-a-caption sentence
`dollars(12.5)         // '$12.50' — a dollar amount to the cent (autoscaling, graceful-degradation, object-storage, serverless-cold-starts)
`latency(50_000)       // '50 µs' — a time in ns, in ns / µs / ms / s (memory-hierarchy)
`humanDuration(50_000) // '14 hours' — seconds in s / min / hours / days / years; singular at exactly 1 ('1 day')
`                      // past a million years a power of ten, never a raw float: '3.2 × 10²⁹² years' (no-break spaces round ×)
`                      // a positive span under a microsecond is 'under a microsecond' (exactly 0 stays '0 s')
`humanDurationLog10(608)  // 'about 10⁶⁰¹ years' — takes log₁₀ seconds, for spans past a double (diffie-hellman, rsa);
`                      // humanDuration while it fits (below 10¹⁵ s), 'under a microsecond' below 10⁻⁶
`decimal(-0.25, 2)     // '−0.25' — rounded to dp places, trailing zeros dropped, real minus sign, -0 → '0' (the B8 readouts)
`superscript(23)       // '²³' — an integer in superscript digits
`power(10)             // '2¹⁰'; power(-4, 10) → '10⁻⁴' (BitStrip exponent labels, logs-exponentials)
`power(k, 10, { grouped: true })   // '10³⁰¹ ⁰²⁹ ⁹⁷²': digits in threes, narrow no-break space (big-o); superscript takes it too
````
`
`### `parse.ts`
````ts
`parseIntegers('1, 3 ,4  8')   // [1, 3, 4, 8]; commas and/or spaces; null if empty or any value isn't an integer
`parseInteger(' -7 ')          // -7; one plain decimal integer or null
`
`// One learner-typed field, within bounds, or the sentence to show instead: { ok: true, value } | { ok: false, error }
`parseBoundedInt(text, { min: 0, max: 999 })                       // generic messages: 'Type a whole number.', 'Keep it between 0 and 999.'
`parseBoundedInt(text, { min: 0, max: 255, prefixes: ['hex', 'binary'], underscores: true })   // 202, 0xCA, 0b1100_1010
`parseBoundedInt(text, { min: 0, max: 1e12, thousands: true })     // 1,000,003 (commas only between groups of three)
`parseBoundedInt(text, { min: -10, max: 10, typographicMinus: true })  // −7 reads as -7
`parseBoundedBigInt(text, { min: 0n, max: 2n ** 64n - 1n, prefixes: ['hex'], plainRadix: 16, spaces: true })  // hex-only: '1e400' is 0x1E400
`parseBoundedInt(text, { min: 2, max: 24, messages: {
`  empty: '…', invalid: (typed) => '…', tooSmall: (value, cleaned) => '…', tooBig: (value, cleaned) => '…',
`  negative: 'Primes are positive…',   // optional: any leading minus refused with this, first
`  grouping: 'Commas only between…',   // optional, with thousands: bad comma use refused with this instead of `invalid`
`} })
````
`Reads exactly (as a bigint inside), so a long digit run is refused rather than rounded into range, and
`out-of-range input is refused, never clamped or masked. Decimals, exponents (`1e3`), `+5`, `Infinity`
`and markup are always refused; only plain decimal takes a minus. Used by bit-manipulation, endianness
`(hex value, port), gcd-euclid, modular-arithmetic, primes-factoring and minimum-spanning-trees; their
`own wording goes in `messages`. Fields that parse lists (adders-alu) or other bases (binary-hex's octal
`and `#`) keep their own parsers.
`
````ts
`parseBoundedDecimal(text, { min: 0, max: 1e6, typographicMinus: true, messages: { tooSmall: () => "a weight can't be negative" } })
````
`The decimal counterpart, same `FieldParse` result and message shape (`empty`, `invalid`, `tooSmall`,
``tooBig`, `negative`). Plain decimals only (`2.5`, `-3`; not `.5`, `2.`, `1e3`, `+5`, `Infinity`, `NaN`,
`units or markup); out-of-range is refused, never clamped, compared on the parsed double. Used by
`expected-value's table cells.
`
`### `fixtures/` — shared sample data
````ts
`import { ACCESS_LOG } from '../../core/fixtures/accessLog';  // 12-line Common Log Format, RFC 5737 IPs
````
`Sample data that two or more lessons use lives here instead of being copied, since lessons can't
`import each other (regex-basics matches `ACCESS_LOG`; command-line greps it as `access.log`).
`
`### `useMeasure.ts` — css-layout, responsive-design
````tsx
`const m = useMeasure(ref, (el) => ({ box: rectIn(el.querySelector('.child')!, el), pad: px(getComputedStyle(el), 'paddingLeft') }));
````
`Measures real layout under `ref` after every render, whenever it or anything inside it resizes, and
`once web fonts have loaded (a late font changes line heights without resizing the container). The
`value only changes when the measurement does, so it can't loop. `rectIn(el, origin)` is an element's
`border box relative to `origin` (0.1px precision); `px(cs, prop)` reads a computed length.
`For the "type your own array" fields (two-pointers, sliding-window).
`
`### `math.ts`, `random.ts`, `hash.ts` — patterns 9, 11
````ts
`clamp(v, lo, hi), clamp01(t), lerp(a, b, t)
`ease(t), easeInOutQuad(t)                                      // cubic and quadratic ease-in-out
`randInt(lo, hi), randRange(lo, hi), pick(xs), shuffle(xs)      // all take an optional rnd
`type Rnd = () => number                                        // import it, don't redeclare it
`expSample(mean), weightedPick(items, weightFn), mulberry32(seed), freshInt(lo, hi, taken) // null if none free
`fnv1a(s)          // unsigned 32-bit FNV-1a
`fmix32(h)         // murmur3 finaliser
`hash32(s)         // fmix32(fnv1a(s)): byte-identical to consistent-hashing's hash32
`hexHash(s, 7)     // byte-identical to git-internals' hash()
````
`Verified: `hash32`, `hexHash` and `fnv1a` produce identical output to the consistent-hashing,
`git-internals and probabilistic-structures copies, and `mulberry32` matches tcp-udp's. lsm-trees
`and sharding use the same FNV loop. Still diff captions after swapping.
``hooks.ts` is hooks only (`useLoop`, `useElementSize`, `useCanvas`); maths and randomness come from here.
``useLoop(cb, running?, { maxDt? })`: `cb(dt, t)` per animation frame. `dt` is capped at `maxDt`
`seconds (default `DEFAULT_MAX_DT`, 0.05) so a background tab doesn't teleport the sim, and never
`negative. Pass `{ maxDt: Infinity }` when the real frame time is the lesson (game-loop's lag spikes).
`The clock restarts whenever `running` turns true, so a pause never counts as one huge frame.
`
`### `geometry.ts`
````ts
`interface Pt { x: number; y: number }
`pointAlong(a, b, t), midpoint(a, b)
`pillWidth(label, charW = 6.5, pad = 20)          // label.length * charW + pad
`archPath(x1, x2, baseY, lift)                    // quadratic arch 'M … Q … …'
`treeToPixels({ x, depth }, { count, width, pad, top, levelGap })
`arrowStep(key, step)                             // [dx, dy] for an arrow key, else null
`segmentHitsBox(a, b, c, halfW, halfH)            // does segment a→b cross the box centred on c (Liang–Barsky)? coupling-cohesion, layered-hexagonal, architecture-diagrams-c4
````
`
`### `lineDiff.ts` — tdd, refactoring-code-smells
````ts
`lineDiff(before, after)                          // { added: Set<index in after>, removed: Set<index in before> }
````
`Lines outside a longest common subsequence are changed, so a moved line is removed and added, as `diff` reports it.
`solid-principles' `changedLines` is deliberately not this: it compares a class's lines with the same-named class in the other
`variant (set membership, order-blind) and returns indices into a rendered listing, so a reordered or moved line is not flagged and
`an LCS would change which lines glow. technical-writing's `wordDiff` is an LCS over words with a different output (a token
`stream with eq/ins/del), so it stays too.
`
`### `motion.ts` — pattern 18
````ts
`SPRING.soft (170/24), SPRING.snappy (300/28), SPRING.stiff (450/32)
`SHAKE                       // the keyframes; in a stage, use useShake() below instead
`enterFromLeft, popIn        // spread: <motion.li {...enterFromLeft} />
````
`
`### `useShake.ts` — error-feedback shake
````ts
`const { shake, allowed } = useShake();          // or useShake(HARDER_KEYFRAMES)
`<motion.g animate={shake(world.crashed)} />     // SHAKE when true, { x: 0 } otherwise
`<motion.div animate={{ opacity: 1, ...shake(alarm) }} />
`if (allowed) animate(el, KEYFRAMES)             // imperative animate() calls
````
`Holds still under prefers-reduced-motion, even inside a stage's `reducedMotion="never"`: a shake is
`feedback, not teaching motion. Used by `CallStackPanel`'s `alarm`, stack-vs-heap, oop-fundamentals,
`containers, processes-threads, hashing-encryption and stack-queue.
`Map an inline spring to the nearest preset only if it looks the same. Otherwise keep a named local constant.
`
`### `sim.ts` — pattern 9
````ts
`percentile(sortedAsc, 0.99)     // sorted[min(len-1, floor(len*p))], 0 if empty (CB/LB formula)
`mean(xs)
`const hist = createSampler<P>({ every: 0.5, cap: 60 }); hist.tick(now, () => sample); hist.values; hist.clear()
`trimWindow(xs, now, span, (x) => x.t)     // in place, front of a time-ordered array
`windowRate(count, span)
`travel(from, to, t0, dur, now, easing?)   // { x, y, t }; LINEAR by default, pass `ease` for LB/RL
`const insight = createCooldown(8); if (insight.ready(now) && cond) { insight.fire(now); … }
`createCooldown(8, { armed: true })        // ready immediately instead of 8 s into the run
````
``createCooldown` has separate `ready()`/`fire()` because insight gates only re-arm when an
`insight actually fires; a throttle that re-arms on every true check would behave differently.
`
`### `tokenBucket.ts` — rate-limiting, reverse-proxy-gateway
````ts
`type BucketParams = { rate, capacity }        // tokens per second; most tokens held (the burst size)
`type Bucket = { tokens, last }                // a plain value: keep it in a world or a frame
`fullBucket(p, now?)                           // full at `now`
`refill(b, now, p)                             // tokens earned since `last`, capped; clock moves to `now`
`takeToken(b, now, p)                          // { allowed, bucket, retryAfter }: refill, then spend one whole token
````
`Pure functions, no class: rate-limiting's `Limiter` keeps a `Bucket` for its token algorithm (its
``tokens` is a getter over it), a scripted lesson can keep one per client. `retryAfter` is the whole
`seconds until one token is back, as an HTTP `Retry-After` would say.
`
`### `spark.ts`
````ts
`sparkPoints(values, w, h, { cap, max?, minMax?, align?: 'left' | 'right', pad?: { top?, bottom? } })   // Pt[] in a w×h box
`sparkMax(values, { max?, minMax? })
`sparkY(v, max, h, pad?)                    // the same y mapping, for reference lines
````
`Right-aligned by default: x = (i + cap - len) · w/(cap-1). That's the CB/LB chart formula.
`
`### `canvas.ts` — pattern 8
````ts
`FONT.mono(11), FONT.sans(13, 700)
`text(ctx, s, x, y, { color = TOKENS.muted, font = FONT.mono(11), align?, baseline? })  // align/baseline restored after
`box(ctx, cx, cy, w, h, { stroke = muted, fill = cell, lineWidth = 2, radius = 10 })     // centred (CB/BP roundBox)
`rect(ctx, x, y, w, h, { fill?, stroke?, lineWidth = 1, radius = 0 })                    // top-left; draws only what you pass
`dot(ctx, x, y, r, color, { glow? })
`wire(ctx, [[a, b], …], { color = line2, width = 2, dash = [4, 6] })                     // dash: [] for solid
`bar(ctx, x, y, w, h, ratio, color, { track = dim, radius = 0 })                         // ratio clamped
`tintBox(ctx, x, y, w, h, color, { label?, fillAlpha = .1, strokeAlpha = .6, radius = 8 })
`drawSpark(ctx, { x, y, w, h }, values, { cap, max?, minMax?, color, width = 2 })
````
``text()` without `align` uses the context's current alignment, so lessons that set
``ctx.textAlign = 'center'` once per frame keep working.
`
`### `useSimulation.ts` — pattern 7
````ts
`const { world, snap, paused, setPaused, togglePause, reset, refresh } = useSimulation({
`  create: () => createWorld(rate),            // lazy; again on reset()
`  step: (w, dt) => { advance(w, dt); narrate(w); },
`  snapshot: (w) => w.sim.stats(),             // plain data for React
`  snapshotEvery: 0.3,                         // seconds (default)
`  onSnapshot: (w, snap) => maybeInsight(w, snap),
`  initiallyPaused: false,
`});
`const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => drawScene(ctx, w, h, world()));
`useLoop(redraw, !paused);                     // registered after the sim, so it draws after each step
````
`- `world()` is stable. Use it in effects, handlers and draw callbacks, **never during render**; render from `snap` (null until the first snapshot).
`- The first snapshot is taken on mount, so a sim that starts paused still has stats.
`- `refresh()` re-reads `snap` right now, even while paused. Call it after an action changes the world (raft: crash a node, send a command). It skips `onSnapshot`, so the action's own caption isn't replaced by an insight.
`- "Sync React state into the world" stays a plain `useEffect` in the lesson: `useEffect(() => { world().rate = rate; }, [world, rate])`.
`- Deviation from the plan: there is **no `afterStep` option**. `useCanvas` needs `world` and the sim needs `redraw`, which is a circular reference that oxlint rejects. Redraw on its own `useLoop` instead, as above.
`
`### `useInterval.ts`, `useAsyncValue.ts`, `crypto.ts` — pattern 19
````ts
`useInterval(() => tick(), 250, !paused)                     // setInterval sims (observability, event-sourcing, multi-region)
`const digest = useAsyncValue(() => sha256Hex(text), text)   // null while pending or stale
`useAsyncValue(fn, key, { keepPrevious: true })              // keep the last result until the new one lands (no flicker while typing)
`enc, hasSubtle(), toHex(buf), b64url(buf), hexToBits(hex)
`sha256Hex(text): Promise<string | null>                     // null without crypto.subtle
`hmacSha256(secret, data, 'hex' | 'b64url'): Promise<string | null>
````
`The bytes-level `hmac`, `hotp`/`totp`, `aesBlockEncrypt` and the ECDSA helpers are under "Tier 2 kit (rollout plan P0-b)".
``useSignedJwt`'s string-key hack becomes
``useAsyncValue(() => signJwt(payload, secret), JSON.stringify([payload, secret]))`.
`
`### `recorder.ts` — pattern 15
````ts
`const r = createRecorder<MyFrame>({ reads: 0, hot: null }, { transient: { hot: null } });
`r.set({ reads: r.get().reads + 1 });
`r.snap(<>Read the root</>, hold?, patch?);   // set(patch), push { ...state, say, hold }, then reset transient keys
`r.close(<>Done in 3 reads</>, 2);             // push the summary as its own frame (state unchanged)
`r.amendLast(<>Read the root: done</>, 2);     // or: replace the last caption, only if it's a shorter version
`return r.frames;
````
`End with `close()` by default: it keeps the last step's narration. `amendLast()` overwrites the last
`caption, so use it only when that caption says less than the summary (a "Prints 5 6." step followed
`by "Prints 5 6. For primitives…"). There's no `finish()` any more: it silently overwrote, which lost
`narration in stack-vs-heap, ci-pipelines, closures-scope, oop-fundamentals and error-handling-models.
`It makes a shallow copy, so clone nested arrays and objects before mutating them. Mandatory for
`db-indexes and lsm-trees, recommended wherever a local push/snap exists, optional for class
`recorders (sorting, heaps) and declarative scripts.
`
`### Captions (`caption.ts`) — pattern 17
````ts
`useIntroCaption(<>Intro…</>, deps?)          // set on mount and when deps change (replaces ~17 intro effects)
`setCaption(node, { quiet: true })            // swap text in place, no fade (live readouts, per keystroke)
`// step frames: { say, quiet: true } → the player passes it through
````
`A frame without `say` shows the caption of the last frame at or before it that has one, however
`the player got there: playing, stepping, jumping or scrubbing (`captionSources(frames)` in
``usePlayer.ts`, memoized per frames array and unit-tested). Before frame 0..k has any `say`, the
`intro caption stays. The player sets the caption only when that source frame changes, so a caption
`the stage sets itself between frames survives until the next frame with its own `say`.
`
`Caption chips (`<span className="hl ok">…</span>`, global.css) never wrap, so a chip longer than a
`line overflows the caption. Keep chips under about 34 characters (what fits one line of a 390px phone
`caption: 320px wide, ~8.8px a character plus padding), and give a longer verdict `wrap`
`(`className="hl bad wrap"`): it then breaks at spaces like the text around it, with padding at the
`chip's two ends only (so a wrapped chip never overflows). Every existing chip is unchanged (it's opt-in).
`
`### Test helpers (`core/testing/`)
`Test-only modules: never import them from app code.
````ts
`captionText(node)                    // plain text a ReactNode renders to (markup stripped, entities decoded)
`captionText(node, { strict: true })  // same, but throws on a glued sentence ("port.60 s")
`expectCaption(node)                  // = captionText(node, { strict: true })
`gluedSentences(text)                 // glue.ts: snippets around each glued spot ([] when none)
`spawnSync(cmd, args, { timeout?, cwd?, input? })  // node.ts: { stdout, stderr, status }, UTF-8, 10 s default timeout
`runNode(code | lines, opts?)         // node.ts: spawnSync(nodePath, ['-e', code]); lines join with \n
`nodePath                             // the Node binary running the tests
`tscErrors({ 'a.ts': src })           // tsc.ts: real `tsc --strict` over in-memory files -> [{ file, line, code, message }] (generics-polymorphism, null-option-adts)
`emitJs(src)                          // tsc.ts: what TypeScript emits for a snippet (types erased)
`forbiddenCalls(sources, { also?, allow?, ignoreComments? })  // forbidden.ts: ['file: call', ...] for network / eval calls in raw sources ([] = clean)
````
``forbiddenCalls` is the "this lesson stays inside the page" check: the default set is `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval(`, `new Function`; `also: ['localStorage', 'sessionStorage', 'indexedDB', 'newUrl']` adds opt-in shapes and `allow` lifts a default. The lesson keeps its own `import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true })` (it also reads individual sources for its chip assertions) and asserts `expect(forbiddenCalls(sources)).toEqual([])`. Migrated: authz-models, threat-modeling, ssrf-access-control, envelope-encryption-kms, randomness-csprng. `also: NO_CLOCK_OR_TIMER` adds `clock` (`performance.now`, `Date.now`, `new Date`) and `timer` (`setTimeout`, `setInterval`, `requestAnimationFrame`); `ignoreComments: true` drops block and whole-line `//` comments first (`stripComments(source)` is exported for a lesson's own extra scan). Clock-free lessons migrated: branch-prediction, cache-coherence, memory-allocators (keeps its own `Uint8Array|ArrayBuffer` scan), page-tables-tlb, timing-side-channels. `also: NO_REGEXP_OR_FUNCTION` adds `regExp` (`new RegExp`, `RegExp(`) and `functionCall` (a bare `Function(`) for a lesson that writes its own matcher or evaluator (regex-engines, pushdown-automata, chomsky-hierarchy, parsing-algorithms, metaprogramming-macros; bytecode-vms, lambda-calculus and webassembly use the default set plus `functionCall` where needed).
`- A glued sentence is what a JSX line break next to `{…}` produces: JSX drops a line break that
`  touches an expression, so text ending a line in `…the port.` with `{n} s later` starting the next
`  comes out as "port.60 s later" (fix: `{' '}` at the line end). The
`  rule (`glue.ts`): a lowercase letter or `)`/`]`, then `. ! ? ; : ,`, then a capital or digit.
`  Decimals, hosts and file names pass. Inline `<code>`/`<kbd>`/`<samp>` contents are blanked first,
`  so `Math.PI` is fine but `<code>f()</code>.Then` is glued. Use `expectCaption` in every
`  caption-truth test instead of a local regex.
`- `npm run captions` runs the same rule over every caption it steps through, in every step-player
`  lesson, and exits 1 on a hit. It sees what the browser renders, including captions a test can't build.
`- `node.ts` exists because the app tsconfig has no Node types; it loads `node:child_process` at run
`  time with a typed shape. Use it to check a lesson's claim against real Node output (async-await-coroutines).
`
`### Player keyboard (`usePlayer.ts`, `playerRegistry.ts`)
`Space / ← / → / R are bound by `usePlayer` (unless `keyboard: false`). They never fire while typing,
`and Space on a focused button, link or `role=radio|button|…` control presses that control instead
`of toggling playback. ← / → are left to radio groups, tabs and sliders, where they move the
`selection. A keydown some handler already `preventDefault()`ed is left alone too, so a composite
`widget that owns its keys (a flame graph's arrow-key focus, a grid's Space) just calls
``e.preventDefault()`, with no `stopPropagation` needed. The mapping is the pure `shortcutFor(event, target)` (unit-tested). A player
`with the keyboard on registers itself with the lesson page, which shows the shortcut hint only
`then, so lessons do nothing extra. A one-frame player never reports `playing`.
`
`### Persisted state (`storage.ts`)
````ts
`const store = createPersistedStore('overview-open', {}, isBooleanRecord); // key, fallback, shape guard
`usePersistedStore(store)                                                   // value; re-renders on set
````
`The shape guard is required: a stored value that fails it (hand-edited, older schema, `null`)
`reads as the fallback instead of crashing a component. Guards provided: `isStringArray`,
``isBooleanRecord`; `parseStored` is the pure, tested core.
`
`### Error boundaries (`components/ErrorBoundary.tsx`)
`The lesson page wraps every `Stage` in `ErrorBoundary`: a crashing visual shows "This lesson hit an
`error" with a "Reload the lesson" button while the overview, side panels and quiz keep working. The
`app root has a last-resort boundary. Lessons don't add their own.
`
`### Focus
`Every keyboard-focused control gets the shared accent ring from a global `:focus-visible` rule
`(sliders and the scrubber included). Don't set `outline: none` without a replacement focus style.
`Clickable `TreeSvg` nodes draw their focus as an accent ring on the node's shape.
`
`### Radio groups (`useRadioGroup.ts`, `core/radio.ts`)
``Segmented` (so `Toggle` and `useScenePicker`) and the player's speed buttons follow the WAI-ARIA radio
`pattern: one tab stop, ← → ↑ ↓ / Home / End move the selection and focus with it, `aria-checked` on every
`option. `useScenePicker` also keeps focus across a scene switch: each scene renders its own copy
`of the picker, so switching unmounts the focused button, and the hook puts focus back on the new picker's
`chosen option (only when the switch was made while something had focus and focus then fell to `<body>`,
`so a scene change never steals focus on load). The same goes for a `setScene` handoff button. Lessons
`need no workaround; `Segmented` takes a `ref` to its radiogroup for this. A hand-rolled single-choice row should use the hook rather than plain buttons:
````tsx
`const radio = useRadioGroup(options.length, checkedIndex, (i) => select(options[i]));
`options.map((o, i) => <button key={o.id} {...radio.itemProps(i)} onClick={() => select(o)}>{o.label}</button>)
````
`
`### Page titles and focus (`usePageHeading.ts`, `core/pageTitle.ts`)
`Every page sets `document.title` ("Binary Search · Kinetic") and, after an in-app navigation, focuses its
``<h1>` so keyboard and screen-reader users land in the new page. The page the app opens on doesn't steal
`focus. A new top-level page does the same: `const heading = usePageHeading(title)` and
``<h1 ref={heading} tabIndex={-1}>`.
`
`### Reduced motion in the app chrome
`The app runs inside `MotionConfig reducedMotion="user"`: motion transforms in the shell (page entrances,
`the quiz shake, card reveals, the home hero) go still for people who ask for reduced motion. Each lesson
``Stage` is wrapped in `reducedMotion="never"`, because its motion is the teaching; decorative loops inside
`a stage should still go still on their own (`Pulse` does), and so should shakes (`useShake` does).
`
`### Inline code in lesson text (`InlineText.tsx`, `core/inlineCode.ts`)
`Summary fields, try-this tips, key ideas and every quiz line render `backtick` pairs as inline code, so
`write "relies on `x | 0`" in a plain string. An unpaired backtick stays literal.
`
`### Quiz (`Quiz.tsx`, `core/quiz.ts`)
`Options are shuffled once per visit (`shuffleOptions`), so author the right answer wherever it reads
`naturally: its position carries no hint. A lesson is learned once every question is answered correctly;
`wrong picks are free. Keep wrong options plausible and of similar length, since the shuffle can't hide an
`answer that is always the longest.
`
`---
`
`## Components (`src/components/`)
`
`### Controls (`ui.tsx`, `options.ts`, `ScenePicker.tsx`) — pattern 16
````tsx
`<Segmented label="n" value={n} onChange={setN} options={[{ value: 8, label: '8' }]} />  // numbers now allowed
`<Segmented ariaLabel="Input size n" value={n} onChange={setN} options={…} />  // no visible label: names the radiogroup itself
`<Segmented label="World" value={maze} onChange={setMaze} options={[{ value: false, label: 'Open grid' }, { value: true, label: 'Walled maze' }]} />  // booleans allowed: no 'open'/'maze' string mapping (Toggle is the same with the off option first)
`toOptions(MODES)                                         // [{id,label}] → options (import from components/options)
`<Toggle label="DNS" value={cached} onChange={setCached} off="Cold lookup" on="Cached" />  // off option always first
`<TextField label="Key" value={k} onChange={setK} onEnter={insert} onBlur={normalise}
`           sanitize={(s) => s.replace(/\W/g, '')} width={120} spellCheck={false} className="xx-field" disabled={off} />
`<ControlGroup label="Presets" inline className="xx-presets">{buttons}</ControlGroup>   // inline: label left of the group
`<Hint>…or click a number</Hint>                          // tone="muted", block (its own line), className
`<Hint tone="bad">{error} Still showing 12.</Hint>       // a refused input: red, same size as any Hint (18 lessons; a lesson-local `xx-error` class is no longer needed for the colour)
`<Stat label="Load" value={…} className="xx-stat">{<Bar …/>}</Stat>   // children render under the value
`<Stat label={<>Tail <span className="keep-case">μ</span></>} value={3} />   // labels are uppercased by CSS: μ would show as Μ ("M")
`<PauseButton paused={paused} onToggle={togglePause} />
`<Button ref={startBtn} variant="primary" onClick={start}>Start</Button>   // ref is the <button>: move focus back to it (usability-laws)
`<Button softDisabled={!canUndo} onClick={undo}>Undo</Button>   // aria-disabled instead of disabled: a button that disables itself on press keeps keyboard focus
`<ChipButton tone="info" on={loaded === p.id} onClick={() => load(p)}>{p.label}</ChipButton>  // a preset chip; size="md" for word-sized labels
`<ChipButton tone="info" on={flags.includes(f)} onStyle="solid" onClick={toggle}>{f}</ChipButton>  // solid fill when on (a flag, an answer)
`<ChipButton tone="bad" ariaLabel={`Remove watch ${w}`} onClick={remove}>×</ChipButton>          // an action: no `on`, no aria-pressed
`<ChipButton tone="info" disabled={full} onClick={() => fire(s)}>{s}</ChipButton>        // greyed out, not pressable (interrupts' full sandbox)
`<ChipButton tone="info" softDisabled={added.includes(f)} onClick={() => add(f)}>{f}</ChipButton>   // aria-disabled, stays focusable: use it where the press itself switches the chip off
`<ChipButton onClick={(e) => { refocusAfterRemove(e.currentTarget, { group: '.my-list', items: 'button', fallback: '.add-row button' }); remove(); }}>×</ChipButton>   // core/refocus: focus the control now in the removed one's place, else the fallback (persistent-data-structures, schema-evolution, cloud-networking-vpc, lambda-calculus)
`<ChipButton tone="bad" onClick={(e) => { refocusAfter(e.currentTarget); remove(); }}>×</ChipButton>  // onClick receives the click event: hand focus on from e.currentTarget, never document.activeElement (cloud-networking-vpc, offline-first-sync)
`const [scene, picker, setScene] = useScenePicker({ label: 'Lane', options: LANES, initial: 'hash' });  // setScene: one scene hands off to another
`<StageFrame controls={[rowOne, rowTwo]}>   // array → each wrapped in <Controls>, stacked with a dashed divider
`<StageFrame minWidth={880}>                // phones: the visual keeps 880px and scrolls sideways inside the stage
`<WideRegion minWidth={728} label="Pipeline diagram: scroll sideways to see all of it">
`  <Dag />                                  // or just one wide part of a stage (components/WideRegion)
`</WideRegion>
`<WideRegion minWidth={720} gutter={{ top: 30, bottom: 4, x: 8 }}>  // room for labels drawn outside the children
`<WideRegion minWidth={w} reveal={{ from: s / n, to: (s + len) / n, within: '.array-cells' }}>  // keep a sliding window on screen
````
`- `ChipButton`: pass `on` only for a chip with a state (the loaded preset, a set flag); it's then a
`  toggle with `aria-pressed`. A chip without `on` is a plain action and must not announce a pressed
`  state. `onStyle="solid"` fills an on chip with its tone (replaces lesson `.is-on` overrides). An
`  outline chip that's on gets a stronger tint and a full 2px edge, so it never looks like a hovered one.
`- `Slider` announces `format(value)` as `aria-valuetext`, so give it a `format` whenever the label
`  shows something other than the raw number ("no limit", "1.2/day").
`- `WideRegion` is the scroller behind `StageFrame minWidth` (same edge fades, focus and swipe hint).
`  `reveal={{ from, to, within? }}` keeps a stretch on screen while it overflows: whenever it changes,
`  the region scrolls sideways just enough to show it (plus a 24px margin), smoothly, or instantly under
`  prefers-reduced-motion. `from`/`to` are fractions (0..1) of the content's width, or of the first
`  element matching `within`, so it's exact even while the target is still gliding (rolling-hash's window
`  on a phone). `revealScrollLeft` (components/wideReveal) is the tested maths.
`  The hint sits in its own row under the scroller, only while it overflows, so it never covers
`  content; the row stays after the hint goes, so nothing shifts.
`  A sideways scroller always clips vertically too (CSS forces `overflow-y` off `visible` once
`  `overflow-x` scrolls), so anything drawn above or below the children (ArrayStrip range labels,
`  pointers, outlines) needs room reserved with `gutter` (debugging-method's bisect strip).
`  Wrap only the wide part when the rest of the stage is HTML that can reflow: in ci-pipelines only the
`  DAG scrolls on a phone, while the Gantt chart and YAML fit the screen. An SVG directly inside it
`  should be `display: block`, or it picks up a baseline gap.
`- `StageFrame minWidth`: the narrowest width at which the visual stays readable. Below it the stage scrolls
`  sideways *inside itself* (edge fades, a "swipe" hint that hides on scroll or after 5 s, keyboard-focusable)
`  instead of shrinking the drawing; wider screens see no difference. Set it on any stage with a fixed-layout
`  SVG, canvas or absolutely positioned scene. Pick the value with `npm run smoke -- --mobile <id>`: it fails
`  when scene text renders under 8px or the frame clips content. Rough guide: `356 × 8 / smallestTextPx` at 390.
`  For a drawing of known natural width, compute it: `minWidthForText(W, 13)` from `core/scale` (below).
`- A `Toggle` swap changes the option order when the lesson listed "on" first (cdn-edge). That's a deliberate change, so list it.
`- `TextField`: Enter does nothing unless `onEnter` is set. For clamped number fields, keep the raw text in state and clamp in `onBlur` and when the value is used, not on every keystroke (see trees-bst).
`- `TextField` has the shared look (a 14px mono input with an accent focus ring). A lesson `className` can resize it; a disabled field dims to 0.45 as a whole.
`
`### Panels (`Panel.tsx`) — pattern 4
````tsx
`<Box variant="default | sunken | raised" className="xx-panel">…</Box>
`<SectionTitle hint="last 10 s">Queue</SectionTitle>     // weight="regular" for the lighter label style; className
`<Tray label="Output" labelWeight="regular" empty="nothing yet" ariaLabel="Output">{items}</Tray>
`<Tray stack label="Search the repo">{field}{results}</Tray>   // label on its own line above the content
`<Box role="region" aria-label="Order pipeline" id="pipe">…</Box>  // native attributes are forwarded
````
``Box` takes a `ref` to its div (React 19 ref-as-prop, like `Button`). `Box`, `SectionTitle` and `Tray` forward native attributes (`aria-*`, `role`, `id`, `data-*`, events)
`to their root element. They used to drop them, and TS doesn't catch that (hyphenated JSX props aren't
`checked against declared props); `Panel.test.ts` renders them to prove the attributes arrive.
``Tray` shows `empty` as a faint mono note. If your empty text needs its own styling, render it as
`a child instead (heaps, trees-bst). A `SectionTitle` is an inline span: inside a block (not flex)
`parent, give it `display: block` in the lesson CSS so its line box matches a div's.
`
`### `Bar.tsx` — pattern 12
````tsx
`<Bar value={load} max={1} tone="hi" marker={0.75} height={8} label={…} trailing={…} animate />
`<Bar … color={c} track="var(--line-2)" transition={{ duration: 0.15 }} markOpacity={0.7} markLabel="resize threshold" className="xx-bar" />
`<Bar value={t} max={lease} markers={[{ at: t1, label: 'T1', tone: 'violet' }, { at: t2, label: 'T2', tone: 'info' }]} />  // tone ticks, labels under the track
````
`It renders `.meter` / `.meter-track` / `.meter-fill` / `.meter-mark`: a track (default `--line`)
`with a radius-99 fill in `--c`. `transition` is the fill's motion transition (default 0.4 s
`easeOut; `{}` = motion's default tween). Lesson CSS can restyle `.xx-bar .meter-mark` (hash-table's taller tick).
````tsx
`<Bar segments={[{ value: updateMs, tone: 'hi' }, { value: renderMs, tone: 'ok' }]} max={BUDGET_MS}
`     height={14} track="var(--dim)" animate={false} ariaLabel="Update 3 ms and render 4 ms of 16.7 ms" />
````
`- `segments` stacks fills end to end instead of one `value`: square-edged parts clipped by the rounded
`  track, cut where the running total reaches `max` (`stackShares` in components/barSegments, tested).
`  game-loop's frame-budget bar runs on it. `ariaLabel` makes the whole bar one `img`.
`
`### `CodePanel.tsx` — pattern 13
````tsx
`<CodePanel title="Dockerfile" lines={LINES} stateOf={(i) => …} gutter="number | arrow | none"
`           nowStyle="solid | bar" trailing={(i) => status[i]} />
`// or active={3} / active={[2, 3]}
````
`Line states: `idle past now next done cut cached pending bad good add del` (`bad`: the line that threw or is
`wrong, a `--bad` tint and left bar; `good` mirrors it in `--ok`, the fixed or right line; `add` / `del` are
`a diff's + and − lines, tinted `--ok` / `--bad` with the text in that colour and no bar: edit-distance's
`line diff). memory-leaks and async-await-coroutines' pitfall panels use `good` for the fixed lines.
`edit-distance keeps four lines of its own CSS (inset rows, no wrap) so its diff stays pixel-identical: the kit's
`add/del tint the whole row. `solid` gives the now-line a `--hi` fill
`(tx-acid); `bar` gives it a tint and a left bar (race, recursion, containers). The CSS is generic,
`so expect to keep a few lesson overrides for exact pixel parity.
````tsx
`<CodePanel lines={SRC} active={pc}
`           renderLine={(line, i) => highlightTokens(line, i)}        // rich code, e.g. struck-through skipped parts
`           onLineClick={toggleBreakpoint} pressed={(i) => bps.has(i)} // each line a button (debugger-tools)
`           lineLabel={(i) => `Line ${i + 1}: toggle breakpoint`} />
````
`- `renderLine` replaces a line's code content; `lines` stays the plain text (keys, labels).
`- `marker={(i) => <Dot/> | null}` adds a 12px slot left of the line number for every line, like a
`  debugger's breakpoint gutter (debugger-tools); return null for an empty slot. Don't inject markers
`  into the code with `renderLine`.
`- `onLineClick` turns every line into a button that looks identical to a plain line: Space/Enter,
`  the focus-visible ring, `aria-pressed` from `pressed(i)`, and `lineLabel(i)` as its name (default
`  "Line N: code"). The dev kit showcase (`#/dev/kit`) has a breakpoint demo.
`- `roving` makes the clickable lines one tab stop instead of one per line: ↑/↓ move focus (no wrap),
`  Home/End jump to the ends, and re-entering the panel returns to the line last focused
`  (`listKeyTarget` in `core/radio`, tested). isa-assembly's C and assembly panels use it (they had ~23 stops).
`- **A long line scrolls inside the panel (K3-6).** `.code-panel` has `min-width: 0` and its `ol` is an
`  `overflow-x: auto` scroller, so a line with an unbreakable run (a URL, a long identifier, a compiler
`  flag) no longer widens a flex or grid parent and pushes the page sideways at 390. Ordinary lines still
`  wrap (`pre-wrap`); each `li` is `min-width: min-content`, so a scrolled line's tint and left bar cover all
`  of it. The focus ring of a clickable line sits inside the line (`outline-offset: -2px`) because the scroller
`  would clip it. At 900px and up every `CodePanel` caller is pixel-identical (checked on all 115 lessons with a
`  `CodePanel` or `GanttLanes`; 390px shots changed nowhere either). `#/dev/kit` ("Tier 3 kit · kickoff round")
`  has a long-line demo in a flex row.
`- Not adopted, deliberately: propositional-logic's short-circuit `TraceLine` (a label + code + result
`  row, not a panel line) and code-review's diff (file headers, a sign column and severity tags) stay local.
`
`### `ConsolePanel.tsx` — value-vs-reference, closures-scope; debugger-tools (migrated)
````tsx
`<ConsolePanel lines={mem.out} error={mem.error} />                      // error prints last as "Uncaught …" in red
`<ConsolePanel lines={['ok', { text: 'deprecated', tone: 'orange' }]} title="output" empty="(silent)" />
````
`Plain lines are green (`--ok`); a `{ text, tone }` line takes its own tone. Shows `empty` while nothing's printed.
``preserveWhitespace` prints lines exactly as given (`white-space: pre`): runs of spaces survive, so column
`output (`ps`, a table) lines up, and a line wider than the panel scrolls sideways inside it instead of wrapping.
`signals-graceful-shutdown's `ps output` uses it (its columns now align).
`
`### `Sparkline.tsx`, `AnimatedValue.tsx`, `ArrowMarker.tsx`
````tsx
`<Sparkline values={hist} width={80} height={22} cap={60} align="left" minMax={100}
`           pad={{ top: 2, bottom: 1 }} color="var(--info)" strokeWidth={1.6} refLine={target} className="xx-spark" />
`<AnimatedValue value={count} variant="pop | flip" as="b" className="…" />
`const arrow = useArrowMarker('var(--violet)', { size: 6, refX: 9 });   // <svg>{arrow.def}<path markerEnd={arrow.url} /></svg>
````
``Sparkline` draws nothing, not even the dashed ref line (`.sparkline-ref`), until there are two
`samples. `useArrowMarker` uses a per-instance id so markers never collide; `refX` (0-10) sets
`where the tip sits relative to the line's end (default 8, 9-10 = at the end).
`
`### Scene kit (`components/scene/`) — patterns 5-6
````tsx
`import { Flyer, Packet, Pulse, SceneNode, TravelDot } from '../../components/scene';
`
`<SceneNode at={POS.api} w={100} h={56} rx={10} title="api-1" sub="stateless"
`           titleDy={-4} subDy={13} on={active} busy={working} tone="info" variant="default | bad | dim">
`  {/* extras in scene coordinates */}
`</SceneNode>
`
`<Packet key={frameIndex} path={[a, b]} label="GET /users/42" color="var(--info)"
`        arrive="fade | stay | absorb | bounce" keyframes="timed | even" duration={1.15}
`        height={22} charW={6.4} pad={20}
`        timing={{ travelEnd: 0.62, fadeStart: 0.8, fadeInEnd: 0.12 }}   // default, = client-server
`        stopAt={0.82} delay={0} variant="solid | outline" trail
`        scaleIn={0.6 | null} fadeIn={0.15 | 'full' | 'first-hop'} lift={34}
`        classes={{ pill: 'xx-pill', text: 'xx-pill-text' }} />
`
`<Pulse at={p} from={30} to={80} color={c} duration={1} opacity={0.9} mode="ripple | breathe" className="…" />
`<TravelDot path={[a, b, c]} color="var(--ok)" r={5} duration={4} delay={1} repeat />
`<Flyer from={{ x: 10, y: 40 }} to={{ x: 80, y: 40 }} className="rep-pkt kind-write" style={…}
`       axis="both | x" center fade="arrive | lost | in | none | number[]" startScale={0.6 | null}
`       exitScale={0.6 | null} opacityDuration={0.2} arc={22} duration={0.8} delay={0} onArrive={merge}>W</Flyer>
````
`CSS classes you can reuse on custom shapes: `.scene-edge` (dashed link), `.scene-zone` (uppercase
`zone label), `.scene-node` / `.scene-node-box` / `-title` / `-sub`, `.scene-packet(-text)`.
`Packet text size is `var(--packet-fs, 10.5px)`: set `--packet-fs: 11px` on the svg if yours was 11px.
``.scene-zone` is 10px on desktop and 11px at ≤900px, where scenes are drawn scaled down to their
``minWidth` and it would otherwise be the first label under 8px. Don't override it per lesson.
`
`Behaviour notes, for pixel parity:
`- **`SceneNode`**
`  - The box is centred and the text offsets are relative to the centre (default title −3, sub +13).
`  - `.on` beats `.is-bad`, so an active down node stays highlighted, as in client-server.
`  - `busy` renders `<Pulse from=max(w,h)/2 to=max(w,h)>`. If your pulse radii differ, render your own `<Pulse>`.
`- **`Packet` with `arrive="fade"`** reproduces client-server/oauth/auth exactly when you pass their
`  duration, height, `charW` and `timing`. Examples:
`  - oauth: `timing {0.62, 0.82, 0.1}`, 1.4 s, h 24, `charW` 6.2, pad 22.
`  - auth: `travelEnd` 0.65, `fadeStart` 0.82; read its opacity `times` for `fadeInEnd`.
`  - Multi-point paths split `travelEnd` evenly between the legs.
`- **`Packet` with `arrive="stay"` and `trail`** is web-request's pill and line (0.7 s travel, 0.15 s fade-in).
`- **`Packet` variants:**
`  - `keyframes="even"` spaces every hop evenly and fades out on the last one (zero-trust).
`  - `arrive="absorb"` dissolves into the target, `arrive="bounce"` hops up by `lift` and pulses in place (ip-ports).
`  - `scaleIn={null}` + `fadeIn="full" | "first-hop"` + `variant="outline"` + `classes` is distributed-transactions' outline pill, including the bus route as a 4-point path.
`- **`Flyer`:**
`  - `axis="both"` is replication's `rep-pkt` motion: `x`/`y` −50% centring, `left`/`top` in %, and an `exit` shrink. There, `arc` wraps the children in `.flyer-arc`.
`  - `axis="x"` moves `left` only (tls, http-basics, processes-threads). `center` centres it horizontally, and `arc` lifts the element itself (crdts).
`  - `onArrive` fires once per mount, only for the trip, not the exit animation.
`- **`Pulse`** is decoration, so with `prefers-reduced-motion` it renders a still ring instead of looping. Teaching motion (packets, flyers, `TravelDot` traffic) always plays.
`
`### Gate circuits (`components/scene/Gates.tsx`, `gateGeometry.ts`) — logic-gates, adders-alu, sequential-logic
````tsx
`import { GateGlyph, GateInput, GateLamp, GateWire, SWire, TravelDot, wiresOf, wirePoints } from '../../components/scene';
`const wires = wiresOf(circuit, board);        // circuit: { inputs, gates: [{ id, type, inputs }], outputs: [{ label, from }] }
`<svg viewBox="0 0 640 310" className="lg-svg">  {/* board: { at: { A: {x,y}, g1: {x,y} }, outputs: [{x,y}] } */}
`  {wires.map((w) => <SWire key={w.key} from={w.start} to={w.end} state={w.unused ? 'unused' : v[w.from] ? 'high' : 'low'} />)}
`  <TravelDot path={wirePoints(w.start, w.end)} color="var(--hi)" r={4} className="gate-dot" … />
`  {circuit.inputs.map((n) => <GateInput key={n} name={n} at={board.at[n]} on={v[n]} onFlip={() => flip(n)} />)}   {/* DOM order = Tab order */}
`  <GateGlyph type="NAND" at={board.at.g1} on={v.g1} className="lg-gate is-editable" role="button" …>{/* extras, gate coords */}</GateGlyph>
`  <GateLamp label="sum" at={board.outputs[0]} value={v.sum ? 1 : 0} />          {/* '?' for unknown; className for lesson states */}
`  <GateWire d={customPath} state="unknown" />                                   {/* hand-routed feedback loops (SR latch) */}
`</svg>
````
`- Geometry is pure and tested: `gateBodyPath`, `XOR_BACK_PATH`, `bubbleAt`, `typeLabelX`, `inputPort(t, at, port, count?)`, `outputPort(t, at)`, `sourcePort`, `wiresOf`, `wirePath`, `wirePoints`; constants `IO_R` 18, `BUBBLE_R` 4, `PORT_DY` 11. Types: `GateKind` (AND OR NOT NAND NOR XOR), `GateCircuit`, `GateBoard`, `GateWire`.
`- CSS in scene.css: `.gate-wire` (`is-high` / `is-low` / `is-unused` / `is-unknown`), `.gate`, `.gate-body`, `.gate-back`, `.gate-type` (11px; brightens when the gate is on), `.gate-input`, `.gate-lamp`, `.gate-io-value`, `.gate-io-name` (14px), `.gate-dot`. Lessons tune size and glow on their own svg class (logic-gates: 10.5px type labels, 13px names, glowing wires and lamps; adders-alu: glowing wires; sequential-logic: 12px labels, stored/broken lamp rings).
`- All three lessons migrated: frames and 8 driven states pixel-identical, except sequential-logic's lit NOR label, which now brightens like the other two lessons' (deliberate).
`
`---
`
`## Tier 1 kit (rollout plan P1)
`
`Built before Tier 1, each for 2+ Tier 1 lessons. All of them are on the dev-only showcase at
``#/dev/kit` (`pages/DevKit.tsx`, not in production builds): open it to see and poke each piece.
`Component CSS lives in `kit.css`, so the classes work without importing anything.
`
`### `core/bits.ts`, `BitStrip.tsx` — binary-hex, twos-complement, floating-point, char-encoding, base64-encodings, command-line
````ts
`toBits(0x2a7f, 16)        // Bit[] MSB first; negatives in two's complement, out-of-range wraps: toBits(-1, 8) → 11111111
`fromBits(bits), fromBitsSigned(bits), flipBit(bits, i), placeValue(i, width)   // width 1..53
`chunkGroups(16, 4, { tone: 'violet', label: (k, from, to) => hexDigit(from, to) })  // nibbles, bytes, 6-bit, rwx
`chunkGroups(20, 8, { align: 'right', tone: 'violet' })   // bytes of a number, from the LSB: 4 + 8 + 8 (logs-exponentials)
````
````tsx
`<BitStrip bits={bits} onToggle={(i) => setBits(flipBit(bits, i))} placeValues
`          groups={chunkGroups(16, 4, { tone: 'violet', label: … })} highlight={[carryAt]} />
`<BitStrip bits={f32} size="sm" groups={[{ from: 0, to: 0, tone: 'bad', label: 'sign' }, …]} />
`<BitStrip bits={utf8} toneOf={(i) => (isPrefix(i) ? 'dim' : 'info')} />          // per-bit tone beats the group's
`<BitStrip bits={toBits(0o754, 9)} labelOf={(i) => 'rwx'[i % 3]} groups={chunkGroups(9, 3, …)} />
`<BitStrip bits={perms} onToggle={flip} ariaLabelOf={bitName} />   // screen readers hear "group write", not "bit 4"
`<BitStrip bits={addr} groups={octets} size="sm"                      // a draggable prefix divider (subnetting-cidr)
`          divider={{ at: prefix, onMove: setPrefix, tag: `/${prefix}`, ariaLabel: 'Prefix divider', valueText: (p) => `/${p}` }} />
`// divider: drawn over the measured bits (components/bitDivider: dividerSlots, nearestSlot, dividerKeyTarget), so it follows
`// the strip's wrapping on a phone. With onMove: drag anywhere on the strip; on the focused line Left/Down and Right/Up move
`// one bit, PageDown/PageUp a byte, Home/End to the ends. Without onMove it's a plain marker. Strip layout only.
`<BitStrip bits={out} pending={(i) => i < width - filled} toneOf={…} />  // columns not worked out yet: empty dashed slots
`// A row of a CSS-grid table (error-detection-correction's Hamming table): bits fill the grid's columns
`<div style={{ display: 'grid', gridTemplateColumns: `auto repeat(7, 38px)` }}>
`  <span>received</span>
`  <BitStrip layout="cells" clear="toned" bits={received} toneOf={(i) => (flipped(i) ? 'bad' : groupTone(i))}
`            onToggle={flip} pressedOf={flipped} ariaLabel="received codeword" />
`</div>
````
`- Give toggleable bits a meaningful `ariaLabelOf(i)` (i counts from the most significant bit): the
`  default "bit i" says nothing about what the bit does (command-line `bitName`, floating-point `bitRole`).
`- Set bits are a solid fill in their tone; clear bits are a dark cell outlined in it. Tone: `toneOf(i, bit)`, else the group's, else `hi`.
`- `placeValues` (or `'value'`) prints each bit's place value above it, compacted (`32K`); `placeValues="exponent"` prints it as a power of two (`2²³`), for registers wider than ~16 bits where values stop fitting; `labelOf` overrides either.
`- `highlight` rings bits in `highlightTone` (default `info`: binary-hex's carry ripple).
`- It wraps between groups only, never inside one: split a long run (a 23-bit mantissa) into a few groups, labelling only the first.
`- With `onToggle` the bits are `aria-pressed` buttons (pressed = the bit is 1, or `pressedOf(i)`, e.g. "flipped in
`  transit") with **one tab stop**: arrow keys move between bits (wrapping, the radio key map), Home/End jump to the
`  ends, Space/Enter toggles, and the tab stop stays on the last bit used. Without `onToggle` they're read-only.
`- `pending(i)`: a bit not computed yet draws as an empty dashed slot in its tone, whatever its value
`  (bit-manipulation's column-by-column result); a pending button's name ends "not worked out yet".
`- `clear="toned"` draws clear bits with their tone at full strength (edge and digit, 2px edge) instead of the quiet
`  default, for rows where the colour carries meaning on every bit, 0s included (Hamming parity groups).
`- `layout="cells"`: no strip box, groups or labels; the bits become items of the parent's CSS grid (the wrapper is
`  `display: contents`), each filling its column, so table rows line up. Size them from lesson CSS with
`  `--bit-h` / `--bit-fs` on `.bit-strip` (error-detection-correction: 34px / 13px). `size`: `sm` 18px, `md` 24px, `lg` 30px (one step smaller at ≤900px).
`
`### `core/truth.ts`, `TruthTable.tsx` — logic-gates, propositional-logic
````ts
`truthRows(['p', 'q'])                 // [{p:F,q:F}, {p:F,q:T}, {p:T,q:F}, {p:T,q:T}]; { trueFirst: true } for TT…FF
`truthRowIndex(['A', 'B'], inputs)     // the row matching the current inputs
````
````tsx
`<TruthTable vars={['A', 'B']} format="10" trueTone="hi" currentTone="info"          // logic-gates
`            columns={[{ label: 'sum', fn: (r) => r.A !== r.B }, { label: 'carry', fn: (r) => r.A && r.B }]}
`            currentRow={truthRowIndex(['A', 'B'], inputs)} onRowClick={(row) => setInputs(row)} />
`<TruthTable vars={['p', 'q']} columns={[f1, f2]} mismatchRows={diffRows} />       // T/F, true = --ok, current = --hi
````
`Rows with `onRowClick` are keyboard-focusable buttons (Enter/Space). Outputs are separated from inputs by a rule.
`Variable-name headers keep their case (`p` stays `p`; output headers use the table's uppercase style).
`A `mismatchRows` row turns red as a whole, its T/F values included.
`
`### Memory kit (`components/memory/`) — stack-vs-heap, value-vs-reference, closures-scope, oop-fundamentals
`SVG primitives in scene coordinates, plus the geometry to connect them:
````tsx
`import { HeapObject, RefArrow, VarSlot, heapFieldPort, heapRect, slotPort } from '../../components/memory';
`
`<VarSlot at={{ x: 10, y: 70 }} name="a" isRef tone="violet" highlight={seesMutation} dead={framePopped} />
`<VarSlot at={{ x: 10, y: 30 }} name="count" value={3} />
`<HeapObject at={user} w={180} title="{ } user" variant="live | collectable | freed" // a freed block is always --bad (its `tone` is ignored); `freedTone="ok"` makes a correct free read green
`            fields={[{ name: 'name', value: '"Ada"' }, { name: 'tags', isRef: true }]} highlight={searching} />
`<RefArrow from={slotPort({ x: 10, y: 70 })} to={heapRect(user, 180, 2)} bend={-12} />
`<RefArrow from={heapFieldPort(user, 180, 1)} to={heapRect(tags, 180, 1)} dangling={freed} />
````
````tsx
`// layout helpers
`const { tops, end } = stackBoxes(heights, { start: TOP, gap: 18 });                        // downward
`const frames = stackBoxes(frameHeights, { start: STACK_BOTTOM, gap: 6, direction: 'up' }); // a call stack
`<RefArrow bend={fanBend(i, arrowsIntoThisBox)} … />                                        // spread n arrows into one box
`// a reference that leaves to the left, and a structural link between two whole boxes
`<HeapObject … fields={[{ name: '[[Environment]]', isRef: true, port: 'left' }]} />
`<HeapObject … fields={[]} collapseEmpty />   // just the title row; size it with heapHeight(0, true) / heapRect(at, w, 0, true). Without it, [] keeps one empty row ({})
`<RefArrow from={heapFieldPort(at, w, 0, 'left')} to={envRect} />
`<RefArrow from={childEnvRect} to={parentEnvRect} color="var(--faint)" dashed thin />
````
`- Sizes: `SLOT` (150 × 30, name tag 58) and `HEAP` (title 24, rows 22) are exported, so layout maths and the shapes agree. `heapHeight(n)` and `heapRect(at, w, n)` size a block.
`- `stackBoxes(heights, { start, gap, direction })` returns each box's top y and the running `end`; `fanBend(i, n, spread = 22)` is the sideways bow for arrow `i` of `n` into one box. Both are pure and tested.
`- `RefArrow` ends on the target box's border facing its source (`rectEdgeToward`), so arrows never poke inside. `from` can be a box too (edge to edge). `bend` bows it; `dangling` is dashed `--bad`; `color` / `dashed` / `thin` draw a non-reference link.
`- A field's `port: 'left'` puts its reference dot on the left border; start the arrow at `heapFieldPort(at, w, i, 'left')`.
`- `collectable` is dim and dashed with a corner tag (unreachable, waiting for GC). `freed` is dashed `--bad` with a "freed" tag. Pass `tag` to override the corner text (e.g. `GC`). The tag shares the title row, so title + tag must fit in `w`; if they don't, use `tagPlacement="above"` rather than widening the box.
`- `tagSize` sets the corner tag's font size in px (default 10 from kit.css): 11px tags stay readable in a scene
`  that has to scale down on a phone, instead of forcing a wide `minWidth`.
`- Object graphs: `heapGrid({ cols, colW, rowH, origin })` places boxes on a grid (`at(i)` row by row, `cell(col, row)`,
`  `size(count, lastH)`; colW/rowH are pitches, box plus gap), and `fieldArrowBetween({ at, w, field }, { at, w, fields })`
`  returns `{ from, to, port }` for a field's reference to another box, with the port on the side facing it (set the
`  field's `port` to match); `portToward(src, dst)` is just that side choice. All pure and tested. garbage-collection's
`  plain grid and port sides run on `heapGrid` and `portToward` (pixel-identical, frames diffed). memory-leaks'
`  retaining path stays local: it's one row of boxes of different widths, not a fixed-pitch grid.
````tsx
`const grid = heapGrid({ cols: 3, colW: 200, rowH: 96, origin: { x: 24, y: 40 } });
`const a = fieldArrowBetween({ at: grid.at(0), w: 160, field: 1 }, { at: grid.at(4), w: 160, fields: 2 });
`<HeapObject at={grid.at(0)} w={160} … fields={[…, { name: 'next', isRef: true, port: a.port }]} tagSize={11} />
`<RefArrow from={a.from} to={a.to} />
````
`- Heap blocks fade in; solid arrows draw themselves in and dashed ones fade in (motion's `pathLength` draw-in writes its own `stroke-dasharray`, which would erase the dashes). Under reduced motion both appear at once.
`
`### `ArrayStrip.tsx` — two-pointers, sliding-window, prefix-sums, debugging-method; binary-search
````tsx
`<ArrayStrip values={arr} cellState={(i) => 'idle | active | info | violet | done | dim | bad'}
`            ranges={[{ from: lo, to: hi, labels: ['lo', 'hi'] }, { from: b0, to: b1, tone: 'violet' }]}
`            pointers={[{ i: l, label: 'L', tone: 'info' }, { i: r, label: 'R', tone: 'violet' }]}
`            onCellClick={(i) => pick(i)} cellTitle={(i) => `Search for ${arr[i]}`}
`            showIndex fontSize={12} cellMax={56} />
````
`- `active` lifts in `--hi` (checking now), `info` / `violet` lift the same way in those colours (a second and third
`  pointer: cycle-detection's slow and fast cells match their S and F markers), `done` lifts in `--ok` (found), `dim` is ruled out, `bad` is a `--bad` fill. `idle` cells inside the **first** range get a light tint in that range's own tone (`--hi` by default).
`- Pass `pointers={[]}` (not undefined) when pointers come and go, so the pointer lane keeps its height.
`- `cellClass(i)` adds a lesson's own class to cell i on top of its state (amortized-analysis keeps filled slots flat with `am-filled` instead of overriding `.is-info` inside its block).
`- Ranges and pointers glide with `SPRING.snappy`. Pointers keep their identity by `id`, or by `label` when it's a string.
`- `mergePointers` joins pointers that land on one cell into a single marker, "i·k" (a string prop picks another
`  separator): the first pointer there keeps its tone and id. quickselect uses it instead of its local merge
`  (`mergeSharedPointers` in components/arrayPointers, tested).
`- `cellTone(i)` colours a cell flat in any `Tone`, without the lift: a bare tone or `{ tone, fill: 'tint' }` is a
`  22% wash edged in the tone (ring-buffers' filled slots), `'solid'` a full fill in the tone with its on-colour text
`  (semaphores' buffer), `'outline'` a 2px ring inset in the cell (counting sort's placed items). A lift state
`  (`active` / `info` / `violet`) still wins, and an outline ring then turns that state's on-colour. Those three
`  lessons dropped their `.array-cell.is-*` overrides and renderValue ring for it.
`- Cells share the strip width equally. For short arrays pass `cellMax`: the strip narrows, so the markers stay aligned.
`- Range labels sit about 28px above the strip, so leave that room above it.
`- binary-search runs on it, pixel-identical: 11/11 frames against the pre-migration code, including 8 and 40 cells and a fully ruled-out missing-value search.
`
`### `ResizablePane.tsx` — css-layout, responsive-design
````tsx
`<ResizablePane min={320} max={1440} value={width} onChange={setWidth} label="Device width" step={10} height={260}>
`  <SamplePage />   {/* real DOM: measure it with getBoundingClientRect */}
`</ResizablePane>
````
`Drag the handle, or focus it and use ←/→ (`step`, ×5 with Shift), Home and End. It's a `separator`
`with `aria-valuenow`. When the stage is narrower than `value`, the pane is shown at the stage's width
`and the readout says "shown at Npx", so measurements inside stay honest.
````tsx
`<ResizablePane min={320} max={1440} value={device} onChange={setDevice} label="Device width" scaleToFit>
`  <div className="rd-page">…</div>   {/* laid out at the true `device` width, then scaled into the pane */}
`</ResizablePane>
````
``scaleToFit` keeps the children laid out at the full `value` width (their media and container
`queries see the real width) and scales them into the pane, with the box height following the scaled
`content; the readout then says "laid out at a true Npx, then scaled to fit" (responsive-design).
`
`### `TextArea` (in `ui.tsx`) — regex-basics, data-formats
````tsx
`<TextArea label="Test text" value={text} onChange={setText} rows={6} />      // mono by default
`<TextArea label="Notes" value={v} onChange={setV} mono={false} spellCheck />
````
`The same look and focus ring as `TextField` (same `.text-field` wrapper). Enter inserts a newline.
`Spellcheck is off by default, since this is usually code or data. Highlighting matches inside the
`text (regex-basics) is lesson-local until a second lesson needs it.
`
`### `core/scale.ts` — floating-point, logs-exponentials, memory-hierarchy
````ts
`const x = linearScale(0, 100, 0, 500);        // x.map(50) → 250, x.invert(250) → 50, x.ticks(5) → [0, 20, …, 100]
`const y = logScale(1e-9, 1e-1, 300, 0);       // y axis, bottom-up; y.ticks(9) → [1e-9, 1e-8, …, 1e-1]
`logScale(1, 1024, 0, 10, 2)                   // base 2
`minWidthForText(520, 13)                      // 320: StageFrame/WideRegion minWidth keeping 13px text at the 8px floor (MIN_TEXT_PX)
`minWidthForText(placement.width, 12, 320)     // third argument: never narrower than this
`minWidthForText(SCENE_W, 9, { padX: 36 })     // stage padding the drawing doesn't scale into, added on top; { floor, padX } together too
````
`Linear ticks are "nice" (1, 2 or 5 × 10^k) with float noise rounded off (0.3, not 0.30000000000000004).
`Log ticks are whole powers of the base inside the domain, thinned evenly beyond `count`. A log
`scale needs a positive domain (it throws otherwise) and maps `v <= 0` to `NaN`.
`
`## Tier 1 extractions (rollout plan P2)
`
`### `core/treeLayout.ts`, `TreeSvg.tsx` — tree-traversals, dom-events, accessibility, dependency-management; trees-bst, recursion
````tsx
`const shape: TreeShape<number> = { root, children: (id) => [nodes[id].left, nodes[id].right] }; // null = empty slot
`<TreeSvg shape={shape} layout="inorder" width={900} height={380}            // viewBox; size it with CSS
`         label={(id) => nodes[id].key} onNodeClick={(id) => pick(id)}
`         nodeMark={(id) => (id === hi ? { tone: 'hi', fill: 'solid' } : onPath(id) ? { tone: 'violet', fill: 'tint' } : null)}
`         edgeMark={(parent, child) => (onPath(child) ? { tone: 'violet', dashed: false } : null)}
`         nodeScale={(id) => (id === hi ? 1.15 : 1)}
`         overlay={({ at, levelGap }) => <Ghost at={at(parentId)} />} />
`
`// n-ary / custom nodes: tidy layout, fixed level gap, your own shapes around (0, 0)
`<TreeSvg shape={domShape} layout="tidy" width={640} height={300} levelGap={70}
`         renderNode={(id) => <><rect x={-40} y={-14} width={80} height={28} rx={6} /><text y={4}>{tag(id)}</text></>}
`         hidden={(id) => !revealed.has(id)} />
````
`- `layoutTree(shape, 'inorder' | 'tidy')` is pure (tested): `inorder` places a binary tree by in-order rank, so a BST reads sorted left to right and a node with only a right child still sits left of it. `tidy` gives leaves consecutive columns in depth-first order and centres each parent between its first and last child: right for DOM, dependency and accessibility trees and for call trees like fib(n). `treeX(col, columns, width, pad)` maps a column to pixels.
`- Vertical spacing: `levelGap` fixes it; otherwise it's `min(maxLevelGap, (height - bottomRoom) / depth)`.
`- `natural`: the SVG fills its container's width but never grows past its viewBox `width`, centred (a three-node parse tree stays small). Use it instead of wrapping the tree in a `maxWidth` div (grammars-parsing, parsing-ast, type-systems).
`- Nodes glide with `transition` (default `SPRING.soft`) when the shape changes, pop in from `enterScale` and fade out when removed. `hidden(id)` removes a node and the edge to it without moving anything else (the layout always uses the whole shape), e.g. fib calls not made yet.
`- Default nodes are a circle of `radius` with a centred label. The base node CSS is wrapped in `:where()`, so classes you use inside `renderNode` always win.
`- Marks: `nodeMark` → `{ tone, fill: 'tint' | 'solid', tint?: % }` (tint default 16%), `edgeMark` → `{ tone, dashed? }`, `markedEdgeWidth` (default 3.5). `nodeClass(id)` adds lesson classes.
`- `onNodeClick` makes every node a keyboard button (`role="button"`, Enter/Space press it, accent focus ring) and the SVG a `group`. The tree is **one tab stop** (roving tabindex, starting at the first node in reading order, then staying on the last node used) and the arrow keys follow its structure: Up = parent, Down = leftmost child, Left/Right = the neighbour on the same level (across subtrees, and across trees in a forest), Home/End = first and last node. `treeKeyTarget(key, from, shape, place, visible?)` in `core/treeLayout` is the pure, tested key map; hidden nodes are skipped. A lesson that moves focus itself (tree-traversals after a removal) just calls `.focus()` on `[data-node="id"]`, and that node becomes the tab stop. Its accessible name is the node's text label or id; pass `nodeAriaLabel(id)` for a better one ("Remove leaf 35"). Only pass `onNodeClick` while clicking does something, or every node becomes a dead tab stop.
`- `nodeScale(id)` and `nodeOpacity(id)` (0..1) animate size and fade. motion owns the node group's opacity, so fade nodes through `nodeOpacity`, not CSS (tree-traversals fades nodes that can't be removed).
`- trees-bst (in-order, the null ghost as an `overlay`) runs on it pixel-identically. recursion's fib tree (tidy, custom nodes, `hidden`) does too, except for subpixel antialiasing on a few label glyphs (≤0.03% of the stage), because labels are now placed by the node's transform instead of absolute coordinates.
`- `nodeSize(id)` (tidy only) gives a node a footprint wider than one column: each subtree takes a run as wide as
`  its children's runs or its own node, whichever is wider, so neighbours never overlap and narrow nodes stay packed.
`  `layoutTree(shape, 'tidy', { size })` returns the `columns` to size `width` with. With every size 1 it's the plain
`  tidy layout, column for column (tested against the old algorithm over 200 random forests). tries' compressed
`  view uses it instead of sizing every column to the widest pill.
`- heaps keeps its own tree: nodes sit at array-index positions of a complete binary tree with `2i+1`/`2i+2` edge labels, and they're keyed by item so swaps animate. A third layout mode is worth adding only when a Tier 1 lesson needs it.
`
`### `CallStackPanel.tsx` — tree-traversals, error-handling-models, debugger-tools; recursion
````tsx
`<CallStackPanel
`  frames={[{ id: 3, name: 'chargeCard(order)', detail: 'throws CardDeclined', state: 'error' },  // TOP FIRST
`           { id: 2, name: 'handleRequest()', state: 'waiting' },
`           { id: 1, name: 'main()', state: 'waiting' }]}
`  meta="3 frames" alarm={crashed} anchor="bottom"
`  selected={frameId} onSelect={setFrameId} selectedTone="info"               // debugger: pick a frame
`  empty={<p className="empty-note">nothing running</p>} overlay={crashed && <CrashBanner />} />
````
`- `state`: `idle` (default), `running` (solid `--hi`), `waiting` (dimmed), `returning` (`--info`), `ok` (`--ok`: a base case, a `catch` that handled it), `error` (`--bad`: throwing, crashed, unwinding).
`- `tone` on a frame accents an `idle` or `waiting` frame in that colour, to match the lesson's own colour for it (tree-traversals: violet, like its "on the stack" nodes). Other states keep their colours.
`- `frames` is **top first**. `anchor="bottom"` (default) stacks from the bottom up like plates; `anchor="top"` lists from the top like the DevTools pane. `showDepth` numbers frames by depth (0 = outermost).
`- Frames push in from above and pop off to the right (`layout` + `SPRING.snappy`); `alarm` shakes them and turns the box red.
`- `enterFrom="bottom"` brings new frames up from below; a frame's own `exit: 'right' | 'top' | 'bottom'` picks how it leaves (default right). monotonic-stack's deque joins at the back (bottom) and drops its front out of the top, its back out of the bottom.
`- `onSelect` makes frames buttons (focus ring included); `selected` highlights one with a ring in
`  `selectedTone` (default `hi`; debugger-tools uses `info` so selection doesn't read as "running").
`- recursion's stack runs on it, pixel-identical. Its "↓ value" return chip is lesson-local, passed in `detail`.
`
`### `core/commitGraph.ts`, `CommitGraph.tsx` — branching-workflows, secrets-management; git-internals
````tsx
`<CommitGraph
`  commits={[{ id, lane, parents, short: id.slice(0, 4), message: msg, dead: !reachable.has(id), tone?: 'bad' }]} // oldest first
`  refs={[{ name: 'main', at: tipId, head: true }, { name: 'feature-1', at: otherTip }]}
`  selected={openId} onSelect={setOpenId} title="commit graph · click a commit to open it"
`  overlay={(at) => <ConflictMarker at={at(id)} />} />
````
`- Commits run left to right in the order given, one row per lane. Edges are straight along a lane and S-curves across lanes. Merge commits (2+ parents) get a thicker ring, `dead` commits fade and dash, and `tone` overrides a commit's ring colour (e.g. the commit that leaked a key). Tags stack above their commit; HEAD's reads "HEAD → name" in `--hi`.
`- It is its own horizontal scroller. When commits are added it scrolls the newest into view (never past the start), and the side with hidden commits gets an inner glow (`has-more-left` / `has-more-right`), so on a phone you can see there's more to swipe to. `follow={false}` turns the auto-scroll off.
`- The drawing is exactly as wide as the commits need (no minimum width), so short histories don't create an empty scroll area.
`- `layoutCommitGraph`, `commitEdgePath`, `shortMessage` and `defaultLaneColor` are pure and tested; `spacing` overrides `DEFAULT_SPACING`.
`- **Parallel work:** by default each commit gets its own column. Give commits a `column` to share one;
`  `depthColumns(commits)` places each commit one column after its latest parent, so several developers'
`  same-day commits line up (branching-workflows: a 3-developer GitFlow week goes from ~40 columns to ~20).
`- `laneLabel={(lane) => name}` draws a name per lane in its own gutter, pinned to the left edge while the graph scrolls.
`- `messageFit="truncate"` cuts each message to the room before its same-lane neighbour (`fitMessages`), so
`  close commits never overlap. It's opt-in, so git-internals keeps its usual 12-character messages.
`- git-internals runs on it, pixel-identical on desktop, and at 390px its graph now starts at the first commit instead of scrolled past the end.
`
`## Tier 2 kit (rollout plan P0-a)
`
`Built before Tier 2 lessons, each for 2+ of them. All of them are on `#/dev/kit` under "Tier 2 kit"
`(`pages/DevKitTier2.tsx`), checked at 1440 and 390. CSS is in `kit.css`; pure logic lives in
``src/core/` with Vitest tests next to it.
`
`### `core/numberTheory.ts` — modular-arithmetic, gcd-euclid, primes-factoring, rsa, diffie-hellman, digital-signatures-pki, rolling-hash
````ts
`mod(-7n, 5n)              // 3n: always non-negative
`modPow(4n, 13n, 497n)     // 445n, square-and-multiply
`gcd(48n, 18n)             // 6n
`egcd(240n, 46n)           // { g: 2n, x: -9n, y: 47n, steps: EuclidStep[] }: 240x + 46y = g; steps = the remainder table
`modInverse(3n, 11n)       // 4n; null when gcd(a, m) ≠ 1
`isProbablePrime(n)        // { prime, certain }: Miller-Rabin, first 13 primes as bases; certain below MR_DETERMINISTIC_BOUND (≈3.3e24)
`sieve(100)                // { isPrime, primes, passes: [{ prime, crossed: number[] }] }: one pass per prime ≤ √n, for animating
`trialFactor(360n)         // { factors: [2n, 2n, 2n, 3n, 3n, 5n], steps }
`toyRsa(61n, 53n, 17n)     // { ok: true, n, phi, e, d } | { ok: false, reason }: textbook RSA, toy sizes only
`                          // valid for any e > 1 with gcd(e, φ) = 1, e > φ included (65537 → the same d as 17)
````
`- Everything is `bigint` except `sieve` (a `number` limit). Tests check against brute force below 10⁴, Carmichael numbers, Bézout identities and RSA round-trips.
`
`### `core/stats.ts` — combinatorics, birthday-paradox, probability-basics, expected-value, conditional-bayes, shuffle-reservoir, linear-time-sorting, classification-metrics
````ts
`factorial(20); choose(52, 5)         // bigint, exact
`log2Factorial(n)                     // log₂ n!, for the comparison-sort bound
`variance(xs); stdDev(xs)             // population; { sample: true } divides by n − 1. mean/percentile stay in core/sim
`histogram(xs, { bins: 10, min: 0, max: 1 })   // { edges (bins + 1), counts, outside }: max lands in the last bin
`binomialPmf(n, k, p)
`collisionProbability(23, 365)        // { p: 0.507…, method: 'exact' }: exact product up to COLLISION_EXACT_LIMIT, then 1 − e^(−n(n−1)/2N)
`collisionProbability(2, 2 ** 128).p  // 2.9e-39, not 0: both forms run in log space (log1p / expm1), so huge ID spaces keep tiny chances
`runningMean(xs)                      // the convergence curve for simulated frequencies
`logCheckpoints(n, perDecade = 40)    // counts worth a point on a convergence chart: 1..10, then ~perDecade per decade, then n
`runningStats(xs, at = logCheckpoints(xs.length))   // [{ n, mean, sd }] at those counts: Welford's update, population SD,
`                                     // stable on a huge offset (probability-basics, expected-value)
````
`
`### `core/disjointSet.ts` — union-find, minimum-spanning-trees
````ts
`const dsu = createDisjointSet(8, { compress: true, byRank: true, trace: true });
`dsu.union(0, 1)           // true if it merged two sets
`dsu.find(5); dsu.connected(2, 3); dsu.count    // count = number of sets
`dsu.parents(); dsu.ranks(); dsu.height()       // snapshots for drawing
`dsu.events                // with trace: find {node, path} · reparent {node, from, to} · union {a, b, merged, root, child} · rank {root, rank}
````
`- Turn `compress` / `byRank` off to show the naive forest. Draw it with `TreeSvg` forest mode: `roots` = the nodes that are their own parent.
`
`### `TreeSvg` forest mode — union-find, huffman-coding, tries
``shape.roots: K[]` (instead of `root`, which is then left out: `{ roots, children }`) lays several trees side by side; `forestGap` (default `FOREST_GAP`, 0.5) is the empty columns between them. Additive: every single-root caller is pixel-identical (all six TreeSvg lessons diffed).
`
`### `core/grid.ts`, `CellGrid.tsx` — error-detection-correction, primes-factoring, modular-arithmetic, birthday-paradox, conditional-bayes, cpu-caches, cpu-pipelining, shuffle-reservoir, virtual-memory-paging, file-systems, storage-devices, edit-distance, deployment-strategies, feature-flags
````tsx
`<CellGrid rows={10} cols={10} size="md"                      // xs 10px · sm 22px · md 34px cells, or { cell: 40, gap?, font? }
`          cell={(r, c) => ({ text: n(r, c), tone: 'ok', fill: 'tint', intensity: 0.3 })}   // fill: solid | tint | outline | none
`          rowLabels={…} colLabels={…} highlight={[{ r, c, tone: 'info' }]}
`          onCellClick={(r, c) => pick(r, c)} cellAriaLabel={(r, c) => `${n(r, c)}, crossed out`} cellTitle={…}
`          rowSuffix={{ width: 100, render: (r) => text }} ariaLabel="Numbers 1 to 100"
`          overlay={({ center }) => <line {...from(center(i, j - 1))} {...to(center(i, j))} markerEnd={…} />} />  // DP arrows
````
`- Natural size (one unit = 1px), shrinking to fit narrow screens. `fill: 'none'` mutes the cell's text (a crossed-out number).
`- With `onCellClick` it's one tab stop: arrows move (no wrap), Home/End go to the row ends, Ctrl+Home/End to the corners, PageUp/Down five rows, Enter/Space press (`gridKeyTarget` in `core/grid`, the WAI-ARIA grid pattern). Reuse `gridKeyTarget` for any HTML grid of buttons, as graph-representations' adjacency matrix does.
`- Above `CANVAS_THRESHOLD` (400) cells it paints them on a canvas from `TOKENS` (same API) with one focusable hit area and a cursor ring, so a 1,000-person crowd is one element. Cell text (strings and numbers) is painted too whenever it lands at `MIN_TEXT_PX` (8px) or more on screen (the SVG's rendered scale is measured); below that it's left out, so a lesson whose canvas grid can shrink that far must say so on screen. modular-arithmetic's mod 22–24 tables now show their numbers (its WideRegion keeps them ≥ 9px), so its "too many to number" note is gone. `cellTitle` tooltips are SVG-mode only. Tint and outline cells are edged in their tone on the canvas too (1px and 1.5px, inset; `canvasStroke`, with `cellFill` resolving a toned cell with no fill to a tint as the SVG does), so conditional-bayes' 1,000-person crowd draws its negatives as the outlines its spec asks for instead of a faint wash. Plain and solid cells stay edgeless on the canvas.
`- `size` takes a custom `{ cell, gap?, font? }` beyond the presets (gap defaults to ~9% of the cell, font to ~38%, none under 16px cells). Pure rules (`resolveSize`, `textReadable`, `canvasFill`, `canvasInk`) live in `components/cellGridPaint.ts`, tested.
`- `overlay(geometry)` draws SVG over the cells and rings, in the grid's coordinates (`at`, `center`, `cell`, `gap`, `width`, `height`), with no pointer events: dependency arrows, a path through the grid. Not migrated yet: dynamic-programming's LCS table (an HTML grid of 40px cells with its own SVG arrow overlay) can now be expressed as `size={{ cell: 40 }}` + `overlay`, but moving it from HTML to SVG isn't pixel-identical, so it's left for that lesson's owner.
`- Inside a scene SVG (a grid with RefArrows to its cells): `<CellGridGroup at={{ x, y }} {...props} />` draws it as a `<g>` there, and `cellGridLayout(props, at)` (components/cellGridLayout, pure) returns the same geometry in scene coordinates (`at(r, c)`, `center(r, c)`, `cell`, `gap`, `width`, `height`) to aim arrows with. Keyboard, rings, overlay and canvas mode work the same.
`- **Row decoration (K3-16).** `rowDecor={(r) => ({ tone?, label?, style?: 'rail' | 'band' } | null)}` tones a whole row: a `rail` (the default) is a thin bar in a gutter left of the cells (the gutter is reserved only when some row has a rail, and `cellGridLayout` shifts `at`/`center` by it), a `band` is a wash behind the cells (no gutter), and `label` is text after the row (after a `rowSuffix`; strings and numbers set the width reserved). Same SVG in canvas mode. Omitted, or returning nothing for every row, the grid is pixel-identical to before. Intended for mvcc (visibility per transaction), buffer-pool, join-algorithms. Demo on `#/dev/kit`.
`
`### `core/bytes.ts`, `ByteGrid.tsx` — endianness, grpc-protobuf, symmetric-ciphers, macs-hmac, packet-capture-debugging, file-systems
````tsx
`<ByteGrid bytes={frame} perRow={16} offsetBase={0x1000} ascii
`          fields={[{ from: 0, to: 5, tone: 'info', label: 'destination MAC' }, …]}
`          toneOf={(i) => (i === decoding ? 'hi' : undefined)} highlight={[{ i: 12, tone: 'hi' }]}
`          onByteClick={(i) => pick(i)} ariaLabel="Frame bytes" />
````
`- A CellGrid underneath: hex offsets on the left, tinted fields with a key below, printable ASCII on the right (`printable`), the same keyboard model.
`- `perRow` defaults to 16, or 8 on a phone (`useMediaQuery(PHONE_QUERY)`, ≤600px), so the digits stay readable at 390.
`
`### `core/plot.ts`, `Plot2D.tsx` — birthday-paradox, probability-basics, expected-value, classification-metrics, vectors-similarity, matrices-transformations, gradient-descent, linear-logistic-regression, supervised-learning, decision-trees-ensembles, clustering-kmeans, embeddings, usability-laws, amdahls-law, bezier-interpolation, color-spaces, linear-time-sorting, latency-bandwidth
````tsx
`<Plot2D x={{ domain: [1, 80], label: 'people' }} y={{ domain: [1e-9, 1e21], log: true, ticks: 6 }}   // format?: (v) => string
`        width={356} height={240} ariaLabel="…">            {/* the defaults fit a phone with 10px ticks */}
`  <Heat fn={region} resolution={48} />                      {/* first: a canvas under the rest; memoise fn */}
`  <Bars bars={barsFromHistogram(histogram(xs, …))} tone="violet" />
`  <Polygon points={[[0, 0], a, sum, b]} tone="violet" dashed />
`  <Curve fn={(x) => p(x)} tone="info" />  <Curve points={pts} dashed />
`  <Segments segments={[{ from, to, tone }]} />
`  <VLine at={23} label="n = 23" />  <HLine at={0.5} label="50%" tone="dim" />
`  <Arrow from={[0, 0]} to={v} label="a" tone="info" />
`  <Points data={[{ x, y, tone, hollow }]} r={4.5} onDrag={(i, [x, y]) => …} pointLabel={(i) => 'centroid A'} />
`</Plot2D>
`
`<Plot2D x={…} y={…} width={356} aspect="equal" ariaLabel="…">          {/* height follows: x and y units equally long */}
`  <PointerLayer onDown={(p) => add(p)} onMove={setProbe} cursor="crosshair" />   {/* under the draggable layers */}
`  <Points data={[{ x, y, tone, r: 6, ring: 'bad' }]} labels={(i) => words[i]} />   // per-point r / ring; text labels
`  <Points data={many} onDrag={…} roving />                             {/* one tab stop: PageUp/PageDown, [ ], Home/End */}
`  <PointLabels data={dots} labels={(i) => show[i] ? { text, left: true } : null} />   {/* labels as their own later layer */}
`  <PlotCursor at={cursor} onMove={setCursor} label="Add-point cursor" />  {/* keyboard twin of a PointerLayer */}
`  <Arrow to={v} tone="muted" dashed />
`  <VLine at={t} onDrag={(x) => move(x)} onStep={(dir) => step(dir)} ariaLabel="Threshold" valueText="threshold 0.62" />
`</Plot2D>
````
`- Layers are children in data coordinates, drawn in order; path layers are clipped to the plot box. Custom layers call `usePlot()` (from `components/plotContext`) for `xs`, `ys` and `box`.
`- `tickValues: [1, 1e25, 1e50, 1e75, 1e100]` on an axis replaces the automatic ticks (values outside the domain are dropped): a log axis over a huge range otherwise strides by an awkward number of decades and can miss the top. `axisTickValues(spec)` in `core/plot` is the tested logic.
`- A range past ~10³⁰⁸ can't be a real log axis (doubles stop at 1.8 × 10³⁰⁸): plot log₁₀ of the value on a linear axis with `format: (v) => power(v, 10)`, as primes-factoring does.
`- `Curve fn` is sampled evenly on screen (so log axes too) and breaks where `fn` isn't finite. `Heat fn` returns a 0..1 intensity of `tone` or `{ tone, intensity }` (a region), or pass `grid` (row 0 at the top); memoise `fn`, since it repaints when it changes.
`- Draggable `Points` take pointer drags and are focusable: arrow keys move 4 units (Shift: 20), always clamped to the domain (`nudgePoint`, `clampPoint`).
`- A `dim` rule is a quiet reference line (faint line, muted label). `formatTick` writes 1.5k, 2M, and 10ⁿ on log axes.
`- `aspect="equal"` sets the height so one unit of x is as long on screen as one of y (a decade on a log axis): equal domains give a square box. `equalAspectHeight(width, x, y)` and `plotMargin(x, y)` in `core/plot` are the tested logic; gradient-descent, linear-logistic-regression, matrices-transformations and vectors-similarity use it instead of a hand-tuned 356 × 350.
`- `PointerLayer` is a transparent sheet over the box reporting the pointer in data space (`onDown` click-to-add or drop, `onMove` a probe); it has no keyboard path, so pair it with `PlotCursor` (a hollow grey draggable point) and a button, or with draggable points. Replaces gradient-descent's DropLayer, linear-logistic-regression's PointerSheet, and decision-trees' and clustering's click catchers.
`- `Points`: a point's own `r` and `ring: Tone` (an outline 2.5 units out; decision-trees' misclassified samples) and `labels(i)` (text beside each point in its tone, dim → muted; `PointLabels` is the same as a separate layer, for when something must sit between the dots and their words, as in embeddings). `roving` makes draggable points one tab stop: Page Up/Down (or `[` `]`) pick the previous/next point, Home/End the ends, arrows still move it (`rovingPointTarget`); linear-logistic-regression's up-to-20 points use it.
`- `VLine` / `HLine` labels stay inside the plot box: measured after layout, a label that doesn't fit on its side
`  of the rule goes to the other side, and one that fits neither is slid inside (`fitLabel` in core/plot, tested).
`  A label that already fit draws exactly where it did.
`- Draggable `Points` take their pointer handling from `useDragPoint` (components/useDragPoint), which is shared
`  with hand-drawn SVG handles outside a plot: `const drag = useDragPoint(toLocal, onDrag, { onGrab })`, then
`  `<g {...drag(i)} onKeyDown={…}>` per point (press captures the pointer and focuses the element; moves call
`  `onDrag(i, toLocal(clientX, clientY))`). `svgPoint(svg, clientX, clientY)` is the client → SVG user-units
`  step, and `arrowStep(key, step)` (core/geometry) the shared arrow-key table. rasterization's corner handles
`  use them, and its depth probe moves with `gridKeyTarget`, so it now also takes Home/End and Page Up/Down.
`- `Arrow dashed` dashes the shaft. `VLine onDrag` is a slider (`role="slider"`, a grip, pointer drag anywhere in the box; arrows call `onStep(±1)`, or nudge 4 units through `onDrag` without one): classification-metrics' threshold.
`- `paintImage(w, h, draw)` (`components/canvasImage.ts`) is the shared paint-to-data-URL step behind Heat and CellGrid's canvas mode.
`- Per-pixel images from the same file: `paintPixels(w, h, colourAt, scale)` (row-major, `colourAt(i)` returns an `Rgb` in 0..1), `tokenRgb(token)` (a palette token as `Rgb`), `rgbText(c)` ('(255, 128, 0)' for on-screen numbers) and the `Rgb` type / `CHANNEL_MAX`. Used by ray-tracing, gpu-rendering-pipeline and lossy-compression; their `paint.ts` keep only what is theirs (`paintRings`, `mixRgb`, `grey`).
`
`### `core/graphLayout.ts`, `GraphView.tsx` — topological-sort, union-find, minimum-spanning-trees, relations-orders, cycle-detection, dfa-nfa, lexing-tokens, deadlocks, garbage-collection, memory-leaks, build-systems, bundlers-code-splitting, coupling-cohesion, test-doubles, dependency-injection, behavioral-patterns, mobile-app-lifecycle, sockets-api, software-licensing; graph-representations, ci-pipelines
````tsx
`// An editor (graph-representations): fixed positions, one tab stop, click/drag/keyboard editing
`<GraphView nodes={[{ id, label, at: { x, y } }]} edges={[{ from, to, weight }]} directed width={640} height={380}
`           nodeColor={(id) => categorical(component(id))}
`           nodeMark={(id) => (id === sel ? { tone: 'hi', fill: 'solid' } : null)}
`           edgeMark={(e) => (inCycle(e) ? { tone: 'bad', width: 3.5 } : null)}
`           onNodeClick={select} onEdgeClick={(e, i) => select(e)}
`           editable={{ onAddNode: (p) => …, onAddEdge: (from, to) => …, minGap: 48 }} ariaLabel="…" />
`
`// A DAG (ci-pipelines): layered columns, S-curves, your own node drawing
`<GraphView nodes={jobs.map((j) => ({ id: j.id, shape: 'box' }))} edges={deps} directed layout="layered"
`           spacing={{ direction: 'right', layerGap: 150, nodeGap: 64, padMain: 70, padCross: 44 }}
`           box={{ w: 112, h: 46 }} edgeStyle="curve" edgeClass={(e) => (dead(e) ? 'is-dead' : '')}
`           renderNode={(n, at) => <SceneNode at={at} … />} ariaLabel="…" />
`
`// A state machine: start arrow, accepting states, self-loops, labels; a⇄b pairs bend apart by themselves
`<GraphView nodes={[{ id: 'q2', at, accept: true }, …]} edges={[{ from: 'q0', to: 'q0', label: '1' }, …]}
`           directed startNode="q0" width={500} height={220} ariaLabel="…" />
`
`// Per node / per edge extras
`{ id: 'str', at, accept: true, shape: 'box', loopSide: 'left' }   // accept on a box = an inner outline; loopSide: top (default) | right | bottom | left
`{ from: 'S', to: 'int', label: '0-9', labelAt: 0.62 }              // label 0 (at from) .. 1 (at to) along the edge, any route
`<GraphView layout="circle" circleRadii={{ rx: 260, ry: 138 }} … />  // round an ellipse instead of a circle
`circlePositions(ids, width, height, pad, radii?)                    // the same, pure: dfa-nfa places every DFA state up front with it
````
`- `layout`: `fixed` (each `at`), `layered` (`layeredLayout`: longest-path layers, cycles broken depth-first; barycentre ordering kept only when it removes crossings, so a crossing-free input order stays exactly as given), `circle` (`circlePositions`, first node at the top; `circleRadii` makes it an ellipse). Layered sizes itself; `width` overrides that (ci keeps its width when deploy is absent).
`- `layoutEdges` (layered only) is the edge set the layout uses; `edges` is still what's drawn. topological-sort lays out by
`  the preset's edges plus any added edge that keeps the graph acyclic, so closing a cycle draws the new arrow without
`  moving a single node.
`- Layered + straight edges: an edge that would cross another node (a back edge closing a cycle) bends round it in a
`  "lane" curve beside the straight line, nearest lane first, alternating sides (`detourBend` / `curveHits` in
`  `core/graphLayout`, tested; `DETOUR_MARGIN` 8px clearance). If no lane within reach clears, it stays straight.
`  S-curve (`edgeStyle="curve"`) and fixed/circle layouts are untouched.
`- `editable.onAddNode` is optional: leave it out for an edges-only editor (topological-sort); clicking empty space then
`  does nothing and the crosshair cursor goes away.
`- `renderNode(node, at, base)`: `base` is the default drawing (focus ring, circle or box, label), so adding a badge or a
`  tag is `<>{base}<Badge/></>` (topological-sort's in-degree badges, cycle-detection's S/F tags) rather than a copy of
`  the ring/shape/label markup. `box={{ w, h, rx }}` sets the box's corner radius (default 10; the ring follows at rx + 4).
`- Natural size, shrinking on narrow screens; stretch it with `width: 100%` in lesson CSS (both migrated lessons do). Big graphs on phones belong in a `WideRegion`, as in ci-pipelines.
`- **`underlay` and `labelHalo` (K3-5).** `underlay={<>…</>}` is SVG drawn first inside the graph's own `<svg>`, in the
`  same coordinates and under the edges and nodes: module boxes, a VPC, a component hull. It scales with the drawing,
`  takes no pointer events (`.graph-underlay`) and is `aria-hidden`, so a lesson no longer stacks a second SVG with a
`  copied viewBox (coupling-cohesion, layered-hexagonal and architecture-diagrams-c4's two scenes did). Read the
`  graph's coordinate transform with `canvas.querySelector('svg.graph-view').getScreenCTM()` (coupling-cohesion's drag).
`  `labelHalo` adds the page colour round edge labels (`paint-order: stroke`, 4px, round joins); the kit default
`  `.graph-edge-label` only gains `paint-order: stroke`, so labels without the prop are unchanged. The halo rule has
`  specificity 0,2,0 so a lesson's own `.x-graph .graph-edge-label` wins (minimum-spanning-trees keeps `stroke-linejoin: miter`).
`  Migrated pixel-identically: coupling-cohesion, layered-hexagonal, architecture-diagrams-c4 (zoom frame and fix title) and
`  minimum-spanning-trees (`labelHalo`); frames at 1440 and 390, plus driven states (c4 fix chip and a zoom, the hexagon view, a
`  preset with a request and a selection). One change in motion only: c4's zoom frame now fades with the graph's own fade-in.
`- Node marks use TreeSvg's shape (`{ tone, fill: 'tint' | 'solid', tint? }`); edges take `{ tone, dashed?, width? }` (default 3.5), and the arrowhead follows the tone. `nodeColor` colours only unmarked nodes. Classes: `.graph-node`, `.graph-node-shape`, `.graph-node-label`, `.graph-edge` (+ `is-marked`, `is-dashed`), `.graph-edge-label`.
`- With `onNodeClick` / `onEdgeClick` / `editable` the graph is one tab stop (roving tabindex, starting top-left): arrows move to the nearest node or clickable edge in that direction (`spatialNext`), Home/End jump to the ends, Enter/Space press. `editable`: clicking empty space adds a node (at least `minGap` from the rest), dragging node to node adds an edge, and from the keyboard it's C on a node then Enter on another (Escape cancels). Adding a node from the keyboard stays a lesson button, since only the lesson knows where it goes.
`- Both lessons migrated pixel-identically: smoke frames plus ten driven states (presets, weights, a selected edge, a cycle, two-colouring; feature branch, 1 and 4 shards, a broken test, fail-fast). graph-representations' Tab path to the quiz went from 78 stops to 24 (L-7): the graph and the adjacency matrix are one stop each.
`
`### Smaller pieces
`- `useMediaQuery(query)` and `PHONE_QUERY` (`components/useMediaQuery.ts`): for layout choices CSS can't make (ByteGrid's bytes per row). SSR-safe (`useSyncExternalStore`).
`- `arrowMarkerDef(id, color, size, refX)` (`ArrowMarker.tsx`): one `<marker>` element, for a set of them under one `<defs>`. `useArrowMarker` is built on it.
`- `fakeSecret(...parts)` (`core/fakeSecret.ts`): joins an example credential from pieces so no source line holds a credential-shaped literal (secrets-management, auth-sessions-jwt, and secretScan's own fixtures). Every value built with it is fake; the secretScan test checks the repo for strays.
`
`## Tier 2 kit (rollout plan P0-b)
`
`Built before the wave 2-4 lessons that need them. Every visual is on `#/dev/kit` under "Tier 2 kit · P0-b"
`(`pages/DevKitTier2b.tsx`), checked at 1440 and 390. CSS is in `kit.css`; the pure logic sits in a `.ts`
`file with Vitest tests beside it. Motion is CSS transitions, or motion with `useReducedMotion`, so reduced motion stills all of it.
`
`### `core/gantt.ts`, `GanttLanes.tsx` — cpu-scheduling, interrupts-context-switch, async-await-coroutines, http-versions, critical-rendering-path, rendering-strategies, orm-n-plus-one, graphql, timeouts-deadlines, serverless-cold-starts, realtime-transports, core-web-vitals, signals-graceful-shutdown, profiling-flame-graphs; ci-pipelines
````tsx
`<GanttLanes
`  lanes={[{ id: 'p1', label: 'P1' }, …]}
`  bars={[
`    { id: 'a', lane: 'p1', start: 0, end: 4, tone: 'info', label: 'P1' },          // work (solid)
`    { id: 'w', lane: 'p2', start: 0, end: 4, tone: 'violet', kind: 'wait' },        // hatched: ready, not running
`    { id: 'io', lane: 'p2', start: 7, end: 15, tone: 'violet', kind: 'blocked' },   // dashed: blocked on I/O
`    { id: 'j', lane: 'build', start: 12, end: 40, tone: 'hi', progress: 0.4, ring: 'violet' }, // 40% drawn over a dashed plan; outlined
`  ]}
`  domain={[0, 20]} now={clock} unit=" ms" axis size="md"
`  markers={[{ at: 18, label: 'deadline', tone: 'bad' }]}
`  onBarClick={(id) => …} labelWidth={92} ariaLabel="…"
`  labelMinPx={barLabelPx('Big')}                                                    // thinner bars drop their (clipped) label
`/>
`barGeometry(start, end, domain, progress)   // { left, full, shown } in % of the track
`domainFraction(t, domain)                   // clamped to [0, 1]: where the cursor sits
`ganttTicks(domain, count)                   // [{ value, at }] from core/scale
`barLabelPx(text)                            // px a bar needs to show `text` unclipped (cpu-scheduling: the longest job name)
`spreadLabels([{ x, w }], gap)               // px shifts that keep centred labels apart; GanttLanes uses it for marker labels
````
`- **work vs wait vs blocked:** `work` (solid) is running. `wait` (hatched) is *ready*: it could run right now and is waiting its turn, e.g. in a ready queue. `blocked` (dashed outline) *can't* run until something else happens: I/O, a lock, a timer. A thread waiting for a disk read is `blocked`, not `wait`.
`- Marker labels that would overlap (dhcp's T2 and end on a narrow clock) are nudged apart, measured in the browser; labels that fit don't move.
`- A bar that begins before the domain is clipped at the left edge of the track (`barGeometry` clamps `left` to 0 and cuts the width and `progress` share by what is outside); one that ends before the domain draws nothing. Pass the real start and end: no hand clamp to `domain[0]` (cache-stampede and autoscaling had one).
`- `labelMinPx`: a bar drawn narrower than this drops its label (it stays the tooltip and accessible name) instead of showing a clipped one.
`- Positions are percentages, so it stretches to its container. When bars get too thin on a phone, wrap it in a `WideRegion` (cpu-scheduling uses `minWidth={480}`). `size="sm"` is 12px tracks (dense, no labels) and `md` is 20px with room for bar labels. A bar with no `tone` draws nothing, which is how a job that hasn't started looks (pair it with `progress` to show its dashed plan).
`- The `now` cursor and markers span only the lanes, never the marker or axis label rows, and clicks pass through them to the bars. Bars are `<button>`s when `onBarClick` is set.
`- `motionId` on a bar: bars sharing one are the same thing in different places. A bar element that wasn't drawn last render starts where its motionId was last drawn and glides there (a 450ms Web Animations FLIP; skipped under prefers-reduced-motion, like the CSS transitions). greedy-algorithms' booked lane: each booking slides down from its meeting's row.
`- `minPx` on a bar draws it at least that many px wide from its start, so a 20 µs deopt on a millisecond axis
`  stays visible; its tooltip and name still carry its real span. interpreters-compilers-jit draws deopt bars at 4px.
`- ci-pipelines renders its wall-clock chart through it (it adds only `.ci-gantt .gantt { margin-top: 8px }`). The migration is pixel-identical: its smoke frames plus a driven matrix of 8 option combos × 5 frames × 1440/390, 80/80 unchanged.
`
`### `core/sequenceLayout.ts`, `SequenceDiagram.tsx` — dhcp, ethernet-arp, dns-resolution, diffie-hellman, packet-capture-debugging, http-caching, idempotency-keys, webhooks, mfa-passkeys, csrf-cookies, sockets-api, realtime-transports
````tsx
`<SequenceDiagram
`  actors={[{ id: 'alice', label: 'Alice', tone: 'info' }, { id: 'eve', label: 'Eve', waiting: true }, { id: 'bob', label: 'Bob' }]}
`  messages={[
`    { id: 'd', from: 'laptop', to: '*', label: 'DHCPDISCOVER' },                 // broadcast: a head on every other lifeline
`    { id: 'a', from: 'server', to: 'laptop', label: 'DHCPACK', lost: true },      // stops partway with a ✕
`    { id: 'r', from: 'laptop', to: '*', label: 'DHCPREQUEST', note: 'after a 4 s timeout' },
`    { id: 's', from: 'laptop', to: 'laptop', label: 'configure the interface' }, // self-message loop
`    { id: 'p', from: 'laptop', to: ['relay'], broadcast: true, label: 'DHCPDISCOVER' }, // a broadcast only these lifelines hear (dotted)
`    { id: 'f', from: 'server', to: ['a', 'b'], label: 'update' },               // fan-out: plain line, a head on each
`  ]}
`  step={player.frame.index}           // later messages hidden; the current one is --hi
`  currentStyle="tone"                 // optional: the current message keeps its tone, on a --hi band (dns cache hits stay green)
`  fit="shown"                         // optional: height follows the step instead of reserving room for every message
`  onMessageClick={(id) => …}          // Enter/Space too
`  width={640}                         // spread the lanes (never below the natural width)
`/>
`sequenceLayout(actors, messages, width?, { wrapNotes? })  // { width, height, lanes, head, rows, lifelineEnd, minWidth }
`receivers(actors, message)                 // the actor ids a message reaches ('*' = all but the sender)
`shownExtent(layout, shown)                 // { lifelineEnd, height } for fit="shown"
`pickLayout(roomy, compact, containerPx)    // the roomy/compact choice SequenceDiagram makes
`wrapLabel(label, maxW)                     // one line, or two balanced lines split at a space
````
`- Labels wrap to two lines before the lanes widen. Notes stay on one line (widening the lanes) while that drawing renders at `ROOMY_MIN_SCALE` (85%) or more of its size in its container; narrower than that (a phone) they wrap to two lines too. SequenceDiagram measures its container and picks; desktop drawings look as they always did.
`- A self-message on the last lifeline gets extra right margin for its label (wrapped to two balanced lines) instead of running off the drawing.
`- The diagram sits in a `WideRegion` at `layout.minWidth`, the narrowest container where its smallest text still renders at 8px or more: the 12px labels, or the 11px notes (`SEQ.NOTE_FONT`) when any message has a `note`, so a diagram with notes is never under 8px and needs no wrapper (the old `PhoneLadder` / `core/ladderWidth` are gone). Three actors with short labels fit a 390 phone, and five scroll (see the DNS demo).
`- Under the SVG, a screen-reader-only list of the messages shown so far ("Laptop to everyone: DHCPDISCOVER", "Laptop to Relay (broadcast): …").
`- Example addresses in network demos come from the documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32) or RFC 1918 ranges.
`
`### `MemoryMap` (`components/memory/`) — calling-conventions, memory-safety-bugs, endianness, isa-assembly, virtual-memory-paging, linking-loading
````tsx
`import { MemoryMap, MemoryMapGroup, memCellRect, memPort, memRegionRect, memoryMapLayout, RefArrow } from '../../components/memory';
`
`<MemoryMap
`  regions={[
`    { from: 0x7fe0, to: 0x8010, label: 'greet() frame', tone: 'info' },            // [from, to): `to` is one past the end
`    { from: 0x7ff0, to: 0x7ff8, label: 'canary', tone: 'orange', variant: 'guard' }, // live (default) | freed | guard
`  ]}
`  cells={[{ addr: 0x8008, value: 'return → main+42', tone: 'violet' }]}
`  pointers={[{ addr: 0x7fe0, label: 'rsp', tone: 'hi' }]}
`  unit={8}                 // bytes per row: 1, 8, 4096 (pages)…
`  direction="down"         // down: high addresses on top (default); up: low on top
`  highlight={[0x7ff0]} highlightTone="orange"   // or a cell's own { addr, value, ring: 'bad' }
`  overlay={(L) => <RefArrow from={memPort(L, 0x600000, 'right')!} to={memPort(L, 0x603000, 'right')!} dangling bend={-40} />}
`/>
`// inside a lesson's own scene, beside VarSlots and HeapObjects:
`const L = memoryMapLayout(props);   // same props → same rows
`<MemoryMapGroup at={at} {...props} />
`<RefArrow from={slotPort(slotAt)} to={memCellRect(L, addr, at)!} />
````
`- Rows are drawn only where they matter: region ends, cells, pointer targets, and every row of a region up to 12 rows long. A longer empty run collapses into one "⋮" gap row, so a process image from 0x400000 to 0x7ffd… fits. More than 400 rows is refused: use a bigger `unit`.
`- Columns are sized to their content (address digits, the longest value, the longest region label at its nesting depth); `width` stretches the cell column. A 24px link gutter between the cells and the brackets is where arrows between two cells bow (a negative `bend` heads right).
`- Unused columns collapse: omit `pointers` and there is no pointer column (pass `[]` to keep it, so the width holds steady while a pointer comes and goes); with no regions there are no brackets and no link gutter (virtual-memory-paging's RAM column: the scene went from 940 to 810 wide and fits a 768 tablet).
`- Rings: `highlight` rings in --hi, or `highlightTone`; a cell's own `ring: Tone` rings it in that tone regardless.
`- Pointers at the same row stack their tags (12px apart, centred on the row) beside one arrowhead in the first pointer's tone: calling-conventions shows `rsp` over `rbp` when they're equal (it used a combined "sp=bp" label). `L.pointerRows` is the tested layout.
`- Region labels sit on their band's first row, but where regions nest the deepest are placed first and an outer region whose first row is already labelled moves its label to the next free row of its band (`band.labelY`), so a frame's name doesn't print over its first slot's.
`- A region inside another gets `depth` 1 and its bracket steps inward. A cell is tinted by its innermost region; a cell's own `tone` is stronger. `freed` is hatched with struck values, and `guard` has a heavy border.
`- Ports: `memPort(L, addr, 'left' | 'right', at)`, `memCellRect(L, addr, at)` (a RefArrow `to`), `memRegionRect(L, i, at)`, `rowAt(L, addr)`. `memPort`, `memCellRect` and `rowAt` return null for an address off the map.
`- memory-safety-bugs is payload-free: the overflow demo is a name too long for its buffer, nothing more.
`
`### `core/automata.ts` — dfa-nfa, lexing-tokens; later regex-engines
````ts
`const dfa: Dfa = { kind: 'dfa', states, alphabet, start: 'r0', accept: ['r0'], delta: { r0: { '0': 'r0', '1': 'r1' }, … } };
`const nfa: Nfa = { kind: 'nfa', …, delta: { s: { [EPSILON]: ['p', 'q'] }, p: { a: ['r'] } } };
`dfaStep(dfa, state, 'a')          // next state, or null: a missing transition means "dies"
`dfaRun(dfa, input)                // { path: (State | null)[], accepted }
`epsilonClosure(nfa, states); nfaStep(nfa, states, 'a'); nfaRun(nfa, input)   // sorted state sets
`accepts(dfaOrNfa, input)
`subsetConstruct(nfa)              // { dfa, rows: SubsetRow[] (discovery order, isNew), members: name → NFA states }
`subsetName(['0', '1'])            // "{0,1}"; "∅" for the empty set (only present when reachable)
`longestMatch(dfa, input, from)    // { end, state, steps } | null: maximal munch; steps counts the char that killed it
`delta: { cmt: { a: 'cmt', …, [OTHER]: 'cmt' } }   // OTHER: any symbol OUTSIDE the alphabet (é, emoji halves); in-alphabet symbols never take it
`edgesOf(dfaOrNfa)                 // { from, to, symbols[] }[]: one arrow per pair, symbols in order ε, alphabet, OTHER
````
`- `OTHER` lets a lexer keep a finite alphabet and still say "anything but newline": explicit arrows for the alphabet minus `
``, plus `[OTHER]`. lexing-tokens uses it instead of rewriting the source first. It's DFA-only.
`- Draw the machines with `GraphView` state mode. Minimisation is deliberately left out (T3 chomsky-hierarchy). Tests compare the subset DFA with the NFA and with a JS RegExp on every string up to length 10.
`
`### `core/automata.ts` PDA half, `core/tm.ts`, `TapeStrip.tsx`, `parseRows` — K3-17: turing-machines, halting-problem, pushdown-automata, chomsky-hierarchy
````ts
`// PDA (core/automata): a move pops ONE stack symbol and pushes a string, top first; the stack is a string, top at index 0
`const pda: Pda = { kind: 'pda', start: 'q0', bottom: 'Z', accept: ['qf'], rules: [{ from: 'q0', read: 'a', pop: 'Z', to: 'q0', push: 'AZ' }, { from: 'q0', read: '', pop: 'Z', to: 'qf', push: 'Z' } /* '' = ε */] };
`pdaStart(pda)                              // { state, pos, stack: 'Z' }: a configuration is (state, input read so far, stack)
`pdaMoves(pda, input, config)               // every configuration one rule away (non-determinism lives here)
`pdaStep(pda, input, configs)               // one move of a whole SET: de-duplicated, sorted, dead ones gone
`pdaRun(pda, input, { maxConfigs, accept })  // { status: 'accepted' | 'rejected' | 'budget-exhausted', levels: PdaConfig[][], explored }; accept 'final-state' (default) | 'empty-stack'
`// Turing machine (core/tm): tape is a sparse Map (blank '_' unset), unbounded both ways; halting states default to halt / accept / reject
`const tm = parseTmTable('q0 1 -> 0 R q0\nq0 _ -> 1 S halt');   // { ok: true, value: Tm } | { ok: false, error: 'Line 2: …', line }
`tmStart(tm, '1011'); tmStep(tm, config)    // { status: 'moved', config, rule } | { status: 'halted' | 'stuck', config }; pure
`runTm(tm, '1011', { maxSteps: 5000 })      // { status: 'halted' | 'stuck' | 'budget-exhausted', steps, config }
`tapeText(config); symbolAt(config, i)      // '1100' (first to last written cell); one cell, blank '_' anywhere
`<TapeStrip symbol={(i) => symbolAt(config, i)} head={config.head} state={config.state} changed={[prevHead]} cells={13} />
````
`- `budget-exhausted` is not a verdict: it never says "never halts" (say "did not halt within N steps"). A halting-problem certificate (a repeated configuration) is the lesson's own check.
`- `parseTmTable` refuses with the line named: a missing arrow, a wrong word count, an unknown move, a state name over 8 characters, a multi-character symbol, a rule for a halting state, a duplicate (state, symbol) ("Line 3: q0 0 already has a rule on line 1."), more than 40 rules, a line over 40 characters, an empty table. No `eval`. The row machinery is `parseRows(text, { maxRows, maxLineChars, row })` in `core/parse` (`RowParse`: every row with its line, or the first refusal); K3-22 `core/parseKit` builds on it (see the wave 7 to 8 section); `parseTmTable` is unchanged.
`- `TapeStrip` (on ArrayStrip): `cells` (default 17, odd) centred on the head, head cell lifted, blank cells dimmed, `changed` indices in --ok, the head marker labelled with `state`. It is ONE tab stop: Left/Right pan the view, Home or Escape recentre, and any head move recentres; a head panned off screen shows a hint. Pure window rules are in `components/tapeWindow.ts`.
`- Tests: balanced brackets, a^n b^n and w wᴿ (the guess) PDAs against closed-form oracles on every string up to length 10; the spec's increment and palindrome tables (every string up to 10 bits / length 10, hand-pinned step counts 8, 8, 3, 10, 21), an a^n b^n machine, loops stopped at the budget, `runTm` against an independent array simulator on 500 seeded random 4-state tables. Demo on `#/dev/kit`.
`
`### `core/ipv4.ts` — subnetting-cidr, ethernet-arp, dhcp
````ts
`parseIPv4(' 192.168.1.10 ')       // FieldParse<number>: { ok, value: 0xc0a8010a } or { ok: false, error } with the reason
`parsePrefix('24'); parseCidr('10.0.0.0/8'); parseCidr('10.0.0.1', 24)   // fallback prefix when there's no slash
`ipv4('192.168.1.1')               // a lesson-authored literal → number; throws RangeError on a typo (never learner input)
`ipToString(0xc0a8010a)            // '192.168.1.10'
`maskOf(24); wildcardOf(24); blockSize(24)              // 0xffffff00, 0xff, 256 (/0 handled: no `<< 32`)
`networkOf(a, 24); broadcastOf(a, 24); contains(net, 24, a)   // unsigned throughout
`IPV4_BITS; IPV4_MAX_INPUT         // 32; 40 (text longer than this is refused as far too long)
````
`- Parsing is strict on purpose: exactly four parts of 0-255, no leading zeros (some tools read `010` as octal), no shorthand like `10.1`, and every refusal says why.
`- Tests compare masks, network, broadcast and membership with a no-bitwise reference at every prefix over thousands of seeded addresses, and round-trip text for every octet value. check-tokens flags a local `parseIPv4`/`ipToString` or `0xffffffff <<` in a lesson.
`- Block-level maths a lesson draws (host range, /31 and /32 semantics, splitting, summarising) stays in subnetting-cidr's model until a second lesson needs it.
`
`### `core/vec.ts`, `core/fit.ts`, `core/fixtures/datasets.ts` — vectors-similarity, matrices-transformations, gradient-descent, linear-logistic-regression, supervised-learning, classification-metrics, decision-trees-ensembles, clustering-kmeans, embeddings, usability-laws, rasterization, bezier-interpolation
````ts
`dot(a, b); norm(a); cosine(a, b) /* NaN for a zero vector */; add; sub; scale(a, k); distance; normalize /* null for zero */
`matMul(a, b); apply(m, v) /* m·v */; transpose; identity(n); det(m) /* 2×2, 3×3 */; rotation2(rad)
`solve(A, b) /* partial pivoting; null if singular */; inverse(m) /* null if singular */; conditionNumber(m) /* κ₁ */
`leastSquaresQR(A, b)   // Householder QR: { x, rDiag, conditionEstimate } | null (rank deficient); never forms AᵀA
`
`leastSquares(xs, ys, degree, { lambda })  // { coeffs (constant first), condition, illConditioned } | null; ridge leaves the intercept alone
`polyEval(coeffs, x); sigmoid(z); mse(pred, actual); logLoss(probs, labels)   // probs clamped by LOG_LOSS_EPS
`linearPredict(params, x)                  // params = [b, ...w]
`mseGradient(params, xs, ys); logLossGradient(params, xs, labels); gradientStep(params, grad, rate)
`numericGradient(f, params)                // central differences: the check that a gradient is right
`
`blobs({ seed, centers, n, spread }); moons({ seed, n, noise })   // { x, y, label }[]: Plot2D Points take them as they are
`lineWithNoise({ seed, n, slope, intercept, noise, xRange })     // { x, y }[]
`twoClassScores({ seed, positives, negatives, separation })      // { score ∈ (0,1), label }[], sorted by score
`gaussian(rnd)                                                   // Box–Muller from a mulberry32
````
`- `leastSquaresQR` keeps the digits the normal equations lose (their κ is κ(A)²): a degree-12 polynomial on 15 points solves where `solve(XᵀX, …)`'s absolute 1e-12 pivot calls it singular. Null means rank deficient (fewer rows than columns, or some |Rᵢᵢ| ≤ max(m, n)·ε·max |Rᵢᵢ|). For ridge, append √λ·eⱼ rows with target 0 for each penalised column. supervised-learning fits through it; `core/fit` `leastSquares` still uses the normal equations.
`- Every curve an ML lesson draws comes from these numbers. Same seed, same data. Tests cover the hand-computed 3-point fit, closed-form regression, ridge against the explicit inverse, both gradients against finite differences, and gradient descent converging to least squares.
`
`### `ConfusionMatrix.tsx` (+ `core/stats.ts` metrics) — conditional-bayes, classification-metrics, decision-trees-ensembles
````tsx
`<ConfusionMatrix tp={90} fp={45} fn={10} tn={855} labels={{ positive: 'sick', negative: 'healthy' }}
`                 highlight="fn" share metrics />
`classificationMetrics({ tp, fp, fn, tn })   // { precision, recall, specificity, fpr, accuracy, f1 }: NaN when undefined, never a made-up 0
`confusionAt(examples, threshold)            // counts; score ≥ threshold predicts positive
`CONFUSION_TONE                              // { tp: 'ok', tn: 'ok', fp: 'bad', fn: 'orange' }: reuse it for legends and dots
````
`- A real `<table>` (rows are the actual class, columns the prediction). Undefined metrics show as `–`. `.sr-only` (in `kit.css`) gives each cell its full name for screen readers. It's the shared visually-hidden class: use it rather than a local one.
`
`### `crypto.ts` additions — mfa-passkeys, macs-hmac, webhooks, symmetric-ciphers, digital-signatures-pki; hashing-encryption
````ts
`hmac(key: BufferSource, data: BufferSource, { hash: 'SHA-1' | 'SHA-256', out: 'hex' | 'bytes' })
`hotp(key, counter, { digits = 6, hash = 'SHA-1' })      // RFC 4226
`totp(key, unixSeconds, { step = 30, digits, hash })     // RFC 6238: what authenticator apps show
`aesBlockEncrypt(key, block16)                           // one bare AES block = what ECB does to every block
`ecdsaKeyPair(); ecdsaSign(privateKey, data); ecdsaVerify(publicKey, sig, data)   // P-256 / SHA-256; signature = 64 bytes r‖s
````
`- Everything resolves to null without `crypto.subtle`, like the rest of `crypto.ts`. `hmacSha256` now runs on `hmac`, with unchanged output. hashing-encryption signs through the ECDSA helpers.
`- `aesBlockEncrypt` uses AES-CBC with a zero IV and keeps the first 16 bytes. WebCrypto has no ECB, so that's the only way to get it. It exists to show why ECB leaks patterns, never to encrypt anything.
`- Tests: RFC 4231 and RFC 2202 HMAC, RFC 4226 HOTP, RFC 6238 TOTP (SHA-1 and SHA-256), FIPS-197 C.1 and C.3, and ECDSA with one flipped byte failing in the message and in the signature. Test keys are the published RFC ones; nothing in source has a real credential shape (K-3 scan).
`
`## Tier 2 kit (wave 3→4 kit round)
`
`Showcased on `#/dev/kit` under "Tier 2 kit · wave 3→4" (`pages/DevKitTier2c.tsx`).
`
`### `ColorField.tsx`, `core/contrast.ts` (K-21) — accessibility, color-spaces
````tsx
`<ColorField label="Text colour" value={fg} onChange={setFg} />   // native colour input, its label, and the #rrggbb beside it
````
````ts
`contrastRatio('#777', '#fff')   // 4.478…: (L1 + 0.05) / (L2 + 0.05), lighter over darker, 1 to 21; order doesn't matter
`formatRatio(r)                  // '4.48:1'; never rounds a failing ratio up onto a threshold (4.496 → '4.49:1')
`grade(r)                        // { aaNormal, aaLarge, aaaNormal, aaaLarge } against THRESHOLDS (AA 4.5 / 3, AAA 7 / 4.5)
`luminance([r, g, b])            // WCAG 2.x relative luminance of 0..255 channels (the published 0.03928 knee)
`parseHex('#abc')                // [170, 187, 204]; 3- or 6-digit
````
`- Moved unchanged from the accessibility lesson, which now uses both (pixel-identical). Styles live in
`  `components/colorField.css`, loaded globally from `main.tsx`.
`- Tests: the lesson's contrast tests, plus the published figures: white 1, black 0, each primary its own
`  coefficient, the 0.03928 knee, and #767676 4.54, #595959 7.00, blue 8.59 and red 4.00 on white.
`
`### `crypto.ts`: `hexToBytes`, raw AES-CBC — symmetric-ciphers, macs-hmac, digital-signatures-pki
````ts
`hexToBytes('00ff7fa0')                 // Uint8Array [0, 255, 127, 160]; either case; '' → empty; odd length or non-hex throws RangeError
`AES_BLOCK                              // 16
`aesCbcRawEncrypt(key, iv, data)        // CBC on whole blocks, no padding: output is exactly data.length bytes
`aesCbcRawDecrypt(key, iv, ct)          // the inverse; a tampered ct decrypts to garbled bytes, never a padding error
````
`- WebCrypto's AES-CBC always applies PKCS#7. Encrypt drops the extra padding block it appends to
`  block-aligned input; decrypt appends one block that decrypts to valid padding (AES(PAD ⊕ last block),
`  possible because we hold the key). Both throw RangeError on partial blocks and resolve to null without
`  `crypto.subtle`. For lessons showing the mode itself, never for real data (no padding, no MAC).
`- Tests: SP 800-38A F.2.1/F.2.2, a flipped bit garbling its block and flipping the same bit in the next,
`  empty input, partial-block refusal; hexToBytes round-trips all 256 bytes through `toHex`.
`
`### `core/paint.ts` — diffie-hellman, tls-handshake
````ts
`equalMix(['var(--amber)', 'var(--sky)'])   // 'color-mix(in oklab, var(--amber) 50%, var(--sky))'
````
`- Equal parts of every colour as one real CSS colour (the k-th joins at 1/(k+1)). Pass the colours in a
`  canonical order (the lessons sort their parts first), so the mix depends only on which paints went in.
`  Both lessons' paint-mixing analogies use it; their exact colour strings are unchanged (asserted in their tests).
`
`## Tier 2 kit (wave 4→5 kit round)
`
`Plot2D, CellGrid, Button, CodePanel, MemoryMap, GanttLanes, CallStackPanel and ArrayStrip additions are
`documented in their own sections above.
`
`### `core/x86.ts` — isa-assembly, calling-conventions
````ts
`const program = assemble(listing.lines, BASE, endOffset);   // Intel-syntax lines (labels, offsets) → instrs, lineOf, labels
`let cpu = startCpu({ rip: entry, rsp: 0x7ff0, regs: { rdi: 6n, rsi: 4n }, called: true }); // bigints; called pushes RETURN_TO_CALLER
`const { cpu: next, effect } = step(program, cpu);            // one instruction: what it read/wrote, flags it set, the branch taken
`const { cpus, effects } = runToEnd(program, cpu);            // every state, up to STEP_LIMIT
`signed(v, 32); unsigned(v, 8); hex(v); CONDITIONS.jg.test(flags)
````
`- A tiny interpreter for lesson-authored listings, not an emulator: only the instructions the lessons use,
`  the flags ZF SF CF OF, and byte-addressed little-endian memory, following the Intel SDM (32-bit writes
`  zero-extend; 8/16-bit writes merge). Moved unchanged from isa-assembly, which carried a byte-identical copy
`  in calling-conventions pinned by a test; the copy and the pin test are gone, the behaviour tests moved to
`  `core/x86.test.ts`. Both lessons' frames are unchanged.
`
`## Tier 3 kit (kickoff kit round: Agent A)
`
`### `Provenance` (`components/ui.tsx`, `kit.css`) — K3-7; every domain-reviewed (**D**) Tier 3 lesson
````tsx
`<Provenance kind="simulated" seed={42}>seeded fault schedule</Provenance>
`<Provenance kind="from-memory">what EXPLAIN prints on Postgres</Provenance>
`<Provenance kind="real">crypto.subtle, run in your browser</Provenance>
````
`- `kind`: `simulated | illustrative | toy | scripted | from-memory | not-run | real`. The kind's name is printed
`  as a small uppercase label ("toy model", "shown, not run"), so the meaning never rides on colour alone.
`  `children` is an optional short note; `seed` prints a seeded sim's seed after it.
`- Always muted: text is `--muted` for every kind, never `--bad`/`--ok` (provenance is not a verdict). Only
`  `real` has a solid border; the others are dashed. Wraps inside its container, so it holds at 390px.
`- Use it at the moment the claim matters (next to the output, the plot or the caption), not in a footnote
`  (AC-0/T3 #21). `real` means real: real `RegExp`, `crypto.subtle`, real SQLite; anything else is one of
`  the other six.
`- The Tier 3 content lint (`core/lessonContentT3.ts`) fails a **D** lesson whose source has no `<Provenance`.
`  The chip renders `data-provenance="<kind>"`, the hook for tests that want the chip's kind.
`- Showcase: `#/dev/kit`, "Tier 3 kit".
`
`- `kind="invented"` ("invented") is for scenarios, dialogues and case studies the author made up; the lead
`  lessons put it on every one (AC-0/T3 #24). The kinds and labels live in `core/provenance.ts`.
`
`### `ProvenanceRow` (`components/ui.tsx`, `kit.css`) — cap-theorem, replication, isolation-levels, load-balancing, observability, event-sourcing; every **D** lesson after them
````tsx
`<ProvenanceRow>
`  <Provenance kind="simulated" seed={TRAFFIC_SEED}>seeded random requests</Provenance>
`  <Provenance kind="illustrative">server speeds are made up, not measured</Provenance>
`</ProvenanceRow>
````
`- The wrapping row of chips under a stage's visual: `display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px` (class `provenance-row`, in `kit.css`). One row per stage; it takes `Provenance` and `ClaimLabel` chips.
`  Don't give it a lesson class (`xx-prov`): the six lessons that each styled their own identical copy (`cap-prov`, `rep-prov`, `iso-prov`, `lb-prov`, `ob-prov`, `es-prov`) use it now and those rules are gone.
`  Their stage shots are pixel-identical.
`
`### `ClaimLabel` (`components/ui.tsx`, `kit.css`) — design-docs-rfcs, technical-debt (T3-B2), the lead lessons in T3-B31
````tsx
`<ClaimLabel kind="research">named study, from memory</ClaimLabel>
`<ClaimLabel kind="view" />
````
`- `kind`: `standard | research | practice | view | theorem`, printed as "standard", "research finding", "common practice",
`  "one view", "theorem (argued, not run here)". Separates opinion from evidence on screen (AC-0/T3 #24): label every claim in a non-technical lesson.
`- Same muted chip as `Provenance` (never `--bad`/`--ok`); the border style (solid, double, dashed, dotted, groove) is a
`  second cue next to the printed label. `role="note"` with `aria-label="research finding: <text>"` (the
`  visible pieces are `aria-hidden` so it isn't read twice); a note that isn't a plain string is read as the kind alone.
`- Tests: `core/provenance.test.ts` pins the kinds, distinct labels, the data hooks and the aria text.
`- **`kind="theorem"` (K4-8, AC-0/T4 #27)**: a theorem-shaped statement the lesson argues but does not run (FLP, 3f + 1, the
`  2-approximation, perfect secrecy, soundness). `children` names the result: `<ClaimLabel kind="theorem">FLP: no deterministic protocol decides under one crash</ClaimLabel>`.
`  Use it only where no exhaustive or seeded check of the statement ran on the page; a checked statement says what was checked and its bound instead.
`  Existing kinds are unchanged; the new one only adds a `.claim-label.is-theorem` rule (groove border) and a map entry. Users: flp-impossibility, byzantine-faults, np-reductions,
`  approximation-algorithms, secret-sharing, zero-knowledge-proofs, plus linear-programming, online-algorithms, game-theory. Showcase: `#/dev/kit`, the ClaimLabel row of "Tier 3 kit · kickoff".
`
`### `core/lessonContentT3.ts` — the Tier 3 content lint (K3-T2)
````ts
`lintTier3Lesson(lesson, { domainReview, source, tryThisTests })  // → { rule, detail }[]
`unscopedAbsolutes(text); tryThisTestNumbers(testSource); DOMAIN_REVIEW_IDS
````
`- Runs from `lessonContent.test.ts` on Tier 3 lessons only (the 12 pre-AC-0/T3 lessons are in
`  `TIER3_AWAITING_RETROFIT` there until T3-R1/R2 remove them; the 255 earlier lessons are untouched).
`  `source` is the lesson folder's non-test source, `tryThisTests` the `try-this N:` numbers from its tests.
`  `unscopedAbsolutes(text, extraScope?)` takes an optional second scope regex (Tier 4's theorem wording); without it nothing changed. `isAllowed` and `withoutComments` are exported for Tier 4.
`
`### `core/lessonContentT4.ts` — the Tier 4 content lint (T4-T2, AC-0/T4)
````ts
`lintTier4Lesson(lesson, { id, domainReview, source, tryThisTests, testSource })  // → { rule, detail }[]; wraps lintTier3Lesson
`DOMAIN_REVIEW_IDS_T4 (38 = the 29 D rows of tier4-plan §2 + the 9 retrofits); PROOF_SHAPED_IDS (8); LEAD_IDS (7); REQUIRED_CHIPS; THEOREM_SCOPE; manipulationTestNumbers(testSource)
````
`- Rules, each failing on a planted fixture in `lessonContent.test.ts`: the Tier 3 three (`absolutes` now also scans `summary.tldr/what/why/analogy` and accepts theorem wording such as "assuming", "theorem", "within the horizon"; `provenance`;
`  `try-this-tests`) plus `chip-required` (the kinds `REQUIRED_CHIPS[id]` names, and a `kind="real"` chip wherever the source uses `crypto.subtle` or `core/crypto`), `claim-label` (lead lessons: a `<ClaimLabel`, and a `<ScenarioStory`
`  needs `claimOf=` or `notes=`), `no-clock-or-random` (`Math.random`, `Date.now`, `performance.now`, `new Date` in non-test source; `// allow-random: <reason>` on the line), `fresh-array-hook` (`usePlayer(...)` or `introKey={...}`
`  given an array literal, a `?? []` fallback or a direct call other than `useMemo`/`String`/`JSON.stringify`/`.join`; `// allow-fresh: <reason>`), `pinned-seed-zero` (a `BROKEN_SEED`, `FAILING_SEED`, `LOWEST_*SEED*` or
`  `COUNTEREXAMPLE_*SEED*` constant equal to 0 in source or tests, unless the line says `allow-seed-zero: <reason with the fail count>` or the lesson declares a `*_WITNESS*` constant: decisions §3 witness clause),
`  `seed-visible` (`createCluster`, `createTickSim` or `mulberry32` with no `seed=` prop and no `<SeedField`; `// allow-no-seed: <reason>`) and `manipulation-tests` (a `PROOF_SHAPED_IDS` lesson needs two distinct `manipulation N:` tests).
`- Wiring in `lessonContent.test.ts`: a `TIER_LINT` table loops tiers 3 and 4 over one evidence builder. The nine retrofits sit on `TIER4_AWAITING_RETROFIT` (also in `PENDING_RETROFIT`, so the tier-wide quiz-longest share does not count them);
`  `TIERS_AWAITING_KICKOFF` is empty and the tier share test waits for `MIN_QUESTIONS_FOR_SHARE` = 30 counted questions (the per-lesson `quiz-longest` rule applies from the first commit). A retrofit batch removes its lessons from BASELINE,
`  `TIER4_AWAITING_RETROFIT` and `PENDING_RETROFIT` together. `core/testing/tier4Plan.ts` parses the plan's §2 table (test-only) and pins `DOMAIN_REVIEW_IDS_T4` and the 41 registered topics to it.
`- **absolutes**: "never, always, every, all, only, must, guaranteed, most, typical(ly)" in a `keyIdeas` entry or
`  a quiz `why`, in a sentence with no scope phrase ("in this model", "by default", "unless", "except",
`  "in current …"). Exempt a string by putting `// allow-absolute: <reason>` on the source line where the
`  string starts (the same-line convention `allow-color` uses); the reason must be non-empty.
`- **provenance**: a lesson in `DOMAIN_REVIEW_IDS` (the 86 **D** rows) whose source has no `<Provenance`
`  outside a comment. It checks the lesson folder, not the Stage render, so it proves the chip is
`  written, not that it is on screen at every scene (AC-0/T3 #26 still covers that by eye).
`- **try-this-tests**: every `tryThis` entry N needs a test named `try-this N: …` (`it` or `test`).
`- Tests that pin code to the plan read `core/testing/tier3Plan.ts` (`tier3PlanRows`), which is empty, and the
`  tests skip, when `docs/tier3-plan.md` isn't in the tree.
`## Tier 3 kit (kickoff, agent C: distributions, tick sim, Stat sub, distSim, barAt)
`
`Demos for all of it live on `#/dev/kit` under "Tier 3 kit · distributions, tick sim, barAt, distSim".
`
`### `core/distributions.ts`, `Plot2D` Area/Steps/Band, `core/stats` ecdf/logHistogram (K3-1) — distributions, percentiles-statistics, hypothesis-testing-ab, queueing-theory, tail-latency, estimation, entropy-information, model-evals-drift, capacity-planning, benchmarking-methodology; fanout-feeds, hot-keys-skew (Zipf)
````ts
`// Samplers take an Rnd first (mulberry32(seed)): same seed, same sample.
`normal(rnd, mean?, sd?)  exponential(rnd, rate?)  lognormal(rnd, mu?, sigma?)  pareto(rnd, xm, alpha)  poisson(rnd, lambda)
`// Densities and cumulative distributions, matching each sampler.
`normalPdf/normalCdf(x, mean?, sd?)   exponentialPdf/exponentialCdf(x, rate?)   lognormalPdf/lognormalCdf(x, mu?, sigma?)
`paretoPdf/paretoCdf(x, xm, alpha)    poissonPmf/poissonCdf(k, lambda)          erf(x)
`// Zipf (rank 1 hottest): the normaliser, the pmf, and a sampler built once and drawn many times.
`harmonic(n, s?)  zipfPmf(k, n, s?)  const draw = zipfSampler(n, s?);  draw(rnd)  // rank 1..n
`quantile(sorted, p)                  // linear interpolation (type 7); core/sim `percentile` picks an element instead
`ksStatistic(sample, cdf)  ksCritical(n)   // KS distance, and the 0.1% rejection level 1.95/sqrt(n)
`ecdf(xs)  // [x, p][] step vertices, ties merged (core/stats)
`logHistogram(xs, { bins, min, max })  // like histogram(), log-spaced edges (core/stats)
````
````tsx
`<Plot2D …>
`  <Area fn={pdf} from={1.96} to={4} tone="bad" />      {/* shade a tail, a p-value, an interval; rests on base (default 0) */}
`  <Steps data={ecdf(xs)} startY={0} tone="info" />     {/* a step function; startY = level before the first point; last level runs to the right edge */}
`  <Band lo={lowFn} hi={highFn} tone="violet" />        {/* edges are numbers or fns of x; from/to limit it; a confidence band or a flat interval */}
`  <Bars bars={barsFromHistogram(h, (bin) => bin.x0 >= p95 ? 'bad' : 'info')} />   {/* per-bar tone: bin = { index, x0, x1, count } */}
`</Plot2D>
````
`- Existing `Bars` / `Curve` / `barsFromHistogram(h)` callers are untouched (`Bars` already took a per-bar `tone`; the new second argument of `barsFromHistogram` just fills it in for you). Path geometry is `core/plotAreas.ts`; Area/Steps/Band live in `components/PlotAreas.tsx` and are re-exported from `Plot2D`.
`- Accuracy: `erf`/`normalCdf` are good to about 1e-13 and keep the far tail (`normalCdf(-6)` is 9.87e-10, not 0). The Poisson sampler splits a large lambda into chunks (it is O(lambda)). Tests check each sampler's mean and variance on fixed seeds, that each pdf integrates to 1 and its cdf is the integral of the pdf, a KS check of each continuous sampler against its cdf (and that a wrong cdf fails it), Poisson and Zipf counts against their pmfs.
`- **Do not write a local Zipf or harmonic number** (fanout-feeds and hot-keys-skew both use these; AC-0/T3 #25).
`- **Kit round F extractions (K3 wave 2 to 3).** These used to live in lesson folders that other lessons imported across; never import across lesson folders for them again.
`  - `core/distributions`: `normalQuantile(p)` (bisection, exact, slow) and `fastNormalQuantile(p)` (Acklam, relative error about 1e-9, for samplers; 0 < p < 1); the four families as data: `Family`, `Dist` (`{ family: 'normal', mu, sigma } | …`), `distQuantile/distCdf/distPdf/distMean/distVariance(d, …)`, `distSample(d, rnd)` and `drawSample(d, seed, n)` (a `mulberry32(seed)` stream).
`  - `core/format`: `sig(x, digits?)` (3 significant figures, thousands separators, real minus), `pctText(share, dp?)` (0.691 → "69.1%"), `ratioText(x)` (two decimals). `pct` is the other flavour (0 decimals, '<0.1%' floor).
`  - `core/seed` + `components/SeedField`: `parseSeed(text)` (whole number 0..SEED_MAX with refusal messages), `nextSeed`, and `<SeedField seed onSeed />` (a fragment: text field, "New seed" button, refusal line that keeps the old seed) for any lesson with a seeded run. The text follows `seed` when the lesson changes it (preset, find-a-seed) with no remount, so never pass `key={seed}` or a counter key: a key remounts on every keystroke and drops focus. A typed text that still means the current seed (`042`) is kept. `resyncSeedText(text, seed)` is the pure rule; `label` renames the field.
`  - `core/queueing`: `erlangC(c, a)`, the chance an arrival waits in an M/M/c queue. `core/stats`: `nearestRank(sorted, pct)` and `nearestRankIndex(n, pct)` (the ⌈p·n⌉-th smallest, immune to the 7.000000000000001 trap).
`  - `core/testing/nodeCrypto` (tests only): `nodeDigest(alg, data, encoding?)`, `nodeHmac(alg, key, data, encoding?)`, `nodeRandomBytes(n)`, `nodeRandomBase64url(n)`; use it as the independent oracle for any hashing code, never `import('node:crypto')` by hand.
`  - `core/sha256`: `sha256(data: Uint8Array): Uint8Array`, a synchronous SHA-256 (core/crypto's `sha256Hex` is async), tested against the NIST vectors, node:crypto and crypto.subtle. Used by merkle-trees and oauth-flows (PKCE S256).
`
`### `core/simTick.ts`, `core/useTickSim.ts` (K3-2) — queueing-theory, wifi-shared-medium, autoscaling, capacity-planning, thread-pools-work-stealing, graceful-degradation, cache-stampede, fanout-feeds, simd-gpu-parallelism, benchmarking-methodology
````ts
`const sim = createTickSim<State>({
`  seed: 7,
`  init: (rnd) => ({ queue: 0 }),
`  step: (s, rnd, tick) => ({ queue: s.queue + (rnd() < 0.6 ? 1 : 0) }),   // returns the NEXT state; never mutate s
`  check: (s, tick) => (s.queue > 50 ? 'queue overflowed' : null),            // optional safety, also run on tick 0
`});
`sim.run(100)      // advance up to 100 ticks (stops at a violation); returns ticks run
`sim.at(40)        // the state after 40 ticks (runs forward if needed; a lookup if already run: scrubbing is free)
`sim.history       // [state after 0 ticks, after 1, …]   sim.ticks   sim.state   sim.violation  // { tick, message } | null
`sim.reset()       // same seed, same trace
`// In a component: fixed dt per tick, at most maxTicksPerFrame, the excess dropped (never queued).
`const live = useTickSim({ make: () => createTickSim(…), dt: 1 / 30, maxTicksPerFrame: 5, snapshot: (s) => ({ … }) });
`live.snap  live.setPaused  live.reset  live.world().sim   // useSimulation's result; world() only from handlers/effects
````
`- Wall-clock time only decides *how many* ticks run, never what they do, so a test, a frame and the live view see one trace. Once `check` fails the sim stops advancing so the counterexample stays on screen. The history is kept in memory (one state per tick): a lesson running millions of ticks should snapshot, not store. `ticksDue(carry, frameDt, dt, max)` is the pure frame-to-ticks arithmetic.
`
`### `Stat` multi-line `sub` (K3-3) — queueing-theory, percentiles-statistics, hypothesis-testing-ab, capacity-planning, tail-latency, back-of-envelope, benchmarking-methodology
``sub` takes a node (as before) or an array of nodes, drawn one line each (each wraps at 390 px): `<Stat label="p" value="0.031" sub={['95% interval 0.01 to 0.05', 'n = 400 per arm']} />`. A single node renders exactly as it always did.
`
`### `core/distSim/` — the distributed-sim harness (K3-8): physical-clocks-skew, logical-clocks, consistency-models, quorums, exactly-once-myth, leases-fencing, job-scheduling, transactional-outbox, merkle-trees, kafka-partitioned-log, change-data-capture, routing-algorithms, offline-first-sync; later gossip, paxos, flp
`**This is the enforcement point for AC-0/T3 #20.** A lesson that simulates nodes, messages, clocks or transactions runs its protocol here, injects faults here, and its test asserts a **safety** invariant after every event over N >= 200 seeds. Its "broken" mode must violate the invariant on some seed (a test names it); a staged failure the model doesn't produce is a lie. Liveness is a separate claim, asserted separately. `distSim/electionExample.ts` is the worked pattern (a broken and a fixed three-node election): copy its shape.
````ts
`import { createCluster, checkInvariants, forSeeds, toSequence, linearizable } from '../core/distSim';
`const cluster = createCluster<Msg, State>({
`  seed,
`  nodes: { a: nodeA, b: nodeB, c: nodeC },            // id → { init(ctx), onMessage(ctx, msg), onTimer(ctx, timerId), snapshot?() }
`  latency: { min: 1, max: 15 },                        // uniform ms; or (rnd, from, to) => ms, so links can be asymmetric
`  loss: 0.1, duplicate: 0.15,                          // per-message probabilities
`  clocks: [{ offsetMs: 40 }, { driftPpm: 5000 }, {}],  // per node, in declaration order
`});
`// ctx: send(to, payload), setTimer(id, localMs), cancelTimer(id), now() (the node's SKEWED clock), peers, trueNow (tests/drawing only)
`cluster.partition('a', ['b', 'c'], 20, 60);   // cut links between the groups over [20, 60]
`cluster.crash('b', 30); cluster.restart('b', 50);   // init() runs again on restart: what init resets is volatile
`cluster.pause('b', 40, 90);                    // a stalled node (GC pause): handles nothing in [40, 90), then its held messages and timers in order; its clock kept running
`cluster.dropNext((m) => m.payload.type === 'ack');   // drop the next matching send, once
`cluster.inject(10, 'a', { type: 'write', v: 1 });    // an outside client request (no network faults apply)
`cluster.randomFaults({ horizonMs: 80, partitions: 1, crashes: 1, pauses: 1 });   // seeded
`cluster.run({ until: 200 }) / cluster.step() / cluster.snapshot() / cluster.trace / cluster.localTime(node, t)
`// Safety over every step; forSeeds returns the LOWEST failing seed with the trace cut at the violation.
`const safety: Safety<State>[] = [(snap) => leaders(snap) > 1 ? 'two leaders' : null];   // null = holds
`checkInvariants(cluster, safety, { until, maxEvents })   // { ok: true, steps } | { ok: false, step, time, message, rule, trace }
`forSeeds(500, (seed) => scenario(seed), safety)          // count (seeds 0..n-1) or { from, to }; { ok: true, seeds } | { ok: false, seed, … }
`const { actors, messages } = toSequence(verdict.trace, { label, timers, events, times });   // → <SequenceDiagram> (lost messages get the ✕)
````
`- **Semantics worth knowing.** Time is simulated ms and events run in `(time, seq)` order; same seed and faults give the same trace, row for row. Network randomness (loss, latency, duplication) and `randomFaults` use separate seeded streams, and loss/duplicate/latency are always drawn per message, so changing `loss` never shifts another message's latency. A `partition` drops a crossing message that was in flight at any moment of the window (sent before `to`, arriving at or after `from`); messages inside a group are untouched. Crashed nodes drop deliveries (reason `down`) and lose timers; node state that must survive a crash lives outside `init`. Timer delays are in the node's *local* time (drift changes when they fire in true time).
`- **Trace rows** `{ id, t, kind, from?, to?, node?, msgId?, payload?, reason?, dup?, detail? }`; `kind` is `send | deliver | drop | timer | crash | restart | pause | resume | partition | heal`. `id` is the row's position: unique within a run and stable for the seed, so `` `${seed}:${row.id}` `` is a LogStream key. A message's send, deliver and drop rows share `msgId` (a duplicate copy too, with `dup: true`).
`- **Client-operation log** (`distSim/ops.ts`; cap-theorem, replication, and later consistency-models, quorums): a replica records one `OpRecord<V, N>` `{ op, kind, client, node, key?, invoke, response, outcome: 'ok' | 'refused' | 'open', value }` when a request reaches it and closes it with `settleOp(record, response, outcome, value?)` (a read's `value` is what it returned; `response` is null until it is answered or refused). `latencyOf(op)` is `response - invoke` or null. `historyOf(ops)` is the bridge to the checkers below: an answered request keeps its times, a refused or still-open *write* stays as one that never answered (`response: Infinity`, because it may have taken effect), a refused or open *read* is dropped (it told the client nothing). A lesson narrows the types (`type OpRecord = ClientOp<number, NodeId>`, or `interface OpRecord extends ClientOp<string, NodeId> { asked?: string }` for extras) and keeps its own `allOps` and stale-read helpers: how ops are ordered and what counts as stale is the lesson's claim, not the log's. Migrated pixel-identically: cap-theorem and replication (replication's `entry` field became `value`; both lessons' `latencyOf` and cap-theorem's `historyOf` moved here).
`- **Register histories** (consistency-models, quorums): record `RegisterOp`s `{ process, kind: 'write' | 'read', value, invoke, response, key? }` around client calls, then `linearizable(h)`, `sequential(h)`, `causal(h)`, `convergent(h, { settleMs })`: each returns `null` or a message, and `{ initial }` sets what a read returns before any write (default null). Strongest to weakest: linearizable (one order that respects real time) implies sequential (one order that respects each process's own order) implies causal (writes related by cause are seen in cause order; concurrent writes may be seen in different orders by different readers). `convergent` says only that, after the last write, late reads agree. At most 24 operations (the search is exhaustive, so bigger histories throw); `causal` needs each written value unique per key.
`- Self-tests (`distSim/*.test.ts`): same seed gives the same trace; partition drops exactly the crossing in-flight messages; skewed and drifting clocks differ from true time; pause holds and replays in order; asymmetric latency; a deliberately broken two-leader protocol is caught by `forSeeds` (lowest failing seed, trace cut at the violation, reproducible) and the fixed protocol passes 500 faulted seeds; each register model has a history that satisfies it but not the stronger model, and one that violates it.
`- Out of scope on purpose: nodes needing more than `send`/`setTimer`/`now`, disk models, byzantine nodes. Ask for them after wave 2.
`
`### `core/gantt.ts` `barAt` / `barsAt` (K3-10) — incident-response, postmortems, job-scheduling, etl-orchestration, mapreduce-batch, thread-pools-work-stealing, io-models, tail-latency, cache-stampede, project-planning-critical-path
``barAt(bar, now)` is `null` before the bar starts; at its start it is the bar with `progress: 0` (only the dashed plan shows); while running it is the bar with `progress = (now - start) / (end - start)`; at or after its end it is the bar untouched. `barsAt(bars, now)` maps a list and drops the not-started ones, order kept. Works on any `{ start, end, progress? }`, so a `GanttBar` fits; `GanttLanes` itself is unchanged: `<GanttLanes bars={barsAt(plan, now)} now={now} … />`.
`
`---
`
`## Tier 3 kit (kickoff round: extractions)
`
`Extractions and extensions for the Tier 3 batches (`docs/tier3-plan.md` §4), each migrating its Tier 2 source pixel-identically
`(`smoke --frames` + `diff`). Demos are on `#/dev/kit` under "Tier 3 kit · kickoff round, extractions" (`pages/DevKitTier3b.tsx`).
`The CodePanel (K3-6) and GraphView (K3-5) changes are noted in their own entries above.
`
`### `SortTh`, `useSortedRows` (K3-4) — distributed-id-generation; later api-versioning, query-planning, join-algorithms, consistency-models, authz-models, routing-algorithms, bgp, dora-metrics, kafka-partitioned-log
````tsx
`const { sorted, sort, headerProps } = useSortedRows(rows, { name: (r) => r.name, cost: (r) => r.cost }, { key: 'cost' });
`<table className="data-table">
`  <thead><tr>
`    <SortTh {...headerProps('name')}>Plan</SortTh>   // <th scope="col" aria-sort><button class="sort-btn">Plan ▲</button></th>
`    <SortTh {...headerProps('cost')}>Cost</SortTh>
`  </tr></thead>
`  <tbody>{sorted.map((r) => …)}</tbody>
`</table>
````
`- A column is a getter returning a number (compared numerically) or text (`localeCompare`, so "amy" sorts with "Bob"). The sort is **stable in both
`  directions**: ties keep the table's own order, also when reversed (`core/sortRows`: `sortRows`, `nextSort`, `sortDirection`, tested including a
`  broken-comparator case). Pressing a column sorts it ascending, pressing it again reverses it, and it keeps flipping; there is no "unsorted" third state.
`- With no third argument the rows start in table order and `sort` is null; with `{ key, ascending? }` it is never null (overloads), so
`  captions can read `sort.key`.
`- `aria-sort` is on the sorted column's `<th>` only; the ▲ / ▼ is `aria-hidden`. The heading is a native `<button>`, so Enter and Space work
`  (driven with real key presses: Tab, Enter, Tab, Space, Space ends on "Sorts by time ▼"). Keep the sorted order in the table, not in the
`  caption alone: a caption that names the order reads it from `sorted`.
`- `ui.tsx` re-exports `SortTh` in a delimited block; the hook is imported from `components/useSortedRows` (a value export from `ui.tsx`
`  trips oxlint's only-export-components). `SortTh` lives in `SortTh.tsx`. CSS: `.sort-btn` in `kit.css`. Name the generics when `initial` is
`  given (`useSortedRows<Row, Key>`), or TypeScript narrows the key type to the initial one.
`- distributed-id-generation's trade-offs table migrated: default, "Size" ascending and "Format" descending at 1440 and 390 are pixel-identical
`  (the 390 default shot differs by 0.09% between *any* two runs, caption cross-fade noise, same as two shots of the unchanged tree).
`
`### `LogStream.tsx` (`logRows.ts`) (K3-9) — structured-logging, cert-lifecycle, resource-exhaustion, dom-events, infrastructure-as-code; later incident-response, postmortems, alerting-design, change-data-capture, write-ahead-log, kafka-partitioned-log, stream-windowing, fuzzing, job-scheduling, io-models
````tsx
`<LogStream label="What has happened up to today" maxHeight={190} follow max={200}
`           rows={events.map((e) => ({ id: e.id, at: e.clock, level: e.level, tone: e.tone, source: e.service, sourceTone: 'info', text: e.text }))}
`           highlight={(row) => (query ? matches(row) : null)}   // false dims the row, true is where it scrolls to, null = nothing highlighted
`           live="polite" empty="Nothing yet." className="my-log" />
````
`- A `role="log"` region of `.log-row`s (mono, tinted by `tone`; `level` ERROR is red and WARN orange when no tone is given) with an
`  optional muted timestamp (`at`), a bold `level` and `source` (`sourceTone`), then the `text`. Wraps at 390 (`overflow-wrap: anywhere`).
`  `id` must be unique and stable (a counter, not text plus time); it is the React key and the scroll target.
`- `maxHeight` (px) makes it a scroller and a tab stop (a region that scrolls must be reachable by keyboard); without it the list just grows. `follow`
`  keeps the newest row in view until the learner scrolls up. `max` keeps only the newest rows. Newest-first logs (resource-exhaustion) pass their
`  rows reversed and leave `follow` off.
`- The region is mounted whether or not there are rows (`live` is `polite` by default, `off` for a log the learner scrubs), so the first row is
`  announced. `empty=""` shows nothing while empty. Callers that only render a log after some action (infrastructure-as-code's apply output)
`  still mount it conditionally, to keep their layout; a new lesson should mount it always.
`- `onRowClick(row)` (with `selectedId`) makes the rows selectable (io-models: click a line to see its lane): each row is a `role="button"` (click, Enter, Space; `aria-pressed` and `.is-selected` on the chosen one), the list has ONE tab stop (selected row, else the last focused, else the first; `rowTabStop`) and Up/Down/Home/End move focus (`listKeyTarget`). A selectable log is not a tab stop itself, its rows are. Without `onRowClick` nothing changes.
`- `lastRows` and `rowTone` (`logRows.ts`) are pure and tested. The lesson keeps its own mapping from model to `LogRow` (structured-logging's
`  `streamRows.ts` with `toLogRows` and `streamHighlight`, tested).
`- **Migrated pixel-identically** (frames at 1440 and 390, plus a driven click or apply): structured-logging (its local `LogStream.tsx` is gone),
`  cert-lifecycle, resource-exhaustion, dom-events (the empty note keeps the 12px margins its old `<p>` had) and infrastructure-as-code.
`  structured-logging scrolls to the first highlighted row, a secret or mask included, but not to a row the filter dimmed (it used to).
`  Its `@live` shot differs from the *baseline* by 5 to 7% but matches the unmodified tree of the same day exactly.
`- **Not migrated, and why.** cors-same-origin (`RequestScene`): an ordered `<ol>` of the steps of one request, replaced on every send, not an
`  append-only log (list semantics, no timestamps, nothing to follow); `OriginScene`'s `.log-row` is a single verdict line. kubernetes-basics'
`  `EventLog`: its heading lives inside the `role="log"` region and each tick is a bold mono prefix with its own margin, so it isn't the same row.
`  The other `.log-row` users (accessibility, browser-storage, injection-attacks, xss, mfa-passkeys, secrets-management, usability-testing...)
`  use it as a verdict or result box, not a stream. mobile-app-lifecycle's callback list has two-line rows (a bold callback name over its calls) in a
`  `<ul>`, and secrets-management's `LeakScene` is a numbered `<ol>` timeline with a current row: lists of steps with their own anatomy, not
`  timestamped streams, so they stay on plain `.log-row`. (virtual-dom's patch list, interrupts-context-switch's outcomes, poison-messages-dlq and
`  event-sourcing were only grepped, not read closely; none has `role="log"`.)
`
`### `GanttLanes` instants (K3-11) — later incident-response, postmortems, project-planning-critical-path, job-scheduling, io-models, change-data-capture, safe-config-rollout
````tsx
`{ id: 'rb', lane: 'deploys', start: 55, end: 55, tone: 'bad', label: 'rollback' }   // start === end: a diamond with its label beside it
````
`- A bar with `start === end` **and a `tone`** is an instant: an 8px diamond (`.gantt-instant`, a `<button>` when `onBarClick` is set, with the
`  label as its name and tooltip) centred on its time, with the `label` in plain text beside it (`.gantt-instant-label`, 10.5px mono, no
`  fill). `minPx` still means "draw it this wide", so a zero-length bar with `minPx` is the thin sliver it always was; a zero-length bar with
`  no `tone` still draws nothing (the plan ghost). Existing bars are untouched: all 37 GanttLanes lessons are pixel-identical at 1440 (93 deterministic frames)
`  (no existing bar had `start === end` and a tone).
`- **Label placement reuses the marker-label spreading** (`spreadLabels`), per lane, from the real widths the component already measures
`  (`core/gantt` `placeInstantLabels`, tested): a label goes right of its diamond; left when it would run past the track's end or sit on
`  another instant's diamond and the left is clear; labels that overlap are nudged apart; finally every label is pulled back inside the track.
`  The diamond itself is kept wholly inside the track (`instantX`, and a CSS `clamp`), so an instant at the very start or end of the domain stays inside.
`- `isInstant(bar)`, `INSTANT_GAP_PX`, `INSTANT_SIZE_PX` are in `core/gantt`. Instants take no `motionId` glide and no `progress`.
`
`### `GanttLanes` calendar axis and `hideEmptyLanes` (K3-12) — later project-planning-critical-path, estimation, job-scheduling, incident-response, etl-orchestration, backups-disaster-recovery, dora-metrics, safe-config-rollout
````tsx
`<GanttLanes lanes={…} bars={…} domain={[0, 72]}                       // domain: hours since `start`
`            axis={{ calendar: { start: '2026-03-02T00:00:00Z', unit: 'hour' } }}   // 'hour' | 'day' | 'week'
`            hideEmptyLanes />
`calendarTicks(domain, { start, unit }, count?)   // [{ value, at, label }]: value in domain hours, at in % of the track
`barInDomain(start, end, domain)                  // does a bar touch the domain: what hideEmptyLanes counts
````
`- **The calendar domain is hours since `start`**, whatever the unit: `unit` only says which boundaries get a tick (every hour, every UTC
`  midnight, every Monday 00:00 UTC). Labels are "Mon 09:00" (hour) or "Mon 12 Oct" (day and week), in **UTC**, and the axis says so on screen
`  (a muted "UTC" in the lane-label column). `start` must be an ISO instant with a zone (`Z` or an offset); a bare "2026-03-02T00:00" would be read in the
`  browser's own zone, so `calendarTicks` throws on it.
`- A crowded axis is thinned to a round stride counted from midnight (every 2nd, 3rd, 4th, 6th, 8th, 12th hour; every 2nd, 3rd, 5th, 10th day; every 2nd, 4th
`  week...), never "every 13th hour", and `GanttLanes` asks for fewer ticks on a narrow track (one per ~84px, 2 to 6), so at 390 it shows "Mon 00:00  Tue 13:00"-style pairs
`  rather than overlapping text. Tests cover week boundaries, a month and a year end, an offset `start`, ticks exactly on the ends, and the refusal.
`- `hideEmptyLanes` leaves out every lane with no bar touching the domain (an instant inside it counts) and says which on a line under the
`  chart ("1 lane with nothing in this window is hidden: next month"), so the omission is on screen and in the reading order. With nothing hidden
`  the markup is unchanged. Bars and instants of hidden lanes are not drawn; markers and `now` still are.
`- Without `calendar`, `axis` is the numeric axis it always was (all 37 GanttLanes lessons pixel-identical at 1440 after this change).
`
`### `MetricMeter.tsx` (`meterBands.ts`) (K3-13) — core-web-vitals; later capacity-planning, autoscaling, tail-latency, alerting-design, buffer-pool, model-evals-drift, dora-metrics, benchmarking-methodology
````tsx
`<MetricMeter label="Interaction to Next Paint" value={inp /* number | null */} max={800} unit=" ms"
`             bands={[
`               { upTo: 200, tone: 'ok', label: 'good', tick: { label: 'good ≤ 200 ms', tone: 'ok' } },
`               { upTo: 500, tone: 'orange', label: 'needs improvement', tick: { label: 'poor > 500 ms', tone: 'bad' } },
`               { upTo: 800, tone: 'bad', label: 'poor' },
`             ]}
`             header={<><b>INP</b> the slowest interaction, give or take…</>} format={(v) => `${Math.round(v)} ms`} />
````
`- The metric's name on the left and "value · band" on the right in the band's colour (`.metric-meter-*`), over a 12px `Bar` whose fill takes the band's
`  tone. `bands` go in ascending order of `upTo` (inclusive: a value equal to an edge belongs to the lower band; the last band catches everything above, its
`  `upTo` is only the meter's end), with tones per the colour table. `tick` draws a labelled tick at that band's upper edge.
`- `value: null` is "not measured yet" (an empty muted track), not zero. `format` writes the value (default: the number and `unit`); `header` is a node
`  above the name line, for a title and a definition; `ariaLabel` names the whole meter as one image (default: label and readout).
`- `bandOfValue(value, bands)` (`meterBands.ts`) is the pure rule, tested. core-web-vitals keeps a 20-line adapter, `VitalsMeter.tsx`, that gives the shared
`  meter its names, thresholds and ticks; its three scenes are pixel-identical at 1440 and 390 (frames, and the CLS and INP scenes driven).
`
`### `timeFrames` (`core/frames.ts`) (K3-14) — http-versions, realtime-transports, graphql; later tail-latency, cache-stampede, graceful-degradation, io-models, quic, congestion-control, incident-response
````tsx
`const frames = timeFrames({ end, steps: 40, milestones: [{ t: 120, say: <>The TLS handshake finishes.</> }], intro, summary, hold: 2.5 });
`// → { now, say?, hold? }[] : the intro at 0, `steps` plain frames at (i + 1) × end / steps, a captioned held frame per milestone, the summary at `end`
````
`- The frames of a lesson whose Stage is a clock. Plain frames keep the previous caption (no `say`, no `hold`); where a plain frame and a milestone share a
`  time the plain frame comes first; a milestone past `end` is clamped to it; the summary is always last, at `end`. `TimedFrame` (`extends Frame` with `now`) is the
`  return type, so a lesson's own frame type (`HvFrame`, `RtFrame`, `CompareFrame`) accepts it. The lesson still writes its milestones and captions
`  (`frames.tsx`); only the stepping lives in `core/frames.ts`, tested in `core/frames.test.ts`.
`- This was a Tier 2 wave 8 request (B24, `docs/tier2-wave8-kit-requests.md`); it was never declined (it is not under "Not built"), so it is built.
`  http-versions, realtime-transports and graphql now call it from their `buildFrames` / `compareFrames`, and their frames at 1440 and 390 (9 deterministic
`  shots each width) and their existing frame tests are unchanged. The other B24 requests (`useRovingToolbar`, `plural`'s doc warning) are not part of this item.
`
`### `core/protobuf.ts` — grpc-protobuf; later schema-evolution
````ts
`encodeVarint(150n)            // [0x96, 0x01]; throws RangeError outside 0 .. 2^64 - 1
`readVarint(bytes, at)         // { value, next } | null (truncated, or longer than 10 bytes)
`zigzag32(-1) / unzigzag32(1)  // 1 / -1 (sint32)
`int32Varint(-1) / int64Varint(-1n) / asInt32(v)   // sign-extended to 64 bits, and back to the low 32
`tagOf(field, WIRE.len)        // (field << 3) | wire type, as a varint
`readRecords(bytes)            // { ok: true, records: WireRecord[] } | { ok: false, error, at }: split bytes into wire records, no schema applied
`WIRE, WIRE_NAME, INT32_MIN/MAX, INT64_MIN/MAX
````
`- The wire format only, with no particular message: how a field is tagged, how integers become varints, and how bytes split into records (each with its tag byte
`  range and its value's byte range, for a byte grid). A message's own encoder and decoder stay in the lesson: grpc-protobuf's `model.ts` keeps `Order`'s field
`  order, proto3 defaults, packed `repeated`, unknown-field skipping and `reserialize`; schema-evolution builds its own over the same functions.
`- Extracted unchanged from grpc-protobuf's `model.ts`; its varint, zigzag, tag and record-reading tests moved to `core/protobuf.test.ts` (the protobuf docs'
`  `08 96 01` and `"testing"` examples, an independent arithmetic reference for every value below 70,000, seeded round trips over the whole 64-bit range) with two
`  new ones on sign extension. The lesson's remaining tests are unchanged and pass; its default-scene shot is identical to the unmodified tree's (pure logic moved, so no other
`  scene was driven).
`
`### `core/expr.ts` — debugger-tools; later coverage-mutation-testing (compiler-optimisations, undefined-behavior may follow)
````ts
`evaluate('total * 0.9', [locals, script])                    // { ok: true, value } | { ok: false, error, unsupported }
`evaluate('weight > 10 ? base + 1 : base', scope, { ternary: true })
`const tree = parseExpr(src, { ternary: true })               // ExprNode: lit | name | member | unary | binary | ternary
`runTree(tree, scope)                                         // throws Unsupported / EvalError; run a mutant by running an edited copy
`preview(value, bare?)                                        // the DevTools console's one-line preview
`type Value, Vars, Scope                                      // Scope = Vars[], innermost first
````
`- A hand-written evaluator, no `eval` and no `new Function`: a lexer and a precedence-climbing parser for numbers, strings, `true false null undefined`, names,
`  `a.b`, `a[expr]`, `.length`, unary `! - +`, `* / % + -`, comparisons, `=== !== == !=`, `&& || ??` and parentheses, run with JavaScript's own operators so
`  the answers are real. Calls, assignment, `++`, arrows, templates, `new`, optional chaining and the rest are "not supported here" and never run; members read
`  own data only (nothing inherited, so nothing callable comes back); real globals are "unsupported", never "not defined".
`- **`{ ternary: true }` adds `test ? a : b`** (lowest precedence, right-associative, evaluates only the branch taken). It is an option, not the default, so
`  debugger-tools' watch, console and condition boxes keep the subset their `SUPPORTED` line documents (a ternary there is still "not supported here").
`- **The tree is exposed**: `ExprNode` and `parseExpr` are exported, with `runTree` to run a tree. A mutant is a copy with one node edited (an operator, a literal
`  off by one, swapped ternary branches, a negation), run against the same scope; `core/expr.test.ts` builds a `>` to `>=` mutant that is equivalent over an
`  integer domain and a swapped-branch one that is not, from the `cost(weight, express)` function the mutation lesson uses.
`- Extracted from `debugger-tools/expr.ts`; the lesson keeps `watch.ts` (its `SUPPORTED` text, `logLine`, `splitArgs`) and imports `Value` and `Vars` from here instead of `program.ts`.
`  Its evaluator tests stay with the lesson (they run against its real trace scope); `core/expr.test.ts` adds the ternary, tree and mutant tests. A pretty-printer for a tree
`  (the mutation lesson prints it into a `CodePanel`) is not here: that lesson writes it, as the second user, and files it if a third wants it.
`- The lesson's default shot is pixel-identical to the unmodified tree's.
`
`### `core/latencyLadder.ts` — memory-hierarchy, cpu-caches (test); later back-of-envelope
````ts
`LEVELS      // Level[], fastest first: reg, l1, l2, l3, ram, nvme, dc (datacenter round trip), hdd, wan
`levelById('ram')   // { id, name, ns, range: [lo, hi], capacity: bytes | null, note }
````
`- The ladder of typical latencies and capacities, from a register (0.3 ns) to a cross-continent round trip (150 ms): **typical orders of magnitude from the usual
`  "latency numbers" tables and vendor datasheets, not measurements** (real hardware varies). Each level's `range` is the documented span its figure must sit inside;
`  `core/latencyLadder.test.ts` holds every figure to it, checks the 3-5x steps inside the chip and the 500x from RAM to an SSD, that the ladder is sorted fastest first
`  and that bigger storage is slower. `capacity: null` marks a network hop, which stores nothing.
`- Extracted unchanged from memory-hierarchy's `model.ts`, which keeps what it computes over the ladder (`effectiveNs`, `ratio`, `HUMAN_SECONDS_PER_NS`) and its own
`  misconception test; cpu-caches' test imported `levelById` across lessons and now imports it from here. back-of-envelope reads `ns` and `capacity` instead of copying
`  the table. memory-hierarchy's shots at 1440 and 390 are pixel-identical.
`
`## Tier 3 kit (wave 1 to 2 kit round: agent D)
`
`Demos on `#/dev/kit` under "Tier 3 kit · wave 1 to 2 round, agent D" (`pages/DevKitTier3d.tsx`).
`
`### `core/laneEditor.ts`, `components/LaneEditor.tsx` (`laneGeometry.ts`) (T3-B4) — logical-clocks, consistency-models
`
`Lanes along a time axis where the learner places, selects, moves and deletes items: point events with messages between them (logical-clocks), or operation intervals with an
`invoke and a response slot (consistency-models). Only the lane and key mechanics are shared; what an item *means* and how it is drawn stays in the lesson.
````tsx
`import { LaneEditor } from '../components/LaneEditor';
`import { buildLaneModel, createLaneModel, type LaneModel } from '../core/laneEditor';
`const limits = { lanes: 3, slots: 14, maxItems: 14 };                     // events; for intervals add minSpan: 1
`const [model, setModel] = useState(() => buildLaneModel<Ev>(limits, [{ lane: 0, slot: 1, data: ev }, …], [[0, 1]]));   // a preset: items, then messages by index
`<LaneEditor model={model} onChange={setModel} onRefuse={setReason} laneLabels={['P1', 'P2', 'P3']} newData={(lane, slot) => ev}
`  mode={linking ? 'link' : 'edit'} ariaLabel="Execution" describeItem={(it) => `event ${it.data.name}`}
`  renderItem={(item, geo, { selected }) => <svg stuff/>} />               // renderItem, renderLink, underlay: SVG in the editor's own coordinates
````
`- **Model** (`LaneModel<T>`, pure and immutable): `items` `{ id, lane, start, end, data }` (a point has `start === end`; `end - start` is the span), `links` `{ from, to }`, `selected`,
`  `limits` `{ lanes, slots, maxItems?, minSpan?, maxSpan? }`. Every edit returns `{ ok: true, model, id? }` or `{ ok: false, reason }` with the reason in plain words
`  ("that place on the lane is taken", "a message can't arrive before it is sent"): `addItem`, `moveItem(id, dLane, dSlot)`, `resizeItem(id, 'start' | 'end', delta)`, `removeItem`
`  (its messages go too), `linkItems(from, to)`, plus the total functions `selectItem`, `setItemData`, `unlinkItems`. **Rules the model keeps for every reachable state**: items stay in
`  bounds, never overlap within a lane, and every message goes forward in time between two different lanes (so moving an event can be refused because it would break a message).
`  Ids come from a counter, so they are never reused after a delete. `activateCell(model, lane, slot, mode, newData)` is what Enter or a press does: edit mode adds on an empty
`  slot and selects an item; link mode picks the sender, then a press on a later slot of another lane adds the receive event and joins them (the receiver is then selected, so a chain is a run of presses).
`- **Undo** is the lesson's: models are immutable and `onChange` hands over the whole next model, so keep a stack of them (`onChange={(m) => { push(model); setModel(m); }}`). There is no shared undo hook yet.
`- **Keyboard path** (`laneKeyAction`, tested as a table): the grid is **one tab stop** (roving tabindex over its `role="gridcell"` cells, `aria-label` says lane, slot and what is there). Arrows move the
`  cursor (no wrapping), Home and End jump to the lane's ends, Enter or Space activates, **Shift + arrows move the selected item**, **Alt + Left/Right** moves an interval's end edge, Delete or Backspace removes it,
`  Escape deselects. **Pointer path**: press an empty slot to add, press an item to select it and drag it along its lane or across lanes (a drag step that would be refused is skipped silently). A row of
`  buttons under the grid (move four ways, Delete; `buttons={false}` hides it) is the touch path, since a scroll can cancel a drag.
`- `onRefuse(reason)` is the lesson's to show (a `role="status"` line next to the editor). The component draws no caption of its own besides a keyboard hint (`hint`, or `null` to hide it).
`- Drawing defaults: a dot for a point and a rounded bar for an interval in `toneOf(item)` (default `muted`; lanes are plain categories, so use `amber`/`sky`/`pink`, never `--bad`/`--ok`), `itemLabel` text,
`  the selected item ringed `--hi`, messages `--info` arrows. The grid keeps its natural width (`laneGeometry(limits, { slotW, laneH }).width`, 52 + 28 per slot by default) inside a built-in `WideRegion`, so on a phone it scrolls
`  sideways while the buttons and hint reflow. Lessons that draw timestamps keep their text at 9px or more and pass `slotWidth`/`laneHeight` to make room.
`- Tests: `core/laneEditor.test.ts` (every edit and refusal; messages; presets; `activateCell`; the key table; and 300 seeded random edit sequences of 60 edits that never leave an overlap, an out-of-bounds item or a
`  backwards message, checked by an independent verifier that is itself shown to catch a hand-built violation), `components/laneGeometry.test.ts`.
`- **Tier 2 equivalents checked, nothing migrated:** isolation-levels' schedule matrix is a fixed grid the learner plays, not one they build (no add, move or delete); CellGrid, GanttLanes and SequenceDiagram are read-only
`  drawings; the scheduling lessons' Gantt lanes are computed, not edited. No Tier 2 lesson places items on lanes, so there was nothing to migrate.
`
`## Tier 3 kit (kit round after wave 1: agent E)
`
`Demos on `#/dev/kit` under "Tier 3 kit · wave 1 round, agent E" (`pages/DevKitTier3e.tsx`).
`
`### `core/scenario.ts`, `components/ScenarioStory.tsx` (`scenarioStory.css`) (K3-15) — design-docs-rfcs, computing-ethics (engine only); later incident-response, postmortems, safe-config-rollout, technical-debt, estimation, mentoring-delegation, project-planning-critical-path, prioritization, product-thinking, ml-fairness-bias, threat-modeling
`
`A branching decision simulator: nodes with choices, meters the choices move, endings, and the reason for every choice. The engine is pure; the component draws it.
````tsx
`import { ScenarioStory } from '../../components/ScenarioStory';
`import { startWalk, validateScenario, type Scenario } from '../../core/scenario';
`const SCENARIO: Scenario = {
`  start: 'alert',
`  meters: [{ id: 'users', label: 'Users affected', start: 2, min: 0, max: 10, bad: { above: 6 }, unit: '%' }],
`  nodes: [{ id: 'alert', prompt: 'Errors are climbing. What first?', choices: [
`    { id: 'rollback', label: 'Roll back', to: 'calm', effects: { users: -1 }, because: 'The cheapest move that is easy to undo.' }] }],
`  endings: [{ id: 'calm', title: 'Contained', text: '…' }],
`};
`const [walk, setWalk] = useState(() => startWalk(SCENARIO));                // the lesson owns the walk, for its stats and caption
`<ScenarioStory scenario={SCENARIO} walk={walk} onWalk={setWalk}
`  provenance="an invented incident: every effect is a made-up number"       // mandatory: the "invented" chip's note
`  notes={<ClaimLabel kind="view">…</ClaimLabel>} claimOf={(choiceId) => 'practice'}
`  endingHint={validateScenario(SCENARIO).length === 0 ? 'every ending is reachable' : undefined}
`  stepTitle={(n) => `Move ${n}`} />
````
`- **Engine** (`core/scenario.ts`): `Scenario { start, nodes: { id, prompt, choices: { id, label, to, effects?, because }[] }[], meters, endings }`; a `Meter` is `{ id, label, start, min, max, bad: { below } | { above }, unit? }`
`  (in the red beyond the edge, `isBad`). `Walk { at, path, meters }`: `startWalk`, `choose(s, walk, choiceId)` (a choice not at this node changes nothing), `undo` (replays the rest of the path from the start, so
`  the meters can never drift from the choices), `ledger`, `redMeters`, `findNode`/`findEnding`/`isEnding`. Effects are summed as written, never clamped.
`- **`validateScenario(s, { allowCycles, tradeoffs })`** returns `Problem { kind, detail }[]` (empty means fine): `start` (not a node), `duplicate-id`, `missing-target`, `unknown-meter` (an effect on something that is
`  not a meter), `unreachable-node`, `unreachable-ending`, `dead-end` (a node with no choices), `cycle` (a loop, or a path past `MAX_DEPTH` = 40 steps; `allowCycles: true` for a retry or review round that is meant to
`  loop, then paths are explored only until they first revisit a node), and `out-of-bounds` (a meter that starts outside its bounds, or **any path that takes a meter outside `min`..`max` at any step**, named
`  with the path and the sum). Run it in the lesson's test **and** let the lesson say what it proved (`endingHint`) only when it returns nothing.
`- **`tradeoffs: true` (K4-9, AC-0/T4 #35)** adds two opt-in kinds for opinion lessons, where a scenario that recommends one answer by construction is a defect (the lead lessons call it and expect `[]`):
`  - `dominated-choice`: at one node, choice X is dominated by a sibling Y when Y is no worse than X on every meter and strictly better on at least one (the good direction of a meter is read from its
`    `bad` edge: `below` means higher is better, `above` means lower), and Y leads somewhere as good. "As good" is the `destinations` rule of `dominatedChoices(s, { destinations })`: `same` (same destination only,
`    the narrow reading), `equal-or-better` (the default and what `tradeoffs` uses: the same destination, or one that reaches every ending X's destination reaches at no greater cost on any meter; two different endings
`    are never equal, because the meters cannot say whether "hire" beats "no hire"), and `ignore` (strictest). Exported for tests that want the strict reading.
`  - `free-path` (`freePaths(s)`): a path from the start to an ending on which no meter is ever in the red and none ends worse than it started.
`  - Off by default (a technical scenario may have one right answer); loops are cut at the first revisit so it never hangs. Passing is necessary, not sufficient: a reviewer still asks whether one path looks obviously right.
`  - Fixtures: `core/testing/leadScenarios.ts` encodes the six spec scenarios (strangler-fig-migrations, build-vs-buy, technical-strategy, reversible-decisions, influence-without-authority, hiring-interviewing); all pass, with their path counts and hand-worked ledgers pinned in `core/scenarioTradeoffs.test.ts`, as does the Tier 3 `design-docs-rfcs` scenario (not exempt).
`    Under `ignore` only hiring-interviewing's `veto` is flagged (worse than `avg` on all three meters, but "no hire" is a different ending); that is why the default does not compare different endings.
`  `enumeratePaths(s)` lists every path to an ending with its meters (needs a scenario without cycles; the number of paths is the lesson's to assert).
`- **Component**: meters (a `Bar` each, with the red edge marked and, once a choice is picked, a "+n if chosen" preview), the prompt, the choices as a **keyboard radio group** (one tab stop, arrows move the pick;
`  the reason shows under the picked choice only), Continue / Undo, the ending (title, text, Undo, Replay), and the ledger of what was chosen, what it moved and why.
`  **After every step focus moves to the first choice of the new step, or to the ending's title**, because Continue, Undo and Replay disappear or disable with the step they acted on.
`  The component owns only the not-yet-continued pick; everything else is the caller's `walk`.
`- **Provenance is not optional**: `provenance` is the note on the `invented` chip rendered under the story (class `scn-notes`), so a scenario never ships without saying its numbers are invented
`  (AC-0/T3 #21, #24). `notes` adds `ClaimLabel`s to the same row. `claimOf(choiceId)` labels a picked choice's reason.
`- Styling: class names are `scn-*`, styled globally by `components/scenarioStory.css` (loaded from `main.tsx`). `classPrefix` (default `scn`) exists for a lesson that must keep its own prefix; it then supplies
`  the CSS for that prefix. Don't: a lesson-prefixed copy is the thing this component replaces. Wrap it in the lesson's `stage-pad` div inside a `StageFrame`; it renders its own row of chips as a sibling.
`- Tests: `core/scenario.test.ts` (each problem kind on a deliberately broken scenario, the bounds check on every path including a path that leaves the bounds and returns, `allowCycles`, path enumeration by hand, undo
`  equal to the replayed sum, both kinds of red edge). design-docs-rfcs' `scenario.test.ts` keeps its own scenario's claims (12 paths, every ending, one meter red on every path).
`- **Migrated:** `design-docs-rfcs` (its `scenario.ts` and `ScenarioView.tsx` moved here: the `dd-*` scenario CSS became `scn-*`, same rules; the stage shots for every step, undo and replay at 1440 and 390px are
`  pixel-identical, and the focus after Continue, Undo and Replay is the same). **`computing-ethics` uses the engine's validator and path enumeration only** (`toScenario(case)` in its `walk.ts` adapts a case to a
`  `Scenario` with no meters; its test runs `validateScenario` and checks `enumeratePaths` finds the same routes as its own walk). Its UI and walk stay local, and they do not fit `ScenarioStory`: a choice there
`  has no meter effect but three authored impact cards (users, team, you) with a tone each; choices are `ChipButton`s with a pick-then-Continue step where Back first clears the pick and then steps back (the shared
`  `undo` always removes a decided step); there is no ledger but an end card that summarises the path against the ACM principles, and a branch map (`GraphView`) with seen and unseen marks that outlives Start over;
`  and its provenance is a per-case honesty note and a per-choice "history, what-if or illustrative" basis, not the single "invented" chip (the Therac-25 case is history). Forcing it through would change every pixel.
`- Showcase: `#/dev/kit`, "Tier 3 kit · wave 1 round, agent E" (a small invented incident, plus the validator's output on that scenario broken four ways).
`
`## Tier 3 kit (kit round after wave 3: agent G)
`
`Demos on `#/dev/kit` under "Tier 3 kit · wave 3 to 4 round, agent G" (`pages/DevKitTier3g.tsx`).
`
`### `core/linalg.ts` (K3-18) — markov-chains, eigen-pagerank, svd-pca, embeddings (migrated); later recommender-systems, attention-transformers, cnns-convolution, neural-networks-backprop
````ts
`import { powerIteration, eigen2x2, jacobiEigen, svdSmall, pca, conv2d, softmax } from '../../core/linalg';
`const steps = powerIteration(A, { iters: 30, start: [1, 0], norm: 'l2' | 'l1' }); // steps[0] is the rescaled start
`steps[k].v; steps[k].lambda; steps[k].stretch; steps[k].change;        // iterate, Rayleigh quotient, |A v_prev|/|v_prev|, |v - v_prev|
`eigen2x2([[a, b], [c, d]]);   // { kind: 'real', values: [l1, l2], vectors } | { kind: 'complex', values: [{re, im} ...], vectors } | null (defective)
`jacobiEigen(sym);             // { values (descending), vectors[i] pairs with values[i] }; throws if not symmetric
`svdSmall(A);                  // { u, s, v }: A = U diag(s) V^T, thin, s non-increasing, <= 8 x 8
`svdReconstruct(svd, k);       // the rank-k sum of sigma_i u_i v_i^T
`pca(points, k); pcaProject(p, v); covariance(points); mean(points);
`conv2d(image, kernel, { stride, pad }); softmax(xs, temperature); matPow(A, k);
````
`- Builds on `core/vec`: `matMul` and `transpose` are re-exported from there, vectors use `Vec`/`Mat`, and a direct linear solve is still `vec.solve`. Nothing mutates its inputs.
`- `powerIteration` returns every iterate so a lesson can animate it. `norm: 'l1'` keeps a probability vector summing to 1 (Markov chains, PageRank: pass `P^T` for a row-vector chain). It stops early at the zero vector. A negative dominant eigenvalue flips the iterate's sign each step, so `change` is large there.
`- `eigen2x2` is the closed form of the characteristic quadratic. Real eigenvalues come back largest `|lambda|` first with unit vectors (first non-zero component positive); a negative discriminant gives a conjugate pair (positive imaginary part first) with complex unit vectors; a repeated eigenvalue with one eigendirection (a shear) is `null`; a scalar matrix returns the axes. `jacobiEigen` is symmetric-only and general-size; `topEigen(m, k)` is the deflated power iteration `pca` uses (positive semi-definite input).
`- `svdSmall` is one-sided Jacobi, labelled small-matrix: it refuses more than 8 rows or columns (`SMALL_MATRIX_MAX`). Zero singular values get a completed orthonormal U column. Signs of singular vectors are arbitrary.
`- `conv2d` is deep-learning convolution (cross-correlation, kernel not flipped), single channel, zero padding; output side `floor((n + 2 pad - k) / stride) + 1`.
`- Tests: `A = U S V^T` and orthonormal U, V to 1e-9 on 200 seeded matrices (wide, tall, rank-deficient), the Eckart-Young error identity, `A v = lambda v` for `jacobiEigen` (300 seeded), `eigen2x2` (1,000 seeded, real and complex), power iteration vs Jacobi's dominant vector, PageRank (the pinned `A, B, C -> D, D -> A` example and 200 seeded graphs with dead ends) equal to the direct solve, `conv2d` equal to a naive padded loop on 300 seeded cases.
`- **Migrated:** `embeddings` (its local `covariance`/`topEigen`/`pca`/`centroid` moved here verbatim, so the map's numbers are bit-identical; the lesson keeps a two-number `project` wrapper over `pcaProject`). Its stage shots are pixel-identical.
`
`### `core/huffman.ts` — huffman-coding (migrated); entropy-information, lz-compression
````ts
`import { buildHuffman, textWeights, encode, decode, canonicalCodes, kraftSum, averageLength } from '../../core/huffman';
`const h = buildHuffman(textWeights('mississippi'), 'old');   // or any [{ sym, weight }] (counts or probabilities)
`encode(h, text); decode(h, bits); decodeSteps(h, bits);       // h.codes: Map<symbol, '0101'>; h.merges: the build, step by step
`codeLengths(h); averageLength(h); mergeCost(weights); depthOf(h, id);
`canonicalCodes([3, 3, 3, 3, 3, 2, 4, 4]);   // DEFLATE rule (RFC 1951 3.2.2): ['010','011','100','101','110','00','1110','1111']
`kraftSum(lengths);                           // > 1 oversubscribed (canonicalCodes throws), 1 complete, < 1 incomplete
````
`- `buildHuffman(entries, tie)` builds over any positive weights; leaf ids follow the order given (the creation order the tie-break uses), and `textWeights(text)` lists a text's symbols lightest first. A lone symbol gets the code `0`. `tie` is `'old'` or `'new'` (which of two equal-weight trees merges first): both build optimal trees, possibly different ones.
`- `canonicalCodes(lengths)` takes one length per symbol, 0 meaning unused (its entry is null). Only the lengths need sending, which is why DEFLATE ships lengths rather than trees.
`- The lesson keeps what is its own: the message rules (`parseMessage`), the cost comparison against fixed-width and ASCII codes, `forcedOneBitCost`, and a `Huffman` type that is core's tree plus the text.
`- Tests: `core/huffman.test.ts` (the textbook 5, 9, 12, 13, 16, 45 tree costs 224 bits per 100, the cost equals the sum of merge weights and lies in [entropy, entropy + 1) on probabilities, round trips and prefix property on 200 seeded texts with both tie-breaks, the RFC example, canonical order and prefix property on 300 seeded complete length sets, oversubscription refused). `huffman-coding`'s own tests are unchanged apart from their imports.
`- **Migrated:** `huffman-coding` (`model.ts` keeps only the lesson's rules and costs; frames, stage and tests import the tree from here). Its stage shots at the first, middle and last frames are pixel-identical.
`
`### `core/useGraphEdits.ts` (`graphEdits.ts`, `result.ts`) — shortest-paths-advanced, strongly-connected-components, network-flow, bipartite-matching, graph-coloring; later any lesson with an editable graph
````ts
`import { useGraphEdits } from '../../core/useGraphEdits';
`const edits = useGraphEdits<Digraph, PresetId>({
`  presets: PRESETS, initial: 'tangle', graphOf: (id) => presetById(id).graph, edgeCount: (g) => g.edges.length,
`  scene,   // optional: a note belongs to the scene it was written in; omit for one shared note
`});
`edits.graph; edits.presetId; edits.note; edits.added;          // added = edges over the preset
`edits.load(id);                                                 // preset graph + "Loaded <label>."; returns the graph so the wrapper can reset what depends on it
`edits.edit(addEdge(edits.graph, a, b), 'Added a to b.');       // apply a model Result: new graph + note, or the refusal as the note; true when applied
`edits.set(graph, 'Removed a to b.'); edits.setNote('Selected a-b.');
`edits.undoAdded(removeLastEdge, 'Removed the last edge you added.');   // never removes a preset edge
````
`- The graph is any value: the model keeps its own `addEdge`/`addNode`/`removeEdge` and their refusal sentences and bounds (`MAX_NODES`, no duplicates, no free spot), returning `Result<G>`. `Result<T>` (`{ ok: true, value } | { ok: false, error }`) now lives in `core/result.ts`; the five lessons' identical copies are gone.
`- Not in the hook, on purpose: what a lesson derives from the graph (a flow and its pushes, a matching and the search, the greedy order, the source node). That stays in the lesson's own editor hook, which wraps `load`/`edit` and resets it, as the five do.
`- The transitions are pure functions in `core/graphEdits.ts` (`loadPreset`, `applyResult`, `setGraph`, `noteFor`), tested in `graphEdits.test.ts` (preset load and baseline, accepted and refused edits, scene-keyed notes, the added-edge count); the hook is a thin `useState` over them (no React test renderer in this repo).
`- **Migrated:** the five B9 lessons' editors (`useGraphEditor`, `useSccEditor`, `useFlowEditor`, `useMatchEditor`, `useColorEditor`; about 65 fewer lines in all). Their tests pass unchanged and every scene's shots (all scenes, first, middle and last frame) are pixel-identical.
`
`### `core/scc.ts` — strongly-connected-components (migrated); markov-chains (communicating classes)
````ts
`import { stronglyConnectedComponents, condense, canonicalPartition, adjacency, type Arc } from '../../core/scc';
`const { components, comp } = stronglyConnectedComponents(n, edges);   // Tarjan; edges are [from, to] pairs on nodes 0..n-1
`const c = condense(edges, comp, components.length);                    // { edges between components, order: a topological order }
`const closed = components.filter((_, i) => !c.edges.some(([a]) => a === i));   // closed classes: nothing leaves them
````
`- `components` are sorted node lists in the order the search closes them, so every edge between components goes to an earlier one (sinks first). A self-loop or lone node is a component of its own. `comp[v]` indexes `components`.
`- Takes plain node counts and edge pairs, so any lesson's graph type feeds it. The lesson's own Kosaraju trace (the animated two passes, with its events) stays in `strongly-connected-components`; it builds on `adjacency` and `reverseEdges` from here.
`- Tests: `core/scc.test.ts` (the textbook graph, the transitive-closure oracle on 2,000 seeded graphs, the sinks-first order on 500, condensation edges unique with a valid topological order, closed classes of a small chain). The lesson's tests compare Kosaraju with this routine and the closure oracle, unchanged apart from their imports.
`- **Migrated:** `strongly-connected-components` (its `tarjan`, `canonical`, `adjacency`, `condense` and `Arc` moved here; `canonical` is `canonicalPartition`, and `condense` takes the edge list instead of the lesson's graph). Its shots are pixel-identical.
`
`### `StageFrame intro` and the `ProvenanceRow` margin after a `stage-pad` (small tweaks) — every player-less scene; the five B9 lessons migrated
````tsx
`<StageFrame intro={caption} introKey={[caption]} controls={...}>   // no player: the caption opens with this
`  <div className="xx-stage stage-pad">…</div>
`  <ProvenanceRow>…</ProvenanceRow>                                   // no lesson CSS for its margin
`</StageFrame>
````
`- `intro` (with `introKey`, the values a computed sentence depends on; leave it out for a fixed sentence) sets the caption when a player-less stage mounts and again when `introKey` changes, so switching scene never leaves the previous scene's caption behind. It is `useIntroCaption` from inside the frame; a stage with a `player` ignores it (the frames own the caption). A scene that calls `useIntroCaption` itself keeps working.
`- `.stage-pad ~ .provenance-row` in `kit.css` gives a row that follows a padded stage the same 16px inset and 8px gap the stage content has. The five lesson-CSS copies (`.bm-stage ~ .provenance-row` and the other four) are gone; a row nested inside the `stage-pad` is unaffected (the gap already spaces it).
`- **Migrated:** the nine B9 scenes whose caption was `useIntroCaption(<>{caption}</>, [caption])` (network-flow augment and cut, bipartite-matching augment, cost, flow and Hall, graph-coloring bound, hard and timetable) now pass `intro`/`introKey`. The five other B9 scenes with a longer computed caption (`shortest-paths-advanced` cost, `strongly-connected-components` condense, order and why, network-flow models) still call `useIntroCaption` and are fine as they are. Shots and the opening caption of every scene are unchanged.
`
`## Tier 3 kit (kit round after wave 4: agent H)
`
`Demos on `#/dev/kit` under "Tier 3 kit · wave 4 to 5 round, agent H" (`pages/DevKitTier3h.tsx`).
`
`### `core/nn.ts` (K3-19) — neural-networks-backprop, cnns-convolution, attention-transformers, training-vs-inference, recommender-systems
````ts
`import { createMlp, createConvNet, createAttentionHead, createFactorisation, createSgd, gradCheck, attention } from '../../core/nn';
`const net = createMlp({ inputs: 2, hidden: [4], activation: 'tanh' | 'sigmoid' | 'relu', output: 'sigmoid' | 'linear', seed, l2, fault });
`const batch = { xs: [[0, 0], [0, 1]], ys: [0, 1] };            // full batch; labels in {0, 1} for a sigmoid output
`const sgd = createSgd({ learningRate: 0.5, momentum: 0.9 });
`const loss = sgd.step(net, batch);                              // one epoch; returns the loss before the update
`net.trace(x);          // { z, a }: every pre-activation and activation (a[0] is the input, the last entry the output)
`net.predict(x); net.deadUnits(xs); net.layerGradientNorms(net.gradient(batch)); net.layers; net.sizes;
`gradCheck(net, batch); // { maxRelError, worstIndex, checked, skipped, numericForwardPasses: 2 * checked, backpropPasses: 2 }
`attention(Q, K, V, { mask: 'causal' | boolean[][] });           // { scores, masked, weights, output }; weights rows sum to 1
````
`- Every model is a `Trainable<Batch>`: a flat mutable `params` array, `loss(batch)` and an analytic `gradient(batch)`. `createSgd` and `gradCheck` take any of them, so a lesson-specific model gets both for free. Nothing here reads the clock or `Math.random`: the seed is an argument and the same seed gives the same curve. A diverged run is the caller's to detect (`Number.isFinite(loss)`): it keeps stepping.
`- `createMlp`: one or two hidden layers of 1 to 16 units (`RangeError` otherwise), one output unit. Sigmoid output pairs with cross-entropy (output error `p - y`), linear with half squared error. `l2` decays weights, not biases. Parameters are laid out per layer as the weight rows (one per output unit) then the biases; `layers[i]` gives the range.
`- `createConvNet({ size, kernelSize, kernels: 1 | 2, seed })`: valid convolution, ReLU, global max pool per kernel, logistic output, trained on `{ images, ys }`. `kernel(k)` and `featureMap(image, k)` give what the lesson draws. `convBackward(image, kernel, dOut, { stride, pad })` is the general conv layer gradient (`dKernel`, `dImage`) for stacked layers.
`- `createAttentionHead({ inputs, keyDim, valueDim, seed })`: trainable `W_q`, `W_k`, `W_v` around `attention`, loss = half squared error of the output. Batch `{ queries, keys, targets, mask?, values? }`; pass `values` to look up fixed value rows (then `W_v` gets a zero gradient, the lookup scene of attention-transformers). `forward(batch)` returns the weights to draw. `attentionBackward` is the raw backward for `Q, K, V`.
`- `createFactorisation({ users, items, factors, seed, lambda })`: `r̂ = p_u · q_i` over a ratings list `{ user, item, rating }`; `rmse(ratings)` for the train and held-out curves. Step it with `createSgd` on the observed ratings (a mini-batch is just a shorter list).
`- `gradCheck` compares the analytic gradient with central differences (`epsilon` 1e-5), reports the worst relative error `|a - n| / max(|a| + |n|, floor)` (`floor` 1e-4 so two near-zero gradients do not report noise), and **skips** parameters sitting on a ReLU or max-pool kink (detected from the loss's second difference, so it never depends on the gradient being checked); `skipped` says how many. `numericForwardPasses` against `backpropPasses` is the cost comparison the backprop lesson shows.
`- `fault` (`dropDerivative`, `transposeWeights`, `flipSign` on the MLP; `noFlip` on `convBackward`; `dropScale` on the attention head) builds a deliberately wrong backward for a "break the backward pass" toggle and for the tests that prove `gradCheck` catches it. `transposeWeights` only bites a square hidden-to-hidden layer.
`- Tests: `core/nn.test.ts` (`gradCheck` below 1e-6 for tanh, sigmoid and ReLU on 20 seeded nets each, linear output, the conv net, `convBackward` for kernel and input, the attention head for `W_q`, `W_k`, `W_v` plain and causal, factorisation; every wrong backward fails it above 1e-2; the single-neuron hand vector `p = 0.7311`, loss 0.3133, `dL/dw = -0.5379`; the hand-built ReLU XOR net returns exactly 0, 1, 1, 0; XOR loss falls on a fixed seed; one hidden unit never beats 3 of 4 on 50 seeds; the attention lookup reaches weight 0.8 on at least 15 of 20 seeds; factorisation RMSE falls).
`
`### `core/kmeans.ts` — clustering-kmeans, vector-search (both migrated)
````ts
`import { kmeans, lloydPasses, updateCentroids, assignAll, nearest, sqDist, inertia, initRandom, initShuffled, initPlusPlus } from '../../core/kmeans';
`const start = initPlusPlus(points, k, mulberry32(seed));          // or initRandom (Forgy) / initShuffled (first k of a full shuffle)
`const run = kmeans(points, start, { maxIterations: 15, empty: 'keep' });   // { centroids, assign, iterations, computations }
`for (const pass of lloydPasses(points, start, { empty: 'reseed' })) {      // one assign pass at a time, for a lesson that animates it
`  pass.assign; pass.changed; pass.settled; pass.update;                    // update: { centroids, reseeded } or null when nothing moved
`}
````
`- Any dimension (`Vec` points; a tuple type such as `readonly [number, number]` is kept through the generics). `lloydPasses` is the one loop: assign every point to its nearest centroid (a tie goes to the lower index), and if anything moved, recompute the centroids. `kmeans` runs it to the end; a run that hits `maxIterations` unsettled is finished with one more assignment, counted, so `assign` always agrees with `centroids`.
`- `computations` is the unit the lessons report: points x centroids per assign pass, the final pass that found nothing moving included. `iterations` counts those passes.
`- `empty`: `'keep'` leaves a cluster nobody joined where it was (vector-search's IVF cells), `'reseed'` moves it to the point farthest from its own centre and reports it in `update.reseeded` (clustering-kmeans, which draws it). `kmeans` defaults to `'keep'`, `lloydPasses` and `updateCentroids` to `'reseed'`.
`- Three starts, each seeded by the caller's `Rnd`: `initRandom` (Forgy, a partial forward shuffle), `initPlusPlus` (D-squared weighting) and `initShuffled` (first `min(k, n)` of a full Fisher-Yates from the end). The last two lessons used different shuffles, so both are kept: switching one would move the other's cells.
`- Tests: `core/kmeans.test.ts` (a hand-worked 1-D run: assignments `[0,1,1,1]`, `[0,0,1,1]`, `[0,0,1,1]`, centroids `[0.5]`, `[10.5]`, 3 passes and 24 computations; the unsettled finish; every point in its nearest centroid and determinism on 20 seeds x 3 starts; keep versus reseed). The vector-search clustering was also compared against the old local implementation on 60 seeded runs (clustered and 8-D uniform points, nlist 4 to 32): centroids, assignments, iterations and computations equal.
`- **Migrated:** `vector-search` (its `kmeans.ts` and `sqDist` are gone; `buildIvf` calls the shared `kmeans` with `initShuffled` and 15 iterations) and `clustering-kmeans` (`model.ts` keeps its starts-by-name, steps, restarts, elbow and silhouette; `lloyd` turns each pass into frame steps). Shots are pixel-identical.
`
`### `core/entropy.ts` — entropy-information, lz-compression (both migrated)
````ts
`import { entropy, binaryEntropy, surprise, textEntropy, orderZeroBits, orderZeroBitsPerChar } from '../../core/entropy';
`entropy([0.5, 0.25, 0.25]);     // 1.5 bits; entropyTerm(p) is one -p log2 p term, 0 for p = 0
`binaryEntropy(0.1);             // 0.469; surprise(0.25) = 2, surprise(0) = Infinity
`textEntropy('mississippi');     // { n, symbols: [{ sym, count, probability, surprise }], bitsPerChar, totalBits, nonAscii } | null when empty
`orderZeroBits(text);            // n x H, 0 for an empty text; orderZeroBitsPerChar(text) is H alone
````
`- Order 0 means each character is treated as an independent draw from the text's own counts: an estimate from one sample, never the source's true entropy (lessons say so on screen). Symbols come heaviest first (`core/huffman` `frequencies`), characters are code points.
`- `orderZeroBits` is `textEntropy(text)?.totalBits ?? 0`, the same arithmetic both lessons had before (each term is `0 - p log2 p`, summed in the same order), so the figures they print are unchanged to the last bit.
`- Not here: `crossEntropy`/`excessBits` (entropy-information only; they move when a second lesson wants them) and the Huffman code costs (`core/huffman`).
`- Tests: `core/entropy.test.ts` (fair coin 1 bit, uniform over 8 is 3, (1/2, 1/4, 1/4) is 1.5, `H(0.1)` = 0.4690 and symmetric, mississippi against its closed form, `ab` x 50 is 100 bits, empty and non-ASCII). The two lessons' own tests are unchanged apart from their imports.
`- **Migrated:** `entropy-information` (`model.ts` keeps coin block codes, passwords and cross-entropy) and `lz-compression` (`orderZeroBits`, `orderZeroBitsPerChar` removed from its `model.ts`).
`
`### `core/avl.ts`, `core/keyInput.ts`, `core/opSession.ts` (`useOpSession`), `BinaryTreeView` — avl-trees, red-black-trees (migrated); skip-lists (`parseKey`); later heap, trie and other tree lessons
````ts
`import { insertKey, removeKey, buildAvl, checkAvl, heightOf, inOrder, type Tree } from '../../core/avl';
`import { parseKey, parseKeyList, refuseOp, TREE_NODE_LIMIT } from '../../core/keyInput';
`import { useOpSession } from '../../core/useOpSession';
`import { BinaryTreeView, binaryTreeBox, TREE_NODE_RADIUS } from '../../components/BinaryTreeView';
`
`const r = insertKey(tree, 20, { record: true });   // { tree, steps, rotations, fixes }; record: false skips the snapshots (big seeded runs)
`buildAvl([1, 2, 3]);                                // { tree, rotations, fixes } over a whole insert order
`checkAvl(tree);                                     // [] when valid: reachability, BST order, stored heights, |balance| <= 1
`parseKeyList('30 10, 20');                          // { ok, value } | { ok: false, error }; distinct keys, in range, at most TREE_NODE_LIMIT (31)
`refuseOp('insert', 5, size, has);                   // a sentence or null; the optional 5th argument is the drawing's node limit
`
`const OPS: OpSessionModel<Tree, Frame> = { run: ({ base, op, key }) => myFrames(base, op, key), sizeOf, hasKey };   // module-level
`const session = useOpSession(OPS, () => ({ base, op: 'insert', key: 5 }));   // session.tree, .frames, .note; .submit(op, keyText); .restart(start)
`<BinaryTreeView tree={tree} levels={heightOf(tree)} top={30} maxGap={48} className="xx-svg" renderNode={...} nodeMark edgeMark nodeScale onNodeClick nodeAriaLabel overlay ariaLabel />
````
`- **One AVL model.** `core/avl.ts` is the full stepped AVL tree (heights in nodes, balance factor `h(right) - h(left)`, rotations counted one per left or right rotation, so a double rotation is two and one fix). `avl-trees` steps and breaks it (`broken` makes a double rotation single); `red-black-trees` counts its rotations and height against the red-black tree in the comparison scene, replacing its local `avlRef.ts`. `AvlWork` is exported for a lesson that applies a single chosen rotation (avl-trees' "you pick the rotation" game, which stays in the lesson's `model.ts`). Immutable trees: each operation copies the nodes, fine for a 1,023-key run.
`- **Key input.** `parseKey` is the one-key field (whole number from -999 to 999, typographic minus accepted); `parseKeyList` the typed list; `refuseOp` the insert/delete refusal for a tree. skip-lists uses `parseKey` and keeps its own `refuseOp`, because a list's sentences and its 64-key limit differ (and it has a search op).
`- **Drawing.** `BinaryTreeView` is `TreeSvg` in-order layout inside a `WideRegion`: `binaryTreeBox(size, levels, { top, maxGap })` gives one 30px column per node (330 to 960 wide) and squeezes the level gap to fit a chain, and a phone scrolls sideways before the 10px badge text (`TREE_BADGE_TEXT_PX`) drops under 8px. `top` and `maxGap` are the lesson's (avl-trees 30 and 48, red-black-trees 32 and 50): the two used to differ by those two numbers, and keeping them as props keeps both drawings pixel-identical.
`- **Session.** `useOpSession(model, initial)` is the stepper session both lessons wrote: the frames of the latest insert or delete, the tree they end with, and the note of the last refusal. The transitions are pure (`beginSession`, `submitOp` in `core/opSession.ts`) so they are tested without a renderer; `useAvlSession` and `useRbSession` are eight-line adapters that supply the lesson's frame builder.
`- Tests: `core/avl.test.ts`, `core/keyInput.test.ts` (every refusal sentence), `core/opSession.test.ts` (a fake tree: start, next op on the ended tree, refusals change only the note), `components/BinaryTreeView.test.ts` (hand-worked box sizes). avl-trees, red-black-trees and skip-lists tests are unchanged apart from their imports, except that red-black-trees' "compact AVL reference" test now runs the same 200-seed audit and the 11-rotation check on `core/avl`.
`- **Migrated:** `avl-trees` (`model.ts` keeps only the rotation game; `keys.ts` and `treeBox.ts` are gone), `red-black-trees` (`avlRef.ts`, `keys.ts`, `treeBox.ts` gone) and `skip-lists` (`parseKey`). Shots of the touched scenes are pixel-identical.
`
`### Small kit fixes — `Tray` array children, `core/testing/sqlite.ts`, `table-cards` CSS, `parseRows` noun
````tsx
`<Tray label="Frontier" empty="empty">{items.map((x) => x.live && <Chip key={x.id} />)}</Tray>   // every entry false: shows "empty"
````
````ts
`import { openSqlite } from '../../core/testing/sqlite';                 // tests only: node:sqlite behind a typed dynamic import
`const db = openSqlite<Record<string, Cell>>();                           // in-memory; the type argument is the row shape the test reads
`db.exec('CREATE TABLE t (id INTEGER)'); db.prepare('SELECT 1 AS n').all(); stmt.run(1); stmt.setReturnArrays(true);
`parseRows(text, { maxRows: 60, maxLineChars: 30, noun: { one: 'instruction', many: 'instructions' }, row });   // default rule / rules
````
````html
`<table class="xx-table table-cards"> … <td data-label="Column name">…</td> …   <!-- under 600px: one bordered card per row -->
````
`- **`Tray`** decides "has items" with `Children.toArray(children).length > 0`, so an array whose entries are all `false`, `null` or `undefined` (the `{cond && <Item />}` pattern over every item) shows the `empty` text like no children at all; any real entry, a `0` included, keeps it hidden. Test: `components/Panel.test.ts`.
`- **`core/testing/sqlite.ts`** is the same run-time `import()` shim `core/testing/node.ts` uses (no Node types in the app tsconfig), typed for what the tests call: `exec`, `prepare(...).all/run/setReturnArrays`. Test-only; never import it from app code. **Migrated:** query-planning, join-algorithms, normalization, orm-n-plus-one, relational-algebra (two files) and sql-aggregation-windows, which each carried their own 5 to 8 lines. Test: `core/testing/sqlite.test.ts`.
`- **`table-cards`** (in `kit.css`) is the responsive table: under 600px the header hides and each row becomes a bordered card whose cells read "Column name: value" from their `data-label`. A scroller around the table keeps its own `border: 0` in the lesson's CSS (one line), because a lesson's base border rule would outrank a kit one. The `table.table-cards` selector outranks a lesson's `.xx-table th, .xx-table td` padding. **Migrated:** halting-problem (both tables) and lambda-calculus; coverage-mutation-testing and computing-ethics use `data-label` for their own layouts and are untouched.
`- **`parseRows` `noun`** names a row in the over-limit sentences ("Line 8 is 63 characters; keep each instruction to 30 or fewer", "Line 61: more than 60 instructions; delete one first"). Default rule / rules, so turing-machines is unchanged; bytecode-vms passes instruction / instructions (its test now expects that wording). **`trailingComments: true` (T4-T8)** drops everything from the first comment marker on a line before the length check and before the row reader (so the comment is neither counted nor read as words, and a comment-only line is skipped); `parseKitRows` passes it through. Default off, so a marker inside a rule stays part of it and `turing-machines` and `bytecode-vms` are unchanged; use it only where the marker can never be a symbol. Saying so on screen is the lesson's own text.
`
`### Kit round wave 5 to 6, agent I — `convexHull` in `core/geometry`, `bytes()` binary units, `StageFrame introKey`, `smoke --scenes`
`
````ts
`import { convexHull, cross, orient, startAtLowestLeft, dedupePoints } from '../../core/geometry';
`convexHull(points)                          // Andrew's chain, corners only; keeps extra fields on the points
`convexHull(points, { policy: 'keep' })      // every point lying on an edge stays
`cross(o, a, b) // > 0 left turn, 0 collinear, < 0 right;  orient(o, a, b) // its sign: 1 / 0 / -1
````
`- With y up the polygon is counter-clockwise from the lowest, leftmost point; with y down (SVG) the same numbers wind it clockwise on screen, the drawn shape is identical. Under 3 distinct points, or all collinear, the points themselves come back (the two ends under `'drop'`).
`- convex-hull's `hull.ts` imports `cross`, `dedupe`, `startAtLowestLeft` and the order helpers from here (and re-exports them); its graham/andrew/jarvis stay local because they push every orientation test into a `Tally` for the stepper. strongly-connected-components' local chain is gone: `hull.ts` wraps the shared `convexHull`. Frames of both lessons are pixel-identical. Tests: `core/geometryHull.test.ts` (500 seeded sets against a brute-force oracle, both policies).
`- **`bytes(n, { iec: true })`** names the binary units `KiB`/`MiB`/`GiB`/`TiB` (dma-io-devices, io-models, mmap-page-cache say KiB when the lesson cares); without `iec`, and with `base: 1000`, the output is exactly what it was. No caller was changed.
`- **`StageFrame introKey`** (and `useIntroCaption`'s second argument) is now `string | number | DependencyList` and compared BY VALUE (`sameIntroKey`, `core/caption`): a fresh array, or a fresh object or nested array inside it, with the same contents no longer sets the caption again. A caption set re-renders the stage, so a key that changed on every render was an infinite loop (webassembly's `result.engine`, dma's `introKey={[r]}`). Functions, class instances and JSX in a key still compare by identity, so key on text or counts: `introKey={caption}` or `introKey={[mode, n]}`. Existing callers behave the same.
`- **`npm run smoke -- --scenes`** (`scripts/scenes.mjs`, logic and tests in `scripts/lib/scenes.mjs`): for each lesson, finds the scene picker: the radio group inside the stage frame labelled "Scene" (any case), else the first one (the `useScenePicker` / `Segmented` scene tabs; step tabs or a speed control placed before it are no longer mistaken for it), clicks each option in turn, listens to `console.error` and `pageerror` for `--idle` ms (default 3000), and fails on anything, naming a React "Maximum update depth exceeded" / "Too many re-renders" as `RENDER LOOP`. Flags: lesson ids as positional args, `--shard=2/4` (every 4th id from the 2nd, so shards cover every lesson once), `--idle=ms`, `--selftest`. Output is one `ok`/`FAIL` line per lesson plus `SCENES_SUMMARY {json}` for merging shards; exit 1 on a failure. Cost is scenes x idle per lesson (webassembly: 5 x 3 s), so run it on the lessons a change touched or in shards. `--selftest` loads a fixture page whose second tab spams the loop message and exits 0 only if that scene is caught as a render loop and the calm one is clean (the negative proof; `scenes.test.mjs` tests the verdict logic). It reads the whole page's console, so a lesson whose first radio group is not a scene picker is still exercised, just under a different name.
`
`## Tier 3 kit (kit round after wave 7: agent J)
`
`### `core/parseKit.ts` (K3-22) — regex-engines, parsing-algorithms, pushdown-automata, metaprogramming-macros (wave 8); bytecode-vms, dp-patterns, randomized-algorithms (migrated)
````ts
`import { cursorOf, parseBoundedList, parseKitLine, parseKitRows, tokenize, type TokenRule } from '../../core/parseKit';
`
`const TOKENS: TokenRule[] = [{ kind: 'arrow', pattern: /->/ }, { kind: 'word', pattern: /[\p{L}\p{N}_]+/u }];   // tried in order, first match wins; whitespace is skipped
`
`// One rule per line (limits, comments, nouns as parseRows). Each line is tokenized, then read with a cursor.
`const read = parseKitRows(text, {
`  tokens: TOKENS, maxRows: 40, maxLineChars: 40, noun: { one: 'transition', many: 'transitions' }, empty: 'Write at least one transition.',
`  row: (c) => {
`    const from = c.accept('word'); const input = c.accept('word');
`    if (!from || !input) return c.fail('expected: state input -> state');      // refuses at the next token, or just past the last
`    if (!c.accept('arrow')) return c.fail('expected "->"');
`    const to = c.accept('word');
`    return to ? { ok: true, value: { from: from.text, input: input.text, to: to.text } } : c.fail('a rule needs a next state');
`  },
`});
`// { ok: true, rows: [{ line, value }] } | { ok: false, line, column?, error: 'Line 3, column 7: expected "->"' }
`
`// One single-line field (a regex, a macro body): "Column 3: nothing to repeat" (place: 'position' says "Position 3: ...").
`parseKitLine(text, { tokens, maxChars: 24, empty: 'Type a pattern.', place: 'position', read: (c) => ... });
`// { ok: true, value } | { ok: false, error, column? }
`
`// A typed list with a count and a value range, refused by reason (parseIntegers returns only null):
`parseBoundedList(text, { min: 4, max: 8, lo: 1, hi: 12, noun: 'weights', messages: { notNumbers, tooFew: (n) => '', tooMany: (n) => '', outOfRange: (v) => '' } });
`// { ok: true, value: number[] } | { ok: false, error }
````
`- **No `eval`, `RegExp` on learner text or `new Function`**: the token rules are lesson-authored patterns, matched sticky and unicode-aware at the cursor; the learner's text is only ever the subject. A source test asserts parseKit never evaluates.
`- **Columns** are 1-based, count Unicode code points (one emoji is one column, a tab is one) and refer to the line as typed, indent included. Line length limits still count UTF-16 units, as `parseRows` does. A rule that is wrong as a whole can refuse with a plain `{ ok: false, error }` and gets "Line 3: ..." with no column.
`- **Cursor**: `peek`, `next`, `accept(...kinds)`, `rest()`, `atEnd()`, `fail(msg)` (at the next token), `failAt(token, msg)`. Tokens left over after a row returns are refused for you ("unexpected \"x\": nothing can follow here"). A token rule must never match the empty string (it is skipped as a non-match).
`- **Built on `parseRows`**, which gained an `indent` argument for the row reader and an optional `column` on a refusal ("Line N, column C: ..."); a reader that returns no column behaves exactly as before, so `parseTmTable` and its tests are untouched. `parseTmTable` may adopt `parseKitRows` later.
`- **Migrated**: bytecode-vms' assembler reads its words through `parseKitRows` (same limits and messages, no columns: its wording is pinned); dp-patterns' `parseItems` / `parseSequence` / `parseDims` and randomized-algorithms' `parseArray` use `parseBoundedList` with their own sentences, character-identical. Test: `core/parseKit.test.ts` (every refusal kind, unicode, tabs, NBSP, CRLF, empty, over-limit, a 1 MB line).
`
`### `longestPrefixMatch` in `core/ipv4` — routing-algorithms, bgp, cloud-networking-vpc, vpns-tunneling (waves 8 and 10)
````ts
`longestPrefixMatch(routes, addr)   // routes: { net, prefix, ...anything }[]; the matching route object itself, or null
````
`The route with the longest prefix whose block contains `addr`; a /0 default matches everything but loses to any other hit; two routes for the same block tie and the earlier one wins; host bits set in `net` are ignored (as `contains` does). Linear scan, order-independent apart from the tie rule. Test against a bit-string brute force over 300 random tables.
`
`### Two-sample KS (`core/distributions`), `bootstrapMeanInterval` and `gini` (`core/stats`) — model-evals-drift, recommender-systems (migrated)
````ts
`ksTwoSample(a, b)             // max |F1 - F2| of two samples (ties merged), 0 if either is empty
`ksAgainstSorted(day, sortedBaseline)   // same, sorting only `day`: sort the baseline once
`ksCritical2(n, m, c = KS_C_05)         // c * sqrt((n + m) / (n m)); 1.358 is the 5% constant, from memory
`bootstrapMeanInterval(values, 1000, seed)   // { lo, hi }: 95% percentile bootstrap of the mean, seeded
`gini(amounts)                 // 0 equal ... 1 - 1/n when one holds all; O(n^2)
````
``ksStatistic` (one sample against a cdf) is unchanged. Migrated results are identical (the lessons' pinned tests pass; only their import lines moved).
`
`### `bitLength` in `core/bits` — dp-patterns, modular-exponentiation, chinese-remainder (migrated)
````ts
`bitLength(255) // 8     bitLength(2 ** 40 - 1) // 40 (exact: no log2)     bitLength(10n ** 30n) // 100     bitLength(0) // 0, and 0 for negatives
````
`Number or bigint; exact for every safe integer; a fraction is floored. Replaces three copies (log2, `toString(2).length`, `Math.clz32(Number(x))`, the last of which was only right below 2^32).
`
`### `core/tfidf.ts` — rag-pipelines (migrated)
````ts
`const index = buildTermIndex(docsAsTermLists);   // vocab, df, idf = ln(N/df)+1, counts, lengths, unit TF-IDF vectors
`tfidfScores(index, queryTerms)                   // cosine per document; query terms must be in index.vocab
`bm25Scores(index, queryTerms, k1 = BM25_K1, b = BM25_B)   // Okapi BM25 per document; repeated query terms count once
````
`Scorers only: tokenising, stopwords and chunking stay with the caller (rag-pipelines' `Index` is `TermIndex` plus its chunks). llm-agents-tool-use keeps its documented simpler keyword rule on purpose. Tests: hand-worked scores and a per-document recomputation on 60 seeded corpora.
`
`### `HeapObject freedTone`
````tsx
`<HeapObject … variant="freed" freedTone="ok" />   // a freed block is --bad whatever `tone` says; freedTone overrides that (a correct free reads green)
````
`Without `freedTone` nothing changes. (The existing `tone` prop is ignored for a freed block, and callers pass it there today, so it could not become the override.) The freed tag now takes the box colour instead of a hard-coded --bad. Migration for after t3/b22 merges: ownership-refcounting drops its local `.heap-obj.rc-ok` class and passes `freedTone="ok"`.
`
`### `ClassifyBoard` + `core/classify` — undefined-behavior (migrated); chomsky-hierarchy, randomness-csprng (migrated)
````tsx
`const ITEMS: ClassifyItem[] = [{ id, label: ReactNode, text?: string, explanation?: ReactNode }];   // explanation => a "Why?" button
`const CATEGORIES: ClassifyCategory[] = [{ id, label }];                                              // 2 to 5 reads well; 5 wraps
`const [board, setBoard] = useState(() => emptyClassify(ITEMS));      // { answers: Record<id, categoryId | null>, checked }
`<ClassifyBoard items={ITEMS} categories={CATEGORIES} answerKey={KEY} value={board} onChange={setBoard}
`  labelFont="mono" verdict={({ right, sorted, correct }) => …} status="polite" groupLabel={(item) => …} />
`classifyScore(ITEMS, KEY, board.answers)   sortedCount(ITEMS, board.answers)   // for the stage's captions and stats
````
`Controlled: the lesson owns `value`, so captions, `Stat`s and `introKey` read it directly; Check and Reset (which also closes every "Why?") go through `onChange`, and choosing a category un-checks the board (`pickCategory`). Each item is a `role="radiogroup"` with roving tabindex and arrow/Home/End keys (`useRadioGroup`), named `Category of <text | string label | id>` unless `groupLabel` says otherwise. Per-item verdicts are plain spans: the score line ("3 of 8 right", once per Check) is the only live region, so a screen reader hears one announcement, not eight; `status="off"` silences even that for a stage that announces through its caption. `verdict` defaults to "Right." / "Not quite: it is X." / "Not sorted: it is X." (X lower-cased). `labelFont="mono"` draws labels as `<code>` (snippets, grammars). Classes are `classify-*` in `components/classifyBoard.css`. threat-modeling's drop-a-control interaction differs and stays local. Pixel-identical for undefined-behavior (`--frames` diff plus a driven shot of the checked, revealed scene).
`
### `ClassifyBoard mode="explore"` (K4-10) — build-vs-buy, conways-law (T4-B8), reversible-decisions (T4-B9)
```tsx
const [board, setBoard] = useState(() => emptyClassify(ITEMS));
<ClassifyBoard mode="explore" items={ITEMS} categories={STAGES} value={board} onChange={setBoard}
  reference={{ email: 'commodity', search: 'product' }} />       // `reference` optional; answerKey / verdict are not accepted in this mode
const groups = placementsByCategory(ITEMS, STAGES, board.answers);   // { genesis: ['search'], custom: [], ... }, items in order, empty categories listed
allSorted(ITEMS, board.answers)                                   // true once every item has a category
```
The same radio rows as the keyed board (roving tabindex, arrows/Home/End, `groupLabel`, "Why?" explanations), but there is no right answer: no Check button, no score, no per-item verdict, no `is-right`/`is-wrong` rows, and a stale `checked` flag is ignored. The status line (the only live region, silenced by `status="off"`) reads "n of N placed". `onChange` hands the lesson the same `ClassifyState`; the lesson's pure model reads `answers` (or `placementsByCategory`) and derives its numbers. With a `reference` the board shows a "Show one reference" button (`softDisabled`: `aria-disabled`, still focusable, never drops focus) that does nothing until every item is placed, and says "place every item to see a reference". Once placed, it reveals "Reference: <category>" under each item next to a `ClaimLabel kind="view"` ("one view, not the answer"); the button becomes "Hide the reference" in place, so focus never leaves it, and Reset hides it again. It never marks the learner's placement as matching or not. The keyed (default) mode renders byte-identical markup to before (checked by comparing server markup before and after the change, plus `smoke --frames` and `diff` on undefined-behavior, chomsky-hierarchy and randomness-csprng). Tests: `ClassifyBoard.test.ts` (explore markup) and `classify.test.ts` (the no-key path). `#/dev/kit` shows it with the 7-point map and the DPLL stepper.

`### `core/signal.ts`, `core/dct.ts` (K3-21) — fourier-transform, lossy-compression (wave 9)
````ts
`import { cx, dft, idft, fft, ifft, newOpCount, magnitudes, phases, conjugatePartner, window, applyWindow, aliasOf, mse, psnr, energy } from '../../core/signal';
`import { dct, idct, dct2, idct2, dctMatrix, scaleQuantTable, JPEG_LUMA_TABLE, quantise, dequantise, zigzagOrder, zigzag, unzigzag, splitBlocks, joinBlocks, mapBlocks, levelShift, roundTripBlock } from '../../core/dct';
````
`- **Signals** (`signal.ts`): samples are `Complex` (`{ re, im }`; `cx`, `cAdd`, `cMul`, `cConj`, `cAbs`, `cArg`, `cExp`, `fromReal`, `realParts`). `dft(x)` is the definition (any length, N² multiplications); `fft(x)` is radix-2 (power of two or `RangeError`), the same numbers in `(N/2)·log2 N` multiplications. `idft` / `ifft` carry the 1/N. Pass `newOpCount()` as the last argument and read `.complexMuls` / `.complexAdds` for a **counted** work readout (measured from the run, not a formula). Convention `X[k] = sum x[n] e^(-2 pi i k n / N)`.
`- `magnitudes(X)`, `phases(X, floor?)` (a bin under `floor` reads phase 0, not rounding noise), `conjugatePartner(k, N)` (`(N-k) % N`: remove both bins to keep a real signal real), `energy` (Parseval: `energy(x) = energy(X)/N`), `aliasOf(f, fs)` (`|f - round(f/fs)·fs|`).
`- `window('rect' | 'hann' | 'hamming', N, { symmetric? })` is periodic by default (the right shape for spectrum analysis); `applyWindow(x, w)`. `mse(a, b)`, `psnr(a, b, peak = 255)` (Infinity when identical: say so on screen instead of dividing).
`- **Blocks** (`dct.ts`): `Grid` = rows of numbers. `dctMatrix(n)` is the orthonormal DCT-II matrix (`C·Cᵀ = I`); `dct` / `idct` are 1D DCT-II / DCT-III; `dct2` / `idct2` are the 2D `C·X·Cᵀ` and its inverse for any square block (8 for JPEG), energy-preserving. `levelShift(block, by = 128)`.
`- JPEG helpers: `JPEG_LUMA_TABLE` (T.81 Annex K Table K.1), `scaleQuantTable(table, quality)` (libjpeg rule with its integer division: scale = floor(5000/q) below 50, 200-2q from 50 up, then floor((entry*scale+50)/100) clamped to 1..255; quality clamped to 1..100; quality 50 is the table; from memory of jcparam.c, verify against the libjpeg source), `quantise` / `dequantise` (round half away from zero), `zigzagOrder(n)` / `zigzag` / `unzigzag`, `splitBlocks(image, 8)` → `[blockRow][blockCol]`, `joinBlocks`, `mapBlocks(image, f)`, `roundTripBlock(block, table)` → `{ levels, reconstructed }` (not rounded or clamped; the lesson decides where to round).
`- Tested against independent oracles written in the test files (the DFT and DCT definitions with their own trig, a published zig-zag table, the Wikipedia JPEG worked block with DC -415.375 recomputed by hand). Demo block in `#/dev/kit` (`DevKitTier3l`). Nothing here is drawn: plot with `Plot2D` `Bars`/`Curve`, grids with `CellGrid`.
`
`### `core/raster3d.ts`, `core/raster.ts`, `core/raytrace.ts` (K3-20) — 3d-transforms-projection, gpu-rendering-pipeline, ray-tracing (wave 9); `rasterization` (migrated)
````ts
`import { lookAt, perspective, ortho, compose, translation, rotationY, scaling, transform, projectToScreen, unproject, clipTriangle, clipPolygon, fanTriangles, ndcDepthAt, quantiseDepth, depthResolution } from '../../core/raster3d';
`import { coveredPixels, barycentric, interpolateLinear, interpolatePerspective, renderTriangles, blendOver } from '../../core/raster';
`import { makeScene, makeCamera, renderImage, traceRay, nearestHit, intersectSphere, intersectTriangle, lambert, phong, newTraceStats } from '../../core/raytrace';
````
`**Convention (say it once on screen):** right-handed, the camera looks down -z, OpenGL clip space (NDC z -1 near to +1 far), screen y down, matrices are core/vec `Mat` (row-major, `M·p`). Direct3D and Vulkan differ in the z range and y direction.
`- **`raster3d`**: tuple `Vec3`/`Vec4` helpers (`add3 sub3 scale3 dot3 cross3 length3 normalize3 reflect3 lerp3`); model matrices `translation scaling rotationX/Y/Z`, `compose(T, R, S)` (applies S first), `det4`, `inverse4`, `transform(m, p, w = 1)` (w 1 = point, 0 = direction). Camera: `lookAt(eye, target, up)` (null when eye = target or up parallel to the view: "look-at needs a direction"), `perspective(fovY, aspect, near, far)` and `ortho(l, r, b, t, n, f)` (throw `RangeError` for a frustum that cannot exist). `projectToScreen(mvp, p, w, h)` → `{ clip, w, ndc, screen, inFrustum, behind }`: for `w < 0` the NDC is the mirrored result a missing clip step would draw, null only when `w = 0`; `ndcToScreen`, `unproject(inverse, ndc)`.
`- **Clipping**: `clipTriangle([ClipVertex x3], planes?)` / `clipPolygon` is Sutherland-Hodgman in clip space against `CLIP_PLANES` (or the subset you pass: clipping "off" is `[]`); inside means `-w <= x, y, z <= w` (`planeDistance`, `isInsideFrustum`). A `ClipVertex` is `{ clip, attrs, created? }`; `created` marks new vertices on a plane for the lesson to list; attributes interpolate linearly in clip space; `fanTriangles(polygon)` re-triangulates.
`- **Depth precision**: `DEPTH_BITS = 24`, `ndcDepthAt(distance, near, far)`, `quantiseDepth(ndcZ, bits)`, `depthResolution(distance, near, far, bits)` (one step in eye distance, about `d² / (near·2^bits)` for far >> d >> near).
`- **`raster`** (screen space, y down, pixel centres): `edgeFunction`, `area2`, `wind`, `isTopLeft`, `barycentric` (the rasterization lesson now imports these), `coveredPixels(tri, w, h)` → `{ x, y, bary }[]` with the top-left rule (weights follow the vertex order given), `interpolateLinear` vs `interpolatePerspective(attrs, bary, w3)` (the toggle in gpu-rendering-pipeline scene 3), `renderTriangles(tris, w, h, { order?, earlyZ? })` → `{ id, depth, coveredFragments, shaderInvocations }` (strict-less z-test; the picture is order-independent, the invocation count is not), `blendOver(src, alpha, dst)`.
`- **`raytrace`**: `intersectSphere / Plane / Triangle` return the normal facing against the ray (`inside` for a ray starting in a sphere; tangent rays hit once); `lambert`, `phong`; `makeScene(objects, light, { bvh })` (spheres go in a median-split `buildBvh`, planes are always tested), `nearestHit`, `occluded` (shadow rays, early exit), `makeCamera` (null when degenerate), `cameraRay`, `traceRay(scene, ray, { lighting, shadows, maxBounces, bias })` and `renderImage(scene, camera, w, h, settings, stats?)` → `{ pixels (0..1), testsPerPixel }`. `TraceStats` counts `objectTests` and `boxTests` where they run. Bias 0 gives shadow acne (a test pins it); the BVH matches brute force pixel for pixel. Bound for a default render: at most `2 · pixels · objects · (1 + maxBounces)` object tests (each camera or mirror ray is followed by at most one shadow ray).
`- Paint images with `paintImage` (`components/canvasImage`); canvas lessons render on demand, not in a loop. Demo blocks in `#/dev/kit` (`DevKitTier3l`).
`
`## Tier 3 kit (wave 8 to 9 extraction round: kit-M)
`
`### `core/semver.ts` — dependency-management (origin), monorepo-polyrepo (test); supply-chain-security (migrated)
````ts
`import { parseVersion, formatVersion, compare, parseRange, satisfies, satisfiesParsed, explainMatch, maxSatisfying, explainRange } from '../../core/semver';
````
`npm's version and range rules (node-semver defaults): `^`, `~`, X-ranges, hyphen ranges, `||`, pre-releases excluded unless the range opts in, build metadata ignored. `satisfies(version, range)` / `maxSatisfying(versions, range)` take strings and return false / null for text that does not parse; `explainMatch` says `'match' | 'outside' | 'prerelease' | 'invalid'`; `explainRange` is the plain-words reading. Moved from `lessons/dependency-management/semver.ts` unchanged, with its tests (`core/semver.test.ts`).
`
`### `core/editDistance.ts` — edit-distance (origin); supply-chain-security (Levenshtein, migrated)
````ts
`import { editTable, pick, LEVENSHTEIN, INDEL, type Costs, type Table, type Candidates, type Source } from '../../core/editDistance';
`const t = editTable('kitten', 'sitting');   // { a, b (code points), d[i][j], cands[i][j] (left/up/diag/match/win) }
`t.d[t.a.length][t.b.length];                 // 3
````
`Weighted Levenshtein DP over code points. `Costs` is `{ ins, del, sub }`; `LEVENSHTEIN` is 1/1/1 and `INDEL` prices a substitution as delete plus insert (the distance an LCS diff minimises). Ties in a cell go to a match, then (when `sub >= ins + del`) to delete/insert, else to the substitution, then delete before insert (`pick`). The traceback, replay and line diff stay in `lessons/edit-distance/model.ts`; they take a `Table`.
`
`### `core/regex/` — regex-engines (origin); redos (migrated)
````ts
`import { parsePattern, parseSubject, matchAt, searchLeftmost, buildNfa, runNfa, subsetSizes, candidateMatches } from '../../core/regex';
`// or the single modules: ./parse, ./backtrack, ./thompson, ./automaton (index.ts re-exports all four)
````
`A small regex dialect (literals, `.`, `|`, `* + ?`, groups, simple sets, `\1`..`\9`), parsed by hand through `core/parseKit` (no learner text reaches `RegExp`, `eval` or `new Function`; every refusal names its position) and two ways to run it.
`- **`parse`**: `parsePattern(text)` → `{ ok, value: { source, root: RegexNode, groups, usesBackref } }` or a positioned error; `parseSubject(text)` → code points (line breaks refused, so both engines read `.` alike). Limits `MAX_PATTERN_CHARS` / `MAX_SUBJECT_CHARS` = 24 (a dialect limit a lesson may display). `nodesInOrder`, `nodeText`, `countParts` read the tree; node `id`s are post-order.
`- **`backtrack`**: `matchAt(root, subject, from, opts)` and `searchLeftmost(root, subject, opts)` (what `RegExp.exec` returns; the budget is shared across starts). Options: `budget` (required; `status: 'budget'` on exhaustion, never a plain `'fail'`), `mustEnd`, `traceLimit` (first N attempts) or `traceTail` (last N: where a blow-up ended; `traceLimit` wins if both are set). A STEP is one attempt of one node at one position; the count describes this matcher only. Result: `status`, `start`/`end` (-1 unless matched), `steps` (the budget when it ran out), `trace` (events with `ok: true | false | null`, null = still open when the budget hit), `traceTruncated`, `perStart` (`{ start, steps }` per start tried; on `'budget'` the last entry is the start that ran out) and `captures` (on a match: `[whole, group 1, ...]` spans, null for a group that did not take part; `[]` otherwise).
`- **`thompson`**: `buildNfa(parsed, { skipStarShortcut? })` → the Thompson `Construction` (`nfa`, `edges`, layout via `placeNfa`) or the refusal for a back-reference (`BACKREF_REFUSAL`); `constructionOf`, `patternAlphabet`, `symbolOf` (`ELSE` stands for any character a `.` alone can match), `epsilonCount`, `predictedStates`, `predictedEpsilons`. **`automaton`**: `runNfa(c, subject, 'full' | 'search')` (state sets, `work`, `accepted`), `matchEndsFrom`, `candidateMatches` (leftmost start and every end the NFA allows), `dfaAccepts`, `subsetSizes(c, cap = DFA_STATE_CAP)` (stops past the cap: a typed pattern can need millions of DFA states).
`- **Caveats for a longer-subject lesson.** The matcher is recursive: depth is about subject length x pattern depth, safe at the 24-character caps, not for long subjects (needs an iterative matcher or a depth guard). It follows ECMAScript with two exceptions: the parser refuses a back-reference to a group that is not closed yet (ECMAScript allows forward and self references), and `.` refuses `LINE_TERMINATORS`. Tests: \`core/regex/regex.test.ts\` (40-pattern bank in \`regexBank.ts\`, real \`RegExp\` as the oracle on lesson-authored patterns only). regex-engines migrated unchanged; its lesson-specific numbers (\`STEP_BUDGET\`, growth table, work series, which-match answer) stay in \`lessons/regex-engines/engines.ts\`.
`
`### `core/countMin/` — count-min-heavy-hitters (origin), hot-keys-skew
```ts
import { newSketch, makeFamily, update, estimate, addSketches, widthFor, depthFor, epsilonOf, deltaOf, zipfStream, exactCounts, exactTop, keyOfRank, sketchOf, heavyRun, quality, memory, UNIVERSE, TOP_K } from '../../core/countMin';
```
- **`sketch`**: a Count-Min sketch of `w` columns x `d` rows over `Int32Array` counts. `makeFamily(seed, d)` is the seeded multiply-add hash family mod the prime 2^31-1 (`mulmod` is exact, no 2^53 overflow), `itemKey(name)` the FNV key of a string, `newSketch(w, d, fam)`, `update(s, key, delta = 1)` (a negative delta is the "delete" the break scene abuses), `estimate(s, key, 'min' | 'mean')`, `cellsOf` / `cellValues` (the d cells an item touches), `addSketches` / `sameGrid` (merging needs the same family), sizing `widthFor(epsilon)` = ceil(e/eps), `depthFor(delta)` = ceil(ln(1/delta)), `epsilonOf(w)`, `deltaOf(d)`. Limits `MIN/MAX_WIDTH`, `MIN/MAX_DEPTH`.
- **`ranks`**: items are Zipf ranks (0 most popular), named `item<rank>`: `zipfStream(n, skew, seed, universe = UNIVERSE)`, `exactCounts`, `exactTop(counts, k)` (ties to the lower rank), `keyOfRank` (cached hash key), `sketchOf(stream, w, d, hashSeed)`.
- **`heavy`**: `heavyRun(stream, w, d, hashSeed, upTo, k = TOP_K)` → `{ sketch, heap (<= k candidates), events (enter/evict), seen }`: each item updates the sketch and enters the candidate set if its estimate beats the smallest; `quality(stream, state, k)` (precision, recall, true top) and `memory(stream, state)` (distinct items vs d x w counters).
Moved unchanged from `lessons/count-min-heavy-hitters/{sketch,heavy,stream}.ts`; the lesson keeps its stream defaults, slider limits, `errorRun` (the deliberately broken variants) and the merge and grid models. hot-keys-skew imports `heavyRun` from here. Tests: `core/countMin/countMin.test.ts` (hash family chi-square, the min estimator against a recomputation, Zipf pmf, heavy-hitter recall over 50 seeds).

### Automata extras: `core/automataMinimize`, `core/pdaPresets`, `core/pdaStepper`, `core/automataDuel`, `core/tmTables` — chomsky-hierarchy, pushdown-automata, halting-problem, turing-machines
```ts
import { refine, finalPartition, distinguishing, quotient, reachable, prefixClasses, EXAMPLES } from '../../core/automataMinimize';
import { PRESETS, presetById, build, ruleText, checkSubject, BOTTOM } from '../../core/pdaPresets';
import { stepRun, describeRejection, CONFIG_BUDGET } from '../../core/pdaStepper';
import { boundedCounter, placeCounter, wordAnBn, duel, firstDisagreement, pigeonhole, pdaAccepts } from '../../core/automataDuel';
import { INCREMENT_REFERENCE, PALINDROME_REFERENCE, ANBNCN, WW, PRIME } from '../../core/tmTables';
import { mustParseTm } from '../../core/tm';
```
All moved unchanged from the lessons that owned them; nothing else in `src/lessons` imports another lesson's folder for these any more.
- **`automataMinimize`** (DFA minimisation, Moore partition refinement on `core/automata` `Dfa`): `reachable(dfa)`, `refine(dfa)` → `Partition[]` (`{ classOf, count }`; round 0 is accepting vs rejecting, the last round is stable), `finalPartition`, `distinguishing(dfa, p, q)` (the shortest string accepted from one state and rejected from the other, BFS over state pairs; null when they behave alike), `className`, `quotient(dfa, partition)` (the minimal DFA), `prefixClasses(member, alphabet, prefixes, maxSuffix)` (Myhill-Nerode count for a language given only by a membership test) and `EXAMPLES`, two DFAs written with redundant states (counts mod 3 in 6 states, ends-in-ab with duplicates; both minimise to 3).
- **`pdaPresets`**: four pushdown automata as rules plus an independent `member` predicate: `PRESETS` (`anbn`, `brackets`, `brackets2`, `wwr`), `presetById`, `build(preset, 'final-state' | 'empty-stack')` → `{ pda, accept }` (adds the finishing move), `ruleText`, `checkSubject` (14 characters over `a b ( ) [ ]`). **`pdaStepper`**: `stepRun(pda, input, accept)` → frames of live configurations (which rules fired, how many died, whether an accepting configuration is live), `describeRejection`, `CONFIG_BUDGET` = 5000 (a run past it reports `budget-exhausted`).
- **`automataDuel`**: `boundedCounter(k)` is the 2k + 2 state DFA for {a^n b^n : n <= k} (states a0..ak, b(k-1)..b0, dead), `placeCounter` its drawing positions, `wordAnBn(n)`, `pdaAccepts(word)` (the a^n b^n PDA), `duel(k, n)`, `firstDisagreement(k)` (k + 1 by construction, within n <= `MAX_N` = 12), `pigeonhole(dfa)` (the first repeated state reading a's).
- **`tmTables`**: `INCREMENT_REFERENCE` and `PALINDROME_REFERENCE` (table text in the syntax a learner types, parse with `mustParseTm`, which throws on a mistake and now lives in `core/tm`), and the generated machines `ANBNCN`, `WW`, `PRIME` (a^n with n prime; steps grow fast: 1,304 at n = 11, 10,420 at n = 23 and 20,204 at n = 29 (measured), so pass a `maxSteps` above the chomsky card's 20,000 for inputs past about 28). `lessons/turing-machines/model.ts` keeps its starters and the broken variants of the increment table.
- Tests: `core/automataMinimize.test.ts` (brute-force Myhill-Nerode on 200 seeded random DFAs), `core/pdaPresets.test.ts` (exhaustive vs the reference predicates in both acceptance modes), `core/automataDuel.test.ts`, `core/tmTables.test.ts` (BigInt increment, palindrome, a^n b^n c^n, ww and primality oracles). `core/testing/strings.ts` `stringsUpTo(alphabet, max)` is the exhaustive-input helper these use (older lesson tests still carry local copies; see docs/tier3-kit-requests.md).

### `core/sat.ts` (K4-4) — np-reductions, sat-solvers (wave 1); formal-methods (bounded-check toy)
```ts
import { parseCnf, dpll, bruteForce, replayTrace, startDpll, unitStep, decide, backtrack, autoStep, pickVariable,
  encodePackages, unsatCore, randomCnf, formatCnf, clauseText, clauseStatus, type Cnf } from '../../core/sat';

const F2: Cnf = { vars: 5, names: ['a','b','c','d','e'], clauses: [[-1,2],[-2,3],[-3,4],[-4,-1],[1,5],[-5,-2]] };   // literal +v / -v, variables 1-based
const r = dpll(F2, { heuristic: 'first' });   // or 'most-occurring'
// r = { sat, model: boolean[] | null (model[v-1]), trace: SatEvent[], stats: { branches, propagations, conflicts } }
// trace events: decide {var,value,flipped} | propagate {var,value,clause} | conflict {clause} | backtrack {var} | sat {model} | unsat
replayTrace(F2, r.trace);                       // { ok: true, sat, model } or { ok: false, error, at }: re-checks every event, no heuristic
bruteForce(F2);                                 // { satisfiable, count, model }: the oracle; models(cnf) is a generator of every model
parseCnf('a or not b\n(c) and (d or -a)', { clauseLength: { min: 3, max: 3 }, variables: ['x1','x2'], refuseTautology: true });
// { ok: true, cnf } | { ok: false, line, column?, error: 'Line 2, column 6: ...' }
```
- **Counting convention (pinned):** a *branch* is each tried value of a decision variable (flipping counts again); a *propagation* is each forced assignment; a *conflict* is each falsified clause found. Propagation scans clauses in order and stops at the first clause that is falsified (conflict) or unit (force), then rescans from clause 1. Values are tried true first; backtracking is chronological (flip the latest decision not yet flipped). The search stops the moment every clause is satisfied; unassigned variables read false in the model. Hand-checked vectors in `sat.test.ts`: F2 gives 3 branches, 6 propagations, 1 conflict; the sat-solvers formula H gives 106 / 67 / 54 (first-unassigned) and 2 / 2 / 2 (most-occurring); a unit chain gives 0 branches.
- **Heuristics:** `'first'` = lowest unassigned variable; `'most-occurring'` = most occurrences (both signs) in not-yet-satisfied clauses, ties to the lowest index.
- **Stepping by hand** (the learner drives): `startDpll(cnf)` gives a `DpllState` (`values[v]`, `trail` with the forcing clause, `stats`, `trace`, `conflict` clause or null, `outcome`). `unitStep(s)` does one propagation or finds the conflict (null when neither); `decide(s, v, value)` returns `{ ok, state }` or `{ ok: false, reason: 'assigned' | 'pending-conflict' | 'unknown-variable' | 'finished', error }` (use it for the "b is already forced" refusal); `backtrack(s)` flips the latest unflipped decision or ends in `unsat`; `autoStep(s, heuristic)` is what `dpll` loops. A "broken: never flips" mode is a three-line loop over these (on conflict, stop with unsat): the kit does not ship a flag for it. Iterative, so depth is no concern.
- **Limits** (`SAT_LIMITS`: 16 variables, 64 clauses, 8 literals per clause; `checkCnf(cnf)` names the problem). `bruteForce`, `models`, `startDpll` and `dpll` throw `RangeError` above them; `parseCnf` refuses with a position and cannot be raised above them (its `maxVars` / `maxClauses` only lower them). Lessons cap their own editors lower (10 variables; np-reductions 4 variables and 5 clauses).
- **`parseCnf`** goes through `core/parseKit`: `or` / `|` joins literals, `and` / `&` joins clauses on a line, `not` / `!` / `~` / `-` negates, parentheses optional, `#` comments. `variables` fixes the table (an unknown name is refused: `"x5" is not one of the allowed variables (x1, x2, x3, x4).`), `clauseLength` enforces 3-SAT (`a clause needs exactly 3 literals, and this one has 2.`), `refuseTautology` gives `x1 and not x1 in one clause is always true: leave it out.` Nothing is evaluated. `formatCnf(cnf)` prints what it reads.
- **Packages:** `encodePackages({ packages: { lib: { '1.0.0': { util: '*' }, ... } }, root: { lib: '*' } })` gives `{ cnf, variables, origins }`: one variable per (package, version), root ranges as "one of the matches", pairwise "at most one version", and "not this version, or a matching one" per requirement (ranges via `core/semver`; an invalid range throws). `origins[i]` says why clause i exists, for plain-words glosses. `unsatCore(cnf)` is the deletion core (indices of the clauses that remain; null when satisfiable).
- `randomCnf(rnd, vars, clauses, k = 3)` is the seeded random k-SAT generator (distinct variables per clause, ascending). Gate in `sat.test.ts`: DPLL equals brute force on 1,000 seeded formulas of 3 to 10 variables for both heuristics (satisfiability, model validity by an independent evaluator, and every trace replays to the same verdict), with more than 150 satisfiable and more than 150 unsatisfiable so the agreement is not trivial.

### `core/tsp.ts` (K4-5) — approximation-algorithms, local-search-annealing (wave 1)
```ts
import { distanceMatrix, randomPoints, tourLength, primMst, heldKarp, twoOptStep, twoOpt, doubleTreeTour, christofidesTour,
  minWeightPerfectMatching, eulerCircuit, shortcut, MAX_HELD_KARP, MAX_MATCHING_VERTICES } from '../../core/tsp';

const dist = distanceMatrix(points);                 // number[][]; or hand-edit a matrix to break the triangle inequality
primMst(dist)            // { edges: [parent, child][] in the order Prim added them, weight }
heldKarp(dist)           // { length, tour } the exact optimum from vertex 0; throws RangeError above 12 points
twoOptStep(dist, tour)   // the first improving move, or null: { i, j, delta, tour }
twoOpt(dist, tour, { maxMoves? })   // { tour, moves: TwoOptMove[], length }: the step trace, each move with its delta
doubleTreeTour(dist)     // { tour, length, mst }: preorder of the MST from 0, children in index order
christofidesTour(dist)   // { tour, length, mst, odd, matching: { pairs, weight }, circuit }
```
- **Everything reads a distance matrix**, so the lesson owns the geometry: Euclidean points via `distanceMatrix`, or a matrix edited cell by cell (the spec's star at M = 100). `randomPoints(rnd, n, size = 100)` is the seeded map. A tour is a permutation read as a closed cycle; `tourLength` closes it.
- **2-opt move** reverses positions `i + 1 .. j` of the tour, replacing edges (tour[i], tour[i+1]) and (tour[j], tour[j+1]) by (tour[i], tour[j]) and (tour[i+1], tour[j+1]); `delta` is new minus old length (negative = shorter). `twoOptStep` scans i ascending then j ascending and takes the first move that beats 0 by more than `IMPROVE_EPSILON` (1e-9), so a Step button shows exactly the move and delta the model made. Crossed square 0, 2, 1, 3 goes 9.6569 to 8 in one move of -1.6569.
- **Pinned tie-breaks** (so a lesson's hand-worked tour reproduces): Prim adds the lowest-index nearest vertex via the lowest-index parent; the doubling tour visits children in index order; the matching DP keeps the first of equal-weight pairings; the **Euler circuit takes the unused edge to the smallest-index neighbour first** (Hierholzer, returned in traversal order, closed), and Christofides shortcuts it to first visits. On the spec's 7-point map: circuit `0 5 4 1 2 3 2 6 0`, tour `0 5 4 1 2 3 6`, 29.2517 against the optimum 26.7612 (ratio 1.0931), doubling 35.3858 (1.3223), tree 20.8972.
- **Limits:** `heldKarp` 12 points (2^11 subsets); `minWeightPerfectMatching(dist, vertices)` an even count of at most 12 (a map of at most 12 points never exceeds that). Both throw `RangeError` naming the limit.
- **The guarantees need the triangle inequality.** The bounds are asserted on 1,000 seeded Euclidean maps (doubling at most 2x the optimum, Christofides at most 1.5x, tree at most the optimum) as "a bound on those maps, not a proof", and a planted non-metric star at M = 100 gives ratio 31.31 so that test can fail. Held-Karp equals brute force for n up to 8, Prim equals Kruskal (`core/disjointSet`), the matching equals the best of all pairings, and after `twoOpt` no segment reversal shortens the tour (recomputed tour by tour).

### `core/vertexCover.ts` (kickoff decisions §4) — np-reductions, approximation-algorithms (T4-B3)
```ts
import { minVertexCover, maximalMatching, canAddToMatching, isMaximalMatching, matchedVertices, isVertexCover, uncoveredEdges,
  type Edge } from '../../core/vertexCover';

const K33: Edge[] = [[0,3],[0,4],[0,5],[1,3],[1,4],[1,5],[2,3],[2,4],[2,5]];      // n vertices 0..n-1, an edge is named by its index
minVertexCover(6, K33)                  // { size: 3, cover: [0, 1, 2] }: exact, ascending, deterministic
maximalMatching(K33)                    // { edges: [0, 4, 8] (indices), vertices: [0..5] }: scan edges smallest index first
maximalMatching(edges, [1, 0, 2])       // same greedy in another order: the result depends on it (maximal, not maximum)
canAddToMatching(K33, [0], 1)           // { ok: false, vertex: 0 } for "vertex 0 is already matched", or { ok: true }
isMaximalMatching(K33, [0, 4])          // false: edge 8 could still be added
isVertexCover(edges, set)   uncoveredEdges(edges, set)   // edge indices left uncovered (the broken one-endpoint witness)
```
- **Exact:** branch and bound on the highest-degree vertex (ties to the lowest index): take it, or take all its neighbours; pruned by a maximal-matching lower bound. The first optimum reached is returned, taking the vertex first, so K3,3 gives {0, 1, 2} and the star gives its centre. Throws `RangeError` above `MAX_EXACT_VERTICES` (30), on a loop, or on an out-of-range endpoint. np-reductions' gadget graph for 4 variables and 5 clauses has 23 vertices.
- **2-approximation:** `maximalMatching(edges).vertices` (both endpoints of every matching edge) is a cover of at most twice the optimum. It is not the learner's click order: for a learner-built matching use `canAddToMatching` per click and `isMaximalMatching` before "Done", then `matchedVertices(edges, chosen)`.
- **Tests (`vertexCover.test.ts`)**: against a separately written bitmask brute force on EVERY graph with up to 6 vertices (each labelled edge subset: 1 + 1 + 2 + 8 + 64 + 1,024 + 32,768) and 500 seeded graphs of 7 to 11 vertices; the bound `|matching vertices| <= 2 * OPT` on both, reached exactly (ratio 2) on a 1,000-graph seeded set; the spec fixtures (K3,3, path, triangle, star); and the reduction's own property, minimum cover at most K = n + 2m exactly when `core/sat` brute force says the formula is satisfiable, on 100 seeded gadget graphs.

## Not built (deliberately)
`
`- **heaps on `TreeSvg`:** see above; its complete-binary, index-keyed layout stays local. (`SlotStrip` shipped as `ArrayStrip`.)
`- **Multi-state `CodePanel` lines:** requested in Phase 2 and declined; lessons that need more line states keep a small local override.
`- **`CompareRows`:** not built.
`- **A shared value-scaled `BarStrip`:** not built. monotonic-stack's bar chart is SVG with answer arrows, a sliding window, rectangle overlays and an index row tied to its own geometry; ArrayStrip is HTML cells. A BarStrip on ArrayStrip's states wouldn't replace it without re-drawing the lesson, and amortized-analysis doesn't need bars. Revisit if a second lesson wants plain value bars.
`- **web-request's waterfall on `GanttLanes`:** it's one stacked bar whose segments grow with
`  motion springs, plus a legend, not lanes on a time axis. Moving it would swap flex for absolute
`  positioning and the spring for a linear transition, so it couldn't be pixel-identical. It stays local.
`- **Migrating the remaining local joiners to `core/format` `joinList` (T4-T8):** declined. 27 signed-off lessons print the same text through their own helpers, a few with edge cases that differ ('nothing' for an empty list, number lists); a rewrite risks changing signed-off captions for no Tier 4 benefit. New lessons use `joinList` from the start.
- **Migrating the local `allStrings`/`strings` test helpers to `core/testing/strings` `stringsUpTo` (T4-T8):** declined. Test-only duplication in signed-off lessons, with no behaviour to gain. New Tier 4 tests import `stringsUpTo`.
- **Per plan §6:** a scene engine, `DataTable`, `KeyValue`, `EventLog`, `ChipChoice` and `CanvasStage`.
`
`Revisit any of these when a second, genuinely similar lesson needs one.
`
`## Known flaky screenshot frames
`
`These differ between runs even on unchanged code, because a motion transition is still settling
`1.5 s after the seek. Treat them as eyeball-only:
`- `db-indexes@2`
`- `replication@3`, `replication@7`
`- `ci-pipelines@0`, `endianness@0`, `minimum-spanning-trees@0` (seen in kit-k4's run)
`- `macs-hmac@0`, `@2`, `@4`: the key comes from `crypto.getRandomValues`, which `--frames` doesn't seed,
`  so the tag bytes differ every run (~0.5%; seen in kit-k5's run, same tree twice)
`- every `@live` shot (simulations are timing-dependent)
`- driven shots of a stage with a `WideRegion` at 390: its "swipe" hint times out after 5 s, so a
`  shot taken around then may catch it mid-fade
`
`Motion-lib infinite loops no longer cause flakes: `Pulse` holds still under the reduced motion
`that `smoke --frames` turns on.
