import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An idempotency key is a unique id the client generates for one operation and sends with every retry of it, so the server can recognise a repeat and return the stored result instead of charging the card again.',
    what: 'When a POST times out the client can\'t know whether the server acted, so it must retry, and a plain retry can charge twice. With an `Idempotency-Key` header the server stores the key with a fingerprint of the body and, once done, the response, in the same transaction as the charge. A retry with the same key gets the stored response replayed; the same key with a different body is refused (422 in the IETF draft); a retry while the first is still running is told to wait (409). The key has to be claimed atomically before the work starts, and kept longer than clients keep retrying. Delivery stays at least once; the key makes the effect happen once.',
    analogy: 'A cloakroom ticket: hand in your coat and get ticket 42. Come back with 42 twice and you get the same coat, not two coats; come back with 42 and a different coat description and the attendant knows something is wrong.',
    useCases: [
      'Payment APIs (Stripe, Adyen and others) that accept an Idempotency-Key on every POST',
      'A mobile app retrying "place order" after the network dropped mid-request',
      'A gateway or SDK that retries timed-out POSTs only when they carry a key',
      'Job queues and webhooks, where the consumer dedupes by a message or event id',
    ],
    why: 'Double charges and duplicate orders are some of the most expensive bugs a junior can ship, and they come from code that "just retries". Every retry policy, gateway or SDK you touch needs an answer to "what if the first one worked?". It builds on `http-basics` (which methods are idempotent), `rest-api-design` (POST creates), `transactions-acid` (store the key with the charge) and `circuit-breakers` (when to stop retrying).',
    watch: 'The ladder has three lifelines: Client (blue head), Payment API and Ledger. Requests are blue arrows, the current message is yellow, and a lost message is red, stopping partway with a ✕. A charge confirmed by the ledger is green, or red if it is a second charge for the same payment. A replayed stored response is violet, a 409 or 422 refusal orange (a correct refusal, not a failure), and a response the client stopped waiting for is dimmed; grey arrows are the server\'s own key checks and the client\'s timeouts. In the Ledger the first charge has a green bar and a duplicate is a red row marked "duplicate". In the Key store a key in progress is a yellow-tinted row with a padlock, and the stored response turns violet while it is being replayed. The failure chips are red. In Retry policy each blue tick is one retry attempt on a client\'s lane.',
  },
  tryThis: [
    'With "2 · response lost" and No key, press play: how many ledger rows? Then switch to Send a key and play again.',
    'Pick "3 · client times out" with Send a key and raise Retries while still running to 3: what does each retry get?',
    'In Concurrent retries, switch Key store to Look up, write after and play: where does the second charge come from?',
    'In Reuse & expiry, move Retry arrives after to 25 h: why is the card charged again? Then try A different amount at 1 h.',
    'In Retry policy, compare Exponential with Exponential + jitter: when does each client\'s last retry land?',
  ],
  keyIdeas: [
    'A timed-out POST may have worked: the server can\'t tell a retry from a new request unless the client sends a key.',
    'Store key → body fingerprint → response with the side effect, atomically; replay it on a repeat.',
    'Same key, different body → refuse (422); still in progress → 409; claim the key before doing the work.',
    'Keep keys longer than the retry window, and back off with jitter: delivery is at least once, the effect once.',
  ],
  quiz: [
    {
      q: 'A POST /payments times out. Why is "just retry it" risky without an idempotency key?',
      options: [
        'The first may have charged, and a retry looks like a new payment',
        'A timeout means the request never reached the server, so it\'s lost',
        'Servers reject any second POST from the same client automatically',
        'HTTP forbids retrying a POST, so the retried request will just fail',
      ],
      answer: 0,
      why: 'A timeout only says no answer arrived in time: the request may have been lost, or the charge done and the response lost. The server sees two identical POSTs and has no way to know the second is a repeat, so it charges again. Nothing in HTTP stops the retry; that is the problem.',
    },
    {
      q: 'How can the server tell a retry from a genuinely new payment for the same amount?',
      options: [
        'The client resends the same Idempotency-Key it made for that payment',
        'It compares the client\'s IP address and the time of each request',
        'It looks for a payment with the same amount in the last hour or so',
        'HTTP marks retried requests with its own built-in retry header flag',
      ],
      answer: 0,
      why: 'Only the client knows which attempts belong to one operation, so it generates the key once and repeats it. The amount and IP can match two real payments (two coffees), which is why guessing by content is the tempting wrong answer. HTTP has no retry marker.',
    },
    {
      q: 'A request reuses a key that was first used for €25, but this time asks for €99. What should the server do?',
      options: [
        'Refuse it, 422 in the draft: the key belongs to another payment',
        'Charge €99 and overwrite the stored response with the new one',
        'Replay the €25 response, since the key itself already matched',
        'Charge both and leave the customer to dispute the extra amount',
      ],
      answer: 0,
      why: 'The fingerprint stored with the key doesn\'t match, so this is a client bug, not a retry. Replaying the €25 result would tell the client its €99 payment succeeded when it didn\'t, the most tempting mistake here. The IETF draft says 422; some APIs use 400 or 409.',
    },
    {
      q: 'A retry with the same key arrives while the first request is still charging the card. What is the safe answer?',
      options: [
        '409 Conflict: still in progress, so retry a little later',
        'Run it as well; whichever finishes second gets ignored',
        '201 Created straight away, before the first one finishes',
        'Hold the connection open for as long as the first takes',
      ],
      answer: 0,
      why: 'The key is claimed as "in progress" before the work, so the twin is turned away and retries later to get the stored response. Running it too charges twice: "ignoring the second result" doesn\'t undo its charge. Answering 201 early would claim a success that hasn\'t happened.',
    },
    {
      q: 'The server keeps keys for 24 hours, but a client may retry for up to 3 days. What goes wrong?',
      options: [
        'A retry after 24 h looks brand new, and the card is charged again',
        'The server keeps extending the key on every retry, so it never expires',
        'Nothing at all: an expired key is simply rejected with a 422 instead',
        'The ledger dedupes it later by comparing the amounts of the payments',
      ],
      answer: 0,
      why: 'Once the key is forgotten, the server has nothing to compare against, so the late retry is processed as a new payment. Keep keys longer than the client\'s whole retry window. An expired key isn\'t an error, and amounts can\'t tell a retry from a second real payment.',
    },
  ],
};

export default lesson;
