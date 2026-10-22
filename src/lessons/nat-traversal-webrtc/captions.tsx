import type { ReactNode } from 'react';
import type { SeqMessage } from '../../core/sequenceLayout';
import type { Frame } from '../../core/types';
import { KIND_NAME, pairLabel, pairNote, type Pair, type Scenario } from './ice';
import { BEHAVIOUR, NAT_NAME, epText, letsIn, stunTable, SCENE, type NatType, type Peer, type Probe, type Punch } from './nat';
import { latencies, relayLoad } from './relay';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const MAPPING_TEXT = { 'endpoint-independent': 'one outside port per inside endpoint', 'address-and-port-dependent': 'a new outside port per destination' } as const;
export const FILTERING_TEXT = { open: 'lets anyone in', 'address-restricted': 'lets in only addresses it has sent to', 'port-restricted': 'lets in only address-and-port pairs it has sent to' } as const;
export const natLine = (t: NatType) => `${NAT_NAME[t]}: ${MAPPING_TEXT[BEHAVIOUR[t].mapping]}, ${FILTERING_TEXT[BEHAVIOUR[t].filtering]}`;

// ---- scene 1: STUN ----------------------------------------------------------------------------

export interface StunFrame extends Frame {
  /** NAT table rows on screen for A and for B. */
  rows: { A: number; B: number };
  /** What each peer has learned, or null. */
  learned: { A: boolean; B: boolean };
  packet: { path: ('a' | 'na' | 'stun' | 'nb' | 'b')[]; label: string; reply: boolean } | null;
}

export function stunFrames(typeA: NatType, typeB: NatType): StunFrame[] {
  const a = stunTable('A', typeA)[0].outside;
  const b = stunTable('B', typeB)[0].outside;
  const frames: StunFrame[] = [
    {
      rows: { A: 0, B: 0 },
      learned: { A: false, B: false },
      packet: null,
      say: (
        <>
          Peer A (192.168.1.10) and peer B (10.0.0.5) are behind NATs and cannot see their own <span className="hl info">public</span> addresses. A STUN server on the internet can tell them what it sees.
        </>
      ),
    },
  ];
  const peer = (p: Peer, ext: typeof a, base: StunFrame): StunFrame[] => {
    const lc = p.toLowerCase() as 'a' | 'b';
    const nat = (p === 'A' ? 'na' : 'nb') as 'na' | 'nb';
    const rows = { ...base.rows, [p]: 1 };
    return [
      { rows, learned: base.learned, packet: { path: [lc, nat, 'stun'], label: 'binding request', reply: false }, say: <>Peer {p} sends a STUN binding request. NAT {p} makes a mapping: the packet leaves with source <span className="hl">{epText(ext)}</span> instead of {epText(SCENE.inside[p])}.</> },
      { rows, learned: { ...base.learned, [p]: true }, packet: { path: ['stun', nat, lc], label: `you are ${epText(ext)}`, reply: true }, say: <>The server replies with the address it saw: <span className="hl info">{epText(ext)}</span>. Peer {p} now knows its server-reflexive address.</> },
    ];
  };
  const afterA = peer('A', a, frames[0]);
  frames.push(...afterA);
  const afterB = peer('B', b, afterA[afterA.length - 1]);
  frames.push(...afterB);
  const last = afterB[afterB.length - 1];
  frames.push({
    rows: last.rows,
    learned: last.learned,
    packet: null,
    say: (
      <>
        STUN only <span className="hl info">reports an address</span>: A learned {epText(a)} and B learned {epText(b)}, and no packet from A went to B. Each NAT holds one mapping, made for the STUN server{BEHAVIOUR[typeA].mapping === 'address-and-port-dependent' || BEHAVIOUR[typeB].mapping === 'address-and-port-dependent' ? ', and a NAT that makes a mapping per destination will not reuse it for the other peer' : ''}.
      </>
    ),
  });
  return frames;
}

export const tableText = (peer: Peer, type: NatType): { inside: string; outside: string; dest: string; letsIn: string } => {
  const m = stunTable(peer, type)[0];
  return { inside: epText(m.inside), outside: epText(m.outside), dest: m.dest ? epText(m.dest) : 'any destination', letsIn: letsIn(type, m) };
};

// ---- scene 2: hole punching -------------------------------------------------------------------

export interface PunchFrame extends Frame {
  /** Index of the message shown last. */
  index: number;
}

/** The ladder: four signalling messages, then one arrow per probe between the two NATs. */
export function punchMessages(p: Punch): SeqMessage[] {
  const seq = { A: 0, B: 0 };
  const signalling: SeqMessage[] = [
    { id: 's1', from: 'a', to: 'sig', label: 'my address is ' + epText(p.reflexive.A) },
    { id: 's2', from: 'b', to: 'sig', label: 'my address is ' + epText(p.reflexive.B) },
    { id: 's3', from: 'sig', to: 'a', label: 'B is at ' + epText(p.reflexive.B) },
    { id: 's4', from: 'sig', to: 'b', label: 'A is at ' + epText(p.reflexive.A) },
  ];
  const probes: SeqMessage[] = p.probes.map((x) => {
    seq[x.from]++;
    return {
      id: `p${x.from}${seq[x.from]}`,
      from: x.from === 'A' ? 'na' : 'nb',
      to: x.from === 'A' ? 'nb' : 'na',
      label: `${x.from} probe ${seq[x.from]}, tick ${x.tick}`,
      lost: !x.delivered,
      note: x.delivered ? `${epText(x.src)} to ${epText(x.dst)}` : (x.reason ?? ''),
    };
  });
  return [...signalling, ...probes];
}

const SIGNALLING_SAY: ReactNode[] = [
  <>Peer A tells the <span className="hl violet">signalling server</span> its public address. Signalling is an ordinary web service: WebRTC does not define it, the app does.</>,
  <>Peer B tells the signalling server its public address.</>,
  <>The signalling server passes B's address to A.</>,
  <>The signalling server passes A's address to B. Now both can send UDP at each other's public address.</>,
];

function probeSay(x: Probe): ReactNode {
  const to: Peer = x.from === 'A' ? 'B' : 'A';
  if (x.delivered) {
    return (
      <>
        Tick {x.tick}: the probe from {x.from} is <span className="hl ok">delivered</span> through NAT {to}.{x.learned ? <> {to} learns {x.from}'s real source <span className="hl">{epText(x.src)}</span> and aims there from now on.</> : null}
      </>
    );
  }
  return (
    <>
      Tick {x.tick}: the probe from {x.from} is <span className="hl bad">dropped by NAT {to}</span>: {x.reason}.
    </>
  );
}

export function punchFrames(p: Punch, typeA: NatType, typeB: NatType, offset: number): PunchFrame[] {
  const frames: PunchFrame[] = SIGNALLING_SAY.map((say, index) => ({ index, say }));
  p.probes.forEach((x, k) => frames.push({ index: 4 + k, say: probeSay(x) }));
  frames.push({ index: frames.length - 1, say: punchSummary(p, typeA, typeB, offset) });
  return frames;
}

export function punchSummary(p: Punch, typeA: NatType, typeB: NatType, offset: number): ReactNode {
  const pair = `${NAT_NAME[typeA]} against ${NAT_NAME[typeB]}`;
  const late = offset > 0 ? `, B starting ${plural(offset, 'tick')} late` : '';
  if (p.connected) {
    return (
      <>
        {pair}{late}: <span className="hl ok">connected</span>. A first got through at tick {p.firstDelivered.A} and B at tick {p.firstDelivered.B}, after {plural(p.dropped, 'dropped probe')}.
      </>
    );
  }
  return (
    <>
      {pair}{late}: <span className="hl bad">no hole opens</span>. All {plural(p.probes.length, 'probe')} were dropped by a NAT, so the peers need a relay (the next scene).
    </>
  );
}

// ---- scene 3: relay ---------------------------------------------------------------------------

export function relayIntro(connected: boolean, calls: number, share: number): ReactNode {
  const l = latencies();
  const load = relayLoad(calls, share);
  return connected ? (
    <>
      This pair punches a hole, so the media goes <span className="hl ok">directly</span>: {l.direct} ms one way. At your {share}% relayed assumption, the other calls ({plural(load.relayedCalls, 'call')} of {calls.toLocaleString('en-US')}) would use the relay.
    </>
  ) : (
    <>
      This pair cannot punch a hole, so both peers send through the <span className="hl orange">TURN relay</span>: {l.relayed} ms one way instead of {l.direct}, {l.extra} ms more. It is a public address that answers, but it pays for the bandwidth.
    </>
  );
}

// ---- scene 4: ICE -----------------------------------------------------------------------------

export interface IceFrame extends Frame {
  /** How many pairs have been checked. */
  checked: number;
}

export function iceFrames(pairs: readonly Pair[], made: readonly Pair[], sc: Scenario): IceFrame[] {
  const frames: IceFrame[] = [
    {
      checked: 0,
      say: (
        <>
          Each peer gathers a <span className="hl">host</span>, a <span className="hl">server-reflexive</span> and a <span className="hl orange">relayed</span> candidate, and the peers swap them in the offer and the answer. Pairing them gives {pairs.length} pairs, ordered by priority: the agent checks them from the top.
        </>
      ),
    },
  ];
  made.forEach((p, i) => {
    frames.push({
      checked: i + 1,
      say: (
        <>
          Check {i + 1} of {pairs.length}: {pairLabel(p)}. {p.works ? <span className="hl ok">It answers</span> : <span className="hl bad">No answer</span>}: {pairNote(p.local.kind, p.remote.kind, sc)}.
        </>
      ),
    });
  });
  const win = made[made.length - 1];
  frames.push({
    checked: made.length,
    say: win.works ? (
      <>
        The first pair that works is <span className="hl ok">nominated</span>: {KIND_NAME[win.local.kind]} to {KIND_NAME[win.remote.kind]}, after {plural(made.length, 'check')}. The other {pairs.length - made.length} stay untried.
      </>
    ) : (
      <>No pair works: the call fails.</>
    ),
  });
  return frames;
}
