// What goes wrong with snowflake-style IDs, as scripted runs of the real generator.
import { nextSnowflake, startSnowflake, MAX_SEQUENCE, type ClockBackPolicy, type SnowflakeEvent, type SnowflakeState } from './formats';

export type Hazard = 'burst' | 'clock' | 'machine';

/** One attempt to make an ID: what the clock read, which machine, and what came of it. */
export interface Attempt {
  clock: number;
  machine: number;
  event: SnowflakeEvent;
  id: bigint | null;
  /** The same ID was already handed out earlier in this run. */
  duplicate: boolean;
  /** For a refusal or a wait: the clock reading it needs. */
  until: number | null;
}

/** Clock readings for the clock-goes-backwards run: two IDs a millisecond, a step back from 104 to 102. */
export const CLOCK_RUN: readonly number[] = [100, 100, 101, 101, 102, 102, 103, 103, 104, 104, 102, 102, 103, 103, 104, 104, 105, 105];

export const FIRST_MS = 1000;

/** Run `readings` through one machine's generator. */
export function runClock(readings: readonly number[], machine: number, policy: ClockBackPolicy): Attempt[] {
  const seen = new Set<bigint>();
  let state: SnowflakeState = startSnowflake();
  return readings.map((clock) => {
    const r = nextSnowflake(state, machine, clock, policy);
    state = r.state;
    const duplicate = r.id !== null && seen.has(r.id);
    if (r.id !== null) seen.add(r.id);
    return { clock, machine, event: r.event, id: r.id, duplicate, until: 'until' in r ? r.until : null };
  });
}

/** Two machines both issuing three IDs a millisecond for `ms` milliseconds. */
export function runMachines(machineA: number, machineB: number, ms: number): Attempt[] {
  const seen = new Set<bigint>();
  const states: Record<number, SnowflakeState> = { 0: startSnowflake(), 1: startSnowflake() };
  const out: Attempt[] = [];
  for (let clock = 100; clock < 100 + ms; clock++) {
    for (let k = 0; k < 3; k++) {
      [machineA, machineB].forEach((machine, side) => {
        const r = nextSnowflake(states[side], machine, clock, 'wait');
        states[side] = r.state;
        const duplicate = r.id !== null && seen.has(r.id);
        if (r.id !== null) seen.add(r.id);
        out.push({ clock, machine, event: r.event, id: r.id, duplicate, until: 'until' in r ? r.until : null });
      });
    }
  }
  return out;
}

export interface BurstRun {
  /** IDs issued in each millisecond, in order. */
  perMs: { time: number; count: number; firstSequence: number; lastSequence: number }[];
  /** Times the generator had to wait for the next millisecond. */
  waits: number;
  total: number;
  unique: number;
}

/** `count` IDs asked for at once on one machine: 4,096 fit in a millisecond, the rest wait. */
export function runBurst(count: number, machine = 1): BurstRun {
  let state = startSnowflake();
  let clock = FIRST_MS;
  const perMs: BurstRun['perMs'] = [];
  const seen = new Set<bigint>();
  let waits = 0;
  for (let i = 0; i < count; i++) {
    let r = nextSnowflake(state, machine, clock, 'wait');
    if (r.id === null) {
      waits += 1;
      clock = r.until;
      r = nextSnowflake(r.state, machine, clock, 'wait');
    }
    state = r.state;
    seen.add(r.id!);
    const last = perMs.at(-1);
    if (last && last.time === clock) {
      last.count += 1;
      last.lastSequence = state.sequence;
    } else perMs.push({ time: clock, count: 1, firstSequence: state.sequence, lastSequence: state.sequence });
  }
  return { perMs, waits, total: count, unique: seen.size };
}

export const BURST_LIMIT = MAX_SEQUENCE + 1;
