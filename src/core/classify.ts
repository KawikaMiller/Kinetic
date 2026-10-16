/** Pure state for the shared ClassifyBoard: which category each item was put in, and whether the learner pressed Check. */
export interface ClassifyState {
  /** Item id to chosen category id; null while an item is unsorted. */
  answers: Record<string, string | null>;
  checked: boolean;
}

type Ids = readonly { id: string }[];

/** Every item unsorted, not checked. */
export function emptyClassify(items: Ids): ClassifyState {
  return { answers: Object.fromEntries(items.map((i) => [i.id, null])), checked: false };
}

/** How many items have a category chosen. */
export function sortedCount(items: Ids, answers: ClassifyState['answers']): number {
  return items.filter((i) => answers[i.id] != null).length;
}

/** How many items sit in their key category. Unsorted items count as wrong. */
export function classifyScore(items: Ids, answerKey: Record<string, string>, answers: ClassifyState['answers']): number {
  return items.filter((i) => answers[i.id] === answerKey[i.id]).length;
}

/** Choosing a category for an item un-checks the board, so the verdicts never describe stale answers. */
export function pickCategory(state: ClassifyState, itemId: string, categoryId: string): ClassifyState {
  return { answers: { ...state.answers, [itemId]: categoryId }, checked: false };
}
