import type { LessonModule } from '../../core/types';
import { sig } from '../../core/format';
import { money } from './captions';
import { initialStale } from './init';
import {
  BROKEN_SEED, CORE_RATE, DEFAULT_LOAD, FULL_RATE, PRICE, QUEUE_BOUND, SERVICES, brownoutPoint, checkout, firstMinute, runQueue, runTimeline,
} from './model';
import { Stage } from './Stage';

const TOO_HIGH = 1.4;
const BROKEN = runQueue(BROKEN_SEED, DEFAULT_LOAD, brownoutPoint(DEFAULT_LOAD, TOO_HIGH, true).mu);
const BROKEN_AT = BROKEN.brokeAtS === null ? '?' : sig(BROKEN.brokeAtS);
const FULL_PCT = sig((DEFAULT_LOAD / FULL_RATE) * 100);
const CORE_PCT = sig((DEFAULT_LOAD / CORE_RATE) * 100);

const STALE = initialStale().cache;
const ROWS = runTimeline(STALE);
const STALE_FROM = firstMinute(ROWS, 'stale');
const ERROR_FROM = firstMinute(ROWS, 'error');
const STALE_AGE = STALE_FROM === null ? 0 : (ROWS[STALE_FROM].age ?? 0);
const LAST_DOWN = STALE.outageStart + STALE.outageLength - 1;
const BUGGY = checkout('stale-price', LAST_DOWN, false, ROWS[LAST_DOWN].fetchedAt);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When a dependency fails, degrade the one widget it feeds instead of failing the whole page: serve a stale copy, a static default or nothing for soft dependencies, shed work in a brownout, and fail closed for anything that moves money.',
    what: `A page is built from widgets, each reading a service. Sorting those services into hard (the core journey cannot finish without them) and soft (it can) tells you where to fail fast and where to keep going. A soft widget steps down a ladder: live, a stale copy with its age, a static default, hidden, or an error. Under load, a brownout switches optional features off from the top, which lowers the work per request, so the same requests are served faster; and a cached copy that outlives its TTL may be served when the origin errors, for a bounded window.`,
    analogy: 'A restaurant that is out of one dish still opens: it crosses the dish off the menu, serves yesterday\'s soup when it says so, and keeps the kitchen running. It does not guess what to charge when the till is broken.',
    useCases: [
      'Deciding what each widget on a page does when its backend is down or slow',
      'Switching optional features off under load so the core page stays fast',
      'Setting a stale-if-error window on cached pages and API responses',
      'Reviewing a design for a hidden hard dependency, like a buy button that waits on recommendations',
    ],
    why: 'An outage in a minor service should cost a widget, not the sale. Deciding the fallback for each dependency before the failure, and testing it, is what keeps a small failure small.',
    watch: 'Scene 1: each widget card is outlined by its state. Green is live, yellow a stale copy with its age (a state, not a failure), violet a static default, grey and dashed hidden, red an error and orange live but slow. In the graph a failed service is red and a slow one orange, a solid line is a hard dependency and a dashed line a soft one. Scene 2: the green curve is response time with the brownout, the blue one without it; the dashed yellow line is where the first tier switches off and the solid yellow line is the load. Tier chips are green when on and grey when off, and the red queue curve has passed the bound. Scene 3: bars are green for a fresh copy, yellow for a stale one and red for an error or a down origin.',
  },
  tryThis: [
    'In A page of widgets, press "pricing down (hard)": the Price widget errors and the journey is blocked at Pay, because a charge needs the live price. Now give the Price widget (select its card) the "stale cache" fallback: the page shows a stale price and Pay is still blocked.',
    'Back to A page of widgets with Reset: the Price card is selected. Tag Pricing as soft with the toggle, and the stage flags 1 tag the journey disagrees with, because it breaks without Pricing.',
    'With Reset, set the Buy button to "also waits on recommendations": the sweep of soft failures now names {recs}, because failing recommendations alone breaks the journey.',
    `In Brownout at the defaults, the core page alone carries ${DEFAULT_LOAD}/s at ${CORE_PCT}%. Press "threshold too high" (${TOO_HIGH * 100}% of the full page): no tier switches off, ${DEFAULT_LOAD}/s is ${FULL_PCT}% of capacity, and on seed ${BROKEN_SEED} the queue passes ${QUEUE_BOUND} requests after ${BROKEN_AT} s.`,
    `In Stale on error, press play: from minute ${STALE_FROM} the user sees a copy ${STALE_AGE} minutes old instead of an error, and from minute ${ERROR_FROM} the window has ended and they get one. Set Checkout to "trusts the cache" and play to the end: it charges ${money(BUGGY.charged ?? 0)} while the live price is ${money(BUGGY.livePrice)}.`,
  ],
  keyIdeas: [
    `Sort each dependency into hard or soft before an outage, and give each soft widget a fallback. In this model the core journey completes with all ${SERVICES.length - 3} soft services failed, checked over all ${2 ** SERVICES.length} failure subsets.`,
    `A brownout lowers the work per request instead of dropping requests: in this model the core page alone runs ${DEFAULT_LOAD}/s at ${CORE_PCT}%, where the full page would need ${FULL_PCT}%. A line set above saturation switches nothing off, and the queue still passes its bound.`,
    'Stale data is a degraded answer, not a safe one. Show it with its age and give it a window, after which the cache returns an error: in this model a copy past the window is not served.',
    `What moves money fails closed. A stale price may be shown, but a charge reads the live price or refuses: in this model a checkout that trusts the cache charges ${money(BUGGY.charged ?? 0)} against a live ${money(BUGGY.livePrice)}.`,
  ],
  quiz: [
    {
      q: 'The reviews service goes down while a shopper is mid-purchase. What should the page do?',
      options: [
        'Hide the reviews or show a cached copy, and let the purchase continue',
        'Fail the whole page fast, so the shopper knows something is broken',
        'Retry the reviews call until it answers, since a retry is a fallback',
        'Show a spinner in the reviews slot and wait for the service to return',
      ],
      answer: 0,
      why: 'Reviews are a soft dependency: the journey does not need them, so the page degrades that one widget and keeps the sale. Failing the request suits a hard dependency, not a soft one, and a retry is not a fallback: it adds load to a service that is already failing.',
    },
    {
      q: 'Pricing is down and the page holds a cached price. What should checkout do?',
      options: [
        'Refuse the charge, because a price it cannot confirm may be wrong',
        'Charge the cached price, since it was the one the shopper saw',
        'Charge the static list price from the fallback, then correct it later',
        'Let the payment service pick the amount, since it is also a backend',
      ],
      answer: 0,
      why: `A stale price may be shown with its age, but a charge changes what someone owes, so it reads the live price or fails closed. In this model a checkout that trusts the cache charges ${money(PRICE.before)} against a live ${money(PRICE.after)}.`,
    },
    {
      q: 'Which value is unsafe to serve stale when its service errors?',
      options: [
        'The amount a card is about to be charged',
        'The count of reviews on a product page',
        'A list of recommended products to browse',
        'The weather summary on a travel page',
      ],
      answer: 0,
      why: 'Stale data suits values where a slightly old figure harms nobody, such as counts and suggestions. An amount to charge is a decision, so the safe choices are the live value or a refusal.',
    },
    {
      q: 'A brownout threshold is set above the load that saturates the worker. What happens at that load?',
      options: [
        'No tier switches off, capacity stays below the load, and the queue grows',
        'Every tier switches off at once, so response time stays flat',
        'The site drops requests instead of tiers, which keeps the queue short',
        'The queue stays bounded, because a brownout always lowers the work',
      ],
      answer: 0,
      why: `A brownout acts when utilisation crosses its line, and it lowers the work per request rather than dropping requests. With the line above saturation nothing changes, so the queue passes its bound: in this model seed ${BROKEN_SEED} passes it after ${BROKEN_AT} s at ${DEFAULT_LOAD}/s.`,
    },
    {
      q: 'Which dependency should fail the request fast instead of degrading?',
      options: [
        'Payments at checkout, since no honest page works without it',
        'Reviews on the product page, since an empty slot looks like a bug',
        'Recommendations, since a missing carousel could lose some sales',
        'The chat widget, since users expect it on a page',
      ],
      answer: 0,
      why: 'A hard dependency is one the journey cannot complete without, so failing fast and clearly beats a half-working page. Reviews, recommendations and chat are soft: the purchase goes through without them.',
    },
  ],
};

export default lesson;
