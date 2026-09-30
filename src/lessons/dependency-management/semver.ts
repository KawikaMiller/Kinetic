/**
 * A small semantic-versioning matcher with npm's range semantics (node-semver, default
 * options: no loose parsing, pre-releases excluded unless the range opts in).
 *
 * Supported: exact versions, `=` `>` `>=` `<` `<=`, caret `^`, tilde `~` / `~>`, X-ranges
 * (`1.x`, `1.2.*`, `1`, `*`, `""`), hyphen ranges (`1.2.3 - 2.3.4`), whitespace-joined AND
 * and `||` OR. Build metadata (`+build`) is ignored for matching, as the spec says.
 */

export type PreId = string | number;

export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: PreId[];
}

export type Op = '=' | '>' | '>=' | '<' | '<=';

/** One comparator. `any` matches every release (from `*`, `x`, `>=0.0.0`-style ranges). */
export type Comparator = { any: true } | { any?: false; op: Op; v: Version };

/** A parsed range: OR of ANDed comparator sets. */
export type Range = Comparator[][];

const NUM = '0|[1-9]\\d*';
const PRE_ID = `(?:${NUM}|\\d*[a-zA-Z-][0-9a-zA-Z-]*)`;
const PRE = `(?:-(${PRE_ID}(?:\\.${PRE_ID})*))?`;
const BUILD = '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?';
const FULL = new RegExp(`^[v=]?(${NUM})\\.(${NUM})\\.(${NUM})${PRE}${BUILD}$`);
const XPART = `(${NUM}|[xX*])`;
const PARTIAL = new RegExp(`^[v=]?${XPART}(?:\\.${XPART}(?:\\.${XPART}${PRE}${BUILD})?)?$`);

function parsePre(s: string | undefined): PreId[] {
  if (!s) return [];
  return s.split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id));
}

/** Parse a full version like `1.4.2`, `v2.0.0-rc.1` or `1.0.0+build.5`; null if invalid. */
export function parseVersion(s: string): Version | null {
  const m = FULL.exec(s.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: parsePre(m[4]) };
}

export function formatVersion(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}${v.pre.length ? `-${v.pre.join('.')}` : ''}`;
}

function comparePre(a: PreId[], b: PreId[]): number {
  // A release (no pre-release) ranks above any pre-release of the same version.
  if (!a.length || !b.length) return a.length === b.length ? 0 : a.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    if (typeof x === 'number') return -1; // numeric identifiers rank below alphanumeric ones
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** Semver 2.0 precedence: negative if a < b, 0 if equal, positive if a > b. */
export function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || comparePre(a.pre, b.pre);
}

const v = (major: number, minor: number, patch: number, pre: PreId[] = []): Version => ({ major, minor, patch, pre });
/** The lowest pre-release of a version: `<2.0.0-0` excludes 2.0.0 and every 2.0.0-* too. */
const floor = (major: number, minor: number, patch: number) => v(major, minor, patch, [0]);

const ANY: Comparator = { any: true };
const NOTHING: Comparator = { op: '<', v: floor(0, 0, 0) };
const cmp = (op: Op, ver: Version): Comparator => ({ op, v: ver });

interface Partial {
  major: number | null;
  minor: number | null;
  patch: number | null;
  pre: PreId[];
}

function parsePartial(s: string): Partial | null {
  const m = PARTIAL.exec(s);
  if (!m) return null;
  const num = (x: string | undefined) => (x === undefined || /^[xX*]$/.test(x) ? null : Number(x));
  const major = num(m[1]);
  const minor = major === null ? null : num(m[2]);
  const patch = minor === null ? null : num(m[3]);
  return { major, minor, patch, pre: patch === null ? [] : parsePre(m[4]) };
}

function full(p: Partial): Version {
  return v(p.major!, p.minor!, p.patch!, p.pre);
}

function caret(p: Partial): Comparator[] {
  const { major: M, minor: m, patch: pt } = p;
  if (M === null) return [ANY];
  if (m === null) return [cmp('>=', v(M, 0, 0)), cmp('<', floor(M + 1, 0, 0))];
  if (pt === null) {
    return M === 0 ? [cmp('>=', v(0, m, 0)), cmp('<', floor(0, m + 1, 0))] : [cmp('>=', v(M, m, 0)), cmp('<', floor(M + 1, 0, 0))];
  }
  const lo = cmp('>=', full(p));
  if (M > 0) return [lo, cmp('<', floor(M + 1, 0, 0))];
  if (m > 0) return [lo, cmp('<', floor(0, m + 1, 0))];
  return [lo, cmp('<', floor(0, 0, pt + 1))];
}

function tilde(p: Partial): Comparator[] {
  const { major: M, minor: m, patch: pt } = p;
  if (M === null) return [ANY];
  if (m === null) return [cmp('>=', v(M, 0, 0)), cmp('<', floor(M + 1, 0, 0))];
  if (pt === null) return [cmp('>=', v(M, m, 0)), cmp('<', floor(M, m + 1, 0))];
  return [cmp('>=', full(p)), cmp('<', floor(M, m + 1, 0))];
}

/** Desugar one operator + partial version (X-ranges included) into plain comparators. */
function primitive(op: '' | Op, p: Partial): Comparator[] {
  const { major: M, minor: m, patch: pt } = p;
  if (pt !== null) return [cmp(op === '' ? '=' : op, full(p))];
  switch (op) {
    case '':
    case '=':
      if (M === null) return [ANY];
      return m === null
        ? [cmp('>=', v(M, 0, 0)), cmp('<', floor(M + 1, 0, 0))]
        : [cmp('>=', v(M, m, 0)), cmp('<', floor(M, m + 1, 0))];
    case '>':
      if (M === null) return [NOTHING];
      return [cmp('>=', m === null ? v(M + 1, 0, 0) : v(M, m + 1, 0))];
    case '>=':
      if (M === null) return [ANY];
      return [cmp('>=', v(M, m ?? 0, 0))];
    case '<':
      if (M === null) return [NOTHING];
      return [cmp('<', m === null ? floor(M, 0, 0) : floor(M, m, 0))];
    case '<=':
      if (M === null) return [ANY];
      return [cmp('<', m === null ? floor(M + 1, 0, 0) : floor(M, m + 1, 0))];
  }
}

function hyphen(a: Partial, b: Partial): Comparator[] {
  const lower: Comparator = a.major === null ? ANY : cmp('>=', v(a.major, a.minor ?? 0, a.patch ?? 0, a.patch === null ? [] : a.pre));
  let upper: Comparator;
  if (b.major === null) upper = ANY;
  else if (b.minor === null) upper = cmp('<', floor(b.major + 1, 0, 0));
  else if (b.patch === null) upper = cmp('<', floor(b.major, b.minor + 1, 0));
  else upper = cmp('<=', full(b));
  return [lower, upper];
}

const TOKEN = /^(\^|~>?|>=|<=|>|<|=)?(.*)$/;

function parseSet(raw: string): Comparator[] | null {
  // "> 1.0.0" and "~ 1.0" are allowed: glue the operator to its version.
  const s = raw.trim().replace(/(\^|~>?|>=|<=|>|<|=)\s+/g, '$1');
  if (s === '') return [ANY];
  const hy = /^(\S+)\s+-\s+(\S+)$/.exec(s);
  if (hy) {
    const a = parsePartial(hy[1]);
    const b = parsePartial(hy[2]);
    return a && b ? hyphen(a, b) : null;
  }
  const out: Comparator[] = [];
  for (const token of s.split(/\s+/)) {
    const [, op = '', rest] = TOKEN.exec(token)!;
    const p = parsePartial(rest);
    if (!p) return null;
    if (op === '^') out.push(...caret(p));
    else if (op === '~' || op === '~>') out.push(...tilde(p));
    else out.push(...primitive(op as '' | Op, p));
  }
  return out;
}

/** Parse an npm range; null if any part is invalid (then nothing satisfies it). */
export function parseRange(range: string): Range | null {
  const sets = range.split('||').map(parseSet);
  return sets.some((s) => s === null) ? null : (sets as Comparator[][]);
}

function test(c: Comparator, ver: Version): boolean {
  if (c.any) return true;
  const d = compare(ver, c.v);
  switch (c.op) {
    case '=':
      return d === 0;
    case '>':
      return d > 0;
    case '>=':
      return d >= 0;
    case '<':
      return d < 0;
    case '<=':
      return d <= 0;
  }
}

/**
 * A pre-release only matches if some comparator in the same set names a pre-release of
 * the same major.minor.patch: `^1.2.3-beta.1` accepts 1.2.3-beta.2 but not 1.3.0-beta.1.
 * (The `-0` upper bounds this file generates never qualify: their tuple is the next line.)
 */
function preReleaseAllowed(set: Comparator[], ver: Version): boolean {
  if (!ver.pre.length) return true;
  return set.some(
    (c) => !c.any && c.v.pre.length > 0 && c.v.major === ver.major && c.v.minor === ver.minor && c.v.patch === ver.patch,
  );
}

export function satisfiesParsed(ver: Version, range: Range): boolean {
  return range.some((set) => set.every((c) => test(c, ver)) && preReleaseAllowed(set, ver));
}

/** Does `version` satisfy `range`? Invalid versions or ranges never match. */
export function satisfies(version: string, range: string): boolean {
  const ver = parseVersion(version);
  const r = parseRange(range);
  return !!ver && !!r && satisfiesParsed(ver, r);
}

/**
 * Why a version does or doesn't match: `match`, `outside` the bounds, or `prerelease`:
 * inside the bounds but excluded because the range doesn't opt in to that pre-release.
 */
export function explainMatch(version: string, range: string): 'match' | 'outside' | 'prerelease' | 'invalid' {
  const ver = parseVersion(version);
  const r = parseRange(range);
  if (!ver || !r) return 'invalid';
  if (satisfiesParsed(ver, r)) return 'match';
  return r.some((set) => set.every((c) => test(c, ver))) ? 'prerelease' : 'outside';
}

/** The highest listed version that satisfies the range, or null. */
export function maxSatisfying(versions: readonly string[], range: string): string | null {
  const r = parseRange(range);
  if (!r) return null;
  let best: { s: string; v: Version } | null = null;
  for (const s of versions) {
    const ver = parseVersion(s);
    if (ver && satisfiesParsed(ver, r) && (!best || compare(ver, best.v) > 0)) best = { s, v: ver };
  }
  return best?.s ?? null;
}

function comparatorText(c: Comparator): string {
  return c.any ? '*' : `${c.op === '=' ? '' : c.op}${formatVersion(c.v)}`;
}

/** What a range really means, e.g. `^1.4.2` → `>=1.4.2 <2.0.0-0`. */
export function explainRange(range: string): string | null {
  const r = parseRange(range);
  if (!r) return null;
  return r.map((set) => (set.every((c) => c.any) ? '*' : set.filter((c) => !c.any).map(comparatorText).join(' '))).join(' || ');
}
