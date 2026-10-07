import type { ReactNode } from 'react';
import type { SequenceActor, SequenceMessage } from '../../components/SequenceDiagram';
import { humanDuration } from '../../core/format';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import { MAX_TRIES, SERVER_NAMES, flipOf, type Lookup, type Resolver, type Step, type TtlPlan } from './model';

export interface DnsFrame extends Frame {
  /** Index into the lookup's steps; -1 when idle. */
  step: number;
}

export const ACTORS: SequenceActor[] = [
  { id: 'stub', label: 'Your laptop' },
  { id: 'resolver', label: 'Resolver' },
  { id: 'root', label: 'Root' },
  { id: 'tld', label: '.com TLD' },
  { id: 'auth', label: 'ns1.example.com' },
];

const STEP_TONE: Record<Step['kind'], Tone> = {
  query: 'info', ask: 'info', referral: 'violet', cname: 'violet', 'cache-cname': 'violet', answer: 'ok', 'cache-hit': 'ok',
  nxdomain: 'bad', 'cache-negative': 'bad', nodata: 'bad', loop: 'bad', timeout: 'orange', reply: 'ok',
};

export function messageTone(s: Step): Tone {
  if (s.kind === 'reply') return s.rcode === 'NOERROR' ? 'ok' : s.rcode === 'NXDOMAIN' ? 'bad' : 'orange';
  return STEP_TONE[s.kind];
}

export const ladder = (l: Lookup): SequenceMessage[] =>
  l.steps.map((s, i) => ({ id: `${i}-${s.kind}`, from: s.from, to: s.to, label: s.label, lost: s.kind === 'timeout', tone: messageTone(s) }));

const dur = (s: number) => humanDuration(s);

/** One caption per step, from the step itself. */
export function stepCaption(l: Lookup, s: Step): ReactNode {
  switch (s.kind) {
    case 'query':
      return <>Your laptop's stub resolver asks the recursive resolver: <b>{s.label}</b> The resolver does the legwork.</>;
    case 'cache-hit':
      return <><span className="hl">From cache</span>: the resolver already has {s.name}, with {dur(s.ttl!)} of its TTL left. No server is asked.</>;
    case 'cache-negative':
      return <>From cache, a <span className="hl bad">negative answer</span>: {s.name} was "not found" a moment ago, and that is cached too, for{' '}
        {dur(s.ttl!)} more. Even if the record exists now, this resolver won't look until then.</>;
    case 'cache-cname':
      return <>From cache: {s.name} is an alias (CNAME), so the resolver follows it without asking anyone.</>;
    case 'ask':
      return <>The resolver asks {SERVER_NAMES[s.server!]}: <b>{s.label}</b></>;
    case 'referral':
      return <>{SERVER_NAMES[s.server!]} doesn't know the answer but knows who does: a <span className="hl violet">referral</span> ({s.label}). The resolver
        caches that delegation for {dur(s.ttl!)}, so next time it can skip this step.</>;
    case 'answer':
      return <>The authoritative server answers <span className="hl ok">{s.label}</span>, with a TTL of {dur(s.ttl!)}: every resolver that caches it
        may keep serving it that long.</>;
    case 'cname':
      return <>{s.name} is a <span className="hl violet">CNAME</span>: an alias. The answer is "{s.label.replace('CNAME ', '')}", so the resolver starts
        a second lookup for that name.</>;
    case 'nxdomain':
      return <><span className="hl bad">NXDOMAIN</span>: {s.name} doesn't exist. The SOA says to cache this "no" for {dur(s.ttl!)} (the lesser of its
        TTL and its MINIMUM field, RFC 2308).{l.name !== s.name && <> It failed while following the CNAME from {l.name}: a typo in a CNAME target looks exactly like this.</>}</>;
    case 'nodata':
      return <>{s.name} exists, but has no record of this type (NODATA). That empty answer is cached for {dur(s.ttl!)}.</>;
    case 'timeout':
      return <>No answer from {SERVER_NAMES[s.server!]}: <span className="hl orange">timeout</span> (try {s.label.match(/try (\d)/)?.[1]} of {MAX_TRIES}). A
        server that doesn't answer is a different failure from one that answers "no such name".</>;
    case 'loop':
      return <><span className="hl bad">{s.label}</span>: the aliases point at each other, so the resolver gives up.</>;
    case 'reply':
      return l.rcode === 'NOERROR' ? (
        <>The resolver hands back <span className="hl ok">{s.label}</span>. Illustrative total: {l.ms} ms.</>
      ) : l.rcode === 'NXDOMAIN' ? (
        <>The laptop gets <span className="hl bad">NXDOMAIN</span>: "this name doesn't exist". Illustrative total: {l.ms} ms.</>
      ) : (
        <>The laptop gets <span className="hl orange">SERVFAIL</span>: the resolver couldn't get an answer at all, which is not the same as "no such
          name". Illustrative total: {l.ms} ms.</>
      );
  }
}

export const lookupFrames = (l: Lookup): DnsFrame[] =>
  l.steps.map((s, i) => ({ step: i, say: stepCaption(l, s), hold: s.kind === 'reply' ? 2 : 1 }));

// ── Change a record ─────────────────────────────────────────────────────

export type Lowering = 'never' | 'at-change' | 'ahead';

/** What the timeline shows, in words, computed from the flip times. */
export function changeCaption(resolvers: readonly Resolver[], plan: TtlPlan, lowering: Lowering): ReactNode {
  const flips = resolvers.map((r) => flipOf(r, plan));
  const last = Math.max(...flips.map((f) => f.flip));
  const first = Math.min(...flips.map((f) => f.flip));
  const lead =
    lowering === 'at-change' ? (
      <>Lowering the TTL at the moment of the change doesn't help: every resolver already holds a copy cached under the old TTL{' '}
        ({dur(plan.ttl)}), and nobody re-reads the TTL until that copy expires. </>
    ) : lowering === 'ahead' ? (
      <>The TTL was lowered one old TTL ({dur(plan.ttl)}) ahead, so by the change every cached copy carries the short TTL. </>
    ) : null;
  return <>{lead}There's no push: each resolver keeps serving the <span className="hl orange">old address</span> until its own copy expires. The
    first switches {first === 0 ? 'right at the change' : `${dur(first)} after the change`}, the last <b>{dur(last)}</b> after it.</>;
}
