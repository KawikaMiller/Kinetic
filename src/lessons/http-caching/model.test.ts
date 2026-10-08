import { describe, expect, it } from 'vitest';
import {
  BLANK, DAY, HEAD_BYTES, INITIAL_AGE_OF_CONTENT, PRESETS, cacheControl, freshnessLifetime, replay, sharedKey, staleAllowed, storable,
  strongMatch, weakMatch, type Event, type Policy, type Resource, type UserId,
} from './model';

const req = (t: number, user: UserId = 'A', reload = false): Event => ({ kind: 'request', t, user, reload });
const deploy = (t: number): Event => ({ kind: 'deploy', t });
const RES: Resource = { path: '/x', body: 10_000, perUser: false };
const run = (p: Policy, events: Event[], res = RES) => replay(p, res, events).outcomes;

describe('storage (RFC 9111 §3, §5.2.2)', () => {
  const cases: [Partial<Policy>, boolean, boolean][] = [
    // directives, stored by a browser, stored by a shared cache
    [{ maxAge: 60 }, true, true],
    [{ noStore: true, maxAge: 60 }, false, false],
    [{ private: true, maxAge: 60 }, true, false],
    [{ private: true, public: true, maxAge: 60 }, true, false],
    [{ noCache: true }, true, true],
    [{ noCache: true, noStore: true }, false, false],
    [{ public: true }, true, true],
  ];
  it.each(cases)('%o → browser %s, shared %s', (d, browser, shared) => {
    const p = { ...BLANK, ...d };
    expect(storable(p, 'private').ok).toBe(browser);
    expect(storable(p, 'shared').ok).toBe(shared);
  });

  it('no-store is never stored, end to end: every request is a full trip and every cache stays empty', () => {
    const { outcomes, world } = replay({ ...BLANK, noStore: true, maxAge: 600, etag: 'strong' }, RES, [req(0), req(10), req(20, 'B')]);
    expect(outcomes.map((o) => o.kind)).toEqual(['not-stored', 'not-stored', 'not-stored']);
    expect(world.browsers).toEqual({ A: null, B: null });
    expect(world.shared.size).toBe(0);
  });
});

describe('freshness lifetime (RFC 9111 §4.2.1)', () => {
  it('shared caches use s-maxage first, browsers use max-age', () => {
    const p = { ...BLANK, maxAge: 60, sMaxAge: 600 };
    expect(freshnessLifetime(p, 'shared', null).seconds).toBe(600);
    expect(freshnessLifetime(p, 'private', null).seconds).toBe(60);
  });
  it('with no max-age, s-maxage still only applies to shared caches', () => {
    const p = { ...BLANK, sMaxAge: 600 };
    expect(freshnessLifetime(p, 'shared', null).seconds).toBe(600);
    expect(freshnessLifetime(p, 'private', null).seconds).toBe(0);
  });
  it('falls back to the heuristic: 10% of the time since Last-Modified (§4.2.2)', () => {
    expect(freshnessLifetime({ ...BLANK, lastModified: true }, 'private', 30 * DAY).seconds).toBe(3 * DAY);
  });
  it('is zero with no max-age and no Last-Modified', () => {
    expect(freshnessLifetime(BLANK, 'shared', null).seconds).toBe(0);
  });
});

describe('stale serving (RFC 5861, RFC 9111 §5.2.2.2 and §5.2.2.10)', () => {
  const swr = { ...BLANK, maxAge: 60, swr: 100 };
  it('is allowed only inside the stale-while-revalidate window', () => {
    expect(staleAllowed(swr, 'private', 61, 60).ok).toBe(true);
    expect(staleAllowed(swr, 'private', 159, 60).ok).toBe(true);
    expect(staleAllowed(swr, 'private', 160, 60).ok).toBe(false);
  });
  it('is never allowed without stale-while-revalidate', () => {
    expect(staleAllowed({ ...BLANK, maxAge: 60 }, 'private', 61, 60).ok).toBe(false);
  });
  it('must-revalidate forbids it, even inside the window', () => {
    expect(staleAllowed({ ...swr, mustRevalidate: true }, 'private', 61, 60).ok).toBe(false);
    expect(staleAllowed({ ...swr, mustRevalidate: true }, 'shared', 61, 60).ok).toBe(false);
  });
  it('s-maxage implies proxy-revalidate: shared caches may not serve stale, browsers still may', () => {
    const p = { ...swr, sMaxAge: 60 };
    expect(staleAllowed(p, 'shared', 61, 60).ok).toBe(false);
    expect(staleAllowed(p, 'private', 61, 60).ok).toBe(true);
  });
});

describe('ETag comparison (the RFC 9110 §8.8.3.2 table)', () => {
  const table: [string, string, boolean, boolean][] = [
    ['W/"1"', 'W/"1"', false, true],
    ['W/"1"', 'W/"2"', false, false],
    ['W/"1"', '"1"', false, true],
    ['"1"', '"1"', true, true],
  ];
  it.each(table)('%s vs %s: strong %s, weak %s', (a, b, strong, weak) => {
    expect(strongMatch(a, b)).toBe(strong);
    expect(weakMatch(a, b)).toBe(weak);
    expect(strongMatch(b, a)).toBe(strong);
    expect(weakMatch(b, a)).toBe(weak);
  });

  it('If-None-Match uses the weak comparison: a weak ETag still revalidates to 304', () => {
    const o = run({ ...BLANK, noCache: true, etag: 'weak' }, [req(0), req(10)]);
    expect(o[1].kind).toBe('revalidated-304');
    expect(o[1].messages.find((m) => m.from === 'browser')!.note).toBe('If-None-Match: W/"v1"');
  });
});

describe('revalidation', () => {
  it('a 304 carries no body; a changed resource comes back as a full 200', () => {
    const o = run({ ...BLANK, noCache: true, etag: 'strong' }, [req(0), req(10), deploy(20), req(30)]);
    expect(o.map((x) => x.kind)).toEqual(['miss', 'revalidated-304', 'revalidated-200']);
    expect(o[0].originBytes).toBe(HEAD_BYTES + RES.body);
    expect(o[1].originBytes).toBe(HEAD_BYTES);
    expect(o[1].clientBytes).toBe(HEAD_BYTES);
    expect(o[2].originBytes).toBe(HEAD_BYTES + RES.body);
    expect(o[2].version).toBe(2);
  });

  it('without an ETag, Last-Modified validates with If-Modified-Since', () => {
    const o = run({ ...BLANK, noCache: true, lastModified: true }, [req(0), req(10), deploy(20), req(30)]);
    expect(o.map((x) => x.kind)).toEqual(['miss', 'revalidated-304', 'revalidated-200']);
    expect(o[1].messages[0].note).toBe('If-Modified-Since');
  });

  it('with no validator at all, a stale copy means a full unconditional trip', () => {
    const o = run({ ...BLANK, maxAge: 60 }, [req(0), req(100)]);
    expect(o[1].kind).toBe('miss');
    expect(o[1].originStatuses).toEqual([200]);
  });

  it('no-cache revalidates even a copy that is still fresh', () => {
    const o = run({ ...BLANK, noCache: true, maxAge: 600, etag: 'strong' }, [req(0), req(1)]);
    expect(o[1].kind).toBe('revalidated-304');
    expect(o[1].originStatuses).toEqual([304]);
  });
});

describe('the shared cache and Age', () => {
  it('one user\'s request warms it for the next; a browser copy carries the shared copy\'s age', () => {
    const p: Policy = { ...BLANK, maxAge: 60, etag: 'strong' };
    expect(replay(p, RES, [req(0, 'A'), req(40, 'B')]).world.browsers.B!.ageAtStore).toBe(40);
    const { outcomes } = replay(p, RES, [req(0, 'A'), req(40, 'B'), req(81, 'B')]);
    expect(outcomes[1]).toMatchObject({ kind: 'fresh', answeredBy: 'shared', originBytes: 0 });
    // Ben's copy was 40 s old when he got it, so at 81 s it is 81 s old: stale, though he fetched it 41 s ago.
    expect(outcomes[2].kind).not.toBe('fresh');
  });

  it('Vary keys the shared cache by the listed request headers', () => {
    expect(sharedKey('/x', [], 'A')).toBe(sharedKey('/x', [], 'B'));
    expect(sharedKey('/x', ['accept-encoding'], 'A')).not.toBe(sharedKey('/x', ['accept-encoding'], 'B'));
    expect(sharedKey('/x', ['accept-encoding'], 'A')).toBe('/x | accept-encoding=br');
    const p = { ...BLANK, public: true, maxAge: 600, vary: ['accept-encoding' as const] };
    const o = run(p, [req(0, 'A'), req(10, 'B')]);
    expect(o[1].kind).toBe('miss');
    const same = run({ ...p, vary: [] }, [req(0, 'A'), req(10, 'B')]);
    expect(same[1]).toMatchObject({ kind: 'fresh', answeredBy: 'shared' });
  });
});

describe('the presets', () => {
  it('hashed asset: a year of fresh hits, and immutable skips revalidation on reload', () => {
    const { policy, resource } = PRESETS.asset;
    expect(cacheControl(policy)).toBe('max-age=31536000, immutable');
    const o = run(policy, [req(0), req(DAY), req(DAY, 'B'), req(2 * DAY, 'A', true)], resource);
    expect(o.map((x) => [x.kind, x.answeredBy])).toEqual([['miss', 'origin'], ['fresh', 'browser'], ['fresh', 'shared'], ['fresh', 'browser']]);
    const plain = run({ ...policy, immutable: false }, [req(0), req(DAY, 'A', true)], resource);
    // A reload sends max-age=0, so even a fresh copy in the shared cache is revalidated with the origin (RFC 9111 §5.2.1.1).
    expect(plain[1]).toMatchObject({ kind: 'revalidated-304', answeredBy: 'origin' });
  });

  it('HTML page: no-cache always revalidates', () => {
    const { policy, resource } = PRESETS.html;
    expect(cacheControl(policy)).toBe('no-cache');
    const o = run(policy, [req(0), req(5), req(DAY)], resource);
    expect(o.slice(1).every((x) => x.kind === 'revalidated-304')).toBe(true);
  });

  it('per-user dashboard: private keeps Ada\'s page out of the shared cache', () => {
    const { policy, resource } = PRESETS.dashboard;
    const { outcomes, world } = replay(policy, resource, [req(0, 'A'), req(10, 'B')]);
    expect(outcomes[1]).toMatchObject({ kind: 'miss', owner: 'B', leak: false });
    expect(outcomes.some((o) => o.sharedStoredPersonal)).toBe(false);
    expect(world.shared.size).toBe(0);
    expect(world.browsers.A!.owner).toBe('A');
  });

  it('…and forgetting private serves Ada\'s page to Ben from the shared cache', () => {
    const { policy, resource } = PRESETS.dashboard;
    const o = run({ ...policy, private: false }, [req(0, 'A'), req(10, 'B')], resource);
    expect(o[0].sharedStoredPersonal).toBe(true);
    expect(o[1]).toMatchObject({ answeredBy: 'shared', owner: 'A', leak: true });
    expect(o[1].messages.at(-1)).toMatchObject({ tone: 'bad', note: "Ada's page!" });
  });

  it('…while Vary: Cookie (or private) would have kept them apart', () => {
    const { policy, resource } = PRESETS.dashboard;
    const o = run({ ...policy, private: false, vary: ['cookie'] }, [req(0, 'A'), req(10, 'B')], resource);
    expect(o[1]).toMatchObject({ owner: 'B', leak: false });
  });

  it('API with Vary: after max-age, the browser serves stale and refreshes in the background', () => {
    const { policy, resource } = PRESETS.api;
    const o = run(policy, [req(0, 'A'), req(10, 'B'), req(120, 'A'), req(10_000, 'A')], resource);
    expect(o[1].kind).toBe('miss');
    expect(o[2]).toMatchObject({ kind: 'stale', answeredBy: 'browser' });
    expect(o[2].messages[0]).toMatchObject({ from: 'browser', to: 'browser', tone: 'orange' });
    expect(o[2].messages.slice(1).every((m) => m.background)).toBe(true);
    expect(o[3].kind).toBe('revalidated-304');
  });
});

describe('a stale browser copy with nothing in the shared cache (review: the conditional request must reach the origin)', () => {
  const { policy, resource } = PRESETS.dashboard;

  it('the dashboard revalidates to a 304 of headers only, not a full 200', () => {
    const { outcomes, world } = replay(policy, resource, [req(0, 'A'), req(61, 'A')]);
    expect(outcomes[1]).toMatchObject({ kind: 'revalidated-304', answeredBy: 'origin', originStatuses: [304], originBytes: HEAD_BYTES, clientBytes: HEAD_BYTES });
    const toOrigin = outcomes[1].messages.find((m) => m.from === 'shared' && m.to === 'origin')!;
    expect(toOrigin.label).toBe('GET /dashboard (conditional)');
    expect(toOrigin.note).toBe('If-None-Match: "v1-a"');
    expect(outcomes[1].messages.find((m) => m.from === 'origin')!.label).toBe('304 Not Modified');
    // Nothing was stored in the shared cache, and the browser copy was refreshed.
    expect(world.shared.size).toBe(0);
    expect(world.browsers.A!.storedAt).toBe(61);
  });

  it('a changed resource still comes back as a full 200 through the same path', () => {
    const o = run(policy, [req(0, 'A'), deploy(30), req(61, 'A')], resource);
    expect(o[1]).toMatchObject({ kind: 'revalidated-200', originStatuses: [200], originBytes: HEAD_BYTES + resource.body, version: 2 });
  });

  it('holds for no-store-free policies that a shared cache will not keep, across validators', () => {
    for (const etag of ['strong', 'weak'] as const) {
      const p: Policy = { ...BLANK, private: true, maxAge: 60, etag };
      const o = run(p, [req(0, 'A'), req(100, 'A')], resource);
      expect(o[1]).toMatchObject({ kind: 'revalidated-304', originBytes: HEAD_BYTES });
    }
    const lm: Policy = { ...BLANK, private: true, maxAge: 60, lastModified: true };
    expect(run(lm, [req(0, 'A'), req(100, 'A')], resource)[1]).toMatchObject({ kind: 'revalidated-304', originBytes: HEAD_BYTES });
  });

  it('a reload of a page the shared cache holds fresh is revalidated at the origin, for a hashed asset only when not immutable', () => {
    const base: Policy = { ...BLANK, public: true, maxAge: 600, etag: 'strong' };
    const o = run(base, [req(0, 'A'), req(10, 'B', true)]);
    expect(o[1]).toMatchObject({ kind: 'revalidated-304', answeredBy: 'origin' });
    expect(o[1].trail.some((r) => r.layer === 'Shared cache' && r.check === 'Reload')).toBe(true);
    const immutable = run({ ...base, immutable: true }, [req(0, 'A'), req(10, 'A', true)]);
    expect(immutable[1]).toMatchObject({ kind: 'fresh', answeredBy: 'browser' });
  });
});

describe('s-maxage and stale serving, with the on-screen hedge', () => {
  it('keeps the RFC 9111 rule but says many CDNs differ', () => {
    const why = staleAllowed({ ...BLANK, sMaxAge: 60, swr: 100 }, 'shared', 61, 60).why;
    expect(why).toContain('RFC 9111 §5.2.2.10');
    expect(why).toContain('Many CDNs serve stale under s-maxage + stale-while-revalidate anyway');
  });
});

describe('the heuristic, end to end', () => {
  it('Last-Modified 30 days ago and no max-age: fresh for 3 days', () => {
    expect(INITIAL_AGE_OF_CONTENT).toBe(30 * DAY);
    const o = run({ ...BLANK, lastModified: true }, [req(0), req(2 * DAY), req(4 * DAY)]);
    expect(o[1].kind).toBe('fresh');
    expect(o[2].kind).toBe('revalidated-304');
  });
});
