import { SHARDS, type Loads } from './skew';

/** Each shard's load as a share of its own capacity when the cluster is `util` busy with `requests` plain requests (capacity is sized for those). */
export const loadFractions = (loads: readonly number[], util: number, requests: number): number[] => loads.map((x) => (requests === 0 ? 0 : (x / requests) * SHARDS * util));

export const totalOf = (l: Loads) => l.loads.reduce((a, b) => a + b, 0);
