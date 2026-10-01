// Pure logic for static-analysis-linters. Each tool layer is a small detector run on the
// sample code, so what the stage shows is computed, not hand-typed. They are toys: real
// tools parse the code into a syntax tree (Tier 2). REAL_TOOLS documents what Prettier,
// ESLint and tsc actually report on this sample, and the tests hold the toys to it.

export type Layer = 'formatter' | 'linter' | 'types' | 'tests';
export const LAYERS: readonly Layer[] = ['formatter', 'linter', 'types', 'tests'];

export const LAYER_NAMES: Record<Layer, string> = {
  formatter: 'Formatter',
  linter: 'Linter',
  types: 'Type checker',
  tests: 'Tests',
};

export const LAYER_TOOLS: Record<Layer, string> = {
  formatter: 'Prettier',
  linter: 'ESLint + typescript-eslint',
  types: 'tsc --strict',
  tests: 'Vitest',
};

/** Lines of the sample, before formatting. */
export const SAMPLE: readonly string[] = [
  'async function renderOrders(user: User | null, body: OrderBody) {',
  '  const debug = true;',
  "  if (body.count == 0) return 'No orders';",
  '      const header = `Orders for ${user.name}`;',
  '  saveAudit(body.orders);',
  '  let html = header;',
  '  for (let i = 1; i < body.orders.length; i++) {',
  '    html += row(body.orders[i]);',
  '  }',
  '  return html;',
  '}',
];

export const DISABLE_COMMENT = '  // eslint-disable-next-line eqeqeq';
/** The line the inline-disable comment silences. */
const LOOSE_EQ_LINE = 2;

/** The sample, optionally with an inline comment that turns eqeqeq off for the next line. */
export function sampleLines(disableEqeqeq: boolean): string[] {
  return disableEqeqeq ? [...SAMPLE.slice(0, LOOSE_EQ_LINE), DISABLE_COMMENT, ...SAMPLE.slice(LOOSE_EQ_LINE)] : [...SAMPLE];
}

export type ProblemId = 'indent' | 'unused' | 'looseEq' | 'floating' | 'nullable' | 'offByOne';

export interface Problem {
  id: ProblemId;
  /** Line in SAMPLE (without the disable comment). */
  line: number;
  label: string;
}

export const PROBLEMS: readonly Problem[] = [
  { id: 'indent', line: 3, label: 'messy indentation' },
  { id: 'unused', line: 1, label: 'unused variable debug' },
  { id: 'looseEq', line: 2, label: '== coerces "" and "0" to 0' },
  { id: 'floating', line: 4, label: 'promise never awaited' },
  { id: 'nullable', line: 3, label: 'user may be null' },
  { id: 'offByOne', line: 6, label: 'loop skips the first order' },
];

export const problemLine = (id: ProblemId) => PROBLEMS.find((p) => p.id === id)!.line;

/**
 * What the real tools report on SAMPLE (strict TypeScript, ESLint with eqeqeq,
 * no-unused-vars and typed typescript-eslint rules, Prettier). Not run in the
 * browser: this is the reference the toy detectors are tested against.
 */
export const REAL_TOOLS: Record<ProblemId, Partial<Record<Layer, string>>> = {
  indent: { formatter: 'Prettier reprints the indentation (it never reports anything)' },
  unused: { linter: '@typescript-eslint/no-unused-vars' },
  looseEq: { linter: 'eqeqeq' },
  floating: { linter: '@typescript-eslint/no-floating-promises (needs type information)' },
  nullable: { types: "TS18047: 'user' is possibly 'null' (strictNullChecks)" },
  offByOne: { tests: 'renders every order' },
};

// ── Formatter ─────────────────────────────────────────────────────────

const INDENT = '  ';

/** Re-indent by brace depth: a tiny stand-in for a formatter. */
export function reindent(lines: readonly string[]): string[] {
  let depth = 0;
  return lines.map((raw) => {
    const code = raw.trim();
    if (code.startsWith('}')) depth--;
    const out = code === '' ? '' : INDENT.repeat(Math.max(0, depth)) + code;
    depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length + (code.startsWith('}') ? 1 : 0);
    return out;
  });
}

/** The code's tokens with all whitespace between them dropped: equal tokens, equal meaning. */
export function tokens(lines: readonly string[]): string[] {
  return lines.join('\n').match(/`[^`]*`|'[^']*'|\w+|[^\s\w]/g) ?? [];
}

// ── Linter (pattern rules) ────────────────────────────────────────────

/** Strip string and template literals so their contents can't match a rule. */
const codeOnly = (line: string) => line.replace(/`[^`]*`|'[^']*'|"[^"]*"/g, '""');

/** eqeqeq: `==` or `!=` that isn't part of `===`/`!==`. */
export function looseEqualityLines(lines: readonly string[]): number[] {
  return lines.flatMap((l, i) => (/(^|[^=!<>])(==|!=)(?!=)/.test(codeOnly(l)) ? [i] : []));
}

/** no-unused-vars: a const/let declared and never mentioned again. */
export function unusedVariableLines(lines: readonly string[]): number[] {
  const out: number[] = [];
  lines.forEach((l, i) => {
    const m = /^\s*(?:const|let)\s+(\w+)\s*=/.exec(codeOnly(l));
    if (!m) return;
    const name = new RegExp(`\\b${m[1]}\\b`);
    const usedLater = lines.slice(i + 1).some((later) => name.test(codeOnly(later)));
    if (!usedLater) out.push(i);
  });
  return out;
}

/** Functions this sample knows to be async (a real linter gets this from the types). */
export const ASYNC_FUNCTIONS: readonly string[] = ['saveAudit'];

/** Index of the parenthesis that closes the one at `open`, or -1. */
function closingParen(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** no-floating-promises: a statement that is only a call to an async function (nothing awaits, returns, voids or chains it). */
export function floatingPromiseLines(lines: readonly string[], asyncFns: readonly string[] = ASYNC_FUNCTIONS): number[] {
  return lines.flatMap((l, i) => {
    const code = codeOnly(l).trim();
    const fn = asyncFns.find((f) => code.startsWith(`${f}(`));
    if (!fn) return [];
    const close = closingParen(code, fn.length);
    return close >= 0 && code.slice(close + 1) === ';' ? [i] : [];
  });
}

/** Lines whose next line carries an inline disable for `rule`. */
function disabledLines(lines: readonly string[], rule: string): Set<number> {
  const out = new Set<number>();
  lines.forEach((l, i) => {
    if (l.trim() === `// eslint-disable-next-line ${rule}`) out.add(i + 1);
  });
  return out;
}

// ── Type checker ──────────────────────────────────────────────────────

/** strictNullChecks, toy edition: a parameter typed `X | null` used with `.` before any check. */
export function possiblyNullLines(lines: readonly string[]): number[] {
  const nullable = [...(lines[0] ?? '').matchAll(/(\w+):\s*\w+\s*\|\s*null/g)].map((m) => m[1]);
  return lines.flatMap((l, i) => (i > 0 && nullable.some((p) => new RegExp(`\\b${p}\\.`).test(l)) ? [i] : []));
}

// ── Tests ─────────────────────────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const row = (o: { item: string }) => `<li>${o.item}</li>`;

/** The sample's loop, as plain JavaScript (types stripped). */
export function renderRows(orders: { item: string }[]): string {
  let html = '';
  for (let i = 1; i < orders.length; i++) html += row(orders[i]);
  return html;
}

/** The unit test the Tests layer runs, against the loop exactly as written. */
export function runUnitTest(): TestResult {
  const orders = [{ item: 'socks' }, { item: 'hat' }];
  const html = renderRows(orders);
  const passed = orders.every((o) => html.includes(o.item));
  return {
    name: REAL_TOOLS.offByOne.tests!,
    passed,
    message: passed ? 'every order rendered' : `expected the HTML to contain "socks", got ${html}`,
  };
}

// ── The sieve ─────────────────────────────────────────────────────────

/** Which layers can catch each problem, computed by running each toy tool on the code. */
export function detections(disableEqeqeq: boolean): Record<ProblemId, Set<Layer>> {
  const lines = sampleLines(disableEqeqeq);
  // map a line of `lines` back to its SAMPLE line
  const toSample = (i: number) => (disableEqeqeq && i > LOOSE_EQ_LINE ? i - 1 : i);
  const silenced = disabledLines(lines, 'eqeqeq');
  const formatted = reindent(lines);
  const reformatted = new Set(lines.flatMap((l, i) => (l !== formatted[i] ? [toSample(i)] : [])));
  const loose = new Set(looseEqualityLines(lines).filter((i) => !silenced.has(i)).map(toSample));
  const unused = new Set(unusedVariableLines(lines).map(toSample));
  const floating = new Set(floatingPromiseLines(lines).map(toSample));
  const nulls = new Set(possiblyNullLines(lines).map(toSample));
  const testFails = !runUnitTest().passed;

  const found: Record<ProblemId, [Layer, boolean]> = {
    indent: ['formatter', reformatted.has(problemLine('indent'))],
    unused: ['linter', unused.has(problemLine('unused'))],
    looseEq: ['linter', loose.has(problemLine('looseEq'))],
    floating: ['linter', floating.has(problemLine('floating'))],
    nullable: ['types', nulls.has(problemLine('nullable'))],
    offByOne: ['tests', testFails],
  };
  const result = {} as Record<ProblemId, Set<Layer>>;
  for (const p of PROBLEMS) {
    const [layer, hit] = found[p.id];
    result[p.id] = new Set(hit ? [layer] : []);
  }
  return result;
}

export type Outcome = Layer | 'production';

/** Each problem falls through the active layers in order: caught by the first that can, or it ships. */
export function sieve(active: ReadonlySet<Layer>, disableEqeqeq: boolean): Record<ProblemId, Outcome> {
  const can = detections(disableEqeqeq);
  const out = {} as Record<ProblemId, Outcome>;
  for (const p of PROBLEMS) out[p.id] = LAYERS.find((l) => active.has(l) && can[p.id].has(l)) ?? 'production';
  return out;
}
