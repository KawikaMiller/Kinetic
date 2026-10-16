import type { ReactNode } from 'react';
import { timeFrames, type TimedFrame } from '../../core/frames';
import type { Frame } from '../../core/types';
import { SPLIT_LABEL, costText, type DvRun, type Entry, type SplitMode, type Tables } from './dv';
import { FORWARDING_TABLES, FORWARDING_TOPO, fewestHopsPath, walk } from './forwarding';
import { behind, cutAt, frameAt, settling, wrongRouters, RESTORE_AT_MS, type LsRun } from './ls';
import { INFINITY_COST, presetLinks, presetById, type Topo } from './topology';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const msText = (t: number) => `${Math.round(t)} ms`;
const dash = (router: string, dest: string) => `${router} to ${dest}`;

// ---- Scene 1: forwarding -------------------------------------------------------------------

export interface ForwardFrame extends Frame {
  /** The router the packet is at. */
  at: string;
  /** Hops completed: the first `done` links of the walk are drawn as travelled. */
  done: number;
}

/** The frames of one packet crossing the six-router network, one per router it visits. */
export function forwardFrames(src: string, dst: string): ForwardFrame[] {
  const w = walk(FORWARDING_TABLES, FORWARDING_TOPO, src, dst);
  const frames: ForwardFrame[] = [
    {
      at: src,
      done: 0,
      say: (
        <>
          <span className="hl">{src}</span> has a packet for <span className="hl">{dst}</span>. The <b>control plane</b>, routers swapping information to fill their tables, is already finished. What follows is the <b>data plane</b>: each router looks
          up the destination in its own table and passes the packet on.
        </>
      ),
    },
  ];
  w.hops.forEach((at, i) => {
    if (at === dst) return;
    const e: Entry = FORWARDING_TABLES[at][dst];
    if (e.next === null) return;
    frames.push({
      at,
      done: i,
      say: (
        <>
          At <span className="hl">{at}</span>: the table says {dst} is reached through <span className="hl info">{e.next}</span>, cost {e.cost}. {at} forwards the packet to {e.next}. It does not know, and does not need to know, what happens after that.
        </>
      ),
    });
  });
  if (w.delivered) {
    const short = fewestHopsPath(FORWARDING_TOPO, src, dst);
    const hops = w.hops.length - 1;
    frames.push({
      at: dst,
      done: hops,
      say: (
        <>
          <span className="hl ok">Delivered</span> at {dst} after {plural(hops, 'hop')}, path cost {w.cost}: {w.hops.join(' to ')}. Nobody held this whole path; it came out of {plural(hops, 'table lookup')}.
          {short && short.length - 1 < hops && (
            <>
              {' '}
              Cost, not hop count, picks the path: {short.join(' to ')} has {plural(short.length - 1, 'hop')} but is not the cheapest.
            </>
          )}
        </>
      ),
    });
  } else {
    frames.push({ at: w.stuckAt ?? src, done: w.hops.length - 1, say: <>The packet stops at {w.stuckAt}: its table has no route to {dst}.</> });
  }
  return frames;
}

// ---- Scene 2: distance vector --------------------------------------------------------------

export interface DvFrame extends Frame {
  /** Rounds finished: tables[round] are on screen, the cells in changed[round - 1] are lit. */
  round: number;
}

interface CellChange {
  router: string;
  dest: string;
  from: Entry;
  to: Entry;
}

/** The cells that changed in round `k` (1-based), in router then destination order. */
export function cellChanges(run: DvRun, k: number): CellChange[] {
  const before: Tables = run.tables[k - 1];
  const after: Tables = run.tables[k];
  return [...run.changed[k - 1]]
    .map((key) => key.split('>'))
    .sort(([ra, da], [rb, db]) => (ra === rb ? (da < db ? -1 : 1) : ra < rb ? -1 : 1))
    .map(([router, dest]) => ({ router, dest, from: before[router][dest], to: after[router][dest] }));
}

/** The cell whose cost rose in the most separate rounds (a count to infinity), with the rounds it rose and whether it ended at 16. */
export function longestClimb(run: DvRun): { router: string; dest: string; rises: number; atInfinity: boolean } | null {
  let best: { router: string; dest: string; rises: number; atInfinity: boolean } | null = null;
  const last = run.tables[run.tables.length - 1];
  for (const router of Object.keys(last)) {
    for (const dest of Object.keys(last[router])) {
      let rises = 0;
      for (let k = 1; k < run.tables.length; k++) if (run.tables[k][router][dest].cost > run.tables[k - 1][router][dest].cost) rises++;
      if (rises > 0 && (best === null || rises > best.rises)) best = { router, dest, rises, atInfinity: last[router][dest].cost >= INFINITY_COST };
    }
  }
  return best;
}

/** What differs between the network the tables settled on and the one the routers now face, in words. */
export function changeText(baseline: Topo, current: Topo): string {
  const parts: string[] = [];
  for (const l of current.links) {
    const was = baseline.links.find((b) => b.id === l.id);
    if (!l.up) parts.push(`link ${l.a}-${l.b} is cut`);
    else if (was && was.cost !== l.cost) parts.push(`link ${l.a}-${l.b} now costs ${l.cost} (it was ${was.cost})`);
  }
  return parts.join(' and ');
}

const sample = (changes: readonly CellChange[]): ReactNode => {
  const shown = changes.slice(0, 3);
  return (
    <>
      {shown.map((c, i) => (
        <span key={`${c.router}${c.dest}`}>
          {i > 0 && '; '}
          {dash(c.router, c.dest)}: {costText(c.from)} to <span className={c.to.cost >= INFINITY_COST ? 'hl bad' : 'hl'}>{costText(c.to)}</span>
        </span>
      ))}
      {changes.length > shown.length && <> and {changes.length - shown.length} more</>}
    </>
  );
};

/** One frame per round, from the starting tables to the settled ones. */
export function dvFrames(run: DvRun, start: 'change' | 'boot', change: string, mode: SplitMode): DvFrame[] {
  const intro =
    start === 'boot' ? (
      <>Every router starts knowing only itself: cost 0 to itself, unreachable (16) to everything else. In each round a router reads what its neighbours advertised and recomputes its table.</>
    ) : (
      <>
        The tables had settled on the intact network. Now {change || 'nothing has changed'}. In each round a router reads what its neighbours advertised and recomputes its whole table ({SPLIT_LABEL[mode]}).
      </>
    );
  const frames: DvFrame[] = [{ round: 0, say: intro }];
  for (let k = 1; k <= run.rounds; k++) {
    const changes = cellChanges(run, k);
    frames.push({
      round: k,
      say: (
        <>
          Round {k}: {plural(changes.length, 'entry', 'entries')} changed. {sample(changes)}.
        </>
      ),
    });
  }
  const climb = longestClimb(run);
  frames.push({
    round: run.rounds,
    say: run.hitCap ? (
      <>Stopped after {run.rounds} rounds: the tables were still changing.</>
    ) : run.rounds === 0 ? (
      <>
        <span className="hl ok">Nothing to do</span>: the tables already match what the neighbours advertise.
      </>
    ) : (
      <>
        <span className="hl ok">Settled</span> after {plural(run.rounds, 'round')}.
        {climb && climb.rises >= 3 && (
          <>
            {' '}
            {dash(climb.router, climb.dest)} rose in {climb.rises} separate rounds{climb.atInfinity ? ', until it hit 16 and the route was dropped' : ''}: that is counting to infinity.
          </>
        )}
      </>
    ),
  });
  return frames;
}

// ---- Scene 3: link state -------------------------------------------------------------------

/** The frames of a link-state run on its own clock (ms). */
export function lsFrames(run: LsRun): TimedFrame[] {
  const s = run.setup;
  const end = Math.max(1, run.endTime);
  const link = s.link === null ? null : presetLinks(presetById(s.presetId)).find((l) => l.id === s.link);
  const milestones: { t: number; say: ReactNode }[] = [];
  if (link) {
    milestones.push({
      t: cutAt(s),
      say: (
        <>
          At {msText(cutAt(s))} link <span className="hl bad">{link.a}-{link.b}</span> goes down. Both ends notice at once, bump their sequence numbers and flood a new LSA.
        </>
      ),
    });
    if (s.restore) {
      milestones.push({
        t: RESTORE_AT_MS,
        say: (
          <>
            At {msText(RESTORE_AT_MS)} link {link.a}-{link.b} comes back. Both ends flood again and swap what they know with each other.
          </>
        ),
      });
    }
  }
  if (run.violation) {
    milestones.push({
      t: run.violation.time,
      say: (
        <>
          At {msText(run.violation.time)}: <span className="hl bad wrap">{run.violation.message}</span>. Without the sequence-number check, whichever copy arrives last wins, even an old one.
        </>
      ),
    });
  }
  const st = settling(run);
  if (st.settledAt !== null) {
    milestones.push({
      t: st.settledAt,
      say: (
        <>
          At {msText(st.settledAt)} every database in each connected group agrees: <span className="hl ok">{st.ms === null ? '' : `${msText(st.ms)} after the last change`}</span>.
        </>
      ),
    });
  }
  const finalFrame = frameAt(run, end);
  const late = behind(finalFrame);
  const wrong = wrongRouters(run, end);
  const messages = run.cluster.trace.filter((r) => r.kind === 'send').length;
  return timeFrames({
    end,
    steps: 48,
    milestones,
    hold: 2.5,
    intro: (
      <>
        Every router floods an LSA (who it is, a sequence number, its links) to its neighbours. A router stores an LSA only if its sequence number is higher than the one it holds, then forwards it to every neighbour except the one it came from.
      </>
    ),
    summary:
      st.settledAt === null ? (
        <>
          The run ends at {msText(end)} with {plural(messages, 'message')} sent. <span className="hl bad">The databases never agreed</span>: {late.length > 0 ? `${late.join(', ')} still hold${late.length === 1 ? 's' : ''} an older copy` : 'some copies differ'}
          {wrong.length > 0 ? `; ${wrong.join(', ')} would forward over the wrong link` : ''}.
        </>
      ) : (
        <>
          Settled: {plural(messages, 'message')} sent in all, databases in agreement {st.ms === null ? '' : `${msText(st.ms)} after the last change`}. Each router now runs Dijkstra on its own copy.
        </>
      ),
  });
}
