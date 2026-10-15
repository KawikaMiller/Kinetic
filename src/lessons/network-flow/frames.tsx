import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { applyPath, adversarialRun, edmondsKarp, unluckyNetwork, zeroFlow, type Arc, type FlowRun } from './model';
import { pathText } from './text';

export type Order = 'adversarial' | 'shortest';

export const ORDER_LABELS: Record<Order, string> = { adversarial: 'Adversarial (scripted)', shortest: 'Shortest path first' };

export interface PushFrame extends Frame {
  flow: number[];
  /** Augmentations done so far. */
  count: number;
  value: number;
  /** The path just pushed. */
  path: Arc[];
}

/** The first pushes one by one, then jumps: after 10, 100, 1,000 and the last one. */
const SINGLE_STEPS = 6;
const JUMPS = [10, 100, 1000];

export const runFor = (order: Order, k: number): FlowRun => (order === 'adversarial' ? adversarialRun(k) : edmondsKarp(unluckyNetwork(k)));

/** Which augmentation counts get a frame of their own (1-based). */
export function sampledCounts(total: number): number[] {
  const wanted = [...Array.from({ length: SINGLE_STEPS }, (_, i) => i + 1), ...JUMPS, total];
  return [...new Set(wanted.filter((j) => j >= 1 && j <= total))].sort((a, b) => a - b);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function pushFrames(order: Order, k: number): PushFrame[] {
  const net = unluckyNetwork(k);
  const run = runFor(order, k);
  const other = runFor(order === 'adversarial' ? 'shortest' : 'adversarial', k);
  const rec = createRecorder<PushFrame>({ flow: zeroFlow(net), count: 0, value: 0, path: [] });
  rec.snap(
    order === 'adversarial' ? (
      <>
        The unlucky network: two fat pipes of {k} on each side and a cross pipe of 1 between a and b. The scripted order alternates s→a→b→t and s→b→a→t, the second going <em>backwards</em> along the cross pipe.
      </>
    ) : (
      <>
        The unlucky network again, now with Edmonds-Karp: always push along a fewest-edges path from the residual network. Flow so far 0.
      </>
    ),
  );
  const wanted = new Set(sampledCounts(run.steps.length));
  let flow = zeroFlow(net);
  let skipped = false;
  run.steps.forEach((step, i) => {
    const j = i + 1;
    flow = applyPath(flow, step.path, step.delta);
    if (!wanted.has(j)) {
      skipped = true;
      return;
    }
    const uniform = run.steps.slice(0, j).every((s) => s.delta === step.delta);
    const lead = skipped ? (
      <>
        After {plural(j, 'augmentation')} the flow is {step.valueAfter.toLocaleString('en-US')}. Frames skip ahead here; every push in between was made in the same order{uniform ? `, each adding ${step.delta}` : ''}.
      </>
    ) : (
      <>
        Augmentation {j}: {pathText(net, [net.source, ...step.path.map((a) => a.to)], step.path)} pushes {step.delta}, so the flow is {step.valueAfter.toLocaleString('en-US')}.
      </>
    );
    skipped = false;
    rec.snap(lead, undefined, { flow: [...flow], count: j, value: step.valueAfter, path: step.path });
  });
  rec.close(
    <>
      Done: flow {run.value.toLocaleString('en-US')} after <span className="hl bad">{plural(run.steps.length, 'augmentation')}</span> in this order; the {order === 'adversarial' ? 'shortest-path-first' : 'adversarial'} order
      needs <span className="hl ok">{plural(other.steps.length, 'augmentation')}</span>.
      {order === 'adversarial' ? ' The adversarial order is scripted to show the worst case; a real search may or may not choose it.' : ' For shortest-path-first the count is bounded by the network\'s size, not by its capacities.'}
    </>,
    2,
  );
  return rec.frames;
}
