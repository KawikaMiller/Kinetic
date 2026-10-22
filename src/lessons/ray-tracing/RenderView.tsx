import type { PointerEvent } from 'react';
import { IMAGE } from './scene';
import { useScanReveal } from './useScanReveal';

const IMAGE_SCALE = 4;
export const RENDER_SCALE = IMAGE_SCALE;

/**
 * The picture, filling row by row behind a scan cursor each time `replay` changes. `ring` rings one pixel
 * (the one being traced); `onPick` turns a click or tap into a pixel (the pixel sliders are the keyboard path);
 * `rings` is a second image laid over the first (the acne ring layer).
 */
export function RenderView({ url, ringsUrl, replay, ring, onPick, ariaLabel, width = IMAGE.w, height = IMAGE.h }: {
  url: string | null;
  ringsUrl?: string | null;
  replay: number;
  ring?: { x: number; y: number } | null;
  onPick?: (x: number, y: number) => void;
  ariaLabel: string;
  width?: number;
  height?: number;
}) {
  const rows = useScanReveal(replay, height);
  const pct = (rows / height) * 100;
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(width - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(((e.clientY - box.top) / box.height) * height)));
    onPick?.(x, y);
  };
  return (
    <div className={`rt-view ${onPick ? 'is-pickable' : ''}`} onPointerDown={onPick ? pick : undefined}>
      <div className="rt-reveal" style={{ clipPath: `inset(0 0 ${100 - pct}% 0)` }}>
        {url && <img className="rt-img" src={url} alt={ariaLabel} width={width * IMAGE_SCALE} height={height * IMAGE_SCALE} />}
        {ringsUrl && <img className="rt-rings" src={ringsUrl} alt="" aria-hidden="true" />}
      </div>
      {rows < height && <span className="rt-scan" style={{ top: `${pct}%` }} aria-hidden="true" />}
      {ring && <span className="rt-ring" aria-hidden="true" style={{ left: `${((ring.x + 0.5) / width) * 100}%`, top: `${((ring.y + 0.5) / height) * 100}%` }} />}
    </div>
  );
}
