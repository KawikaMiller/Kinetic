/** What scenes 1 and 2 draw, as pure functions of a cache snapshot, so tones and numbers are testable. */
import type { Tone } from '../../core/tone';
import type { Method, Outcome, Pattern, Snapshot, TraceConfig } from './cache';

/** Pages per grid row in the file strip. */
export const GRID_COLS = 16;

/** Scene 1 opens on a sequential read() of a 64-page file with room for 32 pages and readahead off. */
export const DEFAULT_METHOD: Method = 'read';
export const DEFAULT_PATTERN: Pattern = 'sequential';
export const DEFAULT_FILE_PAGES = 64;
export const DEFAULT_CAPACITY = 32;
export const DEFAULT_TRACE_SEED = 3;

/** Scene 2 opens on a sequential trace with a window cap of 8 pages; the cache holds the whole file. */
export const READAHEAD_FILE_PAGES = 64;
export const READAHEAD_CAPACITY = 64;
export const READAHEAD_PATTERN: Pattern = 'sequential';
export const READAHEAD_DEFAULT_CAP_INDEX = 3;
export const READAHEAD_SEED = 3;

export const traceConfig = (pattern: Pattern, filePages: number, seed: number): TraceConfig => ({ pattern, filePages, seed });

export interface CellLook {
  text: string;
  tone: Tone;
  fill: 'tint' | 'outline';
}

/** A page of the file: dim when not cached, green when cached (clean here: scene 1 only reads); a letter for each process that maps it. */
export function pageLook(step: Snapshot, page: number): CellLook {
  const cached = step.cached[page] === 1;
  const mask = step.mapped[page];
  const text = mask === 3 ? 'AB' : mask === 1 ? 'A' : mask === 2 ? 'B' : '';
  if (!cached) return { text, tone: 'dim', fill: 'outline' };
  return { text, tone: mask === 3 ? 'violet' : 'ok', fill: 'tint' };
}

/** The ring on the page just accessed: red for a disk read, blue for a minor fault, orange for a copy, yellow for a plain access. */
export const RING_TONE: Record<Outcome, Tone> = { miss: 'bad', major: 'bad', minor: 'info', hit: 'orange', mapped: 'hi' };

/** The readahead strip: used pages green, pages read ahead and not yet used orange (outlined), others dim. */
export function readaheadLook(step: Snapshot, page: number): CellLook {
  if (step.cached[page] !== 1) return { text: '', tone: 'dim', fill: 'outline' };
  return step.unusedPrefetch[page] ? { text: '', tone: 'orange', fill: 'outline' } : { text: '', tone: 'ok', fill: 'tint' };
}

export interface ProcessView {
  name: string;
  accesses: number;
  mappedPages: number;
}

/** Per process: accesses made so far and pages it has mapped now; with `shared` the pages both map. */
export function processViews(step: Snapshot, accessesSoFar: readonly { proc: number }[]) {
  const mapped = (bit: number) => step.mapped.filter((m) => (m & bit) !== 0).length;
  const views: ProcessView[] = [
    { name: 'A', accesses: accessesSoFar.filter((a) => a.proc === 0).length, mappedPages: mapped(1) },
    { name: 'B', accesses: accessesSoFar.filter((a) => a.proc === 1).length, mappedPages: mapped(2) },
  ];
  return { views, shared: step.mapped.filter((m) => m === 3).length };
}
