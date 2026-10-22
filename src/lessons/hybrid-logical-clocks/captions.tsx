import type { ReactNode } from 'react';
import { decimal } from '../../core/format';
import { eventLabels, hlcText, type Inversion, type Stamped } from './hlc';
import { MODES, RULES_TEXT, type SeedOptions, type SeedRun } from './seeded';

/** Scene 1: what the three stamps say about causes and effects, from the execution. */
export function execCaption(a: { stamps: readonly Stamped[]; inv: { physical: Inversion[]; lamport: Inversion[]; hlc: Inversion[] }; refusal: string | null }): ReactNode {
  if (a.refusal) return <span className="hl bad">{a.refusal}</span>;
  if (a.stamps.length === 0) return <>No events yet. Add a message or a local event, and give the three clocks different offsets.</>;
  const labels = eventLabels(a.stamps.map((s) => s.event));
  const first = a.inv.physical[0];
  return (
    <>
      {first
        ? <>Physical stamps put <span className="hl bad">{labels[first.effect]} before its cause {labels[first.cause]}</span> ({a.stamps[first.effect].pt} against {a.stamps[first.cause].pt}), and there are {a.inv.physical.length} such pair{a.inv.physical.length === 1 ? '' : 's'} in all. </>
        : <>The physical stamps happen to agree with causality here. </>}
      Lamport stamps have {a.inv.lamport.length} inversions and hybrid stamps {a.inv.hlc.length}{first ? <>: at {labels[first.effect]} the hybrid stamp is <span className="hl ok">{hlcText(a.stamps[first.effect].hlc)}</span>, above the cause&apos;s {hlcText(a.stamps[first.cause].hlc)}</> : null}.
    </>
  );
}

/** Scene 2. */
export function burstCaption(a: { resolution: number; burst: number; distinctPhysical: number; distinctHybrid: number; largest: number }): ReactNode {
  return (
    <>
      A clock that reads every {a.resolution} ms gives {a.burst} events {a.distinctPhysical} distinct physical stamp{a.distinctPhysical === 1 ? '' : 's'}; the hybrid stamps are {a.distinctHybrid} distinct ones, with a counter that peaks at {a.largest}.
      {a.distinctPhysical < a.burst ? <> The physical stamps <span className="hl bad">tie</span>, the hybrid ones do not.</> : <> This clock is fine enough that nothing ties.</>}
    </>
  );
}

/** Scene 3. */
export function boundCaption(a: { options: SeedOptions; run: SeedRun; sweepFailing: number; outside: boolean }): ReactNode {
  const mode = MODES.find((m) => m.value === a.options.mode)!.label.toLowerCase();
  const { run } = a;
  return (
    <>
      {mode}, ε = {a.options.epsilon} ms: this run&apos;s clocks differ by at most {decimal(run.bound, 1)} ms, and the largest l - pt is {decimal(run.maxLead, 1)} ms.{' '}
      {a.options.farAheadMs > 0
        ? <>One clock is {decimal(a.options.farAheadMs / 1000, 1)} s ahead: l is pulled <span className={a.outside ? 'hl bad' : 'hl ok'}>{a.outside ? 'past the bound' : 'forward'}</span>{run.violation ? '' : ', yet the ordering rules hold'}.</>
        : run.violation
          ? <><span className="hl bad">{RULES_TEXT[run.violation.rule]} broken: {run.violation.message}</span>.</>
          : <>Every rule holds in this run.</>}
      {' '}Over seeds 1 to 200 this stamping rule fails on {a.sweepFailing}.
    </>
  );
}
