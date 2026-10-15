/**
 * Scene 1 of api-versioning: a tiny user API, nine ways to change it, and four invented clients that
 * really call it. A client's function is plain TypeScript run against the server's real JSON text with
 * `JSON.parse`; a change "breaks" a client when that function throws, and "changes behaviour" when it
 * returns something different from what it returned against the old API.
 *
 * Breaking is therefore a property of a (change, client) pair, not of the change alone.
 */

export interface ApiConfig {
  /** An optional field added to every user (its name), or null. */
  extraField: string | null;
  /** The server now insists on a `region` query parameter. */
  requireRegion: boolean;
  omitEmail: boolean;
  /** What the `name` field is called. */
  nameKey: string;
  idAsString: boolean;
  /** Largest `limit` the list endpoint accepts. */
  limitMax: number;
  sort: 'id' | 'created-desc';
  /** The status of a request for a user that does not exist. */
  missingStatus: 404 | 410;
  keyOrder: 'default' | 'name-first';
}

export const BASE_API: ApiConfig = {
  extraField: null,
  requireRegion: false,
  omitEmail: false,
  nameKey: 'name',
  idAsString: false,
  limitMax: 100,
  sort: 'id',
  missingStatus: 404,
  keyOrder: 'default',
};

export const LIST_LIMIT_NOW = 3;
export const TIGHT_LIMIT_MAX = 2;

const USERS = [
  { id: 41, name: 'Grace', email: 'grace@example.com', created: '2026-01-02', plan: 'free' },
  { id: 42, name: 'Ada', email: 'ada@example.com', created: '2026-01-05', plan: 'pro' },
  { id: 43, name: 'Linus', email: 'linus@example.com', created: '2025-12-20', plan: 'free' },
];

/** The keys of a user in the base API: a typed new name may not repeat one. */
export const BASE_KEYS = ['id', 'name', 'email', 'created', 'plan'] as const;

export interface Response {
  status: number;
  body: string;
}
export type Call = (path: string) => Response;

function userObject(u: (typeof USERS)[number], api: ApiConfig): Record<string, unknown> {
  const fields: [string, unknown][] = [
    ['id', api.idAsString ? String(u.id) : u.id],
    [api.nameKey, u.name],
    ...(api.omitEmail ? [] : [['email', u.email] as [string, unknown]]),
    ['created', u.created],
    ['plan', u.plan],
    ...(api.extraField ? [[api.extraField, 'ace'] as [string, unknown]] : []),
  ];
  if (api.keyOrder === 'name-first') fields.unshift(...fields.splice(1, 1));
  return Object.fromEntries(fields);
}

const json = (status: number, value: unknown): Response => ({ status, body: JSON.stringify(value) });

/** The server: real routing over a three-user table, answering with JSON text. */
export function respond(api: ApiConfig, path: string): Response {
  const url = new URL(path, 'http://api.example');
  if (api.requireRegion && !url.searchParams.has('region')) return json(400, { error: 'missing_param', param: 'region' });
  const one = /^\/users\/(\d+)$/.exec(url.pathname);
  if (one) {
    const u = USERS.find((x) => x.id === Number(one[1]));
    return u ? json(200, userObject(u, api)) : json(api.missingStatus, { error: 'not_found' });
  }
  if (url.pathname === '/users') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    if (limit > api.limitMax) return json(422, { error: 'limit_too_large', max: api.limitMax });
    const sorted = [...USERS].sort((a, b) => (api.sort === 'id' ? a.id - b.id : b.created.localeCompare(a.created)));
    return json(200, { users: sorted.slice(0, limit).map((u) => userObject(u, api)) });
  }
  return json(404, { error: 'no_such_route' });
}

// ── The four clients ────────────────────────────────────────────────────

export type ClientId = 'mobile' | 'partner' | 'web' | 'batch';

const expectOk = (res: Response) => {
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.body}`);
};

const PARTNER_SCHEMA: Record<string, string> = { id: 'number', name: 'string', email: 'string', created: 'string', plan: 'string' };

export const CLIENTS: { id: ClientId; label: string; role: string; call: (call: Call) => unknown; source: string[] }[] = [
  {
    id: 'mobile',
    label: 'Mobile app',
    role: 'a tolerant reader: takes name and email, ignores the rest',
    call: (call) => {
      const res = call('/users/42');
      expectOk(res);
      const user = JSON.parse(res.body);
      if (typeof user.name !== 'string') throw new Error('user.name is undefined');
      if (typeof user.email !== 'string') throw new Error('user.email is undefined');
      return { title: `${user.name} <${user.email}>` };
    },
    source: [
      'const user = JSON.parse((await get("/users/42")).body);',
      'if (typeof user.name !== "string") throw new Error("user.name is undefined");',
      'if (typeof user.email !== "string") throw new Error("user.email is undefined");',
      'return { title: `${user.name} <${user.email}>` };',
    ],
  },
  {
    id: 'partner',
    label: 'Partner integration',
    role: 'a strict reader: validates the response against a closed schema',
    call: (call) => {
      const res = call('/users/42');
      expectOk(res);
      const user = JSON.parse(res.body);
      for (const key of Object.keys(user)) {
        if (!Object.hasOwn(PARTNER_SCHEMA, key)) throw new Error(`unexpected property ${key}`);
      }
      for (const [key, type] of Object.entries(PARTNER_SCHEMA)) {
        if (!Object.hasOwn(user, key)) throw new Error(`missing property ${key}`);
        if (typeof user[key] !== type) throw new Error(`${key} should be a ${type}, got a ${typeof user[key]}`);
      }
      return { accepted: user.id };
    },
    source: [
      'const user = JSON.parse((await get("/users/42")).body);',
      'for (const key of Object.keys(user)) if (!(key in SCHEMA)) throw new Error(`unexpected property ${key}`);',
      'for (const [key, type] of Object.entries(SCHEMA)) { /* present, and typeof matches */ }',
      'return { accepted: user.id };',
    ],
  },
  {
    id: 'web',
    label: 'Web page',
    role: 'formats id, name and created, and shows "No such user" on a 404',
    call: (call) => {
      const res = call('/users/42');
      expectOk(res);
      const user = JSON.parse(res.body);
      if (typeof user.name !== 'string') throw new Error('user.name is undefined');
      const label = `#${user.id.toFixed(0).padStart(5, '0')} ${user.name} (joined ${user.created})`;
      const missing = call('/users/999');
      if (missing.status !== 404) throw new Error(`unexpected status ${missing.status} for a missing user`);
      return { label, missing: 'No such user' };
    },
    source: [
      'const user = JSON.parse((await get("/users/42")).body);',
      'const label = `#${user.id.toFixed(0).padStart(5, "0")} ${user.name} (joined ${user.created})`;',
      'if ((await get("/users/999")).status !== 404) throw new Error("unexpected status");',
      'return { label, missing: "No such user" };',
    ],
  },
  {
    id: 'batch',
    label: 'Batch job',
    role: 'asks for 3 users and relies on the default sort and on id, name coming first',
    call: (call) => {
      const res = call(`/users?limit=${LIST_LIMIT_NOW}`);
      expectOk(res);
      const { users } = JSON.parse(res.body);
      return { ids: users.map((u: { id: unknown }) => Number(u.id)), rows: users.map((u: object) => Object.values(u).slice(0, 2).join(',')) };
    },
    source: [
      'const { users } = JSON.parse((await get("/users?limit=3")).body);',
      'const ids = users.map((u) => Number(u.id));',
      'const rows = users.map((u) => Object.values(u).slice(0, 2).join(","));',
      'return { ids, rows };  // assumes sorted by id, and id and name are the first two values',
    ],
  },
];

export type Status = 'ok' | 'changed' | 'broken';

export interface Cell {
  status: Status;
  /** Why, from the run: the error the client threw, or what its result became. */
  reason: string;
}

type Run = { result: string } | { error: string };

function run(client: (typeof CLIENTS)[number], api: ApiConfig): Run {
  try {
    return { result: JSON.stringify(client.call((path) => respond(api, path))) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Run one client against the old API and the new one and say what became of it. */
export function judgeClient(client: (typeof CLIENTS)[number], next: ApiConfig): Cell {
  const before = run(client, BASE_API);
  if ('error' in before) throw new Error(`${client.id} fails against the base API: ${before.error}`);
  const after = run(client, next);
  if ('error' in after) return { status: 'broken', reason: after.error };
  if (after.result === before.result) return { status: 'ok', reason: 'same result as before' };
  return { status: 'changed', reason: `result changed from ${before.result} to ${after.result}` };
}

// ── The nine changes ────────────────────────────────────────────────────

export type ChangeId = 'add-field' | 'required-param' | 'remove-field' | 'rename-field' | 'change-type' | 'tighten' | 'sort' | 'error-code' | 'key-order';

export interface Change {
  id: ChangeId;
  label: string;
  /** Uses the typed field name. */
  usesName: boolean;
  /** A request to show before and after. */
  show: string;
  apply: (name: string) => ApiConfig;
}

export const CHANGES: Change[] = [
  { id: 'add-field', label: 'Add an optional response field', usesName: true, show: '/users/42', apply: (name) => ({ ...BASE_API, extraField: name }) },
  { id: 'required-param', label: 'Add a required request field', usesName: false, show: '/users/42', apply: () => ({ ...BASE_API, requireRegion: true }) },
  { id: 'remove-field', label: 'Remove a response field (email)', usesName: false, show: '/users/42', apply: () => ({ ...BASE_API, omitEmail: true }) },
  { id: 'rename-field', label: 'Rename a field (name)', usesName: true, show: '/users/42', apply: (name) => ({ ...BASE_API, nameKey: name }) },
  { id: 'change-type', label: 'Change a type (id to a string)', usesName: false, show: '/users/42', apply: () => ({ ...BASE_API, idAsString: true }) },
  { id: 'tighten', label: 'Tighten validation (limit)', usesName: false, show: `/users?limit=${LIST_LIMIT_NOW}`, apply: () => ({ ...BASE_API, limitMax: TIGHT_LIMIT_MAX }) },
  { id: 'sort', label: 'Change the default sort order', usesName: false, show: `/users?limit=${LIST_LIMIT_NOW}`, apply: () => ({ ...BASE_API, sort: 'created-desc' }) },
  { id: 'error-code', label: 'Change an error code (404 to 410)', usesName: false, show: '/users/999', apply: () => ({ ...BASE_API, missingStatus: 410 }) },
  { id: 'key-order', label: 'Reorder object keys', usesName: false, show: '/users/42', apply: () => ({ ...BASE_API, keyOrder: 'name-first' }) },
];

export const DEFAULT_NAME = 'nickname';

/** What a typed field name must be: 1 to 20 of a-z and underscore, and not one the API already has. */
export function parseFieldName(text: string): { ok: true; value: string } | { ok: false; error: string } {
  if (!/^[a-z_]{1,20}$/.test(text)) return { ok: false, error: 'Use 1 to 20 lowercase letters or underscores.' };
  if ((BASE_KEYS as readonly string[]).includes(text)) return { ok: false, error: `${text} is already a field.` };
  return { ok: true, value: text };
}

export type ChangeClass = 'safe' | 'silent' | 'strict-only' | 'breaking';

export const CLASS_LABEL: Record<ChangeClass, string> = {
  safe: 'safe for these clients',
  silent: 'silent behaviour change',
  'strict-only': 'breaks a strict reader only',
  breaking: 'breaking',
};

export interface Row {
  change: Change;
  cells: Record<ClientId, Cell>;
  broken: number;
  cls: ChangeClass;
}

/** A change's class, derived from which clients broke (and which changed behaviour). */
export function classify(cells: Record<ClientId, Cell>): ChangeClass {
  const broken = CLIENTS.filter((c) => cells[c.id].status === 'broken').map((c) => c.id);
  if (broken.length === 0) return CLIENTS.some((c) => cells[c.id].status === 'changed') ? 'silent' : 'safe';
  return broken.every((id) => id === 'partner') ? 'strict-only' : 'breaking';
}

export function rowFor(change: Change, name: string): Row {
  const next = change.apply(name);
  const cells = Object.fromEntries(CLIENTS.map((c) => [c.id, judgeClient(c, next)])) as Record<ClientId, Cell>;
  return { change, cells, broken: CLIENTS.filter((c) => cells[c.id].status === 'broken').length, cls: classify(cells) };
}

/** What each sortable column of the matrix reads from a row: text sorts as text, the count as a number. */
export const ROW_COLUMNS = {
  change: (r: Row) => r.change.label,
  broken: (r: Row) => r.broken,
  kind: (r: Row) => CLASS_LABEL[r.cls],
};

/** Every change run against every client: 9 x 4 real runs. */
export const matrix = (name: string): Row[] => CHANGES.map((c) => rowFor(c, name));

/** A response as the learner reads it: status line, then the JSON pretty-printed one key per line. */
export function responseLines(api: ApiConfig, path: string): string[] {
  const res = respond(api, path);
  return [`HTTP ${res.status}`, ...JSON.stringify(JSON.parse(res.body), null, 2).split('\n')];
}
