/**
 * Scene 4: pick the queue service for an internal tool, ten days of slack before the review. Invented: every effect is a made-up number,
 * shown with its price before the choice is made. The structure (ids, effects, destinations) is pinned to the fixture in
 * core/testing/leadScenarios.ts.
 */
import type { ClaimKind } from '../../core/provenance';
import type { Choice, Ending, Meter, Node, Scenario } from '../../core/scenario';

export const METER = { slack: 'slack', regret: 'regret', undo: 'undo', upkeep: 'upkeep' } as const;

export const METERS: readonly Meter[] = [
  { id: METER.slack, label: 'Slack before the review (days)', start: 10, min: 0, max: 20, bad: { below: 4 } },
  { id: METER.regret, label: 'Regret: expected cost of being wrong (k$, invented)', start: 20, min: 0, max: 100, bad: { above: 60 } },
  { id: METER.undo, label: 'Cost to reverse later (k$, invented)', start: 10, min: 0, max: 100, bad: { above: 50 } },
  { id: METER.upkeep, label: 'Upkeep (hours a week)', start: 0, min: 0, max: 20, bad: { above: 6 } },
];

/** Effects in meter order: slack, regret, undo, upkeep. */
const fx = (slack: number, regret: number, undo: number, upkeep: number): Choice['effects'] =>
  Object.fromEntries(Object.entries({ slack, regret, undo, upkeep }).filter(([, v]) => v !== 0));

const nodes: Node[] = [
  {
    id: 'n1',
    prompt: 'Pick the queue service for an internal tool; you have ten days of slack before the review.',
    choices: [
      { id: 'r1', label: 'Decide now, take the managed default', to: 'n2', effects: fx(-1, 10, 5, 0), because: 'If the tool stays internal and small, the default is cheap to change; if others start to depend on it, it is not.' },
      { id: 'r2', label: 'Decide now, behind a thin interface', to: 'n3', effects: fx(-2, 5, -3, 4), because: 'If a second vendor may ever be needed, the interface lowers the cost of switching, and costs hours every week to keep.' },
      { id: 'r3', label: 'Run a three-week bake-off', to: 'n4', effects: fx(-5, -8, 0, 0), because: 'If being wrong is costly and the answer is unclear, evidence lowers regret; if the tool is a side project it burns slack for little.' },
    ],
  },
  {
    id: 'n2',
    prompt: 'Other teams have started to depend on the default.',
    choices: [
      { id: 'migrate', label: 'Move the other teams off it now', to: 'E_migrated', effects: fx(-3, 0, -10, 0), because: 'If six teams already use it, migrating early is cheaper than later and costs slack now.' },
      { id: 'freeze', label: 'Live with it', to: 'E_frozen', effects: fx(0, 20, 15, 0), because: 'If the default is good enough, freezing saves work and raises the price of a later change.' },
    ],
  },
  {
    id: 'n3',
    prompt: 'The thin interface is in. What next?',
    choices: [
      { id: 'extend', label: 'Cover a second vendor in the interface', to: 'E_wrapped', effects: fx(-2, 0, -3, 2), because: 'If switching is plausible within a year, a second adapter makes it real.' },
      { id: 'asis', label: 'Leave it as it is', to: 'E_shipfast', effects: fx(0, 4, 0, 0), because: 'If the interface already covers the likely change, leaving it is cheapest this month.' },
    ],
  },
  {
    id: 'n4',
    prompt: 'The bake-off has run. The review is close.',
    choices: [
      { id: 'ship', label: 'Choose the winner', to: 'E_bakedoff', effects: fx(-2, 2, 0, 0), because: 'If the bake-off showed a clear winner, ship; the slack is already spent.' },
      { id: 'more', label: 'Extend the bake-off a week', to: 'E_slow', effects: fx(-3, -4, 0, 0), because: 'If the top two are close and wrong is costly, a week more lowers regret and spends slack that is already short.' },
    ],
  },
];

const READ_THE_LEDGER = 'Read the ledger: every path here costs something.';
const endings: Ending[] = [
  { id: 'E_migrated', title: 'Migrated early', text: `The other teams moved before more of them came to depend on it, and the slack went into the move. ${READ_THE_LEDGER}` },
  { id: 'E_frozen', title: 'Frozen as it is', text: `Nothing more was spent, and the price of changing later went up. ${READ_THE_LEDGER}` },
  { id: 'E_wrapped', title: 'Two vendors behind one interface', text: `Switching is real now, and somebody keeps two adapters alive every week. ${READ_THE_LEDGER}` },
  { id: 'E_shipfast', title: 'Shipped behind a thin interface', text: `Fast this month, with the interface as the only cover. ${READ_THE_LEDGER}` },
  { id: 'E_bakedoff', title: 'Winner chosen', text: `The decision rests on evidence, and the review is nearly on top of you. ${READ_THE_LEDGER}` },
  { id: 'E_slow', title: 'A week more of evidence', text: `Regret is the lowest of the six, and almost no slack is left. ${READ_THE_LEDGER}` },
];

export const QUEUE_SERVICE: Scenario = { start: 'n1', meters: METERS, nodes, endings };

/** The kind of claim each picked reason rests on. */
export const CLAIM_OF: Readonly<Record<string, ClaimKind>> = {
  r1: 'view', r2: 'practice', r3: 'practice', migrate: 'view', freeze: 'view', extend: 'practice', asis: 'view', ship: 'view', more: 'view',
};

export const PROVENANCE_NOTE = 'an invented queue-service choice: every effect is a made-up number, in invented thousands of dollars';
