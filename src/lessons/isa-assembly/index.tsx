import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Your C becomes a short list of simple instructions that move values between registers and memory, set flags, and jump, and the mapping from C lines is not one to one.',
    what: 'An instruction set (ISA) is the vocabulary a CPU understands. On x86-64 a function gets its first arguments in registers (rdi, rsi, …) and returns its result in rax. Instructions copy (mov), compute (add, sub, imul), work out addresses (lea), and compare: cmp subtracts and keeps only the flags (ZF zero, SF sign, CF unsigned carry, OF signed overflow). A conditional jump or move then reads those flags: jl and cmovl ask "signed less than" (SF ≠ OF), jb asks "unsigned below" (CF). Memory operands like [rdi+8] are how struct fields and array elements are reached.',
    analogy: 'A recipe rewritten for a kitchen robot: "make the sauce" turns into "move pan to burner, set heat, wait, check". One step of the recipe becomes several robot moves, and the robot may reorder or merge them.',
    useCases: [
      'Reading a crash\'s disassembly in gdb, lldb or a crash reporter to see which line failed',
      'Checking what the compiler did with a hot loop on Compiler Explorer (godbolt.org)',
      'Understanding why signed and unsigned comparisons behave differently in C, C++ and Rust',
      'Debugging optimised builds where variables live in registers, not on the stack',
    ],
    why: 'Profilers, debuggers and crash dumps all speak assembly, so being able to read a few lines of it turns "the optimiser did something weird" into a concrete answer. It builds on `fetch-decode-execute` (the toy machine), `stack-vs-heap` and `twos-complement` (why signed and unsigned compare differently).',
    watch: 'Left: the C source and its x86-64 assembly, each instruction with its address in grey at the end. The instruction just executed has a yellow bar, and so does the C line it came from. Click a line on either side and its partner lines get a light yellow tint. Right: the registers and flags. A register the last instruction changed is tinted yellow with a yellow value (what just happened, as in calling-conventions); a flag it wrote has a yellow outline, and the flags a jump or cmov read are violet. In captions, an argument register is blue. Below: memory maps. The data map\'s sky-blue bracket marks the array or struct, a yellow ring marks the cell just read, and grey tags show which registers point into it. The stack map\'s amber bracket is the caller\'s frame and the violet slot (return addr) holds the address to go back to, with the violet rsp tag; after ret the slot turns grey and reads "popped". In Register widths, the 8 bytes of rax are boxes: blue bytes were set by the write, orange bytes were zeroed by a 32-bit write, and the violet brackets show which bytes each name covers. With "ARM64 too", the AArch64 version of max appears under the x86-64 one.',
  },
  tryThis: [
    'In "sum (a loop)", click the C line `for (long i = 0; i < n; i++)`: it lights up instructions before the loop and inside it, not one line each.',
    'In "max (if)", flip Compiled to "With cmov": the jump disappears, but the result is the same.',
    'In "absdiff (signed?)", pick absdiff(-1, 1), then switch Types to unsigned long: jl becomes jb, and the answer changes.',
    'Open Register widths and press mov eax, -1, then mov al, -1: only one of them clears the top half.',
    'In "struct field", step through area: r->w is [rdi+8] and r->h is [rdi+16].',
  ],
  keyIdeas: [
    'Arguments arrive in rdi, rsi, …; the result goes back in rax.',
    'cmp and test only set flags; the next jump or cmov reads them.',
    'Signed and unsigned comparisons use different flags: jl (SF ≠ OF) against jb (CF).',
    'A C line can become several instructions, and an if can become a cmov with no jump.',
  ],
  quiz: [
    {
      q: 'How does the `for` line of sum show up in its gcc -O1 assembly?',
      options: [
        'As several instructions, some before the loop, some inside',
        'As exactly one instruction, the way every line of C does',
        'As a single jump that goes back to the start of the loop',
        'Not at all: an optimising compiler removes the loop itself',
      ],
      answer: 0,
      why: 'The test of n, the end pointer, the pointer increment, the compare and the backward jump all come from that one line. C lines and instructions don\'t map one to one: one line can become many, and instructions get moved and merged.',
    },
    {
      q: 'With plain -O1, what does gcc 13 make of `if (a > b) return a; return b;`?',
      options: [
        'A cmp and a cmovge: a conditional move with no jump',
        'A cmp, then a jump to one of two separate returns',
        'A call into a library max function, and its result',
        'Two subtractions, with the bigger result picked by sign',
      ],
      answer: 0,
      why: 'An if doesn\'t have to become a jump. gcc computes "rax = b", then cmovge overwrites it with a when a ≥ b. The jump version only appears when that optimisation is turned off, and both give the same answer.',
    },
    {
      q: 'Why does absdiff(-1, 1) give 2 for long but 18446744073709551614 for unsigned long?',
      options: [
        'jb compares as unsigned, where -1 is the biggest value',
        'Unsigned subtraction always rounds away from zero',
        'The unsigned version reads the arguments the other way',
        'jl and jb are the same, but the result is printed wrongly',
      ],
      answer: 0,
      why: 'The bits of -1 are all ones. jl (SF ≠ OF) reads them as -1 < 1, so it returns b − a = 2. jb (CF) reads them as 2⁶⁴ − 1, which is not below 1, so it returns a − b, which wraps to 2⁶⁴ − 2. Same subtraction, different question.',
    },
    {
      q: 'rdx holds 0x1122334455667788. What does it hold after `mov edx, 0`?',
      options: [
        '0: writing a 32-bit register also clears its top half',
        '0x1122334400000000: only the low half is overwritten',
        '0x1122334455667700: only the lowest byte is cleared',
        'Nothing changes, because edx is a separate register',
      ],
      answer: 0,
      why: 'On x86-64 a write to a 32-bit register zero-extends into all 64 bits. Writes to the 8- and 16-bit names (dl, dx) do merge, which is the tempting wrong answer. That rule is why compilers happily write edx when they mean rdx = 0.',
    },
    {
      q: 'What does `lea rcx, [rdi+rsi*8]` do at the top of sum?',
      options: [
        'Works out the address just past the array; it reads nothing',
        'Loads the last element of the array into the rcx register',
        'Multiplies rsi by 8 and stores the product into memory',
        'Loads 8 bytes from the address in rdi into the rcx register',
      ],
      answer: 0,
      why: 'lea only does the address arithmetic: a + n × 8 is one past the last long. The loop then runs until its pointer reaches it. No memory is touched, which is why compilers also use lea as a quick multiply-and-add.',
    },
  ],
};

export default lesson;
