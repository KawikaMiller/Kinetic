/** The numbers the try-this entries quote, computed from each scene's default state by the same models the scenes draw. */
import { runEdge, DEFAULT_EDGE } from './edge';
import { emptyRings, enter, queueRead } from './files';
import {
  ACTIVE_STEPS, CONNECTION_STEPS, DEFAULT_ACTIVE_INDEX, DEFAULT_CONNECTIONS_INDEX, DEFAULT_SERVER_SEED, makeSchedule, runModel, stackOf,
} from './serve';
import { TRACE_CONNECTIONS, TRACE_ROUNDS, TRACE_WORK, echoTrace } from './trace';

export const DEFAULT_CONNECTIONS = CONNECTION_STEPS[DEFAULT_CONNECTIONS_INDEX];
export const DEFAULT_ACTIVE_PCT = ACTIVE_STEPS[DEFAULT_ACTIVE_INDEX];
export const MAX_CONNECTIONS = CONNECTION_STEPS.at(-1)!;

export function scanFacts() {
  const schedule = makeSchedule(DEFAULT_CONNECTIONS, DEFAULT_ACTIVE_PCT, DEFAULT_SERVER_SEED);
  const select = runModel('select', DEFAULT_CONNECTIONS, schedule);
  const epoll = runModel('epoll', DEFAULT_CONNECTIONS, schedule);
  return { selectEntries: select.entries, epollEntries: epoll.entries, served: select.served.length };
}

export const threadFacts = () => ({ threads: MAX_CONNECTIONS, stackBytes: stackOf(MAX_CONNECTIONS) });

export function traceFacts() {
  const calls = (m: Parameters<typeof echoTrace>[0]) => echoTrace(m, TRACE_WORK).calls;
  return {
    epollCalls: calls('epoll').length,
    uringCalls: calls('uring').length,
    busyCalls: calls('busy').length,
    busyEagain: calls('busy').filter((c) => c.name === 'EAGAIN').length,
    events: TRACE_ROUNDS.flat().length,
    connections: TRACE_CONNECTIONS,
  };
}

export function edgeFacts() {
  const hung = runEdge(DEFAULT_EDGE);
  const drained = runEdge({ ...DEFAULT_EDGE, drain: true });
  return { remaining: hung.remaining, hungReports: hung.reports, hungReads: hung.reads, drainedReads: drained.reads, drainedReports: drained.reports, drainedVerdict: drained.verdict };
}

export function queueFacts() {
  let r = emptyRings();
  for (let i = 0; i < 4; i++) r = queueRead(r);
  r = enter(r);
  return { queued: 4, inflight: r.inflight, enters: r.enters };
}
