import { humanDuration } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { NO_KEY_SEED } from './sagaCheck';
import { Stage } from './Stage';
import { SCENE_DOWN_MS } from './twoPc';
import { CHECK_SEEDS, EARLY_COMMIT_SEED } from './twoPcCheck';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When one business action spans several services with separate databases, there is no single transaction to wrap it in. Two-phase commit and sagas are the two classic ways to keep it atomic, and each gives up something different.',
    what: 'Two-phase commit (2PC) has a coordinator ask each participant to prepare (do the work tentatively, lock it, vote yes or no), then tell the participants to commit or abort. It is atomic, but participants hold locks while they wait, and if the coordinator dies after the votes they stay blocked until it comes back. A saga instead runs a sequence of local transactions that each commit immediately; if a later step fails, it runs compensating actions (refund, cancel) in reverse. A saga holds no locks across services, but each local transaction still locks its own rows, and the saga gives up isolation: other readers can see the half-finished state, and each step has to be safe to retry.',
    analogy: '2PC is a wedding: the officiant asks both people "do you?" and nobody is married until both say yes, but if the officiant faints mid-ceremony everyone just stands there. A saga is booking a trip piece by piece: flight, then hotel, then car, and if the car falls through you cancel the hotel and the flight.',
    useCases: [
      'E-commerce checkout across order, payment and inventory services',
      'Travel bookings spanning airlines, hotels and car hire',
      'XA transactions across databases and message brokers (2PC)',
      'Workflow engines that run sagas: Temporal, AWS Step Functions, Camunda',
    ],
    why: 'Splitting a monolith into services quietly removes the database transaction that used to keep your data consistent. Engineers are expected to recognise when an operation spans services, choose between blocking atomicity and eventual consistency, and design compensations and idempotency up front.',
    watch:
      'Each box is a service and its border is its state: blue is working or a request, yellow is prepared and holding a lock (a padlock), green is committed, red is a NO vote, a failure or a crash (a dashed outline and an explosion mark; an ABORT decision is red too), violet is compensated, grey is idle or a participant that rolled back after an abort. The pills are messages in flight, coloured the same way, with grey for acks. The red pill in the middle, blocked for some time, is how long a participant has held its lock waiting for a decision, read from the simulated clock. The Consistency stat is computed from the services\' state after every event, and a red bar appears when the safety rule breaks. Customer #2, with a red line to Inventory, appears when it asks for the locked item. The chips say what is simulated, illustrative or from memory.',
  },
  tryThis: [
    'In Two-phase commit, "Everyone votes yes" (clean network, seed 1), step through: three PREPARE messages, three YES votes, the coordinator logs COMMIT, three COMMIT messages and three acks. The Locks stat climbs to 3 and falls back to 0.',
    `Pick "Coordinator crashes before deciding" and step to the end: the participants hold their locks, the blocked pill reads about 30 s when Customer #2 asks for SKU-7 and ${humanDuration(SCENE_DOWN_MS / 1000)} when the coordinator restarts, reads a log with no decision and aborts.`,
    'Compare 2PC "Inventory votes no" with Saga "Step 3 fails": the first never charges the card, the second charges and then refunds. In the saga, watch the Consistency stat: it reads "charged, can\'t ship" for a while, and the last caption says for how long.',
    `Pick Rules "Commit after 2 YES votes" (it loads seed ${EARLY_COMMIT_SEED}, "Inventory votes no" and a lossy network) and step to the end: Payments commits while Inventory has aborted and a red bar says so. Press "Check ${CHECK_SEEDS} seeds, crash at every step" to see how many seeds break atomicity; switch back to the real protocol on the same seed and nothing breaks.`,
    `In Saga, "Step 3 fails", pick Rules "No idempotency key" (it loads seed ${NO_KEY_SEED.orch} and a lossy network): a repeated charge request charges again and a red bar reports the double charge. Switch back to the real protocol on the same seed: the key makes the repeat harmless.`,
  ],
  keyIdeas: [
    '2PC is prepare (vote) then commit or abort. In this model it is atomic, but the participants hold their locks and block while the coordinator is down.',
    'A saga is a chain of local transactions; on failure it runs compensating actions in reverse order. A compensation is a new action, not an undo, and other readers can see the data in between.',
    'Messages get retried and duplicated, so a saga step needs an idempotency key: in this model, without it a repeated charge request charges the customer twice.',
    'The checks here are samples: in this model atomicity held over 200 seeded fault schedules and every crash point of each, which is evidence and not a proof for a real system.',
  ],
  quiz: [
    {
      q: 'In 2PC, all participants voted YES and then the coordinator crashed before sending the decision. What can the participants do on their own?',
      options: [
        'Commit right away, because all three of the participants voted yes',
        'Abort after a timeout, which releases the locks safely',
        'Nothing safe: wait with locks held until the decision is known',
        'Elect a new coordinator among themselves and roll back',
      ],
      answer: 2,
      why: 'Each participant knows just its own vote. It cannot know the decision, so it has to wait, and that is why 2PC is called blocking.',
    },
    {
      q: 'A saga has charged the card (step 2) and then step 3, reserving stock, fails. What happens next?',
      options: [
        'The Orders and Payments databases both roll back by themselves',
        'Compensating actions run in reverse: a refund, then a cancel',
        'The saga keeps retrying step 3 until stock appears',
        'Nothing happens until the customer contacts support',
      ],
      answer: 1,
      why: 'Earlier steps are already committed in other databases, so they have to be undone by new, compensating transactions.',
    },
    {
      q: 'Why does a saga step need an idempotency key?',
      options: [
        'Because the steps of a saga run in parallel on separate machines',
        'Because a message can arrive twice and must not charge twice',
        'Because compensations are optional in a well-built saga',
        'Because two-phase commit asks for one in its prepare step',
      ],
      answer: 1,
      why: 'Networks and brokers retry and duplicate. An idempotency key lets a service recognise a repeat and return the original result.',
    },
    {
      q: 'After a saga refunds a charge, what is the state of the earlier charge?',
      options: [
        'It never happened, because the refund removes the charge itself',
        'It happened and a new refund transaction reversed it, so both show',
        'It stays pending until the bank confirms that the refund went through',
        'It is hidden from the other services from the moment of the refund',
      ],
      answer: 1,
      why: 'A compensation is not a rollback. The charge was committed and visible, and the refund is a second transaction, so the data was inconsistent in between.',
    },
    {
      q: 'A participant voted YES and the coordinator has gone quiet. Why can it not simply abort by itself?',
      options: [
        'The coordinator may already have committed and told the others',
        'Its vote was signed, so changing course would break the signature',
        'Aborting would double the number of messages the coordinator sends',
        'Its database cannot roll back once a lock has been taken on a row',
      ],
      answer: 0,
      why: 'Aborting alone could split the outcome: some participants commit while this one aborts. Waiting is the price of atomicity in 2PC.',
    },
  ],
};

export default lesson;
