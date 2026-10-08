import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Write each log line as data: the same named fields on every line, including a request ID the gateway creates once and every service repeats. Then one query returns a failed request's whole story, where a text search guesses.",
    what: 'In free text a line is a sentence, and whatever the author remembered to mention is all you can search for. A structured line is a record with a timestamp, level, service, message and IDs as separate fields, usually JSON, so a filter can use them. The gateway creates a request ID at the edge and passes it to every service in a header; each service puts it on every line it writes. A minimum level decides which lines are kept, and every kept line costs storage, so volume and cost follow the level. And some things never belong in a log, such as a card number: redact them before the line is written, or do not log the body at all.',
    analogy: 'A pile of handwritten notes against a spreadsheet: you can skim the notes for a name and hope, or sort the spreadsheet by the order number and see every row at once.',
    useCases: [
      'Following one failed request across a gateway and several services by its request ID',
      'Alerting and dashboards over fields like level, service and duration_ms instead of text patterns',
      'Choosing the minimum log level per environment, and the sampling and retention that go with it',
      'Redacting secrets and personal data before logs leave the process',
    ],
    why: 'When something breaks at 3am you search logs, and a search is only as good as the data in the line. Structured logs with a correlation ID turn "grep and hope" into an exact answer, and the level and redaction choices decide what it costs and what it risks. It builds on `observability` (logs are one of the signals), `data-formats` (JSON) and `regex-basics` (the pattern matching a text search relies on). Metrics and distributed traces are the other signals, and the request ID is where a trace ID would go next.',
    watch: "Each service has its own hue: sky is the gateway, amber orders, pink payments, violet inventory. Yellow marks the lines a search or filter matched, and the services on the failed request's path light up yellow in the diagram; lines that do not match are dimmed. Red lines are ERROR and orange lines WARN, except that a line your search matched stays yellow. In the cost scene the bar is green inside the budget and red over it, with the orange tick at the budget. In What not to log a card number is red until it is masked, and green once masked.",
  },
  tryThis: [
    "Starting from the default \"user 42\" search in Free text: it finds one of the failed request's lines, misses the rest, and also returns two lines from other requests. Then switch to Structured JSON and read the numbers again.",
    'In Structured JSON the default filter is the failed request\'s ID. Press "Replay the failed request" to watch the ID travel with the calls, then press the order_id chip: the gateway lines drop out, because the gateway never learns the order.',
    'In Structured JSON, type level>=WARN and then service=payments OR level>=ERROR: the first narrows the log, the second is refused because the syntax only has AND.',
    'Open Levels and cost, leave it at INFO, then press "Debug left on in production": the bar passes the orange budget line and the monthly figure jumps.',
    'Open What not to log: card numbers are already in the log. Turn Redact on to mask them, then set Log the full request body to No.',
  ],
  keyIdeas: [
    'A structured line is a record of named fields, so a filter can ask for exactly the lines you mean instead of guessing at words.',
    'Create the request ID once, at the edge, and pass it along: every service logs the same ID, which is what ties the lines together.',
    'More lines is not better debugging: each level you keep costs storage and search time, and DEBUG left on in production can be the biggest bill on the page.',
    'Do not log secrets. Redaction is a safety net that works by shape, so the safest fix is to leave the sensitive body out of the log.',
  ],
  quiz: [
    {
      q: 'Why does a text search for "user 42" miss most of the failed request\'s log lines?',
      options: [
        'Only some of its lines mention the user, and other requests match',
        'Text search only reads the first word of each line, so it stops far too early',
        'The failed request logs at a lower level than the others do',
        'Free-text lines are stored in a different order from JSON lines',
      ],
      answer: 0,
      why: "In the lesson the failed request wrote 12 lines and only one mentions the user; the gateway, payments and inventory lines never do. The same search also returns 2 lines from other requests, such as the user's earlier order and a user whose id merely starts with 42.",
    },
    {
      q: 'What does the request ID in a structured log let you do?',
      options: [
        'Filter on it to get every line of one request, across all services',
        'Make each service write its lines to the disk much faster than before',
        'Encrypt the lines so that only its owner can read them',
        'Guarantee that no two requests ever fail in the same way',
      ],
      answer: 0,
      why: "The ID is created once and repeated on every line, so request_id=... returns exactly that request's lines, in time order, from all four services. In the model that holds for every seed, with no lines missed and none from other requests.",
    },
    {
      q: 'Where should the request ID be created?',
      options: [
        'At the edge, in the gateway, then passed to each service in a header',
        'In each service separately, as soon as that service starts to handle the call',
        'In the log viewer, after the lines have already been collected',
        'In the database, once the order has been saved and has a row',
      ],
      answer: 0,
      why: 'Only the first hop sees the request before anything else does, and an ID made per service would be different in each one. Note that the order ID does not work as a substitute: the gateway lines are written before an order exists, so filtering on order_id misses them.',
    },
    {
      q: "In the lesson's structured format, what happens to log volume when the minimum level goes from INFO to DEBUG?",
      options: [
        'It grows to about 56 GB a day, up from about 21, over the 25 GB budget',
        'It stays about the same, because DEBUG lines are very short and quite rare',
        'It falls, because DEBUG lines replace several longer INFO lines',
        'It doubles exactly, because there are two levels at or below INFO',
      ],
      answer: 0,
      why: "DEBUG lines are numerous and carry dumps (headers, carts, queries), so at the lesson's 260 requests a second the log goes from about 21 GB a day to about 56. The traffic, budget and price are illustrative, but the direction is real: the level is a cost decision.",
    },
    {
      q: 'A payment service logs its request body, card number included. What is the best fix?',
      options: [
        'Stop logging the body, and mask card-shaped values as a safety net',
        'Keep logging it, and rely on the log store being private to staff',
        'Log it only at DEBUG, since DEBUG is switched off in production',
        'Keep logging it but split the card number over two log lines',
      ],
      answer: 0,
      why: 'What is never written cannot leak. In the lesson, masking by shape leaves 0 card-shaped strings, but it is a net: a number written in an odd format could slip through. DEBUG is often switched on during incidents, and splitting a number does not stop anyone joining it back up.',
    },
  ],
};

export default lesson;
