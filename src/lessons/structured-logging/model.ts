import { mulberry32 } from '../../core/random';
import { fakeSecret } from '../../core/fakeSecret';
import type { Tone } from '../../core/tone';

/**
 * Ten concurrent checkout requests fan out gateway -> orders -> inventory + payments, and one of
 * them fails in payments. Everything here is simulated: the services, the timings and the card
 * number. The sim knows which request each line belongs to (`requestIdx`), which is the ground
 * truth the text search and the structured filter are scored against.
 */

export const SERVICES = ['gateway', 'orders', 'payments', 'inventory'] as const;
export type Service = (typeof SERVICES)[number];
export const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
export type Level = (typeof LEVELS)[number];
export const levelRank = (l: Level) => LEVELS.indexOf(l);

/** Each service's categorical hue (none of them a status colour). */
export const SERVICE_TONE: Record<Service, Tone> = { gateway: 'sky', orders: 'amber', payments: 'pink', inventory: 'violet' };

export const REQUEST_COUNT = 10;
export const DEFAULT_SEED = 7;
/** The failed request's user, and a second request from the same user that succeeded. */
export const FAILED_USER = 42;
/** A different user whose id merely starts with the same digits. */
export const LOOKALIKE_USER = 421;
export const PAYMENT_TIMEOUT_MS = 3000;
/** The log's fictional start: 2026-03-10 09:14:00 UTC. */
const BASE_MS = Date.UTC(2026, 2, 10, 9, 14, 0);
const REQUEST_SPACING_MS = 22;
const FIRST_ORDER_ID = 1001;
/** Requests 0 and 1 are the lookalike users', so the failed request is a later one (and not among the last two, which start after most traffic has finished). */
const FIRST_FAILABLE = 2;

/** The fake card number, assembled at run time so no source literal looks like one. */
export const FAKE_CARD = fakeSecret('4242', ' 4242', ' 4242', ' 4242');
const FAKE_EXPIRY = '12/30';

/** The dumps DEBUG lines carry (made-up, ordinary values): this is what makes debug logging expensive. */
const DEBUG_DETAIL = {
  headers: 'headers={"host":"shop.example.test","accept":"application/json","content-type":"application/json","x-forwarded-for":"203.0.113.7","user-agent":"demo-client/1.0","accept-language":"en-US","content-length":"612"}',
  cart: 'cart=[{"sku":"A-100","qty":1,"unit_cents":1200},{"sku":"B-220","qty":2,"unit_cents":450},{"sku":"C-310","qty":1,"unit_cents":2900}]',
  query: 'query="SELECT sku, on_hand, reserved FROM stock WHERE sku IN (?, ?, ?) ORDER BY sku" params=["A-100","B-220","C-310"] rows=3',
  charge: 'payload={"amount_cents":5000,"currency":"EUR","capture":true,"description":"checkout","metadata":{"channel":"web","retry":0}}',
  pool: 'pool_stats={"max":10,"idle":4,"active":1,"waiting":0,"created_total":812,"closed_total":801}',
  commit: 'statements=5 rows_written=7 isolation="read committed" locks_held=0 wal_bytes=1480',
} as const;

export interface ChargeBody {
  card_number: string;
  exp: string;
  amount_cents: number;
}

export interface LogEvent {
  seq: number;
  /** Milliseconds since the start of the log. */
  ts: number;
  level: Level;
  service: Service;
  /** The sentence a person wrote in free-text mode. */
  text: string;
  /** The constant event name in structured mode: the variable parts live in fields. */
  msg: string;
  /** Which request this line belongs to, or null for background noise. Ground truth only: never printed. */
  requestIdx: number | null;
  requestId?: string;
  orderId?: number;
  userId?: number;
  durationMs?: number;
  body?: ChargeBody;
  /** What a DEBUG line dumps: headers, a cart, a query. Most of why debug is expensive. */
  detail?: string;
}

export interface Run {
  seed: number;
  events: LogEvent[];
  requestIds: string[];
  failedIdx: number;
  failedId: string;
  failedOrderId: number;
  orderIds: number[];
}

export interface RunOptions {
  /** Add a line that logs the whole charge request body. */
  logBody?: boolean;
}

type Draft = Omit<LogEvent, 'seq'>;

/** One request's lines, in the order the services write them. */
function requestEvents(idx: number, start: number, orderId: number, userId: number, requestId: string, fails: boolean, rnd: () => number, logBody: boolean): Draft[] {
  const jitter = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const out: Draft[] = [];
  /** The gateway never learns the order id: only the request id travels through every service. */
  const add = (dt: number, d: Omit<Draft, 'requestIdx' | 'requestId' | 'ts' | 'orderId'>) =>
    out.push({ ...d, ts: start + dt, requestIdx: idx, requestId, orderId: d.service === 'gateway' ? undefined : orderId });

  const reserveMs = jitter(6, 14);
  const chargeMs = fails ? PAYMENT_TIMEOUT_MS : jitter(40, 70);
  const total = 36 + reserveMs + chargeMs + jitter(4, 10);
  const chargeStart = 31;
  const chargeEnd = chargeStart + chargeMs;

  add(0, { level: 'INFO', service: 'gateway', text: 'Received checkout request', msg: 'request received' });
  add(1, { level: 'DEBUG', service: 'gateway', text: 'Parsed headers and body', msg: 'headers parsed', detail: DEBUG_DETAIL.headers });
  add(8, { level: 'INFO', service: 'orders', text: `Processing order for user ${userId}...`, msg: 'processing order', userId });
  add(9, { level: 'DEBUG', service: 'orders', text: 'Loaded cart', msg: 'cart loaded', detail: DEBUG_DETAIL.cart });
  add(14, { level: 'DEBUG', service: 'inventory', text: 'Stock lookup', msg: 'stock lookup', detail: DEBUG_DETAIL.query });
  add(22, { level: 'INFO', service: 'inventory', text: `Reserved stock for order ${orderId}`, msg: 'stock reserved', durationMs: reserveMs });
  add(chargeStart - 1, { level: 'DEBUG', service: 'payments', text: 'Built charge request', msg: 'charge built', detail: DEBUG_DETAIL.charge });
  add(chargeStart, { level: 'INFO', service: 'payments', text: `Charging card for order ${orderId}`, msg: 'charging card' });
  if (logBody) {
    const body: ChargeBody = { card_number: FAKE_CARD, exp: FAKE_EXPIRY, amount_cents: 1000 + idx * 250 };
    add(chargeStart + 1, { level: 'INFO', service: 'payments', text: `Charge request body ${JSON.stringify(body)}`, msg: 'charge request body', body });
  }
  if (fails) {
    add(chargeEnd, { level: 'ERROR', service: 'payments', text: `Charge failed: upstream timeout after ${PAYMENT_TIMEOUT_MS} ms`, msg: 'charge failed: upstream timeout', durationMs: chargeMs });
    add(chargeEnd + 2, { level: 'WARN', service: 'orders', text: `Payment failed, releasing stock for order ${orderId}`, msg: 'payment failed, releasing stock' });
    add(chargeEnd + 5, { level: 'INFO', service: 'inventory', text: `Released stock for order ${orderId}`, msg: 'stock released' });
    add(chargeEnd + 6, { level: 'ERROR', service: 'gateway', text: `Responded 502 in ${total} ms`, msg: 'responded 502', durationMs: total });
  } else {
    add(chargeEnd, { level: 'INFO', service: 'payments', text: 'Charge succeeded', msg: 'charge succeeded', durationMs: chargeMs });
    add(chargeEnd + 1, { level: 'DEBUG', service: 'payments', text: 'Closed connection to card processor', msg: 'processor connection closed', detail: DEBUG_DETAIL.pool });
    add(chargeEnd + 3, { level: 'INFO', service: 'orders', text: `Order ${orderId} confirmed`, msg: 'order confirmed' });
    add(chargeEnd + 4, { level: 'DEBUG', service: 'orders', text: 'Committed transaction', msg: 'transaction committed', detail: DEBUG_DETAIL.commit });
    add(chargeEnd + 6, { level: 'INFO', service: 'gateway', text: `Responded 201 in ${total} ms`, msg: 'responded 201', durationMs: total });
  }
  return out;
}

/**
 * The users. Request 0 is the failed user's earlier, successful request, request 1 belongs to a
 * different user whose id merely starts with the same digits, and the failed request is never
 * one of those two.
 */
function pickUsers(failedIdx: number, rnd: () => number): number[] {
  const users = Array.from({ length: REQUEST_COUNT }, () => {
    let u: number;
    do u = 100 + Math.floor(rnd() * 900);
    while (String(u).startsWith(String(FAILED_USER)));
    return u;
  });
  users[0] = FAILED_USER;
  users[1] = LOOKALIKE_USER;
  users[failedIdx] = FAILED_USER;
  return users;
}

export function makeRun(seed = DEFAULT_SEED, { logBody = false }: RunOptions = {}): Run {
  const rnd = mulberry32(seed);
  const failedIdx = FIRST_FAILABLE + Math.floor(rnd() * (REQUEST_COUNT - FIRST_FAILABLE - 2));
  const users = pickUsers(failedIdx, rnd);
  const requestIds: string[] = [];
  while (requestIds.length < REQUEST_COUNT) {
    const id = `req-${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0')}`;
    if (!requestIds.includes(id)) requestIds.push(id);
  }
  const orderIds = Array.from({ length: REQUEST_COUNT }, (_, i) => FIRST_ORDER_ID + i);
  const drafts: Draft[] = [];
  for (let i = 0; i < REQUEST_COUNT; i++) {
    const start = i * REQUEST_SPACING_MS + Math.floor(rnd() * 12);
    drafts.push(...requestEvents(i, start, orderIds[i], users[i], requestIds[i], i === failedIdx, rnd, logBody));
  }
  drafts.push(
    { ts: 71, level: 'INFO', service: 'payments', text: 'Health check ok', msg: 'health check ok', requestIdx: null },
    { ts: 133, level: 'ERROR', service: 'inventory', text: 'Cache refresh failed: connection reset', msg: 'cache refresh failed: connection reset', requestIdx: null },
  );
  drafts.sort((a, b) => a.ts - b.ts);
  const events = drafts.map((d, seq) => ({ ...d, seq }));
  return { seed, events, requestIds, failedIdx, failedId: requestIds[failedIdx], failedOrderId: orderIds[failedIdx], orderIds };
}

// ── Rendering a line ────────────────────────────────────────────────────

const clockOf = (ts: number) => new Date(BASE_MS + ts).toISOString().slice(11, 23);
const isoOf = (ts: number) => new Date(BASE_MS + ts).toISOString();

/** What a person-written line looks like: no request id, whatever the author remembered to mention. */
export function textParts(e: LogEvent) {
  return { head: `${clockOf(e.ts)} ${e.level.padEnd(5)}`, tag: `[${e.service}]`, message: `${e.text}${e.detail ? ` ${e.detail}` : ''}` };
}
export const textLine = (e: LogEvent) => {
  const p = textParts(e);
  return `${p.head} ${p.tag} ${p.message}`;
};

/** The fields of a structured line, in the order they are written. */
export const FIELD_NAMES = ['ts', 'level', 'service', 'msg', 'request_id', 'order_id', 'user_id', 'duration_ms'] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

export function structuredFields(e: LogEvent): Partial<Record<FieldName, string | number>> {
  return {
    ts: isoOf(e.ts),
    level: e.level,
    service: e.service,
    msg: e.msg,
    request_id: e.requestId,
    order_id: e.orderId,
    user_id: e.userId,
    duration_ms: e.durationMs,
  };
}

export function jsonLine(e: LogEvent): string {
  const fields: Record<string, unknown> = { ...structuredFields(e) };
  if (e.body) fields.body = e.body;
  if (e.detail) fields.detail = e.detail;
  return JSON.stringify(fields);
}

// ── Level filter, volume and cost ───────────────────────────────────────

export const keptLines = (events: readonly LogEvent[], min: Level) => events.filter((e) => levelRank(e.level) >= levelRank(min));

export type Format = 'text' | 'json';
export const renderLine = (e: LogEvent, format: Format, redact: boolean) => redactLine(format === 'json' ? jsonLine(e) : textLine(e), redact);

/** A line split for display: free text puts the clock and level in front of the service tag, JSON is all body. */
export function displayParts(e: LogEvent, format: Format, redact: boolean): { head: string; body: string } {
  if (format === 'json') return { head: '', body: redactLine(jsonLine(e), redact) };
  const p = textParts(e);
  return { head: p.head, body: redactLine(p.message, redact) };
}

const encoder = new TextEncoder();
export const byteLength = (s: string) => encoder.encode(s).length;

/** The traffic the volume is scaled to, and the made-up price and budget it is compared with. */
export const REQUESTS_PER_SECOND = 260;
export const SECONDS_PER_DAY = 86_400;
export const BUDGET_GB_PER_DAY = 25;
export const PRICE_PER_GB = 0.5;
const BYTES_PER_GB = 1024 ** 3;
const DAYS_PER_MONTH = 30;

/** Average bytes the lines of one request take at this minimum level (background noise left out). */
export function bytesPerRequest(run: Run, min: Level, format: Format): number {
  const lines = keptLines(run.events, min).filter((e) => e.requestIdx !== null);
  return lines.reduce((sum, e) => sum + byteLength(renderLine(e, format, false)) + 1, 0) / REQUEST_COUNT;
}

export const gbPerDay = (bytesPerReq: number) => (bytesPerReq * REQUESTS_PER_SECOND * SECONDS_PER_DAY) / BYTES_PER_GB;
export const dollarsPerMonth = (gb: number) => gb * DAYS_PER_MONTH * PRICE_PER_GB;

export const countByLevel = (events: readonly LogEvent[], min: Level) => Object.fromEntries(LEVELS.map((l) => [l, keptLines(events, min).filter((e) => e.level === l).length])) as Record<Level, number>;

// ── Redaction ───────────────────────────────────────────────────────────

export const REDACTED = '[REDACTED]';
/** A run of 13 to 19 digits, with single spaces or dashes between them: the shape of a card number. */
const CARD_SHAPE = /\b(?:\d[ -]?){12,18}\d\b/g;

/**
 * Masks anything card-shaped. It is a safety net, not a plan: a number split by other
 * punctuation would slip through, which is why the first fix is not to log the body at all.
 */
export function redactLine(line: string, on: boolean): string {
  return on ? line.replace(CARD_SHAPE, REDACTED) : line;
}

export const cardShapes = (lines: readonly string[]) => lines.reduce((n, l) => n + (l.match(CARD_SHAPE)?.length ?? 0), 0);

// ── Searching ───────────────────────────────────────────────────────────

/** `grep -i`: the lines whose text contains the term. An empty term matches nothing. */
export function grepLines(events: readonly LogEvent[], term: string): Set<number> {
  const needle = term.trim().toLowerCase();
  return new Set(needle === '' ? [] : events.filter((e) => textLine(e).toLowerCase().includes(needle)).map((e) => e.seq));
}

export interface Score {
  /** Lines the search or filter returned. */
  hits: number;
  /** Lines of the failed request among the kept lines: what a perfect search would return. */
  truth: number;
  found: number;
  missed: number;
  falseHits: number;
}

export function scoreHits(kept: readonly LogEvent[], hitSeqs: ReadonlySet<number>, failedIdx: number): Score {
  const truth = kept.filter((e) => e.requestIdx === failedIdx);
  const found = truth.filter((e) => hitSeqs.has(e.seq)).length;
  const hits = kept.filter((e) => hitSeqs.has(e.seq)).length;
  return { hits, truth: truth.length, found, missed: truth.length - found, falseHits: hits - found };
}

// ── The structured query language ───────────────────────────────────────

export interface Clause {
  field: FieldName;
  op: '=' | '>=';
  value: string;
}
export type ParseResult = { ok: true; clauses: Clause[] } | { ok: false; message: string };

export const QUERY_HELP = 'field=value, level>=WARN, joined with AND. Fields: ' + FIELD_NAMES.join(', ') + '.';
const CLAUSE = /^([A-Za-z_]+)(>=|=)(.*)$/;

export function parseQuery(src: string): ParseResult {
  const tokens = src.trim().split(/\s+/).filter(Boolean);
  const clauses: Clause[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (i % 2 === 1) {
      if (tok === 'AND') continue;
      return { ok: false, message: /^(or|and|not)$/i.test(tok) && tok !== 'AND' ? `"${tok}" isn't supported: this syntax only has AND, in capitals.` : `Expected AND between conditions, found "${tok}". Values can't contain spaces.` };
    }
    if (tok === 'AND') return { ok: false, message: 'AND needs a condition on both sides.' };
    if (/["'()*\\]/.test(tok)) return { ok: false, message: `"${tok}": quotes, wildcards and parentheses aren't supported.` };
    const m = CLAUSE.exec(tok);
    if (!m) return { ok: false, message: /[!<>~]/.test(tok) ? `"${tok}": only = and level>= are supported.` : `"${tok}" isn't field=value or level>=LEVEL.` };
    const [, field, op, value] = m;
    if (!(FIELD_NAMES as readonly string[]).includes(field)) return { ok: false, message: `Unknown field "${field}". ${QUERY_HELP}` };
    if (value === '') return { ok: false, message: `"${tok}" needs a value after the ${op}.` };
    if (op === '>=' && field !== 'level') return { ok: false, message: `>= only works on level, for example level>=WARN.` };
    if (field === 'level') {
      const level = value.toUpperCase();
      if (!(LEVELS as readonly string[]).includes(level)) return { ok: false, message: `level must be one of ${LEVELS.join(', ')}.` };
      clauses.push({ field, op: op as Clause['op'], value: level });
    } else {
      clauses.push({ field: field as FieldName, op: '=', value });
    }
  }
  if (tokens.length > 0 && tokens.length % 2 === 0) return { ok: false, message: 'AND needs a condition on both sides.' };
  return { ok: true, clauses };
}

export function matchesClauses(e: LogEvent, clauses: readonly Clause[]): boolean {
  const fields = structuredFields(e);
  return clauses.every((c) => {
    const have = fields[c.field];
    if (have === undefined) return false;
    if (c.op === '>=') return levelRank(have as Level) >= levelRank(c.value as Level);
    return String(have) === c.value;
  });
}

export function filterHits(events: readonly LogEvent[], clauses: readonly Clause[]): Set<number> {
  return new Set(clauses.length === 0 ? [] : events.filter((e) => matchesClauses(e, clauses)).map((e) => e.seq));
}
