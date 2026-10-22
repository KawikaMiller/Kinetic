/**
 * paxos, scene 2: the duel, as a scripted witness. Ballots alternate between P1 (odd) and P2 (even). For each ballot b:
 * the proposer starts, its Prepare reaches a1 and a2, their promises reach it (it sends Accept(b)), and BEFORE any
 * Accept(b) is delivered the next ballot starts, so a1 and a2 have promised b + 1 when Accept(b) finally arrives.
 * The script is replayed through the real protocol (session.ts), not searched for and not found as a livelock.
 */
import type { PaxosConfig } from './protocol';
import { ACCEPTORS, configFor } from './protocol';
import { applyOp, runSteps, type Session, type Step } from './session';

export const DUEL_BALLOTS = { min: 2, max: 8, default: 6 } as const;
/** The two acceptors every ballot reaches: a majority of three. */
const REACHED = ACCEPTORS.slice(0, 2);

export const duelConfig = (ballots: number): PaxosConfig => configFor({ P1: Math.ceil(ballots / 2), P2: Math.floor(ballots / 2) });

const proposerOf = (ballot: number) => (ballot % 2 === 1 ? 'P1' : 'P2');

/** The duel's steps for `ballots` ballots: five per ballot (start, two Prepares, two Promises), no Accept delivered. */
export function duelSteps(ballots: number): Step[] {
  const steps: Step[] = [];
  for (let b = 1; b <= ballots; b++) {
    const p = proposerOf(b);
    steps.push({ start: p });
    for (const a of REACHED) steps.push({ deliver: { type: 'prepare', ballot: b, to: a, from: p } });
    for (const a of REACHED) steps.push({ deliver: { type: 'promise', ballot: b, from: a, to: p } });
  }
  return steps;
}

/** "Stop duelling": deliver the last ballot's Accept to a majority. */
export function stopSteps(ballots: number): Step[] {
  return REACHED.map((a): Step => ({ deliver: { type: 'accept', ballot: ballots, to: a } }));
}

const countVotes = (s: Session): number => ACCEPTORS.reduce((n, a) => n + (s.nodes[a] as { votes: unknown[] }).votes.length, 0);

/** After stopping: deliver the Accepts still in the pool for a1 and a2, the acceptors the duel talked to. Those for earlier ballots are refused. */
export function drainAccepts(s: Session): { session: Session; votes: number; refused: number } {
  let now = s;
  let refused = 0;
  for (const m of s.pool.filter((p) => p.payload.type === 'accept' && REACHED.includes(p.to as never))) {
    const r = applyOp(now, { kind: 'deliver', id: m.id });
    if (!r.ok) continue;
    if (r.session.note.includes('ignores')) refused++;
    now = r.session;
  }
  return { session: now, votes: countVotes(now), refused };
}

export interface Duel {
  steps: number;
  /** The session after the duel: no vote cast. */
  session: Session;
  /** The session after stopping the duel. */
  stopped: Session;
  votesCast: number;
}

export function replayDuel(ballots: number): Duel {
  const config = duelConfig(ballots);
  const duel = runSteps(config, duelSteps(ballots));
  const stopped = runSteps(config, [...duelSteps(ballots), ...stopSteps(ballots)]);
  const votes = countVotes(duel.session);
  return { steps: duel.ops.length, session: duel.session, stopped: stopped.session, votesCast: votes };
}
