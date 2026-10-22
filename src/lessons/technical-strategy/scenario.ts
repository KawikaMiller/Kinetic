/**
 * Scene 2: which storage policy, and how it is enforced. Invented: every effect is a made-up number, shown with its price
 * before the choice is made. The structure (ids, effects, destinations) is pinned to the fixture in core/testing/leadScenarios.ts.
 */
import type { ClaimKind } from '../../core/provenance';
import { READ_THE_LEDGER, type Choice, type Ending, type Meter, type Node, type Scenario } from '../../core/scenario';

export const METER = { autonomy: 'autonomy', effort: 'effort', drag: 'drag' } as const;

export const METERS: readonly Meter[] = [
  { id: METER.autonomy, label: 'Autonomy', start: 6, min: 0, max: 10, bad: { below: 4 } },
  { id: METER.effort, label: 'Migration effort', start: 2, min: 0, max: 12, bad: { above: 8 } },
  { id: METER.drag, label: 'Delivery drag', start: 5, min: 0, max: 10, bad: { above: 6 } },
];

/** Effects in meter order: autonomy, effort, drag. */
const fx = (autonomy: number, effort: number, drag: number): Choice['effects'] =>
  Object.fromEntries(Object.entries({ autonomy, effort, drag }).filter(([, v]) => v !== 0));

const nodes: Node[] = [
  {
    id: 'storage',
    prompt: 'Diagnosis D1 says delivery slows because teams each make their own storage choices. Which storage policy do you adopt?',
    choices: [
      { id: 'consolidate', label: 'Consolidate on one datastore family (P2)', to: 'enforce', effects: fx(-2, 3, -2), because: 'If one team\'s storage change often blocks several others, one datastore family removes most of the blocking; teams lose choice and someone pays the migration.' },
      { id: 'team-choice', label: 'Let each team choose its storage (P4)', to: 'enforce', effects: fx(1, 0, 1), because: 'If teams\' data needs differ widely and few changes cross team lines, letting each team choose keeps them fast; operations knowledge fragments and delivery drag rises.' },
      { id: 'hybrid', label: 'Standard for core data, free for experiments with a sunset rule', to: 'enforce', effects: fx(-1, 2, -1), because: 'If only a few datastores hold the data every team depends on, standardising those and leaving the rest free captures most of the benefit; the rule needs an owner.' },
    ],
  },
  {
    id: 'enforce',
    prompt: 'How is the policy enforced?',
    choices: [
      { id: 'hard-rule', label: 'A hard rule', to: 'hardrule', effects: fx(-2, 1, -1), because: 'If a past exception caused an incident, a hard rule is cheap to run because nobody reviews anything, and easy to explain and to audit; teams with a real need are blocked.' },
      { id: 'exception', label: 'A written exception process', to: 'exception', effects: fx(1, 2, 0), because: 'If needs vary but a reviewer can decide in days, a written exception lets a team with a real need proceed and keeps the rule honest; the reviewers\' time is a cost.' },
      { id: 'advice', label: 'Advice only', to: 'advice', effects: fx(1, 0, 1), because: 'If trust is high and the cost of a mistake is small, advice costs nothing; the policy may be ignored.' },
    ],
  },
];

const endings: Ending[] = [
  { id: 'hardrule', title: 'Enforced by a hard rule', text: `The policy is easy to audit and exceptions are closed. ${READ_THE_LEDGER}` },
  { id: 'exception', title: 'Enforced through exceptions', text: `Reviewers decide each exception against a written reason. ${READ_THE_LEDGER}` },
  { id: 'advice', title: 'Left as advice', text: `Teams follow the policy when they agree with it. ${READ_THE_LEDGER}` },
];

export const STORAGE: Scenario = { start: 'storage', meters: METERS, nodes, endings };

/** The kind of claim each picked reason rests on. */
export const CLAIM_OF: Readonly<Record<string, ClaimKind>> = {
  consolidate: 'view', 'team-choice': 'view', hybrid: 'view', 'hard-rule': 'practice', exception: 'practice', advice: 'view',
};

export const PROVENANCE_NOTE = 'an invented organisation, Acme Platform: its diagnoses, policies, actions and every effect are made-up numbers';
