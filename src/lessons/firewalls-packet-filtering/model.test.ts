import { describe, expect, it } from 'vitest';
import { ipToString, ipv4 } from '../../core/ipv4';
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import {
  BROAD_RETURN_RULE, PORT_MAX, PRESETS, cloneRules, evaluate, parsePorts, parseSource, ruleMatches, runStream, shadowed, type Action, type CtState,
  type Net, type Packet, type PortRange, type Proto, type Rule, type StateMatch,
} from './model';

// ── An independent reference matcher: CIDR by octets and powers of two, no bitwise ops ──

function refInNet(addr: number, n: Net | null): boolean {
  if (!n) return true;
  const size = 2 ** (32 - n.prefix);
  const toNum = (a: number) => ipToString(a).split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
  return Math.floor(toNum(addr) / size) === Math.floor(toNum(n.net) / size);
}
function refMatch(r: Rule, p: Packet, ct: CtState | null): boolean {
  const okProto = r.proto === null || r.proto === p.proto;
  const okPort = r.dport === null || (r.dport.lo <= p.dport && p.dport <= r.dport.hi);
  const okState = r.state === 'any' || (ct !== null && (r.state === 'NEW' ? ct === 'NEW' : ct === 'ESTABLISHED'));
  return okProto && okPort && okState && refInNet(p.src, r.src);
}

const NETS: Net[] = ['198.51.100.0/24', '198.51.100.0/25', '198.51.100.128/26', '192.0.2.0/24', '0.0.0.0/0', '203.0.113.50/32', '192.0.0.0/8'].map((c) => {
  const r = parseSource(c);
  if (!r.ok || !r.value) throw new Error(c);
  return r.value;
});
const RANGES: PortRange[] = [{ lo: 22, hi: 22 }, { lo: 80, hi: 80 }, { lo: 443, hi: 443 }, { lo: 1024, hi: 65535 }, { lo: 0, hi: 1023 }, { lo: 20, hi: 25 }];
const ACTIONS: Action[] = ['ACCEPT', 'DROP', 'REJECT'];
const STATES: StateMatch[] = ['any', 'any', 'NEW', 'ESTABLISHED,RELATED'];

function randomRule(rnd: Rnd, i: number): Rule {
  return {
    id: `r${i}`,
    enabled: rnd() > 0.15,
    src: rnd() < 0.3 ? null : pick(NETS, rnd),
    dport: rnd() < 0.25 ? null : pick(RANGES, rnd),
    proto: rnd() < 0.3 ? null : pick<Proto>(['tcp', 'udp'], rnd),
    state: pick(STATES, rnd),
    action: pick(ACTIONS, rnd),
  };
}
const ADDRS = ['198.51.100.0', '198.51.100.23', '198.51.100.127', '198.51.100.128', '198.51.100.191', '198.51.100.255', '192.0.2.77', '203.0.113.50', '203.0.113.51', '10.0.0.1'].map(ipv4);
function randomPacket(rnd: Rnd, i: number): Packet {
  return {
    id: `p${i}`, dir: 'in', src: pick(ADDRS, rnd), sport: randInt(1024, 65535, rnd), dst: ipv4('203.0.113.10'),
    dport: pick([0, 21, 22, 23, 25, 26, 80, 443, 1023, 1024, 5432, 65535], rnd), proto: pick<Proto>(['tcp', 'udp'], rnd), flags: 'SYN', label: '',
  };
}

describe('first match wins', () => {
  it('the matcher agrees with an independent reference on 500 seeded packets', () => {
    const rnd = mulberry32(5737);
    for (let i = 0; i < 500; i++) {
      const r = randomRule(rnd, i);
      const p = randomPacket(rnd, i);
      for (const ct of [null, 'NEW', 'ESTABLISHED'] as const) expect(ruleMatches(r, p, ct), `${JSON.stringify(r)} ${i}`).toBe(refMatch(r, p, ct));
    }
  });

  it('evaluate() picks the lowest-numbered enabled match, else the policy (500 seeded packets)', () => {
    const rnd = mulberry32(791);
    for (let i = 0; i < 500; i++) {
      const rules = Array.from({ length: randInt(1, 7, rnd) }, (_, k) => randomRule(rnd, k));
      const p = randomPacket(rnd, i);
      const ct = pick([null, 'NEW', 'ESTABLISHED'] as const, rnd);
      // Brute force: every rule that matches, in order; the first one decides.
      const all = rules.map((r, k) => (r.enabled && refMatch(r, p, ct) ? k : -1)).filter((k) => k >= 0);
      const v = evaluate(rules, p, ct, 'DROP');
      expect(v.rule).toBe(all.length ? all[0] : null);
      expect(v.action).toBe(all.length ? rules[all[0]].action : 'DROP');
      // Everything after the decider is never reached; everything enabled before it was passed (or needs tracking).
      v.outcomes.forEach((o, k) => {
        if (v.rule !== null && k > v.rule) expect(o).toBe('unreached');
        if (v.rule !== null && k < v.rule) expect(['pass', 'off', 'needs-tracking']).toContain(o);
      });
    }
  });

  it('order matters: the same two rules swapped give the other verdict', () => {
    const preset = PRESETS.find((p) => p.id === 'shadow')!;
    const office = preset.packets.find((p) => p.id === 'ssh-1')!;
    expect(evaluate(preset.rules, office, 'NEW', 'DROP')).toMatchObject({ action: 'DROP', rule: 1 });
    const fixed = cloneRules(preset.rules);
    [fixed[1], fixed[2]] = [fixed[2], fixed[1]];
    expect(evaluate(fixed, office, 'NEW', 'DROP')).toMatchObject({ action: 'ACCEPT', rule: 1 });
  });
});

describe('the shadowing detector', () => {
  /** Witness packets: each network's first and last address and their neighbours, each range's ends and neighbours. */
  const witnessAddrs = [...new Set(NETS.flatMap((n) => {
    const size = 2 ** (32 - n.prefix);
    return [n.net - 1, n.net, n.net + size - 1, n.net + size].filter((a) => a >= 0 && a <= 0xffffffff);
  }))];
  const witnessPorts = [...new Set(RANGES.flatMap((r) => [r.lo - 1, r.lo, r.hi, r.hi + 1]).filter((x) => x >= 0 && x <= PORT_MAX))];
  const universe: [Packet, CtState][] = [];
  for (const src of witnessAddrs)
    for (const dport of witnessPorts)
      for (const proto of ['tcp', 'udp'] as Proto[])
        for (const ct of ['NEW', 'ESTABLISHED'] as CtState[])
          universe.push([{ id: '', dir: 'in', src, sport: 40000, dst: 0, dport, proto, flags: '', label: '' }, ct]);

  const bruteCovers = (a: Rule, b: Rule) => universe.every(([p, ct]) => !refMatch(b, p, ct) || refMatch(a, p, ct));

  it('flags rule j exactly when an earlier enabled rule with another action covers every packet j matches', () => {
    const rnd = mulberry32(1918);
    let flagged = 0;
    for (let t = 0; t < 400; t++) {
      const rules = Array.from({ length: randInt(2, 6, rnd) }, (_, k) => randomRule(rnd, k));
      const got = shadowed(rules);
      rules.forEach((b, j) => {
        // The first earlier enabled rule covering j decides j's packets; j is shadowed when it acts differently.
        const first = b.enabled ? rules.findIndex((a, i) => i < j && a.enabled && bruteCovers(a, b)) : -1;
        const by = first >= 0 && rules[first].action !== b.action ? first : -1;
        expect(got.get(j) ?? -1, `rule ${j} of ${JSON.stringify(rules)}`).toBe(by);
        if (by >= 0) flagged++;
      });
    }
    expect(flagged).toBeGreaterThan(20);
  });

  it('flags the preset\'s office SSH rule, and stops once the rules are reordered', () => {
    const rules = cloneRules(PRESETS.find((p) => p.id === 'shadow')!.rules);
    expect([...shadowed(rules)]).toEqual([[2, 1]]);
    [rules[1], rules[2]] = [rules[2], rules[1]];
    expect(shadowed(rules).size).toBe(0);
  });

  it('names the rule that really hides it: an earlier same-action rule makes it redundant, not shadowed by a later one', () => {
    const allSsh = (id: string, action: Action, src: Net | null = null): Rule => ({ id, enabled: true, src, dport: { lo: 22, hi: 22 }, proto: 'tcp', state: 'any', action });
    const office = parseSource('198.51.100.0/24');
    if (!office.ok) throw new Error('cidr');
    expect([...shadowed([allSsh('a', 'ACCEPT'), allSsh('b', 'DROP'), allSsh('c', 'ACCEPT', office.value)])]).toEqual([[1, 0]]);
  });

  it('without tracking, a state rule hides nothing (it can never fire)', () => {
    const est = { ...PRESETS[0].rules[0] };
    const later: Rule = { ...est, id: 'x', state: 'ESTABLISHED,RELATED', action: 'DROP' };
    expect(shadowed([est, later], true).get(1)).toBe(0);
    expect(shadowed([est, later], false).size).toBe(0);
  });
});

describe('connection tracking', () => {
  const preset = PRESETS.find((p) => p.id === 'ssh')!;
  const by = (steps: ReturnType<typeof runStream>, id: string) => steps.find((s) => s.packet.id === id)!;

  it('the reply to an outbound flow is ESTABLISHED and let in; the same packet without that flow is NEW and dropped', () => {
    const steps = runStream(preset.rules, preset.packets, true, 'DROP');
    expect(by(steps, 'reply')).toMatchObject({ ct: 'ESTABLISHED', verdict: { action: 'ACCEPT', rule: 0 } });
    const noOutbound = runStream(preset.rules, preset.packets.filter((p) => p.id !== 'out'), true, 'DROP');
    expect(by(noOutbound, 'reply')).toMatchObject({ ct: 'NEW', verdict: { action: 'DROP', rule: null } });
  });

  it('only the exact reversed 4-tuple counts: a different host on the same port is NEW', () => {
    const steps = runStream(preset.rules, preset.packets, true, 'DROP');
    expect(by(steps, 'stray')).toMatchObject({ ct: 'NEW', verdict: { action: 'DROP' } });
  });

  it('stateless: the reply is dropped, and the broad rule that lets it in lets the stray in too', () => {
    const plain = runStream(preset.rules, preset.packets, false, 'DROP');
    expect(by(plain, 'reply').verdict).toMatchObject({ action: 'DROP', rule: null });
    expect(by(plain, 'reply').verdict!.outcomes[0]).toBe('needs-tracking');
    const broad = runStream([...preset.rules, BROAD_RETURN_RULE()], preset.packets, false, 'DROP');
    expect(by(broad, 'reply').verdict!.action).toBe('ACCEPT');
    expect(by(broad, 'stray').verdict!.action).toBe('ACCEPT');
  });

  it('every preset\'s stream, worked by hand', () => {
    const verdicts = (id: string, tracking: boolean) => {
      const p = PRESETS.find((x) => x.id === id)!;
      return runStream(p.rules, p.packets, tracking, p.policy).filter((s) => s.verdict).map((s) => `${s.packet.id}:${s.verdict!.action}@${s.verdict!.rule}`);
    };
    expect(verdicts('ssh', true)).toEqual(['ssh-1:ACCEPT@1', 'ssh-2:ACCEPT@0', 'ssh-x:DROP@null', 'reply:ACCEPT@0', 'stray:DROP@null']);
    expect(verdicts('ssh', false)).toEqual(['ssh-1:ACCEPT@1', 'ssh-2:ACCEPT@1', 'ssh-x:DROP@null', 'reply:DROP@null', 'stray:DROP@null']);
    expect(verdicts('shadow', true)).toEqual(['ssh-1:DROP@1', 'ssh-x:DROP@1', 'web-1:ACCEPT@3']);
    expect(verdicts('web', true)).toEqual(['web-1:ACCEPT@2', 'web-2:ACCEPT@1', 'db-1:REJECT@3', 'rdp-1:DROP@null', 'reply:ACCEPT@0', 'stray:DROP@null']);
  });
});

describe('learner-typed fields', () => {
  it.each([
    ['any', null],
    [' 198.51.100.0/24 ', '198.51.100.0/24'],
    ['198.51.100.23/24', '198.51.100.0/24'],
    ['203.0.113.50', '203.0.113.50/32'],
  ])('source %j is accepted as %j', (text, expected) => {
    const r = parseSource(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value ? `${ipToString(r.value.net)}/${r.value.prefix}` : null).toBe(expected);
  });

  it.each(['', '   ', '256.1.1.1/24', '10.1/8', '1.2.3.4/33', '1.2.3.4/-1', '012.1.1.1/8', '1e400', '🔥', '<b>1.2.3.4</b>', '1.2.3.4/24,5.6.7.8/24', '12345678901234567890123'])(
    'source %j is refused with a reason', (text) => {
      const r = parseSource(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    },
  );

  it.each([['any', null], ['22', '22-22'], [' 1024-65535 ', '1024-65535'], ['0', '0-0'], ['65535', '65535-65535']])('ports %j → %j', (text, expected) => {
    const r = parsePorts(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value ? `${r.value.lo}-${r.value.hi}` : null).toBe(expected);
  });

  it.each(['', ' ', '-1', '65536', '80-22', '1-2-3', '1e400', '22.5', '🔥', '<i>22</i>', '22,,23', '12345678901234567890123', '+22'])('ports %j are refused with a reason', (text) => {
    const r = parsePorts(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
  });
});
