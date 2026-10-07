import { describe, expect, it } from 'vitest';
import { inferFrames } from './frames';
import {
  COERCIONS, COVERED_BY_TESTS, JS_CRASH, PRESETS, SNIPPET_JS, BUG_LINE, apply, canonical, collect, parseProgram, sameType, show, solve, type Program,
} from './model';

const program = (src: string): Program => {
  const r = parseProgram(src);
  if (!r.ok) throw new Error(r.error);
  return r.program;
};
const infer = (src: string) => solve(collect(program(src)));

describe('inference', () => {
  it.each(PRESETS.filter((p) => p.expect).map((p) => [p.label, p] as const))('%s gets its documented principal type, up to renaming', (_, p) => {
    const s = infer(p.src);
    expect(s.ok).toBe(true);
    if (s.ok) expect(canonical(s.type)).toBe(p.expect);
  });

  it('fn self f = f f fails the occurs check', () => {
    const s = infer('fn self f = f f');
    expect(s).toMatchObject({ ok: false, kind: 'occurs', conflict: [0] });
  });

  it('the if mismatch fails with exactly the two branch constraints', () => {
    const c = collect(program('if true then 1 else "a"'));
    const s = solve(c);
    expect(s).toMatchObject({ ok: false, kind: 'mismatch' });
    if (!s.ok) {
      expect(s.conflict).toHaveLength(2);
      expect(s.conflict.map((i) => c.constraints[i].why)).toEqual(['the then branch is the if’s result', 'the else branch is the if’s result too']);
    }
  });

  it('the final substitution makes both sides of every constraint equal (property, over many programs)', () => {
    const programs = [
      ...PRESETS.filter((p) => p.expect).map((p) => p.src),
      'fn k x y = x',
      'fn s f g x = f x (g x)',
      'fn flip f x y = f y x',
      'fn apply f x = f x',
      'fn pick b x y = if b then x else y',
      'fn add x y = x + y * 2',
      'fn both f = if f 1 then f 2 else false',
      'fn deep f g h x = f (g (h x)) + 1',
    ];
    for (const src of programs) {
      const c = collect(program(src));
      const s = solve(c);
      expect(s.ok, src).toBe(true);
      for (const k of c.constraints) expect(sameType(apply(s.subst, k.left), apply(s.subst, k.right)), src).toBe(true);
    }
  });

  it('known principal types for a few more programs', () => {
    const t = (src: string) => {
      const s = infer(src);
      return s.ok ? canonical(s.type) : s.message;
    };
    expect(t('fn k x y = x')).toBe('a → b → a');
    expect(t('fn flip f x y = f y x')).toBe('(a → b → c) → b → a → c');
    expect(t('fn pick b x y = if b then x else y')).toBe('bool → a → a → a');
    expect(t('1 + 2')).toBe('int');
    expect(t('fn bad x = x + true')).toBe('bool can\'t equal int.');
  });
});

describe('the program field', () => {
  it('refuses what the parser does not know, with a reason', () => {
    for (const bad of ['', '   ', 'fn = x', 'fn f x = y', 'fn f x x = x', '1e400', '-1', '😀', '<b>x</b>', '1,2,,3', '"open', 'x'.repeat(61), '12345678901234567890123'])
      expect(parseProgram(bad).ok, bad).toBe(false);
    expect(parseProgram('fn f x = y')).toEqual({ ok: false, error: "y isn't a parameter, and there are no other names in scope here." });
  });
});

describe('frames', () => {
  it('end on the inferred type or the error, for every preset', () => {
    for (const p of PRESETS) {
      const frames = inferFrames(program(p.src));
      const last = frames[frames.length - 1];
      if (p.expect) expect(last.result).toBe(p.expect);
      else expect(last.failed).toBe(true);
    }
  });
});

describe('the fixed outputs match the real thing', () => {
  it('the JavaScript coercion chips match real JavaScript', () => {
    // Fixed, lesson-authored strings, run as real JS in the test only.
    const run = (code: string) => JSON.stringify(new Function(`return (${code});`)());
    expect(run(COERCIONS[0].code)).toBe(COERCIONS[0].result);
    expect(run(COERCIONS[1].code)).toBe(COERCIONS[1].result);
  });

  it('the untyped snippet passes a non-admin test, skips the bug line, and crashes for an admin', () => {
    const shout = new Function(`${SNIPPET_JS.join('\n')}\nreturn shout;`)() as (u: object) => string;
    expect(shout({ isAdmin: false, id: 7, name: 'ada' })).toBe('ADA');
    expect(() => shout({ isAdmin: true, id: 7, name: 'ada' })).toThrow(JS_CRASH.replace('TypeError: ', ''));
    expect(COVERED_BY_TESTS).not.toContain(BUG_LINE);
  });

  it('shows types the usual way', () => {
    const s = infer('fn twice f x = f (f x)');
    if (s.ok) expect(show(s.type)).toMatch(/^\(.+ → .+\) → .+ → .+$/);
  });
});
