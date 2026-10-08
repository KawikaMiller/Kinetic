/**
 * null-option-adts: the pure model. The null chain is evaluated here link by link, and the
 * tests run the very same source lines as real JavaScript to prove the two agree. The
 * narrowing checker is a small model of TypeScript's for these snippets only; the tests pin
 * every verdict to the real compiler. Rust messages follow rustc's wording rules (fixed).
 */

// ── Scene 1 · the null chain ───────────────────────────────────────

export type Link = 'user' | 'address' | 'city';
export const LINKS: Link[] = ['user', 'address', 'city'];

/** Which links are null. The first null one decides what happens. */
export type Nulls = Record<Link, boolean>;
export const NO_NULLS: Nulls = { user: false, address: false, city: false };

export type FixMode = 'plain' | 'ladder' | 'optional' | 'optionalDefault' | 'option';

export const FIX_MODES: { value: FixMode; label: string }[] = [
  { value: 'plain', label: 'plain dots' },
  { value: 'ladder', label: 'if ladder' },
  { value: 'optional', label: '?. only' },
  { value: 'optionalDefault', label: '?. with ??' },
  { value: 'option', label: 'Option' },
];

export const CITY = 'paris';
export const FALLBACK = 'unknown';

/** The fixed program for each mode. `user` is defined above it; the last line prints. */
export const FIX_CODE: Record<FixMode, string[]> = {
  plain: ['const city = user.address.city.toUpperCase();', 'console.log(`Ship to ${city}`);'],
  ladder: [
    `let city = "${FALLBACK}";`,
    'if (user !== null) {',
    '  if (user.address !== null) {',
    '    if (user.address.city !== null) {',
    '      city = user.address.city.toUpperCase();',
    '    }',
    '  }',
    '}',
    'console.log(`Ship to ${city}`);',
  ],
  optional: ['const city = user?.address?.city?.toUpperCase();', 'console.log(`Ship to ${city}`);'],
  optionalDefault: [`const city = user?.address?.city?.toUpperCase() ?? "${FALLBACK}";`, 'console.log(`Ship to ${city}`);'],
  option: [
    'const city = Option.of(user)',
    '  .map((u) => u.address)',
    '  .map((a) => a.city)',
    '  .map((c) => c.toUpperCase())',
    `  .unwrapOr("${FALLBACK}");`,
    'console.log(`Ship to ${city}`);',
  ],
};

/** The data line that goes above the program for a choice of nulls. */
export function userSource(n: Nulls): string {
  if (n.user) return 'const user = null;';
  if (n.address) return 'const user = { address: null };';
  if (n.city) return 'const user = { address: { city: null } };';
  return `const user = { address: { city: "${CITY}" } };`;
}

/** The first link that is null, or null when the whole chain is present. */
export const firstNull = (n: Nulls): Link | null => LINKS.find((l) => n[l]) ?? null;

/** The property read off each link (what V8 names in its message). */
const READ_OFF: Record<Link, string> = { user: 'address', address: 'city', city: 'toUpperCase' };

/** V8's message for reading a property of null (Chrome, Node, Edge). */
export const v8NullRead = (prop: string) => `TypeError: Cannot read properties of null (reading '${prop}')`;

export type StepState = 'present' | 'null' | 'skipped';

export interface ChainOutcome {
  /** What each link (and the final call) was: read and present, null, or never reached. */
  links: Record<Link | 'call', StepState>;
  /** The thrown error, if the program crashed. */
  error: string | null;
  /** What the program printed. */
  printed: string | null;
  /** The value of `city` before printing ("PARIS", "unknown" or undefined). */
  city: string | undefined;
}

/** Evaluate one mode on one choice of nulls, link by link (the tests compare it with real JavaScript). */
export function evaluate(mode: FixMode, n: Nulls): ChainOutcome {
  const at = firstNull(n);
  const links = {} as ChainOutcome['links'];
  let reached = true;
  for (const l of LINKS) {
    links[l] = !reached ? 'skipped' : n[l] ? 'null' : 'present';
    if (n[l]) reached = false;
  }
  links.call = at === null ? 'present' : 'skipped';
  if (at === null) return { links, error: null, printed: `Ship to ${CITY.toUpperCase()}`, city: CITY.toUpperCase() };
  if (mode === 'plain') return { links, error: v8NullRead(READ_OFF[at]), printed: null, city: undefined };
  if (mode === 'optional') return { links, error: null, printed: 'Ship to undefined', city: undefined };
  return { links, error: null, printed: `Ship to ${FALLBACK}`, city: FALLBACK };
}

/** Every combination of the three toggles, in a fixed order. */
export const ALL_NULLS: Nulls[] = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => ({ user: !!(m & 4), address: !!(m & 2), city: !!(m & 1) }));

/** A tiny Option: of() turns null/undefined into None; map's null result is None too, like Java's Optional.map. */
export class Option<T> {
  private readonly value: T | null;
  private constructor(value: T | null) {
    this.value = value;
  }
  static of<T>(v: T | null | undefined): Option<T> {
    return new Option(v ?? null);
  }
  get isSome(): boolean {
    return this.value !== null;
  }
  map<U>(f: (v: T) => U | null | undefined): Option<U> {
    return this.value === null ? new Option<U>(null) : Option.of(f(this.value));
  }
  unwrapOr(fallback: T): T {
    return this.value === null ? fallback : this.value;
  }
}

// ── Scene 2 · narrowing under strictNullChecks ─────────────────────

export type Member = 'string' | 'null' | 'undefined';
export type ParamType = 'sn' | 'su' | 'snu' | 's';
export type Guard = 'none' | 'notNull' | 'notUndefined' | 'looseNull' | 'truthy' | 'assert';

export const PARAM_TYPES: { value: ParamType; label: string; members: Member[] }[] = [
  { value: 'sn', label: 'string | null', members: ['string', 'null'] },
  { value: 'su', label: 'string | undefined', members: ['string', 'undefined'] },
  { value: 'snu', label: 'string | null | undefined', members: ['string', 'null', 'undefined'] },
  { value: 's', label: 'string', members: ['string'] },
];

export const GUARDS: { value: Guard; label: string; code: string | null }[] = [
  { value: 'none', label: 'no guard', code: null },
  { value: 'notNull', label: 'x !== null', code: 'if (x !== null) {' },
  { value: 'notUndefined', label: 'x !== undefined', code: 'if (x !== undefined) {' },
  { value: 'looseNull', label: 'x != null', code: 'if (x != null) {' },
  { value: 'truthy', label: 'if (x)', code: 'if (x) {' },
  { value: 'assert', label: 'x! (assertion)', code: null },
];

/** What each guard rules out inside its block. `assert` rules nothing out; it just silences the checker. */
const REMOVES: Record<Guard, Member[]> = {
  none: [],
  notNull: ['null'],
  notUndefined: ['undefined'],
  looseNull: ['null', 'undefined'],
  truthy: ['null', 'undefined'],
  assert: [],
};

export const members = (p: ParamType) => PARAM_TYPES.find((t) => t.value === p)!.members;

/** The type of x where x.length is read. */
export const narrowed = (p: ParamType, g: Guard): Member[] => members(p).filter((m) => !REMOVES[g].includes(m));

export interface NarrowVerdict {
  ok: boolean;
  /** tsc's message, when it rejects x.length. */
  message: string | null;
  /** For the assertion: it compiles, but a real null still crashes. */
  unchecked: boolean;
}

export function checkLength(p: ParamType, g: Guard): NarrowVerdict {
  const left = narrowed(p, g);
  const unchecked = g === 'assert' && left.some((m) => m !== 'string');
  if (g === 'assert') return { ok: true, message: null, unchecked };
  const hasNull = left.includes('null');
  const hasUndef = left.includes('undefined');
  if (hasNull && hasUndef) return { ok: false, message: "error TS18049: 'x' is possibly 'null' or 'undefined'.", unchecked: false };
  if (hasNull) return { ok: false, message: "error TS18047: 'x' is possibly 'null'.", unchecked: false };
  if (hasUndef) return { ok: false, message: "error TS18048: 'x' is possibly 'undefined'.", unchecked: false };
  return { ok: true, message: null, unchecked: false };
}

/** The fixed snippet for a parameter type and guard. Returns the lines and the x.length line. */
export function narrowSource(p: ParamType, g: Guard): { lines: string[]; useLine: number } {
  const label = PARAM_TYPES.find((t) => t.value === p)!.label;
  const head = `function len(x: ${label}): number {`;
  const guard = GUARDS.find((x) => x.value === g)!;
  if (g === 'none') return { lines: [head, '  return x.length;', '}'], useLine: 1 };
  if (g === 'assert') return { lines: [head, '  return x!.length;', '}'], useLine: 1 };
  return { lines: [head, `  ${guard.code}`, '    return x.length;', '  }', '  return 0;', '}'], useLine: 2 };
}

/**
 * What `len(arg)` does at run time with the assertion, for each value the declared type still allows
 * (real JavaScript, asserted in the tests): null reads fail with V8's "of null", undefined with "of undefined".
 */
export const assertCrashes = (p: ParamType) => members(p).filter((m) => m !== 'string').map((m) => ({ arg: m, message: `TypeError: Cannot read properties of ${m} (reading 'length')` }));

// ── Scene 3 · sum types and exhaustive matching ────────────────────

export type PresetId = 'fetch' | 'payment';
export type MatchLang = 'rust' | 'ts';

export interface Variant {
  /** Rust variant name / TS interface name. */
  name: string;
  /** TS discriminant. */
  kind: string;
  /** Rust payload type and TS field, if the variant carries data. */
  payload: { rust: string; field: string; ts: string } | null;
  /** The arm's result, in Rust and in TypeScript. */
  arm: { rust: string; ts: string };
  /** A sample value and what rendering it prints. */
  sample: { label: string; ts: string; prints: string };
  /** Shape of its slot in the sorter. */
  shape: 'circle' | 'square' | 'triangle';
}

export interface Preset {
  id: PresetId;
  label: string;
  /** Rust enum / TS union name. */
  type: string;
  variants: [Variant, Variant, Variant];
  /** Field names for the boolean-flags version: [is-first, data-ish, error-ish]. */
  flags: [string, string, string];
}

export const PRESETS: Preset[] = [
  {
    id: 'fetch',
    label: 'Loading | Loaded | Failed',
    type: 'State',
    flags: ['isLoading', 'data', 'error'],
    variants: [
      {
        name: 'Loading', kind: 'loading', payload: null, shape: 'circle',
        arm: { rust: '"spinner".into()', ts: "'spinner'" },
        sample: { label: 'Loading', ts: "{ kind: 'loading' }", prints: 'spinner' },
      },
      {
        name: 'Loaded', kind: 'loaded', payload: { rust: 'Vec<String>', field: 'data', ts: 'string[]' }, shape: 'square',
        arm: { rust: 'format!("show {} rows", data.len())', ts: '`show ${s.data.length} rows`' },
        sample: { label: 'Loaded([3 rows])', ts: "{ kind: 'loaded', data: ['a', 'b', 'c'] }", prints: 'show 3 rows' },
      },
      {
        name: 'Failed', kind: 'failed', payload: { rust: 'String', field: 'error', ts: 'string' }, shape: 'triangle',
        arm: { rust: 'format!("retry: {error}")', ts: '`retry: ${s.error}`' },
        sample: { label: 'Failed("timeout")', ts: "{ kind: 'failed', error: 'timeout' }", prints: 'retry: timeout' },
      },
    ],
  },
  {
    id: 'payment',
    label: 'Pending | Paid | Declined',
    type: 'Payment',
    flags: ['isPending', 'receipt', 'reason'],
    variants: [
      {
        name: 'Pending', kind: 'pending', payload: null, shape: 'circle',
        arm: { rust: '"waiting for the bank".into()', ts: "'waiting for the bank'" },
        sample: { label: 'Pending', ts: "{ kind: 'pending' }", prints: 'waiting for the bank' },
      },
      {
        name: 'Paid', kind: 'paid', payload: { rust: 'u32', field: 'receipt', ts: 'number' }, shape: 'square',
        arm: { rust: 'format!("receipt #{receipt}")', ts: '`receipt #${s.receipt}`' },
        sample: { label: 'Paid(42)', ts: "{ kind: 'paid', receipt: 42 }", prints: 'receipt #42' },
      },
      {
        name: 'Declined', kind: 'declined', payload: { rust: 'String', field: 'reason', ts: 'string' }, shape: 'triangle',
        arm: { rust: 'format!("declined: {reason}")', ts: '`declined: ${s.reason}`' },
        sample: { label: 'Declined("card expired")', ts: "{ kind: 'declined', reason: 'card expired' }", prints: 'declined: card expired' },
      },
    ],
  },
];

export const preset = (id: PresetId) => PRESETS.find((p) => p.id === id)!;

/** Which arms are written, by variant index. */
export type Arms = [boolean, boolean, boolean];

export const missingVariants = (p: Preset, arms: Arms) => p.variants.filter((_, i) => !arms[i]);

/** rustc's pattern for a variant: `State::Loaded(_)`. */
export const rustPattern = (p: Preset, v: Variant) => `${p.type}::${v.name}${v.payload ? '(_)' : ''}`;

/** rustc's list of uncovered patterns: `A`, `A` and `B`, `A`, `B` and `C`, then "and N more". */
export function joinedPatterns(pats: string[]): string {
  const q = (s: string) => `\`${s}\``;
  if (pats.length === 1) return q(pats[0]);
  if (pats.length <= 3) return `${pats.slice(0, -1).map(q).join(', ')} and ${q(pats.at(-1)!)}`;
  return `${pats.slice(0, 3).map(q).join(', ')} and ${pats.length - 3} more`;
}

export interface MatchVerdict {
  /** Compiles? */
  ok: boolean;
  /** The compiler's error or warning, fixed (Rust) or real (TypeScript), or null. */
  message: string | null;
  /** A warning rather than an error (Rust's unreachable catch-all). */
  warning: boolean;
  /** Variants handled by the catch-all instead of their own arm. */
  caughtByDefault: Variant[];
  /** The catch-all can never run: every variant has its own arm. */
  defaultUnreachable: boolean;
}

export function checkMatch(lang: MatchLang, p: Preset, arms: Arms, catchAll: boolean): MatchVerdict {
  const missing = missingVariants(p, arms);
  if (catchAll) {
    const unreachable = missing.length === 0;
    return {
      ok: true,
      message: unreachable && lang === 'rust' ? 'warning: unreachable pattern' : null,
      warning: unreachable && lang === 'rust',
      caughtByDefault: missing,
      defaultUnreachable: unreachable,
    };
  }
  if (missing.length === 0) return { ok: true, message: null, warning: false, caughtByDefault: [], defaultUnreachable: false };
  const message =
    lang === 'rust'
      ? `error[E0004]: non-exhaustive patterns: ${joinedPatterns(missing.map((v) => rustPattern(p, v)))} not covered`
      : `error TS2322: Type '${missing.length === p.variants.length ? p.type : missing.map((v) => v.name).join(' | ')}' is not assignable to type 'never'.`;
  return { ok: false, message, warning: false, caughtByDefault: [], defaultUnreachable: false };
}

/** The TypeScript program: the type, then render(). `neverLine` is the exhaustiveness check's line. */
export function tsMatchSource(p: Preset, arms: Arms, catchAll: boolean): { lines: string[]; neverLine: number | null; armLine: (number | null)[]; defaultLine: number } {
  const lines = [
    ...p.variants.map((v) => `interface ${v.name} { kind: '${v.kind}'${v.payload ? `; ${v.payload.field}: ${v.payload.ts}` : ''} }`),
    `type ${p.type} = ${p.variants.map((v) => v.name).join(' | ')};`,
    `function render(s: ${p.type}): string {`,
    '  switch (s.kind) {',
  ];
  const armLine: (number | null)[] = p.variants.map((v, i) => {
    if (!arms[i]) return null;
    lines.push(`    case '${v.kind}': return ${v.arm.ts};`);
    return lines.length - 1;
  });
  const defaultLine = lines.length;
  let neverLine: number | null = null;
  if (catchAll) {
    lines.push("    default: return 'fallback';");
  } else {
    lines.push('    default: {', '      const unhandled: never = s;');
    neverLine = lines.length - 1;
    lines.push('      return unhandled;', '    }');
  }
  lines.push('  }', '}');
  return { lines, neverLine, armLine, defaultLine };
}

/** The Rust program (fixed; never compiled here). */
export function rustMatchSource(p: Preset, arms: Arms, catchAll: boolean): { lines: string[]; matchLine: number; armLine: (number | null)[]; defaultLine: number | null } {
  const lines = [
    `enum ${p.type} { ${p.variants.map((v) => `${v.name}${v.payload ? `(${v.payload.rust})` : ''}`).join(', ')} }`,
    '',
    `fn render(s: ${p.type}) -> String {`,
    '    match s {',
  ];
  const matchLine = lines.length - 1;
  const armLine = p.variants.map((v, i) => {
    if (!arms[i]) return null;
    lines.push(`        ${p.type}::${v.name}${v.payload ? `(${v.payload.field})` : ''} => ${v.arm.rust},`);
    return lines.length - 1;
  });
  let defaultLine: number | null = null;
  if (catchAll) {
    lines.push('        _ => "fallback".into(),');
    defaultLine = lines.length - 1;
  }
  lines.push('    }', '}');
  return { lines, matchLine, armLine, defaultLine };
}

/** What rendering each sample prints for these arms (the catch-all prints "fallback"). */
export const printedFor = (v: Variant, covered: boolean) => (covered ? v.sample.prints : 'fallback');

/** Every subset of the three arms. */
export const ALL_ARMS: Arms[] = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => [!!(m & 4), !!(m & 2), !!(m & 1)]);

// ── Scene 3 · the boolean-flags version ────────────────────────────

/** One row of the flags table: three booleans and the variant it means, if any. */
export interface FlagRow {
  flags: [boolean, boolean, boolean];
  /** The single variant this row stands for, or null when it is nonsense. */
  means: Variant | null;
}

/** All 2³ flag combinations. A row is a real state only when exactly one flag is set. */
export function flagRows(p: Preset): FlagRow[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((m) => {
    const flags: [boolean, boolean, boolean] = [!!(m & 4), !!(m & 2), !!(m & 1)];
    const set = flags.filter(Boolean).length;
    // Flag order is [is-first, data, error]; variant order is [first, data, error].
    const means = set === 1 ? p.variants[flags.indexOf(true)] : null;
    return { flags, means };
  });
}
