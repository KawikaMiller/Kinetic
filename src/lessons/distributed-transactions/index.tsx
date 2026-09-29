import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When one business action spans several services with separate databases, there is no single transaction to wrap it in. Two-phase commit and sagas are the two classic ways to keep it all-or-nothing, and each gives up something different.',
    what: 'Two-phase commit (2PC) has a coordinator ask every participant to prepare (do the work tentatively, lock it, vote yes or no), then tells them all to commit or abort. It is atomic, but participants hold locks while they wait, and if the coordinator dies after the votes they are stuck. A saga instead runs a sequence of local transactions that each commit immediately; if a later step fails, it runs compensating actions (refund, cancel) in reverse. Sagas stay available and lock-free, but the system is temporarily inconsistent and every step must be safe to retry.',
    analogy: '2PC is a wedding: the officiant asks both people "do you?" and nobody is married until both say yes, but if the officiant faints mid-ceremony everyone just stands there. A saga is booking a trip piece by piece: flight, then hotel, then car, and if the car falls through you cancel the hotel and the flight.',
    useCases: [
      'E-commerce checkout across order, payment and inventory services',
      'Travel bookings spanning airlines, hotels and car hire',
      'XA transactions across databases and message brokers (2PC)',
      'Workflow engines that run sagas: Temporal, AWS Step Functions, Camunda',
    ],
    why: 'Splitting a monolith into services quietly removes the database transaction that used to keep your data consistent. Staff-level engineers are expected to recognise when an operation spans services, choose between blocking atomicity and eventual consistency, and design compensations and idempotency up front.',
    watch: 'Each box is a service with its own database; its border and status chip show its state. Blue means working, yellow means prepared and holding locks (look for the 🔒), green means committed, red means failed or aborted, and violet means compensated. Pills are messages flying between services; in choreography they travel along the purple event bus. The "blocked for" badge counts how long prepared participants have been stuck waiting.',
  },
  tryThis: [
    'Two-phase commit → "Coordinator crashes". Watch the locks stay held and Customer #2 get stuck behind them.',
    'Compare "Inventory votes no" in 2PC with "Step 3 fails" in a saga. One never charged the card; the other charged and then refunded.',
    'Watch the Consistency stat during a failing saga: there is a moment where the card is charged for an order that can\'t ship.',
    'Switch the saga to Choreography: the same steps happen, but nobody is in charge.',
  ],
  keyIdeas: [
    '2PC: prepare (vote) then commit/abort. Atomic, but participants block holding locks if the coordinator fails.',
    'Saga: a chain of local transactions; on failure, run compensating actions in reverse order.',
    'Sagas are eventually consistent: intermediate states are visible, and a compensation is a new action, not an undo.',
    'Every step and compensation must be idempotent, because messages get retried.',
  ],
  quiz: [
    {
      q: 'In 2PC, all participants voted YES and then the coordinator crashed before sending the decision. What can the participants do?',
      options: [
        'Commit, since everyone voted yes',
        'Abort, to be safe',
        'Nothing safe on their own: they must wait, holding their locks, until the decision is known',
        'Elect a new coordinator and roll back automatically',
      ],
      answer: 2,
      why: 'Each participant only knows its own vote. It can\'t know the decision, so it has to wait. That\'s why 2PC is called blocking.',
    },
    {
      q: 'A saga has charged the card (step 2) and then fails to reserve stock (step 3). What happens?',
      options: [
        'The database rolls back steps 1 and 2 automatically',
        'Compensating actions run in reverse: refund the charge, then cancel the order',
        'The saga retries step 3 forever',
        'Nothing; the customer contacts support',
      ],
      answer: 1,
      why: 'Earlier steps are already committed in other databases, so they have to be undone by new, compensating transactions.',
    },
    {
      q: 'Why must saga steps be idempotent?',
      options: [
        'Because sagas run in parallel',
        'Because messages can be delivered more than once, so a retried "charge $40" must not charge twice',
        'Because compensations are optional',
        'Because 2PC requires it',
      ],
      answer: 1,
      why: 'Networks and brokers retry. An idempotency key lets a service recognise a repeat and return the original result.',
    },
  ],
};

export default lesson;
