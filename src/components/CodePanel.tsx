import type { ReactNode } from 'react';
import { SectionTitle } from './Panel';

export type LineState = 'idle' | 'past' | 'now' | 'next' | 'done' | 'cut' | 'cached' | 'pending';

/**
 * Source code with per-line state: the line running now, lines already run, lines skipped...
 * Give either `stateOf(i)` for full control or `active` for "these lines are now".
 */
export function CodePanel({
  title, lines, stateOf, active, gutter = 'number', nowStyle = 'bar', trailing, className = '',
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
  className?: string;
}) {
  const activeSet = new Set(active == null ? [] : typeof active === 'number' ? [active] : active);
  const state = (i: number): LineState => stateOf?.(i) ?? (activeSet.has(i) ? 'now' : 'idle');
  return (
    <div className={`code-panel now-${nowStyle} ${className}`}>
      {title && <SectionTitle>{title}</SectionTitle>}
      <ol>
        {lines.map((line, i) => {
          const s = state(i);
          return (
            <li key={i} className={`is-${s}`}>
              {gutter !== 'none' && (
                <span className="gutter">{gutter === 'number' ? i + 1 : s === 'now' ? '▶' : ''}</span>
              )}
              <code>{line}</code>
              {trailing && <span className="trail">{trailing(i)}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
