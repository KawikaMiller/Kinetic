// A small Raft model: leader election + log replication, no snapshots, no membership change.
// Time is in simulated milliseconds, slowed right down so humans can watch. Every random draw
// (timeouts, latency jitter, loss, duplication) comes from the injected `Rnd`, so a seed fixes them.
import type { Rnd } from '../../core/random';

export const N = 5;
export const MAJORITY = Math.floor(N / 2) + 1;
export const LATENCY = 550;
export const HEARTBEAT = 800;
// Spread must dwarf message latency, otherwise rivals time out before the
// first RequestVote even lands and elections split (Raft: broadcast ≪ timeout).
// MIN must also beat HEARTBEAT + worst-case LATENCY so healthy followers never time out.
export const TIMEOUT_MIN = 1500;
export const TIMEOUT_MAX = 4500;

export type Role = 'follower' | 'candidate' | 'leader';

export interface Entry {
  /** Unique per command in a run, so two entries compare by identity, not by their text. */
  id: number;
  term: number;
  cmd: string;
}

/**
 * The real rules, plus two planted bugs the safety monitor catches (each is one rule removed):
 * - 'commit-without-majority': a leader commits an entry once 2 servers store it, not 3 of 5;
 * - 'vote-without-log-check': a server grants its vote without checking the candidate's log is up to date.
 */
export type RaftVariant = 'raft' | 'commit-without-majority' | 'vote-without-log-check';

/** Replica count at which the 'commit-without-majority' variant commits (the leader plus one follower). */
export const WEAK_QUORUM = 2;

export interface RaftOptions {
  rnd: Rnd;
  variant?: RaftVariant;
  /** Chance each message is dropped on the wire (a partition drops its crossing messages on top). */
  loss?: number;
  /** Chance each message is also delivered a second time, at its own jittered delay. */
  duplicate?: number;
}

export interface RaftNode {
  id: number;
  role: Role;
  term: number;
  votedFor: number | null;
  log: Entry[];
  commit: number; // number of committed entries
  alive: boolean;
  timeoutAt: number;
  timeoutDur: number;
  votes: Set<number>;
  nextIndex: number[]; // 1-based index of next entry to send to each peer
  matchIndex: number[];
  nextHeartbeat: number;
}

type Body =
  | { type: 'vote'; lastLogIndex: number; lastLogTerm: number }
  | { type: 'voteResp'; granted: boolean }
  | { type: 'append'; prevLogIndex: number; prevLogTerm: number; entries: Entry[]; leaderCommit: number }
  | { type: 'appendResp'; success: boolean; matchIndex: number };

export type Msg = Body & {
  id: number;
  from: number;
  to: number;
  term: number;
  sentAt: number;
  arriveAt: number;
  lost: boolean;
  /** Fraction of the flight at which a partition cut this message once it was past halfway: the dot freezes there. */
  stopAt?: number;
};

export interface RaftEvent {
  /** Unique per sim, so two identical events at the same instant (e.g. while paused) stay distinct. */
  id: number;
  t: number;
  text: string;
  kind: 'election' | 'leader' | 'step' | 'commit' | 'crash' | 'client' | 'partition';
}

export const nodeName = (i: number) => `S${i + 1}`;

export class Raft {
  now = 0;
  nodes: RaftNode[];
  msgs: Msg[] = [];
  events: RaftEvent[] = [];
  /** Nodes cut off from the rest (null = no partition). */
  minority: Set<number> | null = null;
  readonly variant: RaftVariant;
  private readonly rnd: Rnd;
  private readonly loss: number;
  private readonly duplicate: number;
  private nextMsg = 1;
  private nextEvent = 1;
  private cmdN = 0;
  onEvent: (e: RaftEvent) => void = () => {};
  /** Called after every state change (a delivery, a timer firing, a click), so a monitor sees every event. */
  observer: ((r: Raft) => void) | null = null;

  constructor({ rnd, variant = 'raft', loss = 0, duplicate = 0 }: RaftOptions) {
    this.rnd = rnd;
    this.variant = variant;
    this.loss = loss;
    this.duplicate = duplicate;
    this.nodes = Array.from({ length: N }, (_, id) => {
      const n: RaftNode = {
        id, role: 'follower', term: 0, votedFor: null, log: [], commit: 0, alive: true,
        timeoutAt: 0, timeoutDur: 0, votes: new Set(), nextIndex: Array(N).fill(1), matchIndex: Array(N).fill(0), nextHeartbeat: 0,
      };
      this.resetTimer(n);
      return n;
    });
  }

  get leader() {
    // the most recent leader that is alive (an old leader can linger in a minority partition)
    return this.nodes.filter((n) => n.alive && n.role === 'leader').sort((a, b) => b.term - a.term)[0] ?? null;
  }

  private emit(kind: RaftEvent['kind'], text: string) {
    const e = { id: this.nextEvent++, t: this.now, text, kind };
    this.events.push(e);
    if (this.events.length > 40) this.events.shift();
    this.onEvent(e);
  }

  private changed() {
    this.observer?.(this);
  }

  private resetTimer(n: RaftNode) {
    n.timeoutDur = TIMEOUT_MIN + this.rnd() * (TIMEOUT_MAX - TIMEOUT_MIN);
    n.timeoutAt = this.now + n.timeoutDur;
  }

  private reachable(a: number, b: number) {
    if (!this.minority) return true;
    return this.minority.has(a) === this.minority.has(b);
  }

  private send(from: number, to: number, term: number, body: Body) {
    const lost = !this.reachable(from, to) || (this.loss > 0 && this.rnd() < this.loss);
    const make = () =>
      ({
        ...body, id: this.nextMsg++, from, to, term, sentAt: this.now,
        arriveAt: this.now + LATENCY * (0.85 + this.rnd() * 0.3),
        lost,
      }) as Msg;
    this.msgs.push(make());
    if (this.duplicate > 0 && this.rnd() < this.duplicate) this.msgs.push(make());
  }

  private lastTerm(n: RaftNode) {
    return n.log.length ? n.log[n.log.length - 1].term : 0;
  }

  /** Any message carrying a higher term turns the receiver into a follower of that term. */
  private observeTerm(n: RaftNode, term: number) {
    if (term <= n.term) return;
    const was = n.role;
    n.term = term;
    n.votedFor = null;
    n.role = 'follower';
    n.votes.clear();
    if (was === 'leader') this.emit('step', `${nodeName(n.id)} saw term ${term} → steps down to follower`);
    else if (was === 'candidate') this.emit('step', `${nodeName(n.id)} saw term ${term} → gives up its candidacy`);
  }

  private startElection(n: RaftNode) {
    n.role = 'candidate';
    n.term++;
    n.votedFor = n.id;
    n.votes = new Set([n.id]);
    this.resetTimer(n);
    this.emit('election', `${nodeName(n.id)} timed out → candidate for term ${n.term}`);
    for (const p of this.nodes) {
      if (p.id !== n.id) this.send(n.id, p.id, n.term, { type: 'vote', lastLogIndex: n.log.length, lastLogTerm: this.lastTerm(n) });
    }
  }

  private becomeLeader(n: RaftNode) {
    n.role = 'leader';
    n.nextIndex = Array(N).fill(n.log.length + 1);
    n.matchIndex = Array(N).fill(0);
    n.matchIndex[n.id] = n.log.length;
    this.emit('leader', `${nodeName(n.id)} won ${n.votes.size}/${N} votes → leader for term ${n.term}`);
    this.broadcastAppend(n);
  }

  private broadcastAppend(n: RaftNode) {
    n.nextHeartbeat = this.now + HEARTBEAT;
    for (const p of this.nodes) {
      if (p.id === n.id) continue;
      const prevLogIndex = n.nextIndex[p.id] - 1;
      this.send(n.id, p.id, n.term, {
        type: 'append',
        prevLogIndex,
        prevLogTerm: prevLogIndex > 0 ? n.log[prevLogIndex - 1].term : 0,
        entries: n.log.slice(prevLogIndex),
        leaderCommit: n.commit,
      });
    }
  }

  /**
   * The current-term commit rule: a leader counts replicas only for an entry written in its own
   * term. An older-term entry on a majority is not yet safe (a server missing it can still win a
   * later election and overwrite it), so it commits indirectly, when a newer entry above it does.
   */
  advanceCommit(n: RaftNode) {
    const needed = this.variant === 'commit-without-majority' ? WEAK_QUORUM : MAJORITY;
    for (let idx = n.log.length; idx > n.commit; idx--) {
      if (n.log[idx - 1].term !== n.term) break;
      const replicas = n.matchIndex.filter((m, i) => (i === n.id ? n.log.length : m) >= idx).length;
      if (replicas >= needed) {
        const from = n.commit;
        n.commit = idx;
        const cmds = n.log.slice(from, idx).map((e) => e.cmd).join(', ');
        const where = replicas >= MAJORITY ? `on a majority (${replicas}/${N})` : `on only ${replicas}/${N}, short of a majority`;
        this.emit('commit', `${cmds} ${where} → committed`);
        break;
      }
    }
  }

  private deliver(m: Msg) {
    const n = this.nodes[m.to];
    if (!n.alive) return;
    this.observeTerm(n, m.term);

    switch (m.type) {
      case 'vote': {
        const upToDate =
          this.variant === 'vote-without-log-check' ||
          m.lastLogTerm > this.lastTerm(n) ||
          (m.lastLogTerm === this.lastTerm(n) && m.lastLogIndex >= n.log.length);
        const granted = m.term === n.term && (n.votedFor === null || n.votedFor === m.from) && upToDate;
        if (granted) {
          n.votedFor = m.from;
          this.resetTimer(n);
        }
        this.send(n.id, m.from, n.term, { type: 'voteResp', granted });
        break;
      }
      case 'voteResp': {
        if (n.role !== 'candidate' || m.term !== n.term || !m.granted) break;
        n.votes.add(m.from);
        if (n.votes.size >= MAJORITY) this.becomeLeader(n);
        break;
      }
      case 'append': {
        if (m.term < n.term) {
          this.send(n.id, m.from, n.term, { type: 'appendResp', success: false, matchIndex: 0 });
          break;
        }
        if (n.role !== 'follower') {
          n.role = 'follower';
          n.votes.clear();
        }
        this.resetTimer(n);
        const ok = m.prevLogIndex === 0 || (n.log.length >= m.prevLogIndex && n.log[m.prevLogIndex - 1].term === m.prevLogTerm);
        if (!ok) {
          this.send(n.id, m.from, n.term, { type: 'appendResp', success: false, matchIndex: 0 });
          break;
        }
        m.entries.forEach((e, k) => {
          const idx = m.prevLogIndex + k; // 0-based slot
          if (n.log[idx] && n.log[idx].term !== e.term) n.log.length = idx; // conflict: drop it and everything after
          if (!n.log[idx]) n.log.push(e);
        });
        const match = m.prevLogIndex + m.entries.length;
        if (m.leaderCommit > n.commit) n.commit = Math.min(m.leaderCommit, match);
        this.send(n.id, m.from, n.term, { type: 'appendResp', success: true, matchIndex: match });
        break;
      }
      case 'appendResp': {
        if (n.role !== 'leader' || m.term !== n.term) break;
        if (m.success) {
          n.matchIndex[m.from] = Math.max(n.matchIndex[m.from], m.matchIndex);
          n.nextIndex[m.from] = n.matchIndex[m.from] + 1;
          this.advanceCommit(n);
        } else {
          n.nextIndex[m.from] = Math.max(1, n.nextIndex[m.from] - 1); // back up and retry next heartbeat
        }
        break;
      }
    }
  }

  step(dtMs: number) {
    this.now += dtMs;
    const due = this.msgs.filter((m) => m.arriveAt <= this.now);
    this.msgs = this.msgs.filter((m) => m.arriveAt > this.now);
    for (const m of due) {
      if (m.lost) continue;
      this.deliver(m);
      this.changed();
    }

    for (const n of this.nodes) {
      if (!n.alive) continue;
      if (n.role === 'leader') {
        if (this.now >= n.nextHeartbeat) {
          this.broadcastAppend(n);
          this.changed();
        }
      } else if (this.now >= n.timeoutAt) {
        this.startElection(n);
        this.changed();
      }
    }
  }

  toggleNode(i: number) {
    const n = this.nodes[i];
    n.alive = !n.alive;
    if (n.alive) {
      // term, vote and log are persisted to disk; role, commit index and timers are not
      n.role = 'follower';
      n.commit = 0;
      n.votes.clear();
      this.resetTimer(n);
      this.emit('crash', `${nodeName(i)} restarted as a follower (term ${n.term}, ${n.log.length} entries on disk)`);
    } else {
      this.emit('crash', `${nodeName(i)} crashed${n.role === 'leader' ? ': the cluster has no leader' : ''}`);
    }
    this.changed();
  }

  /**
   * A client sends a command to every node that currently believes it is
   * leader. Normally that's one node; during a partition the stale leader on
   * the minority side gets one too, and (in real Raft) can never commit it.
   */
  clientCommand(): number {
    const leaders = this.nodes.filter((n) => n.alive && n.role === 'leader');
    for (const l of leaders) {
      const cmd = `${'xyzw'[this.cmdN % 4]}←${(this.cmdN * 7 + 3) % 10}`;
      l.log.push({ id: this.cmdN, term: l.term, cmd });
      this.cmdN++;
      l.matchIndex[l.id] = l.log.length;
      this.emit('client', `client → ${nodeName(l.id)}: append "${cmd}" (not committed yet)`);
      this.broadcastAppend(l);
    }
    this.changed();
    return leaders.length;
  }

  /** Cut `minority` (default: the leader and the next server) off from the rest; messages already crossing the cut are lost. */
  setPartition(on: boolean, minority?: readonly number[]) {
    if (!on) {
      this.minority = null;
      this.emit('partition', 'Network healed: everyone can talk again');
    } else {
      const a = this.leader?.id ?? 0;
      this.minority = new Set(minority ?? [a, (a + 1) % N]);
      for (const m of this.msgs) {
        if (this.reachable(m.from, m.to)) continue;
        m.lost = true;
        m.stopAt = Math.max(0.5, (this.now - m.sentAt) / (m.arriveAt - m.sentAt));
      }
      const rest = N - this.minority.size;
      this.emit('partition', `Partition! ${[...this.minority].map(nodeName).join(' + ')} cut off from the other ${rest}`);
    }
    this.changed();
  }
}
