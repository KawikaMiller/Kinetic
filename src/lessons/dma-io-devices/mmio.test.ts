import { describe, expect, it } from 'vitest';
import {
  DEVICE_BASE, FIRST_WORD, SLICES, SLICE_BYTES, access, deviceStatus, freshMachine, parseHex, regionOf, registerAddress, romWord, type Machine, type Request,
} from './mmio';

const STATUS = registerAddress('STATUS', 'mem');
const DATA = registerAddress('DATA', 'mem');
const CONTROL = registerAddress('CONTROL', 'mem');

const run = (steps: Request[], cacheDevice: boolean, m: Machine = freshMachine()) => {
  const outs: number[] = [];
  for (const s of steps) {
    const r = access(m, s, cacheDevice);
    m = r.m;
    if ('value' in r.out) outs.push(r.out.value);
  }
  return { m, outs };
};
const read = (addr: number, space: 'mem' | 'port' = 'mem'): Request => ({ op: 'read', space, addr });
const write = (addr: number, value: number, space: 'mem' | 'port' = 'mem'): Request => ({ op: 'write', space, addr, value });

describe('the toy map', () => {
  it('slices 0-3 are RAM, slice 4 holds the device window, 5-14 are unmapped and 15 is ROM', () => {
    const kinds = Array.from({ length: SLICES }, (_, s) => regionOf(s * SLICE_BYTES));
    expect(kinds).toEqual(['ram', 'ram', 'ram', 'ram', 'device', ...Array(10).fill('unmapped'), 'rom']);
    expect(regionOf(DEVICE_BASE + 0xfff)).toBe('device');
    expect(regionOf(DEVICE_BASE + 0x1000)).toBe('unmapped');
    expect(regionOf(0x3fff_ffff)).toBe('ram');
  });
});

describe('the device registers', () => {
  it('reading STATUS twice gives different answers: the first read clears READY (the point of volatile)', () => {
    const { outs, m } = run([read(STATUS), read(STATUS)], false);
    expect(outs).toEqual([1, 0]);
    expect(deviceStatus(m)).toBe(0);
  });

  it('writing START to CONTROL loads the next word into DATA and sets READY again; DATA reads do not change READY', () => {
    const { outs, m } = run([read(STATUS), read(DATA), write(CONTROL, 1), read(STATUS), read(DATA), read(DATA)], false);
    expect(outs).toEqual([1, FIRST_WORD, 1, 1, FIRST_WORD + 1, FIRST_WORD + 1]);
    expect(m.ready).toBe(false);
  });

  it('a CONTROL write without START changes nothing but CONTROL; STATUS and DATA stores are ignored', () => {
    const { m } = run([write(CONTROL, 2), write(STATUS, 0xff), write(DATA, 0x99)], false);
    expect([m.control, m.data, m.ready]).toEqual([2, FIRST_WORD, true]);
  });

  it('RAM stores and returns, ROM returns its pattern and ignores stores, an unmapped address is a bus error', () => {
    const r = run([write(0x1000, 0x42), read(0x1000), read(0x2000), write(0xf000_0010, 7), read(0xf000_0010)], false);
    expect(r.outs).toEqual([0x42, 0x42, 0, romWord(0xf000_0010), romWord(0xf000_0010)]);
    expect(access(freshMachine(), read(0x5000_0000), false).out.kind).toBe('unmapped');
  });
});

describe('cached versus uncached device window', () => {
  it('an uncached STATUS read reaches the device every time; a cached one returns the first answer forever', () => {
    const reads = Array.from({ length: 4 }, () => read(STATUS));
    const uncached = run(reads, false);
    expect(uncached.outs).toEqual([1, 0, 0, 0]);
    expect(uncached.m.deviceReads).toBe(4);

    const cached = run(reads, true);
    expect(cached.outs).toEqual([1, 1, 1, 1]);
    expect([cached.m.deviceReads, cached.m.cacheReads]).toEqual([1, 3]);
    expect(deviceStatus(cached.m)).toBe(0);
    expect(cached.m.lastStatus).toBe(1);
  });

  it('even a new word does not reach a cached STATUS: START reaches the device (write-through) but the stale line stays', () => {
    const r = run([read(STATUS), write(CONTROL, 1), read(STATUS)], true);
    expect(deviceStatus(r.m)).toBe(1);
    expect(r.outs[2]).toBe(1);
    expect(r.m.cacheReads).toBe(1);
  });
});

describe('port-mapped I/O is a separate address space', () => {
  const ports = [read(0x200, 'port'), read(0x200, 'port'), write(0x202, 1, 'port'), read(0x201, 'port'), read(0x200, 'port')];
  it('in/out reach the device registers and read STATUS destructively, exactly like the memory-mapped window', () => {
    expect(run(ports, false).outs).toEqual([1, 0, 1, FIRST_WORD + 1, 1]);
  });
  it('the cache setting is hidden state for port space: every outcome and counter is identical either way', () => {
    expect(run(ports, true)).toEqual(run(ports, false));
  });
  it('a memory load at the window address does not reach the device by port, and a port number is not a memory address', () => {
    expect(access(freshMachine(), read(0x200, 'mem'), false).out.kind).toBe('ram');
    expect(access(freshMachine(), read(DEVICE_BASE, 'port'), false).out).toMatchObject({ kind: 'port', register: null });
  });
});

describe('typed hex fields', () => {
  const MEM = { max: 0xffff_ffff, what: 'An address' };
  const PORT = { max: 0xffff, what: 'A port' };
  it('accepts whole bytes of hex, with or without 0x', () => {
    expect(parseHex('40000000', MEM)).toEqual({ ok: true, value: DEVICE_BASE });
    expect(parseHex('0x4000_0004', MEM)).toEqual({ ok: true, value: DEVICE_BASE + 4 });
    expect(parseHex('FFFFFFFF', MEM)).toEqual({ ok: true, value: 0xffff_ffff });
    expect(parseHex('0200', PORT)).toEqual({ ok: true, value: 0x200 });
  });
  it('refuses non-hex, an odd number of digits, an empty field and a value outside the map, each with its reason', () => {
    const bad = (text: string, rules = MEM) => {
      const r = parseHex(text, rules);
      if (r.ok) throw new Error(`${text} was accepted`);
      return r.error;
    };
    expect(bad('4000000G')).toContain('not hex');
    expect(bad('123')).toContain('even number of hex digits');
    expect(bad('')).toContain('Type');
    expect(bad('100000000')).toContain('even number');
    expect(bad('0100000000')).toContain('32-bit toy map');
    expect(bad('010000', PORT)).toContain('16 bits');
    expect(bad('-4')).toContain('not hex');
  });
});
