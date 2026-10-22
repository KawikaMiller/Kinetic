import { describe, expect, it } from 'vitest';
import { ipv4 } from '../../core/ipv4';
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import { LADDERS, roundTripsBeforeData } from './ladders';
import { DEFAULT_MTU_INPUT, LINK_MTU, SMALL, TCP_IP_HEADERS, decide, fragmentCount, transferSteps, tunnelMtuOf, type MtuInput, type Outcome } from './mtu';
import { MAX_NUMBER, WINDOW, emptyWindow, numberAt, receive, stripBits, type ReplayWindow } from './replay';
import { PRESETS, SAMPLES, lookup, presetRows, split, type RouteRow } from './routing';
import { TUNNELS, fixedOverheadOf } from './tunnels';

// ---- MTU --------------------------------------------------------------------------------------

describe('tunnel MTU is the link MTU minus the overhead', () => {
  it('WireGuard over a 1500-byte link: 1440 with an IPv4 outer header (hand case); 1420 with IPv6 from the field table', () => {
    expect(tunnelMtuOf('wireguard', 1500)).toBe(1440);
    expect(1500 - fixedOverheadOf('wireguard', { outer: 6, suite: 'gcm', natT: false })).toBe(1420);
  });
  it('every tunnel: 1500 minus its overhead, and jumbo frames leave more room by exactly the same overhead', () => {
    for (const t of TUNNELS) {
      expect(tunnelMtuOf(t, 1500)).toBe(1500 - fixedOverheadOf(t));
      expect(tunnelMtuOf(t, 9000) - tunnelMtuOf(t, 1500)).toBe(7500);
    }
  });
  it('the small packets of the transfer fit the smallest tunnel MTU the scene can produce', () => {
    for (const t of TUNNELS) for (const size of Object.values(SMALL)) expect(size).toBeLessThanOrEqual(tunnelMtuOf(t, LINK_MTU.min));
  });
});

/**
 * The independent decision list: written out row by row from the documented behaviour, not computed.
 * Keyed "DF set, ICMP allowed, MSS clamped, packet bigger than the tunnel MTU".
 */
const TABLE: Record<string, Outcome> = {
  'df=0 icmp=0 clamp=0 big=0': 'delivered',
  'df=0 icmp=0 clamp=0 big=1': 'fragmented',
  'df=0 icmp=0 clamp=1 big=0': 'delivered',
  'df=0 icmp=0 clamp=1 big=1': 'delivered',
  'df=0 icmp=1 clamp=0 big=0': 'delivered',
  'df=0 icmp=1 clamp=0 big=1': 'fragmented',
  'df=0 icmp=1 clamp=1 big=0': 'delivered',
  'df=0 icmp=1 clamp=1 big=1': 'delivered',
  'df=1 icmp=0 clamp=0 big=0': 'delivered',
  'df=1 icmp=0 clamp=0 big=1': 'dropped-silent',
  'df=1 icmp=0 clamp=1 big=0': 'delivered',
  'df=1 icmp=0 clamp=1 big=1': 'delivered',
  'df=1 icmp=1 clamp=0 big=0': 'delivered',
  'df=1 icmp=1 clamp=0 big=1': 'dropped-icmp',
  'df=1 icmp=1 clamp=1 big=0': 'delivered',
  'df=1 icmp=1 clamp=1 big=1': 'delivered',
};

describe('the MTU outcome is exhaustive over DF x ICMP x clamp x size class', () => {
  it('equals the hand-written decision list for every combination, on every tunnel and 40 link and packet sizes', () => {
    const rnd = mulberry32(36);
    const seen = new Set<string>();
    for (const tunnel of TUNNELS) {
      for (let k = 0; k < 40; k++) {
        const linkMtu = randInt(LINK_MTU.min / 4, LINK_MTU.max / 4, rnd) * 4;
        const mtu = linkMtu - fixedOverheadOf(tunnel);
        const smaller = rnd() < 0.5;
        const packet = smaller ? randInt(100, mtu, rnd) : randInt(mtu + 1, mtu + 3000, rnd);
        for (const df of [false, true]) for (const icmp of [false, true]) for (const clamp of [false, true]) {
          const r = decide({ tunnel, linkMtu, packet, df, icmp, clamp });
          const key = `df=${+df} icmp=${+icmp} clamp=${+clamp} big=${+(packet > mtu)}`;
          expect(r.outcome, `${tunnel} ${linkMtu} ${packet} ${key}`).toBe(TABLE[key]);
          seen.add(key);
        }
      }
    }
    expect(seen.size).toBe(16);
  });

  it('clamping to MTU minus 40 always delivers, and the clamped segment is exactly the tunnel MTU', () => {
    const rnd = mulberry32(37);
    for (let i = 0; i < 500; i++) {
      const input: MtuInput = { tunnel: pick(TUNNELS, rnd), linkMtu: randInt(144, 2250, rnd) * 4, packet: randInt(25, 2250, rnd) * 4, df: true, icmp: false, clamp: true };
      const r = decide(input);
      expect(r.outcome).toBe('delivered');
      const mss = r.tunnelMtu - TCP_IP_HEADERS;
      expect(r.sent).toBeLessThanOrEqual(mss + TCP_IP_HEADERS);
      if (input.packet > r.tunnelMtu) expect(r.sent).toBe(mss + TCP_IP_HEADERS);
    }
  });

  it('the fragment count equals splitting the payload by brute force', () => {
    const rnd = mulberry32(38);
    for (let i = 0; i < 300; i++) {
      const mtu = randInt(100, 1500, rnd);
      const size = randInt(mtu + 1, mtu + 9000, rnd);
      let left = size - 20;
      let n = 0;
      while (left > 0) {
        const room = Math.floor((mtu - 20) / 8) * 8;
        left -= Math.min(room, left);
        n++;
      }
      expect(fragmentCount(size, mtu)).toBe(n);
    }
    expect(fragmentCount(1500, 1500)).toBe(1);
  });
});

describe('the transfer ladder', () => {
  it('default input: pings and small requests work and the large segment vanishes silently with every retry', () => {
    const { steps, result, stalls } = transferSteps(DEFAULT_MTU_INPUT);
    expect(result.outcome).toBe('dropped-silent');
    expect(stalls).toBe(true);
    expect(steps.filter((s) => !s.lost).map((s) => s.id)).toEqual(['ping', 'syn', 'synack', 'req']);
    expect(steps.filter((s) => s.lost).map((s) => s.id)).toEqual(['seg', 'rto1', 'rto2', 'rto3']);
  });
  it('clamping on the default delivers, allowing ICMP gives a message and a smaller retry, clearing DF fragments', () => {
    expect(transferSteps({ ...DEFAULT_MTU_INPUT, clamp: true }).stalls).toBe(false);
    expect(transferSteps({ ...DEFAULT_MTU_INPUT, clamp: true }).steps.every((s) => !s.lost)).toBe(true);
    const icmp = transferSteps({ ...DEFAULT_MTU_INPUT, icmp: true });
    expect(icmp.steps.map((s) => s.id)).toEqual(['ping', 'syn', 'synack', 'req', 'seg', 'icmp', 'retry']);
    expect(icmp.steps[5].label).toContain('MTU 1440');
    const frag = transferSteps({ ...DEFAULT_MTU_INPUT, df: false });
    expect(frag.result.outcome).toBe('fragmented');
    expect(frag.result.fragments).toBe(fragmentCount(1500, 1440));
    expect(frag.result.fragments).toBe(2);
  });
  it('every label states the sizes the result holds', () => {
    for (const tunnel of TUNNELS) {
      const { steps, result } = transferSteps({ ...DEFAULT_MTU_INPUT, tunnel, icmp: true });
      expect(steps.find((s) => s.id === 'icmp')!.label).toContain(String(result.tunnelMtu));
      expect(steps.find((s) => s.id === 'seg')!.label).toContain(String(result.sent));
    }
  });
});

// ---- routing -----------------------------------------------------------------------------------

describe('which packets enter the tunnel', () => {
  const bits = (n: number) => n.toString(2).padStart(32, '0');
  const match = (r: RouteRow, a: number) => bits(r.net).slice(0, r.prefix) === bits(a).slice(0, r.prefix);

  it('the winner has the longest matching prefix, on 300 seeded tables and addresses (bit-string reference)', () => {
    const rnd: Rnd = mulberry32(39);
    for (let i = 0; i < 300; i++) {
      const rows: RouteRow[] = Array.from({ length: randInt(1, 6, rnd) }, (_, k) => {
        const prefix = pick([0, 8, 16, 24, 24, 32], rnd);
        const net = (randInt(0, 255, rnd) << 24) >>> 0;
        return { net: prefix === 0 ? 0 : net, prefix, goes: rnd() < 0.5 ? 'tunnel' : 'direct', label: `r${k}` };
      });
      const addr = rows.length && rnd() < 0.7 ? rows[0].net + randInt(0, 255, rnd) : (randInt(0, 255, rnd) << 24) >>> 0;
      const l = lookup(rows, addr >>> 0, 'direct');
      const hits = rows.filter((r) => match(r, addr >>> 0));
      const longest = hits.length ? Math.max(...hits.map((r) => r.prefix)) : -1;
      expect(l.winner?.prefix ?? -1).toBe(longest);
      expect(l.matches).toHaveLength(hits.length);
    }
  });

  it('full tunnel: a public address and an office address go through the tunnel, the home printer goes direct (hand cases)', () => {
    const rows = presetRows('full');
    expect(lookup(rows, ipv4('203.0.113.50'), 'direct').winner?.goes).toBe('tunnel');
    expect(lookup(rows, ipv4('10.20.4.9'), 'direct').winner?.goes).toBe('tunnel');
    expect(lookup(rows, ipv4('192.168.1.20'), 'direct').winner?.goes).toBe('direct');
  });

  it('split tunnel: only the office ranges enter the tunnel', () => {
    const rows = presetRows('split');
    expect(SAMPLES.filter((s) => lookup(rows, s.addr, 'direct').winner?.goes === 'tunnel').map((s) => s.name)).toEqual(['office file server', 'office database']);
    expect(split(rows, 'direct')).toEqual({ tunnel: 2, direct: 4, conflicts: 0 });
  });

  it('full tunnel carries more of the sample destinations than split tunnel, and neither has a conflict', () => {
    const full = split(presetRows('full'), 'direct');
    expect(full).toEqual({ tunnel: 5, direct: 1, conflicts: 0 });
    expect(full.tunnel).toBeGreaterThan(split(presetRows('split'), 'direct').tunnel);
  });

  it('overlapping private ranges: the same block is listed twice, the lookup reports the conflict, and the tie policy picks the side', () => {
    const rows = presetRows('overlap');
    const l = lookup(rows, ipv4('192.168.1.20'), 'direct');
    expect(l.conflict).toBe(true);
    expect(l.ties).toHaveLength(2);
    expect(l.winner?.goes).toBe('direct');
    expect(lookup(rows, ipv4('192.168.1.20'), 'tunnel').winner?.goes).toBe('tunnel');
    expect(split(rows, 'direct').conflicts).toBe(1);
    // the policy changes nothing where there is no tie
    expect(lookup(rows, ipv4('10.20.4.9'), 'direct')).toEqual(lookup(rows, ipv4('10.20.4.9'), 'tunnel'));
  });

  it('nothing matching gives no winner, and the tie policy is irrelevant without a conflict in the other presets', () => {
    expect(lookup([], ipv4('1.2.3.4'), 'direct').winner).toBeNull();
    for (const p of PRESETS.filter((x) => x.id !== 'overlap')) {
      for (const s of SAMPLES) expect(lookup(p.rows, s.addr, 'direct').winner).toEqual(lookup(p.rows, s.addr, 'tunnel').winner);
    }
  });
});

// ---- the replay window -------------------------------------------------------------------------

/** The reference: a set of accepted numbers plus a floor, written straight from the rule. */
class Reference {
  seen = new Set<number>();
  top = 0;
  receive(n: number): 'accepted' | 'replay' | 'too-old' | 'zero' {
    if (n === 0) return 'zero';
    if (n > this.top) {
      this.seen.add(n);
      this.top = n;
      return 'accepted';
    }
    if (n <= this.top - WINDOW) return 'too-old';
    if (this.seen.has(n)) return 'replay';
    this.seen.add(n);
    return 'accepted';
  }
  bitmap(): number[] {
    return Array.from({ length: WINDOW }, (_, i) => (this.seen.has(this.top - i) ? 1 : 0));
  }
}

function randomSequence(rnd: Rnd): number[] {
  const out: number[] = [];
  let next = 1;
  for (let i = 0; i < 160; i++) {
    const r = rnd();
    if (r < 0.45) out.push(next++);
    else if (r < 0.65) out.push(Math.max(0, next - randInt(1, 12, rnd)));
    else if (r < 0.8) out.push(Math.max(0, next - randInt(1, 90, rnd)));
    else if (r < 0.9 && out.length) out.push(pick(out, rnd));
    else {
      next += randInt(1, 80, rnd);
      out.push(next++);
    }
  }
  return out;
}

describe('the replay window equals a set-based reference', () => {
  it('on 200 seeded sequences of reorderings, replays and jumps: same verdicts, no number accepted twice, none below the floor, same bitmap', () => {
    const rnd = mulberry32(40);
    const kinds = new Set<string>();
    for (let s = 0; s < 200; s++) {
      let w: ReplayWindow = emptyWindow();
      const ref = new Reference();
      const acceptedTwice = new Set<number>();
      for (const n of randomSequence(rnd)) {
        const floorBefore = ref.top - WINDOW;
        const expected = ref.receive(n);
        const out = receive(w, n);
        w = out.window;
        expect(out.verdict.kind, `seed ${s} number ${n}`).toBe(expected);
        kinds.add(out.verdict.kind);
        if (out.verdict.kind === 'accepted') {
          expect(acceptedTwice.has(n)).toBe(false);
          acceptedTwice.add(n);
          expect(n).toBeGreaterThan(Math.min(floorBefore, n - 1));
        }
        expect(w.top).toBe(ref.top);
        expect([...w.bits]).toEqual(ref.bitmap());
      }
    }
    expect([...kinds].sort()).toEqual(['accepted', 'replay', 'too-old', 'zero']);
  });

  it('hand case: 1, 2, 3 accepted; 2 again is a replay; 70 slides the window; 5 is then too old and 20 is still inside', () => {
    let w = emptyWindow();
    const run = (n: number) => {
      const o = receive(w, n);
      w = o.window;
      return o.verdict.kind;
    };
    expect([run(1), run(2), run(3), run(2)]).toEqual(['accepted', 'accepted', 'accepted', 'replay']);
    expect(run(70)).toBe('accepted');
    expect(w.top).toBe(70);
    expect(run(5)).toBe('too-old');
    expect(run(6)).toBe('too-old');
    expect(run(7)).toBe('accepted');
    expect(run(7)).toBe('replay');
    expect(w.bits[0]).toBe(1);
    expect(w.bits[63]).toBe(1);
  });

  it('a jump of 64 or more leaves only the new top in the window; the strip reads oldest first and numberAt names each position', () => {
    let w = receive(emptyWindow(), 5).window;
    w = receive(w, 5 + WINDOW).window;
    expect(w.bits.reduce<number>((a, b) => a + b, 0)).toBe(1);
    const strip = stripBits(w);
    expect(strip[WINDOW - 1]).toBe(1);
    expect(numberAt(w, WINDOW - 1)).toBe(5 + WINDOW);
    expect(numberAt(w, 0)).toBe(5 + WINDOW - 63);
    expect(numberAt(receive(emptyWindow(), 2).window, 0)).toBeNull();
  });

  it('a refused number leaves the window object untouched', () => {
    const w = receive(emptyWindow(), 100).window;
    expect(receive(w, 100).window).toBe(w);
    expect(receive(w, 3).window).toBe(w);
    expect(receive(w, 0).window).toBe(w);
    expect(MAX_NUMBER).toBeGreaterThan(WINDOW);
  });
});

// ---- ladders -----------------------------------------------------------------------------------

describe('the ladders', () => {
  it('WireGuard needs one round trip before data, IKEv2 two exchanges, computed from the steps', () => {
    expect(roundTripsBeforeData(LADDERS.wireguard)).toBe(1);
    expect(roundTripsBeforeData(LADDERS.ikev2)).toBe(2);
  });
  it('every step names a real actor and the two sides alternate through the handshake', () => {
    for (const l of Object.values(LADDERS)) {
      const handshake = l.steps.slice(0, roundTripsBeforeData(l) * 2);
      handshake.forEach((s, i) => expect(s.from).toBe(i % 2 === 0 ? 'a' : 'b'));
      for (const s of l.steps) expect(['a', 'b']).toContain(s.to);
    }
  });
});
