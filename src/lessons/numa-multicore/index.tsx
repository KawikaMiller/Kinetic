import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'On a multi-socket machine memory has a home socket: a thread reads its own socket\'s memory fast and the other socket\'s memory slower, so where the data lives matters as much as how many cores you have.',
    what: `Each socket has its own memory bank and the sockets are joined by an interconnect, so an access is local or remote. The lesson uses a small model with named, illustrative constants (a local access ${F.local}, a remote one ${F.remote}, and per-resource bandwidths): you pin four threads to sockets and eight pages to nodes, see how a first-touch placement policy follows whoever initialises the array, and watch a controller and a link saturate when everything lives on one node. No real machine was measured: each number is a formula over those constants.`,
    analogy: 'A two-office company where each office keeps its own filing cabinet: your own cabinet is a few steps away, the other office\'s needs a trip across town, and a single busy cabinet makes a queue however many people want to read from it.',
    useCases: [
      'Pinning threads and memory together in a latency-sensitive service so that a worker can read data on its own socket',
      'Asking whether a program that scales on one socket stops scaling on two because its data sits on one node',
      'Choosing between interleaving pages for bandwidth and keeping data local for latency',
      'Reading performance numbers from a two-socket server without assuming memory is one uniform pool',
    ],
    why: 'Memory placement can be a silent factor in tail latency and in scaling cliffs on large servers, which is why it is worth modelling. It starts where `cache-coherence` stops (it lists NUMA as out of scope), above the levels drawn in `memory-hierarchy` and `cpu-caches`, and below the translation covered in `page-tables-tlb`.',
    watch: 'Node 0 and node 1 are two plain categories (sky and amber), used for the sockets and for the pages that live on each; they do not mean good or bad. A thread whose accesses are all local is green and one with remote accesses is red, and a bar past 100% of its capacity turns red. A bar under capacity keeps its node\'s colour. The plot is a straight line from the local to the remote latency, with the current placement as a point.',
  },
  tryThis: [
    `In Pin threads and pages (the default is own pages, all local: ${F.default}), press T2's two pages (P4 and P5) to move them to node 0: T2 now reads at ${F.remote} and the mean is ${F.t2Moved}. Move T3's two pages (P6 and P7) too: ${F.t2t3Moved}.`,
    `In First touch, choose first touch and "the main thread fills the array": ${F.serial}, ${F.serialRemote}% remote. Switch the toggle to "each worker fills its own chunk": ${F.parallel}.`,
    `In Pin threads and pages, pick "everyone reads everything": the mean is ${F.everyone} however you place the pages (with two threads on each socket), and the page says shared data cannot be local to everyone.`,
    `In Streaming bandwidth, choose "bind to node 0": ${F.boundTotal} in total with the node 0 controller bar over 100%. Choose interleave: ${F.interleavedTotal}.`,
  ],
  keyIdeas: [
    `Memory is not one distance away: in this model a local read costs ${F.local} and a remote one ${F.remote}, so a thread's mean latency is 80 + 60 x its remote share (illustrative constants, nothing measured).`,
    `Under first touch the first writer of a page decides where it lives: a main thread filling the array puts each page on its own node (${F.serial}, ${F.serialRemote}% remote), while workers filling their own chunks keep each thread's pages local (${F.parallel}).`,
    `Shared data cannot be local to the four threads at once: when each of them reads the whole table the mean is ${F.everyone} however the pages are placed (with two threads on each socket), because each page is remote to the two threads on the other socket.`,
    `Bandwidth is capped by the controller and the link: bound to node 0, four threads get ${F.boundTotal} of the ${F.demand} they ask for, while interleaved (or with each thread's pages local) they get ${F.interleavedTotal}.`,
  ],
  quiz: [
    {
      q: 'One thread fills a big array on socket 0, then workers on both sockets read it. Why are the socket-1 workers slower?',
      options: [
        'Socket 1 runs at a lower clock speed than socket 0 does, so everything on it is slower',
        'The array is too large to fit in the cache of socket 1, so its reads miss more often',
        'First touch placed the pages on the filler\'s node, so their reads are remote',
        'The operating system pauses socket 1 while a single thread fills the memory',
      ],
      answer: 2,
      why: `With first touch the page lands on the node of the thread that wrote it first. The main thread on socket 0 wrote everything, so the socket-1 workers read remote memory (${F.remote} each in the model) while the socket-0 workers read local memory (${F.local}).`,
    },
    {
      q: 'Every thread reads the whole table. Which placement policy makes all of those reads local?',
      options: [
        'None: a page is local to one socket, so about half the reads are remote',
        'Interleave, which spreads the pages evenly across both nodes',
        'First touch with parallel initialisation, which places each chunk locally',
        'Bind every page to node 0, which keeps the reads on a single node',
      ],
      answer: 0,
      why: `A page lives on one node, so it is remote to the threads on the other socket. With two threads on each socket the mean stays at ${F.everyone} whatever the placement; locality needs data that each thread owns.`,
    },
    {
      q: 'A model has a local read at 80 ns and a remote read at 140 ns. With 25% of a thread\'s reads remote, what is its mean latency?',
      options: [
        '110 ns, the plain average of the two latencies',
        '95 ns, which is 80 plus a quarter of the 60 ns gap',
        '115 ns, which is 80 plus a quarter of the 140 ns',
        '80 ns, because three quarters of the reads stay local',
      ],
      answer: 1,
      why: 'The mean is 80 x 0.75 + 140 x 0.25 = 95 ns, that is 80 plus a quarter of the 60 ns difference. Averaging the two latencies ignores the share, and adding a quarter of 140 counts the local part twice.',
    },
    {
      q: 'Four threads stream from memory bound to node 0 and get 40 GB/s in total, while interleaving gives 64. What limits the first case?',
      options: [
        'The four threads are too slow to ask for more memory bandwidth',
        'The pages are too small, so the controller spends its time on setup',
        'Interleaving adds a second bus that carries the threads\' requests',
        'One memory controller serves everyone, and the link carries the other socket\'s share',
      ],
      answer: 3,
      why: `Node 0's controller has ${F.node} for the four threads, and the interconnect carries up to ${F.link} of what the socket-1 threads ask for. Interleaving splits the demand across two controllers and keeps each link under its capacity.`,
    },
  ],
};

export default lesson;
