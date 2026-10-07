import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { mitmFrames, normalFrames, type TlsFrame } from './frames';
import { APP_DATA, P, messageOrder, roundTripsBeforeData } from './model';

const normal = normalFrames();
const mitm = mitmFrames();
const SECRET_COLOURS = new Set([P.cSec.color, P.sSec.color, P.mSec.color]);

/** The modelled TLS 1.3 message each drawn pill stands for. */
const PILL_MESSAGE: Record<string, string> = {
  'ClientHello + key share': 'ClientHello',
  'ServerHello + key share': 'ServerHello',
  'Certificate + CertificateVerify': 'Certificate',
  Finished: 'Finished',
  'GET /account': APP_DATA,
  '200 OK · your balance': APP_DATA,
};

describe('every frame', () => {
  it('has its own caption', () => {
    for (const f of [...normal, ...mitm]) expect(text(f.say).length).toBeGreaterThan(0);
  });

  it('never puts a secret, or the shared key, on the wire or in the eavesdropper\'s notebook', () => {
    for (const f of [...normal, ...mitm]) {
      // a plaintext pill shows the paint it carries; an encrypted one is ciphertext, whatever its colour
      if (f.wire && !f.wire.cipher) {
        expect(SECRET_COLOURS.has(f.wire.color)).toBe(false);
        expect(f.wire.color).not.toBe(P.shared.color);
        expect(f.wire.color).not.toBe(P.sharedM.color);
      }
      for (const n of f.notes) {
        expect(SECRET_COLOURS.has(n.color ?? '')).toBe(false);
        expect(n.color).not.toBe(P.shared.color);
      }
    }
  });
});

describe('the normal handshake', () => {
  it('sends its pills in TLS 1.3 order, each from the right side', () => {
    const order = messageOrder('1.3');
    const at = normal.filter((f) => f.wire).map((f) => {
      const m = PILL_MESSAGE[f.wire!.label];
      // application data flows both ways once the handshake is done
      const idx = order.findIndex((x) => x.m === m && (m === APP_DATA || x.from === f.wire!.from));
      expect(idx, f.wire!.label).toBeGreaterThanOrEqual(0);
      return idx;
    });
    // the reply to the request is data too, so the order never goes backwards
    at.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(at[i]));
  });

  it('has three of Eve\'s colours after ServerHello, none of them a secret', () => {
    const f = normal.find((x) => x.wire?.label === 'ServerHello + key share')!;
    expect(f.notes).toHaveLength(3);
    expect(text(f.say)).toContain('three colours');
  });

  it('gives both sides the same key, and locks only once every chain link is verified', () => {
    for (const f of normal) {
      if (f.clientKey && f.serverKey) expect(f.clientKey.color).toBe(f.serverKey.color);
      if (f.locked) expect(f.chain?.every((l) => l.state === 'ok')).toBe(true);
      // a verified link never still asks a question
      for (const l of f.chain ?? []) if (l.state === 'ok') expect(l.detail).not.toContain('?');
      if (f.wire && PILL_MESSAGE[f.wire.label] === APP_DATA) expect(f.locked).toBe(true);
    }
  });

  it('states the round trips the model computes, and shows that many before data', () => {
    const finished = normal.find((f) => f.wire?.label === 'Finished')!;
    expect(text(finished.say)).toContain(`Secure after ${roundTripsBeforeData('1.3')} round trip`);
    expect(text(finished.say)).toContain(`a full TLS 1.2 handshake needed ${roundTripsBeforeData('1.2')}`);
    const firstData = normal.find((f) => f.wire && PILL_MESSAGE[f.wire.label] === APP_DATA)!;
    expect(firstData.rtt).toBe(roundTripsBeforeData('1.3'));
  });
});

describe('the quiz', () => {
  it('round-trip answer is the modelled count', async () => {
    const { default: lesson } = await import('./index');
    const q = lesson.quiz.find((x) => x.q.includes('round trips'))!;
    expect(q.options[q.answer]).toBe(['None', 'One', 'Two', 'Three'][roundTripsBeforeData('1.3')]);
  });
});

describe('the MITM attempt', () => {
  const last: TlsFrame = mitm.at(-1)!;

  it('never reaches the server and never sends data', () => {
    for (const f of mitm) {
      if (!f.wire) continue;
      expect(f.wire.to).not.toBe('server');
      expect(f.wire.from).not.toBe('server');
      expect(PILL_MESSAGE[f.wire.label]).not.toBe(APP_DATA);
    }
    expect(mitm.some((f) => f.locked)).toBe(false);
  });

  it('agrees a key with Mallory, then aborts on an untrusted root with unknown_ca', () => {
    expect(mitm.some((f) => f.clientKey?.color === P.sharedM.color)).toBe(true);
    expect(last.aborted).toBe(true);
    expect(last.chain?.at(-1)?.state).toBe('bad');
    // RFC 8446 §6.2: unknown_ca is the alert for a chain that doesn't end at a trusted CA
    expect(last.wire?.label).toBe('alert: unknown_ca');
    // after ServerHello every TLS 1.3 record, alerts included, is encrypted
    expect(last.wire?.cipher).toBe(true);
  });
});
