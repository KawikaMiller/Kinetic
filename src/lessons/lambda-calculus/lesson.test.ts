import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { PAIRINGS } from './pairings';
import { alphaEqual, alphaKey, dbKey, normalStep, oracleNormalise, toDB } from './debruijn';
import { endText, stepperCaption, stepText } from './captions';
import { BUDGET_RANGE, finalTerm, MAX_SIZE, nextRedex, redexPaths, run, stepAt, stepsOf, substitute } from './reduce';
import { STEPPER_PRESETS } from './presets';
import { STRATEGY_TERMS } from './strategyTerms';
import { CHECK_BUDGET, checkTerm, MAX_INPUT, TASK_IDS, TASKS, type TaskId } from './tasks';
import {
  allNames, app, decodeBoolean, decodeNumeral, describeValue, freeVars, lam, LIMITS, named, NAMED_SOURCE, numeral, parse, print, replaceAt, getAt, termSize, v,
  type NamedId, type Term,
} from './term';
import { endInHistory } from './useStepper';
import { tonesOf } from './tones';
import lesson from './index';

const must = (text: string): Term => {
  const p = parse(text);
  if (!p.ok) throw new Error(`${text}: ${p.error}`);
  return p.term;
};
const refusal = (text: string) => {
  const p = parse(text);
  return p.ok ? null : p.error;
};
const nf = (t: Term, budget = 5000) => {
  const r = run(t, 'normal', budget);
  expect(r.end.kind).toBe('normal');
  return finalTerm(r);
};

const BOUND_POOL = ['a', 'b', 'c', 'd', 'a1'];
const FREE_POOL = ['p', 'q'];

/** A random term; closed unless free names are given. Few names, so binders collide with free variables often. */
function gen(rnd: Rnd, depth: number, scope: string[], free: string[]): Term {
  const vars = [...scope, ...free];
  if (depth <= 0 || rnd() < 0.15) {
    if (vars.length === 0) {
      const name = BOUND_POOL[randInt(0, BOUND_POOL.length - 1, rnd)];
      return lam(name, v(name));
    }
    return v(vars[randInt(0, vars.length - 1, rnd)]);
  }
  const roll = rnd();
  if (roll < 0.4) {
    const name = BOUND_POOL[randInt(0, BOUND_POOL.length - 1, rnd)];
    return lam(name, gen(rnd, depth - 1, [name, ...scope], free));
  }
  return app(gen(rnd, depth - 1, scope, free), gen(rnd, depth - 1, scope, free));
}
const corpus = (seed: number, n: number, depth: number, free: string[]) => {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => gen(rnd, randInt(1, depth, rnd), [], free));
};

describe('the parser', () => {
  it('reads application as left-associative and an abstraction as extending as far right as possible', () => {
    expect(must('f x y')).toEqual(app(app(v('f'), v('x')), v('y')));
    expect(must('\\x.x y z')).toEqual(lam('x', app(app(v('x'), v('y')), v('z'))));
    expect(must('λx.λy.x')).toEqual(lam('x', lam('y', v('x'))));
    expect(must('(λx.x) y')).toEqual(app(lam('x', v('x')), v('y')));
    expect(must('f λx.x')).toEqual(app(v('f'), lam('x', v('x'))));
    expect(must('λx.x')).toEqual(must('\\x.x'));
  });

  it('turns a number into the Church numeral and reads letter-digit names', () => {
    expect(must('3')).toEqual(numeral(3));
    expect(print(must('2'))).toBe('λf.λx.f (f x)');
    expect(must('y1')).toEqual(v('y1'));
    expect(decodeNumeral(must('0'))).toBe(0);
  });

  it('refuses each kind of bad input with a message that points at it, and never throws', () => {
    expect(refusal('')).toMatch(/Type a term/);
    expect(refusal('   ')).toMatch(/Type a term/);
    expect(refusal('(x')).toMatch(/Missing "\)"/);
    expect(refusal('x)')).toMatch(/no "\(" for it/);
    expect(refusal('x + y')).toMatch(/Unexpected character "\+"/);
    expect(refusal('λx x')).toMatch(/Expected "\."/);
    expect(refusal('λ.x')).toMatch(/Expected a variable name/);
    expect(refusal('λx.')).toMatch(/body of λx is missing/);
    expect(refusal('add 2 3')).toMatch(/juxtaposition is application/);
    expect(refusal('2x')).toMatch(/put a space/);
    expect(refusal('21')).toMatch(/too big/);
    expect(refusal('( )')).toMatch(/Unexpected/);
    expect(refusal('x.')).toMatch(/Unexpected "\."/);
  });

  it('caps the input at 160 characters, nesting at 40 levels and 300 nodes', () => {
    expect(LIMITS).toMatchObject({ maxChars: 160, maxDepth: 40, maxNodes: 300 });
    expect(parse(`x ${'x '.repeat(70)}`.trimEnd()).ok).toBe(true);
    expect(refusal('x '.repeat(81))).toMatch(/161 characters|characters; keep/);
    const deep = (n: number) => `${'('.repeat(n)}x${')'.repeat(n)}`;
    expect(parse(deep(39)).ok).toBe(true);
    expect(refusal(deep(41))).toMatch(/nested more than 40/);
    expect(refusal(`${'λa.'.repeat(41)}a`)).toMatch(/nested more than 40|characters/);
    const wide = Array.from({ length: 20 }, () => '(λa.a a a a a a) ').join('');
    const bigText = wide.slice(0, 150);
    expect(termSize(must('x'))).toBe(1);
    const manyNumbers = '20 20 20 20 20 20 20 20';
    expect(refusal(manyNumbers)).toMatch(/nodes; keep it to 300/);
    expect(bigText.length).toBeLessThanOrEqual(LIMITS.maxChars);
  });

  it('prints and parses back to the same term for 1,000 generated terms', () => {
    for (const t of [...corpus(11, 500, 5, []), ...corpus(12, 500, 5, FREE_POOL)]) {
      const text = print(t);
      expect(parse(text), text).toEqual({ ok: true, term: t });
    }
  });

  it('prints with minimal parentheses and remembers which node each piece of text came from', () => {
    expect(print(must('(λx.λy.x) y'))).toBe('(λx.λy.x) y');
    expect(print(must('f (g x) (λy.y)'))).toBe('f (g x) (λy.y)');
    const t = must('(λx.x) y');
    expect(getAt(t, 'fb')).toEqual(v('x'));
    expect(replaceAt(t, 'a', v('z'))).toEqual(must('(λx.x) z'));
    expect(tonesOf(t).get('')).toBeUndefined();
    expect(tonesOf(t).get('fb')).toBe(tonesOf(t).get('f'));
    expect(tonesOf(t).get('a')).toBe('muted');
  });
});

describe('Church numerals and booleans against JavaScript arithmetic', () => {
  const app2 = (f: Term, a: Term, b: Term) => app(app(f, a), b);
  it('add, mul and succ on 0 to 8 equal JavaScript +, * and + 1 after decoding', () => {
    for (let a = 0; a <= 8; a++) {
      expect(decodeNumeral(nf(app(named('succ'), numeral(a)))), `succ ${a}`).toBe(a + 1);
      for (let b = 0; b <= 8; b++) {
        expect(decodeNumeral(nf(app2(named('add'), numeral(a), numeral(b)))), `add ${a} ${b}`).toBe(a + b);
        expect(decodeNumeral(nf(app2(named('mul'), numeral(a), numeral(b)))), `mul ${a} ${b}`).toBe(a * b);
      }
    }
  });

  it('the booleans’ truth tables match: and, not and if', () => {
    const bools = [true, false];
    const b = (x: boolean) => named(x ? 'true' : 'false');
    for (const p of bools) {
      expect(decodeBoolean(nf(app(named('not'), b(p))))).toBe(!p);
      for (const q of bools) {
        expect(decodeBoolean(nf(app2(named('and'), b(p), b(q))))).toBe(p && q);
        expect(nf(app(app(app(named('if'), b(p)), numeral(1)), numeral(2)))).toEqual(p ? numeral(1) : numeral(2));
      }
    }
  });

  it('decodes only what is a numeral or a boolean, up to the variable names', () => {
    expect(decodeNumeral(must('λs.λz.s (s z)'))).toBe(2);
    expect(decodeNumeral(must('λf.λx.f (f f)'))).toBeNull();
    expect(decodeNumeral(must('λf.λf.f'))).toBeNull();
    expect(decodeBoolean(must('λa.λb.b'))).toBe(false);
    expect(decodeBoolean(must('λa.λb.c'))).toBeNull();
    expect(describeValue(numeral(3))).toBe('the numeral 3');
    expect(describeValue(must('x'))).toContain('neither');
  });
});

describe('the reducer against the de Bruijn oracle', () => {
  const agree = (t: Term, budget: number) => {
    const ours = run(t, 'normal', budget);
    const theirs = oracleNormalise(toDB(t), budget, MAX_SIZE);
    if (ours.end.kind === 'normal') {
      expect(theirs.status, print(t)).toBe('normal');
      expect(stepsOf(ours), print(t)).toBe(theirs.steps);
      expect(alphaKey(finalTerm(ours)), print(t)).toBe(dbKey(theirs.term));
    } else if (ours.end.kind === 'loop') {
      expect(theirs.status, print(t)).toBe('budget');
    } else {
      expect(theirs.status, print(t)).toBe(ours.end.kind);
      if (ours.end.kind === 'too-big') expect(stepsOf(ours)).toBe(theirs.steps);
    }
    return ours.end.kind;
  };

  it('agrees on 1,000 seeded closed terms (depth up to 5, budget 100): same normal forms up to renaming, same step counts', () => {
    const kinds = new Set<string>();
    for (const t of corpus(2024, 1000, 5, [])) kinds.add(agree(t, 100));
    expect(kinds.has('normal')).toBe(true);
  });

  it('agrees on 1,000 seeded open terms too, where few names make binders collide with free variables', () => {
    for (const t of corpus(7, 1000, 5, FREE_POOL)) agree(t, 100);
  });

  it('every single step equals the oracle’s step up to renaming, on a corpus with free variables', () => {
    let steps = 0;
    for (const t of corpus(99, 400, 5, FREE_POOL)) {
      const at = nextRedex(t, 'normal');
      if (at === null) continue;
      const ours = stepAt(t, at)!;
      const theirs = normalStep(toDB(t));
      expect(theirs).not.toBeNull();
      expect(alphaKey(ours.after), print(t)).toBe(dbKey(theirs!));
      steps++;
    }
    expect(steps).toBeGreaterThan(100);
  });

  it('where normal and applicative order both reach a normal form, the forms are alpha-equal', () => {
    let both = 0;
    for (const t of corpus(5, 1000, 5, [])) {
      const a = run(t, 'normal', 100);
      const b = run(t, 'applicative', 100);
      if (a.end.kind === 'normal' && b.end.kind === 'normal') {
        expect(alphaEqual(finalTerm(a), finalTerm(b)), print(t)).toBe(true);
        both++;
      }
    }
    expect(both).toBeGreaterThan(200);
  });

  it('is capture-avoiding: a step that keeps the variable keeps the free variables of the redex', () => {
    let checked = 0;
    for (const t of corpus(31, 500, 5, FREE_POOL)) {
      const at = nextRedex(t, 'normal');
      if (at === null) continue;
      const s = stepAt(t, at)!;
      if (s.occurrences.length === 0) continue;
      expect([...freeVars(getAt(s.after, at))].sort(), print(t)).toEqual([...freeVars(getAt(t, at))].sort());
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('capture', () => {
  const capture = must('(λx.λy.x) y');
  const redex = redexPaths(capture)[0];

  it('(λx.λy.x) y: the safe step renames the binder first and the free y stays free', () => {
    const s = stepAt(capture, redex, 'safe')!;
    expect(print(s.after)).toBe('λy1.y');
    expect(s.renames).toEqual([{ from: 'y', to: 'y1', at: '' }]);
    expect(s.captured).toBe(false);
    expect([...freeVars(s.after)]).toEqual(['y']);
    expect(alphaEqual(s.after, must('λy1.y'))).toBe(true);
    expect(dbKey(toDB(s.after))).toBe(dbKey(normalStep(toDB(capture))!));
  });

  it('the naive step gives λy.y (the identity), is flagged as captured, and the checker’s comparison rejects it', () => {
    const naive = stepAt(capture, redex, 'naive')!;
    const safe = stepAt(capture, redex, 'safe')!;
    expect(print(naive.after)).toBe('λy.y');
    expect(naive.captured).toBe(true);
    expect([...freeVars(naive.after)]).toEqual([]);
    expect(alphaEqual(naive.after, safe.after)).toBe(false);
    expect(alphaEqual(naive.after, must('λz.z'))).toBe(true);
  });

  it('the second preset renames too, and substitution into a shadowing binder changes nothing', () => {
    const r = stepAt(must('(λx.λy.x y) y'), '', 'safe')!;
    expect(print(r.after)).toBe('λy1.y y1');
    expect(print(substitute(must('λx.x'), 'x', v('z'), 'safe').term)).toBe('λx.x');
    expect(substitute(must('λx.x'), 'x', v('z'), 'safe').copies).toEqual([]);
  });

  it('a renamed name avoids every name already in the body, so a second capture cannot happen', () => {
    const t = must('(λx.λy.x y1) y');
    const s = stepAt(t, '', 'safe')!;
    expect(allNames(s.after).has('y2')).toBe(true);
    expect(alphaEqual(s.after, must('λy2.y y1'))).toBe(true);
  });

  it('records where x was replaced and where the copies went', () => {
    const t = must('(λx.x (λz.x)) w');
    const s = stepAt(t, '', 'safe')!;
    expect(s.occurrences).toEqual(['fbf', 'fbab']);
    expect(s.replaced.map((p) => print(getAt(s.after, p)))).toEqual(['w', 'w']);
  });
});

describe('strategies', () => {
  const byId = (id: string) => must(STRATEGY_TERMS.find((t) => t.id === id)!.text);
  it('(λx.λy.y) Ω reaches λy.y in one normal-order step, and under applicative order the whole term comes back after one step (certified)', () => {
    const t = byId('const');
    const normal = run(t, 'normal', 200);
    expect([normal.end.kind, stepsOf(normal), print(finalTerm(normal))]).toEqual(['normal', 1, 'λy.y']);
    expect(oracleNormalise(toDB(t), 200, MAX_SIZE)).toMatchObject({ status: 'normal', steps: 1 });
    const applicative = run(t, 'applicative', 200);
    expect(applicative.end).toEqual({ kind: 'loop', first: 0, at: 1 });
    expect(alphaEqual(applicative.terms[0], applicative.terms[1])).toBe(true);
  });

  it('Ω steps to itself after one step, under either strategy', () => {
    const omega = byId('omega');
    for (const s of ['normal', 'applicative'] as const) {
      const r = run(omega, s, 200);
      expect(r.end).toEqual({ kind: 'loop', first: 0, at: 1 });
      expect(print(r.terms[1])).toBe(print(omega));
    }
    expect(print(omega)).toBe('(λx.x x) (λx.x x)');
  });

  it('Y f grows without a normal form: a budget stop, with no certificate, under either strategy', () => {
    for (const s of ['normal', 'applicative'] as const) {
      const r = run(byId('y'), s, BUDGET_RANGE.max);
      expect(r.end).toEqual({ kind: 'budget' });
      expect(termSize(finalTerm(r))).toBeGreaterThan(termSize(r.terms[0]));
    }
    expect(oracleNormalise(toDB(byId('y')), 200, MAX_SIZE).status).toBe('budget');
  });

  it('the copier passes the 2,000-node size guard after 20 steps, and the oracle says the same', () => {
    for (const s of ['normal', 'applicative'] as const) {
      const r = run(byId('grow'), s, BUDGET_RANGE.max);
      expect(r.end).toMatchObject({ kind: 'too-big' });
      expect(stepsOf(r)).toBe(20);
      expect(termSize(finalTerm(r))).toBeGreaterThan(MAX_SIZE);
      expect(termSize(r.terms[19])).toBeLessThanOrEqual(MAX_SIZE);
    }
    expect(oracleNormalise(toDB(byId('grow')), 200, MAX_SIZE)).toMatchObject({ status: 'too-big', steps: 20 });
  });

  it('the twice preset needs 5 normal-order steps and 4 applicative ones, to the same normal form', () => {
    const t = must(STEPPER_PRESETS.find((p) => p.label === 'twice')!.text);
    const a = run(t, 'normal', 50);
    const b = run(t, 'applicative', 50);
    expect([stepsOf(a), stepsOf(b)]).toEqual([5, 4]);
    expect(print(finalTerm(a))).toBe('w w (w w)');
    expect(alphaEqual(finalTerm(a), finalTerm(b))).toBe(true);
    expect(oracleNormalise(toDB(t), 50, MAX_SIZE).steps).toBe(5);
  });

  it('a budget stop is described as "did not reach a normal form within N steps" and never as a loop without a repeated term', () => {
    const r = run(byId('y'), 'normal', 37);
    const text = endText(r.end, { steps: 37, budget: 37, strategy: 'normal' });
    expect(text).toContain('did not reach a normal form within 37 steps');
    expect(text).not.toMatch(/forever|never|infinite|loops/i);
    const loop = endText({ kind: 'loop', first: 0, at: 1 }, { steps: 1, strategy: 'applicative' });
    expect(loop).toContain('certified');
  });
});

describe('the build tasks', () => {
  const ref: Record<TaskId, string> = {
    succ: NAMED_SOURCE.succ, add: NAMED_SOURCE.add, mul: NAMED_SOURCE.mul, and: NAMED_SOURCE.and, not: NAMED_SOURCE.not,
  };
  it('accepts the reference term of every task, checking cases against the oracle', () => {
    for (const id of TASK_IDS) {
      const task = TASKS[id];
      expect(checkTerm(task, must(ref[id])).failure, id).toBeNull();
      expect(task.cases.length).toBe(id === 'succ' ? 5 : id === 'add' || id === 'mul' ? 25 : id === 'and' ? 4 : 2);
      for (const c of task.cases) {
        const applied = c.args.reduce((fn, a) => app(fn, a), must(ref[id]));
        expect(dbKey(oracleNormalise(toDB(applied), CHECK_BUDGET, MAX_SIZE).term), `${id} ${c.label}`).toBe(alphaKey(c.expected));
      }
    }
    expect(MAX_INPUT).toBe(4);
  });

  it('expects what JavaScript arithmetic says, for every case', () => {
    for (const c of TASKS.add.cases) {
      const [a, b] = c.args.map((t) => decodeNumeral(t)!);
      expect(decodeNumeral(c.expected)).toBe(a + b);
    }
    for (const c of TASKS.mul.cases) {
      const [a, b] = c.args.map((t) => decodeNumeral(t)!);
      expect(decodeNumeral(c.expected)).toBe(a * b);
    }
  });

  it('every starter term fails, naming the first failing input and what it produced', () => {
    const first: Record<TaskId, string> = { succ: 'succ 0', add: 'add 0 1', mul: 'mul 1 0', and: 'and true false', not: 'not true' };
    for (const id of TASK_IDS) {
      const r = checkTerm(TASKS[id], must(TASKS[id].starter));
      expect(r.failure?.label, id).toBe(first[id]);
    }
    const f = checkTerm(TASKS.succ, must('λn.n')).failure!;
    expect(f.reads).toBe('the numeral 0');
    expect(print(f.expected)).toBe('λf.λx.f x');
  });

  it('rejects near misses and accepts a different correct term (alpha-equivalent and not just identical)', () => {
    expect(checkTerm(TASKS.succ, must('λn.λf.λx.n f x')).failure?.label).toBe('succ 0');
    expect(checkTerm(TASKS.add, must('λm.λn.λf.λx.m f (n f)')).failure).not.toBeNull();
    expect(checkTerm(TASKS.mul, must('λa.λb.λs.λz.a (b s) z')).failure).toBeNull();
    expect(checkTerm(TASKS.succ, must('λk.λs.λz.k s (s z)')).failure).toBeNull();
    expect(checkTerm(TASKS.not, must('λb.λx.λy.b y x')).failure).toBeNull();
    expect(checkTerm(TASKS.and, must('λp.λq.p q (λt.λf.f)')).failure).toBeNull();
  });

  it('a term that does not stop is reported by how it stopped, never as a wrong answer', () => {
    const f = checkTerm(TASKS.succ, must('λn.(λx.x x) (λx.x x)')).failure!;
    expect(f.end.kind).toBe('loop');
    const grow = checkTerm(TASKS.succ, must('λn.(λx.x x x x x x x x) (λx.x x x x x x x x)')).failure!;
    expect(grow.end.kind).toBe('too-big');
  });

  it('no chip offers the answer to its own task', () => {
    for (const id of TASK_IDS) expect((TASKS[id].helpers as readonly NamedId[]).includes(id as NamedId)).toBe(false);
  });
});

describe('captions', () => {
  it('say the replaced variable and argument, the rename and the capture, from the step', () => {
    const t = must('(λx.λy.x) y');
    const safe = stepAt(t, '', 'safe')!;
    const naive = stepAt(t, '', 'naive')!;
    const safeText = expectCaption(stepText(safe, 1));
    expect(safeText).toContain('α-rename y → y1');
    expect(safeText).toContain('at 1 place');
    const naiveText = expectCaption(stepText(naive, 1));
    expect(naiveText).toContain('Captured');
    expect(naiveText).toContain('the correct result is λy1.y');
    const dropped = expectCaption(stepText(stepAt(must('(λx.z) w'), '', 'safe')!, 1));
    expect(dropped).toContain('does not occur in the body');
  });

  it('a repeat certificate after a manual step names steps of the whole history', () => {
    const history = [must('(λa.a) ((λx.x x) (λx.x x))')];
    const manual = stepAt(history[0], nextRedex(history[0], 'normal')!, 'safe')!;
    history.push(manual.after);
    const r = run(manual.after, 'normal', 10);
    const end = endInHistory(r.end, history.length - 1);
    history.push(...r.terms.slice(1));
    if (end.kind !== 'loop') throw new Error('expected a loop');
    expect(end.first).toBeGreaterThan(r.end.kind === 'loop' ? r.end.first : Infinity);
    expect(alphaEqual(history[end.first], history[end.at])).toBe(true);
    expect(end.at).toBeLessThan(history.length);
    expect(expectCaption(endText(end, { steps: history.length - 1, strategy: 'normal' }))).toContain(`step ${end.at} is the term after step ${end.first}`);
  });

  it('the stepper caption walks a whole run: start, step, normal form, not-a-redex and budget', () => {
    const start = must('(λx.x) y');
    expect(expectCaption(stepperCaption({ terms: [start], current: start, last: null, note: null }))).toContain('1 redex in this term');
    const s = stepAt(start, '', 'safe')!;
    const after = expectCaption(stepperCaption({ terms: [start, s.after], current: s.after, last: s, note: null }));
    expect(after).toContain('No redex is left');
    expect(expectCaption(stepperCaption({ terms: [start], current: start, last: null, note: { kind: 'not-redex', path: 'f' } }))).toContain('not a redex');
    const y = must(STRATEGY_TERMS.find((x) => x.id === 'y')!.text);
    const r = run(y, 'normal', 10);
    expect(expectCaption(stepperCaption({ terms: r.terms, current: finalTerm(r), last: null, note: { kind: 'ended', end: r.end, strategy: 'normal', steps: 10, budget: 10 } }))).toContain('did not reach a normal form within 10 steps');
    const already = must('λx.x');
    expect(expectCaption(stepperCaption({ terms: [already], current: already, last: null, note: null }))).toContain('already in normal form');
  });
});

describe('the JavaScript beside the calculus', () => {
  it('runs as real JavaScript and gives what the page says: add two two is 4, not(T) picks the second', () => {
    const numerals = PAIRINGS.numerals.js.filter((l) => !l.trim().startsWith('//')).join('\n');
    const result = new Function(`${numerals.replace(/toNumber\(add\(two\)\(two\)\);.*$/m, '')}; return toNumber(add(two)(two));`)();
    expect(result).toBe(4);
    const booleans = PAIRINGS.booleans.js.join('\n').replace(/not\(T\)\(1\)\(2\);.*$/m, '');
    expect(new Function(`${booleans}; return [not(T)(1)(2), not(F)(1)(2)];`)()).toEqual([2, 1]);
    expect(PAIRINGS.numerals.lambda[2]).toContain('λf.λx.f (f (f (f x)))');
  });

  it('the evaluation-order example is JavaScript’s own and is not run (it would not return)', () => {
    expect(PAIRINGS.order.js.join('\n')).toContain('evaluates omega() first');
    expect(PAIRINGS.order.note).toContain('JavaScript only');
  });
});

describe('no eval anywhere', () => {
  it('no source file of the lesson calls eval or builds a Function', () => {
    const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(8);
    for (const [name, source] of files) {
      expect(source, name).not.toMatch(/\beval\s*\(/);
      expect(source, name).not.toMatch(/new Function|\bFunction\s*\(/);
    }
  });
});
describe('try-this entries, from the default state', () => {
  it('try-this 1: succ 1 reaches the numeral 2 in 3 normal-order steps', () => {
    const t = must(STEPPER_PRESETS[0].text);
    const r = run(t, 'normal', BUDGET_RANGE.max);
    expect([stepsOf(r), print(finalTerm(r))]).toEqual([3, 'λf.λx.f (f x)']);
    expect(lesson.tryThis[0]).toContain('3 steps');
  });

  it('try-this 2: twice takes 5 steps in normal order and 4 in applicative order, to w w (w w)', () => {
    expect(lesson.tryThis[1]).toContain('5 steps');
    expect(lesson.tryThis[1]).toContain('4 steps');
    expect(lesson.tryThis[1]).toContain('w w (w w)');
  });

  it('try-this 3: the capture scene gives λy1.y safely and λy.y naively, flagged', () => {
    const t = must('(λx.λy.x) y');
    expect(print(stepAt(t, '', 'safe')!.after)).toBe('λy1.y');
    expect(print(stepAt(t, '', 'naive')!.after)).toBe('λy.y');
    expect(lesson.tryThis[2]).toContain('λy1.y');
  });

  it('try-this 4: the build scene starts with λn.n, which fails first at succ 0 producing the numeral 0; the reference passes all 5', () => {
    const f = checkTerm(TASKS.succ, must(TASKS.succ.starter)).failure!;
    expect([f.label, f.reads]).toEqual(['succ 0', 'the numeral 0']);
    expect(checkTerm(TASKS.succ, must(NAMED_SOURCE.succ)).failure).toBeNull();
    expect(lesson.tryThis[3]).toContain('succ 0');
  });

  it('try-this 5: (λx.λy.y) Ω is λy.y in 1 step in normal order and repeats under applicative order', () => {
    const t = must(STRATEGY_TERMS[0].text);
    expect(run(t, 'normal', 200).end.kind).toBe('normal');
    expect(run(t, 'applicative', 200).end.kind).toBe('loop');
    expect(lesson.tryThis[4]).toContain('1 step');
  });
});
