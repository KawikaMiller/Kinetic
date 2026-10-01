import { useRef, useState, type KeyboardEvent } from 'react';
import { gridKeyTarget, type Cell } from '../../core/grid';
import { adjacencyMatrix, neighbours, type Graph } from './model';
import type { Selection } from './GraphCanvas';

/** Is (u, v) the edge the learner selected (either way round when undirected)? */
function isSelectedEdge(g: Graph, s: Selection, u: number, v: number) {
  return s?.kind === 'edge' && ((s.u === u && s.v === v) || (!g.directed && s.u === v && s.v === u));
}

/**
 * V × V grid; every cell is a button that toggles that edge. The grid is one tab stop:
 * arrow keys (Home/End, Ctrl+Home/End, PageUp/Down) move between cells, skipping the
 * diagonal, which is disabled because the lesson has no self-loops.
 */
export function MatrixView({ graph, selection, onToggle }: { graph: Graph; selection: Selection; onToggle: (u: number, v: number) => void }) {
  const m = adjacencyMatrix(graph);
  const sel = selection?.kind === 'node' ? selection.id : null;
  const n = graph.nodes.length;
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 1 });
  const cells = useRef(new Map<number, HTMLButtonElement>());
  // Keep the tab stop on a real, enabled cell as nodes come and go.
  const stop = clampOffDiagonal(focus, n);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, at: Cell) => {
    let to = gridKeyTarget(e.key, at, n, n, { ctrl: e.ctrlKey || e.metaKey });
    if (!to) return;
    e.preventDefault();
    if (to.r === to.c) {
      // Step over the diagonal in the direction of travel; stay put if that leaves the grid.
      const next = { r: to.r + Math.sign(to.r - at.r), c: to.c + Math.sign(to.c - at.c) };
      to = next.r >= 0 && next.r < n && next.c >= 0 && next.c < n && next.r !== next.c ? next : at;
    }
    setFocus(to);
    cells.current.get(to.r * n + to.c)?.focus();
  };
  return (
    <table className="data-table gr-matrix">
      <thead>
        <tr>
          <th aria-label="from \ to" />
          {graph.nodes.map((n) => (
            // directed: a node's neighbours are its row only, so its column header stays plain
            <th key={n.id} className={n.id === sel && !graph.directed ? 'is-info' : ''}>
              {n.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {graph.nodes.map((a, i) => (
          <tr key={a.id}>
            <th className={a.id === sel ? 'is-info' : ''}>{a.label}</th>
            {graph.nodes.map((b, j) => {
              const lit = isSelectedEdge(graph, selection, a.id, b.id) || a.id === sel || (!graph.directed && b.id === sel);
              return (
                <td key={b.id} className={`${lit ? 'is-info' : ''} ${m[i][j] ? 'is-set' : ''}`}>
                  <button
                    type="button"
                    disabled={a.id === b.id}
                    tabIndex={i === stop?.r && j === stop?.c ? 0 : -1}
                    ref={(el) => {
                      if (el) cells.current.set(i * n + j, el);
                      else cells.current.delete(i * n + j);
                    }}
                    onFocus={() => setFocus({ r: i, c: j })}
                    onKeyDown={(e) => onKeyDown(e, { r: i, c: j })}
                    onClick={() => onToggle(a.id, b.id)}
                    aria-label={`${m[i][j] ? 'Remove' : 'Add'} edge ${a.label} to ${b.label}`}
                  >
                    {a.id === b.id ? '' : m[i][j] || '·'}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The focused cell, moved inside an n × n grid and off the diagonal; null when there's no off-diagonal cell. */
function clampOffDiagonal(f: Cell, n: number): Cell | null {
  if (n < 2) return null;
  const r = Math.min(f.r, n - 1);
  const c = Math.min(f.c, n - 1);
  return r !== c ? { r, c } : { r, c: c > 0 ? c - 1 : 1 };
}

export function ListView({ graph, selection, onSelect }: { graph: Graph; selection: Selection; onSelect: (s: Selection) => void }) {
  const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
  return (
    <ul className="gr-list">
      {graph.nodes.map((n) => {
        const rowHot = selection?.kind === 'node' && selection.id === n.id;
        return (
          <li key={n.id} className={rowHot ? 'is-info' : ''}>
            <button type="button" className="gr-list-head" onClick={() => onSelect({ kind: 'node', id: n.id })}>
              {n.label}
            </button>
            <span className="gr-arrow">{graph.directed ? '→' : '—'}</span>
            {neighbours(graph, n.id).map((nb) => (
              <span key={nb.id} className={`chip ${isSelectedEdge(graph, selection, n.id, nb.id) ? 'tone-info' : ''}`}>
                {label.get(nb.id)}
                {graph.weighted ? ` (${nb.w})` : ''}
              </span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
