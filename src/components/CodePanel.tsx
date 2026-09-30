import type { ReactNode } from 'react';
import { SectionTitle } from './Panel';

export type LineState = 'idle' | 'past' | 'now' | 'next' | 'done' | 'cut' | 'cached' | 'pending';

/**
 * Source code with per-line state: the line running now, lines already run, lines skipped...
 * Give either `stateOf(i)` for full control or `active` for "these lines are now".
 *
 * - `renderLine` draws a line's code yourself, e.g. to strike through the parts a
 *   short-circuit never evaluates; `lines` stays the plain text (used for keys and labels).
 * - `onLineClick` makes every line a button (keyboard-operable, focus-visible), e.g. to
 *   toggle a breakpoint; `pressed(i)` reports toggle state to assistive tech.
 */
export function CodePanel({
  title, lines, stateOf, active, gutter = 'number', nowStyle = 'bar', trailing, renderLine, onLineClick, pressed,
  lineLabel, className = '',
}: {
  title?: ReactNode;
  lines: readonly string[];
  stateOf?: (i: number) => LineState;
  active?: number | readonly number[] | null;
  gutter?: 'number' | 'arrow' | 'none';
  /** 'solid': the now-line is filled with --hi. 'bar': tinted with a left bar. */
  nowStyle?: 'solid' | 'bar';
  /** Extra text at the end of a line (e.g. a build step's status). */
  trailing?: (i: number) => ReactNode;
  /** The line's code as rich content instead of the plain string. */
  renderLine?: (line: string, i: number) => ReactNode;
  onLineClick?: (i: number) => void;
  /** Toggle state of a clickable line (aria-pressed), e.g. "has a breakpoint". */
  pressed?: (i: number) => boolean;
  /** Accessible name of a clickable line; defaults to "Line N: <code>". */
  lineLabel?: (i: number) => string;
  className?: string;
}) {
  const activeSet = new Set(active == null ? [] : typeof active === 'number' ? [active] : active);
  const state = (i: number): LineState => stateOf?.(i) ?? (activeSet.has(i) ? 'now' : 'idle');
  return (
    <div className={`code-panel now-${nowStyle} ${onLineClick ? 'is-clickable' : ''} ${className}`}>
      {title && <SectionTitle>{title}</SectionTitle>}
      <ol>
        {lines.map((line, i) => {
          const s = state(i);
          const content = (
            <>
              {gutter !== 'none' && (
                <span className="gutter">{gutter === 'number' ? i + 1 : s === 'now' ? '▶' : ''}</span>
              )}
              <code>{renderLine ? renderLine(line, i) : line}</code>
              {trailing && <span className="trail">{trailing(i)}</span>}
            </>
          );
          return (
            <li key={i} className={`is-${s}`}>
              {onLineClick ? (
                <button
                  type="button"
                  className="code-line"
                  onClick={() => onLineClick(i)}
                  aria-pressed={pressed?.(i)}
                  aria-label={lineLabel?.(i) ?? `Line ${i + 1}: ${line}`}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
