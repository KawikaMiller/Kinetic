import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A virtual DOM is a way to describe the UI as a tree on every render and let the framework work out the smallest set of real DOM changes; keys decide which list item is which.',
    what: 'On every render your component returns a new tree of plain objects. The framework compares it with the previous tree and patches the real DOM. The usual heuristics, which React documents: a node of the same type at the same place is updated in place, a different type replaces the whole subtree, and children are matched by position unless they carry keys. A key that follows the item (an id) lets the diff tell an item that moved from one that changed, so it keeps that item\'s DOM node and any state held in it.',
    analogy: 'Editing a document with tracked changes: instead of retyping the page, a comparison lists the few edits to make. If paragraphs are identified by their position, inserting one at the top makes every later paragraph look edited; if each paragraph has a stable id, only the insertion shows up.',
    useCases: [
      'Rendering lists: chat messages, table rows and to-do items that get inserted, removed and reordered',
      'Lists of inputs, where the text and focus live in the DOM node, so a wrong key puts them on the wrong row',
      'Understanding "why did it re-render?" and why a render that changes nothing still costs diffing time',
      'Choosing between rebuilding a subtree (change its type) and updating it (keep its type)',
    ],
    why: 'The classic bugs here are subtle: text that sticks to the wrong row after an insert, animations that restart, state that vanishes because a wrapper changed type. Knowing the rules lets you predict what React will keep and what it will rebuild. It also corrects a common myth: the virtual DOM is not faster than the DOM, and diffing costs time too. What it buys is a declarative way to get minimal updates without writing them by hand. Fibers and concurrent rendering are React-specific machinery on top of this idea and out of scope here. See `dom-events` for the DOM itself and `tree-traversals` for how a tree is walked; what the browser does after a DOM change is covered by its own rendering lessons.',
    watch: 'Two trees: the old one (what is on screen, with real DOM ids like #3) and the new one the render returned. The pair being compared is solid yellow. Patches are tinted: update blue, insert green, move violet, remove red, and replace orange (the costly kind: a whole subtree is rebuilt). Nodes the diff visited and left alone are grey. Below, the real DOM model is patched one step at a time and the log lists each patch. In the Real React scene a row\'s input outlined red holds text that was typed under a different name; the counters there come from real renders and a MutationObserver.',
  },
  tryThis: [
    'Diff a tree: pick "div becomes section". Why does a diff that changes one tag name rebuild four nodes, and what would a child\'s state do?',
    'Diff a list with "Insert at the start" and no keys, then switch to id keys: compare the DOM calls in the table.',
    'Diff a list: with id keys pick Reverse, then switch to index keys. Which one moves nodes, and which one rewrites their text?',
    'Real React: type a note in the second row and press Insert at top with index keys, then Reset, switch to id keys and repeat.',
    'Real React: press "Re-render, same output" with Greeting plain, then in memo, and compare renders with DOM mutations.',
  ],
  keyIdeas: [
    'The same type at the same place updates in place; a different type replaces the whole subtree, children included.',
    'Without keys, children are matched by position, so an insert at the front looks like every row changed. An index key says the same thing as no key.',
    'A key must follow the item (an id), so the framework keeps that item\'s DOM node and state when the list changes.',
    'A render that returns the same tree still runs the component and the diff but makes no DOM calls: the virtual DOM is a way to get minimal updates declaratively, not a way to beat the DOM.',
  ],
  quiz: [
    {
      q: 'You insert a new item at the top of a list that uses index keys. Each row has an uncontrolled text input. What happens to text already typed?',
      options: [
        'It stays in the same position, so it sits beside a different item now',
        'It moves down with the item it was typed beside, since React tracks items',
        'It is cleared everywhere, because inserting always rebuilds the whole list',
        'It stays where it is only if every row also has an id attribute set',
      ],
      answer: 0,
      why: 'Index keys match each new row with the old row at the same position and reuse its DOM node, input text included. Only a key that follows the item lets React move the node with it.',
    },
    {
      q: 'A component\'s root changes from `div` to `section` while its children stay the same. What does the diff do?',
      options: [
        'Replaces the whole subtree: the new type means new nodes below too',
        'Updates the element in place and only compares the children after that',
        'Renames the tag in the DOM and keeps every child node that matched',
        'Compares the children first and replaces the root only if they differ',
      ],
      answer: 0,
      why: 'Different types are assumed to produce different trees, so the old subtree is dropped and the new one built without looking inside. Component state below it is lost as well.',
    },
    {
      q: 'A component re-renders and returns exactly the same tree as before. Which statement is true?',
      options: [
        'The component ran and was diffed, but no DOM calls were needed',
        'Nothing ran at all, because React sees that the props look the same',
        'The DOM is rebuilt anyway, since the virtual tree is a new object',
        'Only the text nodes are re-assigned, but the elements are kept',
      ],
      answer: 0,
      why: 'Rendering and committing are separate. The component function ran and the trees were compared, which costs time, but with no differences the diff emits no patches. Wrapping a component in memo can skip the run itself when its props are equal.',
    },
    {
      q: 'Which statement about the virtual DOM is accurate?',
      options: [
        'It is a way to compute minimal updates, and the diff itself has a cost',
        'It makes DOM updates faster than writing them by hand ever could be',
        'It replaces the DOM, so browsers no longer need to build any elements',
        'It always touches fewer nodes than the real DOM would have needed',
      ],
      answer: 0,
      why: 'Hand-written DOM code can be as fast or faster. The virtual DOM lets you describe the UI declaratively and still get a small set of changes, paying for the comparison. It sits on top of the real DOM, which the browser still builds.',
    },
  ],
};

export default lesson;
