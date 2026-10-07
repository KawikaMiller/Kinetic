# Wave 3 Phase 2 requests (for the wave 3→4 kit round, along with K-21 ColorField + core/contrast)

## B7 (merged)
- **CellGrid canvas mode:** stroke outline and tint cells in their tone, matching the SVG rules. conditional-bayes uses a faint tint instead of outlined negatives.
- **Plot2D:** a draggable `VLine` (`onDrag`, `onStep`, `role="slider"`, `ariaLabel`, `valueText`). classification-metrics has a ~40-line local ThresholdLine.
- **core/stats:** `logCheckpoints(n, perDecade = 40)` plus a Welford `runningStats`. probability-basics and expected-value each carry the same ~10-line helper.
- **core/parse:** `parseBoundedDecimal(text, { min, max, messages })`, refusing exponents, Infinity and markup. expected-value has a local copy.
