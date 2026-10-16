import type { ReactNode } from 'react';
import { timeFrames, type TimedFrame } from '../../core/frames';
import { OUTCOME_LABEL, POLICY_LABEL, REQUEST_LABEL, runEarly, isSafeToRepeat, type EarlyRun, type Outcome } from './earlyData';
import { STACKS, STACK_LABEL, roundTripsBeforeRequest, roundTripsToFirstByte, schedule, timelineEnd } from './flights';
import { holRun, packetText, summariseHol, type Layout } from './hol';
import { SWITCH_AT_MS, TCP_NOTICE_MS, recover } from './migration';
import type { EarlyState, HandshakeState, HolState, MigrateState } from './init';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const msText = (t: number) => `${Math.round(t)} ms`;

// ---- scene 1: round trips ----------------------------------------------------------------------

/** First-byte time of every stack at the setting, in stack order. */
export const firstBytes = (rttMs: number, thinkMs: number): number[] => STACKS.map((s) => schedule(s, rttMs, thinkMs).firstByteAt);

export function handshakeFrames(s: HandshakeState): TimedFrame[] {
  const sched = schedule(s.stack, s.rttMs, s.thinkMs);
  const rounds = roundTripsBeforeRequest(s.stack);
  const fb = firstBytes(s.rttMs, s.thinkMs);
  const slowest = fb[0];
  return timeFrames({
    end: timelineEnd(s.rttMs, s.thinkMs),
    steps: 40,
    hold: 2.5,
    milestones: [
      {
        t: sched.requestAt,
        say: (
          <>
            {STACK_LABEL[s.stack]}: after {plural(rounds, 'round trip')} ({msText(sched.requestAt)}) the client sends <span className="hl">the request</span>.
          </>
        ),
      },
      {
        t: sched.firstByteAt,
        say: (
          <>
            {STACK_LABEL[s.stack]}: the <span className="hl ok">first byte of the response</span> arrives at {msText(sched.firstByteAt)}: {plural(roundTripsToFirstByte(s.stack), 'round trip')}
            {s.thinkMs > 0 ? ` plus ${msText(s.thinkMs)} of server think time` : ''}.
          </>
        ),
      },
    ],
    intro: (
      <>
        Four ways to fetch one page from a server {msText(s.rttMs)} away, DNS left out. Each handshake message takes half a round trip; the request can leave only when the handshake allows it, and the answer takes one more round trip.
      </>
    ),
    summary: (
      <>
        First byte after {STACKS.map((st, i) => `${STACK_LABEL[st]} ${msText(fb[i])}`).join(', ')}: {STACK_LABEL['quic-0rtt']} is {msText(slowest - fb[3])} sooner than {STACK_LABEL['tcp-tls12']}; in this model the whole gap is round trips saved.
      </>
    ),
  });
}

// ---- scene 2: what 0-RTT costs -------------------------------------------------------------------

export function earlyIntro(s: EarlyState, run: EarlyRun): ReactNode {
  const req = REQUEST_LABEL[s.request];
  const copies = 1 + s.replays;
  const what = s.request === 'get' ? 'catalogue reads' : 'charges';
  const safe = isSafeToRepeat(s.request);
  return (
    <>
      The client resumes with a stored ticket and puts <span className="hl">{req}</span> in its first flight{run.retried ? '' : <>, so the answer can start after {msText(run.firstByteMs)}</>}.{' '}
      {s.replays === 0 ? 'Press "Replay the first flight" to deliver a copy of it again: early data has no replay protection of its own.' : `${plural(copies, 'copy', 'copies')} of the flight reached the server under "${POLICY_LABEL[s.policy]}".`}{' '}
      The server did the work <span className={run.applied > 1 && !safe ? 'hl bad' : 'hl'}>{run.applied} {run.applied === 1 ? 'time' : 'times'}</span> ({what})
      {run.applied > 1 && !safe ? ': a customer would be charged more than once' : run.applied > 1 ? ': harmless for a request that is safe to repeat' : ''}
      {run.retried ? `. The refused request was sent again after the handshake, so the first byte comes at ${msText(run.firstByteMs)}` : ''}.
    </>
  );
}

export const deliveryText = (d: { copy: number; outcome: Outcome }): string => (d.copy === 0 && d.outcome !== 'retried' ? `original: ${OUTCOME_LABEL[d.outcome]}` : d.outcome === 'retried' ? OUTCOME_LABEL.retried : `copy ${d.copy}: ${OUTCOME_LABEL[d.outcome]}`);

export const earlyRunOf = (s: EarlyState, thinkMs: number): EarlyRun => runEarly(s.request, s.policy, s.replays, s.rttMs, thinkMs);

// ---- scene 3: head-of-line blocking ---------------------------------------------------------------

export function holIntro(layout: Layout, s: HolState): ReactNode {
  const run = holRun(layout, s.lost, s.rttMs);
  const sum = summariseHol(run);
  const names = s.lost.map((k) => `packet ${k + 1} (${packetText(layout.packets[k])})`);
  if (s.lost.length === 0) {
    return <>No packet is lost, so both stacks finish every stream at the same time. Click a packet to lose it.</>;
  }
  return (
    <>
      Lost: {names.join(', ')}.{' '}
      {sum.tcpDelayed === 0 && sum.quicDelayed === 0 ? (
        <>At this round trip ({msText(s.rttMs)}) the resend arrives no later than the next packet, so <span className="hl orange">0 streams wait</span> on either stack.</>
      ) : (
        <>
          Over TCP the bytes come out in order, so <span className="hl orange">{plural(sum.tcpDelayed, 'stream')} {sum.tcpDelayed === 1 ? 'waits' : 'wait'}</span> for the resend of everything sent after the hole; over QUIC{' '}
          {sum.quicDelayed === 0 ? (
            <><span className="hl orange">0 streams wait</span>, since no stream's own data is held back.</>
          ) : (
            <>
              only <span className="hl orange">{plural(sum.quicDelayed, 'stream')}</span> {sum.quicDelayed === 1 ? 'waits' : 'wait'}, {sum.quicDelayed === 1 ? 'the one' : 'the ones'} whose own data was in a lost packet.
            </>
          )} The resend costs one round trip ({msText(s.rttMs)}).
        </>
      )}
    </>
  );
}

// ---- scene 4: migration ----------------------------------------------------------------------------

export function migrateFrames(s: MigrateState): TimedFrame[] {
  const tcp = recover('tcp', s.rttMs, s.udpBlocked);
  const quic = recover('quic', s.rttMs, s.udpBlocked);
  const end = SWITCH_AT_MS + Math.max(tcp.stallMs, quic.stallMs) + SWITCH_AT_MS;
  return timeFrames({
    end,
    steps: 40,
    hold: 2.5,
    milestones: [
      {
        t: SWITCH_AT_MS,
        say: (
          <>
            The phone leaves Wi-Fi for cellular and gets a new address. A TCP connection is named by its four-tuple (the two addresses and two ports), so <span className="hl bad">this one is dead</span>. A QUIC connection is named by a connection ID, which did not change.
          </>
        ),
      },
      {
        t: SWITCH_AT_MS + quic.stallMs,
        say: s.udpBlocked ? (
          <>
            UDP is blocked on the new network, so QUIC gets no answer. After {msText(quic.parts[0].ms)} the client falls back to TCP (browsers typically do, from memory) and pays the same handshake.
          </>
        ) : (
          <>
            QUIC: the client keeps sending from the new address; the server answers with a <span className="hl ok">PATH_CHALLENGE</span>, the client replies with a PATH_RESPONSE, and the transfer continues after one round trip ({msText(s.rttMs)}).
          </>
        ),
      },
      {
        t: SWITCH_AT_MS + tcp.stallMs,
        say: (
          <>
            TCP: the app notices after a {msText(TCP_NOTICE_MS)} timeout (illustrative), opens a new connection (handshake) and asks again: {msText(tcp.stallMs)} stalled in all.
          </>
        ),
      },
    ],
    intro: <>A phone downloads over Wi-Fi, then moves to cellular {msText(SWITCH_AT_MS)} in. Both stacks have the same round trip, {msText(s.rttMs)}.</>,
    summary: (
      <>
        Stalled after the switch: TCP {msText(tcp.stallMs)}, QUIC {msText(quic.stallMs)}
        {s.udpBlocked ? ' (with UDP blocked, QUIC pays a wait and then the TCP handshake)' : ''}.
      </>
    ),
  });
}
