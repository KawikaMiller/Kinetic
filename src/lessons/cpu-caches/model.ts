/**
 * A toy set-associative cache with LRU replacement, and the memory layouts the lesson walks
 * through it. Pure: the Stage and the captions only read what these functions return.
 *
 * Miss kinds (the "three Cs"):
 * - compulsory: the first touch of a line, ever;
 * - capacity: it would also miss in a fully associative LRU cache with the same number of lines;
 * - conflict: everything else (only the set mapping made it miss).
 */

export interface CacheConfig {
  lineBytes: number;
  sets: number;
  ways: number;
}

/** The lesson's cache: 4 sets × 2 ways of 64-byte lines = 512 bytes. */
export const CACHE: CacheConfig = { lineBytes: 64, sets: 4, ways: 2 };
export const INT_BYTES = 4;
/** Addresses on screen are 16-bit so every bit of the split fits on a phone. */
export const ADDRESS_BITS = 16;
/** Arrays start here: line-aligned, and set 0 aligned. */
export const BASE = 0x4000;

/** Illustrative costs from memory-hierarchy's table: an L1 hit and a trip to RAM. */
export const L1_NS = 1;
export const RAM_NS = 100;

const log2 = (n: number) => {
  const k = Math.log2(n);
  if (!Number.isInteger(k) || k < 0) throw new RangeError(`${n} is not a power of two`);
  return k;
};

export interface AddressSplit {
  tag: number;
  set: number;
  offset: number;
  /** Bit widths, most significant first: tag | set | offset. */
  bits: { tag: number; set: number; offset: number };
}

/** offset = low log2(lineBytes) bits, set = the next log2(sets) bits, tag = the rest. */
export function splitAddress(addr: number, cfg: CacheConfig, addressBits = ADDRESS_BITS): AddressSplit {
  const offsetBits = log2(cfg.lineBytes);
  const setBits = log2(cfg.sets);
  const tagBits = addressBits - offsetBits - setBits;
  if (tagBits < 0) throw new RangeError('address too narrow for this cache');
  return {
    offset: addr & (cfg.lineBytes - 1),
    set: (addr >>> offsetBits) & (cfg.sets - 1),
    tag: addr >>> (offsetBits + setBits),
    bits: { tag: tagBits, set: setBits, offset: offsetBits },
  };
}

/** The address of the first byte of the line holding `addr`. */
export const lineOf = (addr: number, cfg: CacheConfig) => addr - (addr % cfg.lineBytes);

export type AccessKind = 'hit' | 'compulsory' | 'capacity' | 'conflict';

export interface WaySlot {
  /** Line address held, or null if the way is empty. */
  line: number | null;
}

export interface CacheAccess {
  addr: number;
  line: number;
  split: AddressSplit;
  hit: boolean;
  kind: AccessKind;
  /** The way that hit, or that the line was loaded into. */
  way: number;
  /** Line address thrown out to make room, if any. */
  evicted: number | null;
  /** Every set's ways after this access. */
  after: WaySlot[][];
  /** Per set: the way LRU would evict next, after this access. */
  lru: number[];
}

/** Set-associative cache with LRU per set, plus the miss classification. */
export function simulateCache(addresses: readonly number[], cfg: CacheConfig): CacheAccess[] {
  // Each set: line addresses ordered most recently used first, with their way numbers.
  const sets: { line: number; way: number }[][] = Array.from({ length: cfg.sets }, () => []);
  const ways: (number | null)[][] = Array.from({ length: cfg.sets }, () => Array(cfg.ways).fill(null));
  const seen = new Set<number>();
  const capacity = cfg.sets * cfg.ways;
  let fully: number[] = []; // fully associative LRU shadow, most recent first

  return addresses.map((addr) => {
    const line = lineOf(addr, cfg);
    const split = splitAddress(addr, cfg);
    const set = sets[split.set];
    const at = set.findIndex((e) => e.line === line);
    const fullyHit = fully.includes(line);
    fully = [line, ...fully.filter((l) => l !== line)].slice(0, capacity);
    const hit = at >= 0;
    let way: number;
    let evicted: number | null = null;
    if (hit) {
      const [e] = set.splice(at, 1);
      set.unshift(e);
      way = e.way;
    } else {
      const free = ways[split.set].indexOf(null);
      if (free >= 0) way = free;
      else {
        const victim = set.pop()!;
        way = victim.way;
        evicted = victim.line;
      }
      ways[split.set][way] = line;
      set.unshift({ line, way });
    }
    const kind: AccessKind = hit ? 'hit' : !seen.has(line) ? 'compulsory' : !fullyHit ? 'capacity' : 'conflict';
    seen.add(line);
    const lru = sets.map((s, i) => (s.length < cfg.ways ? ways[i].indexOf(null) : s[s.length - 1].way));
    return { addr, line, split, hit, kind, way, evicted, after: ways.map((w) => w.map((l) => ({ line: l }))), lru };
  });
}

export interface Tally {
  hits: number;
  misses: number;
  compulsory: number;
  capacity: number;
  conflict: number;
}

export function tally(accesses: readonly CacheAccess[]): Tally {
  const t: Tally = { hits: 0, misses: 0, compulsory: 0, capacity: 0, conflict: 0 };
  for (const a of accesses) {
    if (a.hit) t.hits++;
    else {
      t.misses++;
      t[a.kind as 'compulsory' | 'capacity' | 'conflict']++;
    }
  }
  return t;
}

/** Illustrative time: every hit at L1 speed, every miss at RAM speed. */
export const illustrativeNs = (t: Tally) => t.hits * L1_NS + t.misses * RAM_NS;
export const hitRate = (t: Tally) => (t.hits + t.misses === 0 ? 0 : t.hits / (t.hits + t.misses));

export type LayoutId = 'small' | 'wide' | 'stride' | 'structs';
export type Order = 'rows' | 'cols';

/** A memory scene: a grid of 4-byte ints, where each one lives, and the order the loop reads them. */
export interface Scene {
  layout: LayoutId;
  order: Order;
  rows: number;
  cols: number;
  /** Byte address of grid cell (r, c). */
  addr: (r: number, c: number) => number;
  /** Cells in the order the loop reads them. */
  visits: [number, number][];
  /** For the struct layouts: which field a cell holds. */
  field?: (r: number, c: number) => StructField;
  /** The loop, as C. */
  code: string[];
}

export const STRUCT_FIELDS = ['x', 'y', 'z', 'w'] as const;
export type StructField = (typeof STRUCT_FIELDS)[number];
export const STRUCT_COUNT = 32;
const INTS_PER_LINE = CACHE.lineBytes / INT_BYTES;

interface ArrayShape {
  rows: number;
  cols: number;
  /** Ints between the starts of two rows: the declared width. */
  stride: number;
}

export const ARRAYS: Record<Exclude<LayoutId, 'structs'>, ArrayShape & { label: string; decl: string }> = {
  small: { rows: 8, cols: 8, stride: 8, label: '8 × 8', decl: 'int a[8][8];' },
  wide: { rows: 16, cols: 16, stride: 16, label: '16 × 16', decl: 'int a[16][16];' },
  stride: { rows: 8, cols: 8, stride: 64, label: '8 × 8, rows 64 ints apart', decl: 'int a[8][64];   // only the first 8 columns used' },
};

function arrayScene(layout: Exclude<LayoutId, 'structs'>, order: Order): Scene {
  const s = ARRAYS[layout];
  const visits: [number, number][] = [];
  if (order === 'rows') for (let i = 0; i < s.rows; i++) for (let j = 0; j < s.cols; j++) visits.push([i, j]);
  else for (let j = 0; j < s.cols; j++) for (let i = 0; i < s.rows; i++) visits.push([i, j]);
  const loop =
    order === 'rows'
      ? [`for (i = 0; i < ${s.rows}; i++)`, `  for (j = 0; j < ${s.cols}; j++)`, '    sum += a[i][j];']
      : [`for (j = 0; j < ${s.cols}; j++)`, `  for (i = 0; i < ${s.rows}; i++)`, '    sum += a[i][j];'];
  return {
    layout,
    order,
    rows: s.rows,
    cols: s.cols,
    addr: (r, c) => BASE + (r * s.stride + c) * INT_BYTES,
    visits,
    code: [s.decl, ...loop],
  };
}

/**
 * 32 structs { int x, y, z, w } summed by x. "rows" = array of structs (x is every 4th int),
 * "cols" = struct of arrays (all the xs together). Drawn 16 ints per row: one cache line a row.
 */
function structScene(order: Order): Scene {
  const aos = order === 'rows';
  const rows = (STRUCT_COUNT * STRUCT_FIELDS.length) / INTS_PER_LINE;
  const fieldAt = (r: number, c: number): StructField => {
    const k = r * INTS_PER_LINE + c;
    return aos ? STRUCT_FIELDS[k % STRUCT_FIELDS.length] : STRUCT_FIELDS[Math.floor(k / STRUCT_COUNT)];
  };
  const visits: [number, number][] = [];
  for (let i = 0; i < STRUCT_COUNT; i++) {
    const k = aos ? i * STRUCT_FIELDS.length : i;
    visits.push([Math.floor(k / INTS_PER_LINE), k % INTS_PER_LINE]);
  }
  return {
    layout: 'structs',
    order,
    rows,
    cols: INTS_PER_LINE,
    addr: (r, c) => BASE + (r * INTS_PER_LINE + c) * INT_BYTES,
    visits,
    field: fieldAt,
    code: aos
      ? ['struct P { int x, y, z, w; } p[32];', 'for (i = 0; i < 32; i++)', '  sum += p[i].x;']
      : ['struct { int x[32], y[32], z[32], w[32]; } p;', 'for (i = 0; i < 32; i++)', '  sum += p.x[i];'],
  };
}

export const sceneFor = (layout: LayoutId, order: Order): Scene => (layout === 'structs' ? structScene(order) : arrayScene(layout, order));

export const sceneAddresses = (s: Scene) => s.visits.map(([r, c]) => s.addr(r, c));

export const HONESTY =
  'Toy cache: real L1 data caches are typically 32-48 KB with 8-12 ways on x86 desktops (some, such as Apple performance cores, are bigger), and hardware prefetchers hide much of the column-wise penalty for simple strides. Latencies are illustrative.';
