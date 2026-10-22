/**
 * The k-anonymity scene's model: a synthetic table of 48 invented people, generalisation of the quasi-identifiers
 * (ZIP prefix, birth year), suppression of rows, and the readouts computed from the groups they leave: k, unique
 * rows, an information-loss score, l-diversity and a linkage count against an invented public list.
 * Every person, ZIP, year and condition is made up; nothing describes a real population.
 */
import { mulberry32, pick, randInt } from '../../core/random';

export type Sex = 'F' | 'M';
export type Condition = 'A' | 'B' | 'C';

export interface Person {
  id: number;
  zip: string;
  year: number;
  sex: Sex;
  condition: Condition;
}

export interface PublicPerson {
  name: string;
  zip: string;
  year: number;
  sex: Sex;
}

export type ZipLevel = 5 | 3 | 0;
export type AgeLevel = 'exact' | 'decade' | 'range';

export const ZIP_LEVELS: readonly ZipLevel[] = [5, 3, 0];
export const AGE_LEVELS: readonly AgeLevel[] = ['exact', 'decade', 'range'];

export const TABLE_SIZE = 48;
/** The public list holds the table's people and this many more. */
export const PUBLIC_EXTRA = 24;
export const TABLE_SEED = 218;

/** Synthetic ZIP codes: three invented areas (prefixes 410, 551, 733) with a few codes each. */
export const ZIPS: readonly string[] = ['41021', '41078', '41093', '55102', '55147', '55180', '73301', '73322'];
export const YEAR_RANGE = { first: 1950, last: 1999 } as const;
/** The range level: two bands of 25 years. */
const RANGE_YEARS = 25;
/** The chance that a person's condition follows their area, so that some groups share one value. */
const AREA_BIAS = 0.8;
const CONDITIONS: readonly Condition[] = ['A', 'B', 'C'];

const FIRST_NAMES = ['Ada', 'Bo', 'Cy', 'Di', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lee', 'Mia', 'Ned', 'Oz', 'Pia', 'Quin', 'Rae', 'Sol', 'Tay', 'Uma', 'Vic', 'Wes', 'Xan'];

/** The area (the ZIP prefix's index) decides the likely condition. */
const areaOf = (zip: string): number => ['410', '551', '733'].indexOf(zip.slice(0, 3));

export function makeTable(seed: number = TABLE_SEED, size: number = TABLE_SIZE): Person[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: size }, (_, id) => {
    const zip = pick(ZIPS, rnd);
    const likely = CONDITIONS[areaOf(zip)];
    return {
      id,
      zip,
      year: randInt(YEAR_RANGE.first, YEAR_RANGE.last, rnd),
      sex: rnd() < 0.5 ? 'F' : 'M',
      condition: rnd() < AREA_BIAS ? likely : pick(CONDITIONS, rnd),
    };
  });
}

/** The invented public list: every person in the table with a name, plus PUBLIC_EXTRA more. */
export function makePublicList(table: readonly Person[], seed: number = TABLE_SEED): PublicPerson[] {
  const rnd = mulberry32(seed + 1);
  const named = (i: number, p: Omit<PublicPerson, 'name'>): PublicPerson => ({ name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${String.fromCharCode(65 + Math.floor(i / FIRST_NAMES.length))}.`, ...p });
  const own = table.map((p, i) => named(i, { zip: p.zip, year: p.year, sex: p.sex }));
  const extra = Array.from({ length: PUBLIC_EXTRA }, (_, k) => named(table.length + k, { zip: pick(ZIPS, rnd), year: randInt(YEAR_RANGE.first, YEAR_RANGE.last, rnd), sex: rnd() < 0.5 ? 'F' : 'M' }));
  return [...own, ...extra];
}

export function generaliseZip(zip: string, level: ZipLevel): string {
  return level === 5 ? zip : level === 3 ? `${zip.slice(0, 3)}**` : '*****';
}

export function generaliseYear(year: number, level: AgeLevel): string {
  if (level === 'exact') return String(year);
  if (level === 'decade') return `${Math.floor(year / 10) * 10}s`;
  const lo = YEAR_RANGE.first + Math.floor((year - YEAR_RANGE.first) / RANGE_YEARS) * RANGE_YEARS;
  return `${lo}-${lo + RANGE_YEARS - 1}`;
}

export interface Generalisation {
  zip: ZipLevel;
  age: AgeLevel;
}

/** The quasi-identifier key a row falls under: rows with the same key are indistinguishable. */
export const keyOf = (p: { zip: string; year: number; sex: Sex }, g: Generalisation): string => `${generaliseZip(p.zip, g.zip)}|${generaliseYear(p.year, g.age)}|${p.sex}`;

export interface Group {
  key: string;
  members: Person[];
}

/** The equivalence classes of the rows that are not suppressed, in order of first appearance. */
export function groupsOf(table: readonly Person[], g: Generalisation, suppressed: ReadonlySet<number>): Group[] {
  const map = new Map<string, Person[]>();
  for (const p of table) {
    if (suppressed.has(p.id)) continue;
    const key = keyOf(p, g);
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return [...map].map(([key, members]) => ({ key, members }));
}

export interface Readouts {
  /** Smallest group among the rows kept, or null when every row is suppressed. */
  k: number | null;
  /** Rows alone in their group. */
  unique: number;
  /** Fewest distinct sensitive values in any group, or null when there are no groups. */
  l: number | null;
  groups: number;
  kept: number;
}

export function readouts(table: readonly Person[], g: Generalisation, suppressed: ReadonlySet<number>): Readouts {
  const groups = groupsOf(table, g, suppressed);
  const sizes = groups.map((x) => x.members.length);
  return {
    k: groups.length ? Math.min(...sizes) : null,
    unique: sizes.filter((s) => s === 1).length,
    l: groups.length ? Math.min(...groups.map((x) => new Set(x.members.map((m) => m.condition)).size)) : null,
    groups: groups.length,
    kept: sizes.reduce((a, b) => a + b, 0),
  };
}

const ZIP_LOSS: Record<ZipLevel, number> = { 5: 0, 3: 0.5, 0: 1 };
const AGE_LOSS: Record<AgeLevel, number> = { exact: 0, decade: 0.5, range: 1 };

/**
 * A simple information-loss score from 0 to 1: the average of the two generalisation losses for the rows that
 * are kept, with each suppressed row counting as total loss.
 */
export function infoLoss(g: Generalisation, suppressedCount: number, size: number = TABLE_SIZE): number {
  const share = suppressedCount / size;
  return ((ZIP_LOSS[g.zip] + AGE_LOSS[g.age]) / 2) * (1 - share) + share;
}

/** Rows that a join on (ZIP, birth year, sex) with the public list ties to exactly one named person, at a generalisation. */
export function linkedRows(table: readonly Person[], list: readonly PublicPerson[], g: Generalisation, suppressed: ReadonlySet<number>): Person[] {
  const publicCount = new Map<string, number>();
  for (const p of list) publicCount.set(keyOf(p, g), (publicCount.get(keyOf(p, g)) ?? 0) + 1);
  return table.filter((p) => !suppressed.has(p.id) && publicCount.get(keyOf(p, g)) === 1);
}

export const EXACT: Generalisation = { zip: 5, age: 'exact' };

/** Rows suppressed by a threshold: every row in a group smaller than `below` (1 suppresses nothing). */
export function suppressedBelow(table: readonly Person[], g: Generalisation, below: number): Set<number> {
  return new Set(groupsOf(table, g, new Set()).filter((x) => x.members.length < below).flatMap((x) => x.members.map((m) => m.id)));
}

export interface View {
  generalisation: Generalisation;
  suppressed: Set<number>;
  groups: Group[];
  readouts: Readouts;
  loss: number;
  /** Rows tied to exactly one named person with nothing generalised, and at this generalisation. */
  linkedExact: number;
  linkedNow: number;
  /** The largest group whose members all share one sensitive value (at least two people), or null. */
  leak: Group | null;
}

/** Everything the scene shows for one setting of the controls. */
export function viewOf(table: readonly Person[], list: readonly PublicPerson[], generalisation: Generalisation, below: number): View {
  const suppressed = suppressedBelow(table, generalisation, below);
  const groups = groupsOf(table, generalisation, suppressed);
  const leaks = groups.filter((x) => x.members.length >= 2 && new Set(x.members.map((m) => m.condition)).size === 1).sort((a, b) => b.members.length - a.members.length);
  return {
    generalisation,
    suppressed,
    groups,
    readouts: readouts(table, generalisation, suppressed),
    loss: infoLoss(generalisation, suppressed.size, table.length),
    linkedExact: linkedRows(table, list, EXACT, new Set()).length,
    linkedNow: linkedRows(table, list, generalisation, suppressed).length,
    leak: leaks[0] ?? null,
  };
}
