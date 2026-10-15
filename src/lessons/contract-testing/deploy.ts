/**
 * Scene 3 of contract-testing: versions of a consumer and of a provider, a verification for every pair,
 * and a "can I deploy?" gate computed from them.
 *
 * A consumer version is the set of fields it reads (so its contract is those fields with their tightest
 * matcher); a provider version is the set of changes applied to the base handler. A pair is verified by
 * replaying the consumer's contract against the provider's real response.
 */

import { makeContract, mismatchText, verify, type Contract, type MatcherType, type Mismatch } from './contract';
import type { Field } from './consumer';
import { handle, type ChangeId } from './provider';

/** The tightest matcher the checkout page survives for each field (consumer.test.ts checks this against the page itself). */
export const MATCHER_FOR: Record<Field, MatcherType> = { id: 'integer', name: 'string', email: 'string', plan: 'string', amount: 'integer' };

export const contractOf = (reads: readonly Field[]): Contract => makeContract(Object.fromEntries(reads.map((f) => [f, MATCHER_FOR[f]])));

export interface Verification {
  ok: boolean;
  mismatches: Mismatch[];
}

export function verifyPair(reads: readonly Field[], changes: readonly ChangeId[]): Verification {
  const mismatches = verify(contractOf(reads), handle(new Set(changes)));
  return { ok: mismatches.length === 0, mismatches };
}

export interface ConsumerVersion {
  reads: Field[];
  /** Running in production now (several consumer versions can be: an app on phones). */
  live: boolean;
}
export interface ProviderVersion {
  changes: ChangeId[];
}
export interface World {
  consumers: ConsumerVersion[];
  providers: ProviderVersion[];
  /** Index of the provider version in production. */
  liveProvider: number;
}

export const MAX_VERSIONS = 5;

export const START_WORLD: World = {
  consumers: [
    { reads: ['id', 'name', 'amount'], live: true },
    { reads: ['id', 'name', 'amount', 'email'], live: true },
  ],
  providers: [{ changes: [] }, { changes: ['remove-email'] }],
  liveProvider: 0,
};

/** Verification of every (provider version, consumer version) pair: `matrix[p][c]`. */
export const matrixOf = (w: World): Verification[][] => w.providers.map((p) => w.consumers.map((c) => verifyPair(c.reads, p.changes)));

export interface Gate {
  ok: boolean;
  blockers: { consumer: number; provider: number; detail: string }[];
}

const gateOf = (pairs: { consumer: number; provider: number; result: Verification }[]): Gate => {
  const blockers = pairs.filter((p) => !p.result.ok).map((p) => ({ consumer: p.consumer, provider: p.provider, detail: mismatchText(p.result.mismatches[0]) }));
  return { ok: blockers.length === 0, blockers };
};

/** Provider version `p` can go out when every consumer version in production still verifies against it. */
export function providerGate(w: World, p: number): Gate {
  return gateOf(
    w.consumers.flatMap((c, ci) => (c.live ? [{ consumer: ci, provider: p, result: verifyPair(c.reads, w.providers[p].changes) }] : [])),
  );
}

/** Consumer version `c` can go out when it verifies against the provider version in production. */
export function consumerGate(w: World, c: number): Gate {
  return gateOf([{ consumer: c, provider: w.liveProvider, result: verifyPair(w.consumers[c].reads, w.providers[w.liveProvider].changes) }]);
}

/** A new provider version: the newest one plus one more change (a no-op when it has it already or the list is full). */
export function releaseProvider(w: World, change: ChangeId): World {
  const last = w.providers.at(-1)!;
  if (last.changes.includes(change) || w.providers.length >= MAX_VERSIONS) return w;
  return { ...w, providers: [...w.providers, { changes: [...last.changes, change] }] };
}

/** A new consumer version: the newest one plus one more field it reads. Not live until the learner says so. */
export function releaseConsumer(w: World, field: Field): World {
  const last = w.consumers.at(-1)!;
  if (last.reads.includes(field) || w.consumers.length >= MAX_VERSIONS) return w;
  return { ...w, consumers: [...w.consumers, { reads: [...last.reads, field], live: false }] };
}

export const setConsumerLive = (w: World, c: number, live: boolean): World => ({
  ...w,
  consumers: w.consumers.map((v, i) => (i === c ? { ...v, live } : v)),
});

/** Deploy provider version `p` if its gate is open. */
export const deployProvider = (w: World, p: number): World => (providerGate(w, p).ok ? { ...w, liveProvider: p } : w);
