import { useMemo, useState } from 'react';
import { GraphView } from '../../components/GraphView';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { cssVar, type TokenName } from '../../core/palette';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { ALGO_NAMES, mstFrames, type Algo } from './frames';
import { byWeight, countMinimumTrees, cut, distinctWeights, kruskal, parseWeight, prim, worstDetour, type WGraph } from './model';
import { PRESETS, type PresetId } from './presets';
import './styles.css';

const STEP_MS = 1000;
const W = 520;
const H = 340;
/** Edge weights are 13px: the graph never shrinks below 8/13 of its width, and only the graph scrolls sideways. */
const GRAPH_MIN_WIDTH = minWidthForText(W, 13);
/** Set colours for Kruskal's merged groups: categorical, never the ok/bad meanings. */
const SET_TONES: readonly TokenName[] = ['amber', 'pink', 'sky', 'orange'];

export function Stage() {
  const [presetId, setPresetId] = useState<PresetId>('offices');
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [graph, setGraph] = useState<WGraph>(preset.graph);
  const [algo, setAlgo] = useState<Algo>('kruskal');
  const [start, setStart] = useState(0);
  const [showCut, setShowCut] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');

  const name = (i: number) => preset.names[i];
  const edgeText = (i: number) => `${name(graph.edges[i].a)}–${name(graph.edges[i].b)}`;
  const frames = useMemo(() => {
    const { names, unit } = PRESETS.find((p) => p.id === presetId)!;
    return mstFrames(graph, algo, start, unit, (i) => names[i]);
  }, [graph, algo, start, presetId]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const results = useMemo(() => {
    const k = kruskal(graph);
    return { k, p: prim(graph, start), detour: worstDetour(graph, k.edges), sorted: byWeight(graph), count: countMinimumTrees(graph) };
  }, [graph, start]);

  const accepted = new Set(f.accepted);
  const rejected = new Set(f.rejected);
  const frontier = new Set(f.frontier);
  const inTree = new Set(f.inTree);
  const cutNow = showCut && f.side ? cut(graph, f.side) : null;
  const sideSet = new Set(f.side ?? []);
  const crossing = new Set(cutNow?.crossing ?? []);
  const lightest = new Set(cutNow?.lightest ?? []);

  // Kruskal's merged sets get a colour each; singletons stay plain.
  const setTone = new Map<number, TokenName>();
  if (f.sets) {
    const roots = [...new Set(f.sets)].filter((r) => f.sets!.filter((x) => x === r).length > 1).sort((a, b) => a - b);
    roots.forEach((r, i) => setTone.set(r, SET_TONES[i % SET_TONES.length]));
  }

  const load = (id: PresetId) => {
    setPresetId(id);
    setGraph(PRESETS.find((p) => p.id === id)!.graph);
    setStart(0);
    setEditing(null);
    setNote('');
  };
  const pickEdge = (i: number) => {
    setEditing(i);
    setDraft(String(graph.edges[i].w));
    setNote(`Editing ${edgeText(i)}: type a weight and press Enter.`);
    // Straight into the field, so keyboard users don't have to tab across the page to it.
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.mst-weight input')?.select());
  };
  const apply = () => {
    if (editing === null) return;
    const r = parseWeight(draft);
    if (!r.ok) {
      setNote(`${r.error} ${edgeText(editing)} keeps ${graph.edges[editing].w}.`);
      setDraft(String(graph.edges[editing].w));
      return;
    }
    player.queueNext({ play: false });
    setGraph({ ...graph, edges: graph.edges.map((e, j) => (j === editing ? { ...e, w: r.value } : e)) });
    setNote(`${edgeText(editing)} now weighs ${r.value}.`);
  };

  const status = (i: number) =>
    i === f.considered ? (f.rejectedNow === i ? 'bad' : 'hi') : accepted.has(i) ? 'ok' : rejected.has(i) ? 'dim' : null;

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Total so far" value={f.total} color="var(--ok)" sub={preset.unit} />
          <Stat label="Edges taken" value={`${f.accepted.length} / ${graph.n - results.k.components}`} color="var(--ok)" />
          <Stat
            label="Minimum trees"
            value={results.count === 1 ? 'unique' : results.count}
            color={results.count === 1 ? 'var(--ok)' : 'var(--muted)'}
            sub={distinctWeights(graph) ? 'all weights differ' : 'counted exactly'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: showCut ? 'considered / lightest across the cut' : 'considered now', shape: 'line' },
            { color: 'var(--ok)', label: 'in the tree', shape: 'line' },
            { color: 'var(--bad)', label: 'rejected (closes a loop)', shape: 'line' },
            ...(algo === 'prim' ? [{ color: 'var(--info)', label: 'frontier', shape: 'line' as const }] : []),
            ...(showCut
              ? [
                  { color: 'var(--violet)', label: 'cut: one side', shape: 'dot' as const },
                  { color: 'var(--sky)', label: 'cut: other side', shape: 'dot' as const },
                ]
              : algo === 'kruskal'
                ? [{ color: 'var(--amber)', label: 'merged sets (one colour each)', shape: 'dot' as const }]
                : []),
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Algorithm" value={algo} onChange={setAlgo} options={(['kruskal', 'prim'] as const).map((a) => ({ value: a, label: ALGO_NAMES[a] }))} />
          <ControlGroup label="Graph">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={p.id === presetId} onClick={() => load(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Toggle label="Show the cut" value={showCut} onChange={setShowCut} />
        </>,
        <>
          <TextField
            label={editing === null ? 'Weight' : `Weight of ${edgeText(editing)}`}
            value={draft}
            onChange={setDraft}
            onEnter={apply}
            disabled={editing === null}
            width={70}
            maxLength={4}
            placeholder="0-999"
            className="mst-weight"
          />
          <Button onClick={apply} disabled={editing === null}>
            Set weight
          </Button>
          <Hint>Click an edge to edit its weight{algo === 'prim' ? '; click a node to start Prim there' : ''}.</Hint>
        </>,
      ]}
    >
      <div className="mst stage-pad">
        <div className="mst-main">
          <p className="mst-note" role="status">
            {note}
          </p>
          <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Weighted graph: scroll sideways to see all of it">
          <GraphView
            nodes={preset.names.map((label, i) => ({ id: i, label, at: preset.at[i] }))}
            edges={graph.edges.map((e) => ({ from: e.a, to: e.b, weight: e.w }))}
            width={W}
            height={H}
            radius={preset.names[0].length > 1 ? 24 : 20}
            className="mst-graph"
            ariaLabel={`Weighted graph, ${graph.n} nodes and ${graph.edges.length} edges`}
            startNode={algo === 'prim' ? start : undefined}
            edgeMark={(_, i) => {
              const s = status(i);
              if (s === 'hi' || (cutNow && lightest.has(i))) return { tone: 'hi', width: 5 };
              if (s === 'bad') return { tone: 'bad', width: 4 };
              if (s === 'ok') return { tone: 'ok', width: 4.5 };
              if (algo === 'prim' && frontier.has(i)) return { tone: 'info', width: 3 };
              if (cutNow && crossing.has(i)) return { tone: 'violet', dashed: true, width: 2.5 };
              if (s === 'dim') return { tone: 'dim', dashed: true, width: 2 };
              return null;
            }}
            edgeClass={(_, i) => (i === editing ? 'mst-editing' : '')}
            nodeMark={(i) => (!cutNow && algo === 'prim' && inTree.has(i) ? { tone: 'ok', fill: 'tint', tint: 30 } : null)}
            nodeColor={(i) => {
              if (cutNow) return sideSet.has(i) ? cssVar('violet') : cssVar('sky');
              const tone = f.sets ? setTone.get(f.sets[i]) : undefined;
              return tone ? cssVar(tone) : undefined;
            }}
            nodeAriaLabel={(i) => `${name(i)}${algo === 'prim' ? (i === start ? ', Prim starts here' : ', press to start Prim here') : ''}`}
            edgeAriaLabel={(e, i) => `Edge ${edgeText(i)}, weight ${e.weight}${status(i) === 'ok' ? ', in the tree' : ''}. Press to edit the weight`}
            onEdgeClick={(_, i) => pickEdge(i)}
            onNodeClick={
              algo === 'prim'
                ? (i) => {
                    setStart(i);
                    setNote(`Prim now starts at ${name(i)}.`);
                  }
                : undefined
            }
          />
          </WideRegion>
        </div>
        <div className="mst-side">
          {algo === 'kruskal' ? (
            <Tray label="Edges, lightest first" labelWeight="regular" ariaLabel="Edges sorted by weight">
              {results.sorted.map((i) => {
                const s = status(i);
                return (
                  <span key={i} className={`chip mst-edge ${s ? `tone-${s}` : ''}`}>
                    {edgeText(i)} {graph.edges[i].w}
                  </span>
                );
              })}
            </Tray>
          ) : (
            <Tray label="Frontier, lightest first" labelWeight="regular" empty="empty" ariaLabel="Frontier">
              {f.frontier.length > 0 &&
                f.frontier.map((i) => (
                  <span key={i} className={`chip mst-edge ${i === f.considered ? 'tone-hi' : 'tone-info'}`}>
                    {edgeText(i)} {graph.edges[i].w}
                  </span>
                ))}
            </Tray>
          )}
          <Tray label="The cut property" labelWeight="regular" stack ariaLabel="Cut property">
            {cutNow ? (
              <p className="mst-line">
                Cut <span className="hl violet">{'{'}{f.side!.map(name).join(', ')}{'}'}</span> versus the rest: {cutNow.crossing.length} edges cross it, the lightest is{' '}
                <b>{cutNow.lightest.map(edgeText).join(' or ')}</b> ({graph.edges[cutNow.lightest[0]].w}), and{' '}
                {cutNow.lightest.some((i) => results.k.edges.includes(i)) ? 'it is in the minimum tree.' : 'none of them is in this tree, which should not happen.'}
              </p>
            ) : (
              <Hint>
                {showCut
                  ? 'The cut appears on steps where an edge is taken: the lightest edge across it is always safe to take.'
                  : 'Turn on Show the cut to see why each taken edge is safe.'}
              </Hint>
            )}
          </Tray>
          <Tray label="Both algorithms" labelWeight="regular" stack ariaLabel="Both algorithms">
            <p className="mst-line">
              Kruskal total <b>{results.k.total}</b>, Prim total <b>{results.p.total}</b>
              {results.k.components > 1 ? <> · <span className="hl bad">spanning forest, {results.k.components} pieces</span></> : null}
            </p>
          </Tray>
          <Tray label="Is this a shortest-path map?" labelWeight="regular" stack ariaLabel="Shortest path comparison">
            <p className="mst-line">
              {results.detour ? (
                <>
                  No. {name(results.detour.from)} to {name(results.detour.to)} through the tree costs <b>{results.detour.viaTree}</b>, but the shortest route is{' '}
                  <b>{results.detour.shortest}</b>. An MST minimises the total, not any single trip.
                </>
              ) : (
                <>On this graph every route through the tree happens to be a shortest route, but that's luck, not a rule: try the Trap preset.</>
              )}
            </p>
            <Hint>Nothing simulated: totals, the cut and the routes are computed live from the graph.</Hint>
          </Tray>
        </div>
      </div>
    </StageFrame>
  );
}
