// What the memory-hierarchy lesson computes over the latency ladder (core/latencyLadder).

/** Average access time with a cache: hits cost `fastNs`, misses fall through to `slowNs`. */
export const effectiveNs = (hitRate: number, fastNs: number, slowNs: number) => hitRate * fastNs + (1 - hitRate) * slowNs;

/** How many times slower `a` is than `b`. */
export const ratio = (a: number, b: number) => a / b;

/** 1 ns of real time becomes 1 s of human time. */
export const HUMAN_SECONDS_PER_NS = 1;
