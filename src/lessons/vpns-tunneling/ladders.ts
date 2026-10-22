/**
 * The two key-exchange ladders, as data: message names and what each carries, written from memory of the
 * WireGuard whitepaper and the IKEv2 specification (the lesson chips them "from memory" and "shown, not run").
 * Nothing here runs a handshake.
 */
export type LadderId = 'wireguard' | 'ikev2';

export interface LadderStep {
  id: string;
  from: 'a' | 'b';
  to: 'a' | 'b';
  label: string;
  note: string;
}
export interface Ladder {
  id: LadderId;
  name: string;
  actors: { a: string; b: string };
  steps: LadderStep[];
  /** One sentence on how many round trips it takes before data flows, from the steps. */
  rekey: string;
}

/** WireGuard's rekey timer in seconds (from memory: verify against the whitepaper). */
export const WG_REKEY_SECONDS = 120;

export const LADDERS: Record<LadderId, Ladder> = {
  wireguard: {
    id: 'wireguard',
    name: 'WireGuard',
    actors: { a: 'initiator', b: 'responder' },
    steps: [
      { id: 'init', from: 'a', to: 'b', label: 'handshake initiation (type 1)', note: 'ephemeral key, encrypted static key, timestamp' },
      { id: 'resp', from: 'b', to: 'a', label: 'handshake response (type 2)', note: 'ephemeral key; both sides can now derive the session keys' },
      { id: 'data1', from: 'a', to: 'b', label: 'transport data (type 4)', note: 'the first data packet confirms the keys' },
      { id: 'data2', from: 'b', to: 'a', label: 'transport data (type 4)', note: 'data flows both ways' },
      { id: 'rekey', from: 'a', to: 'b', label: 'new handshake initiation', note: `a new handshake starts after about ${WG_REKEY_SECONDS} s of use` },
    ],
    rekey: `after about ${WG_REKEY_SECONDS} seconds`,
  },
  ikev2: {
    id: 'ikev2',
    name: 'IPsec IKEv2',
    actors: { a: 'initiator', b: 'responder' },
    steps: [
      { id: 'sainit-q', from: 'a', to: 'b', label: 'IKE_SA_INIT request', note: 'algorithms offered, key-exchange value, nonce' },
      { id: 'sainit-r', from: 'b', to: 'a', label: 'IKE_SA_INIT response', note: 'algorithm chosen, key-exchange value, nonce: the IKE security association exists' },
      { id: 'auth-q', from: 'a', to: 'b', label: 'IKE_AUTH request (encrypted)', note: 'identity, proof of identity, traffic selectors for the first ESP association' },
      { id: 'auth-r', from: 'b', to: 'a', label: 'IKE_AUTH response (encrypted)', note: 'identity, proof, the first ESP security association is created' },
      { id: 'esp', from: 'a', to: 'b', label: 'ESP data (SPI, sequence)', note: 'data flows through the first ESP association' },
      { id: 'child', from: 'a', to: 'b', label: 'CREATE_CHILD_SA (rekey)', note: 'new ESP keys are negotiated before the old ones expire' },
    ],
    rekey: 'before the lifetime of the current ESP keys ends',
  },
};

/** Round trips before the first data packet may be sent: the number of request-response pairs ahead of the data. */
export function roundTripsBeforeData(l: Ladder): number {
  const firstData = l.steps.findIndex((s) => s.id === 'data1' || s.id === 'esp');
  return Math.floor(firstData / 2);
}
