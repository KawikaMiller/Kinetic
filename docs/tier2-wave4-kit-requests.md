# Wave 4 Phase 2 requests (for the wave 4→5 kit round)

## B11 (merged)
- **GanttLanes:** an optional `motionId` on bars, so a bar with the same id glides between lanes (greedy's booked lane).
- **CallStackPanel deque mode:** `enterFrom?: 'top' | 'bottom'`, plus a per-frame `exit?` (monotonic-stack).
- **Shared value-scaled `BarStrip`:** reuses ArrayStrip's cell states, pointers and ranges, with an overlay giving bar geometry. Wanted by monotonic-stack and possibly amortized-analysis.
- **ArrayStrip:** `cellClass?: (i) => string` (amortized-analysis).
