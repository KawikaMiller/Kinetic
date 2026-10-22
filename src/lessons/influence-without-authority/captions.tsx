import type { ReactNode } from 'react';
import { joinList, plural } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import {
  MAX_CONVERSATIONS, SUPPORT_TO_PASS, VETO_INFLUENCE, angleLabel, isUsed, planText, runPlan, stakeholderOf, type LedgerEntry, type Move, type Outcome, type Slot, type StakeholderId,
} from './model';
import { METER } from './scenario';

/** A signed position: +2, 0, −1. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
export const names = (ids: readonly StakeholderId[]): string => joinList(ids.map((id) => stakeholderOf(id).name));

/** What the meeting came to, in one sentence. */
export function outcomeText(out: Outcome): string {
  const support = `Weighted support ${out.score} against the ${SUPPORT_TO_PASS} it needs`;
  if (out.pass) return `${support}, and nobody of influence ${VETO_INFLUENCE} or more stands against it: the meeting passes.`;
  if (out.vetoes.length > 0) return `${support}; ${names(out.vetoes)} (influence ${VETO_INFLUENCE} or more) stand at −1 or below and the room follows them: the meeting fails.`;
  return `${support}: the meeting fails for too little support, with nobody of influence ${VETO_INFLUENCE} or more against it.`;
}

const moveText = (m: Move): string => `${stakeholderOf(m.who).name} ${signed(m.from)} to ${signed(m.to)}`;

/** One ledger line: which conversation, which rule moved whom. */
export function ledgerLine(entry: LedgerEntry): string {
  if (entry.slot === 0) {
    return entry.moves.length === 0 ? 'In the meeting: nobody you skipped was surprised.' : `In the meeting, surprise (R3): ${entry.moves.map(moveText).join(', ')}.`;
  }
  const who = stakeholderOf(entry.who!);
  const match = entry.moves.filter((m) => m.rule === 'match');
  const spill = entry.moves.filter((m) => m.rule === 'spill');
  const matchPart = entry.matched ? (match.length ? `match (R1): ${match.map(moveText).join(', ')}` : `match (R1): ${who.name} is already at +2`) : `no match: ${who.name} cares about ${who.concern}, not ${angleLabel(entry.angle!)}`;
  return `Conversation ${entry.slot}, ${who.name} on ${angleLabel(entry.angle!)}: ${matchPart}${spill.length ? `; spillover (R2): ${spill.map(moveText).join(', ')}` : ''}.`;
}

/** Scene 1: the plan as it stands, and what the run came to. */
export function mapCaption(slots: readonly Slot[], ran: boolean): ReactNode {
  const used = slots.filter(isUsed).length;
  if (!ran) {
    return <>{plural(used, 'conversation')} of {MAX_CONVERSATIONS} planned: {planText(slots)}. Press Run the meeting to see how the room reacts; the rules are printed below.</>;
  }
  return <>Plan: {planText(slots)}. {outcomeText(runPlan(slots))}</>;
}

/** Scene 2: where the story stands. */
export function storyCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase().replace(/ \(.*\)$/, ''));
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Support {w.meters[METER.support]}, trust {w.meters[METER.trust]}, {plural(w.meters[METER.weeks], 'week')} so far, scope kept {w.meters[METER.scope]}%, teams exposed {w.meters[METER.risk]}% (invented units).
      {red.length ? <> In the red: {joinList(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}
