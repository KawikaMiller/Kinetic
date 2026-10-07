import { describe, expect, it } from 'vitest';
import { enc, hexToBytes, hmac } from '../../core/crypto';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_ORDER, EDITED_AMOUNT, constantTimeEqual, deliver, editAmount, mismatches, naiveEqual, parseOrder, randomKey, tagFor,
} from './model';

const order = (t: string) => {
  const r = parseOrder(t);
  if (!r.ok) throw new Error(r.error);
  return r.order;
};

describe('HMAC-SHA-256 against RFC 4231', () => {
  it('test case 1: 20-byte key of 0x0b, "Hi There"', async () => {
    const out = await hmac(new Uint8Array(20).fill(0x0b), enc.encode('Hi There'), { hash: 'SHA-256', out: 'hex' });
    expect(out).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  });

  it('test case 2: key "Jefe"', async () => {
    const out = await hmac(enc.encode('Jefe'), enc.encode('what do ya want for nothing?'), { hash: 'SHA-256', out: 'hex' });
    expect(out).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('test case 6: a 131-byte key, longer than the block, hashed first', async () => {
    const out = await hmac(new Uint8Array(131).fill(0xaa), enc.encode('Test Using Larger Than Block-Size Key - Hash Key First'), { hash: 'SHA-256', out: 'hex' });
    expect(out).toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
  });

  it('the lesson\'s tagFor gives the same bytes as the vector', async () => {
    const tag = await tagFor('hmac', hexToBytes('0b'.repeat(20)), 'Hi There');
    expect(Array.from(tag!)).toEqual(Array.from(hexToBytes('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7')));
  });
});

describe('tags change with any edit', () => {
  it('every seeded single-byte edit to the message changes the HMAC tag', async () => {
    const key = randomKey();
    const base = await tagFor('hmac', key, DEFAULT_ORDER);
    const rnd = mulberry32(4231);
    for (let n = 0; n < 200; n++) {
      const i = Math.floor(rnd() * DEFAULT_ORDER.length);
      const ch = String.fromCharCode(32 + Math.floor(rnd() * 95));
      if (ch === DEFAULT_ORDER[i]) continue;
      const edited = DEFAULT_ORDER.slice(0, i) + ch + DEFAULT_ORDER.slice(i + 1);
      expect(mismatches(base!, (await tagFor('hmac', key, edited))!).length).toBeGreaterThan(0);
    }
  });

  it('a different key gives a different tag for the same message', async () => {
    const a = await tagFor('hmac', randomKey(), DEFAULT_ORDER);
    const b = await tagFor('hmac', randomKey(), DEFAULT_ORDER);
    expect(mismatches(a!, b!).length).toBeGreaterThan(0);
  });
});

describe('the channel', () => {
  it('HMAC: an untouched order is accepted and an edited one is caught', async () => {
    const key = randomKey();
    expect((await deliver('hmac', key, order(DEFAULT_ORDER), false))!.verdict).toBe('accepted');
    const d = (await deliver('hmac', key, order(DEFAULT_ORDER), true))!;
    expect(d.received).toBe('{"item": "socks", "amount": 1000}');
    expect(d.verdict).toBe('caught');
    expect(mismatches(d.tagReceived, d.expected).length).toBeGreaterThan(0);
  });

  it('plain hash: the edited order passes the check. That is the flaw the lesson shows', async () => {
    const d = (await deliver('hash', randomKey(), order(DEFAULT_ORDER), true))!;
    expect(d.verdict).toBe('forged');
    expect(mismatches(d.tagReceived, d.expected)).toEqual([]);
    expect(d.received).not.toBe(d.sent);
  });
});

describe('the editor in the channel', () => {
  it('changes only the top-level amount, in place', () => {
    expect(editAmount(order('{"amount": 10}'))).toEqual({ text: '{"amount": 1000}', from: 11, to: 15, amount: EDITED_AMOUNT });
    expect(editAmount(order('{"amount":1000}'))!.text).toBe('{"amount":1}');
    const nested = order('{"note": "\\"amount\\": 5", "meta": {"amount": 7}, "amount": 3}');
    expect(JSON.parse(editAmount(nested)!.text)).toEqual({ note: '"amount": 5', meta: { amount: 7 }, amount: EDITED_AMOUNT });
    expect(editAmount(order('{"amount": 2.5e1}'))!.text).toBe('{"amount": 1000}');
  });

  it('refuses hostile orders with a message', () => {
    const err = (t: string) => {
      const r = parseOrder(t);
      return r.ok ? null : r.error;
    };
    expect(err('')).toContain('Type a JSON order');
    expect(err('   ')).toContain('Type a JSON order');
    expect(err('{"amount": 10')).toBe('That isn\'t valid JSON.');
    expect(err('<b>hi</b>')).toBe('That isn\'t valid JSON.');
    expect(err('[1, 2]')).toContain('JSON object');
    expect(err('{"amount": "10"}')).toContain('"amount" number');
    expect(err('{"item": "😀", "amount": 1e400}')).toBeNull();
    expect(err(`{"amount": 1, "pad": "${'x'.repeat(400)}"}`)).toContain('under 400');
  });
});

describe('comparing tags', () => {
  it('the naive and constant-time compares agree with === on seeded pairs', () => {
    const rnd = mulberry32(7);
    for (let n = 0; n < 500; n++) {
      const a = Uint8Array.from({ length: 32 }, () => Math.floor(rnd() * 256));
      const b = a.slice();
      if (rnd() < 0.7) b[Math.floor(rnd() * 32)] ^= 1 + Math.floor(rnd() * 255);
      const same = a.every((v, i) => v === b[i]);
      expect(naiveEqual(a, b).equal).toBe(same);
      expect(constantTimeEqual(a, b).equal).toBe(same);
    }
  });

  it('the naive compare stops at the first difference; constant-time reads every byte', () => {
    const a = new Uint8Array(32);
    const b = a.slice();
    b[5] = 1;
    expect(naiveEqual(a, b)).toEqual({ equal: false, looked: 6 });
    expect(constantTimeEqual(a, b)).toEqual({ equal: false, looked: 32 });
    expect(naiveEqual(a, a.slice())).toEqual({ equal: true, looked: 32 });
    expect(constantTimeEqual(a, new Uint8Array(31)).equal).toBe(false);
  });
});
