import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { decimal, integer } from '../../core/format';
import { planesCaption } from './captions';
import { EDGE_ON_DEGREES, RANDU, lcgSequence, planeIndex, project, randuIdentity, randuPlaneIndices, triples } from './lcg';
import { OPENING } from './opening';

const PLOT = { width: 356, height: 300 } as const;
const POINT_RADIUS = 1.6;
const ANGLE = { min: 0, max: 180 } as const;

/** Scene 2: RANDU triples, projected by a rotation; at the right angle the planes are seen edge on. */
export function PlanesScene({ picker }: { picker: ReactNode }) {
  const [count, setCount] = useState(OPENING.planes.count);
  const [degrees, setDegrees] = useState(OPENING.planes.degrees);
  const seed = OPENING.planes.seed;
  const ts = useMemo(() => triples(RANDU, seed, count), [seed, count]);
  const dots = useMemo(() => ts.map((t) => project(t, degrees)), [ts, degrees]);
  const states = useMemo(() => lcgSequence(RANDU, seed, count + 2), [seed, count]);
  const distinct = useMemo(() => new Set(Array.from({ length: count }, (_, i) => planeIndex(states[i], states[i + 1], states[i + 2]))).size, [states, count]);
  const allPlanes = useMemo(() => randuPlaneIndices(), []);
  const edgeOn = Math.abs(degrees - EDGE_ON_DEGREES) <= 0.5;
  const check = randuIdentity(states[0], states[1]);

  return (
    <StageFrame
      height={720}
      intro={planesCaption(seed, count, degrees, distinct)}
      introKey={`${count}|${degrees}`}
      stats={
        <Stats>
          <Stat label="x(n+2) from the identity" value={integer(check)} color={check === states[2] ? 'var(--ok)' : 'var(--bad)'} sub={`6 x(n+1) - 9 x(n) mod 2^31, against the real ${integer(states[2])}`} />
          <Stat label="Planes used" value={`${distinct} of ${allPlanes.length}`} sub={`${integer(100_000)} seeded triples use all ${allPlanes.length}`} />
          <Stat label="Angle" value={`${degrees}°`} color={edgeOn ? 'var(--bad)' : undefined} sub={`edge on at ${decimal(EDGE_ON_DEGREES, 1)}°`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'RANDU triples: structure shows', shape: 'dot' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Rotation" value={degrees} min={ANGLE.min} max={ANGLE.max} onChange={setDegrees} format={(d) => `${d}°`} />
          <ChipButton tone="info" onClick={() => setDegrees(Math.round(EDGE_ON_DEGREES))}>Go to the edge-on angle</ChipButton>
          <Slider label="Triples" value={count} min={100} max={5000} step={100} onChange={setCount} format={integer} />
        </>,
      ]}
    >
      <div className="rn-stage stage-pad">
        <p className="rn-note">Each point is three consecutive RANDU outputs (x(n), x(n+1), x(n+2)) scaled to the unit cube, then turned about the vertical axis by the angle and drawn flat. Every triple satisfies 9 u - 6 v + w = a whole number, so the cube's points lie on a few planes.</p>
        <figure className="rn-figure">
          <figcaption>RANDU triples, turned {degrees} degrees</figcaption>
          <Plot2D x={{ domain: [-1, 1.5], ticks: 5, label: 'across' }} y={{ domain: [0, 1], ticks: 4, label: 'x(n+2)' }} width={PLOT.width} height={PLOT.height} ariaLabel={`RANDU triples viewed at ${degrees} degrees`}>
            <Points data={dots} r={POINT_RADIUS} tone="bad" />
          </Plot2D>
        </figure>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">RANDU built from its textbook formula for this page; the identity and the planes are computed exactly</Provenance>
        <Provenance kind="from-memory">RANDU's history as a widely used poor generator, and the 15 planes; check Marsaglia's 1968 note</Provenance>
        <ClaimLabel kind="research">Marsaglia, 1968, quoted from memory</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
