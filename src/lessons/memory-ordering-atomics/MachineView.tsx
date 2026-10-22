import { instrText, type Litmus, type Model, type Snapshot } from '../../core/memModel';

/** The machine at one moment: each thread's code with its next instruction ringed, its buffer and registers, and memory. */
export function MachineView({ litmus, snap, model }: { litmus: Litmus; snap: Snapshot; model: Model }) {
  return (
    <div className="moa-machine">
      <div className="moa-threads">
        {litmus.threads.map((prog, t) => (
          <div key={t} className="moa-card">
            <b className="moa-name">T{t}</b>
            <ol className="moa-code mono">
              {prog.map((ins, k) => (
                <li key={k} className={k === snap.pcs[t] ? 'is-next' : k < snap.pcs[t] ? 'is-done' : ''}>
                  <span className={ins.op === 'fence' || ins.ord ? 'moa-ordered' : ''}>{instrText(ins)}</span>
                </li>
              ))}
            </ol>
            {model === 'tso' && (
              <div className="moa-buffer" aria-label={`T${t} store buffer`}>
                <span className="moa-label">store buffer</span>
                {snap.buffers[t].length === 0 ? <span className="moa-empty">empty</span> : snap.buffers[t].map((cell, k) => <span key={k} className="moa-cell mono">{cell}</span>)}
              </div>
            )}
            <div className="moa-regs mono">
              {prog.flatMap((ins, k) => (ins.op === 'load' ? [{ reg: ins.reg, done: k < snap.pcs[t] }] : [])).map(({ reg, done }) => (
                <span key={reg}>{reg} = {done ? snap.regs[`T${t}.${reg}`] : '–'}</span>
              ))}
            </div>
            {model === 'relaxed' && (
              <div className="moa-view">may still read from write {Object.entries(snap.views[t] ?? {}).map(([x, k]) => `${x}#${k}`).join(' ')}</div>
            )}
          </div>
        ))}
      </div>
      <div className="moa-memory mono" aria-label="memory">
        <span className="moa-label">{model === 'relaxed' ? 'newest write' : 'memory'}</span>
        {Object.entries(snap.mem).map(([x, v]) => <span key={x} className="moa-mem">{x} = {v}</span>)}
      </div>
    </div>
  );
}
