import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'HTTP is a request and a reply: the client sends a method and a path, and the server answers with a status code, headers and maybe a body.',
    what: 'Every HTTP request names a method (GET reads, POST creates, PUT replaces, PATCH updates part of something, DELETE removes) and a path such as /users/1. The server replies with a three-digit status code whose first digit tells you who is responsible: 2xx worked, 3xx means look elsewhere or use your cached copy, 4xx means the client asked for something wrong, 5xx means the server failed. Headers carry extra details like credentials, content type and cache tags.',
    analogy: "A restaurant order. The method is the verb (\"bring me\", \"cancel\"), the path is the dish, and the status code is the waiter's reply: \"here you go\" (200), \"we don't have that\" (404), \"the kitchen's on fire\" (500).",
    useCases: [
      'Designing and calling REST APIs from a frontend, backend or script',
      'Debugging: a 401 vs 403 vs 404 tells you exactly where to look',
      'Knowing which requests are safe to retry automatically (idempotent ones)',
      "Reading the browser's Network tab or curl -v output",
    ],
    why: "Almost every piece of software you touch as a junior talks HTTP. Picking the right method and status code makes your API predictable, and reading status codes correctly turns \"it doesn't work\" into a specific, fixable problem.",
    watch: 'The blue envelope is your request travelling to the server; the reply comes back coloured by status family: green 2xx, violet 3xx, yellow 4xx (your request was wrong), red 5xx (the server broke). The server panel shows its data, and the row a request touched glows violet. Below, the raw HTTP text of both messages, the method matrix (your current method highlighted) and a log of recent responses. The API is simulated in your browser.',
  },
  tryThis: [
    'Run every scenario button and sort the replies by colour: whose fault was each one?',
    'Pick POST /users and hit "Send it 3×": three new users. Now do PUT /users/1 three times.',
    'Send DELETE /users/2 twice. The status changes, but does the server state?',
    'Read user 1, then turn on If-None-Match and read it again: 304, no body.',
  ],
  keyIdeas: [
    'Method = what to do, path = what to do it to.',
    'Status families: 2xx success, 3xx redirect/cached, 4xx client error, 5xx server error.',
    '401 means "who are you?"; 403 means "I know who you are, and no".',
    'GET, PUT and DELETE are idempotent (safe to retry); POST is not.',
  ],
  quiz: [
    {
      q: 'Your request comes back 403 Forbidden. What does that tell you?',
      options: ['The server crashed', 'You sent no credentials', 'You are authenticated but not allowed to do this', 'The URL does not exist'],
      answer: 2,
      why: '403 means the server knows who you are and still refuses. Missing or invalid credentials would be 401.',
    },
    {
      q: 'A network blip means you are not sure your request reached the server. Which is safest to just retry?',
      options: ['POST /orders', 'PUT /orders/42', 'Neither', 'Both, always'],
      answer: 1,
      why: 'PUT is idempotent: sending the same replacement twice leaves the same state. Retrying a POST could create a duplicate order (unless the API uses idempotency keys).',
    },
    {
      q: 'Which status family means "the server messed up, not you"?',
      options: ['2xx', '3xx', '4xx', '5xx'],
      answer: 3,
      why: '5xx codes such as 500 and 503 are server-side failures. 4xx codes blame the request.',
    },
  ],
};

export default lesson;
