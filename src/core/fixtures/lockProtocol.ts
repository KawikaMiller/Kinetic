/**
 * A three-node lock server as a `PureProtocol`: the smallest system with a planted safety bug,
 * used to show that `explore` and `forSeeds` (over `asDistNodes`) agree. The broken server
 * grants every request, so both clients can end up holding the lock; the fixed one grants only
 * to the current holder, or when the lock is free.
 */
import type { PureProtocol } from '../pureProtocol';

export type LockMsg = { type: 'request' } | { type: 'grant' };
export interface LockState {
  /** Server: who it granted to (null while free). */
  holder: string | null;
  /** Client: it believes it holds the lock. */
  held: boolean;
  /** Client: it has sent its request. */
  asked: boolean;
}

export function lockProtocol(broken: boolean): PureProtocol<LockState, LockMsg> {
  return {
    nodes: ['server', 'c1', 'c2'],
    init: () => ({ holder: null, held: false, asked: false }),
    onTimeout: (id, s) => (id === 'server' || s.asked ? null : { state: { ...s, asked: true }, send: [{ to: 'server', payload: { type: 'request' } }] }),
    onMessage: (id, s, { from, payload }) => {
      if (id === 'server' && payload.type === 'request') {
        if (broken || s.holder === null || s.holder === from) return { state: { ...s, holder: s.holder ?? from }, send: [{ to: from, payload: { type: 'grant' } }] };
        return { state: s, send: [] };
      }
      return payload.type === 'grant' ? { state: { ...s, held: true }, send: [] } : { state: s, send: [] };
    },
  };
}

/** Safety: never two clients holding the lock at once. */
export const twoHolders = (states: Record<string, LockState>): string | null => (states.c1.held && states.c2.held ? 'both clients hold the lock' : null);
