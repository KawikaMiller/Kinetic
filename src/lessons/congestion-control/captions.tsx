import type { ReactNode } from 'react';
import { pct } from '../../core/format';
import { timeFrames, type TimedFrame, type TimeMilestone } from '../../core/frames';
import { RULE_LABEL, RULE_TEXT, type FairnessReading, type Rule } from './fairness';
import {
  CUBIC_BETA, CUBIC_C, INITIAL_WINDOW, bdpOf, bufferOf, thresholdOf, summarise, type Algo, type LinkSetup, type RoundRec, type Summary,
} from './model';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const seg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const ALGO_LABEL: Record<Algo, string> = { reno: 'Reno', cubic: 'CUBIC', bbr: 'BBR' };

// ---- scene 1: Reno ---------------------------------------------------------------------------

/** The sentence for a loss round: what overflowed or was lost, and what Reno does with the window. */
export function lossCaption(r: RoundRec, link: LinkSetup): ReactNode {
  const limit = thresholdOf(link);
  const why =
    r.overflow > 0 ? (
      <>
        the window {seg(r.sent)} is above BDP + B = {seg(limit)}, so the buffer overflows and <span className="hl bad">{seg(r.overflow)} {r.overflow === 1 ? 'segment is' : 'segments are'} lost</span>
      </>
    ) : (
      <>
        <span className="hl bad">a segment is lost by chance</span> (random loss {pct(link.loss, 2)} per segment, window {seg(r.sent)})
      </>
    );
  const half = Math.max(2, r.sent / 2);
  return r.event === 'timeout' ? (
    <>
      Round {r.round}: {why}. The whole window counts as lost, a <span className="hl orange">timeout</span>: ssthresh = {seg(half)} and the window restarts at 1 in slow start.
    </>
  ) : (
    <>
      Round {r.round}: {why}. Duplicate ACKs tell the sender: fast retransmit, ssthresh = {seg(half)}, and the window drops to {seg(half)} rather than 1.
    </>
  );
}

/** Rounds after the last shown loss before the "window regrows" caption is worth a frame of its own. */
const REGROW_MIN_ROUNDS = 4;
/** Evenly spaced "window regrows" captions between the last shown loss and the next one (or the end). */
const REGROW_CAPTIONS = 4;
/** How many loss events get a caption of their own. */
const SHOWN_LOSSES = 4;

/** A caption for the quiet stretch after the last shown loss: the window climbing back, read from the model. */
function regrowMilestone(recs: readonly RoundRec[], shown: readonly RoundRec[]): TimeMilestone[] {
  const last = shown[shown.length - 1];
  if (!last) return [];
  const next = recs.find((r) => r.round > last.round && r.event !== null)?.round ?? recs.length - 1;
  const rounds = Array.from({ length: REGROW_CAPTIONS }, (_, k) => Math.floor(last.round + ((next - last.round) * (k + 1)) / (REGROW_CAPTIONS + 1)));
  return rounds
    .filter((round, k) => round - (k === 0 ? last.round : rounds[k - 1]) >= REGROW_MIN_ROUNDS)
    .map((round) => {
      const now = recs[round];
      return {
        t: round,
        say: (
          <>
            Round {round}: the window has regrown to {seg(now.sent)} segments since the loss at round {last.round}, <span className="hl ok">{now.phase === 'slow-start' ? 'back in slow start' : 'in congestion avoidance'}</span>, probing for the limit again.
          </>
        ),
      };
    });
}

/** The frames of Reno's story: `now` is the round. */
export function renoFrames(recs: readonly RoundRec[], link: LinkSetup): TimedFrame[] {
  const end = recs.length - 1;
  const events = recs.filter((r) => r.event !== null);
  const shown = events.slice(0, SHOWN_LOSSES);
  const s = summarise(recs);
  const bdp = bdpOf(link);
  return timeFrames({
    end,
    steps: end,
    hold: 2.2,
    milestones: [...shown.map((r) => ({ t: r.round, say: lossCaption(r, link) })), ...regrowMilestone(recs, shown)],
    intro: (
      <>
        Slow start: the window begins at {INITIAL_WINDOW} segments and doubles every round trip. The pipe holds BDP = {seg(bdp)} segments and the buffer {seg(bufferOf(link))} more, so a window above {seg(thresholdOf(link))} overflows it.
      </>
    ),
    summary: (
      <>
        {plural(events.length, 'loss event')} in {recs.length} rounds{s.timeouts > 0 ? `, ${s.timeouts} of them timeouts` : ''}. The link was {pct(s.meanUtil)} used on average and the round trip averaged {Math.round(s.meanRttMs)} ms against a base of {link.rttMs} ms.
      </>
    ),
  });
}

// ---- scene 2: three algorithms ---------------------------------------------------------------

export interface AlgoRun {
  algo: Algo;
  recs: RoundRec[];
  summary: Summary;
  dropped: number;
}

export function algoSummaryLine(r: AlgoRun): string {
  return `${pct(r.summary.meanUtil)} used, round trip ${Math.round(r.summary.meanRttMs)} ms, ${plural(r.summary.lossEvents, 'loss')} reacted to, ${plural(Math.round(r.dropped), 'segment')} overflowed the buffer`;
}

export function compareIntro(link: LinkSetup, runs: readonly AlgoRun[]): ReactNode {
  const by = (a: Algo) => runs.find((r) => r.algo === a) as AlgoRun;
  const buf = link.bufferBdp;
  const rtt = (a: Algo) => Math.round(by(a).summary.meanRttMs);
  return (
    <>
      Buffer {buf} BDP, base round trip {link.rttMs} ms. Mean round trip: Reno {rtt('reno')} ms, CUBIC {rtt('cubic')} ms, BBR {rtt('bbr')} ms. Losses the sender reacted to: Reno {by('reno').summary.lossEvents}, CUBIC {by('cubic').summary.lossEvents}, BBR{' '}
      {by('bbr').summary.lossEvents}; BBR's buffer overflowed by {plural(Math.round(by('bbr').dropped), 'segment')}, which it did not react to. Mean use of the link: Reno {pct(by('reno').summary.meanUtil)}, CUBIC{' '}
      {pct(by('cubic').summary.meanUtil)}, BBR {pct(by('bbr').summary.meanUtil)}.
    </>
  );
}

// ---- scene 3: fairness -----------------------------------------------------------------------

export function fairnessIntro(rule: Rule, read: FairnessReading): ReactNode {
  const closes = read.endGap < read.startGap / 4;
  return (
    <>
      {RULE_LABEL[rule]}: {RULE_TEXT[rule]}. The gap between the two flows goes from {seg(read.startGap)} to {seg(read.endGap)} points of capacity, and in the last 20 steps they use between {seg(read.lowSum)} and {seg(read.highSum)}
      {'%'} of the link.{' '}
      {closes ? 'The two flows converge on equal shares.' : rule === 'miad' ? 'The gap widens: the bigger flow keeps its lead and the smaller one is squeezed toward 0.' : rule === 'mimd' ? 'The ratio between the two flows stays the same, so the gap does not close in ratio terms.' : 'The flows do not move toward equal shares.'}
    </>
  );
}

// ---- scene 4: random loss --------------------------------------------------------------------

export function lossIntro(link: LinkSetup, sim: number, mathis: number | null): ReactNode {
  const bdp = bdpOf(link);
  const util = Math.min(1, sim / bdp);
  return link.loss === 0 ? (
    <>
      With no random loss the window is limited by the pipe and buffer ({seg(thresholdOf(link))} segments at most): Reno averages {seg(sim)} and uses {pct(util)} of the link.
    </>
  ) : (
    <>
      At {pct(link.loss, 2)} random loss Reno's window averages {seg(sim)} segments (the Mathis relation says {mathis === null ? 'nothing' : seg(mathis)}), which fills {pct(util)} of the link: each chance loss halves the window even though the link was not congested.
    </>
  );
}

export const CUBIC_NOTE = `W(t) = ${CUBIC_C}(t - K)^3 + Wmax, with beta ${CUBIC_BETA}`;
