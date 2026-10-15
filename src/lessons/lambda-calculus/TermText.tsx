import { Fragment } from 'react';
import { tonesOf } from './tones';
import { segments, type Path, type Term } from './term';

/** What a stretch of the printed term is doing right now. */
export type MarkKind = 'next' | 'redex' | 'arg' | 'occ' | 'repl' | 'bad';

export interface Mark {
  paths: readonly Path[];
  kind: MarkKind;
}

/** Priority when marks overlap on one piece of text. */
const PRIORITY: readonly MarkKind[] = ['bad', 'repl', 'occ', 'arg', 'next', 'redex'];

function markFor(path: Path, marks: readonly Mark[]): MarkKind | null {
  const hits = marks.filter((m) => m.paths.some((p) => path.startsWith(p)));
  return PRIORITY.find((k) => hits.some((m) => m.kind === k)) ?? null;
}

/**
 * The term as text, every piece coloured by its binder and marked by what is happening to it.
 * A mark covers the node it names and everything inside it (the parentheses around it too).
 * `renamed` lists the names alpha-renaming just made; they are drawn in orange.
 */
export function TermText({ term, marks = [], renamed = [], ariaLabel }: { term: Term; marks?: readonly Mark[]; renamed?: readonly string[]; ariaLabel?: string }) {
  const tones = tonesOf(term);
  const segs = segments(term);
  return (
    <code className="ld-text" aria-label={ariaLabel}>
      {segs.map((s, i) => {
        const mark = markFor(s.path, marks);
        const name = s.role === 'binder' ? s.text.slice(1, -1) : s.role === 'var' ? s.text : '';
        const tone = renamed.includes(name) ? 'orange' : s.role === 'punct' ? null : tones.get(s.path) ?? 'muted';
        return (
          <Fragment key={i}>
            <span className={`ld-seg${tone ? ` tone-${tone}` : ''}${mark ? ` ld-m-${mark}` : ''}`}>{s.text}</span>
          </Fragment>
        );
      })}
    </code>
  );
}
