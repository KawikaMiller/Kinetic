import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, type Point } from '../../components/Plot2D';
import { SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { COMPARE_N, COMPARE_SEED, compareRuns, type Order } from './compare';
import { COMPARE_ORDERS } from './presets';
import { compareCaption } from './text';

const PLOT_WIDTH = 330;
const PLOT_HEIGHT = 250;
const num = (v: number) => v.toFixed(2);
const points = (n: number[], ys: number[]): Point[] => n.map((x, i) => [x, ys[i]]);

export function CompareScene({ picker }: { picker: ReactNode }) {
  const [order, setOrder] = useState<Order>('random');
  const [seed, setSeed] = useState(COMPARE_SEED);
  const c = useMemo(() => compareRuns(order, seed), [order, seed]);
  const last = c.n.length - 1;
  const orderName = order === 'random' ? 'Random' : 'Sorted';
  const caption = compareCaption({
    order: orderName,
    rbHeight: c.rbHeight[last],
    avlHeight: c.avlHeight[last],
    rbDeleteMax: c.rb.remove.maxRotations,
    avlDeleteMax: c.avl.remove.maxRotations,
    rbInsertMean: c.rb.insert.meanRotations,
    avlInsertMean: c.avl.insert.meanRotations,
  });
  useIntroCaption(<>{caption}</>, [caption]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Red-black height" value={c.rbHeight[last]} sub={`at ${COMPARE_N.toLocaleString('en-US')} keys; bound 2 log2(n + 1) = ${(2 * Math.log2(COMPARE_N + 1)).toFixed(0)}`} />
          <Stat label="AVL height" value={c.avlHeight[last]} sub={`bound about 1.44 log2(n + 2) = ${(1.44 * Math.log2(COMPARE_N + 2)).toFixed(1)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'red-black height', shape: 'line' },
            { color: 'var(--sky)', label: 'AVL height', shape: 'line' },
            { color: 'var(--muted)', label: 'the two bounds (dashed)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Insertion order" value={order} onChange={setOrder} options={COMPARE_ORDERS.map((o) => ({ value: o.value, label: o.label }))} />
          {order === 'random' && <SeedField seed={seed} onSeed={setSeed} />}
        </>,
      ]}
    >
      <div className="rb-stage stage-pad rb-split">
        <div className="rb-main">
          <SectionTitle>Height while {COMPARE_N.toLocaleString('en-US')} keys go in (both axes log)</SectionTitle>
          <Plot2D
            x={{ domain: [1, COMPARE_N], log: true, label: 'keys inserted' }}
            y={{ domain: [1, 20], log: true, label: 'height', tickValues: [1, 2, 5, 10, 20] }}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            ariaLabel="Tree height against number of keys for a red-black tree and an AVL tree"
          >
            <Curve fn={(x) => 2 * Math.log2(x + 1)} tone="muted" dashed />
            <Curve fn={(x) => 1.44 * Math.log2(x + 2)} tone="muted" dashed />
            <Curve points={points(c.n, c.rbHeight)} tone="amber" />
            <Curve points={points(c.n, c.avlHeight)} tone="sky" />
          </Plot2D>
        </div>
        <div className="rb-side">
          <SectionTitle>Rotations and recolours, each counted on its own</SectionTitle>
          <table className="data-table rb-table">
            <thead>
              <tr>
                <th />
                <th>AVL</th>
                <th>Red-black</th>
              </tr>
            </thead>
            <tbody>
              <tr><th>Rotations per insert: mean</th><td>{num(c.avl.insert.meanRotations)}</td><td>{num(c.rb.insert.meanRotations)}</td></tr>
              <tr><th>Rotations per insert: worst</th><td>{c.avl.insert.maxRotations}</td><td>{c.rb.insert.maxRotations}</td></tr>
              <tr><th>Rotations per delete: mean</th><td>{num(c.avl.remove.meanRotations)}</td><td>{num(c.rb.remove.meanRotations)}</td></tr>
              <tr><th>Rotations per delete: worst</th><td>{c.avl.remove.maxRotations}</td><td>{c.rb.remove.maxRotations}</td></tr>
              <tr><th>Recolours per insert: mean</th><td>–</td><td>{num(c.rb.insertRecolors)}</td></tr>
              <tr><th>Recolours per delete: mean</th><td>–</td><td>{num(c.rb.removeRecolors)}</td></tr>
            </tbody>
          </table>
          <p className="rb-line">One rotation is one left or right rotation (an AVL double rotation counts as two); one recolour is one colour flip. AVL has no colours.</p>
          <p className="rb-line">
            <ClaimLabel kind="practice">Ordered maps in several standard libraries are red-black trees (C++ <code>std::map</code> in common implementations, Java <code>TreeMap</code>), and Linux's scheduler has used one for runnable tasks; from memory, verify the current versions</ClaimLabel>
          </p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">both trees are built and emptied here with the same keys; every number is counted</Provenance>
        {order === 'random' && <Provenance kind="simulated" seed={seed}>insertion and deletion orders come from seeded shuffles</Provenance>}
        <Provenance kind="from-memory">library and kernel uses are quoted, not checked here</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
