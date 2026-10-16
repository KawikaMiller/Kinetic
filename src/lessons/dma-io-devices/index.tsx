import type { LessonModule } from '../../core/types';
import { n } from './captions';
import { brokenFacts, cacheFacts, coalescingFacts, transferFacts } from './facts';
import { Stage } from './Stage';

const transfer = transferFacts();
const coalescing = coalescingFacts();
const broken = brokenFacts();
const cache = cacheFacts();
const hex2 = (v: number) => `0x${v.toString(16).toUpperCase().padStart(2, '0')}`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A device is reached through addresses (or ports), and DMA lets it write RAM itself: the CPU stops copying but still programs the transfer, takes an interrupt, and shares the bus.',
    what: 'Programmed I/O has the CPU read a device register word by word. DMA has the CPU write a source, a destination and a length into the device and go back to work; the device masters the bus and raises one interrupt at the end. The device is just addresses: a register window reached by ordinary loads and stores (or by in and out on x86), where a read can have side effects. A network card hands packets over through a ring of descriptors, and batching interrupts trades wait time for CPU time.',
    analogy: 'Programmed I/O is carrying every box from the delivery van to the shelf yourself. DMA is writing the van driver a note (which boxes, which shelf) and getting on with your work until the doorbell rings, while the driver still blocks the corridor as he carries them.',
    useCases: [
      'Sizing the CPU cost of a disk or network driver and why drivers batch interrupts',
      'Reading why a device register is declared volatile and mapped uncached',
      'Understanding dropped packets when a receive ring fills faster than the driver drains it',
      'Debugging a stale read after a device wrote a buffer on a platform without coherent DMA',
    ],
    why: 'Every disk, network card and GPU talks to the CPU through these three ideas. Knowing that DMA moves the copy and not the responsibility explains driver cost, ring sizing, interrupt moderation and a family of stale-data bugs.',
    watch:
      'Transfer: the CPU lane shows copying, polling and setup in yellow, the interrupt in pink, the useful job in green and the job stalled on the bus in orange (dashed); the bus lane shows the device holding the bus in blue (hatched when it only takes alternate cycles); a grey bar is the CPU copying over the bus in programmed I/O, a dim dashed bar is the device getting its block ready, and diamonds are the register write (violet) and the interrupt (pink). Address map: violet is the device register window, blue RAM, amber ROM, a dim outline nothing mapped, a yellow ring the address you picked, orange a read served from the cache instead of the device, red a bus error or a stale answer. Ring: each descriptor row has a rail in dim (free), blue (device-owned), yellow (filled) or green (handled), pink is interrupts, orange a dropped packet, red an overwritten one. Cache panel: red steps are where the CPU or the machine goes wrong, green is correct. Chips say what is illustrative, a toy, simulated or from memory.',
  },
  tryThis: [
    `In "Three ways to move a block" (programmed I/O, 64 KB): switch the mode to DMA. CPU ticks on the transfer fall from ${n(transfer.pioCpu)} to ${n(transfer.dmaCpu)}, and job ticks lost to the bus rise from ${n(transfer.pioContention)} to ${n(transfer.dmaContention)}: the copy loop is gone, the shared bus is not.`,
    'In "A device is an address", press Load (read) twice with STATUS selected: the answers are 0x00000001 then 0x00000000, because a STATUS read clears the READY flag. Then set the window to Cached, press Reset the device and Load twice again: both answers are 0x00000001 and the second one never reached the device.',
    `In "The descriptor ring", set "Interrupt every N packets" to 4: interrupts fall from ${n(coalescing.irqsOne)} to ${n(coalescing.irqsFour)} over the same ${n(coalescing.packets)} packets, and the worst wait rises from ${n(coalescing.waitOne)} to ${n(coalescing.waitFour)} ticks.`,
    `In "The descriptor ring", switch the driver to "Re-posts a full ring (broken)": it loads seed ${broken.seed} and a driver that takes ${broken.driverTicks} ticks per packet (replacing your slider settings), and at tick ${n(broken.tick)} the full ring has a packet waiting, so the driver re-posts descriptor ${broken.descriptor} while it still holds packet ${broken.lost} and the run stops with that packet overwritten. Switch back to "Correct" and the same ring, with your sliders as they are, drops ${n(broken.dropsWhenCorrect)} packets instead and counts them.`,
    `In "DMA and the cache" (not coherent, no invalidation, IOMMU off): the CPU reads ${hex2(cache.stale)} instead of the ${hex2(cache.right)} the device wrote, and an unrelated buffer is overwritten with ${hex2(cache.kernelWhenOff)}. Turn "DMA writes are cache-coherent" on and the CPU reads ${hex2(cache.right)}; turn the IOMMU on and the unrelated buffer keeps ${hex2(cache.kernelAfter)}.`,
  ],
  keyIdeas: [
    'In this model DMA removes the per-word copy from the CPU, which still programs the transfer and takes the completion interrupt, and the device holds a shared bus while it writes.',
    'A device register is an address (or a port): a load or store reaches it, a read can change the device, and in this toy a cached STATUS read returns an old line instead of asking the device.',
    'A descriptor ring decouples the device from the driver; in this model a full ring drops packets and counts them, and coalescing trades fewer interrupts for a longer wait.',
    'When a device writes RAM behind the CPU cache, a platform without coherent DMA needs the driver to invalidate the line, and an IOMMU limits where a device may write.',
  ],
  quiz: [
    {
      q: 'A 64 KB block moves by programmed I/O in 8,192 words of CPU copying. Which cost does switching to DMA take away from the CPU?',
      options: [
        'The per-word copy loop; the CPU still programs the transfer and takes a completion interrupt',
        'Every cost, since the device masters the bus and the CPU takes no part until it is told',
        'The completion interrupt, since the device writes the data and the CPU polls for the end',
        'The setup writes, because the device already knows where each block should be placed',
      ],
      answer: 0,
      why: 'DMA moves the copying, not the responsibility: the driver writes the source, destination and length and handles the interrupt at the end. The bus is shared, so a memory-bound job can still stall while the device holds it.',
    },
    {
      q: 'In burst mode a DMA transfer runs while the CPU works on a memory-bound job. What happens to the job?',
      options: [
        'It stalls while the device holds the bus, because both need memory and only one can have it',
        'It runs at full speed, because DMA uses a separate path to memory that the CPU never touches',
        'It is interrupted once per word, because the device raises an interrupt for each word it writes',
        'It speeds up, because the CPU no longer has to wait for the slow device to finish the copy',
      ],
      answer: 0,
      why: `In this model the bus is one shared resource: a burst holds it for the whole window and the job makes no progress meanwhile. Cycle stealing lets the job keep running at reduced speed instead of stalling, so here it loses fewer job ticks (${n(transfer.stealContention)} against ${n(transfer.dmaContention)} at 64 KB), at the price of a transfer that finishes later (tick ${n(transfer.stealFinish)} against ${n(transfer.burstFinish)}).`,
    },
    {
      q: 'Why is a device register window mapped uncached?',
      options: [
        'A cached STATUS read would return the old line, so the CPU would never see the device change',
        'Uncached memory is faster than cached memory, which suits a device that must answer quickly',
        'A device cannot answer a cache line fill, so cached loads to its window would cause a bus error',
        'Caching the window would use up cache space that the registers need to keep their values',
      ],
      answer: 0,
      why: 'The first read fills a line, and later reads are served from it without asking the device, so a flag the device changes can go unseen. This is what the model does with the Cached switch on.',
    },
    {
      q: 'Interrupt coalescing is set to one interrupt per 4 packets with no time limit, and 10 packets arrive and then stop. What happens?',
      options: [
        'Two interrupts fire, and the last two packets wait with no interrupt until more arrive',
        'Three interrupts fire, because the last two packets raise an interrupt of their own at the end',
        'Ten interrupts fire, because the device still raises one for each packet whatever the setting',
        'Two interrupts fire and the driver still sees the last two packets by polling the ring itself',
      ],
      answer: 0,
      why: 'One interrupt is raised each time 4 packets are waiting, so 10 packets give floor(10 / 4) = 2 interrupts. Without a time limit nothing announces the rest, which is the gap a timer threshold is there to close (a common pairing in NIC drivers, from memory: check the hardware documentation).',
    },
    {
      q: 'The CPU read a buffer, a device then wrote new data into it by DMA on a platform that is not cache-coherent, and the driver did not invalidate the cache. What does the next CPU read return?',
      options: [
        'The old word, served from the cache line the first read filled',
        'The new word, because the device write updates the cache line automatically',
        'A bus error, because the line and RAM now disagree about the buffer',
        'Zero, because the device write clears the line before the CPU can read it',
      ],
      answer: 0,
      why: 'RAM holds the new word but the cache line still holds the old one, and nothing told the cache. Invalidating the line (or a coherent platform) makes the next read go to RAM.',
    },
  ],
};

export default lesson;
