import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { gridGeometry, gridKeyTarget, type Cell } from '../core/grid';
import { paintImage } from './canvasImage';
import { canvasFill, canvasInk, DEFAULT_TINT, resolveSize, textReadable, type CellSize, type GridCellSpec, type SizePreset } from './cellGridPaint';
import type { Tone } from '../core/tone';

export type { CellSize, GridCellSpec } from './cellGridPaint';
export { MIN_TEXT_PX } from './cellGridPaint';

export interface GridHighlight {
  r: number;
  c: number;
  tone: Tone;
}

/** Above this many cells the grid draws them on a canvas (labels and rings stay SVG). */
export const CANVAS_THRESHOLD = 400;
/** Where things are, for drawing an overlay (arrows between cells, a path) in the grid's coordinates. */
export interface CellGridGeometry {
  /** Top-left corner of a cell. */
  at: (r: number, c: number) => { x: number; y: number };
  /** Centre of a cell. */
  center: (r: number, c: number) => { x: number; y: number };
  cell: number;
  gap: number;
  /** Whole drawing size, labels included. */
  width: number;
  height: number;
}
const LABEL_FONT = 10;
const LABEL_CHAR_W = 6.2;

/**
 * A row × column grid of cells: a Hamming matrix, a sieve, a heatmap, a 1,000-person crowd.
 * `cell(r, c)` describes each cell with semantic tones. With `onCellClick` the grid is one
 * tab stop and the arrow keys move between cells (Home/End, Ctrl+Home/End, PageUp/Down);
 * Enter or Space presses the focused cell. Up to CANVAS_THRESHOLD cells it's plain SVG;
 * above that the cells are painted on a canvas with the same API, so a big grid stays fast,
 * text included while it's readable (MIN_TEXT_PX on screen).
 * `size` is a preset or `{ cell, gap?, font? }`; `overlay(geometry)` draws SVG over the cells
 * in the grid's own coordinates (dependency arrows in a DP table).
 */
export function CellGrid({
  rows, cols, cell, rowLabels, colLabels, onCellClick, cellTitle, cellAriaLabel, highlight = [], size = 'sm', gap,
  rowSuffix, overlay, ariaLabel, className = '',
}: {
  rows: number;
  cols: number;
  cell: (r: number, c: number) => GridCellSpec;
  rowLabels?: readonly ReactNode[];
  colLabels?: readonly ReactNode[];
  onCellClick?: (r: number, c: number) => void;
  /** Tooltip text for a cell. */
  cellTitle?: (r: number, c: number) => string;
  /** Screen-reader name of a cell when the grid is clickable (default: its text or "row r, column c"). */
  cellAriaLabel?: (r: number, c: number) => string;
  /** Rings drawn over cells (a cursor, a cache set, the cell being computed). */
  highlight?: readonly GridHighlight[];
  size?: SizePreset | CellSize;
  gap?: number;
  /** Extra text after each row (ByteGrid's ASCII column): width in drawing units plus a renderer. */
  rowSuffix?: { width: number; render: (r: number) => ReactNode };
  /** SVG drawn over the cells (and rings), in the grid's coordinates; it doesn't take pointer events. */
  overlay?: (geometry: CellGridGeometry) => ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  const s = resolveSize(size);
  const rowLabelWidth = rowLabels ? maxLabelChars(rowLabels) * LABEL_CHAR_W + 8 : 0;
  const colLabelHeight = colLabels ? LABEL_FONT + 8 : 0;
  const geo = gridGeometry({ rows, cols, cell: s.cell, gap: gap ?? s.gap, rowLabelWidth, colLabelHeight });
  const width = geo.width + (rowSuffix ? rowSuffix.width + 8 : 0);
  const canvasMode = rows * cols > CANVAS_THRESHOLD;
  const clickable = !!onCellClick;
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const cellRefs = useRef(new Map<number, SVGGElement>());

  const labelOf = (r: number, c: number) => cellAriaLabel?.(r, c) ?? textOf(cell(r, c).text) ?? `row ${r + 1}, column ${c + 1}`;

  const moveFocus = (e: KeyboardEvent, from: Cell) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCellClick?.(from.r, from.c);
      return;
    }
    const to = gridKeyTarget(e.key, from, rows, cols, { ctrl: e.ctrlKey || e.metaKey });
    if (!to) return;
    e.preventDefault();
    setFocus(to);
    if (!canvasMode) cellRefs.current.get(to.r * cols + to.c)?.focus();
  };

  const scale = useRenderedScale(svg, width, canvasMode);
  const canvasText = canvasMode && scale !== null && textReadable(s.font, scale);
  const image = useCanvasCells(canvasMode, rows, cols, cell, geo, canvasText ? s.font : 0);

  const onCanvasClick = (e: MouseEvent<SVGRectElement>) => {
    const p = svgPoint(svg.current, e.clientX, e.clientY);
    const hit = p && geo.hit(p.x, p.y);
    if (!hit) return;
    setFocus(hit);
    onCellClick?.(hit.r, hit.c);
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${width} ${geo.height}`}
      width={width}
      className={`cellgrid ${clickable ? 'is-clickable' : ''} ${className}`}
      role={clickable ? 'group' : 'img'}
      aria-label={ariaLabel}
    >
      {colLabels?.map((label, c) => (
        <text key={`c${c}`} className="cellgrid-label" x={geo.at(0, c).x + s.cell / 2} y={LABEL_FONT} textAnchor="middle">
          {label}
        </text>
      ))}
      {rowLabels?.map((label, r) => (
        <text key={`r${r}`} className="cellgrid-label" x={rowLabelWidth - 6} y={geo.at(r, 0).y + s.cell / 2 + 3.5} textAnchor="end">
          {label}
        </text>
      ))}

      {canvasMode ? (
        <>
          {image && <image href={image} x={geo.x0} y={geo.y0} width={geo.width - geo.x0} height={geo.height - geo.y0} />}
          {clickable && (
            <rect
              className="cellgrid-hitarea"
              x={geo.x0}
              y={geo.y0}
              width={geo.width - geo.x0}
              height={geo.height - geo.y0}
              role="button"
              tabIndex={0}
              aria-label={`${labelOf(focus.r, focus.c)} (arrow keys move, Enter selects)`}
              onClick={onCanvasClick}
              onKeyDown={(e) => moveFocus(e, focus)}
            />
          )}
          {clickable && <CellRing at={geo.at(focus.r, focus.c)} size={s.cell} className="cellgrid-cursor" />}
        </>
      ) : (
        Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const spec = cell(r, c);
          const { x, y } = geo.at(r, c);
          const fill = spec.fill ?? (spec.intensity !== undefined ? 'tint' : spec.tone ? 'tint' : undefined);
          const isFocus = focus.r === r && focus.c === c;
          return (
            <g
              key={i}
              transform={`translate(${x} ${y})`}
              className={`cellgrid-cell ${fill ? `is-${fill}` : ''} ${spec.tone ? `tone-${spec.tone}` : ''}`}
              style={fill === 'tint' ? ({ '--cell-tint': `${Math.round((spec.intensity ?? DEFAULT_TINT) * 100)}%` } as CSSProperties) : undefined}
              {...(clickable && {
                role: 'button',
                tabIndex: isFocus ? 0 : -1,
                'aria-label': labelOf(r, c),
                ref: (el: SVGGElement | null) => {
                  if (el) cellRefs.current.set(i, el);
                  else cellRefs.current.delete(i);
                },
                onClick: () => {
                  setFocus({ r, c });
                  onCellClick?.(r, c);
                },
                onFocus: () => setFocus({ r, c }),
                onKeyDown: (e: KeyboardEvent<SVGGElement>) => moveFocus(e, { r, c }),
              })}
            >
              {cellTitle && <title>{cellTitle(r, c)}</title>}
              <rect width={s.cell} height={s.cell} rx={Math.min(4, s.cell / 5)} />
              {spec.text != null && s.font > 0 && (
                <text x={s.cell / 2} y={s.cell / 2 + s.font * 0.35} textAnchor="middle" style={{ fontSize: s.font }}>
                  {spec.text}
                </text>
              )}
            </g>
          );
        })
      )}

      {highlight.map((h, k) => (
        <CellRing key={k} at={geo.at(h.r, h.c)} size={s.cell} className={`cellgrid-ring tone-${h.tone}`} />
      ))}

      {overlay && (
        <g className="cellgrid-overlay">
          {overlay({
            at: geo.at,
            center: (r, c) => {
              const p = geo.at(r, c);
              return { x: p.x + s.cell / 2, y: p.y + s.cell / 2 };
            },
            cell: s.cell,
            gap: geo.gap,
            width,
            height: geo.height,
          })}
        </g>
      )}

      {rowSuffix &&
        Array.from({ length: rows }, (_, r) => (
          <text key={`s${r}`} className="cellgrid-suffix" x={geo.width + 8} y={geo.at(r, 0).y + s.cell / 2 + 3.5}>
            {rowSuffix.render(r)}
          </text>
        ))}
    </svg>
  );
}

function CellRing({ at, size, className }: { at: { x: number; y: number }; size: number; className: string }) {
  return <rect className={className} x={at.x - 1.5} y={at.y - 1.5} width={size + 3} height={size + 3} rx={Math.min(5, size / 4)} />;
}

/** Screen pixels per drawing unit, kept up to date as the SVG resizes (measured only when `enabled`). */
function useRenderedScale(svg: RefObject<SVGSVGElement | null>, drawingWidth: number, enabled: boolean): number | null {
  const [scale, setScale] = useState<number | null>(null);
  useEffect(() => {
    const el = svg.current;
    if (!enabled || !el) return;
    const measure = () => setScale(el.getBoundingClientRect().width / drawingWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [svg, drawingWidth, enabled]);
  return enabled ? scale : null;
}

/**
 * Paints the cells onto a canvas and returns it as an image URL for the SVG (canvas mode
 * only). With `font` > 0 it also writes each cell's string or number text, as SVG mode does.
 */
function useCanvasCells(
  enabled: boolean,
  rows: number,
  cols: number,
  cell: (r: number, c: number) => GridCellSpec,
  geo: ReturnType<typeof gridGeometry>,
  font: number,
): string | null {
  // `cell` is a fresh function every render, so key the drawing on what it returns.
  const specs = enabled ? Array.from({ length: rows * cols }, (_, i) => cell(Math.floor(i / cols), i % cols)) : null;
  const key = specs ? JSON.stringify(specs.map((sp) => [sp.tone, sp.fill, sp.intensity, font ? textOf(sp.text) : null])) : '';
  return useMemo(() => {
    if (!specs) return null;
    const family = font ? getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() : '';
    return paintImage(geo.width - geo.x0, geo.height - geo.y0, (ctx) => {
      ctx.textAlign = 'center';
      specs.forEach((sp, i) => {
        const { x, y } = geo.at(Math.floor(i / cols), i % cols);
        ctx.fillStyle = canvasFill(sp);
        ctx.fillRect(x - geo.x0, y - geo.y0, geo.cell, geo.cell);
        const text = font ? textOf(sp.text) : null;
        if (text === null) return;
        ctx.font = `${sp.fill === 'none' ? 500 : 600} ${font}px ${family}`;
        ctx.fillStyle = canvasInk(sp);
        ctx.fillText(text, x - geo.x0 + geo.cell / 2, y - geo.y0 + geo.cell / 2 + font * 0.35);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every spec that affects the pixels
  }, [key, rows, cols, geo.width, geo.height, font]);
}

const textOf = (node: ReactNode) => (typeof node === 'string' || typeof node === 'number' ? String(node) : null);

function maxLabelChars(labels: readonly ReactNode[]): number {
  return labels.reduce<number>((m, l) => Math.max(m, textOf(l)?.length ?? 2), 0);
}

/** Client coordinates → the SVG's drawing coordinates. */
function svgPoint(svg: SVGSVGElement | null, clientX: number, clientY: number) {
  const m = svg?.getScreenCTM();
  if (!svg || !m) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
