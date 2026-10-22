import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A routing facade lets a monolith be replaced one route at a time, each with its own way back; shadow traffic shows the new answers without serving them, and the step that has no way back is the data cutover.',
    what: `You run an invented monolith with eight routes behind a facade. Each route can be Off, Shadow (mirrored, users still see the monolith) or Serve at a share of its traffic, and the page shows the expected user-visible error rate beside a seeded ${F.simMinutes}-minute run, the shadow mismatches, and the writes a rollback would lose. Then you choose what to peel off first in a three-decision story with invented effects, and read the ledger of the ${F.paths} paths. The routes, the defect rule and the effects are invented.`,
    analogy: 'Rebuilding a bridge one lane at a time while the traffic keeps crossing: each lane opens once it carries load, the old lane stays open as the way back, and the last awkward lane is the one that decides whether the old bridge ever comes down.',
    useCases: [
      'Replacing a legacy system over several quarters without a freeze',
      'Comparing a new implementation with the old one on live traffic before users depend on it',
      'Deciding whether a data-owning route needs dual-writes before it is cut over',
      'Explaining why the last slices of a migration take longer than the first ones',
    ],
    why: 'A large rewrite is one large bet placed in a single go; a facade turns it into many small bets, each with a price and a way back. The data cutover is where that way back can vanish, and the page prices it instead of forbidding it.',
    watch: 'On The facade, a blue bar is the share of requests the new stack answers and a grey remainder is the monolith; violet marks shadow traffic that is mirrored while users still see the monolith, and red marks writes a rollback would lose. Each route is a card with Off, Shadow and Serve chips. On What first? a meter is blue while fine and red past its edge; the unknowns meter can only fall, so it never goes red. On Read the ledger, a red number is a meter in the red when a path ends and a green "never" is a path that was never red.',
  },
  tryThis: [
    `The facade, from a fresh load (every route Off): set "search" to Serve at 100%. The user-visible error rate reads ${F.searchError} and the writes lost on rollback read 0, because search owns no data.`,
    `Set "checkout" to Shadow: the error rate stays ${F.shadowError} (shadow never changes what users see) and the shadow mismatch reads about ${F.mismatchPerMin} a minute, ${F.mismatchRate} of ${F.mirrored} mirrored requests.`,
    `Set "checkout" to Serve at 100% and move "Minutes since cutover" to 60: the error rate reads ${F.checkoutServedError} and the red banner says rolling back checkout loses ${F.lost} writes.`,
    `Turn Dual-write on for "checkout": the writes lost on rollback read ${F.lostWithDual} and the banner goes away.`,
    `Open What first? and choose a1, b3, c1 (Continue after each): the stats read incidents ${F.incidents}, weeks ${F.weeks}, strain ${F.strain}, unknowns ahead ${F.surprises}, and no meter is in the red even though ${F.weeks} weeks were spent.`,
  ],
  keyIdeas: [
    `A facade lets one route move at a time and be switched back: in this model search served at 100% puts ${F.searchError} of requests wrong and risks no writes, while checkout served at 100% for ${F.minutes} minutes risks ${F.lost} (a common practice, not a rule).`,
    `Shadow traffic leaves users with the monolith's answers: with checkout mirrored, about ${F.mismatchPerMin} requests a minute differ (${F.mismatchRate}) and the user-visible error rate stays ${F.shadowError}.`,
    `A rollback is safe while the old store still has the writes: with dual-write off the ${F.lost} writes of an hour of full checkout traffic sit in the new store alone, and with it on they read ${F.lostWithDual}, at the price of maintaining a doubled write path.`,
    `No path through the story wins: in this model, of ${F.paths} paths, ${F.calmPaths} keep every meter out of the red, none is best on every meter, and each spends some weeks (whether to start with a read-only route or the riskiest one is one view: it depends on risk against early learning).`,
  ],
  quiz: [
    {
      q: 'Which route should a migration peel off first?',
      options: [
        'Always the highest-traffic route, because it proves the most about the new stack and so cuts the risk',
        'It depends: low risk favours a read-only route, early learning favours the riskiest one',
        'Always the smallest route, because small steps are the safest way to start any large migration',
        'The route the monolith team dislikes most, so that their pain is the first thing to be retired',
      ],
      answer: 1,
      why: `It depends on risk against early learning, and both are defended in practice (one view): in this lesson's story peeling search first adds ${F.a1Weeks} weeks and ${F.a1Incidents} incidents, while peeling checkout first adds ${F.a2Weeks} weeks and ${F.a2Incidents} incidents but retires ${F.a2Unknowns} unknowns instead of ${F.a1Unknowns}.`,
    },
    {
      q: 'In shadow mode the facade mirrors requests to the new service. What do users see?',
      options: [
        "The monolith's answers; the new service only has its answers compared and logged",
        "The new service's answers, with the monolith kept running as a silent backup behind it",
        'A blend of both answers, averaged field by field before the reply is returned to the user',
        'An error whenever the two answers differ, so that every mismatch gets noticed quickly',
      ],
      answer: 0,
      why: `Mismatches are counted, not shown: with checkout in Shadow the page reads about ${F.mismatchPerMin} mismatches a minute and a user-visible error rate of ${F.shadowError}, the same as without it.`,
    },
    {
      q: `Search is routed 100 percent and checkout 50 percent, with defect rates of ${F.defectSearch} and ${F.defectCheckout} percent and traffic shares of ${F.trafficSearch} and ${F.trafficCheckout} percent. What share of all requests fail?`,
      options: [
        `${F.checkoutAloneError.replace('%', '')} percent, which treats checkout as if it were fully routed to the new path`,
        `${F.defectSearch + F.defectCheckout} percent, the plain sum of the two defect rates of the routes involved`,
        `${F.searchError.replace('%', '')} percent, since only the read-only route can possibly count towards the total`,
        `${F.halfError.replace('%', '')} percent: ${F.searchError.replace('%', '')} from search plus ${F.halfCheckoutPart.replace('%', '')} from checkout, once each is scaled by its traffic share`,
      ],
      answer: 3,
      why: `Each route counts its traffic share times its routed share times its defect rate: ${F.searchError} from search plus ${F.halfCheckoutPart} from checkout is ${F.halfError} of the requests.`,
    },
    {
      q: `Checkout is fully cut over for 60 minutes with dual-write off, at ${F.writesPerMin} writes a minute. What does a rollback cost?`,
      options: [
        'Nothing, because the monolith still holds its own copy of every write that was made meanwhile',
        `Only ${F.writesPerMin} writes, those of the final minute before the rollback takes place`,
        `${F.lost} writes, all of which exist only in the new store after the cutover`,
        `${F.lostHalf} writes, because only half of the writes are important enough to keep`,
      ],
      answer: 2,
      why: `In this model the loss is routed share times writes a minute times minutes since cutover: 1 x ${F.writesPerMin} x 60 = ${F.lost}, and ${F.lostHalf} at a 50% share; dual-write on makes it ${F.lostWithDual}.`,
    },
    {
      q: 'Why do migrations often stall near the end?',
      options: [
        'Because the new system turns out to be slower for the last slices of traffic that move over',
        'Rarely used routes tend to have the weakest tests and owners, so the last slices cost a lot',
        'Because the facade stops working correctly once more than 90 percent of traffic is routed',
        "Because the team's first slices were picked at random, which leaves the hardest ones for last",
      ],
      answer: 1,
      why: `One view, not a measurement: in this lesson's story the tail (${F.tailTraffic}% of traffic, the weakest tests) adds ${F.c1Weeks} weeks to finish, or ${F.c2Weeks} weeks and a strain that rises by ${F.c2Strain} if it stays on the monolith.`,
    },
  ],
};

export default lesson;
