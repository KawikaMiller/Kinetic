import { describe, expect, it } from 'vitest';
import {
  CPU_MS, DEFAULT_PARAMS, FAULT_REQUEST, HOG_MS, IO_MS, OUTCOMES, QUANTUM_MS, RUNTIMES, STACK_MB, mergeSegs, normalise, outcomeOf, refusal, senderDoneAt, simulate,
  withoutFault, type Fault, type Params, type Runtime,
} from './model';
import { loopOracle, threadOracle } from './oracles';

const params = (over: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, ...over });
const ROUND = 2 * CPU_MS + IO_MS;

const finishes = (r: ReturnType<typeof simulate>) => r.finish.slice(1) as number[];

describe('OS threads against closed form and a list scheduler', () => {
  it('makespan is ceil(R / P) × (I/O + 2 CPU) when every thread has a core, over a grid', () => {
    let cases = 0;
    for (const R of [10, 40, 70, 100, 130, 200]) {
      for (const P of [1, 2, 3, 4, 8]) {
        for (const C of [P, Math.min(8, P + 1), 8]) {
          if (C < P) continue;
          const run = simulate(params({ runtime: 'threads', requests: R, pool: P, cores: C }));
          expect(run.makespan, `R=${R} P=${P} C=${C}`).toBe(Math.ceil(R / Math.min(P, R)) * ROUND);
          expect(run.finished).toBe(R);
          cases++;
        }
      }
    }
    expect(cases).toBeGreaterThan(60);
  });

  it('with fewer cores than threads every request finishes when the brute-force list scheduler says it does', () => {
    for (const R of [10, 50, 100, 200]) {
      for (const P of [4, 10, 16, 50, 200]) {
        for (const C of [1, 2, 3, 4, 6]) {
          if (C >= Math.min(P, R)) continue;
          const run = simulate(params({ runtime: 'threads', requests: R, pool: P, cores: C }));
          expect(finishes(run), `R=${R} P=${P} C=${C}`).toEqual(threadOracle(R, P, C).slice(1));
        }
      }
    }
  });

  it('one core and a thread each serialises the CPU: 100 requests take 100 first steps, then the second steps, as the oracle finds', () => {
    const run = simulate(params({ runtime: 'threads', requests: 100, pool: 100, cores: 1 }));
    // all 100 first steps run [0, 100); replies come back at 101..200, one second step each, so the last ends at 200 + 1 + ... by hand: 100 + IO_MS + CPU_MS
    expect(run.makespan).toBe(100 + IO_MS + CPU_MS);
  });
});

describe('the event loop against a hand-written single queue', () => {
  it('matches the oracle request by request, with and without the slow handler, over a grid', () => {
    for (const R of [10, 25, 100, 200]) {
      for (const cores of [1, 4, 8]) {
        for (const hog of [false, true]) {
          const run = simulate(params({ runtime: 'events', requests: R, cores, fault: hog ? 'hog' : 'none' }));
          const oracle = loopOracle(Array.from({ length: R }, (_, i) => i + 1), hog);
          for (let r = 1; r <= R; r++) expect(run.finish[r], `R=${R} hog=${hog} request ${r}`).toBe(oracle.get(r));
        }
      }
    }
  });

  it('uses one thread and one core however many cores exist, and runs 2 callbacks a request', () => {
    const run = simulate(params({ runtime: 'events', requests: 100, cores: 8 }));
    expect(run.peakCores).toBe(1);
    expect(run.osThreads).toBe(1);
    expect(run.peakConcurrent).toBe(1);
    expect(run.callbacks).toBe(200);
    expect(run.switches).toBe(0);
  });

  it('a 200 ms handler pushes the earliest bystander finish from 102 ms to 300 ms, hand-worked: six first steps, the 200 ms one, the 93 first steps behind it (all queued at 0, ahead of any reply), then request 1 runs its second step', () => {
    const plain = simulate(params({ runtime: 'events' }));
    const slow = simulate(params({ runtime: 'events', fault: 'hog' }));
    expect(plain.bystanderFinish).toBe(2 * CPU_MS + IO_MS);
    expect(slow.bystanderFinish).toBe((FAULT_REQUEST - 1) * CPU_MS + HOG_MS + (100 - FAULT_REQUEST) * CPU_MS + CPU_MS);
  });
});

describe('actors against per-mailbox queues', () => {
  it('with a core for every actor each mailbox is its own single queue, request by request', () => {
    for (const A of [1, 2, 4, 7]) {
      for (const hog of [false, true]) {
        const run = simulate(params({ runtime: 'actors', actors: A, cores: 8, requests: 60, fault: hog ? 'hog' : 'none' }));
        for (let a = 0; a < A; a++) {
          const mine = Array.from({ length: 60 }, (_, i) => i + 1).filter((r) => (r - 1) % A === a);
          const oracle = loopOracle(mine, hog);
          for (const r of mine) expect(run.finish[r], `A=${A} hog=${hog} request ${r}`).toBe(oracle.get(r));
        }
      }
    }
  });

  it('a slow handler delays only its own mailbox: the other actors finish exactly when they would have', () => {
    const base = simulate(params({ runtime: 'actors', actors: 4, cores: 8, requests: 40 }));
    const slow = simulate(params({ runtime: 'actors', actors: 4, cores: 8, requests: 40, fault: 'hog' }));
    for (let r = 1; r <= 40; r++) {
      const sameMailbox = (r - 1) % 4 === (FAULT_REQUEST - 1) % 4;
      if (sameMailbox) expect(slow.finish[r]!, `request ${r}`).toBeGreaterThan(base.finish[r]!);
      else expect(slow.finish[r], `request ${r}`).toBe(base.finish[r]);
    }
  });
});

describe('CSP: workers, a channel and a sender', () => {
  it('a pool of W workers on enough cores behaves as ceil(R / W) rounds', () => {
    const run = simulate(params({ runtime: 'csp', workers: 4, cores: 4, requests: 100, buffer: 0 }));
    expect(run.makespan).toBe(25 * ROUND);
  });

  it('the sender of an unbuffered channel hands over its last request when a worker takes it: item 100 starts at 24 rounds in', () => {
    const run = simulate(params({ runtime: 'csp', workers: 4, cores: 4, requests: 100, buffer: 0 }));
    expect(run.senderDone).toBe(24 * ROUND);
  });

  it('a buffer of K lets the sender finish when request 100 − K has been taken, and a buffer as large as the work never blocks it', () => {
    const at = (buffer: number) => simulate(params({ runtime: 'csp', workers: 4, cores: 4, requests: 100, buffer })).senderDone;
    expect(at(4)).toBe(23 * ROUND); // item 96 starts in the 24th round, which begins at 23 rounds
    expect(at(20)).toBe(19 * ROUND); // item 80 starts at 19 rounds
    expect(simulate(params({ runtime: 'csp', workers: 4, cores: 4, requests: 10, buffer: 20 })).senderDone).toBe(0);
    expect(senderDoneAt(params({ runtime: 'csp', requests: 3, buffer: 0 }), [null, 0, 0, null])).toBe(null);
  });

  it('refuses zero workers whatever the buffer, with the sentence the lesson shows', () => {
    expect(refusal(params({ runtime: 'csp', workers: 0, buffer: 0 }))).toBe('Nobody to receive: the sender would block forever. Add a worker.');
    expect(refusal(params({ runtime: 'csp', workers: 0, buffer: 3 }))).toContain('fills the buffer of 3');
    expect(() => simulate(params({ runtime: 'csp', workers: 0 }))).toThrow();
    expect(refusal(params({ runtime: 'csp', workers: 1 }))).toBeNull();
    expect(refusal(params({ runtime: 'threads', workers: 0 }))).toBeNull();
  });
});

describe('the decision table is exhaustive and the schedule obeys it', () => {
  const faults: Fault[] = ['none', 'hog', 'crash'];
  const base = (runtime: Runtime, fault: Fault, net: boolean): Params => params({ runtime, fault, net, requests: 40, cores: 8, pool: 40, actors: 4, workers: 8, buffer: 4 });

  it('every runtime × fault × safety-net cell is defined with a reason', () => {
    let cells = 0;
    for (const { id } of RUNTIMES) {
      for (const fault of faults) {
        for (const net of [false, true]) {
          const cell = OUTCOMES[id][fault][net ? 'on' : 'off'];
          expect(cell, `${id} ${fault} ${net}`).toBeDefined();
          expect(cell.text.length).toBeGreaterThan(10);
          expect(['none', 'request', 'mailbox', 'process']).toContain(cell.fails);
          cells++;
        }
      }
    }
    expect(cells).toBe(24);
  });

  it('the number of requests that fail is what each cell says', () => {
    for (const { id } of RUNTIMES) {
      for (const fault of faults) {
        for (const net of [false, true]) {
          const p = base(id, fault, net);
          const run = simulate(p);
          const cell = outcomeOf(normalise(p));
          const label = `${id} ${fault} net=${net}`;
          expect(run.finished + run.failed, label).toBe(40);
          if (cell.fails === 'none') expect(run.failed, label).toBe(0);
          if (cell.fails === 'request') {
            expect(run.failed, label).toBe(1);
            expect(run.failedAt[FAULT_REQUEST], label).not.toBeNull();
          }
          if (cell.fails === 'process') expect(run.failed, label).toBe(40);
          if (cell.fails === 'mailbox') {
            const mailbox = (FAULT_REQUEST - 1) % 4;
            const expected = Array.from({ length: 40 }, (_, i) => i + 1).filter((r) => (r - 1) % 4 === mailbox);
            expect(run.failedAt.map((f, r) => (f === null ? 0 : r)).filter(Boolean), label).toEqual(expected);
          }
        }
      }
    }
  });

  it('a thread that dies leaves the pool one thread smaller: with a pool of 1 the rest of the queue is lost, not left hanging', () => {
    const run = simulate(params({ runtime: 'threads', pool: 1, cores: 1, requests: 10, fault: 'crash', net: false }));
    // request 7 is the 7th through the one thread; 6 finish before it, it crashes, and the 3 behind it never run
    expect(run.finished).toBe(6);
    expect(run.failed).toBe(4);
    const kept = simulate(params({ runtime: 'threads', pool: 1, cores: 1, requests: 10, fault: 'crash', net: true }));
    expect(kept.finished).toBe(9);
    expect(kept.failed).toBe(1);
  });

  it('who waits matches the cell: the loop delays everyone, an actor only its mailbox, threads and workers only what shares their core', () => {
    const withHog = (runtime: Runtime) => simulate(base(runtime, 'hog', false));
    const without = (runtime: Runtime) => simulate(withoutFault(base(runtime, 'hog', false)));
    // event loop: even the fastest bystander is delayed by about the whole handler
    expect(withHog('events').bystanderFinish!).toBeGreaterThan(without('events').bystanderFinish! + HOG_MS / 2);
    // threads and CSP workers on spare cores: no bystander moves by anything like the handler's length
    for (const runtime of ['threads', 'csp'] as const) {
      const hog = withHog(runtime);
      const plain = without(runtime);
      expect(hog.makespan, runtime).toBeLessThanOrEqual(plain.makespan + HOG_MS);
      const sorted = (r: typeof plain) => finishes(r).filter((_, i) => i + 1 !== FAULT_REQUEST).sort((a, b) => a - b);
      expect(sorted(hog)[0], runtime).toBeLessThan(sorted(plain)[0] + QUANTUM_MS);
    }
  });
});

describe('what the stats read off the run', () => {
  it('peak concurrency equals the most fibres holding an unfinished request at once, counted from the finish times alone', () => {
    const owners = (p: Params): ((r: number) => number) => {
      if (p.runtime === 'actors') return (r) => (r - 1) % Math.min(p.actors, p.requests);
      return () => 0;
    };
    for (const p of [
      params({ runtime: 'actors', actors: 6, requests: 50 }),
      params({ runtime: 'events', requests: 50 }),
    ]) {
      const run = simulate(p);
      const owner = owners(p);
      const live = new Set<number>();
      for (let r = 1; r <= p.requests; r++) live.add(owner(r));
      expect(run.peakConcurrent).toBe(live.size);
    }
    for (const [pool, R] of [[4, 100], [100, 100], [250, 60], [1, 30]] as const) {
      const run = simulate(params({ runtime: 'threads', pool, requests: R, cores: 4 }));
      // threads hold a request from when they take it to when it finishes: sweep those intervals
      const events: [number, number][] = [];
      for (let r = 1; r <= R; r++) events.push([run.startedAt[r]!, 1], [run.finish[r]!, -1]);
      events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let live = 0;
      let peak = 0;
      for (const [, d] of events) peak = Math.max(peak, (live += d));
      expect(run.peakConcurrent, `pool ${pool} R ${R}`).toBe(peak);
      expect(run.peakConcurrent).toBe(Math.min(pool, R));
    }
  });

  it('memory is OS threads × the stack constant: one a thread for the pool, one for the loop, one a core for actors and workers', () => {
    expect(simulate(params({ runtime: 'threads', pool: 100, requests: 100 })).memoryMb).toBe(100 * STACK_MB);
    expect(simulate(params({ runtime: 'threads', pool: 8, requests: 100 })).memoryMb).toBe(8 * STACK_MB);
    expect(simulate(params({ runtime: 'events', requests: 100 })).memoryMb).toBe(STACK_MB);
    expect(simulate(params({ runtime: 'actors', cores: 6 })).memoryMb).toBe(6 * STACK_MB);
    expect(simulate(params({ runtime: 'csp', cores: 3 })).memoryMb).toBe(3 * STACK_MB);
  });

  it('the switch count follows its printed rule: two per blocking I/O for threads and workers, none for the loop and actors', () => {
    expect(simulate(params({ runtime: 'threads', pool: 100, requests: 100, cores: 8 })).switches).toBe(200);
    expect(simulate(params({ runtime: 'csp', workers: 4, requests: 100 })).switches).toBe(200);
    expect(simulate(params({ runtime: 'actors', requests: 100 })).switches).toBe(0);
    // preemption adds one per slice handed over: one core, a thread each and the slow handler
    const hog = simulate(params({ runtime: 'threads', pool: 20, requests: 20, cores: 1, fault: 'hog' }));
    expect(hog.switches).toBeGreaterThan(40);
  });

  it('every finished request took at least its two CPU steps and the wait, and nothing finishes after the makespan', () => {
    for (const runtime of ['threads', 'events', 'actors', 'csp'] as Runtime[]) {
      const run = simulate(params({ runtime, requests: 50, cores: 2, pool: 10, actors: 3, workers: 3 }));
      for (let r = 1; r <= 50; r++) {
        expect(run.finish[r]!).toBeGreaterThanOrEqual(ROUND);
        expect(run.finish[r]!).toBeLessThanOrEqual(run.makespan);
      }
    }
  });

  it('merging keeps separate bars apart and joins back-to-back pieces', () => {
    const merged = mergeSegs([
      { req: 1, kind: 'cpu', start: 0, end: 1 },
      { req: 1, kind: 'cpu', start: 1, end: 2 },
      { req: 1, kind: 'io', start: 2, end: 102 },
      { req: 1, kind: 'cpu', start: 5, end: 6 },
      { req: 2, kind: 'cpu', start: 0, end: 1, hog: true },
      { req: 2, kind: 'cpu', start: 1, end: 2 },
    ]);
    expect(merged).toEqual([
      { req: 1, kind: 'cpu', start: 0, end: 2 },
      { req: 1, kind: 'io', start: 2, end: 102 },
      { req: 1, kind: 'cpu', start: 5, end: 6 },
      { req: 2, kind: 'cpu', start: 0, end: 1, hog: true },
      { req: 2, kind: 'cpu', start: 1, end: 2 },
    ]);
  });
});

describe('controls a runtime does not show cannot move its numbers', () => {
  const pick = (r: ReturnType<typeof simulate>) => ({ makespan: r.makespan, finish: r.finish, switches: r.switches, peak: r.peakConcurrent, memory: r.memoryMb, segs: r.segs, sender: r.senderDone });
  const extremes: Partial<Params>[] = [];
  for (const pool of [1, 200]) for (const actors of [1, 16]) for (const workers of [1, 16]) for (const buffer of [0, 20]) extremes.push({ pool, actors, workers, buffer });

  it('pool, actors, workers and buffer matter only to their own runtime, and the safety net only to a crash', () => {
    for (const runtime of ['threads', 'events', 'actors', 'csp'] as Runtime[]) {
      const own: (keyof Params)[] = runtime === 'threads' ? ['pool'] : runtime === 'actors' ? ['actors'] : runtime === 'csp' ? ['workers', 'buffer'] : [];
      for (const fault of ['none', 'hog', 'crash'] as Fault[]) {
        const baseline = pick(simulate(params({ runtime, fault, requests: 60, cores: 3, pool: 7, actors: 5, workers: 3, buffer: 2 })));
        for (const e of extremes) {
          const varied: Partial<Params> = { ...e };
          for (const key of own) delete varied[key];
          const run = pick(simulate(params({ runtime, fault, requests: 60, cores: 3, pool: 7, actors: 5, workers: 3, buffer: 2, ...varied })));
          expect(run, `${runtime} ${fault} ${JSON.stringify(varied)}`).toEqual(baseline);
        }
      }
    }
    // the net does nothing unless the fault is a crash
    for (const fault of ['none', 'hog'] as Fault[]) {
      expect(pick(simulate(params({ fault, net: true })))).toEqual(pick(simulate(params({ fault, net: false }))));
    }
  });
});
