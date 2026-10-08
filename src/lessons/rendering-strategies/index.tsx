import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Where a page\'s HTML is made decides what the user sees and when. Rendering on the server (or at build time) shows content sooner than rendering in the browser, but the page only responds to taps once its JavaScript has downloaded and attached to that HTML, which is called hydration.',
    what: 'With client-side rendering (CSR) the server sends an almost empty page and the browser has to download and run the JavaScript, then fetch the data, before anything shows. With server-side rendering (SSR) the server fetches the data and sends finished HTML for every request, so the content appears early, but the page is dead until the JavaScript arrives and hydrates it. Static generation (SSG) builds that HTML once, ahead of time, so a request is just a file, at the price of data that is only as fresh as the last build. Streaming SSR sends the page in pieces, the shell first, so the slow parts do not hold up the rest. The gap between seeing a page and being able to use it is where taps get lost. The browser side of this is in `critical-rendering-path`, and how a client and a server talk is in `client-server`.',
    analogy: 'A flat-pack restaurant. CSR hands you the box of parts and the instructions, SSR serves a finished table that you cannot touch until the staff come to fix the legs, SSG is a table assembled yesterday and kept on the shelf, and streaming brings the tablecloth first and the dishes as they are cooked.',
    useCases: [
      'Picking SSG for a marketing page or documentation, and SSR or CSR for a logged-in dashboard',
      'Explaining why a page looks ready but ignores the first taps on a slow phone',
      'Understanding what "SEO-friendly" means: whether the first HTML response already holds the content',
      'Reading a framework\'s options (static, server, streaming, client) and knowing what each trades',
    ],
    why: 'Choosing where HTML is made is one of the first architecture decisions of a web app, and it decides speed, cost and freshness. The common mistake is to expect server rendering to make a page interactive sooner, when it makes it visible sooner and leaves the JavaScript cost in place.',
    watch: 'Each strategy has a phone and a timeline with a server, network, browser and screen lane. Server work is violet, network transfer is blue and browser work is yellow. The screen lane runs from blank (grey) to the stretch where the page is visible but not interactive (orange, hatched) to interactive (green); the phone border follows the same colours. The two green markers are first paint and interactive. A streamed page also has a shell stage (grey). The grey "built earlier" bar on the static page marks work done at build time, before the request.',
  },
  tryThis: [
    'Press play from the start: SSR shows its content at 630 ms but is only interactive at 1740 ms, about when CSR (1794 ms) first shows anything.',
    'Click "Marketing page": the static page is the first with its content on screen and the first to be usable, and its timeline does not move when you drag Data fetch.',
    'Click "Slow phone": the orange stretch between visible and interactive is long for every server-rendered lane, because hydration costs the device time.',
    'Drag Data fetch up to 1500 ms: CSR and SSR slide right by the same amount, while the streaming lane shows its shell early.',
    'Switch "A tap before it is interactive" to "is replayed later" and play to the end: the captions change for the lanes with an orange stretch.',
  ],
  keyIdeas: [
    'Server rendering and static generation make content visible sooner; they do not make the page interactive sooner.',
    'Hydration needs both the HTML and the JavaScript, so on a slow device the gap between visible and interactive can be long.',
    'Static pages are fast and cheap to serve but only as fresh as the last build; server rendering costs work on every request.',
    'Streaming shows the shell and the parts that are ready without waiting for the slowest data.',
  ],
  quiz: [
    {
      q: 'A page is server-rendered. What does the user see while the JavaScript bundle is still downloading?',
      options: [
        'The finished-looking page, which ignores taps until hydration is done',
        'A blank screen, because the page needs its JavaScript to draw anything',
        'A loading spinner that is replaced when the server sends the data',
        'The finished page, which already reacts to taps through the HTML',
      ],
      answer: 0,
      why: 'Server-rendered HTML can be painted as soon as it arrives, without the JavaScript. But the buttons are only wired up when the JavaScript downloads, runs and hydrates the page, so until then taps do nothing (or, in some setups, are remembered and replayed). That gap is the main cost of the approach.',
    },
    {
      q: 'Why does a client-rendered page show nothing until later than a server-rendered one, on the same network?',
      options: [
        'It needs its JavaScript, then its data, before it has anything to draw',
        'Browsers refuse to paint a page until the whole bundle has been parsed',
        'The server has to render the page again for every single visitor',
        'Client-side code always runs slower than the same code on a server',
      ],
      answer: 0,
      why: 'A client-rendered page starts as an empty shell. The browser downloads the script, runs it, only then asks for the data, and draws the page when the data is back: three steps in a row. A server-rendered page has already done the data and drawing before the first byte is sent.',
    },
    {
      q: 'A news site publishes hundreds of articles that rarely change. Which choice fits best, and what is the cost?',
      options: [
        'Static generation: very fast, but an edit shows only after a rebuild or revalidation',
        'Client-side rendering: fast and always fresh, since the data is fetched on every load',
        'Server rendering on every request: fastest, with no cost at all to the server',
        'Static generation: always fresh, because the build runs again on every visit',
      ],
      answer: 0,
      why: 'Content that rarely changes is the case static generation suits: each page is just a file, with no server work per request. The price is freshness: the page shows what the data was at the last build, unless a rebuild or on-demand revalidation refreshes it.',
    },
    {
      q: 'What does streaming server rendering do that plain server rendering does not?',
      options: [
        'Sends the shell at once and the slow parts later, without waiting for all the data',
        'Skips hydration entirely, since each piece arrives already attached to its code',
        'Builds the page once at build time and then streams the same file to every visitor',
        'Moves the rendering work from the server into the browser, one piece at a time',
      ],
      answer: 0,
      why: 'Plain SSR waits for all the data before it sends anything. Streaming flushes what is ready (the shell, with placeholders) straight away and sends the slow parts as they finish. The JavaScript still has to hydrate what arrived, and the rendering still happens on the server.',
    },
  ],
};

export default lesson;
