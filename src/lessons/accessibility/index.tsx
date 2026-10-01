import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Accessibility means people using keyboards, screen readers or other assistive tech can use what you build. Mostly it comes from using the right HTML.',
    what: 'Browsers turn your HTML into an accessibility tree: each element gets a role (button, textbox, heading), an accessible name and a state, and that\'s what screen readers read out. A real <button> gets a role, keyboard focus and Enter/Space activation for free; a clickable <div> gets none of them. Labels connect names to inputs, alt text names images, headings give pages structure, the tab order follows the page, and live regions announce changes. Colour contrast and not relying on colour alone help people with low vision or colour blindness.',
    analogy: 'A building with only stairs works for most people, until someone arrives in a wheelchair. A ramp built in from the start costs little; retrofitting one later costs a lot.',
    useCases: [
      'Using <button> and <label for> instead of clickable divs and loose text',
      'Adding alt text to images and a heading structure to pages',
      'Announcing form errors with role="alert" so screen-reader users hear them',
      'Checking text contrast meets WCAG AA (4.5:1) before shipping a design',
    ],
    why: 'About one in six people has a disability, accessibility is a legal requirement in many countries, and most fixes are free when you write the right HTML to begin with. It\'s also one of the first things a senior reviewer will catch in your pull request.',
    watch: 'On the left is a real sign-up form; on the right, the accessibility tree our model builds from it, one box per element showing its role and name. The node the screen reader is on is yellow, broken nodes (no role or name, or otherwise wrong) are red, nodes you fixed are green, and non-interactive nodes are grey. The red list under the tree explains each problem, and the reader output below shows what a screen reader would say, with problems in red. In the Contrast scene, passing verdicts are green and failing ones red; the colour-vision options run the whole panel through a filter, and the bad example, labelled in red, has dots that rely on colour alone.',
  },
  tryThis: [
    'Press "Tab ↓" a few times: the newsletter checkbox comes first and the Sign up "button" is never reached.',
    'Click Sign up with an empty email: the error appears, but the reader says nothing. Now fix "Error message" and try again.',
    'Fix the Sign-up button, then focus it and press Enter: a real <button> works from the keyboard.',
    'Fix "Email field" and watch the textbox node gain a name in the tree.',
    'In Contrast, load "Grey on white", then "One step darker": #767676 is a single step from #777, and it passes (4.54:1).', // allow-color: the WCAG example colours named in prose
  ],
  keyIdeas: [
    'Use native HTML first: <button>, <label>, <h2>, alt text. The first rule of ARIA is not to need it.',
    'Every control needs a role and an accessible name; screen readers read the accessibility tree, not the pixels.',
    'Keep the tab order following the page: positive tabindex values break it.',
    'Contrast ≥ 4.5:1 for body text, and never use colour as the only signal.',
  ],
  quiz: [
    {
      q: "A <div onclick> is styled to look like a button. What's the best fix?",
      options: [
        'Use a real <button>, which handles keyboard use',
        'Add role="button" and it\'s fully fixed',
        'Add a hover effect so it looks clickable',
        'Add aria-label="button" to the div',
      ],
      answer: 0,
      why: 'ARIA only changes what\'s announced; with role="button" you would still have to add tabindex and key handlers yourself. A native <button> gives you the role, focus and Enter/Space activation for free.',
    },
    {
      q: 'The word "Email" sits right next to an input, but isn\'t in a <label for>. What does a screen reader announce on the input?',
      options: [
        '"Edit text", with no name at all',
        '"Email, edit text", from the nearby word',
        "Nothing at all: it's skipped",
        'The page title, then "edit text"',
      ],
      answer: 0,
      why: "Text that's only visually nearby isn't connected. Without a label (or aria-label), the input has no accessible name, though it is still announced as an edit field.",
    },
    {
      q: 'Is grey #777 text on a white background OK for body copy under WCAG AA?', // allow-color: the WCAG example colour named in prose
      options: [
        "No, it's about 4.48:1, just under 4.5:1",
        "Yes: it's comfortably above 4.5:1",
        "Yes, because it's readable to most people",
        'Only if the user zooms the page to 200%',
      ],
      answer: 0,
      why: 'AA needs 4.5:1 for normal-size text; #777 on white is 4.48:1. It passes for large text (3:1), not body text, and "readable to me" isn\'t the test.', // allow-color: the WCAG example colour named in prose
    },
  ],
};

export default lesson;
