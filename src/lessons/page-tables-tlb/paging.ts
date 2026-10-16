/**
 * An x86-64-style four-level page walk over a seeded toy memory, in BigInt arithmetic. Entries carry only a present bit and
 * a next-table or frame address (real entries also carry permission, accessed and dirty bits). Counts are memory
 * references; nothing here reads a clock.
 */
import { mulberry32, type Rnd } from '../../core/random';

export type PageSize = 'p4k' | 'p2m' | 'p1g';
export const PAGE_SIZES: readonly PageSize[] = ['p4k', 'p2m', 'p1g'];
export const PAGE_BITS: Record<PageSize, number> = { p4k: 12, p2m: 21, p1g: 30 };
export const PAGE_BYTES: Record<PageSize, bigint> = { p4k: 1n << 12n, p2m: 1n << 21n, p1g: 1n << 30n };
export const PAGE_NAMES: Record<PageSize, string> = { p4k: '4 KiB', p2m: '2 MiB', p1g: '1 GiB' };

export type Level = 4 | 3 | 2 | 1;
export interface LevelInfo {
  level: Level;
  name: string;
  /** Lowest address bit of this level's index. */
  shift: bigint;
  /** Highest address bit of this level's index. */
  top: number;
}
/** PML4 is bits 47-39, PDPT 38-30, PD 29-21, PT 20-12: 9 + 9 + 9 + 9, then a 12-bit offset. */
export const LEVELS: readonly LevelInfo[] = [
  { level: 4, name: 'PML4', shift: 39n, top: 47 },
  { level: 3, name: 'PDPT', shift: 30n, top: 38 },
  { level: 2, name: 'PD', shift: 21n, top: 29 },
  { level: 1, name: 'PT', shift: 12n, top: 20 },
];
export const levelInfo = (level: Level) => LEVELS.find((l) => l.level === level)!;

export const ENTRIES_PER_TABLE = 512;
export const ENTRY_BYTES = 8;
export const TABLE_BYTES = ENTRIES_PER_TABLE * ENTRY_BYTES;
/** The level at which each page size ends the walk. */
export const LEAF_LEVEL: Record<PageSize, Level> = { p4k: 1, p2m: 2, p1g: 3 };
/** Memory references a walk makes to translate one address of each page size (one per level read). */
export const WALK_REFERENCES: Record<PageSize, number> = { p4k: 4, p2m: 3, p1g: 2 };

/** A flat table for a 48-bit space of 4 KiB pages: one entry per page. */
export const FLAT_ENTRIES = 1n << 36n;
export const FLAT_TABLE_BYTES = FLAT_ENTRIES * BigInt(ENTRY_BYTES);

export const MASK_9 = 0x1ffn;
export const indexAt = (va: bigint, shift: bigint) => Number((va >> shift) & MASK_9);
export const offsetOf = (va: bigint, size: PageSize) => va & (PAGE_BYTES[size] - 1n);
export const pageStart = (va: bigint, size: PageSize) => va & ~(PAGE_BYTES[size] - 1n);

export const ADDRESS_MASK = (1n << 64n) - 1n;
const HIGH_BITS = 0x1ffffn;
/** Bits 63-47 must all equal bit 47: 48-bit addresses are sign-extended to 64 bits. */
export const isCanonical = (va: bigint) => {
  const top = (va & ADDRESS_MASK) >> 47n;
  return top === 0n || top === HIGH_BITS;
};
/** The canonical spelling of a 48-bit address: bits 63-48 copy bit 47. */
export const canonicalise = (va48: bigint) => ((va48 >> 47n) & 1n ? va48 | (0xffffn << 48n) : va48);
export const hex = (v: bigint, digits = 0) => `0x${v.toString(16).padStart(digits, '0')}`;

export interface Mapping {
  /** Start of the page (aligned to its size). */
  va: bigint;
  size: PageSize;
  /** Physical address of the page's first byte. */
  phys: bigint;
  /** A cleared entry leaves the tables in place: the walk reaches the entry and finds it not present. */
  present: boolean;
}

export type Entry = { kind: 'table'; table: Table } | { kind: 'page'; size: PageSize; phys: bigint };

export interface Table {
  id: number;
  level: Level;
  /** Physical address of the table's 4 KiB frame. */
  base: bigint;
  entries: Map<number, Entry>;
}

export interface Space {
  root: Table;
  tables: Table[];
  mappings: Mapping[];
}

export const TABLE_REGION = 0x0010_0000n;

export function buildSpace(mappings: readonly Mapping[]): Space {
  const tables: Table[] = [];
  const newTable = (level: Level): Table => {
    const t: Table = { id: tables.length, level, base: TABLE_REGION + BigInt(tables.length) * BigInt(TABLE_BYTES), entries: new Map() };
    tables.push(t);
    return t;
  };
  const root = newTable(4);
  for (const m of mappings) {
    if (!isCanonical(m.va)) throw new RangeError(`mapping at ${hex(m.va)} is not canonical`);
    if (pageStart(m.va, m.size) !== m.va) throw new RangeError(`mapping at ${hex(m.va)} is not aligned to ${PAGE_NAMES[m.size]}`);
    let table = root;
    const leaf = LEAF_LEVEL[m.size];
    for (const l of LEVELS) {
      const index = indexAt(m.va, l.shift);
      if (l.level === leaf) {
        if (table.entries.has(index)) throw new RangeError(`mapping at ${hex(m.va)} overlaps another`);
        if (m.present) table.entries.set(index, { kind: 'page', size: m.size, phys: m.phys });
        break;
      }
      let next = table.entries.get(index);
      if (next?.kind === 'page') throw new RangeError(`mapping at ${hex(m.va)} sits inside a larger page`);
      if (!next) {
        next = { kind: 'table', table: newTable((l.level - 1) as Level) };
        table.entries.set(index, next);
      }
      table = next.table;
    }
  }
  return { root, tables, mappings: [...mappings] };
}

export type EntryState = 'table' | 'page' | 'absent';

export interface WalkStep {
  level: Level;
  name: string;
  /** The table this level reads, and the entry's index in it. */
  table: bigint;
  index: number;
  /** The entry's address: table base + index x 8. */
  entryAddress: bigint;
  state: EntryState;
  /** For a table entry, the next table's base; for a page entry, the frame's physical address. */
  target: bigint | null;
}

export type WalkResult =
  | { ok: true; steps: WalkStep[]; size: PageSize; physical: bigint; frame: bigint; offsetBits: number; memoryRefs: number }
  | { ok: false; reason: 'not-canonical'; steps: []; memoryRefs: 0 }
  | { ok: false; reason: 'not-present'; steps: WalkStep[]; faultLevel: Level; memoryRefs: number };

/** Walk the tables for one 64-bit virtual address. A non-canonical address is refused before any table is read. */
export function walk(space: Space, va: bigint): WalkResult {
  if (!isCanonical(va)) return { ok: false, reason: 'not-canonical', steps: [], memoryRefs: 0 };
  const steps: WalkStep[] = [];
  let table: Table | null = space.root;
  for (const l of LEVELS) {
    if (!table) break;
    const index = indexAt(va, l.shift);
    const entry: Entry | undefined = table.entries.get(index);
    const entryAddress = table.base + BigInt(index * ENTRY_BYTES);
    if (!entry) {
      steps.push({ level: l.level, name: l.name, table: table.base, index, entryAddress, state: 'absent', target: null });
      return { ok: false, reason: 'not-present', steps, faultLevel: l.level, memoryRefs: steps.length };
    }
    if (entry.kind === 'page') {
      steps.push({ level: l.level, name: l.name, table: table.base, index, entryAddress, state: 'page', target: entry.phys });
      const offsetBits = PAGE_BITS[entry.size];
      return { ok: true, steps, size: entry.size, physical: entry.phys + offsetOf(va, entry.size), frame: entry.phys >> 12n, offsetBits, memoryRefs: steps.length };
    }
    steps.push({ level: l.level, name: l.name, table: table.base, index, entryAddress, state: 'table', target: entry.table.base });
    table = entry.table;
  }
  throw new Error('a walk ran off the last level: the tables are malformed');
}

// ---- The seeded toy memory ---------------------------------------------------------------------------------

export const LAYOUT_SEED = 2718;
const PHYS_4K = 0x2000_0000n;
const PHYS_2M = 0x40_0000_0000n;
const PHYS_1G = 0x80_0000_0000n;
const UPPER_HALF = 0xffff_8000_0000_0000n;

/** Random bits as a BigInt (up to 52 at a time is exact in a double; this builds more from 26-bit chunks). */
function randBits(rnd: Rnd, bits: number): bigint {
  let v = 0n;
  for (let done = 0; done < bits; done += 26) {
    const take = Math.min(26, bits - done);
    v = (v << BigInt(take)) | BigInt(Math.floor(rnd() * 2 ** take));
  }
  return v;
}

export interface SampleMapping extends Mapping {
  /** A typical address inside this page, offset included. */
  sample: bigint;
}

/** About a dozen mappings spread across the lower and upper halves of the address space: nine 4 KiB pages, two 2 MiB pages, one 1 GiB page. */
export function defaultMappings(seed = LAYOUT_SEED): SampleMapping[] {
  const rnd = mulberry32(seed);
  const kinds: PageSize[] = ['p4k', 'p4k', 'p4k', 'p4k', 'p4k', 'p4k', 'p4k', 'p4k', 'p4k', 'p2m', 'p2m', 'p1g'];
  const counts: Record<PageSize, bigint> = { p4k: 0n, p2m: 0n, p1g: 0n };
  const base: Record<PageSize, bigint> = { p4k: PHYS_4K, p2m: PHYS_2M, p1g: PHYS_1G };
  return kinds.map((size, i) => {
    const bits = 47 - PAGE_BITS[size];
    const upper = i % 4 === 3;
    const start = (randBits(rnd, bits) << BigInt(PAGE_BITS[size])) | (upper ? UPPER_HALF : 0n);
    const phys = base[size] + counts[size] * PAGE_BYTES[size];
    counts[size] += 1n;
    return { va: start, size, phys, present: true, sample: start | randBits(rnd, PAGE_BITS[size]) };
  });
}

export const DEFAULT_MAPPINGS: readonly SampleMapping[] = defaultMappings();

/** The mapping that covers an address in a list of mappings, found by a plain scan (also the test's flat oracle). */
export const mappingCovering = (mappings: readonly Mapping[], va: bigint) =>
  mappings.find((m) => va >= m.va && va < m.va + PAGE_BYTES[m.size]);

export interface AddressChoice {
  /** Force the covering mapping to this page size (the walk then ends at that level), or null for as mapped. */
  size: PageSize | null;
  /** Clear the covering mapping's entry: the tables stay, the walk finds the entry not present. */
  unmapped: boolean;
}

export const choiceOpening = (): AddressChoice => ({ size: null, unmapped: false });

const OVERRIDE_PHYS: Record<PageSize, bigint> = { p4k: 0x10_0000_0000n, p2m: 0x20_0000_0000n, p1g: 0x30_0000_0000n };

/** The mappings after the learner's choice for the page at `va`; an address nothing maps is left alone. */
export function chosenMappings(base: readonly Mapping[], va: bigint, choice: AddressChoice): Mapping[] {
  const covering = mappingCovering(base, va);
  if (!covering || (choice.size === null && !choice.unmapped)) return [...base];
  const size = choice.size ?? covering.size;
  const start = pageStart(va, size);
  const end = start + PAGE_BYTES[size];
  const kept = base.filter((m) => m !== covering && (m.va + PAGE_BYTES[m.size] <= start || m.va >= end));
  return [...kept, { va: start, size, phys: OVERRIDE_PHYS[size], present: !choice.unmapped }];
}

/** The walk scene as it opens: the first 4 KiB page's sample address, mapped as it is. */
export const walkOpening = (): { address: bigint; choice: AddressChoice } => ({
  address: DEFAULT_MAPPINGS.find((m) => m.size === 'p4k')!.sample,
  choice: choiceOpening(),
});

export const spaceFor =(va: bigint, choice: AddressChoice): Space => buildSpace(chosenMappings(DEFAULT_MAPPINGS, va, choice));
