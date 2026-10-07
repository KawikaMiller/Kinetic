import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

/*
 * The 70% claim. Sources: Matt Miller, Microsoft Security Response Center (MSRC), "Trends,
 * challenges and strategic shifts in the software vulnerability mitigation landscape", BlueHat IL
 * 2019: ~70% of the CVEs Microsoft assigns each year are memory-safety issues. The
 * Chromium Projects, "Memory safety" (2020): ~70% of Chromium's high-severity security bugs are
 * memory-safety problems.
 */

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'In C and C++ nothing stops a write from landing outside the memory it was meant for: past the end of a buffer, or into a block that was freed and handed to someone else. Prevent it with checked APIs and memory-safe languages, find it with sanitizers and fuzzing, and blunt it with canaries, NX and ASLR.',
    what: 'A buffer overflow writes more bytes than a buffer holds. `strcpy(name, input)` copies until the input\'s NUL, so a 12-character name in `char name[8]` runs past the end into whatever sits next to it on the stack: the canary, the saved rbp, the return address. A use after free writes through a pointer whose memory was already given back: the allocator may hand that memory to the next request, so the write lands in someone else\'s data. Neither crashes reliably, which is what makes them dangerous. Memory-safety bugs (these two are among the most common kinds) are behind about 70% of the security bugs Microsoft and Chromium fix (Microsoft MSRC, 2019, counting CVEs; Chromium, 2020, counting high-severity bugs).',
    analogy: 'A row of numbered lockers where the clerk stuffs your coat in without checking its size: a long coat spills into the next lockers. Use after free is keeping a copy of your old locker key after you handed the locker back, then putting your things into it once it belongs to someone else.',
    useCases: [
      'Reviewing C or C++ that copies strings or buffers: spotting strcpy, sprintf and unchecked lengths',
      'Reading a crash or AddressSanitizer report and knowing which of the two bug classes it is',
      'Choosing compiler and OS hardening flags (stack protector, NX, ASLR) for a build',
      'Weighing a rewrite or new component in a memory-safe language such as Rust',
    ],
    why: 'Memory-safety bugs, with these two among the most common, are behind about 70% of the security bugs Microsoft and Chromium fix, and they hide in ordinary code that works fine on short inputs. It builds on `calling-conventions` (what a stack frame holds), `stack-vs-heap` (where the memory lives) and `security-principles` (defence in depth: prevent, detect, mitigate).',
    watch: "Stack overflow: the C (or Rust) code on top, with the line just run in yellow and grey notes. Below it, the frame as a memory map with low addresses on top and one bracket per slot: name[8] grey, main's frame sky blue, the saved rbp and return address violet, and, only when Stack canary is on, a canary slot between name and the saved rbp: violet with a heavy border, red once its bytes change. A slot's value turns red when it's overwritten; grey tags mark rsp and rbp; a yellow ring marks the row just written. Under that, the same bytes as a hex dump with a text column: input bytes that stayed in the buffer are blue, bytes written past it are red, and the bytes just written have yellow rings; the key under it repeats the slot colours. The Outcome stat is green when a defence (or a short name) kept it safe, orange for a silent bug and red for corruption; Past the buffer turns red above 0. The address chips are grey, and dashed and dimmed when ASLR randomises them. Use after free: p is violet and q blue, each a slot with an arrow to its heap block; a freed block is dashed red with a \"freed\" tag, and a stale pointer is a dashed red arrow from a red slot. Under it, the block's bytes: blue for a normal write, red for the stale write. Printed output is green when it's what the code stored and red when it shows corrupted data or a crash; the Finding it strips hold grey, illustrative sanitizer reports.",
  },
  tryThis: [
    'On Stack overflow, pick Ada, then Grace Hopper, then the 40-character name, and play each: watch where the red bytes stop.',
    'With the 40-character name, turn Stack canary On: the run now aborts with "stack smashing detected".',
    'Set Bounds check to snprintf: the same long name is cut to 7 characters and nothing past name changes.',
    'Turn ASLR On and press Run again a few times: the addresses change each run, but the overwrite still happens.',
    'On Use after free, step through No defence, then try p = NULL after free and Rust ownership.',
  ],
  keyIdeas: [
    'An overflow writes past the end of a buffer into whatever sits next to it, such as saved values on the stack.',
    'A use after free writes through an old pointer into memory that may now belong to someone else.',
    'Prevent with checked copies and memory-safe languages; detect with sanitizers and fuzzing.',
    'Canaries, NX and ASLR only mitigate: they stop or blunt the damage, the bug is still there.',
  ],
  quiz: [
    {
      q: 'A 12-character name goes into `char name[8]` with strcpy, and the program seems to work. What should you conclude?',
      options: [
        'Memory past the buffer was overwritten: a real bug',
        'The compiler quietly made name bigger to fit it',
        'strcpy cut the name to 8 bytes, so it is harmless',
        'The extra bytes were discarded by the operating system',
      ],
      answer: 0,
      why: 'strcpy copies until the NUL, so all 13 bytes land and 5 of them overwrite whatever is next to name. Nothing truncates them; that is what snprintf or std::string are for. "Seems to work" only means the overwritten bytes weren\'t needed yet.',
    },
    {
      q: 'Someone says a buffer overflow just crashes the program, so it is not a security problem. Why are they wrong?',
      options: [
        'Overwritten data can change what the program does next',
        'Every crash leaks the full memory of the program',
        'Crashes cannot happen in software that has been tested',
        'The operating system reports every crash to attackers',
      ],
      answer: 0,
      why: 'An overflow often doesn\'t crash at all: the program carries on with corrupted saved values or data. If an attacker controls those bytes, they may be able to change what the program does next, which is why these bugs are rated as security bugs.',
    },
    {
      q: 'The stack canary is turned on and a long name overflows the buffer. What happens?',
      options: [
        'The epilogue sees the changed canary and aborts',
        'The copy stops at the canary and goes no further',
        'The canary repairs the overwritten return address',
        'Nothing at all, the canary only works with ASLR',
      ],
      answer: 0,
      why: 'The canary does not stop the write; the bytes still land. Before ret, the epilogue compares the canary with a copy kept elsewhere, and if any byte differs the program aborts with "stack smashing detected", so the overwritten return address is never used.',
    },
    {
      q: 'After `free(p)`, the next `malloc` of the same size returns q. Why can writing through p change q?',
      options: [
        'The allocator may hand p\'s freed memory to q',
        'free(p) copies the old block over to the new q',
        'p and q are two names for one variable in C',
        'malloc always returns the address it got last',
      ],
      answer: 0,
      why: 'free gives the memory back, but p still holds its address. The allocator may hand that memory to the next request, so q can get the same block and a stale write through p lands in q\'s data. It isn\'t guaranteed, which is why the bug is so hard to reproduce.',
    },
    {
      q: 'Which of these removes the stack overflow bug itself, rather than making it harder to use?',
      options: [
        'Copying with a bounds-checked call such as snprintf',
        'Turning on ASLR so addresses change on every run',
        'Marking the stack non-executable with NX or DEP',
        'Adding a stack canary that is checked before ret',
      ],
      answer: 0,
      why: 'A bounds-checked copy never writes past the buffer, so the bug is gone. ASLR, NX and canaries are mitigations: the overwrite can still happen, and they only detect it or make it much harder to abuse.',
    },
  ],
};

export default lesson;
