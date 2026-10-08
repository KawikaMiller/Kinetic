import { describe, expect, it } from 'vitest';
import { statusWord } from './labels';
import { LICENCE_FACTS, LICENCES, MODELS, PRODUCT_LICENCES, RULES, type LicenceId, type Model, type ProductLicence, type Setup } from './licences';
import {
  ALLOW_LIST, compatibility, DEFAULT_PRESET, depthOf, MAX_DEPS, MAX_DEPTH, obligationRows, PRESETS, resolveDep, resolveTree, underSeparate, compatNote, ROOT, type Dep, scan, spdxCoverage,
  withAdded, withFlag, withLicence, withoutDep, type Compat, type DepStatus,
} from './resolver';

// Valid SPDX license list identifiers, typed by hand (https://spdx.org/licenses/). The bare "GPL-3.0",
// "LGPL-2.1" and "AGPL-3.0" are deprecated in favour of the -only / -or-later forms.
const SPDX_VALID = new Set(['MIT', 'BSD-3-Clause', 'Apache-2.0', 'MPL-2.0', 'LGPL-2.1-only', 'GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only']);

const dep = (id: string, licence: LicenceId, parent: string = ROOT, flags: Partial<Pick<Dep, 'modified' | 'separate'>> = {}): Dep => ({
  id, name: id, licence, parent, modified: false, separate: false, ...flags,
});

const setup = (model: Model, flags: Partial<Setup> = {}): Setup => ({ model, modified: false, separate: false, ...flags });
const dueIds = (licence: LicenceId, s: Setup) => obligationRows(licence, s).filter((o) => o.state === 'due').map((o) => o.id);

describe('licence facts', () => {
  it('every identifier is a real SPDX id, and "no licence" has none', () => {
    for (const id of LICENCES) {
      const spdx = LICENCE_FACTS[id].spdx;
      if (id === 'none') expect(spdx).toBeNull();
      else expect(SPDX_VALID.has(spdx ?? '')).toBe(true);
    }
  });

  it('every licence has rules, and each rule id is unique within its licence', () => {
    for (const id of LICENCES) {
      const ids = RULES[id].map((r) => r.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('obligations, worked by hand from the licence texts', () => {
  it('MIT: only the notice, and only when copies are distributed', () => {
    expect(dueIds('MIT', setup('distributed'))).toEqual(['notice']);
    expect(dueIds('MIT', setup('library'))).toEqual(['notice']);
    expect(dueIds('MIT', setup('internal'))).toEqual([]);
    expect(dueIds('MIT', setup('saas'))).toEqual([]);
  });

  it('BSD-3-Clause adds the no-endorsement clause', () => {
    expect(dueIds('BSD-3-Clause', setup('distributed'))).toEqual(['notice', 'no-endorse']);
  });

  it('Apache-2.0: notice + NOTICE file; state-changes only if modified; the patent grant is a benefit, never "due"', () => {
    expect(dueIds('Apache-2.0', setup('distributed'))).toEqual(['notice', 'apache-notice']);
    expect(dueIds('Apache-2.0', setup('distributed', { modified: true }))).toEqual(['notice', 'apache-notice', 'state-changes']);
    expect(dueIds('Apache-2.0', setup('internal', { modified: true }))).toEqual([]);
    const patent = obligationRows('Apache-2.0', setup('internal')).find((o) => o.id === 'patent');
    expect(patent?.state).toBe('info');
    expect(patent?.detail).toMatch(/ends for you if you sue/);
  });

  it('MPL-2.0 is file-level: triggered by distribution, not by running a service', () => {
    expect(dueIds('MPL-2.0', setup('distributed'))).toEqual(['notice', 'mpl-files']);
    expect(dueIds('MPL-2.0', setup('saas', { modified: true }))).toEqual([]);
  });

  it('LGPL-2.1: replace-the-library applies when linked into the product, not when it is a separate program', () => {
    expect(dueIds('LGPL-2.1-only', setup('distributed'))).toEqual(['notice', 'lgpl-source', 'relink']);
    expect(dueIds('LGPL-2.1-only', setup('distributed', { separate: true }))).toEqual(['notice', 'lgpl-source']);
    expect(dueIds('LGPL-2.1-only', setup('saas'))).toEqual([]);
  });

  it('GPL: triggered by distribution, not by internal use or by serving users', () => {
    for (const id of ['GPL-2.0-only', 'GPL-3.0-only'] as const) {
      expect(dueIds(id, setup('internal'))).toEqual([]);
      expect(dueIds(id, setup('saas'))).toEqual([]);
      expect(dueIds(id, setup('distributed'))).toEqual(['notice', 'gpl-source', 'gpl-whole']);
      expect(dueIds(id, setup('library'))).toEqual(['notice', 'gpl-source', 'gpl-whole']);
      // A separate program: its own source is owed if you hand it out, but there is no combined work.
      expect(dueIds(id, setup('distributed', { separate: true }))).toEqual(['notice', 'gpl-source']);
    }
  });

  it('AGPL-3.0: the network clause is triggered by a modified (or built-in) version in a service', () => {
    expect(dueIds('AGPL-3.0-only', setup('saas'))).toEqual(['agpl-network']); // built into the service
    expect(dueIds('AGPL-3.0-only', setup('saas', { separate: true }))).toEqual([]); // unmodified separate program
    expect(dueIds('AGPL-3.0-only', setup('saas', { separate: true, modified: true }))).toEqual(['agpl-network']);
    expect(dueIds('AGPL-3.0-only', setup('internal', { modified: true }))).toEqual([]);
    expect(dueIds('AGPL-3.0-only', setup('distributed'))).toEqual(['notice', 'gpl-source', 'gpl-whole']);
  });

  it('no licence: "no permission granted" is due in every setup', () => {
    for (const model of MODELS) {
      for (const separate of [false, true]) {
        for (const modified of [false, true]) {
          expect(dueIds('none', { model, separate, modified })).toEqual(['no-permission']);
        }
      }
    }
  });
});

describe('compatibility: the table, hand-typed from the FSF list and the licences', () => {
  const F: Compat = 'fine';
  const W: Compat = 'whole-copyleft';
  const C: Compat = 'conflict';
  const N: Compat = 'no-permission';
  // Product columns, in this order:
  const PRODUCTS: ProductLicence[] = ['proprietary', 'MIT', 'Apache-2.0', 'MPL-2.0', 'GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only'];
  const TABLE: Record<LicenceId, Compat[]> = {
    MIT: [F, F, F, F, F, F, F],
    'BSD-3-Clause': [F, F, F, F, F, F, F],
    'Apache-2.0': [F, F, F, F, C, F, F],
    'MPL-2.0': [F, F, F, F, F, F, F],
    'LGPL-2.1-only': [F, F, F, F, F, F, F],
    'GPL-2.0-only': [C, W, C, W, F, C, C],
    'GPL-3.0-only': [C, W, W, W, C, F, F],
    'AGPL-3.0-only': [C, W, W, W, C, W, F],
    none: [N, N, N, N, N, N, N],
  };

  it('matches the table for every (licence, product) pair', () => {
    expect([...PRODUCT_LICENCES]).toEqual(PRODUCTS);
    for (const dep of LICENCES) {
      PRODUCTS.forEach((p, i) => expect(compatibility(dep, p), `${dep} in ${p}`).toBe(TABLE[dep][i]));
    }
  });

  it("Apache-2.0 is compatible with GPL-3.0 and not with GPL-2.0-only (FSF's list)", () => {
    expect(compatibility('Apache-2.0', 'GPL-3.0-only')).toBe('fine');
    expect(compatibility('Apache-2.0', 'GPL-2.0-only')).toBe('conflict');
  });

  it('is not symmetric: Apache-2.0 code in a GPL-3.0 product is fine, GPL-3.0 code in an Apache-2.0 product changes the whole', () => {
    expect(compatibility('Apache-2.0', 'GPL-3.0-only')).toBe('fine');
    expect(compatibility('GPL-3.0-only', 'Apache-2.0')).toBe('whole-copyleft');
    expect(compatibility('GPL-2.0-only', 'MIT')).toBe('whole-copyleft');
    expect(compatibility('MIT', 'GPL-2.0-only')).toBe('fine');
  });

  it('GPL-2.0-only and GPL-3.0-only cannot be combined either way (no "or later")', () => {
    expect(compatibility('GPL-2.0-only', 'GPL-3.0-only')).toBe('conflict');
    expect(compatibility('GPL-3.0-only', 'GPL-2.0-only')).toBe('conflict');
  });

  it('permissive and weak-copyleft code never conflicts, except Apache-2.0 under GPL-2.0-only', () => {
    for (const dep of ['MIT', 'BSD-3-Clause', 'MPL-2.0', 'LGPL-2.1-only'] as const) {
      for (const p of PRODUCT_LICENCES) expect(compatibility(dep, p)).toBe('fine');
    }
  });
});

describe('the resolver on the default tree: every single-licence swap', () => {
  // Product Proprietary, linked in, unmodified. Order: internal, distributed, saas, library.
  const STATUS: Record<LicenceId, DepStatus[]> = {
    MIT: ['dim', 'ok', 'dim', 'ok'],
    'BSD-3-Clause': ['dim', 'ok', 'dim', 'ok'],
    'Apache-2.0': ['dim', 'ok', 'dim', 'ok'],
    'MPL-2.0': ['dim', 'violet', 'dim', 'violet'],
    'LGPL-2.1-only': ['dim', 'violet', 'dim', 'violet'],
    'GPL-2.0-only': ['dim', 'bad', 'dim', 'bad'],
    'GPL-3.0-only': ['dim', 'bad', 'dim', 'bad'],
    'AGPL-3.0-only': ['dim', 'bad', 'bad', 'bad'],
    none: ['bad', 'bad', 'bad', 'bad'],
  };
  const ORDER: Model[] = ['internal', 'distributed', 'saas', 'library'];

  it('every licence on every node, in every model, gives the tabled status and leaves the other nodes alone', () => {
    expect([...MODELS]).toEqual(ORDER);
    for (const model of ORDER) {
      const before = resolveTree(DEFAULT_PRESET.deps, 'proprietary', model);
      for (const node of DEFAULT_PRESET.deps) {
        for (const licence of LICENCES) {
          const after = resolveTree(withLicence(DEFAULT_PRESET.deps, node.id, licence), 'proprietary', model);
          expect(after.verdicts.get(node.id)?.status, `${node.id} as ${licence} / ${model}`).toBe(STATUS[licence][ORDER.indexOf(model)]);
          for (const other of DEFAULT_PRESET.deps) {
            if (other.id !== node.id) expect(after.verdicts.get(other.id)?.status).toBe(before.verdicts.get(other.id)?.status);
          }
        }
      }
    }
  });

  it('"no licence" always yields "no permission granted"', () => {
    for (const model of MODELS) {
      for (const product of PRODUCT_LICENCES) {
        const v = resolveDep({ id: 'x', name: 'x', licence: 'none', parent: ROOT, modified: false, separate: false }, product, model);
        expect(v.status).toBe('bad');
        expect(v.compat).toBe('no-permission');
        expect(v.obligations.map((o) => o.label)).toEqual(['No permission granted']);
      }
    }
  });

  it('the starting tree shipped as an app: notices are ok, MPL and LGPL are copyleft, nothing conflicts', () => {
    const t = resolveTree(DEFAULT_PRESET.deps, DEFAULT_PRESET.product, DEFAULT_PRESET.model);
    const statuses = Object.fromEntries(DEFAULT_PRESET.deps.map((d) => [d.id, t.verdicts.get(d.id)?.status]));
    expect(statuses).toEqual({ 'web-framework': 'ok', 'date-utils': 'ok', 'http-client': 'ok', 'parser-lib': 'violet', 'db-driver': 'violet' });
    expect(t.conflicts).toBe(0);
    expect(t.noPermission).toBe(0);
  });
});

describe('presets, worked by hand', () => {
  const preset = (id: string) => PRESETS.find((p) => p.id === id)!;
  const statuses = (id: string, over: { product?: ProductLicence; model?: Model } = {}) => {
    const p = preset(id);
    const t = resolveTree(p.deps, over.product ?? p.product, over.model ?? p.model);
    return Object.fromEntries(p.deps.map((d) => [d.id, t.verdicts.get(d.id)?.status]));
  };

  it('MIT app + GPL-3.0 report-engine library: the whole goes out under GPL-3.0 (no clash with MIT); closed source is the conflict', () => {
    expect(statuses('chart')).toEqual({ 'web-framework': 'ok', 'date-utils': 'ok', 'report-engine': 'violet' });
    const v = resolveTree(preset('chart').deps, 'MIT', 'distributed').verdicts.get('report-engine');
    expect(v?.compat).toBe('whole-copyleft');
    expect(statuses('chart', { product: 'proprietary' })['report-engine']).toBe('bad');
  });

  it('the SaaS preset library is server-side, and the note says browser-shipped code counts as distributed', () => {
    expect(preset('chart').note).toMatch(/browsers is distributed/);
    expect(preset('chart').deps.map((d) => d.id).join()).not.toMatch(/chart/);
  });

  it('the same app as an internal tool, or a service, triggers nothing (use alone is not distribution)', () => {
    for (const model of ['internal', 'saas'] as const) {
      expect(statuses('chart', { model })).toEqual({ 'web-framework': 'dim', 'date-utils': 'dim', 'report-engine': 'dim' });
      expect(statuses('chart', { model, product: 'proprietary' })['report-engine']).toBe('dim');
    }
  });

  it('patched AGPL database behind a SaaS: the network clause applies; unmodified and separate it does not', () => {
    const p = preset('agpl-saas');
    expect(statuses('agpl-saas')).toEqual({ 'web-framework': 'dim', 'graph-db': 'violet' });
    const v = resolveTree(p.deps, p.product, p.model).verdicts.get('graph-db')!;
    expect(v.obligations.filter((o) => o.state === 'due').map((o) => o.id)).toEqual(['agpl-network']);
    expect(v.compat).toBeNull(); // a separate program: no combined work

    const unmodified = withFlag(p.deps, 'graph-db', 'modified', false);
    expect(resolveTree(unmodified, p.product, p.model).verdicts.get('graph-db')?.status).toBe('dim');

    // Built into the service instead of run beside it: the whole service is the question, and closed source conflicts.
    const bundled = withFlag(unmodified, 'graph-db', 'separate', false);
    const built = resolveTree(bundled, p.product, p.model).verdicts.get('graph-db')!;
    expect(built.status).toBe('bad'); // the red stays, but the wording must not state it as settled
    expect(built.contested).toBe(true);
    expect(built.headline).toMatch(/Likely conflict/);
    expect(built.headline).toMatch(/contested/);
    expect(statusWord(built)).toBe('likely conflict (contested)');
  });

  it('a contested combination is never worded as a flat verdict, in the headline or the status chip', () => {
    for (const licence of ['GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only'] as const) {
      const v = resolveDep({ id: 'x', name: 'x', licence, parent: ROOT, modified: false, separate: false }, 'proprietary', 'distributed');
      expect(v.status).toBe('bad');
      expect(v.headline).not.toMatch(/^Conflict/);
      expect(v.headline).toMatch(/if this is one combined work/);
      expect(statusWord(v)).toMatch(/contested/);
    }
    const copyleft = resolveDep({ id: 'x', name: 'x', licence: 'GPL-3.0-only', parent: ROOT, modified: false, separate: false }, 'GPL-3.0-only', 'distributed');
    expect(copyleft.headline).toMatch(/likely triggered/);
    expect(copyleft.headline).toMatch(/contested/);
  });

  it('settled results are not marked contested', () => {
    const none = resolveDep({ id: 'x', name: 'x', licence: 'none', parent: ROOT, modified: false, separate: false }, 'proprietary', 'internal');
    expect(none.contested).toBe(false);
    expect(statusWord(none)).toBe('conflict or no permission');
    const mit = resolveDep({ id: 'x', name: 'x', licence: 'MIT', parent: ROOT, modified: false, separate: false }, 'proprietary', 'distributed');
    expect(statusWord(mit)).toBe('notices only');
  });

  it('a package under a separate program belongs to that program, so it is not combined into your product', () => {
    const p = preset('agpl-saas');
    const child = withAdded(p.deps, 'graph-db', 'GPL-3.0-only')!;
    expect(underSeparate(child.deps, child.id)).toBe(true);
    for (const model of ['distributed', 'saas'] as const) {
      const v = resolveTree(child.deps, 'proprietary', model).verdicts.get(child.id)!;
      expect(v.compat).toBeNull();
      expect(v.status).not.toBe('bad');
    }
    // Flip the parent to built-in and the same child is combined again.
    const builtIn = withFlag(child.deps, 'graph-db', 'separate', false);
    expect(underSeparate(builtIn, child.id)).toBe(false);
    expect(resolveTree(builtIn, 'proprietary', 'distributed').verdicts.get(child.id)?.status).toBe('bad');
  });

  it('separate is inherited through more than one level, and a sibling is unaffected', () => {
    const base = [dep('a', 'MIT', ROOT, { separate: true }), dep('b', 'MIT', 'a'), dep('c', 'GPL-3.0-only', 'b'), dep('d', 'GPL-3.0-only', ROOT)];
    expect(underSeparate(base, 'c')).toBe(true);
    expect(underSeparate(base, 'd')).toBe(false);
    expect(underSeparate(base, 'a')).toBe(false);
    const t = resolveTree(base, 'proprietary', 'distributed');
    expect(t.verdicts.get('c')?.status).not.toBe('bad');
    expect(t.verdicts.get('d')?.status).toBe('bad');
  });

  it('only a GPL-family product gets the MPL secondary-licence note', () => {
    expect(compatNote('MPL-2.0', 'MIT')).not.toMatch(/§3\.3/);
    expect(compatNote('MPL-2.0', 'proprietary')).not.toMatch(/§3\.3/);
    expect(compatNote('MPL-2.0', 'GPL-3.0-only')).toMatch(/§3\.3/);
  });

  it('the AGPL rows do not say GPL-covered, and the idle network note is only the internal one for internal use', () => {
    const rows = obligationRows('AGPL-3.0-only', { model: 'distributed', modified: false, separate: false });
    expect(rows.find((r) => r.id === 'gpl-source')!.detail).not.toMatch(/GPL-covered/);
    expect(rows.find((r) => r.id === 'gpl-source')!.detail).toMatch(/AGPL-covered/);
    const network = (model: Model) => obligationRows('AGPL-3.0-only', { model, modified: false, separate: true }).find((r) => r.id === 'agpl-network')!.detail;
    expect(network('internal')).toMatch(/only your own organisation/);
    expect(network('distributed')).not.toMatch(/only your own organisation/);
    expect(network('library')).not.toMatch(/only your own organisation/);
  });

  it('copy-pasted code with no licence is a problem in every model, even internal', () => {
    for (const model of MODELS) expect(statuses('no-licence', { model })['pasted-snippet']).toBe('bad');
    expect(statuses('no-licence')['web-framework']).toBe('ok');
  });

  it('relicensing: the product licence you pick is limited by what you depend on', () => {
    expect(statuses('relicense')).toEqual({ 'web-framework': 'ok', 'http-client': 'ok', 'parser-lib': 'violet', 'report-engine': 'violet' });
    expect(statuses('relicense', { product: 'proprietary' })).toMatchObject({ 'report-engine': 'bad', 'http-client': 'ok', 'parser-lib': 'violet' });
    expect(statuses('relicense', { product: 'GPL-2.0-only' })).toMatchObject({ 'http-client': 'bad', 'report-engine': 'bad', 'parser-lib': 'violet', 'web-framework': 'ok' });
    expect(statuses('relicense', { product: 'MIT' })).toMatchObject({ 'report-engine': 'violet', 'http-client': 'ok' });
    expect(statuses('relicense', { product: 'Apache-2.0' })['report-engine']).toBe('violet');
  });

  it('every preset has its selected node and a valid parent for every dependency', () => {
    for (const p of [DEFAULT_PRESET, ...PRESETS]) {
      const ids = new Set(p.deps.map((d) => d.id));
      expect(ids.has(p.selected)).toBe(true);
      for (const d of p.deps) expect(d.parent === ROOT || ids.has(d.parent)).toBe(true);
      expect(p.deps.length).toBeLessThanOrEqual(MAX_DEPS);
    }
  });
});

describe('editing the tree', () => {
  it('removes a dependency together with everything below it', () => {
    const left = withoutDep(DEFAULT_PRESET.deps, 'web-framework').map((d) => d.id);
    expect(left).toEqual(['http-client', 'parser-lib', 'db-driver']);
  });

  it('adds under a parent, with fresh ids, up to the cap', () => {
    let deps = DEFAULT_PRESET.deps;
    const first = withAdded(deps, 'http-client', 'GPL-2.0-only');
    expect(first?.deps.find((d) => d.id === first.id)).toMatchObject({ licence: 'GPL-2.0-only', parent: 'http-client' });
    deps = first!.deps;
    deps = withAdded(deps, ROOT, 'MIT')!.deps;
    expect(deps).toHaveLength(MAX_DEPS);
    expect(withAdded(deps, ROOT, 'MIT')).toBeNull();
    expect(new Set(deps.map((d) => d.id)).size).toBe(deps.length);
  });

  it('keeps ids unique after a removal', () => {
    const trimmed = withoutDep(withAdded(DEFAULT_PRESET.deps, ROOT, 'MIT')!.deps, 'web-framework');
    const added = withAdded(trimmed, ROOT, 'MIT')!;
    expect(new Set(added.deps.map((d) => d.id)).size).toBe(added.deps.length);
  });
});

describe('what teams actually do', () => {
  it('counts the packages that carry an SPDX identifier', () => {
    expect(spdxCoverage(DEFAULT_PRESET.deps)).toEqual({ have: 5, total: 5 });
    expect(spdxCoverage(PRESETS.find((p) => p.id === 'no-licence')!.deps)).toEqual({ have: 1, total: 2 });
  });

  it('without a scanner nothing is checked; without a policy it can only report', () => {
    const deps = withLicence(DEFAULT_PRESET.deps, 'http-client', 'AGPL-3.0-only');
    expect(scan(deps, 'distributed', { scanner: false, policy: true }).state).toBe('unchecked');
    const reportOnly = scan(deps, 'distributed', { scanner: true, policy: false });
    expect(reportOnly.state).toBe('report-only');
    expect(reportOnly.flagged).toEqual([]);
  });

  it('with an allow-list, a disallowed licence fails the build, and the list depends on how you ship', () => {
    const deps = withLicence(DEFAULT_PRESET.deps, 'http-client', 'GPL-3.0-only');
    expect(scan(deps, 'distributed', { scanner: true, policy: true }).flagged.map((f) => f.dep.id)).toEqual(['http-client']);
    expect(scan(deps, 'distributed', { scanner: true, policy: true }).state).toBe('fail');
    expect(scan(deps, 'saas', { scanner: true, policy: true }).state).toBe('pass');
    expect(ALLOW_LIST.saas).not.toContain('AGPL-3.0-only');
    expect(ALLOW_LIST.distributed).not.toContain('none' as LicenceId);
  });

  it('a package with no licence is flagged even without a policy', () => {
    const deps = PRESETS.find((p) => p.id === 'no-licence')!.deps;
    expect(scan(deps, 'distributed', { scanner: true, policy: false }).flagged.map((f) => f.reason)).toEqual(['no licence found']);
  });
});

describe('the drawing has room for what the editor allows', () => {
  it('refuses to nest deeper than the rows the tree draws', () => {
    let deps = DEFAULT_PRESET.deps; // date-utils sits at depth 2 under web-framework
    expect(depthOf(deps, 'web-framework')).toBe(1);
    expect(depthOf(deps, 'date-utils')).toBe(2);
    deps = withAdded(deps, 'date-utils', 'MIT')!.deps; // depth 3
    const deepest = deps[deps.length - 1].id;
    expect(depthOf(deps, deepest)).toBe(MAX_DEPTH);
    expect(withAdded(deps, deepest, 'MIT')).toBeNull();
  });
});
