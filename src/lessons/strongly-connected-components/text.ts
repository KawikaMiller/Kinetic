/** The sentence about the edge the learner just added, from the before and after counts. */
export function edgeVerdict(names: readonly string[], from: number, to: number, effect: { before: number; after: number; merged: number[][] }): string {
  const edge = `${names[from]}→${names[to]}`;
  if (effect.merged.length === 0) return `${edge} leaves the components alone (${effect.before} before, ${effect.after} after): it does not close a cycle between components.`;
  const fused = effect.merged.map((c) => `{${c.map((v) => names[v]).join(' ')}}`).join(' and ');
  return `${edge} closes a cycle in the collapsed graph, so components fuse into ${fused}: ${effect.before} components before, ${effect.after} after.`;
}
