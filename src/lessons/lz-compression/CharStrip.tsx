import { ArrayStrip, type ArrayCellState, type ArrayRange } from '../../components/ArrayStrip';
import { WideRegion } from '../../components/WideRegion';
import type { ArrayCellTone } from '../../components/arrayPointers';
import type { Tone } from '../../core/tone';

const CELL_MIN_PX = 20;
const CELL_MAX_PX = 36;
/** Must match `.array-cells { gap }` in kit.css. */
const CELL_GAP_PX = 3;
const ARROW_HEIGHT = 34;
const ARROW_PAD = 4;
/** An arc rises this much per cell it spans, up to the room above the strip. */
const ARC_RISE_PER_CELL = 1.2;
const ARC_BASE_RISE = 8;

export interface Arrow {
  /** Cell the copy reads from, and the cell it lands on. */
  from: number;
  to: number;
  tone: Extract<Tone, 'violet' | 'hi'>;
}

/**
 * The text as one row of cells with back-reference arcs above it. It scrolls inside a WideRegion where
 * the text is longer than the screen, keeping `reveal` (a cell range) in view.
 */
export function CharStrip({
  values, cellState, cellTone, ranges, arrows = [], reveal, ariaLabel,
}: {
  values: readonly string[];
  cellState: (i: number) => ArrayCellState;
  cellTone?: (i: number) => Tone | ArrayCellTone | null | undefined;
  ranges?: readonly ArrayRange[];
  arrows?: readonly Arrow[];
  reveal?: { from: number; to: number };
  ariaLabel: string;
}) {
  const n = values.length;
  const maxWidth = n * CELL_MAX_PX + (n - 1) * CELL_GAP_PX;
  const minWidth = n * (CELL_MIN_PX + CELL_GAP_PX);
  return (
    <WideRegion minWidth={minWidth} label={`${ariaLabel}: scroll sideways to see all of it`} reveal={reveal && n > 0 ? { from: reveal.from / n, to: (reveal.to + 1) / n } : undefined}>
      <div className="lz-strip" style={{ maxWidth }} role="img" aria-label={ariaLabel}>
        <div className="lz-arrows" style={{ height: ARROW_HEIGHT }}>
          <svg viewBox={`0 0 ${n} ${ARROW_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
            {arrows.map((a, i) => {
              const rise = Math.min(ARROW_HEIGHT - ARROW_PAD, ARC_BASE_RISE + Math.abs(a.to - a.from) * ARC_RISE_PER_CELL);
              const mid = (a.from + a.to) / 2 + 0.5;
              return <path key={i} className={`lz-arc is-${a.tone}`} d={`M ${a.from + 0.5} ${ARROW_HEIGHT} Q ${mid} ${ARROW_HEIGHT - 2 * rise} ${a.to + 0.5} ${ARROW_HEIGHT}`} />;
            })}
          </svg>
          {arrows.map((a, i) => (
            <span key={i} className={`lz-arrowhead is-${a.tone}`} style={{ left: `${((a.to + 0.5) / n) * 100}%` }} aria-hidden="true">
              ▼
            </span>
          ))}
        </div>
        <ArrayStrip values={values} cellState={cellState} cellTone={cellTone} ranges={ranges} fontSize={13} cellMax={CELL_MAX_PX} />
      </div>
    </WideRegion>
  );
}
