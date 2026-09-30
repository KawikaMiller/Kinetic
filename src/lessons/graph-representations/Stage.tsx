import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { categorical } from '../../core/palette';
import { GraphCanvas, type Selection } from './GraphCanvas';
import {
  addEdge, addNode, degrees, hasEdge, MAX_NODES, memory, neighbours, properties, removeEdge, removeNode, setDirected, type Graph,
} from './model';
import { PRESETS, WEIGHTS, type PresetId } from './presets';
import { ListView, MatrixView } from './Tables';
import './styles.css';

/** Node labels stay readable (8px+) on phones down to this stage width. */
const MIN_STAGE_WIDTH = 560;

type ColourBy = 'components' | 'sides';

export function Stage() {
  const [graph, setGraph] = useState<Graph>(PRESETS[0].graph);
  const [presetId, setPresetId] = useState<PresetId | null>('social');
  const [selection, setSelection] = useState<Selection>({ kind: 'node', id: 0 });
  const [colourBy, setColourBy] = useState<ColourBy>('components');
  const [weight, setWeight] = useState(1);
  const setCaption = useSetCaption();
  const props = useMemo(() => properties(graph), [graph]);
  const label = (id: number) => graph.nodes.find((n) => n.id === id)?.label ?? '?';

  useIntroCaption(
    <>
      Click empty space to add a node, drag from one node to another to add an edge, or click a cell in the matrix. The
      matrix and the list on the right are the same graph stored two ways.
    </>,
  );

  const say = (node: ReactNode) => setCaption(node, { quiet: true });
  const update = (next: Graph, message: ReactNode) => {
    setGraph(next);
    setPresetId(null);
    say(message);
  };

  const componentIndex = new Map(props.components.flatMap((c, i) => c.map((id) => [id, i] as const)));
  const colourOf = (id: number) =>
    colourBy === 'sides' && props.bipartite ? categorical(props.bipartite.get(id) ?? 0) : categorical(componentIndex.get(id) ?? 0);
  const cycle = new Set((props.cycle ?? []).map(([u, v]) => `${u}-${v}`));

  const selectedNode = selection?.kind === 'node' ? selection.id : graph.nodes[0]?.id;
  const deg = selectedNode === undefined ? 0 : neighbours(graph, selectedNode).length;
  const mem = memory(graph);

  const loadPreset = (id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setGraph(p.graph);
    setPresetId(id);
    setSelection({ kind: 'node', id: p.graph.nodes[0].id });
    say(<>{p.label}: {p.blurb}.</>);
  };

  const toggleEdge = (u: number, v: number) => {
    if (hasEdge(graph, u, v)) return update(removeEdge(graph, u, v), <>Removed {label(u)}{graph.directed ? '→' : '—'}{label(v)}: a cell went back to 0 and a list entry disappeared.</>);
    update(
      addEdge(graph, u, v, weight),
      <>
        Added {label(u)}{graph.directed ? '→' : '—'}{label(v)}: {graph.directed ? 'one matrix cell' : 'two matrix cells (it\'s symmetric)'} and{' '}
        {graph.directed ? 'one list entry' : 'two list entries'} changed.
      </>,
    );
    setSelection({ kind: 'edge', u, v });
  };

  const select = (s: Selection) => {
    setSelection(s);
    if (s?.kind === 'node') {
      const d = degrees(graph, s.id);
      const nbs = neighbours(graph, s.id).map((n) => label(n.id));
      say(
        <>
          {label(s.id)}: {graph.directed ? `in-degree ${d.in}, out-degree ${d.out}` : `degree ${d.total}`}. Listing its neighbours
          is <b>{nbs.length}</b> list entries ({nbs.join(', ') || 'none'}) but a whole matrix row of <b>{graph.nodes.length}</b> cells.
        </>,
      );
    } else if (s) {
      say(
        <>
          Edge {label(s.u)}{graph.directed ? '→' : '—'}{label(s.v)}: the matrix answers "is it there?" with one cell; the list has
          to scan {label(s.u)}'s {plural(neighbours(graph, s.u).length, 'entry', 'entries')}.
        </>,
      );
    }
  };

  const deleteSelected = () => {
    if (selection?.kind === 'node') update(removeNode(graph, selection.id), <>Removed {label(selection.id)} and every edge touching it.</>);
    else if (selection?.kind === 'edge') update(removeEdge(graph, selection.u, selection.v), <>Removed the edge.</>);
    setSelection(null);
  };

  const badge = (text: string, tone: 'ok' | 'bad' | 'dim') => <span className={`chip tone-${tone}`}>{text}</span>;

  return (
    <StageFrame
      minWidth={MIN_STAGE_WIDTH}
      height={500}
      stats={
        <Stats>
          <Stat label="Nodes · edges" value={`${graph.nodes.length} · ${graph.edges.length}`} color="var(--text)" sub={`max ${MAX_NODES} nodes`} />
          <Stat label="Matrix memory" value={mem.matrixCells} color="var(--violet)" sub="V² cells, always" />
          <Stat label="List memory" value={mem.listEntries} color="var(--info)" sub={graph.directed ? 'V + E entries' : 'V + 2E entries'} />
          <Stat label="Neighbours of one node" value={`${graph.nodes.length} vs ${deg}`} color="var(--hi)" sub="matrix row vs list" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'selected', shape: 'dot' },
            { color: 'var(--info)', label: 'its matrix cells / list entries' },
            { color: 'var(--bad)', label: 'a cycle', shape: 'line' },
            { color: categorical(0), label: colourBy === 'sides' && props.bipartite ? 'node colour = its side' : 'node colour = its component', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <ControlGroup key="presets" label="Presets">
          {PRESETS.map((p) => (
            <Button key={p.id} onClick={() => loadPreset(p.id)} className={presetId === p.id ? 'gr-on' : ''}>
              {p.label}
            </Button>
          ))}
        </ControlGroup>,
        <>
          <Toggle label="Edges" value={graph.directed} onChange={(d) => update(setDirected(graph, d), d ? <>Directed: every edge now points one way, u→v.</> : <>Undirected: u→v and v→u merged into one edge, and the matrix is symmetric.</>)} off="Undirected" on="Directed" />
          <Toggle label="Weights" value={graph.weighted} onChange={(w) => update({ ...graph, weighted: w }, w ? <>Weighted: cells store the weight instead of 1.</> : <>Unweighted: every edge counts as 1.</>)} off="Off" on="On" />
          {graph.weighted && (
            <Segmented label="New edge weight" value={weight} onChange={setWeight} options={WEIGHTS.map((w) => ({ value: w, label: String(w) }))} />
          )}
          <Segmented
            label="Colour nodes by"
            value={colourBy}
            onChange={setColourBy}
            options={[
              { value: 'components', label: 'Components' },
              { value: 'sides', label: 'Two-colouring' },
            ]}
          />
          <Button onClick={deleteSelected} disabled={!selection}>
            Delete selected
          </Button>
          <Button onClick={() => update({ ...graph, nodes: [], edges: [] }, <>Empty graph. Click to add nodes.</>)}>Clear</Button>
        </>,
      ]}
    >
      <div className="gr stage-pad">
        <div className="gr-main">
          <GraphCanvas
            graph={graph}
            selection={selection}
            colourOf={colourOf}
            cycle={cycle}
            onAddNode={(p) => {
              if (graph.nodes.length >= MAX_NODES) return say(<>That's the {MAX_NODES}-node limit for this editor.</>);
              const next = addNode(graph, p.x, p.y);
              update(next, <>Added node {next.nodes[next.nodes.length - 1].label}: a new row and column in the matrix, one new head in the list.</>);
            }}
            onAddEdge={toggleEdge}
            onSelect={select}
          />
          <div className="gr-badges">
            {badge(plural(props.components.length, 'component'), 'dim')}
            {badge(props.cycle ? 'has a cycle' : 'no cycle', props.cycle ? 'bad' : 'ok')}
            {props.isDag !== null && badge(props.isDag ? 'DAG' : 'not a DAG', props.isDag ? 'ok' : 'bad')}
            {props.isTree !== null && badge(props.isTree ? 'a tree' : 'not a tree', props.isTree ? 'ok' : 'dim')}
            {badge(props.bipartite ? 'bipartite' : 'not bipartite', props.bipartite ? 'ok' : 'dim')}
            {colourBy === 'sides' && !props.bipartite && (
              <span className="hint">
                no two-colouring exists: {graph.directed ? 'ignoring the arrows, ' : ''}there's a cycle of odd length, so nodes show components
              </span>
            )}
          </div>
        </div>
        <div className="gr-side">
          <Box>
            <SectionTitle hint={`${mem.matrixCells} cells`}>Adjacency matrix</SectionTitle>
            <MatrixView graph={graph} selection={selection} onToggle={toggleEdge} />
          </Box>
          <Box>
            <SectionTitle hint={`${mem.listEntries} entries`}>Adjacency list</SectionTitle>
            <ListView graph={graph} selection={selection} onSelect={select} />
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}
