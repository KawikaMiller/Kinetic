import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'HTTP only answers when asked, so "the server tells me when something happens" is built from polling, long polling, Server-Sent Events or WebSockets, each trading delay, requests and complexity differently.',
    what: 'Short polling asks every few seconds and mostly gets empty answers, with each event delayed by up to the interval. Long polling sends a request the server holds until there is news (or a timeout), then asks again at once. Server-Sent Events keep one HTTP response open and stream text events down it, reconnecting by themselves and resuming with Last-Event-ID. A WebSocket upgrades an HTTP connection (101 Switching Protocols) into a two-way channel of small frames, but leaves reconnecting and catching up to the app.',
    analogy: 'Short polling is a child asking "are we there yet?" every five minutes. Long polling is asking once and being told when you arrive. SSE is the driver announcing every town on the way. A WebSocket is a phone call where either of you can talk at any moment.',
    useCases: [
      'Chat, comments and notifications that must appear within a second',
      'Streaming an AI model\'s answer or a build log to the page as it is produced',
      'Live dashboards and prices pushed from server to browser (SSE fits well)',
      'Multiplayer games and collaborative editors that need both directions',
    ],
    why: 'Picking the transport decides your server bill and your outage behaviour: polling multiplies requests by clients, persistent connections multiply open sockets, and only some options recover missed messages on their own. The defaults are simple: poll for rare updates, SSE for server push, WebSocket when the client talks a lot too. It builds on `http-basics`, `http-versions` and the `event-loop` that keeps one server holding thousands of idle connections.',
    watch: 'Four lanes share one 60-second axis, under a lane of amber ticks that mark when each message reaches the server. Blue bars are requests; a hatched blue bar is an open SSE or WebSocket connection; a hatched violet bar is a long-poll request the server is holding. A grey bar is an empty response (a wasted poll, or a long poll that timed out). A green tick is a message delivered to the browser, orange if it arrived slower than that lane\'s mean delay. With the network drop on, a "network" lane shows the outage as a red dashed bar between red drop and back markers, failed requests are red dashed bars, and messages a WebSocket missed are red ticks (✕ in its counters). With "client sends too?" on, sky-blue bars are the browser\'s own messages. The yellow line is the current time. In the cards, a missed count is red. In Handshakes, requests from the browser are blue arrows, server frames violet, and the 200 or 101 that opens the stream green; the arrow being explained now is yellow.',
  },
  tryThis: [
    'Press play and compare the lanes: short polling\'s grey empty bars against the others\' one long connection.',
    'Set Poll every to 1 s, then to 30 s: watch the requests and the max delay trade places.',
    'Switch Network to drop 20–25 s and play to the end: SSE replays what it missed, WebSocket shows red missed ticks.',
    'With the drop still on, set WebSocket resync to ask for missed: the gap closes, because the app now asks.',
    'Drag Clients to 10,000 and read the server line in each card: requests per second against open connections.',
  ],
  keyIdeas: [
    'Short polling delays each event by up to the interval and spends most requests on empty answers.',
    'Long polling is held requests: near-instant delivery, one request per event, timeouts to survive proxies.',
    'SSE is one-way server push over plain HTTP that reconnects itself and resumes from Last-Event-ID.',
    'WebSocket is two-way after a 101 upgrade, but reconnecting and catching up are the app\'s job.',
  ],
  quiz: [
    {
      q: 'A dashboard pushes stock prices to the browser, and the browser never sends anything back. Which fits best?',
      options: [
        'Server-Sent Events: one-way push over HTTP that reconnects itself',
        'WebSocket, because it is the fastest choice in every situation',
        'Short polling every 50 ms so that no price change is ever missed by the page',
        'Long polling with a timeout of an hour to save on requests',
      ],
      answer: 0,
      why: 'For server-to-client only, SSE is simpler than a WebSocket: plain HTTP, automatic reconnect and Last-Event-ID resume. WebSockets are not always the best choice; they shine when the client also talks a lot. Polling every 50 ms floods the server with mostly empty requests.',
    },
    {
      q: 'Short polling every 10 s. An event happens just after a poll reached the server. Roughly how long until the browser sees it?',
      options: [
        'About 10 s: it waits for the next poll and that poll\'s reply',
        'One round trip, since the server answers the poll at once',
        'Nothing at all: the event is lost until the page reloads',
        'About 20 s: two polls must pass before it can be delivered to the page',
      ],
      answer: 0,
      why: 'The server can\'t push, so the event sits there until the next poll arrives (up to the interval) and its response travels back. Polling with a cursor never loses events, and one poll is enough to collect it.',
    },
    {
      q: 'An SSE connection drops for five seconds. What lets the browser catch up on what it missed?',
      options: [
        'It reconnects by itself and sends Last-Event-ID, so the server can replay',
        'TCP retransmits the missed events once the new connection is open',
        'Nothing: SSE has no built-in way to recover events that were sent while it was down',
        'The browser polls a separate endpoint that it has to be given first',
      ],
      answer: 0,
      why: 'EventSource reconnects on its own and repeats the last id it saw in a Last-Event-ID header; a server that keeps recent events replays the rest. TCP can\'t help, because the old connection, and anything in flight on it, is gone.',
    },
    {
      q: 'What does the server answer when a WebSocket upgrade succeeds?',
      options: [
        '101 Switching Protocols, then frames on the same connection',
        '200 OK, with the WebSocket stream as the response body',
        '301 Moved Permanently, pointing to a ws:// address',
        '204 No Content, then a new TCP connection for frames',
      ],
      answer: 0,
      why: 'The handshake is an HTTP/1.1 GET with Upgrade: websocket; the server replies 101 with Sec-WebSocket-Accept, and from then on the same TCP connection carries WebSocket frames instead of HTTP. 200 with a never-ending body is what SSE does.',
    },
    {
      q: 'You move 10,000 clients from short polling every 5 s to WebSockets. What changes on the server?',
      options: [
        'Far fewer requests per second, but 10,000 connections held open',
        'Nothing at all: both cost the server the same amount of work',
        'More requests per second, since every message is a request',
        'Fewer open connections, because WebSockets close when idle',
      ],
      answer: 0,
      why: 'Polling every 5 s is 2,000 requests a second for 10,000 clients, most of them empty; WebSockets replace that with one long-lived connection per client, which costs memory and file descriptors instead. They stay open while idle, which is the point.',
    },
  ],
};

export default lesson;
