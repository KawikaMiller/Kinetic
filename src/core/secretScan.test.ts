import { describe, expect, it } from 'vitest';
import { REPO_RULES, RULES, scan } from './secretScan';

// Fixtures are joined from pieces so this file never holds a credential-shaped literal.
const join = (...parts: string[]) => parts.join('');
const FIXTURES: Record<string, string> = {
  stripe: join('sk', '_test_', 'EXAMPLE0000DEMO0000KEY'),
  aws: join('AK', 'IA', 'EXAMPLE0000DEMO0'),
  github: join('gh', 'p_', 'EXAMPLE0000'.repeat(3), 'DEM'),
  'private-key': join('-----BEGIN ', 'RSA PRIVATE', ' KEY-----'),
  'github-pat': join('github', '_pat_', 'EXAMPLE0000DEMO0000KEY00'),
  slack: join('xo', 'xb-', '0000-EXAMPLE-DEMO'),
  google: join('AI', 'za', 'EXAMPLE0000DEMO0000KEY0000DEMO00000'),
  jwt: join('ey', 'JEXAMPLE0000', '.', 'ey', 'JEXAMPLE0000', '.', 'EXAMPLE0000'),
  'url-credentials': join('https://', 'demo', ':', 'hunter22', '@db.example.com/app'),
};

describe('secret-shape scan', () => {
  it('keeps the lesson rule set the secrets-management lesson shows', () => {
    expect(RULES.map((r) => r.id)).toEqual(['stripe', 'aws', 'github', 'private-key', 'assignment']);
  });

  it.each(Object.entries(FIXTURES))('the %s rule fires on its fixture', (id, text) => {
    expect(scan(`const x = '${text}';`, REPO_RULES).map((f) => f.rule)).toEqual([id]);
  });

  it('has a fixture for every repo rule', () => {
    expect(REPO_RULES.map((r) => r.id).sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  it('skips a line carrying the allow marker with a reason, and only that line', () => {
    const text = `${FIXTURES.aws} // allow-secret-shape: documented fixture\n${FIXTURES.aws}`;
    expect(scan(text, REPO_RULES)).toEqual([{ rule: 'aws', line: 2, match: FIXTURES.aws }]);
  });

  it('ignores a bare marker with no reason', () => {
    expect(scan(`${FIXTURES.aws} // allow-secret-shape:`, REPO_RULES)).toHaveLength(1);
  });

  it('finds nothing credential-shaped in src/, scripts/ or docs/', () => {
    const files = {
      ...import.meta.glob('../**/*.{ts,tsx,css,html,json,md}', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../../scripts/**/*.{js,mjs,cjs,ts,json,md}', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../../docs/**/*.{md,html,json,txt}', { query: '?raw', import: 'default', eager: true }),
    } as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(300);
    const findings = Object.entries(files).flatMap(([path, text]) => scan(text, REPO_RULES).map((f) => `${path}:${f.line} ${f.rule}`));
    expect(findings).toEqual([]);
  });
});
