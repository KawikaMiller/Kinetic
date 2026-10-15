/**
 * Config rollout, pure: a fleet of 48 servers in 4 regions of 12, four authored changes, and a plan of stages with a bake time and a
 * health gate. Time is whole minutes. The one unit for every strategy is server-minutes affected: for each server that fails, the minutes
 * from the first minute it fails until the rollback reaches it. Every number is invented and named; nothing here is a measurement.
 */

export const REGIONS = ['us-east', 'us-west', 'eu-west', 'ap-south'] as const;
export const REGION_SIZE = 12;
export const FLEET = REGIONS.length * REGION_SIZE;
export const regionOf = (server: number) => Math.floor(server / REGION_SIZE);

/** The region the "bad for one region's data" change breaks, and the minutes the "bad at peak" change takes to show itself. */
export const FAULT_REGION = 2;
export const PEAK_DELAY = 20;
/** The gate stops the rollout when more than this share of the servers it has reached are failing. */
export const GATE_THRESHOLD = 0.05;
/** Minutes to take the change off the servers: automatic, or by a person who has to be told and act. */
export const ROLLBACK_AUTO_MIN = 3;
export const ROLLBACK_MANUAL_MIN = 15;
/** Minutes before a person notices a failure when no gate has: used whenever the gate is off or did not see it. */
export const HUMAN_DETECT_MIN = 10;
export const BAKE_MAX = 40;
export const BAKE_DEFAULT = 5;

/** The schema's range for the request timeout, in milliseconds, and what each change sets it to. The checkout service's own timeout is 30000. */
export const TIMEOUT_RANGE = { min: 1000, max: 120000 } as const;
export const TIMEOUT_OK = 30000;
export const TIMEOUT_TYPO = 30;
/** The schema check: does a timeout value sit inside the range? */
export const withinRange = (timeoutMs: number): boolean => timeoutMs >= TIMEOUT_RANGE.min && timeoutMs <= TIMEOUT_RANGE.max;

export type ChangeId = 'validation' | 'crash' | 'peak' | 'region';

export interface Change {
  id: ChangeId;
  label: string;
  /** Minutes after landing on a server until it starts failing. */
  delay: number;
  /** Does it break this server? */
  affects: (server: number) => boolean;
  /** The request timeout it sets, in ms: what the schema check looks at. */
  timeoutMs: number;
  what: string;
}

export const CHANGES: readonly Change[] = [
  { id: 'validation', label: 'Fails validation', delay: 0, affects: () => true, timeoutMs: TIMEOUT_TYPO, what: `a timeout of ${TIMEOUT_TYPO} where ${TIMEOUT_OK} was meant: outside the range the schema allows` },
  { id: 'crash', label: 'Crashes on load', delay: 0, affects: () => true, timeoutMs: TIMEOUT_OK, what: 'a value that passes the schema but crashes the service when it loads' },
  { id: 'peak', label: 'Bad only at peak', delay: PEAK_DELAY, affects: () => true, timeoutMs: TIMEOUT_OK, what: `healthy for ${PEAK_DELAY} minutes, then fails once traffic crosses a threshold` },
  { id: 'region', label: 'Bad for one region’s data', delay: 0, affects: (s) => regionOf(s) === FAULT_REGION, timeoutMs: TIMEOUT_OK, what: `fails only on ${REGIONS[FAULT_REGION]}, whose data it cannot read` },
];

export const changeOf = (id: ChangeId): Change => CHANGES.find((c) => c.id === id)!;

/** The stages a plan may add before the last one, as the number of servers reached once the stage has landed. */
export const STAGE_CHOICES = [
  { id: 'canary', label: 'Canary', size: 1 },
  { id: 'region', label: 'One region', size: REGION_SIZE },
  { id: 'half', label: 'Half', size: FLEET / 2 },
] as const;

export interface Plan {
  /** Servers reached after each stage, increasing, the last one the whole fleet. */
  stages: readonly number[];
  /** Minutes each stage waits before the next, watching. */
  bake: number;
  /** Does a health gate stop the rollout when the reached servers are failing? */
  gate: boolean;
  validate: boolean;
  /** Is the rollback automatic once the problem is seen? */
  autoRollback: boolean;
}

/**
 * Everything at once, the way scene 1 pushes it: one stage of the whole fleet, no gate, no validation, and a person who notices and rolls
 * back by hand. Scene 1 has no bake, gate or rollback control: these are its constants.
 */
export const ALL_AT_ONCE: Plan = { stages: [FLEET], bake: 0, gate: false, validate: false, autoRollback: false };

export const planFrom = (chosen: readonly (typeof STAGE_CHOICES)[number]['id'][], rest: Omit<Plan, 'stages'>): Plan => ({
  ...rest,
  stages: [...STAGE_CHOICES.filter((s) => chosen.includes(s.id)).map((s) => s.size), FLEET],
});

export type StageOutcome = 'passed' | 'stopped';

export interface StageRun {
  /** Servers reached once it has landed. */
  size: number;
  start: number;
  /** The end of its bake: the minute the next stage would start. */
  end: number;
  outcome: StageOutcome;
}

export interface Result {
  /** Validation refused the change: nothing shipped. */
  refused: boolean;
  stages: StageRun[];
  /** Per server: the minute the change landed, or null if it never did. */
  landAt: (number | null)[];
  /** Per server: the first minute it fails, or null. */
  failAt: (number | null)[];
  detectedAt: number | null;
  detectedBy: 'gate' | 'human' | null;
  /** The minute every reached server is back on the old version. */
  revertAt: number | null;
  serverMinutes: number;
  /** Servers the change reached. */
  reached: number;
  /** Most servers failing at once. */
  peakFailing: number;
}

const nulls = () => Array.from({ length: FLEET }, () => null as number | null);

/** Run a change through a plan, stage by stage. A gate checks every minute of a stage's bake, the end of it included, before the next stage starts. */
export function simulate(change: Change, plan: Plan): Result {
  const landAt = nulls();
  const failAt = nulls();
  const stages: StageRun[] = [];
  const empty: Result = { refused: false, stages, landAt, failAt, detectedAt: null, detectedBy: null, revertAt: null, serverMinutes: 0, reached: 0, peakFailing: 0 };
  if (plan.validate && !withinRange(change.timeoutMs)) return { ...empty, refused: true };

  let t = 0;
  let landed = 0;
  let detection: { at: number; by: 'gate' | 'human' } | null = null;
  for (const [i, size] of plan.stages.entries()) {
    if (detection) break;
    for (let s = landed; s < size; s++) {
      landAt[s] = t;
      if (change.affects(s)) failAt[s] = t + change.delay;
    }
    landed = size;
    const end = t + plan.bake;
    const failing = (minute: number) => failAt.slice(0, landed).filter((f) => f !== null && f <= minute).length;
    let seen: number | null = null;
    if (plan.gate) {
      for (let c = t; c <= end && seen === null; c++) if (failing(c) / landed > GATE_THRESHOLD) seen = c;
    }
    const firstFail = Math.min(...failAt.slice(0, landed).filter((f): f is number => f !== null));
    const human = Number.isFinite(firstFail) ? firstFail + HUMAN_DETECT_MIN : null;
    const last = i === plan.stages.length - 1;
    const personSees = human !== null && (last || human <= end);
    if (seen !== null && (!personSees || seen <= human!)) detection = { at: seen, by: 'gate' };
    else if (personSees) detection = { at: human!, by: 'human' };
    stages.push({ size, start: t, end, outcome: detection ? 'stopped' : 'passed' });
    t = end;
  }

  const found = detection as { at: number; by: 'gate' | 'human' } | null;
  const revertAt = found ? found.at + (plan.autoRollback ? ROLLBACK_AUTO_MIN : ROLLBACK_MANUAL_MIN) : null;
  let serverMinutes = 0;
  let peakFailing = 0;
  if (revertAt !== null) {
    for (const f of failAt) if (f !== null && f < revertAt) serverMinutes += revertAt - f;
    for (let m = 0; m < revertAt; m++) peakFailing = Math.max(peakFailing, failAt.filter((f) => f !== null && f <= m).length);
  }
  return { ...empty, detectedAt: found?.at ?? null, detectedBy: found?.by ?? null, revertAt, serverMinutes, reached: landed, peakFailing };
}

export type ServerStatus = 'unreached' | 'healthy' | 'failing' | 'rolledback';

/** What a server is doing at minute `now`: not reached, running the change fine, failing, or back on the old version. */
export function statusAt(r: Result, server: number, now: number): ServerStatus {
  const land = r.landAt[server];
  if (land === null || land > now) return 'unreached';
  if (r.revertAt !== null && now >= r.revertAt) return 'rolledback';
  const fail = r.failAt[server];
  return fail !== null && fail <= now ? 'failing' : 'healthy';
}

/** The last minute worth showing. */
export const endOf = (r: Result): number => (r.revertAt ?? Math.max(0, ...r.stages.map((s) => s.end))) + 2;

/** Which stage is baking at minute `now`, or null when none is (before the start, after a stop, or after the last bake). */
export function bakingStage(r: Result, now: number): StageRun | null {
  return r.stages.find((s) => now >= s.start && now < s.end && (r.detectedAt === null || now < r.detectedAt)) ?? null;
}
