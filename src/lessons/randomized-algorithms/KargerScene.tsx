import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { circlePositions } from '../../core/graphLayout';
import { mulberry32 } from '../../core/random';
import { plainTone } from '../../core/tone';
import { addEdge, BATCH, bruteMinCut, groupsAfter, kargerBound, kargerRun, PRESETS, removeEdge, repeat, runsNeeded, type Graph } from './karger';
import { graphOf, OPENING } from './presets';

const WIDTH = 420;
const HEIGHT = 300;
const PAD = 40;
const CONFIDENCE_MISS = 0.01;
const GROUP_NAMES = 'ABCDEFGH';
const edgesKey = (g: Graph) => g.edges.map(([a, b]) => `${a}-${b}`).join(',');

interface Batch {
  key: string;
  hits: number;
  runs: number;
}

/** Scene 5, Karger's min-cut: contract random edges until two super-nodes remain; one run finds a minimum cut with probability at least 2/(n(n-1)). */
export function KargerScene({ picker }: { picker: ReactNode }) {
  const [graph, setGraph] = useState<Graph>(graphOf(OPENING.karger.preset));
  const [seed, setSeed] = useState<number>(OPENING.karger.seed);
  const [runIndex, setRunIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [note, setNote] = useState('Click an edge to remove it, or drag from one vertex to another to add one.');

  const stageRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);

  const { n } = graph;
  const run = useMemo(() => kargerRun(graph, mulberry32(seed + runIndex)), [graph, seed, runIndex]);
  const exact = useMemo(() => bruteMinCut(graph), [graph]);
  const groups = useMemo(() => groupsAfter(graph, run.steps, shown), [graph, run, shown]);
  const finished = shown >= run.steps.length;
  const key = `${edgesKey(graph)}|${seed}`;
  const result = batch && batch.key === key ? batch : null;
  const bound = kargerBound(n);
  const positions = useMemo(() => circlePositions(Array.from({ length: n }, (_, i) => i), WIDTH, HEIGHT, PAD), [n]);
  const isMin = run.cut === exact.size;

  const reset = () => {
    setShown(0);
    setRunIndex(0);
  };
  const changeGraph = (g: Graph, message: string) => {
    setGraph(g);
    reset();
    setBatch(null);
    setNote(message);
  };
  // Removing the focused edge unmounts it, which would drop keyboard focus to <body>: hand it to the graph's tab stop.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    stageRef.current?.querySelector<SVGElement>('[role="button"][tabindex="0"]')?.focus();
  }, [graph]);
  const removeEdgeAt = (index: number) => {
    refocus.current = stageRef.current?.contains(document.activeElement) ?? false;
    changeGraph(removeEdge(graph, index), `Removed edge ${graph.edges[index][0]}-${graph.edges[index][1]}.`);
  };
  const runBatch = () => setBatch({ key, runs: BATCH, hits: repeat(graph, BATCH, seed, exact.size).hits });
  const groupLetter = (v: number) => GROUP_NAMES[groups[v]] ?? '?';

  const intro = finished
    ? <>The run contracted {run.steps.length} edges and left two super-nodes with {run.cut} edge{run.cut === 1 ? '' : 's'} between them: {isMin ? 'a minimum cut' : `not a minimum cut (the minimum is ${exact.size})`}.</>
    : <>Contracting merges the two ends of a random edge into one super-node. {shown} of {run.steps.length} contractions done; {n - shown} super-nodes left.</>;

  return (
    <StageFrame
      height={470}
      intro={intro}
      introKey={`${edgesKey(graph)}-${seed}-${runIndex}-${shown}`}
      stats={
        <Stats>
          <Stat label="Minimum cut (brute force)" value={exact.size} color="var(--ok)" sub={`over all ${(2 ** (n - 1) - 1).toLocaleString('en-US')} partitions; ${exact.count} minimum cut${exact.count === 1 ? '' : 's'}`} />
          <Stat label="This run's cut" value={finished ? run.cut : '...'} color={finished ? (isMin ? 'var(--ok)' : 'var(--bad)') : 'var(--hi)'} sub={finished ? (isMin ? 'matches the minimum' : 'larger than the minimum') : 'contract until two super-nodes remain'} />
          <Stat label="Per-run bound" value={`${(bound * 100).toFixed(1)}%`} color="var(--info)" sub={`2 / (n(n-1)) = 2 / ${n * (n - 1)} for each minimum cut`} />
          <Stat label={result ? `Minimum found in ${result.runs.toLocaleString('en-US')} runs` : 'Run it 1,000 times'} value={result ? `${((result.hits / result.runs) * 100).toFixed(1)}%` : '-'} color={result ? 'var(--ok)' : 'var(--dim)'} sub={result ? `${result.hits} of ${result.runs}; at least the bound ${(bound * 100).toFixed(1)}%` : `about ${runsNeeded(n, CONFIDENCE_MISS)} runs bring the miss chance under ${CONFIDENCE_MISS * 100}% by the bound alone`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'contracted edge (inside a super-node)', shape: 'line' },
            { color: 'var(--ok)', label: 'cut edge of a minimum cut', shape: 'line' },
            { color: 'var(--bad)', label: 'cut edge of a larger cut', shape: 'line' },
            { color: 'var(--amber)', label: 'vertices tinted by super-node (letters)', shape: 'dot' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Button variant="primary" softDisabled={finished} onClick={() => setShown((s) => Math.min(run.steps.length, s + 1))}>Contract one edge</Button>
          <Button softDisabled={finished} onClick={() => setShown(run.steps.length)}>Finish this run</Button>
          <Button onClick={() => { setShown(0); setRunIndex((r) => r + 1); }}>New run</Button>
          <Button onClick={runBatch}>Run {BATCH.toLocaleString('en-US')} times</Button>
        </>,
        <>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={edgesKey(p.graph) === edgesKey(graph)} onClick={() => changeGraph(p.graph, `Loaded ${p.label}.`)}>{p.label}</ChipButton>
          ))}
          <SeedField seed={seed} onSeed={(s) => { setSeed(s); reset(); setBatch(null); }} />
          <Hint><span role="status">{note}</span></Hint>
        </>,
      ]}
      minWidth={WIDTH}
    >
      <div className="ra-stage stage-pad" ref={stageRef}>
        <GraphView
          nodes={Array.from({ length: n }, (_, v) => ({ id: v, label: `${v}${shown > 0 ? groupLetter(v) : ''}`, at: positions.get(v)! }))}
          edges={graph.edges.map(([from, to]) => ({ from, to }))}
          layout="fixed"
          width={WIDTH}
          height={HEIGHT}
          nodeMark={(v) => (shown > 0 ? { tone: plainTone(groups[v]), fill: 'tint' } : null)}
          edgeMark={(e, i) => {
            const inside = groups[e.from] === groups[e.to];
            if (shown > 0 && inside) return { tone: 'dim', dashed: true };
            if (finished && run.cutEdges.includes(i)) return { tone: isMin ? 'ok' : 'bad', width: 5 };
            return null;
          }}
          onEdgeClick={(_, i) => removeEdgeAt(i)}
          editable={{
            onAddEdge: (a, b) => {
              const added = addEdge(graph, a, b);
              if (added.ok) changeGraph(added.graph, `Added edge ${a}-${b}.`);
              else setNote(added.error);
            },
          }}
          ariaLabel={`Graph with ${n} vertices and ${graph.edges.length} edges, ${shown} contractions applied`}
        />
        <p className="ra-note">
          {exact.size === 0 ? 'This graph is disconnected, so the minimum cut is 0 and every run finds it. ' : ''}One run finds a given minimum cut with probability at least 2/(n(n-1)) = {(bound * 100).toFixed(1)}% (verify against a textbook; Karger 1993). Run it {BATCH.toLocaleString('en-US')} times to see the fraction against that bound and against the brute-force minimum cut{exact.count > 1 ? `: this graph has ${exact.count} minimum cuts, each at least that likely` : ''}.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed + runIndex}>random edge choices from a seeded generator</Provenance>
        <Provenance kind="toy">graphs of 6 to 8 vertices so a brute force can check every partition</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
