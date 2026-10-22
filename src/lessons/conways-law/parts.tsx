import { GraphView } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Legend, Provenance, ProvenanceRow, ClaimLabel, Slider } from '../../components/ui';
import { categorical } from '../../core/palette';
import { CAP, EDGES, PRESETS, SERVICES, TEAMS, type Layout, type ServiceId, type TeamId } from './model';

const GRAPH = { width: 560, height: 310, minWidth: 520 } as const;
const NODE_BOX = { w: 104, h: 34 } as const;
const teamColour = (team: TeamId): string => categorical(TEAMS.indexOf(team));

/** The eight services drawn in a fixed layout: a team's colour on each, a call inside a team dim and one across teams in red. */
export function LayoutGraph({ layout }: { layout: Layout }) {
  const nodes = SERVICES.map((s) => ({ id: s.id, label: `${s.id} ${s.complexity}`, at: s.at, shape: 'box' as const }));
  const edges = EDGES.map(([from, to]) => ({ from, to }));
  return (
    <WideRegion minWidth={GRAPH.minWidth}>
      <GraphView
        nodes={nodes}
        edges={edges}
        width={GRAPH.width}
        height={GRAPH.height}
        box={NODE_BOX}
        nodeColor={(id: ServiceId) => (layout[id] ? teamColour(layout[id]!) : undefined)}
        edgeMark={(e) => (layout[e.from] && layout[e.to] ? { tone: layout[e.from] === layout[e.to] ? 'dim' : 'bad' } : null)}
        ariaLabel="The eight services and the calls between them, coloured by team"
      />
    </WideRegion>
  );
}

export function LayoutLegend() {
  return (
    <Legend items={[
      ...TEAMS.map((t) => ({ color: teamColour(t), label: `team ${t}`, shape: 'square' as const })),
      { color: 'var(--dim)', label: 'a call inside one team', shape: 'line' },
      { color: 'var(--bad)', label: 'a call across teams: an interface', shape: 'line' },
    ]}
    />
  );
}

/** The three presets as chips; `onPick` receives the preset's layout. */
export function PresetChips({ layout, onPick }: { layout: Layout; onPick: (key: keyof typeof PRESETS) => void }) {
  const same = (key: keyof typeof PRESETS) => SERVICES.every((s) => layout[s.id] === PRESETS[key].layout[s.id]);
  return (
    <>
      {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => (
        <ChipButton key={key} tone="info" size="md" on={same(key)} onClick={() => onPick(key)}>{PRESETS[key].label}</ChipButton>
      ))}
    </>
  );
}

export function CapSlider({ cap, onCap }: { cap: number; onCap: (v: number) => void }) {
  return <Slider label="Cognitive-load cap (invented)" value={cap} min={CAP.min} max={CAP.max} step={CAP.step} onChange={onCap} />;
}

export function ConwayChips() {
  return (
    <ProvenanceRow>
      <Provenance kind="invented">the services, calls, changes, complexity points and the cap are made up</Provenance>
      <Provenance kind="illustrative">a model of one organisation, not any real company</Provenance>
      <ClaimLabel kind="view">Conway&apos;s observation: organisations tend to build designs that mirror their communication paths</ClaimLabel>
      <Provenance kind="from-memory">Melvin Conway, &quot;How do committees invent?&quot;, 1968; verify against the paper</Provenance>
      <ClaimLabel kind="view">cognitive load as a design input for team boundaries comes from team-topology writing; its four team types (stream-aligned, enabling, complicated-subsystem, platform) are named here and not built</ClaimLabel>
      <Provenance kind="from-memory">Skelton and Pais, Team Topologies, 2019; verify against the book</Provenance>
    </ProvenanceRow>
  );
}
