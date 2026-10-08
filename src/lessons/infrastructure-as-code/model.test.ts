import { describe, expect, it } from 'vitest';
import { mulberry32, pick, type Rnd } from '../../core/random';
import {
  apply, applySteps, consoleEdit, converge, emptyWorld, isNoop, loseState, plan, planCounts, refresh, topoOrder, type Action, type Plan, type World,
} from './model';
import { formatConfig, isRef, parseConfig, type Config, type ResourceDecl } from './parse';
import { BASELINE, baselineWorld, SCENARIOS, scenarioById, type ScenarioId } from './scenarios';
import { forcesNew as forcesNewKey, SCHEMA } from './schema';

function mustParse(text: string): Config {
  const r = parseConfig(text);
  if (!r.ok) throw new Error(`line ${r.line}: ${r.message}`);
  return r.config;
}
const baseConfig = mustParse(BASELINE);

/** An independent plan: works in addresses, not ids, and finds replacements by iterating to a fixed point. */
function referencePlan(config: Config, world: World): Record<string, { action: Action; keys: string[] }> {
  const live: Record<string, Record<string, string | number | boolean>> = {};
  const idToAddress: Record<string, string> = {};
  for (const [address, entry] of Object.entries(world.state)) {
    const real = world.cloud.objects[entry.id];
    if (!real) continue;
    live[address] = real.attrs;
    idToAddress[entry.id] = address;
  }
  const declared = new Set(config.map((d) => d.address));
  const out: Record<string, { action: Action; keys: string[] }> = {};
  const recreated = new Set(config.filter((d) => !(d.address in live)).map((d) => d.address));
  const changedKeys = (d: ResourceDecl): string[] => {
    const cur = live[d.address];
    const keys = new Set([...Object.keys(d.attrs), ...Object.keys(cur)]);
    return [...keys].filter((k) => {
      const want = d.attrs[k];
      if (isRef(want)) return recreated.has(want.ref) || idToAddress[String(cur[k])] !== want.ref;
      return want !== cur[k];
    });
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of config) {
      if (!(d.address in live) || recreated.has(d.address)) continue;
      if (changedKeys(d).some((k) => forcesNewKey(d.type, k))) {
        recreated.add(d.address);
        changed = true;
      }
    }
  }
  for (const d of config) {
    if (!(d.address in live)) {
      out[d.address] = { action: 'create', keys: Object.keys(d.attrs).sort() };
      continue;
    }
    const keys = changedKeys(d).sort();
    out[d.address] = { action: recreated.has(d.address) ? 'replace' : keys.length ? 'update' : 'noop', keys };
  }
  for (const address of Object.keys(live)) if (!declared.has(address)) out[address] = { action: 'destroy', keys: [] };
  return out;
}

const summarise = (p: Plan) => Object.fromEntries(p.changes.map((c) => [c.address, { action: c.action, keys: c.attrs.map((a) => a.key).sort() }]));

/** Every constraint an apply order has to satisfy, checked from the steps alone. */
function expectValidOrder(config: Config, before: World, p: Plan) {
  const steps = applySteps(config, before, p);
  const pos = (address: string, op: string) => steps.findIndex((s) => s.address === address && s.op === op);
  const { refreshed } = refresh(before);
  for (const d of config) {
    for (const v of Object.values(d.attrs)) {
      if (!isRef(v)) continue;
      const here = Math.max(pos(d.address, 'create'), pos(d.address, 'update'));
      const there = Math.max(pos(v.ref, 'create'), pos(v.ref, 'update'));
      if (here >= 0 && there >= 0) expect(there).toBeLessThan(here);
    }
  }
  const destroyed = steps.filter((s) => s.op === 'destroy').map((s) => s.address);
  for (const y of destroyed) for (const x of refreshed[y].deps) if (destroyed.includes(x)) expect(pos(y, 'destroy')).toBeLessThan(pos(x, 'destroy'));
  for (const c of p.changes.filter((ch) => ch.action === 'replace')) expect(pos(c.address, 'destroy')).toBeLessThan(pos(c.address, 'create'));
  const lastDestroy = steps.map((s) => s.op).lastIndexOf('destroy');
  const firstBuild = steps.findIndex((s) => s.op !== 'destroy');
  if (lastDestroy >= 0 && firstBuild >= 0) expect(lastDestroy).toBeLessThan(firstBuild);
  // Every planned action is executed exactly once.
  for (const c of p.changes) {
    const ops = steps.filter((s) => s.address === c.address).map((s) => s.op);
    const want = { create: ['create'], update: ['update'], replace: ['destroy', 'create'], destroy: ['destroy'], noop: [] }[c.action];
    expect(ops).toEqual(want);
  }
}

// ---------- random configs ----------

const NETWORK_CIDRS = ['10.0.0.0/16', '10.1.0.0/16', '172.16.0.0/12'];
const IMAGES = ['debian-12', 'debian-13', 'ubuntu-24'];
const SIZES = ['small', 'medium', 'large'];

function randomConfig(rnd: Rnd): ResourceDecl[] {
  let n = 0;
  const decls: ResourceDecl[] = [];
  const add = (type: string, attrs: ResourceDecl['attrs']) => {
    const label = `${type === 'dns_record' ? 'dns' : type}${n}`;
    decls.push({ address: `${type}.${label}`, type, label, attrs: { name: `${label}-nm`, ...attrs }, line: 0 });
    n++;
  };
  const networks = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < networks; i++) add('network', { cidr: pick(NETWORK_CIDRS, rnd) });
  const nets = decls.map((d) => d.address);
  const vms = Math.floor(rnd() * 5);
  for (let i = 0; i < vms; i++) add('vm', { network: { ref: pick(nets, rnd) }, image: pick(IMAGES, rnd), size: pick(SIZES, rnd), ...randomTags(rnd) });
  const vmAddrs = decls.filter((d) => d.type === 'vm').map((d) => d.address);
  for (let i = 0; i < Math.floor(rnd() * 3); i++) add('bucket', { versioning: rnd() < 0.5 });
  if (vmAddrs.length) for (let i = 0; i < Math.floor(rnd() * 4); i++) add('dns_record', { target: { ref: pick(vmAddrs, rnd) }, ttl: 60 * (1 + Math.floor(rnd() * 5)) });
  return decls;
}

function randomTags(rnd: Rnd): Record<string, string> {
  const tags: Record<string, string> = {};
  if (rnd() < 0.6) tags['tags.env'] = pick(['prod', 'stage'], rnd);
  if (rnd() < 0.4) tags['tags.team'] = pick(['web', 'api'], rnd);
  return tags;
}

/** Remove a resource and everything that points at it, so the config stays valid. */
function removeWithDependents(decls: ResourceDecl[], address: string): ResourceDecl[] {
  const doomed = new Set([address]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of decls) {
      if (doomed.has(d.address)) continue;
      if (Object.values(d.attrs).some((v) => isRef(v) && doomed.has(v.ref))) {
        doomed.add(d.address);
        grew = true;
      }
    }
  }
  return decls.filter((d) => !doomed.has(d.address));
}

let freshCounter = 100;
function mutate(decls: ResourceDecl[], rnd: Rnd): ResourceDecl[] {
  let out = decls.map((d) => ({ ...d, attrs: { ...d.attrs } }));
  const by = (type: string) => out.filter((d) => d.type === type);
  for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
    const choice = Math.floor(rnd() * 11);
    const vms = by('vm');
    const nets = by('network');
    if (choice === 0 && vms.length) pick(vms, rnd).attrs.image = pick(IMAGES, rnd);
    else if (choice === 1 && vms.length) pick(vms, rnd).attrs.size = pick(SIZES, rnd);
    else if (choice === 2 && vms.length) {
      const vm = pick(vms, rnd);
      for (const key of Object.keys(vm.attrs)) if (key.startsWith('tags.')) delete vm.attrs[key];
      Object.assign(vm.attrs, randomTags(rnd));
    } else if (choice === 3 && vms.length) pick(vms, rnd).attrs.name = `renamed-${freshCounter++}`;
    else if (choice === 4) pick(nets, rnd).attrs.cidr = pick(NETWORK_CIDRS, rnd);
    else if (choice === 5 && vms.length && nets.length > 1) pick(vms, rnd).attrs.network = { ref: pick(nets, rnd).address };
    else if (choice === 6 && by('dns_record').length && vms.length) pick(by('dns_record'), rnd).attrs.target = { ref: pick(vms, rnd).address };
    else if (choice === 7 && out.length > 1) out = removeWithDependents(out, pick(out, rnd).address);
    else if (choice === 8) {
      const label = `bucket${freshCounter++}`;
      out.push({ address: `bucket.${label}`, type: 'bucket', label, attrs: { name: `${label}-nm`, versioning: false }, line: 0 });
    } else if (choice === 9 && by('bucket').length) {
      const b = pick(by('bucket'), rnd);
      b.attrs.versioning = !b.attrs.versioning;
    } else if (choice === 10 && by('dns_record').length) pick(by('dns_record'), rnd).attrs.ttl = 60 * (1 + Math.floor(rnd() * 9));
  }
  return out;
}

/** Re-read a config through the text parser, as the lesson's editor would. */
const viaText = (decls: ResourceDecl[]) => mustParse(formatConfig(decls));

function perturb(world: World, rnd: Rnd): { world: World; stateLost: boolean } {
  let w = world;
  let stateLost = false;
  const addresses = Object.keys(w.state);
  if (addresses.length && rnd() < 0.4) {
    const a = pick(addresses, rnd);
    const attrs = w.state[a].attrs;
    const key = Object.keys(attrs).find((k) => k === 'size' || k === 'versioning' || k === 'ttl' || k === 'tags.env');
    if (key) w = consoleEdit(w, a, key, typeof attrs[key] === 'boolean' ? !attrs[key] : typeof attrs[key] === 'number' ? Number(attrs[key]) + 1 : 'drifted');
  }
  if (addresses.length && rnd() < 0.25) {
    const a = pick(addresses, rnd);
    w = structuredClone(w);
    delete w.cloud.objects[w.state[a].id];
  }
  if (addresses.length && rnd() < 0.15) {
    w = loseState(w);
    stateLost = true;
  }
  return { world: w, stateLost };
}

describe('parseConfig', () => {
  it('reads the baseline into five resources with their references', () => {
    expect(baseConfig.map((d) => d.address)).toEqual(['network.main', 'vm.web1', 'vm.web2', 'bucket.assets', 'dns_record.www']);
    expect(baseConfig[1].attrs).toEqual({ name: 'web-1', network: { ref: 'network.main' }, image: 'debian-12', size: 'small', 'tags.env': 'prod' });
    expect(baseConfig[4].attrs.ttl).toBe(300);
    expect(baseConfig[3].attrs.versioning).toBe(false);
  });

  it('round-trips random configs through text', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const decls = randomConfig(mulberry32(seed));
      const parsed = viaText(decls);
      expect(parsed.map(({ line: _l, ...d }) => d)).toEqual(decls.map(({ line: _l, ...d }) => d));
    }
  });

  const bad: [string, string, number, string][] = [
    ['unknown top-level text', 'hello world', 1, 'only resource blocks'],
    ['unknown type', 'resource "disk" "d" {\n}', 1, 'unknown resource type "disk"'],
    ['bad label', 'resource "vm" "Web 1" {\n}', 1, 'label'],
    ['unknown attribute', 'resource "bucket" "b" {\n  name = "x"\n  colour = "red"\n  versioning = true\n}', 3, 'no attribute "colour"'],
    ['missing attribute', 'resource "bucket" "b" {\n  name = "x"\n}', 1, 'missing the required attribute "versioning"'],
    ['wrong value kind', 'resource "bucket" "b" {\n  name = 5\n  versioning = true\n}', 2, 'name must be a string'],
    ['number for bool', 'resource "bucket" "b" {\n  name = "x"\n  versioning = 1\n}', 3, 'true or false'],
    ['unclosed block', 'resource "bucket" "b" {\n  name = "x"\n  versioning = true\n', 1, 'never closed'],
    ['nested block', 'resource "bucket" "a" {\n resource "bucket" "b" {\n}', 2, 'cannot be nested'],
    ['unterminated string', 'resource "bucket" "b" {\n  name = "oops\n  versioning = true\n}', 2, 'closing quote'],
    ['undeclared reference', 'resource "dns_record" "d" {\n  name = "x"\n  target = vm.ghost\n  ttl = 1\n}', 1, 'vm.ghost'],
    ['reference of the wrong type', 'resource "network" "n" {\n  name = "n"\n  cidr = "10.0.0.0/8"\n}\nresource "dns_record" "d" {\n  name = "x"\n  target = network.n\n  ttl = 1\n}', 7, 'point at a vm'],
    ['duplicate', 'resource "bucket" "b" {\n  name = "x"\n  versioning = true\n}\nresource "bucket" "b" {\n}', 5, 'declared twice'],
    ['23-digit number', 'resource "dns_record" "d" {\n  name = "x"\n  target = vm.v\n  ttl = 12345678901234567890123\n}', 4, 'up to 9 digits'],
    ['exponent', 'resource "dns_record" "d" {\n  name = "x"\n  target = vm.v\n  ttl = 1e400\n}', 4, 'whole'],
    ['negative number', 'resource "dns_record" "d" {\n  name = "x"\n  target = vm.v\n  ttl = -1\n}', 4, 'non-negative'],
    ['markup', 'resource "bucket" "b" {\n  <b>name</b> = "x"\n}', 2, 'expected key = value'],
    ['emoji outside a string', 'resource "bucket" "b" {\n  name = 🙂\n  versioning = true\n}', 2, "can't read the value"],
    ['tag with a gap', 'resource "vm" "v" {\n  tags = { a = "1", , b = "2" }\n}', 2, 'key = "value"'],
    ['tag map not closed', 'resource "vm" "v" {\n  tags = { a = "1"\n}', 2, 'must close with }'],
    ['tags as a string', 'resource "vm" "v" {\n  tags = "x"\n}', 2, 'tag map'],
    ['attribute twice', 'resource "bucket" "b" {\n  name = "x"\n  name = "y"\n  versioning = true\n}', 3, 'set twice'],
    ['attribute outside a block', '  name = "x"', 1, 'only resource blocks'],
    ['string too long', `resource "bucket" "b" {\n  name = "${'x'.repeat(41)}"\n  versioning = true\n}`, 2, 'at most 40'],
  ];
  it.each(bad)('refuses %s with its line number', (_name, text, line, fragment) => {
    const r = parseConfig(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(line);
      expect(r.message).toContain(fragment);
    }
  });

  it('refuses an over-long text and too many resources', () => {
    expect(parseConfig('#'.repeat(4001)).ok).toBe(false);
    const many = Array.from({ length: 13 }, (_, i) => `resource "bucket" "b${i}" {\n  name = "n${i}"\n  versioning = true\n}`).join('\n');
    const r = parseConfig(many);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.line).toBe(49);
  });

  it('treats empty and whitespace-only text as a valid config that declares nothing', () => {
    for (const text of ['', '   \n\t\n', '# only a comment']) {
      const r = parseConfig(text);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.config).toEqual([]);
    }
  });

  it('ignores trailing comments but not a # inside a string', () => {
    const r = parseConfig('resource "bucket" "b" { # open\n  name = "a#b" # note\n  versioning = true\n}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config[0].attrs.name).toBe('a#b');
  });
});

describe('topoOrder', () => {
  it('puts every node after its dependencies, over random DAGs', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = mulberry32(seed);
      const n = 2 + Math.floor(rnd() * 8);
      const names = Array.from({ length: n }, (_, i) => `vm.n${i}`);
      const deps = new Map(names.map((x, i) => [x, names.filter((_, j) => j < i && rnd() < 0.4)]));
      const order = topoOrder(names, (a) => deps.get(a)!);
      expect([...order].sort()).toEqual([...names].sort());
      order.forEach((a, i) => deps.get(a)!.forEach((d) => expect(order.indexOf(d)).toBeLessThan(i)));
    }
  });
});

describe('plan: every preset', () => {
  const planOf = (id: ScenarioId) => {
    const s = scenarioById(id);
    const world = s.world();
    return { config: mustParse(s.text), world, p: plan(mustParse(s.text), world) };
  };

  it('matches the reference diff, and applying leaves an empty plan (except where state is lost)', () => {
    for (const s of SCENARIOS) {
      const { config, world, p } = planOf(s.id);
      expect(summarise(p)).toEqual(referencePlan(config, world));
      expectValidOrder(config, world, p);
      const run = apply(config, world, p);
      if (s.id !== 'lost') {
        expect(run.results.every((r) => r.status === 'ok')).toBe(true);
        expect(isNoop(plan(config, run.final))).toBe(true);
      }
    }
  });

  it('fresh start: five creates, applied network first, then VMs, bucket and DNS record', () => {
    const { config, world, p } = planOf('fresh');
    expect(p.changes.map((c) => c.action)).toEqual(['create', 'create', 'create', 'create', 'create']);
    expect(planCounts(p)).toEqual({ add: 5, change: 0, destroy: 0 });
    const steps = applySteps(config, world, p).map((s) => s.address);
    expect(steps).toEqual(['network.main', 'vm.web1', 'vm.web2', 'bucket.assets', 'dns_record.www']);
    const run = apply(config, world, p);
    expect(Object.keys(run.final.cloud.objects)).toHaveLength(5);
    expect(run.snapshots.map((s) => Object.keys(s.state).length)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rename: only web2 is replaced, and the cause is its name', () => {
    const { p } = planOf('rename');
    const changed = p.changes.filter((c) => c.action !== 'noop');
    expect(changed.map((c) => [c.address, c.action])).toEqual([['vm.web2', 'replace']]);
    expect(changed[0].attrs).toMatchObject([{ key: 'name', from: 'web-2', to: 'api-1', forcesNew: true, cause: 'config' }]);
    expect(planCounts(p)).toEqual({ add: 1, change: 0, destroy: 1 });
  });

  it('tag: web1 is updated in place and nothing else changes', () => {
    const { p } = planOf('tag');
    const changed = p.changes.filter((c) => c.action !== 'noop');
    expect(changed.map((c) => [c.address, c.action])).toEqual([['vm.web1', 'update']]);
    expect(changed[0].attrs).toMatchObject([{ key: 'tags.env', from: 'prod', to: 'staging' }]);
  });

  it('delete: the bucket is destroyed and nothing else changes', () => {
    const { p } = planOf('delete');
    expect(p.changes.filter((c) => c.action !== 'noop').map((c) => [c.address, c.action])).toEqual([['bucket.assets', 'destroy']]);
  });

  it('new CIDR: the network and both VMs are replaced, the DNS record is updated in place, in a safe order', () => {
    const { config, world, p } = planOf('cidr');
    const act = Object.fromEntries(p.changes.map((c) => [c.address, c.action]));
    expect(act).toEqual({ 'network.main': 'replace', 'vm.web1': 'replace', 'vm.web2': 'replace', 'bucket.assets': 'noop', 'dns_record.www': 'update' });
    const web1 = p.changes.find((c) => c.address === 'vm.web1')!;
    expect(web1.attrs).toMatchObject([{ key: 'network', cause: 'dependency', forcesNew: true }]);
    expect(applySteps(config, world, p).map((s) => `${s.op} ${s.address}`)).toEqual([
      'destroy vm.web2', 'destroy vm.web1', 'destroy network.main', 'create network.main', 'create vm.web1', 'create vm.web2', 'update dns_record.www',
    ]);
    const run = apply(config, world, p);
    expect(run.final.cloud.objects[run.final.state['dns_record.www'].id].attrs.target).toBe(run.final.state['vm.web1'].id);
  });

  it('drift: the plan reverts exactly the drifted attribute, and applying restores the cloud', () => {
    const { config, world, p } = planOf('drift');
    expect(p.drift).toEqual([{ address: 'vm.web1', key: 'size', recorded: 'small', actual: 'large' }]);
    const changed = p.changes.filter((c) => c.action !== 'noop');
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ address: 'vm.web1', action: 'update', attrs: [{ key: 'size', from: 'large', to: 'small' }] });
    const run = apply(config, world, p);
    expect(run.final.cloud.objects[world.state['vm.web1'].id].attrs.size).toBe('small');
    expect(run.final.cloud.objects).toEqual(baselineWorld().cloud.objects);
  });

  it('lost state: the plan creates all five, and applying collides with what already exists', () => {
    const { config, world, p } = planOf('lost');
    expect(p.changes.map((c) => c.action)).toEqual(['create', 'create', 'create', 'create', 'create']);
    const run = apply(config, world, p);
    const status = Object.fromEntries(run.results.map((r) => [r.step.address, r.status]));
    expect(status).toEqual({ 'network.main': 'failed', 'vm.web1': 'skipped', 'vm.web2': 'skipped', 'bucket.assets': 'failed', 'dns_record.www': 'skipped' });
    expect(run.results[0].message).toContain('already exists');
    expect(run.final.cloud.objects).toEqual(world.cloud.objects);
    expect(run.final.state).toEqual({});
  });

  it('a gone resource is reported and re-created', () => {
    const w = structuredClone(baselineWorld());
    delete w.cloud.objects[w.state['bucket.assets'].id];
    const p = plan(baseConfig, w);
    expect(p.gone).toEqual(['bucket.assets']);
    expect(p.changes.find((c) => c.address === 'bucket.assets')!.action).toBe('create');
  });

  it('an empty config destroys everything, dependents first', () => {
    const w = baselineWorld();
    const p = plan([], w);
    expect(p.changes.every((c) => c.action === 'destroy')).toBe(true);
    const order = applySteps([], w, p).map((s) => s.address);
    expect(order.indexOf('vm.web1')).toBeLessThan(order.indexOf('network.main'));
    expect(order.indexOf('dns_record.www')).toBeLessThan(order.indexOf('vm.web1'));
    expect(Object.keys(apply([], w, p).final.cloud.objects)).toHaveLength(0);
  });
});

describe('plan: 200 seeded random mutations', () => {
  it('matches the reference diff, applies in a valid order, and applying leaves an empty plan', () => {
    let replaced = 0;
    let updated = 0;
    let destroyed = 0;
    let drifted = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed * 7919);
      const a = viaText(randomConfig(rnd));
      const { world, stateLost } = perturb(converge(a), rnd);
      const b = viaText(mutate(a, rnd));
      const p = plan(b, world);
      expect(summarise(p)).toEqual(referencePlan(b, world));
      expectValidOrder(b, world, p);
      replaced += p.changes.filter((c) => c.action === 'replace').length;
      updated += p.changes.filter((c) => c.action === 'update').length;
      destroyed += p.changes.filter((c) => c.action === 'destroy').length;
      drifted += p.drift.length;
      if (stateLost) continue;
      const run = apply(b, world, p);
      expect(run.results.every((r) => r.status === 'ok')).toBe(true);
      expect(isNoop(plan(b, run.final))).toBe(true);
      // The cloud now holds exactly the config, attribute for attribute.
      expect(Object.keys(run.final.cloud.objects)).toHaveLength(b.length);
      for (const d of b) {
        const entry = run.final.state[d.address];
        const obj = run.final.cloud.objects[entry.id];
        for (const [k, v] of Object.entries(d.attrs)) expect(obj.attrs[k]).toBe(isRef(v) ? run.final.state[v.ref].id : v);
        expect(Object.keys(obj.attrs).sort()).toEqual(Object.keys(d.attrs).sort());
      }
    }
    // The random walk really exercised every kind of change.
    expect(replaced).toBeGreaterThan(20);
    expect(updated).toBeGreaterThan(20);
    expect(destroyed).toBeGreaterThan(20);
    expect(drifted).toBeGreaterThan(10);
  });
});

describe('schema', () => {
  it('every reference attribute points at a known type, and every type has a name', () => {
    for (const spec of Object.values(SCHEMA)) {
      expect(spec.attrs.name.kind).toBe('string');
      for (const a of Object.values(spec.attrs)) if (a.kind === 'ref') expect(SCHEMA[a.refType!]).toBeDefined();
    }
  });

  it('a fresh world is empty', () => {
    expect(emptyWorld().state).toEqual({});
    expect(plan([], emptyWorld()).changes).toEqual([]);
  });
});
