import { describe, expect, it } from 'vitest';
import {
  access, ADDRESS_PRESETS, ADDR_MAX, parseAddress, BELADY_REFS, FRAMES, LAYOUT, PAGE_SIZE, PROCS, replay, reverse, simulate, startMachine, thrashAccesses, translate,
  usefulShare, WORKING_SET, type Access, type Machine, type Policy,
} from './model';

const POLICIES: Policy[] = ['fifo', 'clock'];

/** Every frame's owners agree with the page tables, and no frame is mapped twice except the shared libc page. */
function consistent(m: Machine) {
  m.frames.forEach((f, i) => {
    for (const o of f.owners) {
      const pte = m.tables[o.proc][o.vpn];
      expect(pte.present).toBe(true);
      expect(pte.frame).toBe(i);
    }
    if (f.owners.length > 1) expect(f.owners.every((o) => LAYOUT[o.vpn] === 'libc')).toBe(true);
  });
  for (const proc of PROCS) {
    m.tables[proc].forEach((pte) => {
      if (pte.present) expect(m.frames[pte.frame!].owners).toContainEqual({ proc, vpn: pte.vpn });
      else expect(pte.frame).toBeNull();
      if (!pte.kind) expect(pte.present).toBe(false);
    });
  }
}

describe('translate', () => {
  it('every address of every present page translates and round-trips through the reverse map', () => {
    const m = startMachine();
    let checked = 0;
    for (const proc of PROCS) {
      for (let vaddr = 0; vaddr <= ADDR_MAX; vaddr++) {
        const t = translate(m.tables[proc], vaddr);
        const pte = m.tables[proc][vaddr >>> 12];
        if (!pte.kind) expect(t).toMatchObject({ ok: false, reason: 'unmapped' });
        else if (!pte.present) expect(t).toMatchObject({ ok: false, reason: 'not-present' });
        else {
          if (!t.ok) throw new Error('should translate');
          expect(t.paddr).toBe(pte.frame! * PAGE_SIZE + (vaddr & 0xfff));
          expect(reverse(m, t.paddr)).toContainEqual({ proc, vaddr });
          checked++;
        }
      }
    }
    // A and B each have 4 resident pages (code, libc, heap, stack).
    expect(checked).toBe(8 * PAGE_SIZE);
  });
  it('the same virtual address maps to different frames in A and B (their stacks), and libc to one frame', () => {
    const m = startMachine();
    const a = translate(m.tables.A, 0xf800);
    const b = translate(m.tables.B, 0xf800);
    expect(a.ok && b.ok && a.paddr !== b.paddr).toBe(true);
    const la = translate(m.tables.A, 0x2abc);
    const lb = translate(m.tables.B, 0x2abc);
    expect(la.ok && lb.ok && la.paddr === lb.paddr).toBe(true);
  });
});

describe('access', () => {
  it('protection: writing code or libc, or touching the gap, is a segfault and changes nothing', () => {
    const m = startMachine();
    const cases: Access[] = [
      { proc: 'A', vaddr: 0x0100, write: true },
      { proc: 'B', vaddr: 0x8000, write: false },
      { proc: 'A', vaddr: 0x2000, write: true },
    ];
    for (const a of cases) {
      const r = access(m, a, 'fifo');
      expect(r.outcome).toBe('segv');
      expect(r.m).toEqual(m);
      expect(r.steps.at(-1)!.reason).toBe(LAYOUT[a.vaddr >>> 12] ? 'read-only' : 'unmapped');
    }
  });
  it('a hit sets the dirty bit on a write only', () => {
    const r = access(startMachine(), { proc: 'B', vaddr: 0x0010, write: false }, 'fifo');
    expect(r.outcome).toBe('hit');
    expect(r.m.tables.B[0].dirty).toBe(false);
    const w = access(startMachine(), { proc: 'B', vaddr: 0x3010, write: true }, 'fifo');
    expect(w.m.tables.B[3].dirty).toBe(true);
    expect(w.paddr).toBe(5 * PAGE_SIZE + 0x10);
  });
  it('a fault with a free frame loads into it and retries; reading from swap counts a swap read', () => {
    const r = access(startMachine(), { proc: 'A', vaddr: 0x4a00, write: false }, 'fifo');
    expect(r.outcome).toBe('fault');
    expect(r.steps.map((s) => s.kind)).toEqual(['split', 'lookup', 'fault', 'free', 'load', 'retry', 'done']);
    expect(r.paddr).toBe(7 * PAGE_SIZE + 0xa00);
    expect(r.m.swapReads).toBe(1);
  });
  it('B touching libc after it was evicted maps the copy A already reloaded (no disk read)', () => {
    let m = startMachine();
    const fill: Access[] = [
      { proc: 'A', vaddr: 0x4000, write: false },
      { proc: 'A', vaddr: 0x5000, write: true },
      { proc: 'A', vaddr: 0x6000, write: true },
    ];
    for (const a of fill) m = access(m, a, 'fifo').m;
    expect(m.tables.B[2].present).toBe(false);
    m = access(m, { proc: 'A', vaddr: 0x2000, write: false }, 'fifo').m;
    const r = access(m, { proc: 'B', vaddr: 0x2000, write: false }, 'fifo');
    expect(r.steps.map((s) => s.kind)).toContain('shared');
    expect(r.m.tables.B[2].frame).toBe(r.m.tables.A[2].frame);
  });
  it('a dirty victim causes exactly one swap write, a clean one none (presets then the thrash loop, both policies)', () => {
    for (const policy of POLICIES) {
      let m = startMachine();
      const seq = [...ADDRESS_PRESETS.map((p) => p.access), ...thrashAccesses()];
      for (const a of seq) {
        const r = access(m, a, policy);
        const victim = r.steps.find((s) => s.kind === 'victim');
        const writes = r.m.swapWrites - m.swapWrites;
        if (victim) {
          const dirty = victim.evicted!.some((o) => m.tables[o.proc][o.vpn].dirty);
          expect(writes).toBe(dirty ? 1 : 0);
          expect(r.steps.some((s) => s.kind === 'swapout')).toBe(dirty);
        } else {
          expect(writes).toBe(0);
        }
        consistent(r.m);
        m = r.m;
      }
    }
  });
  it('2,000 random accesses keep tables and frames consistent and agree with translate()', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
    for (const policy of POLICIES) {
      let m = startMachine();
      for (let i = 0; i < 2000; i++) {
        const a: Access = { proc: rnd() < 0.5 ? 'A' : 'B', vaddr: Math.floor(rnd() * (ADDR_MAX + 1)), write: rnd() < 0.4 };
        const r = access(m, a, policy);
        consistent(r.m);
        if (r.outcome !== 'segv') {
          const t = translate(r.m.tables[a.proc], a.vaddr);
          expect(t.ok && t.paddr).toBe(r.paddr);
        }
        expect(r.m.frames.filter((f) => f.owners.length > 0).length).toBeLessThanOrEqual(FRAMES);
        m = r.m;
      }
    }
  });
  it('thrashing: a 10-page working set over 8 frames faults on every access of the last round, under either policy', () => {
    const accesses = thrashAccesses();
    expect(WORKING_SET).toBe(10);
    for (const policy of POLICIES) {
      let m = startMachine();
      const outcomes = accesses.map((a) => {
        const r = access(m, a, policy);
        m = r.m;
        return r.outcome;
      });
      expect(outcomes.slice(-WORKING_SET)).toEqual(Array(WORKING_SET).fill('fault'));
      expect(usefulShare(m)).toBeLessThan(0.001);
      expect(m.major + m.minor).toBe(m.faults);
      expect(replay(accesses, policy)).toEqual(m);
    }
  });
});

describe('reference strings', () => {
  it("Bélády's anomaly: FIFO on 1 2 3 4 1 2 5 1 2 3 4 5 faults 9 times with 3 frames, 10 with 4", () => {
    expect(simulate(BELADY_REFS, 3, 'fifo').faults).toBe(9);
    expect(simulate(BELADY_REFS, 4, 'fifo').faults).toBe(10);
  });
  it('Clock on the same string, worked by hand: 9 faults with 3 frames', () => {
    expect(simulate(BELADY_REFS, 3, 'clock').faults).toBe(9);
  });
  it('Clock gives a recently used page a second chance where FIFO evicts it: 1 2 3 4 2 5 2', () => {
    const refs = [1, 2, 3, 4, 2, 5, 2];
    expect(simulate(refs, 3, 'fifo').faults).toBe(6);
    expect(simulate(refs, 3, 'clock').faults).toBe(5);
    expect([...simulate(refs, 3, 'clock').resident.at(-1)!].sort()).toEqual([2, 4, 5]);
  });
  it('enough frames for every page: only compulsory faults', () => {
    for (const p of POLICIES) expect(simulate(BELADY_REFS, 5, p).faults).toBe(5);
  });
});

describe('parseAddress', () => {
  it('reads 0x-prefixed and bare hex in range', () => {
    expect(parseAddress('0x3010')).toEqual({ ok: true, value: 0x3010 });
    expect(parseAddress(' ffff ')).toEqual({ ok: true, value: 0xffff });
    expect(parseAddress('0X0')).toEqual({ ok: true, value: 0 });
  });
  it.each(['', '   ', '0x10000', '-1', '1e400', '😀', '<b>1</b>', '1,2', '0x', 'g', '12345678901234567890123'])('refuses %s with a sentence', (t) => {
    const r = parseAddress(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });
  it('says the range when the address is too big', () => {
    const r = parseAddress('0x10000');
    expect(!r.ok && r.error).toContain('0xFFFF');
  });
});
