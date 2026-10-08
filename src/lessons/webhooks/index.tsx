import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A webhook is the provider calling your endpoint when something happens. Each delivery is signed so you can tell it is real, retried until you answer 2xx, and may arrive twice or out of order, so you verify, reply fast, and handle every event idempotently.',
    what: 'The provider sends an HTTP POST per event with a timestamp and an HMAC-SHA-256 signature over `timestamp.body`. Your endpoint recomputes it with the shared secret, compares it in constant time, and rejects a timestamp outside a tolerance (5 minutes here) so a recorded delivery can\'t be replayed later. A 2xx stops the retries; an error or a timeout makes the provider retry with growing waits, so delivery is at least once: duplicates and reordering are normal. Reply 2xx quickly, store the event, and process it from your own queue; dedupe by event id and either compare event timestamps or fetch the current state. Nothing here is exactly-once.',
    analogy: 'A courier who rings your bell and has you sign. If nobody answers, they come back later, and again, and if your signature slip is smudged they won\'t leave the parcel. They might even deliver the same parcel twice if your "got it" got lost, so you check your own list before opening a second one.',
    useCases: [
      'Payment providers (Stripe, PayPal) telling you a charge succeeded, failed or was refunded',
      'GitHub or GitLab calling your CI when code is pushed',
      'Shipping, e-commerce and messaging platforms notifying your app of an order or a delivery',
      'Internal systems that push events to subscribers instead of being polled',
    ],
    why: 'Webhooks feel like a simple POST until production: a missing signature check lets anyone who finds the URL feed you events, slow handlers cause retry storms, and unhandled duplicates send two receipt emails or ship an order twice. It builds on `macs-hmac` (the signature), `message-queues` (the provider\'s delivery queue and yours), `idempotency-keys` (the same at-least-once reasoning) and `http-basics` (status codes).',
    watch: 'Deliveries are blue; a verified signature is green and a failed signature, a stale timestamp or a 400 is red. In Signatures the sent and recomputed signatures are shown digit by digit, with each differing digit red, and the receiver\'s check lines turn green until the one that fails, which is red. In Receiver offline a retry of a failed attempt is orange on the ladder and the timeline, a delivered attempt is green, and the receiver being down is a red dashed bar and a red dashed lifeline. In Duplicates & order the current delivery is a yellow row, a duplicate that dedup dropped is dimmed, an event that arrives out of order is flagged violet, and the final status is green when it matches the provider\'s truth and red when it doesn\'t, with a repeated effect in red. In Reply fast the first attempt is blue, retries orange, the receiver\'s internal queue violet, a 2xx green, and a reply lost to the timeout and repeated work red.',
  },
  tryThis: [
    'In Signatures, switch Body in transit to One character edited: how many of the 64 hex digits change, and which check line fails?',
    'In Signatures, drag Arrives to 6 min with the body unchanged: why is a valid signature still rejected, and what does 5 min do?',
    'In Receiver offline, move Receiver comes back at to 20: when does the first event get through, and what happens at 175?',
    'In Duplicates & order, press play on the default, then turn Dedupe on and switch Handle order by to Compare event timestamps: what changes?',
    'In Reply fast, leave The work takes at 20 s and press play, then switch Reply to Ack first, work later.',
  ],
  keyIdeas: [
    'Verify every delivery: HMAC-SHA-256 over `timestamp.body`, compared in constant time, with a timestamp tolerance against replays.',
    'Delivery is at least once and unordered: the provider retries on non-2xx and on timeouts, so duplicates and reordering are normal.',
    'Make the consumer idempotent: dedupe by event id, and apply by event timestamp or fetch the current state.',
    'Reply 2xx quickly after storing the event, then process asynchronously, or slow work turns into timeouts and repeat deliveries.',
  ],
  quiz: [
    {
      q: 'A teammate says the webhook URL is long and random, so nobody else can call it and no signature check is needed. What is wrong with that?',
      options: [
        'URLs leak through logs and configs; only the signature proves origin',
        'Nothing: a long random URL is exactly as strong as a keyed HMAC signature check',
        'Long URLs are slower to route, so the provider will time out',
        'Providers refuse to call any URL that carries no signature',
      ],
      answer: 0,
      why: 'A URL is an address that ends up in dashboards, logs and tickets, and anyone who learns it can POST to it. The signature proves the sender knew the shared secret. A long URL is not a credential, and routing speed and provider rules have nothing to do with it.',
    },
    {
      q: 'Why does the signature cover timestamp.body rather than just the body?',
      options: [
        'So a recorded delivery replayed later can be rejected by its age',
        'So the body can be encrypted before it is signed and sent on',
        'So the receiver can skip comparing the signatures at all',
        'Because HMAC cannot sign a body that has no dot in it',
      ],
      answer: 0,
      why: 'If only the body were signed, a captured delivery would stay valid forever. With the timestamp inside the MAC, an attacker cannot change it to look fresh, so the receiver can refuse anything older than the tolerance. HMAC does not encrypt, and the receiver still compares the signatures.',
    },
    {
      q: 'Your endpoint is down for an hour. What does a typical provider do with the events it could not deliver?',
      options: [
        'Retries each on a backoff schedule and delivers when you answer 2xx',
        'Drops them at once and creates a brand-new event for each when you are back',
        'Holds them all and sends them together, in order, exactly once',
        'Marks the endpoint as removed after its first failed attempt',
      ],
      answer: 0,
      why: 'Providers retry with growing waits until a 2xx or the end of their schedule, which is why events arrive late and may arrive twice or out of order. Policies differ, so read your provider\'s documentation. Exactly-once, in-order delivery is not something a retrying sender can promise.',
    },
    {
      q: 'The same payment.succeeded event, with the same id, arrives twice. Which handler is correct?',
      options: [
        'Look the id up in a seen table and skip it if it is there',
        'Process it both times, because the provider chose to send it twice',
        'Ignore every event whose payload matches an earlier payload',
        'Reject the second with a 4xx so the provider stops retrying',
      ],
      answer: 0,
      why: 'At-least-once delivery means repeats are expected, so the handler records ids it has handled and skips repeats, while still answering 2xx so the provider stops. Processing twice sends two emails. Matching on payload can drop a legitimate second event, and a 4xx makes many providers retry.',
    },
    {
      q: 'A payment.refunded event arrives before the payment.succeeded event for the same payment. How can the receiver still end at the right status?',
      options: [
        'Apply only events newer than the last one, or fetch the current state',
        'Always apply the event that arrived last, as it is the newest',
        'Refuse any event that arrives before an earlier-numbered one',
        'Wait a fixed minute for the missing event, then give up on it and move on',
      ],
      answer: 0,
      why: 'Arrival order is not event order, so "last to arrive wins" ends at succeeded here: the tempting mistake. Comparing the event\'s own timestamp, or treating the payload as a hint and reading the current state from the provider, ends at refunded whatever the arrival order.',
    },
  ],
};

export default lesson;
