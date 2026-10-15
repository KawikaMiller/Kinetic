import { describe, expect, it } from 'vitest';
import { REPO_RULES, scan } from '../../core/secretScan';
import { captionText } from '../../core/testing/captions';
import { buildFrames } from './frames';
import lesson from './index';
import {
  ATTACKER, ATTACKER_STATE, ATTACKER_VERIFIER, authorizeUrl, AuthServer, Client, CLIENT_ID, countDefences, DEFAULT_OPTS, FORWARDING_REDIRECT, REGISTERED_REDIRECT,
  SCENE_EDGES, SCOPE, VICTIM, VICTIM_STATE, VICTIM_VERIFIER, type Attack, type BlockedAt, type Defences, type Opts, type Outcome,
} from './model';
import { s256 } from './pkce';
import { ATTACKS, BINDINGS, cellText, COLUMNS, defenceMatrix, runFlow, summarize } from './run';

const ATTACK_MODES: Attack[] = ['none', 'steal', 'forge', 'redirect'];
const BOOLS = [false, true];
const ALL_DEFENCES: Defences[] = BOOLS.flatMap((pkce) => BOOLS.flatMap((state) => BOOLS.map((exactRedirect) => ({ pkce, state, exactRedirect }))));

interface Expected {
  outcome: Outcome;
  blockedAt: BlockedAt | null;
}

/**
 * The truth table, worked out by hand from what each parameter binds:
 *  - steal: the attacker reads the app's own code and redeems it without the verifier, so only PKCE stops it;
 *  - forge: the callback is rejected if the app checks state, else the code is rejected at /token if the app uses PKCE
 *    (it has no verifier for a code from someone else's flow), else the app takes the attacker's account;
 *  - redirect: the attacker wrote the request, including its own challenge, so PKCE binds the code to the attacker;
 *    only refusing the redirect_uri before issuing a code stops it.
 */
function expected(attack: Attack, d: Defences): Expected {
  if (attack === 'none') return { outcome: 'printed', blockedAt: null };
  if (attack === 'steal') return d.pkce ? { outcome: 'blocked', blockedAt: 'token' } : { outcome: 'leaked', blockedAt: null };
  if (attack === 'forge') {
    if (d.state) return { outcome: 'blocked', blockedAt: 'callback' };
    return d.pkce ? { outcome: 'blocked', blockedAt: 'token' } : { outcome: 'hijacked', blockedAt: null };
  }
  return d.exactRedirect ? { outcome: 'blocked', blockedAt: 'authorize' } : { outcome: 'leaked', blockedAt: null };
}

describe('the authorization server, step by step', () => {
  const request = (over: Partial<Parameters<AuthServer['authorize']>[0]> = {}) => ({
    client_id: CLIENT_ID, redirect_uri: REGISTERED_REDIRECT, scope: SCOPE, code_challenge: s256(VICTIM_VERIFIER), code_challenge_method: 'S256' as const, ...over,
  });
  const redeemable = (server: AuthServer, over: Partial<Parameters<AuthServer['authorize']>[0]> = {}) => {
    const r = server.authorize(request(over), VICTIM);
    if (!r.ok) throw new Error('expected a code');
    return r.code;
  };

  it('issues a code for the registered redirect_uri and puts state back on the redirect', () => {
    const r = new AuthServer(true).authorize(request({ state: 'abc' }), VICTIM);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.redirectTo).toBe(`${REGISTERED_REDIRECT}?code=${r.code}&state=abc`);
  });

  it('an exact-match server refuses any other redirect_uri, even one on the same site; a loose one accepts it', () => {
    expect(new AuthServer(true).authorize(request({ redirect_uri: FORWARDING_REDIRECT }), VICTIM)).toEqual({ ok: false, error: 'invalid_redirect_uri' });
    expect(new AuthServer(true).authorize(request({ redirect_uri: `${REGISTERED_REDIRECT}/` }), VICTIM)).toEqual({ ok: false, error: 'invalid_redirect_uri' });
    expect(new AuthServer(false).authorize(request({ redirect_uri: FORWARDING_REDIRECT }), VICTIM).ok).toBe(true);
    expect(new AuthServer(false).authorize(request({ redirect_uri: 'https://elsewhere.example/cb' }), VICTIM)).toEqual({ ok: false, error: 'invalid_redirect_uri' });
  });

  it('refuses an unknown client_id', () => {
    expect(new AuthServer(true).authorize(request({ client_id: 'other' }), VICTIM)).toEqual({ ok: false, error: 'unauthorized_client' });
  });

  it('a code with the right verifier is exchanged once; the second try is refused as reused', () => {
    const server = new AuthServer(true);
    const code = redeemable(server);
    const req = { code, client_id: CLIENT_ID, redirect_uri: REGISTERED_REDIRECT, code_verifier: VICTIM_VERIFIER };
    const first = server.token(req);
    expect(first.ok).toBe(true);
    expect(server.token(req)).toEqual({ ok: false, error: 'invalid_grant', reason: 'code_reused' });
  });

  it('each binding is checked at /token: verifier missing, verifier wrong, client, redirect_uri and an unknown code', () => {
    const base = { client_id: CLIENT_ID, redirect_uri: REGISTERED_REDIRECT, code_verifier: VICTIM_VERIFIER };
    const fresh = () => {
      const server = new AuthServer(false);
      return { server, code: redeemable(server) };
    };
    let t = fresh();
    expect(t.server.token({ ...base, code: t.code, code_verifier: undefined })).toEqual({ ok: false, error: 'invalid_grant', reason: 'verifier_missing' });
    t = fresh();
    expect(t.server.token({ ...base, code: t.code, code_verifier: ATTACKER_VERIFIER })).toEqual({ ok: false, error: 'invalid_grant', reason: 'verifier_mismatch' });
    t = fresh();
    expect(t.server.token({ ...base, code: t.code, client_id: 'other' })).toEqual({ ok: false, error: 'invalid_grant', reason: 'client_mismatch' });
    t = fresh();
    expect(t.server.token({ ...base, code: t.code, redirect_uri: FORWARDING_REDIRECT })).toEqual({ ok: false, error: 'invalid_grant', reason: 'redirect_mismatch' });
    expect(t.server.token({ ...base, code: 'not-a-code' })).toEqual({ ok: false, error: 'invalid_grant', reason: 'unknown_code' });
  });

  it('a code issued without a challenge needs no verifier (which is what makes the PKCE-off runs leak)', () => {
    const server = new AuthServer(true);
    const code = redeemable(server, { code_challenge: undefined, code_challenge_method: undefined });
    expect(server.token({ code, client_id: CLIENT_ID, redirect_uri: REGISTERED_REDIRECT }).ok).toBe(true);
  });

  it('the openid scope adds an id_token to the grants; plain photos.read does not', () => {
    const grants = (scope: string) => {
      const server = new AuthServer(true);
      const code = redeemable(server, { scope, code_challenge: undefined });
      const r = server.token({ code, client_id: CLIENT_ID, redirect_uri: REGISTERED_REDIRECT });
      return r.ok ? r.grants : [];
    };
    expect(grants('openid photos.read')).toEqual(['access_token', 'refresh_token', 'id_token']);
    expect(grants('photos.read')).toEqual(['access_token', 'refresh_token']);
  });

  it('the check lives in the server: one that ignores the challenge lets the stolen code through even when the app uses PKCE', () => {
    class IgnoresChallenge extends AuthServer {
      override authorize(req: Parameters<AuthServer['authorize']>[0], account: string) {
        return super.authorize({ ...req, code_challenge: undefined, code_challenge_method: undefined }, account);
      }
    }
    const client = new Client({ ...DEFAULT_OPTS });
    const req = client.begin();
    expect(req.code_challenge).toBe(s256(VICTIM_VERIFIER));
    for (const [server, stolen] of [[new AuthServer(true), false], [new IgnoresChallenge(true), true]] as const) {
      const issued = server.authorize(req, VICTIM);
      if (!issued.ok) throw new Error('expected a code');
      expect(server.token({ code: issued.code, client_id: CLIENT_ID, redirect_uri: REGISTERED_REDIRECT }).ok).toBe(stolen);
    }
  });
});

describe('the client app', () => {
  it('sends state and a challenge only for the defences it has on, and keeps what it needs to check later', () => {
    const req = new Client({ pkce: true, state: true, exactRedirect: true, oidc: true }).begin();
    expect(req.state).toBe(VICTIM_STATE);
    expect(req.code_challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const bare = new Client({ pkce: false, state: false, exactRedirect: true, oidc: false }).begin();
    expect(bare.state).toBeUndefined();
    expect(bare.code_challenge).toBeUndefined();
    expect(bare.scope).toBe('photos.read');
  });

  it('rejects a callback whose state is not the one it sent, or one that arrives with no attempt in progress; takes it with the check off', () => {
    const checking = new Client({ ...DEFAULT_OPTS });
    checking.begin();
    expect(checking.onCallback({ code: 'c', state: ATTACKER_STATE })).toEqual({ ok: false, error: 'state_mismatch' });
    expect(checking.onCallback({ code: 'c', state: VICTIM_STATE }).ok).toBe(true);
    expect(new Client({ ...DEFAULT_OPTS }).onCallback({ code: 'c', state: ATTACKER_STATE })).toEqual({ ok: false, error: 'state_mismatch' });
    expect(new Client({ ...DEFAULT_OPTS, state: false }).onCallback({ code: 'c', state: ATTACKER_STATE }).ok).toBe(true);
  });
});

describe('what each parameter binds: the whole truth table, from the model against the hand-worked one', () => {
  it.each(ATTACK_MODES)('attack "%s" ends as expected under every combination of the three defences, with and without the openid scope', (attack) => {
    for (const d of ALL_DEFENCES) {
      for (const oidc of BOOLS) {
        const got = summarize({ ...d, attack, oidc });
        expect(got, `${attack} ${JSON.stringify(d)} oidc=${oidc}`).toEqual(expected(attack, d));
      }
    }
  });

  it('the generated matrix equals the hand-worked table for all 15 cells, and each cell\'s words say where it stopped', () => {
    const rows = defenceMatrix();
    expect(rows.map((r) => r.attack)).toEqual(ATTACKS);
    for (const row of rows) {
      expect(row.cells.map((c) => c.column)).toEqual(COLUMNS.map((c) => c.id));
      for (const cell of row.cells) {
        const d = COLUMNS.find((c) => c.id === cell.column)!.defences;
        expect(cell.summary, `${row.attack} / ${cell.column}`).toEqual(expected(row.attack, d));
      }
    }
    const text = (attack: Attack, column: string) => cellText(rows.find((r) => r.attack === attack)!.cells.find((c) => c.column === column)!.summary);
    expect(text('steal', 'none')).toBe('photos leaked');
    expect(text('steal', 'pkce')).toBe('blocked at /token');
    expect(text('forge', 'state')).toBe('blocked at the callback');
    expect(text('forge', 'none')).toBe('account hijacked');
    expect(text('redirect', 'pkce')).toBe('photos leaked');
    expect(text('redirect', 'exactRedirect')).toBe('blocked at /authorize');
  });

  it('each defence is the one that stops its own attack: with it alone the attack is blocked, without it (and with the others) it is not', () => {
    const alone = (k: keyof Defences): Defences => ({ pkce: false, state: false, exactRedirect: false, [k]: true });
    const without = (k: keyof Defences): Defences => ({ pkce: true, state: true, exactRedirect: true, [k]: false });
    // state binds the callback: forge is stopped by it alone, and by PKCE too (a second check), but not by the redirect rule.
    expect(summarize({ ...alone('state'), attack: 'forge', oidc: true }).outcome).toBe('blocked');
    expect(summarize({ ...alone('exactRedirect'), attack: 'forge', oidc: true }).outcome).toBe('hijacked');
    // the verifier binds the code to the app instance: steal is stopped by it alone, not by state or the redirect rule.
    expect(summarize({ ...alone('pkce'), attack: 'steal', oidc: true }).outcome).toBe('blocked');
    expect(summarize({ ...alone('state'), attack: 'steal', oidc: true }).outcome).toBe('leaked');
    expect(summarize({ ...alone('exactRedirect'), attack: 'steal', oidc: true }).outcome).toBe('leaked');
    expect(summarize({ ...without('pkce'), attack: 'steal', oidc: true }).outcome).toBe('leaked');
    // the exact redirect_uri binds where the code goes: crafted-link is stopped by it alone and by nothing else.
    expect(summarize({ ...alone('exactRedirect'), attack: 'redirect', oidc: true }).outcome).toBe('blocked');
    expect(summarize({ ...without('exactRedirect'), attack: 'redirect', oidc: true }).outcome).toBe('leaked');
  });

  it('the binding rows cover exactly the three defences, once each', () => {
    expect(BINDINGS.map((b) => b.defence).sort()).toEqual(['exactRedirect', 'pkce', 'state']);
    expect(countDefences(DEFAULT_OPTS)).toBe(3);
    expect(countDefences({ pkce: false, state: true, exactRedirect: false })).toBe(1);
  });

  it('when the redirect attack gets through, the code was bound to the attacker: it was redeemed with the attacker\'s own verifier', () => {
    const steps = runFlow({ pkce: true, state: true, exactRedirect: false, attack: 'redirect', oidc: true });
    const ids = steps.map((s) => s.id);
    expect(ids).toEqual(['intro', 'crafted-link', 'crafted-arrive', 'login', 'consent', 'code-to-attacker', 'redeem', 'leak-tokens', 'leak-call', 'leak-photos']);
    expect(steps.find((s) => s.id === 'crafted-link')!.url!.params.find(([k]) => k === 'code_challenge')![1]).toBe(s256(ATTACKER_VERIFIER));
    expect(steps.find((s) => s.id === 'redeem')!.msg!.label).toContain('its own verifier');
  });
});

describe('the pictures obey the protocol', () => {
  it('every message travels along a wire of the scene, for every attacker and every setting', () => {
    const edges = new Set(SCENE_EDGES.flatMap(([a, b]) => [`${a}>${b}`, `${b}>${a}`]));
    for (const attack of ATTACK_MODES) {
      for (const d of ALL_DEFENCES) {
        for (const oidc of BOOLS) {
          for (const s of runFlow({ ...d, attack, oidc })) {
            if (s.msg) expect(edges.has(`${s.msg.from}>${s.msg.to}`), `${attack}: ${s.msg.from} to ${s.msg.to}`).toBe(true);
            if (attack === 'none') expect(s.att).toEqual([]);
          }
        }
      }
    }
  });

  it('no attacker box is needed in the normal flow: nothing in it touches the attacker', () => {
    for (const s of runFlow(DEFAULT_OPTS)) {
      expect(s.msg?.from).not.toBe('attacker');
      expect(s.msg?.to).not.toBe('attacker');
    }
  });

  it('the attacker\'s chips hold what the model says: the code it grabbed, and tokens only if the server issued them', () => {
    const leak = runFlow({ pkce: false, state: true, exactRedirect: true, attack: 'steal', oidc: true });
    expect(leak.at(-1)!.att).toEqual(['code', 'access_token', 'refresh_token', 'id_token']);
    const blocked = runFlow({ ...DEFAULT_OPTS, attack: 'steal' });
    expect(blocked.at(-1)!.att).toEqual(['code']);
    expect(blocked.at(-1)!.photosLeaked).toBe(false);
  });

  it('a status never outlives its premise: "signed in" appears only once an id_token has been issued, and only with the openid scope', () => {
    for (const oidc of BOOLS) {
      const steps = runFlow({ ...DEFAULT_OPTS, oidc });
      const firstSigned = steps.findIndex((s) => s.signedIn);
      const tokenStep = steps.findIndex((s) => s.id === 'tokens');
      if (oidc) {
        expect(firstSigned).toBeGreaterThan(tokenStep);
        expect(steps[firstSigned].app).toContain('id_token');
      } else {
        expect(firstSigned).toBe(-1);
      }
    }
    for (const attack of ['steal', 'forge', 'redirect'] as const) for (const s of runFlow({ ...DEFAULT_OPTS, attack })) expect(s.signedIn).toBe(false);
  });

  it('every switch changes what is on screen in every mode, except PKCE and state in the redirect attack, which the caption says is out of the picture: frames and captions differ when it flips', () => {
    const render = (o: Opts) => JSON.stringify(buildFrames(o).map((f) => ({ ...f, say: captionText(f.say) })));
    for (const attack of ATTACK_MODES) {
      for (const key of ['pkce', 'state', 'exactRedirect', 'oidc'] as const) {
        const on = render({ ...DEFAULT_OPTS, attack, [key]: true });
        const off = render({ ...DEFAULT_OPTS, attack, [key]: false });
        // In the redirect attack the attacker wrote the request, challenge included, so the app's own PKCE and state settings are out of the picture:
        // the caption on the crafted link says so, and the run is the same either way.
        if (attack === 'redirect' && (key === 'pkce' || key === 'state')) expect(on).toBe(off);
        else expect(on, `${attack} / ${key}`).not.toBe(off);
      }
    }
  });
});

describe('captions say what the model decided', () => {
  const text = (o: Opts, id: string) => {
    const f = buildFrames(o).find((x) => x.id === id);
    if (!f) throw new Error(`no ${id} frame`);
    return captionText(f.say, { strict: true });
  };

  it('every frame of every run has a caption without glued sentences', () => {
    for (const attack of ATTACK_MODES) for (const d of ALL_DEFENCES) for (const f of buildFrames({ ...d, attack, oidc: true })) expect(captionText(f.say, { strict: true }).length).toBeGreaterThan(5);
  });

  it('the redirect_uri caption follows the matching rule, and the callback caption follows the state setting', () => {
    expect(text(DEFAULT_OPTS, 'arrive')).toContain('has to match exactly');
    expect(text({ ...DEFAULT_OPTS, exactRedirect: false }, 'arrive')).toContain('any URL under photoprint.app');
    expect(text(DEFAULT_OPTS, 'callback')).toContain('checks that state matches');
    expect(text({ ...DEFAULT_OPTS, state: false }, 'callback')).toContain('State check is off');
  });

  it('the refusal captions name the server\'s own reason', () => {
    expect(text({ ...DEFAULT_OPTS, attack: 'steal' }, 'blocked-token')).toContain('no code_verifier was sent');
    expect(text({ ...DEFAULT_OPTS, attack: 'forge', state: false }, 'forge-blocked')).toContain('no code_verifier was sent');
    expect(text({ ...DEFAULT_OPTS, attack: 'redirect' }, 'redirect-error')).toContain('Refused at /authorize');
  });

  it('the hijack caption names the attacker\'s account, and the leak caption on the redirect run says PKCE did not help', () => {
    expect(text({ ...DEFAULT_OPTS, attack: 'forge', state: false, pkce: false }, 'hijacked')).toContain(ATTACKER);
    expect(text({ ...DEFAULT_OPTS, attack: 'redirect', exactRedirect: false }, 'leak-photos')).toContain('PKCE did not help');
    expect(text({ ...DEFAULT_OPTS, attack: 'steal', pkce: false }, 'leak-photos')).toContain('Turn PKCE on');
  });

  it('the URL bar shows state and the challenge only when the app sends them, and the redirect_uri it really sends', () => {
    const params = (o: Opts) => Object.fromEntries(authorizeUrl(new Client(o).begin()).params);
    expect(Object.keys(params(DEFAULT_OPTS))).toEqual(['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method']);
    expect(params({ ...DEFAULT_OPTS, state: false, pkce: false })).not.toHaveProperty('state');
    expect(params(DEFAULT_OPTS).redirect_uri).toBe(REGISTERED_REDIRECT);
    expect(params({ ...DEFAULT_OPTS, oidc: false }).scope).toBe('photos.read');
    expect(params(DEFAULT_OPTS).scope).toBe('openid%20photos.read');
  });

  it('payload-free: no frame, caption or URL in any run matches a credential shape, and every code, verifier and token is a fake', () => {
    for (const attack of ATTACK_MODES) {
      for (const d of ALL_DEFENCES) {
        const frames = buildFrames({ ...d, attack, oidc: true });
        const blob = JSON.stringify(frames.map((f) => ({ ...f, say: captionText(f.say) })));
        expect(scan(blob, REPO_RULES), `${attack} ${JSON.stringify(d)}`).toEqual([]);
      }
    }
  });
});

describe('try-this, from the lesson as it loads (PKCE, state and exact redirect_uri on, no attacker, openid scope)', () => {
  it('try-this 1: the code goes from the URL bar to the back channel, and the verifier stays in the app\'s chips until /token', () => {
    const steps = runFlow(DEFAULT_OPTS);
    const back = steps.find((s) => s.id === 'code-back')!;
    expect(back.url!.params.some(([k]) => k === 'code')).toBe(true);
    const token = steps.find((s) => s.id === 'token')!;
    expect(token.msg!.kind).toBe('back');
    expect(token.msg!.label).toBe('POST /token code + verifier');
    const from = steps.findIndex((x) => x.id === 'verifier');
    const until = steps.findIndex((x) => x.id === 'tokens');
    for (const s of steps.slice(from, until)) expect(s.app, s.id).toContain('code_verifier');
    for (const s of steps.slice(until)) expect(s.app, s.id).not.toContain('code_verifier');
    // The verifier is never part of a front-channel message or URL.
    for (const s of steps) if (s.msg?.kind === 'front') expect(s.msg.label.toLowerCase()).not.toContain('verifier');
    for (const s of steps) expect(JSON.stringify(s.url)).not.toContain(VICTIM_VERIFIER);
    expect(steps.at(-1)!.outcome).toBeNull();
    expect(steps.find((s) => s.id === 'api-ok')!.outcome).toBe('printed');
  });

  it('try-this 2: with the attacker stealing the code, PKCE off leaks the photos and PKCE on rejects the code at /token', () => {
    expect(summarize({ ...DEFAULT_OPTS, attack: 'steal', pkce: false })).toEqual({ outcome: 'leaked', blockedAt: null });
    expect(summarize({ ...DEFAULT_OPTS, attack: 'steal' })).toEqual({ outcome: 'blocked', blockedAt: 'token' });
  });

  it('try-this 3: forging the callback works with State check and PKCE both off, and either one back on rejects it', () => {
    const forge = (over: Partial<Defences>) => summarize({ ...DEFAULT_OPTS, attack: 'forge', ...over });
    expect(forge({ state: false, pkce: false })).toEqual({ outcome: 'hijacked', blockedAt: null });
    expect(forge({ state: true, pkce: false })).toEqual({ outcome: 'blocked', blockedAt: 'callback' });
    expect(forge({ state: false, pkce: true })).toEqual({ outcome: 'blocked', blockedAt: 'token' });
  });

  it('try-this 4: a loose redirect_uri sends the code to the attacker even with PKCE on, and an exact one refuses before any code exists', () => {
    expect(summarize({ ...DEFAULT_OPTS, attack: 'redirect', exactRedirect: false })).toEqual({ outcome: 'leaked', blockedAt: null });
    const exact = runFlow({ ...DEFAULT_OPTS, attack: 'redirect' });
    expect(summarize({ ...DEFAULT_OPTS, attack: 'redirect' })).toEqual({ outcome: 'blocked', blockedAt: 'authorize' });
    expect(exact.map((s) => s.id)).not.toContain('code-to-attacker');
    expect(exact.map((s) => s.id)).not.toContain('redeem');
    expect(exact.some((s) => s.att.includes('code'))).toBe(false);
  });

  it('try-this 5: plain photos.read gives no id_token and no "signed in as"; the default scope does', () => {
    const plain = runFlow({ ...DEFAULT_OPTS, oidc: false });
    expect(plain.find((s) => s.id === 'tokens')!.app).toEqual(['access_token', 'refresh_token']);
    expect(plain.some((s) => s.signedIn)).toBe(false);
    const openid = runFlow(DEFAULT_OPTS);
    expect(openid.find((s) => s.id === 'tokens')!.app).toContain('id_token');
    expect(openid.some((s) => s.signedIn)).toBe(true);
    expect(ATTACKER_STATE).not.toBe(VICTIM_STATE);
  });
});

describe('the lesson text', () => {
  it('has five try-this entries, and the quiz question about the loose redirect matches the model', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(summarize({ ...DEFAULT_OPTS, attack: 'redirect', exactRedirect: false }).outcome).toBe('leaked');
  });
});
