import type { ReactNode } from 'react';
import { placeValue, type Bit, type BitGroup } from '../core/bits';
import type { Tone } from '../core/tone';

export type { Bit, BitGroup } from '../core/bits';

/** Compact place value for the label above a bit: 512, 1K, 32K. */
const compactPlace = (v: number) => (v >= 1024 ? `${v / 1024}K` : String(v));

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
 * - `groups` draw a bracket (with an optional label) under a run of bits and leave
 *   a gap between runs. On narrow screens the strip wraps between groups, never
 *   inside one, so split very long runs (a 23-bit mantissa) into a few groups.
 * - `placeValues` labels each bit with 2^k above it; `labelOf` overrides that
 *   with any label (r/w/x, a bit index).
 * - With `onToggle` the bits are buttons (aria-pressed); without it they're read-only.
 */
export function BitStrip({
  bits, onToggle, groups = [], placeValues = false, labelOf, toneOf, highlight = [], highlightTone = 'info',
  size = 'md', ariaLabel = 'bits', className = '',
}: {
  bits: readonly Bit[];
  onToggle?: (i: number) => void;
  groups?: readonly BitGroup[];
  placeValues?: boolean;
  labelOf?: (i: number) => ReactNode;
  toneOf?: (i: number, bit: Bit) => Tone | undefined;
  /** Bits drawn with a ring, e.g. a carry rippling left. */
  highlight?: readonly number[];
  highlightTone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
  className?: string;
}) {
  const n = bits.length;
  const ringed = new Set(highlight);
  const label = (i: number) => labelOf?.(i) ?? (placeValues ? compactPlace(placeValue(i, n)) : null);
  const hasLabels = placeValues || !!labelOf;

  const renderBit = (i: number, group?: BitGroup) => {
    const bit = bits[i];
    const tone = toneOf?.(i, bit) ?? group?.tone ?? 'hi';
    const cls = `bit tone-${tone} ${bit ? 'is-set' : 'is-clear'} ${ringed.has(i) ? 'is-ringed' : ''}`;
    const place = placeValues ? ` (${placeValue(i, n)})` : '';
    return (
      <span key={i} className="bit-slot">
        {hasLabels && <span className="bit-label">{label(i)}</span>}
        {onToggle ? (
          <button type="button" className={cls} aria-pressed={bit === 1} aria-label={`bit ${i}${place}`} onClick={() => onToggle(i)}>
            {bit}
          </button>
        ) : (
          <span className={cls}>{bit}</span>
        )}
      </span>
    );
  };

  return (
    <div
      className={`bit-strip size-${size} ${className}`}
      role="group"
      aria-label={ariaLabel}
      style={{ ['--ring' as string]: `var(--${highlightTone})` }}
    >
      {runsOf(n, groups).map((run) => (
        <div key={run.from} className={`bit-group ${run.group?.tone ? `tone-${run.group.tone}` : ''}`}>
          <div className="bit-row">
            {Array.from({ length: run.to - run.from + 1 }, (_, k) => renderBit(run.from + k, run.group))}
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
