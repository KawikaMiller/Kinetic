import { plural } from '../../core/format';
import { interleavingName, MAX_LINES, START_LINES, tally, type Design, type Run } from './aggregate';
import { statsOf, type MapState } from './contextMap';
import { ATTRIBUTES, TEAMS, blastRadius, teamsTouched, widelyShared, type Request } from './monolith';

/** Captions as plain text, computed from the same numbers the stats show. */

const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const teamLabel = (id: string) => TEAMS.find((t) => t.id === id)!.label;

export function monolithCaption(r: Request): string {
  const n = blastRadius(r);
  return `${r.label}: it touches ${plural(r.attributes.length, 'attribute')} of one Customer with ${ATTRIBUTES.length}, and ${plural(n, 'team')} of ${TEAMS.length} must change their code (${list(teamsTouched(r).map(teamLabel))}). ${plural(widelyShared().length, 'attribute')} here ${widelyShared().length === 1 ? 'is' : 'are'} used by three or more teams.`;
}

export function mapCaption(state: MapState): string {
  const s = statsOf(state);
  const customer = state.split
    ? 'Customer is split into Payer, Recipient and Requester, joined only by the customer id.'
    : 'Customer is still one model that three contexts each read differently.';
  if (s.placed === 0) return `No edge has both ends placed yet: select a concept and press 1, 2 or 3 to put it in a context. ${customer}`;
  const crossing = s.crossing === 0 ? 'no edge crosses a boundary' : `${plural(s.crossing, 'edge')} cross${s.crossing === 1 ? 'es' : ''} a boundary (${s.raw} raw, ${s.translated} translated)`;
  return `${s.inside} of ${s.placed} placed edges stay inside a context (${Math.round((s.cohesion ?? 0) * 100)}% cohesion) and ${crossing}. ${customer}`;
}

export function runCaption(r: Run): string {
  const order = interleavingName(r.events.map((e) => e.step));
  const verdict = r.violated ? `the order ends with ${r.finalLines} lines, over the limit of ${MAX_LINES}` : `the order ends with ${r.finalLines} lines, within the limit of ${MAX_LINES}`;
  return `${r.design === 'records' ? 'Independent records' : 'Order as an aggregate'}, ${order}: ${verdict}.`;
}

export function summaryCaption(design: Design): string {
  const t = tally(design);
  return `${design === 'records' ? 'Independent records' : 'Order as an aggregate'}: ${t.violations} of ${t.runs.length} interleavings break the limit of ${MAX_LINES} lines, starting from ${START_LINES}.`;
}

export const START_RUN_NOTE = `The order holds ${START_LINES} lines and may hold ${MAX_LINES}. Two actors will each read it, check, and add one line.`;
