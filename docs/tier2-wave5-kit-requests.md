# Wave 5 Phase 2 requests (for the wave 5→6 kit round)

## B14 (merged)
- **TreeSvg:** per-node widths in the `tidy` layout (tries' compressed view sizes every column to the widest pill).
- **ArrayStrip:**
  - merge labels when pointers land on the same cell (quickselect has a ~12-line local version, "i·k");
  - add a per-cell class or an "outline in tone" cell state (counting sort's green outline goes through renderValue). The k6 round may cover this with `cellClass`.
- **CodePanel:** an `add` line state tinted `--ok` for diffs (edit-distance uses renderLine).
- **WideRegion:** scroll a given element into view (rolling-hash's window can sit off-screen on phones).

## B15 (merged)
- **Button and Box:** forward a `ref`. The k6 round is adding Button; add Box too.
- **Plot2D:** VLine/HLine labels clamp inside the plot edges (they clip on phones).
- **Docs:** CLAUDE.md gotcha: oxlint `only-export-components` fires on any uppercase arrow helper (`const P = …`) and then flags every export in the file.
- Done on main at 49ece19: Vitest `testTimeout: 15_000`.

## B16 (merged)
- **usePlayer:** the window keydown handler should skip events with `defaultPrevented` set, so composite widgets don't need stopPropagation (the flame graph).
- **ArrayStrip:** `cellTone?: (i) => Tone`, or let cellState accept any Tone. ring-buffers and semaphores override the active/info CSS just to get flat tinted cells.
- Test timeouts: done on main (15 s).
