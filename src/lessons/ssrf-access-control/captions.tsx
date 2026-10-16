import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { INVOICES, MODES, adminExport, ownerName, reachable, respond, SIGNED_IN, type Mode, type Role } from './invoices';
import { blastRadius, exposure, type Hardening } from './metadata';
import { DEFENCES, SCENARIOS, ZONE_WORD, run, scenarioById, unsafe, type DefenceSet, type Result, type ScenarioId } from './ssrf';

/** One line saying where the request finally went and why. */
export function outcomeText(r: Result): string {
  if (r.status === 'blocked') return `blocked (${DEFENCES.find((d) => d.id === r.blockedBy)!.label})`;
  if (r.status === 'public') return 'reached a public page';
  if (r.status === 'internal') return `reached ${ZONE_WORD.internal}`;
  if (r.credential) return `reached the metadata service and a fake credential came back (${r.credential.scope} role)`;
  return r.refused ? 'reached the metadata service, which refused' : 'reached the metadata service';
}

/** How many of the six scenarios end somewhere that is not public under these defences. */
export const unsafeCount = (d: DefenceSet): number => SCENARIOS.filter((s) => unsafe(run(s, d))).length;

/** Scene 1: the chosen scenario's outcome, and how the whole set of six fares under the same defences. */
export function fetchCaption(id: ScenarioId, d: DefenceSet): ReactNode {
  const s = scenarioById(id);
  const r = run(s, d);
  const n = unsafeCount(d);
  return (
    <>
      {s.title}: the preview <b>{outcomeText(r)}</b>.{' '}
      {n === 0 ? <>Under these defences none of the {SCENARIOS.length} scenarios reaches an internal or metadata service.</> : <>Under these defences {n} of the {SCENARIOS.length} scenarios still {n === 1 ? 'reaches' : 'reach'} an internal or metadata service.</>}
    </>
  );
}

/** Scene 2: what a reach of the metadata service gets under the chosen hardening. */
export function metadataCaption(h: Hardening): ReactNode {
  const e = exposure(h);
  return e.kind === 'refused' ? (
    <>The request is refused {e.by === 'token' ? 'because it carries no session token' : 'because the reply cannot cross the extra network hop'}: a leaked credential could do {blastRadius(h)} things.</>
  ) : (
    <>The request gets a fake {e.scope} credential. It could {e.can.join(', ')}: {plural(blastRadius(h), 'thing')}.</>
  );
}

/** Scene 3: one request to the invoices API and what the mode lets one signed-in user reach. */
export function invoiceCaption(mode: Mode, key: number | string, role: Role, roleCheck: boolean): ReactNode {
  const r = respond(mode, SIGNED_IN.id, key);
  const label = MODES.find((m) => m.id === mode)!.label.toLowerCase();
  const ex = adminExport(role, roleCheck);
  return (
    <>
      With {label}, {SIGNED_IN.name} {r.status === 200 ? <>gets {r.invoice ? `${ownerName(r.invoice.ownerId)}'s invoice ${r.invoice.id}` : 'an invoice'}</> : <>gets a plain "not found"</>}. In this mode one signed-in user can reach {plural(reachable(mode, SIGNED_IN.id), 'invoice')} of other people (of {INVOICES.filter((i) => i.ownerId !== SIGNED_IN.id).length}). The admin export {ex.status === 200 ? `returns ${plural(ex.rows, 'row')}` : 'is refused with 403'}.
    </>
  );
}
