/**
 * The four modules the page instantiates, hand-assembled by the lesson's author from the text
 * format (not produced by a compiler) and validated by the real engine in the tests. The learner
 * never supplies bytes: the only edit is one of three operator bytes in the add module.
 */

const fromHex = (hex: string) => Uint8Array.from(hex.replace(/\s+/g, '').match(/../g)!.map((h) => parseInt(h, 16)));

/** `int add(int a, int b) { return a + b; }`: header, type, function, export "add", code. 41 bytes. */
export const ADD_BYTES = fromHex('0061736d01000000 01070160027f7f017f 03020100 07070103616464 0000 0a09010700200020016a0b');

/** `sum(n)`: adds 0 to n - 1 with block, loop and br_if. 68 bytes. */
export const SUM_BYTES = fromHex('0061736d0100000001060160017f017f030201000707010373756d00000a25012301027f02400340200120004e0d01200220016a2102200141016a21010c000b0b20020b');

/** `sum_array(ptr, len)`: adds `len` 32-bit integers from linear memory, which it exports as "mem". 95 bytes. */
export const SUM_ARRAY_BYTES = fromHex('0061736d0100000001070160027f7f017f0302010005030100010713020973756d5f61727261790000036d656d02000a2e012c01027f02400340200220014e0d012003200020024102746a2802006a2103200241016a21020c000b0b20030b');

/** Imports env.log(i32), exports run(i32), which calls it, and div(i32, i32) using i32.div_s. 72 bytes. */
export const IMPORT_BYTES = fromHex(
  '0061736d01000000 010b02 60017f00 60027f7f017f 020b01 03656e76 036c6f67 0000 03030200 01 070d02 0372756e0001 036469760002 0a1002 0600200010000b 07002000 20016d0b',
);

export const MODULE_SIZES = { add: 41, sum: 68, sumArray: 95, imports: 72 } as const;

// ---- the add module's three operators ----

export type OperatorId = 'add' | 'sub' | 'mul';

export interface Operator {
  id: OperatorId;
  /** The instruction's name in the text format. */
  name: string;
  /** Its opcode byte. */
  byte: number;
  /** The same operation in the C-like source. */
  c: string;
}

export const OPERATORS: readonly Operator[] = [
  { id: 'add', name: 'i32.add', byte: 0x6a, c: '+' },
  { id: 'sub', name: 'i32.sub', byte: 0x6b, c: '-' },
  { id: 'mul', name: 'i32.mul', byte: 0x6c, c: '*' },
];

/** Where the operator byte sits in the add module: the byte before the closing `end`. */
export const OPERATOR_AT = ADD_BYTES.length - 2;

export const operator = (id: OperatorId): Operator => OPERATORS.find((o) => o.id === id)!;

/** The add module with one of the three whitelisted operator bytes. No other byte can be changed. */
export function addModuleFor(id: OperatorId): Uint8Array {
  const bytes = ADD_BYTES.slice();
  bytes[OPERATOR_AT] = operator(id).byte;
  return bytes;
}

// ---- sections, for the byte grid's key ----

export interface Section {
  id: number;
  name: string;
  /** Inclusive byte range, the section id and size bytes included. */
  from: number;
  to: number;
}

const SECTION_NAMES: Record<number, string> = { 1: 'type', 2: 'import', 3: 'function', 5: 'memory', 7: 'export', 10: 'code' };
export const HEADER_BYTES = 8;

/** Reads an unsigned LEB128 number at `at`; returns it and where the next byte is. */
export function readU32(bytes: Uint8Array, at: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let i = at;
  for (;;) {
    const b = bytes[i++];
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value, next: i };
    shift += 7;
  }
}

/** The sections of a module: the header is bytes 0 to 7, then each section is an id, a size and that many bytes. */
export function sectionsOf(bytes: Uint8Array): Section[] {
  const out: Section[] = [];
  let at = HEADER_BYTES;
  while (at < bytes.length) {
    const id = bytes[at];
    const size = readU32(bytes, at + 1);
    const to = size.next + size.value - 1;
    out.push({ id, name: SECTION_NAMES[id] ?? `section ${id}`, from: at, to });
    at = to + 1;
  }
  return out;
}
