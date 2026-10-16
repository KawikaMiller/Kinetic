/**
 * The reflection scene's real JavaScript, on fixed lesson code only: a plain object read through a real Proxy
 * whose traps log what they see, and three ways to serialise the same object. Nothing the learner types runs.
 */
export type FieldId = 'email' | 'admin' | 'score';
export type Obj = Record<string, unknown>;

export const BASE: Obj = { name: 'Ada', age: 36 };
export const EXTRA: Record<FieldId, unknown> = { email: 'ada@example.com', admin: true, score: 9.5 };
export const FIELD_IDS: FieldId[] = ['email', 'admin', 'score'];

/** The object with the chosen extra fields added, in the order they were added. */
export const objectWith = (added: readonly FieldId[]): Obj => ({ ...BASE, ...Object.fromEntries(added.map((f) => [f, EXTRA[f]])) });

export interface TrapEvent {
  trap: 'get' | 'has' | 'ownKeys';
  key: string | null;
}

export type ProbeId = 'read-name' | 'read-email' | 'has-age' | 'object-keys' | 'reflect-own-keys';

export interface ProbeSpec {
  id: ProbeId;
  label: string;
  /** The line of code that runs, shown as written. */
  code: string;
  run: (proxy: Obj) => unknown;
}

export const PROBES: ProbeSpec[] = [
  { id: 'read-name', label: 'read name', code: 'proxy.name', run: (p) => p.name },
  { id: 'read-email', label: 'read email', code: 'proxy.email', run: (p) => p.email },
  { id: 'has-age', label: "'age' in", code: "'age' in proxy", run: (p) => 'age' in p },
  { id: 'object-keys', label: 'Object.keys', code: 'Object.keys(proxy)', run: (p) => Object.keys(p) },
  { id: 'reflect-own-keys', label: 'Reflect.ownKeys', code: 'Reflect.ownKeys(proxy)', run: (p) => Reflect.ownKeys(p) },
];

export interface ProbeResult {
  /** The value the line returned, as JSON (undefined shown as the word). */
  value: string;
  log: TrapEvent[];
}

/** Run one probe on a fresh Proxy over a copy of the object, logging every interception the real traps see. */
export function probe(spec: ProbeSpec, target: Obj): ProbeResult {
  const log: TrapEvent[] = [];
  const proxy = new Proxy({ ...target }, {
    get(t, key, receiver) {
      log.push({ trap: 'get', key: String(key) });
      return Reflect.get(t, key, receiver);
    },
    has(t, key) {
      log.push({ trap: 'has', key: String(key) });
      return Reflect.has(t, key);
    },
    ownKeys(t) {
      log.push({ trap: 'ownKeys', key: null });
      return Reflect.ownKeys(t);
    },
  });
  const value = spec.run(proxy);
  return { value: value === undefined ? 'undefined' : JSON.stringify(value), log };
}

export const trapText = (e: TrapEvent) => (e.key === null ? `${e.trap}()` : `${e.trap}('${e.key}')`);

// ── Three serialisers ───────────────────────────────────────────────

/** Walks the keys at run time, so it sees every field the object has now. */
export const reflective = (o: Obj): string => `{${Object.keys(o).map((k) => `${JSON.stringify(k)}:${JSON.stringify(o[k])}`).join(',')}}`;

/** "Code generation": the field list is read once, when this is called (the build step), and frozen into the returned function. */
export function generate(o: Obj): { fields: string[]; serialise: (o: Obj) => string } {
  const fields = Object.keys(o);
  return { fields, serialise: (x) => `{${fields.map((k) => `${JSON.stringify(k)}:${JSON.stringify(x[k])}`).join(',')}}` };
}

/** Hand-written: each field is named in the code, and a new field needs a new line (the `edited` flags stand for those edits). */
export const handWritten = (edited: readonly FieldId[]) => (o: Obj): string => {
  const parts = [`"name":${JSON.stringify(o.name)}`, `"age":${JSON.stringify(o.age)}`];
  // A new line goes where the field sits in the object, so the edited fields come out in the object's own order.
  for (const key of Object.keys(o)) if (FIELD_IDS.includes(key as FieldId) && edited.includes(key as FieldId)) parts.push(`${JSON.stringify(key)}:${JSON.stringify(o[key])}`);
  return `{${parts.join(',')}}`;
};
