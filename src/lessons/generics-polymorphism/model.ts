/**
 * generics-polymorphism: the pure model. Every language claim the stage makes comes from
 * LANGS (one table, pinned by a test), every compiled-copy count from `compiledCopies`, and
 * every variance verdict from `verdict`. Non-JavaScript outputs are fixed, lesson-authored
 * results of the real tools (javac 21, rustc, .NET, g++), shown, never run.
 */

// ── Scene 1 · Why generics ─────────────────────────────────────────

export type BoxVersion = 'untyped' | 'perType' | 'generic' | 'bounded';

export interface BoxCode {
  label: string;
  /** Which language the snippet is in (the panel title says so). */
  lang: 'TypeScript' | 'Java';
  lines: string[];
  /** Lines that are copies of another class's lines (highlighted in the one-class-per-type version). */
  duplicate: number[];
  /** The line the compiler rejects, or the line that throws at run time. */
  failLine: number | null;
  /** When it fails: the compiler, before running, or the runtime. */
  failsAt: 'compile' | 'runtime' | null;
  /** The message, verbatim from the real tool (tsc 6, V8, javac 21). */
  message: string | null;
  /** Lines that ran and were checked safe, with what they printed. */
  output: string[];
}

export const BOX_CODE: Record<BoxVersion, BoxCode> = {
  untyped: {
    label: 'Untyped (any)',
    lang: 'TypeScript',
    lines: [
      'class Box {',
      '  constructor(private value: any) {}',
      '  get(): any { return this.value; }',
      '}',
      'const box = new Box(42);           // a number goes in',
      'const name = box.get() as string;  // a cast is a promise, not a check',
      'name.toUpperCase();',
    ],
    duplicate: [],
    failLine: 6,
    failsAt: 'runtime',
    message: 'TypeError: name.toUpperCase is not a function',
    output: [],
  },
  perType: {
    label: 'One class per type',
    lang: 'TypeScript',
    lines: [
      'class NumberBox {',
      '  constructor(private value: number) {}',
      '  get(): number { return this.value; }',
      '}',
      'class StringBox {',
      '  constructor(private value: string) {}',
      '  get(): string { return this.value; }',
      '}',
      "new StringBox('ada').get().toUpperCase();",
    ],
    duplicate: [4, 5, 6, 7],
    failLine: null,
    failsAt: null,
    message: null,
    output: ['"ADA"'],
  },
  generic: {
    label: 'Box<T>',
    lang: 'TypeScript',
    lines: [
      'class Box<T> {',
      '  constructor(private value: T) {}',
      '  get(): T { return this.value; }',
      '}',
      "new Box<string>('ada').get().toUpperCase();",
      'new Box<string>(42);',
    ],
    duplicate: [],
    failLine: 5,
    failsAt: 'compile',
    message: "error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
    output: ['"ADA"'],
  },
  bounded: {
    label: 'Bounded <T extends …>',
    lang: 'Java',
    lines: [
      'static <T> T max(T a, T b) {',
      '  return a.compareTo(b) >= 0 ? a : b;',
      '}',
    ],
    duplicate: [],
    failLine: 1,
    failsAt: 'compile',
    message: 'error: cannot find symbol\n  symbol:   method compareTo(T)\n  location: variable a of type T',
    output: [],
  },
};

/** The bounded version with the bound added: compareTo is now known to exist. */
export const BOUNDED_FIXED: BoxCode = {
  ...BOX_CODE.bounded,
  label: 'Bounded <T extends Comparable<T>>',
  lines: [
    'static <T extends Comparable<T>> T max(T a, T b) {',
    '  return a.compareTo(b) >= 0 ? a : b;',
    '}',
    'max(3, 7);',
    'max("pear", "apple");',
  ],
  failLine: null,
  failsAt: null,
  message: null,
  output: ['7', '"pear"'],
};

export const boxCode = (v: BoxVersion, bound: boolean): BoxCode => (v === 'bounded' && bound ? BOUNDED_FIXED : BOX_CODE[v]);

/** What a generic `max` with a bound returns, the same rule compareTo gives in Java. */
export function maxOf<T extends number | string>(a: T, b: T): T {
  return a >= b ? a : b;
}

// ── Scene 2 · Erasure, reification, monomorphisation ───────────────

export type LangId = 'java' | 'ts' | 'csharp' | 'rust' | 'cpp';
export type Strategy = 'erasure' | 'reified' | 'monomorphised';
export type TypeArg = 'int' | 'string' | 'point';

export interface Lang {
  id: LangId;
  label: string;
  strategy: Strategy;
  /** Are the type arguments still there while the program runs? */
  argsAtRuntime: boolean;
  /** How the generic list type is spelled, with `{}` for the argument. */
  spell: string;
  /** The language's name for each type argument. */
  args: Record<TypeArg, string>;
  /** A fixed, real demo: what you'd type and what the real tool says. */
  demo: { code: string; result: string; tone: 'ok' | 'orange' }[];
}

export const LANGS: Lang[] = [
  {
    id: 'java',
    label: 'Java',
    strategy: 'erasure',
    argsAtRuntime: false,
    spell: 'ArrayList<{}>',
    args: { int: 'Integer', string: 'String', point: 'Point' },
    demo: [
      { code: 'new ArrayList<String>().getClass() == new ArrayList<Integer>().getClass()', result: 'true', tone: 'ok' },
      { code: 'T item = new T();', result: 'error: unexpected type\n  required: class\n  found:    type parameter T', tone: 'orange' },
      { code: 'if (o instanceof List<String>) …', result: 'error: Object cannot be safely cast to List<String>', tone: 'orange' },
    ],
  },
  {
    id: 'ts',
    label: 'TypeScript',
    strategy: 'erasure',
    argsAtRuntime: false,
    spell: 'Array<{}>',
    args: { int: 'number', string: 'string', point: 'Point' },
    demo: [
      { code: "const b = new Box<string>('a');", result: "emitted JavaScript: const b = new Box('a');", tone: 'ok' },
      { code: 'typeof b', result: '"object" (no trace of string)', tone: 'ok' },
    ],
  },
  {
    id: 'csharp',
    label: 'C#',
    strategy: 'reified',
    argsAtRuntime: true,
    spell: 'List<{}>',
    args: { int: 'int', string: 'string', point: 'Point' },
    demo: [
      { code: 'typeof(List<int>) == typeof(List<string>)', result: 'False', tone: 'ok' },
      { code: 'Console.WriteLine(typeof(List<string>));', result: 'System.Collections.Generic.List`1[System.String]', tone: 'ok' },
      { code: 'T Make<T>() where T : new() => new T();', result: 'compiles: the runtime knows what T is', tone: 'ok' },
    ],
  },
  {
    id: 'rust',
    label: 'Rust',
    strategy: 'monomorphised',
    argsAtRuntime: false,
    spell: 'Vec<{}>',
    args: { int: 'i32', string: 'String', point: 'Point' },
    demo: [
      { code: 'std::any::type_name::<Vec<i32>>()', result: '"alloc::vec::Vec<i32>"', tone: 'ok' },
      { code: 'std::any::type_name::<Vec<String>>()', result: '"alloc::vec::Vec<alloc::string::String>"', tone: 'ok' },
    ],
  },
  {
    id: 'cpp',
    label: 'C++',
    strategy: 'monomorphised',
    argsAtRuntime: false,
    spell: 'std::vector<{}>',
    args: { int: 'int', string: 'std::string', point: 'Point' },
    demo: [
      { code: 'std::is_same_v<std::vector<int>, std::vector<std::string>>', result: 'false', tone: 'ok' },
    ],
  },
];

export const lang = (id: LangId) => LANGS.find((l) => l.id === id)!;
export const spellType = (l: Lang, arg: TypeArg) => l.spell.replace('{}', l.args[arg]);
/** The bare generic definition, e.g. `ArrayList<T>`. */
export const spellTemplate = (l: Lang) => l.spell.replace('{}', 'T');

/** The source line for the i-th use of the generic list, in the language's own syntax. */
export function sourceLineFor(l: Lang, arg: TypeArg, i: number): string {
  const t = spellType(l, arg);
  const name = `xs${i + 1}`;
  switch (l.id) {
    case 'java':
      return `${t} ${name} = new ArrayList<>();`;
    case 'ts':
      return `const ${name}: ${t} = [];`;
    case 'csharp':
      return `var ${name} = new ${t}();`;
    case 'rust':
      return `let ${name}: ${t} = Vec::new();`;
    case 'cpp':
      return `${t} ${name};`;
  }
}

/** Most uses the scene lets you add (the size bar's full scale). */
export const MAX_USES = 6;
export const DEFAULT_USES: TypeArg[] = ['int', 'string', 'point', 'int'];

/** Distinct type arguments, in first-use order. */
export const distinctArgs = (uses: readonly TypeArg[]) => [...new Set(uses)];

/**
 * Copies of the list's code the compiler emits. Erasure and .NET's reification compile the
 * generic definition once; monomorphisation stamps out one copy per distinct type argument.
 */
export function compiledCopies(strategy: Strategy, uses: readonly TypeArg[]): number {
  if (uses.length === 0) return 0;
  return strategy === 'monomorphised' ? distinctArgs(uses).length : 1;
}

/** Illustrative code size of one stamped-out copy, in KB. Not a measurement. */
export const ILLUSTRATIVE_COPY_KB = 6;

/** One sentence per strategy, written from the table so a caption can't drift from it. */
export function strategySentence(l: Lang): string {
  switch (l.strategy) {
    case 'erasure':
      return `${l.label} erases type arguments: one compiled ${spellTemplate(l).replace('<T>', '')} serves every ${spellTemplate(l)}, and at run time nobody can tell ${spellType(l, 'string')} from ${spellType(l, 'int')}.`;
    case 'reified':
      return `${l.label} keeps type arguments at run time (reified): ${spellType(l, 'int')} and ${spellType(l, 'string')} are different types the program can ask about.`;
    case 'monomorphised':
      return `${l.label} monomorphises: the compiler stamps out a separate copy of the code for each distinct type argument, specialised and fast, but every copy adds to the binary and the compile time.`;
  }
}

/** Languages by strategy, from the table (the captions list these). */
export const byStrategy = (s: Strategy) => LANGS.filter((l) => l.strategy === s).map((l) => l.label);

// ── Scene 3 · Variance ─────────────────────────────────────────────

export type ViewId = 'invariant' | 'extends' | 'super' | 'javaArray' | 'tsArray';
export type Op = 'read' | 'addDog' | 'addCat';

/** How a view of the list of cats is declared, and what that view promises. */
export interface View {
  id: ViewId;
  label: string;
  lang: 'Java' | 'TypeScript';
  /** The declaration that aliases the list of cats. */
  declare: string;
  /** covariant: reads give Animal; contravariant: writes take Cat; invariant: exactly one type. */
  variance: 'invariant' | 'covariant' | 'contravariant';
  /** Does the compiler accept a Cat list as this type at all? */
  acceptsCats: boolean;
  /** Writes through a covariant view are checked: statically (wildcard), at run time (Java arrays), or not at all (TS). */
  writeCheck: 'static' | 'runtime' | 'none';
}

export const VIEWS: View[] = [
  { id: 'invariant', label: 'List<Animal>', lang: 'Java', declare: 'List<Animal> animals = cats;', variance: 'invariant', acceptsCats: false, writeCheck: 'static' },
  { id: 'extends', label: 'List<? extends Animal>', lang: 'Java', declare: 'List<? extends Animal> animals = cats;', variance: 'covariant', acceptsCats: true, writeCheck: 'static' },
  { id: 'super', label: 'List<? super Cat>', lang: 'Java', declare: 'List<? super Cat> sink = cats;', variance: 'contravariant', acceptsCats: true, writeCheck: 'static' },
  { id: 'javaArray', label: 'Animal[] (Java)', lang: 'Java', declare: 'Animal[] animals = cats;', variance: 'covariant', acceptsCats: true, writeCheck: 'runtime' },
  { id: 'tsArray', label: 'Animal[] (TypeScript)', lang: 'TypeScript', declare: 'const animals: Animal[] = cats;', variance: 'covariant', acceptsCats: true, writeCheck: 'none' },
];

export const OPS: { id: Op; label: string }[] = [
  { id: 'read', label: 'read an Animal' },
  { id: 'addDog', label: 'write a Dog' },
  { id: 'addCat', label: 'write a Cat' },
];

export const view = (id: ViewId) => VIEWS.find((v) => v.id === id)!;

/**
 * - ok: compiles and runs safely
 * - compile: rejected by the compiler (the earlier, cheaper failure)
 * - runtime: compiles, then throws when it runs
 * - unsound: compiles AND runs, silently putting a Dog in the list of cats
 */
export type VerdictKind = 'ok' | 'compile' | 'runtime' | 'unsound';

export interface Verdict {
  kind: VerdictKind;
  /** Which line of the snippet the verdict is about: the declaration or the operation. */
  at: 'declare' | 'op';
  message: string;
  /** For a compile-time rejection: why the declared type can't promise it is safe. */
  reason?: string;
}

/** What real JavaScript throws when the corrupted list is used as cats (asserted in the tests). */
export const TS_LATER_CRASH = 'TypeError: cats[1].meow is not a function';
export const TS_CORRUPTION = `cats now holds a Dog, and a later cats[1].meow() throws ${TS_LATER_CRASH}`;

/** Is `item` a subtype of `bound` in the Animal ← Cat, Dog hierarchy? */
const isA = (item: 'Cat' | 'Dog', bound: 'Animal' | 'Cat') => bound === 'Animal' || item === bound;

/** Derived from the variance rules, not looked up per pair. */
export function verdict(viewId: ViewId, op: Op): Verdict {
  const v = view(viewId);
  if (!v.acceptsCats) {
    return { kind: 'compile', at: 'declare', message: 'error: incompatible types: List<Cat> cannot be converted to List<Animal>' };
  }
  if (op === 'read') {
    // A covariant view produces at least an Animal; a contravariant one only promises Object.
    if (v.variance === 'contravariant') {
      return {
        kind: 'compile', at: 'op', message: 'error: incompatible types: CAP#1 cannot be converted to Animal',
        reason: 'a List<? super Cat> could just as well be a List<Object>, so a read only promises an Object',
      };
    }
    return { kind: 'ok', at: 'op', message: 'a Cat comes out, and every Cat is an Animal' };
  }
  const item = op === 'addDog' ? 'Dog' : 'Cat';
  if (v.variance === 'contravariant') {
    // Writes must fit the lower bound Cat.
    return isA(item, 'Cat')
      ? { kind: 'ok', at: 'op', message: 'a Cat fits whatever list of Cat-or-wider it really is' }
      : { kind: 'compile', at: 'op', message: 'error: incompatible types: Dog cannot be converted to CAP#1', reason: 'the list could be a List<Cat>, which has no room for a Dog' };
  }
  // Covariant: the real list might hold any subtype of Animal, so writes aren't safe.
  if (v.writeCheck === 'static') {
    return {
      kind: 'compile', at: 'op', message: `error: incompatible types: ${item} cannot be converted to CAP#1`,
      reason: `a List<? extends Animal> could be a List<Cat> or a List<Dog>, so no ${item} is known to fit (only null may be added)`,
    };
  }
  if (item === 'Cat') return { kind: 'ok', at: 'op', message: 'the array really holds cats, so a Cat fits' };
  if (v.writeCheck === 'runtime') return { kind: 'runtime', at: 'op', message: 'Exception in thread "main" java.lang.ArrayStoreException: Dog' };
  return { kind: 'unsound', at: 'op', message: TS_CORRUPTION };
}

/** The snippet for one (view, operation) pair. Line 0 declares, line 1 is the operation. */
export function varianceLines(viewId: ViewId, op: Op): string[] {
  const v = view(viewId);
  const name = viewId === 'super' ? 'sink' : 'animals';
  const isArray = viewId === 'javaArray' || viewId === 'tsArray';
  const java = v.lang === 'Java';
  const opLine =
    op === 'read'
      ? java
        ? `Animal a = ${name}${isArray ? '[0]' : '.get(0)'};`
        : `const a: Animal = ${name}[0];`
      : java
        ? isArray
          ? `${name}[0] = new ${op === 'addDog' ? 'Dog' : 'Cat'}();`
          : `${name}.add(new ${op === 'addDog' ? 'Dog' : 'Cat'}());`
        : `${name}.push(new ${op === 'addDog' ? 'Dog' : 'Cat'}());`;
  return [v.declare, opLine];
}
