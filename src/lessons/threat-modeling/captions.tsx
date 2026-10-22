import type { ReactNode } from 'react';
import { plural, joinList } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import {
  CELLS, FLOWS, KIND_WORD, THREAT_TEXT, categoriesOf, categoryById, crossingFlows, metersOf, targetById, zoneLabel, zoneOf,
  type ElementId, type ThreatState,
} from './model';
import { METER, SPRINT_DAYS, slipOf } from './sprint';


/** Scene 1: the crossings, the coverage so far and, when one is picked, what STRIDE says about it. */
export function diagramCaption(s: ThreatState, selected: string | null): ReactNode {
  const m = metersOf(s);
  const crossing = crossingFlows(s.placement);
  const where = selected ? targetById(selected) : null;
  return (
    <>
      {crossing.length === 0 ? <>No flow crosses a trust boundary. </> : <>{crossing.length} of {FLOWS.length} flows cross a boundary ({joinList(crossing.map((f) => f.label))}) and are drawn dashed: they get the most scrutiny. </>}
      {where ? (
        <>
          {where.label} is a {KIND_WORD[where.kind]}
          {where.kind !== 'flow' && <> in the {zoneLabel(zoneOf(s.placement, where.id as ElementId))}</>}
          : STRIDE gives it {plural(categoriesOf(where).length, 'category', 'categories')} ({categoriesOf(where).join(', ')}).{' '}
        </>
      ) : (
        <>Pick an element or a flow to see which STRIDE categories apply to it. </>
      )}
      You have looked at {m.revealed} of {m.cells} cells, so {m.neverLooked} were never looked at.
    </>
  );
}

/** Scene 2: the last control result, or what to do next. */
export function mitigateCaption(s: ThreatState, selectedCell: string | null, last: { kind: 'accepted' | 'refused'; message: string } | null): ReactNode {
  const m = metersOf(s);
  if (last) return <>{last.message} {m.mitigated} of {m.revealed} revealed threats are mitigated.</>;
  if (m.revealed === 0) return <>No threat has been revealed yet. Press "Reveal all threats", or look at cells in the diagram scene.</>;
  const cell = CELLS.find((c) => c.id === selectedCell);
  if (cell) return <>Selected: {cell.target.label}, {categoryById(cell.category).name.toLowerCase()}: {THREAT_TEXT[cell.id]}. Press a control, or drag one onto the threat. {m.mitigated} of {m.revealed} mitigated.</>;
  return <>Select a threat, then press the control that addresses it. {m.mitigated} of {m.revealed} revealed threats are mitigated.</>;
}

/** Scene 3: where the sprint stands, from the walk's own meters. */
export function sprintCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase());
  const slip = slipOf(w.meters[METER.effort]);
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Known residual risk {w.meters[METER.risk]} points, effort {plural(w.meters[METER.effort], 'day')} of {SPRINT_DAYS}
      {slip > 0 ? <> (a slip of {plural(slip, 'day')})</> : null}, {plural(w.meters[METER.ownerless], 'threat')} with no owner.
      {red.length ? <> In the red: {joinList(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}
