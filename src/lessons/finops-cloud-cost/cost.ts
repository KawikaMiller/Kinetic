/**
 * The pure cost model of finops-cloud-cost. EVERY price here is a named, illustrative constant: round numbers chosen
 * for the page, not any provider's price, discount or region. Change the numbers and the shapes stay.
 * The storage tiers are written as RATIOS of one illustrative standard price, not as copies of another lesson's table
 * (decisions §4: lessons cannot import each other, and a copied price would pretend to be a shared fact).
 */

export const HOURS = 24;
export const DAYS_PER_MONTH = 30;
export const SECONDS_PER_HOUR = 3600;
/** Cost per instance-hour paid on demand. */
export const P_OD = 1;
/** Cost per COMMITTED instance-hour: billed for all 24 hours of the day whether used or not. */
export const P_C = 0.6;
/** Cost per instance-hour on interruptible capacity. */
export const P_SPOT = 0.3;
/** Chance per hour that interruptible capacity is reclaimed; the lost hour is redone. */
export const SPOT_INTERRUPTION = 0.05;
/** Requests per second one instance serves. */
export const CAPACITY_RPS = 50;
/** Cost per GB moved between zones (both directions together). */
export const P_X = 0.02;
/** Payload per request between two services, in decimal megabytes. */
export const PAYLOAD_MB = 0.5;
export const MB_PER_GB = 1000;
export const STORED_GB = 5000;
/** Standard storage, per GB-month. */
export const STANDARD_GB_MONTH = 0.02;
/** A colder tier charges this share of the standard monthly price for storage... */
export const COLD_STORAGE_RATIO = 0.4;
/** ...and this share of the standard monthly price for each full read of a GB. */
export const COLD_READ_RATIO = 0.5;

export const RPS_LIMITS = { min: 0, max: 1000 } as const;

/** The restart-adjusted cost of a useful interruptible hour: a lost hour is redone. */
export const P_SPOT_EFFECTIVE = P_SPOT / (1 - SPOT_INTERRUPTION);

export type Profile = readonly number[];

export const PRESETS = {
  web: { label: 'web traffic', profile: [...Array<number>(8).fill(100), ...Array<number>(8).fill(200), ...Array<number>(8).fill(400)] },
  flat: { label: 'flat', profile: Array<number>(HOURS).fill(200) },
  spiky: { label: 'spiky', profile: Array.from({ length: HOURS }, (_, h) => (h === 9 || h === 17 ? 1000 : 100)) },
  none: { label: 'no traffic', profile: Array<number>(HOURS).fill(0) },
} as const satisfies Record<string, { label: string; profile: Profile }>;
export type PresetId = keyof typeof PRESETS;

export const needed = (rps: number): number => Math.ceil(rps / CAPACITY_RPS);
export const neededPerHour = (profile: Profile): number[] => profile.map(needed);
export const peakNeed = (profile: Profile): number => Math.max(0, ...neededPerHour(profile));
export const requestsPerDay = (profile: Profile): number => profile.reduce((sum, rps) => sum + rps * SECONDS_PER_HOUR, 0);
export const instanceHours = (profile: Profile): number => neededPerHour(profile).reduce((a, b) => a + b, 0);

export type Work = 'user' | 'queue';

/** Interruptible capacity may only take work that can be redone; the reason is printed when it is refused. */
export function spotAllowed(work: Work): { ok: true } | { ok: false; reason: string } {
  return work === 'queue' ? { ok: true } : { ok: false, reason: 'A user-facing request cannot be redone for free, so its burst stays on demand: choose restartable queue work to use interruptible capacity.' };
}

export const burstPrice = (spot: boolean): number => (spot ? P_SPOT_EFFECTIVE : P_OD);

export interface DayCost {
  committed: number;
  burst: number;
  total: number;
  paidHours: number;
  usedHours: number;
  /** Needed instance-hours over paid instance-hours, or null with no traffic. */
  utilisation: number | null;
  /** Cost per million requests, or null with no traffic. */
  perMillion: number | null;
}

/** Cost of one day with `committed` instances committed. Past the peak is refused. */
export function dayCost(profile: Profile, committed: number, spot = false, commitPrice: number = P_C): DayCost {
  const peak = peakNeed(profile);
  if (!Number.isInteger(committed) || committed < 0 || committed > peak) throw new RangeError(`committed instances must be a whole number from 0 to ${peak}`);
  const need = neededPerHour(profile);
  const burstHours = need.reduce((sum, n) => sum + Math.max(0, n - committed), 0);
  const committedCost = committed * HOURS * commitPrice;
  const burst = burstHours * burstPrice(spot);
  const paidHours = committed * HOURS + burstHours;
  const used = instanceHours(profile);
  const requests = requestsPerDay(profile);
  return {
    committed: committedCost,
    burst,
    total: committedCost + burst,
    paidHours,
    usedHours: used,
    utilisation: paidHours === 0 ? null : used / paidHours,
    perMillion: requests === 0 ? null : (committedCost + burst) / (requests / 1e6),
  };
}

const EPS = 1e-9;

/** The smallest committed level of minimum cost, by trying every whole level. */
export function optimumByScan(profile: Profile, spot = false, commitPrice: number = P_C): number {
  const peak = peakNeed(profile);
  let best = 0;
  let bestCost = dayCost(profile, 0, spot, commitPrice).total;
  for (let c = 1; c <= peak; c += 1) {
    const cost = dayCost(profile, c, spot, commitPrice).total;
    if (cost < bestCost - EPS) {
      best = c;
      bestCost = cost;
    }
  }
  return best;
}

/** The critical-ratio rule: commit up to the highest level the profile reaches in more hours than P_C / burst price of the day. */
export function optimumByRule(profile: Profile, spot = false, commitPrice = P_C): number {
  const need = neededPerHour(profile);
  const threshold = (HOURS * commitPrice) / burstPrice(spot);
  let level = 0;
  for (let l = 1; l <= peakNeed(profile); l += 1) {
    if (need.filter((n) => n >= l).length > threshold + EPS) level = l;
  }
  return level;
}

/** Hours of the day a profile needs at least `level` instances. */
export const hoursAtLeast = (profile: Profile, level: number): number => neededPerHour(profile).filter((n) => n >= level).length;

/** True when committing the whole peak costs more than paying on demand for everything: 24 x P_C x peak > on-demand cost of the profile. */
export const overCommitted = (profile: Profile): boolean => HOURS * P_C * peakNeed(profile) > instanceHours(profile) * P_OD + EPS;

// ---- moving bytes ---------------------------------------------------------

export type Zones = 2 | 3;

export const crossingShare = (zones: Zones, sameZone: number): number => ((1 - sameZone) * (zones - 1)) / zones;
export const dailyGb = (requests: number): number => (requests * PAYLOAD_MB) / MB_PER_GB;

export function transfer(requests: number, zones: Zones, sameZone: number): { gb: number; crossingGb: number; cost: number } {
  if (!(sameZone >= 0 && sameZone <= 1)) throw new RangeError('the same-zone share must be between 0 and 1');
  const gb = dailyGb(requests);
  const crossingGb = gb * crossingShare(zones, sameZone);
  return { gb, crossingGb, cost: crossingGb * P_X };
}

// ---- storage tiers --------------------------------------------------------

export type Tier = 'standard' | 'cold';

export const tierPerGbMonth = (tier: Tier, fullReads: number): number =>
  tier === 'standard' ? STANDARD_GB_MONTH : STANDARD_GB_MONTH * COLD_STORAGE_RATIO + STANDARD_GB_MONTH * COLD_READ_RATIO * fullReads;

/** Reads per GB-month at which the two tiers cost the same: (1 - storage ratio) / read ratio. */
export const BREAK_EVEN_READS = (1 - COLD_STORAGE_RATIO) / COLD_READ_RATIO;

export const storagePerDay = (tier: Tier, fullReads: number, gb: number = STORED_GB): number => (gb * tierPerGbMonth(tier, fullReads)) / DAYS_PER_MONTH;

export interface Bill {
  compute: number;
  transfer: number;
  storage: number;
  total: number;
  perMillion: number | null;
}

/** The bill board for one day: compute at `committed`, transfer for the profile's requests, storage for STORED_GB. */
export function bill(profile: Profile, committed: number, zones: Zones, sameZone: number, tier: Tier, fullReads: number): Bill {
  const compute = dayCost(profile, committed).total;
  const move = transfer(requestsPerDay(profile), zones, sameZone).cost;
  const storage = storagePerDay(tier, fullReads);
  const requests = requestsPerDay(profile);
  const total = compute + move + storage;
  return { compute, transfer: move, storage, total, perMillion: requests === 0 ? null : total / (requests / 1e6) };
}
