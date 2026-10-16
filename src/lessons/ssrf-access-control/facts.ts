/** Numbers the try-this, key ideas and quiz quote, read off the model at the default state. */
import { unsafeCount } from './captions';
import { INVOICES, KNOWN_FOREIGN, SIGNED_IN, respond, reachable } from './invoices';
import { blastRadius, exposure } from './metadata';
import { OPENING } from './opening';
import { DEFENCES, SCENARIOS, defenceSet, run, scenarioById, unsafe, type DefenceId, type ScenarioId } from './ssrf';
import { adminExport } from './invoices';

const deny = defenceSet('denyList');
const trio = defenceSet('allowList', 'pin', 'recheck');
const outcome = (id: ScenarioId, ...on: DefenceId[]) => run(scenarioById(id), defenceSet(...on));
const foreign = INVOICES.filter((i) => i.ownerId !== SIGNED_IN.id);
const metaH = OPENING.metadata;

export const FACTS = {
  scenarios: SCENARIOS.length,
  defences: DEFENCES.length,
  defaultStatus: run(scenarioById(OPENING.fetch.scenario), OPENING.fetch.defences).status,
  resolvesNone: outcome('resolves-internal').status,
  resolvesDenyBlockedBy: outcome('resolves-internal', 'denyList').blockedBy,
  redirectDeny: outcome('redirect', 'denyList').status,
  redirectDenyRecheck: outcome('redirect', 'denyList', 'recheck').status,
  unsafeNone: unsafeCount(OPENING.fetch.defences),
  unsafeDeny: unsafeCount(deny),
  unsafeTrio: unsafeCount(trio),
  publicWithTrio: run(scenarioById('public'), trio).status,
  denyDefeatedBy: SCENARIOS.filter((s) => unsafe(run(s, deny))).map((s) => s.id),
  allowOnlyDefeatedBy: SCENARIOS.filter((s) => unsafe(run(s, defenceSet('allowList')))).map((s) => s.id),
  broad: blastRadius(metaH),
  narrow: blastRadius({ ...metaH, leastPrivilege: true }),
  tokenRefused: blastRadius({ ...metaH, token: true }),
  tokenKind: exposure({ ...metaH, token: true }).kind,
  others: foreign.length,
  noneReach: reachable('none', SIGNED_IN.id),
  ownerReach: reachable('owner', SIGNED_IN.id),
  unguessableReach: reachable('unguessable', SIGNED_IN.id),
  stepTo: INVOICES[2],
  stepToNone: respond('none', SIGNED_IN.id, INVOICES[2].id),
  stepToOwner: respond('owner', SIGNED_IN.id, INVOICES[2].id),
  linkIdWorks: respond('unguessable', SIGNED_IN.id, KNOWN_FOREIGN[0].token).status,
  exportNoCheck: adminExport('member', false).status,
  exportCheck: adminExport('member', true).status,
};
