import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A CPU does one thing forever: fetch the next instruction from memory, decode what it means, execute it, repeat. Programs are just numbers in memory.',
    what: 'The program counter (PC) holds the address of the next instruction. Fetch copies that memory cell into the instruction register (IR) and moves PC on. Decode splits the number into fields: which operation, which register, which address. Execute does it: move data between memory and registers, or send two registers through the ALU (the adder), or change PC to jump. Code and data share the same memory, so an instruction is only a number the CPU happens to read as one.',
    analogy: 'A cook with a recipe card and a finger on the current line: read the line, work out what it means, do it, move the finger. "Go back to step 3" just moves the finger.',
    useCases: [
      'Understanding what "compiled to machine code" means: your if and for become jumps and adds',
      'Reading stack traces and disassembly in a debugger or crash dump',
      'Why loops, function calls and branches cost time: each is instructions the CPU must fetch',
      'Security: buffer overflows work because injected data can be fetched and run as instructions',
    ],
    why: 'Knowing the fetch-decode-execute loop turns "the computer runs my code" into something concrete. It explains what a compiler produces, what a program counter in a crash report is, and why the CPU never understands your language, only numbers it treats as instructions.',
    watch: 'Left is the CPU: PC, IR (with its bit fields: opcode, register, address), registers R0 and R1, the ALU and the zero flag. Right is memory: 16 cells, each showing its address, its number and what that number means as an instruction. The yellow arrows are the data path in use (dashed = an address being sent, solid = a value moving). The cell outlined in blue is the instruction being fetched and decoded, and it\'s the highlighted line in the listing. Green is a value just written, and dim parts are idle. When decoding, IR\'s fields light up: yellow opcode, violet register, blue address.',
  },
  tryThis: [
    'Play "Add two numbers" and follow the yellow arrows: address out, value back, every single instruction.',
    'Pick "Count down from 3" and watch JZ and JMP rewrite PC: that\'s all a loop is.',
    'Pick "Self-modifying code": cell 2 starts as HALT, then the program overwrites it and keeps going.',
    'Click cell 15 in "Add two numbers", type 100, and press "Write & rerun": the answer in cell 13 changes.',
    'Click cell 4 in "Add two numbers" and type JMP 0: now it never halts.',
  ],
  keyIdeas: [
    'The CPU loops forever: fetch the instruction at PC, decode it, execute it.',
    'Instructions are just numbers; the same memory holds code and data.',
    'A jump is only "PC = address": loops and ifs are built from that.',
    'The CPU understands only its own instructions; compilers translate your code into them.',
  ],
  quiz: [
    {
      q: 'Does the CPU understand JavaScript or Python directly?',
      options: [
        'No: it runs only machine instructions',
        'Yes: modern CPUs run them directly',
        'Only JavaScript, which browsers bake in',
        'Only if it has enough memory for it',
      ],
      answer: 0,
      why: 'A CPU runs numbers it decodes as its own instructions. Everything else is translated first, by a compiler, or run by an interpreter (V8, CPython) that is itself machine code.',
    },
    {
      q: 'What does the fetch step do?',
      options: [
        'Copies the cell at PC into IR, then moves PC on',
        'Adds two registers and saves the result',
        'Writes a register back out to memory',
        'Splits the opcode out and picks the ALU op',
      ],
      answer: 0,
      why: 'Fetch reads the instruction PC points at into the instruction register, then advances PC to the next cell. Splitting out the opcode is the decode step that follows.',
    },
    {
      q: 'How does a loop work at this level?',
      options: [
        'A jump sets PC back to an earlier address',
        'The CPU keeps a note of where each loop began',
        'Memory repeats the same instructions',
        'The ALU counts how many loops are left',
      ],
      answer: 0,
      why: 'JMP (or a conditional jump like JZ) just writes an earlier address into PC, so the next fetch comes from there again. Nothing else remembers the loop.',
    },
    {
      q: 'In the self-modifying program, why does cell 2 stop being HALT?',
      options: [
        'A STORE overwrites it with another instruction',
        'The CPU skips any HALT it sees twice',
        'HALT only works in the very last cell',
        'Memory resets each time the loop restarts',
      ],
      answer: 0,
      why: 'Code and data share memory. Storing 62 into cell 2 replaces HALT, and 62 decodes as LOAD R1, [14].',
    },
  ],
};

export default lesson;
