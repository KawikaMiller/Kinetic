export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const clamp01 = (t: number) => clamp(t, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** easeInOutCubic: slow start and end, for particles that travel between points. */
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** easeInOutQuad: a gentler ease-in-out than `ease`. */
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
