/** The outcome of a hostile-input operation: the new value, or the sentence to show the learner instead. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
