import type { GridCellSpec } from '../../components/CellGrid';
import type { GridView } from './runs';

/** The cell a view draws at (r, c): current beats path, then reads, the wrong answer, and the cell's own state. */
export function cellSpec(v: GridView, wrongAnswer: boolean, r: number, c: number): GridCellSpec {
  const same = ([pr, pc]: [number, number]) => pr === r && pc === c;
  const cell = v.cells[r][c];
  const text = cell.text;
  if (v.current && same(v.current)) return { tone: 'hi', fill: 'solid', text };
  if (v.path.some(same)) return { tone: 'violet', fill: 'solid', text };
  if (v.reads.some(same)) return { tone: 'info', fill: 'outline', text };
  if (v.answer && same(v.answer) && wrongAnswer) return { tone: 'bad', fill: 'solid', text };
  if (cell.kind === 'done') return { tone: 'ok', fill: 'tint', text };
  if (cell.kind === 'base') return { tone: 'muted', fill: 'tint', text };
  return { tone: 'dim', fill: 'none', text };
}
