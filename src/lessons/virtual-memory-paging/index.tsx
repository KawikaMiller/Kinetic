import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Every process gets its own private range of virtual addresses, and the CPU translates each one, page by page, to wherever the data really sits in RAM.',
    what: 'Memory is cut into fixed-size pages (4 KiB here). An address splits into a page number (VPN) and an offset inside the page. Each process has a page table: row VPN says whether the page is in RAM (present), which physical frame holds it, and whether it may be written. Physical address = frame × page size + offset. A page that isn\'t in RAM causes a page fault: the kernel finds a frame (evicting another page if RAM is full, writing it to swap first if it was modified), loads the page and retries the instruction.',
    analogy: 'Every process has its own street map with the same house numbers. A page table is the lookup from "my house 3" to the real plot in town. Two maps can both say "house 15" and mean different plots, or point two names at one shared building.',
    useCases: [
      'Why a bug in one process can\'t scribble over another process\'s memory',
      'Reading "page faults" and "swap" in top, vmstat or Activity Monitor',
      'Shared libraries: one copy of libc in RAM, mapped into every process',
      'Diagnosing thrashing: a server that slows to a crawl when RAM runs short',
    ],
    why: 'Every pointer you have ever printed is a virtual address. Paging explains segfaults, why two processes can use the same address, why a machine grinds when RAM is short, and what "out of memory" really means. It builds on `stack-vs-heap`, `processes-threads` and `memory-hierarchy`; the TLB and multi-level page tables come later.',
    watch: 'Left and right: each process\'s 16 virtual pages as a memory map, high addresses at the top. The brackets mark code (grey), libc (pink), heap (orange) and stack (sky); the ⋮ row is the unmapped gap. A page in RAM names its frame and has a thin violet arrow to that frame in the middle column (physical RAM, frame 0 at the top). A dim page isn\'t in RAM, and a dashed grey arrow means its contents are in swap (the dashed box). The yellow "addr" tag and ring mark the address being translated, and its arrow turns yellow once it\'s translated. A violet frame is shared by both processes, dim frames are free, and an orange frame is the one a page fault is working on. Below, the address splits into VPN bits (violet) and offset bits (blue); the page-table row in use is yellow, a dirty bit of 1 is yellow, a green physical address is a successful translation, and red text is a segmentation fault or a refused address.',
  },
  tryThis: [
    'Press "A reads a swapped page" and step through the fault: a free frame, a read from swap, a retry.',
    'Then press "A grows its heap": RAM is full now, so something is evicted. Was the victim dirty?',
    'Press "B, same stack address": B uses 0xf800 just like A\'s stack, but lands in a different frame.',
    'Press "A writes its code", then "A reads the gap": two different reasons for a segmentation fault.',
    'Press "Thrashing" and watch the fault counter climb while useful work collapses.',
  ],
  keyIdeas: [
    'Each process sees its own virtual addresses; its page table maps each page to a physical frame.',
    'An address is a page number plus an offset; only the page number gets translated.',
    'A page fault is routine: the kernel loads the page, evicting another if it must, and retries.',
    'When the working set doesn\'t fit in RAM, the machine thrashes: it spends its time faulting.',
  ],
  quiz: [
    {
      q: 'What does virtual memory mainly give each process?',
      options: [
        'Its own address space, mapped onto RAM by pages',
        'Extra RAM borrowed from the disk to run faster',
        'A direct view of every physical address in RAM',
        'A copy of every other process\'s memory to read',
      ],
      answer: 0,
      why: 'The point is isolation and a private, uniform address space. Swapping to disk is something paging makes possible when RAM is short, and it makes things slower, not faster.',
    },
    {
      q: 'Processes A and B both write to virtual address 0xF800. What happens?',
      options: ['Each write lands in its own physical frame', 'The second write overwrites the first one', 'The kernel refuses B: the address is taken', 'Both writes go to swap to keep them apart'],
      answer: 0,
      why: 'Each process has its own page table, so the same virtual page maps to different frames. Addresses are only meaningful inside one process.',
    },
    {
      q: 'Page 4 of A isn\'t present when A reads from it. What happens next?',
      options: ['A page fault: the kernel loads it and retries', 'A segmentation fault, and A is killed', 'The CPU reads the bytes straight off the disk', 'The read returns zero and the program goes on'],
      answer: 0,
      why: 'Not present is not the same as not allowed. The kernel brings the page in and the same instruction runs again; only unmapped or forbidden accesses are segmentation faults.',
    },
    {
      q: 'FIFO with 3 frames on the references 1 2 3 4 1 2 5 1 2 3 4 5 causes 9 page faults. How many with 4 frames?',
      options: ['10 faults', '9 faults', '8 faults', '6 faults'],
      answer: 0,
      why: 'More frames, more faults: Bélády\'s anomaly. FIFO evicts by age, not by use, so a bigger memory can make worse choices.',
    },
    {
      q: 'Why does evicting a dirty page cost more than evicting a clean one?',
      options: ['It has to be written to swap before reuse', 'Dirty pages must be zeroed twice before reuse', 'The kernel has to kill the process that owned it', 'Dirty pages can only go back to the same frame'],
      answer: 0,
      why: 'A clean page still matches its copy on disk, so its frame can simply be reused. A dirty page holds the only up-to-date copy, so it must be written out first.',
    },
  ],
};

export default lesson;
