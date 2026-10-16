import type { LessonModule } from '../../core/types';
import { n, virtual } from './captions';
import { DEFAULT_ACTIVE_PCT, DEFAULT_CONNECTIONS, edgeFacts, queueFacts, scanFacts, threadFacts, traceFacts } from './facts';
import { Stage } from './Stage';

const scan = scanFacts();
const threads = threadFacts();
const trace = traceFacts();
const edge = edgeFacts();
const queue = queueFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'select and poll make the kernel scan every fd you give them, epoll returns only the ready ones, a thread per connection pays a stack each, and completion interfaces let one call carry a whole batch of work.',
    what: 'A server with many connections has to find the few that have something to read. A thread per connection lets the kernel wake the right thread but reserves a stack for each. A busy poll asks every socket in a loop and mostly hears EAGAIN. select and poll hand over the whole set on every call; epoll registers it once and returns the ready subset; a completion interface such as io_uring takes submitted work and posts finished results. Edge-triggered epoll adds a trap: it reports an arrival once, so a handler must read until EAGAIN.',
    analogy: 'A restaurant with a hundred tables. A waiter per table never misses a call but costs a hundred salaries. One waiter walking every table asking "ready?" wastes the evening. A bell that rings on the ready tables lets one waiter serve them, and an order slip handed to the kitchen means he does not stand there waiting.',
    useCases: [
      'Choosing between a thread pool and an event loop for a server with thousands of idle connections',
      'Reading why Node.js, nginx and Redis are built around epoll-style loops on Linux',
      'Debugging a connection that hangs after a partial read under edge-triggered epoll',
      'Seeing why disk reads need a thread pool or io_uring while sockets do not',
    ],
    why: 'The right model decides how a server scales with connections, and the wrong mental model, that epoll is fast because it is asynchronous, hides where the cost really lies. Seeing the counted calls, scanned entries and stacks makes the trade-offs concrete.',
    watch:
      'Counters and lanes: a worker on a ready fd is yellow, a call that returned data green, the kernel scanning or returning fds blue, a wasted call (EAGAIN) orange, a blocked thread dim and dashed and an idle loop dim and hatched, thread stacks violet in the stat. The strace log tints the wait or scan call blue and EAGAIN orange, and the lanes are drawn up to the highlighted call. Level and edge: green cells are bytes read, yellow a cell read in part, dim bytes still in the socket, red bytes epoll will not mention again, blue epoll saying the fd is readable. Files and queues: green is accepted or collected, red refused, blue in flight, yellow queued or waiting. Chips say what is simulated, scripted, illustrative or from memory.',
  },
  tryThis: [
    `In "One server, five models" (select, ${n(DEFAULT_CONNECTIONS)} connections, ${DEFAULT_ACTIVE_PCT}% ready): switch the I/O model to epoll. fd entries handled fall from ${n(scan.selectEntries)} to ${n(scan.epollEntries)} for the same ${n(scan.served)} requests.`,
    `In "One server, five models": switch to the blocking model and raise Connections to ${n(threads.threads)}. Threads rise to ${n(threads.threads)} and the virtual stack to ${virtual(threads.stackBytes)}, address space reserved rather than memory in use.`,
    `In "An strace of an echo server" (epoll): the log has ${trace.epollCalls} calls for ${trace.events} events on ${trace.connections} connections. Switch to the completion model and it shrinks to ${trace.uringCalls} io_uring_enter lines; switch to the busy poll and ${trace.busyEagain} of its ${trace.busyCalls} calls are EAGAIN.`,
    `In "Level and edge triggering" (edge-triggered, 100 bytes per read, one read per notification): press Play to the end. The connection is hung with ${edge.remaining} of 300 bytes unread after ${edge.hungReports} notification and ${edge.hungReads} read. Switch "Read until EAGAIN" to Yes and play again: it finishes with ${edge.drainedReads} reads (${edge.drainedReads - 1} that return data and a last one that returns EAGAIN) and all 300 bytes read.`,
    `In "Readiness, completion and files": switch "What you wait on" to a regular file and epoll_ctl shows EPERM. Then press "Queue a read" ${queue.queued} times and "Enter the kernel": ${queue.enters} call puts ${queue.inflight} reads in flight.`,
  ],
  keyIdeas: [
    'In this model select and poll scan the whole fd set on each call while epoll hands back only the ready fds, so the kernel work follows the ready count, not the connection count.',
    'Non-blocking means a call returns at once, not that no time is wasted: in this model a busy poll spends calls on EAGAIN, and a thread per connection reserves a stack for each connection.',
    'Edge-triggered epoll reports an arrival once, so in this model a handler that stops before EAGAIN leaves bytes unread and the connection hung, where level-triggered epoll reports it again.',
    'From memory, epoll_ctl refuses regular files with EPERM on Linux, which is why disk reads go to a thread pool or a completion interface that is told when the work finishes.',
  ],
  quiz: [
    {
      q: 'A server holds 10,000 connections and 5 of them are ready. How many fd entries does one select or poll call examine, and one epoll_wait call return?',
      options: [
        'select or poll scans 10,000 entries on the call, while epoll_wait hands back the 5 that are ready',
        'Both look at 10,000 entries, and epoll only saves the cost of copying the fd set into the kernel',
        'select or poll examines just the 5 that are ready, and epoll_wait returns all 10,000 for you to check',
        'Both touch only the 5 ready entries, because the kernel always knows which sockets changed',
      ],
      answer: 0,
      why: 'select and poll receive the whole set each call and scan it, so the work follows C. epoll keeps the set registered inside the kernel and returns the ready list, so the work follows k. The Counted table in the first scene shows exactly these entries.',
    },
    {
      q: 'Someone says epoll is faster than select because it is asynchronous. What is the better account of the difference?',
      options: [
        'Both tell you when a read would not block; epoll avoids scanning the idle fds on every call',
        'epoll runs the reads for you in the background, so the program never has to call read itself',
        'epoll avoids system calls entirely, since the kernel writes ready data straight into your buffers',
        'select blocks the whole process while epoll lets other threads of the process run meanwhile',
      ],
      answer: 0,
      why: 'Both are readiness notification: the program still issues the read and write. In this model the saving is in what the wait call examines, k entries for epoll against C for select. Completion interfaces are the ones that take over the transfer.',
    },
    {
      q: 'A busy-poll loop reads a non-blocking socket that has no data. What does each read return, and what does the loop cost?',
      options: [
        'It returns EAGAIN at once, and the loop spends a call on every idle socket in every pass',
        'It blocks until data arrives, which is why the loop needs a separate thread for each socket',
        'It returns 0 bytes to say the peer closed, and the loop then removes the socket from its list',
        'It returns EAGAIN once and the kernel then wakes the loop when data arrives on any socket',
      ],
      answer: 0,
      why: 'Non-blocking means the call returns instead of waiting, with EAGAIN when there is nothing to read. The waiting moves into the loop: in this model a busy poll over C sockets spends C calls per pass and most return EAGAIN.',
    },
    {
      q: 'An edge-triggered handler is told fd 4 is readable, reads 100 of the 300 bytes that arrived, and goes back to epoll_wait. What happens next?',
      options: [
        'epoll_wait does not report the fd again, so 200 bytes sit unread until more data arrives',
        'epoll_wait reports the fd again at once, because bytes remain in the socket buffer for it',
        'The kernel discards the 200 unread bytes, since the handler had its chance to read them',
        'The kernel finishes the read for the handler, since it knows the whole message has arrived',
      ],
      answer: 0,
      why: 'Edge-triggered epoll reports a change, not a state, so the leftover bytes produce no new report. Reading until EAGAIN, or using level-triggered mode, avoids the hang; a real Linux kernel showed the same behaviour in a check made for this lesson.',
    },
    {
      q: 'A program calls epoll_ctl to add a regular file on Linux. What is the likely result, and what does it suggest for reading files without blocking?',
      options: [
        'It is refused with EPERM, so file reads go to a thread pool or a completion interface',
        'It is accepted, and epoll then reports the file when its next block is in the page cache',
        'It is accepted and always reported ready, so the read can still block the whole event loop',
        'It is refused with EAGAIN until the file has been opened a second time in non-blocking mode',
      ],
      answer: 0,
      why: 'From memory and checked once on one kernel: epoll cannot say whether a file read would block, so it refuses regular files with EPERM (check man 7 epoll for yours). select and poll report a file as readable whatever the disk is doing, which hides the wait, so disk reads need another route.',
    },
  ],
};

export default lesson;
