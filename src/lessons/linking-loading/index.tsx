import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The compiler turns each .c file into an object file on its own, leaving holes wherever it calls something defined elsewhere. The linker joins the object files and libraries, matches every needed symbol to a definition and patches the holes; the loader then maps the program, and any shared libraries, into memory.',
    what: 'An object file has sections (.text for code, .data for initialised globals, .rodata for constants), a symbol table of what it defines and what it needs, and relocations: notes such as "the 4 bytes at .text+0xf need the address of area". The linker reads its inputs left to right, resolves each needed symbol, lays the sections out at addresses and fills every hole: for a PC-relative call that is S + A − P (symbol address plus addend minus the hole\'s address). A static library is only searched for symbols that are already missing when the linker reaches it. With a shared library the code stays outside the program: the linker leaves a small PLT stub, and at run time the loader (ld.so) maps the library and fills in its address in the GOT.',
    analogy: 'Writing chapters separately with notes like "see the figure in chapter 3, page ?": the editor (linker) collects the chapters, numbers every page, then goes back and writes the real page numbers into every note. A shared library is a reference to a book on the library shelf: the reader (loader) fetches it when someone opens yours.',
    useCases: [
      'Fixing "undefined reference to" and "multiple definition of" errors from gcc or clang',
      'Getting library order right on a static link command line (-lfoo after the files that use it)',
      'Choosing static vs dynamic linking for a container image, a CLI tool or a plug-in',
      'Debugging "cannot open shared object file" and LD_LIBRARY_PATH problems at start-up',
    ],
    why: 'Link errors are some of the most confusing messages a junior engineer meets, because they come after the compiler said everything was fine. Knowing what the linker and loader do explains those errors, library order, why a dynamically linked binary breaks when a shared library is missing, and why static binaries are bigger. It builds on `isa-assembly` (the machine code being patched), `virtual-memory-paging` (the process image) and `dependency-management`.',
    watch: 'Link: one card per input on the command line, read left to right; the card being read has a yellow outline, cards not read yet are faded, and a skipped archive has a dashed outline. Green dots on a card\'s right edge are pegs, symbols it defines; grey hollow dots are sockets, symbols it needs. A socket being resolved turns yellow, a resolved one violet, with a violet arrow to the peg that defines it. On a duplicate, the first definition\'s peg is orange and the second is red; an undefined symbol\'s socket turns red, and ld\'s messages print in red in the console. The relocation table fills in S, P and the result (blue) as each hole is patched; in the byte grids, holes are grey and patched bytes blue. The file-size bar is blue. Load & run: a memory map with high addresses at the top, one row per 4 KB page and "⋮" for skipped pages: the program\'s code segment in sky blue, its read-only segments in amber, its data in pink, shared libraries in orange, and the stack and heap in grey. The GOT slot turns blue with a blue ring when it is written, and the yellow rip tag marks where the CPU is running.',
  },
  tryThis: [
    'Play the main.o geom.o preset: watch the socket for area turn violet when geom.o is read, then each hole get patched with S + A − P.',
    'Pick Forget geom.o: the socket stays open to the end and ld prints "undefined reference to `area\'".',
    'Compare Library first and Library last: the same archive works or fails depending only on where it sits on the command line.',
    'Switch libc to Static: printf.o is copied in, the PLT stub disappears, and the file-size bar jumps.',
    'On Load & run, play it with Binding Lazy, then At load (-z now), and press Run again to see ASLR move libc.so.6.',
  ],
  keyIdeas: [
    'The compiler works one file at a time; calls into other files are left as holes described by relocations.',
    'The linker matches every needed symbol to exactly one definition, then patches each hole (S + A − P for a PC-relative call).',
    'A static archive is searched only for symbols already missing when the linker reaches it, so order matters.',
    'A dynamically linked program keeps a PLT stub and a GOT slot; ld.so maps the library and fills the slot at run time.',
  ],
  quiz: [
    {
      q: 'main.c calls area(), defined in geom.c. Running `gcc -c main.c` succeeds. What did the compiler do about the call?',
      options: [
        'Left a hole, plus a relocation naming area',
        'Opened geom.c to find where area starts',
        'Copied the body of area into main.o',
        'Stopped with an "undefined reference" error',
      ],
      answer: 0,
      why: 'The compiler only sees main.c (plus the declaration of area). It emits the call with a zeroed 4-byte hole and a relocation saying "put area\'s address here". Finding area is the linker\'s job, which is why "undefined reference" is a link error, not a compile error.',
    },
    {
      q: '`gcc -o app -L. -lgeom main.o` fails with "undefined reference to `area\'", yet libgeom.a defines area. Why?',
      options: [
        'The archive was searched before anything needed area',
        'Archives must be extracted with ar before linking',
        'The -L. flag is ignored when it comes before main.o',
        'libgeom.a can only be used by a dynamic link step',
      ],
      answer: 0,
      why: 'A static archive is searched when the linker reaches it, for symbols missing at that moment. Nothing was missing yet, so geom.o was not pulled in, and the linker never goes back. Putting -lgeom after main.o fixes it; -L. only says where to look.',
    },
    {
      q: 'A dynamically linked program calls printf. Where is printf\'s machine code?',
      options: [
        'In libc.so.6, mapped in by the loader at run time',
        'Copied into the program\'s own .text by the linker',
        'Inside the PLT stub that the program jumps through',
        'Downloaded by the kernel the first time it is called',
      ],
      answer: 0,
      why: 'A dynamic link records NEEDED libc.so.6 and leaves a PLT stub; the code stays in the shared library. That is why a dynamically linked binary is small and why it fails to start if the library is missing. The stub only jumps through the GOT to wherever ld.so found printf.',
    },
    {
      q: 'With lazy binding, what does the GOT slot for printf hold before the first call?',
      options: [
        'An address in the PLT that leads to the resolver',
        'The address of printf, written in by the linker',
        'Zero, so the first call crashes and is retried',
        'A copy of the first bytes of printf\'s machine code',
      ],
      answer: 0,
      why: 'The linker can\'t know where libc will be mapped, so the slot starts pointing back into the stub, which calls ld.so\'s resolver. The resolver finds printf, writes its address into the slot and jumps there; later calls go straight through. With -z now, ld.so fills it before main runs.',
    },
    {
      q: 'Two object files both define `int area(int, int)`. What happens at link time?',
      options: [
        'A "multiple definition" error, naming both files',
        'The linker silently keeps the first definition',
        'The linker keeps whichever definition is shorter',
        'The program links, and calls to area pick one at random',
      ],
      answer: 0,
      why: 'Two strong global definitions of one symbol are an error: ld reports "multiple definition of `area\'" and points at the first. (Weak symbols and some old C rules for uninitialised globals behave differently, which this lesson leaves out.)',
    },
  ],
};

export default lesson;
