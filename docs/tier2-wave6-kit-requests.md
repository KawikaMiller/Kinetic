# Wave 6 Phase 2 requests (for the wave 6→7 kit round)

## B19
- **ConsolePanel:** a `preserveWhitespace` option (white-space: pre). Today `ps` columns don't line up.
- **The `.hl` caption chip:** let it wrap, or document a length limit. A long verdict overflowed the caption.

## B17
- **Shared caption test helper:** `captionText(node, { strict: true })` (or `expectCaption`) in core/testing. It must fail on glued sentences, which happen when a JSX line break after `{…}` swallows the space ("port.60 s"). Five lessons carry a local check.
- **Token bucket: extract it to core** (second use: rate-limiting's Limiter and reverse-proxy-gateway). Today reverse-proxy-gateway's test imports `../rate-limiting/sim` across lessons; switch both to core.

## B18
- **Object-graph layout helper:** `heapGrid({ cols, colW, rowH, origin })` plus `fieldArrowBetween(...)`. garbage-collection and memory-leaks both hand-place HeapObjects.
- **CodePanel:** a green `good` line state, mirroring `bad` (memory-leaks and the async pitfalls override `is-done` locally). Combine this with B14's `add` diff state.
- **HeapObject:** a `tagSize` prop, or 11px tags. The 10px tags force a ~580px minimum width.
- **core/testing/node.ts:** a typed `spawnSync` for tests (the app tsconfig has no Node types).
- **GanttLanes:** a minimum bar width or a marker-only option (a 20 µs deopt bar is invisible).
