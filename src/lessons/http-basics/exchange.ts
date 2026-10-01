// One request/response round trip at a time, walked through its phases; extra sends queue up.
import { handle, INITIAL_SERVER, type Mode, type Req, type Res, type ServerState } from './server';

export type Phase = 'out' | 'server' | 'back' | 'done';
/** How long each phase stays on screen, in ms. */
export const PHASE_MS: Record<Phase, number> = { out: 850, server: 750, back: 850, done: 350 };
export const LOG_LENGTH = 6;

export interface Exchange {
  id: number;
  req: Req;
  res: Res;
  after: ServerState;
  phase: Phase;
}

export interface LogItem {
  id: number;
  label: string;
  status: number;
}

export interface ExchangeState {
  server: ServerState;
  ex: Exchange | null;
  queue: Req[];
  log: LogItem[];
  /** Requests sent so far. */
  n: number;
}

export type Action = { type: 'send'; reqs: Req[] } | { type: 'advance' } | { type: 'mode'; mode: Mode } | { type: 'reset' };

export const INITIAL_EXCHANGE: ExchangeState = { server: INITIAL_SERVER, ex: null, queue: [], log: [], n: 0 };

function start(s: ExchangeState, req: Req): ExchangeState {
  const { res, after } = handle(req, s.server);
  return { ...s, ex: { id: s.n + 1, req, res, after, phase: 'out' }, n: s.n + 1 };
}

export function exchangeReducer(s: ExchangeState, a: Action): ExchangeState {
  switch (a.type) {
    case 'send': {
      const queue = [...s.queue, ...a.reqs];
      if (s.ex && s.ex.phase !== 'done') return { ...s, queue };
      const [next, ...rest] = queue;
      return next ? start({ ...s, queue: rest }, next) : s;
    }
    case 'advance': {
      const ex = s.ex;
      if (!ex) return s;
      // The server's state changes when the request arrives, not when the reply lands.
      if (ex.phase === 'out') return { ...s, server: ex.after, ex: { ...ex, phase: 'server' } };
      if (ex.phase === 'server') return { ...s, ex: { ...ex, phase: 'back' } };
      if (ex.phase === 'back') {
        const log = [...s.log, { id: ex.id, label: `${ex.req.method} ${ex.req.path}`, status: ex.res.status }].slice(-LOG_LENGTH);
        return { ...s, ex: { ...ex, phase: 'done' }, log };
      }
      if (!s.queue.length) return s;
      const [next, ...rest] = s.queue;
      return start({ ...s, queue: rest }, next);
    }
    case 'mode':
      return { ...s, server: { ...s.server, mode: a.mode } };
    case 'reset':
      return { ...INITIAL_EXCHANGE, server: { ...INITIAL_SERVER, mode: s.server.mode } };
  }
}

/** Whether the stage should schedule another 'advance' after `ms`. */
export const nextAdvanceMs = (s: ExchangeState): number | null =>
  !s.ex || (s.ex.phase === 'done' && !s.queue.length) ? null : PHASE_MS[s.ex.phase];
