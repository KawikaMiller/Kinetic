import { useState, type DragEvent } from 'react';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useRadioGroup } from '../../components/useRadioGroup';
import { Button, ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { mitigateCaption } from './captions';
import type { SharedScene } from './DiagramScene';
import {
  CELLS, CONTROLS, FLOWS, applyControl, categoryById, controlById, flowStatus, metersOf, revealAll, startState, threatSentence, type ControlId, type FlowStatus,
} from './model';

const FLOW_STATUS_TEXT: Record<FlowStatus, string> = {
  inside: 'stays inside one zone',
  unreviewed: 'crosses a boundary, not reviewed',
  open: 'crosses a boundary, threats still open',
  covered: 'crosses a boundary, covered',
};
const FLOW_STATUS_COLOUR: Record<FlowStatus, string | undefined> = { inside: undefined, unreviewed: 'var(--orange)', open: 'var(--bad)', covered: 'var(--ok)' };
const DRAG_TYPE = 'text/plain';

type Last = { kind: 'accepted' | 'refused'; message: string } | null;

/** Scene 2: drop a control on a threat. A control that does not address that category is refused, with the reason. */
export function MitigateScene({ picker, state, setState }: SharedScene) {
  const [selected, setSelected] = useState<string | null>(null);
  const [last, setLast] = useState<Last>(null);
  const m = metersOf(state);
  const threats = CELLS.filter((c) => state.revealed[c.id]);
  const selectedIndex = threats.findIndex((c) => c.id === selected);
  const radio = useRadioGroup(threats.length, selectedIndex, (i) => setSelected(threats[i].id));

  const put = (cellId: string | null, control: ControlId) => {
    if (!cellId) {
      setLast({ kind: 'refused', message: 'No threat is selected: the control goes back to the tray. Select a threat, or drop the control on one.' });
      return;
    }
    const result = applyControl(state, cellId, control);
    setLast({ kind: result.kind, message: result.message });
    if (result.kind === 'accepted') setState(() => result.state);
  };

  const onDrop = (e: DragEvent, cellId: string) => {
    e.preventDefault();
    const control = e.dataTransfer.getData(DRAG_TYPE) as ControlId;
    if (CONTROLS.some((c) => c.id === control)) {
      setSelected(cellId);
      put(cellId, control);
    }
  };

  return (
    <StageFrame
      height={760}
      intro={mitigateCaption(state, selected, last)}
      introKey={`${selected}|${last?.message}|${m.revealed}|${m.mitigated}`}
      stats={
        <Stats>
          <Stat label="Threats revealed" value={`${m.revealed} of ${m.cells}`} color={m.revealed ? 'var(--bad)' : undefined} />
          <Stat label="Mitigated" value={`${m.mitigated} of ${m.revealed}`} color={m.mitigated ? 'var(--ok)' : undefined} sub="revealed threats with a matching control" />
          <Stat label="Unreviewed crossings" value={m.unreviewedCrossings} color={m.unreviewedCrossings ? 'var(--orange)' : 'var(--ok)'} sub="crossing flows with no revealed threat" />
          <Stat label="Never looked at" value={m.neverLooked} sub="cells not revealed" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'threat revealed', shape: 'square' },
            { color: 'var(--ok)', label: 'mitigated', shape: 'square' },
            { color: 'var(--orange)', label: 'control refused, or a crossing not reviewed', shape: 'square' },
            { color: 'var(--hi)', label: 'threat selected', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => { setState((s) => revealAll(s)); setLast(null); }}>Reveal all threats</Button>
          <Button onClick={() => { setState(() => startState()); setSelected(null); setLast(null); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="tm-stage stage-pad">
        <Box className="tm-panel">
          <SectionTitle hint="select one, then press a control; or drag a control onto it">Threats</SectionTitle>
          {threats.length === 0 ? (
            <p className="tm-note">Nothing has been looked at yet. Press "Reveal all threats", or look at cells in the first scene.</p>
          ) : (
            <div className="tm-threats" role="radiogroup" aria-label="Revealed threats">
              {threats.map((c, i) => {
                const control = state.mitigated[c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    {...radio.itemProps(i)}
                    className={`tm-threat${c.id === selected ? ' is-selected' : ''}${control ? ' is-mitigated' : ''}`}
                    onClick={() => setSelected(c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, c.id)}
                  >
                    <b>{c.target.label}: {categoryById(c.category).name.toLowerCase()}</b>
                    <span>{threatSentence(c.id)}</span>
                    <i>{control ? `mitigated: ${controlById(control).label.toLowerCase()}` : 'open'}</i>
                  </button>
                );
              })}
            </div>
          )}
        </Box>

        <Tray label="Controls" ariaLabel="Controls">
          {CONTROLS.map((c) => (
            <span key={c.id} className="tm-control" draggable onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, c.id)}>
              <ChipButton tone="info" onClick={() => put(selected, c.id)}>{c.label}</ChipButton>
            </span>
          ))}
        </Tray>
        <p className={`tm-result${last ? ` is-${last.kind}` : ''}`}>{last ? last.message : ''}</p>

        <Box className="tm-panel">
          <SectionTitle hint="a crossing flow counts as covered once all three of its threats are mitigated">Flows</SectionTitle>
          <table className="data-table tm-table">
            <thead><tr><th>Flow</th><th>Status</th></tr></thead>
            <tbody>
              {FLOWS.map((f) => {
                const status = flowStatus(state, f);
                return (
                  <tr key={f.id}>
                    <td>{f.label}</td>
                    <td style={{ color: FLOW_STATUS_COLOUR[status] }}>{FLOW_STATUS_TEXT[status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">an invented system; which control answers which category is a teaching table</Provenance>
        <ClaimLabel kind="practice">mapping controls to STRIDE categories is a convention, and real controls often cover more than one</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
