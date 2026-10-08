import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Group code by what changes together: few calls between modules (low coupling), and modules whose parts belong together (high cohesion), so a typical change lands in one place.',
    what: 'Coupling is how much one module leans on another: every call, import or shared piece of data across a boundary is a place where a change can leak through. Cohesion is how strongly the parts inside a module belong together. They are heuristics, not laws: the test that matters is what a real change request touches, and a layout that keeps the common changes local is a good one even if the numbers look ordinary.',
    analogy: 'A kitchen arranged by station (everything for pastry in one corner) versus one arranged by tool type (all the knives in one drawer, all the bowls in another). Making a cake by tool type means walking to every drawer.',
    useCases: [
      'Deciding where a new function goes in an existing codebase, before review asks why',
      'Spotting a "utils" or "services" folder that every change has to touch',
      'Planning a refactor: moving code so the next feature lands in one module',
      'Reading dependency metrics (afferent and efferent coupling, instability) from a static-analysis tool',
    ],
    why: 'Most of an engineer\'s time goes on changing code that already exists. When the pieces of one feature are scattered across layers, each change means more files, more reviewers and more chances to break something unrelated. You will be asked "where should this live?" in almost every review, and coupling and cohesion are the vocabulary for answering it.',
    watch:
      'Three outlined, lightly tinted boxes are the modules: sky blue, amber and violet, with their name in capitals at the top left and the number of functions at the top right. Each rounded box inside is a function, tinted in its module\'s colour. Arrows are calls, from caller to callee: faded grey when both ends are in the same module, orange when the call crosses a module boundary. The selected function is solid yellow. Picking a change request draws a blue ring round every function it edits, gives the modules it lands in a brighter outline and tint, and tints their rows in the table blue. While you drag a function, the module under the pointer gets a dashed yellow outline. In the stats, Coupling, Modules touched and Blast radius are green on the cheap side, red on the costly side, and grey in between. The table\'s cohesion bars use each module\'s colour.',
  },
  tryThis: [
    'With "By layer" loaded, pick "Change the coupon rules": it lands in 2 modules. Now load "By feature": 1 module.',
    'Load "God module": coupling drops to 0, yet every change request has a blast radius of all 14 functions, and the table shows 5 of 5 reasons to change.',
    'In "By layer", select couponRules and move it to services: coupling falls by one, and the coupon change now lands in one module.',
    'Pick "Change price rounding" in "By feature": it still touches two modules, because roundMoney is a helper that two features call.',
    'Keyboard only: Tab to the graph, use the arrow keys to reach a function, press Enter, then choose a module under "Move to".',
  ],
  keyIdeas: [
    'Coupling is what crosses a boundary; cohesion is whether what is inside belongs together. You want low and high, respectively.',
    'Group by what changes together (often by feature), not by kind of code (controllers, services, utils).',
    'One giant module scores zero coupling and still fails: every change, for every reason, lands in the same place.',
    'Treat the scores as hints. The real test is what a likely change request touches.',
  ],
  quiz: [
    {
      q: 'Putting all 14 functions in one module drops coupling to 0. Why is that not the best layout?',
      options: [
        'Every change, for any reason, now lands in that one module',
        'Coupling only starts to count once there are three modules',
        'Calls inside one module run slower than calls across modules',
        'A module that big always scores zero on cohesion as well',
      ],
      answer: 0,
      why: 'Low coupling is not the goal on its own; it is a means to keeping changes local. With one module, every request has the whole codebase as its blast radius and the module has every reason to change. The tempting wrong answer is the cohesion one: by this lesson\'s edge count the god module scores 100% cohesion, which is exactly why edge counts alone can mislead.',
    },
    {
      q: 'Which layout keeps "Switch email provider" inside one module?',
      options: [
        'Grouping by feature: cart, payment, email',
        'Grouping by layer: controllers, services, utils',
        'Giving every function its own separate module',
        'Grouping the functions alphabetically by name',
      ],
      answer: 0,
      why: 'The change edits emailClient and its caller sendReceipt. By feature both sit in email; by layer one is a util and the other a service, so the change spans two modules. One function per module makes every multi-function change cross modules.',
    },
    {
      q: 'In "By feature", the cart module has Ca = 2 and Ce = 0, so its instability I = Ce / (Ca + Ce) is 0. What does that tell you?',
      options: [
        'Others call into it and it calls nothing outside, so change it with care',
        'Nothing calls into it, so you can change it freely without any risk',
        'It has no calls at all, so it is safe to delete from the codebase',
        'It is badly designed, because every module should have I near 0.5',
      ],
      answer: 0,
      why: 'Ca counts the functions outside that depend on the module (placeOrder and formatEmail); Ce counts the ones inside that depend on something outside (none). I = 0 means maximally stable: lots depends on it, so changes to it ripple outward. Martin\'s advice is to depend in the direction of stability, not to aim every module at 0.5.',
    },
    {
      q: 'Why does "Change price rounding" touch two modules even in the "By feature" layout?',
      options: [
        'Its callers live in two different features, and they change too',
        'By feature put roundMoney into the wrong module by mistake here',
        'A rounding change always touches every module in the codebase',
        'The score counts each crossing edge twice, once for each module',
      ],
      answer: 0,
      why: 'roundMoney is called by priceCart and applyCoupon (cart) and by formatEmail (email). Changing its interface edits all three callers, wherever they live. No layout makes every change local; the usual answer is to keep shared helpers small and stable so they rarely change.',
    },
    {
      q: 'What does a module\'s cohesion score measure in this lesson?',
      options: [
        'The share of the edges touching it that stay inside it',
        'How many functions it holds compared with the others',
        'How many functions in other modules call into it',
        'How often the module changed in the version history',
      ],
      answer: 0,
      why: 'Cohesion here is internal edges divided by all edges touching the module. Calls coming in from outside are Ca, a coupling measure, not cohesion. Change history is a real signal (files that change together belong together), but it is not what this score counts.',
    },
  ],
};

export default lesson;
