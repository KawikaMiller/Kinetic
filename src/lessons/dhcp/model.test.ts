import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { sequenceLayout } from '../../core/sequenceLayout';
import {
  APIPA_FIRST, APIPA_LAST, BROADCAST, CLIENT_PORT, DEFAULT_LEASE_S, LAPTOP_MAC, OFFER_HOLD_S, RELAY_IP, REMOTE_SERVER, SERVER_A, SERVER_B,
  SERVER_PORT, UNSPECIFIED, apipaAddress, createPool, doraScene, exhaustedScene, expire, isApipa, leaseScene, leaseTimers, offer, range,
  relayScene, release, request, twoServersScene, withdraw, type Pool, type Scene,
} from './model';

const wires = (s: Scene) => s.steps.filter((st) => st.wire).map((st) => st.wire!);
const types = (s: Scene) => wires(s).map((w) => w.type);

describe('DORA on one LAN', () => {
  const scene = doraScene();

  it('runs DISCOVER, OFFER, REQUEST, ACK in that order', () => {
    expect(types(scene)).toEqual(['DHCPDISCOVER', 'DHCPOFFER', 'DHCPREQUEST', 'DHCPACK']);
  });

  it('broadcasts the client side from 0.0.0.0:68 to 255.255.255.255:67', () => {
    for (const w of wires(scene).filter((w) => w.type === 'DHCPDISCOVER' || w.type === 'DHCPREQUEST')) {
      expect(w.src).toEqual({ ip: UNSPECIFIED, port: CLIENT_PORT });
      expect(w.dst).toEqual({ ip: BROADCAST, port: SERVER_PORT });
    }
    const steps = scene.steps.filter((s) => s.wire?.dst.ip === BROADCAST);
    expect(steps.every((s) => s.to === '*' && s.tone === 'info')).toBe(true);
  });

  it('answers from server port 67 to client port 68, at the offered address, and ACKs what was offered', () => {
    const [, o, r, a] = wires(scene);
    for (const w of [o, a]) {
      expect(w.src).toEqual({ ip: SERVER_A, port: SERVER_PORT });
      expect(w.dst.port).toBe(CLIENT_PORT);
      expect(w.dst.ip).toBe(o.addr);
    }
    expect(r.addr).toBe(o.addr);
    expect(r.server).toBe(SERVER_A);
    expect(a.addr).toBe(o.addr);
  });

  it('skips the address already leased to someone else, and only sets the config at the ACK', () => {
    const [, o] = wires(scene);
    expect(o.addr).toBe('192.168.1.101');
    const states = scene.steps.map((s) => s.config.ip.state);
    expect(states).toEqual(['empty', 'offered', 'offered', 'set']);
    const last = scene.steps.at(-1)!;
    expect(last.pools[0].pool.slots['192.168.1.101']).toMatchObject({ status: 'leased', mac: LAPTOP_MAC });
  });
});

describe('two servers', () => {
  const scene = twoServersScene();

  it('gets two offers, requests one server by name, and the other withdraws', () => {
    expect(types(scene)).toEqual(['DHCPDISCOVER', 'DHCPOFFER', 'DHCPOFFER', 'DHCPREQUEST', 'DHCPACK']);
    const offers = wires(scene).filter((w) => w.type === 'DHCPOFFER');
    expect(offers.map((w) => w.src.ip)).toEqual([SERVER_A, SERVER_B]);
    const req = wires(scene).find((w) => w.type === 'DHCPREQUEST')!;
    expect(req.dst.ip).toBe(BROADCAST);
    expect(req.server).toBe(SERVER_A);
    const ack = wires(scene).find((w) => w.type === 'DHCPACK')!;
    expect(ack.src.ip).toBe(SERVER_A);
    const ids = scene.steps.map((s) => s.event);
    expect(ids.indexOf('withdraw')).toBeGreaterThan(ids.indexOf('request'));
    const last = scene.steps.at(-1)!;
    const b = last.pools[1].pool;
    expect(Object.values(b.slots).every((s) => s.status === 'free')).toBe(true);
    expect(scene.steps.find((s) => s.event === 'withdraw')!.tone).toBe('dim');
  });
});

describe('pool exhausted', () => {
  it('sends no offer, retries, and falls back to a link-local address', () => {
    const scene = exhaustedScene(mulberry32(3));
    expect(types(scene)).toEqual(['DHCPDISCOVER', 'DHCPDISCOVER']);
    expect(scene.steps.map((s) => s.event)).toEqual(['discover', 'no-offer', 'retry', 'no-offer', 'apipa']);
    const last = scene.steps.at(-1)!;
    expect(isApipa(last.config.ip.value)).toBe(true);
    expect(last.config.ip.state).toBe('link-local');
    expect(last.config.mask.value).toBe('255.255.0.0');
    expect(last.tone).toBe('orange');
  });
});

describe('relay agent', () => {
  const scene = relayScene();

  it('turns the broadcast into unicast between relay and server, both on port 67, with giaddr set', () => {
    expect(types(scene)).toEqual(['DHCPDISCOVER', 'DHCPDISCOVER', 'DHCPOFFER', 'DHCPOFFER', 'DHCPREQUEST', 'DHCPREQUEST', 'DHCPACK', 'DHCPACK']);
    const hops = scene.steps.filter((s) => (s.from === 'relay' && s.to === 'server') || (s.from === 'server' && s.to === 'relay'));
    expect(hops).toHaveLength(4);
    for (const h of hops) {
      expect([h.wire!.src.ip, h.wire!.dst.ip].sort()).toEqual([REMOTE_SERVER, RELAY_IP].sort());
      expect(h.wire!.src.port).toBe(SERVER_PORT);
      expect(h.wire!.dst.port).toBe(SERVER_PORT);
      expect(h.wire!.giaddr).toBe(RELAY_IP);
      expect(h.tone === 'violet' || h.wire!.type === 'DHCPACK').toBe(true);
    }
    // the laptop's broadcasts are drawn only to the relay: the server is on another subnet
    expect(scene.steps.filter((s) => s.from === 'laptop').every((s) => s.to === 'relay')).toBe(true);
  });

  it('offers an address from the pool for the relay\'s subnet', () => {
    const offer = wires(scene).find((w) => w.type === 'DHCPOFFER')!;
    expect(offer.addr!.startsWith('192.168.2.')).toBe(true);
    expect(scene.steps.at(-1)!.config.router.value).toBe(RELAY_IP);
  });
});

describe('lease timers', () => {
  it('uses the RFC 2131 defaults T1 = 0.5 × lease and T2 = 0.875 × lease', () => {
    for (const lease of [3600, 8 * 3600, DEFAULT_LEASE_S, 7 * 86400]) {
      expect(leaseTimers(lease)).toEqual({ t1: 0.5 * lease, t2: 0.875 * lease, expiry: lease });
    }
  });

  it('renews by unicast at T1 when the server answers', () => {
    const s = leaseScene(DEFAULT_LEASE_S, true);
    expect(s.steps.map((x) => x.event)).toEqual(['renew', 'renew-ack']);
    const renew = s.steps[0];
    expect(renew.t).toBe(12 * 3600);
    expect(renew.wire!.dst).toEqual({ ip: SERVER_A, port: SERVER_PORT });
    expect(renew.to).toBe('server');
    const slot = s.steps[1].pools[0].pool.slots['192.168.1.101'];
    expect(slot.until).toBe(12 * 3600 + DEFAULT_LEASE_S);
  });

  it('rebinds by broadcast at T2 and drops the address at expiry when the server is gone', () => {
    const s = leaseScene(8 * 3600, false);
    expect(s.steps.map((x) => x.event)).toEqual(['renew', 'rebind', 'rebind-lost', 'expire']);
    expect(s.steps[0].lost).toBe(true);
    expect(s.steps[1].t).toBe(7 * 3600);
    expect(s.steps[1].wire!.dst.ip).toBe(BROADCAST);
    const end = s.steps.at(-1)!;
    expect(end.t).toBe(8 * 3600);
    expect(end.config.ip.state).toBe('empty');
    expect(end.pools[0].pool.slots['192.168.1.101'].status).toBe('free');
  });
});

describe('the pool', () => {
  it('never offers an address that is leased or out for offer to someone else (seeded joins and leaves)', () => {
    const rnd = mulberry32(42);
    const macs = Array.from({ length: 12 }, (_, i) => `02:00:00:00:00:${String(i).padStart(2, '0')}`);
    let pool: Pool = createPool(range('10.0.0.10', 8));
    let now = 0;
    for (let step = 0; step < 5000; step++) {
      now += Math.floor(rnd() * 20);
      const mac = macs[Math.floor(rnd() * macs.length)];
      const roll = rnd();
      if (roll < 0.5) {
        const before = expire(pool, now);
        const o = offer(pool, mac, now);
        if (o.addr !== null) {
          const was = before.slots[o.addr];
          expect(was.status === 'free' || was.mac === mac).toBe(true);
        } else {
          expect(Object.values(before.slots).every((s) => s.status !== 'free' && s.mac !== mac)).toBe(true);
        }
        pool = o.pool;
        if (o.addr !== null && rnd() < 0.7) pool = request(pool, mac, o.addr, now, 300).pool;
      } else if (roll < 0.65) {
        pool = withdraw(pool, mac);
      } else if (roll < 0.8) {
        pool = release(pool, mac);
      }
      // nobody ever holds two addresses, and no address has two holders
      const held = Object.values(pool.slots).filter((s) => s.status !== 'free').map((s) => s.mac);
      expect(new Set(held).size).toBe(held.length);
    }
  });

  it('refuses a REQUEST for an address another client holds, and frees stale offers', () => {
    let pool = createPool(['10.0.0.1']);
    pool = offer(pool, 'a', 0).pool;
    expect(request(pool, 'b', '10.0.0.1', 1, 100).ack).toBe(false);
    expect(offer(pool, 'b', 1).addr).toBeNull();
    expect(offer(pool, 'b', OFFER_HOLD_S).addr).toBe('10.0.0.1');
  });
});

describe('link-local fallback', () => {
  it('APIPA addresses are 169.254.1.0-169.254.254.255 (RFC 3927)', () => {
    expect(isApipa(APIPA_FIRST)).toBe(true);
    expect(isApipa(APIPA_LAST)).toBe(true);
    expect(isApipa('169.254.0.255')).toBe(false);
    expect(isApipa('169.254.255.0')).toBe(false);
    expect(isApipa('192.168.1.1')).toBe(false);
    const rnd = mulberry32(8);
    for (let i = 0; i < 10000; i++) expect(isApipa(apipaAddress(rnd))).toBe(true);
  });
});

describe('every scene lays out as a ladder', () => {
  it('names only its own actors', () => {
    for (const scene of [doraScene(), twoServersScene(), exhaustedScene(mulberry32(1)), relayScene(), leaseScene(3600, true), leaseScene(3600, false)]) {
      const layout = sequenceLayout(scene.actors, scene.steps);
      expect(layout.rows).toHaveLength(scene.steps.length);
      expect(new Set(scene.steps.map((s) => s.id)).size).toBe(scene.steps.length);
    }
  });
});
