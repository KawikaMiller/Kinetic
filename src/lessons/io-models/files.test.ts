import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { CQ_DEPTH, SQ_DEPTH, canComplete, canEnter, canQueue, canReap, complete, emptyRings, enter, queueRead, readiness, reap, type Rings } from './files';

describe('readiness: sockets versus regular files', () => {
  it('a socket registers with epoll and is reported when a read would not block; a regular file is refused with EPERM and reads can block', () => {
    expect(readiness('socket')).toMatchObject({ epollAdd: 'ok', readCanBlock: false });
    expect(readiness('file')).toMatchObject({ epollAdd: 'EPERM', readCanBlock: true });
    expect(readiness('file').pollSays).toContain('always readable');
  });
});

describe('the submission and completion queues', () => {
  type Action = 'queue' | 'enter' | 'complete' | 'reap';
  const apply = (r: Rings, a: Action) => ({ queue: queueRead, enter, complete, reap })[a](r);
  const total = (r: Rings) => r.queued + r.inflight + r.cq + r.reaped;

  it('over 5,000 random action sequences every request is in exactly one place and the queue limits hold', () => {
    const next = mulberry32(1);
    const actions: Action[] = ['queue', 'enter', 'complete', 'reap'];
    for (let run = 0; run < 50; run++) {
      let r = emptyRings();
      for (let i = 0; i < 100; i++) {
        r = apply(r, actions[Math.floor(next() * 4)]);
        expect(total(r)).toBe(r.total);
        expect(r.queued).toBeLessThanOrEqual(SQ_DEPTH);
        expect(r.cq).toBeLessThanOrEqual(CQ_DEPTH);
        expect(Math.min(r.queued, r.inflight, r.cq, r.reaped, r.enters)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('one enter hands over a whole batch: 5 queued reads cost 1 call, and 5 completions are collected with no further calls', () => {
    let r = emptyRings();
    for (let i = 0; i < 5; i++) r = queueRead(r);
    r = enter(r);
    expect([r.enters, r.inflight, r.queued]).toEqual([1, 5, 0]);
    for (let i = 0; i < 5; i++) r = complete(r);
    r = reap(r);
    expect([r.reaped, r.enters, r.inflight, r.cq]).toEqual([5, 1, 0, 0]);
  });

  it('actions that do not apply change nothing, and the guards say so', () => {
    const e = emptyRings();
    expect([canEnter(e), canComplete(e), canReap(e), canQueue(e)]).toEqual([false, false, false, true]);
    expect([enter(e), complete(e), reap(e)]).toEqual([e, e, e]);
    let full = e;
    for (let i = 0; i < SQ_DEPTH + 3; i++) full = queueRead(full);
    expect([full.queued, canQueue(full)]).toEqual([SQ_DEPTH, false]);
  });
});
