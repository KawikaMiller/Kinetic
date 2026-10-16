/**
 * A write-invalidate snooping MESI protocol for one cache line, as the textbooks draw it: atomic bus transactions, no store
 * buffer, no memory reordering. Counts are bus transactions and model cycles; nothing here reads a clock.
 */

export type MesiState = 'M' | 'E' | 'S' | 'I';
export const MESI_STATES: readonly MesiState[] = ['M', 'E', 'S', 'I'];
export const MESI_NAMES: Record<MesiState, string> = { M: 'Modified', E: 'Exclusive', S: 'Shared', I: 'Invalid' };

export type Access = 'read' | 'write';
export type BusOp = 'BusRd' | 'BusRdX' | 'BusUpgr';
export const BUS_NAMES: Record<BusOp, string> = {
  BusRd: 'bus read',
  BusRdX: 'bus read-for-ownership',
  BusUpgr: 'bus upgrade',
};

export const CORES = 4;

/** What a core's own access does to its own copy, given whether another cache holds the line. */
export function localTransition(state: MesiState, access: Access, othersHold: boolean): { next: MesiState; bus: BusOp | null } {
  if (access === 'read') {
    if (state !== 'I') return { next: state, bus: null };
    return { next: othersHold ? 'S' : 'E', bus: 'BusRd' };
  }
  switch (state) {
    case 'M': return { next: 'M', bus: null };
    case 'E': return { next: 'M', bus: null };
    case 'S': return { next: 'M', bus: 'BusUpgr' };
    case 'I': return { next: 'M', bus: 'BusRdX' };
  }
}

/** What a snooped bus transaction does to another core's copy; `writesBack` is set when a Modified copy must reach memory first. */
export function snoopTransition(state: MesiState, bus: BusOp): { next: MesiState; writesBack: boolean } {
  if (state === 'I') return { next: 'I', writesBack: false };
  return { next: bus === 'BusRd' ? 'S' : 'I', writesBack: state === 'M' };
}

export interface Cache {
  state: MesiState;
  /** The value this cache holds (meaningless while Invalid). */
  value: number;
}

export interface Machine {
  caches: readonly Cache[];
  /** Memory's copy: stale while a cache holds the line Modified. */
  memory: number;
  /** The value of the most recent write: what a coherent read must return. */
  latest: number;
  /** Every bus transaction so far. */
  busCount: number;
}

export const freshMachine = (cores = CORES): Machine => ({
  caches: Array.from({ length: cores }, () => ({ state: 'I' as const, value: 0 })),
  memory: 0,
  latest: 0,
  busCount: 0,
});

export type Protocol = 'mesi' | 'no-invalidate';

export interface Op {
  core: number;
  access: Access;
}

export interface Reaction {
  core: number;
  from: MesiState;
  to: MesiState;
  /** This cache supplied the data. */
  supplied: boolean;
  /** This cache wrote its Modified copy back to memory first. */
  wroteBack: boolean;
}

export interface StepResult {
  machine: Machine;
  op: Op;
  bus: BusOp | null;
  /** The acting core's state before and after. */
  from: MesiState;
  to: MesiState;
  reactions: Reaction[];
  /** Where the data came from on a miss. */
  source: 'cache' | 'memory' | null;
  /** The value a read returned. */
  readValue: number | null;
  /** A read returned something other than the latest write. */
  stale: boolean;
  /** The value the write stored. */
  written: number | null;
}

/** Perform one access. With `no-invalidate`, a write leaves other copies as they are (the broken protocol). */
export function step(m: Machine, op: Op, protocol: Protocol = 'mesi'): StepResult {
  const caches = m.caches.map((c) => ({ ...c }));
  const me = caches[op.core];
  const from = me.state;
  const others = m.caches.flatMap((c, i) => (i !== op.core && c.state !== 'I' ? [i] : []));
  const { next, bus } = localTransition(from, op.access, others.length > 0);
  let memory = m.memory;
  const reactions: Reaction[] = [];
  let source: StepResult['source'] = null;

  if (bus) {
    // A Modified copy holds the freshest data, so it supplies; otherwise any holder will do, since holders agree.
    const modified = others.find((i) => m.caches[i].state === 'M');
    const supplier = modified ?? others[0] ?? null;
    for (const i of others) {
      const c = caches[i];
      const snoop = snoopTransition(c.state, bus);
      if (snoop.writesBack) memory = c.value;
      const keepsCopy = protocol === 'no-invalidate' && bus !== 'BusRd';
      reactions.push({ core: i, from: c.state, to: keepsCopy ? c.state : snoop.next, supplied: i === supplier && bus !== 'BusUpgr', wroteBack: snoop.writesBack });
      if (!keepsCopy) c.state = snoop.next;
    }
    if (bus !== 'BusUpgr') {
      source = supplier === null ? 'memory' : 'cache';
      me.value = supplier === null ? memory : m.caches[supplier].value;
    }
  }
  me.state = next;

  let written: number | null = null;
  let readValue: number | null = null;
  let latest = m.latest;
  if (op.access === 'write') {
    written = m.latest + 1;
    latest = written;
    me.value = written;
  } else {
    readValue = me.value;
  }
  const machine: Machine = { caches, memory, latest, busCount: m.busCount + (bus ? 1 : 0) };
  return { machine, op, bus, from, to: next, reactions, source, readValue, stale: readValue !== null && readValue !== latest, written };
}

/** The invariants of the protocol, checked on a machine: a message per violation (empty when sound). */
export function invariantViolations(m: Machine): string[] {
  const out: string[] = [];
  const valid = m.caches.filter((c) => c.state !== 'I');
  const owners = valid.filter((c) => c.state === 'M' || c.state === 'E');
  if (owners.length > 1) out.push('more than one cache holds the line Modified or Exclusive');
  if (owners.length >= 1 && valid.length > 1) out.push('a Modified or Exclusive copy coexists with another valid copy');
  if (valid.some((c) => c.state === 'S') && valid.some((c) => c.value !== m.memory)) out.push('a Shared line disagrees with memory');
  return out;
}
export const allOps = (cores = CORES): Op[] => Array.from({ length: cores * 2 }, (_, k) => ({ core: Math.floor(k / 2), access: k % 2 === 0 ? 'read' : 'write' }));

export const opLabel = (op: Op) => `${op.access} on core ${op.core}`;
