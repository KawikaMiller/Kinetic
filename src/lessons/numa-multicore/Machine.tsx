import { pct } from '../../core/format';
import { PAGES, SOCKETS, nsText, type Latency, type Machine as MachineModel, type Node } from './numa';

const NODE_TONE: Record<Node, string> = { 0: 'sky', 1: 'amber' };

/** A page chip: its node is a categorical tone, never ok or bad. A button when `onToggle` is given. */
export function PageChip({ page, home, onToggle }: { page: number; home: Node; onToggle?: (page: number) => void }) {
  const label = `P${page}`;
  const className = `numa-page tone-${NODE_TONE[home]}`;
  if (!onToggle) return <span className={className}>{label}</span>;
  return (
    <button type="button" className={className} aria-label={`Page ${page} lives on node ${home}: press to move it to node ${1 - home}`} onClick={() => onToggle(page)}>
      {label}
    </button>
  );
}

/** Two sockets, each with its threads and a memory bank holding the pages that live on it, joined by the interconnect. */
export function TwoSockets({ machine, latency, onTogglePage }: { machine: MachineModel; latency: Latency; onTogglePage?: (page: number) => void }) {
  return (
    <div className="numa-sockets">
      {onTogglePage && (
        <div className="numa-pages" role="group" aria-label="Pages: press one to move it to the other node">
          <span className="numa-label">pages</span>
          {machine.homes.map((home, p) => <PageChip key={p} page={p} home={home} onToggle={onTogglePage} />)}
        </div>
      )}
      {Array.from({ length: SOCKETS }, (_, n) => n as Node).map((node) => (
        <div key={node} className={`numa-socket tone-${NODE_TONE[node]}`}>
          <b>Socket {node}</b>
          <div className="numa-threads">
            {machine.sockets.flatMap((s, t) => (s === node ? [t] : [])).map((t) => {
              const row = latency.perThread[t];
              return (
                <span key={t} className={`numa-thread ${row.remoteShare === 0 ? 'is-local' : 'is-remote'}`}>
                  T{t}: {nsText(row.ns)} ({pct(row.remoteShare)} remote)
                </span>
              );
            })}
            {machine.sockets.every((s) => s !== node) && <span className="numa-empty">no threads</span>}
          </div>
          <div className="numa-bank">
            <span className="numa-label">memory node {node}</span>
            {Array.from({ length: PAGES }, (_, p) => p).flatMap((p) => (machine.homes[p] === node ? [p] : [])).map((p) => <PageChip key={p} page={p} home={node} />)}
            {machine.homes.every((h) => h !== node) && <span className="numa-empty">no pages</span>}
          </div>
        </div>
      ))}
      <div className="numa-link">interconnect: a remote access crosses it</div>
    </div>
  );
}
