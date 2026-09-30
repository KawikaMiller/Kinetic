import { describe, expect, it } from 'vitest';
import {
  DEVICES, encapsulate, ETH_FCS, ETH_HEADER, ethernetPadding, HTTP_REQUEST, httpBytes, INITIAL_TTL, IP_HEADER, LAYERS,
  LINKS, MSS, MTU, overhead, PER_FRAME_OVERHEAD, score, SYMPTOMS, TCP_HEADER, ttlAfterHops,
} from './model';
import { buildFrames } from './frames';

describe('header sizes', () => {
  it('uses the real minimum header sizes', () => {
    expect(ETH_HEADER).toBe(14); // dst MAC 6 + src MAC 6 + EtherType 2
    expect(ETH_FCS).toBe(4); // CRC-32
    expect(IP_HEADER).toBe(20); // IPv4 with no options (IHL = 5)
    expect(TCP_HEADER).toBe(20); // TCP with no options (data offset = 5)
    expect(PER_FRAME_OVERHEAD).toBe(58);
  });

  it('derives the MSS from the MTU', () => {
    expect(MTU).toBe(1500);
    expect(MSS).toBe(1460);
  });

  it('pads short packets up to the 46-byte Ethernet minimum (a 64-byte frame)', () => {
    expect(ethernetPadding(40)).toBe(6); // a bare TCP ACK: 20 + 20
    expect(ethernetPadding(46)).toBe(0);
    expect(ethernetPadding(1500)).toBe(0);
    expect(encapsulate(0).frame).toBe(64);
  });
});

describe('encapsulation', () => {
  it('counts the request bytes exactly', () => {
    expect(HTTP_REQUEST).toBe('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');
    expect(httpBytes()).toBe(37);
  });

  it('wraps each layer around the one above it', () => {
    const s = encapsulate(37);
    expect(s).toEqual({ message: 37, segment: 57, packet: 77, padding: 0, frame: 95 });
  });

  it('adds up to the layer table for any single-segment message', () => {
    for (let n = 0; n <= MSS; n += 7) {
      const s = encapsulate(n);
      const headers = LAYERS.reduce((sum, l) => sum + l.header + l.trailer, 0);
      expect(s.frame).toBe(n + headers + s.padding);
      expect(s.packet).toBeLessThanOrEqual(MTU);
    }
  });
});

describe('overhead', () => {
  it('splits a message into full-MSS segments', () => {
    expect(overhead(1460).segments).toBe(1);
    expect(overhead(1461).segments).toBe(2);
    expect(overhead(1024 * 1024).segments).toBe(Math.ceil((1024 * 1024) / 1460));
  });

  it('matches a brute-force frame-by-frame sum', () => {
    for (const n of [1, 5, 37, 1000, 1460, 1461, 2920, 4000, 65536, 1024 * 1024]) {
      let wire = 0;
      for (let left = n; left > 0; left -= MSS) wire += encapsulate(Math.min(left, MSS)).frame;
      const o = overhead(n);
      expect(o.wireBytes).toBe(wire);
      expect(o.efficiency).toBeCloseTo(n / wire, 12);
    }
  });

  it('shows small messages are mostly headers and big ones are not', () => {
    expect(overhead(37).efficiency).toBeLessThan(0.4);
    expect(overhead(1024 * 1024).efficiency).toBeGreaterThan(0.96);
  });
});

describe('the journey', () => {
  it('routers only open the Internet and Link layers', () => {
    for (const d of DEVICES) {
      if (d.kind === 'router') expect(d.layers).toEqual(['internet', 'link']);
      else expect(d.layers).toHaveLength(4);
    }
  });

  it('gives every link its own MAC pair, chained device to device', () => {
    LINKS.forEach((l, i) => {
      expect(l.from).toBe(i);
      expect(l.to).toBe(i + 1);
      expect(l.srcMac).not.toBe(l.dstMac);
    });
    expect(new Set(LINKS.flatMap((l) => [l.srcMac, l.dstMac])).size).toBe(6);
  });

  it('takes one off the TTL per router', () => {
    expect(ttlAfterHops(0)).toBe(INITIAL_TTL);
    expect(ttlAfterHops(2)).toBe(INITIAL_TTL - 2);
  });

  const frames = buildFrames();

  it('captions every frame', () => {
    for (const f of frames) expect(f.say).toBeTruthy();
  });

  it('wraps on the sender and unwraps on the receiver, in stack order', () => {
    const atSender = frames.filter((f) => f.device === 0).map((f) => f.layers.length);
    expect(atSender).toEqual([...atSender].sort((a, b) => a - b)); // only ever grows
    const atServer = frames.filter((f) => f.device === 3).map((f) => f.layers.length);
    expect(atServer).toEqual([...atServer].sort((a, b) => b - a)); // only ever shrinks
    expect(atServer.at(-1)).toBe(1); // just the HTTP message reaches the server app
  });

  it('never lets a router look inside the IP packet', () => {
    for (const f of frames.filter((x) => x.device === 1 || x.device === 2)) {
      expect(['internet', 'link', null]).toContain(f.active);
    }
  });

  it('drops the TTL by exactly one per router and rewrites the MACs per link', () => {
    const ttls = [...new Set(frames.map((f) => f.ttl))];
    expect(ttls).toEqual([64, 63, 62]);
    const macs = [...new Set(frames.filter((f) => f.link !== null).map((f) => `${f.link}`))];
    expect(macs).toEqual(['0', '1', '2']);
  });
});

describe('which layer is broken', () => {
  it('has a reviewed answer for every symptom', () => {
    expect(SYMPTOMS.map((s) => [s.id, s.answer])).toEqual([
      ['dns', 'app'], ['refused', 'transport'], ['404', 'app'], ['cable', 'link'], ['tls', 'app'], ['route', 'internet'],
    ]);
  });

  it('scores only correct placements', () => {
    expect(score({})).toBe(0);
    expect(score(Object.fromEntries(SYMPTOMS.map((s) => [s.id, s.answer])))).toBe(SYMPTOMS.length);
    expect(score({ dns: 'transport', cable: 'link' })).toBe(1);
  });
});
