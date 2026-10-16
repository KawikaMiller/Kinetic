import { describe, expect, it } from 'vitest';
import { LEAF_TICKS, STARVE_DEPTH, STARVE_WORKERS, createStarveSim, isStalled, parentCount, runStarve, starveInit, taskCount, type StarveParams } from './starve';

const p = (over: Partial<StarveParams>): StarveParams => ({ workers: 3, depth: 3, helping: false, seed: 1, ...over });

describe('the starvation scene', () => {
  it('reports stalled exactly when a pool without helping has no more workers than parents: P <= 2^depth - 1, over a grid', () => {
    let cases = 0;
    for (let workers = STARVE_WORKERS.min; workers <= STARVE_WORKERS.max; workers++) {
      for (let depth = STARVE_DEPTH.min; depth <= STARVE_DEPTH.max; depth++) {
        const r = runStarve(p({ workers, depth, helping: false }));
        // the first P tasks in the queue's order are the parents (breadth first), so the pool starves iff all P workers get one
        expect(r.stalled, `P=${workers} depth=${depth}`).toBe(workers <= 2 ** depth - 1);
        if (!r.stalled) expect(r.finished).toBe(taskCount(depth));
        else expect(r.finished).toBeLessThan(taskCount(depth));
        cases++;
      }
    }
    expect(cases).toBe(8 * 4);
  });

  it('never stalls, and always finishes every task, when waiting workers help', () => {
    for (let workers = 1; workers <= 8; workers++) {
      for (let depth = 1; depth <= 4; depth++) {
        const r = runStarve(p({ workers, depth, helping: true }));
        expect(r.stalled, `P=${workers} depth=${depth}`).toBe(false);
        expect(r.finished).toBe(taskCount(depth));
      }
    }
  });

  it('a stall is detected in the tick it happens and the sim stops there: the counterexample stays', () => {
    const sim = createStarveSim(p({ workers: 3, depth: 3 }));
    sim.run(500);
    expect(sim.violation?.message).toBe('stalled');
    expect(sim.ticks).toBeLessThan(10);
    expect(isStalled(sim.state, p({ workers: 3, depth: 3 }))).toBe(true);
    expect(sim.state.queue.length).toBeGreaterThan(0);
    expect(sim.state.stacks.every((st) => st.at(-1)?.phase === 'wait')).toBe(true);
  });

  it('is never "stalled" before the pool is full: a pool that is still filling has idle workers', () => {
    const params = p({ workers: 3, depth: 3 });
    const init = starveInit(params);
    expect(isStalled(init, params)).toBe(false);
  });

  it('the default scene (3 workers, depth 3) stalls with 7 parents and 3 holding blockers, and helping finishes the same tree', () => {
    expect(parentCount(3)).toBe(7);
    const stalled = runStarve(p({}));
    expect(stalled.stalled).toBe(true);
    const helped = runStarve(p({ helping: true }));
    expect(helped.stalled).toBe(false);
    // 8 leaves of LEAF_TICKS ticks on 3 workers cannot finish faster than the leaf work over the workers
    expect(helped.ticks).toBeGreaterThanOrEqual(Math.ceil((8 * LEAF_TICKS) / 3));
  });

  it('is deterministic', () => {
    expect(runStarve(p({ helping: true }))).toEqual(runStarve(p({ helping: true })));
  });
});
