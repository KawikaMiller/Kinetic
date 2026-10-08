import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Core Web Vitals measure three different things users feel: how fast the main content appears (LCP), whether the page jumps around (CLS) and how quickly it reacts to a tap or key press (INP). A page can be fast to load and still fail the other two.',
    what: 'Largest Contentful Paint (LCP) is when the biggest element in view was painted, among those painted before the first input; good is 2.5 s or less. Cumulative Layout Shift (CLS) adds up unexpected movements of visible elements: each shift scores impact fraction times distance fraction, shifts group into session windows (less than 1 s apart, at most 5 s long), and CLS is the worst window; good is 0.1 or less. Interaction to Next Paint (INP) is the latency of an interaction (input delay, processing, then presentation delay until the next frame), reported as the worst one with the worst of every 50 ignored; good is 200 ms or less. Real sites are judged at the 75th percentile of their visitors\' page loads, not on one run. What blocks the first paint is in `critical-rendering-path`, and the stages a change goes through are in `browser-rendering-pipeline`.',
    analogy: 'A restaurant visit judged three ways: how soon the main course reached the table (LCP), whether the table kept being shoved around while you ate (CLS), and how quickly the waiter reacted when you raised a hand (INP).',
    useCases: [
      'Reading a PageSpeed Insights or Search Console report and knowing what each number means',
      'Reserving space for ads, embeds and images so the content below them does not jump',
      'Preloading the hero image and not lazy-loading it, to bring the LCP forward',
      'Breaking up a long click handler so the page reacts before the work is finished',
    ],
    why: 'These three numbers are the standard way to say whether a page feels fast, and they are measured from real visitors, so fixing the wrong thing (a faster server for a layout-shift problem) wastes the effort. Knowing the definitions also stops you from gaming the number instead of the experience.',
    watch: 'Each metric has one meter: the fill is green in the good band, orange when it needs improvement and red when it is poor, with ticks at the band edges. In the LCP scene the mock page draws each element as it is painted, and the current LCP candidate has a yellow outline. In the CLS scene the dashed blue box is the element before a shift and the solid one after it, the yellow tint is the area the score counts, and a grey one is excluded because of your own tap; the timeline has blue shift marks and violet session windows, with the worst window outlined yellow. In the INP scene the three phases are violet (input delay), yellow (processing) and blue (presentation delay).',
  },
  tryThis: [
    'In LCP, press play from the default (a lazy-loaded 1200 KB hero): the LCP is poor. Switch Hero image loading to "set in CSS" (found once the stylesheet is parsed), then add the preload (the same early discovery a plain `<img>` in the HTML gets), then the 300 KB file, replaying each time.',
    'In LCP, set First tap to "at 2000 ms" and play: the hero is never counted, because it was painted after the tap.',
    'In CLS, click each shift to see its before and after boxes, then press Fix on the late ad: CLS drops from poor, because the biggest shift is gone; the image and the font swap now fall in separate windows.',
    'In CLS, also fix the image: the largest window is now the late cookie banner, and the tap-triggered shift never counts.',
    'In INP, press the button a few times at the default 250 ms of work, then switch Handler to "Yield between slices" and press again.',
  ],
  keyIdeas: [
    'LCP is when the largest element in view was painted, ignoring anything that appears after the first tap, key press or scroll.',
    'A layout shift scores impact fraction times distance fraction; CLS is the worst session window, not the total.',
    'INP is the worst interaction: input delay plus processing plus presentation delay, with one in 50 ignored.',
    'Load time, stability and responsiveness are separate: fixing one does not fix the others, and the real verdict is the 75th percentile of real visitors.',
  ],
  quiz: [
    {
      q: 'A page paints its heading at 0.8 s, a big text block at 1.7 s and its hero image at 4.1 s. The user taps at 2.0 s. What is the LCP?',
      options: [
        '1.7 s, the text block: the hero was painted after the tap',
        '4.1 s, the hero, because it is the largest element on the page',
        '0.8 s, the heading, the first thing that was painted',
        '2.0 s, the moment of the tap itself, which ends the load',
      ],
      answer: 0,
      why: 'LCP is the render time of the largest element painted before the first input. The tap at 2.0 s stops the search, so the hero at 4.1 s never becomes a candidate, even though it is larger. The text block at 1.7 s was larger than the heading, so it is the last candidate.',
    },
    {
      q: 'An image has no width or height and pushes the article down 160 px when it loads. Which fix targets the cause of that shift?',
      options: [
        'Give the image width and height, or an aspect-ratio, so space is reserved',
        'Preload the image so that it finishes loading sooner than before',
        'Compress the image so that the file is smaller and arrives faster',
        'Move the script that loads the image to the end of the body',
      ],
      answer: 0,
      why: 'The shift happens because the browser does not know the image\'s size until the bytes are in. Reserving the space in advance removes the movement itself. Making the image faster only changes when the shift happens, and the page still jumps.',
    },
    {
      q: 'Three layout shifts of 0.06, 0.05 and 0.04 happen within a second of each other, and one of 0.09 happens 20 s later. What is the CLS?',
      options: [
        '0.15, the largest session window',
        '0.24, the total of all four shifts',
        '0.09, the largest single shift',
        '0.06, the average of the four shifts',
      ],
      answer: 0,
      why: 'CLS is the value of the worst session window. The first three shifts are less than a second apart, so they form one window of 0.15; the late one is a window of its own (0.09). The total (0.24) and the single biggest shift (0.09) are not the metric.',
    },
    {
      q: 'A click handler runs 300 ms of synchronous work, and the page paints 20 ms after it ends. What happens to the interaction latency if the work is split into 8 ms slices run from setTimeout?',
      options: [
        'The page can respond after the first slice, so the latency drops a lot',
        'It stays the same, because the total amount of work is unchanged',
        'It gets worse, because every slice adds a delay of its own',
        'It drops to zero, because setTimeout work is not counted at all',
      ],
      answer: 0,
      why: 'INP measures time until the next frame is painted, not until all the work is done. Yielding lets the browser paint and handle input between slices, so the visible response comes after about one slice instead of after the whole 300 ms. The work still takes as long; the page just is not frozen while it runs.',
    },
  ],
};

export default lesson;
