/**
 * Scene 4: readiness versus completion, sockets versus regular files, and the two queues of a completion-based
 * interface. Linux facts here (epoll_ctl on a regular file, select/poll on a file) were checked once on Linux 6.18 (WSL2)
 * and are still hedged on screen as from memory; the queue is a toy.
 */

export type Target = 'socket' | 'file';
export const DEFAULT_TARGET: Target = 'socket';

export interface ReadinessFacts {
  /** What epoll_ctl(ADD) returns for this kind of fd. */
  epollAdd: 'ok' | 'EPERM';
  /** What select or poll report for it. */
  pollSays: string;
  /** Whether a read can still block the calling thread even after a "ready" answer. */
  readCanBlock: boolean;
  /** How the program should reach it. */
  advice: string;
}

export function readiness(target: Target): ReadinessFacts {
  if (target === 'socket') {
    return {
      epollAdd: 'ok',
      pollSays: 'readable only when a read would not block (data is waiting)',
      readCanBlock: false,
      advice: 'register it with epoll and read when it is reported',
    };
  }
  return {
    epollAdd: 'EPERM',
    pollSays: 'always readable, even when the read must go to the disk',
    readCanBlock: true,
    advice: 'hand the read to a thread pool, or submit it to a completion interface',
  };
}

/** The submission queue holds this many entries; the completion queue is twice as long (a sizing rule of thumb in io_uring, from memory). */
export const SQ_DEPTH = 8;
export const CQ_DEPTH = 2 * SQ_DEPTH;

export interface Rings {
  /** Requests written to the submission queue, not yet handed to the kernel. */
  queued: number;
  inflight: number;
  /** Completions waiting in the completion queue. */
  cq: number;
  /** Completions the program has collected. */
  reaped: number;
  /** Calls into the kernel (io_uring_enter): one hands over a whole batch. */
  enters: number;
  /** Requests ever queued. */
  total: number;
}

export const emptyRings = (): Rings => ({ queued: 0, inflight: 0, cq: 0, reaped: 0, enters: 0, total: 0 });

export const canQueue = (r: Rings) => r.queued < SQ_DEPTH;
export const canEnter = (r: Rings) => r.queued > 0;
export const canComplete = (r: Rings) => r.inflight > 0 && r.cq < CQ_DEPTH;
export const canReap = (r: Rings) => r.cq > 0;

export const queueRead = (r: Rings): Rings => (canQueue(r) ? { ...r, queued: r.queued + 1, total: r.total + 1 } : r);
export const enter = (r: Rings): Rings => (canEnter(r) ? { ...r, queued: 0, inflight: r.inflight + r.queued, enters: r.enters + 1 } : r);
export const complete = (r: Rings): Rings => (canComplete(r) ? { ...r, inflight: r.inflight - 1, cq: r.cq + 1 } : r);
export const reap = (r: Rings): Rings => (canReap(r) ? { ...r, cq: 0, reaped: r.reaped + r.cq } : r);
