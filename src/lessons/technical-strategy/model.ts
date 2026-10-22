/**
 * A strategy canvas: two INVENTED diagnoses, four guiding policies and seven roadmap actions for an invented organisation.
 * An action is orphaned when none of the policies that support it is present; a diagnosis is uncovered when none of its
 * policies is present; a conflict is active when both ends are present (an orphaned action still counts as present).
 * Pure set arithmetic: no React, nothing random.
 */
export type DiagnosisId = 'D1' | 'D2';
export type PolicyId = 'P1' | 'P2' | 'P3' | 'P4';
export type ActionId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7';
export type NodeId = DiagnosisId | PolicyId | ActionId;
export type Kind = 'diagnosis' | 'policy' | 'action';

export interface Diagnosis { id: DiagnosisId; text: string }
export interface Policy { id: PolicyId; text: string; answers: readonly DiagnosisId[] }
export interface Action { id: ActionId; text: string; supportedBy: readonly PolicyId[] }

export const DIAGNOSES: readonly Diagnosis[] = [
  { id: 'D1', text: 'Delivery slows because 14 teams each run their own build pipeline and storage choices' },
  { id: 'D2', text: 'On-call load is concentrated in three legacy services' },
];
export const POLICIES: readonly Policy[] = [
  { id: 'P1', text: 'One paved road for build and deploy; deviations need a written reason', answers: ['D1'] },
  { id: 'P2', text: 'Consolidate on one primary datastore family', answers: ['D1'] },
  { id: 'P3', text: 'Teams own their on-call; the platform team ships the tooling', answers: ['D2'] },
  { id: 'P4', text: 'Each team picks the storage that fits its needs', answers: ['D1'] },
];
export const ACTIONS: readonly Action[] = [
  { id: 'A1', text: 'Ship the shared pipeline', supportedBy: ['P1'] },
  { id: 'A2', text: "Move one team's services onto the paved deploy path", supportedBy: ['P1'] },
  { id: 'A3', text: "Move billing's store onto the primary datastore", supportedBy: ['P2'] },
  { id: 'A4', text: 'Freeze new datastore types', supportedBy: ['P2'] },
  { id: 'A5', text: 'Paging-policy templates and on-call dashboards', supportedBy: ['P3'] },
  { id: 'A6', text: 'A storage evaluation checklist for teams', supportedBy: ['P4'] },
  { id: 'A7', text: 'Pilot a graph database for recommendations', supportedBy: ['P4'] },
];
export const CONFLICTS: readonly (readonly [NodeId, NodeId])[] = [['P2', 'P4'], ['A4', 'A7']];

export const KIND_OF: Readonly<Record<string, Kind>> = Object.fromEntries([
  ...DIAGNOSES.map((n) => [n.id, 'diagnosis'] as const), ...POLICIES.map((n) => [n.id, 'policy'] as const), ...ACTIONS.map((n) => [n.id, 'action'] as const),
]);
export const textOf = (id: NodeId): string => [...DIAGNOSES, ...POLICIES, ...ACTIONS].find((n) => n.id === id)!.text;

/** Policies and actions can be removed; the two diagnoses are the fixed starting point. */
export const REMOVABLE: readonly NodeId[] = [...POLICIES.map((p) => p.id), ...ACTIONS.map((a) => a.id)];

export interface Reading {
  orphans: ActionId[];
  uncovered: DiagnosisId[];
  conflicts: (readonly [NodeId, NodeId])[];
}

/** The three counters, from the set of removed ids. */
export function read(removed: ReadonlySet<NodeId>): Reading {
  const present = (id: NodeId) => !removed.has(id);
  return {
    orphans: ACTIONS.filter((a) => present(a.id) && !a.supportedBy.some(present)).map((a) => a.id),
    uncovered: DIAGNOSES.filter((d) => !POLICIES.some((p) => p.answers.includes(d.id) && present(p.id))).map((d) => d.id),
    conflicts: CONFLICTS.filter(([a, b]) => present(a) && present(b)),
  };
}

/** Remove a node, or restore it when it is already removed. Anything that is not removable changes nothing. */
export function toggle(removed: ReadonlySet<NodeId>, id: NodeId): ReadonlySet<NodeId> {
  if (!REMOVABLE.includes(id)) return removed;
  const next = new Set(removed);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** The edges of the canvas: diagnosis to policy to action. */
export const SUPPORT_EDGES: readonly (readonly [NodeId, NodeId])[] = [
  ...POLICIES.flatMap((p) => p.answers.map((d) => [d, p.id] as const)),
  ...ACTIONS.flatMap((a) => a.supportedBy.map((p) => [p, a.id] as const)),
];

/** The reasons a node is flagged, in words, for the list under the canvas. */
export function describe(removed: ReadonlySet<NodeId>, id: NodeId, reading: Reading): string {
  if (removed.has(id)) return 'removed';
  if (reading.orphans.includes(id as ActionId)) return 'orphaned: no policy supports this';
  if (reading.uncovered.includes(id as DiagnosisId)) return 'uncovered: no policy answers this';
  return 'present';
}
