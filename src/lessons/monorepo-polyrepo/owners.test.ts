import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { ownersCaption } from './captions';
import {
  FLAG_TEAMS, MAX_PATTERN, OPENING_RULES, PATHS, PULL_REQUESTS, TEAMS, matches, matchesNoPath, moveRule, ownerOf, parsePattern, removeRule, review, ruleLines, setRule, unownedPaths,
  type Rule,
} from './owners';

const rule = (pattern: string, owner: Rule['owner']): Rule => ({ pattern, owner });

describe('matching: twenty hand cases', () => {
  // [rules, path, expected owner or null]
  const cases: [string, Rule[], string, string | null][] = [
    ['star owns every path', [rule('*', '@platform')], '/api/src/orders.ts', '@platform'],
    ['star alone owns a root file', [rule('*', '@platform')], '/README.md', '@platform'],
    ['an extension rule matches at any depth', [rule('*.md', '@docs')], '/docs/onboarding.md', '@docs'],
    ['an extension rule matches the root', [rule('*.md', '@docs')], '/README.md', '@docs'],
    ['an extension rule does not match another extension', [rule('*.md', '@docs')], '/web/src/App.tsx', null],
    ['an extension rule needs the dot', [rule('*.ts', '@platform')], '/api/src/orders.test.tsx', null],
    ['a directory rule matches files inside', [rule('/api/', '@platform')], '/api/src/orders.ts', '@platform'],
    ['a directory rule matches nested files', [rule('/worker/', '@worker')], '/worker/src/jobs/email.ts', '@worker'],
    ['a directory rule may leave its leading slash off', [rule('api/', '@platform')], '/api/package.json', '@platform'],
    ['a directory rule does not match a sibling with the same prefix', [rule('/api/', '@platform')], '/api-docs/readme.txt', null],
    ['a directory rule does not match a file of the same name', [rule('/web/', '@web')], '/web', null],
    ['an exact file rule matches that file', [rule('/infra/deploy.yml', '@infra')], '/infra/deploy.yml', '@infra'],
    ['an exact file rule does not match its neighbour', [rule('/infra/deploy.yml', '@infra')], '/infra/db.tf', null],
    ['an exact file rule may leave its leading slash off', [rule('README.md', '@docs')], '/README.md', '@docs'],
    ['the last matching rule wins over an earlier one', [rule('*', '@platform'), rule('/billing/', '@payments')], '/billing/src/tax.ts', '@payments'],
    ['the earlier of two matching rules loses even when it is more specific', [rule('/billing/', '@payments'), rule('*', '@platform')], '/billing/src/tax.ts', '@platform'],
    ['a later rule that does not match leaves the earlier owner', [rule('/web/', '@web'), rule('*.md', '@docs')], '/web/src/App.tsx', '@web'],
    ['a file under two matching rules takes the last of three', [rule('*', '@platform'), rule('*.md', '@docs'), rule('/docs/', '@web')], '/docs/architecture.md', '@web'],
    ['an unowned file has no owner', [rule('/web/', '@web'), rule('/billing/', '@payments')], '/shared-lib/src/money.ts', null],
    ['no rules means no owner', [], '/README.md', null],
  ];
  for (const [name, rules, path, expected] of cases) {
    it(name, () => {
      expect(ownerOf(rules, path)).toBe(expected);
    });
  }

  it('matches a pattern against a path the same way ownerOf does', () => {
    expect(matches('*', '/x')).toBe(true);
    expect(matches('*.md', '/a/b.md')).toBe(true);
    expect(matches('/a/', '/a/b')).toBe(true);
    expect(matches('/a/', '/ab')).toBe(false);
  });
});

describe('editing the rules', () => {
  it('appends a new rule, and replaces a duplicate pattern in place with a flag, not at the end', () => {
    const base = [rule('/web/', '@web'), rule('*.md', '@docs')];
    expect(setRule(base, rule('/api/', '@platform'))).toEqual({ rules: [...base, rule('/api/', '@platform')], replaced: false });
    expect(setRule(base, rule('/web/', '@infra'))).toEqual({ rules: [rule('/web/', '@infra'), rule('*.md', '@docs')], replaced: true });
  });

  it('removes a rule and moves one up or down, leaving the ends where they are', () => {
    const base = [rule('a/', '@web'), rule('b/', '@docs'), rule('c/', '@infra')];
    expect(removeRule(base, 1).map((r) => r.pattern)).toEqual(['a/', 'c/']);
    expect(moveRule(base, 2, -1).map((r) => r.pattern)).toEqual(['a/', 'c/', 'b/']);
    expect(moveRule(base, 0, -1).map((r) => r.pattern)).toEqual(['a/', 'b/', 'c/']);
    expect(moveRule(base, 2, 1).map((r) => r.pattern)).toEqual(['a/', 'b/', 'c/']);
  });

  it('changes who owns a file when the order changes, because the last match wins', () => {
    const broad = rule('*', '@platform');
    const narrow = rule('/billing/', '@payments');
    expect(ownerOf([broad, narrow], '/billing/src/tax.ts')).toBe('@payments');
    expect(ownerOf(moveRule([broad, narrow], 1, -1), '/billing/src/tax.ts')).toBe('@platform');
  });
});

describe('hostile input', () => {
  it('refuses an empty pattern, one over 40 characters, markup, spaces and unsupported globs', () => {
    for (const text of ['', '   ', 'a'.repeat(MAX_PATTERN + 1), '<b>x</b>', 'a b', '/api/**', '**/*.ts', 'src/*.ts', '*.t*s', '?', '/a\\b', '`x`']) {
      expect(parsePattern(text).ok, JSON.stringify(text)).toBe(false);
    }
  });

  it('accepts the four forms and trims the pattern, up to 40 characters', () => {
    for (const text of ['*', '*.md', '/api/', 'api/', '/infra/deploy.yml', 'a'.repeat(MAX_PATTERN)]) expect(parsePattern(text)).toEqual({ ok: true, pattern: text });
    expect(parsePattern('  /web/  ')).toEqual({ ok: true, pattern: '/web/' });
  });

  it('shows a title-like pattern as text only: the chip is a string, never markup', () => {
    expect(parsePattern('<img src=x>').ok).toBe(false);
  });
});

describe('reviews', () => {
  it('lists the teams that own a pull request’s paths, the paths nobody owns, and flags five teams or more', () => {
    const full: Rule[] = [rule('/api/', '@platform'), rule('/shared-lib/', '@platform'), rule('/web/', '@web'), rule('/infra/', '@infra'), rule('/worker/', '@worker'), rule('*.md', '@docs')];
    const node = PULL_REQUESTS.find((p) => p.id === 'node')!;
    const r = review(full, node);
    expect(r.teams).toEqual(['@platform', '@web', '@worker', '@infra', '@docs']);
    expect(r.teams).toHaveLength(FLAG_TEAMS);
    expect(r.flagged).toBe(true);
    expect(r.unowned).toEqual([]);
    expect(review(full.filter((x) => x.pattern !== '*.md'), node)).toMatchObject({ flagged: false, unowned: ['/README.md'] });
  });

  it('try-this 4: the opening file leaves most paths unowned, and /api/ for @platform gives four paths an owner and the rename pull request a new reviewer', () => {
    const before = unownedPaths(OPENING_RULES);
    expect(before.length).toBeGreaterThan(PATHS.length / 2);
    const next = setRule(OPENING_RULES, rule('/api/', '@platform')).rules;
    const after = unownedPaths(next);
    expect(before.length - after.length).toBe(4);
    const rename = PULL_REQUESTS.find((p) => p.id === 'rename')!;
    expect(review(OPENING_RULES, rename).teams).not.toContain('@platform');
    expect(review(next, rename).teams).toContain('@platform');
    expect(expectCaption(ownersCaption(next, after.length, PULL_REQUESTS.map((p) => review(next, p))))).toContain(`${after.length} paths`);
  });

  it('puts a star rule on top of the opening file: no path is unowned, and the tool still lists each team once', () => {
    const rules = [rule('*', '@platform'), ...OPENING_RULES];
    expect(unownedPaths(rules)).toEqual([]);
    for (const pr of PULL_REQUESTS) expect(new Set(review(rules, pr).teams).size).toBe(review(rules, pr).teams.length);
  });

  it('prints the file one rule a line, pattern then team', () => {
    expect(ruleLines(OPENING_RULES).map((l) => l.trim().split(/\s+/))).toEqual(OPENING_RULES.map((r) => [r.pattern, r.owner]));
    expect(TEAMS).toHaveLength(6);
  });
});

describe('patterns that match nothing', () => {
  it('flags a directory written without its trailing slash and a typo, and not a pattern that covers a path', () => {
    expect(matchesNoPath('shared-lib')).toBe(true);
    expect(matchesNoPath('/shared-lib')).toBe(true);
    expect(matchesNoPath('/billng/')).toBe(true);
    expect(matchesNoPath('shared-lib/')).toBe(false);
    expect(matchesNoPath('*.tf')).toBe(false);
    expect(matchesNoPath('/README.md')).toBe(false);
    // agrees with a plain scan of the paths for every pattern the opening rules use
    for (const r of OPENING_RULES) expect(matchesNoPath(r.pattern)).toBe(PATHS.filter((p) => matches(r.pattern, p)).length === 0);
  });
});
