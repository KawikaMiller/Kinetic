import { useMemo, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText, sig } from '../../core/format';
import { compareCaption } from './captions';
import { EVAL_QUERIES, compareIndexes } from './compare';
import { clusteredPoints } from './data';
import type { Settings } from './useSettings';

/** The narrowest width at which the five columns read without wrapping into each other. */
const TABLE_MIN_WIDTH = 560;

export function TableScene({ picker, s }: { picker: ReactNode; s: Settings }) {
  const points = useMemo(() => clusteredPoints(s.seed), [s.seed]);
  const rows = useMemo(() => compareIndexes(points, s), [points, s]);
  const [brute, ivf, hnsw] = rows;

  useIntroCaption(compareCaption(rows), [rows]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="IVF recall" value={pctText(ivf.recall, 0)} color={ivf.recall === 1 ? 'var(--ok)' : 'var(--bad)'} sub={`nlist ${s.nlist}, nprobe ${Math.min(s.nprobe, s.nlist)}`} />
          <Stat label="HNSW recall" value={pctText(hnsw.recall, 0)} color={hnsw.recall === 1 ? 'var(--ok)' : 'var(--bad)'} sub={`M ${s.m}, efConstruction ${s.efConstruction}, efSearch ${s.efSearch}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'exact, or as good as it gets', shape: 'square' }, { color: 'var(--bad)', label: 'the cost side of the trade', shape: 'square' }]} />}
      controls={[<>{picker}<Hint>the settings are the ones you chose on the IVF and HNSW scenes</Hint></>]}
    >
      <div className="vs-stage stage-pad">
        <Box>
          <SectionTitle hint={`means over ${EVAL_QUERIES} seeded queries on the same 400 points`}>Recall, speed, memory and build cost</SectionTitle>
          <WideRegion minWidth={TABLE_MIN_WIDTH} label="The comparison table: scroll sideways to see all of it">
          <table className="data-table vs-table">
            <thead>
              <tr><th scope="col">Index</th><th scope="col">Recall@{s.k}</th><th scope="col">Distance computations a query</th><th scope="col">Extra numbers stored</th><th scope="col">Build computations</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td><b>{r.name}</b></td>
                  <td className={r.recall === 1 ? 'vs-good' : ''}>{pctText(r.recall, 0)}</td>
                  <td className={r.name === 'Brute force' ? 'vs-cost' : ''}>{sig(r.computations, 3)}</td>
                  <td className={r.extra > brute.extra ? 'vs-cost' : ''}>{r.extra.toLocaleString('en-US')}</td>
                  <td className={r.build > 0 ? 'vs-cost' : ''}>{r.build.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </WideRegion>
          {hnsw.reachable !== undefined && hnsw.reachable < 1 && (
            <Hint tone="muted" block>
              HNSW recall is capped here: on average a layer-0 search can reach only {pctText(hnsw.reachable, 0)} of the points, because this toy build prunes links one way. The same queries and the same efSearch give the point on the HNSW scene's curve.
            </Hint>
          )}
          <Hint tone="muted" block>Build computations are not one unit: IVF counts k-means distance computations (iterations times points times cells), HNSW counts the nodes visited while inserting (plus some re-pruning distances), so compare them within a column of one index, not across.</Hint>
          <Hint tone="muted" block>"Extra numbers stored" counts the centroids' coordinates and one cell id per point (IVF) or every neighbour id on every layer (HNSW), beyond the 800 coordinates of the points. Product quantisation, which shrinks the vectors themselves, is a third lever not shown here.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy" seed={s.seed}>toy 2-D data, simplified HNSW and IVF; these numbers are for this dataset only</Provenance>
          <Provenance kind="real">each row is measured by running the search on {EVAL_QUERIES} queries</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
