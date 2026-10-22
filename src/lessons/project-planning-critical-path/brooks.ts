/**
 * Adding people to a late task: an INVENTED toy with named parameters. One person has `work` days left. Each
 * newcomer costs the original person `ramp` days to bring up to speed (nobody else works meanwhile), the team then
 * shares the work under Amdahl's law with a serial fraction, and every pair of people costs `pairCost` days of elapsed time.
 */
export interface BrooksParams {
  /** Days of work left for one person. */
  work: number;
  /** Share of the work that cannot be split, 0 to 1. */
  serial: number;
  /** Days to bring one newcomer up to speed. */
  ramp: number;
  /** Days of elapsed time each pair of people costs in coordination. */
  pairCost: number;
}

export const BROOKS_DEFAULT: BrooksParams = { work: 20, serial: 0.1, ramp: 2, pairCost: 0.25 };
export const MAX_PEOPLE = 10;
export const BROOKS_RANGES = {
  work: { min: 5, max: 40, step: 1 },
  serial: { min: 0, max: 1, step: 0.05 },
  ramp: { min: 0, max: 5, step: 0.5 },
  pairCost: { min: 0, max: 1, step: 0.05 },
};

export const pairs = (n: number) => (n * (n - 1)) / 2;

/** Elapsed days to finish with n people: onboarding, then the Amdahl time, plus the pairwise cost. */
export function completionDays(p: BrooksParams, n: number): number {
  return (n - 1) * p.ramp + p.work * (p.serial + (1 - p.serial) / n) + p.pairCost * pairs(n);
}

export interface BrooksReading {
  days: number[];
  /** The team size with the earliest finish (the smallest, on a tie). */
  best: number;
  /** Largest team that still finishes strictly earlier than one person, 1 when adding anyone is later. */
  stillHelps: number;
  /** Smallest team size that finishes later than one person, or null within the range. */
  laterAt: number | null;
}

export function readBrooks(p: BrooksParams): BrooksReading {
  const days = Array.from({ length: MAX_PEOPLE }, (_, i) => completionDays(p, i + 1));
  const best = days.indexOf(Math.min(...days)) + 1;
  let stillHelps = 1;
  days.forEach((d, i) => {
    if (d < days[0]) stillHelps = i + 1;
  });
  const later = days.findIndex((d, i) => i > 0 && d > days[0]);
  return { days, best, stillHelps, laterAt: later < 0 ? null : later + 1 };
}
