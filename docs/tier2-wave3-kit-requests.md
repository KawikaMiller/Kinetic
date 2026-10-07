# Wave 3 Phase 2 requests (for the wave 3→4 kit round, along with K-21 ColorField + core/contrast)

## B7 (merged)
- **CellGrid canvas mode:** stroke outline and tint cells in their tone, matching the SVG rules. conditional-bayes uses a faint tint instead of outlined negatives.
- **Plot2D:** a draggable `VLine` (`onDrag`, `onStep`, `role="slider"`, `ariaLabel`, `valueText`). classification-metrics has a ~40-line local ThresholdLine.
- **core/stats:** `logCheckpoints(n, perDecade = 40)` plus a Welford `runningStats`. probability-basics and expected-value each carry the same ~10-line helper.
- **core/parse:** `parseBoundedDecimal(text, { min, max, messages })`, refusing exponents, Infinity and markup. expected-value has a local copy.

## B8 (merged)
- **Plot2D**
  - `aspect="equal"`: three lessons hand-tune 356×350 to get a square inner box.
  - `Points` roving tabindex: linear-logistic-regression can have up to 20 tab stops, which breaks AC-0/T2 #11.
  - Background pointer hook `onPlotPointer`: gradient-descent's DropLayer and linear-logistic-regression's PointerSheet are duplicates.
  - `Arrow dashed`: vectors-similarity wraps the arrow in a dashed `<g>`.
- **core/format `decimal(v, dp)` with a real minus sign:** there are five identical local `num()` copies.
- **core/vec:** stable least squares. Being done in t2/b8-fix (domain-review fix); drop it from the kit round once that merges.

## B9 (merged)
- **sequenceLayout:** leave room for a self-message label on the rightmost lifeline. It overflows the viewBox today; diffie-hellman hides an empty lane as a workaround.
- **core/format:** `humanDurationLog10(log10Seconds)` for values past what a double holds (diffie-hellman's local `vastDuration`).
- **core/crypto**
  - `aesCbcRaw` encrypt/decrypt with no padding (the padding-block trick).
  - `hexToBytes`: three lessons hand-roll one.
  - An ECDH helper once a second lesson needs it.
- **Paint blend:** the equal-part color-mix `blend` is in tls-handshake and diffie-hellman. Second use, so extract it.
- **SequenceDiagram:** the "current" yellow overrides the message's own tone (also filed in B6), so the last step of a MITM run loses its red.
