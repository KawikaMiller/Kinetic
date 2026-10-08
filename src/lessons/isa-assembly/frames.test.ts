import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { isaFrames } from './frames';
import lesson from './index';
import { cResult, formatValue, PRESETS, type ProgId, type Variant } from './model';
import { applyWrite, START_VALUE, WIDTH_WRITES, widthStart } from './widths';
import { assemble, CONDITIONS, hex, startCpu, step } from '../../core/x86';

const VARIANTS: Record<ProgId, Variant[]> = {
  sum: [{ cmov: false, unsignedTypes: false }],
  max: [{ cmov: false, unsignedTypes: false }, { cmov: true, unsignedTypes: false }],
  absdiff: [{ cmov: false, unsignedTypes: false }, { cmov: false, unsignedTypes: true }],
  area: [{ cmov: false, unsignedTypes: false }],
};

describe('every program × input × variant: captions true at every step', () => {
  for (const prog of Object.keys(PRESETS) as ProgId[]) {
    for (const preset of PRESETS[prog]) {
      for (const v of VARIANTS[prog]) {
        it(`${prog} ${preset.id} ${JSON.stringify(v)}`, () => {
          const { run, frames } = isaFrames(prog, v, preset.values);
          expect(frames).toHaveLength(run.effects.length + 2);
          const intro = captionText(frames[0].say);
          for (const a of run.args) expect(intro).toContain(`${a.name} in ${a.reg} (${formatValue(run.start.regs[a.reg], v.unsignedTypes)})`);
          run.effects.forEach((e, i) => {
            const text = captionText(frames[i + 1].say);
            const before = run.cpus[i];
            const after = run.cpus[i + 1];
            expect(text.startsWith(e.instr.text)).toBe(true);
            const op = e.instr.op;
            if (op.startsWith('j') && op !== 'jmp') {
              expect(text.includes('so it jumps')).toBe(e.taken);
              for (const f of CONDITIONS[op.slice(1)].flags) expect(text).toContain(`${f} = ${before.flags[f] ? 1 : 0}`);
            }
            if (op.startsWith('cmov')) expect(text.includes('so it copies')).toBe(e.taken);
            if (op === 'cmp' || op === 'test') for (const f of ['ZF', 'SF', 'CF', 'OF'] as const) expect(text).toContain(`${f} = ${after.flags[f] ? 1 : 0}`);
            if (op === 'mov' && e.instr.operands[0].kind === 'reg' && e.instr.operands[0].ref.bits === 32) expect(text).toContain('zero-extends');
            if (op === 'ret') expect(text).toContain(`result is in rax: ${formatValue(after.regs.rax, v.unsignedTypes)}`);
            if (op === 'lea') expect(text).toContain(hex(after.regs[e.wroteRegs[0]]));
          });
          const last = captionText(frames[frames.length - 1].say);
          const want = cResult(prog, v, preset.values);
          expect(run.cpus.at(-1)!.regs.rax).toBe(want);
          expect(last).toContain('the same as the C code gives');
          expect(last).toContain(`in ${run.effects.length} instructions`);
        });
      }
    }
  }
});

describe('register widths', () => {
  it('a 32-bit write zeroes the top 4 bytes; 8- and 16-bit writes keep them', () => {
    for (const w of WIDTH_WRITES) {
      const { result } = applyWrite(widthStart(), w);
      const bytes = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => Number((result.after >> BigInt(8 * k)) & 0xffn));
      const startBytes = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => Number((START_VALUE >> BigInt(8 * k)) & 0xffn));
      result.change.forEach((c, i) => {
        if (c === 'zeroed') expect(bytes[i]).toBe(0);
        if (c === 'kept') expect(bytes[i]).toBe(startBytes[i]);
      });
      expect(result.change.includes('zeroed')).toBe(w === 'mov eax, -1');
    }
  });
  it('writes chain from the current value', () => {
    let cpu = widthStart();
    cpu = applyWrite(cpu, 'mov eax, -1').cpu;
    const r = applyWrite(cpu, 'mov al, -1');
    expect(r.result.after).toBe(0xffffffffn);
  });
});

describe('numbers quoted in the quiz', () => {
  it('absdiff(-1, 1): 2 as long, 18446744073709551614 as unsigned long', () => {
    expect(cResult('absdiff', { cmov: false, unsignedTypes: false }, [-1n, 1n])).toBe(2n);
    const u = cResult('absdiff', { cmov: false, unsignedTypes: true }, [-1n, 1n]);
    expect(lesson.quiz[2].q).toContain(u.toString());
  });
  it('mov edx, 0 over 0x1122334455667788 leaves 0', () => {
    expect(lesson.quiz[3].q).toContain(hex(START_VALUE));
    const p = assemble([{ asm: 'mov edx, 0', offset: 0 }], 0, 5);
    const after = step(p, startCpu({ regs: { rdx: START_VALUE }, rip: 0, rsp: 0x8000 })).cpu;
    expect(after.regs.rdx).toBe(0n);
    expect(lesson.quiz[3].options[lesson.quiz[3].answer].startsWith(`${after.regs.rdx}:`)).toBe(true);
  });
});
