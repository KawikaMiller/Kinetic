import { useMemo, useState, type ReactNode } from 'react';
import { PlotCursor, Plot2D, PointerLayer, Points, Polygon } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { plural } from '../../core/format';
import { DOMAIN, makePoints, parseCount } from './data';
import { openingState } from './opening';
import { xIndexCost } from './problem';
import { QueryLayer } from './QueryLayer';
import { useQuery } from './query';

const OPEN = openingState().problem;
const AXIS = { domain: [0, DOMAIN] as [number, number], label: '' };

/** Scene 1: the plain scan and what a one-dimensional index on x can and cannot do. */
export function ProblemScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(OPEN.seed);
  const [nText, setNText] = useState(String(OPEN.n));
  const [n, setN] = useState(OPEN.n);
  const [note, setNote] = useState<string | null>(null);
  const query = useQuery(OPEN.mode);
  const [cursor, setCursor] = useState<readonly [number, number]>([DOMAIN / 2, DOMAIN / 2]);
  const points = useMemo(() => makePoints(seed, n), [seed, n]);
  const cost = useMemo(() => xIndexCost(points, query.mode, query.q, query.rect), [points, query.mode, query.q, query.rect]);
  const candidate = new Set(cost.candidates);
  const hit = new Set(cost.hits);
  const slab = cost.strip;
  const empty = points.length === 0;

  const commitCount = (text: string) => {
    setNText(text);
    const parsed = parseCount(text);
    if (parsed.ok) {
      setNote(null);
      setN(parsed.value);
    } else {
      setNote(parsed.error);
    }
  };

  const intro = empty ? (
    <>There are no points, so there is nothing to find. Add some with the count field.</>
  ) : (
    <>
      A scan checks all {points.length} points. An index sorted on x alone can only narrow the search to a vertical strip: here {plural(cost.candidates.length, 'point')} lie in the strip and {cost.hits.length === 1 && query.mode === 'nn' ? 'one is' : `${cost.hits.length} are`} the answer, so {cost.wasted} {cost.wasted === 1 ? 'check is' : 'checks are'} wasted.
    </>
  );

  return (
    <StageFrame
      height={420}
      intro={intro}
      introKey={[points, query.mode, query.q, query.rect]}
      stats={
        <Stats>
          <Stat label="Brute-force checks" value={empty ? '–' : points.length} sub="every point, every query" />
          <Stat label="x-index candidates" value={empty ? '–' : cost.candidates.length} color="var(--info)" sub="points in the strip it can reach" />
          <Stat label="Wasted candidates" value={empty ? '–' : cost.wasted} color="var(--bad)" sub={empty ? 'no points' : `${Math.round((100 * cost.wasted) / Math.max(1, cost.candidates.length))}% of the candidates`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'query', shape: 'dot' },
            { color: 'var(--ok)', label: 'the answer', shape: 'dot' },
            { color: 'var(--bad)', label: 'wasted candidate in the strip', shape: 'dot' },
            { color: 'var(--dim)', label: 'never touched by the x-index', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Query" value={query.mode} onChange={query.setMode} options={[{ value: 'nn', label: 'Nearest point' }, { value: 'range', label: 'Rectangle' }]} />
          <TextField label="Points N" value={nText} onChange={commitCount} onBlur={() => { if (!parseCount(nText).ok) { setNText(String(n)); setNote(null); } }} width={80} spellCheck={false} />
          <SeedField key={seed} seed={seed} onSeed={setSeed} />
        </>,
        <>
          <Button onClick={() => query.setQ(cursor)}>Move the query point to the cursor</Button>
          <Hint>
            <span role="status">{note ?? `Drag the query (arrow keys move the focused one), or drag the grey cursor and press the button. A rectangle dragged inside-out is put in order. Up to 500 points.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="si-stage stage-pad">
        <Plot2D x={AXIS} y={AXIS} aspect="equal" ariaLabel={`Map of ${points.length} points with a ${query.mode === 'nn' ? 'query point' : 'query rectangle'}`}>
          <PointerLayer />
          {slab && <Polygon points={[[Math.max(0, slab.x0), 0], [Math.min(DOMAIN, slab.x1), 0], [Math.min(DOMAIN, slab.x1), DOMAIN], [Math.max(0, slab.x0), DOMAIN]]} tone="info" dashed />}
          <Points
            data={points.map((p, i) => ({ x: p[0], y: p[1], tone: hit.has(i) ? 'ok' : candidate.has(i) ? 'bad' : 'dim' }))}
            r={2.6}
          />
          <PlotCursor at={cursor} onMove={(p) => setCursor(p)} label="Cursor for moving the query point" />
          <QueryLayer query={query} />
        </Plot2D>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={seed}>made-up 2-D points: clusters plus scatter</Provenance>
        <Provenance kind="real">every count is computed from the points as drawn</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
