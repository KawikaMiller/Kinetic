import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { latencies, pipeFrames, stalledBefore } from './frames';
import lesson from './index';
import { firstCycle, parseProgram, pipeline, PRESETS, type PipelineOptions } from './model';

const OPTIONS: PipelineOptions[] = [
  { forwarding: false, memPorts: 2 },
  { forwarding: true, memPorts: 2 },
  { forwarding: false, memPorts: 1 },
  { forwarding: true, memPorts: 1 },
];

describe('every program × option × mode: captions true to the cycle they narrate', () => {
  for (const p of PRESETS) {
    for (const o of OPTIONS) {
      for (const pipelined of [true, false]) {
        it(`${p.id}, fwd ${o.forwarding}, ports ${o.memPorts}, ${pipelined ? 'pipelined' : 'one at a time'}`, () => {
          const program = parseProgram(p.lines);
          const { run, frames } = pipeFrames(program, p.start, o, pipelined, 'intro');
          expect(frames).toHaveLength(run.totalCycles + 2);
          expect(frames[0].cycle).toBe(0);
          frames.slice(1, -1).forEach((f, i) => {
            const c = i + 1;
            expect(f.cycle).toBe(c);
            const text = captionText(f.say);
            expect(text.startsWith(`Cycle ${c}.`)).toBe(true);
            if (!pipelined) return;
            const ev = run.result!.events[c - 1];
            expect(text.includes('flushed')).toBe(ev.some((e) => e.kind === 'flush'));
            expect(text.includes('waits in ID')).toBe(ev.some((e) => e.kind === 'data-stall'));
            expect(text.includes('No fetch this cycle')).toBe(ev.some((e) => e.kind === 'port-stall'));
            expect(text.includes('forwarded')).toBe(ev.some((e) => e.kind === 'forward'));
            for (const e of ev) {
              if (e.kind === 'data-stall') {
                expect(text).toContain(`r${e.reg}`);
                const producer = run.rows[e.producer];
                const when = e.load && o.forwarding ? firstCycle(producer, 'MEM') : firstCycle(producer, 'WB');
                expect(text).toContain(`cycle ${when}`);
                // and the stall is real: the instruction is still in ID next to it
                const k = run.rows[e.row].cells[c];
                expect(k).toEqual({ kind: 'stage', stage: 'ID', held: true });
              }
              if (e.kind === 'forward') expect(text.includes('wait any longer')).toBe(stalledBefore(run.rows[e.forward.toRow], c));
              if (e.kind === 'flush') expect(text).toContain(`${e.flushed.length === 1 ? '1 instruction' : `${e.flushed.length} instructions`} fetched behind it`);
            }
          });
          // the summary's numbers are the run's
          const last = captionText(frames[frames.length - 1].say);
          expect(last).toContain(`${run.totalCycles} cycles`);
          if (pipelined) {
            const r = run.result!;
            expect(last).toContain(`n + 4 + ${r.stalls.data + r.stalls.port} stall cycle`);
            expect(last).toContain(`${r.flushes} flush cycle`);
            expect(last).toContain(`not pipelined: ${run.unpipelinedCycles}`);
            const slowest = Math.max(...latencies(run));
            expect(last.includes(`the slowest took ${slowest}`)).toBe(slowest > 5);
            expect(Math.min(...latencies(run))).toBe(5);
          } else {
            expect(last).toContain(`× 5 cycles = ${run.totalCycles} cycles`);
          }
        });
      }
    }
  }
});

describe('forward captions', () => {
  it('load-use forward says the wait is over, not that there was none', () => {
    const p = PRESETS.find((x) => x.id === 'load')!;
    const { run, frames } = pipeFrames(parseProgram(p.lines), p.start, p.opts, true, 'intro');
    const f = run.result!.forwards[0];
    expect(captionText(frames[f.cycle].say)).toContain("so it doesn't wait any longer");
  });
});

describe('quiz numbers come from the model', () => {
  it('seven hazard-free instructions take 11 cycles; not pipelined, 35', () => {
    const lines = ['add r1, r4, r5', 'sub r2, r4, r5', 'and r3, r4, r5', 'or r1, r6, r7', 'add r2, r6, r7', 'sub r3, r6, r7', 'and r1, r4, r7'];
    const start = { regs: [0, 1, 2, 3, 4, 5, 6, 7], mem: {} };
    const r = pipeline(parseProgram(lines), start, { forwarding: true, memPorts: 2 });
    expect(r.totalCycles).toBe(11);
    expect(lesson.quiz[2].options[lesson.quiz[2].answer]).toBe(`${r.totalCycles} cycles`);
    expect(lesson.quiz[2].why).toContain(`${7 * 5}`);
  });
  it('the reorder tip: 13 cycles before, 11 after', () => {
    expect(lesson.tryThis[3]).toContain('from 13 to 11');
  });
});
