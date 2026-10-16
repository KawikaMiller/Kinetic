import { ASES } from './asgraph';

/** One option per AS, for the pickers of every scene. */
export const AS_OPTIONS = ASES.map((a) => ({ value: a, label: String(a) }));
