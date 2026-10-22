import type { ReactNode } from 'react';
import { decimal } from '../../core/format';
import { eventLabels, hlcText, type Inversion, type Stamped } from './hlc';
import { MODES, RULES_TEXT, SEEDS_TOTAL, type SeedOptions, type SeedRun } from './seeded';

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
      A clock that reads every {a.resolution} ms gives the {a.burst} events {a.distinctPhysical} distinct physical stamp{a.distinctPhysical === 1 ? '' : 's'}; the hybrid stamps are {a.distinctHybrid} distinct ones, with a counter that peaks at {a.largest}.
      {a.distinctPhysical < a.burst ? <> The physical stamps <span className="hl bad">tie</span>, the hybrid ones do not.</> : <> This clock is fine enough that nothing ties, so the counter has nothing to do and stays at 0.</>}
    </>
  );
}

/** The counter's hint under the burst table, from what the table shows. */
export function counterHint(a: { largest: number; returns: boolean }): string {
  if (a.largest === 0) return 'The counter stays at 0 because every event sees a new clock reading, so l alone separates them.';
  const base = `The counter counts events inside one reading and peaks at ${a.largest} here: when the physical clock moves past l, l takes it and c returns to 0.`;
  return a.returns ? base : `${base} In this burst the clock never moves past l, so c only climbs.`;
}

/** The sentence about a far-ahead clock, true only when the ordering checks really do hold on every seed. */
export function farAheadNote(farAheadMs: number, failing: number): string {
  if (farAheadMs <= 0) return '';
  return failing === 0
    ? ' With a far-ahead clock the ordering checks stay green while closeness to real time is lost: the guarantee is only as good as the clock assumption.'
    : ' A far-ahead clock is on as well, and with this stamping rule the ordering checks fail.';
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
      {' '}Over seeds 1 to 200 this stamping rule fails on {a.sweepFailing} of {SEEDS_TOTAL} seeds.
    </>
  );
}
