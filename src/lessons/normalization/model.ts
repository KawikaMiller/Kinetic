// Normalization, computed: functional dependencies, attribute closure, candidate keys and the
// normal-form tests run on whatever schema the stage is at, and the three anomalies are real
// operations on its rows. The schema and its dependencies are hand-made (given, not mined).

export type Value = string | number | null;
export type Row = Record<string, Value>;

export interface Fd {
  lhs: readonly string[];
  rhs: readonly string[];
}

export interface Table {
  name: string;
  cols: readonly string[];
  /** The primary key chosen for the table. */
  key: readonly string[];
  rows: readonly Row[];
  /** Columns holding a list of values in one cell (only the 0NF stage has one). */
  listCols?: readonly string[];
}

export type Schema = readonly Table[];

/** The business rules: what determines what. Given, as a designer would write them down. */
export const FDS: readonly Fd[] = [
  { lhs: ['order_id'], rhs: ['customer_id', 'warehouse'] },
  { lhs: ['customer_id'], rhs: ['customer_name', 'customer_email'] },
  { lhs: ['product_id'], rhs: ['product_name', 'price'] },
  { lhs: ['order_id', 'product_id'], rhs: ['quantity'] },
];

export const fdText = (fd: Fd) => `${fd.lhs.join(', ')} → ${fd.rhs.join(', ')}`;

// ── Closure, keys and normal forms ────────────────────────────────────

/** X⁺: every attribute X determines under the FDs. */
export function closure(attrs: readonly string[], fds: readonly Fd[] = FDS): Set<string> {
  const out = new Set(attrs);
  let grew = true;
  while (grew) {
    grew = false;
    for (const fd of fds) {
      if (fd.lhs.every((a) => out.has(a)) && fd.rhs.some((a) => !out.has(a))) {
        fd.rhs.forEach((a) => out.add(a));
        grew = true;
      }
    }
  }
  return out;
}

function subsets<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let m = 0; m < 1 << xs.length; m++) out.push(xs.filter((_, i) => m & (1 << i)));
  return out;
}

export const isSuperkey = (x: readonly string[], cols: readonly string[], fds: readonly Fd[] = FDS) => {
  const c = closure(x, fds);
  return cols.every((a) => c.has(a));
};

/** Minimal attribute sets of the table that determine all of its columns. */
export function candidateKeys(cols: readonly string[], fds: readonly Fd[] = FDS): string[][] {
  const supers = subsets(cols).filter((x) => x.length > 0 && isSuperkey(x, cols, fds)).sort((a, b) => a.length - b.length);
  const keys: string[][] = [];
  for (const s of supers) if (!keys.some((k) => k.every((a) => s.includes(a)))) keys.push(s);
  return keys;
}

export type NormalForm = '0NF' | '1NF' | '2NF' | '3NF' | 'BCNF';

export interface Violation {
  form: '1NF' | '2NF' | '3NF' | 'BCNF';
  table: string;
  /** The dependency that breaks the rule (a given FD restricted to the table), or the list column for 1NF. */
  fd: Fd | null;
  why: string;
}

/** Dependencies that hold inside the table: each given FD whose left side lies in it, cut to the table's columns. */
export function fdsIn(t: Table, fds: readonly Fd[] = FDS): Fd[] {
  const out: Fd[] = [];
  for (const fd of fds) {
    if (!fd.lhs.every((a) => t.cols.includes(a))) continue;
    // Include what the left side reaches through other FDs too (a transitive dependency), restricted to the table.
    const reach = [...closure(fd.lhs, fds)].filter((a) => t.cols.includes(a) && !fd.lhs.includes(a));
    const direct = fd.rhs.filter((a) => t.cols.includes(a));
    if (direct.length) out.push({ lhs: fd.lhs, rhs: direct });
    else if (reach.length) out.push({ lhs: fd.lhs, rhs: reach });
  }
  return out;
}

/**
 * Every violation in the table, checked over all its attribute subsets (not just the listed FDs),
 * then named by the listed FD that witnesses it. 2NF: a non-prime attribute depends on part of a
 * key. 3NF: a non-prime attribute depends on something that isn't a superkey. BCNF: any
 * non-trivial dependency whose left side isn't a superkey.
 */
export function violations(t: Table, fds: readonly Fd[] = FDS): Violation[] {
  const out: Violation[] = [];
  for (const c of t.listCols ?? []) {
    out.push({ form: '1NF', table: t.name, fd: null, why: `${c} holds a list in one cell, so a single value can't be looked up or joined` });
  }
  const keys = candidateKeys(t.cols, fds);
  const prime = new Set(keys.flat());
  const named = fdsIn(t, fds);
  for (const x of subsets(t.cols)) {
    if (x.length === 0 || isSuperkey(x, t.cols, fds)) continue;
    const dependents = [...closure(x, fds)].filter((a) => t.cols.includes(a) && !x.includes(a));
    if (dependents.length === 0) continue;
    const witness = named.find((f) => f.lhs.length === x.length && f.lhs.every((a) => x.includes(a)));
    if (!witness) continue;
    const nonPrime = dependents.filter((a) => !prime.has(a));
    const partOfKey = keys.some((k) => x.every((a) => k.includes(a)) && x.length < k.length);
    const shown = { lhs: witness.lhs, rhs: witness.rhs };
    if (nonPrime.length && partOfKey) {
      out.push({ form: '2NF', table: t.name, fd: shown, why: `${x.join(', ')} is only part of the key (${keys[0].join(', ')}), yet determines ${nonPrime.join(', ')}` });
    } else if (nonPrime.length) {
      out.push({ form: '3NF', table: t.name, fd: shown, why: `${x.join(', ')} isn't a key, yet determines ${nonPrime.join(', ')}: a transitive dependency through ${x.join(', ')}` });
    } else {
      out.push({ form: 'BCNF', table: t.name, fd: shown, why: `${x.join(', ')} isn't a superkey, yet determines ${dependents.join(', ')}` });
    }
  }
  return out;
}

/** The highest normal form every table of the schema reaches. */
export function normalForm(s: Schema, fds: readonly Fd[] = FDS): NormalForm {
  const v = s.flatMap((t) => violations(t, fds));
  if (v.some((x) => x.form === '1NF')) return '0NF';
  if (v.some((x) => x.form === '2NF')) return '1NF';
  if (v.some((x) => x.form === '3NF')) return '2NF';
  if (v.some((x) => x.form === 'BCNF')) return '3NF';
  return 'BCNF';
}

// ── The data ──────────────────────────────────────────────────────────

export const CUSTOMERS: Record<string, { name: string; email: string }> = {
  C1: { name: 'Ada', email: 'ada@example.com' },
  C2: { name: 'Linus', email: 'linus@example.com' },
  C3: { name: 'Grace', email: 'grace@example.com' },
};

/** Prices in pence. */
export const PRODUCTS: Record<string, { name: string; price: number }> = {
  P1: { name: 'pen', price: 150 },
  P2: { name: 'ink', price: 400 },
  P3: { name: 'paper', price: 600 },
  P4: { name: 'stapler', price: 900 },
};

const ORDERS: { order_id: number; customer_id: string; warehouse: string; items: [string, number][] }[] = [
  { order_id: 1001, customer_id: 'C1', warehouse: 'Leeds', items: [['P1', 2], ['P2', 1]] },
  { order_id: 1002, customer_id: 'C1', warehouse: 'York', items: [['P1', 1]] },
  { order_id: 1003, customer_id: 'C2', warehouse: 'Leeds', items: [['P2', 3], ['P3', 1]] },
  { order_id: 1004, customer_id: 'C3', warehouse: 'York', items: [['P4', 1]] },
  { order_id: 1005, customer_id: 'C2', warehouse: 'York', items: [['P3', 2]] },
];

export const WIDE_COLS = ['order_id', 'customer_id', 'customer_name', 'customer_email', 'warehouse', 'product_id', 'product_name', 'price', 'quantity'] as const;

/** One row per order line: the 1NF table everything else is cut from. */
export const WIDE_ROWS: readonly Row[] = ORDERS.flatMap((o) => o.items.map(([pid, quantity]) => ({
  order_id: o.order_id,
  customer_id: o.customer_id,
  customer_name: CUSTOMERS[o.customer_id].name,
  customer_email: CUSTOMERS[o.customer_id].email,
  warehouse: o.warehouse,
  product_id: pid,
  product_name: PRODUCTS[pid].name,
  price: PRODUCTS[pid].price,
  quantity,
})));

/** π over a table: the named columns, duplicates removed (a relation is a set). */
export function project(name: string, from: readonly Row[], cols: readonly string[], key: readonly string[]): Table {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const r of from) {
    const picked = Object.fromEntries(cols.map((c) => [c, r[c]]));
    const k = JSON.stringify(cols.map((c) => r[c]));
    if (!seen.has(k)) {
      seen.add(k);
      rows.push(picked);
    }
  }
  return { name, cols, key, rows };
}

export type StageId = 0 | 1 | 2 | 3;
export const STAGE_LABEL: Record<StageId, string> = { 0: '0NF', 1: '1NF', 2: '2NF', 3: '3NF' };

/** The four designs, each cut from the one before. */
export function schemaAt(stage: StageId): Schema {
  if (stage === 0) {
    const rows = ORDERS.map((o) => ({
      order_id: o.order_id,
      customer_id: o.customer_id,
      customer_name: CUSTOMERS[o.customer_id].name,
      customer_email: CUSTOMERS[o.customer_id].email,
      warehouse: o.warehouse,
      items: o.items.map(([p, q]) => `${PRODUCTS[p].name} ×${q}`).join(', '),
    }));
    return [{ name: 'orders', cols: ['order_id', 'customer_id', 'customer_name', 'customer_email', 'warehouse', 'items'], key: ['order_id'], rows, listCols: ['items'] }];
  }
  if (stage === 1) return [{ name: 'orders', cols: WIDE_COLS, key: ['order_id', 'product_id'], rows: WIDE_ROWS }];
  const lines = project('order_lines', WIDE_ROWS, ['order_id', 'product_id', 'quantity'], ['order_id', 'product_id']);
  const products = project('products', WIDE_ROWS, ['product_id', 'product_name', 'price'], ['product_id']);
  if (stage === 2) {
    return [project('orders', WIDE_ROWS, ['order_id', 'customer_id', 'customer_name', 'customer_email', 'warehouse'], ['order_id']), lines, products];
  }
  return [
    project('orders', WIDE_ROWS, ['order_id', 'customer_id', 'warehouse'], ['order_id']),
    project('customers', WIDE_ROWS, ['customer_id', 'customer_name', 'customer_email'], ['customer_id']),
    lines,
    products,
  ];
}

/** A column that is another table's whole key: a foreign key (unless it's this table's own single-column key). */
export function isForeignKey(s: Schema, t: Table, col: string): boolean {
  const ownKey = t.key.length === 1 && t.key[0] === col;
  return !ownKey && s.some((o) => o !== t && o.key.length === 1 && o.key[0] === col);
}

/** Natural join of every table: what the split schema says the wide table was. */
export function joinAll(s: Schema): Row[] {
  let rows: Row[] = [...s[0].rows];
  for (const t of s.slice(1)) {
    const common = t.cols.filter((c) => rows.length && c in rows[0]);
    const next: Row[] = [];
    for (const a of rows) for (const b of t.rows) if (common.every((c) => a[c] === b[c])) next.push({ ...a, ...b });
    rows = next;
  }
  return rows;
}

// ── Repeated facts ────────────────────────────────────────────────────

/**
 * Cells that repeat a fact: the value of A in rows whose determinant X (with X → A) appears in more
 * than one row of the same table, where X isn't the table's key. Those are the copies that can drift.
 */
export function repeatedCells(t: Table, fds: readonly Fd[] = FDS): Set<string> {
  const out = new Set<string>();
  for (const fd of fdsIn(t, fds)) {
    if (isSuperkey(fd.lhs, t.cols, fds)) continue;
    const groups = new Map<string, number[]>();
    t.rows.forEach((r, i) => {
      const k = JSON.stringify(fd.lhs.map((a) => r[a]));
      groups.set(k, [...(groups.get(k) ?? []), i]);
    });
    for (const idx of groups.values()) if (idx.length > 1) for (const i of idx) for (const a of fd.rhs) out.add(cellId(i, a));
  }
  return out;
}

export const cellId = (row: number, col: string) => `${row}:${col}`;

// ── Anomalies ─────────────────────────────────────────────────────────

export type AnomalyId = 'update' | 'delete' | 'insert';

export const NEW_EMAIL = 'ada@new.example.com';
export const DELETED_ORDER = 1004;
export const NEW_PRODUCT: Row = { product_id: 'P5', product_name: 'tape', price: 200 };

export interface AnomalyRun {
  id: AnomalyId;
  /** The schema after the operation (unchanged if it was refused). */
  after: Schema;
  /** Cells that now contradict another copy of the same fact: `${table}/${row}:${col}`. */
  inconsistent: Set<string>;
  /** Facts nothing in the database records any more. */
  lost: string[];
  /** Why the operation couldn't be done, if it couldn't. */
  refused: string | null;
  /** How many rows the operation touched. */
  touched: number;
  ok: boolean;
}

const tableCell = (t: Table, row: number, col: string) => `${t.name}/${cellId(row, col)}`;

/** Every cell that disagrees with another copy of its fact, across all tables. */
export function inconsistencies(s: Schema, fds: readonly Fd[] = FDS): Set<string> {
  const out = new Set<string>();
  for (const fd of fds) {
    for (const a of fd.rhs) {
      const seen = new Map<string, { value: Value; cells: string[] }[]>();
      for (const t of s) {
        if (!fd.lhs.every((x) => t.cols.includes(x)) || !t.cols.includes(a)) continue;
        t.rows.forEach((r, i) => {
          const k = JSON.stringify(fd.lhs.map((x) => r[x]));
          const list = seen.get(k) ?? [];
          const hit = list.find((v) => v.value === r[a]);
          if (hit) hit.cells.push(tableCell(t, i, a));
          else list.push({ value: r[a], cells: [tableCell(t, i, a)] });
          seen.set(k, list);
        });
      }
      for (const versions of seen.values()) if (versions.length > 1) for (const v of versions) v.cells.forEach((c) => out.add(c));
    }
  }
  return out;
}

/** Facts the schema records: each product's price and each customer's email. */
export function factsHeld(s: Schema): Set<string> {
  const out = new Set<string>();
  for (const t of s) {
    for (const r of t.rows) {
      if (t.cols.includes('price') && r.product_id !== undefined) out.add(`price of ${PRODUCTS[r.product_id as string]?.name ?? r.product_name}`);
      if (t.cols.includes('items') && typeof r.items === 'string') for (const [, p] of Object.entries(PRODUCTS)) if (r.items.includes(p.name)) out.add(`price of ${p.name}`);
      if (t.cols.includes('customer_email') && r.customer_id !== undefined) out.add(`email of ${CUSTOMERS[r.customer_id as string].name}`);
    }
  }
  return out;
}

/** Runs one anomaly against a schema. */
export function runAnomaly(id: AnomalyId, s: Schema): AnomalyRun {
  const base = { id, inconsistent: new Set<string>(), lost: [] as string[], refused: null as string | null, touched: 0 };
  switch (id) {
    case 'update': {
      // The app updates the email on the first row it finds for Ada, as a careless UPDATE … WHERE order_id = … would.
      let touched = 0;
      const after = s.map((t) => {
        if (touched || !t.cols.includes('customer_email')) return t;
        const i = t.rows.findIndex((r) => r.customer_id === 'C1');
        if (i < 0) return t;
        touched = 1;
        return { ...t, rows: t.rows.map((r, j) => (j === i ? { ...r, customer_email: NEW_EMAIL } : r)) };
      });
      const inconsistent = inconsistencies(after);
      return { ...base, after, inconsistent, touched, ok: inconsistent.size === 0 };
    }
    case 'delete': {
      const before = factsHeld(s);
      let touched = 0;
      const after = s.map((t) => {
        if (!t.cols.includes('order_id')) return t;
        const rows = t.rows.filter((r) => r.order_id !== DELETED_ORDER);
        touched += t.rows.length - rows.length;
        return { ...t, rows };
      });
      const held = factsHeld(after);
      const lost = [...before].filter((f) => !held.has(f));
      return { ...base, after, lost, touched, ok: lost.length === 0 };
    }
    case 'insert': {
      const home = s.find((t) => t.cols.includes('price') || t.cols.includes('items'))!;
      const missing = home.key.filter((k) => !(k in NEW_PRODUCT));
      if (missing.length || home.listCols) {
        const need = missing.length ? missing : home.key;
        return {
          ...base, after: s, ok: false,
          refused: `a product with no order yet has no ${need.join(' or ')}, and a key column can't be NULL`,
        };
      }
      const after = s.map((t) => (t === home ? { ...t, rows: [...t.rows, Object.fromEntries(t.cols.map((c) => [c, NEW_PRODUCT[c] ?? null]))] } : t));
      return { ...base, after, touched: 1, ok: true };
    }
  }
}

// ── The read side: what splitting costs ─────────────────────────────────

/** The SQL that prints every order line with its customer and product, at this stage. */
export function invoiceSql(stage: StageId): string[] {
  const cols = 'o.order_id, customer_name, customer_email, product_name, price, quantity';
  switch (stage) {
    case 0:
      return ['SELECT order_id, customer_name, customer_email, items', 'FROM orders'];
    case 1:
      return [`SELECT ${cols.replace('o.', '')}`, 'FROM orders'];
    case 2:
      return [`SELECT ${cols}`, 'FROM orders o', '  JOIN order_lines l ON l.order_id = o.order_id', '  JOIN products p ON p.product_id = l.product_id'];
    case 3:
      return [
        `SELECT ${cols}`,
        'FROM orders o',
        '  JOIN customers c ON c.customer_id = o.customer_id',
        '  JOIN order_lines l ON l.order_id = o.order_id',
        '  JOIN products p ON p.product_id = l.product_id',
      ];
  }
}

export const joinCount = (stage: StageId) => invoiceSql(stage).filter((l) => l.trim().startsWith('JOIN')).length;

/** Price in pence, shown as pounds. */
export const money = (p: number) => `£${(p / 100).toFixed(2)}`;
