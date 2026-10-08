import { describe, expect, it } from 'vitest';
import { ipToString, ipv4 } from '../../core/ipv4';
import { CAPTURES, CLIENT, DROP_RETRIES, LOST_SEGMENT, SERVER, SYN_RTO_S, type Captured, type DiagnosisId } from './captures';
import { parseFilter } from './filter';
import { PATH, probe, traceroute } from './trace';
import { DIAGNOSES, tcpdumpHost, tcpdumpLine } from './views';
import { SNAPLEN, decode } from './wire';

// ── Independent byte readers (no imports from wire.ts) ──────────────────

const word = (b: readonly number[], i: number) => b[i] * 256 + b[i + 1];
const dword = (b: readonly number[], i: number) => word(b, i) * 65536 + word(b, i + 2);
/** Sum 16-bit words with end-around carry; a correct checksum makes the total 0xffff. */
function onesSum(b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < b.length; i += 2) {
    s += b[i] * 256 + (b[i + 1] ?? 0);
    while (s > 0xffff) s = (s % 0x10000) + Math.floor(s / 0x10000);
  }
  return s;
}
const ipBytes = (a: number) => ipToString(a).split('.').map(Number);
/** RFC 9293 §3.1: the flag bits, low to high. */
const RFC_FLAGS: [string, number][] = [['FIN', 1], ['SYN', 2], ['RST', 4], ['PSH', 8], ['ACK', 16]];

const all = CAPTURES.flatMap((c) => c.packets.map((p) => ({ c, p })));

describe('frame bytes', () => {
  it('every IPv4 header checksum is valid', () => {
    for (const { p } of all) expect(onesSum(p.frame.slice(14, 34))).toBe(0xffff);
  });

  it('every TCP/UDP checksum is valid over the pseudo-header and the full segment', () => {
    for (const { p } of all) {
      const seg = p.frame.slice(34);
      const proto = p.frame[23];
      const pseudo = [...ipBytes(dword(p.frame, 26)), ...ipBytes(dword(p.frame, 30)), 0, proto, seg.length >> 8, seg.length & 0xff];
      expect(onesSum([...pseudo, ...seg])).toBe(0xffff);
    }
  });

  it('the TCP flag bits in the bytes match the decoded flags', () => {
    for (const { p } of all.filter((x) => x.p.tcp)) {
      const byte = p.frame[14 + 20 + 13];
      const fromBytes = RFC_FLAGS.filter(([, bit]) => byte & bit).map(([n]) => n).sort();
      expect(fromBytes).toEqual([...p.tcp!.flags].sort());
      expect(decode(p.frame).tcp!.flags.sort()).toEqual(fromBytes);
    }
  });

  it('lengths add up, and the capture keeps the first SNAPLEN bytes', () => {
    for (const { p } of all) {
      expect(word(p.frame, 16)).toBe(p.frame.length - 14);
      expect(p.captured).toEqual(p.frame.slice(0, SNAPLEN));
      if (p.tcp) expect(p.frame.length - 54).toBe(p.tcp.len);
    }
  });

  it('only documentation addresses, and locally administered MACs', () => {
    const doc = ['192.0.2.', '198.51.100.', '203.0.113.'];
    for (const { p } of all) {
      for (const a of [dword(p.frame, 26), dword(p.frame, 30)]) expect(doc.some((d) => ipToString(a).startsWith(d))).toBe(true);
      expect(p.frame[0] & 0x02).toBe(0x02);
      expect(p.frame[6] & 0x02).toBe(0x02);
    }
  });
});

describe('sequence and acknowledgment arithmetic', () => {
  /**
   * Replay each capture: whatever one side receives (every captured server packet reached
   * the client; every client packet reached the server, except in the dropped capture) adds
   * a [seq, seq + len + SYN + FIN) range. An ACK must name the end of the contiguous run.
   */
  it('every ACK acknowledges the next byte expected: seq + length, with SYN and FIN counting one', () => {
    for (const c of CAPTURES) {
      const got: Record<'client' | 'server', [number, number][]> = { client: [], server: [] };
      const start: Record<'client' | 'server', number | null> = { client: null, server: null };
      const next = (side: 'client' | 'server') => {
        let n = start[side]!;
        let moved = true;
        while (moved) {
          moved = false;
          for (const [a, b] of got[side]) if (a <= n && b > n) { n = b; moved = true; }
        }
        return n;
      };
      for (const p of c.packets) {
        if (!p.tcp) continue;
        const me = p.from as 'client' | 'server';
        const peer = me === 'client' ? 'server' : 'client';
        if (p.tcp.flags.includes('ACK') && !p.tcp.flags.includes('RST')) expect(p.tcp.ack, `${c.id} #${p.no}`).toBe(next(me) >>> 0);
        const span = p.tcp.len + (p.tcp.flags.includes('SYN') ? 1 : 0) + (p.tcp.flags.includes('FIN') ? 1 : 0);
        const delivered = !(c.answer === 'timeout' && me === 'client');
        if (delivered && !p.tcp.flags.includes('RST')) {
          if (p.tcp.flags.includes('SYN')) start[peer] = p.tcp.seq;
          got[peer].push([p.tcp.seq, p.tcp.seq + span]);
        }
      }
    }
  });

  it('the handshake: SYN,ACK acknowledges SYN + 1, and the last ACK the SYN,ACK + 1', () => {
    for (const c of CAPTURES.filter((x) => x.packets.some((p) => p.tcp?.flags.join() === 'SYN,ACK'))) {
      const syn = c.packets.find((p) => p.tcp?.flags.join() === 'SYN')!;
      const synAck = c.packets.find((p) => p.tcp?.flags.join() === 'SYN,ACK')!;
      const ack = c.packets[c.packets.indexOf(synAck) + 1];
      expect(synAck.tcp!.ack).toBe(syn.tcp!.seq + 1);
      expect(ack.tcp!.ack).toBe(synAck.tcp!.seq + 1);
      expect(ack.tcp!.relSeq).toBe(1);
      expect(ack.tcp!.relAck).toBe(1);
      expect([syn.tag, synAck.tag, ack.tag]).toEqual(['handshake', 'handshake', 'handshake']);
      expect(c.packets.filter((p) => p.tag === 'handshake')).toHaveLength(3);
    }
  });
});

/** Diagnose from bytes and timings alone: proves each capture really shows its pattern. */
function classify(ps: readonly Captured[]): DiagnosisId {
  const tcp = ps.filter((p) => p.frame[23] === 6).map((p) => ({ p, flags: p.frame[47], seq: dword(p.frame, 38), ack: dword(p.frame, 42), fromServer: dword(p.frame, 26) === SERVER, len: p.frame.length - 54 }));
  const dnsRcode = ps.filter((p) => p.frame[23] === 17 && dword(p.frame, 26) !== CLIENT).map((p) => p.frame[42 + 3] & 0x0f);
  if (tcp.length === 0 && dnsRcode.every((r) => r === 3)) return 'dns';
  if (tcp.some((x) => x.fromServer && x.flags & 4)) return 'refused';
  if (!tcp.some((x) => x.fromServer)) return 'timeout';
  if (tcp.some((x) => !x.fromServer && x.len === 7 && x.p.frame[54] === 0x15)) return 'tls';
  const clientAcks = tcp.filter((x) => !x.fromServer && x.flags === 16 && x.len === 0).map((x) => x.ack);
  if (clientAcks.some((a, i) => i > 0 && a === clientAcks[i - 1])) return 'loss';
  return 'healthy';
}

describe('each capture shows the pattern its diagnosis names', () => {
  it.each(CAPTURES.map((c) => [c.id, c]))('%s', (_, c) => {
    expect(classify(c.packets)).toBe(c.answer);
  });

  it('every diagnosis is the answer to exactly one capture', () => {
    expect(DIAGNOSES.map((d) => CAPTURES.filter((c) => c.answer === d.id).length)).toEqual(DIAGNOSES.map(() => 1));
  });

  it('dropped: the same SYN retransmitted, each wait double the last, and no reply', () => {
    const syns = CAPTURES.find((c) => c.answer === 'timeout')!.packets.filter((p) => p.tcp);
    expect(syns).toHaveLength(DROP_RETRIES + 1);
    expect(new Set(syns.map((p) => p.tcp!.seq)).size).toBe(1);
    const gaps = syns.slice(1).map((p, i) => Math.round((p.t - syns[i].t) * 1000) / 1000);
    expect(gaps).toEqual(Array.from({ length: DROP_RETRIES }, (_, i) => SYN_RTO_S * 2 ** i));
    expect(syns.slice(1).every((p) => p.tag === 'retransmission')).toBe(true);
  });

  it('refused: the RST,ACK acknowledges the SYN (seq + 1) with sequence number 0', () => {
    const ps = CAPTURES.find((c) => c.answer === 'refused')!.packets;
    const syn = ps.find((p) => p.tcp?.flags.includes('SYN'))!;
    const rst = ps.find((p) => p.tcp?.flags.includes('RST'))!;
    expect(rst.tcp!.seq).toBe(0);
    expect(rst.tcp!.ack).toBe(syn.tcp!.seq + 1);
    expect(decode(rst.frame).tcp!.window).toBe(0);
  });

  it('loss: three duplicate ACKs name the lost segment, which the retransmission fills', () => {
    const ps = CAPTURES.find((c) => c.answer === 'loss')!.packets;
    const dups = ps.filter((p) => p.tag === 'dup-ack');
    const re = ps.find((p) => p.tag === 'retransmission')!;
    expect(dups).toHaveLength(3);
    expect(new Set(dups.map((p) => p.tcp!.ack)).size).toBe(1);
    expect(re.tcp!.seq).toBe(dups[0].tcp!.ack);
    expect(ps.indexOf(re)).toBeGreaterThan(ps.indexOf(dups[2]));
    // The data segment numbered LOST_SEGMENT never shows up before the retransmission.
    const data = ps.filter((p) => p.from === 'server' && p.tcp && p.tcp.len === 1400 && p.tag !== 'retransmission');
    expect(data).toHaveLength(4);
    expect(LOST_SEGMENT).toBe(2);
    expect(dups.every((d) => d.info.includes('Dup ACK'))).toBe(true);
  });

  it('DNS failure: NXDOMAIN (rcode 3) in the bytes, and no SYN anywhere', () => {
    const ps = CAPTURES.find((c) => c.answer === 'dns')!.packets;
    expect(ps.some((p) => p.tcp)).toBe(false);
    const responses = ps.filter((p) => p.from === 'resolver');
    expect(responses.every((p) => (p.frame[45] & 0x0f) === 3 && (p.frame[44] & 0x80) === 0x80)).toBe(true);
  });

  it('TLS failure: a fatal (2) bad_certificate (42) alert record, after the handshake completed', () => {
    const ps = CAPTURES.find((c) => c.answer === 'tls')!.packets;
    const alert = ps.find((p) => p.tag === 'tls-alert')!;
    expect(alert.frame.slice(54)).toEqual([0x15, 0x03, 0x03, 0x00, 0x02, 0x02, 42]);
    expect(ps.findIndex((p) => p.tcp?.flags.join() === 'SYN,ACK')).toBeLessThan(ps.indexOf(alert));
  });
});

describe('the display filter subset', () => {
  const pkts = CAPTURES.flatMap((c) => c.packets);
  const run = (f: string) => {
    const r = parseFilter(f);
    if (!r.ok) throw new Error(r.error);
    return pkts.filter(r.value);
  };
  const flags = (p: Captured) => p.frame[47];

  it('tcp.flags.syn == 1 is exactly the packets with the SYN bit set', () => {
    expect(run('tcp.flags.syn == 1')).toEqual(pkts.filter((p) => p.tcp && flags(p) & 2));
    expect(run('tcp.flags.syn == 0')).toEqual(pkts.filter((p) => p.tcp && !(flags(p) & 2)));
    expect(run('tcp.flags.syn')).toEqual(run('tcp.flags.syn == 1'));
  });
  it('ip.addr matches either end; ip.src and ip.dst one end', () => {
    const s = ipv4('203.0.113.10');
    expect(run('ip.addr == 203.0.113.10')).toEqual(pkts.filter((p) => dword(p.frame, 26) === s || dword(p.frame, 30) === s));
    expect(run('ip.src == 203.0.113.10')).toEqual(pkts.filter((p) => dword(p.frame, 26) === s));
    expect(run('ip.dst == 203.0.113.10 && tcp.flags.reset')).toEqual(pkts.filter((p) => dword(p.frame, 30) === s && p.tcp && flags(p) & 4));
  });
  it('protocols, ports, analysis flags and combinations', () => {
    expect(run('dns')).toEqual(pkts.filter((p) => p.frame[23] === 17));
    expect(run('!dns')).toEqual(pkts.filter((p) => p.frame[23] !== 17));
    expect(run('not dns and not tcp')).toEqual([]);
    expect(run('tcp.port == 443')).toEqual(pkts.filter((p) => p.frame[23] === 6));
    expect(run('dns.flags.rcode == 3')).toEqual(pkts.filter((p) => p.frame[23] === 17 && (p.frame[45] & 0x0f) === 3 && p.frame[44] & 0x80));
    expect(run('tcp.analysis.retransmission || tcp.analysis.duplicate_ack')).toEqual(pkts.filter((p) => p.tag === 'retransmission' || p.tag === 'dup-ack'));
    expect(run('tls || dns and tcp')).toEqual(run('tls'));
    expect(run('   ')).toEqual(pkts);
  });
  it.each([
    'http', 'tcp.port >= 80', 'ip.addr != 203.0.113.10', '(dns)', 'frame contains "x"', 'ip.addr == 256.1.1.1', 'ip.addr == 1.2.3',
    'tcp.port == 70000', 'tcp.port == -1', 'tcp.port == 1e400', 'tcp.flags.syn == 2', 'ip.addr', 'dns &&', '&& dns', '🔥', '<b>dns</b>',
    'tcp.port == 443,80', 'x'.repeat(200),
  ])('refuses %j with a message', (f) => {
    const r = parseFilter(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
  });
  it('unknown words say "not supported in this simplified filter"', () => {
    const r = parseFilter('http.request');
    expect(r.ok || r.error).toContain('not supported in this simplified filter');
  });
});

describe('traceroute', () => {
  const trace = traceroute();
  it('hop k answers the probe sent with TTL k, from router k', () => {
    trace.forEach((h, i) => {
      expect(h.ttl).toBe(i + 1);
      expect(h.at).toBe(i);
      expect(h.from).toBe(PATH[i].answers ? PATH[i].ip : null);
    });
  });
  it('a silent router shows * * *, and the hops after it still answer', () => {
    const silent = trace.findIndex((h) => h.from === null);
    expect(silent).toBeGreaterThan(0);
    expect(trace[silent].rtts).toEqual([null, null, null]);
    expect(trace.slice(silent + 1).every((h) => h.from !== null)).toBe(true);
  });
  it('the destination ends the trace with Port Unreachable; earlier hops send Time Exceeded', () => {
    expect(trace.at(-1)).toMatchObject({ from: SERVER, reply: 'port-unreachable' });
    expect(trace.slice(0, -1).filter((h) => h.from !== null).every((h) => h.reply === 'time-exceeded')).toBe(true);
    expect(trace).toHaveLength(PATH.length);
  });
  it('a TTL past the path still reaches the destination (it never expires there)', () => {
    expect(probe(25)).toMatchObject({ at: PATH.length - 1, reply: 'port-unreachable' });
  });
  it('round trips grow along the path', () => {
    const firsts = trace.filter((h) => h.rtts[0] !== null).map((h) => h.rtts[0]!);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
  });
});

describe('tcpdump view', () => {
  it('"host 203.0.113.10" keeps only packets to or from it', () => {
    for (const c of CAPTURES) {
      const kept = tcpdumpHost(c.packets);
      expect(kept).toEqual(c.packets.filter((p) => dword(p.frame, 26) === SERVER || dword(p.frame, 30) === SERVER));
    }
  });
  it('lines carry the flags, numbers and lengths of their packets', () => {
    for (const { p } of all) {
      const line = tcpdumpLine(p);
      if (p.tcp) {
        expect(line).toContain(`length ${p.tcp.len}`);
        if (p.tcp.flags.includes('SYN')) expect(line).toContain(`seq ${p.tcp.seq}`);
        if (p.tcp.flags.join() === 'SYN') expect(line).toContain('Flags [S],');
        if (p.tcp.flags.join() === 'RST,ACK') expect(line).toContain('Flags [R.],');
      } else expect(line).toMatch(p.dns!.response ? (p.dns!.rcode === 3 ? /NXDomain/ : /1\/0\/0 A/) : /\+ A{1,4}\? /);
    }
  });
});
