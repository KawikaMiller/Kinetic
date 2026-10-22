import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { heldKarp, tourLength, twoOptStep } from '../../core/tsp';
import { ANNEAL, CROSSED_TOUR, DEFAULT_MAP_SEED, MAP_BATCH, MAP_POINTS, PLANE, annealedTwoOpt, compareOnMaps, crossedSquareMap, seededMap, type MapBatch } from './tour';
import { tourCaption } from './text';
import { freshWork, freshWorks, workOf, workStat, type Method, type Work, type Works } from './work';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 480;
const SQUARE_DOMAIN: [number, number] = [-0.5, 2.5];
const PLANE_DOMAIN: [number, number] = [0, PLANE];

type Source = 'square' | 'random';
const closedPath = (points: readonly { x: number; y: number }[], tour: readonly number[]): [number, number][] =>
  [...tour, tour[0]].map((v) => [points[v].x, points[v].y]);

/** Scene 4: 2-opt on a tour, step by step, against annealed 2-opt and the exact optimum. */
export function TwoOptScene({ picker }: { picker: ReactNode }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [source, setSource] = useState<Source>('square');
  const [n, setN] = useState<number>(MAP_POINTS.default);
  const [seed, setSeed] = useState(DEFAULT_MAP_SEED);
  const [annealing, setAnnealing] = useState(false);
  const [batch, setBatch] = useState<MapBatch | null>(null);
  const mapKey = source === 'square' ? 'square' : `random:${n}:${seed}`;
  const map = useMemo(() => (source === 'square' ? crossedSquareMap() : seededMap(seed, n)), [source, n, seed]);
  const best = useMemo(() => heldKarp(map.dist), [map]);
  const method: Method = annealing ? 'annealed' : 'plain';
  const [works, setWorks] = useState<Works>(() => freshWorks(mapKey, map));
  const work = workOf(works, method, mapKey, map);
  const setWork = (next: Work) => setWorks((w) => ({ ...w, [method]: next }));
  const stat = workStat(method, work);
  const length = tourLength(map.dist, work.tour);
  const startLength = tourLength(map.dist, map.start);
  const lastMove = work.moves.length > 0 ? work.moves[work.moves.length - 1] : null;
  const caption = tourCaption({
    start: startLength, length, optimum: best.length, lastMove, moves: work.moves.length,
    localOptimum: twoOptStep(map.dist, work.tour) === null && work.moves.length > 0,
    annealed: work.annealed ? { accepted: work.annealed.accepted, uphill: work.annealed.uphill } : null,
  });
  const domain = source === 'square' ? SQUARE_DOMAIN : PLANE_DOMAIN;
  const atLocalOptimum = twoOptStep(map.dist, work.tour) === null;

  const step = () => {
    const move = twoOptStep(map.dist, work.tour);
    if (move) setWork({ ...work, tour: move.tour, moves: [...work.moves, move], annealed: null });
  };
  const finish = () => {
    let tour = work.tour;
    const moves = [...work.moves];
    for (let move = twoOptStep(map.dist, tour); move; move = twoOptStep(map.dist, tour)) {
      moves.push(move);
      tour = move.tour;
    }
    setWork({ ...work, tour, moves, annealed: null });
  };
  const anneal = () => {
    const a = annealedTwoOpt(map.dist, map.start, seed);
    setWork({ ...freshWork(mapKey, map), tour: a.tour, annealed: a });
  };

  return (
    <StageFrame
      height={460}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label={stat.label} value={stat.value} sub={stat.sub} />
          <Stat label="Tour length" value={length.toFixed(2)} sub={`start ${startLength.toFixed(2)}`} />
          <Stat label="Optimum" value={best.length.toFixed(2)} color="var(--ok)" sub="exact, Held-Karp" />
          <Stat label="Ratio" value={(length / best.length).toFixed(3)} sub={atLocalOptimum ? 'no improving move left' : 'still improvable'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'your tour', shape: 'line' },
            { color: 'var(--ok)', label: 'the optimum tour (dashed)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Map">
            <ChipButton on={source === 'square'} onClick={() => setSource('square')}>Crossed square</ChipButton>
            <ChipButton on={source === 'random'} onClick={() => setSource('random')}>Random map</ChipButton>
          </ControlGroup>
          <Toggle label="Method" value={annealing} off="2-opt" on="annealed 2-opt" onChange={setAnnealing} />
        </>,
        source === 'random' ? (
          <>
            <Slider label="Points" value={n} min={MAP_POINTS.min} max={MAP_POINTS.max} onChange={(v) => { setN(v); setBatch(null); }} />
            <SeedField label="Map seed" seed={seed} onSeed={(v) => { setSeed(v); setBatch(null); }} />
          </>
        ) : null,
        <>
          {annealing ? (
            <Button variant="primary" onClick={anneal}>Run annealed 2-opt ({ANNEAL.steps} reversals tried)</Button>
          ) : (
            <>
              <Button variant="primary" softDisabled={atLocalOptimum} onClick={step}>Step</Button>
              <Button softDisabled={atLocalOptimum} onClick={finish}>Run to a local optimum</Button>
            </>
          )}
          <Button softDisabled={work.moves.length === 0 && !work.annealed} onClick={() => setWork(freshWork(mapKey, map))}>Reset</Button>
          {source === 'random' && <Button onClick={() => setBatch(compareOnMaps(n))}>Run {MAP_BATCH} maps of {n} points</Button>}
        </>,
      ].filter((row) => row !== null)}
    >
      <div className="stage-pad ls-stage">
        <Plot2D
          x={{ domain, ticks: 5 }}
          y={{ domain, ticks: 5 }}
          width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
          aspect="equal"
          ariaLabel={`Map of ${map.points.length} points with a tour of length ${length.toFixed(2)}`}
        >
          <Curve points={closedPath(map.points, best.tour)} tone="ok" dashed />
          <Curve points={closedPath(map.points, work.tour)} tone="info" />
          <Points data={map.points.map((p) => ({ x: p.x, y: p.y, tone: 'hi' as const }))} r={6} labels={(i) => String(i)} />
        </Plot2D>
        {batch && source === 'random' && (
          <Hint tone="muted" block>
            Over {batch.maps} seeded maps of {n} points, from a random starting tour: plain 2-opt averages {batch.meanRatioPlain.toFixed(3)} times the optimum and reaches it on {batch.optimalPlain} maps; annealed 2-opt averages {batch.meanRatioAnnealed.toFixed(3)} and reaches it on {batch.optimalAnnealed}.
          </Hint>
        )}
        {source === 'square' && <Hint block>The crossed square visits the corners {CROSSED_TOUR.join(', ')}: its two diagonals cross, and reversing the middle pair uncrosses them.</Hint>}
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>the map and the starting tour are seeded random</Provenance>
        <Provenance kind="toy">at most 12 points so the optimum can be computed; real instances are far larger</Provenance>
        <Provenance kind="from-memory">2-opt local optima are a few percent above the optimum on typical maps: this page shows its own measured ratios instead of quoting a number</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
