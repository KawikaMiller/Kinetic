import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { callFrames, clobbered } from './frames';
import lesson from './index';
import { ABI, REAL_STACK_BYTES, type SceneId, type SceneOptions } from './model';
import { stackPicture } from './stackLayout';
import { hex, signed } from './x86';

const COMBOS: [SceneId, SceneOptions][] = [
  ['calls', { framePointers: true, callerSavesRcx: false }],
  ['calls', { framePointers: false, callerSavesRcx: false }],
  ['seven', { framePointers: true, callerSavesRcx: false }],
  ['saved', { framePointers: true, callerSavesRcx: false }],
  ['saved', { framePointers: true, callerSavesRcx: true }],
  ['deep', { framePointers: true, callerSavesRcx: false }],
];

describe('every scene and option: captions true at every step', () => {
  for (const [scene, o] of COMBOS) {
    it(`${scene} ${JSON.stringify(o)}`, () => {
      const { run, frames } = callFrames(scene, o);
      const overflowed = run.steps.at(-1)!.overflow;
      expect(frames).toHaveLength(run.steps.length + (overflowed ? 0 : 1));
      for (let k = 1; k < run.steps.length; k++) {
        const s = run.steps[k];
        const before = run.steps[k - 1];
        const text = captionText(frames[k].say);
        const ins = s.effect!.instr;
        expect(text.startsWith(ins.text)).toBe(true);
        expect(text.includes('guard page')).toBe(s.overflow);
        if (s.overflow) {
          expect(text).toContain(`after ${s.calls.filter((c) => c.fn === 'depth').length} calls`);
          expect(text).toContain(Math.floor(REAL_STACK_BYTES / 16).toLocaleString('en-US'));
          continue;
        }
        if (ins.op === 'call') {
          const callee = s.calls.at(-1)!;
          callee.args.forEach((v, i) => expect(text).toContain(`${ABI.argRegs[i]} = ${signed(v)}`));
          expect(text.includes('a multiple of 16')).toBe(Number(before.cpu.regs.rsp) % 16 === 0);
          expect(text).toContain(`rsp was ${hex(Number(before.cpu.regs.rsp))}`);
          expect(text.includes('7th has no register')).toBe(callee.fn === 'sum7');
        }
        if (ins.op === 'ret') {
          expect(text).toContain(signed(s.cpu.regs.rax).toString());
          const lost = clobbered(run, k);
          expect(text.includes('came back changed')).toBe(lost.length > 0);
          for (const r of lost) expect(text).toContain(r);
        }
        // the picture can be drawn at every step
        expect(stackPicture(run, k).regions.length).toBeGreaterThan(0);
      }
      if (!overflowed) expect(captionText(frames.at(-1)!.say)).toContain(`main returned ${signed(run.steps.at(-1)!.cpu.regs.rax)}`);
    });
  }
  it('in the hand-written scene, rcx is reported clobbered exactly when main did not save it', () => {
    for (const callerSavesRcx of [false, true]) {
      const { run } = callFrames('saved', { framePointers: true, callerSavesRcx });
      const k = run.steps.findIndex((s, i) => i > 0 && s.effect?.instr.op === 'ret' && !s.cpu.halted);
      // helper's ret: rcx changed underneath main either way; with the save, main's pop puts it back next
      expect(clobbered(run, k)).toEqual(['rcx']);
      expect(run.steps[k + 1].cpu.regs.rcx).toBe(callerSavesRcx ? 100n : 2n);
    }
  });
});

describe('lesson text matches the model', () => {
  it('the frame-pointer tip: inside mul the rbp chain alone gives mul ← main', () => {
    expect(lesson.tryThis[0]).toContain('mul ← area ← main');
  });
});
