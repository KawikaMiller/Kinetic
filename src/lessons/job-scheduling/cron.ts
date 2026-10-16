/**
 * Scene 4: a five-field cron expression, parsed by hand (no eval) and run forward in UTC.
 *
 * Grammar: minute 0-59, hour 0-23, day-of-month 1-31, month 1-12, day-of-week 0-6 (Sunday is 0); each field is a
 * comma list of `*`, `n`, `a-b`, `*` or `a-b` with `/step`. Names (`mon`), `?`, `L`, `7` for Sunday and `a/step` are
 * refused with a reason, not guessed.
 *
 * The day rule (from memory of the Vixie cron `man 5 crontab`; verify before relying on it): when BOTH day-of-month
 * and day-of-week are restricted, the job runs when EITHER matches. "Restricted" in that implementation means the
 * field's text does not start with `*`, so a stepped star (star slash 2) in a day field still counts as a star and the two fields then both
 * have to match.
 */
export type FieldName = 'minute' | 'hour' | 'day of the month' | 'month' | 'day of the week';
const FIELDS: { name: FieldName; min: number; max: number }[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of the month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of the week', min: 0, max: 6 },
];
export const MAX_CRON_CHARS = 100;

export interface CronField {
  text: string;
  values: ReadonlySet<number>;
  /** The text starts with `*`. */
  star: boolean;
}
export interface Cron {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
}
export type CronParse = { ok: true; cron: Cron } | { ok: false; error: string };

const INT = /^\d+$/;

type FieldResult = { ok: true; field: CronField } | { ok: false; error: string };

function parseField(text: string, spec: (typeof FIELDS)[number]): FieldResult {
  const inField = `the ${spec.name} field`;
  const values = new Set<number>();
  for (const item of text.split(',')) {
    if (item === '') return { ok: false, error: `${inField} has an empty item (a stray comma).` };
    const [range, stepText, ...extra] = item.split('/');
    if (extra.length > 0) return { ok: false, error: `${inField} has more than one "/" in "${item}".` };
    let step = 1;
    if (stepText !== undefined) {
      if (!INT.test(stepText)) return { ok: false, error: `"${stepText}" is not a step in ${inField}.` };
      step = Number(stepText);
      if (step === 0) return { ok: false, error: `A step of 0 in ${inField} never advances: use a step of 1 or more.` };
    }
    let lo: number;
    let hi: number;
    if (range === '*') {
      [lo, hi] = [spec.min, spec.max];
    } else if (INT.test(range)) {
      if (stepText !== undefined) return { ok: false, error: `"${item}" in ${inField}: a step needs a range or a star in front (use ${range}-${spec.max}/${stepText}).` };
      lo = hi = Number(range);
    } else if (/^\d+-\d+$/.test(range)) {
      [lo, hi] = range.split('-').map(Number);
      if (lo > hi) return { ok: false, error: `The range ${range} in ${inField} runs backwards.` };
    } else {
      return { ok: false, error: `"${item}" is not supported in ${inField}: use *, numbers, ranges (a-b), lists and steps (*/n). Names, ? and L are not read here.` };
    }
    for (const v of [lo, hi]) {
      if (v < spec.min || v > spec.max) return { ok: false, error: `${v} is outside ${spec.min} to ${spec.max} in ${inField}.` };
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { ok: true, field: { text, values, star: text.startsWith('*') } };
}

export function parseCron(input: string): CronParse {
  const text = input.trim();
  if (text === '') return { ok: false, error: 'Type five fields: minute hour day-of-month month day-of-week.' };
  if (text.length > MAX_CRON_CHARS) return { ok: false, error: `Keep the expression under ${MAX_CRON_CHARS} characters.` };
  const parts = text.split(/\s+/);
  if (parts.length !== 5) return { ok: false, error: `A cron expression has five fields (minute hour day-of-month month day-of-week), not ${parts.length}.` };
  const fields: CronField[] = [];
  for (let i = 0; i < 5; i++) {
    const r = parseField(parts[i], FIELDS[i]);
    if (!r.ok) return r;
    fields.push(r.field);
  }
  const [minute, hour, dom, month, dow] = fields;
  return { ok: true, cron: { minute, hour, dom, month, dow } };
}

/** Does this calendar day run the job at all? (Not the minute.) */
export function dayRuns(c: Cron, month: number, dom: number, dow: number): boolean {
  if (!c.month.values.has(month)) return false;
  const byDom = c.dom.values.has(dom);
  const byDow = c.dow.values.has(dow);
  return c.dom.star || c.dow.star ? byDom && byDow : byDom || byDow;
}

const DAY_MS = 86_400_000;
const SEARCH_DAYS = 366 * 9;

/** Fire times strictly after afterMs and before toMs, at most limit of them, scanning day by day (nine years at most). */
function scan(c: Cron, afterMs: number, toMs: number, limit: number): number[] {
  const out: number[] = [];
  const minutes = [...c.minute.values].sort((x, y) => x - y);
  const hours = [...c.hour.values].sort((x, y) => x - y);
  const startDay = Math.floor(afterMs / DAY_MS) * DAY_MS;
  for (let d = 0; d < SEARCH_DAYS && out.length < limit && startDay + d * DAY_MS < toMs; d++) {
    const day = startDay + d * DAY_MS;
    const date = new Date(day);
    if (!dayRuns(c, date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCDay())) continue;
    for (const h of hours) {
      for (const m of minutes) {
        const t = day + (h * 60 + m) * 60_000;
        if (t > afterMs && t < toMs && out.length < limit) out.push(t);
      }
    }
  }
  return out;
}

/** The first count fire times (ms since the epoch, UTC) strictly after afterMs. Gives fewer if the expression never fires within nine years. */
export const nextFires = (c: Cron, afterMs: number, count: number): number[] => scan(c, afterMs, Infinity, count);

/** The fires inside [fromMs, toMs), in order. */
export const firesBetween = (c: Cron, fromMs: number, toMs: number): number[] => scan(c, fromMs - 1, toMs, Infinity);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "Fri 13 Mar 2026 00:00 UTC". */
export function fireLabel(ms: number): string {
  const d = new Date(ms);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** The lesson's fixed "now": a Monday, in UTC (not today's date). */
export const CRON_NOW_MS = Date.UTC(2026, 2, 2, 0, 0, 0);
export const CRON_DEFAULT = '0 * * * *';
export const DOM_DOW_PRESET = '0 0 15 * 5';
