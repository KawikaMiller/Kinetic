/**
 * The state each scene opens in (pure functions, so a test can walk through every scene and check that none leaks into another),
 * and what the scenes compute from their controls.
 */
import {
  BURST_SHIFT, HIT, KEYS, READ_SHARE, SKEW, SPLIT_M, UTILISATION, detect, hottestKeys, makeStream, shardLoads, summarise,
  type Detection, type Loads, type Mitigation, type MitigationKind, type PhaseLoads, type Summary,
} from './skew';

export const STREAM_SEED = 1;

export interface MeltState {
  skew: number;
  util: number;
  seed: number;
}
export const initialMelt = (): MeltState => ({ skew: SKEW.default, util: UTILISATION.default, seed: STREAM_SEED });

/** Scene 2 applies the mitigation to the four hottest keys: with s = 1 they are the keys that carry 3% or more. */
export const MITIGATED_KEYS = 4;
export interface MitigateState {
  kind: MitigationKind;
  m: number;
  hit: number;
  readShare: number;
  util: number;
  seed: number;
}
export const initialMitigate = (): MitigateState => ({ kind: 'salt', m: SPLIT_M.default, hit: HIT.default, readShare: READ_SHARE.default, util: UTILISATION.default, seed: STREAM_SEED });

export const mitigationOf = (s: MitigateState): Mitigation => ({ kind: s.kind, m: s.m, hit: s.hit, hot: hottestKeys(MITIGATED_KEYS) });

export interface MitigateView {
  without: Loads;
  now: Loads;
  withoutSummary: Summary;
  nowSummary: Summary;
}
export function mitigateView(s: MitigateState): MitigateView {
  const stream = makeStream({ seed: s.seed, skew: SKEW.default, readShare: s.readShare });
  const without = shardLoads(stream, { ...mitigationOf(s), kind: 'none' }, SKEW.default);
  const now = shardLoads(stream, mitigationOf(s), SKEW.default);
  return { without, now, withoutSummary: summarise(without, s.util), nowSummary: summarise(now, s.util) };
}

/** The detect scene opens on a sketch small enough to miss a hot key (width 8 of 4 rows: 32 counters). */
export interface DetectState {
  width: number;
  hashSeed: number;
}
export const initialDetect = (): DetectState => ({ width: 8, hashSeed: 1 });

export interface DetectView {
  detection: Detection;
  flaggedLoads: Summary;
  trueLoads: Summary;
}
export function detectView(s: DetectState, util = UTILISATION.default): DetectView {
  const stream = makeStream({ seed: STREAM_SEED, skew: SKEW.default, readShare: READ_SHARE.default });
  const detection = detect(stream, s.width, s.hashSeed);
  const salted = (keys: readonly number[]): Loads => shardLoads(stream, { kind: 'salt', m: SPLIT_M.max, hit: 0, hot: new Set(keys) }, SKEW.default);
  return { detection, flaggedLoads: summarise(salted(detection.flagged), util), trueLoads: summarise(salted(detection.hot), util) };
}

export interface BurstState {
  burst: boolean;
  adaptive: boolean;
}
export const initialBurst = (): BurstState => ({ burst: true, adaptive: false });
/** Scene 4 salts the twelve hottest keys with 8 suffixes. */
export const BURST_KEYS = 12;
export const BURST_M = 8;

export function burstView(s: BurstState, skew = SKEW.default): PhaseLoads & { salted: ReadonlySet<number>; secondSalted: ReadonlySet<number> } {
  const stream = makeStream({ seed: STREAM_SEED, skew, readShare: 0.2, burst: s.burst });
  const first = hottestKeys(BURST_KEYS);
  const moved = new Set([...first].map((k) => ((k - 1 + BURST_SHIFT) % KEYS) + 1));
  const second = s.burst && s.adaptive ? moved : first;
  const half = stream.length / 2;
  const mk = (part: typeof stream, hot: ReadonlySet<number>) => shardLoads(part, { kind: 'salt', m: BURST_M, hit: 0, hot }, skew);
  return { first: mk(stream.slice(0, half), first), second: mk(stream.slice(half), second), salted: first, secondSalted: second };
}
