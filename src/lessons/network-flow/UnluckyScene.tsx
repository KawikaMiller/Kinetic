import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { FlowGraph } from './FlowGraph';
import { ORDER_LABELS, pushFrames, runFor, type Order } from './frames';
import { UNLUCKY_K, unluckyNetwork } from './model';

const STEP_MS = 900;
const CAPACITIES = [1, 5, 10, 100, UNLUCKY_K] as const;
const ORDERS: Order[] = ['adversarial', 'shortest'];

export function UnluckyScene({ picker }: { picker: ReactNode }) {
  const [order, setOrder] = useState<Order>('adversarial');
  const [k, setK] = useState<number>(UNLUCKY_K);
  const net = useMemo(() => unluckyNetwork(k), [k]);
  const frames = useMemo(() => pushFrames(order, k), [order, k]);
  const counts = useMemo(() => ({ adversarial: runFor('adversarial', k).steps.length, shortest: runFor('shortest', k).steps.length }), [k]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Flow now" value={f.value.toLocaleString('en-US')} color="var(--info)" sub={`the most possible is ${(2 * k).toLocaleString('en-US')}`} />
          <Stat label="Adversarial order" value={counts.adversarial.toLocaleString('en-US')} color="var(--bad)" sub="augmentations to reach it (scripted)" />
          <Stat label="Shortest path first" value={counts.shortest.toLocaleString('en-US')} color="var(--ok)" sub="augmentations to reach it" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'path just pushed', shape: 'line' },
            { color: 'var(--info)', label: 'flow on an edge', shape: 'line' },
            { color: 'var(--bad)', label: 'saturated edge', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Path choice" value={order} onChange={setOrder} options={ORDERS.map((o) => ({ value: o, label: ORDER_LABELS[o] }))} />
          <Segmented label="Capacity of the fat pipes" value={k} onChange={setK} options={CAPACITIES.map((c) => ({ value: c, label: c.toLocaleString('en-US') }))} />
        </>,
      ]}
    >
      <div className="nf-stage stage-pad">
        <FlowGraph
          net={net}
          flow={f.flow}
          path={f.path}
          ariaLabel={`The unlucky network with fat pipes of ${k}, ${f.count} augmentations done`}
          note={`${f.count.toLocaleString('en-US')} ${f.count === 1 ? 'augmentation' : 'augmentations'} done`}
        />
        <Hint tone="muted" block>
          In the adversarial order the 1-unit cross pipe is the bottleneck of each push, so each adds 1. The counts are computed from the runs: change the capacity and the adversarial count follows it, while shortest-path-first stays put.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="scripted">the adversarial order is scripted to show the worst case; a real depth-first search may or may not choose it</Provenance>
        <Provenance kind="real">shortest-path-first (Edmonds-Karp) is the real algorithm, run live</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
