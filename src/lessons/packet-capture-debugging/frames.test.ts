import { describe, expect, it } from 'vitest';
import { ipToString } from '../../core/ipv4';
import { captionText } from '../../core/testing/captions';
import { CAPTURES } from './captures';
import { captureIntro, guessCaption, packetCaption, traceFrames } from './frames';
import { PATH, traceroute } from './trace';
import { DIAGNOSES } from './views';
import { FILTER_EXAMPLES, parseFilter } from './filter';

const text = (n: Parameters<typeof captionText>[0]) => {
  const t = captionText(n).replace(/\s+/g, ' ');
  expect(t).not.toMatch(/[a-z)]\.[A-Z]/);
  return t;
};

describe('packet captions say what the packet is', () => {
  for (const c of CAPTURES) {
    it(`${c.id}: every packet`, () => {
      expect(text(captureIntro(c))).toContain(`${c.packets.length} packets`);
      for (const p of c.packets) {
        const say = text(packetCaption(p, c.packets));
        expect(say.startsWith(`Packet ${p.no}`)).toBe(true);
        if (p.dns?.response && p.dns.rcode === 0) expect(say).toContain(p.dns.answer!);
        if (p.dns?.rcode === 3) expect(say).toContain('NXDOMAIN');
        if (p.tag === 'dup-ack') expect(say).toContain(`byte ${p.tcp!.relAck}`);
        if (p.tag === 'rst') expect(say).toContain('RST');
        if (p.tag === 'tls-alert') expect(say).toContain(p.tls!.alert!);
        if (p.tag === 'retransmission') {
          // The original may never have reached the capture (lost before the client's card).
          const prev = c.packets.filter((q) => q.no < p.no && q.from === p.from && q.tcp?.seq === p.tcp!.seq).at(-1);
          if (prev) expect(say).toContain(`${Math.round((p.t - prev.t) * 1000) / 1000} s after packet ${prev.no}`);
          else expect(say).not.toContain('after packet');
        }
      }
    });
  }
});

describe('diagnosis feedback, every guess on every capture', () => {
  for (const c of CAPTURES)
    for (const d of DIAGNOSES)
      it(`${c.id} guessed ${d.id}`, () => {
        const say = text(guessCaption(d.id, c.answer));
        expect(say.startsWith('Right')).toBe(d.id === c.answer);
        expect(say).toContain(d.pattern);
      });
});

describe('traceroute frames', () => {
  const trace = traceroute();
  const frames = traceFrames(trace);
  it('one frame per probe, each naming its TTL and the hop that answered (or * * *)', () => {
    expect(frames).toHaveLength(trace.length + 1);
    trace.forEach((h, i) => {
      const say = text(frames[i + 1].say);
      expect(say).toContain(`TTL ${h.ttl}`);
      expect(frames[i + 1].shown).toBe(i + 1);
      if (h.from === null) expect(say).toContain('* * *');
      else expect(say).toContain(ipToString(PATH[h.at].ip));
      for (const r of h.rtts) if (r !== null) expect(say).toContain(`${r} ms`);
    });
    expect(text(frames.at(-1)!.say)).toContain(`Port Unreachable`);
    expect(text(frames.at(-1)!.say)).toContain(`after ${trace.length} hops`);
  });
});

describe('review fixes', () => {
  it('every Try chip is a filter the parser accepts', () => {
    for (const f of FILTER_EXAMPLES) expect(parseFilter(f).ok, f).toBe(true);
  });

  it('ChangeCipherSpec is its own record (content type 20), after the handshake record in the same segment', () => {
    for (const c of CAPTURES) {
      const cke = c.packets.find((p) => p.tls?.record.startsWith('Client Key Exchange'));
      if (!cke) continue;
      const at = 54;
      const firstLen = (cke.frame[at + 3] << 8) | cke.frame[at + 4];
      expect(cke.frame[at]).toBe(0x16);
      expect(cke.frame.slice(at + 5 + firstLen, at + 5 + firstLen + 6)).toEqual([0x14, 0x03, 0x03, 0x00, 0x01, 0x01]);
      const server = c.packets.find((p) => p.tls?.record === 'Change Cipher Spec, Finished')!;
      expect(server.frame[at]).toBe(0x14);
    }
  });

  it('the loss capture\'s retransmission is captioned as a fast retransmit triggered by the duplicate ACKs', () => {
    const c = CAPTURES.find((x) => x.answer === 'loss')!;
    const re = c.packets.find((p) => p.tag === 'retransmission')!;
    const say = text(packetCaption(re, c.packets));
    expect(say).toContain('fast retransmission');
    expect(say).toContain('3 duplicate ACKs');
  });

  it('the silent hop is captioned as part of the simulated path, not as something traceroute could know', () => {
    const trace = traceroute();
    const i = trace.findIndex((h) => h.from === null);
    expect(text(traceFrames(trace)[i + 1].say)).toContain('in this simulated path');
  });
});
