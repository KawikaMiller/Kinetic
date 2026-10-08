/**
 * A scripted FizzBuzz kata, then a "7 → Bazz" change request. Every code version is fixed
 * lesson-authored text that really runs against the test list; the learner only picks moves.
 */

export type Phase = 'red' | 'green' | 'refactor';

// ── Code versions ────────────────────────────────────────────────────

const fn = (...body: string[]) => ['function fizzbuzz(n) {', ...body.map((l) => `  ${l}`), '}'];

export const CODE = {
  empty: fn(),
  number: fn('return String(n);'),
  fizz: fn("if (n % 3 === 0) return 'Fizz';", 'return String(n);'),
  buzz: fn("if (n % 3 === 0) return 'Fizz';", "if (n % 5 === 0) return 'Buzz';", 'return String(n);'),
  fizzbuzz: fn("if (n % 15 === 0) return 'FizzBuzz';", "if (n % 3 === 0) return 'Fizz';", "if (n % 5 === 0) return 'Buzz';", 'return String(n);'),
  /** Refactor: build the answer from parts. Same output as `fizzbuzz` for every n. */
  parts: fn("let out = '';", "if (n % 3 === 0) out += 'Fizz';", "if (n % 5 === 0) out += 'Buzz';", 'return out || String(n);'),
  bazz: fn("let out = '';", "if (n % 3 === 0) out += 'Fizz';", "if (n % 5 === 0) out += 'Buzz';", "if (n % 7 === 0) out += 'Bazz';", 'return out || String(n);'),
  // Bad moves' consequences
  allAtOnce: fn("if (n % 15 === 0) return 'FizzBuzz';", "if (n % 3 === 0) return 'Fizz';", "if (n % 5 === 0) return 'Buzz';", 'return String(n);'),
  numberPlusBuzz: fn("if (n % 5 === 0) return 'Buzz';", 'return String(n);'),
  fizzPlusFizzBuzz: fn("if (n % 15 === 0) return 'FizzBuzz';", "if (n % 3 === 0) return 'Fizz';", 'return String(n);'),
  /** "Tidy while red": a helper that also sneaks in Fizz, and returns a number for 1. */
  helperWhileRed: fn("const label = (x) => (x % 3 === 0 ? 'Fizz' : x);", 'return label(n);'),
  ternaryWhileRed: fn("return n % 3 === 0 ? 'Fizz' : n % 5 === 0 ? 'Buzz' : n;"),
  elseIfWhileRed: fn("let out = '';", "if (n % 3 === 0) out += 'Fizz';", "else if (n % 5 === 0) out += 'Buzz';", 'return out || String(n);'),
  partsPlusBazz: fn("let out = '';", "if (n % 3 === 0) out += 'Fizz';", "if (n % 5 === 0) out += 'Buzz';", "if (n % 7 === 0) out += 'Bazz';", 'return out || String(n);'),
  bazzEveryCombo: fn(
    "if (n % 105 === 0) return 'FizzBuzzBazz';", "if (n % 35 === 0) return 'BuzzBazz';", "if (n % 21 === 0) return 'FizzBazz';",
    "if (n % 15 === 0) return 'FizzBuzz';", "if (n % 7 === 0) return 'Bazz';", "if (n % 3 === 0) return 'Fizz';", "if (n % 5 === 0) return 'Buzz';",
    'return String(n);',
  ),
  // Change-request scene
  testAfter: fn("if (n % 15 === 0) return 'FizzBuzz';", "if (n % 3 === 0) return 'Fizz';", "if (n % 5 === 0) return 'Buzz';", 'return String(n);'),
  tddCareless: fn("let out = '';", "if (n % 3 === 0) out += 'Fizz';", "else if (n % 5 === 0) out += 'Buzz';", "if (n % 7 === 0) out += 'Bazz';", 'return out || String(n);'),
  testAfterCareless: fn(
    "if (n % 3 === 0) return 'Fizz';", "if (n % 5 === 0) return 'Buzz';", "if (n % 7 === 0) return 'Bazz';", "if (n % 15 === 0) return 'FizzBuzz';",
    'return String(n);',
  ),
} as const satisfies Record<string, readonly string[]>;
export type VersionId = keyof typeof CODE;

// Runtime code execution, deliberately: each version is compiled from the exact fixed text the
// stage prints (CODE above), picked by the learner's move buttons; no learner input ever reaches
// it. It needs 'unsafe-eval', so a strict Content Security Policy would break this lesson.
const compiled = new Map<VersionId, (n: number) => unknown>();
export function compile(v: VersionId): (n: number) => unknown {
  if (!compiled.has(v)) compiled.set(v, new Function(`${CODE[v].join('\n')}\nreturn fizzbuzz;`)() as (n: number) => unknown);
  return compiled.get(v)!;
}

// ── Tests and the runner ─────────────────────────────────────────────

export const TESTS = {
  one: { n: 1, expected: '1' },
  three: { n: 3, expected: 'Fizz' },
  five: { n: 5, expected: 'Buzz' },
  fifteen: { n: 15, expected: 'FizzBuzz' },
  seven: { n: 7, expected: 'Bazz' },
  twentyOne: { n: 21, expected: 'FizzBazz' },
} as const;
export type TestId = keyof typeof TESTS;
export const testLine = (t: TestId) => `expect(fizzbuzz(${TESTS[t].n})).toBe('${TESTS[t].expected}')`;

export interface TestResult {
  id: TestId;
  passed: boolean;
  actual: string;
}
const show = (v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v));

export function runTests(v: VersionId, tests: readonly TestId[]): TestResult[] {
  const f = compile(v);
  return tests.map((id) => {
    let actual: unknown;
    try {
      actual = f(TESTS[id].n);
    } catch (e) {
      return { id, passed: false, actual: `threw ${e instanceof Error ? e.message : String(e)}` };
    }
    return { id, passed: actual === TESTS[id].expected, actual: show(actual) };
  });
}

// ── Behaviour coverage ───────────────────────────────────────────────

/** The behaviours the kata asks for, as kinds of answer. */
export type Behaviour = 'number' | 'Fizz' | 'Buzz' | 'FizzBuzz' | 'Bazz' | 'Bazz combos';
export const BEHAVIOURS: readonly Behaviour[] = ['number', 'Fizz', 'Buzz', 'FizzBuzz', 'Bazz', 'Bazz combos'];
export const RANGE = 105;

export function behaviourOf(out: unknown): Behaviour | null {
  if (typeof out !== 'string') return null;
  if (/^\d+$/.test(out)) return 'number';
  if (out === 'Fizz' || out === 'Buzz' || out === 'FizzBuzz' || out === 'Bazz') return out;
  if (out.includes('Bazz')) return 'Bazz combos';
  return null;
}

export interface Coverage {
  /** Behaviours the code produces somewhere in 1..105. */
  implemented: Behaviour[];
  /** ...and the ones some passing-or-failing test pins down. */
  pinned: Behaviour[];
  /** Implemented but no test says so: written without a failing test first. */
  untested: Behaviour[];
}

export function coverage(v: VersionId, tests: readonly TestId[]): Coverage {
  const f = compile(v);
  const seen = new Set<Behaviour>();
  for (let n = 1; n <= RANGE; n++) {
    const b = behaviourOf(f(n));
    if (b) seen.add(b);
  }
  const pinnedSet = new Set(tests.map((t) => behaviourOf(TESTS[t].expected)!));
  const implemented = BEHAVIOURS.filter((b) => seen.has(b));
  return { implemented, pinned: BEHAVIOURS.filter((b) => pinnedSet.has(b)), untested: implemented.filter((b) => !pinnedSet.has(b)) };
}

/** Output of a version over 1..105, for "the refactor changed nothing" checks. */
export const outputs = (v: VersionId) => Array.from({ length: RANGE }, (_, i) => compile(v)(i + 1));

// ── The kata as a script of steps ───────────────────────────────────

export type MoveKind = 'test' | 'code' | 'refactor' | 'next' | 'all-at-once' | 'refactor-red' | 'untested';
export interface Move {
  label: string;
  kind: MoveKind;
  /** A good move goes to the next step; a bad one shows its consequence and is undone. */
  good: boolean;
  code: VersionId;
  tests: readonly TestId[];
  /** Why this move is good or bad, in one sentence. */
  why: string;
}
export interface Step {
  /** What the next move is for (the prompt above the move buttons). */
  phase: Phase;
  code: VersionId;
  tests: readonly TestId[];
  moves: readonly Move[];
}

const T1: TestId[] = ['one'];
const T2: TestId[] = ['one', 'three'];
const T3: TestId[] = ['one', 'three', 'five'];
const T4: TestId[] = ['one', 'three', 'five', 'fifteen'];
const T5: TestId[] = [...T4, 'seven'];
const T6: TestId[] = [...T5, 'twentyOne'];

const allAtOnce = (tests: readonly TestId[]): Move => ({
  label: 'Write all of FizzBuzz now', kind: 'all-at-once', good: false, code: 'allAtOnce', tests,
  why: 'The code runs ahead of the tests: behaviour arrives that no test asked for, so nothing would notice if it broke.',
});

export const STEPS: readonly Step[] = [
  {
    phase: 'red', code: 'empty', tests: [],
    moves: [
      { label: "Write a failing test: 1 → '1'", kind: 'test', good: true, code: 'empty', tests: T1, why: 'The smallest behaviour first, and watch it fail so you know the test can fail.' },
      allAtOnce([]),
    ],
  },
  {
    phase: 'green', code: 'empty', tests: T1,
    moves: [
      { label: 'Simplest code that passes: return String(n)', kind: 'code', good: true, code: 'number', tests: T1, why: 'Just enough code to turn the one red test green.' },
      allAtOnce(T1),
    ],
  },
  {
    phase: 'refactor', code: 'number', tests: T1,
    moves: [
      { label: "Nothing to tidy: next failing test, 3 → 'Fizz'", kind: 'next', good: true, code: 'number', tests: T2, why: 'One line of code has nothing to refactor, so the next small behaviour gets its failing test.' },
      { label: 'Add Buzz now, test it later', kind: 'untested', good: false, code: 'numberPlusBuzz', tests: T1, why: 'Buzz works, but no test pins it: the first time someone breaks it, every test stays green.' },
    ],
  },
  {
    phase: 'green', code: 'number', tests: T2,
    moves: [
      { label: "Add: if (n % 3 === 0) return 'Fizz'", kind: 'code', good: true, code: 'fizz', tests: T2, why: 'One line, and both tests pass.' },
      { label: 'Tidy up first, while the test is red', kind: 'refactor-red', good: false, code: 'helperWhileRed', tests: T2, why: 'The tidy-up and the feature landed together: Fizz passes now, but 1 went red, and you have to work out which change did that.' },
    ],
  },
  {
    phase: 'refactor', code: 'fizz', tests: T2,
    moves: [
      { label: "Nothing to tidy: next failing test, 5 → 'Buzz'", kind: 'next', good: true, code: 'fizz', tests: T3, why: 'Still small: one new behaviour, one new failing test.' },
      { label: 'Add FizzBuzz for 15 now, test it later', kind: 'untested', good: false, code: 'fizzPlusFizzBuzz', tests: T2, why: 'FizzBuzz works today with no test behind it, so a later change can break it silently.' },
    ],
  },
  {
    phase: 'green', code: 'fizz', tests: T3,
    moves: [
      { label: "Add: if (n % 5 === 0) return 'Buzz'", kind: 'code', good: true, code: 'buzz', tests: T3, why: 'One line; all three tests pass.' },
      { label: 'Rewrite it as one ternary, while red', kind: 'refactor-red', good: false, code: 'ternaryWhileRed', tests: T3, why: 'Buzz passes, but the rewrite returns the number 1 instead of the string, so a test that was green goes red mid-change.' },
    ],
  },
  {
    phase: 'refactor', code: 'buzz', tests: T3,
    moves: [
      { label: "Next failing test: 15 → 'FizzBuzz'", kind: 'next', good: true, code: 'buzz', tests: T4, why: '15 is divisible by 3, so today it says Fizz: the new test fails for the right reason.' },
    ],
  },
  {
    phase: 'green', code: 'buzz', tests: T4,
    moves: [
      { label: "Add at the top: if (n % 15 === 0) return 'FizzBuzz'", kind: 'code', good: true, code: 'fizzbuzz', tests: T4, why: 'The simplest thing that works, even if it is a bit repetitive.' },
      { label: 'Restructure into parts first, while red', kind: 'refactor-red', good: false, code: 'elseIfWhileRed', tests: T4, why: "A restructure while red: 15 is still red, and you can't tell whether the new shape is wrong or just unfinished." },
    ],
  },
  {
    phase: 'refactor', code: 'fizzbuzz', tests: T4,
    moves: [
      { label: 'Refactor: build the answer from parts', kind: 'refactor', good: true, code: 'parts', tests: T4, why: 'All green, so it is safe to restructure: the same four tests stay green, and 15 now falls out of 3 and 5.' },
      { label: 'Refactor and add Bazz in the same change', kind: 'untested', good: false, code: 'partsPlusBazz', tests: T4, why: 'A refactor and a new feature in one step: Bazz has no test, and if anything had broken you would not know which half did it.' },
    ],
  },
  {
    phase: 'red', code: 'parts', tests: T4,
    moves: [
      { label: "Change request: failing test 7 → 'Bazz'", kind: 'test', good: true, code: 'parts', tests: T5, why: 'The new requirement starts as a failing test, like everything else.' },
    ],
  },
  {
    phase: 'green', code: 'parts', tests: T5,
    moves: [
      { label: "Add: if (n % 7 === 0) out += 'Bazz'", kind: 'code', good: true, code: 'bazz', tests: T5, why: 'One line, thanks to the refactor. 21, 35 and 105 now compose too, but no test says so yet: see the orange flag.' },
      { label: 'Write every Bazz combination by hand', kind: 'all-at-once', good: false, code: 'bazzEveryCombo', tests: T5, why: 'It works, but the combinations arrive with no tests, and the code is much longer than it needs to be.' },
    ],
  },
  {
    phase: 'refactor', code: 'bazz', tests: T5,
    moves: [
      { label: "Pin a combination: test 21 → 'FizzBazz'", kind: 'next', good: true, code: 'bazz', tests: T6, why: 'It passes straight away, because the design already composes. That makes it a characterization-style pin, not a red-green step: a test that never failed cannot show it is able to fail, so it earns its place only by guarding behaviour that already works.' },
    ],
  },
];

/** Where the kata ends. */
export const DONE: Step = { phase: 'refactor', code: 'bazz', tests: T6, moves: [] };

/**
 * The wheel's phase, from what's on screen: any red test (or no test yet) is red; all green
 * right after a refactor is refactor; otherwise green.
 */
export function wheelPhase(results: readonly TestResult[], lastMove: MoveKind | null): Phase {
  if (!results.length || results.some((r) => !r.passed)) return 'red';
  return lastMove === 'refactor' ? 'refactor' : 'green';
}

// ── Change request: TDD vs test-after ───────────────────────────────

export const TDD_TESTS: readonly TestId[] = [...T4, 'seven'];
/** A test-after suite written to the code already there, with the usual gap: nobody tested 15. */
export const TEST_AFTER_TESTS: readonly TestId[] = ['one', 'three', 'five', 'seven'];
export type ChangeKind = 'none' | 'careless' | 'careful';
export const changeCode = (side: 'tdd' | 'after', c: ChangeKind): VersionId =>
  c === 'none' ? (side === 'tdd' ? 'parts' : 'testAfter') : c === 'careful' ? 'bazz' : side === 'tdd' ? 'tddCareless' : 'testAfterCareless';
/** Tests for the change request itself are only present once a change is made. */
export const changeTests = (side: 'tdd' | 'after', c: ChangeKind): readonly TestId[] =>
  (side === 'tdd' ? TDD_TESTS : TEST_AFTER_TESTS).filter((t) => c !== 'none' || t !== 'seven');

/** The real requirement, FizzBuzz plus Bazz: the reference every version is judged against. */
export function reference(n: number): string {
  const s = (n % 3 ? '' : 'Fizz') + (n % 5 ? '' : 'Buzz') + (n % 7 ? '' : 'Bazz');
  return s || String(n);
}
/** Numbers whose old (pre-Bazz) answer the change broke: multiples of 7 were meant to change. */
export function regressions(v: VersionId): number[] {
  const f = compile(v);
  const broken: number[] = [];
  for (let n = 1; n <= RANGE; n++) if (n % 7 !== 0 && f(n) !== reference(n)) broken.push(n);
  return broken;
}

// ── The kata's state machine ─────────────────────────────────────────

export interface KataState {
  step: number;
  /** A costly move on screen, waiting to be undone. */
  bad: Move | null;
  lastKind: MoveKind | null;
  /** The code before the last move (to tint the changed lines). */
  prevCode: VersionId | null;
  /** Finished red-to-green cycles, in moves. */
  cycles: number[];
  /** Moves so far in the cycle in progress, or null between cycles. */
  inCycle: number | null;
}
export const KATA_START: KataState = { step: 0, bad: null, lastKind: null, prevCode: null, cycles: [], inCycle: null };

export const stepAt = (s: KataState): Step => STEPS[s.step] ?? DONE;
export const shownCode = (s: KataState): VersionId => s.bad?.code ?? stepAt(s).code;
export const shownTests = (s: KataState): readonly TestId[] => s.bad?.tests ?? stepAt(s).tests;

/** A cycle starts when a move leaves a test red, and ends when a code move turns everything green. */
export function applyMove(s: KataState, m: Move): KataState {
  const green = runTests(m.code, m.tests).every((r) => r.passed);
  const prevCode = shownCode(s);
  if (!m.good) return { ...s, bad: m, prevCode, inCycle: s.inCycle === null ? null : s.inCycle + 1 };
  let { cycles, inCycle } = s;
  if (!green && inCycle === null) inCycle = 1;
  else if (inCycle !== null && green) {
    cycles = [...cycles, inCycle + 1];
    inCycle = null;
  } else if (inCycle !== null) inCycle += 1;
  return { step: s.step + 1, bad: null, lastKind: m.kind, prevCode, cycles, inCycle };
}

export const undoMove = (s: KataState): KataState => ({ ...s, bad: null, prevCode: shownCode(s) });
