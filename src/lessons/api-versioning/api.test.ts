import { describe, expect, it } from 'vitest';
import { BASE_API, CHANGES, CLIENTS, CLASS_LABEL, DEFAULT_NAME, classify, matrix, parseFieldName, respond, responseLines, rowFor, type ChangeClass, type ChangeId, type ClientId, type Status } from './api';

const O: Status = 'ok';
const C: Status = 'changed';
const B: Status = 'broken';

/**
 * The 36 cells, worked out by hand from what each client reads, in the order mobile, partner, web, batch.
 * - mobile reads name and email only; partner insists on exactly id, name, email, created, plan with their types;
 *   web formats id with toFixed, reads name, and expects 404 for a missing user; batch asks for 3 users, takes
 *   Number(id) and the first two values of each object.
 */
const EXPECTED: Record<ChangeId, [Status, Status, Status, Status]> = {
  'add-field': [O, B, O, O],
  'required-param': [B, B, B, B],
  'remove-field': [B, B, O, O],
  'rename-field': [B, B, B, O],
  'change-type': [O, B, B, O],
  tighten: [O, O, O, B],
  sort: [O, O, O, C],
  'error-code': [O, O, B, O],
  'key-order': [O, O, O, C],
};
const CLASSES: Record<ChangeId, ChangeClass> = {
  'add-field': 'strict-only',
  'required-param': 'breaking',
  'remove-field': 'breaking',
  'rename-field': 'breaking',
  'change-type': 'breaking',
  tighten: 'breaking',
  sort: 'silent',
  'error-code': 'breaking',
  'key-order': 'silent',
};
const ORDER: ClientId[] = ['mobile', 'partner', 'web', 'batch'];

describe('the compatibility matrix is really run', () => {
  const rows = matrix(DEFAULT_NAME);

  it('has nine changes and four clients', () => {
    expect(rows).toHaveLength(9);
    expect(CLIENTS.map((c) => c.id)).toEqual(ORDER);
  });

  it('matches the hand-authored 36 cells', () => {
    for (const row of rows) expect(ORDER.map((id) => row.cells[id].status), row.change.id).toEqual(EXPECTED[row.change.id]);
  });

  it('classifies each change from which clients broke', () => {
    for (const row of rows) expect(row.cls, row.change.id).toBe(CLASSES[row.change.id]);
    expect(Object.keys(CLASS_LABEL).sort()).toEqual(['breaking', 'safe', 'silent', 'strict-only']);
  });

  it('counts the broken clients per row', () => {
    for (const row of rows) expect(row.broken).toBe(EXPECTED[row.change.id].filter((s) => s === B).length);
  });

  it('adding a field breaks only the strict client, and the reason names the property', () => {
    const row = rowFor(CHANGES[0], 'nickname');
    expect(row.cells.partner).toEqual({ status: 'broken', reason: 'unexpected property nickname' });
    expect(row.cells.mobile.status).toBe('ok');
  });

  it('gives each break the reason the client itself threw', () => {
    const byId = (id: ChangeId) => rows.find((r) => r.change.id === id)!;
    expect(byId('rename-field').cells.mobile.reason).toBe('user.name is undefined');
    expect(byId('remove-field').cells.mobile.reason).toBe('user.email is undefined');
    expect(byId('change-type').cells.web.reason).toBe('user.id.toFixed is not a function');
    expect(byId('change-type').cells.partner.reason).toBe('id should be a number, got a string');
    expect(byId('error-code').cells.web.reason).toBe('unexpected status 410 for a missing user');
    expect(byId('tighten').cells.batch.reason).toBe('HTTP 422: {"error":"limit_too_large","max":2}');
    expect(byId('required-param').cells.web.reason).toBe('HTTP 400: {"error":"missing_param","param":"region"}');
  });

  it('describes a changed result with the before and after values', () => {
    const sort = rows.find((r) => r.change.id === 'sort')!.cells.batch.reason;
    expect(sort).toContain('"ids":[41,42,43]');
    expect(sort).toContain('"ids":[42,41,43]');
  });

  it('a changed behaviour is never reported as a break, and nothing is both', () => {
    for (const row of rows) for (const id of ORDER) expect(['ok', 'changed', 'broken']).toContain(row.cells[id].status);
    expect(rows.filter((r) => ORDER.some((id) => r.cells[id].status === 'changed')).map((r) => r.change.id)).toEqual(['sort', 'key-order']);
  });
});

describe('the typed name', () => {
  it('any valid name leaves the add and rename rows as they are', () => {
    for (const name of ['a', 'full_name', 'x'.repeat(20), '_']) {
      expect(ORDER.map((id) => rowFor(CHANGES[0], name).cells[id].status)).toEqual(EXPECTED['add-field']);
      expect(ORDER.map((id) => rowFor(CHANGES[3], name).cells[id].status)).toEqual(EXPECTED['rename-field']);
    }
  });

  it('accepts a-z and underscore, 1 to 20, and refuses the rest with a reason', () => {
    for (const ok of ['nickname', 'a', 'full_name', 'a'.repeat(20)]) expect(parseFieldName(ok).ok, ok).toBe(true);
    for (const bad of ['', 'Nick', 'nick name', 'nick1', 'a'.repeat(21), 'nick-name', '__proto__x1', '<b>', 'né']) expect(parseFieldName(bad).ok, bad).toBe(false);
    expect(parseFieldName('email')).toEqual({ ok: false, error: 'email is already a field.' });
  });

  it('a name like __proto__ is a plain key: the partner client names it as unexpected and nothing else is touched', () => {
    const body = '{"id":42,"name":"Ada","email":"a","created":"c","plan":"p","__proto__":{"admin":true}}';
    const partner = CLIENTS.find((c) => c.id === 'partner')!;
    expect(() => partner.call(() => ({ status: 200, body }))).toThrow('unexpected property __proto__');
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });
});

describe('the server', () => {
  it('serves the base API: user 42, a sorted list, a 404', () => {
    expect(respond(BASE_API, '/users/42')).toEqual({ status: 200, body: '{"id":42,"name":"Ada","email":"ada@example.com","created":"2026-01-05","plan":"pro"}' });
    expect(JSON.parse(respond(BASE_API, '/users?limit=3').body).users.map((u: { id: number }) => u.id)).toEqual([41, 42, 43]);
    expect(respond(BASE_API, '/users/999').status).toBe(404);
    expect(respond(BASE_API, '/nowhere').status).toBe(404);
  });

  it('shows the before and after JSON of a change line by line', () => {
    const before = responseLines(BASE_API, '/users/42');
    const after = responseLines({ ...BASE_API, extraField: 'nickname' }, '/users/42');
    expect(before[0]).toBe('HTTP 200');
    expect(after.filter((l) => !before.includes(l))).toEqual(['  "plan": "pro",', '  "nickname": "ace"']);
  });
});

describe('a broken classifier is caught', () => {
  /** Calling every changed row "breaking" would mislabel the silent ones: the matrix shows which. */
  it('the two silent rows are not breaking, and classify says so', () => {
    const row = rowFor(CHANGES[6], DEFAULT_NAME);
    expect(classify(row.cells)).toBe('silent');
    expect(row.broken).toBe(0);
  });
});
