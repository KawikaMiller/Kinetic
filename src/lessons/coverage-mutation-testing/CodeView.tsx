import { CodePanel } from '../../components/CodePanel';
import type { Coverage } from './coverage';
import { lineText, printProgram, type Marks } from './print';
import type { Program } from './program';

/**
 * The function printed from its tree. `coverage` colours executed lines (blue) and lines nothing
 * reached (grey); `marks` paints the tokens a mutation changed (orange). Passing `onLineClick`
 * makes the lines toggles, for picking changed lines.
 */
export function CodeView({
  program, marks, coverage, title, onLineClick, pressed,
}: {
  program: Program;
  marks?: Marks;
  coverage?: Coverage;
  title?: string;
  onLineClick?: (i: number) => void;
  pressed?: (i: number) => boolean;
}) {
  const lines = printProgram(program, marks);
  const status = (i: number) => (!coverage || !lines[i].anchor ? 'plain' : coverage.lines[i].covered ? 'covered' : 'uncovered');
  return (
    <CodePanel
      title={title}
      lines={lines.map(lineText)}
      onLineClick={onLineClick}
      pressed={pressed}
      roving={onLineClick !== undefined}
      lineLabel={(i) => `Line ${i + 1}: ${lineText(lines[i]).trim()}`}
      renderLine={(_, i) => (
        <span className={`cm-line is-${status(i)}`}>
          {lines[i].segments.map((s, k) => (s.mutated ? <mark key={k} className="cm-mut">{s.text}</mark> : s.text))}
        </span>
      )}
    />
  );
}
