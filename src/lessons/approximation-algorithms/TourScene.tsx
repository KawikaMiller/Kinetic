import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points, Segments } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import type { Tone } from '../../core/tone';
import type { Point } from '../../core/tsp';
import {
  ADVERSARY_SEED, ADVERSARY_STEPS, BOUND_CHRISTOFIDES, BOUND_DOUBLING, M7, PLANE, POINT_LIMITS, adversary, adversaryText, clampToPlane, edgesOf, lengthOf, toursCaption, toursOf,
  type AdversaryResult, type TourKind,
} from './tours';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 480;
const KIND_TONE: Record<TourKind, Tone> = { mst: 'dim', doubling: 'info', christofides: 'violet', optimum: 'ok' };
const KIND_LABEL: Record<TourKind, string> = { mst: 'Spanning tree', doubling: 'MST doubling', christofides: 'Christofides', optimum: 'Optimum' };
const KINDS: readonly TourKind[] = ['mst', 'doubling', 'christofides', 'optimum'];
/** Where "Add point" puts the next point: a fixed list, so the scene stays deterministic. */
const ADD_SPOTS: readonly Point[] = [
  { x: 5, y: 5 }, { x: 2.5, y: 2.5 }, { x: 7.5, y: 7.5 }, { x: 2.5, y: 7.5 }, { x: 7.5, y: 2.5 }, { x: 5, y: 1.5 }, { x: 5, y: 8.5 }, { x: 1.5, y: 5 }, { x: 8.5, y: 5 }, { x: 3.5, y: 5 },
];
const METER_MIN = 1;
const METER_MAX = 2.2;
const meterPercent = (ratio: number) => `${Math.min(100, Math.max(0, ((ratio - METER_MIN) / (METER_MAX - METER_MIN)) * 100))}%`;

const asPlot = (p: Point): [number, number] => [p.x, p.y];

function Meter({ label, ratio, bound, tone }: { label: string; ratio: number; bound: number; tone: Tone }) {
  return (
    <div className="aa-meter" role="img" aria-label={`${label}: ratio ${ratio.toFixed(2)}, proved bound ${bound}`}>
      <span className="aa-meter-label">{label}</span>
      <span className="aa-meter-track">
        <i className={`aa-meter-fill tone-${tone}`} style={{ width: meterPercent(ratio) }} />
        <b className="aa-meter-mark" style={{ left: meterPercent(BOUND_CHRISTOFIDES) }} aria-hidden="true">1.5</b>
        <b className="aa-meter-mark" style={{ left: meterPercent(BOUND_DOUBLING) }} aria-hidden="true">2</b>
      </span>
      <span className="aa-meter-value">{ratio.toFixed(2)}</span>
    </div>
  );
}

/** Scene 2: drag the points of a Euclidean map and watch four tours and the two ratios the theorems bound. */
export function TourScene({ picker }: { picker: ReactNode }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [points, setPoints] = useState<readonly Point[]>(M7);
  const [shown, setShown] = useState<readonly TourKind[]>(['doubling']);
  const [seed, setSeed] = useState(ADVERSARY_SEED);
  const [found, setFound] = useState<AdversaryResult | null>(null);
  const tours = useMemo(() => toursOf(points), [points]);
  const drawn = KINDS.filter((k) => k === 'optimum' || shown.includes(k));
  const caption = found ? `${adversaryText(found, points.length)} ${toursCaption(tours)}` : toursCaption(tours);

  const toggle = (kind: TourKind) =>
    setShown((s) => (phone ? [kind] : s.includes(kind) ? s.filter((k) => k !== kind) : [...s, kind]));
  const change = (next: readonly Point[]) => {
    setPoints(next);
    setFound(null);
  };

  return (
    <StageFrame
      height={460}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Optimum tour" value={tours.optimum.length.toFixed(2)} color="var(--ok)" sub="exact, Held-Karp" />
          <Stat label="Spanning tree" value={tours.mst.weight.toFixed(2)} sub={tours.mst.weight <= tours.optimum.length ? 'at most the optimum' : 'above the optimum'} />
          <Stat label="MST doubling" value={tours.doubling.length.toFixed(2)} sub={`ratio ${tours.ratioDoubling.toFixed(2)}`} />
          <Stat label="Christofides" value={tours.christofides.length.toFixed(2)} sub={`ratio ${tours.ratioChristofides.toFixed(2)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'spanning tree', shape: 'line' },
            { color: 'var(--info)', label: 'MST doubling tour', shape: 'line' },
            { color: 'var(--violet)', label: 'Christofides tour', shape: 'line' },
            { color: 'var(--ok)', label: 'optimum tour (always drawn)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label={phone ? 'Draw one tour' : 'Draw tours'}>
            {KINDS.filter((k) => k !== 'optimum').map((k) => (
              <ChipButton key={k} tone="info" on={shown.includes(k)} onClick={() => toggle(k)}>{KIND_LABEL[k]}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button onClick={() => change(M7)}>Load M7</Button>
          <Button softDisabled={points.length >= POINT_LIMITS.max} onClick={() => change([...points, ADD_SPOTS[points.length % ADD_SPOTS.length]])}>Add point</Button>
          <Button softDisabled={points.length <= POINT_LIMITS.min} onClick={() => change(points.slice(0, -1))}>Remove last point</Button>
          <SeedField label="Adversary seed" seed={seed} onSeed={setSeed} />
          <Button onClick={() => { const r = adversary(points, seed); setPoints(r.points); setFound(r); }}>Run the adversary ({ADVERSARY_STEPS} steps)</Button>
        </>,
      ]}
    >
      <div className="stage-pad aa-stage">
        <Plot2D
          x={{ domain: [0, PLANE], ticks: 5 }}
          y={{ domain: [0, PLANE], ticks: 5 }}
          width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
          aspect="equal"
          ariaLabel={`Map of ${points.length} points with the tours drawn: ${drawn.map((k) => KIND_LABEL[k]).join(', ')}`}
        >
          {drawn.map((k) => (
            <Segments
              key={k}
              dashed={k === 'optimum'}
              segments={edgesOf(tours, k).map(([a, b]) => ({ from: asPlot(points[a]), to: asPlot(points[b]), tone: KIND_TONE[k] }))}
            />
          ))}
          <Points
            data={points.map((p) => ({ x: p.x, y: p.y, tone: 'hi' as Tone }))}
            r={6}
            labels={(i) => String(i)}
            pointLabel={(i) => `Point ${i}`}
            onDrag={(i, [x, y]) => change(points.map((p, k) => (k === i ? clampToPlane({ x, y }) : p)))}
          />
        </Plot2D>
        <div className="aa-meters">
          <Meter label="MST doubling" ratio={tours.ratioDoubling} bound={BOUND_DOUBLING} tone="info" />
          <Meter label="Christofides" ratio={tours.ratioChristofides} bound={BOUND_CHRISTOFIDES} tone="violet" />
          <Hint block>The bars run from ratio 1 to 2.2; the marks are the proved ceilings 1.5 and 2. The spanning tree weighs {lengthOf(tours, "mst").toFixed(2)}, at most the optimum {tours.optimum.length.toFixed(2)}, because a tour with one edge removed is a spanning tree.</Hint>
        </div>
        <div className="aa-proof">
          <ClaimLabel kind="theorem">MST doubling is within 2 of the optimum, and Christofides within 1.5, when distances obey the triangle inequality</ClaimLabel>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">at most 10 points so the optimum can be computed; real instances are far larger</Provenance>
        {found && <Provenance kind="simulated" seed={seed}>the adversary is a seeded hill climb, {ADVERSARY_STEPS} steps</Provenance>}
        <Provenance kind="from-memory">Christofides 1976, and Serdyukov 1978 independently; no general constant-factor approximation exists for non-metric TSP unless P = NP (named only). Verify against the 1976 technical report, Serdyukov 1978 and Vazirani, Approximation Algorithms (2001).</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
