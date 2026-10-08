import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'REST design models an API as resources, nouns in the URL, and lets the standard HTTP methods and status codes say what happens, so clients, caches and retries all understand a request without reading your docs.',
    what: 'A collection is a plural noun (`/orders`), one item is the collection plus an id (`/orders/7`), and a sub-collection nests once (`/users/42/orders`). The method is the verb: GET reads, POST to a collection creates (201 Created + Location), PUT replaces, PATCH changes part, DELETE removes. RFC 9110 says GET, HEAD and OPTIONS are safe, and PUT and DELETE are idempotent as well; POST is neither, and PATCH (RFC 5789) is not idempotent in general. Filters, sorting and field selection are query parameters, and errors come back as a real 4xx or 5xx with a problem-details body (RFC 9457).',
    analogy: 'A library catalogue: every book has a shelf mark (the URL) and the desk offers the same few services for any book (borrow, return, look up). Nobody invents a new counter called "getBookByTitleNow".',
    useCases: [
      'Turning a pile of RPC-style endpoints into a resource tree before a public API ships',
      'Choosing 201, 204, 409 or 412 so clients and retries can react without parsing prose',
      'Reviewing an API change: a GET that changes data, a PUT used for a partial update',
      'Returning problem+json errors that a client can branch on by their type URI',
    ],
    why: 'Every web service you join will have an API, and many have one where `POST /doThing` hides what is safe to retry, cache or prefetch. Getting methods and status codes right is what lets proxies, browsers, SDKs and on-call engineers reason about a request. It builds on `http-basics` (methods and codes) and `client-server` (why a contract matters).',
    watch: 'On the board each endpoint is a card with a left edge coloured by its verdict: green (conventions met, ✓), orange (a style warning such as a verb in the path or deep nesting, !) or red (a violation, ✗); the card being edited has a yellow outline. In request lines the method is violet, resource nouns are blue, ids are grey and a verb in the path is orange with a wavy underline. The validator prints each flag in the same green, orange or red, tagged with its source (RFC 9110, RFC 5789, a mix, or convention), and the typical response\'s status line gets a green bar when nothing is violated. A refused typed path shows its reason in red. In Status codes, a right pick fills green and a wrong one red, with the explanation in the same colour. In Collections & errors the method is violet and /orders blue; the problem-details members have green bars, and the ad-hoc body\'s misleading lines red ones.',
  },
  tryThis: [
    'On the board pick "Remove order 7" with the method left on GET: find the flag that mentions a crawler, then switch to DELETE and /orders/{id}.',
    'For "Mark order 7 as shipped", try PUT and then PATCH on /orders/{id}: why does only one pass?',
    'Pick the reviews card (nested too deep) and choose /items/{id}/reviews: what happens to the warning?',
    'In Status codes, answer the quantity -3 situation with 400, then with 422: both are accepted. Why?',
    'In Collections & errors, switch Error body to Ad hoc: what does a 200 carrying { "error": true } hide?',
  ],
  keyIdeas: [
    'URLs name resources (plural nouns, an id for one item); the method is the verb.',
    'RFC 9110: GET, HEAD and OPTIONS are safe; PUT and DELETE are idempotent too. POST is neither; PATCH (RFC 5789) is not idempotent in general.',
    'Create with POST to the collection → 201 + Location. PUT replaces the whole thing, PATCH changes part.',
    'Errors are a real 4xx or 5xx with an RFC 9457 problem body; filters and sorting are query parameters.',
  ],
  quiz: [
    {
      q: 'A team calls its API RESTful because it sends JSON over HTTP. Its endpoints are POST /getUser and POST /deleteOrder. What is missing?',
      options: [
        'Resources as nouns in the URL, and methods that say what happens',
        'Nothing: any JSON-over-HTTP API counts as REST, whatever the URLs',
        'A version number in every URL, such as /v1/getUser, to be RESTful',
        'XML bodies, because REST was originally defined in terms of XML',
      ],
      answer: 0,
      why: 'REST is about resources and a uniform interface, not the body format. POST /getUser hides a read behind an unsafe method, so caches and retries can\'t treat it as harmless. The JSON is fine; the "any URL" part is the trap. Versioning is a separate choice, and REST never required XML.',
    },
    {
      q: 'Why is GET /deleteOrder?id=7 dangerous?',
      options: [
        'GET is meant to be safe, so crawlers and prefetchers may call it',
        'GET requests can\'t carry an id, so the wrong order gets deleted',
        'Browsers cache every GET forever, so the delete never happens',
        'GET is slower than DELETE, so the deletion times out under load',
      ],
      answer: 0,
      why: 'RFC 9110 defines GET as safe: clients, crawlers and link prefetchers may send it without asking anyone. A delete behind GET runs whenever something follows the link. GET carries the id fine (in the query or path), caching depends on headers, and speed has nothing to do with the method.',
    },
    {
      q: 'You want to mark order 7 as shipped, changing only its status. Which request fits?',
      options: [
        'PATCH /orders/7 with { "status": "shipped" }',
        'PUT /orders/7 with the body { "status": "shipped" }',
        'POST /orders/7/updateStatus with the new status',
        'GET /orders/7/ship?status=shipped&confirm=1',
      ],
      answer: 0,
      why: 'PATCH changes part of a resource. PUT replaces the whole thing, so a body with only the status would replace the order with just a status: the tempting one, and wrong. A verb in the path hides what the request does, and GET must be safe.',
    },
    {
      q: 'POST /orders succeeded and the order now lives at /orders/8. What should the response be?',
      options: [
        '201 Created, with a Location header pointing at /orders/8',
        '200 OK, with { "created": true } and no Location header',
        '204 No Content, since the client already knows the order',
        '202 Accepted, because a new resource was just added here',
      ],
      answer: 0,
      why: '201 says a new resource exists and Location says where. 200 works but tells the client less. 204 means success with an empty body, and the client doesn\'t know the new id yet. 202 means the work hasn\'t happened yet.',
    },
    {
      q: 'A request\'s JSON parses fine, but "quantity" is -3. Which answer fits best?',
      options: [
        '422 or 400, with a problem-details body naming the field',
        '200 OK with { "error": true }, so the client can check it',
        '500 Internal Server Error, since the input broke the server',
        '404 Not Found, because no valid order matches that input',
      ],
      answer: 0,
      why: 'It\'s the client\'s mistake, so a 4xx: 422 (well-formed but invalid) or 400, as conventions vary. A 200 with an error flag looks like success to caches, monitors and retries. 500 blames the server for bad input, and 404 means nothing exists at the URL.',
    },
  ],
};

export default lesson;
