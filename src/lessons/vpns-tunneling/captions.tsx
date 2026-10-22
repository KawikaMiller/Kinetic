import type { ReactNode } from 'react';
import { ipToString } from '../../core/ipv4';
import type { Frame } from '../../core/types';
import type { Ladder } from './ladders';
import { roundTripsBeforeData } from './ladders';
import { SIZE, TUNNEL_NAME, INNER_DST, INNER_SRC, innerPacket, layoutOf, overheadOf, runningOverhead, unwrap, wrap, effectiveOptions, type TunnelId, type TunnelOptions } from './tunnels';
import { TCP_IP_HEADERS, transferSteps, type MtuInput, type Outcome } from './mtu';
import { WINDOW, numberAt, type ReplayWindow, type Verdict } from './replay';
import type { Lookup, RouteRow, TiePolicy } from './routing';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

// ---- scene 1 ----------------------------------------------------------------------------------

export interface WrapFrame extends Frame {
  /** How many fields of the outer layout are on the packet. */
  shown: number;
  /** The far side has opened it. */
  opened: boolean;
}

/** The facts of one wrapped packet, computed from the real bytes. */
export function wrapFacts(tunnel: TunnelId, o: TunnelOptions, payload: number) {
  const inner = innerPacket(payload);
  const eff = effectiveOptions(tunnel, o);
  const wrapped = wrap(tunnel, eff, inner);
  const back = unwrap(tunnel, eff, wrapped.bytes);
  const overhead = overheadOf(tunnel, inner.length, eff);
  return { inner, eff, wrapped, back, overhead, layout: layoutOf(tunnel, inner.length, eff) };
}

export function wrapFrames(tunnel: TunnelId, o: TunnelOptions, payload: number): WrapFrame[] {
  const f = wrapFacts(tunnel, o, payload);
  const fields = [...f.layout.before, ...f.layout.after];
  const running = runningOverhead(f.layout);
  const total = f.wrapped.bytes.length;
  const frames: WrapFrame[] = [
    {
      shown: 0,
      opened: false,
      say: (
        <>
          <span className="hl info">An inner packet</span> of {f.inner.length} bytes from {INNER_SRC} to {INNER_DST}: a {SIZE.innerIpv4}-byte IPv4 header and {payload} bytes of payload. {TUNNEL_NAME[tunnel]} will put the whole of it inside a new packet, one field at a time.
        </>
      ),
    },
  ];
  fields.forEach((field, i) => {
    frames.push({
      shown: i + 1,
      opened: false,
      say: (
        <>
          Add the <span className="hl">{field.name}</span>: {field.bytes === 0 ? 'none needed (0 bytes)' : plural(field.bytes, 'byte')}, {field.note}. Overhead so far: <span className="hl amber">{running[i].total} bytes</span>.
        </>
      ),
    });
  });
  frames.push({
    shown: fields.length,
    opened: true,
    say: f.back.ok ? (
      <>
        The far side reads the outer headers{f.layout.after.some((x) => x.tone === 'orange') ? ', checks the tag' : ''} and recovers the inner packet: {f.back.inner.length} bytes, {f.back.inner.length === f.inner.length && f.back.inner.every((b, i) => b === f.inner[i]) ? 'byte for byte the same' : 'but different from what went in'}. The tunnel cost <span className="hl amber">{f.overhead} bytes</span>, {pct(f.overhead, total)} of the {total} bytes on the wire.
      </>
    ) : (
      <>The far side dropped the packet: {f.back.error}.</>
    ),
  });
  return frames;
}

// ---- scene 2 ----------------------------------------------------------------------------------

export interface MtuFrame extends Frame {
  /** Index of the ladder message shown last. */
  index: number;
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  delivered: 'delivered',
  fragmented: 'delivered in fragments',
  'dropped-silent': 'dropped silently',
  'dropped-icmp': 'dropped, and the sender was told',
};
export const outcomeLabel = (o: Outcome) => OUTCOME_TEXT[o];

export function mtuSummary(i: MtuInput): ReactNode {
  const { result: r, stalls } = transferSteps(i);
  const mtu = (
    <>
      The tunnel MTU is {i.linkMtu} - {r.overhead} = <span className="hl ok">{r.tunnelMtu}</span> bytes.
    </>
  );
  if (r.outcome === 'delivered') {
    return (
      <>
        {mtu} {r.clamped ? <>MSS clamping cut the segments to {r.sent} bytes ({r.tunnelMtu - TCP_IP_HEADERS} of data plus {TCP_IP_HEADERS} of headers), so they <span className="hl ok">fit</span>.</> : <>The {r.sent}-byte packet <span className="hl ok">fits</span>.</>}
      </>
    );
  }
  if (r.outcome === 'fragmented') {
    return (
      <>
        {mtu} The {r.sent}-byte packet is too big, and with don't-fragment clear it is split into <span className="hl">{plural(r.fragments, 'fragment')}</span> and delivered.
      </>
    );
  }
  if (r.outcome === 'dropped-icmp') {
    return (
      <>
        {mtu} The {r.sent}-byte packet is too big and don't-fragment is set, so the tunnel entrance drops it and sends ICMP back; the sender <span className="hl">learns {r.tunnelMtu}</span> and retries.
      </>
    );
  }
  return (
    <>
      {mtu} The {r.sent}-byte packet is too big, don't-fragment is set and ICMP is blocked: it is <span className="hl bad">dropped silently</span>. Pings and small requests work, but the large transfer {stalls ? 'stalls' : 'completes'}.
    </>
  );
}

export function mtuFrames(i: MtuInput): MtuFrame[] {
  const { steps } = transferSteps(i);
  const frames: MtuFrame[] = steps.map((s, k) => ({
    index: k,
    say: (
      <>
        <span className={s.lost ? 'hl bad' : s.id === 'icmp' ? 'hl' : 'hl ok'}>{s.lost ? 'Lost' : s.id === 'icmp' ? 'Message' : 'Passed'}</span>: {s.label}{s.note ? ` (${s.note})` : ''}.
      </>
    ),
  }));
  frames.push({ index: steps.length - 1, say: mtuSummary(i) });
  return frames;
}

// ---- scene 3 ----------------------------------------------------------------------------------

export function routesIntro(rows: readonly RouteRow[], addr: number, l: Lookup, policy: TiePolicy): ReactNode {
  const dest = ipToString(addr);
  if (!l.winner) return <>{dest} matches no route, so it has nowhere to go.</>;
  const side = l.winner.goes === 'tunnel' ? <span className="hl violet">through the tunnel</span> : <span className="hl info">directly</span>;
  if (l.conflict) {
    return (
      <>
        <span className="hl bad">{dest} matches {l.ties.length} routes of the same length</span> ({ipToString(l.ties[0].net)}/{l.ties[0].prefix}) that point at different places, so the lookup alone cannot decide. With the tie going to {policy === 'tunnel' ? 'the tunnel' : 'the direct route'} it goes {side}: the {l.winner.goes === 'tunnel' ? 'home' : 'office'} machine with this address is unreachable.
      </>
    );
  }
  return (
    <>
      {dest} matches {plural(l.matches.length, 'route')} of {rows.length}; the longest is {ipToString(l.winner.net)}/{l.winner.prefix} ({l.winner.label}), so it goes {side}.
    </>
  );
}

// ---- scene 4 ----------------------------------------------------------------------------------

export interface LadderFrame extends Frame {
  index: number;
}
export function ladderFrames(l: Ladder): LadderFrame[] {
  const trips = roundTripsBeforeData(l);
  return l.steps.map((s, i) => ({
    index: i,
    say: (
      <>
        <span className="hl info">{s.label}</span>: {s.note}.{i === trips * 2 - 1 ? ` The first data can go after ${plural(trips, 'round trip')}.` : ''}
      </>
    ),
  }));
}

export function verdictText(v: Verdict): string {
  if (v.kind === 'accepted') return v.slid > 0 ? `accepted, the window slides up by ${v.slid}` : 'accepted, inside the window';
  if (v.kind === 'replay') return 'dropped: already seen (a replay)';
  if (v.kind === 'too-old') return `dropped: below the window (numbers up to ${v.floor} are too old to check)`;
  return 'dropped: in this ESP-style window numbers start at 1';
}

export function replayIntro(w: ReplayWindow, last: { n: number; verdict: Verdict } | null): ReactNode {
  const seen = w.bits.reduce<number>((a, b) => a + b, 0);
  const lo = numberAt(w, 0) ?? 1;
  if (!last) return <>The window is empty: it covers no number yet. Send a packet and watch the window slide.</>;
  return (
    <>
      Packet {last.n}: <span className={last.verdict.kind === 'accepted' ? 'hl ok' : 'hl bad'}>{verdictText(last.verdict)}</span>. The window of {WINDOW} now covers {lo} to {w.top} and remembers {plural(seen, 'number')}.
    </>
  );
}
