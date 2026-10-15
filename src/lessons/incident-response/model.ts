/**
 * Incident response, pure: one invented incident, three possible hidden causes, four first actions.
 * Every number is an invented, named constant. The scenario graph (core/scenario) is generated from
 * the same constants the timeline replay and the outcome table read, so the three scenes cannot
 * disagree.
 */
import { enumeratePaths, type Choice, type Ending, type Meter, type Node, type Scenario, type Walk } from '../../core/scenario';

export type Cause = 'deploy' | 'dependency' | 'region';
export const CAUSES: readonly Cause[] = ['deploy', 'dependency', 'region'];
export const CAUSE_LABEL: Record<Cause, string> = { deploy: 'Bad deploy', dependency: 'Slow dependency', region: 'One region down' };

export type Action = 'investigate' | 'rollback' | 'failover' | 'flag';
export const ACTIONS: readonly Action[] = ['investigate', 'rollback', 'failover', 'flag'];
export const ACTION_LABEL: Record<Action, string> = {
  investigate: 'Investigate first',
  rollback: 'Roll back the last deploy',
  failover: 'Fail over to the standby region',
  flag: 'Switch off the optional recommendations feature with a flag',
};
/** A short name for a table cell or a sentence. */
export const ACTION_SHORT: Record<Action, string> = { investigate: 'investigate', rollback: 'roll back', failover: 'fail over', flag: 'flag off' };

// ── Invented constants ─────────────────────────────────────────────────

/** Checkout requests per minute, and how many of them fail from minute 0. */
export const TRAFFIC = 1000;
export const ONSET_RATE = 400;
/** What the flag leaves failing for the slow-dependency cause: a degraded mitigation, not a fix. */
export const DEGRADED_RATE = 120;
/** The deploy finishes at 14:02, and that minute is minute 0 of the incident. */
export const ONSET_CLOCK_MIN = 14 * 60 + 2;
export const DETECT_MIN = 4;
export const ACK_MIN = 6;
/** Minutes from starting each action until it takes effect (or, for investigate, until it reports). */
export const ACTION_MINUTES: Record<Action, number> = { investigate: 3, rollback: 4, failover: 7, flag: 2 };
export const ESCALATE_MINUTES = 1;
/** Extra minutes lost when nobody is commanding: two responders act at once. */
export const CONFLICT_DELAY_MIN = 2;
export const TRUST_START = 80;
/** Spec: trust drops 5 per 10 minutes without a status update. */
export const TRUST_LOSS_PER_MIN = 0.5;
export const TRUST_UPDATE_GAIN = 1;
export const LATE_UPDATE_TRUST = 3;
export const PEOPLE_START = 1;
export const FAILED_RED_LINE = 5000;
export const MINUTES_RED_LINE = 15;
export const PEOPLE_RED_LINE = 6;

/** Which hidden causes each action changes the error rate for, and to what. Anything absent changes nothing. */
const RATE_AFTER: Record<Cause, Partial<Record<Action, number>>> = {
  deploy: { rollback: 0 },
  dependency: { flag: DEGRADED_RATE },
  region: { failover: 0 },
};

export interface ActionEffect {
  minutes: number;
  /** The error rate once it takes effect, or null when the action leaves it unchanged. */
  rateAfter: number | null;
}
export const ACTION_EFFECT: Record<Cause, Record<Action, ActionEffect>> = Object.fromEntries(
  CAUSES.map((c) => [c, Object.fromEntries(ACTIONS.map((a) => [a, { minutes: ACTION_MINUTES[a], rateAfter: RATE_AFTER[c][a] ?? null }]))]),
) as Record<Cause, Record<Action, ActionEffect>>;

/** Why an action does nothing for a cause: said once the learner has picked it. */
const WHY_NOTHING: Partial<Record<Cause, Partial<Record<Action, string>>>> = {
  deploy: { failover: 'the standby region runs the same build, so it fails the same way', flag: 'the optional feature was not what was failing' },
  dependency: { rollback: 'the last deploy was not the problem', failover: 'the standby region calls the same slow dependency' },
  region: { rollback: 'the last deploy was not the problem, and the region stays down whatever build it runs', flag: 'the optional feature was not what was failing' },
};
/** What an investigation finds, per cause. */
export const EVIDENCE: Record<Cause, string> = {
  deploy: 'only hosts on build 212, which finished rolling out at 14:02, return errors; hosts still on build 211 are healthy',
  dependency: 'the payment gateway is answering in about 8 seconds instead of the usual 0.2, and checkout waits on it',
  region: 'every request routed to the eu-west region fails its health check, and the other region is healthy',
};

export const rateAfterActions = (cause: Cause, tried: readonly Action[]): number =>
  tried.reduce((rate, a) => RATE_AFTER[cause][a] ?? rate, ONSET_RATE);

// ── Severity and roles (the first two decisions) ────────────────────────

export type Severity = 'sev1' | 'sev2' | 'sev3';
export const SEVERITIES: readonly Severity[] = ['sev1', 'sev2', 'sev3'];
/** One organisation's example scale: real scales differ. */
export const SEVERITY_TEXT: Record<Severity, { label: string; meaning: string; people: number; trust: number }> = {
  sev1: { label: 'SEV1: most users cannot check out', meaning: 'everyone on the escalation list is paged', people: 8, trust: 0 },
  sev2: { label: 'SEV2: a major feature is badly degraded', meaning: 'the service team and a few others are paged', people: 3, trust: 0 },
  sev3: { label: 'SEV3: minor, there is a workaround', meaning: 'nobody else is paged and customers get a lighter notice, which costs some trust in this model', people: 0, trust: -5 },
};

export type Roles = 'all' | 'no-commander' | 'no-comms' | 'none';
export const ROLES: readonly Roles[] = ['all', 'no-commander', 'no-comms', 'none'];
export const ROLE_LABEL: Record<Roles, string> = {
  all: 'Assign all four: commander, operations lead, communications lead, scribe',
  'no-commander': 'Skip the commander: the two responders sort it out between them',
  'no-comms': 'Skip the communications lead: the responders will post an update when they can',
  none: 'Skip the roles: just fix it',
};
export const hasCommander = (r: Roles) => r === 'all' || r === 'no-comms';
export const hasComms = (r: Roles) => r === 'all' || r === 'no-commander';

// ── Meters ─────────────────────────────────────────────────────────────

export const FAILED = 'failed';
export const MINUTES = 'minutes';
export const TRUST = 'trust';
export const PEOPLE = 'people';

export const METERS: readonly Meter[] = [
  { id: FAILED, label: 'Failed requests so far', start: ONSET_RATE * ACK_MIN, min: 0, max: 20000, bad: { above: FAILED_RED_LINE } },
  { id: MINUTES, label: 'Minutes since onset', start: ACK_MIN, min: 0, max: 60, bad: { above: MINUTES_RED_LINE }, unit: 'min' },
  { id: TRUST, label: 'Customer trust', start: TRUST_START, min: 0, max: 100, bad: { below: 60 } },
  { id: PEOPLE, label: 'People pulled in', start: PEOPLE_START, min: 0, max: 14, bad: { above: PEOPLE_RED_LINE } },
];

/** The trust a stretch of `minutes` costs or earns: a communications lead posts an update, nobody else does. */
const trustFor = (comms: boolean, minutes: number) => (comms ? TRUST_UPDATE_GAIN : -TRUST_LOSS_PER_MIN * minutes);

// ── The scenario, generated from the constants above ─────────────────────

const ESCALATE = 'escalate';
const RESOLVED = 'resolved';
const DEGRADED = 'degraded';

const actionNodeId = (comms: boolean, tried: readonly Action[]) => `act-${comms ? 'comms' : 'silent'}-${tried.join('+') || 'none'}`;
const inOrder = (tried: readonly Action[]) => ACTIONS.filter((a) => tried.includes(a));

const fmt = (n: number) => n.toLocaleString('en-US');

function becauseAction(cause: Cause, action: Action, rate: number, comms: boolean): string {
  const { minutes, rateAfter } = ACTION_EFFECT[cause][action];
  const cost = `It takes ${minutes} minutes, and the errors keep coming at ${rate} per ${fmt(TRAFFIC)} meanwhile.`;
  const trust = comms ? ' The communications lead posts an update.' : ' Nobody is posting updates, so trust drops.';
  if (action === 'investigate') return `${cost} It fixes nothing itself, but it finds out the cause: ${EVIDENCE[cause]}.${trust}`;
  if (rateAfter === 0) return `${cost} It fixes this cause: errors go to 0.${trust}`;
  if (rateAfter !== null) return `${cost} It cuts the errors from ${rate} to ${rateAfter} per ${fmt(TRAFFIC)}: a degraded mitigation, not a fix.${trust}`;
  return `${cost} It changes nothing for this cause: ${WHY_NOTHING[cause]?.[action] ?? 'it was not the problem'}.${trust}`;
}

function actionPrompt(cause: Cause, tried: readonly Action[], rate: number): string {
  const found = tried.includes('investigate') ? ` Your investigation found that ${EVIDENCE[cause]}.` : '';
  const list = tried.length ? `Tried so far: ${tried.map((a) => ACTION_SHORT[a]).join(', ')}.` : 'Nothing tried yet.';
  const state = rate === ONSET_RATE ? `Checkout is still failing for ${rate} of every ${fmt(TRAFFIC)} requests.` : `Checkout failures are down to ${rate} of every ${fmt(TRAFFIC)} requests.`;
  return `${state} ${list}${found} What next?`;
}

function actionChoices(cause: Cause, comms: boolean, tried: readonly Action[], rate: number): Choice[] {
  const choices: Choice[] = ACTIONS.filter((a) => !tried.includes(a)).map((a) => {
    const next = inOrder([...tried, a]);
    const { minutes } = ACTION_EFFECT[cause][a];
    return {
      id: a,
      label: ACTION_LABEL[a],
      to: rateAfterActions(cause, next) === 0 ? RESOLVED : actionNodeId(comms, next),
      effects: { [FAILED]: rate * minutes, [MINUTES]: minutes, [TRUST]: trustFor(comms, minutes) },
      because: becauseAction(cause, a, rate, comms),
    };
  });
  if (rate > 0 && rate < ONSET_RATE) {
    choices.push({
      id: ESCALATE,
      label: 'Keep the mitigation on and hand the rest to the dependency’s owner',
      to: DEGRADED,
      effects: { [FAILED]: rate * ESCALATE_MINUTES, [MINUTES]: ESCALATE_MINUTES, [TRUST]: trustFor(comms, ESCALATE_MINUTES) },
      because: `Nothing you can do removes the slow dependency, so you stop here with ${rate} per ${fmt(TRAFFIC)} still failing until its owner fixes it.`,
    });
  }
  return choices;
}

const START_NODE: Node = {
  id: 'severity',
  prompt: `Checkout has been failing for ${ACK_MIN} minutes: ${ONSET_RATE} of every ${fmt(TRAFFIC)} requests. The symptom alert fired at minute ${DETECT_MIN} and you acknowledged the page at minute ${ACK_MIN}. A deploy finished at 14:02. What severity do you declare?`,
  choices: SEVERITIES.map((s) => ({
    id: s,
    label: SEVERITY_TEXT[s].label,
    to: 'roles',
    effects: { [PEOPLE]: SEVERITY_TEXT[s].people, [TRUST]: SEVERITY_TEXT[s].trust },
    because: `In this example scale, ${SEVERITY_TEXT[s].meaning}. ${SEVERITY_TEXT[s].people > 0 ? `That pulls in ${SEVERITY_TEXT[s].people} more people, who stop other work.` : 'It pulls in nobody else.'}`,
  })),
};

function rolesNode(): Node {
  return {
    id: 'roles',
    prompt: 'Who does what? Roles borrowed from emergency services keep one person deciding, one typing, one telling customers and one writing the timeline.',
    choices: ROLES.map((r) => {
      const comms = hasComms(r);
      const delay = hasCommander(r) ? 0 : CONFLICT_DELAY_MIN;
      const effects: Record<string, number> = {};
      if (delay) {
        effects[FAILED] = ONSET_RATE * delay;
        effects[MINUTES] = delay;
      }
      const trust = (comms ? 0 : -LATE_UPDATE_TRUST) + (comms ? 0 : -TRUST_LOSS_PER_MIN * delay);
      if (trust) effects[TRUST] = trust;
      const because = [
        delay ? `With nobody commanding, two responders act at once and ${delay} minutes go on untangling it, at ${ONSET_RATE} per ${fmt(TRAFFIC)} failing meanwhile.` : 'One person decides and one person types, so nothing collides.',
        comms ? 'The communications lead keeps the status page current.' : `The first status update is late, and trust falls ${LATE_UPDATE_TRUST} points straight away and keeps falling while nobody posts.`,
      ].join(' ');
      return { id: `roles-${r}`, label: ROLE_LABEL[r], to: actionNodeId(comms, []), effects, because };
    }),
  };
}

/** The scenario for one hidden cause: severity, roles, then actions until the errors are gone or contained. */
export function buildScenario(cause: Cause): Scenario {
  const nodes: Node[] = [START_NODE, rolesNode()];
  const seen = new Set<string>();
  const visit = (comms: boolean, tried: readonly Action[]) => {
    const id = actionNodeId(comms, tried);
    if (seen.has(id)) return;
    seen.add(id);
    const rate = rateAfterActions(cause, tried);
    const choices = actionChoices(cause, comms, tried, rate);
    nodes.push({ id, prompt: actionPrompt(cause, tried, rate), choices });
    for (const c of choices) if (c.to !== RESOLVED && c.to !== DEGRADED) visit(comms, inOrder([...tried, c.id as Action]));
  };
  for (const comms of [true, false]) visit(comms, []);
  const fixable = Object.values(RATE_AFTER[cause]).includes(0);
  const endings: Ending[] = fixable
    ? [{ id: RESOLVED, title: 'The errors are gone', text: 'Checkout is healthy again. The incident is mitigated; understanding why it happened is the next job, and it is not urgent any more.' }]
    : [{ id: DEGRADED, title: 'Contained, not fixed', text: 'You cut the damage and handed the rest to the owner of the slow dependency. Customers still see some errors until it recovers, and you have said so.' }];
  return { start: START_NODE.id, nodes, meters: METERS, endings };
}

export const SCENARIOS: Record<Cause, Scenario> = { deploy: buildScenario('deploy'), dependency: buildScenario('dependency'), region: buildScenario('region') };

// ── The timeline of a finished (or sample) path ──────────────────────────

export type Outcome = 'delay' | 'info' | 'fixed' | 'partial' | 'nothing';

export interface Segment {
  kind: 'delay' | Action | 'escalate';
  start: number;
  end: number;
  rateBefore: number;
  rateAfter: number;
  outcome: Outcome;
}

export interface Timeline {
  severity: Severity;
  roles: Roles;
  segments: Segment[];
  /** Minute the walk has reached: the last action's end. */
  end: number;
  /** First minute the error rate is lower than at onset, or null. */
  mitigatedAt: number | null;
  /** The minute the errors reach 0, or null. */
  resolvedAt: number | null;
}

/** Turn a list of choice ids (severity, roles, then actions) into the segments the replay draws. */
export function timelineOf(cause: Cause, choiceIds: readonly string[]): Timeline {
  let severity: Severity = 'sev2';
  let roles: Roles = 'all';
  const segments: Segment[] = [];
  let t = ACK_MIN;
  let rate = ONSET_RATE;
  for (const id of choiceIds) {
    if ((SEVERITIES as readonly string[]).includes(id)) severity = id as Severity;
    else if (id.startsWith('roles-')) {
      roles = id.slice('roles-'.length) as Roles;
      if (!hasCommander(roles)) {
        segments.push({ kind: 'delay', start: t, end: t + CONFLICT_DELAY_MIN, rateBefore: rate, rateAfter: rate, outcome: 'delay' });
        t += CONFLICT_DELAY_MIN;
      }
    } else if (id === ESCALATE) {
      segments.push({ kind: 'escalate', start: t, end: t + ESCALATE_MINUTES, rateBefore: rate, rateAfter: rate, outcome: 'info' });
      t += ESCALATE_MINUTES;
    } else {
      const a = id as Action;
      const after = ACTION_EFFECT[cause][a].rateAfter ?? rate;
      const outcome: Outcome = a === 'investigate' ? 'info' : after === 0 ? 'fixed' : after < rate ? 'partial' : 'nothing';
      segments.push({ kind: a, start: t, end: t + ACTION_MINUTES[a], rateBefore: rate, rateAfter: after, outcome });
      t += ACTION_MINUTES[a];
      rate = after;
    }
  }
  const dropped = segments.find((s) => s.rateAfter < ONSET_RATE);
  const fixed = segments.find((s) => s.rateAfter === 0);
  return { severity, roles, segments, end: t, mitigatedAt: dropped ? dropped.end : null, resolvedAt: fixed ? fixed.end : null };
}

/** The choice ids of a walk, in order. */
export const choiceIdsOf = (walk: Walk): string[] => walk.path.map((p) => p.choice);

/** Failures per minute at minute `t`: the rate set by the last action that had taken effect by then. */
export function rateAt(tl: Timeline, t: number): number {
  return tl.segments.reduce((rate, s) => (s.end <= t ? s.rateAfter : rate), ONSET_RATE);
}

/** Failed requests from minute 0 to `now`, summed minute by minute. */
export function failedBy(tl: Timeline, now: number): number {
  let total = 0;
  for (let minute = 0; minute < now; minute++) total += rateAt(tl, minute);
  return total;
}

/** The path a player who plays the sample takes: SEV2, all roles, then the actions that fit the cause. */
export const SAMPLE_PATH: Record<Cause, string[]> = {
  deploy: ['sev2', 'roles-all', 'investigate', 'rollback'],
  dependency: ['sev2', 'roles-all', 'flag', ESCALATE],
  region: ['sev2', 'roles-all', 'investigate', 'failover'],
};

// ── The outcome table: every first action against every cause ────────────

export interface OutcomeRow {
  cause: Cause;
  first: Action;
  /** Minute the errors first fall below the onset rate, on the best continuation. */
  mitigatedAt: number;
  failed: number;
  ending: 'resolved' | 'degraded';
}

/**
 * For each cause and first action: the best continuation, by failed requests, over every path the scenario
 * graph allows that declares SEV2 and assigns all four roles (so only the actions differ between rows).
 */
export function outcomeRows(): OutcomeRow[] {
  const rows: OutcomeRow[] = [];
  for (const cause of CAUSES) {
    const paths = enumeratePaths(SCENARIOS[cause]).filter((p) => p.choices[0] === 'sev2' && p.choices[1] === 'roles-all');
    for (const first of ACTIONS) {
      const best = paths
        .filter((p) => p.choices[2] === first)
        .reduce((a, b) => (b.meters[FAILED] < a.meters[FAILED] || (b.meters[FAILED] === a.meters[FAILED] && b.meters[MINUTES] < a.meters[MINUTES]) ? b : a));
      const tl = timelineOf(cause, best.choices);
      rows.push({ cause, first, mitigatedAt: tl.mitigatedAt!, failed: best.meters[FAILED], ending: best.endingId as OutcomeRow['ending'] });
    }
  }
  return rows;
}

/**
 * The mean of the failed requests of each first action over the three causes, weighting them equally
 * (an assumption: the learner does not know the cause, and the lesson does not say how likely each is).
 */
export function meanFailedByFirst(rows: readonly OutcomeRow[] = outcomeRows()): Record<Action, number> {
  const mean = (first: Action) => {
    const mine = rows.filter((r) => r.first === first);
    return mine.reduce((sum, r) => sum + r.failed, 0) / mine.length;
  };
  return Object.fromEntries(ACTIONS.map((a) => [a, mean(a)])) as Record<Action, number>;
}
