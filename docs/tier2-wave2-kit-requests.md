# Wave 2 Phase 2 requests (for the wave 2→3 kit round)

## B5 (merged into main after 0ef853c)
- **core/automata**
  - An OTHER/default transition: `Dfa.delta[s][OTHER]` as a fallback in `dfaStep`, or `classify?: (ch) => symbol`. lexing-tokens uses a ~5-line `toAlphabet()` workaround.
  - An `edgesOf(machine)` helper returning `{from, to, symbols[]}`, so Dfa and Nfa can be drawn without casts. dfa-nfa has a local one ready to lift.
- **GraphView**
  - `accept` draws its double ring only on circles; box nodes need an inner rect.
  - Self-loops are always drawn on top; they need a per-node `loopSide`.
  - `circle` layout should take `rx`/`ry` so it can be an ellipse.
  - Edge labels need a position along the edge: `labelAt?: 0..1`.
- **TreeSvg:** a `maxWidth` / natural-size option. Three lessons wrap it in a maxWidth div, which makes this the third use and an extraction candidate.
- **Kit CSS:** `.keep-case` loses to `.data-table th`'s text-transform. Fix it so Greek type variables aren't uppercased.
- **Fixtures:** a `core/fixtures/exprLang` for the shared expression-language constants, which are copied per lesson today.
- **Not done:**
  - B5 never ran `smoke --frames`.
  - 768px was checked only on lexing-tokens.
  - captions only walks default scenes.

## B6 (merged into main)
- **SequenceDiagram**
  - `to: string | string[]` plus `broadcast?`, so a broadcast can reach only some lifelines (needed for the dhcp relay).
  - `note` should wrap to two lines.
  - `fit?: 'all' | 'shown'`, so the height can follow `step`.
  - The current message is always yellow and overrides the tone (dns had to use green for cache hits).
- **core/ipv4.ts:** `parseIPv4`, `ipToString`, `maskOf`, `networkOf`, `contains`. Third use: subnetting-cidr, ethernet-arp and dhcp. MUST extract.
- **BitStrip:** `divider?: { at; onMove? }`. subnetting-cidr uses `divider.ts` plus ~50 lines in the Stage.
- **Bar:** `markers?: { at, label, tone }[]`.
- **GanttLanes:** marker labels that sit close together collide (dhcp's T2 and end).
- **Pending:**
  - dns-resolution needs a DOMAIN REVIEW (Sentry), together with R2's tls-handshake and auth-sessions-jwt.
  - 768px was not checked on dhcp, ethernet-arp or ipv6.

## B4 (merged into main)
- **GanttLanes**
  - `labelMinPx?`: drop a label that would truncate on a thin bar.
  - The meaning of `wait` vs `blocked` needs a doc note (or a `kind: 'ready'`).
- **MemoryMap**
  - Collapse the pointer and region columns when they're unused (the VM scene came out at ~1150px wide).
  - `highlightTone`, or a per-cell `ring?: Tone`.
- **CellGrid:** `CellGridGroup({ at, ...props })` plus `cellGridLayout(props)`, so a grid can sit inside a scene SVG with RefArrows.
- **HeapObject:** a title-only variant when `fields=[]` (the FD leak scene ends up ~1000px tall).
- **ChipButton:** a `disabled` prop.
- **`categorical()`:** a variant that skips the semantic tones (ok/hi/info/violet), or a doc warning against using it for categories. cpu-scheduling uses a local 4-tone list.
- **Pending:**
  - DOMAIN REVIEW (Sentry): syscalls, interrupts and VM.
  - Non-default scenes were checked only with driven shots.

## R2 (merged 0133ac1)
- **usePlayer BUG, priority:** jumping or scrubbing to a frame with `say` undefined keeps the caption that was showing, not the last defined `say` at or before that index. Seen on the untouched tcp-udp, where frame 43 showed "Press play.". It affects every lesson that relies on caption inheritance. Fix: resolve the caption from a memoized prefix. Also check whether the captions script models inheritance the same way.
- **core/fakeSecret.ts:** `(...parts: string[]) => string`. Second use: secrets-management and auth-sessions-jwt.
- **minWidthForText:** an optional `padX` for stage padding. tcp-udp and db-indexes add it by hand.
- **Pending:** DOMAIN REVIEW (Sentry) of tls-handshake and auth-sessions-jwt, running.

## Domain-review fixes in flight
- **t2/b6-fix:** dns-resolution (3 MAJOR + 8 minor).
- **t2/b4-fix:** syscalls, interrupts, VM (3 MAJOR + ~20 minor).

## Added at wave end
- **Lint:** 6 `react/only-export-components` warnings in R2 lessons' frames.tsx (event-loop, containers, tls-handshake, transactions-acid). Lint still exits 0. Clean these up.
- **Tooling:** `shot --stage` on stages taller than the viewport paints the sticky app header over the capture. Hide the header during the capture.
