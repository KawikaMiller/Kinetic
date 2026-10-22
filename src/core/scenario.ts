/**
 * The branching decision-simulator engine (K3-15), pure: no React, nothing about any one lesson.
 * A scenario is nodes with choices, meters that choices move, and endings; every choice carries
 * the `because` that explains it. `components/ScenarioStory.tsx` draws it, `validateScenario`
 * keeps an authored scenario honest (reachable, no dead end, meters in bounds on every path).
 */

/** The closing sentence of every ending in a story whose paths all cost something (the K4 lead lessons). */
export const READ_THE_LEDGER = 'Read the ledger: every path here costs something.';

/** A number the choices move. It reads `bad` once it crosses `bad`; until then it is fine. */
export interface Meter {
  id: string;
  label: string;
  start: number;
  min: number;
  max: number;
  /** The meter is in the red when its value is beyond this edge. */
  bad: { below: number } | { above: number };
  unit?: string;
}

export interface Choice {
  id: string;
  label: string;
  /** A node id or an ending id. */
  to: string;
  /** How picking it moves each meter, by meter id. */
  effects?: Readonly<Record<string, number>>;
  /** Why this choice does what it does: shown with the choice, never hidden. */
  because: string;
}

export interface Node {
  id: string;
  prompt: string;
  choices: readonly Choice[];
}

export interface Ending {
  id: string;
  title: string;
  text: string;
}

export interface Scenario {
  start: string;
  nodes: readonly Node[];
  meters: readonly Meter[];
  endings: readonly Ending[];
}

export type Values = Readonly<Record<string, number>>;

/** Where a learner is: the node or ending they are at, the choices made so far and the meters. */
export interface Walk {
  at: string;
  path: readonly { node: string; choice: string }[];
  meters: Values;
}

export const findNode = (s: Scenario, id: string): Node | undefined => s.nodes.find((n) => n.id === id);
export const findEnding = (s: Scenario, id: string): Ending | undefined => s.endings.find((e) => e.id === id);
export const isEnding = (s: Scenario, id: string): boolean => findEnding(s, id) !== undefined;

export const startValues = (s: Scenario): Values => Object.fromEntries(s.meters.map((m) => [m.id, m.start]));

export const startWalk = (s: Scenario): Walk => ({ at: s.start, path: [], meters: startValues(s) });

/** Is this value in the red for the meter? */
export const isBad = (m: Meter, value: number): boolean => ('below' in m.bad ? value < m.bad.below : value > m.bad.above);

/** Apply a choice's effects to meter values. Values are not clamped: a valid scenario never needs it (see validateScenario). */
export function applyEffects(values: Values, effects: Choice['effects']): Values {
  const next: Record<string, number> = { ...values };
  for (const [id, delta] of Object.entries(effects ?? {})) next[id] = (next[id] ?? 0) + delta;
  return next;
}

/** Make a choice at the current node. A choice that is not at this node, or a walk already at an ending, changes nothing. */
export function choose(s: Scenario, w: Walk, choiceId: string): Walk {
  const node = findNode(s, w.at);
  const choice = node?.choices.find((c) => c.id === choiceId);
  if (!node || !choice) return w;
  return { at: choice.to, path: [...w.path, { node: node.id, choice: choice.id }], meters: applyEffects(w.meters, choice.effects) };
}

/** Undo the last choice by replaying the rest of the path from the start, so the meters can never drift from the choices. */
export function undo(s: Scenario, w: Walk): Walk {
  return w.path.slice(0, -1).reduce((walk, step) => choose(s, walk, step.choice), startWalk(s));
}

/** One line of the ledger: what was chosen, what it moved, and why. */
export interface LedgerRow {
  nodeId: string;
  prompt: string;
  choice: Choice;
}

export function ledger(s: Scenario, w: Walk): LedgerRow[] {
  return w.path.map((step) => {
    const node = findNode(s, step.node)!;
    return { nodeId: node.id, prompt: node.prompt, choice: node.choices.find((c) => c.id === step.choice)! };
  });
}

/** The meters that are in the red at these values. */
export const redMeters = (s: Scenario, values: Values): Meter[] => s.meters.filter((m) => isBad(m, values[m.id]));

// ── Validation ───────────────────────────────────────────────────────────

export type ProblemKind =
  | 'start' | 'duplicate-id' | 'missing-target' | 'unreachable-node' | 'unreachable-ending' | 'dead-end' | 'cycle'
  | 'out-of-bounds' | 'unknown-meter'
  /** Trade-off checks (`tradeoffs: true`): a straw-man choice, and a path that costs nothing. */
  | 'dominated-choice' | 'free-path'
  /** Whole-path checks (`tradeoffs: true`): a complete path another path beats on every meter; and (`duplicatePaths: true`) two paths that end identically. */
  | 'dominated-path' | 'duplicate-path';

export interface Problem {
  kind: ProblemKind;
  detail: string;
}

/** Paths longer than this are not explored: a scenario that long is a cycle or a mistake. */
export const MAX_DEPTH = 40;

export interface ValidateOptions {
  /**
   * A scenario meant to loop (a retry, a review round) is not a problem. Paths are then enumerated only
   * until they first revisit a node, so the meter bounds are checked on the first lap and no further.
   */
  allowCycles?: boolean;
  /**
   * Also check that the scenario has no obviously-correct path (AC-0/T4 #35, K4-9): `dominated-choice` for a
   * straw-man choice and `free-path` for a path that costs nothing. For opinion lessons, where a scenario that
   * recommends one answer by construction is a defect. Off by default: a technical scenario may well have one right answer.
   */
  tradeoffs?: boolean;
  /**
   * With `tradeoffs`: path ids (`pathId`: the choice ids joined with ' > ') that are deliberately a trap, a labelled
   * bad option the lesson wants on offer. They are not reported as `dominated-path` (they may still dominate others).
   */
  trapPaths?: readonly string[];
  /** With `tradeoffs`: `dominatedPaths`' `crossEndings` (compare paths that end differently too; default false). */
  crossEndings?: boolean;
  /** With `tradeoffs`: also report `duplicate-path` (informational), two complete paths whose final meters are identical. Off by default. */
  duplicatePaths?: boolean;
}

/**
 * Check a scenario: ids unique, every choice leads somewhere that exists, every node and every
 * ending is reachable from the start, no node is a dead end, there are no cycles (so the paths
 * can be enumerated, unless `allowCycles` says a looping scenario is meant), and on every path from the start to an ending the meters stay inside their
 * bounds at every step with the effects applied as written, with no clamping. With `tradeoffs` it also
 * runs `dominatedChoices`, `freePaths` and `dominatedPaths`.
 */
export function validateScenario(s: Scenario, { allowCycles = false, tradeoffs = false, trapPaths = [], crossEndings = false, duplicatePaths: reportDuplicates = false }: ValidateOptions = {}): Problem[] {
  const problems: Problem[] = [];
  const add = (kind: ProblemKind, detail: string) => problems.push({ kind, detail });

  const ids = [...s.nodes.map((n) => n.id), ...s.endings.map((e) => e.id)];
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) add('duplicate-id', `${id} names two things`);
  if (!findNode(s, s.start)) add('start', `the start ${s.start} is not a node`);

  const meterIds = new Set(s.meters.map((m) => m.id));
  for (const n of s.nodes) {
    if (n.choices.length === 0) add('dead-end', `${n.id} has no choices and is not an ending`);
    for (const c of n.choices) {
      if (!findNode(s, c.to) && !findEnding(s, c.to)) add('missing-target', `${n.id}/${c.id} leads to ${c.to}, which does not exist`);
      for (const m of Object.keys(c.effects ?? {})) if (!meterIds.has(m)) add('unknown-meter', `${n.id}/${c.id} moves ${m}, which is not a meter`);
    }
  }
  for (const m of s.meters) if (m.start < m.min || m.start > m.max) add('out-of-bounds', `${m.id} starts outside its bounds`);

  // Reachability by plain search.
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    findNode(s, id)?.choices.forEach((c) => visit(c.to));
  };
  visit(s.start);
  for (const n of s.nodes) if (!seen.has(n.id)) add('unreachable-node', `${n.id} cannot be reached from the start`);
  for (const e of s.endings) if (!seen.has(e.id)) add('unreachable-ending', `${e.id} cannot be reached from the start`);

  // Bounded enumeration of every path, with meters checked at each step.
  const walk = (id: string, values: Values, trail: string[]) => {
    const node = findNode(s, id);
    if (!node) return;
    if (trail.length >= MAX_DEPTH || trail.includes(id)) {
      if (!allowCycles) add('cycle', `${[...trail, id].join(' > ')} loops or runs past ${MAX_DEPTH} steps`);
      return;
    }
    for (const c of node.choices) {
      const next = applyEffects(values, c.effects);
      for (const m of s.meters) {
        if (next[m.id] < m.min || next[m.id] > m.max) add('out-of-bounds', `${[...trail, id, c.id].join(' > ')} puts ${m.id} at ${next[m.id]}, outside ${m.min} to ${m.max}`);
      }
      walk(c.to, next, [...trail, id]);
    }
  };
  walk(s.start, startValues(s), []);
  if (tradeoffs) {
    problems.push(...dominatedChoices(s), ...freePaths(s), ...dominatedPaths(s, { trapPaths, crossEndings }));
    if (reportDuplicates) problems.push(...duplicatePaths(s));
  }
  return problems;
}

// ── Trade-off checks (K4-9) ──────────────────────────────────────────────

/** +1 when a higher value is better for the meter, -1 when a lower one is (read from its `bad` edge). */
const betterSign = (m: Meter): 1 | -1 => ('below' in m.bad ? 1 : -1);

/** How much better `a` is than `b` on one meter, in the meter's own good direction (negative when worse). */
const gain = (m: Meter, a: number, b: number): number => betterSign(m) * (a - b);

/** Is `a` at least as good as `b` on every meter? Meters a vector does not mention count as 0. */
const atLeastAsGood = (s: Scenario, a: Values, b: Values): boolean => s.meters.every((m) => gain(m, a[m.id] ?? 0, b[m.id] ?? 0) >= 0);

/** One way a story can end from some point: which ending, and the total effects of the choices on the way. */
interface Outcome {
  ending: string;
  delta: Values;
}

/**
 * Every way the story can still unfold from `id`, deduplicated. An ending has exactly one outcome (itself, with no
 * effects). A path that loops back (or runs past MAX_DEPTH) is not a way to finish and is left out.
 */
function outcomesFrom(s: Scenario, id: string, trail: readonly string[] = []): Outcome[] {
  if (isEnding(s, id)) return [{ ending: id, delta: {} }];
  const node = findNode(s, id);
  if (!node || trail.includes(id) || trail.length >= MAX_DEPTH) return [];
  const seen = new Map<string, Outcome>();
  for (const c of node.choices) {
    for (const rest of outcomesFrom(s, c.to, [...trail, id])) {
      const delta = Object.fromEntries(s.meters.map((m) => [m.id, (c.effects?.[m.id] ?? 0) + (rest.delta[m.id] ?? 0)]));
      seen.set(`${rest.ending}|${JSON.stringify(delta)}`, { ending: rest.ending, delta });
    }
  }
  return [...seen.values()];
}

/**
 * How two choices at one node are compared by where they lead:
 * - `same`: only choices with the same destination (the narrow reading of a straw man);
 * - `equal-or-better`: the default. Y's destination is the same as X's, or an equally good one: every ending that
 *   X's destination can reach, Y's destination reaches too, at a cost no worse on any meter. Two different endings
 *   are never equally good, because the meters cannot say whether "hire" beats "no hire";
 * - `ignore`: destinations play no part (the strictest reading; flags the most).
 */
export type DestinationRule = 'same' | 'equal-or-better' | 'ignore';

export interface DominatedOptions {
  destinations?: DestinationRule;
}

/**
 * Straw-man choices. At one node, choice X is dominated by a sibling Y when Y's effects are no worse than X's on
 * every meter (the good direction of each meter comes from its `bad` edge) and strictly better on at least one,
 * and Y leads somewhere at least as good (see `DestinationRule`). Nothing is a reason to pick X, so the node is
 * not a real decision.
 */
export function dominatedChoices(s: Scenario, { destinations = 'equal-or-better' }: DominatedOptions = {}): Problem[] {
  const problems: Problem[] = [];
  const leadsAtLeastAsWell = (x: Choice, y: Choice): boolean => {
    if (destinations === 'ignore' || x.to === y.to) return true;
    if (destinations === 'same') return false;
    const yOutcomes = outcomesFrom(s, y.to);
    return outcomesFrom(s, x.to).every((ox) => yOutcomes.some((oy) => oy.ending === ox.ending && atLeastAsGood(s, oy.delta, ox.delta)));
  };
  for (const node of s.nodes) {
    for (const x of node.choices) {
      for (const y of node.choices) {
        if (x === y) continue;
        const gains = s.meters.map((m) => gain(m, y.effects?.[m.id] ?? 0, x.effects?.[m.id] ?? 0));
        if (gains.every((g) => g >= 0) && gains.some((g) => g > 0) && leadsAtLeastAsWell(x, y)) {
          problems.push({ kind: 'dominated-choice', detail: `${node.id}/${x.id} is dominated by ${node.id}/${y.id}: no better on any meter, worse on at least one` });
        }
      }
    }
  }
  return problems;
}

/**
 * Paths that cost nothing: from the start to an ending, no meter is ever in the red and no meter ends worse than it
 * started. Such a path would be recommended by default. A looping path is cut where it revisits a node, so only
 * complete paths count and a scenario with cycles never hangs here.
 */
export function freePaths(s: Scenario): Problem[] {
  const problems: Problem[] = [];
  const begin = startValues(s);
  const go = (id: string, values: Values, everRed: boolean, trail: readonly string[], choices: readonly string[]) => {
    if (isEnding(s, id)) {
      const noWorse = s.meters.every((m) => gain(m, values[m.id], begin[m.id]) >= 0);
      if (!everRed && noWorse) problems.push({ kind: 'free-path', detail: `${choices.join(' > ')} ends at ${id} with no meter ever in the red and none worse than it started` });
      return;
    }
    const node = findNode(s, id);
    if (!node || trail.includes(id) || trail.length >= MAX_DEPTH) return;
    for (const c of node.choices) {
      const next = applyEffects(values, c.effects);
      go(c.to, next, everRed || redMeters(s, next).length > 0, [...trail, id], [...choices, c.id]);
    }
  };
  go(s.start, begin, redMeters(s, begin).length > 0, [], []);
  return problems;
}

/** A path's id: its choice ids joined with ' > ' (what `trapPaths` and the `dominated-path` detail name). */
export const pathId = (choices: readonly string[]): string => choices.join(' > ');

/** Every complete path from the start to an ending, with its final meters; a looping path is cut where it revisits a node. */
function completePaths(s: Scenario): { id: string; ending: string; meters: Values }[] {
  const out: { id: string; ending: string; meters: Values }[] = [];
  const go = (id: string, values: Values, trail: readonly string[], choices: readonly string[]) => {
    if (isEnding(s, id)) {
      out.push({ id: pathId(choices), ending: id, meters: values });
      return;
    }
    const node = findNode(s, id);
    if (!node || trail.includes(id) || trail.length >= MAX_DEPTH) return;
    for (const c of node.choices) go(c.to, applyEffects(values, c.effects), [...trail, id], [...choices, c.id]);
  };
  go(s.start, startValues(s), [], []);
  return out;
}

export interface DominatedPathOptions {
  /** Path ids (`pathId`) of deliberate trap paths: never reported as the dominated one. */
  trapPaths?: readonly string[];
  /**
   * Also compare paths that reach different endings (the strictest reading). Default false: two different endings are
   * never equally good, because the meters cannot say whether "hire" beats "no hire" (the same rule as `dominatedChoices`),
   * so a path is only dominated by a path to the same ending.
   */
  crossEndings?: boolean;
}

/**
 * Whole-path straw men. A complete path is dominated when another path's final meters are no worse on every meter
 * (the good direction comes from each meter's `bad` edge) and strictly better on at least one, and reaches the same
 * ending (or any ending, with `crossEndings`): nothing about the outcome is a reason to take it. Each dominated path
 * is reported once, naming the first path that beats it. `trapPaths` exempts labelled traps.
 */
export function dominatedPaths(s: Scenario, { trapPaths = [], crossEndings = false }: DominatedPathOptions = {}): Problem[] {
  const paths = completePaths(s);
  const traps = new Set(trapPaths);
  const problems: Problem[] = [];
  for (const x of paths) {
    if (traps.has(x.id)) continue;
    const y = paths.find((other) => {
      if (!crossEndings && other.ending !== x.ending) return false;
      const gains = s.meters.map((m) => gain(m, other.meters[m.id] ?? 0, x.meters[m.id] ?? 0));
      return gains.every((g) => g >= 0) && gains.some((g) => g > 0);
    });
    if (y) problems.push({ kind: 'dominated-path', detail: `the path ${x.id} is dominated by ${y.id}: its final meters are no better on any meter, worse on at least one` });
  }
  return problems;
}

/** Informational: pairs of complete paths whose final meters are identical (two routes to the same outcome). */
export function duplicatePaths(s: Scenario): Problem[] {
  const paths = completePaths(s);
  const problems: Problem[] = [];
  paths.forEach((x, i) => {
    for (const y of paths.slice(i + 1)) {
      if (s.meters.every((m) => (x.meters[m.id] ?? 0) === (y.meters[m.id] ?? 0))) problems.push({ kind: 'duplicate-path', detail: `the paths ${x.id} and ${y.id} end on identical meters` });
    }
  });
  return problems;
}

/** Every path from the start to an ending, with the meters it ends on (assumes the scenario validates and has no cycles). */
export function enumeratePaths(s: Scenario): { endingId: string; choices: string[]; meters: Values }[] {
  const out: { endingId: string; choices: string[]; meters: Values }[] = [];
  const go = (id: string, values: Values, choices: string[]) => {
    const node = findNode(s, id);
    if (!node) {
      out.push({ endingId: id, choices, meters: values });
      return;
    }
    for (const c of node.choices) go(c.to, applyEffects(values, c.effects), [...choices, c.id]);
  };
  go(s.start, startValues(s), []);
  return out;
}
