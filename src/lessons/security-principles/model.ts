// Defense in depth as data: layers from the outside in, scripted attack scenarios, and which layer
// (if any) stops each one. Plus least privilege: a service's permission grid and its blast radius.

export type LayerId = 'network' | 'identity' | 'authz' | 'app' | 'data';

export interface Layer {
  id: LayerId;
  name: string;
  control: string;
}

/** Outermost first. */
export const LAYERS: Layer[] = [
  { id: 'network', name: 'Network', control: 'firewall and rate limiting' },
  { id: 'identity', name: 'Identity', control: 'multi-factor authentication' },
  { id: 'authz', name: 'Authorisation', control: 'least privilege' },
  { id: 'app', name: 'Application', control: 'input handling, parameterised queries' },
  { id: 'data', name: 'Data', control: 'encryption at rest' },
];

export type Cia = 'confidentiality' | 'integrity' | 'availability';

export interface Scenario {
  id: string;
  label: string;
  /** What the attacker has or does, in plain words. */
  setup: string;
  /** The layers that can stop it, in the order the attack meets them. */
  defeatedBy: LayerId[];
  /** Why each of those layers stops it. */
  stops: Partial<Record<LayerId, string>>;
  /** What's lost if nothing stops it. */
  threatens: Cia[];
  breach: string;
  /** The first layer the attack actually meets; it skips everything outside it. Default: the network. */
  entersAt?: LayerId;
  /** False when the attack never touches a system that logs (a theft, say). Default: true. */
  logged?: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'phish',
    label: 'A phished password',
    setup: 'An employee typed their password into a fake login page. The attacker logs in with it, which looks like normal traffic to the firewall.',
    defeatedBy: ['identity', 'authz'],
    stops: {
      identity: 'MFA asks for a code from the employee\'s phone, which the attacker doesn\'t have.',
      authz: 'The account only has access to what that job needs, so the customer database is out of reach.',
    },
    threatens: ['confidentiality'],
    breach: 'The attacker browses customer records with a real employee\'s account.',
  },
  {
    id: 'injection',
    label: 'Injection in a search form',
    setup: 'A search box pastes its input into a SQL query (see the injection lesson).',
    defeatedBy: ['app', 'authz'],
    stops: {
      app: 'The query uses parameters, so the input is only ever data.',
      authz: 'The app\'s database user can only read one table, so the rest can\'t be changed or read.',
    },
    threatens: ['integrity', 'confidentiality'],
    breach: 'Records are read and changed through the vulnerable query.',
  },
  {
    id: 'laptop',
    label: 'A stolen laptop',
    setup: 'A developer\'s laptop, with a copy of production data on it, is stolen from a car. No network or login is involved.',
    defeatedBy: ['data'],
    stops: { data: 'The disk is encrypted, so the drive is unreadable without the owner\'s key.' },
    threatens: ['confidentiality'],
    breach: 'Whoever has the laptop reads the data straight off the disk.',
    entersAt: 'data',
    logged: false,
  },
  {
    id: 'service',
    label: 'A compromised service account',
    setup: 'A background job\'s credentials leak. It already has a valid identity, so only its permissions stand in the way.',
    defeatedBy: ['authz'],
    stops: { authz: 'The service can only do its one job; everything else is denied (see the least privilege panel).' },
    threatens: ['integrity', 'confidentiality'],
    breach: 'The attacker can do everything the over-privileged account could: the blast radius is its permissions.',
  },
  {
    id: 'ddos',
    label: 'A flood of traffic (DDoS)',
    setup: 'Thousands of machines send requests at once, aiming to knock the site offline rather than steal anything.',
    defeatedBy: ['network'],
    stops: { network: 'Rate limiting and upstream filtering drop the flood before it reaches the app.' },
    threatens: ['availability'],
    breach: 'Real customers can\'t reach the site: nothing is stolen, but availability is lost.',
  },
  {
    id: 'admin',
    label: 'An admin panel left on the internet',
    setup: 'An internal admin page was deployed with a public address by mistake.',
    defeatedBy: ['network', 'identity'],
    stops: {
      network: 'The firewall only allows the admin panel from the office network.',
      identity: 'The panel requires a login with MFA.',
    },
    threatens: ['confidentiality', 'integrity'],
    breach: 'Anyone who finds the address can use the admin tools.',
  },
];

/** The layer that stops `scenario`: the first enabled one in its defeat list, or null (breach). */
export const stoppedBy = (scenario: Scenario, enabled: ReadonlySet<LayerId>) => scenario.defeatedBy.find((l) => enabled.has(l)) ?? null;

/** Whether anyone finds out about a breach: only if detection is on and the attack went through logged systems. */
export const detected = (scenario: Scenario, detection: boolean) => detection && scenario.logged !== false;

/** Index of a layer from the outside (0 = network). */
export const depthOf = (id: LayerId) => LAYERS.findIndex((l) => l.id === id);

// ── Least privilege ──────────────────────────────────────────────────────────

export type Action = 'read' | 'write' | 'delete';
export const ACTIONS: Action[] = ['read', 'write', 'delete'];

export interface Resource {
  id: string;
  label: string;
  /** How bad it is if this is misused (1 = mild, 3 = severe). */
  sensitivity: number;
}

export const RESOURCES: Resource[] = [
  { id: 'invoices', label: 'invoices', sensitivity: 2 },
  { id: 'customers', label: 'customer records', sensitivity: 3 },
  { id: 'payments', label: 'payment methods', sensitivity: 3 },
  { id: 'email', label: 'outgoing email', sensitivity: 1 },
  { id: 'admin', label: 'user admin', sensitivity: 3 },
];

/** How much damage each action allows, relative to reading. */
const ACTION_WEIGHT: Record<Action, number> = { read: 1, write: 2, delete: 3 };

export const perm = (resource: string, action: Action) => `${resource}:${action}`;

/** What the "invoice-mailer" service actually needs to do its job. */
export const NEEDED = new Set([perm('invoices', 'read'), perm('customers', 'read'), perm('email', 'write')]);

/** Everything: the classic "just give it admin" service account. */
export const EVERYTHING = new Set(RESOURCES.flatMap((r) => ACTIONS.map((a) => perm(r.id, a))));

/** Damage an attacker could do with these permissions: action weight × sensitivity, summed. */
export function blastRadius(grants: ReadonlySet<string>): number {
  let total = 0;
  for (const r of RESOURCES) for (const a of ACTIONS) if (grants.has(perm(r.id, a))) total += ACTION_WEIGHT[a] * r.sensitivity;
  return total;
}

/** Needed permissions that are missing: the service can't do its job without them. */
export const missingNeeds = (grants: ReadonlySet<string>) => [...NEEDED].filter((p) => !grants.has(p));
