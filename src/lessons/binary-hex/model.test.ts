import { describe, expect, it } from 'vitest';
import { fromBits, toBits } from '../../core/bits';
import { countUpPlan, countUpSteps, formatIn, groupDigits, hexDigit, parseAnyBase, PRESETS, rgbBytes, rwxString, type Base } from './model';

const BASES: Base[] = [2, 8, 10, 16];
const strip = (s: string) => s.replace(/^0[xob]/, '').replace(/\s/g, '');

describe('formatIn / parseAnyBase round-trip every 16-bit value', () => {
  it('agrees with Number.toString(base) and parseInt for 0..65535 in every base', () => {
    // Exhaustive; mismatches are collected and asserted once, so a failure still names every bad value.
    const mismatches: string[] = [];
    for (let v = 0; v <= 0xffff; v++) {
      for (const base of BASES) {
        const shown = formatIn(v, base, 16);
        if (parseInt(strip(shown), base) !== v) mismatches.push(`parseInt ${shown} (base ${base}) ≠ ${v}`);
        if (strip(shown).replace(/^0+(?=.)/, '').toLowerCase() !== v.toString(base)) mismatches.push(`${shown} ≠ toString(${base}) of ${v}`);
        // the binary readout is shown grouped without a prefix, so read it back as binary
        const parsed = parseAnyBase(shown, base, 16);
        if (!parsed.ok || parsed.value !== v || parsed.base !== base || Object.keys(parsed).length !== 3) {
          mismatches.push(`parseAnyBase(${shown}, ${base}) = ${JSON.stringify(parsed)}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('pads hex and binary to the register width', () => {
    expect(formatIn(0x2a, 16, 16)).toBe('0x002A');
    expect(formatIn(5, 2, 8)).toBe('0000 0101');
    expect(formatIn(0xff8800, 16, 24)).toBe('0xFF8800');
  });
});

describe('parseAnyBase', () => {
  it('uses the prefix, else the fallback base', () => {
    expect(parseAnyBase('0xff', 10, 16)).toEqual({ ok: true, value: 255, base: 16 });
    expect(parseAnyBase('#ff8800', 10, 24)).toEqual({ ok: true, value: 0xff8800, base: 16 }); // allow-color: parser input
    expect(parseAnyBase('0b1111_0000', 10, 8)).toEqual({ ok: true, value: 240, base: 2 });
    expect(parseAnyBase('755', 8, 16)).toEqual({ ok: true, value: 493, base: 8 });
    expect(parseAnyBase(' 42 ', 10, 8)).toEqual({ ok: true, value: 42, base: 10 });
  });

  it('rejects stray digits instead of cutting them off like parseInt', () => {
    expect(parseInt('12z', 10)).toBe(12);
    expect(parseAnyBase('12z', 10, 16).ok).toBe(false);
    expect(parseAnyBase('0b102', 10, 16).ok).toBe(false);
    expect(parseAnyBase('0o8', 10, 16).ok).toBe(false);
    expect(parseAnyBase('0x', 10, 16).ok).toBe(false);
    expect(parseAnyBase('', 10, 16).ok).toBe(false);
  });

  it('rejects values that do not fit the register', () => {
    expect(parseAnyBase('256', 10, 8).ok).toBe(false);
    expect(parseAnyBase('255', 10, 8).ok).toBe(true);
    expect(parseAnyBase('0x10000', 10, 16).ok).toBe(false);
  });
});

describe('count up', () => {
  it('ripple steps flip one bit each and end on +1 (mod 2^16) for every 16-bit value', () => {
    const mismatches: string[] = [];
    for (let v = 0; v <= 0xffff; v++) {
      const steps = countUpSteps(toBits(v, 16));
      if (fromBits(steps[steps.length - 1].bits) !== (v + 1) % 0x10000) mismatches.push(`${v}: ends on ${fromBits(steps[steps.length - 1].bits)}`);
      let prev = toBits(v, 16);
      steps.forEach((s, k) => {
        const flipped = s.bits.filter((b, i) => b !== prev[i]).length;
        if (flipped !== 1) mismatches.push(`${v} step ${k}: ${flipped} bits flipped`);
        if (s.bits[s.ring] === prev[s.ring]) mismatches.push(`${v} step ${k}: ring bit ${s.ring} unchanged`);
        prev = s.bits;
      });
    }
    expect(mismatches).toEqual([]);
  });

  it('lists the carries from the right, then the landing bit', () => {
    expect(countUpPlan(toBits(0b0111, 4))).toEqual({ carries: [3, 2, 1], landing: 0 });
    expect(countUpPlan(toBits(0b0110, 4))).toEqual({ carries: [], landing: 3 });
    expect(countUpPlan(toBits(0b1111, 4))).toEqual({ carries: [3, 2, 1, 0], landing: null });
  });
});

describe('real-world presets', () => {
  it('chmod octal digits map to rwx triples', () => {
    expect(rwxString(0o755)).toBe('rwxr-xr-x');
    expect(rwxString(0o644)).toBe('rw-r--r--');
    expect(rwxString(0o700)).toBe('rwx------');
    expect(rwxString(0o777)).toBe('rwxrwxrwx');
    // each octal digit is exactly one rwx triple
    for (let d = 0; d < 8; d++) expect(rwxString(d)).toBe(`------${rwxString(d * 0o100).slice(0, 3)}`);
  });

  it('splits a colour into its three bytes', () => {
    expect(rgbBytes(0xff8800)).toEqual([255, 136, 0]);
  });

  it('presets fit their register width', () => {
    for (const p of PRESETS) expect(p.value).toBeLessThanOrEqual(2 ** p.width - 1);
  });

  it('hex digits and digit grouping', () => {
    expect(hexDigit([1, 0, 1, 0])).toBe('A');
    expect(groupDigits('101011', 4)).toBe('10 1011');
  });
});
