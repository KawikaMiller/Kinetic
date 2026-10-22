import { type Spec, type State } from './spec';

const effectText = (effect: string): string => (effect === 'none' ? 'pass' : effect);

/** The processes at one moment: each with its program (next step ringed, guards violet), the critical marker, and the variables. */
export function ProcessView({ spec, state }: { spec: Spec; state: State }) {
  const critical = state.pcs.filter((pc) => pc === spec.critical).length;
  return (
    <div className="fm-state">
      <div className="fm-procs">
        {state.pcs.map((pc, p) => (
          <div key={p} className={`fm-proc${pc === spec.critical && critical > 1 ? ' is-bad' : ''}`}>
            <b>P{p}</b>
            <ol className="fm-steps mono" start={0}>
              {spec.steps.map((s, k) => (
                <li key={k} className={k === pc ? 'is-next' : ''}>
                  {effectText(s.effect)}
                  {s.guard !== 'true' && <span className="fm-guard"> when {s.guard}</span>}
                  {k === spec.critical && <span className="fm-crit"> (critical)</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <div className="fm-vars mono">
        {state.flags.map((f, p) => <span key={p}>flag{p} = {f}</span>)}
        <span>turn = {state.turn}</span>
        <span>lock = {state.lock}</span>
      </div>
    </div>
  );
}
