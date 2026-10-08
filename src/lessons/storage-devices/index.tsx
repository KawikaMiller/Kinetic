import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A hard disk pays milliseconds of moving parts for every random read; an SSD has no moving parts but can\'t overwrite in place, so random writes make it copy data around. Sequential I/O is cheap on both.',
    what: 'A hard disk spins its platters and swings an arm: a random read waits for the arm to seek to the track and then for the sector to rotate under the head (half a turn on average, 4.17 ms at 7,200 rpm), so it manages only around a hundred random reads a second (tens to low hundreds, depending on the drive). An SSD stores data in flash pages grouped into erase blocks. A page can be written only once until its whole block is erased, so the drive\'s flash translation layer (FTL) writes every update to a fresh page and marks the old one stale. When free blocks run out, garbage collection copies the still-valid pages out of a block and erases it. Those extra copies are write amplification. NVMe drives talk to the CPU over PCIe with many deep command queues, so they keep dozens of flash chips busy at once.',
    analogy: 'A hard disk is a record player that has to lift the needle and wait for the right groove to come round. An SSD is a notebook written in pen: you can\'t rub out a line, only cross it out and write the new version on a fresh page, and now and then you copy the live lines into a new notebook and throw the old one away.',
    useCases: [
      'Why databases and message logs append to a write-ahead log instead of updating in place',
      'Sizing a database server: random IOPS, not capacity, decides HDD vs SSD',
      'Why a nearly full SSD slows down on random writes, and what TRIM and spare area fix',
      'Reading fio or iostat results: queue depth, IOPS, latency and throughput',
    ],
    why: 'Storage is usually the slowest thing a backend touches, and its cost depends on the access pattern, not just the device. Knowing what makes I/O expensive explains why `lsm-trees` and `db-indexes` are shaped the way they are, why "use an SSD" doesn\'t make random writes free, and where disks sit in `memory-hierarchy`.',
    watch: 'Hard disk: the platter turns to match the model\'s elapsed time, its sectors are arcs (grey queued, dark grey already read, yellow being read now), and the blue arm and head move to the track. In the queue list the yellow chip is being served and dark grey ones are done. The timeline splits each read into seek (amber), rotation wait (sky blue) and transfer (pink). SSD flash: each row is an erase block and each cell a page showing the logical page it holds: blue is valid, dark grey struck through is stale, a grey outline is free, violet pages were just copied by garbage collection, an orange ring marks a block that was just erased, and a yellow ring the last host write. The write-amplification readout turns red above 2, and the caption\'s chip for it is green at or below 2 and red above. Queues & latency: filled blue slots are commands queued in the drive and empty ones are grey outlines; on the timeline blue bars are flash reads on each channel and violet bars transfers over the host link. The latency bars compare an HDD (red, the costly side), a SATA SSD (blue) and an NVMe SSD (green) on a log scale.',
  },
  tryThis: [
    'On Hard disk, play Random reads, then switch to Sequential reads: compare the reads per second in the last caption.',
    'With Random reads, flip Queue order to Elevator (LOOK) and replay: the arm travel drops, and so does the total time.',
    'On SSD flash, press Write ×100 a few times with TRIM off and watch write amplification climb; Reset, turn TRIM on and repeat.',
    'Switch the SSD workload to Sequential and press Write ×100 several times: write amplification stays at 1.00.',
    'On Queues & latency, drag Queue depth from 1 to 32 on NVMe, then flip Interface to SATA and watch the link become the limit.',
  ],
  keyIdeas: [
    'On a hard disk a random read pays a seek plus half a rotation on average; sequential reads skip both.',
    'Flash can\'t overwrite in place: updates go to fresh pages, and garbage collection copies live pages before an erase.',
    'Write amplification = NAND writes ÷ host writes; TRIM and spare area keep it down.',
    'SSDs get their speed from parallelism, which needs many requests in flight (queue depth).',
  ],
  quiz: [
    {
      q: 'Why are random reads so slow on a hard disk?',
      options: [
        'Each one pays a seek plus a rotational wait',
        'The disk erases a block before every read',
        'The head can only read a single track a second',
        'Random data is kept compressed on the platter',
      ],
      answer: 0,
      why: 'The arm has to move to the right track and then wait for the sector to come round: milliseconds of mechanical delay before a fraction of a millisecond of reading. Erasing before a write is a flash rule, not a disk one.',
    },
    {
      q: 'Your app overwrites one 4 KiB page on an SSD. What does the drive do?',
      options: [
        'Writes a fresh page and marks the old copy stale',
        'Rewrites the same flash page in place, like RAM',
        'Erases only that one page, then rewrites it there',
        'Holds the write until TRIM frees the old page',
      ],
      answer: 0,
      why: 'Flash pages are written once per erase, and erases work on whole blocks. So the FTL writes the new version elsewhere, updates its map and leaves the old page stale for garbage collection. Erasing just one page isn\'t possible.',
    },
    {
      q: 'On a full SSD, why can random overwrites cost more than sequential writes?',
      options: [
        'GC must copy live pages out of mixed blocks first',
        'The read head has to seek to each random page',
        'Random writes travel over a slower internal bus',
        'Flash cells only wear out under random writes',
      ],
      answer: 0,
      why: 'Random overwrites leave every block a mix of valid and stale pages, so each erase first means copying the valid ones: extra NAND writes. Sequential overwrites empty whole blocks, so there is nothing to copy (write amplification 1). There\'s no head to seek on an SSD.',
    },
    {
      q: 'The host wrote 100 pages and the drive programmed 250 flash pages. What is the write amplification?',
      options: ['2.5', '0.4', '150', '1.5'],
      answer: 0,
      why: 'Write amplification is NAND page writes divided by host page writes: 250 ÷ 100 = 2.5. The extra 150 pages are garbage collection copying valid data around.',
    },
    {
      q: 'What does TRIM tell an SSD?',
      options: [
        'Which logical pages no longer hold any data',
        'To erase every block that is half full now',
        'To move hot data onto the fastest flash chip',
        'To defragment each file into a single block',
      ],
      answer: 0,
      why: 'When a file is deleted only the file system knows its pages are free. TRIM passes that on, so the drive can treat those pages as stale and stop copying them during garbage collection. It doesn\'t erase anything by itself.',
    },
  ],
};

export default lesson;
