import { useMemo, useState } from 'react';
import { TracePlayer } from '../components/TracePlayer';
import { Segmented } from '../components/ui';
import { FIXTURES, MODELS, outcomes, regsKeys, type Model } from '../core/memModel';
import { explorePathSteps } from '../core/traceFrames';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 4 kit, agent F (#/dev/kit): core/memModel. */

const MODEL_LABELS: Record<Model, string> = { sc: 'SC', tso: 'x86-style (TSO)', relaxed: 'Weak (relaxed)' };
const MODEL_OPTIONS = MODELS.map((m) => ({ value: m, label: MODEL_LABELS[m] }));
const FIXTURE_OPTIONS = FIXTURES.map((l, i) => ({ value: String(i), label: l.name }));

function LitmusDemo() {
  const [model, setModel] = useState<Model>('tso');
  const [which, setWhich] = useState('0');
  const [shown, setShown] = useState<string | null>(null);
  const litmus = FIXTURES[Number(which)];
  const result = useMemo(() => outcomes(litmus, model), [litmus, model]);
  const sc = useMemo(() => new Set(regsKeys(outcomes(litmus, 'sc'))), [litmus]);
  const witness = [...result.outcomes.values()].find((o) => o.regsKey === shown);
  return (
    <>
      <div className="controls">
        <Segmented ariaLabel="Litmus test" options={FIXTURE_OPTIONS} value={which} onChange={(v) => { setWhich(v); setShown(null); }} />
        <Segmented ariaLabel="Memory model" options={MODEL_OPTIONS} value={model} onChange={(m) => { setModel(m); setShown(null); }} />
      </div>
      <p className="mono">{result.states} states, {result.truncated ? 'truncated' : 'exhaustive'} · allowed by the model, not observed on any chip</p>
      <table className="mono">
        <tbody>
          {regsKeys(result).map((k) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{sc.has(k) ? 'SC also allows it' : 'only because of the weaker model'}</td>
              <td><button type="button" onClick={() => setShown(k)}>show it</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {witness && (
        <TracePlayer
          initial={result.start}
          steps={explorePathSteps(witness.example)}
          renderState={(s) => <p className="mono">mem {JSON.stringify(s.mem)} · buffers {JSON.stringify(s.buffers)} · regs {JSON.stringify(s.regs)}</p>}
          label={`Shortest schedule to ${witness.regsKey}`}
        />
      )}
    </>
  );
}

export function DevKitTier4c() {
  return (
    <Section title="core/memModel · litmus tests under SC, TSO and the relaxed (view-based) model, every outcome with its shortest schedule">
      <LitmusDemo />
    </Section>
  );
}
