/**
 * Certificate validity and renewal, for a fictional service. Every date is an instant in
 * milliseconds since the epoch (UTC); nothing here reads a time zone, so the answers cannot
 * depend on where the code runs. Time zones only appear when an instant is *formatted*.
 */

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h);

// ── Validity ────────────────────────────────────────────────────────────

export interface Cert {
  id: string;
  label: string;
  notBefore: number;
  notAfter: number;
}

/**
 * RFC 5280 section 4.1.2.5: the validity period runs from notBefore through notAfter,
 * inclusive. (A certificate whose notAfter is 00:00:00 UTC is still valid at that very second
 * and expired one second later; the lesson speaks of "after" notAfter for that reason.)
 */
export const isValidAt = (c: Cert, t: number) => c.notBefore <= t && t <= c.notAfter;

export type ChainFault = { cert: Cert; why: 'expired' | 'not-yet-valid' };

/** A chain is valid only when every certificate in it is inside its own validity period. The first fault, leaf first. */
export function chainFault(chain: readonly Cert[], t: number): ChainFault | null {
  for (const cert of chain) {
    if (t < cert.notBefore) return { cert, why: 'not-yet-valid' };
    if (t > cert.notAfter) return { cert, why: 'expired' };
  }
  return null;
}
export const chainValidAt = (chain: readonly Cert[], t: number) => chainFault(chain, t) === null;

export const daysBetween = (a: number, b: number) => (b - a) / DAY;
export const daysLeft = (c: Cert, t: number) => daysBetween(t, c.notAfter);
export const lifetimeDays = (c: Cert) => daysBetween(c.notBefore, c.notAfter);

// ── The CA/Browser Forum schedule for public TLS certificates ───────────

/**
 * Maximum validity of publicly trusted TLS server certificates, by issue date.
 * Source: CA/Browser Forum Ballot SC-081v3, "Introduce Schedule of Reducing Validity and Data
 * Reuse Periods", passed 2025-04-11, amending the TLS Baseline Requirements:
 * https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/
 *   - certificates issued before 2026-03-15: 398 days (the limit in force before the ballot)
 *   - issued on or after 2026-03-15: 200 days
 *   - issued on or after 2027-03-15: 100 days
 *   - issued on or after 2029-03-15: 47 days
 * Checked against that page at build time (2026-10-08). It governs publicly trusted CAs only,
 * not a private CA. Domain review: re-check before release.
 */
export const LIFETIME_SCHEDULE: readonly { from: number | null; maxDays: number }[] = [
  { from: null, maxDays: 398 },
  { from: utc(2026, 3, 15), maxDays: 200 },
  { from: utc(2027, 3, 15), maxDays: 100 },
  { from: utc(2029, 3, 15), maxDays: 47 },
];

export function maxLifetimeDays(issuedAt: number): number {
  let days = LIFETIME_SCHEDULE[0].maxDays;
  for (const step of LIFETIME_SCHEDULE) if (step.from !== null && issuedAt >= step.from) days = step.maxDays;
  return days;
}

// ── The issue-date picker ───────────────────────────────────────────────
// Two positions a month, the 1st and the 15th: the schedule's steps change on the 15th, so a
// month-only picker would show the wrong limit for the second half of March in 2026, 2027 and 2029.

const ISSUE_FIRST_YEAR = 2025;
const ISSUE_LAST_YEAR = 2030;
const POSITIONS_PER_MONTH = 2;
const MID_MONTH_DAY = 15;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const ISSUE_LAST_INDEX = (ISSUE_LAST_YEAR - ISSUE_FIRST_YEAR + 1) * 12 * POSITIONS_PER_MONTH - 1;
export const ISSUE_DEFAULT_INDEX = (2026 - ISSUE_FIRST_YEAR) * 12 * POSITIONS_PER_MONTH + 8 * POSITIONS_PER_MONTH;

const issueParts = (index: number) => {
  const month = Math.floor(index / POSITIONS_PER_MONTH);
  return { year: ISSUE_FIRST_YEAR + Math.floor(month / 12), month: month % 12, day: index % POSITIONS_PER_MONTH === 0 ? 1 : MID_MONTH_DAY };
};

/** The issue date a picker position stands for (00:00 UTC). */
export const issueDateAt = (index: number) => {
  const p = issueParts(index);
  return utc(p.year, p.month + 1, p.day);
};

export const issueLabel = (index: number) => {
  const p = issueParts(index);
  return `${p.day} ${MONTH_NAMES[p.month]} ${p.year}`;
};

/** The common ACME convention: renew once a third of the lifetime is left (about day 60 of 90). A convention, not a rule. */
export const renewAfterDays = (lifetime: number) => (lifetime * 2) / 3;
/** How many renewals a year this convention means for a certificate that lives `lifetime` days. */
export const renewalsPerYear = (lifetime: number) => 365 / renewAfterDays(lifetime);

/** How many of the 30, 14 and 7 days-left alerts fire before a problem fixed on `fixDay` (the job renews on the first try after the fix). */
export const alertsBeforeFix = (fixDay: number) => ALERT_DAYS.filter((n) => ACME_LIFETIME_DAYS - n < fixDay).length;

/** After the certificate expired, the log stops listing each failed daily try this many days later. */
const FAILED_ATTEMPTS_LOGGED_AFTER_EXPIRY_DAYS = 7;
export const ALERT_DAYS = [30, 14, 7] as const;

// ── Handshakes ──────────────────────────────────────────────────────────

export interface Client {
  id: string;
  label: string;
  /** How far this client's clock is from the true time, in ms (negative = behind). */
  skewMs: number;
  /** A client that pins one exact leaf certificate. */
  pinId?: string;
}

/** What the server presents between `from` and `to`. */
export interface Served {
  from: number;
  to: number;
  leafId: string;
  chain: readonly Cert[];
}

export type Handshake = { ok: true } | { ok: false; reason: string };

export const FAULT_WORDING = { expired: 'certificate has expired', 'not-yet-valid': 'certificate is not yet valid' } as const;

export function servedAt(served: readonly Served[], t: number): Served | undefined {
  return served.find((s) => s.from <= t && t < s.to);
}

/** The client evaluates validity on its own clock (`t + skew`): that is the whole skew gotcha. */
export function handshake(served: readonly Served[], client: Client, t: number): Handshake {
  const s = servedAt(served, t);
  if (!s) return { ok: false, reason: 'no certificate served' };
  const fault = chainFault(s.chain, t + client.skewMs);
  if (fault) return { ok: false, reason: `${FAULT_WORDING[fault.why]} (${fault.cert.label})` };
  if (client.pinId !== undefined && client.pinId !== s.leafId) return { ok: false, reason: 'pinned certificate does not match' };
  return { ok: true };
}

// ── Scenarios ───────────────────────────────────────────────────────────

export type EventKind = 'issued' | 'attempt-failed' | 'alert' | 'expired' | 'reminder' | 'note';
export interface TimelineEvent {
  t: number;
  kind: EventKind;
  text: string;
  /** The short label of its marker on the timeline, if it gets one. */
  short?: string;
}

export interface Scenario {
  start: number;
  end: number;
  /** Leaf certificates, in issue order. */
  leaves: Cert[];
  /** Intermediate certificates drawn on their own lane (gotcha scenes). */
  intermediates: Cert[];
  served: Served[];
  /** Certificates written to disk but not (yet) loaded by the server, with when they were written. */
  onDisk: Cert[];
  renewalWindows: { from: number; to: number; certId: string }[];
  clients: Client[];
  events: TimelineEvent[];
}

export const TRUE_CLIENT: Client = { id: 'client', label: 'Typical client', skewMs: 0 };

const ROOT: Cert = { id: 'root', label: 'root CA', notBefore: utc(2020, 1, 1), notAfter: utc(2040, 1, 1) };
const FRESH_INTERMEDIATE: Cert = { id: 'ica-new', label: 'intermediate', notBefore: utc(2024, 1, 1), notAfter: utc(2032, 1, 1) };

const iso = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
export const formatUtc = (t: number) => `${iso(t)} UTC`;

/** An instant as wall-clock time in a named zone. Pure formatting: it never changes validity. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatInZone(t: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')} ${MONTHS[Number(get('month')) - 1]} ${get('year')}, ${get('hour')}:${get('minute')}`;
}

// Manual mode ----------------------------------------------------------

export const MANUAL_ISSUED = utc(2025, 9, 15);
export const MANUAL_LIFETIME_DAYS = 365;
export const REMINDER_DAYS_BEFORE = 30;
/** When the owner, if still on the team, acts on the reminder: three days later. */
export const OWNER_ACTS_AFTER_DAYS = 3;

export function manualScenario(ownerLeft: boolean): Scenario {
  const a: Cert = { id: 'manual-1', label: 'leaf certificate', notBefore: MANUAL_ISSUED, notAfter: MANUAL_ISSUED + MANUAL_LIFETIME_DAYS * DAY };
  const start = MANUAL_ISSUED;
  const end = utc(2027, 3, 1);
  const reminderAt = a.notAfter - REMINDER_DAYS_BEFORE * DAY;
  const leaves = [a];
  const served: Served[] = [{ from: start, to: end, leafId: a.id, chain: [a, FRESH_INTERMEDIATE, ROOT] }];
  const events: TimelineEvent[] = [{ t: a.notBefore, kind: 'issued', short: 'issued', text: `Certificate issued by hand for ${MANUAL_LIFETIME_DAYS} days. Reminder set in a calendar.` }];
  if (ownerLeft) {
    events.push({ t: reminderAt, kind: 'reminder', short: 'reminder', text: 'Renewal reminder goes to the previous owner, who has left the team. Nobody reads it.' });
    events.push({ t: a.notAfter, kind: 'expired', short: 'expires', text: 'notAfter passes. Every handshake now fails.' });
  } else {
    const actsAt = reminderAt + OWNER_ACTS_AFTER_DAYS * DAY;
    const lifetime = maxLifetimeDays(actsAt);
    const b: Cert = { id: 'manual-2', label: 'leaf certificate', notBefore: actsAt, notAfter: actsAt + lifetime * DAY };
    leaves.push(b);
    served[0] = { ...served[0], to: actsAt };
    served.push({ from: actsAt, to: end, leafId: b.id, chain: [b, FRESH_INTERMEDIATE, ROOT] });
    events.push({ t: reminderAt, kind: 'reminder', short: 'reminder', text: 'Renewal reminder reaches the owner.' });
    events.push({ t: actsAt, kind: 'issued', short: 'renewed', text: `Owner renews by hand. The CA's limit for a certificate issued now is ${lifetime} days, so the next deadline is sooner.` });
  }
  return { start, end, leaves, intermediates: [], served, onDisk: [], renewalWindows: [], clients: [TRUE_CLIENT], events };
}

// ACME mode ------------------------------------------------------------

export const ACME_START = utc(2026, 6, 1);
export const ACME_END = utc(2027, 2, 1);
export const ACME_LIFETIME_DAYS = 90;
export type RenewalProblem = 'none' | 'dns' | 'rate-limit';

export const PROBLEM_TEXT: Record<Exclude<RenewalProblem, 'none'>, string> = {
  dns: 'Renewal failed: DNS challenge record not found (the challenge record points at the wrong zone).',
  'rate-limit': 'Renewal failed: the CA refused the request as rate limited. Try again later.',
};

export interface AcmeOptions {
  problem: RenewalProblem;
  /** The renewal job succeeds from this instant on, as if the problem were fixed. Null: never. */
  fixedAt: number | null;
  /** Whether the server picks up a renewed certificate (a reload hook). */
  reload: boolean;
  /** When someone restarts the server by hand if no hook does. Null: nobody does. */
  restartAt?: number | null;
  /** The intermediate the server keeps sending. */
  intermediate?: Cert;
  start?: number;
  end?: number;
  clients?: Client[];
}

/**
 * A renewal job that tries once a day (at the hour the certificate was issued) from the day a
 * third of the lifetime is left, until one try works. Each success issues a new certificate
 * valid for the full lifetime from that moment.
 */
export function acmeScenario(opts: AcmeOptions): Scenario {
  const start = opts.start ?? ACME_START;
  const end = opts.end ?? ACME_END;
  const intermediate = opts.intermediate ?? FRESH_INTERMEDIATE;
  const make = (n: number, at: number): Cert => ({ id: `acme-${n}`, label: 'leaf certificate', notBefore: at, notAfter: at + ACME_LIFETIME_DAYS * DAY });
  const leaves = [make(1, start)];
  const events: TimelineEvent[] = [{ t: start, kind: 'issued', short: 'issued', text: `Certificate issued automatically for ${ACME_LIFETIME_DAYS} days.` }];
  const windows: Scenario['renewalWindows'] = [];
  const served: Served[] = [];
  const onDisk: Cert[] = [];
  const chainOf = (c: Cert) => [c, intermediate, ROOT];
  let usedRestart = false;
  let loadedFrom = start;
  let loaded = leaves[0];

  for (let current = leaves[0]; ; ) {
    const windowStart = current.notBefore + renewAfterDays(ACME_LIFETIME_DAYS) * DAY;
    if (windowStart >= end) break;
    windows.push({ from: windowStart, to: Math.min(current.notAfter, end), certId: current.id });
    let renewed: Cert | null = null;
    const lastLogged = current.notAfter + FAILED_ATTEMPTS_LOGGED_AFTER_EXPIRY_DAYS * DAY;
    for (let t = windowStart; t < end; t += DAY) {
      const works = opts.problem === 'none' || (opts.fixedAt !== null && t >= opts.fixedAt);
      if (!works) {
        if (t <= lastLogged) events.push({ t, kind: 'attempt-failed', short: 'renewal fails', text: PROBLEM_TEXT[opts.problem as Exclude<RenewalProblem, 'none'>] });
        else if (t - DAY <= lastLogged) events.push({ t, kind: 'note', text: 'The job keeps trying once a day; further failures are not listed.' });
        continue;
      }
      renewed = make(leaves.length + 1, t);
      events.push({ t, kind: 'issued', short: 'renewed', text: `Renewal worked${t > current.notAfter ? ' (after the old certificate expired)' : ''}. New ${ACME_LIFETIME_DAYS}-day certificate written to disk.` });
      break;
    }
    // Monitoring probes the certificate the server actually presents: alerts count down to ITS notAfter.
    const restartAt = opts.restartAt ?? null;
    const restarts = renewed !== null && !opts.reload && !usedRestart && restartAt !== null && restartAt > renewed.notBefore;
    const swapAt = renewed ? (opts.reload ? renewed.notBefore : restarts ? restartAt : null) : null;
    if (restarts) usedRestart = true;
    for (const n of ALERT_DAYS) {
      const at = loaded.notAfter - n * DAY;
      if (at >= loadedFrom && at < end && (swapAt === null || at < swapAt)) events.push({ t: at, kind: 'alert', short: `${n} d left`, text: `Monitoring alert: the served certificate expires in ${n} days.` });
    }
    if (loaded.notAfter < end && (swapAt === null || loaded.notAfter < swapAt)) events.push({ t: loaded.notAfter, kind: 'expired', short: 'expires', text: 'The served certificate expired. Every handshake now fails.' });
    if (!renewed) {
      served.push({ from: loadedFrom, to: end, leafId: loaded.id, chain: chainOf(loaded) });
      break;
    }
    leaves.push(renewed);
    if (swapAt === null || swapAt >= end) {
      onDisk.push(renewed);
      served.push({ from: loadedFrom, to: end, leafId: loaded.id, chain: chainOf(loaded) });
      break;
    }
    if (!opts.reload) events.push({ t: swapAt, kind: 'note', short: 'restart', text: 'The server is restarted and finally loads the new certificate.' });
    served.push({ from: loadedFrom, to: swapAt, leafId: loaded.id, chain: chainOf(loaded) });
    loadedFrom = swapAt;
    loaded = renewed;
    current = renewed;
  }
  if (served.length === 0 || served[served.length - 1].to < end) served.push({ from: loadedFrom, to: end, leafId: loaded.id, chain: chainOf(loaded) });
  events.sort((a, b) => a.t - b.t);
  return { start, end, leaves, intermediates: [intermediate], served, onDisk, renewalWindows: windows, clients: opts.clients ?? [TRUE_CLIENT], events };
}

// Gotchas --------------------------------------------------------------

export type GotchaId = 'intermediate' | 'skew' | 'reload' | 'pinned';
export const GOTCHAS: { id: GotchaId; label: string }[] = [
  { id: 'intermediate', label: 'Expired intermediate' },
  { id: 'skew', label: 'Wrong client clock' },
  { id: 'reload', label: 'Renewed, never reloaded' },
  { id: 'pinned', label: 'Pinned old cert' },
];

/** The intermediate the server was configured with long ago: it dies partway through the timeline. */
export const OLD_INTERMEDIATE: Cert = { id: 'ica-old', label: 'old intermediate', notBefore: utc(2024, 1, 1), notAfter: utc(2026, 9, 20) };

export interface GotchaOptions {
  /** intermediate: serve the fresh intermediate instead of the old one. */
  chainUpdated: boolean;
  /** skew: how many days the unlucky client's clock is off (negative = behind). */
  skewDays: number;
  /** reload: whether a reload hook runs after renewal. */
  reloadHook: boolean;
}

export const GOTCHA_DEFAULTS: GotchaOptions = { chainUpdated: false, skewDays: -3, reloadHook: false };

export function gotchaScenario(id: GotchaId, o: GotchaOptions): Scenario {
  const base = { problem: 'none', fixedAt: null } as const;
  if (id === 'intermediate') return acmeScenario({ ...base, reload: true, intermediate: o.chainUpdated ? FRESH_INTERMEDIATE : OLD_INTERMEDIATE });
  if (id === 'skew') {
    const clients: Client[] = [TRUE_CLIENT, { id: 'skewed', label: 'Wrong-clock client', skewMs: o.skewDays * DAY }];
    return acmeScenario({ ...base, reload: true, clients });
  }
  if (id === 'reload') return acmeScenario({ ...base, reload: o.reloadHook });
  const first = acmeScenario({ ...base, reload: true });
  const clients: Client[] = [TRUE_CLIENT, { id: 'pinned', label: 'Pinned app', skewMs: 0, pinId: first.leaves[0].id }];
  return { ...first, clients };
}

// ── Sampling and outages ────────────────────────────────────────────────

export const SAMPLES = 45;
/** Handshake attempts, evenly spread across the scenario, as instants. */
export const sampleTimes = (s: Scenario, n = SAMPLES) => Array.from({ length: n }, (_, i) => s.start + ((i + 0.5) * (s.end - s.start)) / n);

/**
 * Stretches of time when a client with a correct clock fails to connect. Validity changes only
 * at certificate and serving boundaries, so one probe between consecutive boundaries decides the
 * whole stretch.
 */
export function outageRanges(s: Scenario, client: Client = TRUE_CLIENT): { from: number; to: number }[] {
  const marks = new Set<number>([s.start, s.end]);
  const add = (t: number) => t > s.start && t < s.end && marks.add(t);
  for (const c of [...s.leaves, ...s.intermediates]) {
    add(c.notBefore);
    add(c.notAfter);
    add(c.notBefore - client.skewMs);
    add(c.notAfter - client.skewMs);
  }
  for (const v of s.served) {
    add(v.from);
    add(v.to);
  }
  const sorted = [...marks].sort((a, b) => a - b);
  const out: { from: number; to: number }[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const mid = (sorted[i] + sorted[i + 1]) / 2;
    if (handshake(s.served, client, mid).ok) continue;
    const last = out[out.length - 1];
    if (last && last.to === sorted[i]) last.to = sorted[i + 1];
    else out.push({ from: sorted[i], to: sorted[i + 1] });
  }
  return out;
}

export const daysFromStart = (s: Scenario, t: number) => (t - s.start) / DAY;
export const failedSoFar = (s: Scenario, client: Client, now: number) => sampleTimes(s).filter((t) => t <= now && !handshake(s.served, client, t).ok).length;
