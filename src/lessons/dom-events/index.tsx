import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A click doesn\'t just happen to one element: it travels down the DOM tree to its target (capture), then back up (bubble), running every listener it passes.',
    what: 'The DOM is a tree of elements. When you click a span inside a button inside a section, the browser dispatches one event that visits the root first and walks down to the span (the capture phase), fires listeners on the span itself (the target phase), then walks back up to the root (the bubble phase). Listeners choose capture or bubble when they\'re added. stopPropagation() ends the trip early; preventDefault() cancels the browser\'s built-in action, like toggling a checkbox or following a link. They are separate switches.',
    analogy: 'A letter delivered to a flat: it passes the building\'s front desk and the floor\'s mailroom on the way in, gets opened at the door, and any reply goes back out the same way. Any desk can read it as it passes, or stop it going further.',
    useCases: [
      'One click handler on a list (delegation) instead of one per row, including rows added later',
      'Closing a dropdown when you click anywhere outside it (a listener on document)',
      'Stopping a click inside a modal from also closing the modal behind it',
      'Blocking a form submit or link navigation to validate first, with preventDefault()',
    ],
    why: 'Almost every UI bug report that says "clicking X also triggers Y" is propagation. Knowing the two phases, and that stopPropagation and preventDefault do different things, lets you fix those without hacks, and delegation is how list-heavy UIs stay fast.',
    watch: 'The left side is a real, clickable DOM: click the span or the checkbox. The tree on the right mirrors it, and each box says how its listener is set. As the recorded click replays, stops on the way down are blue (capture path), the target is yellow, stops on the way back up are violet (bubble path), and a node turns green when its listener fires. If a listener called stopPropagation, the rest of the trip turns red with dashed edges. The node whose listener you are editing has a thick solid outline. The real elements get the same coloured outlines, and the log numbers the listeners in the order they really ran. In the Delegation scene, the item closest() picked is yellow and a click nobody handled is red.',
  },
  tryThis: [
    'Click the span with the default listeners: the card\'s capture listener fires first, before the span\'s own listener.',
    'Edit the listener on the button: set stopPropagation() to "Call it" and click the span again. The section never hears it.',
    'Edit the listener on the input: call preventDefault(), then click the checkbox. It won\'t tick, but the section\'s listener still fires.',
    'Switch "{ once: true }" on, click twice, and watch the listeners that fired disappear.',
    'In Delegation, switch to "One per item", press "Add 1 item", then click the new item: nothing handles it.',
  ],
  keyIdeas: [
    'An event goes down (capture), hits the target, then comes back up (bubble); most listeners use bubble.',
    'stopPropagation() stops the trip; preventDefault() cancels the browser\'s default action. One doesn\'t do the other.',
    'event.target is where the click landed; the element whose listener is running is event.currentTarget.',
    'Delegation: one listener on a parent plus event.target.closest() handles any number of children, even future ones.',
  ],
  quiz: [
    {
      q: 'A checkbox\'s click listener calls stopPropagation(). What happens to the checkbox?',
      options: ['It won\'t toggle', 'It still toggles: stopPropagation only stops the event travelling', 'It toggles twice', 'The click is cancelled entirely'],
      answer: 1,
      why: 'Toggling is the default action. Only preventDefault() cancels that; stopPropagation() just stops other listeners hearing the event.',
    },
    {
      q: 'The card has a capture listener and the span has a normal one. You click the span. Which runs first?',
      options: ['The span\'s', 'The card\'s', 'Whichever was added first', 'They run at the same time'],
      answer: 1,
      why: 'Capture runs from the root down before the event reaches its target, so the card\'s capture listener fires first.',
    },
    {
      q: 'Why does a click on an <li> added after page load still work with delegation?',
      options: [
        'The browser copies listeners to new elements',
        'The listener lives on the parent <ul>, and the click bubbles up to it',
        'React re-attaches it',
        'It doesn\'t work',
      ],
      answer: 1,
      why: 'Delegation puts one listener on an ancestor that already exists. Any new child\'s click bubbles up to it, and closest() finds which child it was.',
    },
  ],
};

export default lesson;
