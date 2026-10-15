import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint } from '../../components/ui';
import { minWidthForText } from '../../core/scale';
import { MAX_NODES, PRESETS, rateText, type Edge } from './model';
import { edgeText } from './text';
import type { GraphEditor } from './useGraphEditor';

const GRAPH_W = 520;
const GRAPH_H = 300;
/** Edge weights draw at 13px, so the drawing keeps 8/13 of its natural width on a phone and scrolls sideways inside its region. */
const GRAPH_MIN_WIDTH = minWidthForText(GRAPH_W, 13);

export function PresetChips({ ed }: { ed: GraphEditor }) {
  return (
    <ControlGroup label="Graph">
      {PRESETS.map((p) => (
        <ChipButton key={p.id} on={p.id === ed.presetId} onClick={() => ed.load(p.id)}>
          {p.label}
        </ChipButton>
      ))}
    </ControlGroup>
  );
}

/** The second controls row: edit the selected edge, add a node. */
export function EditControls({ ed }: { ed: GraphEditor }) {
  const g = ed.graph;
  const e: Edge | undefined = ed.selected === null ? undefined : g.edges[ed.selected];
  const what = g.market ? 'rate' : 'weight';
  return (
    <>
      <Button onClick={() => ed.nudge(-1)} disabled={!e}>
        {what} −
      </Button>
      <Button onClick={() => ed.nudge(1)} disabled={!e}>
        {what} +
      </Button>
      <Button onClick={ed.remove} disabled={!e}>
        Remove edge
      </Button>
      <Button onClick={ed.addNode} disabled={g.names.length >= MAX_NODES}>
        Add node
      </Button>
      <Hint>
        {e
          ? `${edgeText(g, ed.selected!)}${g.market ? `, rate ${rateText(e.rate ?? 1)}` : ''}`
          : `Click an edge to select it; drag from a node to another to add one (up to ${MAX_NODES} nodes).`}
      </Hint>
    </>
  );
}

/** What an edge draws as when its scene has no opinion: a negative edge is `--info` with its sign shown. */
const negativeMark = (e: Edge): GraphEdgeMark | null => (e.w < 0 ? { tone: 'info', width: 3 } : null);

export function EditableGraph({
  ed, edgeMark, nodeMark, nodeColor, ariaLabel, pickSource = true,
}: {
  ed: GraphEditor;
  /** The scene's marks for edge `i`; return undefined to fall back to the negative-edge look. */
  edgeMark: (i: number) => GraphEdgeMark | null | undefined;
  nodeMark: (v: number) => GraphNodeMark | null | undefined;
  nodeColor?: (v: number) => string | undefined;
  ariaLabel: string;
  /** Clicking a node makes it the source. */
  pickSource?: boolean;
}) {
  const g = ed.graph;
  return (
    <>
      <p className="spa-note" role="status">
        {ed.note}
      </p>
      <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Weighted graph: scroll sideways to see all of it">
        <GraphView
          nodes={g.names.map((label, i) => ({ id: i, label, at: g.at[i] }))}
          edges={g.edges.map((e) => ({ from: e.from, to: e.to, label: g.market ? e.w.toFixed(3) : String(e.w) }))}
          directed
          width={GRAPH_W}
          height={GRAPH_H}
          radius={g.market ? 26 : 20}
          labelHalo
          className="spa-graph"
          ariaLabel={ariaLabel}
          startNode={pickSource ? ed.source : undefined}
          edgeMark={(_, i) => edgeMark(i) ?? negativeMark(g.edges[i])}
          edgeClass={(_, i) => (i === ed.selected ? 'spa-selected' : '')}
          nodeMark={nodeMark}
          nodeColor={nodeColor}
          nodeAriaLabel={(v) => `${g.names[v]}${pickSource ? (v === ed.source ? ', the source' : ', press to make it the source') : ''}`}
          edgeAriaLabel={(_, i) => `Edge ${edgeText(g, i)}. Press to select it for editing`}
          onEdgeClick={(_, i) => ed.select(i)}
          onNodeClick={pickSource ? ed.pickSource : undefined}
          editable={{ onAddEdge: ed.addEdge }}
        />
      </WideRegion>
    </>
  );
}
