import type { ReactNode } from 'react';
import { plural, power } from '../../core/format';
import {
  ADDRESS_BITS, blockInfo, blockSize, blockToString, firstDifference, ipToString, splitEqual, summarize, type Allocation, type Block,
} from './model';

const count = (n: number) => n.toLocaleString('en-US');

/** What the current address/prefix means, computed from the block itself. */
export function addressCaption(addr: number, prefix: number): ReactNode {
  const info = blockInfo(addr, prefix);
  const hostBits = ADDRESS_BITS - prefix;
  const cidr = `${ipToString(info.network)}/${prefix}`;
  if (prefix === 0) {
    return <>/0 has no network bits at all: it matches <b>every</b> IPv4 address ({power(32)} of them). As a route, 0.0.0.0/0 is the
      default route, "anything not matched by something more specific".</>;
  }
  if (info.kind === 'single-host') {
    return <>/32: all 32 bits are network bits, so the block is exactly one address, {ipToString(addr)}. That's a host route, used to
      point at a single machine.</>;
  }
  if (info.kind === 'point-to-point') {
    return <>/31 leaves 1 host bit: 2 addresses. RFC 3021 lets a point-to-point link use <b>both</b> as hosts ({ipToString(info.first)} and{' '}
      {ipToString(info.last)}), since a link with two ends needs no broadcast address.</>;
  }
  return <>{cidr}: the first {prefix} bits name the network and the last {hostBits} number the hosts, so the block holds{' '}
    {power(hostBits)} = {count(info.total)} addresses. The first is the network address and the last is the broadcast, which leaves{' '}
    <b>{count(info.usable)}</b> usable hosts{prefix === 24 ? ', not 256' : ''}.</>;
}

/** The "Does it belong?" verdict: the AND of the probe with the mask against the network. */
export function membershipCaption(addr: number, prefix: number, probe: number): ReactNode {
  const net = blockInfo(addr, prefix).network;
  const cidr = `${ipToString(net)}/${prefix}`;
  const diff = firstDifference(net, prefix, probe);
  if (diff === null) {
    return <>{ipToString(probe)} AND the /{prefix} mask = {ipToString(net)}, the network address, so it's{' '}
      <span className="hl ok">inside {cidr}</span>: send to it directly on this network.</>;
  }
  return <>{ipToString(probe)} AND the /{prefix} mask doesn't give {ipToString(net)}: network bit {diff + 1} differs, so it's{' '}
    <span className="hl bad">outside {cidr}</span>, and traffic for it goes to a router.</>;
}

export type SplitMode = 'equal' | 'teams' | 'hand';

/** Summary of an equal split. */
export function equalCaption(parent: Block, prefix: number): ReactNode {
  const n = 2 ** (prefix - parent.prefix);
  return <>{blockToString(parent)} split into {n} /{prefix}s of {count(blockSize(prefix))} addresses, each starting on a multiple of{' '}
    {count(blockSize(prefix))}. Each extra prefix bit halves the block: a bigger number means a <b>smaller</b> network. Put back together,
    they aggregate to {summarize(splitEqual(parent, prefix)).map(blockToString).join(', ')} again.</>;
}

/** Summary of a variable-length allocation. */
export function teamsCaption(parent: Block, blocks: readonly Allocation[], demands: readonly number[]): ReactNode {
  const used = blocks.reduce((s, b) => s + blockSize(b.prefix), 0);
  return <>Each team gets the smallest block with room for it ({demands.map((h, i) => `${h} → /${blocks.find((b) => b.team === i)!.prefix}`).join(', ')}),
    biggest first, so every block lands on a multiple of its own size. {count(used)} of {count(blockSize(parent.prefix))} addresses
    used, {count(blockSize(parent.prefix) - used)} left for later.</>;
}

/** Summary of hand-placed blocks, with what they aggregate to. */
export function handCaption(parent: Block, placed: readonly Block[]): ReactNode {
  if (!placed.length) {
    return <>Type a block inside {blockToString(parent)}, like {ipToString(parent.net)}/{Math.min(32, parent.prefix + 2)}, and press Add. A
      block that doesn't start on a multiple of its own size is refused.</>;
  }
  const sum = summarize(placed);
  return <>{plural(placed.length, 'block')} carved out. As routes they summarise to {plural(sum.length, 'block')}:{' '}
    {sum.map(blockToString).join(', ')}.</>;
}
