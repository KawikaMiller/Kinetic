/**
 * Scene 3: the vendor raises the price. Invented: every effect is a made-up number, shown with its price before the choice
 * is made. The structure (ids, effects, destinations) is pinned to the fixture in core/testing/leadScenarios.ts.
 */
import type { ClaimKind } from '../../core/provenance';
import type { Choice, Ending, Meter, Node, Scenario } from '../../core/scenario';

export const METER = { extra: 'extra', weeks: 'weeks', lockin: 'lockin' } as const;

export const METERS: readonly Meter[] = [
  { id: METER.extra, label: 'Extra cost over the next two years (thousands, invented)', start: 0, min: 0, max: 400, bad: { above: 200 } },
  { id: METER.weeks, label: 'Weeks diverted', start: 0, min: 0, max: 60, bad: { above: 20 } },
  { id: METER.lockin, label: 'Lock-in exposure', start: 6, min: 0, max: 10, bad: { above: 8 } },
];

/** Effects in meter order: extra cost, weeks, lock-in. */
const fx = (extra: number, weeks: number, lockin: number): Choice['effects'] =>
  Object.fromEntries(Object.entries({ extra, weeks, lockin }).filter(([, v]) => v !== 0));

export const PRICE_RISE_PERCENT = 40;

const nodes: Node[] = [
  {
    id: 'price',
    prompt: `Your email vendor announces a ${PRICE_RISE_PERCENT}% price rise from next year. What do you do?`,
    choices: [
      { id: 'accept', label: 'Accept the rise and stay', to: 'ready', effects: fx(32, 0, 1), because: 'If email is a commodity for you and switching costs more than the rise, staying is the cheapest move; it deepens the dependency.' },
      { id: 'renegotiate', label: 'Renegotiate a two-year price lock', to: 'ready', effects: fx(14, 3, 2), because: 'If the vendor values the account, a longer commitment can cap the rise; you are bound to them for longer.' },
      { id: 'opensource', label: 'Move to open source and self-host', to: 'ready', effects: fx(48, 16, -3), because: 'If the team can run it and volume is high, operating costs can undercut the licence; someone now owns operations and upgrades.' },
      { id: 'build', label: 'Build it in house', to: 'ready', effects: fx(180, 40, -4), because: 'If email were part of what customers buy from you, owning it could be worth the cost; for a commodity the extra cost buys no customer-visible benefit.' },
    ],
  },
  {
    id: 'ready',
    prompt: 'A year later: how ready are you to leave?',
    choices: [
      { id: 'adapter', label: 'Build a thin seam so the vendor can be swapped', to: 'adapter-end', effects: fx(20, 6, -2), because: 'If the dependency will outlive this decision, a seam makes the next change cheaper; it costs weeks now.' },
      { id: 'plan', label: 'Write and keep an exit plan with a tested data export', to: 'plan-end', effects: fx(2, 1, -1), because: 'If weeks are scarce, a written plan lowers the risk a little at almost no cost.' },
      { id: 'nothing', label: 'Revisit it at the next renewal', to: 'nothing-end', effects: fx(0, 0, 1), because: 'If the contract is short and nothing is changing, waiting costs nothing today; the exposure grows quietly.' },
    ],
  },
];

const READ_THE_LEDGER = 'Read the ledger: every path here costs something.';
const endings: Ending[] = [
  { id: 'adapter-end', title: 'A seam in place', text: `The vendor can be swapped with a bounded change, and the weeks went into the seam. ${READ_THE_LEDGER}` },
  { id: 'plan-end', title: 'An exit plan on paper', text: `The way out is written down and the export has been tested, with little else changed. ${READ_THE_LEDGER}` },
  { id: 'nothing-end', title: 'Revisit at renewal', text: `Nothing was spent on leaving, and the dependency carries on as it was. ${READ_THE_LEDGER}` },
];

export const PRICE_RISE: Scenario = { start: 'price', meters: METERS, nodes, endings };

/** The kind of claim each picked reason rests on. */
export const CLAIM_OF: Readonly<Record<string, ClaimKind>> = {
  accept: 'view', renegotiate: 'practice', opensource: 'practice', build: 'view', adapter: 'practice', plan: 'practice', nothing: 'view',
};

export const PROVENANCE_NOTE = 'an invented price rise: the vendor, the figures and every effect are made up, in thousands of an invented currency';
