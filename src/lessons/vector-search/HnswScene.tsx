import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { hnswCaption } from './captions';
import { MAX_K, bruteForce, clusteredPoints, recallAt, seededQueries, DOMAIN } from './data';
import { searchFrames } from './frames';
import { MAX_M, MIN_M, buildHnsw, searchHnsw } from './hnsw';
import { LayerPlot } from './LayerPlot';
import type { Settings } from './useSettings';

const EF_SWEEP = [1, 2, 4, 8, 16, 32, 64, 128];
const SWEEP_QUERIES = 40;
const EF_MAX = 128;
const EF_C_MIN = 8;
const EF_C_MAX = 128;
const EF_C_STEP = 8;

export function HnswScene({ picker, s, set }: { picker: ReactNode; s: Settings; set: (p: Partial<Settings>) => void }) {
  const [layerPick, setLayerPick] = useState<'auto' | number>('auto');
  const points = useMemo(() => clusteredPoints(s.seed), [s.seed]);
  const h = useMemo(() => buildHnsw(points, s.m, s.efConstruction, s.seed), [points, s.m, s.efConstruction, s.seed]);
  const truth = useMemo(() => bruteForce(points, s.query, s.k).neighbours, [points, s.query, s.k]);
  const r = useMemo(() => searchHnsw(h, s.query, s.k, s.efSearch), [h, s.query, s.k, s.efSearch]);
  const recall = recallAt(truth, r.neighbours);
  const frames = useMemo(() => searchFrames(r, h.top), [r, h.top]);
  const player = usePlayer(frames, { interval: 450, autoplayOnChange: false });
  const f = player.frame;
  const sweep = useMemo(() => {
    const qs = seededQueries(s.seed + 3, SWEEP_QUERIES, 2, DOMAIN);
    const truths = qs.map((q) => bruteForce(points, q, s.k).neighbours);
    return EF_SWEEP.map((ef) => {
      const runs = qs.map((q) => searchHnsw(h, q, s.k, ef));
      return { x: runs.reduce((a, x) => a + x.computations, 0) / qs.length, y: runs.reduce((a, x, i) => a + recallAt(truths[i], x.neighbours), 0) / qs.length };
    });
  }, [h, points, s.seed, s.k]);
  const layer = layerPick === 'auto' ? f.layer : Math.min(layerPick, h.top);
  const layers = Array.from({ length: h.top + 1 }, (_, i) => ({ value: i, label: `${i}` }));
  const visited = new Set(f.visited);

  useIntroCaption(hnswCaption({ r, truth, recall, ef: s.efSearch, k: s.k, n: points.length, top: h.top }), [r, recall]);

  return (
    <StageFrame
      height={520}
      player={player}
      stats={
        <Stats>
          <Stat label="Distance computations" value={r.computations} color="var(--info)" sub={`against ${points.length} for brute force`} />
          <Stat label={`Recall@${s.k}`} value={pctText(recall, 0)} color={recall === 1 ? 'var(--ok)' : 'var(--bad)'} sub={`candidate list ${Math.max(s.efSearch, s.k)} on layer 0`} />
          <Stat label="Layers" value={h.top + 1} sub={`${h.levels.filter((l) => l >= 1).length} nodes above layer 0`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the node the walk stands on, and the hop it just made', shape: 'dot' },
            { color: 'var(--info)', label: 'a node already visited', shape: 'dot' },
            { color: 'var(--violet)', label: 'links on an upper layer', shape: 'line' },
            { color: 'var(--dim)', label: 'links on layer 0', shape: 'line' },
            { color: 'var(--bad)', label: 'a local minimum: the walk ends short of the true neighbours', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Layer shown" value={layerPick} onChange={setLayerPick} options={[{ value: 'auto' as const, label: 'Follow the search' }, ...layers]} />
          <Slider label="efSearch" value={s.efSearch} min={1} max={EF_MAX} onChange={(efSearch) => set({ efSearch })} />
        </>,
        <>
          <Slider label="M (links)" value={s.m} min={MIN_M} max={MAX_M} onChange={(m) => set({ m })} />
          <Slider label="efConstruction" value={s.efConstruction} min={EF_C_MIN} max={EF_C_MAX} step={EF_C_STEP} onChange={(efConstruction) => set({ efConstruction })} />
          <Slider label="k" value={s.k} min={1} max={MAX_K} onChange={(k) => set({ k })} />
        </>,
      ]}
    >
      <div className="vs-stage vs-pair stage-pad">
        <Box>
          <SectionTitle hint={`layer ${layer}: ${h.levels.filter((l) => l >= layer).length} nodes`}>The graph, one layer at a time</SectionTitle>
          <LayerPlot h={h} layer={layer} query={s.query} visited={visited} current={f.current} hop={f.step} ariaLabel={`Layer ${layer} of the graph with the search so far`} />
        </Box>
        <Box>
          <SectionTitle hint={`mean over ${SWEEP_QUERIES} seeded queries, each efSearch run for real`}>Recall against work</SectionTitle>
          <div className="vs-plot">
            <Plot2D x={{ domain: [0, points.length], label: 'distance computations' }} y={{ domain: [0, 1.05], label: `recall@${s.k}` }} width={356} height={240} ariaLabel="Recall against distance computations as efSearch grows">
              <Curve points={sweep.map((p): [number, number] => [p.x, p.y])} tone="info" />
              <Points data={sweep.map((p) => ({ ...p, tone: 'info' as const }))} r={3} />
              <VLine at={r.computations} tone="hi" label="this query" />
            </Plot2D>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy" seed={s.seed}>a simplified HNSW on toy 2-D data: simple neighbour selection, not the paper's heuristic</Provenance>
          <Provenance kind="from-memory">production settings such as M around 16 and efConstruction in the hundreds are from memory (check the HNSW paper by Malkov and Yashunin and your library's documentation)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
