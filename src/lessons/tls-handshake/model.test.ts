import { describe, expect, it } from 'vitest';
import { APP_DATA, FULL_HANDSHAKE, P, blend, messageOrder, mix, roundTripsBeforeData, type BaseName } from './model';

describe('round trips before application data (full handshake, no resumption)', () => {
  it('TLS 1.3 needs one, TLS 1.2 two', () => {
    expect(roundTripsBeforeData('1.3')).toBe(1);
    expect(roundTripsBeforeData('1.2')).toBe(2);
  });

  it('flights alternate sides, starting with the client', () => {
    for (const flights of Object.values(FULL_HANDSHAKE)) {
      expect(flights[0].from).toBe('client');
      flights.slice(1).forEach((f, i) => expect(f.from).not.toBe(flights[i].from));
    }
  });
});

describe('message order', () => {
  const index = (version: '1.2' | '1.3', from: string, m: string) => messageOrder(version).findIndex((x) => x.from === from && x.m === m);

  it('TLS 1.3 (RFC 8446 §2): key shares in the hellos, then the encrypted server flight, then the client Finished', () => {
    const order = ['ClientHello', 'ServerHello', 'EncryptedExtensions', 'Certificate', 'CertificateVerify'].map((m, i) =>
      index('1.3', i === 0 ? 'client' : 'server', m),
    );
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    expect(index('1.3', 'client', 'key_share')).toBeLessThan(index('1.3', 'server', 'ServerHello'));
    expect(index('1.3', 'server', 'key_share')).toBeLessThan(index('1.3', 'server', 'Certificate'));
    expect(index('1.3', 'server', 'Finished')).toBeLessThan(index('1.3', 'client', 'Finished'));
    expect(index('1.3', 'client', 'Finished')).toBeLessThan(index('1.3', 'client', APP_DATA));
    // TLS 1.3 has no ChangeCipherSpec in the protocol proper, and no ServerKeyExchange
    expect(messageOrder('1.3').some((x) => x.m === 'ChangeCipherSpec' || x.m === 'ServerKeyExchange')).toBe(false);
  });

  it('TLS 1.2 (RFC 5246 §7.3): the client speaks Finished first, the server answers, then data', () => {
    expect(index('1.2', 'server', 'ServerHelloDone')).toBeLessThan(index('1.2', 'client', 'ClientKeyExchange'));
    expect(index('1.2', 'client', 'ChangeCipherSpec')).toBeLessThan(index('1.2', 'client', 'Finished'));
    expect(index('1.2', 'client', 'Finished')).toBeLessThan(index('1.2', 'server', 'Finished'));
    expect(index('1.2', 'server', 'Finished')).toBeLessThan(index('1.2', 'client', APP_DATA));
  });
});

describe('the paint analogy', () => {
  const perms = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

  it('a blend depends only on which paints went in, never on the order', () => {
    const names: BaseName[] = ['public', 'client', 'server'];
    const colours = new Set(perms(names).map(blend));
    expect(colours.size).toBe(1);
  });

  it('a blend gives every base paint an equal share', () => {
    expect(blend(['public', 'client'])).toBe('color-mix(in oklab, var(--sky) 50%, var(--amber))');
    expect(blend(['client', 'public', 'server'])).toBe('color-mix(in oklab, color-mix(in oklab, var(--sky) 50%, var(--amber)) 67%, var(--trk-math))');
  });

  it("both sides reach the same shared paint: the client adds its secret to the server's mix, and vice versa", () => {
    const clientSide = mix('client view', P.sMix, P.cSec);
    const serverSide = mix('server view', P.cMix, P.sSec);
    expect(clientSide.parts).toEqual(serverSide.parts);
    expect(clientSide.color).toBe(serverSide.color);
    expect(P.shared.color).toBe(clientSide.color);
  });

  it("Mallory's shared paint is a different paint from the real one", () => {
    expect(P.sharedM.color).not.toBe(P.shared.color);
    expect(mix('mallory view', P.cMix, P.mSec).color).toBe(P.sharedM.color);
  });

  it('only base secrets are marked secret; mixes are safe to send', () => {
    expect([P.cSec, P.sSec, P.mSec].every((p) => p.secret)).toBe(true);
    expect([P.pub, P.cMix, P.sMix, P.mMix, P.shared, P.sharedM].some((p) => p.secret)).toBe(false);
  });
});
