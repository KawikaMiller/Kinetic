import { useMemo, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { countCaption } from './captions';
import { countsOf, syntheticOrg } from './models';
import { OPENING } from './opening';
import { REQUIREMENTS } from './org';

const DEPARTMENT_RANGE = { min: 1, max: 6 } as const;
const LEVEL_RANGE = { min: 1, max: 4 } as const;
const COUNT_REQUIREMENTS = [
  { id: 'dept-clearance' as const, label: 'Own department, up to clearance' },
  { id: 'share' as const, label: 'Share one document with Erin for a week' },
];

/** Scene 3: what an administrator writes down for the same requirement in each model, from the configurations the lesson generates. */
export function CountScene({ picker }: { picker: ReactNode }) {
  const [departments, setDepartments] = useState(OPENING.count.departments);
  const [levels, setLevels] = useState(OPENING.count.levels);
  const [which, setWhich] = useState<'dept-clearance' | 'share'>('dept-clearance');
  const base = useMemo(() => countsOf(syntheticOrg(departments, levels, false)), [departments, levels]);
  const shared = useMemo(() => countsOf(syntheticOrg(departments, levels, true)), [departments, levels]);
  const req = which === 'share' ? 'dept-clearance-share' : 'dept-clearance';
  const shown = which === 'share' ? shared : base;
  const noChange = shared.aclEntries === base.aclEntries;
  const text = REQUIREMENTS.find((r) => r.id === req)!.text;

  return (
    <StageFrame
      height={560}
      intro={countCaption(departments, levels, req)}
      introKey={`${departments}|${levels}|${req}`}
      stats={
        which === 'dept-clearance' ? (
          <Stats>
            <Stat label="RBAC roles, flat" value={base.rbacRoles} color="var(--bad)" sub="one per department and level" />
            <Stat label="RBAC roles, hierarchical" value={base.rbacHierRoles} color="var(--ok)" sub={`plus ${base.rbacHierEdges} inheritance edges`} />
            <Stat label="ABAC policies" value={base.abacPolicies} sub="over attributes that already exist" />
            <Stat label="ReBAC definitions" value={`${base.rebacGroups} + ${base.rebacFolders}`} sub={[`groups + folders`, `${base.rebacRules} rewrite rules`]} />
          </Stats>
        ) : (
          <Stats>
            <Stat label="ACL" value={`+${shared.aclEntries - base.aclEntries}`} sub="entry on the document" />
            <Stat label="RBAC" value={`+${shared.rbacRoles - base.rbacRoles}`} sub={`role, with ${shared.rbacGrants - base.rbacGrants} grant, assigned to one person`} />
            <Stat label="ABAC" value={`+${shared.abacExceptionAttributes - base.abacExceptionAttributes}`} sub="exception attribute (and a rule that reads it)" />
            <Stat label="ReBAC" value={`+${shared.rebacTuples - base.rebacTuples}`} sub="tuple" />
          </Stats>
        )
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'the naive flat form', shape: 'square' }, { color: 'var(--ok)', label: 'the fair form', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Requirement" value={which} options={COUNT_REQUIREMENTS.map((r) => ({ value: r.id, label: r.label }))} onChange={setWhich} />
        </>,
        <>
          <Slider label="Departments" value={departments} min={DEPARTMENT_RANGE.min} max={DEPARTMENT_RANGE.max} onChange={setDepartments} />
          <Slider label="Levels" value={levels} min={LEVEL_RANGE.min} max={LEVEL_RANGE.max} onChange={setLevels} />
        </>,
      ]}
    >
      <div className="az-stage stage-pad">
        <p className="az-note">Requirement: {text}{which === 'share' ? (noChange ? ' At this size Erin can already read the Roadmap, so the share changes nothing: raise departments or levels.' : ' The table shows the totals with the share in place.') : null}</p>
        <Box className="az-panel">
          <table className="data-table az-table">
            <thead><tr><th>Model</th><th>What an administrator defines</th><th>Count</th></tr></thead>
            <tbody>
              <tr><td>ACL</td><td>an entry for each person and document the rule allows</td><td>{shown.aclEntries}</td></tr>
              <tr><td>RBAC, flat</td><td>roles, and what each grants</td><td>{shown.rbacRoles} roles, {shown.rbacGrants} grants</td></tr>
              <tr><td>RBAC, hierarchical</td><td>the same roles, each inheriting the one below</td><td>{shown.rbacHierRoles} roles, {shown.rbacHierEdges} edges</td></tr>
              <tr><td>ABAC</td><td>policies over attributes</td><td>{shown.abacPolicies}</td></tr>
              <tr><td>ReBAC</td><td>groups, folders, tuples and rewrite rules</td><td>{shown.rebacGroups} + {shown.rebacFolders} objects, {shown.rebacTuples} tuples, {shown.rebacRules} rules</td></tr>
            </tbody>
          </table>
        </Box>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">the counts come from the configurations this lesson generates for an invented organisation with one user and one document per department and level</Provenance>
        <Provenance kind="toy">a real deployment has other costs: reviewing, auditing, caching, and keeping users and attributes in sync</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
