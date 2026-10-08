import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A garbage collector frees only what is unreachable, so a managed program still leaks when it keeps references to things it no longer needs: listeners never removed, caches that only grow, timers that outlive their views, logs kept forever.',
    what: 'In a leak, every GC drops the heap back to a floor, and the floor keeps rising: the sawtooth\'s troughs climb. The leaked objects are still reachable from a GC root (window, an active timer, a module-level map), so the collector is right to keep them. A heap snapshot diff shows which kinds of objects keep growing, and the retaining path shows the chain of references from a root that holds them. The fix is to break that chain: remove the listener, bound the cache, clear the timer, cap the log. A heap that is high but flat is not a leak, just a big working set.',
    analogy: 'A cloakroom that never throws anything away: guests leave, but their coats stay on the hangers because the ticket stubs are still pinned to the board. The cloakroom attendant (the GC) only clears hangers with no ticket attached.',
    useCases: [
      'A single-page app that gets slower and crashes a tab after hours open',
      'A Node.js service whose memory climbs until it is killed or restarted every few days',
      'Reading a Chrome DevTools or node --inspect heap snapshot comparison and its retainers',
      'Reviewing code for listeners, subscriptions and timers without matching cleanup',
    ],
    why: 'Memory leaks in managed languages are a classic slow-burn outage: nothing fails in testing, then production processes grow until they crash or swap. Knowing that a GC keeps whatever is reachable tells you where to look. It builds on `garbage-collection` (reachability from roots), `closures-scope` (closures capture what they use), `dom-events` (listeners) and `lru-cache` (bounding a cache).',
    watch: 'The plot draws the heap size as a blue line rising between GCs and a grey vertical drop at each GC, every 10 simulated minutes. The dashed line through the troughs is red when they keep climbing (a leak) and green when they stay flat; the Trough rise and Verdict stats use the same red and green. In the code, the leaking line is tinted red with a red bar and a fix\'s lines green with a green bar. In the snapshot table, a growing count is red and the row whose path is shown is tinted yellow; its "path" chip is yellow. The retaining path is a row of heap objects joined by yellow arrows, from a violet GC root, through grey objects, to the object it keeps alive: red when that object is leaking, grey when the heap is flat.',
  },
  tryThis: [
    'With Resize listener, drag App open for to 8 h: the troughs climb in a straight red line.',
    'Turn Fix on: the AbortController removes each listener, and the trough line goes flat and green.',
    'On Unbounded cache, compare Fix LRU (100) and WeakMap: both flatten it, the WeakMap because finished request objects become unreachable.',
    'On Forgotten interval, look at the snapshot table: canvases and list items grow, and the path runs from the active timers through a closure and a detached div to its canvas.',
    'Pick High but flat: the heap is the highest of all, yet the verdict is flat, because a bounded cache is not a leak.',
  ],
  keyIdeas: [
    'A GC frees what is unreachable; anything a root can still reach stays, needed or not.',
    'The signature of a leak is troughs that rise after every GC, not a high peak.',
    'A snapshot diff finds what grows; the retaining path shows which reference to cut.',
    'Pair every addEventListener, setInterval and cache insert with its removal, cap or eviction.',
  ],
  quiz: [
    {
      q: 'A teammate says "JavaScript is garbage collected, so our app can\'t leak memory." What is wrong with that?',
      options: [
        'Objects still reachable from a root are never freed',
        'The collector only runs when the browser tab closes',
        'Garbage collection only covers numbers and strings',
        'A collector frees memory only for objects over 1 MB',
      ],
      answer: 0,
      why: 'The collector frees what is unreachable. A listener on window, a global cache or a running timer keeps objects reachable, so they stay forever even though the app no longer needs them. That is a leak in a managed language.',
    },
    {
      q: 'Which heap graph is the clearest sign of a leak?',
      options: [
        'The low point after each GC rises every time',
        'The peak just before each GC is very high',
        'The heap jumps up once at start-up, then stays',
        'The GC runs more often during busy periods',
      ],
      answer: 0,
      why: 'Peaks include garbage that the next GC will free, so they say little. The trough is what is still reachable; if it rises after every collection, something keeps accumulating. A high but flat trough is just a large working set.',
    },
    {
      q: 'A component adds `window.addEventListener(\'resize\', onResize)` on mount and nothing on unmount. Why does each unmounted component stay in memory?',
      options: [
        'window holds the listener, whose closure holds it',
        'The DOM keeps a copy of every removed element',
        'The garbage collector skips objects with methods',
        'Closures are never collected in JavaScript at all',
      ],
      answer: 0,
      why: 'window is a GC root. Its listener list holds onResize, and the closure captures the component, so the whole component and its data are reachable. Removing the listener (or aborting its AbortController signal) breaks the chain, and the next GC frees it.',
    },
    {
      q: 'A cache keyed by request id strings grows forever. Why doesn\'t switching it to a WeakMap work as written?',
      options: [
        'WeakMap keys must be objects, not strings',
        'A WeakMap is cleared at every GC, losing hits',
        'A WeakMap is slower than a Map for every lookup',
        'A WeakMap never lets its values be collected',
      ],
      answer: 0,
      why: 'A WeakMap holds its key weakly, so its keys must be objects (a string can\'t be one). It helps when you key by an object whose lifetime is right, such as the request object; for string keys, bound the cache instead (an LRU with a size limit).',
    },
    {
      q: 'What does a heap snapshot\'s retaining path tell you?',
      options: [
        'The chain of references from a GC root that keeps it',
        'The line of code where the object was allocated',
        'How long ago the object was last accessed by code',
        'Which objects the leaked object itself points to',
      ],
      answer: 0,
      why: 'The retainers view shows why an object is still alive: the references from a root down to it. Cutting any link in that chain makes it collectable. Allocation sites are a different view (allocation instrumentation).',
    },
  ],
};

export default lesson;
