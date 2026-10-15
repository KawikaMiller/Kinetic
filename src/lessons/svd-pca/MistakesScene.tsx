import { useMemo, useState, type ReactNode } from 'react';
import { Arrow, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { DEFAULT_MISTAKES, applyMistakes, bodyData, type Mistakes, type Units } from './model';
import { mistakesCaption, n3 } from './text';

const COMPASS = [-1.2, 1.2] as const;
const MEAN_ARROW = 1.05;

export function MistakesScene({ picker }: { picker: ReactNode }) {
  const [o, setO] = useState<Mistakes>(DEFAULT_MISTAKES);
  const data = useMemo(() => bodyData(), []);
  const r = applyMistakes(data, o);
  const wrong = !o.centre && !o.standardise;
  const meanRad = (r.meanAngle * Math.PI) / 180;
  const tip1 = r.axes[0];
  const tip2 = r.axes[1];

  return (
    <StageFrame
      height={400}
      intro={mistakesCaption(r, o)}
      introKey={[o]}
      stats={
        <Stats>
          <Stat label="First axis angle" value={`${r.angle1.toFixed(1)}°`} color={wrong ? 'var(--bad)' : 'var(--hi)'} sub="feature 1 across, feature 2 up" />
          <Stat label="Explained variance" value={`${(r.explained * 100).toFixed(1)}%`} color="var(--violet)" sub="first axis" />
          <Stat label="Correlation ρ" value={n3(r.rho)} sub={o.standardise ? `eigenvalues 1 ± |ρ| = ${n3(1 + Math.abs(r.rho))}, ${n3(1 - Math.abs(r.rho))}` : 'of the two features'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the first axis', shape: 'line' },
            { color: 'var(--violet)', label: 'the second axis', shape: 'line' },
            { color: 'var(--bad)', label: 'a wrong first axis (not centred)', shape: 'dot' },
            { color: 'var(--muted)', label: 'the direction of the mean', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Centre the data" inline>
            <ChipButton tone="info" on={o.centre} disabled={o.standardise} onClick={() => setO({ ...o, centre: true })}>Centred</ChipButton>
            <ChipButton tone="bad" on={!o.centre} disabled={o.standardise} onClick={() => setO({ ...o, centre: false })}>Skip centring</ChipButton>
          </ControlGroup>
        </>,
        <>
          <ControlGroup label="Height in" inline>
            {(['m', 'cm'] as Units[]).map((u) => (
              <ChipButton key={u} tone="info" on={o.units === u} disabled={o.standardise} onClick={() => setO({ ...o, units: u })}>
                {u === 'm' ? 'metres' : 'centimetres'}
              </ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Scale" inline>
            <ChipButton tone="ok" on={o.standardise} onClick={() => setO({ ...o, standardise: !o.standardise })}>Standardise</ChipButton>
          </ControlGroup>
          <Hint>Standardising centres and rescales both features, so the centring and units settings are switched off while it is on.</Hint>
        </>,
      ]}
    >
      <div className="sp-stage stage-pad">
        <Plot2D x={{ domain: COMPASS, label: 'feature 1 (height)', ticks: 5 }} y={{ domain: COMPASS, label: 'feature 2 (weight)', ticks: 5 }} aspect="equal" width={356} ariaLabel={`First axis at ${r.angle1.toFixed(0)} degrees in feature space`}>
          {wrong && <Arrow to={[MEAN_ARROW * Math.cos(meanRad), MEAN_ARROW * Math.sin(meanRad)]} tone="muted" dashed />}
          <Arrow to={tip2} tone="violet" label="PC2" />
          <Arrow to={tip1} tone="hi" label="PC1" />
          {wrong && <Points data={[{ x: tip1[0], y: tip1[1], tone: 'hi', ring: 'bad', r: 5 }]} />}
        </Plot2D>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={21}>invented heights and weights from a seeded generator, correlated; the axes are computed live</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
