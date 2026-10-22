import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { ipv4 } from '../../core/ipv4';
import { carveCaption, rulesIntro, summaryCaption, traceFrames } from './captions';
import {
  addRule, editDraft, flowById, initialPlanner, initialRules, initialTracer, loadPreset, pickList, removeRule, setRowText,
} from './init';
import lesson from './index';
import { carve, DEFAULT_VPC, usableAddresses } from './planner';
import { EMPTY_DRAFT, buildRule } from './rules';
import {
  ANYWHERE, FLOWS, MAX_RULES, PRESETS, asIntended, lookup, presetConfig, rulesOf, traceFlow, withRules,
  type ListRef, type NaclRule, type RouteEntry, type SgRule,
} from './vpc';

const clean = (node: unknown) => {
  const t = captionText(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};
const goodCount = (cfg: ReturnType<typeof presetConfig>) => FLOWS.filter((f) => asIntended(f, traceFlow(cfg, f))).length;

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the web flow passes its checks and is delivered; db to the internet drops at the isolated table', () => {
    const s = initialTracer();
    expect([s.preset, s.flow]).toEqual(['three-tier', 'user-web']);
    const t = traceFlow(presetConfig(s.preset), flowById(s.flow));
    expect(t.delivered).toBe(true);
    const checks = t.hops.filter((h) => h.verdict === 'pass').length;
    const out = traceFlow(presetConfig('three-tier'), flowById('db-updates'));
    expect(out.drop).toBe('no-route');
    const drop = out.hops.find((h) => h.verdict === 'drop')!;
    expect(drop.title).toBe('route table of isolated');
    expect(drop.text).toContain('no 0.0.0.0/0');
    expect(lesson.tryThis[0]).toContain(`${checks} checks pass, the reply included`);
    expect(lesson.tryThis[0]).toContain('it drops at route table of isolated');
    expect(lesson.tryThis[0]).toContain('"internet to web:443"');
    expect(lesson.tryThis[0]).toContain('"db to the internet"');
  });

  it('try-this 2: with everything public the database is reachable from the internet and can reach out; 4 of 6 flows are as intended', () => {
    const cfg = presetConfig('all-public');
    expect(traceFlow(cfg, flowById('user-db')).delivered).toBe(true);
    expect(traceFlow(cfg, flowById('db-updates')).delivered).toBe(true);
    expect(goodCount(cfg)).toBe(4);
    expect(lesson.tryThis[1]).toContain('it is delivered, although the design wants it stopped');
    expect(lesson.tryThis[1]).toContain('"db to the internet" is delivered too');
    expect(lesson.tryThis[1]).toContain('Only 4 of 6 flows');
    expect(PRESETS.some((p) => p.label === 'everything public (the mistake)')).toBe(true);
  });

  it('try-this 3: the rules scene opens with 5 of 6 flows as intended and app to db dropped at db-sg inbound; typing 5432 and app-sg then Add rule gives 6 of 6', () => {
    const s = initialRules();
    expect(s.list).toEqual({ kind: 'sg', dir: 'in', instance: 'db' });
    expect(goodCount(s.cfg)).toBe(5);
    expect(traceFlow(s.cfg, flowById('app-db')).hops.find((h) => h.verdict === 'drop')?.title).toBe('db-sg inbound');
    const done = addRule(editDraft(editDraft(s, { from: '5432' }), { peer: 'app-sg' }));
    expect(done.note).toMatch(/^Added: tcp port 5432 app-sg\.$/);
    expect(goodCount(done.cfg)).toBe(6);
    expect(lesson.tryThis[2]).toContain('5 of 6 flows are as intended');
    expect(lesson.tryThis[2]).toContain('it reads 6 of 6');
  });

  it('try-this 4: the ACL chip drops app to db on the reply; the written rule fixes it and nothing else is needed', () => {
    let s = loadPreset(initialRules(), 'acl-replies');
    const first = traceFlow(s.cfg, flowById('app-db'));
    expect(first.hops.find((h) => h.verdict === 'drop')?.title).toBe('network ACL of isolated, outbound, the reply');
    s = pickList(s, { kind: 'nacl', dir: 'out', subnet: 'isolated' });
    s = editDraft(s, { num: '110', from: '1024', to: '65535', peer: '10.0.2.0/24' });
    s = addRule(s);
    expect(s.note).toMatch(/^Added: rule 110 allows tcp ports 1024-65535 10\.0\.2\.0\/24\.$/);
    expect(traceFlow(s.cfg, flowById('app-db')).delivered).toBe(true);
    expect(goodCount(s.cfg)).toBe(6);
    expect(lesson.tryThis[3]).toContain('drops at network ACL of isolated, outbound, the reply');
    expect(lesson.tryThis[3]).toContain('"fill ephemeral ports 1024-65535"');
  });

  it('try-this 5: three rows give 753 usable; the /25 row overlaps row 1 and usable falls to 502; the VPC ranges open equal and overlap', () => {
    const p = initialPlanner();
    expect(carve(DEFAULT_VPC, p.rows).usable).toBe(753);
    expect(usableAddresses(24) * 3).toBe(753);
    const edited = carve(DEFAULT_VPC, setRowText(p, 1, '10.0.1.128/25').rows);
    expect(edited.usable).toBe(502);
    expect(p.vpcA).toBe(p.vpcB);
    expect(lesson.tryThis[4]).toContain('753 usable addresses (251 each)');
    expect(lesson.tryThis[4]).toContain('usable falls to 502');
    expect(lesson.tryThis[4]).toContain('"B = 10.1.0.0/16"');
  });
});

describe('captions are clean and true for every design and flow', () => {
  it('one frame per hop plus a start and a summary, shown rising by at most one, ending on every hop', () => {
    for (const p of PRESETS) {
      const cfg = presetConfig(p.id);
      for (const flow of FLOWS) {
        const trace = traceFlow(cfg, flow);
        const frames = traceFrames(cfg, flow, trace);
        expect(frames).toHaveLength(trace.hops.length + 2);
        expect(frames[0].shown).toBe(0);
        frames.forEach((f, i) => {
          clean(f.say);
          if (i > 0) expect(f.shown - frames[i - 1].shown).toBeLessThanOrEqual(1);
        });
        expect(frames[frames.length - 1].shown).toBe(trace.hops.length);
        const summary = clean(summaryCaption(flow, trace));
        expect(summary.startsWith(trace.delivered ? 'Delivered' : 'Dropped at')).toBe(true);
        expect(summary.includes('as intended')).toBe(true);
        expect(summary.includes('not as intended')).toBe(!asIntended(flow, trace));
        const drop = trace.hops.find((h) => h.verdict === 'drop');
        if (drop) expect(summary).toContain(drop.title);
      }
    }
  });

  it('the rules caption counts the flows that are not as intended from the traces themselves', () => {
    for (const p of PRESETS) {
      const cfg = presetConfig(p.id);
      const bad = FLOWS.length - goodCount(cfg);
      const t = clean(rulesIntro(cfg));
      if (bad === 0) expect(t).toContain('All 6 flows do what the design wants');
      else expect(t).toContain(`${bad} flow${bad === 1 ? '' : 's'} ${bad === 1 ? 'is' : 'are'} not as intended`);
    }
  });

  it('the carve caption states the counted subnets and usable total from the carve', () => {
    const t = clean(carveCaption(carve(DEFAULT_VPC, initialPlanner().rows)));
    expect(t).toContain('3 subnets counted');
    expect(t).toContain('753 usable addresses');
    expect(t).toContain('the largest free block being 10.0.128.0/17');
    const bad = clean(carveCaption(carve(DEFAULT_VPC, setRowText(initialPlanner(), 1, '10.0.1.128/25').rows)));
    expect(bad).toContain('2 subnets counted');
    expect(bad).toContain('1 row not counted');
  });
});

describe('typed rules: hostile input is refused with the field named and changes nothing', () => {
  const sg: ListRef = { kind: 'sg', dir: 'in', instance: 'db' };
  const nacl: ListRef = { kind: 'nacl', dir: 'in', subnet: 'public' };
  const route: ListRef = { kind: 'route', subnet: 'private' };
  const cfg = presetConfig('three-tier');
  const refused = (ref: ListRef, patch: Partial<typeof EMPTY_DRAFT>) => {
    const r = buildRule(cfg, ref, { ...EMPTY_DRAFT, ...patch });
    expect(r.ok, JSON.stringify(patch)).toBe(false);
    return r.ok ? '' : r.error;
  };

  it('ports: blank, 65536, negative, text, decimals and a reversed range', () => {
    expect(refused(sg, { peer: 'app-sg' })).toMatch(/^Port from/);
    expect(refused(sg, { from: '65536', peer: 'app-sg' })).toMatch(/^Port from: the highest port is 65535/);
    expect(refused(sg, { from: '-1', peer: 'app-sg' })).toMatch(/^Port from/);
    expect(refused(sg, { from: 'ssh', peer: 'app-sg' })).toMatch(/^Port from: a whole number/);
    expect(refused(sg, { from: '5.5', peer: 'app-sg' })).toMatch(/^Port from/);
    expect(refused(sg, { from: '5432', to: '99999', peer: 'app-sg' })).toMatch(/^Port to/);
    expect(refused(sg, { from: '6000', to: '5000', peer: 'app-sg' })).toMatch(/below port from/);
  });

  it('sources: a /33, 10.0.0.256, host bits, an unknown group and 4000 characters of text', () => {
    expect(refused(sg, { from: '1', peer: '10.0.0.0/33' })).toMatch(/^Source \(a CIDR or a group name\): .*\/33/);
    expect(refused(sg, { from: '1', peer: '10.0.0.256/24' })).toMatch(/256/);
    expect(refused(sg, { from: '1', peer: '10.0.0.7/24' })).toMatch(/host bits set; the block starts at 10\.0\.0\.0/);
    expect(refused(sg, { from: '1', peer: 'cache-sg' })).toMatch(/there is no group called cache-sg/);
    expect(refused(sg, { from: '1', peer: '<img src=x>' }).length).toBeLessThan(300);
    expect(refused(sg, { from: '1', peer: 'a'.repeat(4000) }).length).toBeLessThan(300);
  });

  it('a group name is only a source for a security group, not for an ACL or a route', () => {
    expect(refused(nacl, { num: '150', from: '1', peer: 'app-sg' })).toMatch(/^Source/);
    expect(refused(route, { dest: 'app-sg' })).toMatch(/^Destination/);
  });

  it('ACL rule numbers: 0, 32767, text and a number already used', () => {
    expect(refused(nacl, { num: '0', from: '1', peer: '0.0.0.0/0' })).toMatch(/^Rule number: numbers start at 1/);
    expect(refused(nacl, { num: '32767', from: '1', peer: '0.0.0.0/0' })).toMatch(/^Rule number: the highest is 32766/);
    expect(refused(nacl, { num: 'x', from: '1', peer: '0.0.0.0/0' })).toMatch(/^Rule number/);
    expect(refused(nacl, { num: '100', from: '1', peer: '0.0.0.0/0' })).toMatch(/100 is already used/);
  });

  it('routes: a destination inside the VPC range, a duplicate and host bits are refused', () => {
    expect(refused(route, { dest: '10.0.3.0/24' })).toMatch(/inside the VPC range 10\.0\.0\.0\/16/);
    expect(refused(route, { dest: '10.0.0.0/16' })).toMatch(/inside the VPC range/);
    expect(refused(route, { dest: '0.0.0.0/0' })).toMatch(/already has a route for 0\.0\.0\.0\/0/);
    expect(refused(route, { dest: '203.0.113.9/24' })).toMatch(/host bits set/);
    const ok = buildRule(cfg, route, { ...EMPTY_DRAFT, dest: '10.0.0.0/8', target: 'nat' });
    expect(ok.ok).toBe(true);
  });

  it('a refused entry leaves the config exactly as it was, with the reason in the note', () => {
    const s = initialRules();
    const next = addRule(editDraft(s, { from: '99999', peer: 'app-sg' }));
    expect(next.cfg).toBe(s.cfg);
    expect(next.note).toMatch(/^Port from/);
    expect(next.draft.from).toBe('99999');
  });

  it('a list of 20 refuses the 21st, with the limit named', () => {
    let s = initialRules();
    for (let i = 0; i < MAX_RULES; i++) s = addRule(editDraft(editDraft(s, { from: String(1000 + i) }), { peer: '10.0.0.0/16' }));
    expect(rulesOf(s.cfg, s.list)).toHaveLength(MAX_RULES);
    const over = addRule(editDraft(editDraft(s, { from: '4000' }), { peer: '10.0.0.0/16' }));
    expect(rulesOf(over.cfg, over.list)).toHaveLength(MAX_RULES);
    expect(over.note).toContain(`already has ${MAX_RULES} entries`);
  });

  it('hidden controls feed nothing: with "all traffic" the port fields are ignored, and a route ignores protocol and ports', () => {
    const a = buildRule(cfg, sg, { ...EMPTY_DRAFT, proto: 'all', from: 'garbage', to: '-5', peer: 'app-sg' });
    expect(a).toMatchObject({ ok: true });
    expect((a as { value: SgRule }).value.ports).toEqual({ lo: 0, hi: 65535 });
    const r = buildRule(cfg, route, { ...EMPTY_DRAFT, dest: '192.0.2.0/24', proto: 'all', from: 'garbage', num: 'zzz', peer: 'zzz' });
    expect(r).toMatchObject({ ok: true });
    expect((r as { value: RouteEntry }).value).toMatchObject({ prefix: 24, target: 'igw' });
  });

  it('removing a rule changes only that list, and an index out of range changes nothing', () => {
    const s = initialRules();
    const withOne = addRule(editDraft(editDraft(s, { from: '22' }), { peer: '10.0.0.0/16' }));
    expect(rulesOf(removeRule(withOne, 1).cfg, withOne.list)).toHaveLength(1);
    expect(removeRule(withOne, 7)).toBe(withOne);
    expect(removeRule(withOne, 1).cfg.sgIn.web).toBe(withOne.cfg.sgIn.web);
  });

  it('an ACL rule added through the editor is evaluated by number, not by the order it was added', () => {
    let s = pickList(loadPreset(initialRules(), 'three-tier'), { kind: 'nacl', dir: 'in', subnet: 'private' });
    s = addRule(editDraft(s, { num: '50', action: 'deny', from: '8080', peer: '0.0.0.0/0' }));
    expect(traceFlow(s.cfg, flowById('web-app')).drop).toBe('nacl-in');
    const s2 = addRule(editDraft(pickList(loadPreset(initialRules(), 'three-tier'), { kind: 'nacl', dir: 'in', subnet: 'private' }), { num: '500', action: 'deny', from: '8080', peer: '0.0.0.0/0' }));
    expect(traceFlow(s2.cfg, flowById('web-app')).delivered).toBe(true);
    const rule: NaclRule = { num: 1, action: 'allow', proto: 'all', ports: { lo: 0, hi: 65535 }, cidr: ANYWHERE };
    expect(withRules(s.cfg, { kind: 'nacl', dir: 'in', subnet: 'private' }, [rule]).naclIn.private).toEqual([rule]);
  });
});

describe('the scenes open in their own state', () => {
  it('each scene has its own pure opening state, and they do not share anything', () => {
    expect(initialTracer()).toEqual({ preset: 'three-tier', flow: 'user-web' });
    expect(initialRules().preset).toBe('app-db');
    expect(initialRules().flow).toBe('app-db');
    expect(initialRules().note).toBeNull();
    expect(initialPlanner().rows).toHaveLength(3);
    expect(initialPlanner().prefix).toBe(24);
    expect(initialRules().cfg).not.toBe(initialRules().cfg);
    const a = initialPlanner();
    a.rows[0].text = 'changed';
    expect(initialPlanner().rows[0].text).toBe('10.0.1.0/24');
  });

  it('the planner slider changes only its own readout: the carve does not take the size at all', () => {
    const p = initialPlanner();
    expect(carve(DEFAULT_VPC, p.rows)).toEqual(carve(DEFAULT_VPC, { ...p, prefix: 28 }.rows));
  });

  it('the opening trace of the default tracer uses the lookup the lesson describes (a /0 only when nothing is more specific)', () => {
    const cfg = presetConfig('three-tier');
    expect(lookup(cfg, 'private', ipv4('192.0.2.80'))?.target).toBe('nat');
    expect(lookup(cfg, 'private', ipv4('10.0.3.30'))?.target).toBe('local');
  });
});

describe('quiz facts come from the model', () => {
  it('the /28 answer is the model\'s usable count', () => {
    expect(lesson.quiz[4].options[lesson.quiz[4].answer]).toBe(String(usableAddresses(28)));
  });

  it('the longest-prefix question: the /24 route to the NAT gateway wins over the default route to the gateway', () => {
    const cfg = withRules(presetConfig('three-tier'), { kind: 'route', subnet: 'public' }, [
      { net: 0, prefix: 0, target: 'igw' },
      { net: ipv4('203.0.113.0'), prefix: 24, target: 'nat' },
    ]);
    expect(lookup(cfg, 'public', ipv4('203.0.113.50'))?.target).toBe('nat');
    const reversed = withRules(cfg, { kind: 'route', subnet: 'public' }, [...rulesOf(cfg, { kind: 'route', subnet: 'public' })].reverse() as RouteEntry[]);
    expect(lookup(reversed, 'public', ipv4('203.0.113.50'))?.target).toBe('nat');
  });

  it('the "private subnet" question: the app reaches the internet through the NAT gateway and nothing outside reaches it', () => {
    const cfg = presetConfig('three-tier');
    expect(traceFlow(cfg, flowById('app-updates')).delivered).toBe(true);
    const inbound = { id: 'x', label: 'x', from: 'internet' as const, to: 'app' as const, port: 8080, intended: 'blocked' as const };
    expect(traceFlow(cfg, inbound).drop).toBe('no-public-ip');
  });

  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
