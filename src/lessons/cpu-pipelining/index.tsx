import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A pipeline overlaps instructions like an assembly line: each one still takes 5 steps, but a new one can start every cycle, until a hazard forces a wait.',
    what: 'The classic RISC pipeline splits every instruction into 5 stages: fetch (IF), decode and read registers (ID), execute (EX), memory (MEM) and write back (WB). While one instruction executes, the next is being decoded and the one after fetched. Hazards break the rhythm. A data hazard is an instruction that needs a result not written yet: forwarding sends the result straight from a pipeline latch to EX, but a loaded value only exists after MEM, so the next instruction still waits a cycle. A control hazard is a branch: the pipeline keeps fetching the next lines until EX knows the branch is taken, then throws them away. A structural hazard is two stages wanting the same hardware, such as one memory port.',
    analogy: 'A car wash with five bays. One car still spends five minutes going through, but a clean car rolls out every minute. If the drying bay needs the car ahead to finish first, everyone behind waits.',
    useCases: [
      'Why a load followed straight away by its use is slower than spacing them out',
      'What compilers do when they "schedule" instructions: move independent work into the gaps',
      'Why mispredicted branches cost cycles, and why branch-free code can be faster',
      'Reading CPI (cycles per instruction) in a profiler or a CPU datasheet',
    ],
    why: 'Pipelining is why "instructions per cycle" is a number people care about, and hazards are why code that does the same work can run at different speeds. It builds on `fetch-decode-execute` (one instruction at a time) and `logic-gates`; branch prediction and out-of-order cores come later.',
    watch: 'Top: the program, with the line in the pipe this cycle in yellow, finished lines plain, flushed lines struck through and faded, and a violet register where an instruction needs a result from one of the two before it. Below: the pipeline chart, one row per fetched instruction and one column per cycle. Each stage has its own colour: IF blue, ID amber, EX orange, MEM violet, WB grey. A dark hatched cell is a stall: the instruction is held where it is. A red outlined, struck-through cell belongs to an instruction that was fetched down the wrong path and flushed. A cyan arrow is a forwarded value, from the latch that holds it to the EX that needs it. The yellow outline marks the current cycle. In the Reorder program, the picked line has a cyan bar.',
  },
  tryThis: [
    'On "Data hazard", turn Forwarding off and on: count the stall cycles, and watch the cyan arrow replace the wait.',
    'On "Load-use", forwarding is on and add still waits one cycle. Why can\'t the arrow go back in time?',
    'On "Branch", watch which two rows turn red when beq finishes EX, and check the flush cycles.',
    'On "Reorder", pick lw r4, 8(r7) and move it up twice: both stalls vanish and the total drops from 13 to 11.',
    'Switch Pipelining to "One at a time" on any program and compare the total cycles.',
  ],
  keyIdeas: [
    'Pipelining improves throughput, not latency: each instruction still takes 5 cycles.',
    'Forwarding hides most data hazards; a load followed by its use still costs a cycle.',
    'A taken branch resolved in EX throws away the 2 instructions fetched behind it.',
    'Total cycles = n + 4 + stall cycles + flush cycles: every hazard shows up in the count.',
  ],
  quiz: [
    {
      q: 'What does a 5-stage pipeline do to a single instruction compared with running one at a time?',
      options: [
        'It still takes about 5 cycles; more of them finish per cycle',
        'It finishes about five times sooner from fetch to write-back',
        'It skips the stages that this instruction doesn\'t need',
        'It runs all five stages at once within a single cycle',
      ],
      answer: 0,
      why: 'Each instruction still passes through all 5 stages, so its latency stays at least 5 cycles. What changes is throughput: once the pipe is full, one instruction completes per cycle. "Five times sooner" mixes the two up.',
    },
    {
      q: 'Forwarding is on. Why does `lw r1, 0(r2)` followed by `add r3, r1, r4` still stall for one cycle?',
      options: [
        'The loaded value only exists at the end of MEM',
        'Forwarding only works between ALU instructions',
        'The register file can\'t be read during a load',
        'A load has to finish write-back before any read',
      ],
      answer: 0,
      why: 'An ALU result is ready at the end of EX, just in time to forward into the next EX. A load gets its data at the end of MEM, one cycle later than add\'s EX needs it, so one bubble is unavoidable. It is forwarded from MEM/WB, so it doesn\'t wait for write-back.',
    },
    {
      q: 'Seven instructions with no hazards at all run on the 5-stage pipeline. How many cycles does it take?',
      options: ['11 cycles', '7 cycles', '35 cycles', '12 cycles'],
      answer: 0,
      why: 'The first instruction needs 5 cycles to fill the pipe, and each of the other 6 finishes one cycle later: 7 + 4 = 11. 35 is the not-pipelined count (7 × 5).',
    },
    {
      q: 'A taken branch is resolved in EX, and the pipeline always fetches the next line meanwhile. What does it cost?',
      options: [
        'Two cycles: the two lines fetched behind it are thrown away',
        'Nothing: the next lines are only fetched after a decision',
        'Five cycles: the whole pipeline has to drain and then refill',
        'One cycle: only the line in ID is wrong, IF can be redirected',
      ],
      answer: 0,
      why: 'While the branch is in ID and EX, IF fetches the next two lines. When EX finds it taken, both are flushed and fetching restarts at the target: a 2-cycle penalty. Only the instructions behind the branch are lost, not the whole pipe.',
    },
    {
      q: 'Why may `lw r4, 8(r7)` move above `sw r3, 12(r7)` without changing the result?',
      options: [
        'Same base, different offsets: they touch different words',
        'Loads may always move above stores without any risk',
        'The store writes r3, and the load only writes into r4',
        'Memory operations never depend on each other at all',
      ],
      answer: 0,
      why: 'A load can depend on an earlier store if both touch the same address. Here both use r7 (unchanged) with offsets 8 and 12, so they hit different words. The registers alone don\'t prove it: a store and a load share memory, not registers.',
    },
  ],
};

export default lesson;
