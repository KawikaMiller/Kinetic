import { describe, expect, it } from 'vitest';
import {
  MAX_INSTRUCTIONS, MEM_SIZE, PROGRAMS, assemble, decode, disassemble, encode, initialCpu, run, step, type Opcode,
} from './model';

const program = (id: string) => PROGRAMS.find((p) => p.id === id)!;
const final = (id: string) => {
  const r = run(program(id).mem);
  return { ...r, cpu: r.states[r.states.length - 1] };
};

describe('encoding', () => {
  it('every one of the 256 words decodes and, if defined, re-encodes to itself', () => {
    for (let w = 0; w < 256; w++) {
      const i = decode(w);
      if (i.op === 'UNKNOWN') {
        expect(w >> 5).toBe(7);
        continue;
      }
      expect(encode({ op: i.op, reg: i.reg, addr: i.addr })).toBe(w);
    }
  });
  it('the assembler reads back what the disassembler prints, for every defined instruction', () => {
    for (let w = 0; w < 224; w++) {
      const text = disassemble(w);
      const back = assemble(text)!;
      // fields an instruction ignores (e.g. ADD's address bits) print away, so compare meaning, not bits
      expect(disassemble(back)).toBe(text);
    }
  });
  it('assemble accepts numbers, hex and mnemonics, and rejects nonsense', () => {
    expect(assemble('62')).toBe(62);
    expect(assemble('0x3e')).toBe(62);
    expect(assemble('load r1, [14]')).toBe(62);
    expect(assemble('JMP 2')).toBe(encode({ op: 'JMP', addr: 2 }));
    for (const bad of ['256', 'LOAD R2, [1]', 'JMP 16', 'MUL', '']) expect(assemble(bad)).toBeNull();
  });
});

describe('each instruction', () => {
  const mem = (cells: Record<number, number>) => Array.from({ length: MEM_SIZE }, (_, i) => cells[i] ?? 0);
  const one = (word: number, setup: Partial<ReturnType<typeof initialCpu>> = {}, cells: Record<number, number> = {}) =>
    step({ ...initialCpu(mem({ 0: word, ...cells })), ...setup });

  it('fetch always loads IR from mem[PC] and moves PC on by one', () => {
    const { next } = one(encode({ op: 'LOAD', reg: 0, addr: 9 }), {}, { 9: 42 });
    expect(next.ir).toBe(encode({ op: 'LOAD', reg: 0, addr: 9 }));
    expect(next.pc).toBe(1);
    expect(next.r[0]).toBe(42);
  });
  it('STORE writes a register into memory', () => {
    const { next } = one(encode({ op: 'STORE', reg: 1, addr: 12 }), { r: [0, 99] });
    expect(next.mem[12]).toBe(99);
  });
  it('ADD and SUB wrap around at 256 and set Z only on zero', () => {
    expect(one(encode({ op: 'ADD' }), { r: [200, 100] }).next).toMatchObject({ r: [44, 100], z: false });
    expect(one(encode({ op: 'SUB' }), { r: [5, 5] }).next).toMatchObject({ r: [0, 5], z: true });
    expect(one(encode({ op: 'SUB' }), { r: [0, 1] }).next).toMatchObject({ r: [255, 1], z: false });
  });
  it('JZ jumps only when Z is set; JMP always does', () => {
    expect(one(encode({ op: 'JZ', addr: 7 }), { z: false }).next.pc).toBe(1);
    expect(one(encode({ op: 'JZ', addr: 7 }), { z: true }).next.pc).toBe(7);
    expect(one(encode({ op: 'JMP', addr: 7 })).next.pc).toBe(7);
  });
  it('HALT stops the machine (PC has already moved past it, as the fetch always does)', () => {
    const { next } = one(encode({ op: 'HALT' }));
    expect(next.halted).toBe(true);
    expect(next.pc).toBe(1);
    expect(step(next).effect.instr.op).toBe('HALT'); // a halted CPU isn't run again by run()
  });
  it('matches an independent reference machine on 300 random single steps', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let n = 0; n < 300; n++) {
      const cells = Array.from({ length: MEM_SIZE }, () => Math.floor(rnd() * 224));
      const cpu = { ...initialCpu(cells), pc: Math.floor(rnd() * MEM_SIZE), r: [Math.floor(rnd() * 256), Math.floor(rnd() * 256)] as [number, number], z: rnd() < 0.5 };
      const { next } = step(cpu);
      const w = cells[cpu.pc];
      const [op, reg, addr] = [w >> 5, (w >> 4) & 1, w & 15];
      const ref = { pc: (cpu.pc + 1) % 16, r: [...cpu.r], z: cpu.z, mem: [...cells] };
      const names: Opcode[] = ['HALT', 'LOAD', 'STORE', 'ADD', 'SUB', 'JZ', 'JMP'];
      if (names[op] === 'LOAD') ref.r[reg] = cells[addr];
      if (names[op] === 'STORE') ref.mem[addr] = cpu.r[reg];
      if (names[op] === 'ADD') { ref.r[0] = (cpu.r[0] + cpu.r[1]) & 255; ref.z = ref.r[0] === 0; }
      if (names[op] === 'SUB') { ref.r[0] = (cpu.r[0] - cpu.r[1]) & 255; ref.z = ref.r[0] === 0; }
      if (names[op] === 'JMP' || (names[op] === 'JZ' && cpu.z)) ref.pc = addr;
      expect({ pc: next.pc, r: next.r, z: next.z, mem: next.mem }).toEqual(ref);
    }
  });
});

describe('the presets', () => {
  it('"Add two numbers" stores 7 + 5 = 12 in cell 13 in 5 instructions', () => {
    const { cpu, effects, reason } = final('add');
    expect(cpu.mem[13]).toBe(12);
    expect(effects).toHaveLength(5);
    expect(reason).toBe('halt');
  });
  it('"Count down from 3" loops three times and ends at 0 after 14 instructions', () => {
    const { cpu, effects } = final('countdown');
    expect(cpu.mem[13]).toBe(0);
    expect(cpu.z).toBe(true);
    expect(effects.map((e) => e.at)).toEqual([0, 1, 2, 3, 4, 5, 2, 3, 4, 5, 2, 3, 4, 6]);
  });
  it('"Self-modifying code" rewrites its own HALT and goes on to store 62 + 5 = 67', () => {
    const { cpu, effects } = final('self-modify');
    expect(effects[1].wroteMem).toEqual({ addr: 2, value: assemble('LOAD R1, [14]') });
    expect(disassemble(cpu.mem[2])).toBe('LOAD R1, [14]');
    expect(cpu.mem[13]).toBe(67);
    expect(effects).toHaveLength(6);
    // without the patch the same program would stop at cell 2
    const unpatched = [...program('self-modify').mem];
    unpatched[15] = 0;
    expect(run(unpatched).effects.map((e) => e.at)).toEqual([0, 1, 2]);
  });
  it('a program that never halts is stopped at the instruction limit', () => {
    const loop = Array.from({ length: MEM_SIZE }, (_, i) => (i === 0 ? encode({ op: 'JMP', addr: 0 }) : 0));
    const r = run(loop);
    expect(r.reason).toBe('limit');
    expect(r.effects).toHaveLength(MAX_INSTRUCTIONS);
  });
  it('an undefined opcode stops the CPU', () => {
    const cells = Array.from({ length: MEM_SIZE }, (_, i) => (i === 0 ? 0b11100000 : 0));
    expect(run(cells).reason).toBe('unknown');
  });
});
