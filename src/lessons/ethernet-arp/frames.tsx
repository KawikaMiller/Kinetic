import type { ReactNode } from 'react';
import type { SequenceActor, SequenceMessage } from '../../components/SequenceDiagram';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { BROADCAST_MAC, PREFIX, hostByMac, ipOf, networkOf, type Step, type Transmission } from './model';

export interface ArpFrame extends Frame {
  /** Index into the transmission's steps; -1 when nothing is being sent. */
  step: number;
}

const hex = (n: number) => `0x${n.toString(16).padStart(4, '0')}`;

/** One caption per step, built from what the step actually did. */
export function stepCaption(tx: Transmission, s: Step, timeout: number): ReactNode {
  const { sender, owner, hop, targetIp } = tx;
  switch (s.kind) {
    case 'decide': {
      const mine = ipOf(networkOf(sender.ip, PREFIX));
      const theirs = ipOf(networkOf(targetIp, PREFIX));
      return hop.onLink ? (
        <>{sender.name} ANDs both addresses with the /{PREFIX} mask: {mine} = {theirs}, the same subnet, so it delivers straight to{' '}
          {targetIp} and needs <b>its</b> MAC address.</>
      ) : (
        <>{sender.name} ANDs both addresses with the /{PREFIX} mask: {theirs} ≠ {mine}, so {targetIp} is off-subnet. The frame goes to the{' '}
          <span className="hl violet">default gateway {hop.ip}</span>, so it needs the router's MAC, not the server's.</>
      );
    }
    case 'hit': {
      const e = s.world.caches[sender.id][hop.ip];
      return <>Cache hit: {sender.name}'s ARP cache already maps {hop.ip} → {e.mac} (learned {plural(s.world.now - e.at, 'second')} ago, kept
        for {timeout} s). No ARP needed.</>;
    }
    case 'miss':
      return s.agedOut ? (
        <>{sender.name} had {hop.ip} cached, but the entry is {timeout} s old or more, so it has <b>aged out</b>. It must ask again.</>
      ) : (
        <>Cache miss: {sender.name}'s ARP cache has no entry for {hop.ip}. It can't build the frame without a destination MAC.</>
      );
    case 'arp-request':
      return <>{sender.name} broadcasts <b>"Who has {hop.ip}? Tell {sender.ip}"</b> to {BROADCAST_MAC}. The switch learns{' '}
        {sender.name} is on port {s.inPort} and floods the frame out of {plural(s.out!.length, 'other port')}. Every host reads it; {owner.name}{' '}
        also records {sender.ip} → {sender.mac}.</>;
    case 'arp-reply':
      return <>Only {owner.name} answers, by <span className="hl ok">unicast</span> to {sender.mac}: "{owner.ip} is at {owner.mac}". The switch learns
        port {s.inPort} for it and, already knowing where {sender.name} is, forwards the reply out of port {s.out![0]} only.</>;
    case 'data': {
      const dst = hostByMac(s.frame!.dst)!;
      const how = s.switchAction === 'flood' ? (
        <>The switch has no entry for {s.frame!.dst}, so it <span className="hl info">floods</span> the frame out of every port but the one it came
          in on (unknown unicast); only {dst.name} keeps it.</>
      ) : (
        <>The switch knows {s.frame!.dst} is on port {s.out![0]} and forwards it there only.</>
      );
      return <>The IPv4 frame goes out (EtherType {hex(s.frame!.ethertype)}) to {s.frame!.dst}. {how}
        {!hop.onLink && <> The router will strip this frame and build a new one for the next link: the MAC changes every hop, the IP stays {targetIp}.</>}</>;
    }
  }
}

export function txFrames(tx: Transmission, timeout: number): ArpFrame[] {
  return tx.steps.map((s, i) => ({ step: i, say: stepCaption(tx, s, timeout), hold: s.kind === 'arp-request' || s.kind === 'data' ? 1.6 : 1 }));
}

export const LADDER_OTHERS = 'others';

/** Lifelines: the sender, the next hop, and everyone else on the LAN (who hear the broadcast). */
export function ladderActors(tx: Transmission): SequenceActor[] {
  return [
    { id: tx.sender.id, label: tx.sender.name },
    { id: tx.owner.id, label: tx.owner.id === 'R' ? 'Router (gateway)' : tx.owner.name, tone: tx.owner.id === 'R' ? 'violet' : undefined },
    { id: LADDER_OTHERS, label: 'Other hosts' },
  ];
}

export function ladderMessages(tx: Transmission): SequenceMessage[] {
  const { sender, owner, hop } = tx;
  return tx.steps.map((s, i): SequenceMessage => {
    const id = `${s.kind}-${i}`;
    switch (s.kind) {
      case 'decide':
        return { id, from: sender.id, to: sender.id, label: hop.onLink ? 'same subnet: deliver direct' : `off-subnet: use gateway ${hop.ip}`, tone: hop.onLink ? undefined : 'violet' };
      case 'hit':
        return { id, from: sender.id, to: sender.id, label: `ARP cache hit: ${hop.ip}` };
      case 'miss':
        return { id, from: sender.id, to: sender.id, label: s.agedOut ? `entry for ${hop.ip} aged out` : `ARP cache miss: ${hop.ip}`, tone: s.agedOut ? 'dim' : undefined };
      case 'arp-request':
        return { id, from: sender.id, to: '*', label: `ARP: who has ${hop.ip}?`, note: `to ${BROADCAST_MAC}`, tone: 'info' };
      case 'arp-reply':
        return { id, from: owner.id, to: sender.id, label: `ARP: ${owner.ip} is at ${owner.mac}`, tone: 'ok' };
      case 'data':
        return { id, from: sender.id, to: owner.id, label: 'IPv4 frame', note: s.switchAction === 'flood' ? 'flooded: switch had no entry' : `to ${s.frame!.dst}`, tone: 'sky' };
    }
  });
}
