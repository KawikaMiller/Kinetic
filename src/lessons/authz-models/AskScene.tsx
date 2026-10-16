import { useMemo, useState, type ReactNode } from 'react';
import { GraphView, type GraphEdge, type GraphEdgeMark, type GraphNode, type GraphNodeMark } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { toneVar } from '../../core/tone';
import { askCaption } from './captions';
import { foldersOf, moveDoc, setUserClearance, setUserDept } from './edits';
import { MODELS, buildConfigs, decide, type NodeKind, type NodeState } from './models';
import { OrgEdits } from './OrgEdits';
import { ACTIONS, docById, userById, type Action, type Org } from './org';
import { OPENING } from './opening';

const NODE_BOX = { w: 176, h: 42 };
const LAYER_GAP = 215;
const PAD_MAIN = 40;
const KIND_TONE: Record<NodeKind, 'sky' | 'amber' | 'pink' | 'orange' | 'violet'> = { user: 'sky', group: 'amber', role: 'pink', resource: 'orange', rule: 'violet', perm: 'orange' };
const STATE_MARK: Record<NodeState, GraphNodeMark['tone']> = { granted: 'ok', failed: 'bad', dim: 'dim' };
const EDGE_WIDTH = 3;

interface Props {
  picker: ReactNode;
  org: Org;
  setOrg: (next: Org) => void;
}

/** Scene 1: ask one question under each model, read the path it walked, and edit the organisation. */
export function AskScene({ picker, org, setOrg }: Props) {
  const [model, setModel] = useState(OPENING.ask.model);
  const [userId, setUserId] = useState(OPENING.ask.user);
  const [action, setAction] = useState<Action>(OPENING.ask.action);
  const [docId, setDocId] = useState(OPENING.ask.doc);

  const user = userById(org, userId);
  const doc = docById(org, docId);
  const decision = useMemo(() => decide(model, org, buildConfigs(org), userId, action, docId), [model, org, userId, action, docId]);

  const nodes: GraphNode<string>[] = decision.nodes.map((n) => ({ id: n.id, label: n.label, shape: 'box' }));
  const edges: GraphEdge<string>[] = decision.edges.map((e) => ({ from: e.from, to: e.to, label: e.label }));
  const kindOf = new Map(decision.nodes.map((n) => [n.id, n]));
  const nodeMark = (id: string): GraphNodeMark => ({ tone: STATE_MARK[kindOf.get(id)!.state], fill: 'tint' });
  const edgeMark = (_: GraphEdge<string>, i: number): GraphEdgeMark => ({ tone: decision.edges[i].state === 'granted' ? 'ok' : 'bad', width: EDGE_WIDTH });
  const granted = decision.edges.filter((e) => e.state === 'granted');
  const naturalWidth = (layerCount(decision.nodes, decision.edges) - 1) * LAYER_GAP + NODE_BOX.w + 2 * PAD_MAIN;
  const graphKey = `${model}|${decision.nodes.map((n) => n.id).join()}`;

  return (
    <StageFrame
      height={720}
      intro={askCaption(org, model, userId, action, docId)}
      introKey={`${model}|${userId}|${action}|${docId}|${JSON.stringify(org)}`}
      stats={
        <Stats>
          <Stat label="Decision" value={decision.granted ? 'granted' : 'denied'} color={decision.granted ? 'var(--ok)' : 'var(--bad)'} sub={`${user.name}, ${action}, ${doc.name}`} />
          <Stat label="Edges on the granting path" value={granted.length} sub={`${decision.edges.length} considered`} />
          <Stat label="Attributes" value={`${user.dept}, clearance ${user.clearance}`} sub={`${doc.name}: ${doc.dept}, level ${doc.level}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the path that granted', shape: 'square' },
            { color: 'var(--bad)', label: 'considered and failed', shape: 'square' },
            { color: 'var(--dim)', label: 'listed, not matching', shape: 'square' },
            { color: toneVar('sky'), label: 'users (bar)', shape: 'square' },
            { color: toneVar('amber'), label: 'groups', shape: 'square' },
            { color: toneVar('pink'), label: 'roles', shape: 'square' },
            { color: toneVar('orange'), label: 'resources', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Model" value={model} options={MODELS.map((m) => ({ value: m.id, label: m.label }))} onChange={setModel} />
          <Segmented label="Action" value={action} options={ACTIONS.map((a) => ({ value: a, label: a }))} onChange={setAction} />
        </>,
        <>
          <span className="az-row-label">Who</span>
          {org.users.map((u) => <ChipButton key={u.id} tone="sky" on={u.id === userId} onClick={() => setUserId(u.id)}>{u.name}</ChipButton>)}
        </>,
        <>
          <span className="az-row-label">Which document</span>
          {org.docs.map((d) => <ChipButton key={d.id} tone="orange" on={d.id === docId} onClick={() => setDocId(d.id)}>{d.name}</ChipButton>)}
        </>,
        <>
          <Segmented label={`${user.name}'s department`} value={user.dept} options={org.depts.map((d) => ({ value: d, label: d }))} onChange={(d) => setOrg(setUserDept(org, userId, d))} />
          <Segmented label={`${user.name}'s clearance`} value={user.clearance} options={Array.from({ length: org.levels }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} onChange={(c) => setOrg(setUserClearance(org, userId, c))} />
        </>,
        <>
          <Segmented label={`Folder of ${doc.name}`} value={org.folderOf[docId]} options={foldersOf(org).map((f) => ({ value: f, label: f }))} onChange={(f) => setOrg(moveDoc(org, docId, f))} />
        </>,
        <OrgEdits key="edits" org={org} setOrg={setOrg} />,
      ]}
    >
      <div className="az-stage stage-pad">
        <WideRegion minWidth={naturalWidth} label="Evaluation path: scroll sideways to see all of it">
          <GraphView
            key={graphKey}
            nodes={nodes}
            edges={edges}
            directed
            layout="layered"
            edgeStyle="curve"
            spacing={{ direction: 'right', layerGap: LAYER_GAP, nodeGap: 56, padMain: PAD_MAIN }}
            box={NODE_BOX}
            labelHalo
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            renderNode={(n, at, base) => (
              <>
                {base}
                <rect x={at.x - NODE_BOX.w / 2} y={at.y - NODE_BOX.h / 2 + 8} width={5} height={NODE_BOX.h - 16} rx={2} fill={toneVar(KIND_TONE[kindOf.get(n.id)!.kind])} />
              </>
            )}
            ariaLabel={`How ${MODELS.find((m) => m.id === model)!.label} decides: ${decision.granted ? 'granted' : 'denied'}`}
            className="az-graph"
          />
        </WideRegion>
        <Box className="az-panel">
          <SectionTitle>{decision.granted ? 'Why it was granted' : 'Why not'}</SectionTitle>
          {decision.granted ? (
            <ol className="az-path">
              {granted.map((e, i) => <li key={i}>{kindOf.get(e.from)!.label} → {kindOf.get(e.to)!.label}{e.label ? ` (${e.label})` : ''}</li>)}
              {granted.length === 0 && <li>{kindOf.get(decision.nodes[0].id)!.label}: every condition held.</li>}
            </ol>
          ) : (
            <p className="az-why">{decision.why}</p>
          )}
          {decision.note && <p className="az-note">{decision.note}.</p>}
        </Box>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">an invented organisation and a small evaluator for each model; every configuration is regenerated from the facts after each edit</Provenance>
        <Provenance kind="toy">each model is simplified: real systems differ in syntax, caching and how they store relationships</Provenance>
        <Provenance kind="from-memory">Google's Zanzibar paper (2019) and open-source relatives such as SpiceDB and OpenFGA; AWS Cedar and Open Policy Agent for policy rules; the paper's "new enemy" problem (an access change and a content change seen out of order) is why consistency tokens exist; verify each against its own documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

/** How many columns the layered drawing uses: the longest chain of edges, counted in nodes (capped by the node count, so a loop cannot run away). */
function layerCount(nodes: readonly { id: string }[], edges: readonly { from: string; to: string }[]): number {
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    for (const e of edges) depth.set(e.to, Math.min(nodes.length - 1, Math.max(depth.get(e.to) ?? 0, (depth.get(e.from) ?? 0) + 1)));
  }
  return 1 + Math.max(0, ...depth.values());
}