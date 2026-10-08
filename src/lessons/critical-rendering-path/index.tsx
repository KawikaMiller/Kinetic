import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The browser cannot paint until the HTML is parsed and every render-blocking stylesheet has arrived, and a plain script stops the parser itself: how each resource is loaded decides how soon the first pixel appears.',
    what: 'While parsing the HTML, the browser finds stylesheets, scripts, a font and images. CSS blocks rendering (nothing is painted until the stylesheets that apply have arrived) and also holds back any script below it. A plain `<script>` blocks the parser: it must download, wait for the stylesheets above it and run before parsing continues. An `async` script runs as soon as it arrives, in any order; `defer` and module scripts wait for the parser to finish, then run in document order, before DOMContentLoaded. A preload scanner reads the markup ahead of a blocked parser, so downloads still start early. The protocol side is in `http-versions` and the caching side in `http-caching`.',
    analogy: 'A host laying a table: she cannot keep setting places while she unpacks a delivery she must open first (a plain script), guests are not let in until the tablecloth is on (CSS), and a helper reading the order list ahead phones in the deliveries early (the preload scanner).',
    useCases: [
      'Reading a DevTools Network waterfall and spotting what delayed the first render',
      'Choosing `defer` or `async` for analytics and application scripts',
      'Inlining critical CSS and preloading the font or the hero image on a landing page',
      'Debugging an "x is not defined" error that only appears when a script arrives in a different order',
    ],
    why: 'Most slow first renders come from a few blocking resources in the head, and once you know what blocks what they are cheap to fix. It is also the model behind advice such as "eliminate render-blocking resources" and "preload the main image".',
    watch: 'The waterfall has one lane per resource plus a parser lane, on a time axis in milliseconds. Blue bars are downloads (a dashed grey bar is the wait for the first byte), yellow bars are a script running, a red hatched bar in the parser lane is the parser blocked, and a render-blocking stylesheet\'s download has a red outline. Resources that block nothing have a dim outline. The green line marks first paint, the violet line DOMContentLoaded and the grey line load, and the yellow cursor is the current time. The filmstrip draws a mock page at those three moments, and the generated head shades the blocking lines red.',
  },
  tryThis: [
    'Press play on the default preset, "Everything sync in head": the parser lane has red hatched stretches, and the first paint comes only after the last script has run.',
    'Click "The fixed version": first paint moves far left, while DOMContentLoaded actually moves later because the deferred scripts run before it.',
    'Click "Async scripts that need each other" and play: app.js runs first and fails. Set both scripts to `defer` and the order is guaranteed.',
    'On the default preset, switch the Preload scanner to Off (what-if): the downloads below each plain script start much later.',
    'Click "The fixed version", then set font-display to block: at first paint the text is hidden until the font arrives.',
  ],
  keyIdeas: [
    'CSS blocks rendering, and a plain script blocks the parser and waits for the stylesheets above it.',
    '`async` runs as soon as the script arrives, in any order; `defer` and module scripts run in document order after parsing, before DOMContentLoaded.',
    'The preload scanner starts downloads ahead of a blocked parser, but cannot see what only CSS or JavaScript will request: that is what preload hints are for.',
    'First paint and DOMContentLoaded are different moments: deferring scripts can bring the first forward and push the second back.',
  ],
  quiz: [
    {
      q: 'A normal stylesheet in the head is still downloading. What is true while it does?',
      options: [
        'Nothing is painted yet, but the HTML parser keeps reading',
        'The parser stops at the link tag until the CSS has arrived',
        'The page paints without it and restyles itself once it lands',
        'Only scripts below it wait; painting never waits for stylesheets',
      ],
      answer: 0,
      why: 'A stylesheet is render-blocking: the browser will not paint until the stylesheets that apply have arrived, because painting unstyled content would flash. It does not stop the parser, which keeps building the DOM, but it does hold back any script below it (that script might ask for computed styles).',
    },
    {
      q: 'lib.js and app.js are both marked async, and app.js needs lib.js. What can happen?',
      options: [
        'app.js runs first and fails, because async promises no order',
        'lib.js always runs first, because it is listed first in the HTML',
        'Both wait for the parser to finish and then run in document order',
        'Each blocks the parser until it has run, one after the other',
      ],
      answer: 0,
      why: 'An async script runs as soon as it has downloaded, so the smaller or faster one wins, whatever the HTML order. Scripts that depend on each other need defer (or type="module"), which keeps document order, or a bundle that puts them in one file.',
    },
    {
      q: 'What does adding defer to an external script in the head do?',
      options: [
        'It downloads alongside parsing and runs after it, before DOMContentLoaded',
        'It downloads alongside parsing and runs the moment it has arrived',
        'It waits to start downloading until the whole page has loaded',
        'It runs after DOMContentLoaded, once every image has loaded',
      ],
      answer: 0,
      why: 'A deferred script is fetched without blocking the parser, then executed once the document has been parsed, in document order, and DOMContentLoaded fires after it. That is why deferring can improve first paint while making DOMContentLoaded later.',
    },
    {
      q: 'A hero image is set with a CSS background-image. Why does it start downloading late, even in a browser with a preload scanner?',
      options: [
        'The scanner reads only the HTML markup, and the URL is inside the CSS',
        'Browsers never download background images until the page has loaded',
        'The scanner skips images, because images never block rendering',
        'Images wait for the web font so that the text is drawn first',
      ],
      answer: 0,
      why: 'The preload scanner looks for URLs in the HTML markup. A URL that only appears in a stylesheet (or that a script adds later) is discovered after the CSS has arrived and been matched to an element. A preload hint in the head puts the URL back where the scanner can see it.',
    },
  ],
};

export default lesson;
