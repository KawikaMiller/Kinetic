import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { placeValue, type Bit, type BitGroup } from '../core/bits';
import { power } from '../core/format';
import { radioKeyTarget } from '../core/radio';
import type { Tone } from '../core/tone';

export type { Bit, BitGroup } from '../core/bits';

/** How place values are labelled: 'value' (512, 1K, 32K) or 'exponent' (2⁹, 2¹⁰, 2²³, for wide registers). */
export type PlaceLabels = 'value' | 'exponent';

/** Compact place value for the label above a bit: 512, 1K, 32K. */
const compactPlace = (v: number) => (v >= 1024 ? `${v / 1024}K` : String(v));

const placeLabel = (i: number, n: number, mode: PlaceLabels) =>
  mode === 'exponent' ? power(n - 1 - i) : compactPlace(placeValue(i, n));

interface Run {
  from: number;
  to: number;
  group?: BitGroup;
}

/** Cover 0..n-1 with the given groups plus plain runs for any gaps, in order. */
function runsOf(n: number, groups: readonly BitGroup[]): Run[] {
  const sorted = [...groups].sort((a, b) => a.from - b.from);
  const runs: Run[] = [];
  let next = 0;
  for (const g of sorted) {
    if (g.from > next) runs.push({ from: next, to: g.from - 1 });
    runs.push({ from: g.from, to: g.to, group: g });
    next = g.to + 1;
  }
  if (next < n) runs.push({ from: next, to: n - 1 });
  return runs;
}

/**
 * A row of bits, most significant first: a register of toggle switches, a byte,
 * a float32's sign/exponent/mantissa, the nine rwx permission bits.
 *
 * - Set bits are a solid fill in their tone, clear bits a dark cell outlined in it.
 *   Tone comes from `toneOf(i, bit)`, else the bit's group, else `hi`.
 *   `clear="toned"` draws clear bits with a full-strength edge and digit in their tone,
 *   for rows where the tone means something on every bit (Hamming's parity groups).
 * - `pending(i)` marks bits not worked out yet: an empty dashed slot, not a 0.
 * - `groups` draw a bracket (with an optional label) under a run of bits and leave
 *   a gap between runs. On narrow screens the strip wraps between groups, never
 *   inside one, so split very long runs (a 23-bit mantissa) into a few groups.
 * - `placeValues` labels each bit with its place value above it (`true`/'value': 512, 1K),
 *   or as a power of two ('exponent': 2¹⁰, 2²³) once values get too wide for the cells,
 *   roughly past 16 bits; `labelOf` overrides either with any label (r/w/x, a bit index).
 * - With `onToggle` the bits are buttons (aria-pressed: the bit is 1, or `pressedOf(i)`)
 *   with one tab stop: arrow keys move between them (wrapping), Home/End jump to the ends,
 *   Space/Enter toggles. Without it they're read-only. `ariaLabelOf(i)` names each button
 *   ("group write", "sign bit"); the default is "bit i" plus the place value when shown.
 * - `layout="cells"` drops the strip's own box: the bits become items of the parent's CSS
 *   grid, so several rows of a table line up column for column (error-detection-correction).
 *   Each bit fills its grid column; no groups or labels in this layout.
 */
export function BitStrip({
  bits, onToggle, groups = [], placeValues = false, labelOf, ariaLabelOf, pressedOf, toneOf, pending, highlight = [], highlightTone = 'info',
  clear = 'quiet', layout = 'strip', size = 'md', ariaLabel = 'bits', className = '',
}: {
  bits: readonly Bit[];
  onToggle?: (i: number) => void;
  groups?: readonly BitGroup[];
  placeValues?: boolean | PlaceLabels;
  labelOf?: (i: number) => ReactNode;
  /** Accessible name of a toggleable bit; `i` counts from the most significant bit. */
  ariaLabelOf?: (i: number) => string;
  /** Toggle state announced for button i (default: the bit is 1), e.g. "flipped in transit". */
  pressedOf?: (i: number) => boolean;
  toneOf?: (i: number, bit: Bit) => Tone | undefined;
  /** Bits not computed yet: drawn as an empty dashed slot whatever their value. */
  pending?: (i: number) => boolean;
  /** Bits drawn with a ring, e.g. a carry rippling left. */
  highlight?: readonly number[];
  highlightTone?: Tone;
  /** How clear bits draw: `quiet` (faint edge and digit) or `toned` (edge and digit in the tone). */
  clear?: 'quiet' | 'toned';
  layout?: 'strip' | 'cells';
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
  className?: string;
}) {
  const n = bits.length;
  const ringed = new Set(highlight);
  const cells = layout === 'cells';
  const placeMode: PlaceLabels | null = cells ? null : placeValues === true ? 'value' : placeValues || null;
  const label = (i: number) => labelOf?.(i) ?? (placeMode ? placeLabel(i, n, placeMode) : null);
  const hasLabels = !cells && (!!placeMode || !!labelOf);
  const [focus, setFocus] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = Math.min(focus, n - 1);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = radioKeyTarget(e.key, i, n);
    if (to === null) return;
    e.preventDefault();
    setFocus(to);
    buttons.current[to]?.focus();
  };

  const renderCell = (i: number, group?: BitGroup) => {
    const bit = bits[i];
    const tone = toneOf?.(i, bit) ?? group?.tone ?? 'hi';
    const isPending = !!pending?.(i);
    const state = isPending ? 'is-pending' : bit ? 'is-set' : 'is-clear';
    const cls = `bit tone-${tone} ${state} ${ringed.has(i) ? 'is-ringed' : ''}`;
    const content = isPending ? '' : bit;
    if (!onToggle) return <span key={cells ? i : undefined} className={cls}>{content}</span>;
    const place = placeMode ? ` (${placeValue(i, n)})` : '';
    return (
      <button
        key={cells ? i : undefined}
        type="button"
        ref={(el) => {
          buttons.current[i] = el;
        }}
        className={cls}
        tabIndex={i === tabStop ? 0 : -1}
        aria-pressed={pressedOf ? pressedOf(i) : bit === 1}
        aria-label={`${ariaLabelOf?.(i) ?? `bit ${i}${place}`}${isPending ? ', not worked out yet' : ''}`}
        onFocus={() => setFocus(i)}
        onClick={() => onToggle(i)}
        onKeyDown={(e) => onKeyDown(e, i)}
      >
        {content}
      </button>
    );
  };

  const rootClass = `bit-strip size-${size} ${cells ? 'is-cells' : ''} ${clear === 'toned' ? 'is-toned' : ''} ${className}`;
  const ring = { ['--ring' as string]: `var(--${highlightTone})` };

  if (cells) {
    return (
      <div className={rootClass} role="group" aria-label={ariaLabel} style={ring}>
        {bits.map((_, i) => renderCell(i))}
      </div>
    );
  }

  return (
    <div className={rootClass} role="group" aria-label={ariaLabel} style={ring}>
      {runsOf(n, groups).map((run) => (
        <div key={run.from} className={`bit-group ${run.group?.tone ? `tone-${run.group.tone}` : ''}`}>
          <div className="bit-row">
            {Array.from({ length: run.to - run.from + 1 }, (_, k) => {
              const i = run.from + k;
              return (
                <span key={i} className="bit-slot">
                  {hasLabels && <span className="bit-label">{label(i)}</span>}
                  {renderCell(i, run.group)}
                </span>
              );
            })}
          </div>
          {run.group && (
            <div className="bit-bracket">
              <span className="bit-bracket-line" />
              {run.group.label != null && <span className="bit-bracket-label">{run.group.label}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
