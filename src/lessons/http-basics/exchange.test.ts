import { describe, expect, it } from 'vitest';
import { exchangeReducer, INITIAL_EXCHANGE, LOG_LENGTH, nextAdvanceMs, PHASE_MS, type ExchangeState } from './exchange';
import type { Req } from './server';

const get: Req = { method: 'GET', path: '/users/1', auth: 'none', etag: null, body: '' };
const create: Req = { method: 'POST', path: '/users', auth: 'none', etag: null, body: '{"name":"Grace"}' };
const advance = (s: ExchangeState, times = 1) => {
  for (let i = 0; i < times; i++) s = exchangeReducer(s, { type: 'advance' });
  return s;
};

describe('one exchange', () => {
  it('walks out → server → back → done, logging the reply when it lands', () => {
    let s = exchangeReducer(INITIAL_EXCHANGE, { type: 'send', reqs: [get] });
    expect(s.ex?.phase).toBe('out');
    expect(s.n).toBe(1);
    s = advance(s);
    expect(s.ex?.phase).toBe('server');
    s = advance(s);
    expect(s.ex?.phase).toBe('back');
    expect(s.log).toEqual([]);
    s = advance(s);
    expect(s.ex?.phase).toBe('done');
    expect(s.log).toEqual([{ id: 1, label: 'GET /users/1', status: 200 }]);
  });

  it('changes the server’s data when the request arrives, not when the reply lands', () => {
    let s = exchangeReducer(INITIAL_EXCHANGE, { type: 'send', reqs: [create] });
    expect(Object.keys(s.server.users)).toHaveLength(2); // still in flight
    s = advance(s);
    expect(Object.keys(s.server.users)).toHaveLength(3);
  });
});

describe('queueing', () => {
  it('runs queued requests in order after the current one finishes', () => {
    let s = exchangeReducer(INITIAL_EXCHANGE, { type: 'send', reqs: [create, create, create] });
    expect(s.queue).toHaveLength(2);
    s = advance(s, 4); // first done, then the next starts
    expect(s.ex?.id).toBe(2);
    s = advance(s, 4 * 2 + 3);
    expect(s.log.map((l) => l.status)).toEqual([201, 201, 201]);
    expect(Object.keys(s.server.users)).toHaveLength(5);
  });

  it('keeps only the last few replies in the log', () => {
    let s = exchangeReducer(INITIAL_EXCHANGE, { type: 'send', reqs: Array.from({ length: LOG_LENGTH + 3 }, () => get) });
    s = advance(s, 4 * (LOG_LENGTH + 3));
    expect(s.log).toHaveLength(LOG_LENGTH);
    expect(s.log[s.log.length - 1].id).toBe(LOG_LENGTH + 3);
  });

  it('a send while one is in flight queues it without changing the phase timer (no stall)', () => {
    const s = exchangeReducer(INITIAL_EXCHANGE, { type: 'send', reqs: [get] });
    const before = nextAdvanceMs(s);
    const more = exchangeReducer(s, { type: 'send', reqs: [get] });
    expect(more.ex).toBe(s.ex); // same exchange object: the stage's timer effect doesn't restart
    expect(nextAdvanceMs(more)).toBe(before);
    expect(before).toBe(PHASE_MS.out);
  });

  it('stops scheduling when idle or finished with nothing queued', () => {
    expect(nextAdvanceMs(INITIAL_EXCHANGE)).toBeNull();
    const done = advance(exchangeReducer(INITIAL_EXCHANGE, { type: 'send', reqs: [get] }), 3);
    expect(nextAdvanceMs(done)).toBeNull();
  });
});

describe('server mode and reset', () => {
  it('reset restores the data but keeps the chosen server mode', () => {
    let s = exchangeReducer(INITIAL_EXCHANGE, { type: 'mode', mode: 'overloaded' });
    s = advance(exchangeReducer(s, { type: 'send', reqs: [create] }), 4);
    s = exchangeReducer(s, { type: 'reset' });
    expect(s.server.mode).toBe('overloaded');
    expect(s.log).toEqual([]);
    expect(Object.keys(s.server.users)).toHaveLength(2);
  });
});
