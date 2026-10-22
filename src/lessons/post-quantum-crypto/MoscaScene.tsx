import { Fragment, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { DEFAULT_MOSCA, MOSCA_PRESETS, X_MAX, Y_MAX, Z_MAX, harvestCells, slackText, verdict, type Mosca, type Protects } from './mosca';

const PROTECT_OPTIONS = [
  { value: 'secrecy' as const, label: 'Secrecy of recorded data' },
  { value: 'signature' as const, label: 'A signature scheme' },
];
const BAR_MAX = X_MAX + Y_MAX;

/** Scene 1: Mosca's inequality from three sliders. No date is predicted: z is the learner's own input. */
export function MoscaScene({ picker }: { picker: ReactNode }) {
  const [m, setM] = useState<Mosca>(DEFAULT_MOSCA);
  const [protects, setProtects] = useState<Protects>('secrecy');
  const v = verdict(m);
  const secrecy = protects === 'secrecy';
  const sentence = `x + y = ${m.x} + ${m.y} = ${v.exposure} years against z = ${m.z}: ${v.atRisk ? 'at risk' : 'not at risk'}, ${slackText(v.slack)}.${secrecy ? '' : ' A forged signature is accepted for as long as the old key is trusted, so x counts; it is 0 only for a signature checked at the moment it is made.'}`;

  return (
    <StageFrame
      height={400}
      intro={sentence}
      introKey={`mosca|${m.x}|${m.y}|${m.z}|${protects}`}
      stats={
        <Stats>
          <Stat label="x + y" value={`${v.exposure} years`} color={v.atRisk ? 'var(--bad)' : 'var(--ok)'} sub={secrecy ? 'keep secret, plus migration' : 'stay trusted, plus migration'} />
          <Stat label="z" value={`${m.z} years`} sub="your own input, not a forecast" />
          <Stat label="Verdict" value={v.atRisk ? 'at risk' : 'not at risk'} color={v.atRisk ? 'var(--bad)' : 'var(--ok)'} sub={slackText(v.slack)} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'not at risk', shape: 'square' }, { color: 'var(--bad)', label: 'at risk', shape: 'square' }, { color: 'var(--info)', label: 'the hypothetical machine, z years away', shape: 'line' }]} />}
      controls={[
        <>
          {picker}
          <Segmented<Protects> label="Protecting" options={PROTECT_OPTIONS} value={protects} onChange={setProtects} />
        </>,
        <>
          <Slider label={secrecy ? 'x: years the data must stay secret' : 'x: years a signature stays trusted after it is made'} value={m.x} min={0} max={X_MAX} onChange={(x) => setM({ ...m, x })} />
          <Slider label="y: years to migrate" value={m.y} min={0} max={Y_MAX} onChange={(y) => setM({ ...m, y })} />
          <Slider label="z: years until the machine" value={m.z} min={0} max={Z_MAX} onChange={(z) => setM({ ...m, z })} />
          {!secrecy && <Hint tone="muted">Set x to 0 for a signature that is only checked when it is made; a long-lived signature or a key fielded in devices needs x above 0.</Hint>}
        </>,
        <>
          <ControlGroup label="Try">
            {MOSCA_PRESETS.map((p) => (
              <ChipButton key={p.label} on={protects === p.protects && p.values.x === m.x && p.values.y === m.y && p.values.z === m.z} onClick={() => { setM(p.values); setProtects(p.protects); }}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad pq-stage">
        <div className="pq-timeline">
          <Bar value={v.exposure} max={BAR_MAX} marker={m.z} markLabel={`z = ${m.z}`} tone={v.atRisk ? 'bad' : 'ok'} height={14} ariaLabel={`${v.exposure} years of exposure against ${m.z} years until the machine`} label={`x + y = ${v.exposure}`} trailing={`z = ${m.z} (marker)`} />
          <p className="pq-note">The bar runs from now to {BAR_MAX} years; the tick is z. A bar past the tick is at risk, and a bar that ends exactly on it is not (the comparison is strict).</p>
        </div>
        <div className="pq-harvest" aria-label={secrecy ? 'Harvest now, decrypt later' : 'When a forgery would be accepted'}>
          {harvestCells(m, protects).map((c, i) => (
            <Fragment key={c.role}>
              {i > 0 && <div className="pq-harvest-arrow" aria-hidden="true">...</div>}
              <div className={`pq-harvest-cell ${c.role === 'machine' ? 'is-info' : c.atRisk ? 'is-bad' : ''}`}><b>{c.role === 'today' ? 'Today' : `In ${c.year} years`}</b><span>{c.text}</span></div>
            </Fragment>
          ))}
        </div>
        <p className="pq-note">Nobody can set z from this page: it is yours to try, and the page predicts no date.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="illustrative">x, y and z are your own sliders; the page forecasts nothing</Provenance>
        <Provenance kind="from-memory">expert surveys of when such a machine might exist are published; none is cited here (verify against a current survey)</Provenance>
        <Provenance kind="from-memory">a quantum computer gives symmetric ciphers and hashes only a generic, smaller speedup (Grover's algorithm), not the structural break Shor's gives public-key schemes: verify against Grover's 1996 paper and NIST's post-quantum guidance</Provenance>
        <ClaimLabel kind="practice">signatures usually have a shorter x than secrets, so they migrate on a different clock, while long-lived signatures and trust anchors need x as well (common practice, from memory, verify against NIST guidance)</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
