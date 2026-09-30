import type { Tone } from '../core/tone';

/** One printed line: plain text is normal output; give a tone for errors, warnings, etc. */
export type ConsoleLine = string | { text: string; tone: Tone };

/**
 * A program's console: what it printed, in order, with an empty state. Normal output is
 * green; an `error` line (e.g. an uncaught exception) goes last in red.
 */
export function ConsolePanel({
  lines, error, title = 'console', empty = 'nothing printed yet',
}: {
  lines: readonly ConsoleLine[];
  /** Printed last as "Uncaught <error>". */
  error?: string | null;
  title?: string;
  empty?: string;
}) {
  return (
    <div className="console-panel" aria-label="Console output">
      <span className="console-panel-title">{title}</span>
      {lines.length === 0 && !error && <span className="empty-note">{empty}</span>}
      {lines.map((line, i) =>
        typeof line === 'string' ? (
          <code key={i}>{line}</code>
        ) : (
          <code key={i} className={`tone-${line.tone}`}>
            {line.text}
          </code>
        ),
      )}
      {error && <code className="tone-bad">Uncaught {error}</code>}
    </div>
  );
}
