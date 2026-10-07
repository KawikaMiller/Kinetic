import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Your program can\'t touch the disk, the network or another process directly: it asks the kernel with a system call, a deliberate trap across a hardware-enforced wall.',
    what: 'The CPU runs in two modes. User code runs in ring 3, where privileged instructions and kernel memory are off limits. The kernel runs in ring 0. To read a file, the libc wrapper puts a system call number in `rax` and the arguments in registers, then runs the `syscall` instruction: the CPU flips to ring 0 and jumps to the kernel\'s single entry point. The kernel looks the number up in its system call table, does the work, copies results into your memory and returns with `sysret`, flipping back to ring 3. Each crossing costs far more than a function call.',
    analogy: 'A bank counter with a glass screen. You can\'t walk into the vault: you fill in a slip (the registers), slide it through the one window (the trap), and the teller does it for you. Each trip to the window takes a while, so you don\'t withdraw one coin at a time.',
    useCases: [
      'Why reading a file through a bigger buffer, or a buffered stream, is so much faster',
      'Reading strace output: every line is one crossing into the kernel',
      'Why a stray pointer or privileged instruction kills your program, not the machine',
      'Profiling: time spent in "sys" vs "user" in top and time',
    ],
    why: 'Every file, socket, timer and process you use goes through system calls. Knowing what crosses the wall and what doesn\'t explains I/O performance, what strace shows, and why the OS can isolate programs at all. It builds on `processes-threads`, `fetch-decode-execute` and `command-line`.',
    watch: 'The top band (blue) is user space, ring 3; the bottom band (violet) is the kernel, ring 0. The box doing the work right now is yellow. A blue pill is a call moving between boxes; in the privileged-instruction scene a red pill is the fault, and the killed process turns red. The switch on the right is the CPU\'s mode bit (on x86 it\'s the 2-bit CPL; textbooks call it the mode bit): blue at the top for ring 3, violet at the bottom for ring 0. The code panels highlight the line running now, and the yellow cost bar adds up illustrative time. In Batching, the yellow bars are crossing time, to scale. In Syscall or not?, chips are violet until checked; then right answers are green and wrong ones red.',
  },
  tryThis: [
    'Play "read() step by step" and watch rax: the syscall number goes in, the byte count comes out.',
    'Watch the mode bit flip to ring 0 at syscall and back at sysret: one read() is just two crossings.',
    'Pick "Privileged instruction": user code tries hlt, and the process is killed, not the machine.',
    'In "Batching", compare the 1-byte row with the 64 KiB row: same file, same result.',
    'In "Syscall or not?", sort all eight functions, then press Check and read the notes.',
  ],
  keyIdeas: [
    'User code runs in ring 3; only the kernel, in ring 0, decides who may touch hardware and other processes\' memory.',
    'A system call is a deliberate trap: number in rax, arguments in registers, then syscall.',
    'Crossings cost far more than function calls, so batch work into fewer, bigger calls.',
    'Many library calls never make a system call (strlen), and some only sometimes do (printf, malloc).',
  ],
  quiz: [
    {
      q: 'Does calling strlen() make a system call?',
      options: ['No: it only counts bytes in user space', 'Yes: every libc function is a syscall', 'Yes: reading memory needs a system call', 'Only for strings longer than one page'],
      answer: 0,
      why: 'strlen just walks your own memory, which user code may read freely (a page fault can still enter the kernel, but that\'s not a call). Library calls and system calls are different things: only some library functions (write, open) make one, however long the string is.',
    },
    {
      q: 'Copying a 1 MiB file, why is a 64 KiB buffer so much faster than reading 1 byte at a time?',
      options: [
        'It makes 33 system calls instead of about two million',
        'Bigger buffers let the disk spin at a faster speed',
        'One-byte reads are refused by the kernel after a while',
        'Small buffers force the file to be copied twice over',
      ],
      answer: 0,
      why: 'Each read() and write() crosses into the kernel and back. 16 reads, 1 end-of-file read and 16 writes is 33 crossings; byte by byte it\'s 2,097,153. The bytes copied are the same.',
    },
    {
      q: 'What does the syscall instruction do that an ordinary call can\'t?',
      options: ['Switches to kernel mode at a fixed entry point', 'Jumps to any kernel function the program names', 'Runs the function faster by skipping the stack', 'Copies the whole program into kernel memory'],
      answer: 0,
      why: 'It flips the CPU to ring 0 and jumps to the one entry point the kernel set up. The program can only pass a number; it can\'t choose where in the kernel to land.',
    },
    {
      q: 'User code runs hlt, a privileged instruction. What happens?',
      options: ['The CPU faults and the kernel kills the process', 'The whole machine halts until the next interrupt', 'The instruction is quietly skipped by the CPU', 'The kernel runs hlt on the program\'s behalf'],
      answer: 0,
      why: 'In ring 3 the CPU refuses privileged instructions with a general-protection fault. The kernel turns that into SIGSEGV, so only the misbehaving process dies.',
    },
    {
      q: 'On Linux, which of these usually runs without any system call?',
      options: ['clock_gettime()', 'getpid()', 'open()', 'write()'],
      answer: 0,
      why: 'clock_gettime reads time data the kernel maps into every process (the vDSO), so the common clocks need no trap. getpid, open and write all trap every time on modern glibc.',
    },
  ],
};

export default lesson;
