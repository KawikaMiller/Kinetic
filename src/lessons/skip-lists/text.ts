import { plural } from '../../core/format';
import { HEAD, type Pos, type Snapshot } from './model';

/** How a node is named in a caption: the head, or its key. */
export const nodeName = (pos: Pos | undefined): string => (pos === HEAD || pos === undefined ? 'the head' : String(pos));

/** Steps a plain linked list takes to reach the same spot: one move per key below the target. */
export const plainSteps = (snap: Snapshot, target: number): number => snap.towers.filter((t) => t.key < target).length;

export const P_LABEL: Record<number, string> = { 0.5: '1/2', 0.25: '1/4' };

/** Scene 3's reading of one size's measurements: the mean beside the formula, and what the unlucky list cost. */
export function costCaption(f: { n: number; p: number; mean: number; worst: number; formula: number }): string {
  const ratio = f.mean / f.formula;
  return `At n = ${f.n.toLocaleString('en-US')} keys and p = ${P_LABEL[f.p]}, a search takes ${f.mean.toFixed(1)} steps on average across 20 seeded lists: ${(ratio * 100).toFixed(0)}% of Pugh's formula (${f.formula.toFixed(1)}). The unluckiest of the 20 lists averaged ${f.worst.toFixed(1)}.`;
}

/** Scene 4's insert cost line, in the structure's own unit: pointer writes. */
export function writesCaption(f: { key: number; height: number; writes: number; nodes: number }): string {
  return `Inserting ${f.key} gave a tower of height ${f.height}: ${plural(f.writes, 'pointer write')} among ${plural(f.nodes, 'tower')}, and none of the unrelated towers changed.`;
}
