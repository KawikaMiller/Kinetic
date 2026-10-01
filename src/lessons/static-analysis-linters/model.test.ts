import { describe, expect, it } from 'vitest';
import {
  detections, floatingPromiseLines, LAYERS, looseEqualityLines, possiblyNullLines, PROBLEMS, REAL_TOOLS, reindent, renderRows,
  runUnitTest, SAMPLE, sampleLines, sieve, tokens, unusedVariableLines, type Layer,
} from './model';

describe('pattern rules', () => {
  it('eqeqeq flags loose (in)equality only', () => {
    const yes = ['if (a == b) {}', 'x != y;', 'if (n==0) go();', "  if (body.count == 0) return 'none';"];
    const no = ['a === b;', 'a !== b;', 'const f = (x) => x;', 'if (a <= b) {}', "log('a == b');", 'x >= y;'];
    expect(looseEqualityLines(yes)).toEqual([0, 1, 2, 3]);
    expect(looseEqualityLines(no)).toEqual([]);
  });

  it('no-unused-vars flags a declaration never mentioned again', () => {
    expect(unusedVariableLines(['const a = 1;', 'const b = 2;', 'log(b);'])).toEqual([0]);
    expect(unusedVariableLines(['let total = 0;', 'total += 3;'])).toEqual([]);
    expect(unusedVariableLines(["const s = 'x';", "log('s');"])).toEqual([0]); // a string mention isn't a use
  });

  it('no-floating-promises flags a bare async call, not awaited, returned, voided or chained ones', () => {
    const lines = ['saveAudit(x);', 'await saveAudit(x);', 'return saveAudit(x);', 'void saveAudit(x);', 'saveAudit(x).catch(log);', 'notAsync(x);'];
    expect(floatingPromiseLines(lines)).toEqual([0]);
  });

  it('the toy null check flags a nullable parameter used with a dot', () => {
    expect(possiblyNullLines(['function f(u: User | null) {', '  return u.name;', '}'])).toEqual([1]);
    expect(possiblyNullLines(['function f(u: User) {', '  return u.name;', '}'])).toEqual([]);
  });
});

describe('formatter', () => {
  it('only changes the messy line, and only its whitespace', () => {
    const out = reindent(SAMPLE);
    const changed = SAMPLE.flatMap((l, i) => (l !== out[i] ? [i] : []));
    expect(changed).toEqual([3]);
    expect(tokens(out)).toEqual(tokens(SAMPLE));
  });

  it('is idempotent: formatting formatted code changes nothing', () => {
    expect(reindent(reindent(SAMPLE))).toEqual(reindent(SAMPLE));
  });
});

describe('the toy tools agree with what the real tools report', () => {
  it('each problem is caught by exactly the layers REAL_TOOLS documents', () => {
    const can = detections(false);
    for (const p of PROBLEMS) expect([...can[p.id]].sort()).toEqual(Object.keys(REAL_TOOLS[p.id]).sort());
  });

  it('every problem is caught by exactly one layer: none of them is caught twice', () => {
    const can = detections(false);
    expect(PROBLEMS.every((p) => can[p.id].size === 1)).toBe(true);
  });

  it('the inline disable comment silences eqeqeq and nothing else', () => {
    const before = detections(false);
    const after = detections(true);
    expect(after.looseEq.size).toBe(0);
    for (const p of PROBLEMS.filter((x) => x.id !== 'looseEq')) expect(after[p.id]).toEqual(before[p.id]);
    expect(sampleLines(true)).toHaveLength(SAMPLE.length + 1);
  });
});

describe('tests layer', () => {
  it('the unit test fails against the loop as written', () => {
    expect(runUnitTest().passed).toBe(false);
    expect(renderRows([{ item: 'socks' }, { item: 'hat' }])).toBe('<li>hat</li>');
  });

  it('the same test passes once the loop starts at 0', () => {
    const fixed = (orders: { item: string }[]) => orders.map((o) => `<li>${o.item}</li>`).join('');
    expect(['socks', 'hat'].every((item) => fixed([{ item: 'socks' }, { item: 'hat' }]).includes(item))).toBe(true);
  });
});

describe('sieve', () => {
  const all = new Set<Layer>(LAYERS);
  it('with no tools every problem reaches production', () => {
    expect(Object.values(sieve(new Set(), false)).every((o) => o === 'production')).toBe(true);
  });

  it('with every tool nothing reaches production', () => {
    expect(Object.values(sieve(all, false)).includes('production')).toBe(false);
  });

  it('a passing linter still lets three problems ship', () => {
    const out = sieve(new Set<Layer>(['linter']), false);
    expect(PROBLEMS.filter((p) => out[p.id] === 'production').map((p) => p.id)).toEqual(['indent', 'nullable', 'offByOne']);
  });

  it('only tests catch the off-by-one, and the disable comment lets == escape', () => {
    expect(sieve(new Set<Layer>(['formatter', 'linter', 'types']), false).offByOne).toBe('production');
    expect(sieve(all, true).looseEq).toBe('production');
  });
});
