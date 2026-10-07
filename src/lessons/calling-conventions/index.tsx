import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A function call is an agreement: arguments go in set registers, call pushes a return address, the callee builds its frame on a stack that grows down, and it hands back rax with the callee-saved registers untouched.',
    what: 'On Linux and macOS, x86-64 follows the System V AMD64 ABI. The first six integer arguments travel in rdi, rsi, rdx, rcx, r8 and r9; any more go on the stack. `call` pushes the address to come back to and jumps. A typical prologue saves the caller\'s rbp, points rbp at the new frame and moves rsp down for locals; the epilogue (`leave`, `ret`) undoes it and pops the return address into rip. The result comes back in rax. rbx, rbp and r12-r15 are callee-saved: a function that uses them must put them back. The rest, rcx included, are caller-saved: a call may overwrite them. The ABI requires rsp to be a multiple of 16 at a call; gcc may skip the padding when it can see every callee doesn\'t need it (the omitted-frame-pointer build here).',
    analogy: 'A relay with a strict handover rule: the runner always takes the baton in the right hand (the argument registers), writes the way back on a sticky note on the pile (the return address), and must leave the shared kit exactly as found (callee-saved registers), but may scribble on the scrap paper (caller-saved).',
    useCases: [
      'Reading a stack trace or a core dump: every line is one frame on this stack',
      'Calling C from Rust, Go or Python (FFI): both sides must follow the same ABI',
      'Understanding why profilers want frame pointers, and why -fomit-frame-pointer needs unwind tables',
      'Debugging a stack overflow from runaway recursion',
    ],
    why: 'Every debugger, profiler and crash report reads this layout, and every language that calls into C has to match it. Knowing the frame layout also explains what a corrupted stack looks like. It builds on `isa-assembly` (the instructions), `recursion` (one frame per call) and `stack-vs-heap` (where frames live).',
    watch: 'Top: the assembly, with the instruction just run in yellow and a grey note on lines that need one. Left: the stack as a memory map, high addresses on top, growing down. Each bracket is one function\'s frame (main sky blue, the functions it calls amber, with recursive calls alternating amber and grey; libc above main in grey). Return-address slots are violet, a 7th argument on the stack is blue, and padding is dark grey. Violet arrows run from each saved rbp to the caller\'s frame it points at: the frame-pointer chain. Grey tags mark rsp and rbp ("sp=bp" when they\'re equal). Slots below rsp that have been popped stay in memory, drawn grey. In Deep recursion the red-bordered bracket is the guard page, and a red slot is the write that hit it. Right: the call stack as a debugger shows it (yellow: running; dimmed: waiting; it turns red and shakes on a stack overflow), then the registers: argument register names in blue, a register the last instruction changed in yellow, rax in green when a function returns, and a register a call clobbered in orange. Backtrace prints the frames newest first; an orange line explains when the rbp chain alone would get it wrong.',
  },
  tryThis: [
    'On "main → area → mul", step to the call to mul and press Backtrace: mul ← area ← main.',
    'Still inside mul, read the orange line: following rbp alone skips area, because mul never sets up a frame.',
    'Switch Frame pointers to "Omitted (-O1)": the prologues shrink and the rbp chain disappears, but Backtrace still works, from unwind rules (what gcc\'s .eh_frame would record for this code).',
    'On "Caller- vs callee-saved", watch rcx and rbx when helper returns, then set "main saves rcx" to Yes.',
    'On "Deep recursion", play to the end: the frames march down into the guard page.',
  ],
  keyIdeas: [
    'Integer arguments go in rdi, rsi, rdx, rcx, r8, r9; the 7th and later go on the stack.',
    'call pushes the return address; ret pops it into rip. The stack grows towards lower addresses.',
    'Callee-saved (rbx, rbp, r12-r15) come back unchanged; caller-saved (rcx and the rest) may not.',
    'The ABI wants rsp 16-aligned at a call, so a function starts 8 off; gcc may skip it for callees it can see.',
  ],
  quiz: [
    {
      q: 'main calls `area(6, 4)` on x86-64 Linux. Where do 6 and 4 travel?',
      options: ['In rdi and rsi, with no stack involved', 'Pushed on the stack, from right to left', 'In rax and rdx, the first two registers', 'In memory that rbp points at for area'],
      answer: 0,
      why: 'Under the System V ABI the first six integer arguments go in rdi, rsi, rdx, rcx, r8 and r9. Pushing every argument is what the common 32-bit x86 convention (cdecl) did; on x86-64 only the 7th and later go on the stack.',
    },
    {
      q: 'main calls area, which calls mul. Where is mul\'s return address compared with main\'s?',
      options: [
        'At a lower address, since the stack grows down',
        'At a higher address, stacked above main\'s slot',
        'In the same slot, overwriting the one main used',
        'In a register: return addresses skip the stack',
      ],
      answer: 0,
      why: 'Each push moves rsp down, so newer frames sit at lower addresses: mul\'s frame is below area\'s, which is below main\'s. The stack grows down even though diagrams often draw it upwards.',
    },
    {
      q: 'Why does area run `push rbx` before it uses rbx?',
      options: [
        'rbx is callee-saved: main must get its value back',
        'push rbx makes the room for the local variable',
        'rbx holds area\'s return address until the ret',
        'The ABI makes every function push rbx first',
      ],
      answer: 0,
      why: 'The ABI promises callers that rbx, rbp and r12-r15 survive a call. area keeps border in rbx across its call to mul (mul won\'t touch it), so area itself must save main\'s rbx first and restore it before returning.',
    },
    {
      q: 'sum7 takes 7 integer arguments. Where does the 7th one go?',
      options: ['On the stack, just above the return address', 'In r10, the register right after r9 in order', 'In rax, because rax isn\'t used until return', 'Split in two halves across rcx and rdx'],
      answer: 0,
      why: 'Only six integer arguments get registers. main pushes the 7th before `call`, so in sum7 it sits just above the return address, at [rbp+16] once the frame is set up.',
    },
    {
      q: 'Built without frame pointers, how does a debugger still print a backtrace?',
      options: [
        'It reads the unwind tables the compiler emits',
        'It follows the chain of saved rbp values',
        'It can\'t: those builds give no backtraces',
        'It replays the program from main to that point',
      ],
      answer: 0,
      why: 'Without frame pointers there is no rbp chain to follow. The compiler records in .eh_frame, for every instruction, where the return address is relative to rsp, and debuggers and C++ exceptions unwind with that. (This lesson\'s listings were built without .eh_frame; it works out the rules gcc\'s .eh_frame would record for this code.)',
    },
  ],
};

export default lesson;
