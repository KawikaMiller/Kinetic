import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A server makes a socket, binds it to an address, listens, and accepts; a client makes a socket and connects. accept() hands back a brand-new socket for each connection, while the listening one keeps listening.',
    what: 'socket() returns a file descriptor for a new, unconnected TCP socket. A server calls bind() to give it an address and port, listen() to let the kernel accept connections on its behalf, and accept() to take the next finished connection off the queue as a new socket with its own FD. A client calls connect(), and the kernel picks a temporary (ephemeral) port for it and does the handshake. send() and recv() move bytes, but TCP is a stream: one send can arrive as several recvs. close() frees the FD at once, and the side that closes first then waits in TIME_WAIT for a while.',
    analogy: 'A restaurant host at the door (the listening socket) greets each party and hands them to a waiter (a new socket per table). The host never sits down to take an order, and the door has one address however many tables are full.',
    useCases: [
      'Every web server, database and message broker: socket, bind, listen, accept, under whatever framework you use',
      'Reading `ss -tan` or `netstat` output: LISTEN, ESTABLISHED, CLOSE_WAIT and TIME_WAIT rows',
      '"Address already in use" when restarting a server, and why servers set SO_REUSEADDR',
      'Load tests or chatty services running out of client ports, fixed with keep-alive and connection pools',
    ],
    why: "Every networked program you write sits on these calls, and the errors they return (EADDRINUSE, EACCES, ETIMEDOUT, EADDRNOTAVAIL) are ones you'll meet in your first on-call week. Knowing that accept() makes a new socket, that a connection is a 4-tuple, and where TIME_WAIT comes from turns a mysterious outage into a five-minute fix. It builds on `tcp-udp`, `file-descriptors` and `ip-ports`.",
    watch: 'Lifecycle: two code columns, client and server. The call running now has a yellow tint and bar, lines already run are white with their return value ("→ 3"), and a grey bar marked "blocked" is a call waiting (accept, connect). Under each is its FD table: 0-2 in faint grey, then each socket, yellow when it is the current one, violet for the listening socket, blue for a connected one. The Sockets table lists every socket the kernel holds, FD or not, with its 4-tuple, in the same colours, plus orange for TIME_WAIT. The accept queue shows backlog slots: dashed when empty, yellow-tinted for a finished connection waiting for accept(). In the TCP state diagram, a solid yellow box is the state of the socket the current step is about, and a yellow arrow the transition just taken; other boxes are tinted in the colour of the sockets sitting there, named underneath, and the line below names the latest change. Accept queue scene: the client table has violet port chips, and a red row and red log line mean a dropped SYN. TIME_WAIT scene: one square per client port, dim outline when free, blue for an open connection, orange in TIME_WAIT, with an orange bar of TIME_WAIT ports and a red count of refused connects. bind() errors: the console prints grey setup calls, then bind() in green when it worked or red with the errno.',
  },
  tryThis: [
    'Step through Lifecycle and watch accept() return fd 4 while fd 3 stays in LISTEN.',
    'At the two recv() steps, add up the byte counts: one send, two reads.',
    'In Accept queue, play with the server Slow: what happens to the fifth and sixth clients? Then switch it to Calls accept().',
    'In TIME_WAIT, play to the first refused connect, then switch the client to Keep-alive and play again.',
    'In bind() errors, keep old connections in TIME_WAIT and flip SO_REUSEADDR; then pick another server listening and flip it again.',
  ],
  keyIdeas: [
    'Server: socket → bind → listen → accept. Client: socket → connect (the kernel picks the port).',
    'accept() returns a new socket and FD per connection; the listener stays in LISTEN on one port.',
    'A connection is its 4-tuple: many clients share the server port because their addresses and ports differ.',
    'The side that closes first sits in TIME_WAIT; too many short connections exhaust ephemeral ports, so reuse them.',
  ],
  quiz: [
    {
      q: 'accept() has just returned for a new client. Which socket carries the conversation with it?',
      options: [
        'A new socket with its own FD, while the listener keeps listening',
        'The listening socket, which stops listening until the client goes',
        "A copy of the client's own socket, handed over by its connect()",
        'The listening socket, moved over to a fresh port for that client',
      ],
      answer: 0,
      why: "accept() returns a new FD for a new connected socket (fd 4 in the lesson), and the listening fd 3 stays in LISTEN for the next client. The tempting answer, the listener stopping to serve the client, would mean a server could only talk to one client at a time.",
    },
    {
      q: 'A server on port 8080 has 500 clients connected. How many local ports is it using for them?',
      options: [
        'One, 8080: the 4-tuples differ by client address and port',
        '500: one per client, taken from the ephemeral range',
        '501: one per client, plus 8080 for the listening socket',
        'One per backlog slot, then it opens a new listening port',
      ],
      answer: 0,
      why: 'A connection is identified by local address and port plus remote address and port. Every accepted socket shares 8080; it is the clients\' addresses and ephemeral ports that make each 4-tuple unique. It\'s the client that picks a new port per connection, not the server.',
    },
    {
      q: 'A load-test client opens a fresh connection per request and starts failing with EADDRNOTAVAIL. The likeliest cause?',
      options: [
        'Its own ephemeral ports are all held in TIME_WAIT',
        "The server's accept queue has filled to its backlog",
        "The server forgot to set SO_REUSEADDR before bind()",
        'Its FD table has run out of free numbers to hand out',
      ],
      answer: 0,
      why: 'The client closes each connection first, so each one leaves a port in TIME_WAIT, and once every port in the range is waiting, connect() has none to assign. A full accept queue looks different (connect hangs and times out), SO_REUSEADDR is about a server binding its port, and running out of FDs is EMFILE.',
    },
    {
      q: "A Linux server stops calling accept() and its backlog fills up. What does the next new client usually see?",
      options: [
        'connect() hangs while its SYN is retried, then times out',
        'connect() fails at once with "Connection refused"',
        'connect() succeeds, but its first send() returns an error',
        'Nothing: the kernel grows the queue to fit one more client',
      ],
      answer: 0,
      why: "By default Linux silently drops the SYN when the accept queue is full, so the client retries with growing gaps and eventually gets ETIMEDOUT. \"Connection refused\" is an RST, which you'd get if nothing were listening at all (or with tcp_abort_on_overflow set).",
    },
    {
      q: 'A client sends a 6,000-byte request with one send(). What can the server\'s first recv(conn, buf, 8192) return?',
      options: [
        'Anything from 1 to 6,000: whatever has arrived so far',
        'Exactly 6,000, because one send matches one recv',
        '8,192, with the buffer padded out past the request',
        'Zero, until all 6,000 bytes have arrived in the kernel',
      ],
      answer: 0,
      why: "TCP is a byte stream with no message boundaries, so recv returns what's there, up to the size asked for; the lesson's server reads 2,920 and then 3,080. That's why protocols carry a length or a delimiter. recv returns 0 only at end of stream, when the peer has closed.",
    },
  ],
};

export default lesson;
