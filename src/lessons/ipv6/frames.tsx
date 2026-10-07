import type { ReactNode } from 'react';
import type { SequenceActor, SequenceMessage } from '../../components/SequenceDiagram';
import type { Frame } from '../../core/types';
import {
  ATTEMPT_DELAY_MS, EXAMPLE_MAC, EXAMPLE_PREFIX, LINK_LOCAL_PREFIX, PREFIX_HEXTETS, formatCanonical, formatFull, withIid, zeroRun, type CompressStage, type Hextets,
  type Race,
} from './model';

// ── Compress / expand ───────────────────────────────────────────────────

/** Which rule list item is lit: 0 none, 1 lowercase + 8 groups, 2 leading zeros, 3 the "::" run. */
export type Rule = 0 | 1 | 2 | 3;

export interface CompressFrame extends Frame {
  stage: CompressStage;
  rule: Rule;
}

const runText = (h: Hextets) => {
  const run = zeroRun(h);
  return run ? `groups ${run.from + 1}-${run.from + run.len}` : null;
};

export function compressCaption(h: Hextets, stage: CompressStage, compressing: boolean): ReactNode {
  const run = runText(h);
  if (stage === 0) {
    return compressing ? (
      <>The full form: 8 groups of 4 hex digits, 128 bits. <b>{formatFull(h)}</b></>
    ) : (
      <>Fully expanded again: every group back to 4 digits. This is exactly what the 128 bits spell.</>
    );
  }
  if (stage === 1) {
    return compressing ? (
      <>Rule 2: drop the <span className="hl">leading zeros</span> in every group (0db8 → db8, 0000 → 0). A group never disappears this way.</>
    ) : (
      <>Expanding: "::" becomes as many zero groups as it takes to get back to 8.</>
    );
  }
  return compressing ? (
    run ? (
      <>Rule 3: the longest run of two or more zero groups ({run}) becomes <span className="hl">::</span>, once only, the first run if two are equally
        long. Result: <b>{formatCanonical(h)}</b>, the RFC 5952 canonical form.</>
    ) : (
      <>Rule 3 doesn't apply: there's no run of two or more zero groups, and a single zero group stays as "0". Canonical form:{' '}
        <b>{formatCanonical(h)}</b>.</>
    )
  ) : (
    <>Starting from the canonical form, <b>{formatCanonical(h)}</b>. Watch the zeros come back.</>
  );
}

/** Compress plays full → zeros dropped → canonical; expand plays it backwards. */
export function compressFrames(h: Hextets, compressing: boolean): CompressFrame[] {
  const stages: CompressStage[] = compressing ? [0, 1, 2] : [2, 1, 0];
  const rule = (s: CompressStage): Rule => (compressing ? ([1, 2, 3] as Rule[])[s] : s === 2 ? 3 : s === 1 ? 3 : 2);
  return stages.map((stage) => ({ stage, rule: rule(stage), say: compressCaption(h, stage, compressing) }));
}

// ── SLAAC ───────────────────────────────────────────────────────────────

export type IidMode = 'privacy' | 'eui64';

export interface SlaacFrame extends Frame {
  step: number;
}

export const SLAAC_ACTORS: SequenceActor[] = [
  { id: 'host', label: 'Your laptop' },
  { id: 'router', label: 'Router' },
  { id: 'others', label: 'Other nodes' },
];

export const slaacAddresses = (iid: Hextets) => ({ linkLocal: withIid(LINK_LOCAL_PREFIX, iid), global: withIid(PREFIX_HEXTETS, iid) });

/** Short labels so three lifelines fit a phone; the addresses themselves are shown under the ladder. */
export function slaacMessages(): SequenceMessage[] {
  return [
    { id: 'll', from: 'host', to: 'host', label: 'form link-local address' },
    { id: 'rs', from: 'host', to: 'router', label: 'Router Solicitation', note: 'to ff02::2', tone: 'info' },
    { id: 'ra', from: 'router', to: '*', label: 'Router Advertisement', note: `prefix ${EXAMPLE_PREFIX}/64`, tone: 'info' },
    { id: 'global', from: 'host', to: 'host', label: 'form global address', tone: 'ok' },
  ];
}

export function slaacFrames(iid: Hextets, mode: IidMode): SlaacFrame[] {
  const { linkLocal, global } = slaacAddresses(iid);
  const how = mode === 'eui64' ? <>built from the MAC {EXAMPLE_MAC} (EUI-64)</> : <>64 random bits (a privacy address, RFC 8981)</>;
  return [
    { step: -1, say: <>A laptop joins an IPv6 network. No DHCP is needed: it builds its own addresses (SLAAC). Press play.</> },
    { step: 0, say: <>First a <b>link-local</b> address: fe80::/64 plus a 64-bit interface ID, {how}. It works on this link only: <b>{formatCanonical(linkLocal)}</b>.</> },
    { step: 1, say: <>It multicasts a <span className="hl info">Router Solicitation</span> to ff02::2, all routers on the link: "is there a router here?"</> },
    { step: 2, say: <>The router multicasts a <span className="hl info">Router Advertisement</span> to ff02::1, all nodes, carrying the network's prefix:{' '}
      {EXAMPLE_PREFIX}/64.</> },
    { step: 3, say: <>The laptop puts the prefix and its interface ID together: <span className="hl ok">{formatCanonical(global)}</span>. 64 bits of network,
      64 bits of host, and no server handed it out.</>, hold: 2 },
  ];
}

// ── Happy Eyeballs ──────────────────────────────────────────────────────

export interface RaceFrame extends Frame {
  /** The clock, in ms. */
  now: number;
}

export function raceFrames(r: Race, broken: boolean): RaceFrame[] {
  const frames: RaceFrame[] = [
    { now: 0, say: <>The browser asks DNS for both records at once: A (IPv4) and AAAA (IPv6).</> },
    { now: r.v6Start, say: <>Both answers are in after {r.v6Start} ms. Prefer IPv6: the <span className="hl info">IPv6</span> attempt starts first.</> },
  ];
  if (r.v4Start === null) {
    frames.push({ now: r.connectedAt, say: <><span className="hl ok">IPv6 connects</span> after {r.connectedAt - r.v6Start} ms, inside the {ATTEMPT_DELAY_MS} ms head start, so IPv4 is never tried.</>, hold: 2 });
    return frames;
  }
  frames.push({
    now: r.v4Start,
    say: <>{ATTEMPT_DELAY_MS} ms and no IPv6 connection{broken ? ' (its packets are being dropped)' : ''}, so the IPv4 attempt starts too. Now they race.</>,
  });
  frames.push({
    now: r.connectedAt,
    say: r.winner === 'v4'
      ? <><span className="hl ok">IPv4 wins</span> at {r.connectedAt} ms. A broken IPv6 path cost {ATTEMPT_DELAY_MS} ms instead of a long timeout: that's the point of Happy Eyeballs.</>
      : <><span className="hl ok">IPv6 wins</span> at {r.connectedAt} ms, just ahead of IPv4.</>,
    hold: 2,
  });
  return frames;
}
