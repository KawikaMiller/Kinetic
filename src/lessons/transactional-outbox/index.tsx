import type { LessonModule } from '../../core/types';
import { PINNED } from './outbox';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Writing a database row and publishing an event are two writes to two systems, and a crash between them leaves one without the other. An outbox puts the event in the same transaction as the row and lets a relay publish it later, at least once.',
    what: 'A service that places an order inserts a row and publishes OrderPlaced. If it inserts first and crashes, the order exists and nobody hears of it; if it publishes first and crashes, the event is out for an order that does not exist. The outbox pattern writes the order and an outbox row in one local transaction, and a separate relay reads unsent rows, publishes them and marks them sent. A crash before the commit leaves neither row; a crash after leaves both, and the relay delivers later. The relay can crash between publish and mark and publish a row twice, so the consumer keeps an inbox of event ids. Reading the outbox by "id above the last one I saw" can skip a row that commits late.',
    analogy: 'Posting a letter and updating the ledger as two separate trips to two offices. A clerk who is interrupted between trips leaves the books and the post out of step. Writing the letter into the ledger first, and letting a courier collect unsent entries from it, means the ledger always says what still has to go out; the courier may deliver one twice.',
    useCases: [
      'Publishing an event after saving a record, such as an order, a payment or a signup',
      'Keeping a search index or another service in step with a database through events',
      'Reading an existing design that says "we save, then publish" and asking what a crash does',
      'Choosing between polling an outbox table and reading the database log',
    ],
    why: 'Missing and phantom events are some of the hardest bugs to see: nothing errors, a downstream system is just wrong. The fix needs the atomic boundary in the right place and a consumer that tolerates a repeat.',
    watch:
      'Green is a committed order or an outbox row already sent, yellow an outbox row not yet sent, and violet the atomic boundary: the order and its outbox row commit together, and a violet cell is an outbox id. Orange is a duplicate delivery or a doubly applied effect, which is expected rather than an error. Red is a ghost event (handled, with no order behind it) or a committed order whose event never arrives, and grey is an open transaction or an event skipped by the inbox. The ladder diagram leaves out the relay\'s empty polls. The chips say what is simulated, a toy, from memory or a practice.',
  },
  tryThis: [
    'At the defaults in "The dual-write bug" (database first, a crash between the steps) press play: order 1 is committed, the service crashes before it publishes, and the line under the table says "a lost event". Press "Publish first, then database": the same crash point now gives a ghost, an event for an order that does not exist.',
    'In the same scene press "Before step 1": nothing happens in either order. Press "The publish fails": database first loses the event, and publish first does nothing at all. Every cell of the table is a real run, and pressing one loads it.',
    'In "The outbox" the default crashes the relay between publish and mark: OrderPlaced is published twice and "Effects applied" reads 2. Turn on "Skips a seen event id": the repeat is skipped. Press "After the commit" instead: the relay delivers once, later.',
    'In "The polling trap" (id 42 commits first) the relay publishes 42, moves its cursor to 42 and never sees 41: "Orders without an event yet" stays at 1. Press "Read the commit log" and both events arrive, 42 first.',
    `In "Compared" the row "Dual write, database first" breaks "No loss" at seed ${PINNED.dbfirst.seed} and "Outbox, polling by id cursor" breaks it at seed ${PINNED['poll-cursor'].seed}. Turn on the inbox: "Effect once" turns green for the outbox rows, and "No loss" stays red for the cursor.`,
  ],
  keyIdeas: [
    'A write to a database and a publish to a broker cannot be made atomic from the service: in this model, database first can lose the event and publish first can send an event for an order that never exists.',
    'An outbox writes the order and an outbox row in one local transaction and publishes the rows afterwards: the event is not lost, but it can be published twice, so the consumer has to tolerate a repeat.',
    'Polling by "id above the last one seen" can skip a row, because ids are handed out in one order and transactions commit in another; reading the commit log avoids it, and re-scanning a margin narrows it, for a late row that lands within the margin (a row later than that is still skipped).',
    'An outbox gives at-least-once publishing, not exactly-once: an inbox of seen event ids on the consumer is what makes the effect happen once.',
  ],
  quiz: [
    {
      q: 'The service crashes after the database commit and before the publish. With a dual write what is lost, and what does an outbox do at restart?',
      options: [
        'The event is lost; with an outbox the relay finds the unsent row and publishes it',
        'The order is lost; with an outbox the relay writes it into the database again so it exists',
        'Nothing is lost; with an outbox the broker asks the service to republish the event on restart',
        'The event is lost; with an outbox the order is rolled back at restart so both are gone together',
      ],
      answer: 0,
      why: 'The commit already happened, and a dual write has no record that a publish is still owed. The outbox row committed with the order, so the relay still sees it as unsent.',
    },
    {
      q: 'Which description of an outbox with a polling relay is right?',
      options: [
        'It publishes each event exactly once, because the row is marked sent after the publish',
        'It publishes each event once or more, so the consumer has to cope with a repeat',
        'It publishes an event at most once, so some events can be lost when the relay crashes',
        'It publishes in one transaction with the order, so a repeat of an event cannot occur',
      ],
      answer: 1,
      why: 'The relay can crash after it published and before it marked the row, and then it publishes the row again. At-least-once publishing needs a consumer that recognises a repeat.',
    },
    {
      q: 'Two outbox rows get ids 41 and 42, and 42 commits first. A relay that reads "id above the last id seen" has just published 42. What happens to 41?',
      options: [
        'It is published next, in id order, as soon as its transaction commits',
        'It is published twice, because both ids fall inside the range being read',
        'It is skipped for good, because the cursor is already past it',
        'It is rolled back, because the later id committed before it did',
      ],
      answer: 2,
      why: 'The ids were handed out in one order and the transactions committed in another, so the row that commits late sits behind the cursor. Reading the commit log catches it, and so does re-scanning a margin, for a late row within that margin (a row later than that is still skipped).',
    },
    {
      q: 'Why can publishing first, then writing the row, produce a ghost?',
      options: [
        'The broker can rewrite the event after it has been published to the topic',
        'The row can be committed twice when the service retries the insert step',
        'A crash after the publish leaves an event with no order behind it',
        'The consumer can see the event before the broker has stored it on disk',
      ],
      answer: 2,
      why: 'Once the event is out it cannot be taken back. If the service dies before the insert, the consumer acts on an order that was not created.',
    },
    {
      q: 'What does the consumer\'s inbox of seen event ids protect against?',
      options: [
        'An event that was never published because the relay crashed before it ran',
        'A repeat of an event the relay published twice, so its effect applies twice',
        'An order that was committed after its event had already reached the consumer',
        'A row that commits late and is skipped by a poller reading by id cursor',
      ],
      answer: 1,
      why: 'The inbox turns a repeated delivery into a no-op. It cannot bring back an event that was not published, which is what the outbox is for.',
    },
  ],
};

export default lesson;
