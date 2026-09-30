import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { N, type SimEvent, type Tick } from './sim';

export type Scenario = 'file' | 'video';
export interface TuFrame extends Frame, Tick {}

/** How long autoplay lingers on a frame that narrates an event. */
const EVENT_HOLD = 3.2;

function narrate(e: SimEvent, scenario: Scenario): ReactNode {
  switch (e.kind) {
    case 'tcp-loss':
      return <>TCP packet <span className="hl bad">#{e.seq}</span> just vanished. The sender has no idea yet: it only finds out when the ACK never comes.</>;
    case 'udp-loss':
      return <>UDP lost <span className="hl bad">#{e.seq}</span>. No ACKs, no retries: the app will simply never see it.</>;
    case 'retx':
      return <>No ACK for <span className="hl violet">#{e.seq}</span> before the timeout → TCP <b>resends</b> it and slams its window down to 1 (congestion control: loss means the network is struggling).</>;
    case 'hol':
      return (
        <>
          {e.held.map((s) => `#${s}`).join(', ')} arrived, but <span className="hl">#{e.waiting}</span> is missing. TCP holds everything behind
          the gap: <b>head-of-line blocking</b>.{scenario === 'video' ? ' On a call, that is a frozen picture.' : ''}
        </>
      );
    case 'release':
      return <>#{e.seqs[0]} finally made it → TCP releases <span className="hl ok">#{e.seqs[0]}–#{e.seqs[e.seqs.length - 1]}</span> to the app in one burst.</>;
    case 'udp-reorder':
      return <>UDP handed <span className="hl">#{e.seq}</span> to the app <i>after</i> #{e.before}: out of order. The app has to cope with that itself.</>;
    case 'udp-done':
      return <>UDP is done. Everything that survived arrived immediately, in whatever order the network produced.</>;
    case 'tcp-done':
      return <>TCP has delivered all {N}, perfectly in order.</>;
  }
}

export function buildFrames(ticks: Tick[], scenario: Scenario): TuFrame[] {
  const seen = new Set<string>();
  let lastStatus = '';
  const frames: TuFrame[] = ticks.map((tick) => {
    // one caption per tick, first-of-its-kind events win (retx/release always narrate)
    const e = tick.events.find((ev) => ev.kind === 'retx' || ev.kind === 'release' || !seen.has(ev.kind));
    tick.events.forEach((ev) => seen.add(ev.kind));
    if (e) {
      lastStatus = '';
      return { ...tick, say: narrate(e, scenario), hold: EVENT_HOLD };
    }
    // No event: show where both protocols stand, but only when that changes,
    // so an old event's caption never lingers over unrelated frames.
    const status = `${tick.tcp.delivered.length}|${tick.udp.delivered.length}|${tick.udp.lost.length}`;
    if (status === lastStatus) return { ...tick, say: undefined, hold: 1 };
    lastStatus = status;
    return {
      ...tick,
      hold: 1,
      // a live readout, so it swaps in place instead of fading like an event
      quiet: true,
      say: (
        <>
          TCP has handed <b>{tick.tcp.delivered.length}/{N}</b> to the app, in order. UDP: <b>{tick.udp.delivered.length}</b> arrived
          {tick.udp.lost.length > 0 && <>, <span className="hl bad">{tick.udp.lost.length} lost</span></>}.
        </>
      ),
    };
  });
  frames[0].say = (
    <>
      The same {N} packets, sent over <b>TCP</b> (top) and <b>UDP</b> (bottom), across a link that loses and reorders
      packets. Press play.
    </>
  );
  frames[0].quiet = false;
  frames[0].hold = 2;
  const last = frames[frames.length - 1];
  const { tcp, udp } = last;
  last.hold = 3;
  last.quiet = false;
  last.say =
    scenario === 'file' ? (
      <>
        File download: TCP delivered <span className="hl ok">all {N} in order</span> (it took {tcp.doneAt} ticks);{' '}
        UDP finished at {udp.doneAt} but the file is <span className="hl bad">missing {plural(udp.lost.length, 'chunk')}</span>.
        For files, correctness wins: use TCP.
      </>
    ) : (
      <>
        Video call: TCP's longest freeze was <span className="hl bad">{tcp.longestStall} ticks</span> waiting on retransmits.{' '}
        UDP just skipped {plural(udp.lost.length, 'frame')} and kept going. A late frame is useless, so real-time apps pick{' '}
        <span className="hl ok">UDP</span>.
      </>
    );
  return frames;
}
