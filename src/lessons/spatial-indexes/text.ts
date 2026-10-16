/** A share 0..1 as a percentage, with a decimal while it is small. */
export const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

/** A per-query average: whole numbers plain, others to one decimal. */
export const avg = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
