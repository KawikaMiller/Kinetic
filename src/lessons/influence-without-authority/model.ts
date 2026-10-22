/**
 * An INVENTED case with six invented stakeholders: you propose retiring the legacy deploy tool next quarter. The rules
 * below are a toy that shows the arithmetic of ordering conversations; they are not evidence about how people behave.
 */
export type StakeholderId = 'dana' | 'eli' | 'fay' | 'gus' | 'hana' | 'ivo';
export type Angle = 'workload' | 'risk' | 'cost' | 'credibility' | 'autonomy';

export interface Stakeholder {
  id: StakeholderId;
  name: string;
  role: string;
  /** 1 to 5. */
  influence: number;
  /** -2 (strongly against) to +2 (strongly for). */
  start: number;
  concern: Angle;
  /** Whose view this person follows, or null. */
  listensTo: StakeholderId | null;
}

export const STAKEHOLDERS: readonly Stakeholder[] = [
  { id: 'dana', name: 'Dana', role: 'platform lead', influence: 5, start: -1, concern: 'workload', listensTo: 'gus' },
  { id: 'eli', name: 'Eli', role: 'SRE manager', influence: 4, start: 0, concern: 'risk', listensTo: 'gus' },
  { id: 'fay', name: 'Fay', role: 'product owner', influence: 3, start: 0, concern: 'cost', listensTo: 'eli' },
  { id: 'gus', name: 'Gus', role: 'senior engineer', influence: 2, start: 1, concern: 'credibility', listensTo: null },
  { id: 'hana', name: 'Hana', role: 'finance partner', influence: 2, start: -1, concern: 'cost', listensTo: 'dana' },
  { id: 'ivo', name: 'Ivo', role: 'security lead', influence: 3, start: 0, concern: 'autonomy', listensTo: null },
];
export const ANGLES: readonly { id: Angle; label: string }[] = [
  { id: 'workload', label: 'Workload' },
  { id: 'risk', label: 'Risk' },
  { id: 'cost', label: 'Cost' },
  { id: 'credibility', label: 'Credibility' },
  { id: 'autonomy', label: 'Autonomy' },
];

export const stakeholderOf = (id: StakeholderId): Stakeholder => {
  const s = STAKEHOLDERS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown stakeholder ${id}`);
  return s;
};
export const angleLabel = (a: Angle): string => ANGLES.find((x) => x.id === a)!.label.toLowerCase();

/** The invented thresholds, printed on the page. */
export const POSITION_MIN = -2;
export const POSITION_MAX = 2;
export const SUPPORT_TO_PASS = 8;
export const VETO_INFLUENCE = 4;
export const VETO_POSITION = -1;
export const SPILL_FROM = 1;
export const MAX_CONVERSATIONS = 3;
export const FOURTH_REFUSED = 'You have 3 conversations before the meeting: pick which three.';

export interface Slot {
  who: StakeholderId | null;
  angle: Angle | null;
}
export const EMPTY_SLOT: Slot = { who: null, angle: null };
export const EMPTY_PLAN: readonly Slot[] = [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT];

/** A slot is used only when both who and angle are chosen. */
export const isUsed = (s: Slot): s is { who: StakeholderId; angle: Angle } => s.who !== null && s.angle !== null;

export type Rule = 'match' | 'spill' | 'surprise';
export interface Move {
  who: StakeholderId;
  from: number;
  to: number;
  rule: Rule;
}
export interface LedgerEntry {
  /** Conversation number from 1, or 0 for the meeting itself. */
  slot: number;
  who: StakeholderId | null;
  angle: Angle | null;
  matched: boolean;
  moves: Move[];
}

export type Positions = Readonly<Record<StakeholderId, number>>;

export interface Outcome {
  /** Positions after the conversations, before the meeting. */
  before: Positions;
  /** Positions at the end of the meeting. */
  final: Positions;
  score: number;
  /** Stakeholders of influence 4 or more at -1 or below: the room follows them. */
  vetoes: StakeholderId[];
  pass: boolean;
  ledger: LedgerEntry[];
}

const clamp = (v: number): number => Math.min(POSITION_MAX, Math.max(POSITION_MIN, v));
export const startPositions = (): Positions => Object.fromEntries(STAKEHOLDERS.map((s) => [s.id, s.start])) as Positions;

/** The weighted support: the sum of influence times position. */
export const weightedScore = (p: Positions): number => STAKEHOLDERS.reduce((sum, s) => sum + s.influence * p[s.id], 0);

/** Applies the rules in order: R1 match and R2 spillover per conversation, then R3 surprise and R4 outcome. */
export function runPlan(plan: readonly Slot[]): Outcome {
  const pos: Record<StakeholderId, number> = { ...startPositions() };
  const met = new Set<StakeholderId>();
  const ledger: LedgerEntry[] = [];
  plan.forEach((slot, i) => {
    if (!isUsed(slot)) return;
    const target = stakeholderOf(slot.who);
    const moves: Move[] = [];
    const matched = slot.angle === target.concern;
    met.add(target.id);
    if (matched) {
      const to = clamp(pos[target.id] + 1);
      if (to !== pos[target.id]) moves.push({ who: target.id, from: pos[target.id], to, rule: 'match' });
      pos[target.id] = to;
    }
    if (pos[target.id] >= SPILL_FROM) {
      for (const s of STAKEHOLDERS) {
        if (s.listensTo !== target.id || pos[s.id] >= pos[target.id]) continue;
        const to = clamp(pos[s.id] + 1);
        if (to !== pos[s.id]) moves.push({ who: s.id, from: pos[s.id], to, rule: 'spill' });
        pos[s.id] = to;
      }
    }
    ledger.push({ slot: i + 1, who: slot.who, angle: slot.angle, matched, moves });
  });
  const before = { ...pos } as Positions;
  const surprised: Move[] = [];
  for (const s of STAKEHOLDERS) {
    if (met.has(s.id) || pos[s.id] > 0) continue;
    const to = clamp(pos[s.id] - 1);
    if (to !== pos[s.id]) surprised.push({ who: s.id, from: pos[s.id], to, rule: 'surprise' });
    pos[s.id] = to;
  }
  ledger.push({ slot: 0, who: null, angle: null, matched: false, moves: surprised });
  const final = { ...pos } as Positions;
  const score = weightedScore(final);
  const vetoes = STAKEHOLDERS.filter((s) => s.influence >= VETO_INFLUENCE && final[s.id] <= VETO_POSITION).map((s) => s.id);
  return { before, final, score, vetoes, pass: score >= SUPPORT_TO_PASS && vetoes.length === 0, ledger };
}

/** A plan that talks to each person on their own concern, in order. */
export const matchedPlan = (ids: readonly StakeholderId[]): Slot[] => ids.map((id) => ({ who: id, angle: stakeholderOf(id).concern }));

// ── The comparison table ────────────────────────────────────────────────────────

/** The three people of highest influence, each on their own concern. Fay and Ivo tie at 3, so there are two such plans. */
export const NATURAL_PLANS: readonly { id: string; label: string; plan: Slot[] }[] = [
  { id: 'natural-fay', label: 'The three most influential, third by table order (Dana, Eli, Fay)', plan: matchedPlan(['dana', 'eli', 'fay']) },
  { id: 'natural-ivo', label: 'The three most influential, third the other tie (Dana, Eli, Ivo)', plan: matchedPlan(['dana', 'eli', 'ivo']) },
];
/** The six-slot extension: everybody on their own concern, trusted peer first. */
export const SIX_SLOT_PLAN: readonly Slot[] = matchedPlan(['gus', 'dana', 'eli', 'fay', 'hana', 'ivo']);

export interface SearchResult {
  /** Plans tried: (stakeholders x angles) to the power of three. */
  total: number;
  passing: number;
  best: number;
  /** Every plan that reaches the best score, in search order. */
  bestPlans: Slot[][];
}

let searched: SearchResult | null = null;

/** The exhaustive search over every three-slot plan of (who, angle), run once and kept. */
export function searchPlans(): SearchResult {
  if (searched) return searched;
  const options: Slot[] = STAKEHOLDERS.flatMap((s) => ANGLES.map((a) => ({ who: s.id, angle: a.id })));
  let passing = 0;
  let best = -Infinity;
  let bestPlans: Slot[][] = [];
  for (const a of options) for (const b of options) for (const c of options) {
    const out = runPlan([a, b, c]);
    if (out.pass) passing += 1;
    if (out.score > best) { best = out.score; bestPlans = []; }
    if (out.score === best) bestPlans.push([a, b, c]);
  }
  searched = { total: options.length ** MAX_CONVERSATIONS, passing, best, bestPlans };
  return searched;
}

/** The best score, and the number of passing plans, among the three-slot plans that open with each person. */
export function openingStats(): Record<StakeholderId, { best: number; passing: number }> {
  const options: Slot[] = STAKEHOLDERS.flatMap((s) => ANGLES.map((a) => ({ who: s.id, angle: a.id })));
  const stats = Object.fromEntries(STAKEHOLDERS.map((s) => [s.id, { best: -Infinity, passing: 0 }])) as Record<StakeholderId, { best: number; passing: number }>;
  for (const a of options) for (const b of options) for (const c of options) {
    const out = runPlan([a, b, c]);
    const row = stats[a.who!];
    row.best = Math.max(row.best, out.score);
    if (out.pass) row.passing += 1;
  }
  return stats;
}

/** Every ordering of the same people, each on their own concern, with its score. */
export function orderingScores(ids: readonly StakeholderId[]): { order: StakeholderId[]; score: number; pass: boolean }[] {
  const out: { order: StakeholderId[]; score: number; pass: boolean }[] = [];
  const walk = (rest: StakeholderId[], done: StakeholderId[]): void => {
    if (rest.length === 0) {
      const o = runPlan(matchedPlan(done));
      out.push({ order: done, score: o.score, pass: o.pass });
      return;
    }
    rest.forEach((id, i) => walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...done, id]));
  };
  walk([...ids], []);
  return out;
}

/** Among the passing three-slot plans: how many include a conversation with this person, anywhere. */
export function passingWith(id: StakeholderId): number {
  const options: Slot[] = STAKEHOLDERS.flatMap((s) => ANGLES.map((a) => ({ who: s.id, angle: a.id })));
  let n = 0;
  for (const a of options) for (const b of options) for (const c of options) {
    if ((a.who === id || b.who === id || c.who === id) && runPlan([a, b, c]).pass) n += 1;
  }
  return n;
}

/** The people in a plan, in order: "Gus, Dana, Eli". */
export const planNames = (plan: readonly Slot[]): string => plan.filter(isUsed).map((s) => stakeholderOf(s.who).name).join(', ');

/** A plan in words: "Gus on credibility, then Dana on workload". */
export function planText(plan: readonly Slot[]): string {
  const used = plan.filter(isUsed);
  if (used.length === 0) return 'no conversations';
  return used.map((s) => `${stakeholderOf(s.who).name} on ${angleLabel(s.angle)}`).join(', then ');
}
