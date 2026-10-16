/**
 * "One sprint, three open threats": an invented branching story. The meters move by effects generated from the
 * threat table below, so the numbers on screen are the table's likelihood x impact, never typed twice.
 */
import type { Choice, Ending, Meter, Node, Scenario } from '../../core/scenario';

/** Days of work in the sprint. Effort beyond it is schedule slip. */
export const SPRINT_DAYS = 5;

export interface SprintThreat {
  id: string;
  title: string;
  /** Invented 1-5 scales. */
  likelihood: number;
  impact: number;
  /** Days a full fix takes. */
  fixDays: number;
  /** Days the cheap partial fix takes: it lowers the likelihood by one step. */
  partialDays: number;
}

export const SPRINT_THREATS: readonly SprintThreat[] = [
  { id: 'transit', title: 'Orders can be read between the browser and the web app', likelihood: 4, impact: 5, fixDays: 3, partialDays: 1 },
  { id: 'log', title: 'Audit log entries can be edited after the fact', likelihood: 3, impact: 3, fixDays: 2, partialDays: 1 },
  { id: 'admin', title: 'The admin page is open to every staff login', likelihood: 2, impact: 4, fixDays: 2, partialDays: 1 },
];

/** What the partner integration adds once someone looks at it. */
export const NEW_THREAT = { likelihood: 2, impact: 3 };

export const riskOf = (t: { likelihood: number; impact: number }) => t.likelihood * t.impact;

export const START_RISK = SPRINT_THREATS.reduce((sum, t) => sum + riskOf(t), 0);
export const MAX_EFFORT = SPRINT_THREATS.reduce((sum, t) => sum + t.fixDays, 0) + 1;

export const METER = { risk: 'risk', effort: 'effort', ownerless: 'ownerless', crossings: 'crossings' } as const;

/** The meters, with the edge beyond which each reads red. Slip is derived from effort (see `slipOf`), not a fourth lever. */
export const METERS: readonly Meter[] = [
  { id: METER.risk, label: 'Known residual risk', start: START_RISK, min: 0, max: START_RISK + riskOf(NEW_THREAT), bad: { above: 20 }, unit: ' pts' },
  { id: METER.effort, label: 'Effort', start: 0, min: 0, max: MAX_EFFORT, bad: { above: SPRINT_DAYS }, unit: ' days' },
  { id: METER.ownerless, label: 'Threats with no owner', start: SPRINT_THREATS.length, min: 0, max: SPRINT_THREATS.length, bad: { above: 0 } },
  { id: METER.crossings, label: 'Unreviewed boundary crossings', start: 0, min: 0, max: 1, bad: { above: 0 } },
];

export const slipOf = (effort: number) => Math.max(0, effort - SPRINT_DAYS);

export const threatNodeId = (t: SprintThreat) => `threat-${t.id}`;
const NEXT = [...SPRINT_THREATS.map(threatNodeId), 'partner'];

function choicesFor(t: SprintThreat, to: string): Choice[] {
  const reduction = riskOf(t);
  const partial = t.impact;
  return [
    {
      id: `${t.id}-fix`, label: `Fix it properly (${t.fixDays} days)`, to,
      effects: { [METER.risk]: -reduction, [METER.effort]: t.fixDays, [METER.ownerless]: -1 },
      because: `Removes the whole ${t.likelihood} x ${t.impact} = ${reduction} points, and it is the slowest option.`,
    },
    {
      id: `${t.id}-partial`, label: `A cheap partial fix (${t.partialDays} day)`, to,
      effects: { [METER.risk]: -partial, [METER.effort]: t.partialDays, [METER.ownerless]: -1 },
      because: `Lowers the likelihood by one step, so ${t.impact} points go and ${reduction - partial} remain, and the remainder is written down with an owner.`,
    },
    {
      id: `${t.id}-accept`, label: 'Accept the risk, with a written sign-off', to,
      effects: { [METER.ownerless]: -1 },
      because: `The ${reduction} points stay, but a named person decided to carry them and wrote down why: an accepted risk is a decision, not a gap.`,
    },
    {
      id: `${t.id}-ignore`, label: 'Do nothing', to,
      because: `The ${reduction} points stay and nobody owns them. Accepting costs no more days than doing nothing, so doing nothing saves nothing: the only thing it changes on the meters is that nobody owns the risk.`,
    },
  ];
}

const threatNodes: Node[] = SPRINT_THREATS.map((t, i) => ({
  id: threatNodeId(t),
  prompt: `${t.title}. On the invented scale it is likelihood ${t.likelihood} x impact ${t.impact} = ${riskOf(t)} points. What do you do with it this sprint?`,
  choices: choicesFor(t, NEXT[i + 1]),
}));

const partnerNode: Node = {
  id: 'partner',
  prompt: 'Late in the sprint a partner integration is added. It is a new trust boundary that the diagram does not show. What now?',
  choices: [
    {
      id: 'partner-rerun', label: 'Re-run the diagram now (1 day)', to: 'rerun',
      effects: { [METER.risk]: riskOf(NEW_THREAT), [METER.effort]: 1 },
      because: `Looking finds a ${NEW_THREAT.likelihood} x ${NEW_THREAT.impact} = ${riskOf(NEW_THREAT)} point threat, so the known number goes up: the risk was already there, now it is visible.`,
    },
    {
      id: 'partner-defer', label: 'Defer, with a written note', to: 'deferred',
      effects: { [METER.crossings]: 1 },
      because: 'Known risk stays lower only because nobody has looked, so the new crossing is counted as unreviewed. A note with an owner and a date at least makes the gap visible.',
    },
    {
      id: 'partner-skip', label: 'Skip it', to: 'skipped',
      effects: { [METER.crossings]: 1 },
      because: 'The same unreviewed crossing, with nothing written down. The meter that reads best here is the one that knows least.',
    },
  ],
};

const ENDINGS: Ending[] = [
  { id: 'rerun', title: 'The diagram was re-run', text: 'The new crossing has been looked at, so its threats are on the list. The known risk went up and the unknown part went down.' },
  { id: 'deferred', title: 'The re-run is deferred', text: 'The new crossing is an open question with a name and a date on it. Known risk looks lower than it is until someone looks.' },
  { id: 'skipped', title: 'The new crossing was skipped', text: 'Nothing was written down, so the next person to look starts from zero. Every number on the page is a number about what was looked at.' },
];

export const SPRINT: Scenario = { start: threatNodeId(SPRINT_THREATS[0]), meters: METERS, nodes: [...threatNodes, partnerNode], endings: ENDINGS };

/** The note on the story's "invented" chip. */
export const PROVENANCE_NOTE = 'an invented sprint: the threats, the 1-5 scales and every number are made up to show a trade-off';
