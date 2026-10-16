import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A macro rewrites code before it runs, so it is not a function call: depending on how it substitutes, SQUARE(a + 1) can mean a different program, an argument can run twice, and a helper variable can swallow the caller\'s name.',
    what: `A toy macro system expands a call three ways: by pasting the argument's tokens into the template (the C preprocessor model), by putting the argument's syntax tree into the template's tree (Lisp and Rust style), and hygienically, renaming the template's own variables so they cannot capture yours. The expansion is shown as source and as a tree, with the value it evaluates to and a counter that shows how often an argument ran. A second scene uses a real JavaScript Proxy and Reflect to show what reflection sees, and a third asks when each technique (macro, code generation, decorator, reflection, proxy) can notice a mistake. Your text is read by a hand-written parser and walked by a small evaluator; nothing is ever run as JavaScript.`,
    analogy: 'A macro is a rubber stamp for code: it fills in a form before anyone reads it, so what the reader meets is the filled-in form, and how the blanks were filled decides what it says.',
    useCases: [
      'Debugging a surprising result from a C macro whose argument was an expression',
      'Choosing between a macro, a function and code generation for repeated boilerplate',
      'Understanding why hygienic macro systems rename variables behind the scenes',
      'Knowing what ORMs and dependency-injection containers use reflection or proxies for, and what they cannot check early',
    ],
    why: 'Code that writes code moves errors to different times: some surface at expansion or build time, some only when the program runs, and some never. Knowing which phase a technique checks in tells you where its bugs will hide.',
    watch: 'In the expanded source and tree, pieces from the caller are blue (--info) and pieces from the template violet (--violet). A piece that was captured or regrouped wrongly is red (--bad), and a binder the hygienic expander renamed is green (--ok). The result is yellow (--hi), a stale serialiser is orange (--orange), and a Proxy trap that fired is yellow in the log. In the phase table the phase where a mistake surfaces is yellow, the earlier phases that ran are blue, a mistake that never raises an error is orange and a field that is picked up is green.',
  },
  tryThis: [
    `Expand a macro, on the defaults (SQUARE(a + 1), text substitution, a = 4): the call expands to ${F.textSource}, which evaluates to ${F.textValue}. Switch to Syntax tree: it expands to ${F.treeSource} and evaluates to ${F.treeValue}.`,
    `Expand a macro: pick the example SQUARE(next()) (syntax tree): it expands to ${F.counterSource}, which evaluates to ${F.counterValue} because the counter was read ${F.counterCalls} times. Pick "bind it once": the counter is read ${F.onceCalls} time and the value is ${F.onceValue}.`,
    `Expand a macro: pick "a helper called tmp" (syntax tree): the value is ${F.captureValue} and the caller's tmp is red, captured by the template's own tmp. Switch to Hygienic: the value is ${F.hygienicValue} and the expansion reads ${F.hygienicSource}.`,
    `Reflection and proxies, on the defaults: press Object.keys and the log shows ${F.keysLog}. Add the field email: ${F.staleAfterEmail} serialisers turn orange and stale, and the reflective one does not.`,
    `When does it run?, on the defaults (a misspelled field): ${F.misspelledCatches} techniques catch it, each in its own phase, and ${F.misspelledSilent} stays silent. Switch to "a field added later": ${F.laterCatches} catch it and ${F.laterSilent} stay silent.`,
  ],
  keyIdeas: [
    `A macro is not a function call: text substitution turns SQUARE(a + 1) into ${F.textSource}, which gives ${F.textValue} at a = 4, where substituting the syntax tree gives ${F.treeValue}.`,
    `Substituting the argument's tree runs it at each use: SQUARE(next()) reads the counter ${F.counterCalls} times, and a template that binds the argument once with let reads it ${F.onceCalls} time.`,
    `Hygiene renames the template's own binders: with a helper called tmp and a caller's tmp, plain expansion gives ${F.captureValue} and hygienic expansion gives ${F.hygienicValue} (${F.hygienicSource}).`,
    `In this toy pipeline reflection reads the object when asked, so it picks up a field added later, but it checks nothing earlier: a misspelled name gives undefined and no error, and the other techniques differ in the phase where they look.`,
  ],
  quiz: [
    {
      q: 'The macro SQUARE(x) is x * x, and the call is SQUARE(a + 1) with textual substitution at a = 4. What value results?',
      options: ['9', '25', '16', '5'],
      answer: 0,
      why: `Text substitution gives ${F.textSource}, and multiplication binds tighter than addition: 4 + (1 * 4) + 1 = ${F.textValue}. Substituting the tree keeps the argument together and gives ${F.treeValue}.`,
    },
    {
      q: 'A macro\'s helper variable is called tmp and the caller also has a tmp. What does hygiene do?',
      options: [
        'It renames the template\'s own tmp, so the caller\'s tmp is not captured',
        'It renames the caller\'s tmp, so the template\'s helper is the one used',
        'It refuses the call, because two variables with one name cannot coexist in one scope',
        'It copies the caller\'s tmp into the template, so both share one value',
      ],
      answer: 0,
      why: `The template's binder becomes tmp#1, so the argument still means the caller's tmp: the result is ${F.hygienicValue} where plain expansion captured the name and gave ${F.captureValue}.`,
    },
    {
      q: 'Someone says a macro is just a function call. Which difference does the lesson show?',
      options: [
        'The argument can be evaluated more than once, so SQUARE(next()) reads the counter twice',
        'The argument is always evaluated exactly once, before the macro body starts to run',
        'A macro call runs at the first call of the program, while a function runs at build time',
        'A macro cannot take an expression as an argument, only a number or a variable name',
      ],
      answer: 0,
      why: `With tree substitution the argument is pasted at each use, so ${F.counterSource} reads the counter ${F.counterCalls} times and gives ${F.counterValue}; binding it once with let reads it ${F.onceCalls} time.`,
    },
    {
      q: 'A teammate says reflection costs nothing and any mistake can be fixed later. What does the phase table say?',
      options: [
        'Reflection checks late and skips name checks, so a misspelled field just yields undefined',
        'Reflection catches a misspelled field at expansion, like a macro, but only by luck',
        'Reflection catches every mistake at the first call, so none can stay silent in any case',
        'Reflection behaves exactly like a decorator, since both read the schema at definition',
      ],
      answer: 0,
      why: `In this toy pipeline a misspelled field surfaces in ${F.misspelledCatches} techniques and stays silent in ${F.misspelledSilent}: reflection, which looks at run time and does not check names. It does pick up a field added later.`,
    },
  ],
};

export default lesson;
