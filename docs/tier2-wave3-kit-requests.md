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
- **core/vec:** a relative pivot tolerance in `solve`, or QR inside `leastSquares`. A degree-12 fit on 15 points (κ ≈ 1e13) is wrongly reported singular.
