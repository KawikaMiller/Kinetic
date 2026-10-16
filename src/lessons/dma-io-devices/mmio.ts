/**
 * Scene 2: a device is an address. A toy physical map, one toy device with three registers, an optional
 * cache over the device window and a separate port space. Pure and immutable; every register, address
 * and value is invented for the lesson.
 */
import { parseBoundedInt, type FieldParse } from '../../core/parse';

export type Space = 'mem' | 'port';
export type RegionKind = 'ram' | 'device' | 'rom' | 'unmapped';

/** The toy map is drawn as 16 slices of this many bytes. */
export const SLICE_BYTES = 0x1000_0000;
export const SLICES = 16;
export const MEM_MAX = 0xffff_ffff;
export const PORT_MAX = 0xffff;

export const RAM_END = 0x3fff_ffff;
export const DEVICE_BASE = 0x4000_0000;
export const DEVICE_WINDOW_BYTES = 0x1000;
export const ROM_BASE = 0xf000_0000;

/** Register offsets inside the device window (memory-mapped) and port numbers (port-mapped): invented. */
export const REGISTERS = [
  { name: 'STATUS', offset: 0x0, port: 0x200 },
  { name: 'DATA', offset: 0x4, port: 0x201 },
  { name: 'CONTROL', offset: 0x8, port: 0x202 },
] as const;
export type RegisterName = (typeof REGISTERS)[number]['name'];

export const READY_BIT = 0x1;
export const START_BIT = 0x1;
/** The first word the device hands out, and the step to the next. */
export const FIRST_WORD = 0xa0;

export interface Machine {
  ram: Readonly<Record<number, number>>;
  /** The device's own READY flag. */
  ready: boolean;
  data: number;
  control: number;
  nextWord: number;
  /** Cache lines over the device window, by address: what a cached mapping would return. */
  cache: Readonly<Record<number, number>>;
  deviceReads: number;
  cacheReads: number;
  /** What the last STATUS read returned, to compare with what the device holds now. */
  lastStatus: number | null;
}

export const freshMachine = (): Machine => ({
  ram: {}, ready: true, data: FIRST_WORD, control: 0, nextWord: FIRST_WORD + 1, cache: {}, deviceReads: 0, cacheReads: 0, lastStatus: null,
});

export const regionOf = (addr: number): RegionKind =>
  addr <= RAM_END ? 'ram'
    : addr >= DEVICE_BASE && addr < DEVICE_BASE + DEVICE_WINDOW_BYTES ? 'device'
      : addr >= ROM_BASE ? 'rom'
        : 'unmapped';

/** The ROM's contents: a recognisable pattern of the address, so a read shows it is not RAM. */
export const romWord = (addr: number) => (0xb007_0000 | (addr & 0xffff)) >>> 0;

export interface Request {
  op: 'read' | 'write';
  space: Space;
  addr: number;
  value?: number;
}

export type Outcome =
  | { kind: 'ram' | 'rom'; value: number; note: string }
  | { kind: 'device' | 'port'; register: RegisterName | null; value: number; note: string; reachedDevice: true }
  | { kind: 'cache'; register: RegisterName; value: number; note: string; reachedDevice: false }
  | { kind: 'unmapped'; note: string };

const registerAt = (offset: number) => REGISTERS.find((r) => r.offset === offset)?.name ?? null;
const registerAtPort = (port: number) => REGISTERS.find((r) => r.port === port)?.name ?? null;

/** The device's reaction to one register access: the register, its value and the new device state. */
function touchRegister(m: Machine, reg: RegisterName | null, req: Request): { m: Machine; value: number; note: string } {
  if (reg === null) return { m, value: 0, note: 'no register here, the access is ignored' };
  if (req.op === 'read') {
    if (reg === 'STATUS') {
      const value = m.ready ? READY_BIT : 0;
      return { m: { ...m, ready: false, lastStatus: value }, value, note: m.ready ? 'READY was set; the read cleared it' : 'READY was already clear' };
    }
    if (reg === 'DATA') return { m, value: m.data, note: 'the word the device holds, no side effect' };
    return { m, value: m.control, note: 'the last value written' };
  }
  const value = req.value ?? 0;
  if (reg === 'CONTROL') {
    const started = (value & START_BIT) !== 0;
    return {
      m: started ? { ...m, control: value, data: m.nextWord, nextWord: m.nextWord + 1, ready: true } : { ...m, control: value },
      value,
      note: started ? 'START set: the device loads its next word into DATA and sets READY' : 'START not set: nothing happens',
    };
  }
  return { m, value, note: `${reg} is read-only: the store is ignored` };
}

/**
 * One load, store, `in` or `out`. A memory-mapped device read can go through a cache when `cacheDevice` is set
 * (a mistake: device windows are mapped uncached). The port space is never cached, so the flag does nothing there.
 */
export function access(m: Machine, req: Request, cacheDevice: boolean): { m: Machine; out: Outcome } {
  if (req.space === 'port') {
    const reg = registerAtPort(req.addr);
    const r = touchRegister(m, reg, req);
    return { m: { ...r.m, deviceReads: r.m.deviceReads + (req.op === 'read' ? 1 : 0) }, out: { kind: 'port', register: reg, value: r.value, note: r.note, reachedDevice: true } };
  }
  const region = regionOf(req.addr);
  if (region === 'unmapped') return { m, out: { kind: 'unmapped', note: 'no RAM and no device answers this address: a bus error' } };
  if (region === 'ram') {
    if (req.op === 'write') return { m: { ...m, ram: { ...m.ram, [req.addr]: req.value ?? 0 } }, out: { kind: 'ram', value: req.value ?? 0, note: 'RAM stores the value' } };
    return { m, out: { kind: 'ram', value: m.ram[req.addr] ?? 0, note: m.ram[req.addr] === undefined ? 'RAM, never written here: reads as 0' : 'RAM returns what was stored' } };
  }
  if (region === 'rom') {
    if (req.op === 'write') return { m, out: { kind: 'rom', value: romWord(req.addr), note: 'ROM ignores stores' } };
    return { m, out: { kind: 'rom', value: romWord(req.addr), note: 'ROM returns its fixed contents' } };
  }
  const reg = registerAt(req.addr - DEVICE_BASE);
  if (req.op === 'read' && cacheDevice && reg !== null && m.cache[req.addr] !== undefined) {
    return { m: { ...m, cacheReads: m.cacheReads + 1 }, out: { kind: 'cache', register: reg, value: m.cache[req.addr], note: 'served from the cache line: the device was never asked', reachedDevice: false } };
  }
  const r = touchRegister(m, reg, req);
  let next = { ...r.m, deviceReads: r.m.deviceReads + (req.op === 'read' ? 1 : 0) };
  if (cacheDevice && reg !== null) next = { ...next, cache: { ...next.cache, [req.addr]: r.value } };
  return { m: next, out: { kind: 'device', register: reg, value: r.value, note: r.note, reachedDevice: true } };
}

/** What the device would answer for STATUS right now, with no side effect. */
export const deviceStatus = (m: Machine) => (m.ready ? READY_BIT : 0);

const hex = (n: number, digits: number) => n.toString(16).toUpperCase().padStart(digits, '0');
/** A 32-bit address or word as 8 hex digits, a port or short value as 4. */
export const hex32 = (n: number) => `0x${hex(n, 8)}`;
export const hex16 = (n: number) => `0x${hex(n, 4)}`;

/** Which register an address or port names, for the preset chips and the log. */
export const registerAddress = (name: RegisterName, space: Space) => {
  const r = REGISTERS.find((x) => x.name === name)!;
  return space === 'mem' ? DEVICE_BASE + r.offset : r.port;
};

/** The scene opens memory-mapped with STATUS selected. */
export const DEFAULT_SPACE: Space = 'mem';
export const DEFAULT_ADDRESS = registerAddress('STATUS', DEFAULT_SPACE);

export interface HexRules {
  max: number;
  what: string;
}

/**
 * A typed hex address or value: digits 0-9 and A-F (an optional 0x in front and underscores are fine), an even
 * number of digits, within `max`. Anything else is refused with the reason and the caller keeps its old value.
 */
export function parseHex(text: string, { max, what }: HexRules): FieldParse<number> {
  const digits = text.trim().replace(/^0x/i, '').replace(/_/g, '');
  if (digits !== '' && /^[0-9a-f]+$/i.test(digits) && digits.length % 2 === 1) {
    return { ok: false, error: `${what} needs an even number of hex digits (whole bytes): "${digits}" has ${digits.length}. Try 0${digits}.` };
  }
  return parseBoundedInt(text, {
    min: 0,
    max,
    plainRadix: 16,
    prefixes: ['hex'],
    underscores: true,
    messages: {
      empty: `Type ${what} in hex, like ${max > PORT_MAX ? '40000000' : '0200'}.`,
      invalid: (typed) => `"${typed}" is not hex: use the digits 0-9 and A-F.`,
      tooBig: () => (max > PORT_MAX ? `${what} must fit the 32-bit toy map: 00000000 to FFFFFFFF.` : `${what} is 16 bits: 0000 to FFFF.`),
    },
  });
}
