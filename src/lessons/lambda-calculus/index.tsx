import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { finalTerm, run, stepAt, stepsOf } from './reduce';
import { STRATEGY_TERMS } from './strategyTerms';
import { CAPTURE_PRESETS, STEPPER_PRESETS } from './presets';
import { parse, print, type Term } from './term';

const must = (text: string): Term => {
  const p = parse(text);
  if (!p.ok) throw new Error(p.error);
  return p.term;
};
const normalSteps = (text: string) => stepsOf(run(must(text), 'normal', 200));
const applicativeSteps = (text: string) => stepsOf(run(must(text), 'applicative', 200));
const twice = STEPPER_PRESETS.find((p) => p.label === 'twice')!.text;
const succOne = run(must(STEPPER_PRESETS[0].text), 'normal', 200);
const capture = must(CAPTURE_PRESETS[0].text);
const safe = print(stepAt(capture, '', 'safe')!.after);
const naive = print(stepAt(capture, '', 'naive')!.after);
const growth = run(must(STRATEGY_TERMS.find((t) => t.id === 'grow')!.text), 'normal', 200);
const omegaFirstStep = run(must(STRATEGY_TERMS[1].text), 'normal', 200).terms[1];

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Computation can be built from functions applied to functions, and reducing a term is substitution done carefully.',
    what: 'You reduce lambda terms by clicking a redex and watching the argument replace the variable, then see why substitution is not find-and-replace: a free variable can be captured, so the page renames a binder first. You build succ, add, mul, and and not from nothing but functions, checked against Church numerals and booleans, and compare two reduction strategies, one of which finds a normal form that the other repeats past.',
    analogy: 'Like a recipe that says "do this with whatever is on the counter": a redex is a recipe handed an ingredient, and reducing it fills each blank in the recipe with that ingredient.',
    useCases: [
      'Seeing closures and higher-order functions as one idea, and reading the theory behind many functional languages',
      'Understanding why the order in which arguments are evaluated can change whether a program finishes',
      'Spotting name capture, a real bug class in macro systems and code generators',
      'Reading Church encodings: numbers and booleans as plain functions',
    ],
    why: 'Closures, higher-order functions and lazy evaluation all descend from this one rule. Name capture bites macro systems and code generators, and the calculus shows exactly where it comes from.',
    watch: 'A binder and the variables it binds share one colour (blue, amber, pink or purple) and a free variable is grey. The redex about to reduce is highlighted yellow and the other redexes are underlined in blue. In the before-and-after panel the argument is tinted blue, the places x is replaced are ringed green, and afterwards the copies are tinted green. A renamed variable is orange and a captured one (naive mode) is tinted red. In the strategy table green is a normal form, red a certified repeat, and grey a stop at the budget or size guard, which proves nothing either way.',
  },
  tryThis: [
    `On The stepper, press Run to normal form on the default succ 1 in normal order: ${stepsOf(succOne)} steps to ${print(finalTerm(succOne))}, the numeral 2.`,
    `Press the twice chip, then Run to normal form: ${normalSteps(twice)} steps in normal order. Press Reset, switch to Applicative order and run again: ${applicativeSteps(twice)} steps and the same normal form, ${print(finalTerm(run(must(twice), 'normal', 200)))}.`,
    `On Capture, press Step: the result is ${safe} and the caption shows the α-rename y → y1. Press Reset, switch Substitution to Naive (wrong) and step again: ${naive}, flagged as a captured variable.`,
    'On Build it, press Check on the starting term λn.n for succ: it fails first at succ 0, producing the numeral 0. Type λn.λf.λx.f (n f x) and press Check again: all 5 cases pass.',
    `On Strategy matters, (λx.λy.y) Ω reaches λy.y in ${normalSteps(STRATEGY_TERMS[0].text)} step in normal order, while in applicative order the term comes back to itself after ${applicativeSteps(STRATEGY_TERMS[0].text)} step, a certified repeat. Pick Y f for a budget stop with no certificate, and Copier for the size guard, which stops it after ${stepsOf(growth)} steps.`,
  ],
  keyIdeas: [
    'Beta reduction replaces a variable by the argument where it is free in the body. It is not find-and-replace, because a free variable of the argument would be captured by a binder of the same name.',
    'Numerals and booleans are functions: a numeral applies f n times, a boolean picks one of two arguments, and add, mul and not are terms that rearrange them.',
    'A term can have a normal form that one strategy finds and another misses: normal order reaches λy.y where applicative order keeps reducing Ω.',
    'When normal order and applicative order both reach a normal form they agree up to renaming; that is the Church-Rosser theorem, stated here and checked on a corpus, not proved.',
  ],
  quiz: [
    {
      q: 'What is (λx.λy.x) y after one correct reduction step?',
      options: [
        'λy.y, the identity function, because x is replaced by y',
        'y, because the function ignores the binder λy and returns its argument',
        'λy1.y, with the binder renamed so the free y stays free',
        'λy.x, because the body is left alone when the argument is a variable',
      ],
      answer: 2,
      why: `A correct step renames the inner binder first: the result is ${safe}. Naive substitution gives ${naive}, where the free y has been captured and the term now means something else.`,
    },
    {
      q: 'A term has no normal form under applicative order. What does that say about normal order?',
      options: [
        'It has none either, because the two strategies find the same normal forms',
        'Nothing yet: normal order may still reach one, as it does for (λx.λy.y) Ω',
        'Normal order loops as well, because Ω appears somewhere inside the term',
        'The term is ill-formed, since every valid term reduces to a value',
      ],
      answer: 1,
      why: `For (λx.λy.y) Ω normal order reaches ${print(finalTerm(run(must(STRATEGY_TERMS[0].text), 'normal', 200)))} in ${normalSteps(STRATEGY_TERMS[0].text)} step, while applicative order reduces Ω to itself and does not get there.`,
    },
    {
      q: 'In (λx.λy.x) y the binder λy is renamed before substituting. Why?',
      options: [
        'The free y in the argument would end up under λy and be captured',
        'Two variables may not share a name anywhere in a term',
        'Renaming makes the term shorter, so reduction needs fewer steps',
        'The rule that a binder must be renamed after each step demands it',
      ],
      answer: 0,
      why: 'The argument y is free. If it were put under the binder λy unchanged, it would become the bound variable and the term would mean something else.',
    },
    {
      q: 'What does the Church numeral 3, λf.λx.f (f (f x)), do?',
      options: [
        'It stores the machine integer 3 in a memory cell for later arithmetic',
        'It counts the number of steps that a reduction has taken so far',
        'It applies a function f to an argument x, three times in a row',
        'It reduces to the value 3 only when it is applied to a number',
      ],
      answer: 2,
      why: `The numeral is a function, not a stored value: add m n applies f n times and then m more times. In this lesson succ 1 reduces to ${print(finalTerm(succOne))}, the numeral 2.`,
    },
    {
      q: 'Ω is (λx.x x) (λx.x x). What does one reduction step give?',
      options: [
        'λx.x, the identity function',
        'A larger term that keeps growing at every step',
        'A normal form after a single substitution of the argument',
        `Ω itself: ${print(omegaFirstStep)}, so reduction repeats`,
      ],
      answer: 3,
      why: 'Substituting the argument for x in x x gives the same term back, so the run is a certified repeat: the terms are alpha-equal. A growing term, such as Y f, is different: it just hits the budget.',
    },
  ],
};

export default lesson;
