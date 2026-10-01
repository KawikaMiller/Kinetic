import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Browsers only let a page read responses from its own origin (scheme + host + port). CORS is how a server tells the browser another origin may read its responses too.',
    what: 'The same-origin policy stops a script on one site from reading another site\'s data using your logged-in browser. A request to a different origin can still be sent, but the browser hides the response from the page unless the server answers with Access-Control-Allow-Origin. Requests that aren\'t "simple" (a JSON body, a custom header, PUT or DELETE) get a preflight OPTIONS request first, and the real request only goes out if the preflight is allowed.',
    analogy: 'A receptionist (the browser) takes your message to another company and brings back the reply, but only hands it to you if that company\'s letterhead says you\'re allowed to read it. The message was still delivered either way.',
    useCases: [
      'A front end on app.example.com calling an API on api.example.com',
      'Local development: a dev server on :5173 calling an API on :3000',
      'Public APIs that let any site read them (Access-Control-Allow-Origin: *)',
      'Debugging the "blocked by CORS policy" console error every web developer meets',
    ],
    why: 'Almost every web app calls an API on another origin, and CORS errors are among the most searched-for errors in web development. Knowing that the browser is the one saying no, and that the request may already have reached your server, stops you "fixing" it the wrong way.',
    watch: 'On the origin scene, each part of the two URLs turns green when it matches and red when it differs; the path is grey because it doesn\'t count. On the request scene, blue packets are requests, violet ones the preflight, a green reply is one the page may read and a red reply one the browser hid. A yellow ring flashes on the server whenever the real request reached it and ran, even when the page never sees the answer.',
  },
  tryThis: [
    'Try "www. vs api." and "port written out": one is cross-origin, the other isn\'t.',
    'Send GET /orders with the server\'s CORS off: the server runs it, and the page still gets nothing.',
    'Send POST JSON: a violet preflight goes first. Turn on "Answers preflights" and send again.',
    'Turn cookies on with Allow-Origin set to *: the browser refuses. Switch to the exact origin plus Allow-Credentials.',
    'Switch "Sent from" to curl: everything works, because CORS is a browser rule.',
  ],
  keyIdeas: [
    'Origin = scheme + host + port. Subdomains and different ports are different origins.',
    'CORS doesn\'t stop requests reaching your server; it stops the page reading the response.',
    'Non-simple requests (JSON, custom headers, PUT/DELETE) are preflighted with OPTIONS first.',
    'With cookies, Allow-Origin must be the exact origin and Allow-Credentials must be true; * isn\'t allowed.',
  ],
  quiz: [
    {
      q: 'Your front end on app.example.com does a simple GET to api.example.com, which sends no CORS headers. What happens?',
      options: [
        "The server runs it, but the page can't read the reply",
        'The browser never sends the request at all',
        'The server sees no CORS headers and rejects it',
        'It works, because both are on example.com',
      ],
      answer: 0,
      why: "Simple requests go straight out and run. The browser only checks the response headers afterwards, and hides the response if they don't allow the page's origin. Same site isn't same origin: the hosts differ.",
    },
    {
      q: 'Does adding CORS headers protect your API from being called by other programs?',
      options: [
        'No: only browsers enforce it; curl ignores CORS',
        "Yes: it blocks every other origin's calls",
        'Yes, as long as you avoid the * wildcard',
        'Only for POST, PUT and DELETE requests',
      ],
      answer: 0,
      why: "CORS protects users' browsers from leaking data to other sites; curl or another server can call your API regardless. Protecting an API is the job of authentication and authorisation.",
    },
    {
      q: 'Which request triggers a preflight?',
      options: [
        'GET with an Accept header',
        'POST with Content-Type: application/x-www-form-urlencoded',
        'POST with Content-Type: application/json',
        'HEAD with no custom headers',
      ],
      answer: 2,
      why: 'Only three content types count as simple (form-urlencoded, multipart/form-data, text/plain). A JSON body makes the request non-simple, so the browser asks with OPTIONS first.',
    },
  ],
};

export default lesson;
