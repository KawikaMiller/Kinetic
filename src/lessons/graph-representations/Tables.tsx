import { adjacencyMatrix, neighbours, type Graph } from './model';
import type { Selection } from './GraphCanvas';

/** Is (u, v) the edge the learner selected (either way round when undirected)? */
function isSelectedEdge(g: Graph, s: Selection, u: number, v: number) {
  return s?.kind === 'edge' && ((s.u === u && s.v === v) || (!g.directed && s.u === v && s.v === u));
}

/** V × V grid; every cell is a button that toggles that edge. */
export function MatrixView({ graph, selection, onToggle }: { graph: Graph; selection: Selection; onToggle: (u: number, v: number) => void }) {
  const m = adjacencyMatrix(graph);
  const sel = selection?.kind === 'node' ? selection.id : null;
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
