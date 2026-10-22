/**
 * The system under test: a seat-booking service with two replicas and one plain bug. A booking that reaches a replica is granted
 * if the seat looks free there, then replicated to the other replica, which marks the seat taken if it still looks free. Written
 * once as a core/pureProtocol, so the same functions run under the seeded harness (asDistNodes) and under exhaustive exploration.
 */
import type { PureProtocol } from '../../core/pureProtocol';

export const REPLICAS = ['r1', 'r2'] as const;
export type Replica = (typeof REPLICAS)[number];
export const CLIENTS = { r1: 'A', r2: 'B' } as const;

export type BookMsg = { type: 'book'; client: string } | { type: 'replicate'; client: string } | { type: 'forward'; client: string };
export interface Seat {
  /** The client this replica granted the seat to, or null. */
  granted: string | null;
  /** The client a replicate message told this replica about, or null. */
  taken: string | null;
}

/** `async`: each replica grants on its own and replicates later (the bug). `single-writer`: r2 forwards every booking to r1, which alone grants. */
export type BookingMode = 'async' | 'single-writer';

export const other = (id: string): Replica => (id === 'r1' ? 'r2' : 'r1');

const free = (s: Seat): boolean => s.granted === null && s.taken === null;

export function bookingProtocol(mode: BookingMode): PureProtocol<Seat, BookMsg> {
  return {
    nodes: REPLICAS,
    init: () => ({ granted: null, taken: null }),
    onMessage: (id, s, { payload }) => {
      switch (payload.type) {
        case 'book':
          if (mode === 'single-writer' && id === 'r2') return { state: s, send: [{ to: 'r1', payload: { type: 'forward', client: payload.client } }] };
          return grant(id, s, payload.client);
        case 'forward':
          return grant(id, s, payload.client);
        case 'replicate':
          return { state: free(s) ? { ...s, taken: payload.client } : s, send: [] };
      }
    },
    describe: (m) => `${m.type} ${m.client}`,
  };
}

function grant(id: string, s: Seat, client: string) {
  if (!free(s)) return { state: s, send: [] };
  return { state: { ...s, granted: client }, send: [{ to: other(id), payload: { type: 'replicate' as const, client } }] };
}

/** The rule: at most one client is granted the seat across both replicas. */
export function oversold(seats: Record<string, Seat | undefined>): string | null {
  const granted = REPLICAS.map((id) => seats[id]?.granted ?? null).filter((c): c is string => c !== null);
  return granted.length > 1 ? `both ${granted[0]} and ${granted[1]} granted` : null;
}
