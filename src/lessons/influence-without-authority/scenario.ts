/**
 * Scene 2: Dana objects live. Invented: every effect is a made-up number, shown with its price before the choice is made.
 * The graph (ids, destinations) is pinned to the fixture in core/testing/leadScenarios.ts. One effect is retuned (and the
 * fixture in core/testing now carries it): after pushing, conceding takes one week and not two (she has already heard the case),
 * so pushing first and then conceding is not beaten on every meter by asking first; it saves a week and costs trust and scope.
 * The one-week figure is authored to satisfy the trade-off validator, and the page says so.
 */
import type { ClaimKind } from '../../core/provenance';
import { READ_THE_LEDGER, type Choice, type Ending, type Meter, type Node, type Scenario } from '../../core/scenario';

export const METER = { support: 'support', trust: 'trust', weeks: 'weeks', scope: 'scope', risk: 'risk' } as const;

export const METERS: readonly Meter[] = [
  { id: METER.support, label: 'Weighted support (invented)', start: 12, min: 0, max: 30, bad: { below: 8 } },
  { id: METER.trust, label: 'Trust (invented)', start: 6, min: 0, max: 10, bad: { below: 3 } },
  { id: METER.weeks, label: 'Weeks to a decision', start: 0, min: 0, max: 12, bad: { above: 6 } },
  { id: METER.scope, label: 'Scope of the proposal kept (%)', start: 100, min: 0, max: 100, bad: { below: 60 } },
  { id: METER.risk, label: 'Share of teams exposed if it fails (%, invented)', start: 10, min: 0, max: 100, bad: { above: 50 } },
];

/** Effects in meter order: support, trust, weeks, scope, risk. */
const fx = (support: number, trust: number, weeks: number, scope: number, risk: number): Choice['effects'] =>
  Object.fromEntries(Object.entries({ support, trust, weeks, scope, risk }).filter(([, v]) => v !== 0));

const nodes: Node[] = [
  {
    id: 'm1',
    prompt: 'In the meeting, Dana objects: "we are not ready". What do you do?',
    choices: [
      { id: 'push', label: 'Answer with the data on the spot', to: 'm2', effects: fx(-2, -2, 0, 0, 0), because: 'If the objection is about readiness, data answers the wrong question and can read as dismissal.' },
      { id: 'ask', label: 'Ask what would change her mind', to: 'm3', effects: fx(1, 1, 2, -10, 0), because: 'If she has a specific concern, asking surfaces it; asked cold it takes two weeks, and some scope.' },
      { id: 'defer', label: 'Offer a one-to-one first', to: 'm4', effects: fx(0, 0, 3, 0, 0), because: 'If the room is not the place to settle it, a conversation can, at the cost of time.' },
      { id: 'escalate', label: 'Go to her manager', to: 'E_escalated', effects: fx(3, -4, 1, 0, 15), because: 'If speed matters more than the relationship, support rises now and trust pays for it later.' },
    ],
  },
  {
    id: 'm2',
    prompt: 'The data did not land. The room is quiet.',
    choices: [
      { id: 'hold', label: 'Repeat your case', to: 'E_lost', effects: fx(-3, -1, 1, 0, 0), because: 'If you are sure and the room is not, repeating costs support.' },
      { id: 'concede', label: 'Ask what she needs', to: 'm3', effects: fx(3, 1, 1, -20, 0), because: 'If you can still change course, conceding scope buys her support; it takes one week here because she has already heard the case (a figure the author chose, invented).' },
    ],
  },
  {
    id: 'm3',
    prompt: 'She names her concern.',
    choices: [
      { id: 'pilot', label: 'Agree a small pilot', to: 'E_pilot', effects: fx(4, 1, 1, -25, 0), because: 'If a smaller start answers her concern, a pilot limits risk and gives up scope.' },
      { id: 'fullrollout', label: 'Keep the full plan', to: 'E_passed_thin', effects: fx(5, -2, 0, 0, 45), because: 'If you can absorb a failure, the full plan keeps scope and exposes every team.' },
    ],
  },
  {
    id: 'm4',
    prompt: 'A one-to-one is on offer.',
    choices: [
      { id: 'oneonone', label: 'Hold the one-to-one', to: 'E_deferred', effects: fx(3, 1, 1, -15, 10), because: 'If the one-to-one changes her view, the decision is slower and a little smaller.' },
      { id: 'wait', label: 'Wait for a quieter moment', to: 'E_stall', effects: fx(-2, 0, 3, 0, 5), because: 'If nothing is urgent, waiting costs only time; if it is, the quarter slips.' },
    ],
  },
];

const endings: Ending[] = [
  { id: 'E_escalated', title: 'Escalated', text: `Support rose at once, and the relationship took the hit. ${READ_THE_LEDGER}` },
  { id: 'E_lost', title: 'The room is lost', text: `Repeating the case moved nobody, and support is lower than when you started. ${READ_THE_LEDGER}` },
  { id: 'E_pilot', title: 'A small pilot', text: `The plan goes ahead at a smaller scope, with the risk kept small. ${READ_THE_LEDGER}` },
  { id: 'E_passed_thin', title: 'Passed, with every team exposed', text: `The full plan keeps its scope, and a failure would reach over half of them. ${READ_THE_LEDGER}` },
  { id: 'E_deferred', title: 'Settled one to one', text: `Slower and a little smaller, with the relationship intact. ${READ_THE_LEDGER}` },
  { id: 'E_stall', title: 'The decision stalls', text: `Support slipped a little and the main cost is the clock, with the quarter closer. ${READ_THE_LEDGER}` },
];

export const MEETING: Scenario = { start: 'm1', meters: METERS, nodes, endings };

/** The kind of claim each picked reason rests on. */
export const CLAIM_OF: Readonly<Record<string, ClaimKind>> = {
  push: 'view', ask: 'practice', defer: 'practice', escalate: 'view', hold: 'view', concede: 'view', pilot: 'practice', fullrollout: 'view', oneonone: 'practice', wait: 'view',
};

export const PROVENANCE_NOTE = 'an invented meeting: every effect is a made-up number about invented people';
