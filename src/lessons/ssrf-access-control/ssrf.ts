/**
 * The simulated link-preview server: scenarios, defences and the pipeline that runs them (parse, check, resolve,
 * connect, redirect) over a fictional DNS and redirect table. Nothing here touches a network or parses a URL.
 * Hosts are fictional; the only addresses named anywhere are documentation or RFC 1918 ranges, in the diagram.
 */
import { fakeSecret } from '../../core/fakeSecret';

/** Where a connection lands. `metadata` is the link-local service cloud machines can reach, named by class only. */
export type Zone = 'public' | 'internal' | 'metadata';

export type ScenarioId = 'public' | 'resolves-internal' | 'redirect' | 'numeric-form' | 'rebinding' | 'metadata';

/** What a fictional name resolves to, one answer per lookup (a second lookup may differ). */
interface Host {
  name: string;
  /** Zone of each successive lookup; the last answer repeats. */
  answers: readonly Zone[];
}

export interface Scenario {
  id: ScenarioId;
  /** The card's title, in words: what happens, never a string to try. */
  title: string;
  /** A sentence describing it. */
  text: string;
  /** The host the learner's link names, or a literal address (no name to look up). */
  target: { kind: 'name'; host: Host } | { kind: 'literal'; zone: Zone; /** Does the plain-text check recognise this form? */ recognised: boolean };
  /** A first response that redirects somewhere else. */
  redirect?: Host;
}

const BLOG: Host = { name: 'blog.example', answers: ['public'] };
const WIKI: Host = { name: 'wiki.corp.example', answers: ['internal'] };

export const SCENARIOS: readonly Scenario[] = [
  { id: 'public', title: 'A public page', text: 'The link names blog.example, which resolves to a public address.', target: { kind: 'name', host: BLOG } },
  { id: 'resolves-internal', title: 'A hostname that resolves to an internal address', text: 'The link names files.partner.example, whose DNS answer is an address inside the company network.', target: { kind: 'name', host: { name: 'files.partner.example', answers: ['internal'] } } },
  { id: 'redirect', title: 'A public page that redirects to an internal one', text: 'blog.example answers with a redirect whose target is wiki.corp.example.', target: { kind: 'name', host: BLOG }, redirect: WIKI },
  { id: 'numeric-form', title: 'An internal address written in an unusual numeric form', text: 'The link holds an internal address in a form a plain-text range check does not recognise, though the network library accepts it.', target: { kind: 'literal', zone: 'internal', recognised: false } },
  { id: 'rebinding', title: 'A hostname whose DNS answer changes between the check and the use', text: 'The first lookup of cdn.partner.example says public, the second says internal.', target: { kind: 'name', host: { name: 'cdn.partner.example', answers: ['public', 'internal'] } } },
  { id: 'metadata', title: 'The metadata service, asked for directly', text: 'The link points straight at the link-local metadata service of the machine.', target: { kind: 'literal', zone: 'metadata', recognised: true } },
];

export const scenarioById = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!;

export type DefenceId = 'allowList' | 'denyList' | 'normalise' | 'pin' | 'recheck' | 'schemes' | 'egress' | 'hardening' | 'leastPrivilege';

export const DEFENCES: readonly { id: DefenceId; label: string; text: string }[] = [
  { id: 'allowList', label: 'Allow-list of hosts', text: 'Only hosts on the list may be fetched.' },
  { id: 'denyList', label: 'Block private and link-local ranges', text: 'Refuse addresses in private and link-local ranges (a deny-list).' },
  { id: 'normalise', label: 'Normalise the address before checking', text: 'Turn every address form into one canonical form first.' },
  { id: 'pin', label: 'Resolve once, connect to the address you checked', text: 'Use the address that was checked, not a second lookup. It only matters when a check is on.' },
  { id: 'recheck', label: 'Re-check every redirect hop', text: 'Run the same checks on each redirect target.' },
  { id: 'schemes', label: 'Restrict schemes and ports', text: 'Allow only web schemes on standard ports.' },
  { id: 'egress', label: 'Egress firewall from the server', text: 'Block the server from reaching internal ranges (it does not cover the link-local service in this model).' },
  { id: 'hardening', label: 'Metadata hardening', text: 'The metadata service needs a session token this feature cannot produce.' },
  { id: 'leastPrivilege', label: 'Least-privilege role', text: 'The machine role can do very little, so a leaked credential is small.' },
];

export type DefenceSet = Readonly<Record<DefenceId, boolean>>;

export const NO_DEFENCES: DefenceSet = Object.fromEntries(DEFENCES.map((d) => [d.id, false])) as DefenceSet;
export const ALL_DEFENCES: DefenceSet = Object.fromEntries(DEFENCES.map((d) => [d.id, true])) as DefenceSet;
export const defenceSet = (...on: DefenceId[]): DefenceSet => ({ ...NO_DEFENCES, ...Object.fromEntries(on.map((d) => [d, true])) });
export const subsetOf = (mask: number): DefenceSet => Object.fromEntries(DEFENCES.map((d, i) => [d.id, (mask >> i & 1) === 1])) as DefenceSet;
export const SUBSET_COUNT = 2 ** DEFENCES.length;

/** The hosts the allow-list holds: the one public site the preview feature is meant for. */
export const ALLOWED_HOSTS: readonly string[] = ['blog.example'];

// ── The pipeline ─────────────────────────────────────────────────────────

export type Layer = DefenceId | null;

export interface Step {
  stage: 'parse' | 'check' | 'resolve' | 'connect' | 'redirect';
  text: string;
  /** ok = a safe step, bad = it went somewhere it should not, orange = the server's own fetch, info = neutral. */
  tone: 'ok' | 'bad' | 'orange' | 'info';
}

export type Status = 'blocked' | 'public' | 'internal' | 'metadata';

export interface Result {
  status: Status;
  /** The defence that stopped it, when blocked. */
  blockedBy: Layer;
  /** Every connection the server made, in order: where the request finally went is the last. */
  connections: { host: string; zone: Zone }[];
  /** A credential came back from the metadata service. */
  credential: null | { scope: 'broad' | 'narrow'; value: string };
  /** The metadata service was reached but refused (hardening). */
  refused: boolean;
  steps: Step[];
}

export const ZONE_WORD: Record<Zone, string> = { public: 'a public address', internal: 'an address inside the company network', metadata: 'the link-local metadata service' };

/** The fake credential the metadata service returns in the simulation. */
export const FAKE_CREDENTIAL = fakeSecret('FAKE-', 'DEMO-', 'role-credential');

const answerAt = (h: Host, lookup: number): Zone => h.answers[Math.min(lookup, h.answers.length - 1)];

interface Hop {
  label: string;
  /** Zone the plain check sees, or null when the check cannot read the address form. */
  seen: (d: DefenceSet) => Zone | null;
  /** Zone of the connection, given whether the address is pinned. */
  connectZone: (d: DefenceSet) => Zone;
  /** Allow-list sees a name; a bare address is never on it. */
  name: string | null;
}

function hopOf(t: Scenario['target'] | { kind: 'name'; host: Host }): Hop {
  if (t.kind === 'literal') {
    return {
      label: t.zone === 'metadata' ? 'the metadata service address' : 'an internal address in an unusual form',
      seen: (d) => (t.recognised || d.normalise ? t.zone : null),
      connectZone: () => t.zone,
      name: null,
    };
  }
  return {
    label: t.host.name,
    seen: () => answerAt(t.host, 0),
    connectZone: (d) => answerAt(t.host, d.pin ? 0 : 1),
    name: t.host.name,
  };
}

/** Run the checks the learner turned on against one hop; the first one that refuses names itself. */
function runChecks(hop: Hop, d: DefenceSet): { layer: DefenceId; why: string } | null {
  if (d.allowList && (hop.name === null || !ALLOWED_HOSTS.includes(hop.name))) {
    return { layer: 'allowList', why: `${hop.label} is not on the allow-list` };
  }
  if (d.denyList) {
    const seen = hop.seen(d);
    if (seen === 'internal' || seen === 'metadata') return { layer: 'denyList', why: `${hop.label} is ${ZONE_WORD[seen]}` };
  }
  return null;
}

/** Simulate the preview request for a scenario under a set of defences. */
export function run(s: Scenario, d: DefenceSet): Result {
  const steps: Step[] = [];
  const connections: Result['connections'] = [];
  const blocked = (layer: DefenceId, why: string, stage: Step['stage']): Result => {
    steps.push({ stage, text: `Blocked: ${why}.`, tone: 'ok' });
    return { status: 'blocked', blockedBy: layer, connections, credential: null, refused: false, steps };
  };
  const finish = (): Result => {
    const last = connections[connections.length - 1];
    const status: Status = last.zone;
    const refused = last.zone === 'metadata' && d.hardening;
    const credential = last.zone === 'metadata' && !refused ? { scope: d.leastPrivilege ? ('narrow' as const) : ('broad' as const), value: FAKE_CREDENTIAL } : null;
    if (last.zone !== 'public') {
      steps.push({
        stage: 'connect',
        tone: 'bad',
        text: refused ? 'The metadata service refused: it needs a session token this feature cannot produce.' : credential ? `A fake credential came back from the metadata service (${credential.scope} role).` : `The request reached ${ZONE_WORD[last.zone]}.`,
      });
    } else {
      steps.push({ stage: 'connect', tone: 'ok', text: 'The request reached a public page: the feature works as intended.' });
    }
    return { status, blockedBy: null, connections, credential, refused, steps };
  };

  const anyCheck = d.allowList || d.denyList;
  /** `checked`: a check ran on this hop, so there is an earlier answer to pin or to look up again. A bare address needs no lookup. */
  const connect = (hop: Hop, checked: boolean): Result | null => {
    const zone = hop.connectZone(d);
    if (hop.name !== null) {
      const text = checked
        ? d.pin ? `Connect to the address that was checked for ${hop.label}.` : `Look ${hop.label} up again to connect.`
        : d.pin ? `Look ${hop.label} up and connect to the first answer.` : `Look ${hop.label} up to connect.`;
      steps.push({ stage: 'resolve', tone: 'info', text });
    }
    if (d.egress && zone === 'internal') return blocked('egress', `the egress firewall refuses ${ZONE_WORD[zone]}`, 'connect');
    connections.push({ host: hop.label, zone });
    steps.push({ stage: 'connect', tone: 'orange', text: `The server connects to ${hop.label}: ${ZONE_WORD[zone]}.` });
    return null;
  };

  steps.push({ stage: 'parse', tone: 'info', text: `The link names ${hopOf(s.target).label}.` });
  const first = hopOf(s.target);
  const refusal = runChecks(first, d);
  if (refusal) return blocked(refusal.layer, refusal.why, 'check');
  steps.push({ stage: 'check', tone: 'info', text: anyCheck ? 'The checks you turned on passed.' : 'No check is turned on.' });
  const stopped = connect(first, anyCheck);
  if (stopped) return stopped;

  if (s.redirect) {
    const next = hopOf({ kind: 'name', host: s.redirect });
    steps.push({ stage: 'redirect', tone: 'info', text: `${first.label} answers with a redirect to ${next.label}.` });
    if (d.recheck) {
      const again = runChecks(next, d);
      if (again) return blocked(again.layer, `the redirect hop: ${again.why}`, 'redirect');
    }
    const stoppedAgain = connect(next, d.recheck && anyCheck);
    if (stoppedAgain) return stoppedAgain;
  }
  return finish();
}

/** True when the request ended somewhere that is not public. */
export const unsafe = (r: Result): boolean => r.status === 'internal' || r.status === 'metadata';

/** Where the request would end up if nothing stopped it: the last answer of the last host, ignoring every defence. */
export function wouldReach(s: Scenario): Zone {
  if (s.redirect) return s.redirect.answers[s.redirect.answers.length - 1];
  return s.target.kind === 'literal' ? s.target.zone : s.target.host.answers[s.target.host.answers.length - 1];
}