import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { boxFrames, stampFrames, varianceFrames } from './frames';
import {
  BOUNDED_FIXED, BOX_CODE, LANGS, OPS, TS_LATER_CRASH, VIEWS, compiledCopies, lang, maxOf, strategySentence, varianceLines, verdict,
  type Op, type TypeArg, type VerdictKind, type ViewId,
} from './model';
import { emitJs, tscErrors } from './tscCheck';

/** Run lesson-authored TypeScript as real JavaScript (types stripped by the compiler). Test-only. */
function runTs(src: string): { value: unknown; error: string | null } {
  try {
    // Safe: fixed, lesson-authored program text from BOX_CODE, never learner input.
    return { value: new Function(`${emitJs(src)}`)(), error: null };
  } catch (e) {
    return { value: undefined, error: `${(e as Error).name}: ${(e as Error).message}` };
  }
}

/** A snippet as a module of its own, so separate checks never share names. */
const asModule = (lines: readonly string[]) => `${lines.join('\n')}\nexport {};\n`;

describe('one language table drives every claim', () => {
  it('pins each language to its strategy', () => {
    const table = Object.fromEntries(LANGS.map((l) => [l.label, l.strategy]));
    expect(table).toEqual({ Java: 'erasure', TypeScript: 'erasure', 'C#': 'reified', Rust: 'monomorphised', 'C++': 'monomorphised' });
    expect(LANGS.filter((l) => l.strategy === 'reified').map((l) => l.label)).toEqual(['C#']);
  });

  it('generates every caption sentence from the table', () => {
    for (const l of LANGS) {
      const s = strategySentence(l);
      expect(s.startsWith(l.label)).toBe(true);
      expect(s).toContain({ erasure: 'erases', reified: 'reified', monomorphised: 'monomorphises' }[l.strategy]);
    }
    const close = captionText(stampFrames(lang('rust'), ['int']).at(-1)!.say);
    expect(close).toContain('Erased: Java, TypeScript. Reified: C#. Monomorphised: Rust, C++.');
  });

  it('TypeScript really erases type arguments when it emits JavaScript', () => {
    const js = emitJs("class Box<T> { constructor(public v: T) {} }\nconst b = new Box<string>('a');");
    expect(js).toContain("new Box('a')");
    expect(js).not.toContain('<string>');
    const tsDemo = lang('ts').demo[0];
    expect(tsDemo.result).toContain("const b = new Box('a');");
  });
});

describe('instantiation counting', () => {
  /** Every sequence of uses up to length 4 over the three type arguments. */
  function* sequences(len: number): Generator<TypeArg[]> {
    if (len === 0) return yield [];
    for (const rest of sequences(len - 1)) for (const a of ['int', 'string', 'point'] as const) yield [...rest, a];
  }
  const all = [0, 1, 2, 3, 4].flatMap((n) => [...sequences(n)]);

  it('monomorphised copies equal the number of distinct type arguments, for all 121 use lists', () => {
    expect(all).toHaveLength(1 + 3 + 9 + 27 + 81);
    for (const uses of all) {
      const distinct = uses.filter((a, i) => uses.indexOf(a) === i).length;
      expect(compiledCopies('monomorphised', uses)).toBe(distinct);
      expect(compiledCopies('erasure', uses)).toBe(uses.length ? 1 : 0);
      expect(compiledCopies('reified', uses)).toBe(uses.length ? 1 : 0);
    }
  });

  it("the stamping frames end on the model's count and size", () => {
    const uses: TypeArg[] = ['int', 'string', 'int', 'point'];
    const end = stampFrames(lang('rust'), uses).at(-1)!;
    expect(end.copies).toBe(3);
    expect(end.stamped).toEqual(['int', 'string', 'point']);
    expect(stampFrames(lang('java'), uses).at(-1)!.copies).toBe(1);
    // The repeat says "reused", never "new copy".
    const repeat = captionText(stampFrames(lang('rust'), uses)[3].say);
    expect(repeat).toContain('already exists');
  });
});

describe('scene 1: the box versions', () => {
  it('untyped: tsc accepts it, and real JavaScript throws exactly the message shown', () => {
    const code = BOX_CODE.untyped;
    expect(tscErrors({ 'untyped.ts': asModule(code.lines) })).toEqual([]);
    expect(runTs(code.lines.join('\n')).error).toBe(code.message);
  });

  it('one class per type: checked and runs, and the duplicate lines really are copies', () => {
    const code = BOX_CODE.perType;
    expect(tscErrors({ 'per.ts': asModule(code.lines) })).toEqual([]);
    const normalise = (s: string) => s.replace(/Number|String|number|string/g, 'X');
    for (const i of code.duplicate) expect(normalise(code.lines[i])).toBe(normalise(code.lines[i - 4]));
    expect(runTs(`${code.lines.slice(0, 8).join('\n')}\nreturn ${code.lines[8]}`).value).toBe('ADA');
  });

  it('Box<T>: tsc rejects exactly the line shown, with the message shown', () => {
    const code = BOX_CODE.generic;
    const errors = tscErrors({ 'gen.ts': asModule(code.lines) });
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(code.failLine);
    expect(`error TS${errors[0].code}: ${errors[0].message}`).toBe(code.message);
    // Without the rejected line it runs and prints what the console shows.
    const ok = code.lines.filter((_, i) => i !== code.failLine);
    expect(runTs(`${ok.slice(0, 4).join('\n')}\nreturn ${ok[4]}`).value).toBe('ADA');
    expect(code.output).toEqual(['"ADA"']);
  });

  it('bounded max returns what the console shows (Java compareTo order = JS order for these)', () => {
    expect(maxOf(3, 7)).toBe(7);
    expect(maxOf('pear', 'apple')).toBe('pear');
    expect(BOUNDED_FIXED.output).toEqual([String(maxOf(3, 7)), `"${maxOf('pear', 'apple')}"`]);
  });

  it('every version and bound gives frames whose last caption is about its outcome', () => {
    expect(captionText(boxFrames('untyped', false).at(-1)!.say)).toContain(BOX_CODE.untyped.message!);
    expect(boxFrames('untyped', false).at(-1)!.failed).toBe(true);
    expect(boxFrames('generic', false)[1].failed).toBe(true);
    expect(boxFrames('generic', false).at(-1)!.failed).toBe(false);
    expect(captionText(boxFrames('bounded', false).at(-1)!.say)).toContain('rejects');
    expect(captionText(boxFrames('bounded', true).at(-1)!.say)).toContain('gives 7');
    // The bound toggle only changes the bounded version.
    for (const v of ['untyped', 'perType', 'generic'] as const) expect(boxFrames(v, true).length).toBe(boxFrames(v, false).length);
  });
});

describe('scene 3: variance verdicts', () => {
  /** Hand-worked from the Java and TypeScript rules (JLS 4.10, 10.5; TS handbook on variance). */
  const EXPECTED: Record<ViewId, Record<Op, VerdictKind>> = {
    invariant: { read: 'compile', addDog: 'compile', addCat: 'compile' },
    extends: { read: 'ok', addDog: 'compile', addCat: 'compile' },
    super: { read: 'compile', addDog: 'compile', addCat: 'ok' },
    javaArray: { read: 'ok', addDog: 'runtime', addCat: 'ok' },
    tsArray: { read: 'ok', addDog: 'unsound', addCat: 'ok' },
  };

  it('every (view × operation) pair, all 15', () => {
    for (const v of VIEWS) for (const o of OPS) expect([v.id, o.id, verdict(v.id, o.id).kind]).toEqual([v.id, o.id, EXPECTED[v.id][o.id]]);
  });

  it('only the invariant view is rejected at the declaration, and every rejected operation says why', () => {
    for (const v of VIEWS) {
      for (const o of OPS) {
        const ver = verdict(v.id, o.id);
        expect(ver.at === 'declare').toBe(v.id === 'invariant');
        if (ver.kind === 'compile' && ver.at === 'op') expect(ver.reason, `${v.id} ${o.id}`).toBeTruthy();
      }
    }
  });

  it('TypeScript rows are what real tsc says: every one compiles, the Dog push included', () => {
    const prelude = [
      'class Animal { name = "a"; }',
      'class Cat extends Animal { meow() { return "meow"; } }',
      'class Dog extends Animal { bark() { return "woof"; } }',
      'const cats: Cat[] = [new Cat()];',
    ];
    for (const o of OPS) {
      expect(tscErrors({ [`ts-${o.id}.ts`]: asModule([...prelude, ...varianceLines('tsArray', o.id)]) })).toEqual([]);
    }
  });

  it('…and running the Dog push as real JavaScript corrupts the list, crashing later', () => {
    const src = [
      'class Animal {}',
      'class Cat extends Animal { meow() { return "meow"; } }',
      'class Dog extends Animal {}',
      'const cats = [new Cat()];',
      ...varianceLines('tsArray', 'addDog').map((l) => l.replace(': Animal[]', '')),
      'cats[1].meow();',
    ].join('\n');
    expect(runTs(src).error).toBe(TS_LATER_CRASH);
  });

  it('frames: the verdict appears only on the last frame, and the last caption names it', () => {
    const words: Record<VerdictKind, string> = { ok: 'Safe', compile: 'Rejected at compile time', runtime: 'throws at run time', unsound: 'Compiles and runs with no error' };
    for (const v of VIEWS) {
      for (const o of OPS) {
        const frames = varianceFrames(v.id, o.id);
        expect(frames.at(-1)!.judged).toBe(true);
        expect(frames.slice(0, -1).every((f) => !f.judged)).toBe(true);
        expect(captionText(frames.at(-1)!.say)).toContain(words[verdict(v.id, o.id).kind]);
      }
    }
  });
});
