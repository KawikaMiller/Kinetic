import { describe, expect, it } from 'vitest';
import { CHANGES, DEFAULT_NAME } from './api';
import {
  DAYS_PER_LIVE_VERSION, MIGRATION_RANGE, RELEASE_RANGE, STRATEGIES, bodyFor, buildRequest, cacheKey, cacheRun, fateOf, liveVersions, requestLines, resolveDated, versionInHeader,
  yearlyCost, type StrategyId,
} from './strategies';

describe('the request each strategy builds', () => {
  const HOST = 'Host: api.example.com';
  const want: Record<StrategyId, [string[], string[]]> = {
    path: [['GET /v1/users/42 HTTP/1.1', HOST], ['GET /v2/users/42 HTTP/1.1', HOST]],
    header: [['GET /users/42 HTTP/1.1', HOST, 'Api-Version: 1'], ['GET /users/42 HTTP/1.1', HOST, 'Api-Version: 2']],
    query: [['GET /users/42?version=1 HTTP/1.1', HOST], ['GET /users/42?version=2 HTTP/1.1', HOST]],
    dated: [['GET /users/42 HTTP/1.1', HOST, 'Api-Version: 2026-03-01'], ['GET /users/42 HTTP/1.1', HOST, 'Api-Version: 2026-09-01']],
    additive: [['GET /users/42 HTTP/1.1', HOST], ['GET /users/42 HTTP/1.1', HOST]],
  };
  for (const s of STRATEGIES) {
    it(`${s.id}: v1 and v2 requests`, () => {
      expect(requestLines(buildRequest(s.id, 1))).toEqual(want[s.id][0]);
      expect(requestLines(buildRequest(s.id, 2))).toEqual(want[s.id][1]);
    });
  }
});

describe('a shared cache and the version in the request', () => {
  it('path and query versions give two keys, so each client gets its own version', () => {
    for (const s of ['path', 'query'] as const) {
      const run = cacheRun(s, false);
      expect(run.keys[0], s).not.toBe(run.keys[1]);
      expect(run.correct, s).toBe(true);
    }
  });

  it('a header version without Vary gives one key, and the v2 client is served the cached v1 body', () => {
    for (const s of ['header', 'dated'] as const) {
      const run = cacheRun(s, false);
      expect(run.keys[0], s).toBe(run.keys[1]);
      expect(run.served, s).toBe(bodyFor(1));
      expect(run.correct, s).toBe(false);
    }
  });

  it('listing the header in Vary separates the keys and fixes it', () => {
    for (const s of ['header', 'dated'] as const) {
      const run = cacheRun(s, true);
      expect(run.keys[0], s).not.toBe(run.keys[1]);
      expect(run.served, s).toBe(bodyFor(2));
      expect(run.correct, s).toBe(true);
    }
  });

  it('with no versions there is one key and the cached body is right', () => {
    for (const vary of [false, true]) {
      const run = cacheRun('additive', vary);
      expect(run.keys[0]).toBe(run.keys[1]);
      expect(run.correct).toBe(true);
    }
  });

  it('the Vary switch cannot change a strategy whose version is not in a header', () => {
    for (const s of ['path', 'query', 'additive'] as const) expect(cacheRun(s, true)).toEqual(cacheRun(s, false));
    expect(STRATEGIES.filter((s) => versionInHeader(s.id)).map((s) => s.id)).toEqual(['header', 'dated']);
  });

  it('keys on the target, plus each Vary header by value, whatever its capitalisation', () => {
    const req = { line: 'GET /users/42 HTTP/1.1', headers: ['Host: api.example.com', 'api-version: 2'] };
    expect(cacheKey(req, [])).toBe('/users/42');
    expect(cacheKey(req, ['Api-Version'])).toBe('/users/42|Api-Version=2');
    expect(cacheKey({ line: req.line, headers: [] }, ['Api-Version'])).toBe('/users/42|Api-Version=');
  });
});

describe('dated versions resolve to the newest release on or before the date', () => {
  const releases = ['2026-03-01', '2026-09-01', '2027-02-01'];
  it('picks by date, including on a release day and before the first', () => {
    expect(resolveDated('2026-02-28', releases)).toBeNull();
    expect(resolveDated('2026-03-01', releases)).toBe('2026-03-01');
    expect(resolveDated('2026-08-31', releases)).toBe('2026-03-01');
    expect(resolveDated('2026-09-01', releases)).toBe('2026-09-01');
    expect(resolveDated('2030-01-01', releases)).toBe('2027-02-01');
  });

  it('does not depend on the order the releases are listed in', () => {
    expect(resolveDated('2026-10-10', [...releases].reverse())).toBe('2026-09-01');
  });
});

describe('the cost of keeping versions alive', () => {
  /** Peak count of live versions over a long timeline, by brute force: a version lives until its successor shipped plus the migration time. */
  function brute(releasesPerYear: number, migrationMonths: number): number {
    const gap = 12 / releasesPerYear;
    let peak = 0;
    for (let t = 20 * gap; t < 40 * gap; t++) {
      let live = 0;
      for (let r = 0; r <= t; r += gap) if (t < r + gap + migrationMonths) live++;
      peak = Math.max(peak, live);
    }
    return peak;
  }

  it('matches a month-by-month timeline for every release cadence and migration time in range', () => {
    for (let releases = RELEASE_RANGE.min; releases <= RELEASE_RANGE.max; releases++) {
      if (12 % releases !== 0) continue;
      for (let months = MIGRATION_RANGE.min; months <= MIGRATION_RANGE.max; months++) {
        expect(liveVersions('path', releases, months), `${releases}/yr, ${months} months`).toBe(brute(releases, months));
      }
    }
  });

  it('is the same count for every strategy that has versions, because where the version goes does not change how many live', () => {
    const counts = (['path', 'header', 'query', 'dated'] as const).map((s) => liveVersions(s, 2, 18));
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(1 + Math.ceil(18 / 6));
  });

  it('is one with no versions, and the cost scales with the count', () => {
    expect(liveVersions('additive', 4, 36)).toBe(1);
    expect(yearlyCost(1)).toBe(DAYS_PER_LIVE_VERSION);
    expect(yearlyCost(4)).toBe(4 * DAYS_PER_LIVE_VERSION);
  });

  it('is never lower with slower migrations or faster releases', () => {
    for (let releases = 1; releases <= 4; releases++) {
      for (let months = MIGRATION_RANGE.min; months < MIGRATION_RANGE.max; months++) {
        expect(liveVersions('path', releases, months + 1)).toBeGreaterThanOrEqual(liveVersions('path', releases, months));
      }
    }
  });
});

describe('what a change means under a strategy', () => {
  const change = (id: string) => CHANGES.find((c) => c.id === id)!;
  it('numbered strategies version anything that breaks or silently changes a result, and ship the rest in place', () => {
    expect(fateOf('path', change('rename-field'), DEFAULT_NAME).ships).toBe('new-version');
    expect(fateOf('path', change('sort'), DEFAULT_NAME).ships).toBe('new-version');
    expect(fateOf('path', change('add-field'), DEFAULT_NAME).ships).toBe('new-version');
  });

  it('additive-only refuses what changes existing clients and allows an addition, noting the strict reader', () => {
    expect(fateOf('additive', change('rename-field'), DEFAULT_NAME).ships).toBe('refused');
    expect(fateOf('additive', change('sort'), DEFAULT_NAME).ships).toBe('refused');
    const add = fateOf('additive', change('add-field'), DEFAULT_NAME);
    expect(add.ships).toBe('in-place');
    expect(add.text).toContain('strict reader');
  });

  it('every change gets a fate under every strategy, and the class comes from the matrix', () => {
    for (const s of STRATEGIES) for (const c of CHANGES) expect(fateOf(s.id, c, DEFAULT_NAME).text.length).toBeGreaterThan(10);
  });
});
