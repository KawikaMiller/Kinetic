import { lineDiff } from '../../core/lineDiff';
import { mulberry32, pick, randInt } from '../../core/random';

/**
 * A smelly order-pricing function and six refactorings that can be applied in any order. Each
 * version is generated from fixed lesson-authored fragments keyed by the *set* of refactorings
 * applied, so every order of applying them ends at the same text. Every version is real JS that
 * runs against the characterization tests.
 */

export type RefactorId = 'extract' | 'consolidate' | 'constant' | 'flag' | 'paramObject' | 'rename';
export const REFACTORS: readonly RefactorId[] = ['extract', 'consolidate', 'constant', 'flag', 'paramObject', 'rename'];

export interface SmellInfo {
  /** The smell, named as in Fowler's Refactoring (2nd ed.) where he names it. */
  smell: string;
  /** The refactoring that removes it, by its catalogue name. */
  refactoring: string;
  /** Where the name comes from, when it isn't the 2nd edition's smell list. */
  note?: string;
}
export const SMELLS: Record<RefactorId, SmellInfo> = {
  extract: { smell: 'Long Function', refactoring: 'Extract Function' },
  consolidate: { smell: 'Duplicated Code', refactoring: 'Consolidate Conditional Expression', note: 'two branches with the same body' },
  constant: { smell: 'Magic literal', refactoring: 'Replace Magic Literal', note: 'not in the smell list; 1st ed. called the fix Replace Magic Number with Symbolic Constant' },
  flag: { smell: 'Flag argument', refactoring: 'Remove Flag Argument', note: "Fowler's FlagArgument essay; not in the smell list" },
  paramObject: { smell: 'Long Parameter List', refactoring: 'Introduce Parameter Object' },
  rename: { smell: 'Mysterious Name', refactoring: 'Change Function Declaration (rename)' },
};

export type Applied = ReadonlySet<RefactorId>;
export interface VersionOptions {
  /** The "unsafe edit": round the tax to cents first, a behaviour change dressed as a tidy-up. */
  unsafe?: boolean;
}

/** One version of the code, as lines. */
export function versionLines(applied: Applied, o: VersionOptions = {}): string[] {
  const has = (r: RefactorId) => applied.has(r);
  const name = has('rename') ? 'orderTotal' : 'calc2';
  const rate = has('constant') ? 'CA_SALES_TAX' : '0.0725';
  const params = has('paramObject') ? 'order' : 'items, type, coupon, region';
  const args = has('paramObject') ? 'order' : 'items, type, coupon, region';
  const unpack = has('paramObject') ? ['  const { items, type, coupon, region } = order;'] : [];
  const taxExpr = (amount: string) => (o.unsafe ? `Math.round(${amount} * ${rate} * 100) / 100` : `${amount} * ${rate}`);
  const total = (shipping: string) => `  return Math.round((net + tax + ${shipping}) * 100) / 100;`;

  const subtotalBlock = (indent: string) => [
    `${indent}let subtotal = 0;`,
    `${indent}for (let i = 0; i < items.length; i++) {`,
    `${indent}  subtotal += items[i].price * items[i].qty;`,
    `${indent}}`,
  ];
  const discountBlock = (indent: string) => (has('consolidate')
    ? [
      `${indent}let discount = 0;`,
      `${indent}if ((type === 'member' || coupon === 'SAVE10') && subtotal > 100) {`,
      `${indent}  discount = subtotal * 0.1;`,
      `${indent}}`,
    ]
    : [
      `${indent}let discount = 0;`,
      `${indent}if (type === 'member') {`,
      `${indent}  if (subtotal > 100) {`,
      `${indent}    discount = subtotal * 0.1;`,
      `${indent}  }`,
      `${indent}} else if (coupon === 'SAVE10') {`,
      `${indent}  if (subtotal > 100) {`,
      `${indent}    discount = subtotal * 0.1;`,
      `${indent}  }`,
      `${indent}}`,
    ]);
  const taxBlock = (indent: string, amount: string) => [
    `${indent}let tax = 0;`,
    `${indent}if (region === 'CA') {`,
    `${indent}  tax = ${taxExpr(amount)};`,
    `${indent}}`,
  ];
  const shippingBlock = (indent: string, amount: string) => [
    `${indent}let shipping = 0;`,
    `${indent}if (express) {`,
    `${indent}  shipping = 15;`,
    `${indent}} else if (${amount} < 50) {`,
    `${indent}  shipping = 5;`,
    `${indent}}`,
  ];

  // The work before shipping, inline or through the extracted helpers.
  const core = has('extract')
    ? [
      ...unpack,
      '  const subtotal = subtotalOf(items);',
      '  const discount = discountFor(subtotal, type, coupon);',
      '  const net = subtotal - discount;',
      '  const tax = salesTax(net, region);',
    ]
    : [...unpack, ...subtotalBlock('  '), ...discountBlock('  '), '  const net = subtotal - discount;', ...taxBlock('  ', 'net')];

  const out: string[] = [];
  if (has('constant')) out.push('const CA_SALES_TAX = 0.0725;', '');
  if (has('flag')) {
    out.push(
      `function ${name}BeforeShipping(${params}) {`, ...core, '  return { net, tax };', '}', '',
      `function ${name}Express(${params}) {`, `  const { net, tax } = ${name}BeforeShipping(${args});`, total('15'), '}', '',
      `function ${name}Standard(${params}) {`, `  const { net, tax } = ${name}BeforeShipping(${args});`,
      '  let shipping = 0;', '  if (net < 50) {', '    shipping = 5;', '  }', total('shipping'), '}',
    );
  } else {
    out.push(
      `function ${name}(${params}, express) {`, ...core,
      ...(has('extract') ? ['  const shipping = shippingFor(net, express);'] : shippingBlock('  ', 'net')),
      total('shipping'), '}',
    );
  }
  if (has('extract')) {
    out.push(
      '', 'function subtotalOf(items) {', ...subtotalBlock('  '), '  return subtotal;', '}',
      '', 'function discountFor(subtotal, type, coupon) {', ...discountBlock('  '), '  return discount;', '}',
      '', 'function salesTax(amount, region) {', ...taxBlock('  ', 'amount'), '  return tax;', '}',
    );
    if (!has('flag')) out.push('', 'function shippingFor(amount, express) {', ...shippingBlock('  ', 'amount'), '  return shipping;', '}');
  }
  return out;
}

/** The public functions a version defines, i.e. its API. */
export function exportsOf(applied: Applied): string[] {
  const name = applied.has('rename') ? 'orderTotal' : 'calc2';
  return applied.has('flag') ? [`${name}Express`, `${name}Standard`] : [name];
}

/** How the test harness calls a version: the API changes, the behaviour must not. */
export function callLine(applied: Applied): string {
  const name = applied.has('rename') ? 'orderTotal' : 'calc2';
  const args = applied.has('paramObject') ? '{ items, type, coupon, region }' : 'items, type, coupon, region';
  return applied.has('flag')
    ? `express ? ${name}Express(${args}) : ${name}Standard(${args})`
    : `${name}(${args}, express)`;
}

// ── Running a version ────────────────────────────────────────────────

export interface Item {
  price: number;
  qty: number;
}
export interface Order {
  items: Item[];
  type: 'member' | 'guest';
  coupon: string;
  region: string;
  express: boolean;
}

type Fn = (...args: unknown[]) => number;

/** Compile a version and return a function from an order to its total. */
export function compileVersion(applied: Applied, o: VersionOptions = {}): (order: Order) => number {
  const names = exportsOf(applied);
  // Runtime code execution, deliberately: the code is generated only from this lesson's fixed
  // fragments (versionLines), picked by the refactoring chips; no learner input reaches it. It
  // needs 'unsafe-eval', so a strict Content Security Policy would break this lesson.
  const fns = new Function(`${versionLines(applied, o).join('\n')}\nreturn { ${names.join(', ')} };`)() as Record<string, Fn>;
  return (order) => {
    const { items, type, coupon, region, express } = order;
    const args = applied.has('paramObject') ? [{ items, type, coupon, region }] : [items, type, coupon, region];
    if (!applied.has('flag')) return fns[names[0]](...args, express);
    return express ? fns[names[0]](...args) : fns[names[1]](...args);
  };
}

/**
 * The 12 characterization tests: what the original code returns for these orders, pinned down
 * before touching it (quirks included: tax on the discounted price, free shipping from 50).
 */
const book = (price: number, qty = 1): Item => ({ price, qty });
export const CHARACTERIZATION: { name: string; order: Order; expected: number }[] = [
  { name: 'empty cart, guest, standard', order: { items: [], type: 'guest', coupon: '', region: 'NY', express: false }, expected: 5 },
  { name: 'small order pays shipping', order: { items: [book(12.5, 2)], type: 'guest', coupon: '', region: 'NY', express: false }, expected: 30 },
  { name: 'free shipping at exactly 50', order: { items: [book(25, 2)], type: 'guest', coupon: '', region: 'NY', express: false }, expected: 50 },
  { name: 'express always 15', order: { items: [book(80)], type: 'guest', coupon: '', region: 'NY', express: true }, expected: 95 },
  { name: 'California tax', order: { items: [book(40)], type: 'guest', coupon: '', region: 'CA', express: false }, expected: 47.9 },
  { name: 'member over 100 gets 10%', order: { items: [book(60, 2)], type: 'member', coupon: '', region: 'NY', express: false }, expected: 108 },
  { name: 'member at exactly 100: no discount', order: { items: [book(50, 2)], type: 'member', coupon: '', region: 'NY', express: false }, expected: 100 },
  { name: 'coupon over 100 gets 10%', order: { items: [book(110)], type: 'guest', coupon: 'SAVE10', region: 'NY', express: false }, expected: 99 },
  { name: 'unknown coupon: no discount', order: { items: [book(110)], type: 'guest', coupon: 'SAVE20', region: 'NY', express: false }, expected: 110 },
  { name: 'member with coupon: one discount', order: { items: [book(200)], type: 'member', coupon: 'SAVE10', region: 'NY', express: false }, expected: 180 },
  { name: 'discount, CA tax and express', order: { items: [book(70, 2)], type: 'member', coupon: '', region: 'CA', express: true }, expected: 150.14 },
  { name: 'tax on a discounted price with sub-cent leftovers', order: { items: [book(100.01)], type: 'member', coupon: '', region: 'CA', express: false }, expected: 96.53 },
];

export interface TestOutcome {
  name: string;
  passed: boolean;
  expected: number;
  actual: number;
}
export function runCharacterization(applied: Applied, o: VersionOptions = {}): TestOutcome[] {
  const f = compileVersion(applied, o);
  return CHARACTERIZATION.map((t) => {
    const actual = f(t.order);
    return { name: t.name, passed: actual === t.expected, expected: t.expected, actual };
  });
}

/** Seeded random orders, for the "same output as the original" property. */
export function randomOrders(seed: number, n: number): Order[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => ({
    items: Array.from({ length: randInt(0, 4, rnd) }, () => ({ price: randInt(1, 15000, rnd) / 100, qty: randInt(1, 5, rnd) })),
    type: pick(['member', 'guest'] as const, rnd),
    coupon: pick(['', 'SAVE10', 'SAVE20'], rnd),
    region: pick(['CA', 'NY', 'TX'], rnd),
    express: rnd() < 0.5,
  }));
}

// ── Smells on screen, and the metrics ────────────────────────────────

/** Which smells are still present, and the lines each one points at. */
export function smellLines(applied: Applied, lines: readonly string[]): Partial<Record<RefactorId, number[]>> {
  const at = (test: (l: string) => boolean) => lines.map((l, i) => (test(l) ? i : -1)).filter((i) => i >= 0);
  const out: Partial<Record<RefactorId, number[]>> = {};
  if (!applied.has('extract')) out.extract = at((l) => /^function (calc2|orderTotal)(BeforeShipping)?\(/.test(l));
  if (!applied.has('consolidate')) out.consolidate = at((l) => l.trim() === 'discount = subtotal * 0.1;');
  if (!applied.has('constant')) out.constant = at((l) => l.includes('0.0725'));
  if (!applied.has('flag')) out.flag = at((l) => (l.startsWith('function') && /\bexpress\)/.test(l)) || l.trim() === 'if (express) {');
  if (!applied.has('paramObject')) out.paramObject = at((l) => l.startsWith('function') && l.includes('items, type, coupon, region'));
  if (!applied.has('rename')) out.rename = at((l) => /\bcalc2\w*\(/.test(l) && l.startsWith('function'));
  return out;
}

export interface Metrics {
  /** Lines in the longest function, braces included. */
  longestFunction: number;
  /** Deepest block nesting inside any function (by two-space indentation). */
  maxDepth: number;
  /** Non-trivial lines that appear more than once. */
  duplicatedLines: number;
  lines: number;
}

export function metrics(lines: readonly string[]): Metrics {
  let longest = 0;
  let start = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('function ')) start = i;
    if (l === '}' && start >= 0) {
      longest = Math.max(longest, i - start + 1);
      start = -1;
    }
  });
  const depth = Math.max(0, ...lines.filter((l) => l.trim()).map((l) => (l.length - l.trimStart().length) / 2 - 1));
  const counts = new Map<string, number>();
  for (const l of lines) {
    const t = l.trim();
    if (t.length > 3 && t !== '}' && !t.startsWith('function')) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const duplicatedLines = [...counts.values()].filter((c) => c > 1).reduce((a, c) => a + c, 0);
  return { longestFunction: longest, maxDepth: depth, duplicatedLines, lines: lines.length };
}

/** Every subset of the six refactorings, for exhaustive checks. */
export const ALL_SUBSETS: Applied[] = Array.from({ length: 2 ** REFACTORS.length }, (_, mask) => new Set(REFACTORS.filter((_, i) => mask & (1 << i))));

export interface DiffRow {
  text: string;
  kind: 'same' | 'added' | 'removed';
  /** Index in the new version (null for a removed line). */
  at: number | null;
}

/** The new version with the removed lines of the old one shown in place, as a diff reads. */
export function diffRows(before: readonly string[], after: readonly string[]): DiffRow[] {
  const { added, removed } = lineDiff(before, after);
  const rows: DiffRow[] = [];
  let i = 0;
  for (let j = 0; j < after.length; j++) {
    if (!added.has(j)) {
      // Before the next kept line, flush the old lines removed ahead of it.
      while (i < before.length && removed.has(i)) rows.push({ text: before[i++], kind: 'removed', at: null });
      i++;
      rows.push({ text: after[j], kind: 'same', at: j });
    } else rows.push({ text: after[j], kind: 'added', at: j });
  }
  while (i < before.length) if (removed.has(i)) rows.push({ text: before[i++], kind: 'removed', at: null });
  else i++;
  return rows;
}
