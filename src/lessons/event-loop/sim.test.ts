import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { buildFrames } from './frames';
import { SNIPPETS, simulate } from './sim';

/** A macrotask turn, so every 0 ms timer and every microtask before it has run. */
const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));
const TIMER_TURNS = 3;

/**
 * Run a snippet's on-screen code as real JavaScript and collect what it logs. The text is
 * the lesson's own fixed snippet (never learner input), run in a test only.
 */
async function realOrder(code: string[]): Promise<string[]> {
  const out: string[] = [];
  const fakeConsole = { log: (s: string) => out.push(s) };
  // Test-only, and safe: the text is the fixed, lesson-authored snippet, never learner input.
  new Function('console', code.join('\n'))(fakeConsole);
  for (let i = 0; i < TIMER_TURNS; i++) await nextTask();
  return out;
}

describe('the model prints what real JavaScript prints', () => {
  for (const snippet of SNIPPETS) {
    it(snippet.name, async () => {
      const modelled = simulate(snippet).at(-1)!.out;
      expect(modelled).toEqual(await realOrder(snippet.code));
    });
  }

  it('the known answers, for the record', async () => {
    const byId = Object.fromEntries(SNIPPETS.map((s) => [s.id, s]));
    expect(await realOrder(byId.classic.code)).toEqual(['A', 'D', 'C', 'B']);
    expect(await realOrder(byId.await.code)).toEqual(['0 script', '1 start', '2 script end', '3 after await']);
    expect(await realOrder(byId.nested.code)).toEqual(['sync', 'P1', 'P2', 'T1', 'P3', 'T2']);
    expect(await realOrder(byId.executor.code)).toEqual(['executor', 'end', 'then', 'timeout']);
  });
});

describe('the machine obeys the loop rules at every step', () => {
  it('a task only starts on an empty stack, microtasks drain before any macrotask, and output only grows', () => {
    for (const snippet of SNIPPETS) {
      const steps = simulate(snippet);
      steps.forEach((s, i) => {
        if (s.note.kind === 'run-macro') {
          expect(s.micro).toEqual([]);
          expect(s.stack).toEqual([s.note.label]);
        }
        if (s.note.kind === 'run-micro') expect(s.stack).toEqual([s.note.label]);
        if (i > 0) expect(s.out.slice(0, steps[i - 1].out.length)).toEqual(steps[i - 1].out);
      });
      const last = steps.at(-1)!;
      expect([last.stack, last.apis, last.macro, last.micro]).toEqual([[], [], [], []]);
    }
  });

  it('every frame has its own caption, and the closing one lists the real order', async () => {
    for (const snippet of SNIPPETS) {
      const frames = buildFrames(snippet);
      for (const f of frames) expect(text(f.say).length).toBeGreaterThan(0);
      expect(text(frames.at(-1)!.say)).toContain(`Output order: ${(await realOrder(snippet.code)).join(' → ')}.`);
    }
  });

  it('a "More are still waiting" caption only shows while microtasks really wait', () => {
    for (const snippet of SNIPPETS) {
      for (const f of buildFrames(snippet)) {
        if (f.note.kind === 'run-micro') expect(text(f.say).includes('More are still waiting')).toBe(f.micro.length > 0);
      }
    }
  });
});

describe('the quiz', () => {
  it('Q1 is the classic snippet, answered by real JavaScript', async () => {
    const { default: lesson } = await import('./index');
    const classic = SNIPPETS.find((s) => s.id === 'classic')!;
    const q = lesson.quiz[0];
    expect(q.options[q.answer]).toBe((await realOrder(classic.code)).join(' '));
  });
});
