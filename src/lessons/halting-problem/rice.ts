/**
 * Rice's theorem, sorted: eight properties of programs and the class each belongs to. Every
 * card carries the reason, and the two decidable-by-running cases have real deciders here.
 *
 * Rice's theorem, precisely: a property of programs is SEMANTIC when it depends only on the
 * (partial) function the program computes, so two programs computing the same function both have
 * it or both lack it. It is NON-TRIVIAL when some programs have it and some do not. Every
 * non-trivial semantic property is undecidable.
 */
import { runTm, type Tm } from '../../core/tm';

export type Bin = 'read' | 'bounded' | 'rice' | 'trivial';

export const BIN_LABEL: Record<Bin, string> = {
  read: 'Decidable by reading the code',
  bounded: 'Decidable by running a fixed number of steps',
  rice: 'Undecidable (Rice)',
  trivial: 'The same answer for every program',
};

export const BINS: readonly Bin[] = ['read', 'bounded', 'rice', 'trivial'];

export interface RiceCard {
  id: string;
  text: string;
  bin: Bin;
  reason: string;
}

/** Steps the bounded property allows. */
export const BOUNDED_STEPS = 1000;

export const RICE_CARDS: readonly RiceCard[] = [
  {
    id: 'lines', text: 'The program has more than 10 lines', bin: 'read',
    reason: 'A property of the text, not of what the program computes: count the lines. Syntactic properties are decided by reading.',
  },
  {
    id: 'while', text: 'The program contains the word while', bin: 'read',
    reason: 'Also about the text: scan for the word. Two programs that compute the same function can differ here, so it is not semantic and Rice’s theorem does not apply.',
  },
  {
    id: 'bounded', text: `The program halts within ${BOUNDED_STEPS.toLocaleString('en-US')} steps on input 0`, bin: 'bounded',
    reason: `Run it for ${BOUNDED_STEPS.toLocaleString('en-US')} steps and look. A bounded question always has an answer. It is not semantic either: a slower program computing the same function can fail it.`,
  },
  {
    id: 'halts0', text: 'The program halts on input 0', bin: 'rice',
    reason: 'It depends only on the function the program computes (is it defined at 0?), some programs have it and some do not, so it is non-trivial and semantic. It is the halting problem restricted to one input.',
  },
  {
    id: 'seven', text: 'The program outputs 7 on some input', bin: 'rice',
    reason: 'A question about the function’s outputs, non-trivial: some programs do and some do not. Rice’s theorem says no algorithm decides it for all programs.',
  },
  {
    id: 'zero', text: 'The program computes the constant-zero function', bin: 'rice',
    reason: 'Semantic and non-trivial: some programs compute it and some do not. Looking at any finite number of inputs cannot settle it.',
  },
  {
    id: 'same', text: 'Two programs compute the same function', bin: 'rice',
    reason: 'A property of a pair, so the theorem as stated does not literally apply. It is undecidable by the same argument: fix one of the two as a program that outputs 0 for every input and it becomes the constant-zero card.',
  },
  {
    id: 'some', text: 'The program computes some function', bin: 'trivial',
    reason: 'Every program computes a (partial) function, so this is true of all programs and the decider answers yes every time. Rice’s theorem is about non-trivial properties.',
  },
];

export interface Placement {
  card: RiceCard;
  chosen: Bin | null;
}

export const isRight = (p: Placement) => p.chosen !== null && p.chosen === p.card.bin;

// ---- deciders for the decidable cards, so the claim "decidable" is something the page can do ----

/** More than 10 lines in a program's text (blank lines do not count). */
export const hasMoreThanTenLines = (text: string) => text.split('\n').filter((l) => l.trim() !== '').length > 10;

export const containsWhile = (text: string) => /\bwhile\b/.test(text);

/** Halts within BOUNDED_STEPS steps on input 0: run it and look. Stuck is not halting. */
export const haltsWithinBound = (tm: Tm) => runTm(tm, '0', { maxSteps: BOUNDED_STEPS }).status === 'halted';
