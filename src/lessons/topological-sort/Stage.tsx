import { useMemo, useRef, useState, type ReactNode } from 'react';
import { GraphView, type GraphNode, type Pt } from '../../components/GraphView';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { layeredLayout, layeredPositions } from '../../core/graphLayout';
import { usePlayer } from '../../core/usePlayer';
import { ALGO_NAMES, topoFrames, type Algo } from './frames';
import { countOrders, dfsTopo, isValidOrder, kahn, layoutEdges, refuseEdge, type Dag } from './model';
import { PRESETS, type PresetId } from './presets';
import './styles.css';

const STEP_MS = 850;
const BOX = { w: 98, h: 38, rx: 9 };
const SPACING = { direction: 'down', layerGap: 82, nodeGap: 112, padMain: 40, padCross: 58 } as const;
/** Smallest scene text (the 12px badges) stays at 8px+: the graph never shrinks below 2/3 of its natural width. */
const MIN_SCALE = 8 / 12;
const PHONE_WIDTH = 320;
const BADGE_R = 11;

export function Stage() {
  const [presetId, setPresetId] = useState<PresetId>('courses');
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [graph, setGraph] = useState<Dag>(preset.graph);
  const [algo, setAlgo] = useState<Algo>('kahn');
  const [note, setNote] = useState<string | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const frames = useMemo(() => topoFrames(graph, algo), [graph, algo]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  const results = useMemo(() => {
    const k = kahn(graph);
    const d = dfsTopo(graph);
    return { kahn: k.order.length === graph.nodes.length ? k.order : null, dfs: d.cycle ? null : d.order, count: countOrders(graph) };
  }, [graph]);

  // Laid out without the edges that close a cycle, so adding one never rearranges the drawing.
  const laidOutBy = useMemo(() => layoutEdges(graph, preset.graph), [graph, preset]);
  // The graph's natural width, for the width below which it scrolls instead of shrinking.
  const naturalWidth = useMemo(() => layeredPositions(layeredLayout(graph.nodes, laidOutBy), SPACING).width, [graph.nodes, laidOutBy]);
  const graphMinWidth = Math.max(PHONE_WIDTH, Math.ceil(naturalWidth * MIN_SCALE));
  const placed = new Set(f.output);
  const queued = new Set(f.queue);
  const onPath = new Set(f.path);
  const inCycle = new Set(f.cycle ?? []);
  const consumed = new Set(f.consumed);
  const cycleEdgeSet = new Set(f.cycleEdges);
  const added = graph.edges.length - preset.graph.edges.length;

  const edit = (next: Dag, msg: string | null) => {
    player.queueNext({ play: false });
    setGraph(next);
    setNote(msg);
  };
  const load = (id: PresetId) => {
    setPresetId(id);
    setGraph(PRESETS.find((p) => p.id === id)!.graph);
    setNote(null);
  };
  const addEdge = (from: string, to: string) => {
    const why = refuseEdge(graph, from, to);
    if (why) {
      setNote(why);
      return;
    }
    edit({ ...graph, edges: [...graph.edges, { from, to }] }, `Added ${from} → ${to}.`);
  };
  const removeEdge = (i: number) => {
    const e = graph.edges[i];
    edit({ ...graph, edges: graph.edges.filter((_, j) => j !== i) }, `Removed ${e.from} → ${e.to}.`);
    // The arrow's button is gone: keep keyboard users in the graph, on the node it came from.
    requestAnimationFrame(() => graphRef.current?.querySelector<SVGGElement>(`.graph-node[aria-label^="${e.from},"]`)?.focus());
  };

  /** The default box plus an in-degree badge on its top-right corner. */
  const renderNode = (n: GraphNode<string>, p: Pt, base: ReactNode) => {
    const deg = f.indeg?.[n.id];
    const showBadge = deg !== undefined && !placed.has(n.id);
    const bx = p.x + BOX.w / 2 - 4;
    const by = p.y - BOX.h / 2 + 2;
    return (
      <>
        {base}
        {showBadge && (
          <g className="ts-badge">
            <circle cx={bx} cy={by} r={BADGE_R} />
            <text x={bx} y={by + 4.5} textAnchor="middle">
              {deg}
            </text>
          </g>
        )}
      </>
    );
  };

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Placed" value={`${f.output.length} / ${graph.nodes.length}`} color="var(--ok)" />
          <Stat
            label="Valid orders"
            value={results.count.toLocaleString('en')}
            color={results.count ? 'var(--ok)' : 'var(--bad)'}
            sub={results.count ? 'counted exactly' : 'a cycle allows none'}
          />
          <Stat label="Arrows" value={graph.edges.length} color="var(--muted)" sub={added > 0 ? `${added} added by you` : added < 0 ? `${-added} removed` : 'as loaded'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: algo === 'kahn' ? 'emitting now' : 'visiting now', shape: 'square' },
            { color: 'var(--ok)', label: 'placed in the order', shape: 'square' },
            { color: 'var(--info)', label: algo === 'kahn' ? 'in the queue' : 'on the DFS path', shape: 'square' },
            ...(algo === 'kahn'
              ? [
                  { color: 'var(--violet)', label: 'arrows still to cross off', shape: 'dot' as const },
                  { color: 'var(--dim)', label: 'arrow crossed off', shape: 'line' as const },
                ]
              : []),
            { color: 'var(--bad)', label: 'cycle', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Algorithm" value={algo} onChange={setAlgo} options={(['kahn', 'dfs'] as const).map((a) => ({ value: a, label: ALGO_NAMES[a] }))} />
          <ControlGroup label="Graph">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={p.id === presetId} onClick={() => load(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button variant="danger" onClick={() => addEdge(preset.trap.from, preset.trap.to)}>
            Close a cycle ({preset.trap.from} → {preset.trap.to})
          </Button>
          <Button onClick={() => load(presetId)} disabled={graph === preset.graph}>
            Reset arrows
          </Button>
          <Hint>
            Drag from node to node to add an arrow (keyboard: C on a node, arrow keys to another, Enter). Click an arrow to remove it.
          </Hint>
        </>,
      ]}
    >
      <div className="ts stage-pad">
        <div className="ts-main" ref={graphRef}>
          <p className="ts-meaning">
            An arrow A → B means A {preset.arrow} B.
            <span className="ts-note" role="status">{note ? ` ${note}` : ''}</span>
          </p>
          <WideRegion minWidth={graphMinWidth} label="Dependency graph: scroll sideways to see all of it">
            <GraphView
              nodes={graph.nodes.map((id) => ({ id, shape: 'box' }))}
              edges={graph.edges}
              layout="layered"
              layoutEdges={laidOutBy}
              spacing={SPACING}
              directed
              box={BOX}
              arrowGap={4}
              className="ts-graph"
              ariaLabel={`Dependency graph, ${graph.nodes.length} nodes and ${graph.edges.length} arrows`}
              renderNode={renderNode}
              nodeMark={(id) => {
                if (inCycle.has(id)) return { tone: 'bad', fill: 'tint' };
                if (id === f.current) return { tone: 'hi', fill: 'solid' };
                if (placed.has(id)) return { tone: 'ok', fill: 'solid' };
                if (queued.has(id) || onPath.has(id)) return { tone: 'info', fill: 'tint', tint: 30 };
                return null;
              }}
              edgeMark={(_, i) => {
                if (cycleEdgeSet.has(i)) return { tone: 'bad', width: 4 };
                if (consumed.has(i)) return { tone: 'dim', dashed: true, width: 2 };
                return null;
              }}
              nodeAriaLabel={(id) => {
                const deg = f.indeg?.[id];
                const state = placed.has(id) ? `placed #${f.output.indexOf(id) + 1}` : queued.has(id) ? 'in the queue' : inCycle.has(id) ? 'in the cycle' : 'waiting';
                return `${id}, ${state}${deg !== undefined && !placed.has(id) ? `, ${deg} arrow${deg === 1 ? '' : 's'} in` : ''}`;
              }}
              edgeAriaLabel={(e) => `Remove arrow ${e.from} to ${e.to}`}
              onEdgeClick={(_, i) => removeEdge(i)}
              editable={{ onAddEdge: addEdge }}
            />
          </WideRegion>
        </div>
        <div className="ts-side">
          {algo === 'kahn' ? (
            <Tray label="Queue (front first)" labelWeight="regular" empty="empty" ariaLabel="Queue">
              {f.queue.length > 0 && f.queue.map((id) => <span key={id} className="chip tone-info">{id}</span>)}
            </Tray>
          ) : (
            <Tray label="DFS path (root first)" labelWeight="regular" empty="empty" ariaLabel="DFS path">
              {f.path.length > 0 && f.path.map((id) => <span key={id} className={`chip ${id === f.current ? 'tone-hi' : 'tone-info'}`}>{id}</span>)}
            </Tray>
          )}
          <Tray label={algo === 'kahn' ? 'Output (appended at the back)' : 'Output (written at the front)'} labelWeight="regular" empty="nothing placed yet" ariaLabel="Output">
            {f.output.length > 0 && f.output.map((id, i) => <span key={id} className="chip tone-ok">{i + 1}. {id}</span>)}
          </Tray>
          <Tray label="Both algorithms on this graph" labelWeight="regular" stack ariaLabel="Both results">
            {(['kahn', 'dfs'] as const).map((a) => {
              const order = results[a];
              return (
                <p key={a} className="ts-result">
                  <b>{ALGO_NAMES[a]}:</b>{' '}
                  {order && isValidOrder(graph, order) ? <span className="hl ok">{order.join(', ')} ✓</span> : <span className="hl bad">stuck on a cycle</span>}
                </p>
              );
            })}
            <Hint>Nothing simulated: both orders, the check and the count are computed live from the graph above.</Hint>
          </Tray>
        </div>
      </div>
    </StageFrame>
  );
}
