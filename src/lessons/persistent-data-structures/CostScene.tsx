import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { mulberry32 } from '../../core/random';
import { capacityOf, depthFor, measureCost, memorySeries } from './model';
import { BRANCHING, COST_SIZES, DEFAULT_BRANCHING, DEFAULT_SIZE, DEFAULT_UPDATES, MAX_UPDATES, MEMORY_SEED } from './presets';
import { costCaption } from './text';

const PLOT_WIDTH = 330;
const PLOT_HEIGHT = 250;

export function CostScene({ picker }: { picker: ReactNode }) {
  const [b, setB] = useState<number>(DEFAULT_BRANCHING);
  const [n, setN] = useState<number>(DEFAULT_SIZE);
  const [k, setK] = useState(DEFAULT_UPDATES);
  const cost = useMemo(() => measureCost(n, b), [n, b]);
  const series = useMemo(() => memorySeries(n, b, MAX_UPDATES, mulberry32(MEMORY_SEED)), [n, b]);
  const capacity = capacityOf(b, depthFor(n, b));
  const caption = costCaption({
    chosen: n,
    n: capacity, b, depth: cost.depth, nodes: cost.nodesCopied, slots: cost.slotsCopied, fullCopy: cost.fullCopy, k,
    persistent: series.persistent[k], fullCopies: series.fullCopies[k],
  });
  useIntroCaption(<>{caption}</>, [caption]);
  const yMax = Math.max(series.fullCopies[MAX_UPDATES], series.persistent[MAX_UPDATES]);
  const points = (ys: number[]): [number, number][] => ys.map((y, i) => [i, y]);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Nodes copied per update" value={cost.nodesCopied} color="var(--ok)" sub={`depth ${cost.depth} + 1`} />
          <Stat label="Slots copied per update" value={cost.slotsCopied} color="var(--ok)" sub={`depth ${cost.depth} x b ${b} + 1`} />
          <Stat label="A full copy writes" value={cost.fullCopy.toLocaleString('en-US')} color="var(--bad)" sub="slots, one per cell" />
          <Stat label={`After ${k} updates`} value={series.persistent[k].toLocaleString('en-US')} sub={`slots stored, against ${series.fullCopies[k].toLocaleString('en-US')} for ${k + 1} full copies`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'tree with path copying (every version kept)', shape: 'line' },
            { color: 'var(--bad)', label: 'a full copy per version', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Branching b" value={b} onChange={setB} options={BRANCHING.map((v) => ({ value: v, label: String(v) }))} />
          <Segmented label="Cells n" value={n} onChange={setN} options={COST_SIZES.map((v) => ({ value: v, label: v.toLocaleString('en-US') }))} />
        </>,
        <>
          <Slider label="Updates k" value={k} min={0} max={MAX_UPDATES} onChange={setK} />
        </>,
      ]}
    >
      <div className="pds-stage stage-pad pds-cost">
        <Plot2D
          x={{ domain: [0, MAX_UPDATES], label: 'updates (versions kept)' }}
          y={{ domain: [0, yMax], label: 'slots stored' }}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          ariaLabel={`Memory against number of updates for n = ${n} and b = ${b}: path copying against a full copy per version`}
        >
          <Curve points={points(series.fullCopies)} tone="bad" />
          <Curve points={points(series.persistent)} tone="ok" />
          <VLine at={k} label={`k = ${k}`} tone="dim" />
        </Plot2D>
        <div className="pds-claims">
          <p className="pds-line">
            Wide nodes make the tree shallow, so an update allocates fewer nodes, but each copied node carries b pointers: compare b = 2 with b = 32 at n = 1,024 above.
          </p>
          <p className="pds-line">
            <ClaimLabel kind="practice">Real persistent vectors use wide nodes, and I recall Clojure's and Scala's as 32-way with a chunk of values in each leaf; from memory, verify</ClaimLabel>
          </p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">each count is taken from a tree built and updated here, in one unit: slots stored</Provenance>
        <Provenance kind="simulated" seed={MEMORY_SEED}>the cells updated are picked by a seeded generator; every update keeps its version</Provenance>
        <Provenance kind="from-memory">library branching factors and leaf layout are not checked here</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
