/**
 * The four models, each with a generator (configuration from the organisation's facts) and an evaluator that returns
 * its decision with the path it walked. None of this is a product: each evaluator is a small version written for the lesson.
 */
import { ACTIONS, SHARE, docById, needed, required, userById, type Action, type Doc, type Org, type RequirementId, type User } from './org';
import { REWRITES, check, docObj, generateTuples, relOf, subjectName, type CheckOptions, type Tuple } from './rebac';

export type ModelId = 'acl' | 'rbac' | 'abac' | 'rebac';

export const MODELS: readonly { id: ModelId; label: string }[] = [
  { id: 'acl', label: 'ACL' },
  { id: 'rbac', label: 'RBAC' },
  { id: 'abac', label: 'ABAC' },
  { id: 'rebac', label: 'ReBAC' },
];

// ── Trace: what an evaluator walked, for the picture ─────────────────────

export type NodeKind = 'user' | 'group' | 'role' | 'resource' | 'rule' | 'perm';
export type NodeState = 'granted' | 'failed' | 'dim';

export interface TraceNode {
  id: string;
  label: string;
  kind: NodeKind;
  state: NodeState;
}
export interface TraceEdge {
  from: string;
  to: string;
  label?: string;
  state: 'granted' | 'failed';
}
export interface Decision {
  granted: boolean;
  nodes: TraceNode[];
  edges: TraceEdge[];
  /** When denied: the missing link or the failed comparison, in words. */
  why: string | null;
  /** A note the stage prints, such as "cycle ignored". */
  note: string | null;
}

/** The facts every configuration is generated from: the requirement the organisation actually has. */
const ruleOf = (org: Org): RequirementId => (org.share ? 'dept-clearance-share' : 'dept-clearance');

// ── ACL ──────────────────────────────────────────────────────────────────

/** Each document's own list: who may read, who may edit. */
export type AclConfig = Record<string, Record<Action, string[]>>;

export function generateAcl(org: Org): AclConfig {
  const rule = ruleOf(org);
  return Object.fromEntries(org.docs.map((d) => [d.id, Object.fromEntries(ACTIONS.map((a) => [a, org.users.filter((u) => required(rule, u, a, d)).map((u) => u.id)])) as Record<Action, string[]>]));
}

export const aclEntryCount = (c: AclConfig) => Object.values(c).reduce((n, e) => n + e.read.length + e.edit.length, 0);

function decideAcl(org: Org, c: AclConfig, u: User, a: Action, d: Doc): Decision {
  const names = c[d.id][a];
  const nodes: TraceNode[] = [{ id: d.id, label: d.name, kind: 'resource', state: names.includes(u.id) ? 'granted' : 'failed' }];
  const edges: TraceEdge[] = [];
  for (const id of names) {
    const hit = id === u.id;
    nodes.push({ id, label: userById(org, id).name, kind: 'user', state: hit ? 'granted' : 'dim' });
    edges.push({ from: d.id, to: id, label: a, state: hit ? 'granted' : 'failed' });
  }
  const granted = names.includes(u.id);
  if (!granted) nodes.push({ id: u.id, label: u.name, kind: 'user', state: 'failed' });
  return { granted, nodes, edges, why: granted ? null : `No entry on ${d.name} names ${u.name} for ${a}.`, note: null };
}

// ── RBAC ─────────────────────────────────────────────────────────────────

export type Perm = { action: Action; dept: string; level: number } | { action: Action; doc: string };

export interface Role {
  id: string;
  label: string;
  grants: Perm[];
  /** Hierarchical form: the role this one inherits. */
  inherits?: string;
}
export interface RbacConfig {
  roles: Role[];
  assignments: Record<string, string[]>;
}

export const roleId = (dept: string, k: number) => `${dept}-L${k}`;
export const SHARE_ROLE = 'shared-roadmap';

/** Roles for every (department, level): role k lets you read level k and edit level k - 1. */
function baseRoles(org: Org): Role[] {
  return org.depts.flatMap((dept) =>
    Array.from({ length: org.levels }, (_, i) => {
      const k = i + 1;
      const grants: Perm[] = [{ action: 'read', dept, level: k }];
      if (k >= 2) grants.push({ action: 'edit', dept, level: k - 1 });
      return { id: roleId(dept, k), label: `${dept} L${k}`, grants };
    }),
  );
}

/** The naive flat form: a user holds every role up to their clearance. */
export function generateRbacFlat(org: Org): RbacConfig {
  const roles = baseRoles(org);
  const assignments = Object.fromEntries(org.users.map((u) => [u.id, Array.from({ length: u.clearance }, (_, i) => roleId(u.dept, i + 1))]));
  if (org.share) {
    roles.push({ id: SHARE_ROLE, label: 'shared roadmap', grants: [{ action: 'read', doc: SHARE.doc }] });
    assignments[SHARE.user] = [...assignments[SHARE.user], SHARE_ROLE];
  }
  return { roles, assignments };
}

/** The fair form: role k inherits role k - 1, so a user holds one role. */
export function generateRbacHierarchical(org: Org): RbacConfig {
  const roles = baseRoles(org).map((r) => {
    const k = Number(r.id.split('-L')[1]);
    return k > 1 ? { ...r, inherits: roleId(r.id.split('-L')[0], k - 1) } : r;
  });
  const assignments = Object.fromEntries(org.users.map((u) => [u.id, [roleId(u.dept, u.clearance)]]));
  if (org.share) {
    roles.push({ id: SHARE_ROLE, label: 'shared roadmap', grants: [{ action: 'read', doc: SHARE.doc }] });
    assignments[SHARE.user] = [...assignments[SHARE.user], SHARE_ROLE];
  }
  return { roles, assignments };
}

export const inheritanceEdges = (c: RbacConfig) => c.roles.filter((r) => r.inherits).length;

/** A user's roles with everything they inherit. */
export function effectiveRoles(c: RbacConfig, userId: string): Role[] {
  const out: Role[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    const r = c.roles.find((x) => x.id === id);
    if (!r || seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
    add(r.inherits);
  };
  for (const id of c.assignments[userId] ?? []) add(id);
  return out;
}

const grants = (r: Role, a: Action, d: Doc) => r.grants.some((p) => ('doc' in p ? p.doc === d.id && p.action === a : p.action === a && p.dept === d.dept && p.level === d.level));
const permLabel = (a: Action, d: Doc) => `${a} ${d.dept} L${d.level}`;

function decideRbac(c: RbacConfig, u: User, a: Action, d: Doc): Decision {
  const roles = effectiveRoles(c, u.id);
  const winner = roles.find((r) => grants(r, a, d));
  const nodes: TraceNode[] = [{ id: u.id, label: u.name, kind: 'user', state: winner ? 'granted' : 'failed' }];
  const edges: TraceEdge[] = [];
  for (const r of roles) {
    const hit = r === winner;
    nodes.push({ id: r.id, label: r.label, kind: 'role', state: hit ? 'granted' : 'dim' });
    edges.push({ from: u.id, to: r.id, label: 'has role', state: hit ? 'granted' : 'failed' });
  }
  const perm = (winner?.grants.find((p) => 'doc' in p && p.doc === d.id)) ? `${a} ${d.name}` : permLabel(a, d);
  nodes.push({ id: 'perm', label: perm, kind: 'perm', state: winner ? 'granted' : 'failed' });
  if (winner) edges.push({ from: winner.id, to: 'perm', label: 'grants', state: 'granted' });
  const why = winner ? null : `None of ${u.name}'s roles (${roles.map((r) => r.label).join(', ') || 'none'}) grants ${permLabel(a, d)}.`;
  return { granted: !!winner, nodes, edges, why, note: null };
}

// ── ABAC ─────────────────────────────────────────────────────────────────

export interface Condition {
  id: string;
  label: string;
  /** What was compared, with the values. */
  detail: string;
  holds: boolean;
}

/** The one policy's three conditions, evaluated on the live attributes. */
export function abacConditions(u: User, a: Action, d: Doc): Condition[] {
  const need = needed(a, d.level);
  return [
    { id: 'dept', label: 'same department', detail: `${u.dept} ${u.dept === d.dept ? '=' : '≠'} ${d.dept}`, holds: u.dept === d.dept },
    { id: 'clearance', label: 'clearance high enough', detail: `${u.clearance} ${u.clearance >= need ? '≥' : '<'} ${need}`, holds: u.clearance >= need },
    { id: 'action', label: 'action in the allowed set', detail: `${a} in {read, edit}`, holds: ACTIONS.includes(a) },
  ];
}

function decideAbac(org: Org, u: User, a: Action, d: Doc): Decision {
  const conds = abacConditions(u, a, d);
  const policy = conds.every((c) => c.holds);
  const shared = org.share && u.id === SHARE.user && d.id === SHARE.doc && a === 'read';
  const granted = policy || shared;
  const nodes: TraceNode[] = [{ id: u.id, label: u.name, kind: 'user', state: granted ? 'granted' : 'failed' }, { id: d.id, label: d.name, kind: 'resource', state: granted ? 'granted' : 'failed' }];
  const edges: TraceEdge[] = [];
  for (const c of conds) {
    nodes.push({ id: c.id, label: `${c.label}: ${c.detail}`, kind: 'rule', state: c.holds ? 'granted' : 'failed' });
    edges.push({ from: u.id, to: c.id, state: c.holds ? 'granted' : 'failed' }, { from: c.id, to: d.id, state: c.holds ? 'granted' : 'failed' });
  }
  if (shared) {
    nodes.push({ id: 'shared', label: 'exception: shared with this user', kind: 'rule', state: 'granted' });
    edges.push({ from: u.id, to: 'shared', state: 'granted' }, { from: 'shared', to: d.id, state: 'granted' });
  }
  const failed = conds.filter((c) => !c.holds);
  return { granted, nodes, edges, why: granted ? null : `Failed: ${failed.map((c) => `${c.label} (${c.detail})`).join('; ')}.`, note: null };
}

// ── ReBAC ────────────────────────────────────────────────────────────────

function decideRebac(org: Org, tuples: readonly Tuple[], u: User, a: Action, d: Doc, o?: CheckOptions): Decision {
  const root = `${docObj(d.id)}#${relOf(a)}`;
  const r = check(tuples, u.id, docObj(d.id), relOf(a), o);
  const onPath = new Set(r.path.map((h) => `${h.from}>${h.to}`));
  const nodes = new Map<string, TraceNode>();
  const touch = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, label: id.startsWith('user:') ? userById(org, id.slice(5)).name : id, kind: id.startsWith('user:') ? 'user' : id.startsWith('group:') ? 'group' : 'resource', state: 'failed' });
  };
  touch(root);
  const edges: TraceEdge[] = [];
  const seenEdge = new Set<string>();
  for (const h of r.explored) {
    const k = `${h.from}>${h.to}`;
    if (seenEdge.has(k)) continue;
    seenEdge.add(k);
    touch(h.from);
    touch(h.to);
    edges.push({ from: h.from, to: h.to, label: h.label, state: onPath.has(k) ? 'granted' : 'failed' });
  }
  for (const h of r.path) {
    nodes.get(h.from)!.state = 'granted';
    nodes.get(h.to)!.state = 'granted';
  }
  if (!r.granted && !nodes.has(`user:${u.id}`)) nodes.set(`user:${u.id}`, { id: `user:${u.id}`, label: u.name, kind: 'user', state: 'dim' });
  const why = r.granted ? null : r.exceeded ? `The search ran past ${r.steps - 1} steps without an answer.` : `No chain of tuples from ${root} reaches ${subjectName({ kind: 'user', id: u.id })} (${r.steps} sets expanded).`;
  return { granted: r.granted, nodes: [...nodes.values()], edges, why, note: r.cycleIgnored ? 'cycle ignored: a group reached a second time was skipped' : null };
}

// ── Configurations and decisions ─────────────────────────────────────────

export interface Configs {
  acl: AclConfig;
  rbac: RbacConfig;
  rebac: Tuple[];
}

export const buildConfigs = (org: Org): Configs => ({ acl: generateAcl(org), rbac: generateRbacFlat(org), rebac: generateTuples(org) });

export function decide(model: ModelId, org: Org, cfg: Configs, userId: string, action: Action, docId: string, rebacOptions?: CheckOptions): Decision {
  const u = userById(org, userId);
  const d = docById(org, docId);
  switch (model) {
    case 'acl': return decideAcl(org, cfg.acl, u, action, d);
    case 'rbac': return decideRbac(cfg.rbac, u, action, d);
    case 'abac': return decideAbac(org, u, action, d);
    case 'rebac': return decideRebac(org, cfg.rebac, u, action, d, rebacOptions);
  }
}

// ── The disagreement table ───────────────────────────────────────────────

export interface Row {
  id: string;
  user: User;
  action: Action;
  doc: Doc;
  decisions: Record<ModelId, boolean>;
  /** How many models say yes. */
  yes: number;
  /** The models do not all say the same. */
  disagree: boolean;
  /** The models whose answer differs from the stated requirement. */
  wrong: ModelId[];
}

export function disagreementRows(org: Org, req: RequirementId): Row[] {
  const cfg = buildConfigs(org);
  return org.users.flatMap((user) =>
    ACTIONS.flatMap((action) =>
      org.docs.map((doc) => {
        const decisions = Object.fromEntries(MODELS.map((m) => [m.id, decide(m.id, org, cfg, user.id, action, doc.id).granted])) as Record<ModelId, boolean>;
        const want = required(req, user, action, doc);
        const yes = MODELS.filter((m) => decisions[m.id]).length;
        return { id: `${user.id}-${action}-${doc.id}`, user, action, doc, decisions, yes, disagree: yes !== 0 && yes !== MODELS.length, wrong: MODELS.filter((m) => decisions[m.id] !== want).map((m) => m.id) };
      }),
    ),
  );
}

// ── What an administrator defines ────────────────────────────────────────

/** An organisation with one user and one document per (department, level), plus the two people the "share" requirement names. */
export function syntheticOrg(departments: number, levels: number, share: boolean): Org {
  const depts = Array.from({ length: departments }, (_, i) => `d${i + 1}`);
  const users: User[] = depts.flatMap((dept) => Array.from({ length: levels }, (_, i) => ({ id: `${dept}-u${i + 1}`, name: `${dept} user ${i + 1}`, dept, clearance: i + 1 })));
  users.push({ id: SHARE.user, name: 'Erin', dept: depts[departments - 1], clearance: 1 });
  const docs: Doc[] = depts.flatMap((dept) => Array.from({ length: levels }, (_, i) => ({ id: `${dept}-doc${i + 1}`, name: `${dept} doc ${i + 1}`, dept, level: i + 1 })));
  docs.push({ id: SHARE.doc, name: 'Roadmap', dept: depts[0], level: levels });
  return { depts, levels, users, docs, folderOf: Object.fromEntries(docs.map((d) => [d.id, `${d.dept}-L${d.level}`])), share, cycle: false };
}

export interface Counts {
  aclEntries: number;
  rbacRoles: number;
  rbacGrants: number;
  rbacHierRoles: number;
  rbacHierEdges: number;
  abacPolicies: number;
  rebacGroups: number;
  rebacFolders: number;
  rebacTuples: number;
  rebacRules: number;
  /** Attributes on documents or users that only an exception adds. */
  abacExceptionAttributes: number;
}

export function countsOf(org: Org): Counts {
  const tuples = generateTuples(org);
  const objs = (prefix: string) => new Set(tuples.flatMap((t) => [t.obj, t.subject.kind === 'set' ? t.subject.obj : '']).filter((o) => o.startsWith(prefix)));
  const flat = generateRbacFlat(org);
  const hier = generateRbacHierarchical(org);
  return {
    aclEntries: aclEntryCount(generateAcl(org)),
    rbacRoles: flat.roles.length,
    rbacGrants: flat.roles.reduce((n, r) => n + r.grants.length, 0),
    rbacHierRoles: hier.roles.length,
    rbacHierEdges: inheritanceEdges(hier),
    abacPolicies: 1 + (org.share ? 1 : 0),
    rebacGroups: objs('group:').size,
    rebacFolders: objs('folder:').size,
    rebacTuples: tuples.length,
    rebacRules: REWRITES.length,
    abacExceptionAttributes: org.share ? 1 : 0,
  };
}
