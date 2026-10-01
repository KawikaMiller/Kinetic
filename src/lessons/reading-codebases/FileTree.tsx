import type { NavState, Task } from './model';
import { FILES } from './repo';

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Files grouped by directory, in repo order. */
const GROUPS = FILES.reduce<{ dir: string; files: string[] }[]>((acc, f) => {
  const dir = dirOf(f.path);
  const group = acc.find((g) => g.dir === dir);
  if (group) group.files.push(f.path);
  else acc.push({ dir, files: [f.path] });
  return acc;
}, []);

/** The repo's file tree: the open file in --hi, visited ones violet, the answer's file green once found. */
export function FileTree({ nav, task, done, onOpen }: { nav: NavState; task: Task; done: boolean; onOpen: (file: string) => void }) {
  const visited = new Set(nav.trail);
  return (
    <nav className="rc-tree" aria-label="Files">
      {GROUPS.map((g) => (
        <div key={g.dir} className="rc-dir">
          <span className="rc-dir-name">{g.dir}/</span>
          {g.files.map((path) => {
            const isOpen = nav.at?.file === path;
            const state = done && path === task.answer.file ? 'is-answer' : isOpen ? 'is-open' : visited.has(path) ? 'is-visited' : '';
            return (
              <button key={path} type="button" className={`rc-file ${state}`} onClick={() => onOpen(path)} aria-current={isOpen ? 'true' : undefined}>
                {nameOf(path)}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
