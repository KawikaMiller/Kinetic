import { functionAt, type ObjFile, type Reloc, type SectionName } from './objects';

/**
 * A simplified static linker in the style of GNU ld on ELF x86-64:
 *
 * - Object files named on the command line are always included.
 * - A static archive (libgeom.a, libc.a) is searched when ld reaches it: a member is pulled in
 *   only if it defines a symbol that is undefined *at that moment*, repeating until no more
 *   members are needed. Symbols referenced later don't go back to an earlier archive.
 * - A shared library (libc.so.6) satisfies the undefined symbols it exports; the program then
 *   calls them through a PLT stub and records NEEDED libc.so.6 for the loader.
 * - Two global definitions of one symbol are a "multiple definition" error; anything still
 *   undefined at the end is an "undefined reference", once per place that uses it.
 * - Sections of the included files are laid out in order, then each relocation is patched:
 *   for these PC-relative types the 4 bytes become S + A − P (symbol address + addend − the
 *   address of the hole), as a signed 32-bit little-endian number.
 *
 * Not modelled: start-up files (crt1.o etc.), .init/.fini, symbol versioning, weak symbols,
 * COMMON symbols, --as-needed and the many other relocation types.
 */

export type Input =
  | { kind: 'obj'; obj: ObjFile }
  | { kind: 'archive'; name: string; flag: string; members: readonly ObjFile[] }
  | { kind: 'shared'; name: string; flag: string; exports: readonly string[] };

export type Mode = 'dynamic' | 'static';

/** Where things go in the output: the classic x86-64 non-PIE layout, one page per segment. */
export const BASE = {
  /** .plt (dynamic only), then .text: the r-x segment. */
  text: 0x401000,
  rodata: 0x402000,
  /** .got.plt (dynamic only), then .data: the rw- segment. */
  data: 0x404000,
} as const;
export const TEXT_ALIGN = 16;
/** PLT0 (the resolver trampoline) and one 16-byte stub per imported function. */
export const PLT_ENTRY = 16;
/** .got.plt starts with 3 reserved 8-byte slots, then one per imported function. */
export const GOT_RESERVED = 3;
export const GOT_SLOT = 8;

export interface Placed {
  obj: ObjFile;
  section: SectionName;
  addr: number;
  size: number;
}

export interface Patch {
  obj: string;
  reloc: Reloc;
  S: number;
  P: number;
  value: number;
  bytes: [number, number, number, number];
  /** True when S is a PLT stub (a call into a shared library). */
  viaPlt: boolean;
}

export type LinkEvent =
  | { k: 'read'; input: number; defines: string[]; needs: string[]; resolved: string[] }
  | { k: 'pull'; input: number; member: string; defines: string[]; needs: string[]; resolved: string[] }
  | { k: 'skip'; input: number; why: string }
  | { k: 'shared'; input: number; resolved: string[] }
  | { k: 'duplicate'; input: number; symbol: string; first: string }
  | { k: 'undefined'; symbol: string; obj: string; offset: number };

export interface LinkResult {
  ok: boolean;
  events: LinkEvent[];
  /** Object files that made it into the output, in order (archive members included). */
  included: ObjFile[];
  /** Global symbol → the file that defines it. */
  definedBy: Map<string, string>;
  /** Symbols left to a shared library (called through the PLT). */
  dynamic: string[];
  needed: string[];
  layout: Placed[];
  plt: { symbol: string; addr: number; got: number }[];
  symbols: Map<string, number>;
  patches: Patch[];
  /** GNU ld's messages, in the order it prints them. */
  messages: string[];
}

const pltAddr = (i: number) => BASE.text + PLT_ENTRY * (i + 1);
const gotAddr = (i: number) => BASE.data + GOT_SLOT * (GOT_RESERVED + i);
const alignUp = (x: number, a: number) => Math.ceil(x / a) * a;

/** Signed 32-bit little-endian. Throws if the value doesn't fit, like ld's "relocation truncated". */
export function le32(value: number): [number, number, number, number] {
  if (value < -0x80000000 || value > 0x7fffffff) throw new RangeError(`relocation truncated to fit: ${value}`);
  const u = value >>> 0;
  return [u & 0xff, (u >>> 8) & 0xff, (u >>> 16) & 0xff, (u >>> 24) & 0xff];
}

export function link(inputs: readonly Input[]): LinkResult {
  const events: LinkEvent[] = [];
  const included: ObjFile[] = [];
  const definedBy = new Map<string, string>();
  const dynamic: string[] = [];
  const needed: string[] = [];
  const messages: string[] = [];
  /** Undefined symbols, in the order they were first needed. */
  const pending: string[] = [];

  const include = (obj: ObjFile, input: number, kind: 'read' | 'pull') => {
    included.push(obj);
    const defines = obj.defines.map((s) => s.name);
    const resolved: string[] = [];
    // Reported after the read, so the story reads "read the file, then find the clash".
    const duplicates: LinkEvent[] = [];
    for (const name of defines) {
      const first = definedBy.get(name);
      if (first !== undefined) {
        duplicates.push({ k: 'duplicate', input, symbol: name, first });
        const here = obj.defines.find((s) => s.name === name)!;
        const firstObj = included.find((o) => o.name === first)!;
        const there = firstObj.defines.find((s) => s.name === name)!;
        const at = (sym: typeof here) => `(${sym.section}+0x${sym.offset.toString(16)})`;
        messages.push(
          `/usr/bin/ld: ${obj.name}: in function \`${functionAt(obj, here.section, here.offset)}':`,
          `${obj.source}:${at(here)}: multiple definition of \`${name}'; ${first}:${firstObj.source}:${at(there)}: first defined here`,
        );
        continue;
      }
      definedBy.set(name, obj.name);
      const at = pending.indexOf(name);
      if (at >= 0) {
        pending.splice(at, 1);
        resolved.push(name);
      }
    }
    const locals = new Set((obj.locals ?? []).map((s) => s.name));
    const needs = [...new Set(obj.relocs.map((r) => r.symbol))].filter((s) => !locals.has(s) && !obj.defines.some((d) => d.name === s));
    for (const s of needs) if (!definedBy.has(s) && !dynamic.includes(s) && !pending.includes(s)) pending.push(s);
    events.push(kind === 'read' ? { k: 'read', input, defines, needs, resolved } : { k: 'pull', input, member: obj.name, defines, needs, resolved }, ...duplicates);
  };

  inputs.forEach((inp, i) => {
    if (inp.kind === 'obj') include(inp.obj, i, 'read');
    else if (inp.kind === 'archive') {
      let pulled = false;
      for (let again = true; again; ) {
        again = false;
        for (const m of inp.members) {
          if (included.includes(m)) continue;
          if (m.defines.some((s) => pending.includes(s.name))) {
            include(m, i, 'pull');
            pulled = again = true;
          }
        }
      }
      if (!pulled) {
        const offers = inp.members.flatMap((m) => m.defines.map((s) => s.name));
        events.push({ k: 'skip', input: i, why: pending.length ? `it offers ${offers.join(', ')}, but what is missing is ${pending.join(', ')}, so it pulls nothing` : `nothing is undefined yet, so it pulls nothing (it offers ${offers.join(', ')})` });
      }
    } else {
      const resolved = pending.filter((s) => inp.exports.includes(s));
      for (const s of resolved) {
        pending.splice(pending.indexOf(s), 1);
        dynamic.push(s);
      }
      if (resolved.length && !needed.includes(inp.name)) needed.push(inp.name);
      events.push({ k: 'shared', input: i, resolved });
    }
  });

  // Every remaining undefined symbol is reported at each place that uses it.
  for (const obj of included) {
    for (const r of obj.relocs) {
      if (!pending.includes(r.symbol)) continue;
      events.push({ k: 'undefined', symbol: r.symbol, obj: obj.name, offset: r.offset });
      messages.push(
        `/usr/bin/ld: ${obj.name}: in function \`${functionAt(obj, r.section, r.offset)}':`,
        `${obj.source}:(${r.section}+0x${r.offset.toString(16)}): undefined reference to \`${r.symbol}'`,
      );
    }
  }

  const ok = messages.length === 0;
  if (!ok) messages.push('collect2: error: ld returned 1 exit status');

  // Layout: .plt first in the text segment when anything is dynamic, then each file's sections in order.
  const layout: Placed[] = [];
  const plt = dynamic.map((symbol, i) => ({ symbol, addr: pltAddr(i), got: gotAddr(i) }));
  const cursor: Record<SectionName, number> = {
    '.text': dynamic.length ? pltAddr(dynamic.length) : BASE.text,
    '.rodata': BASE.rodata,
    '.data': dynamic.length ? gotAddr(dynamic.length) : BASE.data,
  };
  for (const obj of included) {
    for (const section of ['.text', '.rodata', '.data'] as const) {
      const bytes = obj.sections[section];
      if (!bytes) continue;
      const addr = section === '.text' ? alignUp(cursor[section], TEXT_ALIGN) : cursor[section];
      layout.push({ obj, section, addr, size: bytes.length });
      cursor[section] = addr + bytes.length;
    }
  }

  // Symbol addresses: globals and each file's locals.
  const symbols = new Map<string, number>();
  const sectionAddr = (obj: ObjFile, section: SectionName) => layout.find((p) => p.obj === obj && p.section === section)?.addr;
  for (const obj of included) {
    for (const s of obj.defines) if (definedBy.get(s.name) === obj.name) symbols.set(s.name, sectionAddr(obj, s.section)! + s.offset);
  }
  for (const p of plt) symbols.set(p.symbol, p.addr);

  const patches: Patch[] = [];
  if (ok) {
    for (const obj of included) {
      for (const r of obj.relocs) {
        const local = obj.locals?.find((s) => s.name === r.symbol);
        const S = local ? sectionAddr(obj, local.section)! + local.offset : symbols.get(r.symbol)!;
        const P = sectionAddr(obj, r.section)! + r.offset;
        const value = S + r.addend - P;
        patches.push({ obj: obj.name, reloc: r, S, P, value, bytes: le32(value), viaPlt: dynamic.includes(r.symbol) });
      }
    }
  }

  return { ok, events, included, definedBy, dynamic, needed, layout, plt, symbols, patches, messages };
}

/** One included file's section bytes as they end up in the output, with its patches applied. */
export function patchedSection(result: LinkResult, objName: string, section: SectionName, upTo = Infinity): { addr: number; bytes: number[] } | null {
  const placed = result.layout.find((p) => p.obj.name === objName && p.section === section);
  if (!placed) return null;
  const bytes = [...placed.obj.sections[section]!];
  result.patches.slice(0, upTo).forEach((patch) => {
    if (patch.obj !== objName || patch.reloc.section !== section) return;
    patch.bytes.forEach((b, i) => (bytes[patch.reloc.offset + i] = b));
  });
  return { addr: placed.addr, bytes };
}

export const hex = (n: number) => `0x${n.toString(16)}`;
export const signedHex = (n: number) => (n < 0 ? `−0x${(-n).toString(16)}` : `0x${n.toString(16)}`);
