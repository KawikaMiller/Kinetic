import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  ARP_BODY_BYTES, BROADCAST_MAC, ETHERTYPE_ARP, ETHERTYPE_IPV4, ETH_HEADER_BYTES, GATEWAY, HOSTS, PORTS, REMOTE_IP, age, clearSwitch,
  emptyWorld, frameBytes, hostById, isExpired, learn, lookup, nextHop, send, switchFrame, wait, type HostId, type SwitchTable,
} from './model';

describe('next hop', () => {
  it('sends to the target on the same subnet and to the gateway otherwise', () => {
    expect(nextHop('192.168.1.10', '192.168.1.20')).toEqual({ onLink: true, ip: '192.168.1.20' });
    expect(nextHop('192.168.1.10', REMOTE_IP)).toEqual({ onLink: false, ip: GATEWAY.ip });
    expect(nextHop('192.168.1.10', '192.168.2.20')).toEqual({ onLink: false, ip: GATEWAY.ip });
    expect(nextHop('192.168.1.10', '192.168.2.20', 16)).toEqual({ onLink: true, ip: '192.168.2.20' });
  });

  it('agrees with a string comparison of the first three octets for a /24 (seeded)', () => {
    const rnd = mulberry32(4);
    const octet = () => Math.floor(rnd() * 256);
    for (let i = 0; i < 2000; i++) {
      const target = `192.168.${rnd() < 0.5 ? 1 : octet()}.${octet()}`;
      const same = target.split('.').slice(0, 3).join('.') === '192.168.1';
      expect(nextHop('192.168.1.10', target).onLink).toBe(same);
    }
  });
});

describe('the learning switch', () => {
  const macs = ['m1', 'm2', 'm3'];
  const ports = [1, 2, 3, 4];

  it('broadcasts always flood to every port except the ingress', () => {
    const table: SwitchTable = { m1: { port: 1, at: 0 }, m2: { port: 2, at: 0 } };
    for (const p of ports) {
      const r = switchFrame(table, 'm1', BROADCAST_MAC, p, ports, 0);
      expect(r.action).toBe('flood');
      expect(r.out).toEqual(ports.filter((x) => x !== p));
    }
  });

  it('floods unknown destinations, forwards known ones to one port, and filters same-port ones (exhaustive)', () => {
    // every table that maps a subset of macs to ports, every source, destination and ingress port
    const tables: SwitchTable[] = [{}];
    for (const m of macs) {
      const grown: SwitchTable[] = [];
      for (const t of tables) {
        grown.push(t);
        for (const p of ports) grown.push({ ...t, [m]: { port: p, at: 0 } });
      }
      tables.splice(0, tables.length, ...grown);
    }
    expect(tables).toHaveLength(125);
    for (const table of tables) {
      for (const src of macs) {
        for (const dst of macs) {
          if (dst === src) continue;
          for (const inPort of ports) {
            const r = switchFrame(table, src, dst, inPort, ports, 5);
            expect(r.table[src]).toEqual({ port: inPort, at: 5 });
            expect(r.learned).toBe(table[src]?.port !== inPort);
            const known = table[dst];
            if (!known) {
              expect(r.action).toBe('flood');
              expect(r.out).toEqual(ports.filter((p) => p !== inPort));
            } else if (known.port === inPort) {
              expect(r.action).toBe('filter');
              expect(r.out).toEqual([]);
            } else {
              expect(r.action).toBe('forward');
              expect(r.out).toEqual([known.port]);
            }
          }
        }
      }
    }
  });
});

describe('ARP cache aging', () => {
  it('hits before the timeout and misses from the timeout on', () => {
    const cache = learn({}, '192.168.1.20', 'aa', 100);
    for (const timeout of [15, 60, 120]) {
      for (let now = 100; now < 100 + timeout; now++) expect(lookup(cache, '192.168.1.20', now, timeout)?.mac).toBe('aa');
      expect(lookup(cache, '192.168.1.20', 100 + timeout, timeout)).toBeNull();
      expect(isExpired(cache['192.168.1.20'], 100 + timeout, timeout)).toBe(true);
      expect(age(cache, 100 + timeout, timeout)).toEqual({});
      expect(age(cache, 99 + timeout, timeout)).toEqual(cache);
    }
  });
});

describe('frames', () => {
  it('uses the IEEE EtherType values', () => {
    expect(ETHERTYPE_ARP).toBe(0x0806);
    expect(ETHERTYPE_IPV4).toBe(0x0800);
  });

  it('lays out the header and the RFC 826 ARP body', () => {
    const a = hostById('A');
    const b = hostById('B');
    const bytes = frameBytes(BROADCAST_MAC, a.mac, ETHERTYPE_ARP, { op: 1, senderMac: a.mac, senderIp: a.ip, targetMac: '00:00:00:00:00:00', targetIp: b.ip });
    expect(bytes).toHaveLength(ETH_HEADER_BYTES + ARP_BODY_BYTES);
    expect(bytes.slice(0, 6)).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    expect(bytes.slice(12, 14)).toEqual([0x08, 0x06]);
    expect(bytes.slice(14, 22)).toEqual([0, 1, 0x08, 0x00, 6, 4, 0, 1]);
    expect(bytes.slice(28, 32)).toEqual([192, 168, 1, 10]);
    expect(bytes.slice(38, 42)).toEqual([192, 168, 1, 20]);
    expect(frameBytes(b.mac, a.mac, ETHERTYPE_IPV4)).toHaveLength(ETH_HEADER_BYTES);
  });
});

describe('a transmission', () => {
  const T = 60;
  const kinds = (t: { steps: { kind: string }[] }) => t.steps.map((s) => s.kind);

  it('a cold send ARPs: broadcast flooded, unicast reply forwarded, then the frame forwarded to one port', () => {
    const t = send(emptyWorld(), 'A', '192.168.1.20', T);
    expect(kinds(t)).toEqual(['decide', 'miss', 'arp-request', 'arp-reply', 'data']);
    const [, , req, rep, data] = t.steps;
    expect(req.frame!.dst).toBe(BROADCAST_MAC);
    expect(req.switchAction).toBe('flood');
    expect(req.out).toEqual(PORTS.filter((p) => p !== hostById('A').port));
    expect(rep.frame!.dst).toBe(hostById('A').mac);
    expect(rep.switchAction).toBe('forward');
    expect(rep.out).toEqual([hostById('A').port]);
    expect(data.switchAction).toBe('forward');
    expect(data.out).toEqual([hostById('B').port]);
    expect(data.frame!.dst).toBe(hostById('B').mac);
    expect(data.frame!.ethertype).toBe(ETHERTYPE_IPV4);
    // both caches and the switch table fill in
    expect(t.world.caches.A['192.168.1.20'].mac).toBe(hostById('B').mac);
    expect(t.world.caches.B['192.168.1.10'].mac).toBe(hostById('A').mac);
    expect(Object.keys(t.world.table).sort()).toEqual([hostById('A').mac, hostById('B').mac].sort());
    // nobody else learned anything
    for (const id of ['C', 'D', 'R'] as HostId[]) expect(t.world.caches[id]).toEqual({});
  });

  it('a second send hits the cache and skips ARP', () => {
    const first = send(emptyWorld(), 'A', '192.168.1.20', T);
    const again = send(first.world, 'A', '192.168.1.20', T);
    expect(kinds(again)).toEqual(['decide', 'hit', 'data']);
    expect(again.steps.at(-1)!.switchAction).toBe('forward');
  });

  it('an off-subnet target ARPs for the gateway and frames go to the router\'s MAC', () => {
    const t = send(emptyWorld(), 'C', REMOTE_IP, T);
    expect(t.hop).toEqual({ onLink: false, ip: GATEWAY.ip });
    expect(t.owner.id).toBe('R');
    expect(t.steps.find((s) => s.kind === 'arp-request')!.frame!.arp!.targetIp).toBe(GATEWAY.ip);
    expect(t.steps.at(-1)!.frame!.dst).toBe(GATEWAY.mac);
  });

  it('with the switch table cleared, a cache hit still floods the frame (unknown unicast)', () => {
    const first = send(emptyWorld(), 'A', '192.168.1.20', T);
    const t = send(clearSwitch(first.world), 'A', '192.168.1.20', T);
    expect(kinds(t)).toEqual(['decide', 'hit', 'data']);
    expect(t.steps.at(-1)!.switchAction).toBe('flood');
    expect(t.steps.at(-1)!.out).toHaveLength(HOSTS.length - 1);
  });

  it('after the timeout the entry has aged out: a miss, and ARP again', () => {
    const first = send(emptyWorld(), 'A', '192.168.1.20', T);
    const later = send(wait(first.world, T), 'A', '192.168.1.20', T);
    expect(kinds(later)).toEqual(['decide', 'miss', 'arp-request', 'arp-reply', 'data']);
    expect(later.steps[1].agedOut).toBe(true);
    const sooner = send(wait(first.world, T - 1), 'A', '192.168.1.20', T);
    expect(kinds(sooner)).toEqual(['decide', 'hit', 'data']);
  });
});
