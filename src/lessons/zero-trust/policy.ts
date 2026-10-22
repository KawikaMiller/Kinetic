// A toy access policy: one pure function decides every request in the lesson's replay.
// The policy table below is the lesson's own invention (who may reach what), not any product's.

export type Model = 'moat' | 'zt';
export type Resource = 'wiki' | 'hr' | 'pay' | 'db';
export type Role = 'engineering' | 'hr' | 'payments-admin' | 'none';
export type SessionState = 'mfa' | 'revoked' | 'none';
export type DeviceState = 'healthy' | 'edr-alert' | 'unenrolled' | 'quarantined';
/** Where the request enters the network: from the internet, or from a machine already inside it (a laptop on the VPN). */
export type Origin = 'internet' | 'inside';
export type Check = 'firewall' | 'identity' | 'device' | 'role' | 'certificate';

export interface UserSubject {
  kind: 'user';
  label: string;
  origin: Origin;
  session: SessionState;
  device: DeviceState;
  role: Role;
}

export interface WorkloadSubject {
  kind: 'workload';
  label: string;
  origin: Origin;
  /** The workload identity on the client certificate it presents, or null when it presents none. */
  cert: string | null;
}

export type Subject = UserSubject | WorkloadSubject;

export interface Request {
  subject: Subject;
  resource: Resource;
}

export interface Policy {
  model: Model;
}

export interface CheckResult {
  check: Check;
  pass: boolean;
  /** The words the decision log prints for this check. */
  note: string;
}

export interface Decision {
  allow: boolean;
  /** Every check the model ran, in order. Castle and moat runs one; zero trust runs three for a person and two for a service. */
  checks: CheckResult[];
  /** The first check that failed (the one that stopped the request), or null when it was allowed. */
  denier: Check | null;
  /** An allowed request lists every passing check; a denied one lists the checks that failed. */
  reason: string;
}

/** Roles that may reach each resource; a person never reaches the customer database directly. */
export const ROLE_ACCESS: Readonly<Record<Resource, readonly Role[]>> = {
  wiki: ['engineering'],
  hr: ['hr'],
  pay: ['payments-admin'],
  db: [],
};

/** The workload identity allowed to reach each resource: only the payments service reads customers. */
export const PAYMENTS_IDENTITY = 'spiffe://corp/payments';
export const WORKLOAD_ACCESS: Readonly<Record<Resource, readonly string[]>> = {
  wiki: [],
  hr: [],
  pay: [],
  db: [PAYMENTS_IDENTITY],
};

const SESSION_NOTE: Record<SessionState, string> = { mfa: 'MFA ✓', revoked: 'sessions revoked', none: 'no valid session' };
const DEVICE_NOTE: Record<DeviceState, string> = {
  healthy: 'device healthy ✓',
  'edr-alert': 'device posture: EDR alert',
  unenrolled: 'unenrolled device',
  quarantined: 'device quarantined',
};

function userChecks(s: UserSubject, resource: Resource): CheckResult[] {
  const allowed = ROLE_ACCESS[resource].includes(s.role);
  return [
    { check: 'identity', pass: s.session === 'mfa', note: SESSION_NOTE[s.session] },
    { check: 'device', pass: s.device === 'healthy', note: DEVICE_NOTE[s.device] },
    { check: 'role', pass: allowed, note: allowed ? `role ${s.role}` : 'role not permitted' },
  ];
}

function workloadChecks(s: WorkloadSubject, resource: Resource): CheckResult[] {
  const allowed = s.cert !== null && WORKLOAD_ACCESS[resource].includes(s.cert);
  return [
    { check: 'certificate', pass: s.cert !== null, note: s.cert !== null ? 'valid workload cert' : 'no client certificate' },
    { check: 'role', pass: allowed, note: allowed ? 'policy allows' : 'policy denies' },
  ];
}

/** Castle and moat: only the edge is checked. A request from the internet is stopped, and anything from inside is trusted. */
function moatChecks(s: Subject): CheckResult[] {
  return [{ check: 'firewall', pass: s.origin === 'inside', note: s.origin === 'inside' ? 'came from inside the network' : 'came from the internet' }];
}

/**
 * Decide one request under one model. Pure: the same request and policy give the same decision, with the checks
 * it ran and the first one that failed. Zero trust ignores where the request came from.
 */
export function decide(request: Request, policy: Policy): Decision {
  const { subject, resource } = request;
  const checks = policy.model === 'moat' ? moatChecks(subject) : subject.kind === 'user' ? userChecks(subject, resource) : workloadChecks(subject, resource);
  const failed = checks.filter((c) => !c.pass);
  const shown = failed.length ? failed : checks;
  return {
    allow: failed.length === 0,
    checks,
    denier: failed[0]?.check ?? null,
    reason: shown.map((c) => c.note).join(' · '),
  };
}

/** The name a caption gives the check that stopped a request. */
export const CHECK_NAME: Record<Check, string> = {
  firewall: 'the firewall',
  identity: 'the identity check',
  device: 'the device check',
  role: 'the role check',
  certificate: 'the certificate check',
};
