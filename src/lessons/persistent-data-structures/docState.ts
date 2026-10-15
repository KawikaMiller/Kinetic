import { createStore, setValue, type Store } from './model';
import { DOC_B, DOC_EDITS, DOC_VALUES } from './presets';

/** Scene 4's state: the store, the version being viewed, the redo stack, and the versions still alive. */
export interface DocState {
  store: Store;
  current: number;
  redo: number[];
  live: number[];
}

/** The opening document: v0, then a line of edits to v2, with the viewer on v2. */
export function docStart(): DocState {
  let store = createStore(DOC_VALUES, DOC_B);
  for (const e of DOC_EDITS) store = setValue(store, store.versions.length - 1, e.index, e.value);
  return { store, current: store.versions.length - 1, redo: [], live: store.versions.map((v) => v.id) };
}
