import { GraphView, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import type { Config } from './parse';
import type { Plan, StepResult, World } from './model';
import { ACTION_TONE, resourceGraph } from './view';

const GRAPH_MIN_W = 480;
const BOX = { w: 132, h: 40 };

/** The dependency graph, lit by what the plan intends and, while applying, by what has run. */
export function ResourceGraph({ config, world, plan, results, current }: { config: Config; world: World; plan: Plan | null; results: readonly StepResult[]; current: string | null }) {
  const { nodes, edges } = resourceGraph(config, world);
  const action = new Map(plan?.changes.map((c) => [c.address, c.action]));
  const resultsFor = (id: string) => results.filter((r) => r.step.address === id);
  const mark = (id: string): GraphNodeMark => {
    if (id === current) return { tone: 'hi', fill: 'solid' };
    const mine = resultsFor(id);
    if (mine.some((r) => r.status === 'failed')) return { tone: 'bad', fill: 'tint' };
    if (mine.some((r) => r.status === 'skipped')) return { tone: 'dim', fill: 'tint' };
    const a = action.get(id);
    if (a === 'destroy' && mine.some((r) => r.status === 'ok')) return { tone: 'dim', fill: 'tint' };
    if (a !== 'destroy' && mine.some((r) => r.status === 'ok' && r.step.op !== 'destroy')) return { tone: 'info', fill: 'tint' };
    return { tone: a ? ACTION_TONE[a] : 'info', fill: 'tint' };
  };
  return (
    <WideRegion minWidth={GRAPH_MIN_W} label="Resource graph: scroll sideways to see all of it">
      <GraphView nodes={nodes} edges={edges} directed layout="layered" edgeStyle="curve" box={BOX} spacing={{ layerGap: 170, nodeGap: 52 }} nodeMark={mark} ariaLabel="Resource dependency graph" />
    </WideRegion>
  );
}
