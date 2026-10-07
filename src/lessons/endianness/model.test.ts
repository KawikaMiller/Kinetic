import { describe, expect, it } from 'vitest';
import { hexByte } from '../../core/bytes';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { misreadCaption, networkCaption, storeFrames } from './frames';
import {
  BOM, DEFAULT_VALUE, HTTPS_PORT, PNG_IHDR_LENGTH, WIDTHS, address, byteCount, htons, loadValue, offsetOf, parseHexValue, parsePort,
  probeHost, readBack, registerBytes, registerIndexAt, storeBytes, tcpHeader, type Width,
} from './model';

const randomValue = (rnd: () => number, width: Width) => {
  let v = 0n;
  for (let i = 0; i < byteCount(width); i++) v = (v << 8n) | BigInt(Math.floor(rnd() * 256));
  return v;
};

describe('storing and loading', () => {
  it('lays 0x12345678 out as 12 34 56 78 big-endian and 78 56 34 12 little-endian', () => {
    expect(storeBytes(0x12345678n, 32, false)).toEqual([0x12, 0x34, 0x56, 0x78]);
    expect(storeBytes(0x12345678n, 32, true)).toEqual([0x78, 0x56, 0x34, 0x12]);
    expect(storeBytes(0x0123456789abcdefn, 64, true)).toEqual([0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01]);
  });

  it('round-trips 1,000 seeded values per width and order', () => {
    const rnd = mulberry32(7);
    for (const width of WIDTHS) {
      for (let t = 0; t < 1000; t++) {
        const v = randomValue(rnd, width);
        for (const little of [false, true]) expect(loadValue(storeBytes(v, width, little), width, little)).toBe(v);
      }
    }
  });

  it('little-endian is exactly the big-endian bytes reversed, never the bits', () => {
    const rnd = mulberry32(11);
    for (const width of WIDTHS) {
      for (let t = 0; t < 200; t++) {
        const v = randomValue(rnd, width);
        expect(storeBytes(v, width, true)).toEqual([...storeBytes(v, width, false)].reverse());
      }
    }
  });

  it('each register byte lands at the offset the colours follow', () => {
    const rnd = mulberry32(3);
    for (const width of WIDTHS) {
      const v = randomValue(rnd, width);
      const reg = registerBytes(v, width);
      for (const little of [false, true]) {
        const mem = storeBytes(v, width, little);
        for (let k = 0; k < byteCount(width); k++) {
          expect(mem[offsetOf(k, width, little)]).toBe(reg[k]);
          expect(registerIndexAt(offsetOf(k, width, little), width, little)).toBe(k);
        }
      }
    }
  });

  it('reading with the opposite order equals getUint32 with the opposite flag', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 1000; t++) {
      const v = randomValue(rnd, 32);
      for (const writeLittle of [false, true]) {
        const view = new DataView(new ArrayBuffer(4));
        view.setUint32(0, Number(v), writeLittle);
        expect(readBack(v, 32, writeLittle, !writeLittle)).toBe(BigInt(view.getUint32(0, !writeLittle)));
      }
    }
    expect(readBack(0x12345678n, 32, true, false)).toBe(0x78563412n);
  });
});

describe('parseHexValue', () => {
  it('reads hex with or without 0x, ignoring separators', () => {
    expect(parseHexValue('0x12345678', 32)).toEqual({ ok: true, value: 0x12345678n });
    expect(parseHexValue(' dead_BEEF ', 32)).toEqual({ ok: true, value: 0xdeadbeefn });
    expect(parseHexValue('0xFFFF FFFF FFFF FFFF', 64)).toEqual({ ok: true, value: 0xffffffffffffffffn });
  });

  it('refuses hostile input', () => {
    const refused = ['', '   ', '-1', '1.5', '0x', 'xyz', '<b>1</b>', '🙂', '12, 34', 'Infinity'];
    for (const t of refused) expect(parseHexValue(t, 32).ok, t).toBe(false);
    expect(parseHexValue('0x10000', 16).ok).toBe(false);
    // The field is hex, so "1e400" is the hex number 0x1E400, not a float: modelled, not refused.
    expect(parseHexValue('1e400', 32)).toEqual({ ok: true, value: 0x1e400n });
    expect(parseHexValue('1'.repeat(23), 64).ok).toBe(false);
  });
});

describe('the host probe', () => {
  it('reports what the typed-array probe actually sees', () => {
    const live = new Uint8Array(new Uint32Array([1]).buffer)[0];
    expect(probeHost()).toEqual({ firstByte: live, little: live === 1 });
  });
});

describe('network byte order', () => {
  it('writes 443 as 01 BB, big-endian', () => {
    expect(storeBytes(BigInt(HTTPS_PORT), 16, false)).toEqual([0x01, 0xbb]);
    expect(tcpHeader(51514, HTTPS_PORT, 1).slice(2, 4)).toEqual([0x01, 0xbb]);
  });

  it('htons puts every port in network order on either kind of host', () => {
    for (let p = 0; p <= 65535; p++) {
      for (const hostLittle of [false, true]) {
        const stored = storeBytes(BigInt(htons(p, hostLittle)), 16, hostLittle);
        if (stored[0] !== p >> 8 || stored[1] !== (p & 0xff)) throw new Error(`${p} ${hostLittle}`);
      }
    }
    expect(htons(HTTPS_PORT, false)).toBe(HTTPS_PORT);
  });

  it('parsePort accepts 0..65535 and refuses the rest', () => {
    expect(parsePort('443')).toEqual({ ok: true, value: 443 });
    for (const t of ['', '65536', '-1', '4.5', '0x1BB', '1e3', '🙂', '9'.repeat(23)]) expect(parsePort(t).ok, t).toBe(false);
  });
});

describe('presets', () => {
  it('the PNG chunk length is 00 00 00 0D big-endian and the BOM is FE FF / FF FE', () => {
    expect(storeBytes(BigInt(PNG_IHDR_LENGTH), 32, false)).toEqual([0, 0, 0, 0x0d]);
    expect(storeBytes(BOM, 16, false)).toEqual([0xfe, 0xff]);
    expect(storeBytes(BOM, 16, true)).toEqual([0xff, 0xfe]);
  });
});

describe('captions', () => {
  it('each store step names the byte DataView put at that address', () => {
    for (const width of WIDTHS) {
      for (const little of [false, true]) {
        const v = DEFAULT_VALUE[width];
        const mem = storeBytes(v, width, little);
        const fs = storeFrames(v, width, little);
        expect(fs).toHaveLength(byteCount(width) + 2);
        mem.forEach((b, j) => expect(captionText(fs[j + 1].say as never)).toContain(`Address ${address(j)} gets 0x${hexByte(b)}`));
        expect(captionText(fs[fs.length - 1].say as never)).toContain(little ? 'least significant' : 'most significant');
      }
    }
  });

  it('the misread caption calls a value wrong exactly when it is', () => {
    const values = [0x12345678n, 0x11222211n, 0x00000000n, 0xdeadbeefn];
    for (const v of values) {
      for (const w of [false, true]) {
        for (const rd of [false, true]) {
          const got = readBack(v, 32, w, rd);
          const text = captionText(misreadCaption(v, 32, w, rd));
          expect(text.includes('started at the wrong end'), `${v} ${w} ${rd}`).toBe(got !== v);
          expect(text).toContain(`0x${got.toString(16).toUpperCase().padStart(8, '0')}`);
        }
      }
    }
  });

  it('the network caption shows the host bytes and the wire bytes', () => {
    expect(captionText(networkCaption(443, true))).toContain('BB 01');
    expect(captionText(networkCaption(443, true))).toContain('01 BB');
    expect(captionText(networkCaption(443, false))).toContain('unchanged (443)');
  });
});
