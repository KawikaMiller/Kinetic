import { describe, expect, it } from 'vitest';
import {
  BINS, BUFFER_SIZES, COPY_FILE_BYTES, copyCost, crossings, isCorrect, KERNEL_PATH, MIB, NODE_BAND, PRIV_STEPS, READ_STEPS, score, SORT_KEY, SYSCALL_NR, totalNs, WRAPPER,
  type Bin,
} from './model';

describe('Linux x86-64 syscall numbers shown on screen', () => {
  it('are pinned', () => {
    expect(SYSCALL_NR).toEqual({ read: 0, write: 1, open: 2, close: 3, getpid: 39 });
    expect(WRAPPER[1]).toContain(`mov eax, ${SYSCALL_NR.read}`);
    expect(KERNEL_PATH[1]).toContain(`sys_call_table[${SYSCALL_NR.read}]`);
  });
});

describe('copyCost', () => {
  it('the batching preset: 1 MiB with 1-byte reads vs 64 KiB reads', () => {
    expect(copyCost(MIB, 1)).toMatchObject({ dataReads: 1_048_576, reads: 1_048_577, writes: 1_048_576 });
    expect(copyCost(MIB, 64 * 1024)).toMatchObject({ dataReads: 16, reads: 17, writes: 16, syscalls: 33 });
  });
  it('⌈size / buf⌉ data reads, one more read that returns 0, and as many writes as data reads', () => {
    for (const size of [0, 1, 100, 4095, 4096, 4097, MIB, MIB + 1]) {
      for (const buf of [1, 3, 512, 4096, 65536]) {
        const c = copyCost(size, buf);
        expect(c.dataReads).toBe(Math.ceil(size / buf));
        expect(c.syscalls).toBe(c.reads + c.writes);
        // Brute force: run the copy loop itself (skipped only where it would take a million turns).
        if (size / buf > 10_000) continue;
        let left = size;
        let reads = 0;
        let writes = 0;
        for (;;) {
          const n = Math.min(buf, left);
          reads++;
          if (n === 0) break;
          writes++;
          left -= n;
        }
        expect([c.reads, c.writes]).toEqual([reads, writes]);
      }
    }
  });
  it('more buffer, fewer crossings, for every size on screen', () => {
    const costs = BUFFER_SIZES.map((b) => copyCost(COPY_FILE_BYTES, b).crossingNs);
    costs.forEach((c, i) => i > 0 && expect(c).toBeLessThan(costs[i - 1]));
  });
  it('refuses nonsense sizes', () => {
    expect(() => copyCost(10, 0)).toThrow();
    expect(() => copyCost(-1, 4)).toThrow();
  });
});

describe('the read() walkthrough', () => {
  it('crosses into the kernel exactly once and back exactly once', () => {
    expect(crossings(READ_STEPS)).toBe(2);
    expect(READ_STEPS.filter((s) => s.crossing).map((s) => s.id)).toEqual(['trap', 'sysret']);
  });
  it('runs kernel code only in ring 0 and user code only in ring 3', () => {
    for (const s of READ_STEPS) expect(s.ring).toBe(NODE_BAND[s.at] === 'kernel' ? 0 : 3);
  });
  it('a crossing step is exactly where the ring changes', () => {
    READ_STEPS.forEach((s, i) => {
      const before = i === 0 ? 3 : READ_STEPS[i - 1].ring;
      expect(s.crossing === 1).toBe(s.ring !== before);
    });
  });
  it('rax holds the syscall number on the way in and the byte count on the way out', () => {
    expect(READ_STEPS.find((s) => s.id === 'trap')!.regs.rax).toBe('0');
    expect(READ_STEPS.at(-1)!.regs.rax).toBe('4096');
  });
  it('the crossings cost far more than the function call around them', () => {
    const call = READ_STEPS.find((s) => s.id === 'call')!.costNs;
    const crossingCost = READ_STEPS.filter((s) => s.crossing).reduce((a, s) => a + s.costNs, 0);
    expect(crossingCost).toBeGreaterThan(20 * call);
    expect(totalNs(READ_STEPS)).toBe(READ_STEPS.reduce((a, s) => a + s.costNs, 0));
  });
  it('the privileged instruction faults into the kernel and the process ends killed', () => {
    expect(PRIV_STEPS[1].move!.fault).toBe(true);
    expect(PRIV_STEPS[1].ring).toBe(0);
    expect(PRIV_STEPS.at(-1)!.killed).toBe(true);
  });
});

describe('the sorter key', () => {
  const expected: Record<string, Bin> = {
    printf: 'sometimes', write: 'always', malloc: 'sometimes', getpid: 'always', clock_gettime: 'never', strlen: 'never', open: 'always', fopen: 'always',
  };
  it('matches the documented table, and every entry names its source', () => {
    expect(Object.fromEntries(SORT_KEY.map((i) => [i.fn, i.answer]))).toEqual(expected);
    for (const i of SORT_KEY) {
      expect(i.source.length).toBeGreaterThan(3);
      expect(i.why.length).toBeGreaterThan(20);
    }
  });
  it('only clock_gettime accepts a second bin', () => {
    expect(SORT_KEY.filter((i) => i.alsoOk).map((i) => [i.fn, i.alsoOk])).toEqual([['clock_gettime', ['sometimes']]]);
    const cg = SORT_KEY.find((i) => i.fn === 'clock_gettime')!;
    expect(BINS.map((b) => isCorrect(cg, b.id))).toEqual([false, true, true]);
  });
  it('score counts placed and right answers', () => {
    expect(score({})).toEqual({ right: 0, placed: 0, total: 8 });
    expect(score(expected)).toEqual({ right: 8, placed: 8, total: 8 });
    expect(score({ printf: 'always', strlen: 'never' })).toEqual({ right: 1, placed: 2, total: 8 });
  });
});
