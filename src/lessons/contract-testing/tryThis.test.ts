import { describe, expect, it } from 'vitest';
import { START_CHOICE } from './choices';
import { matchPattern, verdictTone, verify } from './contract';
import { DEFAULT_CONSUMER, coverage, matcherFits } from './consumer';
import { START_WORLD, deployProvider, providerGate, setConsumerLive, contractOf, verifyPair } from './deploy';
import { FULL_SCHEMA, handle } from './provider';
import { makeContract } from './contract';
import { renderCheckout, EXPECTED_LINE, readsOf } from './consumer';
import lesson from './index';

/** Default state: the default page, START_CHOICE as the contract, no provider changes, START_WORLD, cents. */
describe('the try-this prompts work from the default state, as written', () => {
  it('has five prompts', () => {
    expect(lesson.tryThis).toHaveLength(5);
  });

  it('try-this 1: the default contract covers the page exactly; showing the email makes the contract miss email', () => {
    const named = Object.keys(START_CHOICE) as (keyof typeof START_CHOICE)[];
    expect(coverage(named as never, DEFAULT_CONSUMER)).toEqual({ missing: [], extra: [] });
    expect(coverage(named as never, { showEmail: true, showPlan: false }).missing).toEqual(['email']);
  });

  it('try-this 2: with the amount matcher set to number, the page breaks on 1.5', () => {
    const fit = matcherFits('amount', 'number', DEFAULT_CONSUMER);
    expect(fit.fits).toBe(false);
    expect(fit.breaksOn?.value).toBe(1.5);
    expect(matcherFits('amount', 'integer', DEFAULT_CONSUMER).fits).toBe(true);
  });

  it('try-this 3: removing email passes the contract and fails the full-schema test', () => {
    const response = handle(new Set(['remove-email'] as const));
    expect(verify(contractOf(readsOf(DEFAULT_CONSUMER)), response)).toEqual([]);
    expect(verify(makeContract(FULL_SCHEMA), response).map((m) => m.path)).toEqual(['$.body.email']);
    expect(verifyPair(['id', 'name', 'amount'], ['remove-email']).ok).toBe(true);
  });

  it('try-this 4: provider v2 is blocked by consumer v2; marking it not live opens the gate and Deploy works', () => {
    expect(providerGate(START_WORLD, 1).ok).toBe(false);
    expect(providerGate(START_WORLD, 1).blockers.map((b) => b.consumer)).toEqual([1]);
    expect(deployProvider(START_WORLD, 1).liveProvider).toBe(0);
    const off = setConsumerLive(START_WORLD, 1, false);
    expect(providerGate(off, 1).ok).toBe(true);
    expect(deployProvider(off, 1).liveProvider).toBe(1);
  });

  it('try-this 5: amount in dollars passes the contract, the page shows $0.25 and the behaviour test fails', () => {
    const response = handle(new Set(['amount-dollars'] as const));
    expect(verify(contractOf(readsOf(DEFAULT_CONSUMER)), response)).toEqual([]);
    const line = renderCheckout(response.body as Record<string, unknown>, DEFAULT_CONSUMER);
    expect(line).toContain('$0.25');
    expect(line === EXPECTED_LINE).toBe(false);
    expect(renderCheckout(handle(new Set()).body as Record<string, unknown>, DEFAULT_CONSUMER)).toBe(EXPECTED_LINE);
  });

  it('try-this 5: the contract chip is orange (a green check that is wrong) in dollars mode, green on cents, red when the contract fails', () => {
    const tone = (changes: Parameters<typeof handle>[0]) => {
      const response = handle(changes);
      const mismatches = verify(contractOf(readsOf(DEFAULT_CONSUMER)), response);
      return verdictTone(mismatches.length, renderCheckout(response.body as Record<string, unknown>, DEFAULT_CONSUMER) === EXPECTED_LINE);
    };
    expect(tone(new Set())).toBe('ok');
    expect(tone(new Set(['amount-dollars'] as const))).toBe('orange');
    expect(verdictTone(1, false)).toBe('bad');
    expect(verdictTone(1, true)).toBe('bad');
  });

  it('an integer matcher catches 2550 cents turned into 25.5 dollars by luck, and misses 2500 turned into 25', () => {
    expect(matchPattern({ kind: 'type', type: 'integer' }, 2550 / 100, '$')).not.toEqual([]);
    expect(matchPattern({ kind: 'type', type: 'integer' }, 2500 / 100, '$')).toEqual([]);
  });
});
