import { describe, expect, it } from 'vitest';
import { APP_RANGE, CI_MONTH, DEV_MONTH, install, resolveTree } from './deps';

describe('lockfile scenario', () => {
  it('without a lockfile, the same package.json installs different versions months apart', () => {
    const dev = install(APP_RANGE, DEV_MONTH, null);
    const ci = install(APP_RANGE, CI_MONTH, null);
    expect(dev).toEqual({ version: '1.4.2', source: 'registry', broken: false });
    expect(ci).toEqual({ version: '1.5.0', source: 'registry', broken: true });
  });

  it('with a lockfile, both installs get exactly the locked version', () => {
    const locked = install(APP_RANGE, DEV_MONTH, null).version;
    expect(install(APP_RANGE, CI_MONTH, locked)).toEqual({ version: '1.4.2', source: 'lockfile', broken: false });
  });

  it('ignores a lockfile entry that no longer satisfies package.json', () => {
    expect(install('^1.5.0', CI_MONTH, '1.4.2').source).toBe('registry');
  });
});

describe('transitive tree', () => {
  it('two incompatible ranges give two copies, one nested', () => {
    const { copies } = resolveTree('none', '3.2.0');
    expect(copies.map((c) => [c.version, c.hoisted])).toEqual([['2.2.0', true], ['1.5.2', false]]);
    expect(copies.every((c) => c.vulnerable)).toBe(true);
  });

  it('a range that accepts both lines dedupes to one copy', () => {
    expect(resolveTree('none', '3.3.0').copies).toHaveLength(1);
  });

  it('fixes on both lines reach both copies with no parent changes', () => {
    const { copies, stuck } = resolveTree('both', '3.2.0');
    expect(copies.map((c) => c.version)).toEqual(['2.2.1', '1.5.3']);
    expect(copies.some((c) => c.vulnerable)).toBe(false);
    expect(stuck).toEqual([]);
  });

  it('a fix only on 2.x leaves B stuck until B widens its range', () => {
    const before = resolveTree('latest-only', '3.2.0');
    expect(before.copies.find((c) => !c.hoisted)?.vulnerable).toBe(true);
    expect(before.stuck).toEqual(['B']);
    const after = resolveTree('latest-only', '3.3.0');
    expect(after.copies).toHaveLength(1);
    expect(after.copies[0]).toMatchObject({ version: '2.2.1', vulnerable: false });
    expect(after.stuck).toEqual([]);
  });
});
