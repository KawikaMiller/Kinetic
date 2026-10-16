import { useMemo, useState, type ReactNode } from 'react';
import { PlotCursor, Plot2D, PointerLayer, Points, Polygon, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { plural } from '../../core/format';
import { DOMAIN, type Pt, type Rect } from './data';
import { MAX_DEPTH, buildQuad, leaves, quadKnn, quadRange, treeDepth } from './quadtree';
import { QUAD_K, openingState, quadPreset, type Opening } from './opening';
import { QueryLayer } from './QueryLayer';
import { useQuery } from './query';

const OPEN = openingState().quad;
const AXIS = { domain: [0, DOMAIN] as [number, number], label: '' };
const MAX_POINTS = 400;
const PRESETS: { id: Opening['quad']['preset']; label: string }[] = [
  { id: 'uniform', label: 'Spread out' },
  { id: 'clustered', label: 'Clustered' },
  { id: 'coincident', label: 'Coincident points' },
];

const rectPolygon = (r: Rect): [number, number][] => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
const edges = (r: Rect) => [
  { from: [r.x0, r.y0] as [number, number], to: [r.x1, r.y0] as [number, number] },
  { from: [r.x1, r.y0] as [number, number], to: [r.x1, r.y1] as [number, number] },
  { from: [r.x1, r.y1] as [number, number], to: [r.x0, r.y1] as [number, number] },
  { from: [r.x0, r.y1] as [number, number], to: [r.x0, r.y0] as [number, number] },
];

/** Scene 3: a point-region quadtree that splits a cell once it holds more than c points. */
export function QuadScene({ picker }: { picker: ReactNode }) {
  const [capacity, setCapacity] = useState(OPEN.capacity);
  const [preset, setPreset] = useState<Opening['quad']['preset'] | null>(OPEN.preset);
  const [points, setPoints] = useState<Pt[]>(() => quadPreset(OPEN.preset, OPEN.seed));
  const [cursor, setCursor] = useState<readonly [number, number]>([DOMAIN / 2, DOMAIN / 2]);
  const [note, setNote] = useState<string | null>(null);
  const query = useQuery(OPEN.mode);
  const tree = useMemo(() => buildQuad(points, capacity), [points, capacity]);
  const before = useMemo(() => (points.length > 0 ? buildQuad(points.slice(0, -1), capacity).nodes.length : tree.nodes.length), [points, capacity, tree]);
  const cells = leaves(tree);
  const nn = useMemo(() => quadKnn(tree, query.q, QUAD_K), [tree, query.q]);
  const range = useMemo(() => quadRange(tree, query.rect), [tree, query.rect]);
  const run = query.mode === 'nn' ? nn : range;
  const checked = new Set<Pt>(run.visited.flatMap((id) => tree.nodes[id].points));
  const depth = treeDepth(tree);
  const hitSet = new Set(query.mode === 'range' ? range.hits.map((p) => p.join(',')) : []);

  const add = (p: Pt) => {
    if (points.length >= MAX_POINTS) {
      setNote(`The drawing keeps up to ${MAX_POINTS} points; press Clear or pick a preset.`);
      return;
    }
    setNote(null);
    setPreset(null);
    setPoints([...points, [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]]);
  };
  const load = (id: Opening['quad']['preset']) => {
    setPreset(id);
    setNote(null);
    setPoints(quadPreset(id, OPEN.seed));
  };
  const grew = tree.nodes.length - before;
  const intro = (
    <>
      {plural(points.length, 'point')} in {plural(cells.length, 'cell')}, {depth} {depth === 1 ? 'level' : 'levels'} deep (the cap is {MAX_DEPTH}). A cell splits into four once it holds more than {capacity}.
      {points.length > 0 && grew > 0 && !preset ? ` The last point you added split a cell and made ${plural(grew, 'new cell')}.` : ''}
    </>
  );

  return (
    <StageFrame
      height={420}
      intro={intro}
      introKey={[points, capacity, preset]}
      stats={
        <Stats>
          <Stat label="Cells" value={tree.nodes.length} sub={`${cells.length} leaves`} />
          <Stat label="Depth" value={depth} color="var(--violet)" sub={`cap ${MAX_DEPTH}`} />
          <Stat label={query.mode === 'nn' ? `Nearest ${QUAD_K}: cells visited` : 'Range: cells visited'} value={points.length ? run.visited.length : '–'} color="var(--info)" sub={points.length ? `${run.checks} of ${points.length} points distance-checked` : 'no points'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'query', shape: 'dot' },
            { color: 'var(--info)', label: 'cells the search visited', shape: 'square' },
            { color: 'var(--ok)', label: 'range hits', shape: 'dot' },
            { color: 'var(--dim)', label: 'cells skipped / points never checked', shape: 'square' },
            { color: 'var(--violet)', label: 'cell edges', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Bucket capacity c" value={capacity} min={1} max={8} onChange={setCapacity} />
          <Segmented label="Query" value={query.mode} onChange={query.setMode} options={[{ value: 'nn', label: `Nearest ${QUAD_K}` }, { value: 'range', label: 'Rectangle' }]} />
        </>,
        <>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={preset === p.id} onClick={() => load(p.id)}>{p.label}</ChipButton>
          ))}
          <Button onClick={() => add(cursor)}>Add a point at the cursor</Button>
          <Button onClick={() => { setPoints([]); setPreset(null); setNote(null); }}>Clear</Button>
          <Hint>
            <span role="status">{note ?? 'Click the plane to add a point, or move the grey cursor and press the button. Coincident points stop splitting at the depth cap.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="si-stage stage-pad">
        <Plot2D x={AXIS} y={AXIS} aspect="equal" ariaLabel={`Quadtree over ${points.length} points in ${cells.length} cells`}>
          <PointerLayer onDown={add} />
          {run.pruned.map((id) => <Polygon key={`p${id}`} points={rectPolygon(tree.nodes[id].rect)} tone="dim" />)}
          {run.visited.filter((id) => tree.nodes[id].children === null).map((id) => <Polygon key={`v${id}`} points={rectPolygon(tree.nodes[id].rect)} tone="info" />)}
          <Segments segments={cells.flatMap((c) => edges(c.rect))} tone="violet" />
          <Points data={points.map((p) => ({ x: p[0], y: p[1], tone: hitSet.has(p.join(',')) ? 'ok' : checked.has(p) ? 'info' : 'dim' }))} r={3} />
          <PlotCursor at={cursor} onMove={(p) => setCursor(p)} label="Add-point cursor" />
          <QueryLayer query={query} />
        </Plot2D>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={OPEN.seed}>made-up points; the depth cap is a named constant</Provenance>
        <Provenance kind="real">cells, depth and visit counts are computed from the tree as drawn</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
