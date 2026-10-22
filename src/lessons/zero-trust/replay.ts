import {
  PAYMENTS_IDENTITY, decide, type Decision, type Model, type Request, type Resource, type Subject, type UserSubject,
} from './policy';

export type NodeId = 'attacker' | 'bob' | 'alice' | 'gate' | 'wiki' | 'hr' | 'pay' | 'db' | 'wall';
export type PillKind = 'user' | 'svc' | 'bad';

export const SERVICES: readonly Resource[] = ['wiki', 'hr', 'pay', 'db'];
/** The customer database is shown as `customer-db` in the decision log; the other systems keep their node names. */
export const RESOURCE_NAME: Record<Resource, string> = { wiki: 'wiki', hr: 'hr', pay: 'pay', db: 'customer-db' };
/** Denials the zero-trust model has seen before its monitoring raises an alert and revokes the stolen session. */
export const ALERT_DENIALS = 3;
/** The decision log keeps this many rows. */
export const LOG_ROWS = 6;

export interface LogRow {
  /** Position in the replay, so each row has its own key. */
  seq: number;
  allow: boolean;
  who: string;
  what: string;
  why: string;
}

export interface AttackState {
  /** Nodes the attacker controls: Bob's laptop and every system they got into. */
  owned: NodeId[];
  /** The attacker holds the payments admin password (found in a runbook). */
  creds: boolean;
  exfil: boolean;
  bobPwned: boolean;
  /** Security has revoked Bob's sessions and quarantined his laptop. */
  revoked: boolean;
  denials: number;
  /** The policy decision log, newest first. Only zero trust has one: castle and moat checks nothing inside the network. */
  log: LogRow[];
}

export type StepId = 'monday' | 'internet' | 'phish' | 'runbooks' | 'hr' | 'password' | 'service-call' | 'database' | 'exfil' | 'alert' | 'retry';

export interface Step {
  id: StepId;
  /** The request decided at this step, or null for an event (a phish, an alert, data leaving). */
  request: Request | null;
  decision: Decision | null;
  /** Nodes the packet travels through (empty for an event with no traffic). */
  path: NodeId[];
  label: string;
  pill: PillKind;
  /** The state after the step. */
  state: AttackState;
}

export const INITIAL_STATE: AttackState = { owned: [], creds: false, exfil: false, bobPwned: false, revoked: false, denials: 0, log: [] };

const bob = (patch: Partial<UserSubject> = {}): UserSubject => ({
  kind: 'user', label: 'bob@corp', origin: 'inside', session: 'mfa', device: 'healthy', role: 'engineering', ...patch,
});

/** Bob's laptop once the phish landed: his own valid session, from inside the network, on a device the security agent flags. */
const compromisedLaptop = (s: AttackState): UserSubject =>
  s.revoked ? bob({ session: 'revoked', device: 'quarantined' }) : bob({ device: 'edr-alert' });

const attackerOnTheInternet: UserSubject = {
  kind: 'user', label: 'attacker', origin: 'internet', session: 'none', device: 'unenrolled', role: 'none',
};

const stolenSession: UserSubject = bob({ label: 'bob@corp (stolen session)', origin: 'internet', device: 'unenrolled' });

const adminPassword: UserSubject = bob({ label: 'admin (stolen password)', session: 'none', device: 'edr-alert', role: 'payments-admin' });

const paymentsService = (label: string): Subject => ({ kind: 'workload', label, origin: 'inside', cert: PAYMENTS_IDENTITY });
const unknownWorkload: Subject = { kind: 'workload', label: 'unknown', origin: 'internet', cert: null };

/**
 * Run the attack against one model. The attacker's script is the same for both: an authored order of attempts,
 * with one rule for where they attack from (the compromised laptop while it works, their own machine with Bob's
 * stolen session when it does not). Every outcome is `decide(request, policy)`; what the attacker owns,
 * what leaks and how many requests were denied follow from those decisions, never from a flag set by hand.
 */
export function replay(model: Model): Step[] {
  const policy = { model };
  const steps: Step[] = [];
  let state = INITIAL_STATE;

  const event = (id: StepId, path: NodeId[], label: string, pill: PillKind, patch: Partial<AttackState>) => {
    state = { ...state, ...patch };
    steps.push({ id, request: null, decision: null, path, label, pill, state });
  };

  /** Decide a request and record it. `viaProxy` routes a person's request through the zero-trust access proxy. */
  const ask = (
    id: StepId, request: Request, from: NodeId, to: NodeId, label: string, pill: PillKind, viaProxy: boolean,
    onAllow: (s: AttackState) => Partial<AttackState>,
  ): Decision => {
    const decision = decide(request, policy);
    const log = model === 'zt'
      ? [{ seq: steps.length, allow: decision.allow, who: request.subject.label, what: RESOURCE_NAME[request.resource], why: decision.reason }, ...state.log].slice(0, LOG_ROWS)
      : state.log;
    state = { ...state, ...(decision.allow ? onAllow(state) : {}), denials: state.denials + (decision.allow ? 0 : 1), log };
    const door: NodeId[] = model === 'zt' && viaProxy ? ['gate'] : [];
    steps.push({ id, request, decision, path: [from, ...door, to], label, pill, state });
    return decision;
  };

  const owning = (...nodes: NodeId[]) => (s: AttackState): Partial<AttackState> => ({ owned: [...new Set([...s.owned, ...nodes])] });

  ask('monday', { subject: bob(), resource: 'wiki' }, 'bob', 'wiki', 'GET /wiki', 'user', true, () => ({}));

  // From the internet. Castle and moat stops it at the wall, so the packet ends there.
  ask('internet', { subject: attackerOnTheInternet, resource: 'wiki' }, 'attacker', model === 'moat' ? 'wall' : 'wiki', 'connect to wiki', 'bad', true, () => ({}));

  event('phish', ['attacker', 'bob'], '✉ Invoice.pdf.exe', 'bad', { bobPwned: true, owned: ['bob'] });

  const runbooks = ask(
    'runbooks', { subject: compromisedLaptop(state), resource: 'wiki' }, 'bob', 'wiki', 'GET /runbooks', 'bad', true,
    (s) => ({ ...owning('wiki')(s), creds: true }),
  );

  if (runbooks.allow) {
    ask('hr', { subject: compromisedLaptop(state), resource: 'hr' }, 'bob', 'hr', 'GET /salaries', 'bad', true, owning('hr'));
  } else {
    ask('hr', { subject: stolenSession, resource: 'hr' }, 'attacker', 'hr', 'Bob’s stolen token → HR', 'bad', true, owning('hr'));
  }

  if (state.creds) ask('password', { subject: adminPassword, resource: 'pay' }, 'bob', 'pay', 'login as admin', 'bad', true, owning('pay'));

  ask(
    'service-call', { subject: paymentsService('spiffe://corp/payments'), resource: 'db' }, 'pay', 'db',
    model === 'zt' ? 'mTLS · spiffe://corp/payments' : 'SELECT customers', 'svc', false, () => ({}),
  );

  const throughPayments = state.owned.includes('pay');
  ask(
    'database',
    { subject: throughPayments ? paymentsService('payments (compromised)') : unknownWorkload, resource: 'db' },
    throughPayments ? 'pay' : 'attacker', 'db', throughPayments ? 'SELECT * FROM customers' : 'connect to DB', 'bad', false, owning('db'),
  );

  if (state.owned.includes('db')) event('exfil', ['db', 'attacker'], 'customer rows ⟶', 'bad', { exfil: true });

  if (model === 'zt' && state.denials >= ALERT_DENIALS) {
    event('alert', [], '', 'bad', { revoked: true });
    ask('retry', { subject: compromisedLaptop(state), resource: 'wiki' }, 'bob', 'wiki', 'GET /wiki', 'bad', true, () => ({}));
  }
  return steps;
}

/** The systems (not laptops) the attacker owns in `state`. */
export const breachedSystems = (state: AttackState): Resource[] =>
  SERVICES.filter((r) => state.owned.includes(r));
