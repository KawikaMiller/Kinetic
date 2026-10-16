import type { LessonModule } from '../../core/types';
import { FLAT_TEXT, n } from './captions';
import { switchFacts, tlbFacts, walkFacts } from './facts';
import { Stage } from './Stage';

const walkF = walkFacts();
const tlb = tlbFacts();
const sw = switchFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A flat table of every page in a 48-bit address space is impossible, so the page table is a tree walked in four steps, and a small cache of recent translations, the TLB, keeps most accesses from paying for the walk.',
    what: 'A 48-bit virtual address is cut into four 9-bit indexes and a 12-bit offset. Each index picks one of 512 entries in a 4 KiB table, and each entry points at the next table, until the last one points at the frame. Tables exist only where something is mapped, so the tree is small even though the space is huge. A huge page ends the walk a level early. The TLB remembers recent page-to-frame translations; when the pages in use outnumber its entries, a cyclic scan misses every time. Switching processes, and unmapping a page that other cores may have cached, cost extra TLB work.',
    analogy: 'Finding a flat in a city by country, then city, then street, then number, instead of keeping one list of every flat on Earth. The TLB is the sticky note of the few addresses you keep using.',
    useCases: [
      'Why huge pages help programs that sweep through large arrays or big heaps',
      'Reading "dTLB-load-misses" in perf and linking it to the working set',
      'Understanding why an unmap in a multi-threaded process interrupts other cores',
      'Seeing why switching between processes can slow a workload down',
    ],
    why: 'Address translation is on the path of every memory access, so its cost shows up as slow loops, slow context switches and slow unmaps. It builds on `virtual-memory-paging`, which teaches a single-level table and page faults.',
    watch:
      'Walk: the address bits are coloured by field, orange for the PML4 index, amber PDPT, pink PD and sky PT, with the offset in violet because it passes through untranslated (a huge page turns the lower index fields violet too). A table row with a green outline holds a present entry, a red one a missing entry or a failed canonical check, and the yellow ring is the entry being read. TLB: a green cell is a hit, a red solid cell a miss that just filled that entry, grey cells other valid entries and dim outlines empty ones; the rail beside a row marks the row just touched. Switches: red is the costly side, green the cheap side. Chips say what is a toy, illustrative, simulated or from memory.',
  },
  tryThis: [
    `In "The four-level walk" as it opens (a 4 KiB page at ${walkF.address}), play it through: the walk makes ${n(walkF.refs)} memory references and ends at physical address ${walkF.physical}. This space holds ${n(walkF.tables)} tables, where a flat table would be ${FLAT_TEXT}.`,
    `In "The four-level walk", set the page size at this address to 2 MiB: the walk ends a level early, after ${n(walkF.hugeRefs)} references, and ${n(walkF.hugeOffsetBits)} bits pass through as the offset.`,
    `In "The four-level walk", set the entry to Unmapped: the tables stay, the walk reads ${n(walkF.faultRefs)} entries and finds the ${walkF.faultLevel} entry not present, a page fault.`,
    `In "The TLB" as it opens (${n(tlb.entries)} entries, a cyclic scan over ${n(tlb.workingSet)} pages) all ${n(tlb.openingMisses)} of ${n(tlb.accesses)} accesses miss. Drag the working set to ${n(tlb.entries)} pages: only ${n(tlb.eightMisses)} miss, a hit rate of ${tlb.eightRate}. Then choose 2 MiB pages: ${n(tlb.hugeMisses)} miss, ${tlb.hugeRate}.`,
    `In "Switches and shootdowns" as it opens, flushing the TLB on every switch makes ${n(sw.flushMisses)} misses against ${n(sw.asidMisses)} with address-space tags. With ${n(sw.cores)} cores and ${n(sw.unmaps)} unmaps, a shootdown per unmap sends ${n(sw.ipis)} IPIs; Batched sends ${n(sw.batchedIpis)}.`,
  ],
  keyIdeas: [
    'A multi-level page table allocates tables just where pages are mapped, so it stays small where a flat table over the whole space would not fit in memory.',
    'The offset passes through translation untouched, and a huge page ends the walk a level early with a longer offset.',
    'The TLB caches translations, not data; in this model a cyclic scan over more pages than it has entries misses on every access under LRU.',
    'Address-space tags let entries survive a switch, and an unmap in a multi-threaded process costs an interrupt for each other core running it.',
  ],
  quiz: [
    {
      q: 'A 48-bit address space of 4 KiB pages would need a flat table of 512 GiB. Why does a four-level table not?',
      options: [
        'Tables are allocated only for the parts of the address space that are mapped',
        'The four levels compress each entry, so a table needs about a quarter of the memory',
        'Only the top level is kept in memory, and the lower levels are rebuilt on demand',
        'Pages are larger under four levels, so there are fewer of them to describe in total',
      ],
      answer: 0,
      why: `An entry that is not present needs no table below it, so this model's dozen mappings need ${n(walkF.tables)} tables of 4 KiB, not ${FLAT_TEXT}.`,
    },
    {
      q: 'A program cycles over 10 pages and the TLB has 8 entries with LRU replacement. What is its hit rate once warmed up?',
      options: ['0%', '80%', '20%', '100%'],
      answer: 0,
      why: `Each page is evicted just before it is needed again, so in this model each access misses: ${n(tlb.openingMisses)} misses in ${n(tlb.accesses)} accesses in the lab. At 8 pages the same scan misses just ${n(tlb.eightMisses)} times.`,
    },
    {
      q: 'What does a TLB entry hold?',
      options: [
        'A recent translation from a virtual page number to a frame, not the data in the page',
        'A copy of the page\'s data, so that the load can be served without reading memory',
        'The address of the next page table, so the walk can resume from the middle',
        'The permission bits of the page, which the cache then checks on every access',
      ],
      answer: 0,
      why: 'The TLB saves the walk, not the memory access: after a hit the CPU still reads the data (through the data cache). Treating it as a data cache is the usual mix-up.',
    },
    {
      q: 'A 2 MiB mapping is walked in this model. How many table entries does the walk read, and how many address bits are the offset?',
      options: ['3 entries and 21 offset bits', '4 entries and 12 offset bits', '3 entries and 12 offset bits', '4 entries and 21 offset bits'],
      answer: 0,
      why: `The page directory entry points straight at the 2 MiB frame, so the walk ends after ${n(walkF.hugeRefs)} reads and the low ${n(walkF.hugeOffsetBits)} bits are the offset.`,
    },
    {
      q: 'A process runs on 8 cores and one core unmaps a page. How many other cores does it interrupt?',
      options: ['7', '8', '1', '0'],
      answer: 0,
      why: 'The initiating core invalidates its own entry and interrupts the other cores running the process, so a round sends cores minus one IPIs: 7 for 8 cores, 15 for 16.',
    },
  ],
};

export default lesson;
