import { useEffect, useRef, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { fileOf, type Loc, type NavState, type Task } from './model';

/** Wrap every case-insensitive occurrence of `needle` in a mark. */
function mark(line: string, needle: string): ReactNode {
  const q = needle.trim().toLowerCase();
  const lower = line.toLowerCase();
  if (!q || !lower.includes(q)) return line;
  const out: ReactNode[] = [];
  let from = 0;
  for (let i = lower.indexOf(q); i >= 0; i = lower.indexOf(q, from)) {
    out.push(line.slice(from, i), <mark key={i} className="rc-mark">{line.slice(i, i + q.length)}</mark>);
    from = i + q.length;
  }
  out.push(line.slice(from));
  return out;
}

/** The open file: click a line to select it. Selected line --hi, search matches info, the answer green. */
export function Viewer({ nav, task, done, onLine }: { nav: NavState; task: Task; done: boolean; onLine: (at: Loc) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const at = nav.at;

  useEffect(() => {
    ref.current?.querySelector('li.is-now, li.is-done')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  if (!at) {
    return (
      <div className="rc-viewer is-empty">
        <p>No file open. Pick one from the tree, or search for something you already know: an error code, a route, a word from the question.</p>
      </div>
    );
  }
  const file = fileOf(at.file);
  const isAnswer = (i: number) => done && task.answer.file === at.file && i + 1 === task.answer.line;
  return (
    <div className="rc-viewer" ref={ref}>
      <div className="rc-path">
        {at.file}
        {at.line > 0 && <span className="rc-path-line">:{at.line}</span>}
      </div>
      <CodePanel
        lines={file.lines}
        className="rc-code"
        stateOf={(i) => (isAnswer(i) ? 'done' : i + 1 === at.line ? 'now' : 'idle')}
        onLineClick={(i) => onLine({ file: at.file, line: i + 1 })}
        pressed={(i) => i + 1 === at.line}
        renderLine={(line) => (nav.search ? mark(line, nav.search.query) : line)}
        trailing={(i) => (isAnswer(i) ? <span className="rc-found">← here</span> : null)}
      />
    </div>
  );
}
