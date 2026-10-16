import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { ALGORITHMS, RESULT_LABEL, combine, type Algorithm, type RuleResult } from './combine';
import { MODELS, countsOf, decide, syntheticOrg, buildConfigs, type ModelId, type Row } from './models';
import { REQUIREMENTS, docById, userById, type Action, type Org, type RequirementId } from './org';

const modelLabel = (m: ModelId) => MODELS.find((x) => x.id === m)!.label;

/** Scene 1: the decision under the chosen model, and the path or the reason it was refused. */
export function askCaption(org: Org, model: ModelId, userId: string, action: Action, docId: string): ReactNode {
  const d = decide(model, org, buildConfigs(org), userId, action, docId);
  const who = userById(org, userId).name;
  const what = docById(org, docId).name;
  const hops = d.edges.filter((e) => e.state === 'granted').length;
  return (
    <>
      {who} asks to {action} {what} under {modelLabel(model)}: <b>{d.granted ? 'granted' : 'denied'}</b>.{' '}
      {d.granted ? <>The lit path has {plural(hops, 'edge')}.</> : <>{d.why}</>}
      {d.note ? <> {d.note}.</> : null}
      {org.cycle && model === 'rebac' ? <> The loop makes the clearance groups one group, so a member of a low group inherits the top group&apos;s access: the checker finished correctly, and the configuration is the bug.</> : null}
    </>
  );
}

/** Scene 2: how many of the rows the models disagree on and how many break the stated requirement. */
export function disagreeCaption(rows: readonly Row[], req: RequirementId): ReactNode {
  const disagree = rows.filter((r) => r.disagree).length;
  const wrong = rows.filter((r) => r.wrong.length > 0).length;
  const label = REQUIREMENTS.find((r) => r.id === req)!.label.toLowerCase();
  return (
    <>
      {rows.length} questions. The four models disagree on {disagree}, and {wrong} {wrong === 1 ? 'differs' : 'differ'} from the requirement "{label}".{' '}
      {wrong === 0 ? 'Every model matches the requirement here, so the table is quiet.' : 'A model is right or wrong only against a stated requirement.'}
    </>
  );
}

/** Scene 3: what the administrator writes down for the sliders' organisation, from the generated configurations. */
export function countCaption(departments: number, levels: number, req: RequirementId): ReactNode {
  const c = countsOf(syntheticOrg(departments, levels, false));
  if (req === 'dept-clearance') {
    return (
      <>
        For {plural(departments, 'department')} and {plural(levels, 'level')}: flat RBAC needs {c.rbacRoles} roles, the hierarchical form {c.rbacHierRoles} roles and {plural(c.rbacHierEdges, 'inheritance edge')},
        ABAC needs {plural(c.abacPolicies, 'policy', 'policies')}, and ReBAC defines {c.rebacGroups} groups, {c.rebacFolders} folders and {c.rebacRules} rewrite rules. Neither model wins in general: the next requirement flips the counts.
      </>
    );
  }
  const base = countsOf(syntheticOrg(departments, levels, false));
  const shared = countsOf(syntheticOrg(departments, levels, true));
  return (
    <>
      Sharing one document with one person for a week adds {plural(shared.aclEntries - base.aclEntries, 'ACL entry', 'ACL entries')}, {plural(shared.rbacRoles - base.rbacRoles, 'RBAC role')} (with {plural(shared.rbacGrants - base.rbacGrants, 'grant')}),
      {' '}{plural(shared.abacExceptionAttributes - base.abacExceptionAttributes, 'ABAC exception')}, and {plural(shared.rebacTuples - base.rebacTuples, 'ReBAC tuple')}. A one-off exception is a small change in an entry or a tuple, and neither model wins in general.{shared.aclEntries === base.aclEntries ? ' At this size the person could already read it, so nothing changes.' : null}
    </>
  );
}

/** Scene 4: the decision for the two rules, the algorithm and the listing order. */
export function combineCaption(alg: Algorithm, rules: readonly RuleResult[]): ReactNode {
  const out = combine(alg, rules);
  const a = ALGORITHMS.find((x) => x.id === alg)!;
  const matched = rules.filter((r) => r !== 'none').length;
  return (
    <>
      Rule 1 {RESULT_LABEL[rules[0]]}, rule 2 {RESULT_LABEL[rules[1]]}, under "{a.label.toLowerCase()}" ({a.text}): <b>{out}</b>.{' '}
      {matched === 0 ? 'No rule matched, and in this lesson no match is a deny.' : null}
    </>
  );
}
