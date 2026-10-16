/**
 * Pool sizing: T identical tasks on P threads and C cores. A task is a CPU burst followed by a wait
 * (the "w/c" mix); the wait uses no core. A toy contention cost makes each burst a little longer the
 * more threads exist. Tick by tick, deterministic.
 */

export const POOL_TASKS = 1200;
/** A task's CPU burst, in ticks, before any contention cost. */
export const POOL_CPU = 10;
/** Toy contention: every burst gets one extra tick per this many threads in the pool. */
export const OVERHEAD_DIV = 16;

/** Wait-to-compute ratios the mix slider offers; 0 is a pure CPU-bound task. */
export const MIXES = [0, 1, 2, 4, 9, 19] as const;
export const DEFAULT_MIX_INDEX = 3;
export const POOL_RANGE = { min: 1, max: 64 } as const;
export const CORE_RANGE = { min: 1, max: 8 } as const;

export interface PoolParams {
  cores: number;
  /** Wait over compute for one task. */
  ratio: number;
  pool: number;
  /** Threads per extra tick of contention; Infinity switches the toy cost off. */
  overheadDiv?: number;
}

export interface PoolResult {
  makespan: number;
  /** Tasks finished per 100 ticks. */
  throughput: number;
  /** Share of core-ticks spent running a burst. */
  coreUse: number;
  burst: number;
}

export const burstTicks = (pool: number, overheadDiv = OVERHEAD_DIV): number => POOL_CPU + Math.floor(pool / overheadDiv);

export function simulatePool(p: PoolParams): PoolResult {
  const burst = burstTicks(p.pool, p.overheadDiv);
  const wait = p.ratio * POOL_CPU;
  // phase 0 idle, 1 ready, 2 running, 3 waiting
  const phase: number[] = Array.from({ length: p.pool }, () => 0);
  const left: number[] = Array.from({ length: p.pool }, () => 0);
  const ready: number[] = [];
  let taken = 0;
  let done = 0;
  let running = 0;
  let busy = 0;
  let tick = 0;
  while (done < POOL_TASKS) {
    for (let t = 0; t < p.pool && taken < POOL_TASKS; t++) {
      if (phase[t] === 0) {
        phase[t] = 1;
        ready.push(t);
        taken++;
      }
    }
    while (running < p.cores && ready.length) {
      const t = ready.shift()!;
      phase[t] = 2;
      left[t] = burst;
      running++;
    }
    tick++;
    for (let t = 0; t < p.pool; t++) {
      if (phase[t] === 2) {
        busy++;
        if (--left[t] === 0) {
          running--;
          if (wait === 0) {
            phase[t] = 0;
            done++;
          } else {
            phase[t] = 3;
            left[t] = wait;
          }
        }
      } else if (phase[t] === 3 && --left[t] === 0) {
        phase[t] = 0;
        done++;
      }
    }
  }
  return { makespan: tick, throughput: (POOL_TASKS / tick) * 100, coreUse: busy / (p.cores * tick), burst };
}

/** Throughput for every pool size in the range: the sweep the curve draws. */
export function sweepPool(base: Omit<PoolParams, 'pool'>): { pool: number; throughput: number }[] {
  const out: { pool: number; throughput: number }[] = [];
  for (let pool = POOL_RANGE.min; pool <= POOL_RANGE.max; pool++) out.push({ pool, throughput: simulatePool({ ...base, pool }).throughput });
  return out;
}

/** The first pool size whose throughput is within `tolerance` of the best: where the curve stops gaining. */
export function bestPool(curve: readonly { pool: number; throughput: number }[], tolerance = 0.01): number {
  const best = Math.max(...curve.map((c) => c.throughput));
  return curve.find((c) => c.throughput >= best * (1 - tolerance))!.pool;
}

/** The rule of thumb: threads = cores x (1 + wait / compute). A rule of thumb, credited from memory. */
export const ruleOfThumb = (cores: number, ratio: number): number => cores * (1 + ratio);
