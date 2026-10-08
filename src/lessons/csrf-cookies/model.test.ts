import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, FORGE_KINDS, MODES, activeDefences, allConfigs, cookieSent, evaluate, serverLines,
  type Config, type ForgeKind, type StopPoint,
} from './model';

const cfg = (p: Partial<Config>): Config => ({ ...DEFAULT_CONFIG, ...p });

describe('the SameSite rule (the same one browser-storage teaches)', () => {
  // [kind, none, lax, strict]
  const table: [ForgeKind, boolean, boolean, boolean][] = [
    ['link', true, true, false], // cross-site top-level GET navigation: Lax is sent
    ['form', true, false, false], // cross-site POST: Lax is not sent
    ['fetch', true, false, false], // cross-site POST from a script: Lax is not sent
  ];
  for (const [kind, none, lax, strict] of table) {
    it(`${kind}: None ${none}, Lax ${lax}, Strict ${strict}`, () => {
      expect(cookieSent('none', kind)).toBe(none);
      expect(cookieSent('lax', kind)).toBe(lax);
      expect(cookieSent('strict', kind)).toBe(strict);
    });
  }
  it('covers every kind', () => {
    expect(table.map((t) => t[0]).sort()).toEqual([...FORGE_KINDS].sort());
  });
});

describe('worked scenarios', () => {
  const cases: { name: string; c: Partial<Config>; stoppedAt: StopPoint | null; harm: boolean; cookie: boolean }[] = [
    { name: 'no defence, SameSite=None, form', c: {}, stoppedAt: null, harm: true, cookie: true },
    { name: 'Lax stops a form POST (arrives logged out)', c: { mode: 'lax' }, stoppedAt: 'no-credential', harm: false, cookie: false },
    { name: 'Lax does not stop a link click (GET)', c: { mode: 'lax', kind: 'link' }, stoppedAt: null, harm: true, cookie: true },
    { name: 'Strict stops a link click', c: { mode: 'strict', kind: 'link' }, stoppedAt: 'no-credential', harm: false, cookie: false },
    { name: 'a token stops a form with the cookie attached', c: { token: true }, stoppedAt: 'token', harm: false, cookie: true },
    { name: 'the Origin check fires before the token check', c: { token: true, origin: true }, stoppedAt: 'origin', harm: false, cookie: true },
    { name: 'the header check stops a form', c: { header: true }, stoppedAt: 'header', harm: false, cookie: true },
    { name: 'the header check never runs on a GET link click', c: { header: true, kind: 'link' }, stoppedAt: null, harm: true, cookie: true },
    { name: 'the header makes a script ask first, and be refused', c: { header: true, kind: 'fetch' }, stoppedAt: 'preflight', harm: false, cookie: false },
    { name: 'without the header a script POST goes through like a form', c: { kind: 'fetch' }, stoppedAt: null, harm: true, cookie: true },
    { name: 'a bearer token is never attached by the browser', c: { auth: 'bearer' }, stoppedAt: 'no-credential', harm: false, cookie: false },
    { name: 'Lax plus a token: stopped earlier, by the missing cookie', c: { mode: 'lax', token: true }, stoppedAt: 'no-credential', harm: false, cookie: false },
    { name: 'Lax plus a token on a link click: middleware skips GET, so the change still goes through', c: { mode: 'lax', kind: 'link', token: true }, stoppedAt: null, harm: true, cookie: true },
    { name: 'the Referer check does stop a link click', c: { mode: 'lax', kind: 'link', origin: true }, stoppedAt: 'origin', harm: false, cookie: true },
  ];
  for (const t of cases) {
    it(t.name, () => {
      const o = evaluate(cfg(t.c));
      expect(o.stoppedAt).toBe(t.stoppedAt);
      expect(o.harm).toBe(t.harm);
      expect(o.cookieSent).toBe(t.cookie);
    });
  }
});

describe('every combination of auth, SameSite mode, request kind and the three server defences', () => {
  const all = allConfigs();

  it('is 2 × 3 × 3 × 2 × 2 × 2 = 144 distinct configurations', () => {
    expect(all.length).toBe(144);
    expect(new Set(all.map((c) => JSON.stringify(c))).size).toBe(144);
  });

  it('harm and a stopping point are exclusive and exhaustive', () => {
    for (const c of all) {
      const o = evaluate(c);
      expect(o.harm).toBe(o.stoppedAt === null);
    }
  });

  it('harm needs a credential and no server defence at all', () => {
    for (const c of all) {
      const o = evaluate(c);
      if (o.harm) {
        expect(o.credential).toBe(true);
        expect(Object.values(activeDefences(c)).some(Boolean)).toBe(false);
      }
      if (!Object.values(activeDefences(c)).some(Boolean) && o.credential) expect(o.harm).toBe(true);
    }
  });

  it('a bearer token never travels by itself, so SameSite and the kind of request change nothing about it', () => {
    for (const c of all.filter((x) => x.auth === 'bearer')) {
      const o = evaluate(c);
      expect(o.credential).toBe(false);
      expect(o.harm).toBe(false);
      expect(o.stoppedAt).toBe(c.header && c.kind === 'fetch' ? 'preflight' : 'no-credential');
      for (const mode of MODES) expect(evaluate({ ...c, mode })).toEqual(o);
    }
  });

  it('only a script that must add the custom header gets as far as a preflight, and then nothing is sent', () => {
    for (const c of all) {
      const o = evaluate(c);
      expect(o.preflight).toBe(c.header && c.kind === 'fetch');
      expect(o.sent).toBe(!o.preflight);
      if (o.preflight) expect(o.stoppedAt).toBe('preflight');
    }
  });

  it('turning any server defence on never creates harm', () => {
    for (const c of all) {
      for (const key of ['token', 'origin', 'header'] as const) {
        if (!evaluate(c).harm) expect(evaluate({ ...c, [key]: true }).harm).toBe(false);
      }
    }
  });

  it('a cookie is attached only for session-cookie auth and a mode that allows it', () => {
    for (const c of all) {
      const o = evaluate(c);
      if (o.preflight) continue;
      expect(o.cookieSent).toBe(c.auth === 'cookie' && cookieSent(c.mode, c.kind));
    }
  });
});

describe('GET requests', () => {
  it('never run the token or custom-header check, whatever the toggles say', () => {
    for (const c of allConfigs().filter((x) => x.kind === 'link')) {
      const on = activeDefences(c);
      expect(on.token).toBe(false);
      expect(on.header).toBe(false);
      expect(on.origin).toBe(c.origin);
    }
  });

  it('keep both checks for a POST', () => {
    for (const c of allConfigs().filter((x) => x.kind !== 'link')) {
      const on = activeDefences(c);
      expect(on.token).toBe(c.token);
      expect(on.header).toBe(c.header);
    }
  });

  it('read the address from the query string and the Referer, a POST from the body and Origin', () => {
    expect(serverLines('link').join(' ')).toContain('request.query.to');
    expect(serverLines('link').join(' ')).toContain('request.referer');
    expect(serverLines('form').join(' ')).toContain('request.body.email');
    expect(serverLines('form').join(' ')).toContain('request.origin');
  });
});
