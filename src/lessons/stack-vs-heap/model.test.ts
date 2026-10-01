import { describe, expect, it } from 'vitest';
import { PRESETS, STACK_LIMIT } from './frames';
import { collectable, ghostFrames, isDangling, leaked, liveFrames } from './model';

const framesOf = (id: string) => PRESETS.find((p) => p.id === id)!.build();

describe('managed: an object lives while something can reach it', () => {
  const frames = framesOf('outlive');

  it('survives its creating frame and becomes collectable only when main returns', () => {
    const afterMakePoint = frames.findIndex((f) => f.world.stack.some((s) => s.id === 'mk' && s.popped));
    const afterMain = frames.findIndex((f) => f.world.stack.some((s) => s.id === 'main' && s.popped));
    expect(afterMakePoint).toBeGreaterThan(0);
    expect(afterMain).toBeGreaterThan(afterMakePoint);
    frames.slice(0, afterMain).forEach((f) => expect(collectable(f.world).has('pt')).toBe(false));
    expect(collectable(frames[afterMain].world).has('pt')).toBe(true);
  });
});

describe('stack overflow', () => {
  it('pushes one frame per call up to the limit, then crashes', () => {
    const frames = framesOf('overflow');
    const depths = frames.map((f) => liveFrames(f.world).length);
    expect(Math.max(...depths)).toBe(STACK_LIMIT);
    const last = frames.at(-1)!.world;
    expect(last.crashed).toBe(true);
    expect(last.error).toMatch(/^RangeError: Maximum call stack size exceeded/);
  });

  it('is what real JavaScript does with that code', () => {
    const code = PRESETS.find((p) => p.id === 'overflow')!.code.join('\n');
    let error: unknown;
    try {
      new Function(code)();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).toBe('Maximum call stack size exceeded');
  });
});

describe('manual memory', () => {
  it('malloc then free then NULL: no leak, no dangling pointer at the end', () => {
    const frames = framesOf('malloc');
    const last = frames.at(-1)!.world;
    expect(leaked(last).size).toBe(0);
    expect(last.heap.every((b) => b.freed)).toBe(true);
    const freedAt = frames.findIndex((f) => f.world.heap[0]?.freed);
    expect(isDangling(frames[freedAt].world, 'main', 'p')).toBe(true);
    expect(isDangling(frames[freedAt + 1].world, 'main', 'p')).toBe(false);
  });

  it('a pointer to a local dangles exactly when the frame pops', () => {
    const frames = framesOf('dangling');
    const popped = frames.findIndex((f) => f.world.stack.some((s) => s.id === 'bad' && s.popped));
    frames.slice(0, popped).forEach((f) => {
      if (f.world.stack.some((s) => s.id === 'main')) expect(isDangling(f.world, 'main', 'p')).toBe(false);
    });
    expect(isDangling(frames[popped].world, 'main', 'p')).toBe(true);
    expect(ghostFrames(frames[popped].world).has('bad')).toBe(true);
    expect(frames.at(-1)!.world.error).toMatch(/^dangling pointer/);
  });

  it('use-after-free is flagged on the write after free, not before', () => {
    const p = PRESETS.find((x) => x.id === 'uaf')!;
    const frames = p.build();
    const first = frames.findIndex((f) => f.world.error);
    // The bad write is the only step that errors; the summary frame after it shows the same world.
    const errorFrames = frames.slice(first, -1);
    expect(errorFrames).toHaveLength(1);
    expect(errorFrames[0].line).toBe(p.code.indexOf('  *p = 8;'));
    expect(errorFrames[0].world.error).toMatch(/^use-after-free/);
    // C doesn't block the write: it lands in the freed block, which is exactly the danger.
    expect(errorFrames[0].world.heap[0]).toMatchObject({ freed: true, fields: [{ name: 'value', text: '8' }] });
  });

  it('a forgotten free leaks one block per call', () => {
    const frames = framesOf('leak');
    const leakCounts = frames.map((f) => leaked(f.world).size);
    expect(Math.max(...leakCounts)).toBe(3);
    // The count only ever goes up, one at a time, as each work() returns.
    leakCounts.slice(1).forEach((n, i) => expect(n - leakCounts[i]).toBeGreaterThanOrEqual(0));
    leakCounts.slice(1).forEach((n, i) => expect(n - leakCounts[i]).toBeLessThanOrEqual(1));
    expect(leakCounts.at(-1)).toBe(3);
  });

  it('manual mode never calls anything collectable, managed mode never leaks', () => {
    for (const p of PRESETS) {
      for (const f of p.build()) {
        if (p.mode === 'manual') expect(collectable(f.world).size).toBe(0);
        else expect(leaked(f.world).size).toBe(0);
      }
    }
  });
});

it('every frame points at a real line of its preset', () => {
  for (const p of PRESETS) for (const f of p.build()) if (f.line !== null) expect(f.line).toBeLessThan(p.code.length);
});

describe('every program ends on its own summary frame', () => {
  for (const p of PRESETS) {
    it(`${p.name}: the last step keeps its caption and the summary follows it`, () => {
      const frames = p.build();
      const [step, summary] = frames.slice(-2);
      expect(summary.world).toBe(step.world);
      expect(summary.line).toBe(step.line);
      expect(step.say).toBeTruthy();
      expect(summary.say).not.toBe(step.say);
      expect(summary.hold).toBe(2);
    });
  }
});
