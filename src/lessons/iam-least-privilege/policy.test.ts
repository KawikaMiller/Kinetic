import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { mulberry32 } from '../../core/random';
import { ACCESS_LOG, ALL_ACTIONS, POLICIES, RESOURCES, allowedPairs, blastRadius, keepsServiceWorking, reachOf, suggestPolicy, totalPairs, usedResources } from './account';
import { policyFrames } from './frames';
import { evaluate, matchGlob, parseConcrete, parsePattern, ruleOrder, type Statement } from './policy';
import { PRESETS, REQUEST_UNIVERSE } from './presets';

/** A straightforward reference: translate the glob to a regular expression. */
const refGlob = (pattern: string, text: string) =>
  new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's').test(text);

describe('matchGlob', () => {
  it('hand-worked cases: * crosses / and can match nothing', () => {
    expect(matchGlob('storage:Get*', 'storage:GetObject')).toBe(true);
    expect(matchGlob('storage:Get*', 'storage:PutObject')).toBe(false);
    expect(matchGlob('bucket/reports/*', 'bucket/reports/2026/q3.csv')).toBe(true);
    expect(matchGlob('bucket/reports/*', 'bucket/reports/')).toBe(true);
    expect(matchGlob('bucket/reports/*', 'bucket/reports')).toBe(false);
    expect(matchGlob('bucket/report/*', 'bucket/reports/q3.csv')).toBe(false);
    expect(matchGlob('*', '')).toBe(true);
    expect(matchGlob('*', 'anything/at/all')).toBe(true);
    expect(matchGlob('a*b*c', 'axxbyyc')).toBe(true);
    expect(matchGlob('a*b*c', 'axxbyy')).toBe(false);
    expect(matchGlob('', '')).toBe(true);
    expect(matchGlob('', 'a')).toBe(false);
    expect(matchGlob('Storage:*', 'storage:GetObject')).toBe(false);
  });

  it('is case-sensitive, and . and + are plain characters', () => {
    expect(matchGlob('a.b', 'axb')).toBe(false);
    expect(matchGlob('a+b', 'aab')).toBe(false);
    expect(matchGlob('a+b', 'a+b')).toBe(true);
  });

  it('agrees with the regular-expression reference on 3000 seeded pattern and text pairs', () => {
    const rnd = mulberry32(2026);
    const make = (alphabet: string[], max: number) => Array.from({ length: Math.floor(rnd() * (max + 1)) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
    for (let i = 0; i < 3000; i++) {
      const pattern = make(['a', 'b', '/', '*', ':', '.', '+'], 7);
      const text = make(['a', 'b', '/', ':', '.', '+'], 8);
      expect(matchGlob(pattern, text)).toBe(refGlob(pattern, text));
    }
  });
});

describe('evaluate: explicit deny, then allow, then deny by default', () => {
  const reference = (statements: readonly Statement[], action: string, resource: string) => {
    const hit = (s: Statement) => refGlob(s.action, action) && refGlob(s.resource, resource);
    if (statements.some((s) => s.effect === 'Deny' && hit(s))) return 'explicit-deny';
    if (statements.some((s) => s.effect === 'Allow' && hit(s))) return 'allow';
    return 'implicit-deny';
  };

  it('every preset against every request in the account agrees with the reference', () => {
    for (const p of PRESETS) {
      for (const r of REQUEST_UNIVERSE) {
        const e = evaluate(p.statements, r);
        expect(e.reason).toBe(reference(p.statements, r.action, r.resource));
        expect(e.decision).toBe(e.reason === 'allow' ? 'allow' : 'deny');
      }
    }
  });

  it('300 seeded random policy sets against random requests agree with the reference', () => {
    const rnd = mulberry32(77);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const actionPatterns = ['*', 'storage:*', 'storage:Get*', 'storage:DeleteObject', 'queue:*', 'db:Query', 'storage:Delete*', 'secrets:*'];
    const resourcePatterns = ['*', 'bucket/*', 'bucket/reports/*', 'bucket/billing/*', 'queue/jobs', 'db/*', 'secrets/payment-key'];
    for (let i = 0; i < 300; i++) {
      const statements: Statement[] = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => ({
        id: `s${k}`, effect: rnd() < 0.3 ? 'Deny' : 'Allow', action: pick(actionPatterns), resource: pick(resourcePatterns),
      }));
      const r = pick(REQUEST_UNIVERSE);
      expect(evaluate(statements, r).reason).toBe(reference(statements, r.action, r.resource));
    }
  });

  it('an explicit deny wins whatever the order of the statements', () => {
    const allow: Statement = { id: 'a', effect: 'Allow', action: '*', resource: '*' };
    const deny: Statement = { id: 'd', effect: 'Deny', action: 'storage:Delete*', resource: 'bucket/*' };
    const r = REQUEST_UNIVERSE.find((x) => x.action === 'storage:DeleteObject')!;
    expect(evaluate([allow, deny], r).reason).toBe('explicit-deny');
    expect(evaluate([deny, allow], r).reason).toBe('explicit-deny');
    expect(evaluate([deny, allow], r).decidedBy).toBe('d');
    expect(evaluate([allow], r).decidedBy).toBe('a');
    expect(evaluate([], r)).toMatchObject({ decision: 'deny', reason: 'implicit-deny', decidedBy: null });
  });

  it('the five presets reach the verdicts their names promise', () => {
    const verdicts = Object.fromEntries(PRESETS.map((p) => [p.id, evaluate(p.statements, p.request).reason]));
    expect(verdicts).toEqual({ works: 'allow', wide: 'allow', deny: 'explicit-deny', typo: 'implicit-deny', nomatch: 'implicit-deny' });
  });

  it('the rule looks at every Deny before any Allow', () => {
    const mixed: Statement[] = [
      { id: 'a', effect: 'Allow', action: '*', resource: '*' },
      { id: 'd', effect: 'Deny', action: 'x', resource: 'y' },
    ];
    expect(ruleOrder(mixed).map((s) => s.id)).toEqual(['d', 'a']);
  });
});

describe('policy frames', () => {
  it('end on the decision evaluate gives, for every preset and every request', () => {
    for (const p of PRESETS) {
      for (const r of REQUEST_UNIVERSE) {
        const frames = policyFrames(p.statements, r);
        const last = frames.at(-1)!;
        expect(last.result).toEqual(evaluate(p.statements, r));
        const text = expectCaption(last.say);
        const reason = last.result!.reason;
        expect(text.startsWith(reason === 'allow' ? 'Allowed' : reason === 'explicit-deny' ? 'Denied by an explicit Deny' : 'Denied by default')).toBe(true);
        expect(frames.slice(0, -1).every((f) => f.result === null)).toBe(true);
      }
    }
  });

  it('stop at the first statement that matches, and every checked frame has a caption saying so', () => {
    for (const p of PRESETS) {
      const frames = policyFrames(p.statements, p.request);
      const e = evaluate(p.statements, p.request);
      const checks = frames.filter((f) => f.current);
      for (const f of checks) {
        const text = expectCaption(f.say);
        expect(text.includes('does not apply')).toBe(!e.matches[f.current!]);
      }
      if (e.decidedBy) expect(checks.at(-1)!.current).toBe(e.decidedBy);
      else expect(checks.length).toBe(p.statements.length);
    }
  });
});

describe('the field rules', () => {
  it('accepts policy patterns and refuses everything else with a message, never coercing', () => {
    expect(parsePattern('storage:Get*')).toEqual({ ok: true, value: 'storage:Get*' });
    for (const bad of ['', ' ', ' a', 'a ', 'a b', 'a,b', '<b>', '😀', 'a'.repeat(61), '1e400', '-1', 'a\nb']) {
      const r = parsePattern(bad);
      if (bad === '1e400' || bad === '-1') expect(r.ok).toBe(true);
      else expect(r.ok).toBe(false);
    }
    expect(parsePattern('x'.repeat(60)).ok).toBe(true);
  });

  it('a concrete name takes no *', () => {
    expect(parseConcrete('bucket/reports/q3.csv').ok).toBe(true);
    expect(parseConcrete('bucket/*').ok).toBe(false);
  });
});

describe('the account and its blast radius', () => {
  const policy = (id: string) => POLICIES.find((p) => p.id === id)!.statements;

  it('the blast radius is exactly the resources with at least one allowed action, for every policy', () => {
    for (const p of POLICIES) {
      const expected = RESOURCES.filter((r) => r.actions.some((a) => evaluate(p.statements, { principal: 'x', action: a, resource: r.name }).decision === 'allow')).map((r) => r.id);
      expect(blastRadius(p.statements)).toEqual(expected);
    }
  });

  it('widening floods the radius and trimming shrinks it', () => {
    expect(blastRadius(policy('admin'))).toEqual(RESOURCES.map((r) => r.id));
    expect(blastRadius(policy('storage-all'))).toEqual(['reports', 'billing', 'logs']);
    expect(blastRadius(policy('storage-buckets'))).toEqual(['reports', 'billing', 'logs']);
    expect(blastRadius(policy('reads'))).toEqual(['reports']);
    expect(allowedPairs(policy('admin'))).toBe(totalPairs);
    expect(allowedPairs(policy('reads'))).toBe(1);
  });

  it('the radius never grows as the policy gets narrower along the list', () => {
    const sizes = POLICIES.map((p) => blastRadius(p.statements).length);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('the suggested policy grants exactly the actions in the log, and nothing else', () => {
    const suggested = suggestPolicy(ACCESS_LOG);
    const reach = reachOf(suggested);
    const allowedPairsSet = new Set(reach.flatMap((r) => r.allowed.map((a) => `${a}@${r.resource.name}`)));
    const logged = new Set(ACCESS_LOG.map((e) => `${e.action}@${e.resource}`));
    expect(allowedPairsSet).toEqual(logged);
    expect(keepsServiceWorking(suggested, ACCESS_LOG)).toBe(true);
    expect(blastRadius(suggested)).toEqual(usedResources(ACCESS_LOG));
  });

  it('the over-broad policies keep the service working but allow far more than it used', () => {
    for (const id of ['admin', 'storage-all']) expect(keepsServiceWorking(policy(id), ACCESS_LOG)).toBe(id === 'admin');
    expect(allowedPairs(policy('admin'))).toBeGreaterThan(ACCESS_LOG.length);
  });

  it('the log only names actions and resources that exist', () => {
    for (const e of ACCESS_LOG) {
      expect(ALL_ACTIONS).toContain(e.action);
      expect(RESOURCES.some((r) => r.name === e.resource && r.actions.includes(e.action))).toBe(true);
    }
  });
});
