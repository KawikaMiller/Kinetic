import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A file descriptor is just a small number: an index into your process\'s table, which points at a kernel entry, which points at a file, pipe, socket or terminal.',
    what: 'Each process has an FD table. Slot 0 is standard input, 1 standard output, 2 standard error. Each slot points at an entry in the kernel\'s open-file table, which holds the current offset and the access mode, and counts how many slots point at it. That entry points at the real object. Every call that makes a new FD (open, dup, pipe, accept) takes the lowest free number. fork copies the table, so parent and child point at the same entries; exec keeps FDs unless they are close-on-exec.',
    analogy: 'A coat-check ticket. The number on your ticket isn\'t your coat; it\'s where the attendant looks. Photocopy the ticket (dup, fork) and two people can claim the same coat hook.',
    useCases: [
      'How the shell wires up > out.txt, 2>&1 and pipes before running a command',
      'Servers hitting "Too many open files" (EMFILE) after a socket leak',
      'Reading lsof or /proc/<pid>/fd to see what a process has open',
      'Why child processes inherit open files, and why close-on-exec exists',
    ],
    why: 'Everything is a file to Unix: files, pipes, sockets and terminals all come back as FDs, and the same few calls work on all of them. Knowing the three layers explains redirection order, shared offsets after fork, and the classic FD leak. It builds on `command-line`, `processes-threads` and `syscalls-kernel-mode`.',
    watch: 'Left: each process\'s FD table, one slot per number. Blue slots are in use, the yellow one was just allocated, dim ones are free, and red ones are leaked (their request ended without a close). Middle: the kernel\'s open-file table, violet boxes holding the offset, the access mode and the reference count. Right: the objects behind them, coloured by kind: the terminal sky, files orange, pipes pink, sockets grey. Violet arrows are references (red from a leaked FD). Under the scene, red lines are failed calls with their errno, and each file\'s contents are listed in grey. The FD-usage bar is blue, and red at the limit.',
  },
  tryThis: [
    'Play "cmd > out.txt 2>&1": dup2 moves 1 onto out.txt, then 2 follows 1.',
    'Then play "cmd 2>&1 > out.txt": the same calls in the other order, and fd 2 stays on the terminal.',
    'Play "Fork shares the offset", then "Two separate opens", and compare what ends up in log.txt.',
    'Play "Leak to EMFILE" and watch the red slots pile up until accept() fails.',
    'In "Empty sandbox", press open, open, then close with FD 3, then open again: which number comes back?',
  ],
  keyIdeas: [
    'An FD is just an index into a per-process table; the kernel\'s open-file entry holds the offset.',
    'A new FD is always the lowest free number: that\'s what makes dup2 and redirection work.',
    'fork copies the table but shares the entries, so parent and child share offsets.',
    'Forget close() and FDs leak until calls fail with EMFILE.',
  ],
  quiz: [
    {
      q: 'What is a file descriptor, really?',
      options: [
        'A small number indexing the process\'s FD table',
        'The file\'s contents, loaded into memory early',
        'The file\'s location on the disk, as a sector',
        'A unique number the file keeps for its lifetime',
      ],
      answer: 0,
      why: 'The number only means something inside one process: slot 3 here and slot 3 in another process can be completely different files. The file itself is two hops away, behind the kernel\'s open-file entry.',
    },
    {
      q: 'After fork, parent and child both write to the FD they inherited. What happens?',
      options: [
        'They share one offset: their writes interleave',
        'Each gets its own offset, so they overwrite',
        'The child\'s FD is closed until it calls open',
        'Only whichever process writes first gets through',
      ],
      answer: 0,
      why: 'fork copies the table, not the open-file entries, so both slots point at the same entry and its one offset. Separate offsets (and overwriting) only happen when each process opens the file itself.',
    },
    {
      q: 'A process has FDs 0, 1, 2 and 5 open. What does the next open() return?',
      options: ['3', '6', '0', '4'],
      answer: 0,
      why: 'New FDs always take the lowest free number, so the gap at 3 is filled first, not the slot after the highest one.',
    },
    {
      q: 'Why does `cmd 2>&1 > out.txt` still print errors to the terminal?',
      options: ['2 copied 1 while 1 was the terminal', 'The shell always ignores the 2>&1 part', 'out.txt cannot hold two streams at once', 'stderr is never allowed to go to a file'],
      answer: 0,
      why: 'Redirections run left to right. 2>&1 is dup2(1, 2), done while 1 still points at the terminal; moving 1 to out.txt afterwards doesn\'t drag 2 along.',
    },
    {
      q: 'A server forgets to close a socket on one error path. What eventually happens?',
      options: [
        'accept() fails with EMFILE: too many open files',
        'The kernel closes the socket after a short while',
        'Nothing: FDs are released when the request ends',
        'The server\'s memory fills with file contents',
      ],
      answer: 0,
      why: 'An FD stays taken until something closes it; the request ending doesn\'t. Each leak eats a slot, and at the limit every open and accept fails.',
    },
  ],
};

export default lesson;
