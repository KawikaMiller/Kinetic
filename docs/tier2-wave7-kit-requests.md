# Wave 7 Phase 2 requests (for the wave 7→8 kit round)

## B21
- **Line diff helper to core:** `lineDiff` / `changedLines` (LCS) exists in tdd and refactoring-code-smells (second use). Promote to core, and migrate edit-distance's line diff too if it fits.
- **WideRegion:** a `hint` prop. The swipe hint reads "swipe to see the whole diagram" even when the region holds code.

## B20
- **core/testing real-tsc helper:** `tscErrors(files)` and `emitJs(src)`. generics-polymorphism and null-option-adts each carry a copy of tscCheck.ts (it imports the `typescript` devDependency; only test files import it, so it stays out of the app bundle). Promote to `core/testing/tsc.ts` and delete both copies.
- **Button ref:** done on main (kit-k6). Migrate behavioral-patterns' 3-line focus wrapper.

## B22
- **GraphView `underlay?: ReactNode`** rendered before the edges inside the same svg (3 users: coupling-cohesion, layered-hexagonal, architecture-diagrams-c4, which each stack a second SVG with the same viewBox).
- **GraphView edge-label halo** (`paint-order: stroke`) in kit CSS. Every B22 lesson, and minimum-spanning-trees, add it locally.
- **Box-crossing geometry helper:** `segmentHitsBox` (Liang–Barsky) from coupling-cohesion's layout.ts into `core/geometry`, if a second app-code user appears.
