import type { ReactNode } from 'react';
import { joinList, pct } from '../../core/format';
import { timeFrames, type TimedFrame } from '../../core/frames';
import type { Frame } from '../../core/types';
import { ACK_SLOTS, DIFS_SLOTS, type BackoffSlot, type BackoffStory } from './backoff';
import { CW_MIN, airtimeShare, analysisAirtime, analysisCollision, collisionShare, nextCw, slotEvents, type DcfState } from './dcf';
import { hearing, isHidden, exchange, type Geometry } from './hidden';
import type { HiddenState } from './init';
import { shares, type Shares } from './rates';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const stationName = (i: number) => `S${i + 1}`;
/** "S2", "S2 and S4", "S2, S4 and S5". */
export const names = (xs: readonly number[]): string => joinList(xs.map(stationName));

// ---- scene 1: one station's backoff ------------------------------------------------------------------

export interface BackoffFrame extends Frame {
  slot: number;
}

/** What is happening in one slot of the story, in a sentence. */
export function slotCaption(slot: BackoffSlot, prev: BackoffSlot | undefined, story: BackoffStory): ReactNode {
  const counter = slot.counter as number;
  switch (slot.medium) {
    case 'busy-other':
      return prev && prev.medium !== 'busy-other' ? (
        <>
          Slot {slot.t}: station B sends again and the medium is busy: A's counter <span className="hl info">freezes at {counter}</span>. It counts only through idle slots.
        </>
      ) : slot.drew !== undefined ? (
        <>
          Slot {slot.t}: station A has a frame but the medium is busy (station B is sending), so it does not send. It draws a random backoff from 0 to {slot.cw}: <span className="hl info">{slot.drew}</span>.
        </>
      ) : (
        <>Slot {slot.t}: still busy; the counter stays at {counter}.</>
      );
    case 'difs':
      return slot.drew !== undefined ? (
        <>
          Slot {slot.t}: no ACK came, so A doubles its window to {slot.cw} and draws again: <span className="hl info">{slot.drew}</span>. It waits for the medium to be idle for DIFS ({DIFS_SLOTS} slots) first.
        </>
      ) : (
        <>
          Slot {slot.t}: the medium is idle, but A waits DIFS ({DIFS_SLOTS} slots) before it counts: the counter is {counter}.
        </>
      );
    case 'idle':
      return (
        <>
          Slot {slot.t}: an idle slot, so A counts down: <span className="hl info">{counter + 1} to {counter}</span>.
        </>
      );
    case 'a-sends':
      return (
        <>
          Slot {slot.t}: the counter is 0, so <span className="hl">A sends its frame</span>. A radio cannot listen while it sends, so it cannot tell whether anyone else is sending too.
        </>
      );
    case 'ack':
      return (
        <>
          Slot {slot.t}: the <span className="hl ok">ACK</span> comes back after a short gap: the frame got through{story.draws.length > 1 ? ' on the second try' : ''}.
        </>
      );
    case 'ack-missing':
      return (
        <>
          Slot {slot.t}: <span className="hl bad">no ACK</span> within {plural(ACK_SLOTS, 'slot')}. A cannot hear a collision, so it infers a loss from the silence and will double its window to {nextCw(slot.cw)}.
        </>
      );
  }
}

export function backoffFrames(story: BackoffStory): BackoffFrame[] {
  return story.slots.map((slot, i) => ({ slot: i, say: slotCaption(slot, story.slots[i - 1], story) }));
}

// ---- scene 2: contention -----------------------------------------------------------------------------

/** The frames of a saturated run: `now` is the virtual slot. */
export function contentionFrames(history: readonly DcfState[], n: number): TimedFrame[] {
  const events = slotEvents(history);
  const firstCollision = events.find((e) => e.kind === 'collision');
  const firstSuccess = events.find((e) => e.kind === 'success');
  const end = events.length;
  const last = history[history.length - 1];
  const ana = analysisCollision(n);
  return timeFrames({
    end,
    steps: end,
    hold: 2.4,
    milestones: [
      ...(firstSuccess
        ? [{ t: firstSuccess.tick, say: <>Slot {firstSuccess.tick}: only {names(firstSuccess.senders)} hit 0 and sent, so the frame got through: <span className="hl ok">a success</span>, and it goes back to a window of {CW_MIN}.</> }]
        : []),
      ...(firstCollision
        ? [
            {
              t: firstCollision.tick,
              say: (
                <>
                  Slot {firstCollision.tick}: {names(firstCollision.senders)} {firstCollision.senders.length === 2 ? 'both' : 'all'} hit 0 and sent: <span className="hl bad">a collision</span>. Neither gets an ACK, so each doubles its window and draws again.
                </>
              ),
            },
          ]
        : []),
    ],
    intro: (
      <>
        {plural(n, 'station')} always have a frame to send. Each draws a backoff from 0 to its window ({CW_MIN} to start) and counts it down; at 0 it sends. One sender is a success, two or more a collision.
      </>
    ),
    summary: (
      <>
        After {end} virtual slots {pct(collisionShare(last) ?? 0)} of attempts collided (the analysis says {pct(ana)} in the long run) and {pct(airtimeShare(last) ?? 0)} of the airtime carried a frame (long run {pct(analysisAirtime(n))}).
      </>
    ),
  });
}

// ---- scene 3: hidden node ----------------------------------------------------------------------------

export function hiddenIntro(s: HiddenState): ReactNode {
  const g: Geometry = { a: s.a, c: s.c, range: s.range };
  const h = hearing(g);
  if (!h.aToAp || !h.cToAp) {
    const out = [!h.aToAp ? 'A' : null, !h.cToAp ? 'C' : null].filter(Boolean).join(' and ');
    return (
      <>
        Station {out} {out.length > 1 ? 'are' : 'is'} out of the access point's range, so {out.length > 1 ? 'their' : 'its'} frames never arrive: <span className="hl">out of range</span>. Move {out.length > 1 ? 'them' : 'it'} closer or widen the range.
      </>
    );
  }
  const plain = exchange(h, s.frame, false);
  const rts = exchange(h, s.frame, true);
  if (!isHidden(h)) {
    return (
      <>
        A and C hear each other, so the later one defers (carrier sensing works) and frames collide only when both start in the same slot: {pct(plain.pCollide, 1)} of attempts. {plain.goodput > rts.goodput ? 'RTS/CTS would only add overhead here.' : 'RTS/CTS would still help a little here.'}
      </>
    );
  }
  return (
    <>
      A and C are <span className="hl violet">hidden from each other</span>: both reach the access point, neither hears the other, so neither senses a busy medium. Frames of {s.frame} slots collide at the access point in {pct(plain.pCollide, 1)} of attempts.{' '}
      {s.rtsCts
        ? `With RTS/CTS the access point's CTS silences the other station for the exchange (its NAV): data frames collide in ${pct(rts.pDataCollide, 0)} of attempts, and the short RTS frames in ${pct(rts.pCollide, 1)}.`
        : 'Turn on RTS/CTS and the access point silences the other station for the exchange.'}
    </>
  );
}

/** "–" instead of 0% when nothing got through, so a collapse never reads as a measured percentage. */
export const goodputText = (g: number): string => (g === 0 ? '–' : pct(g, 0));

// ---- scene 4: one slow station -------------------------------------------------------------------------

export function ratesIntro(rates: readonly number[], sh: Shares, without: Shares | null): ReactNode {
  const slowCount = rates.filter((r) => r === Math.min(...rates)).length;
  const hasSlow = new Set(rates).size > 1;
  const slow = sh.stations.find((s) => s.rate === Math.min(...rates));
  if (!hasSlow || !slow) {
    return <>All {rates.length} stations send at {rates[0]} Mbit/s: each gets {sh.stations[0].mbps.toFixed(1)} Mbit/s, and each holds {pct(sh.stations[0].airtime)} of the air.</>;
  }
  return (
    <>
      Every station gets about the same number of turns, so with equal frames the {slowCount === 1 ? 'slow station' : `${slowCount} slow stations`} at {slow.rate} Mbit/s hold{slowCount === 1 ? 's' : ''} the air for {pct(slow.airtime)} of each round and everyone gets{' '}
      <span className="hl bad">{sh.stations[0].mbps.toFixed(1)} Mbit/s</span>
      {without ? ` instead of ${without.stations[0].mbps.toFixed(1)} Mbit/s without ${slowCount === 1 ? 'it' : 'them'}` : ''}. That is the rate anomaly.
    </>
  );
}

export const withoutSlow = (rates: readonly number[]): Shares | null => {
  const fast = rates.filter((r) => r === Math.max(...rates));
  return fast.length >= 1 && fast.length < rates.length ? shares(fast) : null;
};
