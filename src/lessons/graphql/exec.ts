/**
 * A tiny GraphQL executor written for this lesson: it walks a selection AST over the in-memory
 * fixture, calling one resolver per field (a default property read for scalars), and records
 * what a real server would have done: every resolver call, every database call (naive, or batched
 * by a DataLoader), the errors of resolvers that threw, and when each level finished on a
 * small connection pool. It never evaluates query text. Simplified: no variables, fragments,
 * directives, aliases or async scheduling; timings are illustrative.
 */
import { friendsOf, lastOrders, productById, userById, type Order, type User } from './data';
import { LIMITS, depthOf, fieldDef, schemaError, validate, type Limits, type Sel, type TypeName, type Verdict } from './schema';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type ResolverFn = (parent: unknown, args: Sel['args'], ctx: Context) => unknown;
export type Resolvers = Record<string, ResolverFn>;

export interface Context {
  /** The product whose lookup fails (a flaky product service), or null. */
  failProductId: number | null;
}

export const FAILURE_MESSAGE = 'product service timed out';

export const RESOLVERS: Resolvers = {
  'Query.user': (_p, args) => userById(args?.id ?? 0),
  'User.orders': (p, args) => lastOrders((p as User).id, args?.last ?? 0),
  'User.friends': (p, args) => friendsOf((p as User).id, args?.first ?? 0).map((id) => userById(id)),
  'Order.product': (p, _a, ctx) => {
    const o = p as Order;
    if (ctx.failProductId === o.productId) throw new Error(FAILURE_MESSAGE);
    return productById(o.productId);
  },
};

const defaultResolver = (field: string): ResolverFn => (parent) => (parent as Record<string, unknown>)[field];

// ── What the executor reports ───────────────────────────────────────────

export interface Invocation {
  id: number;
  /** The invocation of the field this one is inside, or null at the top. */
  parent: number | null;
  /** "User.orders" */
  typeField: string;
  field: string;
  path: (string | number)[];
  /** Object ancestors above it: Query.user is level 0. */
  level: number;
  scalar: boolean;
  /** The field returns a list (orders, friends). */
  list: boolean;
  error: string | null;
}

/** An element of a list a resolver returned: the object its child fields are resolved on. */
export interface Item {
  id: number;
  parent: number;
  index: number;
  type: TypeName;
}

export type DbKind = 'users' | 'orders' | 'products' | 'friends';

export interface DbCall {
  id: number;
  kind: DbKind;
  level: number;
  /** The resolvers that needed it (several when a DataLoader batched them). */
  invocations: number[];
  keys: number[];
  batched: boolean;
  sql: string;
  conn: number;
  start: number;
  end: number;
}

export interface ExecError {
  message: string;
  path: (string | number)[];
}

export interface Execution {
  data: Json;
  errors: ExecError[];
  invocations: Invocation[];
  items: Item[];
  dbCalls: DbCall[];
  /** When each level's database calls were all done, ms (a level with none ends when it starts). */
  levelEnds: number[];
  totalMs: number;
}

export interface Options {
  dataLoader: boolean;
  failProductId: number | null;
  resolvers?: Resolvers;
}

/** Illustrative: every database call takes 20 ms, and the server has 4 connections. */
export const DB_CALL_MS = 20;
export const POOL_SIZE = 4;

const DB_OF: Record<string, DbKind> = { 'Query.user': 'users', 'User.orders': 'orders', 'Order.product': 'products', 'User.friends': 'friends' };

interface DbRequest {
  invocation: number;
  kind: DbKind;
  level: number;
  key: number;
  arg: number;
}

const sqlOf = (kind: DbKind, keys: number[], arg: number, batched: boolean): string => {
  switch (kind) {
    case 'users': return `SELECT * FROM users WHERE id = ${keys[0]}`;
    case 'orders': return `SELECT * FROM orders WHERE user_id = ${keys[0]} ORDER BY id DESC LIMIT ${arg}`;
    case 'products': return batched ? `SELECT * FROM products WHERE id IN (${keys.join(', ')})` : `SELECT * FROM products WHERE id = ${keys[0]}`;
    case 'friends': return `SELECT u.* FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ${keys[0]} LIMIT ${arg}`;
  }
};

/** Execute `root` against the fixture. Does not validate: callers go through `runQuery`. */
export function execute(root: readonly Sel[], opts: Options): Execution {
  const resolvers = opts.resolvers ?? RESOLVERS;
  const ctx: Context = { failProductId: opts.failProductId };
  const invocations: Invocation[] = [];
  const items: Item[] = [];
  const requests: DbRequest[] = [];
  const errors: ExecError[] = [];

  const resolveSelection = (type: TypeName, parent: unknown, sels: readonly Sel[], level: number, parentInv: number | null, path: (string | number)[]): Json => {
    const out: { [key: string]: Json } = {};
    for (const sel of sels) {
      const def = fieldDef(type, sel.field)!;
      const typeField = `${type}.${sel.field}`;
      const inv: Invocation = {
        id: invocations.length, parent: parentInv, typeField, field: sel.field, path: [...path, sel.field], level,
        scalar: def.type === 'scalar', list: def.list !== undefined, error: null,
      };
      invocations.push(inv);
      const kind = DB_OF[typeField];
      if (kind) {
        const p = parent as { id?: number } | null;
        const key = typeField === 'Query.user' ? (sel.args?.id ?? 0) : typeField === 'Order.product' ? (parent as Order).productId : (p?.id ?? 0);
        requests.push({ invocation: inv.id, kind, level, key, arg: sel.args?.last ?? sel.args?.first ?? 0 });
      }
      let value: unknown;
      try {
        value = (resolvers[typeField] ?? defaultResolver(sel.field))(parent, sel.args, ctx);
      } catch (e) {
        inv.error = e instanceof Error ? e.message : String(e);
        errors.push({ message: inv.error, path: inv.path });
        out[sel.field] = null;
        continue;
      }
      if (def.type === 'scalar') out[sel.field] = value as Json;
      else if (value === null || value === undefined) out[sel.field] = null;
      else if (def.list) {
        out[sel.field] = (value as unknown[]).map((item, index) => {
          if (item === null) return null;
          items.push({ id: items.length, parent: inv.id, index, type: def.type as TypeName });
          return resolveSelection(def.type as TypeName, item, sel.children!, level + 1, inv.id, [...inv.path, index]);
        });
      } else out[sel.field] = resolveSelection(def.type as TypeName, value, sel.children!, level + 1, inv.id, inv.path);
    }
    return out;
  };

  const data = resolveSelection('Query', {}, root, 0, null, []);
  const { dbCalls, levelEnds } = scheduleDb(requests, opts.dataLoader, Math.max(1, depthOf(root)));
  return { data, errors, invocations, items, dbCalls, levelEnds, totalMs: levelEnds.at(-1) ?? 0 };
}

/**
 * Turn the requests into database calls and place them in time. A DataLoader collects the product
 * lookups of one level (they all happen in the same tick) into one call for the distinct ids;
 * without it each resolver makes its own. A level's calls run on the connection pool, and the
 * next level can only start when they are all done.
 */
function scheduleDb(requests: readonly DbRequest[], dataLoader: boolean, levels: number): { dbCalls: DbCall[]; levelEnds: number[] } {
  const dbCalls: DbCall[] = [];
  const levelEnds: number[] = [];
  const free = new Array<number>(POOL_SIZE).fill(0);
  let levelStart = 0;
  for (let level = 0; level < levels; level++) {
    const here = requests.filter((r) => r.level === level);
    const groups: DbRequest[][] = [];
    const batchable = dataLoader ? here.filter((r) => r.kind === 'products') : [];
    if (batchable.length) groups.push(batchable);
    for (const r of here) if (!batchable.includes(r)) groups.push([r]);
    let levelEnd = levelStart;
    for (const g of groups) {
      const batched = g.length > 1 || (dataLoader && g[0].kind === 'products');
      const keys = batched ? [...new Set(g.map((r) => r.key))] : [g[0].key];
      const readyAt = free.map((t) => Math.max(t, levelStart));
      const conn = readyAt.indexOf(Math.min(...readyAt));
      const start = readyAt[conn];
      const end = start + DB_CALL_MS;
      free[conn] = end;
      levelEnd = Math.max(levelEnd, end);
      dbCalls.push({
        id: dbCalls.length, kind: g[0].kind, level, invocations: g.map((r) => r.invocation), keys, batched, conn, start, end,
        sql: sqlOf(g[0].kind, keys, g[0].arg, batched),
      });
    }
    levelEnds.push(levelEnd);
    levelStart = levelEnd;
  }
  return { dbCalls, levelEnds };
}

// ── The whole request ───────────────────────────────────────────────────

export type Outcome =
  | { status: 'rejected'; verdict: Extract<Verdict, { ok: false }>; message: string }
  | { status: 'invalid'; message: string }
  | { status: 'executed'; verdict: Extract<Verdict, { ok: true }>; execution: Execution };

/** What a GraphQL server does with a request: check the schema, check the limits, and only then run resolvers. */
export function runQuery(root: readonly Sel[], opts: Options, limits: Limits | null = LIMITS): Outcome {
  const bad = schemaError(root);
  if (bad) return { status: 'invalid', message: bad };
  const verdict = validate(root, limits ?? { maxDepth: Infinity, maxCost: Infinity });
  if (!verdict.ok) return { status: 'rejected', verdict, message: `Query rejected before execution: ${verdict.problems.join('; ')}.` };
  return { status: 'executed', verdict, execution: execute(root, opts) };
}
