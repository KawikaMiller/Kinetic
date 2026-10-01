import { describe, expect, it } from 'vitest';
import { buildFrames } from './frames';
import { DEVICES, FIRST_EPHEMERAL, FIRST_PUBLIC, LOOPBACK, ROUTER_WAN, SERVER_IP, simulate, TOUR, type Trip } from './model';

const trip = (t: Partial<Trip>): Trip => ({ dev: 'laptop', dest: 'server', port: 443, ...t });
const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const isDocumentation = (ip: string) => /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(ip);

describe('addresses', () => {
  it('home devices are private, the router WAN and server are documentation ranges (no real hosts)', () => {
    for (const d of Object.values(DEVICES)) expect(isPrivate(d.ip)).toBe(true);
    expect(isDocumentation(ROUTER_WAN)).toBe(true);
    expect(isDocumentation(SERVER_IP)).toBe(true);
  });
});

describe('the tour', () => {
  const steps = simulate(TOUR);
  const last = steps.at(-1)!;

  it('counts connections and refusals as the stats show them', () => {
    expect(last.connections).toBe(4);
    expect(last.refused).toBe(1); // :8080 on the server
    expect(last.nat).toHaveLength(3); // localhost never reaches the router
  });

  it('laptop and phone both use port 51000, and NAT gives them different public ports', () => {
    const [laptop, phone] = last.nat;
    expect(laptop.priv).toEqual({ ip: DEVICES.laptop.ip, port: FIRST_EPHEMERAL });
    expect(phone.priv).toEqual({ ip: DEVICES.phone.ip, port: FIRST_EPHEMERAL });
    expect(laptop.pub).toEqual({ ip: ROUTER_WAN, port: FIRST_PUBLIC });
    expect(phone.pub).toEqual({ ip: ROUTER_WAN, port: FIRST_PUBLIC + 1 });
    const shared = steps.filter((s) => s.beat === 'natOut').map((s) => s.sharedPort);
    expect(shared).toEqual([false, true, false]);
  });

  it('every frame has a caption', () => {
    for (const f of buildFrames(TOUR)) expect(f.say).toBeTruthy();
  });
});

describe('NAT', () => {
  it('rewrites only the source on the way out and only the destination on the way back', () => {
    const s = simulate([trip({})]);
    const by = (b: string) => s.find((x) => x.beat === b)!;
    expect(by('send').src).toEqual({ ip: DEVICES.laptop.ip, port: FIRST_EPHEMERAL });
    expect(by('natOut')).toMatchObject({ changed: 'src', src: { ip: ROUTER_WAN, port: FIRST_PUBLIC }, dst: { ip: SERVER_IP, port: 443 } });
    expect(by('internet').src!.ip).toBe(ROUTER_WAN); // the server never sees the private address
    expect(by('replyOut').dst).toEqual({ ip: ROUTER_WAN, port: FIRST_PUBLIC });
    expect(by('natIn')).toMatchObject({ changed: 'dst', dst: { ip: DEVICES.laptop.ip, port: FIRST_EPHEMERAL }, natHi: 0 });
  });

  it('a reply goes home to whichever device owns its public port', () => {
    const s = simulate([trip({ dev: 'laptop' }), trip({ dev: 'phone' }), trip({ dev: 'laptop', port: 22 })]);
    const homes = s.filter((x) => x.beat === 'home').map((x) => [x.lit[0], x.dst]);
    expect(homes).toEqual([
      ['laptop', { ip: DEVICES.laptop.ip, port: FIRST_EPHEMERAL }],
      ['phone', { ip: DEVICES.phone.ip, port: FIRST_EPHEMERAL }],
      ['laptop', { ip: DEVICES.laptop.ip, port: FIRST_EPHEMERAL + 1 }],
    ]);
  });

  it('each new connection gets a fresh ephemeral port and a fresh public port', () => {
    const nat = simulate([trip({}), trip({}), trip({ port: 22 })]).at(-1)!.nat;
    expect(nat.map((r) => r.priv.port)).toEqual([51000, 51001, 51002]);
    expect(new Set(nat.map((r) => r.pub.port)).size).toBe(3);
  });
});

describe('port delivery', () => {
  it.each([
    [443, 'web server (HTTPS)'],
    [22, 'sshd (remote login)'],
    [5432, 'postgres'],
  ])(':%i reaches %s and the reply is green', (port, svc) => {
    const s = simulate([trip({ port })]);
    const deliver = s.find((x) => x.beat === 'deliver')!;
    expect(deliver).toMatchObject({ svc, lit: [`port-${port}`] });
    expect(s.find((x) => x.beat === 'home')!.flight!.kind).toBe('resp');
    expect(s.at(-1)!.refused).toBe(0);
  });

  it(':8080 has no listener: RST all the way back and one refusal', () => {
    const s = simulate([trip({ port: 8080 })]);
    expect(s.some((x) => x.beat === 'deliver')).toBe(false);
    expect(s.find((x) => x.beat === 'refused')!.flight!.kind).toBe('rst');
    expect(s.filter((x) => ['replyOut', 'natIn', 'home'].includes(x.beat)).every((x) => x.flight!.kind === 'rst')).toBe(true);
    expect(s.at(-1)!.refused).toBe(1);
  });
});

describe('localhost', () => {
  it('stays on the machine: loopback addresses, no router, no NAT entry', () => {
    const s = simulate([trip({ dest: 'localhost', port: 3000 })]);
    expect(s.map((x) => x.beat)).toEqual(['intro', 'loopSend', 'loopDelivered']);
    for (const x of s.slice(1)) {
      expect(x.src!.ip).toBe(LOOPBACK);
      expect(x.dst!.ip).toBe(LOOPBACK);
      expect(x.lit).not.toContain('router');
    }
    expect(s.at(-1)!.nat).toHaveLength(0);
    expect(s.at(-1)!.svc).toBe('dev server');
  });

  it('the phone runs no local servers, so its localhost is refused', () => {
    const s = simulate([trip({ dev: 'phone', dest: 'localhost', port: 3000 })]);
    expect(s.at(-1)).toMatchObject({ beat: 'loopRefused', refused: 1 });
  });
});
