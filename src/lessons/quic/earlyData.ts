/**
 * What 0-RTT costs: the first flight of a resumed connection carries the request, and nothing in early data stops a
 * copy of that flight from being delivered again (an on-path duplicate; no mechanism is shown). The server's tally shows
 * the effect, and the two fixes: allow only requests that are safe to repeat in early data, or put an idempotency
 * key on the request.
 */
import { roundTripsToFirstByte, schedule } from './flights';

export type RequestKind = 'get' | 'post';
export type Policy = 'accept' | 'idempotent-only' | 'idempotency-key';

export const REQUESTS: readonly RequestKind[] = ['get', 'post'];
export const REQUEST_LABEL: Record<RequestKind, string> = { get: 'GET /catalogue', post: 'POST /charge' };
export const REQUEST_NOTE: Record<RequestKind, string> = { get: 'harmless twice', post: 'moves money: not harmless twice' };
export const POLICIES: readonly Policy[] = ['accept', 'idempotent-only', 'idempotency-key'];
export const POLICY_LABEL: Record<Policy, string> = {
  accept: 'accept any early data',
  'idempotent-only': 'early data only for safe requests',
  'idempotency-key': 'an idempotency key on the request',
};
export const MAX_REPLAYS = 5;
/** The key the client puts on the request in the third policy (a made-up value). */
export const IDEMPOTENCY_KEY = 'k-7f3a';

export const isSafeToRepeat = (r: RequestKind): boolean => r === 'get';

export type Outcome = 'applied' | 'applied-again' | 'rejected-early' | 'retried' | 'ignored-key';
export const OUTCOME_LABEL: Record<Outcome, string> = {
  applied: 'applied',
  'applied-again': 'applied again',
  'rejected-early': 'refused: not allowed in early data',
  retried: 'retried after the handshake: applied once',
  'ignored-key': 'ignored: key already seen',
};

export interface Delivery {
  /** 0 is the original first flight, 1 and up are replayed copies. */
  copy: number;
  outcome: Outcome;
}

export interface EarlyRun {
  deliveries: Delivery[];
  /** Times the server did the work: catalogue reads or charges. */
  applied: number;
  /** The client had to send the request again, after the handshake. */
  retried: boolean;
  /** When the first byte of the answer reaches the client, ms. */
  firstByteMs: number;
}

/** Deliver the first flight `1 + replays` times to a server with the given policy. */
export function runEarly(request: RequestKind, policy: Policy, replays: number, rttMs: number, thinkMs: number): EarlyRun {
  const deliveries: Delivery[] = [];
  const seenKeys = new Set<string>();
  let applied = 0;
  let retried = false;
  for (let copy = 0; copy <= replays; copy++) {
    let outcome: Outcome;
    if (policy === 'idempotent-only' && !isSafeToRepeat(request)) {
      outcome = 'rejected-early';
      retried = true;
    } else if (policy === 'idempotency-key' && !isSafeToRepeat(request)) {
      outcome = seenKeys.has(IDEMPOTENCY_KEY) ? 'ignored-key' : 'applied';
      seenKeys.add(IDEMPOTENCY_KEY);
      if (outcome === 'applied') applied++;
    } else {
      outcome = copy === 0 ? 'applied' : 'applied-again';
      applied++;
    }
    deliveries.push({ copy, outcome });
  }
  if (retried) {
    // The refused request is sent again once the handshake is done, and a request sent after the handshake cannot be replayed.
    deliveries.push({ copy: 0, outcome: 'retried' });
    applied++;
  }
  const resumed = schedule('quic-0rtt', rttMs, thinkMs).firstByteAt;
  const afterHandshake = schedule('quic', rttMs, thinkMs).firstByteAt;
  return { deliveries, applied, retried, firstByteMs: retried ? afterHandshake : resumed };
}

/** Round trips saved by sending the request in the first flight rather than after a 1-RTT handshake. */
export const roundTripsSavedBy0Rtt = (): number => roundTripsToFirstByte('quic') - roundTripsToFirstByte('quic-0rtt');
