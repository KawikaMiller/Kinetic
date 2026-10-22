/**
 * Scene 2: what to peel off first. Invented: every effect is a made-up number, shown with its price before the choice is
 * made. The structure (ids, effects, destinations) is pinned to the fixture in core/testing/leadScenarios.ts.
 */
import type { ClaimKind } from '../../core/provenance';
import type { Choice, Ending, Meter, Node, Scenario } from '../../core/scenario';
import { routeOf, type RouteId } from './model';

const traffic = (id: RouteId): number => routeOf(id).traffic;
/** The long tail: reports and admin. */
export const TAIL_TRAFFIC = traffic('reports') + traffic('admin');

export const METER = { incidents: 'incidents', weeks: 'weeks', strain: 'strain', surprises: 'surprises' } as const;

/** "Unknowns still ahead" can only fall, so its red edge sits above its maximum: it cannot go red, and the stage says so. */
export const METERS: readonly Meter[] = [
  { id: METER.incidents, label: 'Customer-visible incidents', start: 0, min: 0, max: 10, bad: { above: 3 } },
  { id: METER.weeks, label: 'Weeks spent', start: 0, min: 0, max: 60, bad: { above: 26 } },
  { id: METER.strain, label: 'Team strain from running two systems', start: 2, min: 0, max: 10, bad: { above: 6 } },
  { id: METER.surprises, label: 'Unknowns still ahead', start: 8, min: 0, max: 10, bad: { above: 10 } },
];

/** Effects in meter order: incidents, weeks, strain, surprises. */
const fx = (incidents: number, weeks: number, strain: number, surprises: number): Choice['effects'] =>
  Object.fromEntries(Object.entries({ incidents, weeks, strain, surprises }).filter(([, v]) => v !== 0));

const nodes: Node[] = [
  {
    id: 'facade',
    prompt: 'The facade is up and all eight routes still run on the monolith. Which slice goes first?',
    choices: [
      { id: 'a1', label: `Peel search: read-only, ${traffic('search')}% of traffic`, to: 'data', effects: fx(0, 6, 1, -1), because: 'If the team is new to the facade and a wrong answer must be cheap to switch off, a read-only route limits the damage; it also teaches the least about writes.' },
      { id: 'a2', label: `Peel checkout: ${traffic('checkout')}% of traffic, most revenue, writes data`, to: 'data', effects: fx(2, 10, 2, -4), because: 'If the sponsor needs the hardest unknown surfaced early, the route most coupled to shared tables retires four unknowns at once, at the price of the riskiest first slice.' },
      { id: 'a3', label: `Peel catalog: ${traffic('catalog')}% of traffic, ${routeOf('catalog').coupling} shared tables`, to: 'data', effects: fx(1, 10, 1, -2), because: 'If a visible win on a large share of traffic is needed to keep funding, the catalog moves the most traffic of any low-write route; it still touches shared tables.' },
      { id: 'a4', label: 'Freeze features and cut everything over in one weekend', to: 'bigbang', effects: fx(6, 24, 3, -8), because: 'If the monolith is small and the team can stop shipping, one cutover avoids running two systems; it removes every early warning.' },
    ],
  },
  {
    id: 'data',
    prompt: 'The next slice writes data. How does the data move?',
    choices: [
      { id: 'b1', label: 'Dual-write to both stores and reconcile nightly', to: 'tail', effects: fx(1, 8, 2, -2), because: 'If the monolith must stay a safe fallback, writing both ways keeps rollback possible; it doubles the write path to maintain.' },
      { id: 'b2', label: 'Cut the data over once, with no way back', to: 'tail', effects: fx(3, 4, 1, -2), because: 'If the old store is being retired anyway and the data model is simple, one cutover is quickest; a defect found afterwards cannot be rolled back.' },
      { id: 'b3', label: 'Move reads first and keep writes on the monolith', to: 'tail', effects: fx(0, 4, 2, -1), because: 'If the writes are few and the team wants no data risk, reads first is safest; the monolith stays the owner and strain stays high.' },
    ],
  },
  {
    id: 'tail',
    prompt: `The long tail is left: reports, admin and batch jobs, ${TAIL_TRAFFIC}% of traffic, with the weakest tests.`,
    choices: [
      { id: 'c1', label: 'Peel the tail route by route to the end', to: 'tailPeeled', effects: fx(1, 14, -1, -2), because: 'If the tail routes have owners and can be tested, finishing is worth the weeks; strain falls as the monolith shrinks.' },
      { id: 'c2', label: 'Freeze the tail on the monolith and run two systems', to: 'twoSystems', effects: fx(0, 4, 2, 0), because: 'If the tail changes rarely and retirement has no business case, leaving it costs little a month; the strain never goes away.' },
      { id: 'c3', label: 'Rewrite the whole tail at once', to: 'tailRewrite', effects: fx(2, 10, 0, -2), because: 'If one team can own the whole tail for a quarter, one push beats thirty small slices; a defect in a rarely used route may surface late.' },
    ],
  },
];

const READ_THE_LEDGER = 'Read the ledger: every path here costs something.';
const endings: Ending[] = [
  { id: 'bigbang', title: 'One weekend, one cutover', text: `The monolith is gone and no early warning came before it. ${READ_THE_LEDGER}` },
  { id: 'tailPeeled', title: 'Monolith retired, slowly', text: `Every route moved and the old system was switched off after the tail was peeled. ${READ_THE_LEDGER}` },
  { id: 'twoSystems', title: 'Two systems, for good', text: `The tail stays on the monolith and both systems keep running. ${READ_THE_LEDGER}` },
  { id: 'tailRewrite', title: 'The tail in one push', text: `One team rewrote the tail in a quarter. ${READ_THE_LEDGER}` },
];

export const MIGRATION: Scenario = { start: 'facade', meters: METERS, nodes, endings };

/** The kind of claim each picked reason rests on (view where it is contested, practice where many teams do it). */
export const CLAIM_OF: Readonly<Record<string, ClaimKind>> = {
  a1: 'view', a2: 'view', a3: 'view', a4: 'view', b1: 'practice', b2: 'view', b3: 'practice', c1: 'view', c2: 'view', c3: 'view',
};

export const PROVENANCE_NOTE = 'an invented migration: the routes, traffic shares and every effect are made-up numbers';
