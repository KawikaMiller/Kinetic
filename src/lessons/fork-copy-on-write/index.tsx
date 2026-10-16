import type { LessonModule } from '../../core/types';
import { brokenFacts, forkFacts, shareFacts, snapshotFacts, writeFacts, WRITE_PAGE } from './facts';
import { Stage } from './Stage';
import { DEFAULT_WRITE_BYTE, hex2 } from './view';

const fork = forkFacts();
const write = writeFacts();
const broken = brokenFacts();
const snapshot = snapshotFacts();
const share = shareFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'fork gives the child its own page table but not its own memory: both processes map the same frames read-only, and the kernel copies a page only when one of them writes to it.',
    what: 'fork() creates a child whose page table entries point at the same physical frames as the parent\'s, all marked read-only and copy-on-write, with each frame\'s reference count raised to 2. Nothing is copied. When either process writes a shared page it takes a page fault; the handler copies that one page into a new frame, maps it writable for the writer and lowers the old count. If the count is already 1 the page is just made writable. exec then replaces the mappings, which is why fork followed by exec is cheap.',
    analogy: 'Two people share a printed book. Nobody photocopies it when they split up. The first time one of them wants to scribble in a page, that one page is photocopied for the scribbler, and the other still reads the clean original.',
    useCases: [
      'Understanding why a Redis-style snapshot child costs memory in proportion to the writes the parent takes',
      'Seeing why a shell can start programs cheaply with fork then exec',
      'Reading why a pre-fork server shares its loaded code between workers',
      'Debugging a memory spike after a fork on a system that uses large pages',
    ],
    why: 'Fork is how Unix starts processes, and the belief that it copies all the memory leads to wrong sizing and wrong fear. Seeing the counts, the fault and the copy shows what fork really costs and when the bill arrives.',
    watch:
      'Page tables: an outlined blue entry is read-only copy-on-write, a green tinted entry is writable on a fresh private copy, a grey tinted entry is writable on an original frame, a dim outline is unmapped, a yellow ring is the entry that just took a write fault (red if the broken handler wrote through), and a violet rail names how many pages a process shares. Frame pool: violet with a number is a frame shared by that many entries, green a private copy, grey an original in use, dim a free frame. Uses: grey is memory from before the fork and red is the costly side, growth above that baseline or what a naive fork needs; green is what copy-on-write uses. Chips say what is a toy, simulated or from memory.',
  },
  tryThis: [
    `In "fork" press "Fork the selected process": the frames in use stay at ${fork.framesAfter} (they were ${fork.framesBefore}), bytes copied stay 0 B, and the fork cost is ${fork.entries} table entries, where a naive fork would copy ${fork.naive}.`,
    `In "A write" (opens already forked), click page ${WRITE_PAGE} in the P2 row with the byte ${hex2(DEFAULT_WRITE_BYTE)}: one page is copied (${write.copiedBytes}), ${write.framesInUse} frames are in use, P2 reads ${write.childReads} on page ${WRITE_PAGE} and P1 still reads ${write.parentBefore}.`,
    `In "A write", switch "Fault handler" to "Writes through (broken)" and click page ${WRITE_PAGE} in the P2 row: P1 now reads ${broken.parentReads} too, and the log says the broken handler wrote into a frame that two entries still share.`,
    `In "Three real uses" (the snapshot): ${snapshot.smallPages} pages are copied and memory grows by ${snapshot.smallGrowth} (the formula expects ${snapshot.expected}). Switch Page size to 2 MB huge pages: ${snapshot.hugePages} pages are copied and memory grows by ${snapshot.hugeGrowth}.`,
    `In "What fork does not share" press fork(): it returned ${share.parentReturn} in the parent and ${share.childReturn} in the child, which has ${share.childThreads} of the parent's ${share.parentThreads} threads. Then let the parent and the child each read 4 bytes of fd 3: the shared offset ends at ${share.offset}.`,
  ],
  keyIdeas: [
    'In this model fork copies the page table entries, not the memory: both processes map the same frames read-only and each frame\'s count rises to 2.',
    'A write to a shared page faults and the kernel copies that one page for the writer, so memory grows by the pages written and the other process does not see the write.',
    'If a frame\'s count is already 1 the write copies nothing: in this model the page is simply made writable, the last process standing keeps the original.',
    'Fork then exec copies almost nothing, and in this model a huge page makes each copy 512 times larger, so random writes can copy a snapshot\'s whole data set.',
  ],
  quiz: [
    {
      q: 'A process with 1 GB of memory forks, and the child then writes to 8 of its pages. How much memory does the kernel copy?',
      options: [
        '8 pages (32 KB with 4 KB pages), each copied when the child first wrote it',
        'The full 1 GB, copied at the moment of the fork so that the child has its own',
        '8 pages in the child and 8 more in the parent, since both must take a private copy',
        'Nothing, because the child\'s writes go to the shared frames that the parent also uses',
      ],
      answer: 0,
      why: 'Fork copies page table entries, not data. Each write to a shared page faults and copies that one page for the writer, so 8 writes to 8 different pages copy 8 pages. A real kernel check, a 64-page region forked with 8 pages written by the child, showed 32 KB become private and the rest stay shared.',
    },
    {
      q: 'After fork, the child writes a new byte to a page that both processes map. What does the parent read from that page?',
      options: [
        'The old byte: the child\'s write went to its own fresh copy of the page',
        'The new byte, because both processes map the same frame and a write changes it',
        'The new byte after the child exits, when its copy is merged back into the parent',
        'Nothing, because the parent\'s entry for the page is removed by the fault',
      ],
      answer: 0,
      why: 'The fault handler allocates a new frame, copies the page, remaps the writer to it and lowers the old frame\'s count, so the parent\'s entry and byte are unchanged. The broken handler in the lesson skips the copy, and that is exactly when the parent sees the write.',
    },
    {
      q: 'The child has exited, and the parent writes to a page they used to share. The page is still marked read-only. What does the fault handler do?',
      options: [
        'It sees the frame\'s count is 1 and just makes the entry writable, copying nothing',
        'It copies the page anyway, since the entry was marked copy-on-write at the fork',
        'It refuses the write, since a copy-on-write entry may not be written after the fork',
        'It frees the frame and maps a zero-filled page, so the parent starts that page again',
      ],
      answer: 0,
      why: 'The count says whether anyone else still maps the frame. With the child gone it is 1, so the last process standing can keep the original frame and the copy is skipped.',
    },
    {
      q: 'The data set is split into 2 MB huge pages instead of 4 KB pages. In this model, how does one write to a shared page compare?',
      options: [
        'It copies 512 times as much, since the copy unit is the whole 2 MB page',
        'It copies the same amount, since only the bytes that were written are duplicated',
        'It copies nothing, since a huge page cannot be shared between two processes',
        'It copies 8 times as much, since a huge page holds 8 ordinary pages in the lesson',
      ],
      answer: 0,
      why: 'The copy unit is a page, and a huge page is 2 MB against 4 KB, a factor of 512. Transparent huge page behaviour varies between systems (seen once on Linux 6.18: an anonymous huge page was split on the write and only 4 KB was copied), so check the kernel docs for yours; the lesson shows the model, where a few random writes copy the whole 8 MB.',
    },
    {
      q: 'Why is a shell\'s fork followed by exec cheap even for a large parent?',
      options: [
        'Exec drops the inherited mappings before the child writes, so few pages were copied',
        'Fork copies the parent\'s memory at full speed, and exec then runs the new program faster',
        'The child shares the parent\'s page table for good, so there is nothing to build for it',
        'Exec copies the parent\'s memory in the background while the new program is loading',
      ],
      answer: 0,
      why: 'Fork builds table entries, not data. Exec then replaces the mappings with the new program\'s pages and the shared frames drop back to a count of 1, so in the fork-then-exec run the lesson counts 0 pages copied.',
    },
  ],
};

export default lesson;
