import { useMemo, useState } from 'react';
import { Button, Provenance, Segmented } from '../components/ui';
import { crossCheckP256, formatPoint, mul, TOY_F17, type P256CrossCheck } from '../core/ecc';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 4 kit, agent G (#/dev/kit): core/ecc double-and-add trace, core/field, the P-256 cross-check. */

const SCALARS = [2, 7, 13, 19, 20].map((k) => ({ value: k, label: `k = ${k}` }));

/** The double-and-add trace of k·G on the toy curve (a toy: 5-bit field, 19 points). */
function TraceDemo() {
  const [k, setK] = useState(13);
  const run = useMemo(() => mul(TOY_F17, BigInt(k), TOY_F17.G), [k]);
  return (
    <>
      <p>
        <Provenance kind="toy">y^2 = x^3 + 2x + 2 over F17, a 5-bit field with 19 points: broken instantly, never to be used</Provenance>
      </p>
      <div className="controls">
        <Segmented ariaLabel="Scalar k" options={SCALARS} value={k} onChange={setK} />
      </div>
      <ol className="mono">
        {run.steps.map((s, i) => (
          <li key={i}>{s.op} (bit {s.bitIndex}): {formatPoint(s.result)}</li>
        ))}
      </ol>
      <p className="mono">
        {k}G = {formatPoint(run.point)} · {run.doublings} doublings, {run.additions} additions
      </p>
    </>
  );
}

/** The live cross-check: a fresh browser P-256 key, our d·G against its public point. */
function CrossCheckDemo() {
  const [result, setResult] = useState<P256CrossCheck | null | 'idle'>('idle');
  return (
    <>
      <Provenance kind="real">crypto.subtle P-256 key pair, discarded on reload, never used</Provenance>
      <div className="controls">
        <Button variant="primary" onClick={() => void crossCheckP256().then(setResult)}>Check our arithmetic against the browser</Button>
      </div>
      <p className="mono">
        {result === 'idle' ? 'not run yet' : result === null ? 'needs https or localhost' : `${result.equal ? 'equal' : 'DIFFERS'} · ${result.bits}-bit scalar · ${result.doublings} doublings, ${result.additions} additions · x starts ${result.publicXPrefix}`}
      </p>
    </>
  );
}

export function DevKitTier4d() {
  return (
    <>
      <Section title="core/ecc · double-and-add trace of k·G on the toy F17 curve (toy parameters, labelled)">
        <TraceDemo />
      </Section>
      <Section title="core/ecc + core/crypto (K4-6, K4-7) · live P-256 cross-check against crypto.subtle">
        <CrossCheckDemo />
      </Section>
    </>
  );
}
