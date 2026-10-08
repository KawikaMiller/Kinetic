import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { chainFrames, matchFrames, narrowCaption } from './frames';
import {
  ALL_ARMS, ALL_NULLS, FIX_CODE, FIX_MODES, GUARDS, Option, PARAM_TYPES, PRESETS, checkLength, checkMatch, evaluate, flagRows, joinedPatterns,
  assertCrashes, narrowSource, narrowed, rustMatchSource, tsMatchSource, userSource, type Arms, type Nulls,
} from './model';
import { emitJs, tscErrors } from './tscCheck';

/** Run a mode's fixed program as real JavaScript (V8), capturing console.log. Test-only. */
function runReal(lines: readonly string[], n: Nulls): { printed: string | null; error: string | null } {
  const logs: string[] = [];
  const src = emitJs([userSource(n), ...lines].join('\n'));
  try {
    // Safe: fixed, lesson-authored program text from FIX_CODE, never learner input.
    new Function('Option', 'console', src)(Option, { log: (s: string) => logs.push(s) });
    return { printed: logs[0] ?? null, error: null };
  } catch (e) {
    return { printed: null, error: `${(e as Error).name}: ${(e as Error).message}` };
  }
}

const label = (n: Nulls) => Object.entries(n).filter(([, v]) => v).map(([k]) => k).join('+') || 'none';

describe('scene 1: the null chain is real JavaScript', () => {
  it('every mode × every null combination prints or throws exactly what the model says (40 runs)', () => {
    for (const { value: mode } of FIX_MODES) {
      for (const n of ALL_NULLS) {
        const real = runReal(FIX_CODE[mode], n);
        const model = evaluate(mode, n);
        expect([mode, label(n), real.error, real.printed]).toEqual([mode, label(n), model.error, model.printed]);
      }
    }
  });

  it('plain dots throw with V8’s message naming the property read off the null', () => {
    expect(runReal(FIX_CODE.plain, { user: true, address: false, city: false }).error).toBe("TypeError: Cannot read properties of null (reading 'address')");
    expect(runReal(FIX_CODE.plain, { user: false, address: true, city: false }).error).toBe("TypeError: Cannot read properties of null (reading 'city')");
    expect(runReal(FIX_CODE.plain, { user: false, address: false, city: true }).error).toBe("TypeError: Cannot read properties of null (reading 'toUpperCase')");
  });

  it('?. with ?? gives "unknown"; ?. alone leaks undefined', () => {
    const n = { user: false, address: true, city: false };
    expect(runReal(FIX_CODE.optionalDefault, n).printed).toBe('Ship to unknown');
    expect(runReal(FIX_CODE.optional, n).printed).toBe('Ship to undefined');
  });

  it('the Option program type-checks under tsc --strict with the lesson’s Option', () => {
    const optionDecl = 'declare class Option<T> { static of<T>(v: T | null | undefined): Option<T>; map<U>(f: (v: T) => U | null | undefined): Option<U>; unwrapOr(d: T): T; }';
    const data = 'declare const user: { address: { city: string | null } | null } | null;';
    expect(tscErrors({ 'opt.ts': [optionDecl, data, ...FIX_CODE.option.slice(0, -1), 'export {};'].join('\n') })).toEqual([]);
  });

  it('frames: the crash frame is the last, and nothing after a null is read', () => {
    for (const { value: mode } of FIX_MODES) {
      for (const n of ALL_NULLS) {
        const frames = chainFrames(mode, n);
        const last = frames.at(-1)!;
        const model = evaluate(mode, n);
        expect(last.crashed).toBe(model.error !== null);
        if (!last.crashed) expect(last.printed).toBe(model.printed);
        const seen = new Set(frames.flatMap((f) => f.seen));
        for (const [link, state] of Object.entries(model.links)) if (state === 'skipped') expect(seen.has(link as never), `${mode} ${label(n)} ${link}`).toBe(false);
        // The final caption is true for the outcome.
        const say = captionText(last.say);
        if (model.error) expect(say).toContain(model.error);
        else expect(say).toContain(model.printed!);
        expect(last.silentBug).toBe(model.printed === 'Ship to undefined');
      }
    }
  });
});

describe('scene 2: the narrowing checker matches tsc --strict', () => {
  const combos = PARAM_TYPES.flatMap((p) => GUARDS.map((g) => [p.value, g.value] as const));

  it(`every parameter type × guard (${PARAM_TYPES.length * GUARDS.length} snippets)`, () => {
    const files = Object.fromEntries(combos.map(([p, g]) => [`n-${p}-${g}.ts`, `${narrowSource(p, g).lines.join('\n')}\nexport {};\n`]));
    const errors = tscErrors(files);
    for (const [p, g] of combos) {
      const mine = errors.filter((e) => e.file === `n-${p}-${g}.ts`);
      const verdict = checkLength(p, g);
      expect([p, g, mine.map((e) => `error TS${e.code}: ${e.message}`)]).toEqual([p, g, verdict.message ? [verdict.message] : []]);
      if (mine.length) expect(mine[0].line).toBe(narrowSource(p, g).useLine);
    }
  });

  it('the caption is true for every combination: verdict, message, and "ruled out" only when something was', () => {
    for (const [p, g] of combos) {
      const say = captionText(narrowCaption(p, g));
      const v = checkLength(p, g);
      if (v.unchecked) for (const c of assertCrashes(p)) expect(say).toContain(c.message);
      else if (v.ok) expect(say).toContain('tsc accepts it');
      else expect(say).toContain(v.message!);
      expect(say.includes('ruled the rest out')).toBe(v.ok && !v.unchecked && narrowed(p, g).length < PARAM_TYPES.find((t) => t.value === p)!.members.length);
    }
  });

  it('the assertion compiles but still crashes: each remaining value throws exactly the message shown, for every parameter type', () => {
    expect(checkLength('sn', 'assert')).toEqual({ ok: true, message: null, unchecked: true });
    expect(checkLength('s', 'assert').unchecked).toBe(false);
    for (const p of PARAM_TYPES) {
      const crashes = assertCrashes(p.value);
      expect(crashes.map((c) => c.arg)).toEqual(p.members.filter((m) => m !== 'string'));
      for (const c of crashes) {
        // Safe: fixed, lesson-authored snippet.
        const js = emitJs(`${narrowSource(p.value, 'assert').lines.join('\n')}\nlen(${c.arg});`);
        let msg = '';
        try {
          new Function(js)();
        } catch (e) {
          msg = `${(e as Error).name}: ${(e as Error).message}`;
        }
        expect([p.value, c.arg, msg]).toEqual([p.value, c.arg, c.message]);
      }
    }
    // len(undefined) on a string | undefined is the real crash: it says "of undefined", not "of null".
    expect(assertCrashes('su')[0].message).toContain('of undefined');
  });
});

describe('scene 3: exhaustive matching', () => {
  it('rustc joins uncovered patterns its way', () => {
    expect(joinedPatterns(['A'])).toBe('`A`');
    expect(joinedPatterns(['A', 'B'])).toBe('`A` and `B`');
    expect(joinedPatterns(['A', 'B', 'C'])).toBe('`A`, `B` and `C`');
    expect(joinedPatterns(['A', 'B', 'C', 'D', 'E'])).toBe('`A`, `B`, `C` and 2 more');
  });

  it('Rust: hand-worked messages', () => {
    const fetch = PRESETS[0];
    expect(checkMatch('rust', fetch, [true, false, true], false).message).toBe('error[E0004]: non-exhaustive patterns: `State::Loaded(_)` not covered');
    expect(checkMatch('rust', fetch, [false, true, false], false).message).toBe('error[E0004]: non-exhaustive patterns: `State::Loading` and `State::Failed(_)` not covered');
    expect(checkMatch('rust', fetch, [false, false, false], false).message).toBe(
      'error[E0004]: non-exhaustive patterns: `State::Loading`, `State::Loaded(_)` and `State::Failed(_)` not covered',
    );
    expect(checkMatch('rust', fetch, [true, true, true], true).message).toBe('warning: unreachable pattern');
  });

  it('the missing-arm detector names exactly the uncovered variants, for all 2³ subsets', () => {
    for (const p of PRESETS) {
      for (const arms of ALL_ARMS) {
        const v = checkMatch('rust', p, arms, false);
        const expected = p.variants.filter((_, i) => !arms[i]);
        expect(v.ok).toBe(expected.length === 0);
        for (const x of p.variants) expect(v.message?.includes(`${p.type}::${x.name}`) ?? false).toBe(expected.includes(x));
      }
    }
  });

  it('TypeScript: every subset × catch-all compiles or fails exactly as tsc says (32 programs)', () => {
    const files: Record<string, string> = {};
    for (const p of PRESETS) for (const [k, arms] of ALL_ARMS.entries()) for (const c of [false, true]) files[`m-${p.id}-${k}-${c}.ts`] = `${tsMatchSource(p, arms, c).lines.join('\n')}\nexport {};\n`;
    const errors = tscErrors(files);
    for (const p of PRESETS) {
      for (const [k, arms] of ALL_ARMS.entries()) {
        for (const c of [false, true]) {
          const mine = errors.filter((e) => e.file === `m-${p.id}-${k}-${c}.ts`);
          const v = checkMatch('ts', p, arms, c);
          expect([p.id, arms, c, mine.map((e) => `error TS${e.code}: ${e.message}`)]).toEqual([p.id, arms, c, v.message ? [v.message] : []]);
          if (mine.length) expect(mine[0].line).toBe(tsMatchSource(p, arms, c).neverLine);
        }
      }
    }
  });

  it('the rendered outputs are what the TypeScript really prints', () => {
    for (const p of PRESETS) {
      const src = tsMatchSource(p, [true, true, true], false).lines.join('\n');
      const calls = p.variants.map((v) => `out.push(render(${v.sample.ts}));`).join('\n');
      const out: string[] = [];
      // Safe: fixed, lesson-authored program text.
      new Function('out', `${emitJs(src)}\n${calls}`)(out);
      expect(out).toEqual(p.variants.map((v) => v.sample.prints));
      // With the catch-all and no arms, everything prints the fallback.
      const fb: string[] = [];
      new Function('out', `${emitJs(tsMatchSource(p, [false, false, false], true).lines.join('\n'))}\n${calls}`)(fb);
      expect(fb).toEqual(['fallback', 'fallback', 'fallback']);
    }
  });

  it('the Rust source has one arm line per covered variant and a _ arm only with the catch-all', () => {
    for (const p of PRESETS) {
      for (const arms of ALL_ARMS) {
        for (const c of [false, true]) {
          const r = rustMatchSource(p, arms, c);
          expect(r.armLine.filter((x) => x !== null)).toHaveLength(arms.filter(Boolean).length);
          expect(r.defaultLine !== null).toBe(c);
        }
      }
    }
  });

  it('frames: every language × preset × subset × catch-all ends on a true caption (64 combinations)', () => {
    for (const lang of ['rust', 'ts'] as const) {
      for (const p of PRESETS) {
        for (const arms of ALL_ARMS) {
          for (const c of [false, true]) {
            const frames = matchFrames(lang, p, arms as Arms, c);
            const v = checkMatch(lang, p, arms, c);
            const say = captionText(frames.at(-1)!.say);
            if (!v.ok) {
              expect(say).toContain(lang === 'rust' ? 'Rust refuses to compile' : 'tsc reports an error');
              expect(say.includes('refuses to compile')).toBe(lang === 'rust');
              expect(say.includes('noEmitOnError')).toBe(lang === 'ts');
              expect(say).toContain(v.message!);
              expect(frames.at(-1)!.done).toEqual([]);
            } else {
              const done = frames.at(-1)!.done;
              expect(done.map((d) => d.byDefault)).toEqual(arms.map((a) => !a));
              expect(say).toContain(v.caughtByDefault.length ? 'catch-all' : c ? 'unreachable' : 'found its arm');
            }
          }
        }
      }
    }
  });
});

describe('scene 3: the boolean flags', () => {
  it('8 rows, 5 of them nonsense, 3 meaning exactly one variant each', () => {
    for (const p of PRESETS) {
      const rows = flagRows(p);
      expect(rows).toHaveLength(8);
      expect(rows.filter((r) => r.means === null)).toHaveLength(5);
      expect(rows.filter((r) => r.means).map((r) => r.means!.name).sort()).toEqual(p.variants.map((v) => v.name).sort());
    }
  });
});
