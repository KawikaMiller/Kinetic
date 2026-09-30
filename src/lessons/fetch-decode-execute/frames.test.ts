import { describe, expect, it } from 'vitest';
import { cpuFrames } from './frames';
import { MAX_INSTRUCTIONS, MEM_SIZE, PROGRAMS, encode, run } from './model';

describe('cpuFrames', () => {
  it('is a start frame plus fetch, decode and execute for every instruction, each with its own caption', () => {
    for (const p of PROGRAMS) {
      const frames = cpuFrames(p.mem);
      const { effects, states } = run(p.mem);
      expect(frames).toHaveLength(1 + 3 * effects.length);
      expect(frames.every((f) => f.say !== undefined)).toBe(true);
      expect(frames.slice(1).map((f) => f.phase)).toEqual(effects.flatMap(() => ['fetch', 'decode', 'execute']));
      // the last frame shows the machine's real final state
      expect(frames[frames.length - 1].cpu).toEqual(states[states.length - 1]);
    }
  });
  it('fetch has already moved PC on, and execute shows the state after the instruction', () => {
    const frames = cpuFrames(PROGRAMS[0].mem);
    const { states } = run(PROGRAMS[0].mem);
    expect(frames[1].cpu.pc).toBe(1);
    expect(frames[1].cpu.ir).toBe(PROGRAMS[0].mem[0]);
    expect(frames[3].cpu).toEqual(states[1]);
  });
  it('a runaway program ends on a "stopped" frame', () => {
    const loop = Array.from({ length: MEM_SIZE }, (_, i) => (i === 0 ? encode({ op: 'JMP', addr: 0 }) : 0));
    const frames = cpuFrames(loop);
    expect(frames).toHaveLength(1 + 3 * MAX_INSTRUCTIONS + 1);
    expect(frames[frames.length - 1].phase).toBe('stopped');
  });
});
