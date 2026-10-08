// REST resource design: a path parser, the validator's rules, the status-code scenarios and
// a tiny collection query. Pure, so model.test.ts can table-test every rule. The method
// properties come from RFC 9110; everything else is a common convention, and each flag says
// which it is.

export type Method = 'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** The methods offered as chips on the board. */
export const METHODS: readonly Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** RFC 9110 §9.2.1 safe methods (TRACE is safe too; it isn't modelled here). */
export const SAFE: ReadonlySet<Method> = new Set<Method>(['GET', 'HEAD', 'OPTIONS']);
/** RFC 9110 §9.2.2 idempotent methods: the safe ones, plus PUT and DELETE. */
export const IDEMPOTENT: ReadonlySet<Method> = new Set<Method>(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

// ── Paths ───────────────────────────────────────────────────────────────

export type SegRole = 'noun' | 'id' | 'verb';
export interface Seg {
  text: string;
  role: SegRole;
}

export interface PathShape {
  path: string;
  segs: Seg[];
  /** The last noun segment: the collection this path is about. */
  resource: string | null;
  /** What the path ends at: a collection, one item (an id), or an action (a verb). */
  kind: 'collection' | 'item' | 'action' | 'root';
  /** How many collections deep: /users/{id}/orders is 2. */
  depth: number;
  verbs: string[];
}

/** Words that make a path segment an action rather than a thing. */
export const VERBS = [
  'get', 'fetch', 'read', 'list', 'find', 'create', 'add', 'make', 'new', 'update', 'edit', 'set', 'save', 'change', 'delete', 'remove', 'destroy',
] as const;

const MAX_PATH = 80;
const MAX_SEGS = 8;
const SEGMENT = /^(?:\{[a-z][a-zA-Z]*\}|[A-Za-z0-9._~-]+)$/;
const ID_LIKE = /^(?:\{[a-z][a-zA-Z]*\}|\d+|[0-9a-f]{8}-[0-9a-f-]{27})$/i;

/** The first word of a segment, across camelCase, kebab-case and snake_case: `updateStatus` → `update`. */
export const firstWord = (s: string) => s.split(/[-_.~]|(?=[A-Z])/)[0].toLowerCase();

export const roleOf = (seg: string): SegRole =>
  ID_LIKE.test(seg) ? 'id' : (VERBS as readonly string[]).includes(firstWord(seg)) ? 'verb' : 'noun';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A learner-typed path, or the reason it's refused (the previous path stays). Paths only:
 * a query string belongs in the collection panel. A trailing slash is dropped.
 */
export function parsePath(raw: string): Parsed<PathShape> {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'Type a path, like /orders/{id}.' };
  if (text.length > MAX_PATH) return { ok: false, error: `Keep it under ${MAX_PATH} characters.` };
  if (!text.startsWith('/')) return { ok: false, error: 'A path starts with /.' };
  if (/[?#]/.test(text)) return { ok: false, error: 'Leave the query string out: here the id goes in the path, and filters live in the Collections scene.' };
  const body = text.length > 1 && text.endsWith('/') ? text.slice(0, -1) : text;
  const parts = body === '/' ? [] : body.slice(1).split('/');
  if (parts.some((p) => p === '')) return { ok: false, error: 'There is an empty segment (//) in that path.' };
  if (parts.length > MAX_SEGS) return { ok: false, error: `That's ${parts.length} segments; this board takes up to ${MAX_SEGS}.` };
  const bad = parts.find((p) => !SEGMENT.test(p));
  if (bad !== undefined) return { ok: false, error: `"${bad}" isn't a plain segment: use letters, digits, - _ . ~ or a {name} placeholder.` };
  return { ok: true, value: shapeOf(parts) };
}

function shapeOf(parts: string[]): PathShape {
  const segs = parts.map((text) => ({ text, role: roleOf(text) }));
  const nouns = segs.filter((s) => s.role === 'noun');
  const last = segs[segs.length - 1];
  const kind = !last ? 'root' : last.role === 'noun' ? 'collection' : last.role;
  return {
    path: '/' + parts.join('/'),
    segs,
    resource: nouns.length ? nouns[nouns.length - 1].text : null,
    kind: kind === 'id' ? 'item' : kind === 'verb' ? 'action' : kind,
    depth: nouns.length,
    verbs: segs.filter((s) => s.role === 'verb').map((s) => s.text),
  };
}

/** A path from the lesson's own chips: always valid. */
export function shape(path: string): PathShape {
  const p = parsePath(path);
  if (!p.ok) throw new Error(`bad fixture path ${path}: ${p.error}`);
  return p.value;
}

// ── The validator ───────────────────────────────────────────────────────

export type Action = 'read' | 'list' | 'create' | 'replace' | 'update' | 'delete';
export type Level = 'ok' | 'warn' | 'bad';
export type RuleId =
  | 'verb-in-path' | 'too-deep' | 'wrong-resource' | 'needs-item' | 'needs-collection' | 'create-on-collection' | 'ends-in-action'
  | 'read-not-safe' | 'get-must-be-safe' | 'delete-method' | 'put-replaces' | 'patch-for-replace' | 'post-not-idempotent' | 'put-create'
  | 'method-fits';
export interface Flag {
  rule: RuleId;
  level: Level;
  text: string;
  /** RFC 9110 for the method properties; a common guideline otherwise. */
  source: 'RFC 9110' | 'convention';
}

export interface Intent {
  action: Action;
  /** The collection the job is about: users, orders, reviews. */
  resource: string;
  /** What the endpoint does, in words. */
  job: string;
}

/** The method each job calls for. */
export const METHOD_FOR: Record<Action, Method> = { read: 'GET', list: 'GET', create: 'POST', replace: 'PUT', update: 'PATCH', delete: 'DELETE' };
/** Whether a job addresses one item or the collection. */
export const TARGET_FOR: Record<Action, 'item' | 'collection'> = {
  read: 'item', list: 'collection', create: 'collection', replace: 'item', update: 'item', delete: 'item',
};
/** One level of nesting (/users/{id}/orders) is the usual limit. */
export const MAX_DEPTH = 2;

const isRead = (a: Action) => a === 'read' || a === 'list';

function pathFlags(intent: Intent, s: PathShape): Flag[] {
  const out: Flag[] = [];
  const { resource } = intent;
  if (s.verbs.length)
    out.push({ rule: 'verb-in-path', level: 'warn', source: 'convention',
      text: `"${s.verbs.join('", "')}" is a verb in the path. The method is the verb: name the resource and let ${METHOD_FOR[intent.action]} say what happens.` });
  if (s.depth > MAX_DEPTH)
    out.push({ rule: 'too-deep', level: 'warn', source: 'convention',
      text: `Nested ${s.depth} collections deep. Stop at one level (/users/{id}/orders) and give deeper things their own top-level path, like /items/{id}/${resource}.` });
  if (s.resource !== resource)
    out.push({ rule: 'wrong-resource', level: 'bad', source: 'convention',
      text: s.resource
        ? `This path is about "${s.resource}", but the job is about ${resource}: name the collection with its plural noun (/${resource}).`
        : `This path names no resource at all: the job is about ${resource} (/${resource}).` });
  else if (s.kind === 'action')
    out.push({ rule: 'ends-in-action', level: 'bad', source: 'convention',
      text: `The path ends in an action, not a thing. Point it at the ${TARGET_FOR[intent.action] === 'item' ? `one item, /${resource}/{id}` : `collection, /${resource}`}.` });
  else if (TARGET_FOR[intent.action] === 'collection' && s.kind === 'item')
    out.push(intent.action === 'create'
      ? { rule: 'create-on-collection', level: 'bad', source: 'convention',
          text: `Use the collection for create: POST /${resource} → 201 Created + Location: /${resource}/8. The server picks the id, so the client can't name it yet.` }
      : { rule: 'needs-collection', level: 'bad', source: 'convention', text: `A list is the collection itself (/${resource}), not one item.` });
  else if (TARGET_FOR[intent.action] === 'item' && s.kind === 'collection')
    out.push({ rule: 'needs-item', level: 'bad', source: 'convention', text: `This job is about one item, so the path needs its id: /${resource}/{id}.` });
  return out;
}

function methodFlags(intent: Intent, m: Method): Flag[] {
  const a = intent.action;
  if (isRead(a) && !SAFE.has(m))
    return [{ rule: 'read-not-safe', level: 'bad', source: 'RFC 9110',
      text: `A read should be GET. GET is safe (RFC 9110 §9.2.1): caches, prefetchers and retries can treat it as harmless. ${m} tells them the request may change something.` }];
  if (!isRead(a) && SAFE.has(m))
    return [{ rule: 'get-must-be-safe', level: 'bad', source: 'RFC 9110',
      text: `GET must be safe: ${a === 'delete' ? 'deleting' : 'changing data'} on GET lets a crawler or a link prefetcher ${a === 'delete' ? 'delete' : 'change'} data just by following links.` }];
  if (a === 'delete' && m !== 'DELETE')
    return [{ rule: 'delete-method', level: 'bad', source: 'RFC 9110',
      text: `Removing is DELETE, which is idempotent (RFC 9110 §9.2.2): if the response is lost, sending it again is harmless. ${m} says something else.` }];
  if (a === 'update' && m === 'PUT')
    return [{ rule: 'put-replaces', level: 'bad', source: 'RFC 9110',
      text: 'PUT replaces, PATCH changes part. A PUT carrying only the status would replace the whole order with just a status. Send PATCH with the one field.' }];
  if (a === 'replace' && m === 'PATCH')
    return [{ rule: 'patch-for-replace', level: 'warn', source: 'convention',
      text: 'PATCH changes part. For a full replacement PUT says exactly that, and PUT is idempotent (RFC 9110 §9.2.2), so a retry is safe.' }];
  if (a === 'create' && m === 'PUT')
    return [{ rule: 'put-create', level: 'bad', source: 'RFC 9110',
      text: 'PUT means "store this at exactly this URL", so the client would have to choose the id. When the server assigns ids, create with POST to the collection.' }];
  if ((a === 'update' || a === 'replace') && m === 'POST')
    return [{ rule: 'post-not-idempotent', level: 'bad', source: 'RFC 9110',
      text: `POST is neither safe nor idempotent, so a retried POST might apply twice. ${METHOD_FOR[a]} says what this request does${a === 'replace' ? ', and PUT is idempotent' : ''}.` }];
  if (m !== METHOD_FOR[a])
    return [{ rule: 'method-fits', level: 'bad', source: 'convention', text: `${m} doesn't fit this job: use ${METHOD_FOR[a]}.` }];
  return [{ rule: 'method-fits', level: 'ok', source: m === 'PATCH' ? 'convention' : 'RFC 9110', text: FITS[m] ?? `${m} fits this job.` }];
}

const FITS: Partial<Record<Method, string>> = {
  GET: 'GET is safe and idempotent (RFC 9110 §9.2): caches and retries can repeat it freely.',
  POST: 'POST to the collection creates: answer 201 Created with Location: /{collection}/8. POST isn\'t idempotent, so a safe retry needs an idempotency key.',
  PUT: 'PUT replaces the whole resource, and it\'s idempotent (RFC 9110 §9.2.2): sending it twice leaves the same state.',
  PATCH: 'PATCH (RFC 5789) changes part. It isn\'t idempotent in general, though "set status to shipped" happens to be.',
  DELETE: 'DELETE is idempotent (RFC 9110 §9.2.2): a second DELETE leaves the same state, even if it answers 404.',
};

/** Every flag for one choice, worst first. A clean choice gets exactly one ok flag. */
export function validate(intent: Intent, method: Method, s: PathShape): Flag[] {
  const flags = [...pathFlags(intent, s), ...methodFlags(intent, method)];
  const rank: Record<Level, number> = { bad: 0, warn: 1, ok: 2 };
  const problems = flags.filter((f) => f.level !== 'ok');
  const ok = flags.filter((f) => f.level === 'ok').map((f) => ({ ...f, text: f.text.replace('{collection}', intent.resource) }));
  return [...problems.sort((a, b) => rank[a.level] - rank[b.level]), ...(problems.some((f) => f.level === 'bad') ? [] : ok)];
}

/** The worst level among the flags. */
export const verdict = (flags: readonly Flag[]): Level =>
  flags.some((f) => f.level === 'bad') ? 'bad' : flags.some((f) => f.level === 'warn') ? 'warn' : 'ok';

// ── The board ───────────────────────────────────────────────────────────

export interface Endpoint {
  id: string;
  /** The RPC-style original, as shipped. */
  legacy: string;
  /** Where the editor starts: the legacy method and path (any query id moved out). */
  start: { method: Method; path: string };
  intent: Intent;
  /** Path chips offered for this endpoint. */
  paths: readonly string[];
}

export const ENDPOINTS: readonly Endpoint[] = [
  { id: 'get-user', legacy: 'POST /getUser', start: { method: 'POST', path: '/getUser' },
    intent: { action: 'read', resource: 'users', job: "Fetch user 42's profile" }, paths: ['/getUser', '/users', '/users/{id}', '/user/get/{id}'] },
  { id: 'create-order', legacy: 'POST /createOrder', start: { method: 'POST', path: '/createOrder' },
    intent: { action: 'create', resource: 'orders', job: 'Place a new order (the server assigns its id)' }, paths: ['/createOrder', '/orders', '/orders/{id}', '/orders/new'] },
  { id: 'delete-order', legacy: 'GET /deleteOrder?id=7', start: { method: 'GET', path: '/deleteOrder' },
    intent: { action: 'delete', resource: 'orders', job: 'Remove order 7' }, paths: ['/deleteOrder', '/orders', '/orders/{id}', '/orders/{id}/delete'] },
  { id: 'update-status', legacy: 'POST /orders/7/updateStatus', start: { method: 'POST', path: '/orders/{id}/updateStatus' },
    intent: { action: 'update', resource: 'orders', job: 'Mark order 7 as shipped (only the status changes)' }, paths: ['/orders/{id}/updateStatus', '/orders', '/orders/{id}', '/updateOrder'] },
  { id: 'save-profile', legacy: 'POST /saveProfile', start: { method: 'POST', path: '/saveProfile' },
    intent: { action: 'replace', resource: 'users', job: "Replace user 42's whole profile with the one sent" }, paths: ['/saveProfile', '/users', '/users/{id}', '/profiles/save'] },
  { id: 'user-orders', legacy: 'POST /getUserOrders', start: { method: 'POST', path: '/getUserOrders' },
    intent: { action: 'list', resource: 'orders', job: "List user 42's orders" }, paths: ['/getUserOrders', '/users/{id}', '/users/{id}/orders', '/orders/{id}'] },
  { id: 'deep', legacy: 'GET /users/1/orders/7/items/3/reviews', start: { method: 'GET', path: '/users/{id}/orders/{id}/items/{id}/reviews' },
    intent: { action: 'list', resource: 'reviews', job: 'List the reviews of item 3 (nested too deep)' },
    paths: ['/users/{id}/orders/{id}/items/{id}/reviews', '/items/{id}/reviews', '/reviews/{id}', '/items/{id}'] },
];

/** The id each placeholder stands for in an example request. */
const EXAMPLE_IDS: Record<string, string> = { users: '42', orders: '7', items: '3', reviews: '5' };

/** The path with its {id}s filled in, each by the collection before it: /users/{id}/orders → /users/42/orders. */
export function examplePath(s: PathShape): string {
  let prev = '';
  return '/' + s.segs.map((g) => {
    if (g.role !== 'id' || !g.text.startsWith('{')) return (prev = g.text);
    return EXAMPLE_IDS[prev] ?? '1';
  }).join('/');
}

/** The usual success response for a clean choice: status line and headers. */
export function successFor(action: Action, resource: string): string[] {
  switch (action) {
    case 'create': return ['HTTP/1.1 201 Created', `Location: /${resource}/8`, 'Content-Type: application/json'];
    case 'delete': return ['HTTP/1.1 204 No Content'];
    case 'list': return ['HTTP/1.1 200 OK', 'Content-Type: application/json', '', '[ … one page … ]'];
    default: return ['HTTP/1.1 200 OK', 'Content-Type: application/json'];
  }
}

// ── Status codes ────────────────────────────────────────────────────────

export const CODES = [200, 201, 202, 204, 400, 404, 409, 412, 422, 429] as const;
export type Code = (typeof CODES)[number];

/** RFC 9110 / RFC 6585 reason phrases. */
export const REASON: Record<Code, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict',
  412: 'Precondition Failed', 422: 'Unprocessable Content', 429: 'Too Many Requests',
};

/** What each code tells the client, for explaining a wrong pick. */
export const MEANS: Record<Code, string> = {
  200: 'success, with the result in the body',
  201: 'a new resource now exists (its URL goes in Location)',
  202: 'accepted, but the work happens later',
  204: 'success, with nothing in the body',
  400: 'the request itself is malformed (it couldn\'t be parsed)',
  404: 'there is nothing at this URL',
  409: 'it clashes with the resource\'s current state',
  412: 'a precondition the client sent (If-Match) is false',
  422: 'well-formed, but the content fails validation',
  429: 'too many requests: slow down (Retry-After)',
};

export interface StatusScenario {
  id: string;
  request: string;
  situation: string;
  accepted: readonly Code[];
  /** Why the accepted answer fits, shown on a right pick. */
  why: string;
}

export const SCENARIOS: readonly StatusScenario[] = [
  { id: 'created', request: 'POST /orders', situation: 'The order was stored; it now lives at /orders/8.', accepted: [201],
    why: '201 Created, with Location: /orders/8 so the client knows where the new order lives.' },
  { id: 'async', request: 'POST /reports', situation: 'The report will be built by a background job in a few minutes.', accepted: [202],
    why: '202 Accepted: nothing is done yet. Point to a status URL the client can poll.' },
  { id: 'deleted', request: 'DELETE /orders/7', situation: 'The order is gone and there is nothing to send back.', accepted: [204],
    why: '204 No Content: it worked and the body is empty. (200 with a body would also do, if you return something.)' },
  { id: 'malformed', request: 'POST /orders', situation: 'The body is broken JSON: a missing closing brace.', accepted: [400],
    why: '400 Bad Request: the server couldn\'t even parse it. Say what was wrong in a problem-details body.' },
  { id: 'invalid', request: 'POST /orders', situation: 'Valid JSON, but "quantity": -3.', accepted: [422, 400],
    why: '422 Unprocessable Content (or 400: conventions vary): well-formed, but it fails validation. Send a problem-details body naming the field.' },
  { id: 'missing', request: 'GET /orders/999', situation: 'There is no order 999.', accepted: [404],
    why: '404 Not Found: nothing exists at that URL.' },
  { id: 'conflict', request: 'POST /users', situation: 'That email address is already registered.', accepted: [409],
    why: '409 Conflict: the request clashes with the current state (an existing user). The client can change the request and try again.' },
  { id: 'stale', request: 'PUT /orders/7 (If-Match: "v3")', situation: 'Someone saved the order since; it is now "v4".', accepted: [412],
    why: '412 Precondition Failed: the client\'s If-Match no longer matches, so its copy is stale. It should re-read and retry.' },
  { id: 'limited', request: 'GET /orders', situation: 'This client sent 120 requests this minute; the limit is 100.', accepted: [429],
    why: '429 Too Many Requests, with Retry-After saying when to come back.' },
];

export interface StatusJudgement {
  ok: boolean;
  text: string;
}

export function judgeStatus(s: StatusScenario, code: Code): StatusJudgement {
  if (s.accepted.includes(code)) return { ok: true, text: s.why };
  return { ok: false, text: `${code} ${REASON[code]} means ${MEANS[code]}. Not this one: ${s.situation}` };
}

// ── Collections ─────────────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'paid' | 'shipped';
export interface Order {
  id: number;
  status: OrderStatus;
  total: number;
  created_at: string;
}
export const ORDER_FIELDS = ['id', 'status', 'total', 'created_at'] as const;
export type OrderField = (typeof ORDER_FIELDS)[number];

/** A small fixed orders table for the collection panel. */
export const ORDERS: readonly Order[] = [
  { id: 1, status: 'shipped', total: 42, created_at: '2026-10-01T09:12Z' },
  { id: 2, status: 'paid', total: 18, created_at: '2026-10-01T11:40Z' },
  { id: 3, status: 'pending', total: 95, created_at: '2026-10-02T08:05Z' },
  { id: 4, status: 'paid', total: 64, created_at: '2026-10-02T15:30Z' },
  { id: 5, status: 'shipped', total: 12, created_at: '2026-10-03T10:00Z' },
  { id: 6, status: 'paid', total: 230, created_at: '2026-10-04T13:22Z' },
  { id: 7, status: 'pending', total: 7, created_at: '2026-10-05T17:45Z' },
];

export type SortKey = '-created_at' | 'created_at' | '-total';
export interface OrderQuery {
  status: OrderStatus | null;
  sort: SortKey;
  /** Empty: every field (the parameter is left out). */
  fields: readonly OrderField[];
}

/** The query string, parameters in a fixed order; filters, then sort, then fields. */
export function queryString(q: OrderQuery): string {
  const params = [
    q.status ? `status=${q.status}` : null,
    `sort=${q.sort}`,
    q.fields.length ? `fields=${ORDER_FIELDS.filter((f) => q.fields.includes(f)).join(',')}` : null,
  ].filter(Boolean);
  return `/orders?${params.join('&')}`;
}

/** Runs the query on the table: filter, sort (ties broken by id), then keep only the asked-for fields. */
export function runQuery(rows: readonly Order[], q: OrderQuery): Partial<Order>[] {
  const desc = q.sort.startsWith('-');
  const key = q.sort.replace('-', '') as 'created_at' | 'total';
  const sorted = rows
    .filter((r) => q.status === null || r.status === q.status)
    .sort((a, b) => {
      const c = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : a.id - b.id;
      return desc ? -c : c;
    });
  const keep = q.fields.length ? ORDER_FIELDS.filter((f) => q.fields.includes(f)) : ORDER_FIELDS;
  return sorted.map((r) => Object.fromEntries(keep.map((f) => [f, r[f]])) as Partial<Order>);
}

// ── Error bodies ────────────────────────────────────────────────────────

/** An RFC 9457 problem-details body for the quantity -3 case. */
export const PROBLEM = {
  type: 'https://example.com/problems/invalid-quantity',
  title: 'Quantity must be at least 1',
  status: 422,
  detail: 'quantity was -3; an order line needs 1 or more',
  instance: '/orders/requests/4821',
} as const;

export const problemResponse = (): string[] => [
  `HTTP/1.1 ${PROBLEM.status} ${REASON[PROBLEM.status]}`,
  'Content-Type: application/problem+json',
  '',
  ...JSON.stringify(PROBLEM, null, 2).split('\n'),
];

export const adHocResponse = (): string[] => ['HTTP/1.1 200 OK', 'Content-Type: application/json', '', '{ "error": true }'];
