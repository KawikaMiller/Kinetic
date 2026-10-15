import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
// Test-only cross-lesson import: dependency-management owns the semver rule this lesson must agree with.
import { satisfies } from '../dependency-management/semver';
import { releaseCaption } from './captions';
import { affectedSet } from './graph';
import {
  CHANGES, CONSUMER_RANGE, LIB, MONOREPO_REVIEW_DAYS, REVIEW_DAYS, SYSTEM, changeOf, monorepo, nextVersion, pinsAt, polyrepo, rangeAccepts, versionsInUse,
} from './release';

describe('semantic versioning agrees with the dependency-management rule', () => {
  it('releases a compatible change as a minor version that the callers’ caret range accepts, and a breaking one as a major that it rejects', () => {
    for (const c of CHANGES) {
      const accepted = satisfies(nextVersion(c), CONSUMER_RANGE);
      expect(accepted, c.id).toBe(c.compatible);
      expect(rangeAccepts(c), c.id).toBe(accepted);
    }
    expect(nextVersion(changeOf('optional-param'))).toBe('1.5.0');
    expect(nextVersion(changeOf('rename'))).toBe('2.0.0');
    expect(nextVersion(changeOf('return-type'))).toBe('2.0.0');
  });
});

describe('the monorepo play-out', () => {
  it('builds the affected set the graph says: the library and every package that can reach it', () => {
    const m = monorepo(changeOf('rename'), true);
    expect(new Set(m.affected)).toEqual(affectedSet(SYSTEM, LIB));
    expect(m.affected).toHaveLength(5);
    expect(m.prs).toBe(1);
    expect(m.days).toBe(MONOREPO_REVIEW_DAYS);
    expect(m.versionsInUse).toBe(1);
    expect(m.status).toBe('landed');
  });

  it('blocks a breaking change whose callers were not updated, naming the packages that fail, and lands a compatible one regardless', () => {
    const rename = monorepo(changeOf('rename'), false);
    expect(rename.status).toBe('blocked');
    expect(rename.failing).toEqual(['billing', 'web']);
    const returnType = monorepo(changeOf('return-type'), false);
    expect(returnType.failing).toEqual(['api', 'worker']);
    expect(monorepo(changeOf('optional-param'), false)).toMatchObject({ status: 'landed', failing: [] });
    expect(monorepo(changeOf('rename'), true).failing).toEqual([]);
  });
});

describe('the polyrepo play-out', () => {
  it('try-this 1: a breaking rename needs four repositories to change, and the last lands on day 7 (api then web: 3 + 4)', () => {
    const p = polyrepo(changeOf('rename'));
    expect(p.prs).toBe(4);
    expect(p.days).toBe(REVIEW_DAYS.api + REVIEW_DAYS.web);
    expect(p.days).toBe(7);
    expect(p.rows.find((r) => r.repo === 'web')!.slot.start).toBe(REVIEW_DAYS.api);
    expect(p.rows.find((r) => r.repo === 'worker')!.slot.finish).toBe(REVIEW_DAYS.worker);
    expect(p.days).toBeGreaterThan(Math.max(...Object.values(REVIEW_DAYS)));
    expect(monorepo(changeOf('rename'), true).affected).toHaveLength(5);
    expect(expectCaption(releaseCaption('rename', 'polyrepo', true, 0))).toContain('4 repositories each need their own change');
    expect(expectCaption(releaseCaption('rename', 'monorepo', true, 0))).toContain('lands whole');
  });

  it('try-this 2: an optional parameter needs no repository to change, and the monorepo still builds the affected set', () => {
    const p = polyrepo(changeOf('optional-param'));
    expect(p).toMatchObject({ version: '1.5.0', rows: [], prs: 0, days: 0 });
    expect(monorepo(changeOf('optional-param'), true).affected).toHaveLength(5);
    expect(expectCaption(releaseCaption('optional-param', 'polyrepo', true, 0))).toContain('no repository needs a change');
  });

  it('marks which repositories need a code change: only those that call what changed', () => {
    const rows = polyrepo(changeOf('rename')).rows;
    expect(rows.filter((r) => r.codeChange).map((r) => r.repo).sort()).toEqual(['billing', 'web']);
    expect(polyrepo(changeOf('return-type')).rows.filter((r) => r.codeChange).map((r) => r.repo).sort()).toEqual(['api', 'worker']);
  });

  it('shows version skew on the way: one version before anyone moves, two once the first has and until the last has, then one; no repository moves before its turn', () => {
    const c = changeOf('rename');
    const p = polyrepo(c);
    expect(versionsInUse(pinsAt(c, 0))).toBe(1);
    expect(versionsInUse(pinsAt(c, 2))).toBe(2);
    expect(versionsInUse(pinsAt(c, p.days - 1))).toBe(2);
    expect(versionsInUse(pinsAt(c, p.days))).toBe(1);
    for (let day = 0; day <= p.days; day++) {
      for (const pin of pinsAt(c, day)) {
        const row = p.rows.find((r) => r.repo === pin.repo);
        if (!row) continue;
        expect(pin.state === 'moved', `${pin.repo} on day ${day}`).toBe(row.slot.finish <= day);
        expect(pin.version).toBe(pin.state === 'moved' ? '2.0.0' : '1.4.0');
      }
    }
  });

  it('keeps every repository on the old version for a compatible change, and calls them unaffected', () => {
    const pins = pinsAt(changeOf('optional-param'), 0);
    for (const pin of pins.filter((x) => x.repo !== LIB)) expect(pin).toMatchObject({ version: '1.4.0', state: 'unaffected' });
    expect(versionsInUse(pins)).toBe(1);
  });
});
