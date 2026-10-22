/**
 * Segments are plain HTTP files, so a CDN cache can hold them: a seeded stream of segment requests (a title by Zipf
 * popularity, a segment of it uniformly) goes through an LRU cache of a stated size, and each miss is a request to the
 * origin. Pure. The catalogue size, request count and title length are illustrative.
 */
import { harmonic, zipfSampler } from '../../core/distributions';
import { mulberry32 } from '../../core/random';

export const CATALOGUE = 200;
export const SEGMENTS_PER_TITLE = 30;
export const REQUESTS = 20_000;
/** The two titles the scene compares: the most popular one and one deep in the long tail. */
export const POPULAR_RANK = 1;
export const TAIL_RANK = 150;
export const CACHE = { min: 100, max: 6000, step: 100, initial: 1000 } as const;
export const ZIPF = { min: 0.6, max: 1.4, step: 0.1, initial: 1.0 } as const;
export const DEFAULT_SEED = 7;

export interface Req {
  title: number;
  segment: number;
}

export function requestStream(seed: number, alpha: number, n = REQUESTS): Req[] {
  const rnd = mulberry32(seed);
  const draw = zipfSampler(CATALOGUE, alpha);
  return Array.from({ length: n }, () => ({ title: draw(rnd), segment: Math.floor(rnd() * SEGMENTS_PER_TITLE) }));
}

export interface TitleStats {
  requests: number;
  hits: number;
}
export interface Replay {
  requests: number;
  hits: number;
  misses: number;
  hitRatio: number;
  byTitle: Map<number, TitleStats>;
}

const key = (r: Req) => r.title * SEGMENTS_PER_TITLE + r.segment;

/** Replay a stream through an LRU of `capacity` segments (a Map's insertion order is the recency order). */
export function replay(stream: readonly Req[], capacity: number): Replay {
  const cache = new Map<number, true>();
  const byTitle = new Map<number, TitleStats>();
  let hits = 0;
  for (const r of stream) {
    const k = key(r);
    const stat = byTitle.get(r.title) ?? { requests: 0, hits: 0 };
    byTitle.set(r.title, stat);
    stat.requests++;
    if (cache.has(k)) {
      hits++;
      stat.hits++;
      cache.delete(k);
    } else if (cache.size >= capacity) {
      cache.delete(cache.keys().next().value as number);
    }
    cache.set(k, true);
  }
  return { requests: stream.length, hits, misses: stream.length - hits, hitRatio: stream.length ? hits / stream.length : 0, byTitle };
}

export const titleRatio = (r: Replay, rank: number): { requests: number; ratio: number | null } => {
  const s = r.byTitle.get(rank);
  return { requests: s?.requests ?? 0, ratio: s && s.requests > 0 ? s.hits / s.requests : null };
};

/** The share of requests the Zipf law gives a title, for the caption's "expected" figure. */
export const expectedShare = (rank: number, alpha: number): number => rank ** -alpha / harmonic(CATALOGUE, alpha);

// ---- live versus on demand ---------------------------------------------------------------------

/** Segments a live player holds back, and the seconds to encode, package and deliver a segment: illustrative. */
export const LIVE = { segmentsBuffered: 3, pipelineSeconds: 4 } as const;
export const liveLatency = (segmentSeconds: number): number => LIVE.segmentsBuffered * segmentSeconds + LIVE.pipelineSeconds;
