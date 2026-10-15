import { finalTerm, run } from './reduce';
import { app, named, NAMED_SOURCE, numeral, print } from './term';

const ADD_BUDGET = 100;

export type Example = 'numerals' | 'booleans' | 'order';

export interface Pairing {
  label: string;
  lambda: string[];
  js: string[];
  note: string;
}

/** The JavaScript is shown, not run on the page; the tests run it as real JavaScript. */
export const PAIRINGS: Record<Example, Pairing> = {
  numerals: {
    label: 'Numerals',
    lambda: [`two   = ${print(numeral(2))}`, `add   = ${NAMED_SOURCE.add}`, `add two two reduces to ${print(finalTerm(run(app(app(named('add'), numeral(2)), numeral(2)), 'normal', ADD_BUDGET)))}`],
    js: ['const two = f => x => f(f(x));', 'const add = m => n => f => x => m(f)(n(f)(x));', 'const toNumber = n => n(k => k + 1)(0);', 'toNumber(add(two)(two)); // 4'],
    note: 'A Church numeral n is a function that applies f n times. JavaScript closures can hold the same idea; this is an analogy, not the same system.',
  },
  booleans: {
    label: 'Booleans',
    lambda: [`true  = ${NAMED_SOURCE.true}`, `false = ${NAMED_SOURCE.false}`, `not   = ${NAMED_SOURCE.not}`],
    js: ['const T = t => f => t;', 'const F = t => f => f;', 'const not = b => t => f => b(f)(t);', 'not(T)(1)(2); // 2'],
    note: 'A boolean chooses one of two arguments. An if is just the boolean applied to the two branches.',
  },
  order: {
    label: 'Evaluation order',
    lambda: ['(λx.λy.y) Ω', 'normal order: λy.y in one step (the argument is dropped unevaluated)', 'applicative order: reduces Ω first, which reduces to itself'],
    js: ['const omega = () => (x => x(x))(x => x(x));', 'const second = x => y => y;', '// second(omega())(1)  evaluates omega() first, before second is called'],
    note: 'JavaScript evaluates the arguments of a call before the call, so the Ω-style argument is evaluated first and never returns. That is a statement about JavaScript only; other languages differ.',
  },
};

