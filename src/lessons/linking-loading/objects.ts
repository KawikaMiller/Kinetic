/**
 * The lesson's object files, as `gcc -O1 -c` would produce them for x86-64 (System V ABI):
 * simplified to the sections and symbols that matter here. The machine-code bytes are the real
 * x86-64 encodings of the listings beside them; the 4-byte holes are what the assembler leaves
 * for the linker, described by RELA relocations (the addend lives in the relocation, so the
 * hole holds zeros).
 *
 *   // main.c                         // geom.c
 *   int area(int w, int h);           #include <stdio.h>
 *   int main(void) {                  int scale = 2;
 *     return area(3, 4);              int area(int w, int h) {
 *   }                                   int a = w * h * scale;
 *                                       printf("area=%d\n", a);
 *                                       return a;
 *                                     }
 */

export type SectionName = '.text' | '.rodata' | '.data';
export type RelocType = 'R_X86_64_PLT32' | 'R_X86_64_PC32';

export interface Sym {
  name: string;
  section: SectionName;
  offset: number;
}

export interface Reloc {
  section: SectionName;
  /** Where the 4-byte hole starts, from the start of the section. */
  offset: number;
  type: RelocType;
  symbol: string;
  addend: number;
  /** The instruction it patches, for the table. */
  what: string;
}

export interface ObjFile {
  name: string;
  source: string;
  /** The function the relocation sits in, for ld's "in function" line. */
  sections: Partial<Record<SectionName, readonly number[]>>;
  /** Global symbols this file defines. */
  defines: readonly Sym[];
  /** Symbols local to this file (not visible to other files): a string literal's label. */
  locals?: readonly Sym[];
  relocs: readonly Reloc[];
}

export const MAIN_C = ['int area(int w, int h);', '', 'int main(void) {', '  return area(3, 4);', '}'];
export const GEOM_C = ['#include <stdio.h>', '', 'int scale = 2;', '', 'int area(int w, int h) {', '  int a = w * h * scale;', '  printf("area=%d\\n", a);', '  return a;', '}'];

export const MAIN_O: ObjFile = {
  name: 'main.o',
  source: 'main.c',
  sections: {
    '.text': [
      0x48, 0x83, 0xec, 0x08, //       sub  rsp, 8
      0xbe, 0x04, 0x00, 0x00, 0x00, // mov  esi, 4
      0xbf, 0x03, 0x00, 0x00, 0x00, // mov  edi, 3
      0xe8, 0x00, 0x00, 0x00, 0x00, // call area      (hole at 0xf)
      0x48, 0x83, 0xc4, 0x08, //       add  rsp, 8
      0xc3, //                         ret
    ],
  },
  defines: [{ name: 'main', section: '.text', offset: 0 }],
  relocs: [{ section: '.text', offset: 0xf, type: 'R_X86_64_PLT32', symbol: 'area', addend: -4, what: 'call area' }],
};

const AREA_TEXT = [
  0x53, //                                     push rbx
  0x0f, 0xaf, 0xfe, //                         imul edi, esi
  0x0f, 0xaf, 0x3d, 0x00, 0x00, 0x00, 0x00, // imul edi, DWORD PTR scale[rip]   (hole at 0x7)
  0x89, 0xfb, //                               mov  ebx, edi
  0x89, 0xfe, //                               mov  esi, edi
  0x48, 0x8d, 0x3d, 0x00, 0x00, 0x00, 0x00, // lea  rdi, .LC0[rip]   (hole at 0x12)
  0xb8, 0x00, 0x00, 0x00, 0x00, //             mov  eax, 0
  0xe8, 0x00, 0x00, 0x00, 0x00, //             call printf   (hole at 0x1c)
  0x89, 0xd8, //                               mov  eax, ebx
  0x5b, //                                     pop  rbx
  0xc3, //                                     ret
];

/** "area=%d\n" and its NUL. */
const FORMAT = [...'area=%d\n'].map((c) => c.charCodeAt(0)).concat(0);

export const GEOM_O: ObjFile = {
  name: 'geom.o',
  source: 'geom.c',
  sections: { '.text': AREA_TEXT, '.rodata': FORMAT, '.data': [0x02, 0x00, 0x00, 0x00] },
  defines: [
    { name: 'area', section: '.text', offset: 0 },
    { name: 'scale', section: '.data', offset: 0 },
  ],
  locals: [{ name: '.LC0', section: '.rodata', offset: 0 }],
  relocs: [
    { section: '.text', offset: 0x7, type: 'R_X86_64_PC32', symbol: 'scale', addend: -4, what: 'imul … scale[rip]' },
    { section: '.text', offset: 0x12, type: 'R_X86_64_PC32', symbol: '.LC0', addend: -4, what: 'lea rdi, .LC0[rip]' },
    { section: '.text', offset: 0x1c, type: 'R_X86_64_PLT32', symbol: 'printf', addend: -4, what: 'call printf' },
  ],
};

/** A second file that also defines area: the duplicate-definition preset. */
export const GEOM2_O: ObjFile = {
  name: 'geom2.o',
  source: 'geom2.c',
  sections: {
    '.text': [
      0x89, 0xf8, //       mov  eax, edi
      0x0f, 0xaf, 0xc6, // imul eax, esi
      0xc3, //             ret
    ],
  },
  defines: [{ name: 'area', section: '.text', offset: 0 }],
  relocs: [],
};

/** libc's printf, as one archive member (static) or one export (dynamic). Its size is illustrative. */
export const PRINTF_O: ObjFile = {
  name: 'printf.o',
  source: 'printf.c',
  sections: { '.text': new Array(0x40).fill(0x90) },
  defines: [{ name: 'printf', section: '.text', offset: 0 }],
  relocs: [],
};

/** The names a relocation's "in function" line uses: the function that contains the hole. */
export function functionAt(obj: ObjFile, section: SectionName, offset: number): string | null {
  const fns = obj.defines.filter((s) => s.section === section && s.offset <= offset).sort((a, b) => b.offset - a.offset);
  return fns[0]?.name ?? null;
}
