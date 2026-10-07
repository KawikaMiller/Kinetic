import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Bit } from '../../core/bits';
import { cssVar } from '../../core/palette';
import { radioKeyTarget } from '../../core/radio';

/** A cell's state outranks its category colour: flipped is a failure, corrected a success, miscorrected the second kind of failure. */
const STATE_COLOR: Partial<Record<NonNullable<CellLook['state']>, string>> = {
  flipped: cssVar('bad'),
  corrected: cssVar('ok'),
  miscorrected: cssVar('orange'),
};

/** How one cell looks: its colour (a CSS colour, usually a token var) and an optional state class. */
export interface CellLook {
  color: string;
  state?: 'flipped' | 'corrected' | 'miscorrected' | 'window';
}

/**
 * A row of bits laid into the parent's CSS grid (the wrapper is display: contents), so rows of
 * a table line up column for column. With `onFlip` the bits are toggle buttons with one tab
 * stop: arrow keys move between them (the shared radio key map), Space/Enter flips.
 * BitStrip can't do this yet: it has neither a roving tab stop nor categorical colours.
 */
export function FlipRow({
  bits, look, onFlip, pressed, ariaLabel, ariaLabelOf,
}: {
  bits: readonly Bit[];
  look: (i: number) => CellLook;
  onFlip?: (i: number) => void;
  /** Toggle state announced for button i; defaults to "this bit is flipped". */
  pressed?: (i: number) => boolean;
  ariaLabel: string;
  ariaLabelOf?: (i: number) => string;
}) {
  const [focus, setFocus] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = radioKeyTarget(e.key, i, bits.length);
    if (to === null) return;
    e.preventDefault();
    setFocus(to);
    buttons.current[to]?.focus();
  };

  return (
    <div className="ed-row-cells" role="group" aria-label={ariaLabel}>
      {bits.map((bit, i) => {
        const { color, state } = look(i);
        const cls = `ed-bit ${bit ? 'is-set' : 'is-clear'} ${state ? `is-${state}` : ''}`;
        const style = { ['--c' as string]: (state && STATE_COLOR[state]) ?? color } as CSSProperties;
        return onFlip ? (
          <button
            key={i}
            type="button"
            ref={(el) => {
              buttons.current[i] = el;
            }}
            className={cls}
            style={style}
            tabIndex={i === focus ? 0 : -1}
            aria-pressed={pressed ? pressed(i) : state === 'flipped'}
            aria-label={ariaLabelOf?.(i) ?? `bit ${i + 1}`}
            onFocus={() => setFocus(i)}
            onClick={() => onFlip(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {bit}
          </button>
        ) : (
          <span key={i} className={cls} style={style}>
            {bit}
          </span>
        );
      })}
    </div>
  );
}
