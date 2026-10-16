import { useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { GraphView, type GraphEdge, type GraphEdgeMark, type GraphNode, type GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { fetchCaption, outcomeText, unsafeCount } from './captions';
import { OPENING } from './opening';
import { ALL_DEFENCES, DEFENCES, NO_DEFENCES, SCENARIOS, defenceSet, run, scenarioById, wouldReach, type DefenceSet, type ScenarioId, type Zone } from './ssrf';

const DIAGRAM = { w: 620, h: 300 } as const;
const BOX = { w: 132, h: 40 } as const;
const MIN_WIDTH = 520;
const EDGE_WIDTH = 3;

type NodeId = 'you' | 'server' | 'blog' | 'wiki' | 'meta';
const AT: Record<NodeId, { x: number; y: number }> = { you: { x: 80, y: 150 }, server: { x: 260, y: 150 }, blog: { x: 520, y: 52 }, wiki: { x: 520, y: 170 }, meta: { x: 520, y: 252 } };
const LABEL: Record<NodeId, string> = { you: 'You', server: 'Preview server', blog: 'blog.example', wiki: 'wiki.corp.example', meta: 'Metadata service' };
const ZONE_NODE: Record<Zone, NodeId> = { public: 'blog', internal: 'wiki', metadata: 'meta' };
const NODES: GraphNode<NodeId>[] = (Object.keys(AT) as NodeId[]).map((id) => ({ id, label: LABEL[id], at: AT[id], shape: 'box' }));
const EDGES: GraphEdge<NodeId>[] = [
  { from: 'you', to: 'server', label: 'a link' },
  { from: 'server', to: 'blog' },
  { from: 'server', to: 'wiki' },
  { from: 'server', to: 'meta' },
];

const PRESETS: { label: string; set: DefenceSet }[] = [
  { label: 'No defences', set: NO_DEFENCES },
  { label: 'Deny-list only', set: defenceSet('denyList') },
  { label: 'Allow-list, pinning, re-check', set: defenceSet('allowList', 'pin', 'recheck') },
  { label: 'All nine', set: ALL_DEFENCES },
];

const sameSet = (a: DefenceSet, b: DefenceSet) => DEFENCES.every((d) => a[d.id] === b[d.id]);

/** Scene 1: a simulated link-preview server, six scenarios, nine defences. */
export function FetchScene({ picker }: { picker: ReactNode }) {
  const [scenario, setScenario] = useState<ScenarioId>(OPENING.fetch.scenario);
  const [defences, setDefences] = useState<DefenceSet>(OPENING.fetch.defences);
  const s = scenarioById(scenario);
  const result = useMemo(() => run(s, defences), [s, defences]);
  const unsafeScenarios = unsafeCount(defences);
  const on = DEFENCES.filter((d) => defences[d.id]).length;

  const reachedNodes = new Set(result.connections.map((c) => ZONE_NODE[c.zone]));
  const attempted = ZONE_NODE[wouldReach(s)];
  const nodeMark = (id: NodeId): GraphNodeMark | null => {
    if (id === 'server' && result.status === 'blocked') return { tone: 'violet', fill: 'tint' };
    if (reachedNodes.has(id) && result.status !== 'blocked') return { tone: id === 'blog' ? 'ok' : 'bad', fill: 'tint' };
    return null;
  };
  const edgeMark = (_: GraphEdge<NodeId>, i: number): GraphEdgeMark | null => {
    if (i === 0) return { tone: 'info', width: EDGE_WIDTH };
    const target = (['blog', 'wiki', 'meta'] as const)[i - 1];
    if (reachedNodes.has(target)) return { tone: target === 'blog' ? 'orange' : 'bad', width: EDGE_WIDTH };
    if (result.status === 'blocked' && target === attempted) return { tone: 'ok', dashed: true, width: EDGE_WIDTH };
    return { tone: 'dim', width: 1.5 };
  };

  const logLines = [
    ...result.steps.map((st, i) => ({ text: `${i + 1}. ${st.text}`, tone: st.tone })),
    ...(result.credential ? [{ text: `   credential (fake, for this demo): ${result.credential.value}`, tone: 'bad' as const }] : []),
  ];

  return (
    <StageFrame
      height={780}
      intro={fetchCaption(scenario, defences)}
      introKey={`${scenario}|${DEFENCES.map((d) => (defences[d.id] ? 1 : 0)).join('')}`}
      stats={
        <Stats>
          <Stat label="Outcome" value={result.status === 'blocked' ? 'blocked' : result.status === 'public' ? 'public page' : result.status} color={result.status === 'blocked' || result.status === 'public' ? 'var(--ok)' : 'var(--bad)'} sub={outcomeText(result)} />
          <Stat label="Scenarios that reach inside" value={`${unsafeScenarios} of ${SCENARIOS.length}`} color={unsafeScenarios ? 'var(--bad)' : 'var(--ok)'} sub="under these defences, an internal or metadata service" />
          <Stat label="Defences on" value={`${on} of ${DEFENCES.length}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'your request', shape: 'line' },
            { color: 'var(--orange)', label: 'the server\'s own fetch', shape: 'line' },
            { color: 'var(--bad)', label: 'reached inside', shape: 'line' },
            { color: 'var(--ok)', label: 'blocked (dashed), or a safe public page', shape: 'line' },
            { color: 'var(--violet)', label: 'the server, when a layer blocked it', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <div className="ssrf-chips" role="group" aria-label="Scenario cards">
            {SCENARIOS.map((c) => <ChipButton key={c.id} tone="info" on={c.id === scenario} onClick={() => setScenario(c.id)}>{c.title}</ChipButton>)}
          </div>
        </>,
        <>
          <div className="ssrf-chips" role="group" aria-label="Defence presets">
            {PRESETS.map((p) => <ChipButton key={p.label} tone="violet" on={sameSet(defences, p.set)} onClick={() => setDefences(p.set)}>{p.label}</ChipButton>)}
          </div>
        </>,
        <div key="toggles" className="ssrf-toggles">
          {DEFENCES.map((d) => (
            <Toggle key={d.id} label={d.label} value={defences[d.id]} onChange={(v) => setDefences((cur) => ({ ...cur, [d.id]: v }))} off="off" on="on" />
          ))}
        </div>,
      ]}
    >
      <div className="ssrf-stage stage-pad">
        <p className="ssrf-note">{s.text} The scheme and port restriction stops other kinds of request, and none of these six cards uses one, so it changes no outcome here.</p>
        <WideRegion minWidth={MIN_WIDTH} label="Network diagram: scroll sideways to see all of it">
          <GraphView
            nodes={NODES}
            edges={EDGES}
            directed
            width={DIAGRAM.w}
            height={DIAGRAM.h}
            box={BOX}
            labelHalo
            underlay={
              <g className="ssrf-zone">
                <rect x={390} y={112} width={220} height={176} rx={10} />
                <text x={500} y={106} textAnchor="middle">Company network, not reachable from the internet</text>
              </g>
            }
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            ariaLabel="The preview server sits between you and three fictional hosts: a public blog, an internal wiki and a metadata service"
            className="ssrf-graph"
          />
        </WideRegion>
        <ConsolePanel lines={logLines} title="what the server logged" empty="no request yet" />
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">fictional hosts; no request is sent anywhere, and nothing you do is parsed as a URL</Provenance>
        <Provenance kind="toy">the DNS and redirect tables are small made-up tables; the second lookup of one name differs, which is what the rebinding card shows</Provenance>
        <Provenance kind="from-memory">cloud providers document a link-local metadata service for each machine; real defences also depend on your cloud, your HTTP library and your network, so check your provider's documentation</Provenance>
        <ClaimLabel kind="practice">an allow-list is the strongest of these; a deny-list needs the other layers to be worth much</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
