// Plain-data views of the Raft sim for React, split by how often they change:
// - clusterView: roles, terms, logs, events. Throttled; drives the log table,
//   event list, stats and the node bodies.
// - motionView: message dots, election-timer rings and heartbeat pulses. Every
//   frame, but only the small layer that draws them re-renders.
import { clamp01 } from '../../core/math';
import type { SafetyMonitor, SafetyViolation } from './safety';
import { HEARTBEAT, N, type Entry, type Msg, type Raft, type RaftEvent, type Role } from './sim';

/* ─── Cluster geometry (SVG units) ─── */

export const VIEW_W = 460;
export const VIEW_H = 420;
export const CX = 230;
export const CY = 208;
export const RING = 150;
export const NODE_R = 32;
export const TIMER_R = NODE_R + 8;

export const deg = (i: number) => -90 + i * (360 / N);

/** Centre of node i on the ring. */
export function pos(i: number, r = RING) {
  const a = (deg(i) * Math.PI) / 180;
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
}

/* ─── Throttled cluster view ─── */

export const EVENTS_SHOWN = 7;

export interface NodeView {
  id: number;
  role: Role;
  term: number;
  alive: boolean;
  log: Entry[];
  commit: number;
  votes: number;
}

export interface ClusterView {
  nodes: NodeView[];
  msgCount: number;
  events: RaftEvent[]; // newest first
  minority: number[] | null;
  safety: { violation: SafetyViolation | null; events: number; committed: number };
}

export function clusterView(r: Raft, monitor: SafetyMonitor): ClusterView {
  return {
    nodes: r.nodes.map((n) => ({
      id: n.id, role: n.role, term: n.term, alive: n.alive, log: n.log.slice(), commit: n.commit, votes: n.votes.size,
    })),
    msgCount: r.msgs.length,
    events: r.events.slice(-EVENTS_SHOWN).reverse(),
    minority: r.minority ? [...r.minority] : null,
    safety: { violation: monitor.violation, events: monitor.events, committed: monitor.committedCount },
  };
}

/* ─── Per-frame motion view ─── */

export interface MsgDot {
  id: number;
  x: number;
  y: number;
  r: number;
  color: string;
  opacity: number;
  vote: boolean;
}

export interface RingView {
  id: number;
  role: Role;
  alive: boolean;
  timerLeft: number; // 0..1 of the election timeout remaining
  sinceBeat: number; // ms since the leader's last heartbeat broadcast
}

export interface MotionView {
  msgs: MsgDot[];
  rings: RingView[];
}

// A lost message flies halfway, then turns red and fizzles out at the partition.
const LOST_AT = 0.5;

function msgStyle(m: Msg): { color: string; r: number } {
  switch (m.type) {
    case 'vote':
      return { color: 'var(--violet)', r: 5 };
    case 'voteResp':
      return { color: m.granted ? 'var(--ok)' : 'var(--bad)', r: 4 };
    case 'append':
      return m.entries.length ? { color: 'var(--hi)', r: 5.5 } : { color: 'var(--info)', r: 3.5 };
    case 'appendResp':
      return { color: m.success ? 'var(--ok)' : 'var(--bad)', r: 2.5 };
  }
}

export function motionView(r: Raft): MotionView {
  return {
    msgs: r.msgs.map((m) => {
      const a = pos(m.from);
      const b = pos(m.to);
      const raw = (r.now - m.sentAt) / (m.arriveAt - m.sentAt);
      const fizzling = m.lost && raw > LOST_AT;
      const p = m.lost ? Math.min(raw, LOST_AT) : raw;
      const style = msgStyle(m);
      return {
        id: m.id,
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p,
        r: style.r,
        color: fizzling ? 'var(--bad)' : style.color,
        opacity: fizzling ? Math.max(0, 1 - (raw - LOST_AT) * 2) : 1,
        vote: m.type === 'vote',
      };
    }),
    rings: r.nodes.map((n) => ({
      id: n.id,
      role: n.role,
      alive: n.alive,
      timerLeft: clamp01((n.timeoutAt - r.now) / n.timeoutDur),
      sinceBeat: r.now - (n.nextHeartbeat - HEARTBEAT),
    })),
  };
}
