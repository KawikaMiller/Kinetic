import { useId, useMemo, type ReactNode } from 'react';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import { formatAddr, memoryMapLayout, MEMMAP, type MemCell, type MemLayout, type MemPointer, type MemRegion } from './mapLayout';

export interface MemoryMapProps {
  regions: readonly MemRegion[];
  cells?: readonly MemCell[];
  pointers?: readonly MemPointer[];
  /** Bytes per row: 1 (bytes), 8 (64-bit words, default), 4096 (pages). */
  unit?: number;
  /** down (default): higher addresses at the top; up: lower addresses at the top. */
  direction?: 'down' | 'up';
  /** Addresses to ring (the byte being written, the slot `rsp` just moved to). */
  highlight?: readonly number[];
  width?: number;
  addrDigits?: number;
}

/**
 * An address-ordered memory column: addresses on the left, one cell per `unit` bytes, region
 * brackets on the right (live, freed = hatched, guard = a canary or guard page), and pointer
 * tags (sp, fp, pc) beside their address. Long empty runs collapse to a "⋮" row.
 *
 * Standalone it draws its own <svg>; `overlay` draws on top in map coordinates, e.g.
 * `overlay={(L) => <RefArrow from={memPort(L, fp, 'right')!} to={memCellRect(L, saved)!} />}`.
 * Inside a lesson's own SVG (next to VarSlots and HeapObjects) use `MemoryMapGroup` at `at`
 * and get ports from `memoryMapLayout(sameProps)` with the same `at`.
 */
export function MemoryMap({ overlay, ariaLabel = 'Memory map', className = '', ...props }: MemoryMapProps & {
  overlay?: (layout: MemLayout) => ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  const layout = useLayout(props);
  return (
    <svg
      className={`memmap ${className}`}
      viewBox={`${-4} ${-4} ${layout.width + 8} ${layout.height + 8}`}
      width={layout.width + 8}
      role="img"
      aria-label={ariaLabel}
    >
      <MapBody layout={layout} {...props} />
      {overlay?.(layout)}
    </svg>
  );
}

/** MemoryMap as a <g> at `at`, for embedding in a scene with RefArrows to and from it. */
export function MemoryMapGroup({ at, ...props }: MemoryMapProps & { at: Pt }) {
  const layout = useLayout(props);
  return (
    <g className="memmap" transform={`translate(${at.x} ${at.y})`}>
      <MapBody layout={layout} {...props} />
    </g>
  );
}

function useLayout(p: MemoryMapProps): MemLayout {
  const { regions, cells, pointers, unit, direction, width, addrDigits } = p;
  return useMemo(
    () => memoryMapLayout({ regions, cells, pointers, unit, direction, width, addrDigits }),
    [regions, cells, pointers, unit, direction, width, addrDigits],
  );
}

/** The innermost region holding [addr, end): its tone tints the cell, its variant styles it. */
function innermost(regions: readonly MemRegion[], layout: MemLayout, addr: number, end: number): MemRegion | null {
  let best: MemRegion | null = null;
  let bestDepth = -1;
  regions.forEach((r, i) => {
    if (addr >= r.from && end <= Math.ceil(r.to / layout.unit) * layout.unit && layout.bands[i].depth > bestDepth) {
      best = r;
      bestDepth = layout.bands[i].depth;
    }
  });
  return best;
}

function MapBody({ layout: L, regions, cells = [], pointers = [], highlight = [] }: MemoryMapProps & { layout: MemLayout }) {
  const hatch = `memmap-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const cellOf = (addr: number, end: number) => cells.find((c) => c.addr >= addr && c.addr < end);
  const { cols } = L;

  return (
    <>
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="memmap-hatch" x1="0" y1="0" x2="0" y2="6" />
        </pattern>
      </defs>
      {L.rows.map((row) => {
        if (row.kind === 'gap') {
          return (
            <g key={`gap-${row.addr}`} className="memmap-gap">
              <rect x={cols.cell} y={row.y + 1} width={cols.cellW} height={row.h - 2} rx={4} />
              <text x={cols.cell + cols.cellW / 2} y={row.y + row.h / 2 + 4}>
                ⋮
              </text>
            </g>
          );
        }
        const cell = cellOf(row.addr, row.end);
        const region = innermost(regions, L, row.addr, row.end);
        const tone: Tone | undefined = cell?.tone ?? region?.tone;
        const variant = region?.variant ?? 'live';
        const ringed = highlight.some((a) => a >= row.addr && a < row.end);
        return (
          <g
            key={row.addr}
            className={`memmap-row ${tone ? `tone-${tone}` : ''} ${cell?.tone ? 'is-own' : ''} is-${variant} ${ringed ? 'is-highlight' : ''}`}
          >
            <title>{`${formatAddr(row.addr, L.addrDigits)}${cell ? `: ${cell.value}` : ''}${region ? ` (${region.label}${variant === 'live' ? '' : `, ${variant}`})` : ''}`}</title>
            <text className="memmap-addr" x={cols.addr + cols.addrW - 8} y={row.y + row.h / 2 + 4}>
              {formatAddr(row.addr, L.addrDigits)}
            </text>
            <rect className="memmap-cell" x={cols.cell} y={row.y + 1} width={cols.cellW} height={row.h - 2} rx={4} />
            {variant === 'freed' && <rect className="memmap-freed" x={cols.cell} y={row.y + 1} width={cols.cellW} height={row.h - 2} rx={4} fill={`url(#${hatch})`} />}
            {cell && (
              <text className="memmap-value" x={cols.cell + cols.cellW / 2} y={row.y + row.h / 2 + 4}>
                {cell.value}
              </text>
            )}
          </g>
        );
      })}
      {regions.map((r, i) => {
        const b = L.bands[i];
        const x = cols.region + 8 + b.depth * MEMMAP.BRACKET_STEP;
        const variant = r.variant ?? 'live';
        return (
          <g key={`region-${i}`} className={`memmap-region tone-${r.tone} is-${variant}`}>
            <path d={`M${x - 4},${b.y + 2} H${x} V${b.y + b.h - 2} H${x - 4}`} />
            <text x={x + 5} y={b.y + Math.min(b.h / 2, MEMMAP.ROW_H / 2) + 4}>
              {r.label}
            </text>
          </g>
        );
      })}
      {pointers.map((p, i) => {
        const row = L.rows.find((r) => p.addr >= r.addr && p.addr < r.end);
        if (!row) return null;
        const y = row.y + row.h / 2;
        const tip = cols.pointer + MEMMAP.POINTER_W - 2;
        return (
          <g key={`ptr-${i}`} className={`memmap-pointer tone-${p.tone}`}>
            <text x={tip - 10} y={y + 4}>
              {p.label}
            </text>
            <polygon points={`${tip},${y} ${tip - 7},${y - 4} ${tip - 7},${y + 4}`} />
          </g>
        );
      })}
    </>
  );
}
