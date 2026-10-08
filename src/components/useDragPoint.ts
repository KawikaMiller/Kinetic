import { useRef, type PointerEvent } from 'react';

/** Client (pointer) coordinates → the SVG's own user units, through its screen transform. */
export function svgPoint(svg: SVGSVGElement | null | undefined, clientX: number, clientY: number): { x: number; y: number } | null {
  const m = svg?.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** The pointer handlers to spread on one draggable point's element. */
export interface DragPointHandlers<E extends HTMLElement | SVGElement> {
  onPointerDown: (e: PointerEvent<E>) => void;
  onPointerMove: (e: PointerEvent<E>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

/**
 * Pointer dragging for a set of points drawn by hand (SVG handles, corner dots), shared by
 * Plot2D's Points and rasterization's corner handles. Returns `bind(i)`: spread its handlers on
 * point i's element. Pressing a point captures the pointer and focuses the element (so the
 * keyboard takes over where the pointer left off); moving it calls `onDrag(i, p)` with
 * `toLocal(clientX, clientY)`, skipped when that's null. `onGrab(i)` runs on press (a roving
 * tab stop following the grabbed point). Keyboard nudging stays with the caller: the step
 * sizes are the caller's (`arrowStep` in core/geometry is the shared key table).
 */
export function useDragPoint<P, E extends HTMLElement | SVGElement = SVGGElement>(
  toLocal: (clientX: number, clientY: number) => P | null,
  onDrag: ((i: number, p: P) => void) | undefined,
  opts: { onGrab?: (i: number) => void } = {},
): (i: number) => DragPointHandlers<E> {
  const dragging = useRef<number | null>(null);
  const release = () => {
    dragging.current = null;
  };
  return (i) => ({
    onPointerDown: (e) => {
      dragging.current = i;
      opts.onGrab?.(i);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.focus();
    },
    onPointerMove: (e) => {
      if (dragging.current !== i) return;
      const p = toLocal(e.clientX, e.clientY);
      if (p !== null) onDrag?.(i, p);
    },
    onPointerUp: release,
    onPointerCancel: release,
  });
}
