import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A browser turns HTML and CSS into pixels in stages, and a change only costs the stages downstream of it: a size change typically re-runs layout, paint and composite, a colour change only paint and composite, and transform or opacity on their own layer can often go straight to composite.',
    what: 'The browser parses HTML into the DOM and CSS into the CSSOM, combines them into computed styles, lays out the boxes, paints them and composites the painted layers onto the screen. After the first render, a style change typically re-runs only the stages it can affect. Reading a layout value such as `offsetHeight` right after a write makes the browser finish layout early, and doing that in a loop is called layout thrashing. The box model itself is in `css-layout`, and why one busy main thread stalls everything is in `event-loop`.',
    analogy: 'A print shop. Moving a photo means re-measuring the page and reprinting it; changing a headline colour only means reprinting; sliding an already-printed transparent sheet over the page needs neither.',
    useCases: [
      'Reading a DevTools Performance recording and knowing what its layout and paint blocks mean',
      'Choosing `transform` over `left` or `top` for an animation that has to stay smooth',
      'Batching DOM reads before writes in a loop that touches many elements',
      'Explaining why `display: none` and `visibility: hidden` differ for layout and for screen readers',
    ],
    why: 'Janky scrolling and animation usually come from doing layout or paint work on the main thread in every frame, and the fix starts with knowing which change triggers which stage. "Why is this animation janky?" and "why is this loop slow?" are common review and interview questions.',
    watch: 'In the pipeline strip, a stage that re-runs for the change lights up yellow, a stage that is skipped goes grey, and when the path skips both layout and paint the stages that run are green. The sandbox box is real and really changes. In the thrashing scene the interleaved bar is red (the costly pattern) and the batched bar green, with timings measured live in your browser. In the animation scene the top box is red and the bottom green, with a sparkline of real frame times. In the render tree, nodes with a box are blue, and nodes with no box are grey and dashed.',
  },
  tryThis: [
    'Press play with the default change, `width`: the strip lights style, layout, paint and composite while the real box grows.',
    'Pick `transform` and play, then switch Layer to Own layer: with its own layer the same change typically skips layout and paint.',
    'In Layout thrashing, press Run: the interleaved bar is typically much longer than the batched bar for the very same rows.',
    'In Animation, switch Main thread to Stressed and watch the sparkline spike and the two boxes diverge.',
    'In Render tree, compare the real heights of `nav` (display: none) and `p.note` (visibility: hidden), then press All normal.',
  ],
  keyIdeas: [
    'A style change re-runs only the stages downstream of it: layout, then paint, then composite.',
    'Size and position properties typically trigger layout; colours and shadows typically trigger paint but not layout.',
    'Reading a layout value after a write forces layout early, so batch the reads first and the writes second.',
    '`transform` and `opacity` can typically skip layout and paint on their own layer; `display: none` removes the box while `visibility: hidden` keeps it.',
  ],
  quiz: [
    {
      q: 'Which change to a box typically makes the browser re-run layout, not just paint?',
      options: [
        'Making its width bigger, which can move its neighbours',
        'Changing its text colour to a different shade',
        'Adding a soft box-shadow around it',
        'Fading it with opacity while it has its own layer',
      ],
      answer: 0,
      why: 'Layout works out the size and position of every box, so a change that can alter geometry (width, or top on a positioned element) re-runs it, and paint and composite follow. A colour or shadow change typically only needs paint and composite. This is typical Chromium behaviour; engines differ, and DevTools shows what really happened.',
    },
    {
      q: 'Why is a loop that reads offsetHeight and then sets a style on each of 200 rows slow?',
      options: [
        'Each read after a write makes the browser finish layout early',
        'The browser repaints the whole screen after every single write',
        'Reading offsetHeight sends a request to the server each time',
        'Writes in a loop are queued so every read has to wait its turn',
      ],
      answer: 0,
      why: 'A write marks the layout stale, and a read of a layout-dependent value such as offsetHeight needs it fresh, so the browser recalculates layout right then. Interleaving does that for nearly every row; reading everything first and writing afterwards needs one layout. Nothing here touches the network.',
    },
    {
      q: 'What is the difference between display: none and visibility: hidden for an element?',
      options: [
        'None removes its box from layout; hidden keeps the box and its space',
        'None keeps its box and space; hidden removes the box from layout',
        'None removes it from the DOM; hidden only removes it from the render tree',
        'They are the same, and only the browser\'s default styling differs',
      ],
      answer: 0,
      why: 'The element stays in the DOM either way, but display: none gives it no box, so it takes no space and neither does anything inside it. visibility: hidden keeps the box in the render tree and just does not draw it, leaving a gap, and its children inherit that.',
    },
    {
      q: 'Why can a transform animation typically keep moving while the main thread is busy?',
      options: [
        'The compositor can move an already-painted layer by itself',
        'Transforms run on the GPU only and never use any CPU time',
        'The browser skips layout for every property that has a unit',
        'Transform changes are applied before the main thread starts',
      ],
      answer: 0,
      why: 'Once an element is on its own layer and has been painted, moving or fading that layer is composite work, which the compositor can often do without the main thread. An animation of left needs layout and paint on the main thread each frame, so it stutters when the thread is busy. It is typical in Chromium, not a guarantee in every engine.',
    },
  ],
};

export default lesson;
