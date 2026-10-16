/**
 * Connection migration: a phone moves from Wi-Fi to cellular in the middle of a transfer. A TCP connection is the
 * four-tuple (addresses and ports), so a new address ends it: the app notices after a timeout, opens a new connection
 * (handshake) and asks again. A QUIC connection is named by a connection ID, so the client keeps sending from the new
 * address and the server checks the new path with one challenge and response, one round trip. Both recoveries are built
 * from the flight counts of flights.ts and the same round trip; the timeouts are illustrative.
 */
import { roundTripsToFirstByte } from './flights';

/** When the phone changes network, ms into the transfer. */
export const SWITCH_AT_MS = 1000;
/** How long an app takes to notice a dead TCP connection (illustrative: stacks and apps differ widely). */
export const TCP_NOTICE_MS = 1000;
/** How long a client waits on a blocked UDP path before it tries TCP (illustrative; browsers differ, from memory). */
export const UDP_BLOCKED_WAIT_MS = 300;

export interface Phase {
  id: string;
  label: string;
  start: number;
  end: number;
  kind: 'transfer' | 'dead' | 'handshake' | 'validate' | 'wait';
}

export interface Recovery {
  phases: Phase[];
  /** The time the transfer was stalled: from the switch until data flows again. */
  stallMs: number;
  /** Parts of the stall, for the caption. */
  parts: { label: string; ms: number }[];
}

/** Which stack's recovery. `udpBlocked` only matters to QUIC. */
export function recover(stack: 'tcp' | 'quic', rttMs: number, udpBlocked: boolean): Recovery {
  const handshake = (roundTripsToFirstByte('tcp-tls13') - 1) * rttMs;
  const request = rttMs;
  const phases: Phase[] = [{ id: 'before', label: 'transfer', start: 0, end: SWITCH_AT_MS, kind: 'transfer' }];
  const parts: Recovery['parts'] = [];
  let t = SWITCH_AT_MS;
  const add = (id: string, label: string, ms: number, kind: Phase['kind']) => {
    phases.push({ id, label, start: t, end: t + ms, kind });
    parts.push({ label, ms });
    t += ms;
  };
  if (stack === 'tcp') {
    add('dead', 'connection dead, waiting for the timeout', TCP_NOTICE_MS, 'dead');
    add('handshake', 'new TCP and TLS handshake', handshake, 'handshake');
    add('request', 'ask again, first byte', request, 'handshake');
  } else if (udpBlocked) {
    add('wait', 'no answer on UDP, waiting before falling back', UDP_BLOCKED_WAIT_MS, 'wait');
    add('handshake', 'new TCP and TLS handshake', handshake, 'handshake');
    add('request', 'ask again, first byte', request, 'handshake');
  } else {
    add('validate', 'path challenge and response', rttMs, 'validate');
  }
  const stallMs = t - SWITCH_AT_MS;
  phases.push({ id: 'after', label: 'transfer continues', start: t, end: t + SWITCH_AT_MS, kind: 'transfer' });
  return { phases, stallMs, parts };
}
