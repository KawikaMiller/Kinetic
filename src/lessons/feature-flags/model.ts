import { hash32 } from '../../core/hash';
import { mulberry32, weightedPick } from '../../core/random';

/**
 * Feature-flag evaluation, all simulated except the hashing, which is the real thing: the
 * bucket of a user is hash32(flagKey + ":" + userId) mod 100, so the same user and flag always
 * land in the same bucket and ramping the rollout up only ever adds users.
 */

export const FLAG_KEY = 'new-checkout';
export const USER_COUNT = 400;
export const GRID_COLS = 20;
export const BUCKETS = 100;
export const USER_SEED = 2026;
/** Share of the users who are staff, and the countries (weights are illustrative). */
export const STAFF_SHARE = 0.05;
export const COUNTRIES = ['NL', 'US', 'DE', 'BR', 'JP'] as const;
const COUNTRY_WEIGHTS: Record<(typeof COUNTRIES)[number], number> = { NL: 0.2, US: 0.3, DE: 0.2, BR: 0.15, JP: 0.15 };

export interface User {
  id: string;
  staff: boolean;
  country: (typeof COUNTRIES)[number];
}

export function makeUsers(count = USER_COUNT, seed = USER_SEED): User[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${String(i + 1).padStart(4, '0')}`,
    staff: rnd() < STAFF_SHARE,
    country: weightedPick(COUNTRIES, (c) => COUNTRY_WEIGHTS[c], rnd),
  }));
}

/** The user's bucket for a flag, 0..99. */
export const bucketOf = (flagKey: string, userId: string) => hash32(`${flagKey}:${userId}`) % BUCKETS;

/** A percentage rollout: on when the bucket is below the dial. */
export const inRollout = (flagKey: string, userId: string, percent: number) => bucketOf(flagKey, userId) < percent;

/** The "random each request" mistake: a fresh coin flip per user per request round. */
export function randomEach(userId: string, round: number, percent: number): boolean {
  return mulberry32(hash32(`${userId}:${round}`))() * 100 < percent;
}

/** Users whose answer differs from the previous round's. */
export function flickerCount(users: readonly User[], percent: number, round: number): number {
  return users.filter((u) => round > 0 && randomEach(u.id, round, percent) !== randomEach(u.id, round - 1, percent)).length;
}

// ── Targeting rules ─────────────────────────────────────────────────────

export type RuleId = 'staff' | 'nl' | 'default';
export interface Rule {
  id: RuleId;
  /** What the rule says in words, as it would read in a flag dashboard. */
  text: string;
  matches: (u: User) => boolean;
}

export const RULES: Record<RuleId, Rule> = {
  staff: { id: 'staff', text: 'internal staff', matches: (u) => u.staff },
  nl: { id: 'nl', text: 'country = NL', matches: (u) => u.country === 'NL' },
  default: { id: 'default', text: 'everyone else', matches: () => true },
};

/** What each rule serves: staff always, NL half, and the default is the dial. */
export const RULE_PERCENT = { staff: 100, nl: 50 } as const;
export const DEFAULT_ORDER: RuleId[] = ['staff', 'nl', 'default'];

export const percentFor = (id: RuleId, dial: number) => (id === 'default' ? dial : RULE_PERCENT[id]);

export interface Evaluation {
  on: boolean;
  /** The first rule that matched, which decided; null when the kill switch overrode everything. */
  rule: RuleId | null;
}

/** First match wins: the rule that matches decides, even when it says off, and later rules are never asked. */
export function evaluate(order: readonly RuleId[], user: User, dial: number, killed: boolean): Evaluation {
  if (killed) return { on: false, rule: null };
  for (const id of order) {
    if (RULES[id].matches(user)) return { on: inRollout(FLAG_KEY, user.id, percentFor(id, dial)), rule: id };
  }
  return { on: false, rule: null };
}

/** Move the rule at `i` up (-1) or down (+1); out of range leaves the order alone. */
export function moveRule(order: readonly RuleId[], i: number, dir: -1 | 1): RuleId[] {
  const j = i + dir;
  if (j < 0 || j >= order.length) return [...order];
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** How many rules ran before one matched: the matched one and those before it. */
/**
 * How the targeting-rules panel draws rule `i` once `ran` rules were asked: the ones asked before the match
 * are 'past' (read, did not decide), the match is 'now', and the ones never reached are 'idle' (dim).
 */
export const ruleLineState = (i: number, ran: number): 'past' | 'now' | 'idle' => (ran === 0 || i < ran - 1 ? 'past' : i === ran - 1 ? 'now' : 'idle');

export const reached = (order: readonly RuleId[], rule: RuleId | null) => (rule === null ? 0 : order.indexOf(rule) + 1);

export function countOn(users: readonly User[], order: readonly RuleId[], dial: number, killed: boolean): number {
  return users.filter((u) => evaluate(order, u, dial, killed).on).length;
}

export function usersByRule(users: readonly User[], order: readonly RuleId[], dial: number): Record<RuleId, { matched: number; on: number }> {
  const out: Record<RuleId, { matched: number; on: number }> = { staff: { matched: 0, on: 0 }, nl: { matched: 0, on: 0 }, default: { matched: 0, on: 0 } };
  for (const u of users) {
    const e = evaluate(order, u, dial, false);
    if (e.rule) {
      out[e.rule].matched++;
      if (e.on) out[e.rule].on++;
    }
  }
  return out;
}

// ── Kill switch vs rolling back the deploy (all times illustrative) ─────

/** Seconds a flag client takes to refresh its rules (each user's refresh falls somewhere in this window). */
export const FLAG_REFRESH_SECONDS = 30;
/** Seconds a rollback spends in the pipeline before the first server is replaced, and the rolling replacement after it. */
export const PIPELINE_SECONDS = 4 * 60;
export const REPLACE_SECONDS = 5 * 60;

export type Remedy = 'kill' | 'rollback';

/** The second, after the incident, at which a user stops seeing the new UI. */
export function goesOffAt(remedy: Remedy, userId: string): number {
  const h = hash32(`${userId}:${remedy}`);
  return remedy === 'kill' ? 1 + (h % FLAG_REFRESH_SECONDS) : PIPELINE_SECONDS + (h % REPLACE_SECONDS);
}

/** Who still sees the new UI `t` seconds into the incident, given everyone has it on at t = 0. */
export const stillOn = (remedy: Remedy, userId: string, t: number) => t < goesOffAt(remedy, userId);

export const shareStillOn = (users: readonly User[], remedy: Remedy, t: number) => users.filter((u) => stillOn(remedy, u.id, t)).length / users.length;

// ── Flag debt ───────────────────────────────────────────────────────────

export type FlagKind = 'release' | 'experiment' | 'ops' | 'permission';
export interface Flag {
  name: string;
  kind: FlagKind;
  born: number;
  /** The month the flag finished its job (fully rolled out, or the experiment decided); null for flags that stay. */
  done: number | null;
}

export const MONTHS = 12;
/** Months a finished flag may linger before it counts as stale. */
export const STALE_AFTER = 1;

export const FLAGS: Flag[] = [
  { name: 'new-checkout', kind: 'release', born: 1, done: 3 },
  { name: 'dark-mode', kind: 'release', born: 2, done: 4 },
  { name: 'search-v2', kind: 'experiment', born: 3, done: 6 },
  { name: 'payments-kill', kind: 'ops', born: 4, done: null },
  { name: 'beta-export', kind: 'permission', born: 5, done: null },
  { name: 'recs-v3', kind: 'release', born: 6, done: 8 },
  { name: 'new-nav', kind: 'release', born: 8, done: 9 },
  { name: 'pricing-test', kind: 'experiment', born: 9, done: 11 },
];

export const KIND_ORDER: FlagKind[] = ['release', 'experiment', 'ops', 'permission'];

/** Typical lifetimes, as conventions: teams differ, and a lifetime is a habit, not a rule. */
export const KIND_INFO: Record<FlagKind, { label: string; lifetime: string; purpose: string; months: number | null }> = {
  release: { label: 'Release', lifetime: 'weeks to a couple of months', purpose: 'turn a finished feature on gradually, then delete the flag', months: 1 },
  experiment: { label: 'Experiment', lifetime: 'weeks', purpose: 'compare variants until a decision is made, then delete it', months: 2 },
  ops: { label: 'Ops kill switch', lifetime: 'long-lived', purpose: 'turn a risky or costly path off in an incident', months: null },
  permission: { label: 'Permission', lifetime: 'as long as the entitlement', purpose: 'show a feature only to the plans or people entitled to it', months: null },
};

export const isStale = (f: Flag, month: number) => f.done !== null && month - f.done >= STALE_AFTER;

/** Flags that exist in the code at `month`: created by then and not yet removed. */
export const liveFlags = (month: number, removed: ReadonlySet<string>) => FLAGS.filter((f) => f.born <= month && !removed.has(f.name));

export const staleFlags = (month: number, removed: ReadonlySet<string>) => liveFlags(month, removed).filter((f) => isStale(f, month));

/** Flag combinations a test suite would need to cover every code path: two states per live flag. */
export const combinations = (live: number) => 2 ** live;

/** The checkout code with one nested `if` per live flag, innermost last. */
export function debtCode(live: readonly Flag[]): string[] {
  if (live.length === 0) return ['renderCheckout();'];
  const lines: string[] = [];
  live.forEach((f, i) => lines.push(`${'  '.repeat(i)}if (flags.${f.name}) {`));
  lines.push(`${'  '.repeat(live.length)}renderCheckout();`);
  for (let i = live.length - 1; i >= 0; i--) lines.push(`${'  '.repeat(i)}}`);
  return lines;
}
