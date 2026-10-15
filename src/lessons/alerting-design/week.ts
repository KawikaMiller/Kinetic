/**
 * The synthetic week behind the alerting lesson: one seeded generator for CPU, the checkout error ratio and a disk,
 * with authored incident windows, one-minute noise blips, batch-job CPU spikes and pod restarts. Everything is
 * invented for the lesson; the seed is shown on screen and a different seed would give a different week.
 */
import { mulberry32, randInt, randRange, type Rnd } from '../../core/random';

export const WEEK_SEED = 4207;
export const MIN_PER_DAY = 1440;
export const WEEK_MINUTES = 7 * MIN_PER_DAY;

export interface Incident {
  id: string;
  name: string;
  /** First minute of the incident, from the start of the week. */
  start: number;
  length: number;
  /** The checkout error ratio during it, in percent. */
  level: number;
}

/** Three authored real incidents: 40 minutes at 5%, 12 minutes at 30%, 90 minutes at 1.5% (the disk filling). */
export const INCIDENTS: readonly Incident[] = [
  { id: 'release', name: 'Bad release', start: 1 * MIN_PER_DAY + 840, length: 40, level: 5 },
  { id: 'failover', name: 'Database failover', start: 3 * MIN_PER_DAY + 190, length: 12, level: 30 },
  { id: 'disk', name: 'Disk fills', start: 5 * MIN_PER_DAY + 1290, length: 90, level: 1.5 },
];
export const incidentEnd = (i: Incident) => i.start + i.length;

export const BLIP_COUNT = 15;
export const BLIP_LEVEL = 8;
export const SPIKE_COUNT = 20;
export const SPIKE_LENGTH: readonly [number, number] = [5, 20];
export const SPIKE_LEVEL: readonly [number, number] = [85, 95];
export const POD_RESTARTS = 12;
/** Error ratio between incidents and blips, in percent. */
export const BASELINE_ERRORS: readonly [number, number] = [0.06, 0.14];
/** The disk's authored leak: it starts here and reaches 100% exactly at the third incident's start. */
export const LEAK_START = 4 * MIN_PER_DAY + 1140;
export const DISK_FULL_AT = INCIDENTS[2].start;
export const DISK_CLEANUP_AT = incidentEnd(INCIDENTS[2]);

/** Per-minute disk noise, in percent: small, so a threshold crossing does not flap. */
const DISK_JITTER = 0.05;

/** Keep this far (minutes) between blips, spikes and the incident windows. */
const GAP = 5;

export interface Spike {
  start: number;
  length: number;
  level: number;
}

export interface Week {
  /** Percent, one value per minute. */
  errors: number[];
  cpu: number[];
  disk: number[];
  blips: number[];
  spikes: Spike[];
  restarts: number[];
}

/** Draw `count` starts of `length` minutes that keep GAP minutes clear of `taken` ranges and of each other. */
function place(count: number, lengthOf: () => number, rnd: Rnd, taken: [number, number][]): { start: number; length: number }[] {
  const out: { start: number; length: number }[] = [];
  while (out.length < count) {
    const length = lengthOf();
    const start = randInt(0, WEEK_MINUTES - length - 1, rnd);
    const clear = taken.every(([a, b]) => start + length + GAP <= a || start >= b + GAP);
    if (clear) {
      out.push({ start, length });
      taken.push([start, start + length]);
    }
  }
  return out;
}

const diskBase = (t: number) => 64 + 7 * Math.sin(((t - 540) / MIN_PER_DAY) * 2 * Math.PI);

export function buildWeek(seed: number): Week {
  const incidentRanges: [number, number][] = INCIDENTS.map((i) => [i.start, incidentEnd(i)]);
  const noise = mulberry32(seed);
  const errors = Array.from({ length: WEEK_MINUTES }, () => randRange(BASELINE_ERRORS[0], BASELINE_ERRORS[1], noise));
  for (const i of INCIDENTS) for (let t = i.start; t < incidentEnd(i); t++) errors[t] = i.level;
  const blipSpots = place(BLIP_COUNT, () => 1, mulberry32(seed + 3), [...incidentRanges]);
  for (const b of blipSpots) errors[b.start] = BLIP_LEVEL;

  const cpuNoise = mulberry32(seed + 1);
  const cpu = Array.from({ length: WEEK_MINUTES }, (_, t) => 30 + 8 * Math.sin((t / MIN_PER_DAY) * 2 * Math.PI) + randRange(-4, 4, cpuNoise));
  const spikeRnd = mulberry32(seed + 4);
  const spikes = place(SPIKE_COUNT, () => randInt(SPIKE_LENGTH[0], SPIKE_LENGTH[1], spikeRnd), spikeRnd, [...incidentRanges]).map((s) => ({ ...s, level: randInt(SPIKE_LEVEL[0], SPIKE_LEVEL[1], spikeRnd) }));
  for (const s of spikes) for (let t = s.start; t < s.start + s.length; t++) cpu[t] = s.level;

  const diskNoise = mulberry32(seed + 2);
  const leakFrom = diskBase(LEAK_START);
  const growth = (100 - leakFrom) / (DISK_FULL_AT - LEAK_START);
  const disk = Array.from({ length: WEEK_MINUTES }, (_, t) => {
    const jitter = randRange(-DISK_JITTER, DISK_JITTER, diskNoise);
    if (t >= LEAK_START && t < DISK_CLEANUP_AT) return Math.min(100, leakFrom + (t - LEAK_START) * growth + jitter);
    return diskBase(t) + jitter;
  });
  for (let t = DISK_FULL_AT; t < DISK_CLEANUP_AT; t++) disk[t] = 100;

  const podRnd = mulberry32(seed + 5);
  const restarts = place(POD_RESTARTS, () => 1, podRnd, []).map((p) => p.start).sort((a, b) => a - b);
  return { errors, cpu, disk, blips: blipSpots.map((b) => b.start).sort((a, b) => a - b), spikes: spikes.sort((a, b) => a.start - b.start), restarts };
}

export const WEEK: Week = buildWeek(WEEK_SEED);
