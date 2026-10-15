import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { cosine, normalize } from '../../core/vec';
import { exactCaption } from './captions';
import { DOMAIN, MAX_K, bruteForce, clusteredPoints, dist, dragQuery, type Point } from './data';
import type { Settings } from './useSettings';

type Metric = 'euclid' | 'cosine';
const METRICS = [{ value: 'euclid' as const, label: 'Euclidean' }, { value: 'cosine' as const, label: 'Cosine' }];
const UNIT_DOMAIN = 1.05;

/** The k nearest by the chosen measure, nearest first. Cosine ranks by similarity, highest first. */
function rank(points: readonly Point[], q: Point, k: number, metric: Metric): number[] {
  if (metric === 'euclid') return bruteForce(points, q, k).neighbours.map((x) => x.id);
  return points.map((p, id) => ({ id, c: cosine(p, q) })).sort((a, b) => b.c - a.c || a.id - b.id).slice(0, k).map((x) => x.id);
}

export function ExactScene({ picker, s, set }: { picker: ReactNode; s: Settings; set: (p: Partial<Settings>) => void }) {
  const [metric, setMetric] = useState<Metric>('euclid');
  const [unit, setUnit] = useState(false);
  const raw = useMemo(() => clusteredPoints(s.seed), [s.seed]);
  const points = useMemo(() => (unit ? raw.map((p) => normalize(p) ?? p) : raw), [raw, unit]);
  const q = unit ? (normalize(s.query) ?? s.query) : s.query;
  const top = useMemo(() => rank(points, q, s.k, metric), [points, q, s.k, metric]);
  const euclid = useMemo(() => rank(points, q, s.k, 'euclid'), [points, q, s.k]);
  const cos = useMemo(() => rank(points, q, s.k, 'cosine'), [points, q, s.k]);
  const agree = [...euclid].sort((a, b) => a - b).join() === [...cos].sort((a, b) => a - b).join();
  const domain = unit ? UNIT_DOMAIN : DOMAIN;
  const nearestD = dist(points[top[0]], q);

  useIntroCaption(exactCaption({ n: points.length, k: s.k, unit, metric, agree }), [points, q, s.k, unit, metric, agree]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Distance computations" value={points.length} color="var(--info)" sub="one for every point, whatever k is" />
          <Stat label="Euclidean and cosine" value={agree ? '✓ agree' : '✗ differ'} color={agree ? 'var(--ok)' : 'var(--bad)'} sub={`on the nearest ${s.k}`} />
          <Stat label="Nearest" value={decimalOf(nearestD)} sub={metric === 'euclid' ? 'distance to the closest point' : 'Euclidean distance to the closest by cosine'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the query: drag it, or focus it and use the arrow keys', shape: 'dot' },
            { color: 'var(--ok)', label: 'the nearest k by the chosen measure', shape: 'dot' },
            { color: 'var(--dim)', label: 'every other point', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="k" value={s.k} min={1} max={MAX_K} onChange={(k) => set({ k })} />
          <Segmented label="Measure" value={metric} onChange={setMetric} options={METRICS} />
          <Toggle label="Vectors" value={unit} onChange={setUnit} off="As drawn" on="Scaled to unit length" />
        </>,
      ]}
    >
      <div className="vs-stage stage-pad">
        <Box>
          <SectionTitle hint="400 seeded points in 5 clusters">Exact search costs N</SectionTitle>
          <div className="vs-plot">
            <Plot2D x={{ domain: [0, domain] }} y={{ domain: [0, domain] }} aspect="equal" width={356} ariaLabel={`${points.length} points and a query; the ${s.k} nearest are highlighted`}>
              <Points data={points.map((p, i) => ({ x: p[0], y: p[1], tone: top.includes(i) ? 'ok' as const : 'dim' as const, r: top.includes(i) ? 5 : 3 }))} />
              <Points data={[{ x: q[0], y: q[1], tone: 'hi' as const, r: 7 }]} onDrag={(_i, to) => set({ query: dragQuery(s.query, to, unit) })} pointLabel={() => 'Query'} />
            </Plot2D>
          </div>
          <Hint tone="muted" block>{unit ? 'Every point is pushed onto the unit circle (the arc in the corner), where distance and angle say the same thing.' : 'With lengths kept, a point far away in the same direction is close by cosine and far by Euclidean distance.'}</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy" seed={s.seed}>400 seeded 2-D points; real embeddings have hundreds or thousands of dimensions</Provenance>
          <Provenance kind="real">the distances and the sort are computed live</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

const decimalOf = (v: number) => v.toFixed(2);
