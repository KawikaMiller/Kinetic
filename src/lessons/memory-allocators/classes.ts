/** Size classes and the internal waste they cause, and the pages a heap can hand back. The class table is made up, not any real library's. */
import { mulberry32 } from '../../core/random';

export type Spacing = 'eighth' | 'quarter' | 'half' | 'pow2';
export const SPACINGS: readonly Spacing[] = ['eighth', 'quarter', 'half', 'pow2'];
export const SPACING_LABELS: Record<Spacing, string> = { eighth: '12.5%', quarter: '25%', half: '50%', pow2: 'Powers of two' };
const GROWTH: Record<Spacing, number> = { eighth: 1.125, quarter: 1.25, half: 1.5, pow2: 2 };

export const MIN_REQUEST = 8;
export const MAX_REQUEST = 2048;
/** The table runs past the largest request, so every request has a class. */
export const MAX_CLASS = 4096;
export const ALIGN = 8;
export const REQUEST_COUNT = 2000;
export const REQUEST_SEED = 23;
/** Requests at or above this size are where spacing, not the alignment step, sets the waste. */
export const WORST_FROM = 128;
/** The request the size-class caption rounds up as a worked example. */
export const WORKED_REQUEST = 100;

const roundUp = (v: number, to: number) => Math.ceil(v / to) * to;

export function classTable(spacing: Spacing): number[] {
  const sizes = [MIN_REQUEST];
  while (sizes[sizes.length - 1] < MAX_CLASS) {
    const c = sizes[sizes.length - 1];
    const next = spacing === 'pow2' ? c * 2 : Math.max(c + ALIGN, roundUp(c * GROWTH[spacing], ALIGN));
    sizes.push(Math.min(next, MAX_CLASS));
  }
  return sizes;
}

/** The smallest class that holds the request. */
export function classOf(table: readonly number[], request: number): number {
  const c = table.find((size) => size >= request);
  if (c === undefined) throw new RangeError(`request ${request} is larger than the largest class ${table[table.length - 1]}`);
  return c;
}

/** Seeded log-uniform request sizes in MIN_REQUEST to MAX_REQUEST bytes. */
export function requestSizes(count = REQUEST_COUNT, seed = REQUEST_SEED): number[] {
  const rnd = mulberry32(seed);
  const lo = Math.log(MIN_REQUEST);
  const hi = Math.log(MAX_REQUEST);
  return Array.from({ length: count }, () => Math.min(MAX_REQUEST, Math.max(MIN_REQUEST, Math.floor(Math.exp(lo + rnd() * (hi - lo))))));
}

/** Internal waste: the bytes handed out beyond what was asked, as a share of the bytes handed out. */
export function internalWaste(table: readonly number[], requests: readonly number[]): number {
  let given = 0;
  let asked = 0;
  for (const r of requests) {
    given += classOf(table, r);
    asked += r;
  }
  return given === 0 ? 0 : (given - asked) / given;
}

/** The largest waste share any single request of WORST_FROM bytes or more can suffer. */
export function worstCaseWaste(table: readonly number[]): number {
  let worst = 0;
  for (let r = WORST_FROM; r <= MAX_CLASS; r++) worst = Math.max(worst, (classOf(table, r) - r) / classOf(table, r));
  return worst;
}

export const spacingOpening = (): Spacing => 'quarter';

// ---- Pages a heap can hand back ---------------------------------------------------------------------------

export const PAGES = 256;
export const PAGE_BYTES = 4096;
export const OBJECTS_PER_PAGE = { min: 1, max: 16, default: 8 } as const;
export const FREED_STEP = 0.05;
export const FREED_DEFAULT = 0.9;
export const PAGE_SEED = 5;

export type FreePattern = 'random' | 'oldest' | 'end';
export const FREE_PATTERNS: readonly FreePattern[] = ['random', 'oldest', 'end'];
export const FREE_PATTERN_LABELS: Record<FreePattern, string> = { random: 'Random', oldest: 'Oldest first', end: 'Contiguous from the end' };

export interface PageSetup {
  objectsPerPage: number;
  freed: number;
  pattern: FreePattern;
}

export const pagesOpening = (): PageSetup => ({ objectsPerPage: OBJECTS_PER_PAGE.default, freed: FREED_DEFAULT, pattern: 'random' });

/** The object indexes freed: objects are numbered in address (and age) order, k to a page. */
export function freedObjects(s: PageSetup, seed = PAGE_SEED): number[] {
  const total = PAGES * s.objectsPerPage;
  const m = Math.round(s.freed * total);
  switch (s.pattern) {
    case 'oldest': return Array.from({ length: m }, (_, i) => i);
    case 'end': return Array.from({ length: m }, (_, i) => total - m + i);
    case 'random': {
      const rnd = mulberry32(seed);
      const order = Array.from({ length: total }, (_, i) => i);
      for (let i = 0; i < m; i++) {
        const j = i + Math.floor(rnd() * (total - i));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return order.slice(0, m);
    }
  }
}

export type PageKind = 'full' | 'partial' | 'empty';

export interface PageSummary {
  kinds: PageKind[];
  freedObjects: number;
  full: number;
  partial: number;
  /** Pages with every object free: the only ones that can go back to the operating system. */
  returnable: number;
  freedBytes: number;
  returnedBytes: number;
  /** Freed bytes that sit in partly used pages and cannot be returned. */
  stuckBytes: number;
}

export function summarisePages(s: PageSetup, seed = PAGE_SEED): PageSummary {
  const k = s.objectsPerPage;
  const freed = freedObjects(s, seed);
  const live = Array.from({ length: PAGES }, () => k);
  for (const o of freed) live[Math.floor(o / k)]--;
  const kinds = live.map((l): PageKind => (l === 0 ? 'empty' : l === k ? 'full' : 'partial'));
  const objectBytes = Math.floor(PAGE_BYTES / k);
  const returnable = kinds.filter((x) => x === 'empty').length;
  const freedBytes = freed.length * objectBytes;
  return {
    kinds,
    freedObjects: freed.length,
    full: kinds.filter((x) => x === 'full').length,
    partial: kinds.filter((x) => x === 'partial').length,
    returnable,
    freedBytes,
    returnedBytes: returnable * PAGE_BYTES,
    stuckBytes: freedBytes - returnable * k * objectBytes,
  };
}
