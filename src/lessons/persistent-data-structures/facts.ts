import { mulberry32 } from '../../core/random';
import { docStart } from './docState';
import {
  corruptCells,
  createStore,
  measureCost,
  memorySeries,
  memorySlots,
  reachable,
  setValue,
  valuesOf,
} from './model';
import { DEFAULT_BRANCHING, DEFAULT_EDIT_INDEX, DEFAULT_EDIT_VALUE, DEFAULT_SIZE, DEFAULT_UPDATES, MEMORY_SEED, SMALL_B, SMALL_VALUES } from './presets';

/** Every number the lesson's text quotes, measured from the model once. */
const v0 = createStore(SMALL_VALUES, SMALL_B);
const pathStore = setValue(v0, 0, DEFAULT_EDIT_INDEX, DEFAULT_EDIT_VALUE);
const pathNew = pathStore.versions[1];
const pathShared = [...reachable(pathStore, [1])].filter((id) => reachable(pathStore, [0]).has(id)).length;
const brokenStore = setValue(v0, 0, DEFAULT_EDIT_INDEX, DEFAULT_EDIT_VALUE, 'inplace');
const cost = measureCost(DEFAULT_SIZE, DEFAULT_BRANCHING);
const wide = measureCost(DEFAULT_SIZE, 32);
const series = memorySeries(DEFAULT_SIZE, DEFAULT_BRANCHING, DEFAULT_UPDATES, mulberry32(MEMORY_SEED));

/** The scene-4 try-this: undo twice to v0, set the default cell, then drop v1. */
const start = docStart();
const forked = setValue(start.store, 0, 4, 42);
const liveBefore = [0, 1, 2, 3];
const liveAfter = [0, 2, 3];

export const FACTS = {
  cells: v0.nodes.filter((n) => n.kids === null).length,
  nodesV0: v0.nodes.length,
  editIndex: DEFAULT_EDIT_INDEX,
  editValue: DEFAULT_EDIT_VALUE,
  pathNodes: pathNew.copied.length,
  pathShared,
  pathTotal: reachable(pathStore, [1]).size,
  pathStored: pathStore.nodes.length,
  oldValue: SMALL_VALUES[DEFAULT_EDIT_INDEX],
  brokenWalked: valuesOf(brokenStore, 0)[DEFAULT_EDIT_INDEX],
  brokenCells: corruptCells(brokenStore, 0),
  n: DEFAULT_SIZE,
  nodesPerUpdate: cost.nodesCopied,
  slotsPerUpdate: cost.slotsCopied,
  fullCopy: cost.fullCopy,
  k: DEFAULT_UPDATES,
  persistentAfterK: series.persistent[DEFAULT_UPDATES],
  fullCopiesAfterK: series.fullCopies[DEFAULT_UPDATES],
  wideNodes: wide.nodesCopied,
  wideSlots: wide.slotsCopied,
  forkId: forked.versions.length - 1,
  forkParent: forked.versions[3].parent as number,
  garbageAfterDrop: forked.nodes.length - reachable(forked, liveAfter).size,
  memoryDrop: memorySlots(forked, liveBefore) - memorySlots(forked, liveAfter),
};
