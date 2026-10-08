import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'One message that always fails can block an ordered queue for good: cap the retries, park the failure in a dead-letter queue with its error, then fix it and redrive it.',
    what: 'A consumer reads an ordered partition one message at a time. If one message makes the handler throw every time (a poison message), "retry forever" holds it at the head and everything behind it waits. Limiting the attempts, with growing waits between them, moves it to a dead-letter queue (DLQ) with its error and attempt count: the lane drains and the message is parked, not lost. Dropping on error drains the lane too, but silently. A down dependency is a different problem: every message fails, so a naive limit parks good ones. Once the bug is fixed, a redrive puts parked messages back on the main queue as new deliveries.',
    analogy: 'A conveyor belt with a jammed parcel: you can keep shoving at it while every parcel behind it piles up, throw it in the bin, or lift it into a "problem parcels" crate to open later.',
    useCases: [
      'Queue consumers on SQS, RabbitMQ or Kafka, where a DLQ is either a built-in feature or a convention',
      'Webhook and email pipelines, where one malformed payload must not stop the rest',
      'Order and payment events, where a failed message has to be reviewed rather than lost',
      'On-call dashboards that alert when a DLQ\'s depth is above zero',
    ],
    why: 'A single bad message stalling a whole pipeline is one of the classic ways for a queue to turn into an outage, and "retry forever" feels safe right up until it is that outage. Telling a bad message from a bad day decides whether you park it or pause. It builds on `message-queues`, which owns acknowledgements and at-least-once delivery, and a redrive is only safe if the consumer is idempotent, as in `idempotency-keys`.',
    watch: 'The lane is the ordered partition. Cells outlined in blue are waiting, the cell ringed in yellow under the "consumer" pointer is being handled, and a solid red cell is the poison message; an orange ring means that message is on a retry attempt. Violet is parked in the DLQ (parked, not lost) and green is processed. The red ✕ counter is data dropped for good. In Redrive the orange counter is work done twice, and dashed violet chips are redriven messages. The DLQ alarm turns orange once its depth is above zero. The sparkline is lag over time.',
  },
  tryThis: [
    'Leave it on Retry forever and press play: watch Lag and Oldest waiting climb behind #4. Does switching on Backoff change that?',
    'Switch to Max attempts: how many times is #4 tried before it is parked? Then turn on Classify errors, press Reset and watch it parked on its first attempt.',
    'Pick Drop on error: the lane drains at once. Look at the red ✕ counter: what did you just give up?',
    'Open Dependency down and let the outage run with its defaults (3 attempts, no backoff): how many good messages land in the DLQ? Then switch Pause on and press Reset.',
    'In Redrive, press Redrive DLQ with the bug not fixed: the same three come straight back, and Work repeated already reads 2. Reset, set the bug to Fixed and redrive, then Reset again and turn dedupe on first.',
  ],
  keyIdeas: [
    'In an ordered partition a message that always fails blocks everything behind it if you retry forever: lag and message age grow without bound.',
    'Cap attempts, space them with backoff and park the failure in a DLQ with its error and attempt count. Parked is not lost, but it is not fixed either, so alert when the DLQ is not empty.',
    'Tell a bad message from a bad day: a validation error will never succeed, but a timeout from a down dependency will. Classify errors, and pause consumption rather than burn every message\'s attempts.',
    'A redrive delivers parked messages out of order, and any work they already did runs again unless the consumer is idempotent.',
  ],
  quiz: [
    {
      q: 'An ordered partition has one message that always throws, and the policy is "retry forever". What happens to the messages behind it?',
      options: [
        'They wait, and lag grows for as long as the bad message sits at the head',
        'They are skipped after a few attempts and then processed normally',
        'They move to the DLQ together with the message that is failing',
        'They are processed in parallel by whichever other consumers happen to be free right then',
      ],
      answer: 0,
      why: 'An ordered partition feeds one consumer in strict order, so the head message must finish before the next one starts. Retrying forever never finishes, and nothing behind it moves. Parallel consumers would break the ordering the partition promises.',
    },
    {
      q: 'Why is a dead-letter queue not a fix on its own?',
      options: [
        'It only parks the message: someone has to notice, fix the cause and redrive',
        'It deletes failed messages quietly so that the main queue stays small',
        'It keeps retrying each parked message again and again in the background until the handler finally succeeds',
        'It stops the producer from sending any more messages of the same kind',
      ],
      answer: 0,
      why: 'The DLQ keeps the message and its error so nothing is lost, but nothing happens to it by itself. A DLQ that nobody watches is just a slower way to lose data, which is why its depth should raise an alarm.',
    },
    {
      q: 'The database is down for 20 s, so every message fails. With three attempts and no backoff, what happens?',
      options: [
        'Good messages burn their attempts within a fraction of a second and land in the DLQ',
        'Each message waits until the database returns, so none are ever parked',
        'The consumer notices the outage by itself and pauses until the database is available again',
        'Only the first message is parked and the rest wait their turn in the queue',
      ],
      answer: 0,
      why: 'Three attempts in a row take a fraction of a second, so every message exhausts them long before the outage ends. Waiting for the dependency would be retry forever, and a consumer only pauses if it is built to. In the simulation more than a hundred good messages are parked.',
    },
    {
      q: 'How can a consumer tell a poison message from a transient failure?',
      options: [
        'A validation error is about the message itself, while a timeout from a down dependency hits every message',
        'A poison message always fails in under a second, whereas a transient failure always takes much longer to fail',
        'Only a transient failure is counted, so a poison message shows no attempt number',
        'A transient failure is logged at a lower level, and a poison message is not logged',
      ],
      answer: 0,
      why: 'The error class carries the answer: a validation error will fail identically every time, so retrying only blocks the lane, whereas a timeout says nothing about the message and may well succeed later. Timing and log levels say nothing about which kind it is.',
    },
    {
      q: 'Why can redriving a DLQ still do harm after the bug is fixed?',
      options: [
        'Messages arrive out of order and repeat work they already did unless the consumer dedupes',
        'A redrive deletes the parked copies before the consumer has processed them',
        'A fixed consumer refuses any message that has been parked once before',
        'Every redriven message lands in the same DLQ again, whatever the fix',
      ],
      answer: 0,
      why: 'Redriven messages are new deliveries placed behind whatever is already waiting, and one that failed after doing part of its work will do that part again unless the consumer remembers its id. Redrive moves them back to the main queue rather than deleting them, and a fixed handler accepts them.',
    },
  ],
};

export default lesson;
