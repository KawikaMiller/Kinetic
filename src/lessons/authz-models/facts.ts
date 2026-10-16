/** Numbers the try-this, key ideas and quiz quote, read off the model at the default state. */
import { ALGORITHMS, combine } from './combine';
import { buildConfigs, countsOf, decide, disagreementRows, syntheticOrg, type ModelId } from './models';
import { OPENING } from './opening';
import { SHARE, defaultOrg } from './org';
import { STEP_BUDGET, check, docObj, generateTuples } from './rebac';

const org = OPENING.org();
const cfg = buildConfigs(org);
const A = OPENING.ask;
const grantedEdges = (m: ModelId) => decide(m, org, cfg, A.user, A.action, A.doc).edges.filter((e) => e.state === 'granted').length;
const shared = { ...defaultOrg(), share: true };
const looped = { ...defaultOrg(), cycle: true };
const loopTuples = generateTuples(looped);
const wrongRows = (o: typeof org) => disagreementRows(o, OPENING.requirement).filter((r) => r.wrong.length);
const defaults = countsOf(syntheticOrg(OPENING.count.departments, OPENING.count.levels, false));
const big = countsOf(syntheticOrg(6, 4, false));

export const FACTS = {
  departments: OPENING.count.departments,
  levels: OPENING.count.levels,
  questions: disagreementRows(org, OPENING.requirement).length,
  aclEdges: grantedEdges('acl'),
  rbacEdges: grantedEdges('rbac'),
  abacEdges: grantedEdges('abac'),
  rebacEdges: grantedEdges('rebac'),
  bobRoadmapAcl: decide('acl', org, cfg, 'bob', 'read', 'roadmap').why,
  erinReadAfterShare: decide('acl', shared, buildConfigs(shared), SHARE.user, 'read', SHARE.doc).granted,
  erinEditAfterShare: decide('acl', shared, buildConfigs(shared), SHARE.user, 'edit', SHARE.doc).granted,
  wrongAfterShare: wrongRows(shared).length,
  wrongAfterLoop: wrongRows(looped).length,
  loopOnlyRebac: wrongRows(looped).every((r) => r.wrong.length === 1 && r.wrong[0] === 'rebac'),
  roles: defaults.rbacRoles,
  hierRoles: defaults.rbacHierRoles,
  hierEdges: defaults.rbacHierEdges,
  policies: defaults.abacPolicies,
  groups: defaults.rebacGroups,
  folders: defaults.rebacFolders,
  bigRoles: big.rbacRoles,
  budget: STEP_BUDGET,
  honestSteps: check(loopTuples, 'dave', docObj('notes'), 'viewer').steps,
  brokenExceeded: check(loopTuples, 'dave', docObj('notes'), 'viewer', { visited: false }).exceeded,
  rule1: OPENING.combine.rules[0],
  rule2: OPENING.combine.rules[1],
  defaultDecision: combine(OPENING.combine.algorithm, OPENING.combine.rules),
  permitOverrides: combine('permit-overrides', OPENING.combine.rules),
  firstApplicable: combine('first-applicable', OPENING.combine.rules),
  firstApplicableSwapped: combine('first-applicable', [OPENING.combine.rules[1], OPENING.combine.rules[0]]),
  algorithms: ALGORITHMS.length,
};
