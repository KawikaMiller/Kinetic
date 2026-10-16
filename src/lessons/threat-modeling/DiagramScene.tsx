import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { GraphView, type GraphEdge, type GraphEdgeMark, type GraphNode, type GraphNodeMark } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { toneVar } from '../../core/tone';
import { diagramCaption } from './captions';
import {
  CATEGORIES, DIAGRAM_H, DIAGRAM_W, ELEMENTS, FLOWS, TARGETS, ZONES, threatSentence, ZONE_W, categoriesOf, categoryById, cellId, controlById, crosses, metersOf, positions,
  reveal, revealAll, startState, targetById, withPlacement, zoneLabel, zoneOf, KIND_WORD, type ElementId, type ThreatState, type ZoneId,
} from './model';

/** The narrowest width at which the drawing's 12px labels stay readable on a phone. */
export const DIAGRAM_MIN_WIDTH = 480;
const ZONE_OPTIONS = ZONES.map((z) => ({ value: z.id, label: z.label }));
const FLOW_WIDTH = 3;

export interface SharedScene {
  picker: ReactNode;
  state: ThreatState;
  setState: (next: (s: ThreatState) => ThreatState) => void;
}

/** The grid cell a (row, column) pair names, or null when STRIDE does not apply there. */
const cellAt = (r: number, c: number) => {
  const t = TARGETS[r];
  const cat = CATEGORIES[c].id;
  return categoriesOf(t).includes(cat) ? cellId(t.id, cat) : null;
};

/** Scene 1: draw the system, move the stores between zones, and look at what STRIDE says about each element. */
export function DiagramScene({ picker, state, setState }: SharedScene) {
  const [selected, setSelected] = useState<string | null>(null);
  const m = metersOf(state);
  const pos = useMemo(() => positions(state.placement), [state.placement]);

  const nodes: GraphNode<ElementId>[] = ELEMENTS.map((e) => ({ id: e.id, label: e.label, at: pos[e.id], shape: 'box' }));
  const edges: GraphEdge<ElementId>[] = FLOWS.map((f) => ({ from: f.from, to: f.to, label: f.tag }));
  const edgeMark = (_: GraphEdge<ElementId>, i: number): GraphEdgeMark | null => {
    const f = FLOWS[i];
    const crossing = crosses(state.placement, f);
    if (selected === f.id) return { tone: 'hi', dashed: crossing, width: FLOW_WIDTH };
    return crossing ? { tone: 'orange', dashed: true, width: FLOW_WIDTH } : null;
  };
  const nodeMark = (id: ElementId): GraphNodeMark | null => (selected === id ? { tone: 'hi', fill: 'tint' } : null);
  const zoneTone = (id: ElementId) => toneVar(ZONES.find((z) => z.id === zoneOf(state.placement, id))!.tone);

  const underlay = (
    <>
      {ZONES.map((z, i) => (
        <g key={z.id} className="tm-zone" style={{ ['--zone' as string]: toneVar(z.tone) }}>
          <rect x={i * ZONE_W + 3} y={3} width={ZONE_W - 6} height={DIAGRAM_H - 6} rx={10} />
          <text x={i * ZONE_W + ZONE_W / 2} y={23} textAnchor="middle">{z.label}</text>
        </g>
      ))}
    </>
  );

  const target = selected ? targetById(selected) : null;
  const rows = target ? categoriesOf(target) : [];

  /** The threat cell to move focus to once it is revealed: the "Look at it" chip is replaced by text, so focus would fall to the page. */
  const [focusCell, setFocusCell] = useState<string | null>(null);
  useEffect(() => {
    if (focusCell && state.revealed[focusCell]) {
      document.getElementById(`tm-threat-${focusCell}`)?.focus();
      setFocusCell(null);
    }
  }, [focusCell, state.revealed]);
  const look = (id: string) => setState((s) => reveal(s, id));
  const onCell = (r: number, c: number) => {
    const id = cellAt(r, c);
    if (!id) return;
    setSelected(TARGETS[r].id);
    look(id);
  };

  const cellSpec = (r: number, c: number): GridCellSpec => {
    const id = cellAt(r, c);
    if (!id) return { fill: 'none' };
    if (state.mitigated[id]) return { tone: 'ok', fill: 'tint', text: '✓' };
    if (state.revealed[id]) return { tone: 'bad', fill: 'tint', text: '!' };
    return { tone: 'dim', fill: 'outline' };
  };

  return (
    <StageFrame
      height={760}
      intro={diagramCaption(state, selected)}
      introKey={`${selected}|${state.placement.orders}|${state.placement.audit}|${m.revealed}`}
      stats={
        <Stats>
          <Stat label="Crossing a boundary" value={`${m.crossings} of ${FLOWS.length}`} color={m.crossings ? 'var(--orange)' : undefined} sub="flows drawn dashed" />
          <Stat label="Threats revealed" value={`${m.revealed} of ${m.cells}`} color={m.revealed ? 'var(--bad)' : undefined} sub="applicable STRIDE cells looked at" />
          <Stat label="Unreviewed crossings" value={m.unreviewedCrossings} color={m.unreviewedCrossings ? 'var(--orange)' : 'var(--ok)'} sub="crossing flows with no revealed threat" />
          <Stat label="Never looked at" value={m.neverLooked} sub="cells still outlined in grey" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'flow that crosses a boundary (dashed)', shape: 'line' },
            { color: 'var(--hi)', label: 'element or flow in focus', shape: 'square' },
            { color: 'var(--bad)', label: 'threat revealed', shape: 'square' },
            { color: 'var(--ok)', label: 'threat mitigated (tick)', shape: 'square' },
            { color: 'var(--dim)', label: 'applicable cell not looked at', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Orders DB zone" value={state.placement.orders} options={ZONE_OPTIONS} onChange={(orders: ZoneId) => setState((s) => withPlacement(s, { orders }))} />
          <Segmented label="Audit log zone" value={state.placement.audit} options={ZONE_OPTIONS} onChange={(audit: ZoneId) => setState((s) => withPlacement(s, { audit }))} />
        </>,
        <>
          <Button onClick={() => setState((s) => revealAll(s))}>Reveal all threats</Button>
          <Button onClick={() => { setState(() => startState()); setSelected(null); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="tm-stage stage-pad">
        <p className="tm-note">
          The four questions of a threat model: what are we working on, what can go wrong, what are we going to do about it, and did we do a good job. This scene takes the first two; the scenes after it take the third.
        </p>
        <WideRegion minWidth={DIAGRAM_MIN_WIDTH} label="Data-flow diagram: scroll sideways to see all of it">
          <GraphView
            nodes={nodes}
            edges={edges}
            directed
            width={DIAGRAM_W}
            height={DIAGRAM_H}
            box={{ w: 116, h: 40 }}
            underlay={underlay}
            labelHalo
            nodeColor={zoneTone}
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            onNodeClick={(id) => setSelected(id)}
            onEdgeClick={(_, i) => setSelected(FLOWS[i].id)}
            nodeAriaLabel={(id) => `${targetById(id).label}, in the ${zoneLabel(zoneOf(state.placement, id))}`}
            edgeAriaLabel={(_, i) => `${FLOWS[i].label}${crosses(state.placement, FLOWS[i]) ? ', crosses a trust boundary' : ''}`}
            ariaLabel="Data-flow diagram of the invented checkout system, with four trust zones"
            className="tm-graph"
          />
        </WideRegion>

        <Box className="tm-panel">
          <SectionTitle hint={target ? `${KIND_WORD[target.kind]}${target.log ? ', a log' : ''}` : undefined}>{target ? target.label : 'Pick an element or a flow'}</SectionTitle>
          {target ? (
            <table className="data-table tm-table">
              <thead><tr><th>Category</th><th>Violates</th><th>Threat, in this system</th></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const id = cellId(target.id, c);
                  const control = state.mitigated[id];
                  return (
                    <tr key={c}>
                      <td>{categoryById(c).name}</td>
                      <td>{categoryById(c).property}</td>
                      <td>
                        {state.revealed[id] ? (
                          <span id={`tm-threat-${id}`} tabIndex={-1} style={{ color: control ? 'var(--ok)' : 'var(--bad)' }}>
                            {threatSentence(id)}
                            {control ? ` (mitigated: ${controlById(control).label.toLowerCase()})` : ''}
                          </span>
                        ) : (
                          <ChipButton tone="info" onClick={() => { setFocusCell(id); look(id); }}>Look at it</ChipButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="tm-note">Each element type has its own list of STRIDE categories. Click a box or an arrow, or a cell in the grid.</p>
          )}
        </Box>

        <Box className="tm-panel">
          <SectionTitle hint="rows are elements and flows, columns are STRIDE">Coverage</SectionTitle>
          <WideRegion minWidth={340} label="Coverage grid: scroll sideways to see all of it">
            <CellGrid
              rows={TARGETS.length}
              cols={CATEGORIES.length}
              cell={cellSpec}
              rowLabels={TARGETS.map((t) => (t.kind === 'flow' ? t.label.replace(' to ', ' → ') : t.label))}
              colLabels={CATEGORIES.map((c) => c.id)}
              onCellClick={onCell}
              cellAriaLabel={(r, c) => {
                const id = cellAt(r, c);
                const name = `${TARGETS[r].label}, ${CATEGORIES[c].name.toLowerCase()}`;
                if (!id) return `${name}: does not apply`;
                return `${name}: ${state.mitigated[id] ? 'mitigated' : state.revealed[id] ? 'revealed' : 'not looked at'}`;
              }}
              ariaLabel="STRIDE coverage grid"
            />
          </WideRegion>
        </Box>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">an invented checkout system; the threat sentences are generic and name no technique</Provenance>
        <Provenance kind="from-memory">the per-element STRIDE chart and the four questions, as in Shostack's Threat Modeling: Designing for Security; check them against the book</Provenance>
        <ClaimLabel kind="practice">STRIDE helps you ask questions; it does not score risk or find every threat</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
