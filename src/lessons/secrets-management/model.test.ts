import { describe, expect, it } from 'vitest';
import { fakeSecret } from '../../core/fakeSecret';
import {
  ITEMS, LEAKED_KEY, LEAK_HISTORY, ROTATED_KEY, applyFix, commitsContaining, isIgnored, matchesPattern, reachable, scan,
  wouldStage, type Commit,
} from './model';

describe('git history', () => {
  const chain: Commit[] = [
    { id: 'a', message: '', parents: [], files: {} },
    { id: 'b', message: '', parents: ['a'], files: {} },
    { id: 'c', message: '', parents: ['b'], files: {} },
    { id: 'x', message: '', parents: ['a'], files: {} },
  ];
  it('walks parents from the tips', () => {
    expect(reachable(chain, ['c'])).toEqual(new Set(['a', 'b', 'c']));
    expect(reachable(chain, ['c', 'x'])).toEqual(new Set(['a', 'b', 'c', 'x']));
  });
  it('finds the leaked key in the leak commit', () => {
    expect(commitsContaining(LEAK_HISTORY, ['b7c2'], LEAKED_KEY)).toEqual(['b7c2']);
  });
});

describe('the fixes', () => {
  it('deleting the line leaves the key reachable in history, and still valid', () => {
    const o = applyFix('delete');
    expect(o.commits.at(-1)!.files['config.js']).not.toContain(LEAKED_KEY);
    expect(o.stillInHistory).toEqual(['b7c2']);
    expect(o.keyWorks).toBe(true);
  });
  it('adding the file to .gitignore afterwards changes nothing: it stays tracked', () => {
    const o = applyFix('gitignore');
    expect(o.configTracked).toBe(true);
    expect(o.stillInHistory).toEqual(['b7c2', 'e8f1']);
    expect(o.keyWorks).toBe(true);
  });
  it('rotating kills the leaked key (it stays in history, but dead)', () => {
    const o = applyFix('rotate');
    expect(o.keyWorks).toBe(false);
    expect(o.stillInHistory).toEqual(['b7c2']);
    expect(o.commits.at(-1)!.files['config.js']).toContain('process.env.STRIPE_KEY');
  });
  it('prevention never puts the key in git at all', () => {
    const o = applyFix('prevent');
    expect(o.stillInHistory).toEqual([]);
    expect(isIgnored('.env', o.commits[0].files['.gitignore'])).toBe(true);
  });
});

describe('.gitignore', () => {
  it('matches names, globs, directories and anchored paths', () => {
    expect(matchesPattern('.env', '.env')).toBe(true);
    expect(matchesPattern('app/.env', '.env')).toBe(true);
    expect(matchesPattern('debug.log', '*.log')).toBe(true);
    expect(matchesPattern('logs/a/b.txt', 'logs/')).toBe(true);
    expect(matchesPattern('src/config.js', '/config.js')).toBe(false);
    expect(matchesPattern('config.js', '/config.js')).toBe(true);
    expect(matchesPattern('.env.example', '.env')).toBe(false);
    expect(matchesPattern('x', '# comment')).toBe(false);
  });
  it('only stops untracked files: a tracked file keeps being staged', () => {
    const ignore = 'config.js\n.env\n';
    expect(wouldStage(['config.js', '.env', 'app.js'], new Set(['config.js', 'app.js']), ignore)).toEqual(['config.js', 'app.js']);
  });
});

describe('secret scanning', () => {
  it('catches the fake keys the lesson uses', () => {
    expect(scan(`const k = '${LEAKED_KEY}';`).map((f) => f.rule)).toContain('stripe');
    expect(scan(ROTATED_KEY).map((f) => f.rule)).toEqual(['stripe']);
    expect(scan(fakeSecret('sk', '_test_', 'EXAMPLE00000000000000'))).toHaveLength(1);
  });
  it('catches other common shapes, on obviously fake values', () => {
    expect(scan(fakeSecret('AK', 'IA', 'EXAMPLE000000000')).map((f) => f.rule)).toEqual(['aws']);
    expect(scan(fakeSecret('gh', 'p_', 'EXAMPLE0'.repeat(4), 'EXAM')).map((f) => f.rule)).toEqual(['github']);
    expect(scan(fakeSecret('-----BEGIN RSA ', 'PRIVATE KEY-----')).map((f) => f.rule)).toEqual(['private-key']);
    expect(scan('password = "EXAMPLE-not-real"').map((f) => f.rule)).toEqual(['assignment']);
  });
  it('reports the line it found', () => {
    expect(scan(`a\nb\nkey: '${LEAKED_KEY}'`)[0].line).toBe(3);
  });
  it('ignores code that only names a secret', () => {
    for (const ok of ['stripeKey: process.env.STRIPE_KEY', 'const password = getPassword();', 'token = "short"', fakeSecret('sk', '_live_', 'tooShort')]) {
      expect(scan(ok)).toEqual([]);
    }
  });
});

describe('the lesson source itself', () => {
  it('contains no credential-shaped literal a secret scanner would flag on push', () => {
    const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(sources).length).toBeGreaterThan(2);
    for (const [file, source] of Object.entries(sources)) {
      // The lesson's own rules (minus the assignment heuristic, which matches its own test
      // strings by design) run over the raw source text.
      expect(scan(source).filter((f) => f.rule !== 'assignment'), file).toEqual([]);
    }
  });
});

describe('code, config or secret', () => {
  it('has every bucket in the answer key, with a reason for each item', () => {
    expect(new Set(ITEMS.map((i) => i.answer))).toEqual(new Set(['code', 'config', 'secret']));
    for (const i of ITEMS) expect(i.why.length).toBeGreaterThan(10);
  });
});
