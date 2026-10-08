import type { ReactNode } from 'react';
import { ipToString } from '../../core/ipv4';
import type { Frame } from '../../core/types';
import { endpoint, mismatch, netText, portText, type Action, type CtEntry, type Packet, type Rule, type StreamStep } from './model';

export type Phase = 'arrive' | 'check' | 'policy' | 'outcome';

export interface FwFrame extends Frame {
  /** Index of the packet in the stream. */
  k: number;
  phase: Phase;
  /** The rule being checked (check phase). */
  rule: number;
  /** Conntrack as the frame shows it: before the packet until its outcome, after it from then on. */
  table: CtEntry[];
}

const ACTION_TONE: Record<Action, string> = { ACCEPT: 'ok', DROP: 'bad', REJECT: 'orange' };
export const actionTone = (a: Action) => ACTION_TONE[a];

export const packetText = (p: Packet) => `${endpoint(p.src, p.sport)} → ${endpoint(p.dst, p.dport)} ${p.proto} ${p.flags}`;

export const ruleSummary = (r: Rule) => {
  const parts = [r.proto ?? 'any protocol', r.src ? `from ${netText(r.src)}` : 'from anywhere', r.dport ? `to port ${portText(r.dport)}` : 'to any port'];
  if (r.state !== 'any') parts.push(`state ${r.state}`);
  return parts.join(' ');
};

function whyNot(r: Rule, s: StreamStep): string {
  const p = s.packet;
  switch (mismatch(r, p, s.ct)) {
    case 'src': return `${ipToString(p.src)} isn't in ${netText(r.src)}`;
    case 'port': return `port ${p.dport} isn't ${portText(r.dport)}`;
    case 'proto': return `it's ${p.proto}, not ${r.proto}`;
    default: return `conntrack says ${s.ct}, not ${r.state}`;
  }
}

/** The client's side of a verdict: what someone on the other end experiences. */
export function outcomeText(a: Action): ReactNode {
  if (a === 'ACCEPT') return <><span className="hl ok">ACCEPT</span>: the packet goes through to the server.</>;
  if (a === 'DROP')
    return <><span className="hl bad">DROP</span>: thrown away silently. The client hears nothing, so it retries and eventually reports a{' '}
      <b>timeout</b>, the same as a dead host or a cut cable.</>;
  return <><span className="hl orange">REJECT</span>: the firewall answers with an ICMP "port unreachable" (iptables' default; <code>--reject-with tcp-reset</code> sends a TCP RST instead), so the client fails at
    once with <b>connection refused</b>.</>;
}

function stepFrames(s: StreamStep, k: number, rules: readonly Rule[], before: CtEntry[], tracking: boolean, policy: Action): FwFrame[] {
  const p = s.packet;
  const base = { k, rule: -1, table: before };
  if (p.dir === 'out') {
    return [{
      ...base, phase: 'outcome', table: s.table,
      say: <>Outbound: {p.label}, {packetText(p)}. This model doesn't filter outgoing traffic (OUTPUT policy ACCEPT).{' '}
        {tracking
          ? <>Conntrack <span className="hl info">records the flow</span>, so the reply can be recognised.</>
          : <>With tracking off, nothing remembers the flow: the reply will look like any other incoming packet.</>}</>,
    }];
  }
  const v = s.verdict!;
  const ct = tracking ? <> Conntrack calls it <b>{s.ct}</b>{s.ct === 'ESTABLISHED' ? ': it belongs to a flow on record.' : ': no flow on record.'}</> : <> Tracking is off, so there's no connection state.</>;
  const frames: FwFrame[] = [{ ...base, phase: 'arrive', say: <>Incoming: {p.label}, {packetText(p)}.{ct}</> }];
  v.outcomes.forEach((o, i) => {
    if (o === 'unreached') return;
    const r = rules[i];
    const n = i + 1;
    let say: ReactNode;
    if (o === 'off') say = <>Rule {n} is switched off, so it's skipped.</>;
    else if (o === 'needs-tracking') say = <>Rule {n} matches on connection state, which needs tracking. With tracking off it can never match.</>;
    else if (o === 'pass') say = <>Rule {n} ({ruleSummary(r)}) doesn't match: {whyNot(r, s)}. On to the next rule.</>;
    else say = <>Rule {n} ({ruleSummary(r)}) <span className="hl">matches</span>. First match wins, so the rules below it are never looked at.</>;
    frames.push({ ...base, phase: 'check', rule: i, say });
  });
  if (v.rule === null)
    frames.push({ ...base, phase: 'policy', say: <>No rule matched, so the <span className="hl violet">default policy</span> decides: {policy}.</> });
  frames.push({ ...base, phase: 'outcome', table: s.table, say: outcomeText(v.action), hold: 1.5 });
  return frames;
}

/** Every packet's walk through the rules, one frame per rule checked, after an intro. */
export function streamFrames(steps: readonly StreamStep[], rules: readonly Rule[], tracking: boolean, policy: Action, intro: ReactNode): FwFrame[] {
  const frames: FwFrame[] = [{ k: -1, phase: 'arrive', rule: -1, table: [], say: intro }];
  let before: CtEntry[] = [];
  steps.forEach((s, k) => {
    frames.push(...stepFrames(s, k, rules, before, tracking, policy));
    before = s.table;
  });
  return frames;
}

export function introText(label: string, packets: number, tracking: boolean): ReactNode {
  return <>{label}: {packets} packets will arrive one at a time. Each walks the rules from the top, and the first rule that matches decides.
    Tracking is {tracking ? 'on (stateful)' : 'off (stateless)'}. Press play, or edit the rules first.</>;
}

