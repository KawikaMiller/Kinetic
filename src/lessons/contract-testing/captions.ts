import { plural } from '../../core/format';
import { costOf } from './cost';
import { mismatchText, makeContract, verify, type MatcherType } from './contract';
import { coverage, matcherFits, readsOf, renderCheckout, type ConsumerOptions, type Field } from './consumer';
import { contractOf, providerGate, type World } from './deploy';
import { CHANGES, FULL_SCHEMA, handle, type Changes } from './provider';

/** Captions as plain text, computed from the same runs the screen shows. */

const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function consumerCaption(o: ConsumerOptions, chosen: Partial<Record<Field, MatcherType>>): string {
  const named = Object.keys(chosen) as Field[];
  const { missing, extra } = coverage(named, o);
  const loose = named.filter((f) => !matcherFits(f, chosen[f]!, o).fits);
  const parts: string[] = [];
  if (missing.length) parts.push(`the page also reads ${list(missing)}, so a provider could remove ${missing.length === 1 ? 'it' : 'them'} unnoticed`);
  if (extra.length) parts.push(`${list(extra)} ${extra.length === 1 ? 'is' : 'are'} named but never read, which would block a removal nobody needs`);
  if (loose.length) parts.push(`the matcher for ${list(loose)} lets through a value that breaks the page`);
  const verdict = parts.length ? parts.join('; ') : 'it names exactly what the page reads, each with a matcher the page survives';
  return `The page reads ${list(readsOf(o))}. Your contract: ${verdict}.`;
}

export function providerCaption(o: ConsumerOptions, changes: Changes): string {
  const response = handle(changes);
  const mismatches = verify(contractOf(readsOf(o)), response);
  const full = verify(makeContract(FULL_SCHEMA), response);
  const first = mismatches[0] ? `the first is ${mismatchText(mismatches[0])}` : 'every field the consumer reads is still there with the right type';
  const active = CHANGES.filter((c) => changes.has(c.id)).length;
  return `${plural(active, 'change')} applied: the contract reports ${plural(mismatches.length, 'mismatch', 'mismatches')} (${first}), while a full-schema test would report ${plural(full.length, 'mismatch', 'mismatches')}.`;
}

export function deployCaption(w: World): string {
  const candidate = w.providers.length - 1;
  const live = w.liveProvider;
  if (candidate === live) return `Provider v${live + 1} is the newest version and it is in production. Release a version to see whether it can go out.`;
  const gate = providerGate(w, candidate);
  if (gate.ok) return `Provider v${candidate + 1} can go out: every consumer version in production verifies against it. Provider v${live + 1} is live now.`;
  const b = gate.blockers[0];
  return `Provider v${candidate + 1} cannot go out: consumer v${b.consumer + 1}'s contract fails (${b.detail}). ${plural(gate.blockers.length, 'live consumer')} blocking it.`;
}

export function meaningCaption(dollars: boolean, o: ConsumerOptions): string {
  const changes: Changes = new Set(dollars ? (['amount-dollars'] as const) : []);
  const response = handle(changes);
  const passes = verify(contractOf(readsOf(o)), response).length === 0;
  const line = renderCheckout(response.body as Record<string, unknown>, o);
  return `${dollars ? 'Cents to dollars' : 'The unchanged provider'}: the contract ${passes ? 'passes' : 'fails'}, and the page renders "${line}".`;
}

export function costCaption(n: number, e: number): string {
  const c = costOf(n, e);
  return `${plural(n, 'service')} and ${plural(c.verifications, 'dependency edge')}: an end-to-end run needs ${c.e2eDeployed} deployed together, while contracts are ${plural(c.verifications, 'independent check')}.`;
}
