import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { DEFAULT_MOSCA, MOSCA_PRESETS, X_MAX, Y_MAX, Z_MAX, slackText, verdict, type Mosca, type Protects } from './mosca';

const PROTECT_OPTIONS = [
  { value: 'secrecy' as const, label: 'Secrecy of recorded data' },
  { value: 'signature' as const, label: 'A signature scheme' },
];
const BAR_MAX = X_MAX + Y_MAX;

/** Scene 1: Mosca's inequality from three sliders. No date is predicted: z is the learner's own input. */
export function MoscaScene({ picker }: { picker: ReactNode }) {
  const [m, setM] = useState<Mosca>(DEFAULT_MOSCA);
  const [protects, setProtects] = useState<Protects>('secrecy');
  const v = verdict(m, protects);
  const sentence =
    protects === 'secrecy'
      ? `x + y = ${m.x} + ${m.y} = ${v.exposure} years against z = ${m.z}: ${v.atRisk ? 'at risk' : 'not at risk'}, ${slackText(v.slack)}.`
      : `A forgery needs the machine at signing time, so only the migration counts: y = ${m.y} against z = ${m.z}: ${v.atRisk ? 'at risk' : 'not at risk'}, ${slackText(v.slack)}.`;

  return (
    <StageFrame
      height={400}
      intro={sentence}
      introKey={`mosca|${m.x}|${m.y}|${m.z}|${protects}`}
      stats={
        <Stats>
          <Stat label={protects === 'secrecy' ? 'x + y' : 'y'} value={`${v.exposure} years`} color={v.atRisk ? 'var(--bad)' : 'var(--ok)'} sub={protects === 'secrecy' ? 'keep secret, plus migration' : 'migration only'} />
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
          <Slider label="x: years the data must stay secret" value={m.x} min={0} max={X_MAX} onChange={(x) => setM({ ...m, x })} />
          <Slider label="y: years to migrate" value={m.y} min={0} max={Y_MAX} onChange={(y) => setM({ ...m, y })} />
          <Slider label="z: years until the machine" value={m.z} min={0} max={Z_MAX} onChange={(z) => setM({ ...m, z })} />
          {protects === 'signature' && <Hint tone="muted">x is not used for a signature scheme.</Hint>}
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
          <Bar value={v.exposure} max={BAR_MAX} marker={m.z} markLabel={`z = ${m.z}`} tone={v.atRisk ? 'bad' : 'ok'} height={14} ariaLabel={`${v.exposure} years of exposure against ${m.z} years until the machine`} label={`${protects === 'secrecy' ? 'x + y' : 'y'} = ${v.exposure}`} trailing={`z = ${m.z} (marker)`} />
          <p className="pq-note">The bar runs from now to {BAR_MAX} years; the tick is z. A bar past the tick is at risk, and a bar that ends exactly on it is not (the comparison is strict).</p>
        </div>
        <div className="pq-harvest" aria-label="Harvest now, decrypt later">
          <div className="pq-harvest-cell"><b>Today</b><span>traffic is recorded: it is ciphertext, unreadable for now</span></div>
          <div className="pq-harvest-arrow" aria-hidden="true">...</div>
          <div className="pq-harvest-cell is-info"><b>In {m.z} years</b><span>the hypothetical machine exists and the recording can be read</span></div>
          <div className="pq-harvest-arrow" aria-hidden="true">...</div>
          <div className={`pq-harvest-cell ${protects === 'secrecy' && v.atRisk ? 'is-bad' : ''}`}><b>In {protects === 'secrecy' ? m.x + m.y : m.y} years</b><span>{protects === 'secrecy' ? 'the data must still be secret, counting the time to migrate' : 'the old signature scheme has to be gone'}</span></div>
        </div>
        <p className="pq-note">Nobody can set z from this page: it is yours to try, and the page predicts no date.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="illustrative">x, y and z are your own sliders; the page forecasts nothing</Provenance>
        <Provenance kind="from-memory">expert surveys of when such a machine might exist are published; none is cited here (verify against a current survey)</Provenance>
        <ClaimLabel kind="practice">signatures migrate on a different clock because harvesting does not apply the same way (from memory, verify against NIST guidance)</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
