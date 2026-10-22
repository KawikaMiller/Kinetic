/**
 * Scene 4: the debrief. Four invented interviewers: one strong "no", two lukewarm "yes", one enthusiastic "yes". Every effect
 * is a made-up number, shown with its price before the choice is made. The graph (ids, destinations) is pinned to the fixture
 * in core/testing/leadScenarios.ts. Two effects are retuned from it so that no choice or path is beaten on every meter by
 * another to the same ending, and no option is a straw man: letting the strong no decide costs less regret (8, not 12) because
 * it avoids the hire the dissenter doubted, at the price of a day and panel goodwill; and a follow-up after thin evidence lowers
 * regret by one more (2, not 1) because the evidence still names what the follow-up should test. The fixture now carries both,
 * and the goodwill edge is 4 (the fixture too) so that the one ending that costs the most goodwill, the evidence ending at 3, is
 * in the red and the edge fires. All of these numbers are authored, not measured, and the page says so.
 */
import type { ClaimKind } from '../../core/provenance';
import { READ_THE_LEDGER, type Choice, type Ending, type Meter, type Node, type Scenario } from '../../core/scenario';

export const METER = { regret: 'regret', days: 'days', goodwill: 'goodwill' } as const;

export const METERS: readonly Meter[] = [
  { id: METER.regret, label: 'Regret: expected cost of a wrong decision (k$, invented)', start: 15, min: 0, max: 60, bad: { above: 35 } },
  { id: METER.days, label: 'Days to a decision', start: 0, min: 0, max: 30, bad: { above: 10 } },
  { id: METER.goodwill, label: 'Panel goodwill (invented)', start: 7, min: 0, max: 10, bad: { below: 4 } },
];

/** Effects in meter order: regret, days, goodwill. */
const fx = (regret: number, days: number, goodwill: number): Choice['effects'] =>
  Object.fromEntries(Object.entries({ regret, days, goodwill }).filter(([, v]) => v !== 0));

const nodes: Node[] = [
  {
    id: 'h1',
    prompt: 'The debrief: one strong no, two lukewarm yes, one enthusiastic yes. How do you decide?',
    choices: [
      { id: 'avg', label: 'Decide by the average now', to: 'E_hire_now', effects: fx(10, 0, 0), because: 'If the scores are independent and the bar is clear, an average is a fair summary; with one strong dissent it hides the reason.' },
      { id: 'veto', label: 'Let the strong no decide', to: 'E_nohire_now', effects: fx(8, 1, -2), because: 'If the dissenter saw something the others did not, honouring it is cheap (regret 8, an invented figure the author set so that this is a real trade against the average); if it was a mood, a good candidate is lost.' },
      { id: 'evidence', label: 'Ask the dissenter for evidence against the rubric', to: 'h2', effects: fx(-2, 1, -3), because: 'If the concern is concrete, naming it settles the case; being questioned costs the dissenter some goodwill.' },
      { id: 'followup', label: 'Add a short structured follow-up interview', to: 'h3', effects: fx(-3, 6, 0), because: 'If the disagreement is about a skill nobody tested, one more interview adds signal and delays an offer others may beat.' },
      { id: 'senior', label: 'Let the most senior interviewer decide', to: 'E_seniority', effects: fx(6, 0, -3), because: 'If speed matters and the senior person saw the best evidence, it is fast; the others\' signal is thrown away.' },
    ],
  },
  {
    id: 'h2',
    prompt: 'The dissenter gives an answer. How solid is it?',
    choices: [
      { id: 'decide_evidence', label: 'Decide on the evidence given', to: 'E_evidence', effects: fx(-1, 0, -1), because: 'If the evidence is solid, deciding on it is cheap and fast.' },
      { id: 'still_followup', label: 'The evidence is thin: add the follow-up', to: 'h3', effects: fx(-2, 5, 0), because: 'If the evidence is thin, it still names what the follow-up should test, which lowers regret a little more (by 2, an invented figure the author set) and adds days.' },
    ],
  },
  {
    id: 'h3',
    prompt: 'A structured follow-up interview, scored against the rubric.',
    choices: [
      { id: 'hire_after', label: 'Decide after the follow-up', to: 'E_followup', effects: fx(-3, 2, 0), because: 'If the follow-up is structured and scored against the rubric, its signal is independent of the others\'.' },
    ],
  },
];

const endings: Ending[] = [
  { id: 'E_hire_now', title: 'Hired on the average', text: `Fast, and the dissent is not on the record. ${READ_THE_LEDGER}` },
  { id: 'E_nohire_now', title: 'Not hired, on the strong no', text: `Fast, with the candidate lost on one voice. ${READ_THE_LEDGER}` },
  { id: 'E_evidence', title: 'Decided on the dissenter\'s evidence', text: `Quick, and the panel remembers being questioned. ${READ_THE_LEDGER}` },
  { id: 'E_followup', title: 'Decided after a follow-up', text: `The decision rests on a new, structured signal, and it took days. ${READ_THE_LEDGER}` },
  { id: 'E_seniority', title: 'Decided by seniority', text: `Fast, with the rest of the panel's signal thrown away. ${READ_THE_LEDGER}` },
];

export const DEBRIEF: Scenario = { start: 'h1', meters: METERS, nodes, endings };

/** The kind of claim each picked reason rests on. */
export const CLAIM_OF: Readonly<Record<string, ClaimKind>> = {
  avg: 'view', veto: 'view', evidence: 'practice', followup: 'practice', senior: 'view', decide_evidence: 'view', still_followup: 'view', hire_after: 'practice',
};

export const PROVENANCE_NOTE = 'an invented debrief: every effect is a made-up number, in invented thousands of dollars and days';
