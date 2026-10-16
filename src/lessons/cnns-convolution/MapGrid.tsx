import { CellGrid, type GridHighlight } from '../../components/CellGrid';
import { decimal } from '../../core/format';
import type { Image } from './barsData';

type Size = 'xs' | 'sm' | 'md';

/**
 * A grid of numbers drawn by sign: positive is an `ok` tint, negative a `bad` tint, zero `dim` (a sign,
 * not a verdict). The tint strength is |value| over `scale`, the largest magnitude the grid should show.
 * `shown` hides cells that have not been computed yet.
 */
export function MapGrid({
  map, scale, size = 'sm', shown, highlight, onCellClick, ariaLabel, digits = 1,
}: {
  map: readonly (readonly number[])[];
  scale?: number;
  size?: Size;
  shown?: (r: number, c: number) => boolean;
  highlight?: readonly GridHighlight[];
  onCellClick?: (r: number, c: number) => void;
  ariaLabel: string;
  digits?: number;
}) {
  const top = scale ?? Math.max(...map.flat().map(Math.abs), Number.EPSILON);
  return (
    <CellGrid
      rows={map.length}
      cols={map[0].length}
      size={size}
      ariaLabel={ariaLabel}
      highlight={highlight}
      onCellClick={onCellClick}
      cell={(r, c) => {
        if (shown && !shown(r, c)) return { tone: 'dim', fill: 'outline' };
        const v = map[r][c];
        if (Math.abs(v) < 1e-12) return { tone: 'dim', fill: 'tint', intensity: 0.08, text: size === 'xs' ? undefined : '0' };
        return { tone: v > 0 ? 'ok' : 'bad', fill: 'tint', intensity: 0.12 + 0.6 * Math.min(1, Math.abs(v) / top), text: size === 'xs' ? undefined : decimal(v, digits) };
      }}
    />
  );
}

/**
 * A picture: grey tint by brightness (a plain neutral, not a verdict), with the zeros of padding drawn `dim`.
 * `pad` rings around the picture are padding; `onPaint` receives picture coordinates, never a padded cell.
 */
export function ImageGrid({
  image, pad = 0, size = 'md', highlight, onPaint, ariaLabel,
}: {
  image: Image;
  pad?: number;
  size?: Size;
  highlight?: readonly GridHighlight[];
  onPaint?: (y: number, x: number) => void;
  ariaLabel: string;
}) {
  const side = image.length + 2 * pad;
  return (
    <CellGrid
      rows={side}
      cols={side}
      size={size}
      ariaLabel={ariaLabel}
      highlight={highlight}
      onCellClick={onPaint && ((r, c) => (r >= pad && c >= pad && r < side - pad && c < side - pad ? onPaint(r - pad, c - pad) : undefined))}
      cellAriaLabel={(r, c) => {
        const inside = r >= pad && c >= pad && r < side - pad && c < side - pad;
        return inside ? `row ${r - pad + 1}, column ${c - pad + 1}, brightness ${image[r - pad][c - pad]}` : `padding, row ${r + 1}, column ${c + 1}, zero`;
      }}
      cell={(r, c) => {
        const inside = r >= pad && c >= pad && r < side - pad && c < side - pad;
        if (!inside) return { tone: 'dim', fill: 'outline', text: size === 'xs' ? undefined : '0' };
        const v = image[r - pad][c - pad];
        return { tone: 'muted', fill: 'tint', intensity: v * 0.85, text: v === 0 || size === 'xs' ? undefined : decimal(v, 1) };
      }}
    />
  );
}
