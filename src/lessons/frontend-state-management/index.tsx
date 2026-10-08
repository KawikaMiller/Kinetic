import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Every piece of state needs one owner. Where you put it decides what must update when it changes, and values you can compute should be computed, not stored a second time.',
    what: 'State can be local to a component, lifted to a common parent and passed down as props, shared through a context, held in an external store that components subscribe to with selectors, or tracked by signals that update individual bindings. In React, a component re-renders when its state changes, when its parent re-renders (unless it is wrapped in `memo` and its props are equal), or when a context it reads changes. A store with selectors re-renders only the components whose selected slice changed, and some signal-based frameworks (Solid, Preact Signals) go further and skip re-running components at all. Data that comes from a server is a cache, not your state: read it through a cache that revalidates, and never copy it into a second place that cannot hear about changes.',
    analogy: 'A shared whiteboard in an office. Pass the number down the chain of people and everyone in between has to repeat it. Shout it across the room (context) and everyone who is listening for anything turns their head. Keep it on a board people watch for their own line (a store with selectors), and only that person looks up.',
    useCases: [
      'Deciding where a cart, a form or a theme lives, and why a small change makes a whole page re-render',
      'Choosing between lifting state, context and a store as an app grows past two or three levels of props',
      'Showing server data (prices, profiles, feeds) with a revalidating cache instead of copying it into local state',
      'Spotting derived values that were stored and went stale: totals, counts, filtered lists, "is valid" flags',
    ],
    why: 'Most front-end bugs and slowness come from state in the wrong place: props drilled through components that never use them, a context that re-renders a whole page for one field, or two copies of the same fact that drift apart. The fixes are small once you can see who owns the data and who reads it. The claims about re-rendering are React\'s: the comparison is shown as a model and counted in real React. Specific libraries are out of scope; the ideas carry over. See `virtual-dom-reconciliation` for how a render becomes DOM changes and `functional-programming` for why pure update functions make state easier to reason about.',
    watch: 'The tree on the left is a model; each box counts its re-renders. A component that re-rendered and needed to is solid yellow, one that re-rendered with identical output is an orange tint (wasted), and one that did not re-render is grey. The dashed violet ring marks who owns the state. The real React panel counts renders from real React and says whether it matches the model. In Server state, a stale value is outlined red and a fresh one green, and the server is outlined violet. In Derived state the stale copy is red and the code line the last edit ran is yellow.',
  },
  tryThis: [
    'Who re-renders: with Lifted state, press Add Lamp, then press Toggle theme. Which components re-render for each, and which of them only pass props along?',
    'Switch to Context and press Add Lamp. Why do the cards for Mug, Pen and Book re-render, and the theme toggle too?',
    'Switch to Store + selectors and press Add Lamp, then Toggle theme: compare the real panel with the model, and then switch to Signals and compare the number of components that ran.',
    'Lifted state: turn Components in memo off and press Add Lamp. How many components re-render now, and which kind is the extra work?',
    'Server state: leave the price at $14 and play both modes. Then set the price to $12 and play again: what changes, and why?',
  ],
  keyIdeas: [
    'Put state in one owner as low as it can go while everything that reads it can still reach it: lifting costs props, a store or context costs re-renders.',
    'In React, context re-renders every component that reads it, whichever field it uses; a store with selectors re-renders only components whose slice changed.',
    'Server data is a cache to revalidate (show stale, fetch, show fresh), not state to copy: a copy in local state never hears about changes.',
    'If a value can be computed from state (a total, a count), compute it. A stored copy needs every code path to update it, and one forgotten path makes it stale.',
  ],
  quiz: [
    {
      q: 'A form field changes one value in a context that holds the whole app state. What does React re-render?',
      options: [
        'Every component that reads that context, even ones using another field',
        'Only the components that read the one field that changed in it',
        'Every component in the whole tree, including ones that never read it',
        'Nothing, because the context only stores the value for later reads',
      ],
      answer: 0,
      why: 'In React, a context change re-renders each consumer of that context regardless of which part of the value it uses. Splitting the context, or using a store with selectors, narrows that.',
    },
    {
      q: 'A product price is fetched, then copied into the component\'s own state with an initial value. Someone changes the price on the server. What does the UI show?',
      options: [
        'The old copy, since local state never hears about later changes',
        'The new price, because the fetch library updates every copy of it',
        'A loading state, because the cache marked the old copy as invalid',
        'Whichever value arrived last, since both write into the same state',
      ],
      answer: 0,
      why: 'The initial value is read once; the cache can revalidate and hold the new price while the local copy stays old. Two sources of truth drift apart. Reading the cache directly avoids the copy.',
    },
    {
      q: 'A cart keeps `items` and also a separate `total` in state. Where does this usually go wrong?',
      options: [
        'A code path that changes the items forgets to update the total',
        'The total is recomputed too often, so the page always feels slow',
        'The total cannot be shown anywhere until every item has loaded',
        'Storing numbers in state is not allowed in most front-end tools',
      ],
      answer: 0,
      why: 'Every path that edits the items must also edit the copy, and one missed path leaves it stale. A total computed from the items on render has no copy to forget.',
    },
    {
      q: 'Which statement about the virtual DOM and re-rendering is accurate in React?',
      options: [
        'A component can re-render and still need no DOM change at all',
        'A re-render always changes the DOM for that component\'s output',
        'Wrapping a component in memo stops it from ever re-rendering',
        'Only components that hold their own state can re-render at all',
      ],
      answer: 0,
      why: 'Rendering runs the function and compares the result; DOM work happens only for differences. A parent re-render can re-render a child with the same props, and `memo` skips that only while its props stay equal.',
    },
  ],
};

export default lesson;
