// The Raft safety properties, as one monitor that is shown the cluster after every event.
// It keeps its own memory (who led each term, what was ever committed), so it can catch a
// problem the cluster has already moved past, e.g. a committed entry that later vanished.
import { MAJORITY, N, nodeName, type Entry, type Raft } from './sim';

export type SafetyRule =
  | 'one-leader-per-term'
  | 'log-matching'
  | 'state-machine-safety'
  | 'leader-completeness'
  | 'committed-on-majority';

/** The five properties, in words, in the order the monitor checks them. */
export const SAFETY_RULES: readonly { rule: SafetyRule; says: string }[] = [
  { rule: 'one-leader-per-term', says: 'at most one server leads any one term' },
  { rule: 'log-matching', says: 'two logs that share an index and term agree on every entry up to it' },
  { rule: 'state-machine-safety', says: 'no two servers commit different entries at one index' },
  { rule: 'leader-completeness', says: 'a new leader holds every entry committed in an earlier term' },
  { rule: 'committed-on-majority', says: 'a committed entry stays stored on a majority of servers' },
];

/** The commit rule the lesson states on screen; `advanceCommit` in sim.ts implements it and sim.test.ts replays the case that needs it. */
export const COMMIT_RULE =
  'A leader counts replicas only for entries written in its own term. An older entry on a majority is committed along with the first newer entry above it.';

export interface SafetyViolation {
  rule: SafetyRule;
  message: string;
  /** Simulated time of the event after which the rule failed. */
  at: number;
  /** How many events the monitor had seen when it failed (this one included). */
  event: number;
}

interface Committed {
  entry: Entry;
  /** Term of the server whose commit index first covered it: the leader that committed it. */
  term: number;
}

const same = (a: Entry | undefined, b: Entry | undefined) => !!a && !!b && a.id === b.id && a.term === b.term;
const show = (e: Entry) => `"${e.cmd}" (term ${e.term})`;

export class SafetyMonitor {
  violation: SafetyViolation | null = null;
  events = 0;
  private readonly leaderOfTerm = new Map<number, number>();
  private readonly committed: Committed[] = [];

  /** Committed entries seen so far. */
  get committedCount() {
    return this.committed.length;
  }

  /** Check every property after one event; the first violation sticks and later events are ignored. */
  observe(r: Raft): SafetyViolation | null {
    if (this.violation) return this.violation;
    this.events += 1;
    const found = this.checkLeaders(r) ?? this.recordCommits(r) ?? this.checkLogMatching(r) ?? this.checkMajority(r);
    if (found) this.violation = { ...found, at: r.now, event: this.events };
    return this.violation;
  }

  private checkLeaders(r: Raft): Omit<SafetyViolation, 'at' | 'event'> | null {
    for (const n of r.nodes) {
      if (!n.alive || n.role !== 'leader') continue;
      const first = this.leaderOfTerm.get(n.term);
      if (first !== undefined && first !== n.id) {
        return { rule: 'one-leader-per-term', message: `${nodeName(first)} and ${nodeName(n.id)} both lead term ${n.term}` };
      }
      if (first !== undefined) continue;
      this.leaderOfTerm.set(n.term, n.id);
      const missing = this.committed.findIndex((c, i) => c.term < n.term && !same(n.log[i], c.entry));
      if (missing >= 0) {
        const lost = this.committed[missing].entry;
        return { rule: 'leader-completeness', message: `${nodeName(n.id)} became leader of term ${n.term} without committed entry ${missing + 1}, ${show(lost)}` };
      }
    }
    return null;
  }

  private recordCommits(r: Raft): Omit<SafetyViolation, 'at' | 'event'> | null {
    for (const n of r.nodes) {
      for (let i = this.committed.length; i < n.commit; i += 1) this.committed.push({ entry: n.log[i], term: n.term });
    }
    for (const n of r.nodes) {
      for (let i = 0; i < n.commit; i += 1) {
        const want = this.committed[i].entry;
        if (!same(n.log[i], want)) {
          const have = n.log[i] ? show(n.log[i]) : 'nothing';
          return { rule: 'state-machine-safety', message: `${nodeName(n.id)} committed entry ${i + 1} as ${have}, but ${show(want)} was committed there first` };
        }
      }
    }
    return null;
  }

  private checkLogMatching(r: Raft): Omit<SafetyViolation, 'at' | 'event'> | null {
    for (let a = 0; a < N; a += 1) {
      for (let b = a + 1; b < N; b += 1) {
        const x = r.nodes[a].log;
        const y = r.nodes[b].log;
        let top = Math.min(x.length, y.length) - 1;
        while (top >= 0 && x[top].term !== y[top].term) top -= 1;
        for (let i = top; i >= 0; i -= 1) {
          if (!same(x[i], y[i])) {
            return { rule: 'log-matching', message: `${nodeName(a)} and ${nodeName(b)} share term ${x[top].term} at index ${top + 1} but differ at index ${i + 1}` };
          }
        }
      }
    }
    return null;
  }

  private checkMajority(r: Raft): Omit<SafetyViolation, 'at' | 'event'> | null {
    for (let i = 0; i < this.committed.length; i += 1) {
      const holders = r.nodes.filter((n) => same(n.log[i], this.committed[i].entry)).length;
      if (holders < MAJORITY) {
        return { rule: 'committed-on-majority', message: `entry ${i + 1}, ${show(this.committed[i].entry)}, is committed but only ${holders} of ${N} servers store it` };
      }
    }
    return null;
  }
}
