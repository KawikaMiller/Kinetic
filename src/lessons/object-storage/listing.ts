/**
 * Listing a flat key space by prefix and delimiter, as S3-compatible stores do: keys are
 * sorted, a delimiter after the prefix folds everything below it into one "common prefix",
 * and a page holds at most maxKeys entries (keys and common prefixes together).
 */

export interface ListOptions {
  prefix: string;
  /** Fold keys at the first occurrence of this after the prefix, or null for a flat listing. */
  delimiter: string | null;
  maxKeys: number;
  /** Where the previous page stopped; null for the first page. */
  after: Entry | null;
}

export interface Entry {
  kind: 'key' | 'prefix';
  name: string;
}

export interface ListPage {
  entries: Entry[];
  truncated: boolean;
  /** Pass it as `after` to get the next page. */
  next: Entry | null;
}

/** The entry a key shows up as under this prefix and delimiter. */
export function entryOf(key: string, prefix: string, delimiter: string | null): Entry {
  const rest = key.slice(prefix.length);
  const at = delimiter ? rest.indexOf(delimiter) : -1;
  return at < 0 ? { kind: 'key', name: key } : { kind: 'prefix', name: prefix + rest.slice(0, at + (delimiter as string).length) };
}

/** Keys compare as plain code units: for the ASCII keys here that is the byte order stores sort by. */
const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function listObjects(keys: readonly string[], o: ListOptions): ListPage {
  if (o.maxKeys < 1) throw new RangeError('maxKeys must be at least 1');
  if (o.delimiter === '') throw new RangeError('a delimiter cannot be empty');
  const entries: Entry[] = [];
  let truncated = false;
  for (const key of [...keys].sort(byCodeUnits)) {
    if (!key.startsWith(o.prefix)) continue;
    if (o.after) {
      // Everything up to the previous page's last entry is behind us; a common prefix swallows all the keys below it.
      if (o.after.kind === 'key' ? key <= o.after.name : key < o.after.name || key.startsWith(o.after.name)) continue;
    }
    const entry = entryOf(key, o.prefix, o.delimiter);
    const last = entries.at(-1);
    if (last && last.kind === 'prefix' && entry.kind === 'prefix' && last.name === entry.name) continue;
    if (entries.length === o.maxKeys) {
      truncated = true;
      break;
    }
    entries.push(entry);
  }
  return { entries, truncated, next: truncated ? (entries.at(-1) ?? null) : null };
}

/** Every page of a listing, following the continuation each time. */
export function listAll(keys: readonly string[], prefix: string, delimiter: string | null, maxKeys: number): ListPage[] {
  const pages: ListPage[] = [];
  let after: Entry | null = null;
  do {
    const page = listObjects(keys, { prefix, delimiter, maxKeys, after });
    pages.push(page);
    after = page.next;
  } while (after);
  return pages;
}

/** The keys of the listing explorer: ordinary names, plus a few that put the delimiter twice or more, or end in it. */
export const DEMO_KEYS: string[] = [
  'logs/2026/09/app.log',
  'logs/2026/10/app.log',
  'logs/2026/10/error.log',
  'readme.txt',
  'reports/2025/q4.csv',
  'reports/2026/q1.csv',
  'reports/2026/q2.csv',
  'reports/2026/q3.csv',
  'reports/2026/q3.csv.bak',
  'reports/index.html',
  'reports/',
  'reports-draft/q4.csv',
  'images/logo.png',
  'images/icons/a.png',
  'images/icons/b.png',
];

export const MAX_PREFIX_CHARS = 60;

/** The request line for a listing page (fictional host). */
export function listRequest(prefix: string, delimiter: string | null, maxKeys: number, after: Entry | null): string {
  const q = [`list-type=2`, `prefix=${encodeURIComponent(prefix)}`, ...(delimiter ? [`delimiter=${encodeURIComponent(delimiter)}`] : []), `max-keys=${maxKeys}`];
  if (after) q.push(`start-after=${encodeURIComponent(after.name)}`);
  return `GET /?${q.join('&')} HTTP/1.1`;
}
