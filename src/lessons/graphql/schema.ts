/**
 * The lesson's GraphQL schema, queries as a small selection AST (no parser: the learner ticks
 * fields, never types a query), and the two checks a server runs before executing anything:
 * how deep a query nests and what it could cost. Pure.
 */

export type TypeName = 'Query' | 'User' | 'Order' | 'Product';
export type ListArg = 'last' | 'first';

export interface FieldDef {
  name: string;
  /** A scalar, or the object type it returns. */
  type: TypeName | 'scalar';
  /** The argument that sets the list's length: orders(last: n), friends(first: n). */
  list?: ListArg;
}

export const SCHEMA: Record<TypeName, FieldDef[]> = {
  Query: [{ name: 'user', type: 'User' }],
  User: [
    { name: 'id', type: 'scalar' }, { name: 'name', type: 'scalar' }, { name: 'email', type: 'scalar' },
    { name: 'bio', type: 'scalar' }, { name: 'avatarUrl', type: 'scalar' }, { name: 'createdAt', type: 'scalar' },
    { name: 'orders', type: 'Order', list: 'last' }, { name: 'friends', type: 'User', list: 'first' },
  ],
  Order: [
    { name: 'id', type: 'scalar' }, { name: 'qty', type: 'scalar' }, { name: 'total', type: 'scalar' },
    { name: 'status', type: 'scalar' }, { name: 'placedAt', type: 'scalar' }, { name: 'product', type: 'Product' },
  ],
  Product: [
    { name: 'id', type: 'scalar' }, { name: 'name', type: 'scalar' }, { name: 'price', type: 'scalar' },
    { name: 'description', type: 'scalar' }, { name: 'sku', type: 'scalar' }, { name: 'stock', type: 'scalar' },
  ],
};

export interface Sel {
  field: string;
  args?: { id?: number; last?: number; first?: number };
  children?: Sel[];
}

export const fieldDef = (parent: TypeName, name: string): FieldDef | undefined => SCHEMA[parent].find((f) => f.name === name);

/** The list length a field's argument sets, or 1 for anything that isn't a list. */
export function listSize(def: FieldDef, sel: Sel): number {
  return def.list ? (sel.args?.[def.list] ?? 0) : 1;
}

/** Why a selection isn't valid against the schema, or null. A real server rejects these at validation. */
export function schemaError(root: readonly Sel[], parent: TypeName = 'Query'): string | null {
  if (!root.length) return `A selection on ${parent} can't be empty.`;
  for (const s of root) {
    const def = fieldDef(parent, s.field);
    if (!def) return `${parent} has no field "${s.field}".`;
    if (def.type === 'scalar') {
      if (s.children?.length) return `${parent}.${s.field} is a scalar and can't have a selection.`;
      continue;
    }
    if (!s.children?.length) return `${parent}.${s.field} returns ${def.type}, so it needs a selection.`;
    const inner = schemaError(s.children, def.type);
    if (inner) return inner;
  }
  return null;
}

// ── Printing ────────────────────────────────────────────────────────────

const argText = (s: Sel): string => {
  const parts = Object.entries(s.args ?? {}).map(([k, v]) => `${k}: ${v}`);
  return parts.length ? `(${parts.join(', ')})` : '';
};

/** The query as source lines: `{ user(id: 1) { name orders(last: 3) { total } } }`, one field per line. */
export function printQuery(root: readonly Sel[]): string[] {
  const lines: string[] = ['query {'];
  const walk = (sels: readonly Sel[], indent: number) => {
    for (const s of sels) {
      const pad = '  '.repeat(indent);
      if (s.children?.length) {
        lines.push(`${pad}${s.field}${argText(s)} {`);
        walk(s.children, indent + 1);
        lines.push(`${pad}}`);
      } else lines.push(`${pad}${s.field}${argText(s)}`);
    }
  };
  walk(root, 1);
  lines.push('}');
  return lines;
}

// ── Limits ──────────────────────────────────────────────────────────────

/** How many levels a query nests: `user { name }` is 2. */
export function depthOf(root: readonly Sel[]): number {
  return root.reduce((d, s) => Math.max(d, 1 + (s.children?.length ? depthOf(s.children) : 0)), 0);
}

/**
 * A query's worst-case cost: the number of field resolvers it can run. Every field costs 1 per
 * time it is resolved, and a list multiplies everything inside it by its length, so the cost
 * is the sum over the selection of the product of the list sizes above each field.
 */
export function costOf(root: readonly Sel[], parent: TypeName = 'Query', multiplier = 1): number {
  let total = 0;
  for (const s of root) {
    total += multiplier;
    const def = fieldDef(parent, s.field);
    if (def && def.type !== 'scalar' && s.children?.length) total += costOf(s.children, def.type, multiplier * listSize(def, s));
  }
  return total;
}

export interface Limits {
  maxDepth: number;
  maxCost: number;
}

/** Illustrative limits: real servers pick their own. */
export const LIMITS: Limits = { maxDepth: 4, maxCost: 1000 };

export type Verdict = { ok: true; depth: number; cost: number } | { ok: false; depth: number; cost: number; problems: string[] };

const group = (n: number) => n.toLocaleString('en-US');

/** The static check a server runs before any resolver does: depth, then cost. */
export function validate(root: readonly Sel[], limits: Limits = LIMITS): Verdict {
  const depth = depthOf(root);
  const cost = costOf(root);
  const problems: string[] = [];
  if (depth > limits.maxDepth) problems.push(`depth ${depth} is over the limit of ${limits.maxDepth}`);
  if (cost > limits.maxCost) problems.push(`cost ${group(cost)} is over the limit of ${group(limits.maxCost)}`);
  return problems.length ? { ok: false, depth, cost, problems } : { ok: true, depth, cost };
}

// ── The nested-friends query ────────────────────────────────────────────

/** `user(id: 1) { friends(first: f) { … k levels … { name } } }`: the query the cost scene deepens. */
export function friendsQuery(levels: number, first: number, userId = 1): Sel[] {
  let inner: Sel[] = [{ field: 'name' }];
  for (let i = 0; i < levels; i++) inner = [{ field: 'friends', args: { first }, children: inner }];
  return [{ field: 'user', args: { id: userId }, children: inner }];
}
