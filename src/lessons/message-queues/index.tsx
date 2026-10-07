import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A message queue sits between the code that produces work and the code that does it, so each side can run at its own pace and a crash on one side doesn\'t lose the work.',
    what: 'Producers publish messages to a broker, which stores them in order until a consumer takes one. The consumer processes it and sends an acknowledgement (ack); only then does the broker delete it. If no ack arrives the message is redelivered, so delivery is "at least once". Messages that keep failing are moved to a dead-letter queue instead of blocking everything behind them.',
    analogy: 'A restaurant ticket rail. Waiters clip orders on as fast as customers order; cooks pull them off as fast as they can cook. A rush just makes the rail longer, and if a cook walks out, their ticket goes back on the rail.',
    useCases: [
      'Sending emails, resizing images and generating reports in the background instead of during the web request',
      'Absorbing traffic spikes so a slow database or third-party API isn\'t overwhelmed',
      'Fanning one event ("order placed") out to many services with pub/sub',
      'RabbitMQ, Amazon SQS/SNS, Google Pub/Sub, Kafka',
    ],
    why: 'Queues are the standard way to decouple services and move slow work off the request path. Mid-level engineers are expected to handle what they bring: backlogs, redelivery, duplicate processing and poison messages.',
    watch: 'Blue envelopes are messages flowing from the producers into the queue; the head of the queue is on the right. A worker\'s green progress bar shows it processing, and acked messages turn green and leave. A yellow outline marks a redelivered message, violet is a poison message, and red means a crashed worker or a message in the dead-letter queue. The yellow ring labelled "no ack" counts down until the broker redelivers.',
  },
  tryThis: [
    'Leave the defaults running and watch the backlog climb. Then raise Consumers to 4 and watch it drain.',
    'Crash a consumer mid-message. Its message comes back; watch for "processed twice".',
    'Send a poison message and follow it: retry, retry, then the dead-letter queue.',
    'Switch to Pub/sub fan-out: the slow analytics subscriber falls behind without holding up the others.',
  ],
  keyIdeas: [
    'A queue decouples producers and consumers: each can scale, slow down or restart independently.',
    'If consumers are slower than producers, the backlog grows forever. The queue only buys time.',
    'Acks give at-least-once delivery: a crash means redelivery, so consumers must be idempotent.',
    'Work queue = each message to one consumer; pub/sub = a copy to every subscriber.',
  ],
  quiz: [
    {
      q: 'A consumer charges a card, then crashes before acking. What happens next?',
      options: [
        'It is lost, because the consumer never acked',
        'It is redelivered; the card may be charged twice',
        'The broker automatically rolls the charge back for you',
        'The producer is told to publish a fresh copy',
      ],
      answer: 1,
      why: "Without an ack the broker assumes the work didn't happen and redelivers. Idempotency keys make a repeat harmless.",
    },
    {
      q: 'Producers publish 100 msg/s and your consumers handle 80 msg/s in total. What happens to the queue?',
      options: ['It stays at about the same size', 'It grows by about 20 every second', 'It drops 20% of the new messages', 'Consumers speed up to match the load'],
      answer: 1,
      why: 'Any sustained gap between arrival and processing rate becomes backlog. You need more or faster consumers.',
    },
    {
      q: 'What is a dead-letter queue for?',
      options: [
        'Messages that were delivered successfully',
        'Messages that keep failing, set aside',
        'Messages whose producer has crashed',
        'Extra copies made by duplicate sends',
      ],
      answer: 1,
      why: 'After a few failed attempts a poison message is set aside for inspection instead of blocking the main queue or being retried forever.',
    },
    {
      q: 'With acks and redelivery, is each message processed exactly once?',
      options: [
        'Yes: acks guarantee exactly-once processing',
        'No: at least once; a crash can repeat work',
        'Yes, unless the broker itself crashes too',
        'No: at most once, since some get dropped',
      ],
      answer: 1,
      why: 'If a consumer does the work and dies before acking, the broker redelivers and the work runs again. Acks rule out loss, not repeats; idempotent consumers make repeats safe.',
    },
  ],
};

export default lesson;
