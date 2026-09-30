import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Functional style means small functions that take data in and hand new data back, without changing anything else, chained together with map, filter and reduce.',
    what: "A pure function's result depends only on its arguments, and calling it changes nothing outside it. Higher-order functions like map, filter and reduce take a function and apply it across an array, each returning a new array (or, for reduce, one value) instead of editing the old one. Some array methods don't follow that rule: sort and reverse change the array in place.",
    analogy: 'A pure function is a vending machine: the same coins and button always give the same snack. An impure one also peeks at a price sticker someone can swap while you are not looking.',
    useCases: [
      'Turning API data into what a page shows: map to reshape, filter to hide, reduce to total',
      'React state updates, which must produce new arrays and objects instead of editing old ones',
      'Functions that are easy to test because they only depend on their arguments',
      'Avoiding bugs where one part of an app sorts an array another part is still reading',
    ],
    why: 'You will read and write .map().filter().reduce() chains in almost every JavaScript codebase, and many real bugs are hidden inputs (globals) or shared arrays changed in place. Knowing which functions are pure and which methods mutate saves you hours of "why did this change?".',
    watch: "In map · filter · reduce, each card is an order moving right through three stations, drawn as dashed lines with a call counter on each. The card being processed right now is yellow, kept cards are green, cards the filter dropped stay behind dimmed and struck through, and cards reduced into the bin on the right are violet, where the violet total is the accumulator. The line of the chain that is running is highlighted in the code below; the loop beside it is static, for comparison. In Pure functions, the dashed violet chip is a hidden input (the global); an output is green while it matches what it returned before and red when the same input gives a new answer. In Mutation, the leaderboard's cells are green; the entry log's cells turn red when the method reordered them behind its back, and a violet chip says when two names point at one array.",
  },
  tryThis: [
    'Press play in map · filter · reduce and watch map finish the whole array before filter starts.',
    'Switch Order of stations to Filter first: same revenue, and the total calls drop from 16 to 14.',
    'In Pure functions, call both, set the global discount to 25%, and call again.',
    'In Mutation, run .sort(), then Reset, pick .toSorted() and run it again.',
    'Try .reverse() and .toReversed() in Mutation: the same trap, a different method.',
  ],
  keyIdeas: [
    'A pure function depends only on its arguments and changes nothing outside itself.',
    'map, filter and reduce each return a new array (or value); the original stays as it was.',
    'sort and reverse change the array in place and return that same array; toSorted, toReversed or [...xs].sort() copy first.',
    'Filtering before mapping gives the same answer with fewer calls when the filter does not need the mapped value.',
  ],
  quiz: [
    {
      q: 'const ranked = scores.sort((a, b) => b - a); What happens to scores?',
      options: [
        'Nothing: sort returns a new sorted array',
        'scores is sorted too, and ranked is the very same array',
        'scores is emptied',
        'It throws, because scores is const',
      ],
      answer: 1,
      why: 'sort works in place and returns the array it sorted, so ranked === scores. const only stops you reassigning the name, not changing the array. Use toSorted() or [...scores].sort() for a copy.',
    },
    {
      q: 'Which function is pure?',
      options: [
        'One that reads a global discount',
        'One that returns price * (1 - discount), with both passed in as arguments',
        'One that logs to the console and returns nothing',
        'One that returns the current time',
      ],
      answer: 1,
      why: 'Its result depends only on its arguments and it has no side effects. The others depend on hidden state or change something outside themselves.',
    },
    {
      q: 'orders.map(addTotal).filter(isPaid) runs over 6 orders, 4 of them paid. How many times is addTotal called?',
      options: ['4', '6', '10', '1'],
      answer: 1,
      why: 'map calls its function once for every item, before filter even starts. Filter first and addTotal only runs 4 times.',
    },
  ],
};

export default lesson;
