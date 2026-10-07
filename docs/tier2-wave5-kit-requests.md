# Wave 5 Phase 2 requests (for the wave 5→6 kit round)

## B14 (merged)
- **TreeSvg:** per-node widths in the `tidy` layout (tries' compressed view sizes every column to the widest pill).
- **ArrayStrip:**
  - merge labels when pointers land on the same cell (quickselect has a ~12-line local version, "i·k");
  - add a per-cell class or an "outline in tone" cell state (counting sort's green outline goes through renderValue). The k6 round may cover this with `cellClass`.
- **CodePanel:** an `add` line state tinted `--ok` for diffs (edit-distance uses renderLine).
- **WideRegion:** scroll a given element into view (rolling-hash's window can sit off-screen on phones).
