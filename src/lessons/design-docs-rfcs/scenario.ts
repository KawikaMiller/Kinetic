/**
 * The branching decision-simulator engine, written pure and in its own file in the shape
 * docs/tier3-plan.md K3-15 asks for, so that extracting it into `core/scenario.ts` after wave 1 is a
 * move and not a rewrite. No React, nothing about design docs: a scenario is nodes with choices,
 * meters that choices move, and endings. Every choice carries the `because` that explains it.
 */

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

export type ProblemKind = 'start' | 'duplicate-id' | 'missing-target' | 'unreachable-node' | 'unreachable-ending' | 'dead-end' | 'cycle' | 'out-of-bounds' | 'unknown-meter';

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
}

/**
 * Check a scenario: ids unique, every choice leads somewhere that exists, every node and every
 * ending is reachable from the start, no node is a dead end, there are no cycles (so the paths
 * can be enumerated, unless `allowCycles` says a looping scenario is meant), and on every path from the start to an ending the meters stay inside their
 * bounds at every step with the effects applied as written, with no clamping.
 */
export function validateScenario(s: Scenario, { allowCycles = false }: ValidateOptions = {}): Problem[] {
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
