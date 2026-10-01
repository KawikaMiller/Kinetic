import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Responsive design is one page and one stylesheet that rearranges itself for every screen size, not a separate site for phones.',
    what: 'You write the small-screen layout first, then add media query blocks that switch on at wider breakpoints: two columns from 600px, a sidebar from 960px. Relative units (%, rem, vw, clamp()) let sizes scale smoothly between breakpoints. For images, srcset and sizes let the browser download a picture that fits the slot and the screen\'s pixel density instead of always sending the largest file.',
    analogy: 'Water poured into different glasses: the same liquid takes the shape of whatever it\'s in. You don\'t make a separate drink for each glass.',
    useCases: [
      'A marketing site that works on a phone, a tablet and a 4K monitor from one codebase',
      'Collapsing a nav bar into a menu button on small screens',
      'Serving a 400px image to a phone instead of a 1600px one, saving data',
      'Making buttons big enough to tap with a thumb (44 × 44px)',
    ],
    why: 'Most web traffic is on phones, and every front-end ticket you get will assume it works on all screen sizes. Mobile-first CSS with a few breakpoints is the standard way to build that, and it\'s usually faster and simpler than maintaining separate mobile pages.',
    watch: 'The café page in the frame is real HTML and CSS. Drag its right edge (or pick Phone, Tablet or Desktop) and it reflows at the true width. When the device is wider than the stage it is laid out at full width and scaled down to fit. The ruler under it shows the breakpoint bands, with the active band in yellow and a yellow marker at the current width. In the stylesheet, the block in effect now has a yellow bar, rules that still apply underneath are normal text, and blocks not in effect are dimmed. The type-size table lists font sizes measured at this width. In the srcset box, the image the browser would pick is green. With "Tap targets" on, anything smaller than 44 × 44px gets a red outline.',
  },
  tryThis: [
    'Drag the device edge slowly past 600px and watch the nav links appear and the cards split into two columns.',
    'Pick "Desktop 1280": the sidebar shows up, and the stylesheet lights the 960px block.',
    'Watch the clamp() row in "Type sizes": it grows with the width, but never below 16px or above 28px.',
    'Set the screen density to 3× on a phone: the browser now needs the 1600w image.',
    'Turn "Tap targets" on: the little social icons in the footer are too small to tap reliably.',
  ],
  keyIdeas: [
    'Mobile first: base styles for small screens, then media queries add layout at wider breakpoints.',
    'Relative units (%, rem, vw, clamp()) scale smoothly between breakpoints.',
    'srcset + sizes lets the browser pick the smallest image that still looks sharp on this screen.',
    'Aim for 44 × 44px touch targets (WCAG AAA and Apple\'s guideline); WCAG 2.2 AA\'s floor is 24 × 24.',
  ],
  quiz: [
    {
      q: 'What does "responsive design" usually mean?',
      options: [
        'One page whose CSS adapts to the screen size',
        'A separate mobile site at m.example.com',
        'A page that loads quickly on slow phones',
        'A page that detects the device type on the server',
      ],
      answer: 0,
      why: 'Responsive design is one set of HTML and CSS that rearranges itself with media queries and relative units, not a second site or server-side device sniffing.',
    },
    {
      q: 'In mobile-first CSS, which styles apply on a 1280px screen?',
      options: [
        'The base styles plus every min-width block ≤ 1280px',
        'Only the @media (min-width: 960px) block',
        'Only the base styles, since they come first',
        'Whichever @media block was written last',
      ],
      answer: 0,
      why: 'min-width blocks stack on top of the base styles. At 1280px the base, 600px and 960px blocks all apply, and later ones override earlier ones where they overlap.',
    },
    {
      q: 'An image slot is 400px wide on a 2× screen. srcset offers 400w, 800w and 1600w. Which is picked?',
      options: ['The 400w image', 'The 800w image', 'The 1600w image', 'All three, combined'],
      answer: 1,
      why: 'The browser needs 400 × 2 = 800 device pixels, and 800w is the smallest candidate that covers it. 400w would look blurry on a 2× screen.',
    },
  ],
};

export default lesson;
