import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import {
  firstCycle, isMemOp, parseInstr, parseProgram, pipeline, PRESETS, presetById, reads, run, swapBlocker, swapped, unpipelined, writes,
  type Instr, type Machine, type PipelineOptions,
} from './model';

const OPTIONS: PipelineOptions[] = [
  { forwarding: false, memPorts: 2 },
  { forwarding: true, memPorts: 2 },
  { forwarding: false, memPorts: 1 },
  { forwarding: true, memPorts: 1 },
];

/**
 * Independent reference: the classic timing equations, one committed instruction at a time,
 * with no pipeline state at all. F = fetch, D = first ID cycle, E = EX cycle; MEM = E + 1,
 * WB = E + 2.
 *   F_k = D_{k-1} (fetched as the one ahead moves to ID), or E_b + 1 after a taken branch b;
 *         then pushed later while a load/store occupies the single memory port in MEM.
 *   D_k = max(F_k + 1, E_{k-1})       (ID is free once k-1 moves on)
 *   E_k = max(D_k + 1, E_{k-1} + 1, operand readiness)
 *   operand readiness, producer p:  no forwarding  E_k ≥ WB_p + 1  (read in ID's second half)
 *                                   forwarding     E_k ≥ E_p + 1 (ALU) or MEM_p + 1 (load)
 */
function reference(program: readonly Instr[], start: Machine, o: PipelineOptions) {
  const { trace, taken } = run(program, start);
  const F: number[] = [];
  const D: number[] = [];
  const E: number[] = [];
  trace.forEach((pc, k) => {
    const ins = program[pc];
    let f = k === 0 ? 1 : taken[k - 1] ? E[k - 1] + 1 : D[k - 1];
    if (o.memPorts === 1) while (trace.slice(0, k).some((q, j) => isMemOp(program[q]) && E[j] + 1 === f)) f++;
    const d = k === 0 ? f + 1 : Math.max(f + 1, E[k - 1]);
    let e = k === 0 ? d + 1 : Math.max(d + 1, E[k - 1] + 1);
    for (const r of reads(ins)) {
      let p = -1;
      for (let j = k - 1; j >= 0; j--) if (writes(program[trace[j]]).includes(r)) { p = j; break; }
      if (p < 0) continue;
      const load = program[trace[p]].op === 'lw';
      e = Math.max(e, o.forwarding ? E[p] + (load ? 2 : 1) : E[p] + 3);
    }
    F.push(f);
    D.push(d);
    E.push(e);
  });
  return { F, D, E, total: E[E.length - 1] + 2, n: trace.length };
}

function check(program: Instr[], start: Machine, o: PipelineOptions) {
  const sim = pipeline(program, start, o);
  const ref = reference(program, start, o);
  const onPath = sim.rows.filter((r) => r.traceIndex !== null);
  expect(onPath.map((r) => r.traceIndex)).toEqual(ref.F.map((_, k) => k));
  onPath.forEach((row, k) => {
    expect(firstCycle(row, 'IF'), `IF of #${k}`).toBe(ref.F[k]);
    expect(firstCycle(row, 'ID'), `ID of #${k}`).toBe(ref.D[k]);
    expect(firstCycle(row, 'EX'), `EX of #${k}`).toBe(ref.E[k]);
    expect(firstCycle(row, 'WB'), `WB of #${k}`).toBe(ref.E[k] + 2);
  });
  expect(sim.totalCycles).toBe(ref.total);
  expect(sim.committed).toBe(ref.n);
  // every cycle after the fill writes back an instruction, a stall bubble or a flushed slot
  expect(sim.totalCycles).toBe(sim.committed + 4 + sim.stalls.data + sim.stalls.port + sim.flushes);
  // flushed rows never get past ID
  for (const r of sim.rows.filter((x) => x.flushedAt !== null)) {
    expect(firstCycle(r, 'EX')).toBeNull();
  }
  return sim;
}

const prog = (...lines: string[]) => parseProgram(lines);
const zeroes: Machine = { regs: [0, 1, 2, 3, 4, 5, 6, 7], mem: {} };

describe('parser', () => {
  it('reads every instruction form', () => {
    expect(parseInstr('add r1, r2, r3')).toMatchObject({ op: 'add', rd: 1, srcs: [2, 3] });
    expect(parseInstr('lw r1, -4(r2)')).toMatchObject({ op: 'lw', rd: 1, srcs: [2], offset: -4 });
    expect(parseInstr('sw r3, 12(r7)')).toMatchObject({ op: 'sw', rd: null, srcs: [7, 3], offset: 12 });
    expect(parseInstr('done: beq r4, r5, done')).toMatchObject({ op: 'beq', srcs: [4, 5], target: 'done', label: 'done' });
  });
  it('refuses what it does not know', () => {
    expect(() => parseInstr('mul r1, r2, r3')).toThrow();
    expect(() => parseInstr('add r1, r2')).toThrow();
    expect(() => parseInstr('lw r1, r2')).toThrow();
    expect(() => parseInstr('add r9, r2, r3')).toThrow();
  });
});

describe('the textbook hazard counts', () => {
  it('RAW: 2 stalls without forwarding (write first half, read second half), 0 with it', () => {
    const p = prog('add r1, r2, r3', 'sub r4, r1, r5');
    const off = check(p, zeroes, { forwarding: false, memPorts: 2 });
    expect(off.stalls.data).toBe(2);
    expect(off.totalCycles).toBe(2 + 4 + 2);
    const on = check(p, zeroes, { forwarding: true, memPorts: 2 });
    expect(on.stalls.data).toBe(0);
    expect(on.forwards).toEqual([{ fromRow: 0, toRow: 1, reg: 1, cycle: 4, fromStage: 'EX' }]);
  });
  it('RAW two apart: 1 stall without forwarding, forwarded from MEM/WB with it', () => {
    const p = prog('add r1, r2, r3', 'and r6, r2, r7', 'sub r4, r1, r5');
    expect(check(p, zeroes, { forwarding: false, memPorts: 2 }).stalls.data).toBe(1);
    const on = check(p, zeroes, { forwarding: true, memPorts: 2 });
    expect(on.stalls.data).toBe(0);
    expect(on.forwards[0].fromStage).toBe('MEM');
  });
  it('RAW three apart: the register file covers it, no stall, no forward', () => {
    const p = prog('add r1, r2, r3', 'and r6, r2, r3', 'or r7, r2, r3', 'sub r4, r1, r5');
    const off = check(p, zeroes, { forwarding: false, memPorts: 2 });
    expect(off.stalls.data).toBe(0);
    const on = check(p, zeroes, { forwarding: true, memPorts: 2 });
    expect(on.forwards.filter((f) => f.reg === 1)).toEqual([]);
  });
  it('load-use: 1 stall even with forwarding, 2 without', () => {
    const p = prog('lw r1, 0(r2)', 'add r3, r1, r4');
    expect(check(p, zeroes, { forwarding: true, memPorts: 2 }).stalls.data).toBe(1);
    expect(check(p, zeroes, { forwarding: false, memPorts: 2 }).stalls.data).toBe(2);
  });
  it('a taken branch resolved in EX flushes the 2 instructions fetched behind it', () => {
    const p = presetById('branch');
    const sim = check(parseProgram(p.lines), p.start, p.opts);
    expect(sim.flushes).toBe(2);
    const flushed = sim.rows.filter((r) => r.flushedAt !== null).map((r) => r.pc);
    expect(flushed).toEqual([2, 3]);
    expect(sim.totalCycles).toBe(3 + 4 + 2);
  });
  it('a branch that is not taken costs nothing (predict not-taken)', () => {
    const p = prog('beq r1, r2, done', 'add r3, r1, r2', 'done: or r4, r1, r2');
    const sim = check(p, zeroes, { forwarding: true, memPorts: 2 });
    expect(sim.flushes).toBe(0);
    expect(sim.totalCycles).toBe(3 + 4);
  });
  it('one shared memory port: a load in MEM blocks that cycle\'s fetch', () => {
    const p = presetById('port');
    const one = check(parseProgram(p.lines), p.start, { forwarding: true, memPorts: 1 });
    expect(one.stalls.port).toBe(1);
    const two = check(parseProgram(p.lines), p.start, { forwarding: true, memPorts: 2 });
    expect(two.stalls.port).toBe(0);
    expect(one.totalCycles).toBe(two.totalCycles + 1);
  });
});

describe('every preset, every option combination', () => {
  for (const p of PRESETS) {
    for (const o of OPTIONS) {
      it(`${p.id}, forwarding ${o.forwarding ? 'on' : 'off'}, ${o.memPorts} port(s): matches the timing equations`, () => {
        check(parseProgram(p.lines), p.start, o);
      });
    }
  }
  it('the reorder preset: 2 load-use stalls, and moving the third load up removes both', () => {
    const p = presetById('reorder');
    const program = parseProgram(p.lines);
    const before = check(program, p.start, p.opts);
    expect(before.stalls.data).toBe(2);
    expect(before.totalCycles).toBe(13);
    const moved = swapped(swapped(program, 3)!, 2)!;
    const after = check(moved, p.start, p.opts);
    expect(after.stalls.data).toBe(0);
    expect(after.totalCycles).toBe(11);
  });
});

function randomProgram(rnd: Rnd, n: number, { hazardFree }: { hazardFree: boolean }): Instr[] {
  const lines: string[] = [];
  const ops = ['add', 'sub', 'and', 'or'];
  for (let i = 0; i < n; i++) {
    if (hazardFree) {
      // writes go to r1..r3 and reads come from r4..r7: no instruction reads another's result
      lines.push(`${ops[randInt(0, 3, rnd)]} r${randInt(1, 3, rnd)}, r${randInt(4, 7, rnd)}, r${randInt(4, 7, rnd)}`);
      continue;
    }
    const kind = randInt(0, 9, rnd);
    const r = () => `r${randInt(1, 4, rnd)}`;
    if (kind <= 4) lines.push(`${ops[randInt(0, 3, rnd)]} ${r()}, ${r()}, ${r()}`);
    else if (kind <= 6) lines.push(`lw ${r()}, ${4 * randInt(0, 3, rnd)}(r7)`);
    else if (kind <= 7) lines.push(`sw ${r()}, ${4 * randInt(0, 3, rnd)}(r7)`);
    // forward branches only, so every program ends
    else if (i < n - 1) lines.push(`beq ${r()}, ${r()}, l${randInt(i + 1, n - 1, rnd)}`);
    else lines.push(`or ${r()}, ${r()}, ${r()}`);
  }
  return parseProgram(lines.map((l, i) => `l${i}: ${l}`));
}

describe('seeded random programs', () => {
  it('hazard-free programs take exactly n + 4 cycles', () => {
    const rnd = mulberry32(7);
    for (let t = 0; t < 200; t++) {
      const program = randomProgram(rnd, randInt(1, 12, rnd), { hazardFree: true });
      for (const o of OPTIONS.filter((x) => x.memPorts === 2)) {
        const sim = check(program, zeroes, o);
        expect(sim.totalCycles).toBe(program.length + 4);
      }
    }
  });
  it('programs with hazards, branches and loads match the timing equations under every option', () => {
    const rnd = mulberry32(2026);
    const start: Machine = { regs: [0, 1, 2, 1, 2, 0, 0, 64], mem: { 64: 1, 68: 2, 72: 1, 76: 3 } };
    for (let t = 0; t < 400; t++) {
      const program = randomProgram(rnd, randInt(2, 10, rnd), { hazardFree: false });
      for (const o of OPTIONS) check(program, start, o);
    }
  });
});

describe('not pipelined', () => {
  it('takes 5 cycles per executed instruction', () => {
    for (const p of PRESETS) {
      const program = parseProgram(p.lines);
      expect(unpipelined(program, p.start).totalCycles).toBe(5 * run(program, p.start).trace.length);
    }
  });
});

describe('reordering', () => {
  const key = (ps: Instr[]) => ps.map((i) => i.text).join(';');
  it('every order reachable by allowed swaps leaves the same registers and memory', () => {
    for (const p of PRESETS) {
      const program = parseProgram(p.lines);
      const want = run(program, p.start);
      const seen = new Set([key(program)]);
      const queue = [program];
      while (queue.length) {
        const cur = queue.shift()!;
        const got = run(cur, p.start);
        expect(got.regs, `${p.id}: ${key(cur)}`).toEqual(want.regs);
        expect(got.mem).toEqual(want.mem);
        for (let i = 0; i + 1 < cur.length; i++) {
          const nx = swapped(cur, i);
          if (nx && !seen.has(key(nx))) {
            seen.add(key(nx));
            queue.push(nx);
          }
        }
      }
      if (p.id === 'reorder') expect(seen.size).toBeGreaterThan(5);
    }
  });
  it('names the dependency that blocks a swap', () => {
    const [, lw2, add, sw, lw4] = parseProgram(presetById('reorder').lines);
    expect(swapBlocker(sw, lw4)).toBeNull();
    expect(swapBlocker(add, lw4)).toBeNull();
    expect(swapBlocker(lw2, add)).toMatch(/reads r2/);
    expect(swapBlocker(parseInstr('add r1, r2, r3'), parseInstr('sub r2, r4, r5'))).toMatch(/overwrites r2/);
    expect(swapBlocker(parseInstr('add r1, r2, r3'), parseInstr('sub r1, r4, r5'))).toMatch(/both write r1/);
    expect(swapBlocker(sw, parseInstr('lw r4, 12(r7)'))).toMatch(/same memory/);
    expect(swapBlocker(sw, parseInstr('lw r4, 12(r6)'))).toMatch(/same memory/);
    expect(swapBlocker(sw, parseInstr('lw r4, 8(r7)'))).toBeNull();
  });
});
