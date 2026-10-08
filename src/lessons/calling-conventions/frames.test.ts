import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { callFrames, clobbered } from './frames';
import lesson from './index';
import { ABI, alignLabel, REAL_STACK_BYTES, runScene, type SceneId, type SceneOptions } from './model';
import { frameTones, stackPicture, whyNoFrame } from './stackLayout';
import { hex, signed } from '../../core/x86';

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
        expect(alignLabel(Number(s.cpu.regs.rsp))).toBe(Number(s.cpu.regs.rsp) % 16 === 0 ? '16-byte aligned' : '8 off (normal right after a call)');
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

describe('frame colours and the backtrace reason', () => {
  it('main is sky, every callee amber, recursion alternates amber and grey', () => {
    expect(frameTones(['main', 'area', 'mul'])).toEqual(['sky', 'amber', 'amber']);
    expect(frameTones(['main', 'sum7'])).toEqual(['sky', 'amber']);
    expect(frameTones(['main', 'helper'])).toEqual(['sky', 'amber']);
    expect(frameTones(['main', 'depth', 'depth', 'depth', 'depth'])).toEqual(['sky', 'amber', 'muted', 'amber', 'muted']);
  });
  it('inside mul the reason names this -O1 build; in area mid-prologue it says so', () => {
    const run = runScene('calls', { framePointers: true, callerSavesRcx: false });
    const inMul = run.steps.find((s) => s.calls.at(-1)?.fn === 'mul')!;
    expect(whyNoFrame(run, inMul.cpu.rip)).toBe('mul, a leaf, sets no frame up in this -O1 build');
    const areaEntry = run.steps.find((s) => s.calls.at(-1)?.fn === 'area')!;
    expect(whyNoFrame(run, areaEntry.cpu.rip)).toBe("area's prologue or epilogue is half done");
  });
});

describe('lesson text matches the model', () => {
  it('the backtrace tip quotes the full unwind, mul ← area ← main', () => {
    expect(lesson.tryThis[0]).toContain('mul ← area ← main');
  });
});
