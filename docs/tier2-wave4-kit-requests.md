# Wave 4 Phase 2 requests (for the wave 4→5 kit round)

## B11 (merged)
- **GanttLanes:** an optional `motionId` on bars, so a bar with the same id glides between lanes (greedy's booked lane).
- **CallStackPanel deque mode:** `enterFrom?: 'top' | 'bottom'`, plus a per-frame `exit?` (monotonic-stack).
- **Shared value-scaled `BarStrip`:** reuses ArrayStrip's cell states, pointers and ranges, with an overlay giving bar geometry. Wanted by monotonic-stack and possibly amortized-analysis.
- **ArrayStrip:** `cellClass?: (i) => string` (amortized-analysis).

## B12 (merged)
- **Plot2D:** a click-to-add-point layer (`<ClickLayer onClick>` or `onPlotClick`), plus a keyboard cursor. decision-trees and clustering each keep a local ClickCatcher.
- **Points:** a per-point radius `r?` and an outline `ring?: Tone`. decision-trees has a local SampleDots.
- **Points:** text labels via `labels?: (i) => string` (embeddings has a local Labels layer).
- **Button:** should accept a `ref` (usability-laws wraps it in a display: contents span).
- **Test perf:** containers/model.test.ts timed out once under the full parallel suite. Make it faster or give it more headroom.
