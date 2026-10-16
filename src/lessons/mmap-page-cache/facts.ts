/** The numbers the try-this entries quote, computed from each scene's default state by the same models the scenes draw. */
import { DEFAULT_CAP_OFF, WINDOW_CAPS, finalOf, hitRatio, makeTrace, simulate, type CacheConfig, type Method, type Pattern } from './cache';
import { percent, size } from './captions';
import { BROKEN_ACK_SEED, ack, fsync, freshMachine, lostWrites, powerCut, runSchedule, writePage } from './durability';
import {
  DEFAULT_CAPACITY, DEFAULT_FILE_PAGES, DEFAULT_METHOD, DEFAULT_PATTERN, DEFAULT_TRACE_SEED, READAHEAD_CAPACITY, READAHEAD_DEFAULT_CAP_INDEX, READAHEAD_FILE_PAGES, READAHEAD_PATTERN, READAHEAD_SEED,
} from './view';

/** Scene 1 run to the end from its defaults, with the pattern and method the try-this switches to. */
export function readRun(pattern: Pattern = DEFAULT_PATTERN, method: Method = DEFAULT_METHOD) {
  const config: CacheConfig = { filePages: DEFAULT_FILE_PAGES, capacity: DEFAULT_CAPACITY, method, windowCap: DEFAULT_CAP_OFF };
  const c = finalOf(simulate(config, makeTrace({ pattern, filePages: DEFAULT_FILE_PAGES, seed: DEFAULT_TRACE_SEED }))).counters;
  return { disk: c.diskPages, hits: c.hits, ratio: percent(hitRatio(c)), copied: size(c.bytesCopied), minor: c.minor, major: c.major };
}

export function readaheadRun(capIndex: number) {
  const trace = makeTrace({ pattern: READAHEAD_PATTERN, filePages: READAHEAD_FILE_PAGES, seed: READAHEAD_SEED });
  const c = finalOf(simulate({ filePages: READAHEAD_FILE_PAGES, capacity: READAHEAD_CAPACITY, method: 'read', windowCap: WINDOW_CAPS[capIndex] }, trace)).counters;
  return { cap: WINDOW_CAPS[capIndex], ratio: percent(hitRatio(c)), ios: c.ios };
}
export const readaheadDefaultCap = READAHEAD_DEFAULT_CAP_INDEX;

/** The scene-3 try-this: save to page 2 (acknowledged at once), then pull the plug, with and without an fsync first. */
export function powerFacts() {
  const saved = writePage(freshMachine(), 2, 'write')!;
  const acked = ack(saved.m, saved.ack);
  return { lostPlain: lostWrites(powerCut(acked)), lostWithFsync: lostWrites(powerCut(fsync(acked, false))) };
}

export function seededFacts() {
  return { seed: BROKEN_ACK_SEED, before: runSchedule(BROKEN_ACK_SEED, 'before').lost, after: runSchedule(BROKEN_ACK_SEED, 'after').lost };
}
