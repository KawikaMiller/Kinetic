import type { ReactNode } from 'react';
import { integer } from '../../core/format';
import { generalName, held, judge, orderName, runOm, type Behaviour, type Bit, type OmSetup } from './om';
import { breakText } from './om';
import type { OmSeedRun } from './omNodes';
import type { QuorumOverlap } from './quorums';

/** Scene 1: before and after Run, from the run itself. */
export function traitorCaption(a: { setup: OmSetup; behaviour: Behaviour | null; ran: boolean; refusal: string | null; every?: { total: number; breaking: number } | null }): ReactNode {
  const { setup } = a;
  if (a.refusal) return <span className="hl bad wrap">{a.refusal}</span>;
  if (a.every) {
    return <>Every traitor behaviour at {setup.n} generals (one traitor, binary values, OM(1)): {a.every.breaking === 0 ? <span className="hl ok wrap">none of the {a.every.total} breaks IC1 or IC2</span> : <span className="hl bad wrap">{a.every.breaking} of {a.every.total} break a rule</span>}.</>;
  }
  const traitors = [...setup.traitors].map(generalName).join(' and ') || 'nobody';
  if (!a.ran) return <>{setup.n} generals, traitor: {traitors}. The commander&apos;s order is {orderName(setup.order)} when it is loyal. Set what the traitor says on each edge, then press Run.</>;
  const run = runOm(setup);
  const verdict = judge(setup, run);
  const decided = [...verdict.loyal].map(([i, d]) => `${generalName(i)} decides ${d}`).join(', ');
  if (verdict.ic1 && verdict.ic2) return <>Both rules hold in this run: {decided || 'no loyal lieutenant'}. <span className="hl ok wrap">IC1 and IC2 hold</span> for this traitor and these lies; that says nothing about the others until you try every behaviour.</>;
  const named = a.behaviour ? breakText(setup.n, a.behaviour) : 'the loyal lieutenants disagree';
  return <><span className="hl bad wrap">{named}</span>. {decided}.</>;
}

/** The values a lieutenant holds, in words, for the generals panel. */
export const holdsText = (setup: OmSetup, i: number): string => held(setup, runOm(setup), i).map((h) => `${generalName(h.from)}: ${h.value}`).join(', ');

/** Scene 2. */
export function quorumCaption(o: QuorumOverlap): ReactNode {
  return (
    <>
      n = {o.n}, f = {o.f}: {integer(o.quorums)} quorums of {o.quorumSize}, {integer(o.pairs)} pairs of distinct quorums, and the smallest overlap is {o.smallestOverlap} (n - 2f = {o.n - 2 * o.f}).{' '}
      {o.loyalWitness
        ? <>With at most {o.f} traitor{o.f === 1 ? '' : 's'}, the {o.smallestOverlap} shared nodes include a <span className="hl ok wrap">loyal one</span>.</>
        : <>All {o.smallestOverlap} shared nodes <span className="hl bad wrap">could be traitors</span>, so two quorums can be told different stories.</>}
    </>
  );
}

/** Scene 3. */
export function signedCaption(a: { oral: { ic1: boolean; ic2: boolean }; signed: { ic1: boolean; ic2: boolean }; oralTotal: number; oralBreaking: number; signedTotal: number; signedBreaking: number }): ReactNode {
  const word = (r: { ic1: boolean; ic2: boolean }) => (r.ic1 && r.ic2 ? 'hold' : 'break');
  return (
    <>
      For these choices, oral messages {word(a.oral)} and signed orders {word(a.signed)}. Over every traitor behaviour at n = 3: oral {a.oralBreaking} of {a.oralTotal} break a rule, signed {a.signedBreaking} of {a.signedTotal}.
      The signature is a modelled tag, not cryptography.
    </>
  );
}

/** Scene 4. */
export function sampledCaption(a: { n: number; seed: number; run: OmSeedRun; failing: number; seeds: number; lowest: number | null }): ReactNode {
  const traitors = [...a.run.setup.traitors].map(generalName).join(' and ');
  return (
    <>
      OM(2) with {a.n} generals, seed {a.seed}: traitors {traitors}, loyal order {orderName(a.run.setup.order as Bit)}.{' '}
      {a.run.broken ? <span className="hl bad wrap">{a.run.broken}</span> : <span className="hl ok wrap">IC1 and IC2 held in this run</span>}. Over seeds 1 to {a.seeds}: {a.failing === 0 ? `held on ${a.seeds} of ${a.seeds}` : `${a.failing} of ${a.seeds} fail, lowest failing seed ${a.lowest}`}; sampled, not exhaustive.
    </>
  );
}
