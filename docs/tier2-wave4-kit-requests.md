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

## B10 (4 of 5 merged; memory-safety-bugs re-scoped and being rebuilt)
- **core/x86.ts:** promote the x86-64 interpreter, which is duplicated in isa-assembly and calling-conventions (a test pins the two copies identical). API: `assemble`, `step`, `runToEnd`, `startCpu`.
- **CodePanel:** roving tabindex for `onLineClick` (`roving?`, with Up/Down/Home/End). isa-assembly has ~23 line tab stops.
- **MemoryMap:** let two pointers share a row, or allow right-side labels (currently "sp=bp").

## B13 (merged)
- **useLoop:** add `{ maxDt? }`. The 50 ms dt cap hides the lag spikes game-loop teaches, so game-loop measures performance.now() itself.
- **Bar:** stacked `segments={[{ value, tone }]}` (game-loop's frame-budget bar is local).
- **Draggable overlay points:** extract Plot2D Points' drag logic as `useDragPoint`, or add an interactive CellGrid overlay. rasterization draws its own corner handles and depth probe.
- **Ports:** agents sometimes hit another worktree's server on a shared port. Have the scripts verify the server's root before smoke/shot runs (a stamp endpoint, or a check on `vite.worktree.config` cacheDir).
