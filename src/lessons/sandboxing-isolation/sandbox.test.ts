import { describe, expect, it } from 'vitest';
import {
  ALLOCATE_RANGE, CPU_WEIGHT_RANGE, FORKS_RANGE, MEMORY_LIMIT_RANGE, MIB, NAMESPACE_ORDER, PIDS_LIMIT_RANGE, USER_MAP, VIEWS,
  cpuShare, memoryOutcome, pidsOutcome, rootIsHostRoot, viewOf, type NamespaceId,
} from './isolation';
import { ACTION_ORDER, RING_ORDER, RULES, allRingSets, decide, ringSet, strength, type ActionId, type RingId } from './rings';
import { NEEDED, SYSCALLS, SYSCALL_NAMES, TRACE, checkMinimal, grantedExtras, replay } from './seccomp';
import { FILTER_SIZE, HOST_SYSCALL_COUNT, HYPERVISOR_INTERFACE, SURFACES, sharesHostKernel } from './surface';

/**
 * The independent oracle for the decision table, written the other way round from the model: per ACTION, the
 * rings that block it and the rings that limit it, in a plain list.
 */
const BLOCKERS: Record<ActionId, RingId[]> = {
  file: ['namespaces', 'runtime', 'microvm'],
  net: ['seccomp', 'namespaces', 'microvm'],
  fork: ['seccomp'],
  memory: [],
  syscall: ['seccomp'],
  processes: ['namespaces', 'microvm'],
  mount: ['process', 'seccomp', 'runtime'],
  'kernel-bug': [],
};
const LIMITERS: Record<ActionId, RingId[]> = {
  file: ['process'],
  net: [],
  fork: ['cgroup', 'microvm'],
  memory: ['cgroup', 'microvm'],
  syscall: ['microvm'],
  processes: [],
  mount: ['namespaces', 'microvm'],
  'kernel-bug': ['seccomp', 'microvm'],
};
const INNERMOST_FIRST: RingId[] = ['process', 'seccomp', 'namespaces', 'cgroup', 'runtime', 'microvm'];

describe('the decision table', () => {
  it('matches the per-action rule list over all 8 actions x 2^6 ring sets', () => {
    const sets = allRingSets();
    expect(sets).toHaveLength(64);
    let checked = 0;
    for (const rings of sets) {
      const on = INNERMOST_FIRST.filter((r) => rings.has(r));
      for (const action of ACTION_ORDER) {
        const blocker = on.find((r) => BLOCKERS[action].includes(r));
        const limiter = on.find((r) => LIMITERS[action].includes(r));
        const expected = blocker ? { kind: 'blocked', by: blocker } : limiter ? { kind: 'limited', by: limiter } : { kind: 'allowed' };
        expect(decide(action, rings), `${action} with ${on.join('+')}`).toEqual(expected);
        checked++;
      }
    }
    expect(checked).toBe(512);
  });

  it('the model table and the oracle lists describe the same rules (so neither is the typo)', () => {
    for (const action of ACTION_ORDER) {
      const blocks = RING_ORDER.filter((r) => RULES[r][action] === 'blocked');
      const limits = RING_ORDER.filter((r) => RULES[r][action] === 'limited');
      expect(new Set(blocks)).toEqual(new Set(BLOCKERS[action]));
      expect(new Set(limits)).toEqual(new Set(LIMITERS[action]));
    }
  });

  it('is monotone: turning another ring on never weakens the verdict, and a blocked action stays blocked', () => {
    for (const rings of allRingSets()) {
      for (const extra of RING_ORDER.filter((r) => !rings.has(r))) {
        const more = ringSet(...rings, extra);
        for (const action of ACTION_ORDER) {
          const before = decide(action, rings);
          const after = decide(action, more);
          expect(strength(after)).toBeGreaterThanOrEqual(strength(before));
          if (before.kind === 'blocked') expect(after.kind).toBe('blocked');
        }
      }
    }
  });

  it('with no ring on every action is allowed, and with all six on only the memory and kernel-bug actions are not blocked outright (they are limited)', () => {
    for (const action of ACTION_ORDER) expect(decide(action, ringSet()).kind).toBe('allowed');
    const all = ringSet(...RING_ORDER);
    const notBlocked = ACTION_ORDER.filter((a) => decide(a, all).kind !== 'blocked');
    expect(notBlocked.sort()).toEqual(['kernel-bug', 'memory']);
    expect(notBlocked.every((a) => decide(a, all).kind === 'limited')).toBe(true);
  });

  it('no ring set blocks the kernel bug outright, and only the microVM changes what kernel is under the plugin', () => {
    for (const rings of allRingSets()) expect(decide('kernel-bug', rings).kind).not.toBe('blocked');
    expect(RING_ORDER.filter((r) => !sharesHostKernel(r))).toEqual(['microvm']);
  });

  it('no single ring blocks all eight actions', () => {
    for (const ring of RING_ORDER) expect(ACTION_ORDER.filter((a) => decide(a, ringSet(ring)).kind === 'blocked').length).toBeLessThan(ACTION_ORDER.length);
  });
});

describe('the seccomp replay', () => {
  const popcount = (n: number) => {
    let c = 0;
    for (let x = n; x; x &= x - 1) c++;
    return c;
  };

  it('returns the index of the first denied call, equal to a plain scan', () => {
    const lists = [[], SYSCALL_NAMES, NEEDED.filter((n) => n !== 'mmap'), NEEDED.filter((n) => n !== 'read'), NEEDED];
    for (const list of lists) {
      const allowed = new Set(list);
      let scan: number | null = null;
      for (let i = 0; i < TRACE.length && scan === null; i++) if (!allowed.has(TRACE[i])) scan = i;
      for (const otherwise of ['kill', 'errno'] as const) {
        const r = replay(allowed, otherwise);
        expect(r.firstDenied).toBe(scan);
        expect(r.rows.map((x) => x.status)).toEqual(TRACE.map((_, i) => (scan === null || i < scan ? 'allowed' : i === scan ? 'denied' : 'not-run')));
        expect(r.ending).toBe(scan === null ? 'completed' : otherwise === 'kill' ? 'killed' : 'failed');
      }
    }
  });

  it('the smallest list that runs the trace equals a brute-force search over all 2^20 subsets, and is unique', () => {
    const bit = new Map(SYSCALL_NAMES.map((n, i) => [n, 1 << i] as const));
    const need = TRACE.reduce((mask, n) => mask | bit.get(n)!, 0);
    let smallest = Infinity;
    let winners: number[] = [];
    for (let mask = 0; mask < 1 << SYSCALL_NAMES.length; mask++) {
      if ((mask & need) !== need) continue;
      const size = popcount(mask);
      if (size < smallest) {
        smallest = size;
        winners = [mask];
      } else if (size === smallest) winners.push(mask);
    }
    expect(winners).toEqual([need]);
    expect(smallest).toBe(NEEDED.length);
    expect(SYSCALL_NAMES.filter((n) => (need & bit.get(n)!) !== 0).sort()).toEqual([...NEEDED].sort());
  }, 60_000);

  it('checkMinimal says minimal for exactly that list, and names what is missing or extra otherwise', () => {
    expect(checkMinimal(new Set(NEEDED))).toEqual({ runs: true, missing: [], extra: [], minimal: true });
    expect(checkMinimal(new Set(NEEDED.filter((n) => n !== 'mmap'))).missing).toEqual(['mmap']);
    const loose = checkMinimal(new Set([...NEEDED, 'socket', 'kill']));
    expect([loose.runs, loose.minimal, loose.extra]).toEqual([true, false, ['kill', 'socket']]);
  });

  it('allowing everything grants every risky call the script does not make, and nothing else', () => {
    const extras = grantedExtras(new Set(SYSCALL_NAMES)).map((e) => e.name).sort();
    expect(extras).toEqual(['clone', 'connect', 'execve', 'kill', 'mount', 'ptrace', 'socket', 'unlink']);
    expect(grantedExtras(new Set(NEEDED))).toEqual([]);
  });

  it('offers twenty distinct real system call names, and the script only uses calls from the list', () => {
    expect(SYSCALLS).toHaveLength(20);
    expect(new Set(SYSCALL_NAMES).size).toBe(20);
    for (const n of TRACE) expect(SYSCALL_NAMES).toContain(n);
  });
});

describe('cgroup limits and namespace views', () => {
  it('the memory limit kills at the first byte over: never at the limit, always at limit + 1', () => {
    for (let limit = MEMORY_LIMIT_RANGE.min; limit <= MEMORY_LIMIT_RANGE.max; limit += MEMORY_LIMIT_RANGE.step) {
      for (let alloc = ALLOCATE_RANGE.min; alloc <= ALLOCATE_RANGE.max; alloc += ALLOCATE_RANGE.step) {
        const m = memoryOutcome(limit, alloc);
        // Sequential oracle: allocate one MiB at a time; the plugin dies in the MiB that crosses the limit.
        let crossedAt: number | null = null;
        for (let held = 1; held <= alloc && crossedAt === null; held++) if (held * MIB > limit * MIB) crossedAt = limit * MIB + 1;
        expect(m.killedAtByte, `limit ${limit} alloc ${alloc}`).toBe(crossedAt);
        expect(m.killed).toBe(alloc > limit);
        expect(m.held).toBe(alloc > limit ? limit * MIB : alloc * MIB);
      }
    }
  });

  it('the process limit counts the plugin itself: forks past limit - 1 fail, found by simulating each fork', () => {
    for (let limit = PIDS_LIMIT_RANGE.min; limit <= PIDS_LIMIT_RANGE.max; limit++) {
      for (let forks = FORKS_RANGE.min; forks <= FORKS_RANGE.max; forks += 7) {
        let running = 1;
        let started = 0;
        let first: number | null = null;
        for (let attempt = 1; attempt <= forks; attempt++) {
          if (running < limit) {
            running++;
            started++;
          } else first ??= attempt;
        }
        const p = pidsOutcome(limit, forks);
        expect([p.started, p.failed, p.firstFailure]).toEqual([started, forks - started, first]);
      }
    }
  });

  it('CPU shares of two competing groups add up to 1 and follow the weights', () => {
    for (let w = CPU_WEIGHT_RANGE.min; w <= CPU_WEIGHT_RANGE.max; w += CPU_WEIGHT_RANGE.step) {
      expect(cpuShare(w, 100) + cpuShare(100, w)).toBeCloseTo(1, 12);
      expect(cpuShare(w, w)).toBeCloseTo(0.5, 12);
    }
    expect(cpuShare(100, 100)).toBe(0.5);
  });

  it('every namespace shows its private view only when on, and root is host root only without the user namespace', () => {
    for (const id of NAMESPACE_ORDER) {
      expect(viewOf(id, new Set<NamespaceId>())).toBe(VIEWS[id].host);
      expect(viewOf(id, new Set([id]))).toBe(VIEWS[id].private);
    }
    expect(rootIsHostRoot(new Set<NamespaceId>())).toBe(true);
    expect(rootIsHostRoot(new Set<NamespaceId>(['pid', 'mount']))).toBe(true);
    expect(rootIsHostRoot(new Set<NamespaceId>(['user']))).toBe(false);
    expect(VIEWS.user.private).toContain(`map ${USER_MAP.inside} ${USER_MAP.outside} ${USER_MAP.range}`);
  });
});

describe('the surface constants', () => {
  it('shrink from the host kernel to the filter to the hypervisor, and the filter is the catalogue', () => {
    expect(HOST_SYSCALL_COUNT).toBeGreaterThan(FILTER_SIZE);
    expect(FILTER_SIZE).toBeGreaterThan(HYPERVISOR_INTERFACE);
    expect(FILTER_SIZE).toBe(SYSCALLS.length);
    expect(SURFACES.microvm.exposed).toBe(HYPERVISOR_INTERFACE);
  });
});
