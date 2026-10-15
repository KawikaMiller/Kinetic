import { plural } from '../../core/format';

const n = (v: number) => v.toLocaleString('en-US');

/** "cell 0", "cells 0 and 2", "cells 0, 2 and 5". */
const cellList = (cells: readonly number[]): string =>
  cells.length === 1 ? `cell ${cells[0]}` : `cells ${cells.slice(0, -1).join(', ')} and ${cells[cells.length - 1]}`;

/** Scenes 1 and 2: what the latest version is and what it cost. */
export function pathCaption(f: {
  n: number;
  levels: number;
  version: number;
  parent: number | null;
  edit: { index: number; value: number } | null;
  copied: number;
  shared: number;
  total: number;
  stored: number;
  corruptViewed: { version: number; cells: readonly number[] } | null;
}): string {
  if (f.parent === null || f.edit === null) {
    return `v0 is a perfect tree over ${f.n} cells: ${plural(f.stored, 'node')} on ${f.levels} levels. Pick a cell and a value and press Set: the update copies only the nodes on one path.`;
  }
  const what = `Setting cell ${f.edit.index} to ${f.edit.value}`;
  if (f.copied === 0) {
    const broken = f.corruptViewed
      ? ` v${f.corruptViewed.version} now reads ${cellList(f.corruptViewed.cells)} differently from what it recorded when it was made.`
      : ' Look at v0: its contents changed without anyone making a new v0.';
    return `${what} in place allocated no nodes: it overwrote a leaf that every version through it shares.${broken}`;
  }
  return `v${f.version} came from v${f.parent}. ${what} copied ${plural(f.copied, 'node')} (the leaf and its ${plural(f.copied - 1, 'ancestor')}), and ${f.shared} of v${f.version}'s ${f.total} nodes are shared with v${f.parent}, which is untouched.`;
}

/** Scene 3: one update and the run of updates, in slots stored. */
export function costCaption(f: {
  /** The size the learner picked, and the cells the tree really has (the next power of b). */
  chosen: number;
  n: number;
  b: number;
  depth: number;
  nodes: number;
  slots: number;
  fullCopy: number;
  k: number;
  persistent: number;
  fullCopies: number;
}): string {
  const rounded = f.chosen === f.n ? '' : ` (${n(f.chosen)} rounded up to a power of ${f.b})`;
  const one = `At n = ${n(f.n)}${rounded} and b = ${f.b} the tree is ${f.depth} ${f.depth === 1 ? 'level' : 'levels'} deep: one update copies ${plural(f.nodes, 'node')} (${plural(f.slots, 'slot')}) where a full copy writes ${n(f.fullCopy)} slots.`;
  const run =
    f.k === 0
      ? ' With no updates yet the tree holds its starting nodes only.'
      : ` After ${plural(f.k, 'update')}, keeping every version: the tree stores ${n(f.persistent)} slots and ${plural(f.k + 1, 'full copy', 'full copies')} would store ${n(f.fullCopies)}${
          f.persistent < f.fullCopies ? '.' : ', so for an array this small the copies are still the cheaper way.'
        }`;
  return one + run;
}

/** Scene 4: the document, the version tree and what the mark pass found. */
export function docCaption(f: { current: number; live: number; versions: number; stored: number; garbage: number; memory: number }): string {
  const gone = f.versions - f.live;
  return `Viewing v${f.current}; ${f.live} of ${f.versions} versions are still alive${gone ? ` (${gone} dropped)` : ''}. The mark pass from their roots keeps ${plural(f.stored - f.garbage, 'node')} and leaves ${plural(f.garbage, 'node')} that nothing reaches; memory holds ${n(f.memory)} slots.`;
}
