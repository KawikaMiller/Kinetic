// Same hook as css-layout's useMeasure (lessons can't import each other); filed as a
// Phase 2 request to move it into core.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Measure real layout under `ref` after every render, whenever it or anything inside it
 * resizes (a web font arriving changes line heights without resizing the container), and
 * once fonts have loaded. `measure` reads the DOM (getBoundingClientRect /
 * getComputedStyle) and returns plain data; the value only changes when the measurement
 * does, so it can't loop.
 */
export function useMeasure<T>(ref: RefObject<HTMLElement | null>, measure: (el: HTMLElement) => T): T | null {
  const [value, setValue] = useState<T | null>(null);
  const measureRef = useRef(measure);
  const observer = useRef<ResizeObserver | null>(null);

  const run = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = measureRef.current(el);
    setValue((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [ref]);

  useLayoutEffect(() => {
    measureRef.current = measure;
    run();
    // Watch the container and everything in it; re-observing after a render picks up new elements.
    const el = ref.current;
    const ro = observer.current;
    if (el && ro) [el, ...el.querySelectorAll('*')].forEach((node) => ro.observe(node));
  });

  useEffect(() => {
    const ro = new ResizeObserver(run);
    observer.current = ro;
    const el = ref.current;
    if (el) [el, ...el.querySelectorAll('*')].forEach((node) => ro.observe(node));
    let alive = true;
    document.fonts?.ready.then(() => alive && run());
    return () => {
      alive = false;
      ro.disconnect();
      observer.current = null;
    };
  }, [ref, run]);

  return value;
}
