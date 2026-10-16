/** Running access sequences through the machine, and finding the sequences that break the broken protocol. */
import { mulberry32 } from '../../core/random';
import { CORES, allOps, freshMachine, step, type Op, type Protocol, type StepResult } from './mesi';

export function runOps(ops: readonly Op[], protocol: Protocol, cores = CORES): StepResult[] {
  let machine = freshMachine(cores);
  return ops.map((op) => {
    const result = step(machine, op, protocol);
    machine = result.machine;
    return result;
  });
}

/** The first read that returned something other than the latest write, or null. */
export function firstStaleRead(ops: readonly Op[], protocol: Protocol, cores = CORES): { index: number; result: StepResult } | null {
  const results = runOps(ops, protocol, cores);
  const index = results.findIndex((r) => r.stale);
  return index < 0 ? null : { index, result: results[index] };
}

export function randomOps(seed: number, length: number, cores = CORES): Op[] {
  const rnd = mulberry32(seed);
  return Array.from({ length }, () => ({ core: Math.floor(rnd() * cores), access: rnd() < 0.5 ? 'read' : 'write' }));
}

export const SEEDED_SEQUENCES = 300;
export const SEQUENCE_LENGTH = 40;

/** The lowest seed whose random sequence makes a read return a stale value under the protocol, or null. */
export function lowestStaleSeed(protocol: Protocol): number | null {
  for (let seed = 1; seed <= SEEDED_SEQUENCES; seed++) {
    if (firstStaleRead(randomOps(seed, SEQUENCE_LENGTH), protocol)) return seed;
  }
  return null;
}

/** The pinned seed on which the broken protocol first returns a stale read (a test recomputes it). */
export const BROKEN_SEED = 1;

/** The shortest access sequence (in operations) that makes a read stale, found by trying every sequence of each length in turn. */
export function shortestStaleRead(protocol: Protocol, maxLength = 6): Op[] | null {
  const ops = allOps();
  for (let length = 1; length <= maxLength; length++) {
    const found = search([], length, ops, protocol);
    if (found) return found;
  }
  return null;
}

function search(prefix: Op[], length: number, ops: readonly Op[], protocol: Protocol): Op[] | null {
  if (prefix.length === length) return firstStaleRead(prefix, protocol) ? prefix : null;
  for (const op of ops) {
    const found = search([...prefix, op], length, ops, protocol);
    if (found) return found;
  }
  return null;
}

export const COUNTEREXAMPLE: readonly Op[] = shortestStaleRead('no-invalidate') ?? [];
