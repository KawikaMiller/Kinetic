/**
 * traceroute on the simulated path: probes go out with TTL 1, 2, 3…; every router decrements
 * the TTL, and the one that takes it to 0 drops the probe and answers ICMP Time Exceeded. The
 * destination answers the UDP probe with ICMP Port Unreachable, which ends the trace. A
 * router that doesn't answer ICMP shows as * * *, which isn't necessarily broken: later hops
 * still answer, so it forwards traffic fine.
 */
import { ipv4 } from '../../core/ipv4';
import { mulberry32 } from '../../core/random';
import { SERVER } from './captures';

export interface Hop {
  ip: number;
  name: string;
  /** Answers probes that expire here (some routers rate-limit or ignore ICMP). */
  answers: boolean;
  /** One-way delay to here from the previous hop, ms (illustrative). */
  delay: number;
}

export const PATH: readonly Hop[] = [
  { ip: ipv4('192.0.2.1'), name: 'home router', answers: true, delay: 0.6 },
  { ip: ipv4('198.51.100.1'), name: 'ISP edge', answers: true, delay: 4.2 },
  { ip: ipv4('198.51.100.65'), name: 'ISP core', answers: false, delay: 3.1 },
  { ip: ipv4('203.0.113.1'), name: "server's provider", answers: true, delay: 9.8 },
  { ip: SERVER, name: 'server', answers: true, delay: 1.4 },
];
export const PROBES_PER_HOP = 3;
export const MAX_TTL = 30;

export interface ProbeResult {
  ttl: number;
  /** Who sent the ICMP reply, or null for silence. */
  from: number | null;
  reply: 'time-exceeded' | 'port-unreachable' | null;
  /** The hop the probe expired at (index into PATH). */
  at: number;
  rtts: (number | null)[];
}

/** Send one probe with this TTL along the path: where does it die, and who answers? */
export function probe(ttl: number, path: readonly Hop[] = PATH): { at: number; reply: ProbeResult['reply']; from: number | null } {
  let left = ttl;
  for (let i = 0; i < path.length; i++) {
    const last = i === path.length - 1;
    if (last) return { at: i, reply: 'port-unreachable', from: path[i].ip };
    left -= 1;
    if (left === 0) return { at: i, reply: path[i].answers ? 'time-exceeded' : null, from: path[i].answers ? path[i].ip : null };
  }
  throw new Error('unreachable');
}

/** The whole trace: TTL 1 upwards until the destination answers. RTTs are seeded jitter on the path's delays. */
export function traceroute(path: readonly Hop[] = PATH, seed = 1071): ProbeResult[] {
  const rnd = mulberry32(seed);
  const out: ProbeResult[] = [];
  for (let ttl = 1; ttl <= MAX_TTL; ttl++) {
    const r = probe(ttl, path);
    const oneWay = path.slice(0, r.at + 1).reduce((s, h) => s + h.delay, 0);
    const rtts = Array.from({ length: PROBES_PER_HOP }, () => (r.from === null ? null : Math.round((2 * oneWay + rnd() * 1.5) * 10) / 10));
    out.push({ ttl, from: r.from, reply: r.reply, at: r.at, rtts });
    if (r.reply === 'port-unreachable') break;
  }
  return out;
}
