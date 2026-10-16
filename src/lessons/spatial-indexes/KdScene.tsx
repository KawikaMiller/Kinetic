import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points, Polygon, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { DOMAIN, makePoints, type Rect } from './data';
import { kdFrames } from './frames';
import { buildKd, regionOf, splitSegments, subtreeIds, type KdTree } from './kdtree';
import { KD_DRAWN_LIMIT, KD_SIZES, openingState } from './opening';
import { QueryLayer } from './QueryLayer';
import { useQuery } from './query';

const OPEN = openingState().kd;
const BOUNDS: Rect = { x0: 0, y0: 0, x1: DOMAIN, y1: DOMAIN };
const AXIS = { domain: [0, DOMAIN] as [number, number], label: '' };
const STEP_MS = 900;
const TREE_COLUMN_PX = 34;
const TREE_PAD = 60;

const rectPolygon = (r: Rect): [number, number][] => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
const leafCount = (tree: KdTree) => tree.nodes.filter((n) => n.left === null && n.right === null).length;

/** Scene 2: build a k-d tree by median splits and watch a nearest-neighbour or range search skip whole subtrees. */
export function KdScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState<number>(OPEN.n);
  const [k, setK] = useState(OPEN.k);
  const [levels, setLevels] = useState<number | null>(null);
  const query = useQuery(OPEN.mode);
  const points = useMemo(() => makePoints(OPEN.seed, n), [n]);
  const tree = useMemo(() => buildKd(points), [points]);
  const depth = Math.max(0, ...tree.nodes.map((x) => x.depth)) + 1;
  const shown = Math.min(levels ?? depth, depth);
  const run = useMemo(
    () => kdFrames(tree, query.mode === 'nn' ? { kind: 'nn', q: query.q, k } : { kind: 'range', rect: query.rect }),
    [tree, query.mode, query.q, query.rect, k],
  );
  const player = usePlayer(run.frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const segments = useMemo(() => splitSegments(tree, BOUNDS, shown - 1).map((s) => ({ from: s.from, to: s.to })), [tree, shown]);
  const prunedIds = new Set(f.pruned.flatMap((id) => subtreeIds(tree, id)));
  const foundIds = new Set(f.found);
  const visitedIds = new Set(f.visited);
  const drawTree = n <= KD_DRAWN_LIMIT;
  const treeWidth = Math.max(300, leafCount(tree) * TREE_COLUMN_PX + TREE_PAD);

  const shape: TreeShape<number> = {
    root: tree.root,
    children: (id) => [tree.nodes[id].left, tree.nodes[id].right].filter((c): c is number => c !== null),
  };

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Nodes visited" value={f.visited.length} color="var(--info)" sub={`of ${n} points; a scan checks ${n}`} />
          <Stat label="Subtrees skipped" value={f.pruned.length} sub={f.pruned.length ? `${prunedIds.size} points never looked at` : 'none yet'} />
          <Stat label={query.mode === 'nn' ? 'Results so far' : 'Hits so far'} value={f.found.length} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'query / node being looked at', shape: 'dot' },
            { color: 'var(--info)', label: 'distance-checked', shape: 'dot' },
            { color: 'var(--ok)', label: 'in the result', shape: 'dot' },
            { color: 'var(--dim)', label: 'untouched / skipped region', shape: 'dot' },
            { color: 'var(--violet)', label: 'splitting line', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Points" value={n} onChange={(v) => { setN(v); setLevels(null); }} options={KD_SIZES.map((s) => ({ value: s, label: String(s) }))} />
          <Segmented label="Query" value={query.mode} onChange={query.setMode} options={[{ value: 'nn', label: 'Nearest' }, { value: 'range', label: 'Rectangle' }]} />
          {query.mode === 'nn' && <Slider label="k" value={k} min={1} max={5} onChange={setK} />}
          <Slider label="Levels drawn" value={shown} min={1} max={depth} onChange={setLevels} />
        </>,
        <>
          <Button onClick={() => player.seek(run.frames.length - 1)}>Show the whole search</Button>
          <Hint>
            <span role="status">
              Drag the query (or move it with the arrow keys): the search restarts, press play or step. The tree is drawn up to {KD_DRAWN_LIMIT} points.
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="si-stage stage-pad">
        <div className="si-pair">
          <div className="si-col">
            <Plot2D x={AXIS} y={AXIS} aspect="equal" ariaLabel={`k-d tree over ${n} points: splitting lines, query and search`}>
              {[...prunedIds].length > 0 && f.pruned.map((id) => <Polygon key={id} points={rectPolygon(regionOf(tree, id, BOUNDS))} tone="dim" />)}
              <Segments segments={segments} tone="violet" />
              <Points
                data={tree.nodes.map((node) => ({
                  x: node.point[0],
                  y: node.point[1],
                  tone: f.current === node.id ? 'hi' : foundIds.has(node.id) ? 'ok' : visitedIds.has(node.id) ? 'info' : 'dim',
                }))}
                r={n > 100 ? 2.4 : 3.6}
              />
              <QueryLayer query={query} />
            </Plot2D>
          </div>
          <div className="si-col">
            {drawTree ? (
              <WideRegion minWidth={treeWidth} label="k-d tree: scroll sideways to see all of it">
                <TreeSvg
                  shape={shape}
                  layout="tidy"
                  width={treeWidth}
                  height={Math.max(160, depth * 62 + 40)}
                  radius={14}
                  pad={24}
                  levelGap={58}
                  natural
                  ariaLabel={`The k-d tree: each node splits on x or y`}
                  label={(id) => (tree.nodes[id].axis === 0 ? 'x' : 'y')}
                  nodeMark={(id) =>
                    f.current === id ? { tone: 'hi', fill: 'solid' } : foundIds.has(id) ? { tone: 'ok', fill: 'tint' } : visitedIds.has(id) ? { tone: 'info', fill: 'tint' } : prunedIds.has(id) ? { tone: 'dim', fill: 'tint' } : null
                  }
                />
              </WideRegion>
            ) : (
              <p className="si-note">With {n} points the tree is too big to draw; the plane and the counts are the real thing. Pick 15 or 31 points to see the tree.</p>
            )}
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={OPEN.seed}>made-up 2-D points</Provenance>
        <Provenance kind="real">visited counts come from the search you watch, checked against a linear scan in the tests</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
