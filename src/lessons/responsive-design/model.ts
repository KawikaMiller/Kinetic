// The sample page's breakpoints and CSS, plus the srcset density algorithm.
// PAGE_CSS is injected as a real <style> AND shown in the code panel, so what the
// learner reads is exactly what the browser applies.

export type BreakpointId = 'base' | 'md' | 'lg';

export interface Breakpoint {
  id: BreakpointId;
  label: string;
  /** Fits a phone-width ruler. */
  short: string;
  /** Applies at this container width and up. */
  min: number;
}

/** Mobile-first: the base rules always apply; each block adds on top from its width up. */
export const BREAKPOINTS: Breakpoint[] = [
  { id: 'base', label: 'base (mobile first)', short: 'base', min: 0 },
  { id: 'md', label: '≥ 600px: tablet', short: '≥ 600', min: 600 },
  { id: 'lg', label: '≥ 960px: desktop', short: '≥ 960', min: 960 },
];

export const DEVICE_MIN = 320;
export const DEVICE_MAX = 1440;
export const DEVICES = [
  { id: 'phone', label: 'Phone', width: 390 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'desktop', label: 'Desktop', width: 1280 },
] as const;

/** The breakpoint in effect at `width` (the widest one whose min it reaches). */
export function breakpointAt(width: number): Breakpoint {
  return [...BREAKPOINTS].reverse().find((b) => width >= b.min) ?? BREAKPOINTS[0];
}

/**
 * The comfortable touch target this lesson checks for: 44 × 44 CSS px, from WCAG 2.5.5 (AAA) and
 * Apple's HIG. WCAG 2.2 AA's minimum (2.5.8) is smaller, 24 × 24.
 */
export const TAP_MIN = 44;
export const isTooSmall = (w: number, h: number) => w < TAP_MIN || h < TAP_MIN;

/*
 * The sample page's stylesheet. `.rd-page` is a size container standing in for the
 * viewport, so `@container` plays the part `@media` plays on a real page, and `cqi`
 * (1% of the container's width) plays the part of `vw`. `.rd-probe` reports which
 * block is in effect through a custom property the Stage reads back.
 */
export const PAGE_CSS = `.rd-page { container-type: inline-size; }
.rd-probe { --bp: base; }
.rd-layout { display: grid; grid-template-columns: 1fr; gap: 12px; }
.rd-cards { display: grid; grid-template-columns: 1fr; gap: 10px; }
.rd-links { display: none; }
.rd-menu { display: inline-flex; }
.rd-hero h2 { font-size: clamp(1.25rem, 5cqi, 2.4rem); }

@container (min-width: 600px) {
  .rd-probe { --bp: md; }
  .rd-cards { grid-template-columns: repeat(2, 1fr); }
  .rd-links { display: flex; }
  .rd-menu { display: none; }
}

@container (min-width: 960px) {
  .rd-probe { --bp: lg; }
  .rd-layout { grid-template-columns: 1fr 240px; }
  .rd-cards { grid-template-columns: repeat(3, 1fr); }
}`;

/** Which breakpoint block each line of PAGE_CSS belongs to. */
export function blockOfLines(css: string): BreakpointId[] {
  let current: BreakpointId = 'base';
  return css.split('\n').map((line) => {
    const m = line.match(/@container \(min-width: (\d+)px\)/);
    if (m) current = breakpointAt(Number(m[1])).id;
    const id = current;
    if (line.trim() === '}') current = 'base';
    return id;
  });
}

// ─── srcset ───────────────────────────────────────────────────────────

export interface Candidate {
  /** The intrinsic width in the srcset descriptor, e.g. 800 for "hero-800.jpg 800w". */
  w: number;
  /** Illustrative download size. */
  bytes: number;
}

export const CANDIDATES: Candidate[] = [
  { w: 400, bytes: 38_000 },
  { w: 800, bytes: 118_000 },
  { w: 1600, bytes: 402_000 },
];

export const SIZES = '(min-width: 960px) 33vw, (min-width: 600px) 50vw, 100vw';

/** The slot width `sizes` gives the image at a viewport width: the first matching condition. */
export function slotWidth(viewport: number): number {
  if (viewport >= 960) return viewport / 3;
  if (viewport >= 600) return viewport / 2;
  return viewport;
}

/**
 * The density-based choice: the smallest candidate whose width covers slot × DPR,
 * or the largest one if none does.
 */
export function pickCandidate(candidates: Candidate[], slot: number, dpr: number): Candidate {
  const need = slot * dpr;
  const sorted = [...candidates].sort((a, b) => a.w - b.w);
  return sorted.find((c) => c.w >= need) ?? sorted[sorted.length - 1];
}

/** Hidden spans whose font sizes the Stage measures to compare units. */
export const UNIT_SAMPLES = [
  { id: 'rem', css: 'font-size: 1.25rem', style: { fontSize: '1.25rem' } },
  { id: 'percent', css: 'font-size: 150% (of a 12px parent)', style: { fontSize: '150%' } },
  { id: 'cqi', css: 'font-size: 4cqi (stands in for 4vw)', style: { fontSize: '4cqi' } },
  { id: 'clamp', css: 'font-size: clamp(1rem, 4cqi, 1.75rem)', style: { fontSize: 'clamp(1rem, 4cqi, 1.75rem)' } },
] as const;

