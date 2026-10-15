import type { ReactNode } from 'react';
import { timeFrames, type TimedFrame } from '../../core/frames';
import {
  MM1, REQUESTS, crossoverRho, type Backend, type FanoutReport, type Hedge, type HedgedRequest, type HedgeReport, type Mm1Hedging,
} from './model';
import { pctText, sig } from '../../core/format';

export const msText = (x: number): string => `${sig(x)} ms`;

/** A share that can be 99.996%: three decimals above 99.9%, otherwise one. */
export const touchText = (share: number): string => (share > 0.999 ? `${(share * 100).toFixed(3)}%` : pctText(share, 1));

const slowShare = (p: number): string => (p > 0 ? `Each call is slow 1 time in ${sig(1 / p, 3)}` : 'No call is slow here');

export function fanoutCaption(b: Backend, r: FanoutReport): ReactNode {
  const ratio = r.slowestP99 / r.singleP99;
  return (
    <>
      A request waits for the slowest of its {r.n} {r.n === 1 ? 'backend' : 'backends'}. {slowShare(b.slowProb)}, so{' '}
      <span className="hl">{touchText(r.touchSlow)}</span> of requests touch a slow one. One call&apos;s p99 is {msText(r.singleP99)}; the request&apos;s p99 is{' '}
      <span className="hl orange">{msText(r.slowestP99)}</span>, {sig(ratio, 2)}× as long.
      {Number.isFinite(r.medianSlowN) && (r.n >= r.medianSlowN
        ? <> At {r.n} backends more than half of requests wait on a slow call, so the backend&apos;s rare case is now the request&apos;s typical one.</>
        : <> It takes {r.medianSlowN} backends before more than half of requests wait on a slow call.</>)}
    </>
  );
}

const copyName = (j: number): string => (j === 0 ? 'the first copy' : `copy ${j + 1}`);

/** What happened to one sample request, in the past tense so it stays true on every later frame. */
function finishCaption(i: number, r: HedgedRequest, hedge: Hedge): ReactNode {
  if (r.sentAt.length === 1) {
    return <>Request {i + 1} got its reply at {msText(r.latency)}, before the {msText(hedge.delay)} hedge delay, so no second copy was ever sent.</>;
  }
  const cancelled = r.sentAt.length - 1;
  return (
    <>
      Request {i + 1} finished at <span className="hl ok">{msText(r.latency)}</span>: {copyName(r.winner)} replied first
      {r.winner === 0 ? ' after all, so the hedge was wasted work' : ` (the first copy would have taken ${msText(r.replyAt[0])})`}; the other{' '}
      {cancelled === 1 ? 'copy was' : `${cancelled} copies were`} cancelled.
    </>
  );
}

export function hedgeIntro(hedge: Hedge): ReactNode {
  if (hedge.replicas === 1) return <>One copy per request, no hedging: six sample requests, each waiting for its only reply.</>;
  return (
    <>
      Six sample requests. Each goes to one replica; if nothing has replied after {msText(hedge.delay)}, {hedge.replicas === 2 ? 'a second copy' : 'a second and then a third copy'} goes to
      another replica. The first reply wins and the rest are cancelled.
    </>
  );
}

export function hedgeSummary(hedge: Hedge, report: HedgeReport): ReactNode {
  return (
    <>
      Over {REQUESTS.toLocaleString('en-US')} requests the p99 goes from <span className="hl info">{msText(report.plainP99)}</span> to{' '}
      <span className="hl violet">{msText(report.hedgedP99)}</span> for <span className="hl orange">{pctText(report.extra, 1)}</span> extra requests
      {hedge.correlation > 0 && <>, with {pctText(hedge.correlation, 0)} of requests sharing one fate across their copies</>}.
    </>
  );
}

export const FRAME_STEPS = 30;

/** The time of the last event in the sample requests, rounded up to a tidy axis end. */
export function timelineEnd(samples: readonly HedgedRequest[]): number {
  const last = Math.max(...samples.map((s) => s.latency));
  return Math.ceil(last / 10) * 10;
}

export interface HedgeFrame extends TimedFrame {
  now: number;
}

/** The walk-through: one frame per time step, a captioned frame at each hedge sent and each request finished. */
export function hedgeFrames(samples: readonly HedgedRequest[], hedge: Hedge, report: HedgeReport): HedgeFrame[] {
  const milestones = samples.flatMap((r, i) => [
    ...r.sentAt.slice(1).map((at, k) => ({
      t: at,
      say: <>Request {i + 1} had no reply after {msText(at)}, so {copyName(k + 1)} went out.</>,
    })),
    { t: r.latency, say: finishCaption(i, r, hedge) },
  ]);
  return timeFrames({ end: timelineEnd(samples), steps: FRAME_STEPS, milestones, intro: hedgeIntro(hedge), summary: hedgeSummary(hedge, report), hold: 2.5 });
}

/** Says how the timeline's requests were chosen, from the run: some are picked because they hedged, and the share of all requests that hedge is quoted beside them. */
export function sampleSelectionNote(samples: readonly HedgedRequest[], share: number): string {
  const hedged = samples.filter((r) => r.sentAt.length > 1).length;
  if (hedged === 0) return `These ${samples.length} are the run's first requests, and none of them sent a second copy.`;
  return `${hedged} of these ${samples.length} were picked because they hedged, so the picture over-shows hedging: ${pctText(share, 1)} of all requests in the run sent a second copy.`;
}

export function hurtCaption(r: Mm1Hedging): ReactNode {
  const cross = crossoverRho();
  const crossText = cross === null ? 'never in this range' : pctText(cross, 0);
  if (r.loadedRho === null) {
    return (
      <>
        At ρ = {pctText(r.rho, 0)} the hedges add so many requests that the backend has no steady state:{' '}
        <span className="hl bad">overloaded, the hedge makes it worse than any tail</span>. Without hedging its p99 is {msText(r.plainP99)}. Hedging starts to hurt at ρ = {crossText}.
      </>
    );
  }
  const better = r.hedgedP99! < r.plainP99;
  return (
    <>
      At ρ = {pctText(r.rho, 0)} a hedge after {MM1.hedgeAfterMs} ms adds {pctText(r.extra!, 1)} requests, which lifts the load to ρ′ = {pctText(r.loadedRho, 1)}. The p99
      goes from {msText(r.plainP99)} to <span className={`hl ${better ? 'ok' : 'bad'}`}>{msText(r.hedgedP99!)}</span>: hedging {better ? 'helps' : 'hurts'} here, and the
      crossover is at ρ = {crossText}.
    </>
  );
}
