import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A reverse proxy, or API gateway, is the one front door in front of many services: it terminates TLS, routes by host and path, checks auth, rate-limits, rewrites headers and forwards, so each service doesn\'t have to.',
    what: 'Clients connect to the gateway, never to the services. It ends the HTTPS connection, picks a service by host and the longest matching path prefix, rejects requests that have no valid token (401) or are over their rate limit (429) or match no route (404), adds headers such as X-Forwarded-For with the client\'s address and an X-Request-Id for tracing, and forwards the request inside the network. If the service refuses the connection the gateway answers 502; if it doesn\'t answer in time, 504. It works for the servers; a forward proxy works for the clients.',
    analogy: 'The reception desk of an office building: one entrance, a badge check, a sign-in book, and directions to the right floor. The teams upstairs never deal with the street.',
    useCases: [
      'nginx, Envoy, HAProxy or a cloud API gateway in front of a set of microservices',
      'Terminating TLS once at the edge, with plain HTTP or mTLS inside',
      'Per-client rate limits and API keys or JWT checks done in one place',
      'Reading X-Forwarded-For and X-Request-Id in a service\'s logs to trace a request',
    ],
    why: "Almost every production web system has one of these in front, and many outages and security bugs live there: a route that shadows another, a timeout shorter than a slow endpoint, a retried POST that charges twice, a service trusting a client-supplied X-Forwarded-For. Knowing which status comes from which stage tells you where to look. It builds on `load-balancing`, `tls-handshake`, `rate-limiting`, `auth-sessions-jwt` and `client-server`.",
    watch: 'The client is on the left, the gateway is the dashed zone with its six stages in order, and the four services are on the right. A blue pill is the request moving from stage to stage; the stage it is at is lit yellow, stages it has passed say "passed", and a stage that rejected it is outlined orange (4xx: 401, 404, 429) or red (5xx: 502, 504) with the status. The response pill travels back to the client in green (2xx), orange (4xx) or red (5xx). The client-to-gateway link is violet (HTTPS); the gateway-to-services links are grey dashed (plain HTTP) or violet (mTLS). The service receiving the request lights yellow, a down service is dimmed, and each says "checks JWT" when auth is moved into the services. In the routing table, the row that wins for the typed path is tinted yellow, other prefixes that also match are violet, and the route the current request took has a blue bar. In What the service sees, the X-Forwarded-For line is highlighted yellow. The response log lists each answer in green, orange or red, and a refused prefix or path is shown in red.',
  },
  tryThis: [
    'Send Over the limit and play: which request gets 429, and what does Retry-After say?',
    'Send No token, then switch Auth to In each service and play again: where does the 401 come from now?',
    'In Try a path, type /orders/export/2024, then /ordersX: which rows match each?',
    'Send Upstream down, then Upstream slow: which status does each give, and whose fault is it?',
    'Set Client\'s own X-Forwarded-For to Sends one, send a Valid call, and read What the service sees.',
  ],
  keyIdeas: [
    'A reverse proxy acts for the servers: one front door doing TLS, routing, auth, rate limits and headers once.',
    'Routing is longest prefix wins, by path segment: /orders/export beats /orders for /orders/export/2024.',
    '4xx at the edge (401, 404, 429) is the request\'s problem; 502 and 504 mean the upstream failed or was too slow.',
    'X-Forwarded-For is only trustworthy for the entries your own proxies appended; retry only idempotent requests.',
  ],
  quiz: [
    {
      q: 'What is the difference between a reverse proxy and a forward proxy?',
      options: [
        'A reverse proxy acts for the servers behind it; a forward proxy, for clients',
        'None: the name only depends on which team happens to configure it',
        'A reverse proxy sends only replies; a forward proxy sends only requests',
        'A forward proxy terminates TLS; a reverse proxy never touches TLS at all',
      ],
      answer: 0,
      why: 'A forward proxy sits with the clients (an office proxy that browsers go out through); a reverse proxy sits with the servers and is the address clients connect to. Both carry requests and replies, and reverse proxies are exactly where TLS is usually terminated.',
    },
    {
      q: 'The gateway answers 504 Gateway Timeout. Where is the problem?',
      options: [
        "Upstream: the service didn't answer within the gateway's timeout",
        "The client: it sent a request the gateway couldn't understand",
        'The client: its token ran out while the request was being queued',
        "The gateway's DNS: it couldn't look up the client's own address",
      ],
      answer: 0,
      why: "5xx means the server side failed: 504 is the upstream being too slow for the gateway's timeout, 502 is the upstream refusing or breaking the connection. A request the gateway can't use gets a 4xx, and an expired token is a 401.",
    },
    {
      q: 'The routes are /orders → orders and /orders/export → reports. Where does GET /orders/export/2024 go?',
      options: [
        'reports: the longest matching prefix wins',
        'orders: the first route in the table wins',
        'orders: the shorter prefix is the safer choice',
        'Neither: a path has to match a prefix exactly',
      ],
      answer: 0,
      why: 'Both prefixes match, and the more specific one (more path segments) wins, so the order of the table rows doesn\'t matter. That is unlike a firewall, where the first matching rule wins. /orders alone still goes to the orders service.',
    },
    {
      q: 'A service sees X-Forwarded-For: 192.0.2.200, 198.51.100.7 on a request from your gateway. Which address can it trust?',
      options: [
        '198.51.100.7, the entry your own gateway appended',
        '192.0.2.200, because the first entry is the client',
        'Both, since the gateway validated the whole header',
        'Neither: that header can never be used for anything',
      ],
      answer: 0,
      why: 'The gateway appends the address the connection really came from. Anything before it was sent by the client and can say whatever the client likes, so "the first entry is the client" is exactly the trap. Entries your own proxies added are reliable.',
    },
    {
      q: 'An upstream refuses connections. Why would the gateway retry a GET but not a POST?',
      options: [
        'GET is idempotent; a retried POST might place the same order twice',
        'POST bodies are too big for the gateway to keep a copy of for a retry',
        'Only GET requests are ever allowed through a reverse proxy in the first place',
        'POST responses are always cached, so the gateway never needs to retry',
      ],
      answer: 0,
      why: 'Repeating an idempotent request leaves the same result, so a retry is safe. A POST may have been partly processed before the failure, so repeating it can duplicate the effect; that needs idempotency keys, not a blind retry.',
    },
  ],
};

export default lesson;
