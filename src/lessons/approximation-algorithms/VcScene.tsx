import { useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { minWidthForText } from '../../core/scale';
import type { Edge } from '../../core/vertexCover';

import { ONE_ENDPOINT_WITNESS, VC_LIMITS, VC_PRESETS, coverCaption, coverResult, finishMatching, presetGraph, ratioText, toggleMatchingEdge, type Keep } from './vc';

const GRAPH_W = 560;
const GRAPH_H = 300;
const NODE_R = 21;
const OPTIMUM_RING_GAP = 8;
const MATCHING_EDGE_WIDTH = 5;
const BAD_EDGE_WIDTH = 4.5;
const GRAPH_MIN_WIDTH = minWidthForText(GRAPH_W, 14, 420);

interface Vc {
  presetId: string;
  keep: Keep;
  added: Edge[];
  matching: number[];
  done: boolean;
  note: string | null;
}
const FRESH: Vc = { presetId: VC_PRESETS[0].id, keep: "both", added: [], matching: [], done: false, note: null };

const same = (e: Edge, a: number, b: number) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a);

/** Scene 1: build a maximal matching by clicking edges, keep both endpoints of each, and compare with the exact optimum. */
export function VcScene({ picker }: { picker: ReactNode }) {
  const [vc, setVc] = useState<Vc>(FRESH);
  const { presetId, keep } = vc;
  const graph = presetGraph(presetId);
  const edges = useMemo(() => [...graph.edges, ...vc.added], [graph, vc.added]);
  const n = graph.names.length;
  const result = useMemo(() => (vc.done ? coverResult(n, edges, vc.matching, keep) : null), [vc.done, n, edges, vc.matching, keep]);
  const caption = result ? coverCaption(result, keep, edges) : `${vc.matching.length} matching edge${vc.matching.length === 1 ? '' : 's'} picked. Click edges that share no vertex until none can be added, then press Done.`;
  const optimum = new Set(result?.optimum.cover ?? []);
  const cover = new Set(result?.cover ?? []);

  const pick = (edge: number) => {
    const move = toggleMatchingEdge(edges, vc.matching, edge);
    setVc((s) => (move.ok ? { ...s, matching: move.matching, done: false, note: null } : { ...s, note: `${move.text} The matching is unchanged.` }));
  };
  const addEdge = (a: number, b: number) => {
    if (edges.some((e) => same(e, a, b))) {
      setVc((s) => ({ ...s, note: `The edge (${a}, ${b}) is already in the graph.` }));
    } else if (edges.length >= VC_LIMITS.maxEdges) {
      setVc((s) => ({ ...s, note: `At most ${VC_LIMITS.maxEdges} edges: the picture stops being readable, so remove one first.` }));
    } else {
      setVc((s) => ({ ...s, added: [...s.added, [Math.min(a, b), Math.max(a, b)]], matching: [], done: false, note: null }));
    }
  };
  const finish = () => {
    const r = finishMatching(edges, vc.matching);
    setVc((s) => (r.ok ? { ...s, done: true, note: null } : { ...s, note: r.text }));
  };

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Matching edges" value={vc.matching.length} sub="no two share a vertex" />
          <Stat label="Cover size" value={result ? result.cover.length : '?'} color={result && !result.valid ? 'var(--bad)' : undefined} sub={keep === 'both' ? 'both endpoints of each edge' : 'one endpoint of each edge'} />
          <Stat label="Exact optimum" value={result ? result.optimum.size : '?'} color="var(--ok)" sub="by branching search" />
          <Stat label="Ratio" value={result ? ratioText(result.ratio) : '?'} sub="proved bound: 2" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'matching edge you picked', shape: 'line' },
            { color: 'var(--hi)', label: 'in the cover', shape: 'dot' },
            { color: 'var(--ok)', label: 'ring: in an exact optimum cover', shape: 'dot' },
            { color: 'var(--bad)', label: 'edge left uncovered', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Graph">
            {VC_PRESETS.map((p) => (
              <ChipButton key={p.id} on={presetId === p.id} onClick={() => setVc({ ...FRESH, presetId: p.id, keep })}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button variant="primary" onClick={finish}>Done</Button>
          <Button softDisabled={vc.matching.length === 0} onClick={() => setVc((s) => ({ ...s, matching: [], done: false, note: null }))}>Clear matching</Button>
          <Button softDisabled={vc.added.length === 0} onClick={() => setVc((s) => ({ ...s, added: s.added.slice(0, -1), matching: [], done: false, note: null }))}>Undo added edge</Button>
          <Toggle label="Cover keeps" value={keep === 'one'} off="both endpoints" on="one endpoint (broken)" onChange={(b) => setVc((s) => ({ ...s, keep: b ? "one" : "both", done: false, note: null }))} />
        </>,
      ]}
    >
      <div className="stage-pad aa-stage">
        <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Graph: scroll sideways to see all of it">
          <GraphView
            nodes={graph.names.map((label, i) => ({ id: i, label, at: graph.at[i] }))}
            edges={edges.map(([from, to]) => ({ from, to }))}
            width={GRAPH_W}
            height={GRAPH_H}
            radius={NODE_R}
            className="aa-graph"
            ariaLabel={`Graph with ${n} vertices and ${edges.length} edges, ${vc.matching.length} in the matching; press an edge to add it to the matching`}
            nodeMark={(v) => (cover.has(v) ? { tone: 'hi', fill: 'solid' } : null)}
            edgeMark={(_, i) => (result?.uncovered.includes(i) ? { tone: 'bad', width: BAD_EDGE_WIDTH } : vc.matching.includes(i) ? { tone: 'info', width: MATCHING_EDGE_WIDTH } : null)}
            renderNode={(node, at, base) => (
              <>
                {optimum.has(Number(node.id)) && <circle className="aa-optimum" cx={at.x} cy={at.y} r={NODE_R + OPTIMUM_RING_GAP} />}
                {base}
              </>
            )}
            nodeAriaLabel={(v) => `Vertex ${graph.names[v]}${cover.has(v) ? ', in the cover' : ''}${optimum.has(v) ? ', in an optimum cover' : ''}`}
            edgeAriaLabel={(e, i) => `Edge (${e.from}, ${e.to})${vc.matching.includes(i) ? ', in the matching' : ''}`}
            onEdgeClick={(_, i) => pick(i)}
            editable={{ onAddEdge: addEdge }}
          />
        </WideRegion>
        <div role="status" className="aa-note">
          {vc.note ? <Hint tone="bad" block>{vc.note}</Hint> : <Hint block>Press an edge (Enter on it from the keyboard) to add it to the matching, or press it again to take it out. Drag from one vertex to another, or press C then Enter, to add a graph edge (at most {VC_LIMITS.maxEdges}).</Hint>}
        </div>
        {keep === 'one' && (
          <Hint tone="muted" block>
            Shortest witness that one endpoint is not enough: the path 0-1-2 with matching edge ({ONE_ENDPOINT_WITNESS.edges[0].join(', ')}) keeps only vertex {ONE_ENDPOINT_WITNESS.kept[0]}, so edge ({ONE_ENDPOINT_WITNESS.edges[ONE_ENDPOINT_WITNESS.uncovered[0]].join(', ')}) is not covered. Load Path of 3 and try it.
          </Hint>
        )}
        <div className="aa-proof">
          <ClaimLabel kind="theorem">the matching cover is at most twice the optimum</ClaimLabel>
          <p className="aa-proof-text">The matching edges share no vertex, so any cover needs at least one endpoint for each of them: the optimum is at least the matching size. The cover takes both endpoints of each, so it is at most twice that. And because the matching is maximal, each other edge touches a matched vertex, so the cover covers the whole graph.</p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">at most 8 vertices and 12 edges so the exact optimum can be computed; real graphs have millions</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
