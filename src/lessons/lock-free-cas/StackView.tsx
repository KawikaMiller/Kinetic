import { NODES, invariant, walkStack, type NodeId, type Op, type StackState } from './stack';

/** Nodes that are in no place or more than one: the ones to draw red. */
function brokenNodes(s: StackState): Set<NodeId> {
  const { nodes } = walkStack(s);
  return new Set(NODES.filter((n) => {
    const places = (nodes.includes(n) ? 1 : 0) + (s.free.includes(n) ? 1 : 0) + (s.retired.includes(n) ? 1 : 0) + s.threads.filter((t) => t.regs.includes(n) || t.tmp === n).length;
    return places !== 1;
  }));
}

function nodeChip(n: NodeId, className: string, bad: Set<NodeId>) {
  return <span key={n} className={`lfc-node ${className}${bad.has(n) ? ' is-bad' : ''}`}>{n}</span>;
}

/** The heap at one moment: head, the stack from head with each node's next pointer, the free list, retired nodes, and each thread. */
export function StackView({ state, programs, tagged }: { state: StackState; programs: readonly (readonly Op[])[]; tagged: boolean }) {
  const bad = brokenNodes(state);
  const { nodes } = walkStack(state);
  const broken = invariant(state);
  return (
    <div className="lfc-heap">
      <div className="lfc-row">
        <span className="lfc-label">head</span>
        <span className="lfc-ptr mono">{state.head.node ?? 'null'}{tagged ? ` (tag ${state.head.tag})` : ''}</span>
        <span className="lfc-label">stack</span>
        {nodes.length === 0 ? <span className="lfc-empty">empty</span> : nodes.map((n, i) => (
          <span key={n} className="lfc-link">{nodeChip(n, 'is-stack', bad)}<span className="lfc-next mono">next {state.next[n] ?? 'null'}</span>{i < nodes.length - 1 ? ' →' : ''}</span>
        ))}
      </div>
      <div className="lfc-row">
        <span className="lfc-label">free list</span>
        {state.free.length === 0 ? <span className="lfc-empty">empty</span> : state.free.map((n) => nodeChip(n, 'is-free', bad))}
        <span className="lfc-label">retired</span>
        {state.retired.length === 0 ? <span className="lfc-empty">none</span> : state.retired.map((n) => nodeChip(n, 'is-free', bad))}
      </div>
      <div className="lfc-threads">
        {state.threads.map((th, t) => (
          <div key={t} className="lfc-card">
            <b>T{t + 1}</b>
            <ol className="lfc-ops mono">
              {programs[t].map((op, i) => <li key={i} className={i === th.pc && th.phase !== 'done' ? 'is-next' : i < th.pc ? 'is-done' : ''}>{op}</li>)}
            </ol>
            <div className="lfc-regs mono">
              {th.regs.map((r, k) => <span key={k}>r{k + 1} = {r ? nodeChip(r, 'is-held', bad) : 'empty'}</span>)}
              {th.tmp && <span>new = {nodeChip(th.tmp, 'is-held', bad)}</span>}
              {th.h && <span className="lfc-seen">remembers head = {th.h}{th.nx ? `, next = ${th.nx}` : ''}</span>}
              {th.hp && <span className="lfc-seen">hazard pointer = {th.hp}</span>}
            </div>
          </div>
        ))}
      </div>
      {broken && <div className="lfc-broken" role="status">{broken}</div>}
    </div>
  );
}
