/**
 * Reference schedulers written from the definitions, separately from the engine in model.ts. Only the
 * tests import them: they are what the engine's schedule is compared against.
 */
import { CPU_MS, FAULT_REQUEST, HOG_MS, IO_MS } from './model';

/**
 * An event-driven first-come-first-served list scheduler for a pool of threads on `cores` cores: the oldest
 * ready step runs first; at a tie, a reply comes before a new request, then the lower request number.
 * Returns each request's finish time (index = request number).
 */
export function threadOracle(R: number, pool: number, cores: number): number[] {
  const P = Math.min(pool, R);
  const finish: number[] = Array.from({ length: R + 1 }, () => 0);
  const coreFree: number[] = Array.from({ length: cores }, () => 0);
  type Ev = { ready: number; cls: number; req: number; stage: 1 | 2 };
  const queue: Ev[] = [];
  let next = 1;
  for (; next <= P; next++) queue.push({ ready: 0, cls: 1, req: next, stage: 1 });
  while (queue.length) {
    queue.sort((a, b) => a.ready - b.ready || a.cls - b.cls || a.req - b.req);
    const ev = queue.shift()!;
    const c = coreFree.indexOf(Math.min(...coreFree));
    const start = Math.max(ev.ready, coreFree[c]);
    coreFree[c] = start + CPU_MS;
    if (ev.stage === 1) queue.push({ ready: start + CPU_MS + IO_MS, cls: 0, req: ev.req, stage: 2 });
    else {
      finish[ev.req] = start + CPU_MS;
      if (next <= R) queue.push({ ready: start + CPU_MS, cls: 1, req: next++, stage: 1 });
    }
  }
  return finish;
}

/** A single queue served one callback at a time, first come first served (arrival, then request number): an event loop, or one actor's mailbox. */
export function loopOracle(requests: readonly number[], hog: boolean): Map<number, number> {
  const finish = new Map<number, number>();
  type Cb = { at: number; req: number; stage: 1 | 2 };
  const queue: Cb[] = requests.map((req) => ({ at: 0, req, stage: 1 as const }));
  let clock = 0;
  while (queue.length) {
    queue.sort((a, b) => a.at - b.at || a.req - b.req);
    const cb = queue.shift()!;
    const start = Math.max(clock, cb.at);
    const cost = cb.stage === 1 && hog && cb.req === FAULT_REQUEST ? HOG_MS : CPU_MS;
    clock = start + cost;
    if (cb.stage === 1) queue.push({ at: clock + IO_MS, req: cb.req, stage: 2 });
    else finish.set(cb.req, clock);
  }
  return finish;
}
