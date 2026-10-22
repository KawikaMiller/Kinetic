import { useMemo, useState, type ReactNode } from 'react';
import { Arrow, Plot2D, Points, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { BASES, DEFAULT_TARGET, T_MAX, T_MIN, babai, badBasisShare, distanceText, latticePoints, nearestPoint, orthogonalityDefect, type BasisName, type Vec } from './lattice';

const WINDOW = 34;
const PLOT_W = 356;
const BASIS_OPTIONS = [
  { value: 'good' as const, label: 'Good basis (short, at right angles)' },
  { value: 'bad' as const, label: 'Bad basis (long, nearly parallel)' },
];
const clampInt = (v: number) => Math.max(T_MIN, Math.min(T_MAX, Math.round(v)));
const frac = ([n, d]: readonly [number, number]) => (n % d === 0 ? String(n / d) : `${n}/${d}`);
const vecText = (v: Vec) => `(${v[0]}, ${v[1]})`;
const SHARE = badBasisShare();

/** Scene 4: one lattice and two bases: Babai rounding lands next to the target with the good basis and farther away with the bad one. */
export function LatticeScene({ picker }: { picker: ReactNode }) {
  const [basis, setBasis] = useState<BasisName>('good');
  const [t, setT] = useState<Vec>(DEFAULT_TARGET);
  const dots = useMemo(() => latticePoints(WINDOW).map(([x, y]) => ({ x, y })), []);
  const b = BASES[basis];
  const r = babai(b, t);
  const best = nearestPoint(t);
  const tone = basis === 'good' ? 'ok' : 'bad';
  const dist = distanceText(r.distSq);
  const roundedRight = r.point[0] >= t[0];

  return (
    <StageFrame
      height={520}
      intro={`Target ${vecText(t)}: with the ${basis} basis the rounding gives ${vecText(r.point)}, ${dist} away; the closest lattice point is ${vecText(best.point)}, ${distanceText(best.distSq)} away.`}
      introKey={`lattice|${basis}|${t[0]}|${t[1]}`}
      stats={
        <Stats>
          <Stat label="Coefficients" value={`${frac(r.coeffs[0])}, ${frac(r.coeffs[1])}`} sub={`rounded to ${r.rounded[0]}, ${r.rounded[1]}`} />
          <Stat label="Lands at" value={vecText(r.point)} color={`var(--${tone})`} sub={`distance ${dist}`} />
          <Stat label="Closest point" value={vecText(best.point)} sub={`distance ${distanceText(best.distSq)}, by brute force`} />
          <Stat label="Orthogonality defect" value={orthogonalityDefect(b).toFixed(1)} color={`var(--${tone})`} sub="product of the lengths over the determinant (17)" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'good basis and its result', shape: 'line' }, { color: 'var(--bad)', label: 'bad basis and its result', shape: 'line' }, { color: 'var(--hi)', label: 'the target', shape: 'dot' }]} />}
      controls={[
        <>
          {picker}
          <Segmented<BasisName> label="Basis in hand" options={BASIS_OPTIONS} value={basis} onChange={setBasis} />
        </>,
        <>
          <Slider label="target x" value={t[0]} min={T_MIN} max={T_MAX} onChange={(x) => setT([x, t[1]])} />
          <Slider label="target y" value={t[1]} min={T_MIN} max={T_MAX} onChange={(y) => setT([t[0], y])} />
        </>,
      ]}
    >
      <div className="stage-pad pq-stage">
        <Plot2D x={{ domain: [-WINDOW, WINDOW] }} y={{ domain: [-WINDOW, WINDOW] }} width={PLOT_W} aspect="equal" ariaLabel={`A lattice with determinant 17, the ${basis} basis, the target ${vecText(t)} and the rounded point ${vecText(r.point)}`}>
          <Points data={dots.map((d) => ({ ...d, tone: 'muted' as const, hollow: true, r: 2 }))} />
          <Arrow to={[b[0][0], b[0][1]]} tone={tone} label="b1" />
          <Arrow to={[b[1][0], b[1][1]]} tone={tone} label="b2" />
          <Segments segments={[{ from: t, to: r.point }]} tone={tone} dashed />
          <Points data={[{ x: r.point[0], y: r.point[1] }]} tone={tone} labels={() => ({ text: 'rounded', left: !roundedRight })} />
          <Points data={[{ x: t[0], y: t[1] }]} tone="hi" labels={() => ({ text: 't', left: roundedRight })} onDrag={(_i, at) => setT([clampInt(at[0]), clampInt(at[1])])} pointLabel={() => 'target t, drag it'} />
        </Plot2D>
        <p className="pq-note">
          The same lattice, easy or hard to decode depending on the basis you hold. The good basis lands on the nearest point only when the target is close enough; the bad basis lands farther than the nearest point on {SHARE.worse.toLocaleString('en-US')} of the {SHARE.targets.toLocaleString('en-US')} whole-number targets the sliders reach, and on the nearest point for the other {SHARE.equal.toLocaleString('en-US')}, so the target decides how bad it looks. A picture, not a security argument: it shows why a short basis helps a decoder, and says nothing about how hard any real scheme is. Basis vectors: {vecText(b[0])} and {vecText(b[1])}.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a 2-dimensional lattice with determinant 17: a picture of the idea, not a scheme and not a parameter set</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
