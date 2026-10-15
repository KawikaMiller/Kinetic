import {
  ATTACKER, ATTACKER_STATE, ATTACKER_VERIFIER, authorizeUrl, AuthServer, callbackUrl, Client, CLIENT_ID, FORWARDING_REDIRECT, OIDC_SCOPE, REGISTERED_REDIRECT,
  SCOPE, VICTIM, VICTIM_STATE, type Attack, type AuthRequest, type BlockedAt, type Defences, type Held, type Msg, type NodeId, type Kind, type Opts,
  type Outcome, type Step, type StepId, type TokenRequest,
} from './model';
import { s256 } from './pkce';

const m = (from: NodeId, to: NodeId, label: string, kind: Kind): Msg => ({ from, to, label, kind });

// ── Recording a run ─────────────────────────────────────────────────
interface Trace {
  steps: Step[];
  push: (id: StepId, patch?: Partial<Omit<Step, 'id'>>) => void;
}

function createTrace(): Trace {
  const steps: Step[] = [];
  let cur: Step = {
    id: 'intro', msg: null, busy: null, url: null, screen: 'none', app: [], att: [], signedIn: false, outcome: null, photosLeaked: false, data: {},
  };
  return {
    steps,
    push(id, patch = {}) {
      cur = { ...cur, msg: null, busy: null, screen: 'none', outcome: null, hold: undefined, data: {}, ...patch, id };
      steps.push(cur);
    },
  };
}

interface Run {
  o: Opts;
  t: Trace;
  server: AuthServer;
  redirectMatch: 'exact' | 'site';
}

/**
 * Run the protocol and record every step. The outcome of each check comes from the
 * `AuthServer` and `Client` in model.ts, not from a script: switch a defence off and the same
 * code lets the attacker through.
 */
export function runFlow(o: Opts): Step[] {
  const run: Run = { o, t: createTrace(), server: new AuthServer(o.exactRedirect), redirectMatch: o.exactRedirect ? 'exact' : 'site' };
  run.t.push('intro');
  if (o.attack === 'forge') forgedCallback(run);
  else if (o.attack === 'redirect') craftedRedirect(run);
  else ownFlow(run);
  return run.t.steps;
}

const heldBy = (o: Defences): Held[] => [...(o.state ? (['state'] as Held[]) : []), ...(o.pkce ? (['code_verifier'] as Held[]) : [])];
const scopeOf = (o: Opts) => (o.oidc ? OIDC_SCOPE : SCOPE);

/** The user's own flow, either to the end or with an attacker reading the redirect. */
function ownFlow({ o, t, server, redirectMatch }: Run) {
  const client = new Client(o);
  t.push('click', { msg: m('browser', 'app', 'click "Connect Photos"', 'front') });
  const req = client.begin();
  const pending = heldBy(o);
  if (o.pkce) t.push('verifier', { busy: 'app', app: ['code_verifier'] });
  t.push('redirect-out', { msg: m('app', 'browser', '302 → /authorize', 'front'), url: authorizeUrl(req), app: pending });
  t.push('arrive', { msg: m('browser', 'auth', 'GET /authorize?…', 'front'), url: authorizeUrl(req), app: pending, data: { redirectMatch } });
  t.push('login', { screen: 'login', busy: 'auth', url: { base: 'https://accounts.photos/login', params: [] }, app: pending });
  t.push('consent', { screen: 'consent', busy: 'auth', url: { base: 'https://accounts.photos/consent', params: [] }, hold: 1.3, app: pending });
  const issued = server.authorize(req, VICTIM);
  if (!issued.ok) throw new Error('the registered redirect_uri is accepted under either matching rule');
  const back = callbackUrl(issued.redirectTo);
  t.push('code-back', { msg: m('auth', 'browser', '302 → /cb?code=…', 'front'), url: back, app: pending, data: { code: issued.code } });

  if (o.attack === 'steal') {
    // The attacker knows the public client_id and the registered redirect_uri, but not the verifier.
    t.push('grab', { msg: m('browser', 'attacker', 'code=…', 'bad'), url: back, att: ['code'], app: pending, data: { code: issued.code } });
    redeem(t, server, { code: issued.code, client_id: CLIENT_ID, redirect_uri: REGISTERED_REDIRECT }, 'race', 'POST /token code (no verifier)', pending);
    return;
  }

  const cb = client.onCallback({ code: issued.code, state: o.state ? VICTIM_STATE : undefined });
  if (!cb.ok) throw new Error("the app's own state matches in its own flow");
  const held: Held[] = [...pending, 'code'];
  t.push('callback', { msg: m('browser', 'app', 'GET /cb?code=…', 'front'), app: held, url: back, data: { code: issued.code } });
  t.push('token', { msg: m('app', 'auth', o.pkce ? 'POST /token code + verifier' : 'POST /token code', 'back'), app: held });
  const result = server.token(cb.token);
  if (!result.ok) throw new Error(`the user's own flow must succeed: ${result.reason}`);
  if (o.pkce) t.push('verified', { busy: 'auth', app: held });
  const tokens = result.grants;
  t.push('tokens', { msg: m('auth', 'app', tokens.includes('id_token') ? '200 access + refresh + id_token' : '200 access + refresh', 'back'), app: tokens, data: { grants: tokens } });
  if (tokens.includes('id_token')) t.push('id-token', { busy: 'app', app: tokens, signedIn: true, hold: 1.3 });
  t.push('api-call', { msg: m('app', 'api', 'GET /photos  Bearer …', 'back'), app: tokens });
  t.push('api-ok', { msg: m('api', 'app', '200 · photos', 'ok'), app: tokens, outcome: 'printed' });
  t.push('api-delete', { msg: m('app', 'api', 'DELETE /photos/7', 'back'), app: tokens });
  t.push('api-403', { msg: m('api', 'app', '403 insufficient_scope', 'bad'), app: tokens });
  t.push('summary', { app: tokens, hold: 2 });
}

/** The attacker presents a code at /token: it is turned away, or it gets tokens and then the photos. */
function redeem(t: Trace, server: AuthServer, req: TokenRequest, id: StepId, label: string, app: Held[]) {
  t.push(id, { msg: m('attacker', 'auth', label, 'bad'), att: ['code'], app });
  const result = server.token(req);
  if (!result.ok) {
    t.push('blocked-token', { msg: m('auth', 'attacker', '400 invalid_grant', 'ok'), att: ['code'], app, outcome: 'blocked', hold: 1.4, data: { reason: result.reason, blockedAt: 'token' } });
    return;
  }
  const att: Held[] = ['code', ...result.grants];
  t.push('leak-tokens', { msg: m('auth', 'attacker', '200 access_token', 'bad'), att, app, data: { grants: result.grants } });
  t.push('leak-call', { msg: m('attacker', 'api', 'GET /photos  Bearer …', 'bad'), att, app });
  t.push('leak-photos', { msg: m('api', 'attacker', '200 · your photos', 'bad'), att, app, outcome: 'leaked', photosLeaked: true, hold: 1.4 });
}

/** Login CSRF: the attacker runs its own flow with the real app and hands the victim's app the resulting code. */
function forgedCallback({ o, t, server, redirectMatch }: Run) {
  const attackerReq: AuthRequest = {
    client_id: CLIENT_ID,
    redirect_uri: REGISTERED_REDIRECT,
    scope: scopeOf(o),
    ...(o.state ? { state: ATTACKER_STATE } : {}),
    ...(o.pkce ? { code_challenge: s256(ATTACKER_VERIFIER), code_challenge_method: 'S256' as const } : {}),
  };
  t.push('att-start', { msg: m('attacker', 'auth', 'GET /authorize (its own account)', 'bad'), url: authorizeUrl(attackerReq), data: { redirectMatch } });
  const issued = server.authorize(attackerReq, ATTACKER);
  if (!issued.ok) throw new Error('the registered redirect_uri is accepted under either matching rule');
  const back = callbackUrl(issued.redirectTo);
  t.push('att-code', { msg: m('auth', 'attacker', '302 → /cb?code=… (not followed)', 'bad'), url: back, att: ['code'], data: { code: issued.code } });
  t.push('att-lure', { msg: m('attacker', 'browser', 'link to photoprint.app/cb?code=…', 'bad'), url: back, att: ['code'], data: { code: issued.code } });
  // The victim's app has no connection attempt in progress: nothing to compare state with, no verifier.
  const client = new Client(o);
  const cb = client.onCallback({ code: issued.code, state: o.state ? ATTACKER_STATE : undefined });
  t.push('forged-callback', { msg: m('browser', 'app', 'GET /cb?code=…', 'front'), url: back, att: ['code'], data: { code: issued.code } });
  if (!cb.ok) {
    t.push('state-reject', { att: ['code'], outcome: 'blocked', hold: 1.4, busy: 'app', data: { reason: cb.error, blockedAt: 'callback' } });
    return;
  }
  t.push('forged-token', { msg: m('app', 'auth', 'POST /token code (no verifier)', 'back'), att: ['code'] });
  const result = server.token(cb.token);
  if (!result.ok) {
    t.push('forge-blocked', { msg: m('auth', 'app', '400 invalid_grant', 'ok'), att: ['code'], outcome: 'blocked', hold: 1.4, data: { reason: result.reason, blockedAt: 'token' } });
    return;
  }
  t.push('hijacked', {
    msg: m('auth', 'app', "200 tokens (the attacker's account)", 'bad'), att: ['code'], app: result.grants, outcome: 'hijacked', hold: 1.4,
    data: { account: result.account, grants: result.grants },
  });
}

/** The attacker writes the authorize link itself, with a redirect_uri it can read and a challenge of its own. */
function craftedRedirect({ o, t, server, redirectMatch }: Run) {
  const req: AuthRequest = {
    client_id: CLIENT_ID,
    redirect_uri: FORWARDING_REDIRECT,
    scope: scopeOf(o),
    code_challenge: s256(ATTACKER_VERIFIER),
    code_challenge_method: 'S256',
  };
  t.push('crafted-link', { msg: m('attacker', 'browser', 'link to /authorize?redirect_uri=…', 'bad'), url: authorizeUrl(req), att: ['code_verifier'] });
  t.push('crafted-arrive', { msg: m('browser', 'auth', 'GET /authorize?…', 'front'), url: authorizeUrl(req), att: ['code_verifier'], data: { redirectMatch } });
  const issued = server.authorize(req, VICTIM);
  if (!issued.ok) {
    t.push('redirect-error', { screen: 'error', busy: 'auth', att: ['code_verifier'], outcome: 'blocked', hold: 1.6, data: { reason: issued.error, blockedAt: 'authorize' } });
    return;
  }
  t.push('login', { screen: 'login', busy: 'auth', url: { base: 'https://accounts.photos/login', params: [] }, att: ['code_verifier'] });
  t.push('consent', { screen: 'consent', busy: 'auth', url: { base: 'https://accounts.photos/consent', params: [] }, hold: 1.3, att: ['code_verifier'] });
  const back = callbackUrl(issued.redirectTo);
  t.push('code-to-attacker', { msg: m('browser', 'attacker', 'code=… (forwarded)', 'bad'), url: back, att: ['code_verifier', 'code'], data: { code: issued.code } });
  redeem(t, server, { code: issued.code, client_id: CLIENT_ID, redirect_uri: FORWARDING_REDIRECT, code_verifier: ATTACKER_VERIFIER }, 'redeem', 'POST /token code + its own verifier', []);
}

// ── What each defence stops: the matrix, generated by running the model ──
export type Column = 'none' | 'state' | 'pkce' | 'exactRedirect' | 'all';
export const COLUMNS: { id: Column; label: string; defences: Defences }[] = [
  { id: 'none', label: 'no defence', defences: { pkce: false, state: false, exactRedirect: false } },
  { id: 'state', label: 'state check only', defences: { pkce: false, state: true, exactRedirect: false } },
  { id: 'pkce', label: 'PKCE only', defences: { pkce: true, state: false, exactRedirect: false } },
  { id: 'exactRedirect', label: 'exact redirect_uri only', defences: { pkce: false, state: false, exactRedirect: true } },
  { id: 'all', label: 'all three', defences: { pkce: true, state: true, exactRedirect: true } },
];
export const ATTACKS: Exclude<Attack, 'none'>[] = ['steal', 'forge', 'redirect'];

export interface Summary {
  outcome: Outcome;
  blockedAt: BlockedAt | null;
}

/** How a whole run ends, read from its last step. */
export function summarize(o: Opts): Summary {
  const last = [...runFlow(o)].reverse().find((s) => s.outcome !== null);
  if (!last?.outcome) throw new Error('every run ends with an outcome');
  return { outcome: last.outcome, blockedAt: last.data.blockedAt ?? null };
}

export interface MatrixRow {
  attack: Exclude<Attack, 'none'>;
  cells: { column: Column; summary: Summary }[];
}

/** Every cell is a run of the model: the attack against that column's defences, with the openid scope. */
export function defenceMatrix(): MatrixRow[] {
  return ATTACKS.map((attack) => ({
    attack,
    cells: COLUMNS.map((c) => ({ column: c.id, summary: summarize({ ...c.defences, attack, oidc: true }) })),
  }));
}

export const ATTACK_LABEL: Record<Attack, string> = {
  none: 'No attacker',
  steal: 'Steals the code',
  forge: 'Forges the callback',
  redirect: 'Swaps redirect_uri',
};
export const OUTCOME_LABEL: Record<Outcome, string> = { printed: 'photos printed', blocked: 'attack blocked', leaked: 'photos leaked', hijacked: 'account hijacked' };
export const BLOCKED_AT_LABEL: Record<BlockedAt, string> = { authorize: 'at /authorize', callback: 'at the callback', token: 'at /token' };

/** A matrix cell's words: where it was blocked, or what the attacker got. */
export const cellText = (s: Summary): string =>
  s.outcome === 'blocked' && s.blockedAt ? `blocked ${BLOCKED_AT_LABEL[s.blockedAt]}` : s.outcome === 'leaked' ? 'photos leaked' : s.outcome === 'hijacked' ? 'account hijacked' : OUTCOME_LABEL[s.outcome];

/** What each parameter ties together, and who checks it: the rows that sit above the matrix. */
export const BINDINGS: { param: string; defence: keyof Defences; binds: string; checkedBy: string }[] = [
  { param: 'state', defence: 'state', binds: 'the callback to the browser session that started the flow', checkedBy: 'the app, when the browser comes back' },
  { param: 'code_challenge and code_verifier', defence: 'pkce', binds: 'the code to the app instance that started the flow', checkedBy: 'the authorization server, at /token' },
  { param: 'redirect_uri', defence: 'exactRedirect', binds: 'where the code may be delivered', checkedBy: 'the authorization server, before it issues a code' },
];
