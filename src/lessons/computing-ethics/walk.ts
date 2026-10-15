import type { Scenario } from '../../core/scenario';
import type { PrincipleId } from './acm';
import { choiceBasis, type CaseNode, type Choice, type Decision, type Ending, type EthicsCase } from './cases';

/** Where a learner is in a case: the node they are at, the choice they have just made there, and the path so far. */
export interface Walk {
  at: string;
  picked: Choice['id'] | null;
  path: { decision: string; choice: Choice['id'] }[];
}

export const nodeOf = (c: EthicsCase, id: string): CaseNode => {
  const node = c.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`No node ${id} in case ${c.id}`);
  return node;
};

export const isDecision = (n: CaseNode): n is Decision => n.kind === 'decision';
export const isEnding = (n: CaseNode): n is Ending => n.kind === 'end';

export const startWalk = (c: EthicsCase): Walk => ({ at: c.start, picked: null, path: [] });

/** Make a choice at the current decision. Picking again just changes the choice; nothing moves on until `advance`. */
export function pick(c: EthicsCase, w: Walk, choice: Choice['id']): Walk {
  const node = nodeOf(c, w.at);
  if (!isDecision(node) || !node.choices.some((x) => x.id === choice)) return w;
  return { ...w, picked: choice };
}

/** Go to where the picked choice leads, recording it in the path. */
export function advance(c: EthicsCase, w: Walk): Walk {
  const node = nodeOf(c, w.at);
  if (!isDecision(node) || w.picked === null) return w;
  const choice = node.choices.find((x) => x.id === w.picked)!;
  return { at: choice.to, picked: null, path: [...w.path, { decision: node.id, choice: choice.id }] };
}

/** Undo the last step (or the pick at the current decision). */
export function back(w: Walk): Walk {
  if (w.picked !== null) return { ...w, picked: null };
  const last = w.path[w.path.length - 1];
  return last ? { at: last.decision, picked: null, path: w.path.slice(0, -1) } : w;
}

/** The end card's account of the path: each decision, the choice made, and the principles it cited. No grade. */
export function summarisePath(c: EthicsCase, w: Walk): { decision: string; title: string; choice: string; principles: readonly PrincipleId[]; history: boolean }[] {
  return w.path.map((step) => {
    const d = nodeOf(c, step.decision) as Decision;
    const ch = d.choices.find((x) => x.id === step.choice)!;
    return { decision: d.id, title: d.title, choice: ch.label, principles: d.principles, history: !!ch.history };
  });
}

/** The map: every node, and one edge per choice. */
export function mapOf(c: EthicsCase): { nodes: { id: string; label: string; end: boolean }[]; edges: { from: string; to: string; choice: Choice['id'] }[] } {
  return {
    nodes: c.nodes.map((n) => ({ id: n.id, label: n.short, end: isEnding(n) })),
    edges: c.nodes.filter(isDecision).flatMap((d) => d.choices.map((ch) => ({ from: d.id, to: ch.to, choice: ch.id }))),
  };
}

export const edgeKey = (from: string, choice: Choice['id']) => `${from}:${choice}`;

/**
 * The case as a shared `core/scenario` Scenario (no meters: a case has no numbers, only authored consequences),
 * so the shared validator and path enumeration check its graph. The lesson's own walk stays local: it has a
 * pick-then-continue step and a two-level back that the shared one does not.
 */
export function toScenario(c: EthicsCase): Scenario {
  return {
    start: c.start,
    meters: [],
    nodes: c.nodes.filter(isDecision).map((d) => ({
      id: d.id,
      prompt: d.setup,
      choices: d.choices.map((ch) => ({ id: ch.id, label: ch.label, to: ch.to, because: choiceBasis(c, ch) })),
    })),
    endings: c.nodes.filter(isEnding).map((e) => ({ id: e.id, title: e.title, text: e.text })),
  };
}
