/**
 * A simulated origin with three things that can run out, and an abstract, labelled stream of unwanted
 * load described by a rate alone. Nothing here sends, builds or describes traffic: it is arithmetic
 * over made-up capacities, so the lesson can show which resource a class of load exhausts and what
 * each defence does about it. Every capacity and rate is a named constant and illustrative.
 */

export type LoadClass = 'volumetric' | 'state' | 'app';
export const LOAD_CLASSES: LoadClass[] = ['volumetric', 'state', 'app'];
export const CLASS_NAME: Record<LoadClass, string> = { volumetric: 'volumetric', state: 'state exhaustion', app: 'application layer' };

export type ResourceId = 'bandwidth' | 'table' | 'cpu';
export const RESOURCES: ResourceId[] = ['bandwidth', 'table', 'cpu'];
export interface Resource {
  name: string;
  unit: string;
  capacity: number;
}
export const RESOURCE: Record<ResourceId, Resource> = {
  bandwidth: { name: 'Bandwidth', unit: 'Mbit/s', capacity: 1000 },
  table: { name: 'Half-open connection table', unit: 'slots', capacity: 4096 },
  cpu: { name: 'CPU and database budget', unit: 'ms of work per second', capacity: 8000 },
};

/** The resource each class of load runs down, and what one unit of its rate costs. */
export const TARGET: Record<LoadClass, ResourceId> = { volumetric: 'bandwidth', state: 'table', app: 'cpu' };
export const UNIT_NAME: Record<LoadClass, string> = { volumetric: 'Mbit/s', state: 'connection attempts/s', app: 'requests/s' };
/** Slot-seconds an unfinished connection attempt holds, ms of work an expensive request costs, Mbit/s per Mbit/s. */
export const HALF_OPEN_HOLD_S = 3;
export const EXPENSIVE_COST_MS = 50;
export const LOAD_PER_UNIT: Record<LoadClass, number> = { volumetric: 1, state: HALF_OPEN_HOLD_S, app: EXPENSIVE_COST_MS };
export const RATE_RANGE: Record<LoadClass, { min: number; max: number; step: number; default: number }> = {
  volumetric: { min: 0, max: 5000, step: 100, default: 3000 },
  state: { min: 0, max: 5000, step: 100, default: 3000 },
  app: { min: 0, max: 500, step: 10, default: 400 },
};

/** Legitimate users: requests a second, and what each costs on every resource. */
export const LEGIT_RATE = 200;
export const LEGIT_COST: Record<ResourceId, number> = { bandwidth: 0.5, table: 0.1, cpu: 5 };

export type DefenceId = 'bandwidth' | 'perSource' | 'cache' | 'challenge' | 'scrub';
export const DEFENCES: DefenceId[] = ['bandwidth', 'perSource', 'cache', 'challenge', 'scrub'];
export const DEFENCE_NAME: Record<DefenceId, string> = {
  bandwidth: 'more bandwidth',
  perSource: 'per-source rate limit',
  cache: 'cache',
  challenge: 'challenge',
  scrub: 'scrubbing',
};

/** What each defence does, in illustrative numbers. */
export const BANDWIDTH_FACTOR = 4;
export const PER_SOURCE_LIMIT = 10;
export const CACHE_HIT_SHARE = 0.8;
export const CHALLENGE_STOPS = 0.9;
export const CHALLENGE_LEGIT_PASS = 0.98;
export const SCRUB_STOPS = 0.95;
export const SCRUB_LEGIT_PASS = 0.99;
export const SOURCE_COUNTS = [1, 10, 100, 1000] as const;
export type Sources = (typeof SOURCE_COUNTS)[number];

export type DefenceSet = Record<DefenceId, boolean>;
export const NO_DEFENCE: DefenceSet = { bandwidth: false, perSource: false, cache: false, challenge: false, scrub: false };

/** Which classes a defence acts on at all, as a plain-words table for the screen. */
export const HELPS: Record<DefenceId, Record<LoadClass, string>> = {
  bandwidth: { volumetric: 'adds room, if the flood is smaller than the new size', state: 'no: the table is not bandwidth', app: 'no: the CPU is not bandwidth' },
  perSource: { volumetric: 'only if each source sends more than the limit', state: 'only if each source sends more than the limit', app: 'only if each source sends more than the limit' },
  cache: { volumetric: 'no: the traffic still arrives', state: 'no: nothing is cached at the handshake', app: 'yes, for the share a cache can answer' },
  challenge: { volumetric: 'no: it is dropped before any challenge', state: 'no: it is before the application', app: 'yes, at a small cost to real users' },
  scrub: { volumetric: 'yes: it is absorbed upstream', state: 'yes: filtered before the origin', app: 'yes: filtered before the origin' },
};

/** What a per-source limit lets through: each of `sources` sources sends an equal share, and none passes more than `limit`. */
export function perSourceAdmitted(total: number, sources: number, limit: number): number {
  return sources * Math.min(total / sources, limit);
}

export interface OriginInput {
  cls: LoadClass;
  /** The abstract rate of the unwanted stream, in its class's unit. */
  rate: number;
  sources: number;
  defences: DefenceSet;
}

export interface Load {
  id: ResourceId;
  capacity: number;
  legit: number;
  attack: number;
  /** Share of the load the resource serves: 1 until it saturates, then capacity over everything asked of it. */
  served: number;
  saturated: boolean;
}

export interface OriginResult {
  loads: Load[];
  /** Unwanted rate that gets past the defences, in the class's unit. */
  admittedRate: number;
  /** Legitimate requests per second served. */
  goodput: number;
  /** Share of legitimate users served. */
  goodputShare: number;
  saturated: ResourceId[];
}

export function origin(i: OriginInput): OriginResult {
  const d = i.defences;
  const target = TARGET[i.cls];
  let admitted = d.perSource ? perSourceAdmitted(i.rate, i.sources, PER_SOURCE_LIMIT) : i.rate;
  if (d.scrub) admitted *= 1 - SCRUB_STOPS;
  if (d.challenge && i.cls === 'app') admitted *= 1 - CHALLENGE_STOPS;
  const cpuShare = d.cache && i.cls === 'app' ? 1 - CACHE_HIT_SHARE : 1;
  const loads: Load[] = RESOURCES.map((id) => {
    const capacity = RESOURCE[id].capacity * (id === 'bandwidth' && d.bandwidth ? BANDWIDTH_FACTOR : 1);
    const legit = LEGIT_RATE * LEGIT_COST[id];
    const attack = id === target ? admitted * LOAD_PER_UNIT[i.cls] * (id === 'cpu' ? cpuShare : 1) : 0;
    const served = legit + attack <= capacity ? 1 : capacity / (legit + attack);
    return { id, capacity, legit, attack, served, saturated: served < 1 };
  });
  const through = Math.min(...loads.map((l) => l.served)) * (d.challenge && i.cls === 'app' ? CHALLENGE_LEGIT_PASS : 1) * (d.scrub ? SCRUB_LEGIT_PASS : 1);
  return { loads, admittedRate: admitted, goodput: LEGIT_RATE * through, goodputShare: through, saturated: loads.filter((l) => l.saturated).map((l) => l.id) };
}

export const defaultInput = (cls: LoadClass): OriginInput => ({ cls, rate: RATE_RANGE[cls].default, sources: 1000, defences: { ...NO_DEFENCE } });

export type PresetId = 'bandwidth-flood' | 'syn-flood' | 'slow-endpoint' | 'distributed';
export const PRESETS: { id: PresetId; label: string; input: () => OriginInput }[] = [
  { id: 'bandwidth-flood', label: 'bandwidth flood', input: () => defaultInput('volumetric') },
  { id: 'syn-flood', label: 'SYN flood', input: () => defaultInput('state') },
  { id: 'slow-endpoint', label: 'slow expensive endpoint', input: () => ({ ...defaultInput('app'), sources: 10 }) },
  { id: 'distributed', label: 'distributed low-rate', input: () => ({ ...defaultInput('app'), rate: 400, sources: 1000, defences: { ...NO_DEFENCE, perSource: true } }) },
];
