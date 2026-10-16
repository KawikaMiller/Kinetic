/** Series for the plots: a moving average, and a thinning so a long run stays a short path. */
export const MAX_POINTS = 300;

/** Moving average over the last `window` values (fewer at the start). */
export function smooth(values: readonly number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  values.forEach((v, i) => {
    sum += v;
    if (i >= window) sum -= values[i - window];
    out.push(sum / Math.min(i + 1, window));
  });
  return out;
}

/** [episode number, value] pairs, thinned to at most MAX_POINTS evenly spaced points (the last one always kept). */
export function toPoints(values: readonly number[]): [number, number][] {
  const stride = Math.max(1, Math.ceil(values.length / MAX_POINTS));
  const points: [number, number][] = [];
  for (let i = 0; i < values.length; i += stride) points.push([i + 1, values[i]]);
  if (values.length > 0 && points.at(-1)![0] !== values.length) points.push([values.length, values.at(-1)!]);
  return points;
}
