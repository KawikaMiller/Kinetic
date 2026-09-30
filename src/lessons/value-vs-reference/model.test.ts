import { describe, expect, it } from 'vitest';
import { PRESETS } from './frames';
import { alloc, bindingsSeeing, declare, emptyMem, evaluate, prim, setField, strictEquals, unreachable } from './model';

/** Run a snippet as real JavaScript, capturing console.log output and a thrown error. */
function runReal(code: string[]) {
  const out: string[] = [];
  let error: string | null = null;
  const fakeConsole = { log: (...args: unknown[]) => out.push(args.map(String).join(' ')) };
  try {
    new Function('console', code.join('\n'))(fakeConsole);
  } catch (e) {
    error = `${(e as Error).name}: ${(e as Error).message}`;
  }
  return { out, error };
}

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;
const lastMem = (id: string) => preset(id).build().at(-1)!.mem;

describe('every preset matches what real JavaScript prints', () => {
  for (const p of PRESETS) {
    it(p.name, () => {
      const real = runReal(p.code);
      const final = p.build().at(-1)!.mem;
      expect(final.out).toEqual(real.out);
      expect(final.error).toBe(real.error);
    });
  }
});

describe('the model itself', () => {
  it('copies primitives by value', () => {
    let m = declare(emptyMem(), 'a', prim(5));
    m = declare(m, 'b', evaluate(m, 'a'));
    expect(evaluate(m, 'b')).toEqual(prim(5));
  });

  it('flags every name that reaches a mutated object, and only those', () => {
    const [m1, obj] = alloc(emptyMem(), { id: 'o', label: '{}', fields: [['n', prim(1)]] });
    let m = declare(declare(m1, 'a', obj), 'b', obj);
    m = declare(m, 'c', prim(1));
    m = setField(m, 'b', 'n', prim(2));
    expect(bindingsSeeing(m, 'o').sort()).toEqual(['global:a', 'global:b']);
    expect(evaluate(m, 'a.n')).toEqual(prim(2));
  });

  it('shallow copies share nested objects, deep copies do not', () => {
    const final = lastMem('copy');
    expect(bindingsSeeing(final, 'tags').sort()).toEqual(['global:a', 'global:s']);
    expect(strictEquals(final, 'a.tags', 's.tags')).toBe(true);
    expect(strictEquals(final, 'a.tags', 'd.tags')).toBe(false);
  });

  it('a reassigned parameter leaves garbage once the function returns', () => {
    const frames = preset('function').build();
    const whileInside = frames.find((f) => f.mem.scopes.some((s) => s.id === 'reassign' && s.alive) && f.mem.heap.some((o) => o.id === 'o2'))!;
    expect(unreachable(whileInside.mem).has('o2')).toBe(false);
    expect(unreachable(frames.at(-1)!.mem).has('o2')).toBe(true);
    expect(unreachable(frames.at(-1)!.mem).has('o1')).toBe(false);
  });

  it('const blocks rebinding but not mutation', () => {
    const final = lastMem('const');
    expect(evaluate(final, 'user.n')).toEqual(prim(2));
    expect(final.error).toMatch(/^TypeError/);
  });

  it('=== compares objects by identity', () => {
    const final = lastMem('equality');
    expect(strictEquals(final, 'x', 'y')).toBe(false);
    expect(strictEquals(final, 'x', 'z')).toBe(true);
  });

  it('every frame points at a real line of its preset', () => {
    for (const p of PRESETS) {
      for (const f of p.build()) {
        if (f.line !== null) expect(f.line).toBeLessThan(p.code.length);
      }
    }
  });
});
