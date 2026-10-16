import { ArrayStrip, type ArrayCellState, type ArrayCellTone, type ArrayPointer } from '../../components/ArrayStrip';
import { WideRegion } from '../../components/WideRegion';
import type { Tone } from '../../core/tone';
import { cellText } from './presets';

const CELL_PX = 24;
const FONT = 12;

/** The pattern laid under the text at an offset: blank cells pad the row, so both rows share one grid. */
export function StripPair({
  text, pattern, shift, textState, textTone, patternState, textPointers, patternPointers, revealAt,
}: {
  text: string;
  pattern: string;
  /** Where the pattern's first character sits under the text; null hides the pattern row's characters. */
  shift: number | null;
  textState: (i: number) => ArrayCellState;
  textTone?: (i: number) => Tone | ArrayCellTone | null;
  patternState: (k: number) => ArrayCellState;
  textPointers: ArrayPointer[];
  patternPointers: ArrayPointer[];
  /** The text index to keep on screen on a narrow phone. */
  revealAt: number;
}) {
  const cells = text.length + pattern.length;
  const textValues = [...text.split('').map(cellText), ...Array<string>(pattern.length).fill('')];
  const patternValues = Array.from({ length: cells }, (_, i) => (shift !== null && i >= shift && i < shift + pattern.length ? cellText(pattern[i - shift]) : ''));
  const inPattern = (i: number) => shift !== null && i >= shift && i < shift + pattern.length;
  const width = Math.max(320, cells * CELL_PX);
  return (
    <WideRegion
      minWidth={width}
      label="Text and pattern: scroll sideways to see all of it"
      gutter={{ top: 8, bottom: 30, x: 4 }}
      reveal={{ from: Math.max(0, revealAt) / cells, to: (Math.max(0, revealAt) + 1) / cells }}
    >
      <div className="km-strips">
        <div className="km-row"><span className="km-rowlabel">text</span></div>
        <ArrayStrip
          values={textValues}
          cellState={(i) => (i < text.length ? textState(i) : 'idle')}
          cellClass={(i) => (i >= text.length ? 'km-blank' : '')}
          cellTone={(i) => (i < text.length ? textTone?.(i) : null)}
          pointers={textPointers}
          showIndex
          fontSize={FONT}
          cellMax={CELL_PX + 6}
        />
        <div className="km-row"><span className="km-rowlabel">pattern</span></div>
        <ArrayStrip
          values={patternValues}
          cellState={(i) => (inPattern(i) ? patternState(i - (shift ?? 0)) : 'idle')}
          cellClass={(i) => (inPattern(i) ? '' : 'km-blank')}
          pointers={patternPointers}
          fontSize={FONT}
          cellMax={CELL_PX + 6}
        />
      </div>
    </WideRegion>
  );
}
