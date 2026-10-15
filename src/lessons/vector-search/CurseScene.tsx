import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decimal, pctText, sig } from '../../core/format';
import { curseCaption } from './captions';
import { CURSE_POINTS, DIMS, curseRows } from './concentration';
import type { Settings } from './useSettings';

const DEFAULT_DIM_INDEX = DIMS.indexOf(16);

export function CurseScene({ picker, s }: { picker: ReactNode; s: Settings }) {
  const [at, setAt] = useState(DEFAULT_DIM_INDEX);
  const rows = useMemo(() => curseRows(s.seed), [s.seed]);
  const row = rows[at];
  const first = rows[0];
  const last = rows[rows.length - 1];
  const maxRatio = Math.max(...rows.map((r) => r.ratio));

  useIntroCaption(curseCaption({ row, first, last }), [row]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Dimensions" value={row.d} />
          <Stat label="(Farthest − nearest) / nearest" value={decimal(row.ratio, 2)} color="var(--info)" sub={`from ${sig(first.ratio, 3)} at d = ${first.d}; ${CURSE_POINTS} random points`} />
          <Stat label="IVF recall@10" value={pctText(row.recall, 0)} color={row.recall > 0.9 ? 'var(--ok)' : 'var(--bad)'} sub="a quarter of the cells probed" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'computed from seeded random points', shape: 'dot' },
            { color: 'var(--hi)', label: 'the dimension chosen', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Dimensions d" value={at} min={0} max={DIMS.length - 1} format={(i) => String(DIMS[i])} onChange={setAt} />
        </>,
      ]}
    >
      <div className="vs-stage vs-pair stage-pad">
        <Box>
          <SectionTitle hint="falls toward 0: nearest barely differs from average">Distance concentration</SectionTitle>
          <div className="vs-plot">
            <Plot2D x={{ domain: [DIMS[0], DIMS[DIMS.length - 1]], log: true, label: 'dimensions' }} y={{ domain: [0.1, Math.max(maxRatio * 1.2, 1)], log: true, label: '(far − near) / near' }} width={356} height={240} ariaLabel="Spread of distances against dimensions">
              <Curve points={rows.map((r): [number, number] => [r.d, r.ratio])} tone="info" />
              <Points data={rows.map((r) => ({ x: r.d, y: r.ratio, tone: 'info' as const }))} r={3} />
              <VLine at={row.d} tone="hi" />
            </Plot2D>
          </div>
        </Box>
        <Box>
          <SectionTitle hint="a quarter of the cells probed, the same data">IVF recall against dimensions</SectionTitle>
          <div className="vs-plot">
            <Plot2D x={{ domain: [DIMS[0], DIMS[DIMS.length - 1]], log: true, label: 'dimensions' }} y={{ domain: [0, 1.05], label: 'recall@10' }} width={356} height={240} ariaLabel="IVF recall against dimensions">
              <Curve points={rows.map((r): [number, number] => [r.d, r.recall])} tone="info" />
              <Points data={rows.map((r) => ({ x: r.d, y: r.recall, tone: 'info' as const }))} r={3} />
              <VLine at={row.d} tone="hi" />
            </Plot2D>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>500 seeded uniform points and 20 seeded queries in each dimension</Provenance>
          <Provenance kind="toy">uniform random data is the worst case for partitioning; real embeddings sit on lower-dimensional shapes, so real results differ</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
