import {
  badge, distributes, idleReason, LICENCE_FACTS, MODEL_LABEL, productLabel, ROLLUP_LABEL, RULES,
  type LicenceId, type Model, type ObligationId, type ProductLicence, type Setup,
} from './licences';

/** What happens when a dependency's code is combined into a product under another licence. */
export type Compat =
  | 'fine' // no conflict; the product keeps its own terms
  | 'whole-copyleft' // allowed, but the distributed whole carries the dependency's copyleft terms
  | 'conflict' // the two sets of terms can't both be met for the whole
  | 'no-permission'; // no licence: nothing to be compatible with

const STRONG: readonly LicenceId[] = ['GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only'];

/**
 * Can code under `dep` go into one combined work distributed under `product`? Not symmetric:
 * Apache-2.0 code can join a GPL-3.0 work, a GPL-3.0 library can't be dropped into an Apache-2.0 product
 * and keep the product's terms. Follows the FSF's licence list and the licences' own combination clauses.
 */
export function compatibility(dep: LicenceId, product: ProductLicence): Compat {
  if (dep === 'none') return 'no-permission';
  if (dep === 'Apache-2.0' && product === 'GPL-2.0-only') return 'conflict';
  if (!STRONG.includes(dep)) return 'fine';
  if (product === 'proprietary') return 'conflict';
  if (product === dep) return 'fine';
  switch (dep) {
    case 'GPL-2.0-only':
      return product === 'MIT' || product === 'MPL-2.0' ? 'whole-copyleft' : 'conflict';
    case 'GPL-3.0-only':
      if (product === 'GPL-2.0-only') return 'conflict';
      return product === 'AGPL-3.0-only' ? 'fine' : 'whole-copyleft';
    default: // AGPL-3.0-only (the same-licence case returned above)
      return product === 'GPL-2.0-only' ? 'conflict' : 'whole-copyleft';
  }
}

/** One sentence on why a pair is what it is (the source of each row in the compatibility table). */
export function compatNote(dep: LicenceId, product: ProductLicence): string {
  const d = badge(dep);
  const p = productLabel(product);
  const verdict = compatibility(dep, product);
  if (verdict === 'no-permission') return 'No licence: no permission was granted, so there is nothing to be compatible with.';
  if (verdict === 'conflict') {
    if (product === 'proprietary') return `A closed-source product cannot offer the whole combined work under the ${d} terms with its source.`;
    if ((dep === 'Apache-2.0' && product === 'GPL-2.0-only') || (dep === 'GPL-2.0-only' && product === 'Apache-2.0')) {
      return "The FSF lists Apache-2.0 as incompatible with GPL-2.0-only: Apache's patent and termination terms count as extra restrictions there. GPL-3.0 was written to accept them.";
    }
    return `${d} and ${p} code cannot be combined into one work: neither licence accepts the other's terms for the whole. ('or later' wording would have allowed it.)`;
  }
  if (verdict === 'whole-copyleft') {
    if (dep === 'GPL-3.0-only' && product === 'Apache-2.0') {
      return 'Allowed: Apache-2.0 is one-way compatible with GPL-3.0 (FSF). The combined work is distributed under GPL-3.0, so "Apache-2.0" no longer describes the whole.';
    }
    if (product === 'MPL-2.0') return `Allowed through MPL-2.0 §3.3 (secondary licences): the combined work goes out under the ${d} terms.`;
    if (dep === 'AGPL-3.0-only' && product === 'GPL-3.0-only') return 'Allowed: GPL-3.0 §13 and AGPL-3.0 §13 let the two combine. The AGPL network clause still applies to that part.';
    return `Allowed, but the combined work you distribute carries the ${d} terms: '${p}' no longer describes the whole (your own files can still be available under it separately).`;
  }
  if (dep === product) return 'Same licence on both sides: the terms line up.';
  if (dep === 'MPL-2.0') {
    return STRONG.includes(product as LicenceId)
      ? 'The MPL files stay MPL. MPL-2.0 §3.3 lets them join GPL-family works unless a file says it is incompatible with secondary licences.'
      : 'The MPL files stay MPL (file-level copyleft); the rest of your product can use other terms.';
  }
  if (dep === 'LGPL-2.1-only') return 'Allowed: other products use the library under the replace-the-library condition (§6), and LGPL-2.1 §3 lets GPL products take it under the GPL.';
  if (dep === 'Apache-2.0' || dep === 'MIT' || dep === 'BSD-3-Clause') {
    return product === 'proprietary'
      ? `${d} asks only for notices, so a proprietary product can include it.`
      : `${d} is permissive and GPL-compatible (Apache-2.0 only with GPL-3.0): it can sit inside a ${p} work.`;
  }
  return `A ${p} product already carries terms at least as strong as ${d}'s, so nothing new is imposed.`;
}

/** Where a compatibility row comes from. */
export function compatSource(dep: LicenceId, product: ProductLicence): string {
  const verdict = compatibility(dep, product);
  if (verdict === 'no-permission') return "Copyright law's default: all rights reserved";
  if (product === 'MPL-2.0' && dep !== 'MPL-2.0' && STRONG.includes(dep)) return 'MPL-2.0 §3.3 (secondary licences)';
  if (dep === 'MPL-2.0' && product !== 'proprietary' && product !== 'MIT' && product !== 'Apache-2.0' && product !== 'MPL-2.0') return 'MPL-2.0 §3.3 (secondary licences)';
  if (dep === 'LGPL-2.1-only') return 'LGPL-2.1 §3, §6';
  if (dep === 'MIT' || dep === 'BSD-3-Clause') return "Licence text; FSF's list marks it GPL-compatible";
  if (STRONG.includes(dep) && (product === 'GPL-3.0-only' || product === 'AGPL-3.0-only')) return "FSF's list; GPL-3.0 §13, AGPL-3.0 §13";
  return "FSF's licence list (gnu.org/licenses/license-list)";
}

export interface Dep {
  id: string;
  name: string;
  licence: LicenceId;
  parent: string;
  modified: boolean;
  separate: boolean;
}

export const ROOT = 'product';

export type DepStatus = 'ok' | 'violet' | 'bad' | 'dim';

export interface ObligationRow {
  id: ObligationId;
  label: string;
  kind: 'duty' | 'grant';
  copyleft: boolean;
  state: 'due' | 'idle' | 'info';
  detail: string;
  source: string;
}

export interface DepVerdict {
  dep: Dep;
  status: DepStatus;
  obligations: ObligationRow[];
  /** Evaluated only when the dependency is combined into a distributed (or, for the AGPL, served) work. */
  compat: Compat | null;
  /** True when the status rests on the package being one combined work, which is legally contested. */
  contested: boolean;
  headline: string;
}

export const setupOf = (dep: Dep, model: Model): Setup => ({ model, modified: dep.modified, separate: dep.separate });

/** The rows of the obligations table for one licence in one setup. */
export function obligationRows(licence: LicenceId, s: Setup): ObligationRow[] {
  return RULES[licence].map((r) => {
    const due = r.due(s);
    const state = r.kind === 'grant' ? 'info' : due ? 'due' : 'idle';
    return {
      id: r.id, label: r.label, kind: r.kind, copyleft: r.copyleft, state, source: r.source,
      detail: state === 'idle' ? (r.idle ?? idleReason)(s) : r.detail(s),
    };
  });
}

/** True when the dependency ends up inside one work that is handed out (or, for the AGPL, served). */
export function combinedWork(dep: Dep, model: Model): boolean {
  if (dep.separate) return false;
  return distributes(model) || (model === 'saas' && dep.licence === 'AGPL-3.0-only');
}

/** True when the dependency's own terms must then hold for the whole work (a strong copyleft licence). */
export const wholeWorkApplies = (dep: Dep, model: Model): boolean => STRONG.includes(dep.licence) && combinedWork(dep, model);

/** True when `id` sits below a package marked as a separate program: it belongs to that program, not to your product. */
export function underSeparate(deps: readonly Dep[], id: string): boolean {
  const seen = new Set<string>();
  for (let cur = deps.find((d) => d.id === id); cur && !seen.has(cur.id); cur = deps.find((d) => d.id === cur?.parent)) {
    seen.add(cur.id);
    if (deps.find((d) => d.id === cur?.parent)?.separate) return true;
  }
  return false;
}

/**
 * `inheritedSeparate` is true when an ancestor is a separate program (see `underSeparate`): the package
 * then counts as separate too, whatever its own flag says.
 */
export function resolveDep(dep: Dep, product: ProductLicence, model: Model, inheritedSeparate = false): DepVerdict {
  const eff: Dep = inheritedSeparate ? { ...dep, separate: true } : dep;
  const obligations = obligationRows(dep.licence, setupOf(eff, model));
  const base = { dep, obligations };
  if (dep.licence === 'none') return { ...base, status: 'bad', compat: 'no-permission', contested: false, headline: 'No permission granted: all rights reserved.' };
  const due = obligations.filter((o) => o.state === 'due');
  const compat = combinedWork(eff, model) ? compatibility(dep.licence, product) : null;
  if (compat === 'conflict') {
    return { ...base, status: 'bad', compat, contested: true, headline: `Likely conflict with a ${productLabel(product)} product, if this is one combined work (which is legally contested): ${compatNote(dep.licence, product)}` };
  }
  if (compat !== null && wholeWorkApplies(eff, model)) {
    return { ...base, status: 'violet', compat, contested: true, headline: `Copyleft likely triggered, if this is one combined work (which is legally contested). ${compatNote(dep.licence, product)}` };
  }
  if (due.some((o) => o.copyleft)) return { ...base, status: 'violet', compat: null, contested: false, headline: `Copyleft duties triggered: ${due.filter((o) => o.copyleft).map((o) => o.label).join('; ')}.` };
  if (due.length > 0) return { ...base, status: 'ok', compat: null, contested: false, headline: 'Notice duties only.' };
  return { ...base, status: 'dim', compat: null, contested: false, headline: `Nothing triggered when shipped as: ${MODEL_LABEL[model].toLowerCase()}.` };
}

export interface TreeSummary {
  verdicts: Map<string, DepVerdict>;
  copyleft: number;
  conflicts: number;
  noPermission: number;
  /** Distinct triggered duties across the tree, with how many packages raise each. */
  rollup: { id: ObligationId; label: string; copyleft: boolean; count: number }[];
}

export function resolveTree(deps: readonly Dep[], product: ProductLicence, model: Model): TreeSummary {
  const verdicts = new Map(deps.map((d) => [d.id, resolveDep(d, product, model, underSeparate(deps, d.id))]));
  const all = [...verdicts.values()];
  const counts = new Map<ObligationId, { label: string; copyleft: boolean; count: number }>();
  for (const v of all) {
    for (const o of v.obligations) {
      if (o.state !== 'due') continue;
      const key = counts.get(o.id) ?? { label: ROLLUP_LABEL[o.id] ?? o.label, copyleft: o.copyleft, count: 0 };
      key.count += 1;
      counts.set(o.id, key);
    }
  }
  return {
    verdicts,
    copyleft: all.filter((v) => v.status === 'violet').length,
    conflicts: all.filter((v) => v.status === 'bad' && v.dep.licence !== 'none').length,
    noPermission: all.filter((v) => v.dep.licence === 'none').length,
    rollup: [...counts].map(([id, entry]) => ({ id, ...entry })),
  };
}

// ---- editing the tree -------------------------------------------------------------------------

/** Keeps the drawing readable: up to seven leaves fit the tree's width. */
export const MAX_DEPS = 7;

export const withLicence = (deps: readonly Dep[], id: string, licence: LicenceId): Dep[] => deps.map((d) => (d.id === id ? { ...d, licence } : d));

export const withFlag = (deps: readonly Dep[], id: string, flag: 'modified' | 'separate', value: boolean): Dep[] =>
  deps.map((d) => (d.id === id ? { ...d, [flag]: value } : d));

/** Removes a dependency and everything below it. */
export function withoutDep(deps: readonly Dep[], id: string): Dep[] {
  const gone = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of deps) {
      if (!gone.has(d.id) && gone.has(d.parent)) {
        gone.add(d.id);
        grew = true;
      }
    }
  }
  return deps.filter((d) => !gone.has(d.id));
}

/** Rows below the product the drawing has room for. */
export const MAX_DEPTH = 3;

/** How far below the product a package sits: 0 for the product, 1 for its direct dependencies. */
export function depthOf(deps: readonly Dep[], id: string): number {
  let depth = 0;
  for (let cur = deps.find((d) => d.id === id); cur; cur = deps.find((d) => d.id === cur?.parent)) depth += 1;
  return depth;
}

/** Adds a dependency under `parent`; returns the new list and the new id, or null when the tree has no room. */
export function withAdded(deps: readonly Dep[], parent: string, licence: LicenceId): { deps: Dep[]; id: string } | null {
  if (deps.length >= MAX_DEPS || depthOf(deps, parent) >= MAX_DEPTH) return null;
  let n = deps.length + 1;
  while (deps.some((d) => d.id === `lib-${n}`)) n += 1;
  const id = `lib-${n}`;
  return { deps: [...deps, { id, name: id, licence, parent, modified: false, separate: false }], id };
}

// ---- what teams actually do -------------------------------------------------------------------

/** An EXAMPLE allow-list per way of shipping. Real policies differ; this one only illustrates the idea. */
export const ALLOW_LIST: Record<Model, readonly LicenceId[]> = {
  internal: ['MIT', 'BSD-3-Clause', 'Apache-2.0', 'MPL-2.0', 'LGPL-2.1-only', 'GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only'],
  saas: ['MIT', 'BSD-3-Clause', 'Apache-2.0', 'MPL-2.0', 'LGPL-2.1-only', 'GPL-2.0-only', 'GPL-3.0-only'],
  distributed: ['MIT', 'BSD-3-Clause', 'Apache-2.0', 'MPL-2.0', 'LGPL-2.1-only'],
  library: ['MIT', 'BSD-3-Clause', 'Apache-2.0', 'MPL-2.0', 'LGPL-2.1-only'],
};

/** How many packages carry a machine-readable SPDX identifier (every one with a licence does, in this model). */
export const spdxCoverage = (deps: readonly Dep[]) => ({ have: deps.filter((d) => LICENCE_FACTS[d.licence].spdx !== null).length, total: deps.length });

export type ScanState = 'unchecked' | 'report-only' | 'pass' | 'fail';

export interface ScanResult {
  state: ScanState;
  flagged: { dep: Dep; reason: string }[];
}

/**
 * What a licence scanner in CI would do. Without a policy it can only report what it finds (and
 * can't identify a package with no licence); with an allow-list it can fail the build.
 */
export function scan(deps: readonly Dep[], model: Model, practices: { scanner: boolean; policy: boolean }): ScanResult {
  if (!practices.scanner) return { state: 'unchecked', flagged: [] };
  const flagged = deps.flatMap((dep) => {
    if (dep.licence === 'none') return [{ dep, reason: 'no licence found' }];
    if (practices.policy && !ALLOW_LIST[model].includes(dep.licence)) return [{ dep, reason: `${badge(dep.licence)} is not on the allow-list for this way of shipping` }];
    return [];
  });
  if (!practices.policy) return { state: 'report-only', flagged };
  return { state: flagged.length ? 'fail' : 'pass', flagged };
}

// ---- presets ----------------------------------------------------------------------------------

export interface Preset {
  id: string;
  label: string;
  product: ProductLicence;
  model: Model;
  deps: Dep[];
  selected: string;
  note: string;
}

const dep = (id: string, licence: LicenceId, parent: string = ROOT, flags: Partial<Pick<Dep, 'modified' | 'separate'>> = {}): Dep => ({
  id, name: id, licence, parent, modified: false, separate: false, ...flags,
});

export const DEFAULT_PRESET: Preset = {
  id: 'default',
  label: 'Starting tree',
  product: 'proprietary',
  model: 'distributed',
  deps: [
    dep('web-framework', 'MIT'),
    dep('date-utils', 'BSD-3-Clause', 'web-framework'),
    dep('http-client', 'Apache-2.0'),
    dep('parser-lib', 'MPL-2.0'),
    dep('db-driver', 'LGPL-2.1-only'),
  ],
  selected: 'parser-lib',
  note: 'A closed-source product, shipped as an app. Click a package, then swap its licence.',
};

export const PRESETS: Preset[] = [
  {
    id: 'chart',
    label: 'MIT app adds a GPL report-engine library',
    product: 'MIT',
    model: 'distributed',
    deps: [dep('web-framework', 'MIT'), dep('date-utils', 'BSD-3-Clause', 'web-framework'), dep('report-engine', 'GPL-3.0-only')],
    selected: 'report-engine',
    note: "Shipped as an app, the combined work goes out under GPL-3.0 with source. MIT code can join a GPL work, so the licences don't clash: but the promise 'this app is MIT' no longer covers the whole binary. Press Internal and nothing is triggered; switch the product to Proprietary and it is a likely conflict. Run as a SaaS it stays quiet only while the library stays on your servers: code you send to users' browsers is distributed (a browser-side chart library would be).",
  },
  {
    id: 'agpl-saas',
    label: 'AGPL database behind your SaaS',
    product: 'proprietary',
    model: 'saas',
    deps: [dep('web-framework', 'MIT'), dep('graph-db', 'AGPL-3.0-only', ROOT, { separate: true, modified: true })],
    selected: 'graph-db',
    note: 'You patched a separate AGPL database and users reach it through your service, so §13 asks you to offer them the source of your patched version. Flip "We modified it" off and nothing is triggered; flip it to "Built into our product" and the question is about your whole service.',
  },
  {
    id: 'no-licence',
    label: 'Copy-pasted code with no licence',
    product: 'proprietary',
    model: 'distributed',
    deps: [dep('web-framework', 'MIT'), dep('pasted-snippet', 'none')],
    selected: 'pasted-snippet',
    note: 'A snippet from a public page with no licence text. Visible is not licensed: all rights are reserved, so you have no permission to copy it, whatever the distribution model.',
  },
  {
    id: 'relicense',
    label: 'Relicensing your own project',
    product: 'GPL-3.0-only',
    model: 'distributed',
    deps: [dep('web-framework', 'MIT'), dep('http-client', 'Apache-2.0'), dep('parser-lib', 'MPL-2.0'), dep('report-engine', 'GPL-3.0-only')],
    selected: 'report-engine',
    note: "Your project's own licence is your choice for code you wrote, but relicensing generally needs every copyright holder's agreement (contributors count, unless a contributor agreement or inbound-equals-outbound terms already cover it), and your dependencies' licences limit what you can pick. Try Proprietary, GPL-2.0-only, then MIT.",
  },
];
