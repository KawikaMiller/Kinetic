import { describe, expect, it } from 'vitest';
import { verify } from './contract';
import {
  DEFAULT_CONSUMER, FIELDS, SAMPLE_USER, consumerLines, coverage, honestContract, matcherFits, readsOf, renderCheckout, tightestMatcher, type ConsumerOptions, type Field,
} from './consumer';
import { MATCHER_FOR } from './deploy';
import { handle } from './provider';

const ALL: ConsumerOptions = { showEmail: true, showPlan: true };

describe('what the consumer reads is recorded by running it', () => {
  it('the default page reads id, name and amount', () => {
    expect(readsOf(DEFAULT_CONSUMER)).toEqual(['id', 'name', 'amount']);
  });

  it('showing the email adds email, and showing the plan adds plan', () => {
    expect(readsOf({ showEmail: true, showPlan: false })).toEqual(['id', 'name', 'email', 'amount']);
    expect(readsOf({ showEmail: false, showPlan: true })).toEqual(['id', 'name', 'plan', 'amount']);
    expect(readsOf(ALL)).toEqual(['id', 'name', 'email', 'plan', 'amount']);
  });

  it('the source lines grow with the options, one per read', () => {
    expect(consumerLines(DEFAULT_CONSUMER)).toHaveLength(4);
    expect(consumerLines(ALL)).toHaveLength(6);
    expect(consumerLines(ALL).join('\n')).toContain('user.email.toLowerCase()');
  });

  it('renders the line the page would show', () => {
    expect(renderCheckout(SAMPLE_USER, DEFAULT_CONSUMER)).toBe('#42 | ADA | charge $25.00');
    expect(renderCheckout(SAMPLE_USER, ALL)).toBe('#42 | ADA | charge $25.00 | ada@example.com | plan pro');
  });
});

describe('a matcher fits when the page survives every value it lets through', () => {
  const fits = (f: Field, m: Parameters<typeof matcherFits>[1]) => matcherFits(f, m, ALL).fits;
  it('id wants a number', () => {
    expect([fits('id', 'integer'), fits('id', 'number'), fits('id', 'string'), fits('id', 'any')]).toEqual([true, true, false, false]);
  });

  it('name wants a string', () => {
    expect([fits('name', 'string'), fits('name', 'integer'), fits('name', 'any')]).toEqual([true, false, false]);
  });

  it('amount wants a whole number: a looser "number" lets 1.5 through and breaks it', () => {
    expect([fits('amount', 'integer'), fits('amount', 'number'), fits('amount', 'any')]).toEqual([true, false, false]);
    expect(matcherFits('amount', 'number', ALL).breaksOn).toEqual({ value: 1.5, error: 'amount is not a whole number of cents' });
  });

  it('a field the page does not read fits any matcher, so loosening it costs nothing', () => {
    expect(matcherFits('email', 'any', DEFAULT_CONSUMER).fits).toBe(true);
    expect(matcherFits('email', 'any', ALL).fits).toBe(false);
  });

  it('the matcher the deploy scene uses for each field is the tightest one for the page that reads it', () => {
    for (const f of FIELDS) expect(tightestMatcher(f, ALL), f).toBe(MATCHER_FOR[f]);
  });
});

describe('coverage of the contract', () => {
  it('names what the consumer reads and the contract leaves out, and the reverse', () => {
    expect(coverage(['id', 'name', 'amount'], DEFAULT_CONSUMER)).toEqual({ missing: [], extra: [] });
    expect(coverage(['id', 'name'], DEFAULT_CONSUMER)).toEqual({ missing: ['amount'], extra: [] });
    expect(coverage(['id', 'name', 'amount', 'email'], DEFAULT_CONSUMER)).toEqual({ missing: [], extra: ['email'] });
  });

  it('an honest contract passes against the unchanged provider', () => {
    for (const o of [DEFAULT_CONSUMER, ALL]) expect(verify(honestContract(o), handle(new Set()))).toEqual([]);
  });
});

describe('scene 4: the shape stays, the meaning does not', () => {
  it('cents to dollars passes the contract, and the page then charges 100 times too little', () => {
    const changed = handle(new Set(['amount-dollars'] as const));
    expect(verify(honestContract(DEFAULT_CONSUMER), changed)).toEqual([]);
    const before = renderCheckout(handle(new Set()).body as Record<string, unknown>, DEFAULT_CONSUMER);
    const after = renderCheckout(changed.body as Record<string, unknown>, DEFAULT_CONSUMER);
    expect(before).toBe('#42 | ADA | charge $25.00');
    expect(after).toBe('#42 | ADA | charge $0.25');
  });
});
