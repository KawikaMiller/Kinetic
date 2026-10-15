import { useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, type Point } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { AvlTreeView } from './AvlTreeView';
import { avlBound, growthSeries } from './growth';
import { buildBalanced, fibonacciSize, fibonacciTree, heightOf, inOrder, sizeOf } from './model';
import { FIB_DEFAULT_HEIGHT, FIB_HEIGHTS, PLOT_MAX_N, PLOT_SEED } from './presets';
import { worstCaption } from './text';
import { stageMinWidth } from './treeBox';

const PLOT_MAX_HEIGHT = 1100;
const PLOT_WIDTH = 300;
const PLOT_HEIGHT = 250;
const SIZES_SHOWN = [1, 2, 3, 4, 5, 6, 7];

const points = (n: number[], ys: number[]): Point[] => n.map((x, i) => [x, ys[i]]);

export function WorstScene({ picker }: { picker: ReactNode }) {
  const [height, setHeight] = useState<number>(FIB_DEFAULT_HEIGHT);
  const [seed, setSeed] = useState(PLOT_SEED);
  const thin = useMemo(() => fibonacciTree(height), [height]);
  const packed = useMemo(() => buildBalanced(inOrder(thin)), [thin]);
  const series = useMemo(() => growthSeries(PLOT_MAX_N, seed), [seed]);
  const nodes = sizeOf(thin);
  const caption = worstCaption({ height, nodes, shortest: heightOf(packed) });
  useIntroCaption(<>{caption}</>, [caption]);

  return (
    <StageFrame
      minWidth={stageMinWidth(thin, packed)}
      height={560}
      stats={
        <Stats>
          <Stat label="Thinnest AVL tree" value={nodes} sub={`nodes at height ${height}`} />
          <Stat label="Packed tree, same nodes" value={heightOf(packed)} color="var(--ok)" sub="levels" />
          <Stat label="Sizes N(1) to N(7)" value={SIZES_SHOWN.map(fibonacciSize).join(', ')} sub="N(h) = N(h−1) + N(h−2) + 1" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'plain BST, sorted keys', shape: 'line' },
            { color: 'var(--ok)', label: 'AVL, sorted keys', shape: 'line' },
            { color: 'var(--info)', label: 'AVL, random order', shape: 'line' },
            { color: 'var(--muted)', label: '1.44 log2(n + 2)', shape: 'line' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Segmented label="Height" value={height} onChange={setHeight} options={FIB_HEIGHTS.map((h) => ({ value: h, label: String(h) }))} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>
      }
    >
      <div className="avl-stage stage-pad avl-split">
        <div className="avl-main">
          <SectionTitle>Thinnest AVL tree of height {height}</SectionTitle>
          <AvlTreeView tree={thin} ariaLabel={`Fibonacci tree of height ${height} with ${nodes} nodes`} />
          <SectionTitle>The same {nodes} keys, packed tight</SectionTitle>
          <AvlTreeView tree={packed} ariaLabel={`Packed tree of ${nodes} nodes, ${heightOf(packed)} levels tall`} />
        </div>
        <div className="avl-side">
          <SectionTitle>Height against n (log axes)</SectionTitle>
          <Plot2D
            x={{ domain: [1, PLOT_MAX_N], log: true, label: 'keys inserted' }}
            y={{ domain: [1, PLOT_MAX_HEIGHT], log: true, label: 'height' }}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            ariaLabel="Tree height against number of keys for a plain tree on sorted keys, AVL on sorted keys, AVL on random keys and the AVL bound"
          >
            <Curve points={points(series.n, series.plainSorted)} tone="bad" />
            <Curve fn={avlBound} tone="muted" dashed />
            <Curve points={points(series.n, series.avlRandom)} tone="info" />
            <Curve points={points(series.n, series.avlSorted)} tone="ok" />
          </Plot2D>
          <p className="avl-claim">
            <ClaimLabel kind="research">AVL height stays under about 1.44 log2(n + 2): the classic analysis, quoted from memory (Knuth, TAOCP vol. 3)</ClaimLabel>
          </p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">every height is measured by inserting the keys one by one, not drawn from the formula</Provenance>
        <Provenance kind="simulated" seed={seed}>the random order is a seeded shuffle</Provenance>
        <Provenance kind="from-memory">the 1.44 constant is quoted, not derived here: check it against the AVL analysis in Knuth</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
