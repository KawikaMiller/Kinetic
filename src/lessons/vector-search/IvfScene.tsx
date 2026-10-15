import { useMemo, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Heat, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../../core/format';
import { plainTone } from '../../core/tone';
import { ivfCaption } from './captions';
import { DOMAIN, MAX_K, bruteForce, clusteredPoints, dist, missed, recallAt } from './data';
import { MAX_NLIST, MIN_NLIST, buildIvf, searchIvf } from './ivf';
import type { Settings } from './useSettings';

export function IvfScene({ picker, s, set }: { picker: ReactNode; s: Settings; set: (p: Partial<Settings>) => void }) {
  const points = useMemo(() => clusteredPoints(s.seed), [s.seed]);
  const ivf = useMemo(() => buildIvf(points, s.nlist, s.seed), [points, s.nlist, s.seed]);
  const nprobe = Math.min(s.nprobe, s.nlist);
  const truth = useMemo(() => bruteForce(points, s.query, s.k).neighbours, [points, s.query, s.k]);
  const r = useMemo(() => searchIvf(ivf, s.query, s.k, nprobe), [ivf, s.query, s.k, nprobe]);
  const recall = recallAt(truth, r.neighbours);
  const lost = missed(truth, r.neighbours);
  const sweep = useMemo(
    () => Array.from({ length: s.nlist }, (_, i) => {
      const x = searchIvf(ivf, s.query, s.k, i + 1);
      return { x: x.computations, y: recallAt(truth, x.neighbours) };
    }),
    [ivf, s.query, s.k, s.nlist, truth],
  );
  const scanned = new Set(r.scanned);
  const trueIds = new Set(truth.map((t) => t.id));
  const gotIds = new Set(r.neighbours.map((n) => n.id));
  const heat = useMemo(() => (x: number, y: number) => {
    let best = 0;
    ivf.centroids.forEach((c, i) => { if (dist(c, [x, y]) < dist(ivf.centroids[best], [x, y])) best = i; });
    return { tone: plainTone(best), intensity: r.cells.includes(best) ? 0.2 : 0.07 };
  }, [ivf, r.cells]);

  useIntroCaption(ivfCaption({ nlist: s.nlist, nprobe, scanned: r.scanned.length, n: points.length, recall, k: s.k, missed: lost.length, r }), [r, recall, lost.length]);

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Points scanned" value={r.scanned.length} color="var(--info)" sub={`of ${points.length}; ${r.computations} computations with the ${s.nlist} centroids`} />
          <Stat label={`Recall@${s.k}`} value={pctText(recall, 0)} color={recall === 1 ? 'var(--ok)' : 'var(--bad)'} sub={`${s.k - lost.length} of the true ${s.k} found`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a point in a probed cell (scanned)', shape: 'dot' },
            { color: 'var(--dim)', label: 'a point in a cell that was not probed', shape: 'dot' },
            { color: 'var(--ok)', label: 'a true neighbour that was returned', shape: 'dot' },
            { color: 'var(--bad)', label: 'a true neighbour that was missed, or a wrong one returned', shape: 'dot' },
            { color: 'var(--hi)', label: 'the query', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Cells nlist" value={s.nlist} min={MIN_NLIST} max={MAX_NLIST} onChange={(nlist) => set({ nlist, nprobe: Math.min(s.nprobe, nlist) })} />
          <Slider label="Probed nprobe" value={nprobe} min={1} max={s.nlist} onChange={(v) => set({ nprobe: v })} />
          <Slider label="k" value={s.k} min={1} max={MAX_K} onChange={(k) => set({ k })} />
        </>,
      ]}
    >
      <div className="vs-stage vs-pair stage-pad">
        <Box>
          <SectionTitle hint="shading: the cell of each centroid; stronger where probed">Cells and the query</SectionTitle>
          <div className="vs-plot">
            <Plot2D x={{ domain: [0, DOMAIN] }} y={{ domain: [0, DOMAIN] }} aspect="equal" width={356} ariaLabel={`${s.nlist} cells; ${nprobe} probed, ${r.scanned.length} points scanned`}>
              <Heat fn={heat} resolution={48} />
              <Points data={points.map((p, i) => ({
                x: p[0], y: p[1],
                tone: trueIds.has(i) ? (gotIds.has(i) ? 'ok' as const : 'bad' as const) : gotIds.has(i) ? 'bad' as const : scanned.has(i) ? 'info' as const : 'dim' as const,
                r: trueIds.has(i) || gotIds.has(i) ? 5 : 3,
                ring: trueIds.has(i) && !gotIds.has(i) ? 'bad' as const : undefined,
              }))} />
              <Points data={ivf.centroids.map((c) => ({ x: c[0], y: c[1], tone: 'violet' as const, hollow: true, r: 5 }))} />
              <Points data={[{ x: s.query[0], y: s.query[1], tone: 'hi' as const, r: 7 }]} onDrag={(_i, [x, y]) => set({ query: [x, y] })} pointLabel={() => 'Query'} />
            </Plot2D>
          </div>
        </Box>
        <Box>
          <SectionTitle hint="every nprobe from 1 to nlist, run for real">Recall against work</SectionTitle>
          <div className="vs-plot">
            <Plot2D x={{ domain: [0, points.length + s.nlist], label: 'distance computations' }} y={{ domain: [0, 1.05], label: `recall@${s.k}` }} width={356} height={240} ariaLabel="Recall against distance computations as nprobe grows">
              <Curve points={sweep.map((p): [number, number] => [p.x, p.y])} tone="info" />
              <Points data={sweep.map((p) => ({ ...p, tone: 'info' as const }))} r={3} />
              <VLine at={r.computations} tone="hi" label="now" />
            </Plot2D>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy" seed={s.seed}>toy 2-D data and a simplified IVF index; recall numbers are for this dataset and this query only</Provenance>
          <Provenance kind="real">k-means and the search run live</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
