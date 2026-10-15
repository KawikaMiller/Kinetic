/**
 * count-min-heavy-hitters, scene 4: one sketch per Kafka partition, added cell by cell. With the same hash seeds the sum is exactly the
 * sketch of the combined stream; with different seeds the cells mean different things and the sum is wrong. Pure.
 */
import { addSketches, sameGrid, type Sketch } from './sketch';
import { sketchOf } from './stream';

export const PARTITIONS = 3;
export const MERGE_N = 6_000;
export const MERGE_WIDTH = 64;
export const MERGE_DEPTH = 4;
export const MERGE_MAX_WIDTH = 512;

/** Record i goes to partition i mod PARTITIONS: records without a key are spread round-robin, so one item lands in every partition. */
export const splitRoundRobin = (stream: readonly number[], parts = PARTITIONS): number[][] =>
  Array.from({ length: parts }, (_, p) => stream.filter((_, i) => i % parts === p));

export interface MergeRun {
  parts: Sketch[];
  merged: Sketch;
  combined: Sketch;
  equal: boolean;
  differingCells: number;
}

/** Sketch each partition (all with `hashSeed`, or each with its own when `sameSeeds` is off), add them, and compare with the sketch of everything. */
export function mergeRun(stream: readonly number[], w: number, d: number, hashSeed: number, sameSeeds: boolean): MergeRun {
  const parts = splitRoundRobin(stream).map((s, p) => sketchOf(s, w, d, sameSeeds ? hashSeed : hashSeed + p));
  const merged = parts.slice(1).reduce(addSketches, parts[0]);
  const combined = sketchOf(stream, w, d, hashSeed);
  return { parts, merged, combined, equal: sameGrid(merged, combined), differingCells: merged.counts.reduce((n, v, i) => n + (v === combined.counts[i] ? 0 : 1), 0) };
}
