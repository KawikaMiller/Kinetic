/**
 * The six lead-lesson scenarios of docs/tier4-specs (part1: strangler-fig-migrations, build-vs-buy,
 * technical-strategy; part2: reversible-decisions, influence-without-authority, hiring-interviewing), encoded
 * as data so K4-9's `validateScenario(s, { tradeoffs: true })` is proven against the structures the lessons will
 * ship. Each lesson's own scenario replaces its fixture when it is built; until then these are the gate.
 * Test-only: never import this from app code. All numbers are invented, as in the specs.
 */
import type { Choice, Meter, Scenario } from '../scenario';

type Tuple = readonly number[];

/** Builds choices whose effects are written as a tuple in meter order (zeros are dropped). The `because` is a placeholder: these fixtures test the shape, not the prose. */
function chooser(meters: readonly Meter[]) {
  return (id: string, to: string, effects: Tuple): Choice => {
    const entries = meters.flatMap((m, i) => (effects[i] ? [[m.id, effects[i]] as const] : []));
    return { id, label: id, to, effects: Object.fromEntries(entries), because: 'If the condition holds, this is cheaper; the price is stated.' };
  };
}

const ending = (id: string) => ({ id, title: id, text: `The ${id} ending.` });

// ── strangler-fig-migrations (part1, T4-B8) ──────────────────────────────

const STRANGLER_METERS: readonly Meter[] = [
  { id: 'incidents', label: 'Customer-visible incidents', start: 0, min: 0, max: 10, bad: { above: 3 } },
  { id: 'weeks', label: 'Weeks spent', start: 0, min: 0, max: 60, bad: { above: 26 } },
  { id: 'strain', label: 'Team strain from running two systems', start: 2, min: 0, max: 10, bad: { above: 6 } },
  // Lower is better and it can only fall, so the red edge sits above its maximum: it can never be reached.
  { id: 'surprises', label: 'Unknowns still ahead', start: 8, min: 0, max: 10, bad: { above: 10 } },
];
const sf = chooser(STRANGLER_METERS);

export const STRANGLER: Scenario = {
  start: 'facade',
  meters: STRANGLER_METERS,
  nodes: [
    { id: 'facade', prompt: 'The facade is up: which slice first?', choices: [
      sf('a1', 'data', [0, 6, 1, -1]), sf('a2', 'data', [2, 10, 2, -4]), sf('a3', 'data', [1, 10, 1, -2]), sf('a4', 'bigbang', [6, 24, 3, -8]),
    ] },
    { id: 'data', prompt: 'The next slice writes data.', choices: [
      sf('b1', 'tail', [1, 8, 2, -2]), sf('b2', 'tail', [3, 4, 1, -2]), sf('b3', 'tail', [0, 4, 2, -1]),
    ] },
    { id: 'tail', prompt: 'The long tail: reports, admin, batch jobs.', choices: [
      sf('c1', 'tailPeeled', [1, 14, -1, -2]), sf('c2', 'twoSystems', [0, 4, 2, 0]), sf('c3', 'tailRewrite', [2, 10, 0, -2]),
    ] },
  ],
  endings: ['bigbang', 'tailPeeled', 'twoSystems', 'tailRewrite'].map(ending),
};

// ── build-vs-buy (part1, T4-B8) ──────────────────────────────────────────

const BUY_METERS: readonly Meter[] = [
  { id: 'extra', label: 'Extra cost over two years', start: 0, min: 0, max: 400, bad: { above: 200 } },
  { id: 'weeks', label: 'Weeks diverted', start: 0, min: 0, max: 60, bad: { above: 20 } },
  { id: 'lockin', label: 'Lock-in exposure', start: 6, min: 0, max: 10, bad: { above: 8 } },
];
const bb = chooser(BUY_METERS);

export const BUILD_VS_BUY: Scenario = {
  start: 'price',
  meters: BUY_METERS,
  nodes: [
    { id: 'price', prompt: 'Your email vendor announces a 40% price rise from next year.', choices: [
      bb('accept', 'ready', [32, 0, 1]), bb('renegotiate', 'ready', [14, 3, 2]), bb('opensource', 'ready', [48, 16, -3]), bb('build', 'ready', [180, 40, -4]),
    ] },
    { id: 'ready', prompt: 'A year later: how ready are you to leave?', choices: [
      bb('adapter', 'adapter-end', [20, 6, -2]), bb('plan', 'plan-end', [2, 1, -1]), bb('nothing', 'nothing-end', [0, 0, 1]),
    ] },
  ],
  endings: ['adapter-end', 'plan-end', 'nothing-end'].map(ending),
};

// ── technical-strategy (part1, T4-B8) ────────────────────────────────────

const STRATEGY_METERS: readonly Meter[] = [
  { id: 'autonomy', label: 'Autonomy', start: 6, min: 0, max: 10, bad: { below: 4 } },
  { id: 'effort', label: 'Migration effort', start: 2, min: 0, max: 12, bad: { above: 8 } },
  { id: 'drag', label: 'Delivery drag', start: 5, min: 0, max: 10, bad: { above: 6 } },
];
const ts = chooser(STRATEGY_METERS);

export const TECHNICAL_STRATEGY: Scenario = {
  start: 'storage',
  meters: STRATEGY_METERS,
  nodes: [
    { id: 'storage', prompt: 'Which storage policy?', choices: [
      ts('consolidate', 'enforce', [-2, 3, -2]), ts('team-choice', 'enforce', [1, 0, 1]), ts('hybrid', 'enforce', [-1, 2, -1]),
    ] },
    { id: 'enforce', prompt: 'How is it enforced?', choices: [
      ts('hard-rule', 'hardrule', [-2, 2, -1]), ts('exception', 'exception', [0, 2, 0]), ts('advice', 'advice', [1, 0, 1]),
    ] },
  ],
  endings: ['hardrule', 'exception', 'advice'].map(ending),
};

// ── reversible-decisions (part2, T4-B9) ──────────────────────────────────

const DOOR_METERS: readonly Meter[] = [
  { id: 'slack', label: 'Slack (days)', start: 10, min: 0, max: 20, bad: { below: 4 } },
  { id: 'regret', label: 'Regret (k$, invented)', start: 20, min: 0, max: 100, bad: { above: 60 } },
  { id: 'undo', label: 'Cost to reverse later (k$, invented)', start: 10, min: 0, max: 100, bad: { above: 50 } },
  { id: 'upkeep', label: 'Upkeep (hours a week)', start: 0, min: 0, max: 20, bad: { above: 6 } },
];
const rd = chooser(DOOR_METERS);

export const REVERSIBLE_DECISIONS: Scenario = {
  start: 'n1',
  meters: DOOR_METERS,
  nodes: [
    { id: 'n1', prompt: 'Pick the queue service for an internal tool; review is in two days.', choices: [
      rd('r1', 'n2', [-1, 10, 5, 0]), rd('r2', 'n3', [-2, 5, -3, 4]), rd('r3', 'n4', [-5, -8, 0, 0]),
    ] },
    { id: 'n2', prompt: 'Others now depend on the default.', choices: [rd('migrate', 'E_migrated', [-3, 0, -10, 0]), rd('freeze', 'E_frozen', [0, 20, 15, 0])] },
    { id: 'n3', prompt: 'The thin interface is in.', choices: [rd('extend', 'E_wrapped', [-2, 0, -3, 2]), rd('asis', 'E_shipfast', [0, 4, 0, 0])] },
    { id: 'n4', prompt: 'The bake-off is done.', choices: [rd('ship', 'E_bakedoff', [-2, 2, 0, 0]), rd('more', 'E_slow', [-3, -4, 0, 0])] },
  ],
  endings: ['E_migrated', 'E_frozen', 'E_wrapped', 'E_shipfast', 'E_bakedoff', 'E_slow'].map(ending),
};

// ── influence-without-authority (part2, T4-B9) ───────────────────────────

const INFLUENCE_METERS: readonly Meter[] = [
  { id: 'support', label: 'Weighted support', start: 12, min: 0, max: 30, bad: { below: 8 } },
  { id: 'trust', label: 'Trust', start: 6, min: 0, max: 10, bad: { below: 3 } },
  { id: 'weeks', label: 'Weeks to a decision', start: 0, min: 0, max: 12, bad: { above: 6 } },
  { id: 'scope', label: 'Scope kept (%)', start: 100, min: 0, max: 100, bad: { below: 60 } },
  { id: 'risk', label: 'Share of teams exposed (%)', start: 10, min: 0, max: 100, bad: { above: 50 } },
];
const iw = chooser(INFLUENCE_METERS);

export const INFLUENCE: Scenario = {
  start: 'm1',
  meters: INFLUENCE_METERS,
  nodes: [
    { id: 'm1', prompt: 'Dana objects live: "we are not ready".', choices: [
      iw('push', 'm2', [-2, -2, 0, 0, 0]), iw('ask', 'm3', [1, 1, 2, -10, 0]), iw('defer', 'm4', [0, 0, 3, 0, 0]), iw('escalate', 'E_escalated', [3, -4, 1, 0, 15]),
    ] },
    { id: 'm2', prompt: 'The data did not land.', choices: [iw('hold', 'E_lost', [-3, -1, 1, 0, 0]), iw('concede', 'm3', [3, 1, 2, -20, 0])] },
    { id: 'm3', prompt: 'She names her concern.', choices: [iw('pilot', 'E_pilot', [4, 1, 1, -25, 0]), iw('fullrollout', 'E_passed_thin', [5, -2, 0, 0, 45])] },
    { id: 'm4', prompt: 'A one-to-one is on offer.', choices: [iw('oneonone', 'E_deferred', [3, 1, 1, -15, 10]), iw('wait', 'E_stall', [-2, 0, 3, 0, 5])] },
  ],
  endings: ['E_escalated', 'E_lost', 'E_pilot', 'E_passed_thin', 'E_deferred', 'E_stall'].map(ending),
};

// ── hiring-interviewing (part2, T4-B9) ───────────────────────────────────

const HIRING_METERS: readonly Meter[] = [
  { id: 'regret', label: 'Regret (k$, invented)', start: 15, min: 0, max: 60, bad: { above: 35 } },
  { id: 'days', label: 'Days to a decision', start: 0, min: 0, max: 30, bad: { above: 10 } },
  { id: 'goodwill', label: 'Panel goodwill', start: 7, min: 0, max: 10, bad: { below: 3 } },
];
const hi = chooser(HIRING_METERS);

export const HIRING: Scenario = {
  start: 'h1',
  meters: HIRING_METERS,
  nodes: [
    { id: 'h1', prompt: 'One strong no, two lukewarm yes, one enthusiastic yes.', choices: [
      hi('avg', 'E_hire_now', [10, 0, 0]), hi('veto', 'E_nohire_now', [12, 1, -2]), hi('evidence', 'h2', [-2, 1, -3]),
      hi('followup', 'h3', [-3, 6, 0]), hi('senior', 'E_seniority', [6, 0, -3]),
    ] },
    { id: 'h2', prompt: 'The dissenter gives evidence.', choices: [hi('decide_evidence', 'E_evidence', [-1, 0, -1]), hi('still_followup', 'h3', [-1, 5, 0])] },
    { id: 'h3', prompt: 'A structured follow-up interview.', choices: [hi('hire_after', 'E_followup', [-3, 2, 0])] },
  ],
  endings: ['E_hire_now', 'E_nohire_now', 'E_evidence', 'E_followup', 'E_seniority'].map(ending),
};

/** The fixtures by lesson id, in spec order. */
export const LEAD_SCENARIOS: Readonly<Record<string, Scenario>> = {
  'strangler-fig-migrations': STRANGLER,
  'build-vs-buy': BUILD_VS_BUY,
  'technical-strategy': TECHNICAL_STRATEGY,
  'reversible-decisions': REVERSIBLE_DECISIONS,
  'influence-without-authority': INFLUENCE,
  'hiring-interviewing': HIRING,
};
