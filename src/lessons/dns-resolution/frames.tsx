import type { ReactNode } from 'react';
import type { SequenceActor, SequenceMessage } from '../../components/SequenceDiagram';
import { humanDuration } from '../../core/format';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import { SERVER_NAMES, flipOf, type Lookup, type Resolver, type Step, type TtlPlan } from './model';

export interface DnsFrame extends Frame {
  /** Index into the lookup's steps; -1 when idle. */
  step: number;
}

export const ACTORS: SequenceActor[] = [
  { id: 'stub', label: 'Your laptop' },
  { id: 'resolver', label: 'Resolver' },
  { id: 'root', label: 'Root' },
  { id: 'tld', label: '.com TLD' },
  { id: 'ns1', label: 'ns1.example.com' },
  { id: 'ns2', label: 'ns2.example.com' },
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
const zoneOf = (name: string) => name.split('.').slice(-2).join('.');

/** One caption per step, from the step itself (and, for a timeout, what the resolver did next). */
export function stepCaption(l: Lookup, s: Step): ReactNode {
  switch (s.kind) {
    case 'query':
      return <>Your laptop's stub resolver asks the recursive resolver: <b>{s.label}</b> The resolver does the legwork.</>;
    case 'cache-hit':
      return <><span className="hl ok">From cache</span>: the resolver already has {s.name}, with {dur(s.ttl!)} of its TTL left. No server is asked.</>;
    case 'cache-negative':
      return s.negative === 'NXDOMAIN' ? (
        <>From cache, a <span className="hl bad">negative answer</span>: {s.name} didn't exist when last asked, and that "no such name" is cached for the
          whole name, every type, for {dur(s.ttl!)} more. Even if the record exists now, this resolver won't look until then.</>
      ) : (
        <>From cache, a <span className="hl bad">NODATA</span> answer: {s.name} exists but has no {l.type} record, and that empty answer is cached
          for {dur(s.ttl!)} more.</>
      );
    case 'cache-cname':
      return <>From cache: {s.name} is an alias (CNAME), so the resolver follows it without asking anyone.</>;
    case 'ask':
      return <>The resolver asks {SERVER_NAMES[s.server!]}: <b>{s.label}</b></>;
    case 'referral': {
      const glue = s.label.includes(`.${zoneOf(s.name)}`) && s.server === 'tld';
      return <>{SERVER_NAMES[s.server!]} doesn't know the answer but knows who does: a <span className="hl violet">referral</span> ({s.label}). The resolver
        caches that delegation for {dur(s.ttl!)}, so next time it can skip this step.{glue && <> The referral also carries those servers' IP
        addresses ("glue"), since nobody could look up ns1.example.com without already knowing example.com's servers.</>}</>;
    }
    case 'answer':
      return s.chain?.length ? (
        <>{SERVER_NAMES[s.server!]} finds {l.name} is a CNAME for {s.name}, and it is authoritative for the target too, so it includes the answer in the same
          reply: <span className="hl ok">{s.label}</span>. A target in another zone would need a second lookup.</>
      ) : (
        <>The authoritative server answers <span className="hl ok">{s.label}</span>, with a TTL of {dur(s.ttl!)}: every resolver that caches it may keep
          serving it that long.</>
      );
    case 'cname': {
      const target = s.chain!.at(-1)!.data;
      return <>{s.name} is a <span className="hl violet">CNAME</span> for {target}, which is in another zone ({zoneOf(target)}). {SERVER_NAMES[s.server!]} can't
        answer for it, so the resolver starts a second lookup for that name.</>;
    }
    case 'nxdomain':
      return <><span className="hl bad">NXDOMAIN</span>: {s.name} doesn't exist. The SOA says to cache this "no" for {dur(s.ttl!)} (the lesser of its
        TTL and its MINIMUM field, RFC 2308), for every type of that name.{l.name !== s.name && <> It failed while following the CNAME from {l.name}: a typo in a CNAME target looks exactly like this.</>}</>;
    case 'nodata':
      return <>{s.name} exists, but has no record of this type (NODATA). That empty answer is cached for {dur(s.ttl!)}.</>;
    case 'timeout': {
      const next = l.steps[l.steps.indexOf(s) + 1];
      const fallback = next && (next.kind === 'ask' || next.kind === 'timeout');
      return <>No answer from {SERVER_NAMES[s.server!]}: <span className="hl orange">timeout</span>.{' '}
        {fallback ? <>The zone has another name server, so the resolver tries {SERVER_NAMES[next.server!]} next: one dead server costs time, not the answer.</>
          : <>None of the zone's servers answered, so the resolver gives up.</>} A server that doesn't answer is a different failure from one that
        answers "no such name".</>;
    }
    case 'loop':
      return <><span className="hl bad">{s.label}</span>: the aliases point at each other, so the resolver gives up.</>;
    case 'reply': {
      const aliases = l.answers.filter((a) => a.includes('→'));
      const withChain = aliases.length ? <> The response carries the CNAME chain too ({aliases.join(', ')}).</> : null;
      return l.rcode === 'NOERROR' ? (
        <>The resolver hands back <span className="hl ok">{s.label}</span>.{withChain} Illustrative total: {l.ms} ms.</>
      ) : l.rcode === 'NXDOMAIN' ? (
        <>The laptop gets <span className="hl bad">NXDOMAIN</span>: "this name doesn't exist".{withChain} Illustrative total: {l.ms} ms.</>
      ) : (
        <>The laptop gets <span className="hl orange">SERVFAIL</span>: the resolver couldn't get an answer at all, which is not the same as "no such
          name". Illustrative total: {l.ms} ms.</>
      );
    }
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
  return <>{lead}Nothing pushes the change into resolver caches: each resolver keeps serving the <span className="hl orange">old address</span> until its own copy expires. The
    first switches {first === 0 ? 'right at the change' : `${dur(first)} after the change`}, the last <b>{dur(last)}</b> after it.</>;
}
