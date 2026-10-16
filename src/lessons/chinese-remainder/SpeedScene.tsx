import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { modPow, toyRsa } from '../../core/numberTheory';
import { crtExponentiation, workOf } from './crt';
import { KEYS, OPENING } from './presets';

const SLIDER_MAX = 5000;

/** Scene 5: the toy CRT speed-up of a modular exponentiation: two half-size powers recombined. Toy numbers only, no key. */
export function SpeedScene({ picker }: { picker: ReactNode }) {
  const [keyId, setKeyId] = useState<string>(OPENING.speed.key);
  const [c, setC] = useState<number>(OPENING.speed.c);

  const key = KEYS.find((k) => k.id === keyId)!;
  const rsa = toyRsa(key.p, key.q, key.e);
  if (!rsa.ok) throw new Error(`fixture ${key.id}: ${rsa.reason}`);
  const cc = BigInt(Math.min(c, Number(rsa.n) - 1));
  const direct = modPow(cc, rsa.d, rsa.n);
  const crt = crtExponentiation(cc, rsa.d, key.p, key.q);
  const work = workOf(key.p, key.q, rsa.d);
  const percent = (work.ratio * 100).toFixed(0);

  return (
    <StageFrame
      height={480}
      intro={
        <>
          The exponent d is split into dp = d mod (p-1) and dq = d mod (q-1), and the work becomes two powers mod the half-size primes {key.p.toString()} and {key.q.toString()}: {crt.mp.toString()} and {crt.mq.toString()}, recombined to {crt.result.toString()}, the same number as the direct {direct.toString()}. In this schoolbook cost model it costs {percent}% of the direct work.
        </>
      }
      introKey={`${keyId}-${cc}`}
      stats={
        <Stats>
          <Stat label="Direct c^d mod pq" value={direct.toString()} color="var(--ok)" sub={`one power mod ${rsa.n.toString()}`} />
          <Stat label="By CRT" value={crt.result.toString()} color={crt.result === direct ? 'var(--ok)' : 'var(--bad)'} sub={crt.result === direct ? 'identical' : 'differs (a bug)'} />
          <Stat label="Work, CRT against direct" value={`${percent}%`} color="var(--ok)" sub={`${work.crt} against ${work.full} model units`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'direct work (the costly side)', shape: 'square' },
            { color: 'var(--ok)', label: 'CRT work', shape: 'square' },
            { color: 'var(--info)', label: 'the half-size moduli p and q', shape: 'square' },
            { color: 'var(--violet)', label: 'the recombination term h', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {KEYS.map((k) => (
            <ChipButton key={k.id} tone="info" on={keyId === k.id} onClick={() => setKeyId(k.id)}>{k.label}</ChipButton>
          ))}
          <Slider label="Number c" value={Number(cc)} min={0} max={Math.min(SLIDER_MAX, Number(rsa.n) - 1)} onChange={setC} />
        </>,
      ]}
    >
      <div className="cr-stage stage-pad">
        <ol className="cr-recipe">
          <li>dp = d mod (p-1) = {rsa.d.toString()} mod {(key.p - 1n).toString()} = <b>{crt.dp.toString()}</b>; dq = d mod (q-1) = <b>{crt.dq.toString()}</b></li>
          <li>m_p = c^dp mod p = <b>{crt.mp.toString()}</b>; m_q = c^dq mod q = <b>{crt.mq.toString()}</b></li>
          <li>h = q^-1 x (m_p - m_q) mod p = {crt.qInv.toString()} x ({crt.mp.toString()} - {crt.mq.toString()}) mod {key.p.toString()} = <b>{crt.h.toString()}</b></li>
          <li>result = m_q + h x q = {crt.mq.toString()} + {crt.h.toString()} x {key.q.toString()} = <b>{crt.result.toString()}</b></li>
        </ol>
        <Bar value={work.full} max={work.full} tone="bad" label="direct" trailing={work.full} />
        <Bar value={work.crt} max={work.full} tone="ok" label="CRT, two half-size powers" trailing={work.crt} />
        <p className="cr-note">
          The cost model is schoolbook: a modular multiplication of b-bit numbers costs about b^2 steps and there are about as many as the exponent has bits. Halving the numbers quarters each multiplication, and each half-size exponent is about half as long, but there are two of them: about a quarter of the work in the ideal case, and this model shows {percent}% for this key (a standard figure for schoolbook multiplication, from memory: verify against a cryptography text). Real implementations also guard against computation faults, which this lesson names and does not show; the numbers here are far too small to protect anything.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes, not cryptography: public textbook primes, no key, nothing secure</Provenance>
        <Provenance kind="from-memory">speed-up factor stated for schoolbook multiplication and from memory: verify</Provenance>
        <Provenance kind="illustrative">work units come from a simple cost model, not a measurement</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
