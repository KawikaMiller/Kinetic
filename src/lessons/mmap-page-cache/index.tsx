import type { LessonModule } from '../../core/types';
import { plural } from './captions';
import { powerFacts, readRun, readaheadDefaultCap, readaheadRun, seededFacts } from './facts';
import { Stage } from './Stage';

const seq = readRun();
const rep = readRun('repeat');
const repMmap = readRun('repeat', 'mmap');
const twoMmap = readRun('two', 'mmap');
const raDefault = readaheadRun(readaheadDefaultCap);
const raOff = readaheadRun(0);
const raMax = readaheadRun(5);
const power = powerFacts();
const seeded = seededFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The operating system keeps file pages in a page cache shared by every process: read() copies from it, mmap maps it, a second read is fast because the page is already there, and a write only reaches that cache until writeback or fsync puts it on disk.',
    what: 'Reading a file brings its pages into the kernel\'s page cache. read() then copies the bytes into your buffer; mmap maps the cache page into your address space so a load needs no copy, and the first touch raises a minor fault if the page is cached or a major fault if the kernel must read the disk. The kernel reads ahead when it sees sequential access, and it holds written pages dirty in the cache until a background timer or fsync flushes them, so a power cut can lose a write that returned successfully.',
    analogy: 'A librarian keeps recently asked-for books on the desk. The second reader of a book gets it at once. A note you scribble in a desk copy is not in the stacks until someone files it, and a power cut before then loses the note whatever the librarian told you.',
    useCases: [
      'Understanding why the second read of a file is fast and why free memory looks low on a busy Linux box',
      'Choosing between read() and mmap for a large file, and what a page fault costs',
      'Seeing why a database calls fsync before it acknowledges a commit',
      'Debugging a crash from touching a mapped file that another process truncated',
    ],
    why: 'The page cache sits between your program and every disk, and three common beliefs about it are wrong: that mmap loads the whole file, that the second read is fast because of the CPU cache, and that write() returning means the data is on disk. Seeing the counted faults, copies and lost writes replaces them with the mechanism.',
    watch:
      'File strip: a dim outlined page is not cached, a green page is cached and clean, a violet page is mapped by both processes, and a letter says which process has it mapped. The ring on the page just touched is red for a disk read (a major fault under mmap), blue for a minor fault, orange for a copy into user space and yellow for a plain access of a mapped page. Readahead: a green page was used, an orange outlined page was read ahead and not used, and the blue curve is the hit ratio at each window, computed by running the trace. Power cut: yellow is a dirty page in the cache, green is clean or on disk, red is an acknowledged write that is gone. Chips say what is simulated, illustrative or from memory.',
  },
  tryThis: [
    `In "read() versus mmap" (sequential, read(), a 64-page file): press the end button of the player. All ${seq.disk} pages are disk reads, the hit ratio is ${seq.ratio} and ${seq.copied} are copied. Switch the pattern to "Repeat the same 8 pages" and go to the end again: ${rep.disk} disk reads and a ${rep.ratio} hit ratio.`,
    `In "read() versus mmap": choose "Repeat the same 8 pages" and "mmap the file" and go to the end: ${repMmap.copied} copied to user space, ${repMmap.major} major faults and ${repMmap.minor} minor ones. Switch to "Two processes, same file" and go to the end: ${twoMmap.major} major faults for the first process and ${twoMmap.minor} minor faults for the second, which finds every page already cached.`,
    `In "Readahead" (sequential, window up to ${raDefault.cap} pages): the hit ratio is ${raDefault.ratio} with ${raDefault.ios} disk requests. Drag the window to 1 page (off): ${raOff.ratio} and ${raOff.ios} requests. Drag it to ${raMax.cap} pages: ${raMax.ratio} and ${raMax.ios}.`,
    `In "Dirty pages and the power cut" (acknowledging before fsync): click page 2 of the cache, then press "Power cut": ${plural(power.lostPlain.length, 'acknowledged write')} lost. Press Reset, click page 2 again and press "fsync, then power cut": ${power.lostWithFsync.length} lost.`,
    `In the same scene the seeded crash panel opens on seed ${seeded.seed}: acknowledging before fsync loses ${plural(seeded.before.length, 'acknowledged write')} there. Switch "Tell the user it is saved" to "After fsync" and it loses ${seeded.after.length}.`,
  ],
  keyIdeas: [
    'In this model read() copies each requested page from the cache into your buffer, while mmap copies nothing and pays a fault the first time a process touches a page.',
    'A minor fault maps a page that is already cached and a major fault reads the disk first, so a second process reading the same file finds the pages cached and takes minor faults, not disk reads.',
    'Readahead turns later reads into hits by fetching a growing window while the access looks sequential, and it resets on a random jump, so it helps sequential reads and wastes little on random ones.',
    'write() or a store through a mapping dirties a cached page without touching the disk: in this model a power cut loses what was not flushed, killing the process loses nothing, and acknowledging after fsync loses no acknowledged write.',
  ],
  quiz: [
    {
      q: 'A program calls write() on a file, tells the user the data is saved, and the process is then killed with kill -9 before any fsync. The power is then cut. Which bytes exist on disk?',
      options: [
        'Only what the kernel had already written back or fsynced: the kill lost nothing, the power cut lost the rest',
        'All of it, because killing a process does not stop the kernel from finishing its write to the disk',
        'None of it, because killing the process threw away the dirty pages that its write() had put in the cache',
        'All of it, because a write() that returned success is already on the disk by the time it returns',
      ],
      answer: 0,
      why: 'The dirty pages belong to the page cache, not to the process, so the kill alone loses nothing and the kernel still writes them back later. The power cut then loses whatever was still in RAM alone, which is why the lesson shows acknowledging before fsync losing a write.',
    },
    {
      q: 'A process maps a 1 GB file with mmap. How much of the file is read into memory at the moment of the mmap call?',
      options: [
        'None of it yet: pages are read when first touched, one fault at a time',
        'All 1 GB, since the mapping needs the whole file present before it can be used',
        'The first megabyte, since the kernel preloads that much when a mapping is made',
        'Half of it, since the kernel reserves cache for the file and fills it at once',
      ],
      answer: 0,
      why: 'mmap sets up address space; the first touch of each page faults. A minor fault maps a page already in the cache and a major fault reads it from disk first. The lesson counts those faults one by one.',
    },
    {
      q: 'The second read of a file is much faster than the first. What is the main reason?',
      options: [
        'The pages are now in the operating system\'s page cache, so no disk read is needed',
        'The CPU cache now holds the file, so the processor skips the memory read that it made first',
        'The disk controller remembers the file, so it answers the second read from its own memory',
        'The file system has compressed the file after the first read, so the second is smaller',
      ],
      answer: 0,
      why: 'The first read fills the page cache from disk and the second finds the pages in RAM. In this model a hit costs no disk read at all; the CPU cache is a different, much smaller layer.',
    },
    {
      q: 'Two processes read the same file through mmap, one after the other. What does the second process see?',
      options: [
        'The pages are already cached, so it takes minor faults to map them and no disk reads',
        'It takes major faults for every page, since each process has its own copy of the cache',
        'It takes no faults, since a mapping made by one process is automatically shared with the others',
        'It reads the disk again, since the first process\'s mappings are private to that process',
      ],
      answer: 0,
      why: 'The page cache is one per file, shared by the processes that open it, but each process has its own page table, so it still has to map each page once. That fault, which maps without reading the disk, is the minor fault the model counts.',
    },
    {
      q: 'An application acknowledges each save as soon as write() returns and calls fsync afterwards. Under which condition can an acknowledged save still be lost?',
      options: [
        'If the power is cut after the acknowledgement and before the fsync finishes',
        'If the process is killed with kill -9 after the acknowledgement but before the fsync',
        'If another process maps the same file while the fsync is still waiting to run',
        'If the file is larger than the page cache when the application tells the user',
      ],
      answer: 0,
      why: 'Until fsync returns, the data may exist in RAM alone. A kill does not lose it, since the cache belongs to the kernel, but a power cut does. In the lesson seeded run, acknowledging after fsync loses no acknowledged write on any of the 200 seeds.',
    },
  ],
};

export default lesson;
