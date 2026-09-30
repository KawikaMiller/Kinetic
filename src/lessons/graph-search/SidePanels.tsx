import { motion } from 'motion/react';
import { ALGOS, ALGO_NAMES, xy, type Algo, type DsEntry, type Trace } from './search';

const coord = (i: number) => xy(i).join(',');

const DS_INFO: Record<Algo, { title: string; sub: string }> = {
  bfs: { title: 'Queue', sub: 'FIFO · top leaves next' },
  dfs: { title: 'Stack', sub: 'LIFO · top pops next' },
  dijkstra: { title: 'Priority queue', sub: 'lowest cost pops next' },
  astar: { title: 'Priority queue', sub: 'lowest cost + guess pops next' },
};

/** The live queue / stack / priority queue driving the search. */
export function DsPanel({ algo, ds, size }: { algo: Algo; ds: DsEntry[]; size: number }) {
  const info = DS_INFO[algo];
  return (
    <div className="gs-panel">
      <div className="gs-panel-head">
        <b>{info.title}</b>
        <span>{info.sub}</span>
      </div>
      <div className="gs-ds">
        {/* Frames tick every ~55ms, so chips just slide in via CSS rather than animating exits. */}
        {ds.map((e, k) => (
          <div key={e.cell} className={`gs-chip ${k === 0 ? 'next' : ''}`}>
            <span className="gs-chip-dot" />
            <span className="mono">({coord(e.cell)})</span>
            {e.pri !== undefined && <span className="gs-chip-pri">{e.pri}</span>}
          </div>
        ))}
        {size > ds.length && <div className="gs-more">+{size - ds.length} more</div>}
        {size === 0 && <div className="gs-more">empty</div>}
      </div>
    </div>
  );
}

/** Cells visited and path cost for all four algorithms on the current board. */
export function Scoreboard({ all, algo, onPick }: { all: Record<Algo, Trace>; algo: Algo; onPick: (a: Algo) => void }) {
  const maxVisits = Math.max(...ALGOS.map((a) => all[a].visits.length), 1);
  const found = ALGOS.filter((a) => all[a].path);
  const best = found.length ? Math.min(...found.map((a) => all[a].cost)) : 0;
  return (
    <div className="gs-panel">
      <div className="gs-panel-head">
        <b>Same board, all four</b>
        <span>cells visited · path cost</span>
      </div>
      <div className="gs-score">
        {ALGOS.map((a) => {
          const t = all[a];
          const optimal = t.path && t.cost === best;
          return (
            <button key={a} type="button" className={`gs-score-row ${a === algo ? 'on' : ''}`} onClick={() => onPick(a)}>
              <span className="gs-score-name">{ALGO_NAMES[a]}</span>
              <span className="gs-score-bar">
                <motion.i initial={false} animate={{ width: `${(t.visits.length / maxVisits) * 100}%` }} />
              </span>
              <span className="gs-score-num">{t.visits.length}</span>
              <span className={`gs-score-cost ${t.path ? (optimal ? 'ok' : 'bad') : ''}`}>
                {t.path ? `${t.cost}${optimal ? ' ✓' : ' ✗'}` : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
