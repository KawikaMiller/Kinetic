import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** useLoop's default cap on one frame's dt, in seconds: a background tab doesn't teleport the sim. */
export const DEFAULT_MAX_DT = 0.05;

export interface LoopOptions {
  /**
   * Cap on `dt` in seconds (default DEFAULT_MAX_DT). Pass Infinity when the real frame time is
   * the point, e.g. a lesson about lag spikes.
   */
  maxDt?: number;
}

/** Seconds between two animation-frame timestamps, never negative and at most `maxDt`. Pure, for testing. */
export function frameDt(prevMs: number, nowMs: number, maxDt = DEFAULT_MAX_DT): number {
  return Math.min(maxDt, Math.max(0, (nowMs - prevMs) / 1000));
}

/**
 * requestAnimationFrame loop for continuous simulations.
 * `cb(dt, t)` gets seconds since last frame (capped by `maxDt`, never negative) and total
 * elapsed seconds. The clock restarts whenever `running` turns true, so a pause never shows
 * up as one huge frame.
 */
export function useLoop(cb: (dt: number, t: number) => void, running = true, { maxDt = DEFAULT_MAX_DT }: LoopOptions = {}) {
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  });

  useEffect(() => {
    if (!running) return;
    let id = 0;
    let last = performance.now();
    const start = last;
    const tick = (now: number) => {
      const dt = frameDt(last, now, maxDt);
      last = now;
      cbRef.current(dt, (now - start) / 1000);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [running, maxDt]);
}

/** Live width/height of an element, for sizing SVG and canvas stages. */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/**
 * Canvas sized to its wrapper at device pixel ratio. `draw` runs after every
 * React render; call `redraw()` to paint from a useLoop() without re-rendering.
 * Usage: <div ref={wrapRef} style={{height: 360}}><canvas ref={canvasRef} /></div>
 */
export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  const sizeRef = useRef(size);
  useEffect(() => {
    drawRef.current = draw;
    sizeRef.current = size;
  });

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const { width, height } = sizeRef.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawRef.current(ctx, width, height);
  }, []);

  useEffect(() => {
    redraw();
  });

  return { wrapRef, canvasRef, size, redraw };
}
