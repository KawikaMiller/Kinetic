// Pure helpers for the css-layout lesson. The Stage never computes layout itself:
// every number it shows is measured from real elements. These functions only turn
// settings into CSS text, and turn measurements into the few derived figures shown.

/**
 * The CSS rule for two adjacent vertical margins in normal flow: they don't add up.
 * Both positive → the larger wins; both negative → the more negative wins;
 * mixed → the largest positive plus the most negative.
 */
export function collapsedMargin(a: number, b: number): number {
  if (a >= 0 && b >= 0) return Math.max(a, b);
  if (a <= 0 && b <= 0) return Math.min(a, b);
  return Math.max(a, b) + Math.min(a, b);
}

/** "200px 342.5px 0px" (computed grid-template-columns) → [200, 342.5, 0]. */
export function parseTracks(computed: string): number[] {
  if (!computed || computed === 'none') return [];
  return computed
    .trim()
    .split(/\s+/)
    .map((t) => parseFloat(t))
    .filter((n) => Number.isFinite(n));
}

/**
 * Grid line positions (px from the content edge). A gap is the thickness of the line
 * between two tracks, so internal lines sit in the middle of their gutter; the first
 * and last lines are the grid's edges.
 */
export function gridLines(tracks: number[], gap: number): number[] {
  const lines = [0];
  let x = 0;
  tracks.forEach((t, i) => {
    x += t;
    const last = i === tracks.length - 1;
    lines.push(last ? x : x + gap / 2);
    if (!last) x += gap;
  });
  return lines;
}

export interface Span {
  start: number;
  end: number;
}

/** Group flex items into lines by their cross-axis start (wrapped rows share a top). */
export function lineGroups<T extends { cross: number }>(items: T[], tolerance = 1): T[][] {
  const lines: T[][] = [];
  for (const it of [...items].sort((a, b) => a.cross - b.cross)) {
    const line = lines.find((l) => Math.abs(l[0].cross - it.cross) <= tolerance);
    if (line) line.push(it);
    else lines.push([it]);
  }
  return lines;
}

/**
 * The empty stretches along a line's main axis, from measured item spans:
 * before the first item, between items (excluding the CSS gap), and after the last.
 * This is the free space justify-content distributed.
 */
export function emptySpace(container: Span, items: Span[], gap: number): Span[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let cursor = container.start;
  sorted.forEach((it, i) => {
    const lead = i === 0 ? 0 : gap;
    if (it.start - cursor - lead > 0.5) out.push({ start: cursor + lead, end: it.start });
    cursor = it.end;
  });
  if (container.end - cursor > 0.5) out.push({ start: cursor, end: container.end });
  return out;
}

// ─── Generated CSS ────────────────────────────────────────────────────

export type BoxSizing = 'content-box' | 'border-box';

export interface BoxSettings {
  width: number;
  padding: number;
  border: number;
  margin: number;
  boxSizing: BoxSizing;
}

/**
 * The border-box width the browser really draws. With border-box, width includes padding and
 * border, but the content can't go below 0: once 2 × (padding + border) exceeds width, the box grows.
 */
export function borderBoxWidth(s: BoxSettings): number {
  return Math.max(s.width, 2 * (s.padding + s.border));
}

export function boxCss(s: BoxSettings): string[] {
  return [
    '.box {',
    `  box-sizing: ${s.boxSizing};`,
    `  width: ${s.width}px;`,
    `  padding: ${s.padding}px;`,
    `  border: ${s.border}px solid;`,
    `  margin: ${s.margin}px;`,
    '}',
  ];
}

export function collapseCss(bottom: number, top: number): string[] {
  return ['.first  { margin-bottom: ' + bottom + 'px; }', '.second { margin-top: ' + top + 'px; }'];
}

export type Direction = 'row' | 'column';
export type Justify = 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
export type Align = 'stretch' | 'flex-start' | 'center' | 'flex-end';

export interface FlexItem {
  basis: number;
  grow: number;
  shrink: number;
}

export interface FlexSettings {
  direction: Direction;
  justify: Justify;
  align: Align;
  wrap: boolean;
  gap: number;
  items: FlexItem[];
}

export function flexCss(s: FlexSettings): string[] {
  return [
    '.row {',
    '  display: flex;',
    `  flex-direction: ${s.direction};`,
    `  justify-content: ${s.justify};`,
    `  align-items: ${s.align};`,
    `  flex-wrap: ${s.wrap ? 'wrap' : 'nowrap'};`,
    `  gap: ${s.gap}px;`,
    '}',
    ...s.items.map((it, i) => `.item-${i + 1} { flex: ${it.grow} ${it.shrink} ${it.basis}px; }`),
  ];
}

export interface GridSettings {
  columns: string;
  gap: number;
  spans: number[];
}

export function gridCss(s: GridSettings): string[] {
  return [
    '.grid {',
    '  display: grid;',
    `  grid-template-columns: ${s.columns};`,
    `  gap: ${s.gap}px;`,
    '}',
    ...s.spans.flatMap((n, i) => (n > 1 ? [`.item-${i + 1} { grid-column: span ${n}; }`] : [])),
  ];
}

/** Index of the first line mentioning `key`, for highlighting the property you just changed. */
export const lineFor = (css: string[], key: string | null) => {
  if (!key) return null;
  const i = css.findIndex((l) => l.includes(key));
  return i < 0 ? null : i;
};

